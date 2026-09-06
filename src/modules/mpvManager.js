// modules/mpvManager.js
// System mpv control via JSON IPC (--input-ipc-server).
// Option B: no bundling, the user installs mpv manually (brew install mpv or mpv.app).
const { spawn } = require("node:child_process");
const {
  existsSync,
  unlinkSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  cpSync,
} = require("node:fs");
const { accessSync, constants } = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const which = require("which");
const store = require("./storeManager");
const { getMainWindow } = require("./windowManager");
const {
  getQualityArgs,
  getGpuApiChain,
  normalizeLevel,
} = require("./videoProfiles");

// System mpv lookup paths (macOS, also valid for other unix)
const SYSTEM_PATHS = [
  "/opt/homebrew/bin/mpv",
  "/usr/local/bin/mpv",
  "/Applications/mpv.app/Contents/MacOS/mpv",
];

// How often at most we push progress to Lampa.
const TIME_THROTTLE_MS = 1000;
const SOCKET_CONNECT_RETRIES = 15;
const SOCKET_CONNECT_DELAY_MS = 200;
const QUIT_GRACE_MS = 1500;
const UOSC_MIN_MAJOR = 0;
const UOSC_MIN_MINOR = 35;
const UOSC_VERSION_TIMEOUT_MS = 5000;
// Fallback get_property polling in case observe_property events are missed.
const POLL_MS = 1000;
// Alive-probe window: bad flags make mpv exit fast, a live process means OK.
const PROBE_ALIVE_MS = 500;

let cachedPath = null;
let cachedSource = null;
let cacheFilled = false;
let cachedVersion = null;
let cachedVersionFor = null;
let socketCounter = 0;

function isHttpUrl(url) {
  return typeof url === "string" && /^https?:\/\//.test(url);
}

function isExecutable(filePath) {
  if (!filePath || !existsSync(filePath)) return false;
  // On win32 there is no X_OK bit — existsSync is enough
  if (process.platform === "win32") return true;
  try {
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function socketPathFor(counter) {
  // mpv socket is posix-only; named pipe on win32 (code is cross-platform safe)
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\lampa-mpv-${process.pid}-${counter}`;
  }
  return path.join(os.tmpdir(), `lampa-mpv-${process.pid}-${counter}.sock`);
}

function cleanupSocketFile(sockPath) {
  if (process.platform === "win32" || !sockPath) return;
  try {
    if (existsSync(sockPath)) unlinkSync(sockPath);
  } catch (err) {
    console.error(`❌ [mpv] failed to remove socket ${sockPath}:`, err.message);
  }
}

// Remove stale lampa-mpv-* sockets/playlists left after crashes.
function cleanupStaleSockets() {
  if (process.platform === "win32") return;
  let files = [];
  try {
    files = readdirSync(os.tmpdir());
  } catch {
    return;
  }
  for (const file of files) {
    if (!file.startsWith("lampa-mpv-")) continue;
    if (!file.endsWith(".sock") && !file.endsWith(".m3u")) continue;
    const full = path.join(os.tmpdir(), file);
    // Do not touch our own current socket/playlist
    if (manager.sockPath && full === manager.sockPath) continue;
    if (manager.playlistFile && full === manager.playlistFile) continue;
    try {
      unlinkSync(full);
    } catch {
      // Busy socket (live process) — skip
    }
  }
}

function parseMpvVersion(output) {
  const match = /mpv\s+v?(\d+)\.(\d+)(?:\.(\d+))?/i.exec(String(output || ""));
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3] || 0),
    raw: match[0].replace(/^mpv\s+/i, ""),
  };
}

function isUoscSupported(version) {
  if (!version) return false;
  if (version.major > UOSC_MIN_MAJOR) return true;
  return version.major === UOSC_MIN_MAJOR && version.minor >= UOSC_MIN_MINOR;
}

// Vendored uosc assets: dev -> <repo>/assets/mpv-uosc,
// packaged -> resources/app/assets/mpv-uosc.
function resolveUoscSourceDir() {
  const candidates = [];
  try {
    if (typeof process.resourcesPath === "string" && process.resourcesPath) {
      candidates.push(
        path.join(process.resourcesPath, "app", "assets", "mpv-uosc"),
      );
    }
  } catch {
    // ignore
  }
  candidates.push(path.join(__dirname, "..", "..", "assets", "mpv-uosc"));
  for (const candidate of candidates) {
    try {
      if (existsSync(path.join(candidate, "scripts", "uosc", "main.lua"))) {
        return candidate;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

// Isolated per-launch config dir with our uosc copy; the user's own
// mpv.conf is not loaded, which avoids conflicts with user setups.
function prepareUoscConfigDir() {
  const source = resolveUoscSourceDir();
  if (!source) return null;
  socketCounter += 1;
  const dir = path.join(
    os.tmpdir(),
    `lampa-mpv-config-${process.pid}-${socketCounter}`,
  );
  try {
    mkdirSync(path.join(dir, "scripts"), { recursive: true });
    mkdirSync(path.join(dir, "fonts"), { recursive: true });
    mkdirSync(path.join(dir, "script-opts"), { recursive: true });
    cpSync(
      path.join(source, "scripts", "uosc"),
      path.join(dir, "scripts", "uosc"),
      {
        recursive: true,
      },
    );
    for (const font of ["uosc_icons.otf", "uosc_textures.ttf"]) {
      const from = path.join(source, "fonts", font);
      if (existsSync(from)) cpSync(from, path.join(dir, "fonts", font));
    }
    const confFrom = path.join(source, "script-opts", "uosc.conf");
    if (existsSync(confFrom)) {
      cpSync(confFrom, path.join(dir, "script-opts", "uosc.conf"));
    }
    // uosc replaces the stock OSC/OSD bar, so disable them.
    writeFileSync(path.join(dir, "mpv.conf"), "osc=no\nosd-bar=no\n", "utf8");
    return dir;
  } catch (err) {
    console.error("❌ [mpv] failed to prepare uosc config:", err.message);
    cleanupUoscDir(dir);
    return null;
  }
}

function cleanupUoscDir(dir) {
  if (!dir) return;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    console.error(`❌ [mpv] failed to remove uosc config ${dir}:`, err.message);
  }
}

// Human-readable title for mpv OSD/playlist.
function mpvDisplayTitle(item) {
  const raw = item && typeof item.title === "string" ? item.title.trim() : "";
  if (raw && !/^https?:\/\//i.test(raw)) return raw.slice(0, 300);
  const s = item && item.season != null ? Number(item.season) : NaN;
  const e = item && item.episode != null ? Number(item.episode) : NaN;
  if (Number.isFinite(s) && s > 0 && Number.isFinite(e) && e > 0) {
    return `S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`;
  }
  return "";
}

function urlTail(url) {
  const s = String(url || "");
  const noQuery = s.split("?")[0];
  const tail = noQuery.slice(noQuery.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(tail).slice(0, 120) || s.slice(0, 120);
  } catch {
    return (tail || s).slice(0, 120);
  }
}

// Temp .m3u with #EXTINF titles so mpv shows episode names in OSD/playlist.
function writeM3uPlaylist(filePath, items) {
  const lines = ["#EXTM3U"];
  // Same-name titles get an SxxExx (or numeric) suffix so OSD stays distinct.
  const seen = {};
  for (const item of items) {
    let title = (mpvDisplayTitle(item) || urlTail(item && item.url)).replace(
      /[\r\n]+/g,
      " ",
    );
    if (seen[title]) {
      const s = item && item.season != null ? Number(item.season) : NaN;
      const e = item && item.episode != null ? Number(item.episode) : NaN;
      const tag =
        Number.isFinite(s) && s > 0 && Number.isFinite(e) && e > 0
          ? `S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`
          : "";
      if (tag) title = `${title} — ${tag}`;
      else title = `${title} (${seen[title]})`;
    }
    seen[title] = (seen[title] || 0) + 1;
    lines.push(`#EXTINF:-1,${title}`);
    lines.push(item.url);
  }
  writeFileSync(filePath, lines.join("\n"), "utf8");
}

function sendToWindow(channel, data) {
  try {
    const win = getMainWindow();
    if (win && !win.isDestroyed() && win.webContents) {
      win.webContents.send(channel, data);
    }
  } catch (err) {
    console.error(`❌ [mpv] failed to send ${channel}:`, err.message);
  }
}

const manager = {
  proc: null,
  sock: null,
  sockPath: null,
  playlist: [],
  index: 0,
  hash: null,
  time: 0,
  duration: 0,
  paused: false,
  lastSentAt: 0,
  buffer: "",
  // Resume position for the current file, re-applied via IPC seek.
  resumeTarget: 0,
  resumeAttempts: 0,
  lastResumeSeekAt: 0,
  eofGuardAt: 0,
  eofGuardIndex: -1,
  internalPos: 0,
  // True after the first file-loaded; blocks flush/quit before playback starts.
  everLoaded: false,
  launchAt: 0,
  uoscDir: null,
  uoscActive: false,
  playlistFile: null,
  pollTimer: null,

  // custom path -> system paths -> which; result is cached.
  resolvePath(force = false) {
    if (cacheFilled && !force) return cachedPath;

    const custom = store.get("mpvPath", "");
    if (typeof custom === "string" && custom.length > 0) {
      if (isExecutable(custom)) {
        cachedPath = custom;
        cachedSource = "custom";
        cacheFilled = true;
        return cachedPath;
      }
      console.error(
        `⚠️ [mpv] custom path invalid: ${custom}, falling back to auto-detect`,
      );
    }

    for (const candidate of SYSTEM_PATHS) {
      if (existsSync(candidate)) {
        cachedPath = candidate;
        cachedSource = "auto";
        cacheFilled = true;
        return cachedPath;
      }
    }

    try {
      const found = which.sync("mpv", { nothrow: true });
      if (found) {
        cachedPath = found;
        cachedSource = "auto";
        cacheFilled = true;
        return cachedPath;
      }
    } catch {
      // ignore — null is returned below
    }

    cachedPath = null;
    cachedSource = null;
    cacheFilled = true;
    return null;
  },

  getPathInfo() {
    const resolved = this.resolvePath();
    return { path: resolved, source: resolved ? cachedSource : null };
  },

  getMpvVersion(binaryPath) {
    const target = binaryPath || this.resolvePath();
    if (!target) return Promise.resolve(null);
    if (cachedVersionFor === target && cachedVersion) {
      return Promise.resolve(cachedVersion);
    }
    return new Promise((resolve) => {
      let done = false;
      const finish = (version) => {
        if (done) return;
        done = true;
        if (version) {
          cachedVersion = version;
          cachedVersionFor = target;
        }
        resolve(version);
      };
      const timer = setTimeout(() => finish(null), UOSC_VERSION_TIMEOUT_MS);
      try {
        const proc = spawn(target, ["--version"], {
          stdio: ["ignore", "pipe", "ignore"],
        });
        let output = "";
        if (proc.stdout) {
          proc.stdout.on("data", (chunk) => {
            output += String(chunk);
          });
        }
        proc.on("error", () => {
          clearTimeout(timer);
          finish(null);
        });
        proc.on("close", () => {
          clearTimeout(timer);
          finish(parseMpvVersion(output));
        });
      } catch {
        clearTimeout(timer);
        finish(null);
      }
    });
  },

  async getUoscInfo() {
    const enabled = store.get("mpvUosc", true);
    const version = await this.getMpvVersion();
    const supported = isUoscSupported(version);
    return {
      enabled: Boolean(enabled),
      supported,
      active: Boolean(this.uoscActive),
      version: version
        ? `${version.major}.${version.minor}.${version.patch}`
        : null,
      minVersion: `${UOSC_MIN_MAJOR}.${UOSC_MIN_MINOR}.0`,
    };
  },

  // Dry-run probe: a short-lived mpv instance that must survive
  // PROBE_ALIVE_MS. Unknown flags make mpv exit fast with an error,
  // so a still-running process means the candidate flags parse fine.
  probeQualityArgs(binaryPath, qualityArgs) {
    const target = binaryPath || this.resolvePath();
    if (!target) return Promise.resolve({ ok: false, error: "no binary" });
    if (!Array.isArray(qualityArgs) || qualityArgs.length === 0) {
      return Promise.resolve({ ok: true });
    }
    return new Promise((resolve) => {
      let done = false;
      const finish = (result) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try {
          probe.kill("SIGKILL");
        } catch {
          // already exited
        }
        resolve(result);
      };
      const fail = (probe, stderr) => {
        const firstLine = String(stderr || "")
          .split(/[\r\n]+/)
          .find((line) => line.trim() !== "");
        finish({ ok: false, error: firstLine || "mpv rejected flags" });
      };
      let stderr = "";
      let probe = null;
      const timer = setTimeout(() => finish({ ok: true }), PROBE_ALIVE_MS);
      try {
        probe = spawn(
          target,
          [
            ...qualityArgs,
            "--idle=yes",
            "--force-window=no",
            "--audio=no",
            "--really-quiet",
          ],
          { stdio: ["ignore", "ignore", "pipe"] },
        );
        if (probe.stderr) {
          probe.stderr.on("data", (chunk) => {
            stderr += String(chunk);
          });
        }
        probe.on("error", (err) => fail(probe, err.message));
        probe.on("close", (code) => {
          if (code !== 0 && code !== null) fail(probe, stderr);
          else if (code !== null)
            finish({ ok: false, error: "mpv exited during probe" });
        });
      } catch (err) {
        finish({ ok: false, error: err.message });
      }
    });
  },

  async getQualityInfo() {
    const {
      QUALITY_LEVELS,
      QUALITY_MIN_MAJOR,
      QUALITY_MIN_MINOR,
    } = require("./videoProfiles");
    const level = normalizeLevel(store.get("mpvQuality", "balanced"));
    const version = await this.getMpvVersion();
    return {
      success: true,
      level,
      levels: QUALITY_LEVELS,
      smoothMotion: Boolean(store.get("mpvSmoothMotion", false)),
      customArgs: store.get("mpvCustomArgs", ""),
      activeLevel: this.qualityLevel || null,
      version: version
        ? `${version.major}.${version.minor}.${version.patch}`
        : null,
      minVersion: `${QUALITY_MIN_MAJOR}.${QUALITY_MIN_MINOR}.0`,
    };
  },

  async setQualityEnabled(level) {
    const normalized = normalizeLevel(level, null);
    if (!normalized) {
      throw new Error(`Invalid quality level: ${level}`);
    }
    store.set("mpvQuality", normalized);
    console.log(`🔄 [mpv] quality ${normalized} (applies to next launch)`);
    return this.getQualityInfo();
  },

  async setSmoothMotionEnabled(enabled) {
    store.set("mpvSmoothMotion", Boolean(enabled));
    console.log(
      `🔄 [mpv] smooth motion ${enabled ? "enabled" : "disabled"} (applies to next launch)`,
    );
    return this.getQualityInfo();
  },

  async setCustomArgsEnabled(customArgs) {
    const { parseCustomArgs } = require("./videoProfiles");
    const raw = typeof customArgs === "string" ? customArgs : "";
    // Validate eagerly so UI typos surface now, not at next launch.
    parseCustomArgs(raw);
    store.set("mpvCustomArgs", raw);
    console.log("🔄 [mpv] custom args updated (applies to next launch)");
    return this.getQualityInfo();
  },

  async setUoscEnabled(enabled) {
    store.set("mpvUosc", Boolean(enabled));
    return this.getUoscInfo();
  },

  setCustomPath(p) {
    if (typeof p !== "string" || p.trim() === "") {
      return this.resetCustomPath();
    }
    const trimmed = p.trim();
    if (!isExecutable(trimmed)) {
      throw new Error(`File not found or not executable: ${trimmed}`);
    }
    store.set("mpvPath", trimmed);
    cachedPath = null;
    cachedSource = null;
    cacheFilled = false;
    cachedVersion = null;
    cachedVersionFor = null;
    return this.getPathInfo();
  },

  resetCustomPath() {
    store.delete("mpvPath");
    cachedPath = null;
    cachedSource = null;
    cacheFilled = false;
    cachedVersion = null;
    cachedVersionFor = null;
    return this.getPathInfo();
  },

  sendCommand(cmd) {
    if (!this.sock || this.sock.destroyed) return false;
    try {
      this.sock.write(JSON.stringify({ command: cmd }) + "\n");
      return true;
    } catch (err) {
      console.error("❌ [mpv] command send failed:", err.message);
      return false;
    }
  },

  maybeSendTime(force = false) {
    let hash = this.hash;
    const currentItem = this.playlist[this.index];
    if (!hash && currentItem && typeof currentItem === "object") {
      hash =
        currentItem.hash ||
        (currentItem.timeline && currentItem.timeline.hash) ||
        null;
    }
    if (!hash) return;
    const duration = Number(this.duration) || 0;
    const time = Number(this.time) || 0;
    // Guards apply to force-flushes too: force bypasses only the throttle.
    if (time <= 0) return;
    if (this.resumeTarget > 0) {
      if (Date.now() - this.lastResumeSeekAt > 8000) {
        this.resumeTarget = 0;
      } else {
        return;
      }
    }
    const now = Date.now();
    if (!force && now - this.lastSentAt < TIME_THROTTLE_MS) return;
    this.lastSentAt = now;
    const percent = duration > 0 ? (time / duration) * 100 : 0;
    // Keep the stored item position fresh so playAt can resume correctly
    if (currentItem && typeof currentItem === "object") {
      if (!currentItem.timeline || typeof currentItem.timeline !== "object") {
        currentItem.timeline = {};
      }
      currentItem.timeline.time = time;
      currentItem.timeline.duration = duration;
      currentItem.timeline.percent = percent;
    }
    sendToWindow("mpv-time", {
      hash,
      time,
      duration,
      percent,
      index: this.index,
    });
  },

  savedStartOf(item) {
    const t =
      item && item.timeline && typeof item.timeline === "object"
        ? Number(item.timeline.time)
        : 0;
    return Number.isFinite(t) && t > 10 ? t : 0;
  },

  // Retry the armed resume seek until the demuxer accepts it.
  consumeResumeSeek() {
    if (this.resumeTarget <= 0 || this.resumeAttempts >= 30) {
      this.resumeTarget = 0;
      return;
    }
    const target = this.resumeTarget;
    const now = Date.now();
    if (now - this.lastResumeSeekAt < 300) return;
    this.lastResumeSeekAt = now;
    if (this.time >= target - 3) {
      this.resumeTarget = 0;
      return;
    }
    this.resumeAttempts += 1;
    if (this.sendCommand(["seek", target, "absolute"])) {
      this.time = target;
    }
  },

  // Parse mpv stdout --term-status-msg lines (backup timecode channel).
  handleStdout(line) {
    if (!line || line.indexOf("LAMPA_TIME:") === -1) return;
    const m = /LAMPA_TIME:([0-9.]+)\|([0-9.]+)\|(-?[0-9]+)\|/.exec(line);
    if (!m) return;
    const t = parseFloat(m[1]);
    const d = parseFloat(m[2]);
    const p = parseInt(m[3], 10);
    if (!Number.isFinite(t) || t < 0) return;
    if (Number.isFinite(p) && p >= 0 && p !== this.internalPos) {
      this.internalPos = p;
      this.syncIndexFromInternalPos();
    }
    this.time = t;
    if (Number.isFinite(d) && d > 0) this.duration = d;
    if (this.resumeTarget > 0) this.consumeResumeSeek();
    this.maybeSendTime(false);
  },

  handleMessage(msg) {
    if (!msg || typeof msg !== "object") return;
    // Replies to get_property polling (request_id 101..103).
    if (
      msg.request_id === 101 ||
      msg.request_id === 102 ||
      msg.request_id === 103
    ) {
      const v = msg.data;
      if (msg.request_id === 101 && typeof v === "number") {
        if (v !== this.internalPos) {
          this.internalPos = v;
          this.syncIndexFromInternalPos();
        }
      } else if (msg.request_id === 102 && typeof v === "number") {
        this.time = v;
        if (this.resumeTarget > 0) this.consumeResumeSeek();
        this.maybeSendTime(false);
      } else if (msg.request_id === 103 && typeof v === "number") {
        this.duration = v;
        if (this.resumeTarget > 0) this.consumeResumeSeek();
        this.maybeSendTime(false);
      }
      return;
    }
    // Property events
    if (msg.event === "property-change") {
      switch (msg.name) {
        case "time-pos":
          if (typeof msg.data === "number") {
            this.time = msg.data;
            if (this.resumeTarget > 0) this.consumeResumeSeek();
            this.maybeSendTime(false);
          }
          break;
        case "duration":
          if (typeof msg.data === "number") {
            this.duration = msg.data;
            if (this.resumeTarget > 0) this.consumeResumeSeek();
            this.maybeSendTime(false);
          }
          break;
        case "pause":
          this.paused = msg.data === true;
          this.maybeSendTime(true);
          break;
        case "eof-reached":
          if (msg.data === true) this.handleEof();
          break;
        case "playlist-pos":
          if (typeof msg.data === "number") {
            this.internalPos = msg.data;
            this.syncIndexFromInternalPos();
          }
          break;
        default:
          break;
      }
      return;
    }
    if (msg.event === "start-file") {
      this.time = 0;
      this.duration = 0;
      return;
    }
    if (msg.event === "file-loaded") {
      this.everLoaded = true;
      this.consumeResumeSeek();
      return;
    }
    if (msg.event === "end-file") {
      const reason = msg.reason || "unknown";
      if (!this.everLoaded) return;
      if (reason === "eof") {
        this.handleEof();
      } else if (reason === "quit" || reason === "stop") {
        this.handleQuit(reason);
      }
    }
  },

  // mpv moved to another playlist entry on its own; m3u order matches
  // our index, so sync cursor/hash and arm resume for the new episode.
  syncIndexFromInternalPos() {
    if (!Number.isInteger(this.internalPos)) return;
    if (this.internalPos < 0) {
      if (
        this.index >= 0 &&
        this.playlist.length > 0 &&
        this.proc &&
        this.everLoaded &&
        Date.now() - this.launchAt > 10000
      ) {
        if (this.resumeTarget <= 0) this.maybeSendTime(true);
        sendToWindow("mpv-ended", {
          reason: "eof",
          autoNext: false,
          index: this.index,
          hash: this.hash,
        });
        this.sendCommand(["quit"]);
      }
      return;
    }
    if (this.internalPos >= this.playlist.length) return;
    if (this.internalPos === this.index) return;
    // Flush the previous episode only if it actually played.
    if (
      this.resumeTarget <= 0 &&
      (Number(this.time) > 5 || Number(this.duration) > 0)
    ) {
      this.maybeSendTime(true);
    }
    this.index = this.internalPos;
    const item = this.playlist[this.index];
    this.hash = (item && (item.hash || item?.timeline?.hash)) || this.hash;
    this.time = 0;
    this.duration = 0;
    this.paused = false;
    this.lastSentAt = 0;
    const label = item ? mpvDisplayTitle(item) : "";
    sendToWindow("mpv-track", {
      index: this.index,
      hash: this.hash,
      title: label || "",
    });
    const resume = this.savedStartOf(item);
    this.resumeTarget = resume > 10 ? resume : 0;
    this.resumeAttempts = 0;
    this.lastResumeSeekAt = Date.now();
    if (this.resumeTarget > 0) this.consumeResumeSeek();
  },

  // Episode ended: flush position as watched, quit only on the last entry.
  handleEof() {
    const now = Date.now();
    if (this.eofGuardIndex === this.index && now - this.eofGuardAt < 3000) {
      return;
    }
    this.eofGuardIndex = this.index;
    this.eofGuardAt = now;
    if (
      this.everLoaded &&
      Date.now() - this.launchAt > 10000 &&
      this.resumeTarget <= 0
    ) {
      const duration = Number(this.duration) || 0;
      if (duration > 0) {
        this.time = duration * 0.95;
        this.maybeSendTime(true);
      } else if (Number(this.time) > 5) {
        this.maybeSendTime(true);
      }
    }
    const hasNext =
      this.playlist.length > 0 && this.internalPos + 1 < this.playlist.length;
    sendToWindow("mpv-ended", {
      reason: "eof",
      autoNext: hasNext,
      index: this.index,
      hash: this.hash,
    });
    if (!hasNext) {
      this.sendCommand(["quit"]);
    }
  },

  handleQuit(reason) {
    if (this.resumeTarget <= 0) this.maybeSendTime(true);
    sendToWindow("mpv-ended", {
      reason: reason || "quit",
      autoNext: false,
      index: this.index,
      hash: this.hash,
    });
    this.cleanupProc(false);
  },

  cleanupProc(removeSocket = true) {
    this.stopPolling();
    if (this.sock) {
      try {
        this.sock.destroy();
      } catch {
        // ignore
      }
      this.sock = null;
    }
    if (removeSocket && this.sockPath) {
      cleanupSocketFile(this.sockPath);
      this.sockPath = null;
    }
    // Keep everLoaded/launchAt: late end-file/idle events must not wipe position.
    if (this.uoscDir) {
      cleanupUoscDir(this.uoscDir);
      this.uoscDir = null;
    }
    if (this.playlistFile) {
      try {
        if (existsSync(this.playlistFile)) unlinkSync(this.playlistFile);
      } catch (err) {
        console.error(
          `❌ [mpv] failed to remove playlist ${this.playlistFile}:`,
          err.message,
        );
      }
      this.playlistFile = null;
    }
    this.uoscActive = false;
    this.proc = null;
    this.buffer = "";
  },

  // Stop the previous process: quit via IPC -> SIGTERM -> SIGKILL
  async killPrevious() {
    const proc = this.proc;
    if (!proc || proc.killed || proc.exitCode !== null) {
      this.cleanupProc(true);
      return;
    }
    this.sendCommand(["quit"]);
    const exited = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), QUIT_GRACE_MS);
      proc.once("exit", () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
    if (!exited) {
      try {
        proc.kill("SIGTERM");
      } catch (err) {
        console.error("❌ [mpv] SIGTERM failed:", err.message);
      }
      const termed = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), QUIT_GRACE_MS);
        proc.once("exit", () => {
          clearTimeout(timer);
          resolve(true);
        });
      });
      if (!termed) {
        try {
          proc.kill("SIGKILL");
        } catch (err) {
          console.error("❌ [mpv] SIGKILL failed:", err.message);
        }
      }
    }
    this.cleanupProc(true);
  },

  connectSocket(sockPath, attempt = 0) {
    return new Promise((resolve, reject) => {
      const tryConnect = (n) => {
        const sock = net.connect(sockPath);
        sock.once("connect", () => resolve(sock));
        sock.once("error", (err) => {
          sock.destroy();
          if (n < SOCKET_CONNECT_RETRIES) {
            setTimeout(() => tryConnect(n + 1), SOCKET_CONNECT_DELAY_MS);
          } else {
            reject(err);
          }
        });
      };
      tryConnect(attempt);
    });
  },

  attachSocket(sock) {
    this.sock = sock;
    this.sock.setEncoding("utf8");
    this.sock.on("data", (chunk) => {
      this.buffer += chunk;
      const parts = this.buffer.split("\n");
      this.buffer = parts.pop();
      for (const part of parts) {
        const line = part.trim();
        if (!line) continue;
        try {
          this.handleMessage(JSON.parse(line));
        } catch (err) {
          console.error("❌ [mpv] failed to parse IPC message:", err.message);
        }
      }
    });
    this.sock.on("error", (err) => {
      console.error("❌ [mpv] socket error:", err.message);
    });
    this.sock.on("close", () => {
      this.sock = null;
    });
    // ESC leaves fullscreen by default — rebind to quit so the client
    // always receives mpv-ended.
    if (store.get("mpvEscQuits", true)) {
      this.sendCommand(["keybind", "ESC", "quit"]);
    }
    // Subscribe to properties
    const props = [
      "time-pos",
      "duration",
      "pause",
      "eof-reached",
      "playlist-pos",
    ];
    props.forEach((name, i) => {
      this.sendCommand(["observe_property", i + 1, name]);
    });
    // Fallback polling in case observe_property events are missed.
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      if (!this.sock || this.sock.destroyed) return;
      try {
        this.sock.write(
          JSON.stringify({
            command: ["get_property", "playlist-pos"],
            request_id: 101,
          }) + "\n",
        );
        this.sock.write(
          JSON.stringify({
            command: ["get_property", "time-pos"],
            request_id: 102,
          }) + "\n",
        );
        this.sock.write(
          JSON.stringify({
            command: ["get_property", "duration"],
            request_id: 103,
          }) + "\n",
        );
      } catch {
        // Socket went away mid-write — stop polling.
        this.stopPolling();
      }
    }, POLL_MS);
    if (this.pollTimer.unref) this.pollTimer.unref();
  },

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },

  // title param is accepted (renderer sends it) but unused: mpv takes each
  // entry's #EXTINF name for the OSD/window title, and a static --title
  // would freeze the header on the show name across episode switches.
  async play({ url, start, hash, playlist, index } = {}) {
    if (!isHttpUrl(url)) {
      throw new Error(`Invalid URL (http(s):// required): ${url}`);
    }
    const mpvPath = this.resolvePath();
    if (!mpvPath) {
      throw new Error(
        "mpv not found. Install via brew install mpv or set the path manually",
      );
    }

    await this.killPrevious();
    cleanupStaleSockets();

    const startSec = Number(start) || 0;
    const list = Array.isArray(playlist)
      ? playlist.filter((it) => it && isHttpUrl(it.url))
      : [];
    let idx = Number.isInteger(index) ? index : 0;
    if (idx < 0) idx = 0;
    if (list.length > 0 && idx >= list.length) idx = 0;

    socketCounter += 1;
    const sockPath = socketPathFor(socketCounter);
    cleanupSocketFile(sockPath);

    // uosc needs mpv >= 0.35, otherwise stock OSC.
    let uoscDir = null;
    let uoscActive = false;
    if (store.get("mpvUosc", true)) {
      const version = await this.getMpvVersion(mpvPath);
      if (isUoscSupported(version)) {
        uoscDir = prepareUoscConfigDir();
        uoscActive = Boolean(uoscDir);
      }
    }

    const args = [
      "--terminal=yes",
      "--force-window",
      // mpv owns the playlist and never exits on its own; we decide when to quit.
      "--keep-open=yes",
      "--keep-open-pause=no",
      "--idle=yes",
    ];
    if (store.get("mpvFullscreen", true)) {
      args.push("--fullscreen");
    }
    // Quality profiles (upscale): version-gated, gpu-api chain per OS.
    // Silent fallback quality→balanced→off, then gpu-api chain, then
    // plain launch — video always starts.
    {
      const version = await this.getMpvVersion(mpvPath);
      const requested = normalizeLevel(store.get("mpvQuality", "balanced"));
      const smoothMotion = Boolean(store.get("mpvSmoothMotion", false));
      const customArgs =
        typeof store.get("mpvCustomArgs", "") === "string"
          ? store.get("mpvCustomArgs", "")
          : "";
      const chain = getGpuApiChain(process.platform);
      const stepDown = { quality: "balanced", balanced: "off", off: null };
      let level = requested;
      let picked = null;
      let activeLevel = requested;
      while (level) {
        const attempts =
          level === "off"
            ? [null]
            : [...chain.map((api) => `--gpu-api=${api}`), null];
        let levelOk = false;
        for (const gpuFlag of attempts) {
          let candidate = getQualityArgs({
            level,
            smoothMotion,
            customArgs,
            version,
          });
          if (gpuFlag) {
            const withoutGpu = candidate.filter(
              (flag) => !flag.startsWith("--gpu-api="),
            );
            candidate = [...withoutGpu, gpuFlag];
          } else {
            candidate = candidate.filter(
              (flag) => !flag.startsWith("--gpu-api="),
            );
          }
          if (gpuFlag === null && candidate.length === 0 && level !== "off") {
            break; // whole level rejected — step down below
          }
          const probe = await this.probeQualityArgs(mpvPath, candidate);
          if (probe.ok) {
            picked = candidate;
            activeLevel = level;
            levelOk = true;
            if (level !== requested) {
              console.log(
                `⚠️ [mpv] quality ${requested}→${level} (silent fallback)`,
              );
            }
            if (gpuFlag && attempts.indexOf(gpuFlag) > 0) {
              console.log(`🔄 [mpv] gpu-api fallback in use: ${gpuFlag}`);
            }
            break;
          }
          console.log(
            `⚠️ [mpv] quality flags rejected (${probe.error || "unknown error"}) — trying fallback`,
          );
        }
        if (levelOk) break;
        level = stepDown[level];
        if (!level) {
          picked = [];
          activeLevel = "off";
          console.log("⚠️ [mpv] quality flags unavailable — plain launch");
        }
      }
      if (picked && picked.length > 0) {
        args.push(...picked);
        console.log(
          `✅ [mpv] quality=${activeLevel} flags: ${picked.join(" ")}`,
        );
      }
      this.qualityLevel = activeLevel;
    }
    if (uoscDir) {
      args.push(`--config-dir=${uoscDir}`);
    }
    args.push(`--input-ipc-server=${sockPath}`, "--osd-level=1");
    // Backup timecode channel in case the IPC socket stalls.
    args.push(
      "--term-status-msg=LAMPA_TIME:${=time-pos:0}|${=duration:0}|${playlist-pos:0}|",
    );

    // Launch resume position of the current episode; `start` is the fallback.
    let launchStart = 0;
    if (list.length > 0) {
      const launchItem = list[Math.min(idx, list.length - 1)];
      const itemStart = this.savedStartOf(launchItem);
      if (itemStart > 10) launchStart = itemStart;
    }
    if (!(launchStart > 10)) launchStart = startSec > 10 ? startSec : 0;

    // Whole serial as one m3u in original order; --playlist-start selects
    // the launch episode so mpv position matches our index.
    let playlistFile = null;
    if (list.length > 0) {
      socketCounter += 1;
      const candidate = path.join(
        os.tmpdir(),
        `lampa-mpv-${process.pid}-${socketCounter}.m3u`,
      );
      try {
        writeM3uPlaylist(candidate, list);
        playlistFile = candidate;
      } catch (err) {
        console.error("❌ [mpv] failed to write playlist file:", err.message);
        playlistFile = null;
      }
    }
    if (playlistFile) {
      args.push(`--playlist=${playlistFile}`);
      this.playlistFile = playlistFile;
      args.push(`--playlist-start=${idx}`);
    } else {
      this.playlistFile = null;
      args.push(url);
    }
    if (launchStart > 0) {
      args.push(`--input-commands=seek ${launchStart} absolute`);
      this.resumeTarget = launchStart;
      this.resumeAttempts = 0;
      this.lastResumeSeekAt = Date.now();
    }

    const proc = spawn(mpvPath, args, { stdio: ["ignore", "pipe", "ignore"] });
    let stdoutBuf = "";
    if (proc.stdout) {
      proc.stdout.setEncoding("utf8");
      proc.stdout.on("data", (chunk) => {
        stdoutBuf += chunk;
        const lines = stdoutBuf.split(/[\r\n]+/);
        stdoutBuf = lines.pop() || "";
        for (const line of lines) {
          this.handleStdout(line);
        }
      });
    }
    this.proc = proc;
    this.sockPath = sockPath;
    this.playlist = list;
    this.index = list.length > 0 ? idx : 0;
    this.internalPos = this.index;
    this.hash = hash || null;
    // this.time holds launchStart as the resume target; guards in
    // maybeSendTime stay silent until the first file-loaded.
    this.time = launchStart || 0;
    this.duration = 0;
    this.paused = false;
    this.lastSentAt = 0;
    this.eofGuardAt = 0;
    this.eofGuardIndex = -1;
    this.everLoaded = false;
    this.launchAt = Date.now();
    this.uoscDir = uoscDir;
    this.uoscActive = uoscActive;

    proc.on("error", (err) => {
      console.error("❌ [mpv] process launch failed:", err.message);
      sendToWindow("mpv-ended", {
        reason: "error",
        index: this.index,
        hash: this.hash,
      });
      this.cleanupProc(true);
      this.proc = null;
    });
    proc.on("exit", () => {
      sendToWindow("mpv-ended", {
        reason: "quit",
        index: this.index,
        hash: this.hash,
      });
      this.cleanupProc(true);
      this.proc = null;
    });

    try {
      const sock = await this.connectSocket(sockPath);
      this.attachSocket(sock);
      this.consumeResumeSeek();
    } catch (err) {
      console.error("❌ [mpv] failed to connect to IPC socket:", err.message);
    }

    return { success: true, path: mpvPath };
  },

  // mpv owns the queue from the m3u; a late setPlaylist only refreshes our copy.
  setPlaylist(list) {
    if (!Array.isArray(list)) throw new Error("playlist must be an array");
    const clean = list.filter((it) => it && isHttpUrl(it.url));
    this.playlist = clean;
    if (this.index >= clean.length) this.index = 0;
    return { success: true, length: clean.length };
  },

  // Ask mpv to move its cursor to `index`; playlist-pos event syncs us back.
  playAt(index) {
    const idx = Number(index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.playlist.length) {
      throw new Error(`Invalid playlist index: ${index}`);
    }
    const item = this.playlist[idx];
    if (!item || !isHttpUrl(item.url)) {
      throw new Error(`No valid URL for index=${idx}`);
    }
    if (idx !== this.index && this.resumeTarget <= 0) {
      this.maybeSendTime(true);
    }
    if (this.sock && !this.sock.destroyed) {
      this.sendCommand(["set_property", "playlist-pos", idx]);
    } else {
      console.error("⚠️ [mpv] playAt without active IPC — cursor only updated");
    }
    return { success: true, index: idx };
  },

  // Switch to the episode whose url matches, without restarting the process.
  playUrl(url) {
    if (!isHttpUrl(url)) throw new Error(`Invalid URL: ${url}`);
    const idx = this.playlist.findIndex((it) => it && it.url === url);
    if (idx < 0) throw new Error(`URL not in the active playlist: ${url}`);
    return this.playAt(idx);
  },

  seek(sec) {
    const value = Number(sec);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid seek position: ${sec}`);
    }
    if (!this.sendCommand(["set_property", "time-pos", value])) {
      throw new Error("mpv is not running (no IPC connection)");
    }
    this.resumeTarget = 0;
    this.time = value;
    this.maybeSendTime(true);
    return { success: true, time: value };
  },

  async stop() {
    if (!this.proc) {
      this.cleanupProc(true);
      return { success: true };
    }
    if (this.resumeTarget <= 0) this.maybeSendTime(true);
    await this.killPrevious();
    return { success: true };
  },

  getStatus() {
    const running = !!(this.proc && this.proc.exitCode === null);
    return {
      running,
      path: this.resolvePath(),
      hash: this.hash,
      index: this.index,
      time: this.time,
      duration: this.duration,
      paused: this.paused,
      playlistLength: this.playlist.length,
      uosc: this.uoscActive,
    };
  },
};

async function stopAll() {
  try {
    await manager.stop();
  } catch (err) {
    console.error("❌ [mpv] stopAll:", err.message);
  }
}

module.exports = manager;
module.exports.stopAll = stopAll;
module.exports.cleanupStaleSockets = cleanupStaleSockets;
