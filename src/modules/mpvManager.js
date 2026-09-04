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

// System mpv lookup paths (macOS, also valid for other unix)
const SYSTEM_PATHS = [
  "/opt/homebrew/bin/mpv",
  "/usr/local/bin/mpv",
  "/Applications/mpv.app/Contents/MacOS/mpv",
];

// How often at most we push a progress report to Lampa (mpv emits
// time-pos ~4x/sec; Lampa only needs a smooth 1/sec tick to update bars).
const TIME_THROTTLE_MS = 1000;
const SOCKET_CONNECT_RETRIES = 15;
const SOCKET_CONNECT_DELAY_MS = 200;
const QUIT_GRACE_MS = 1500;
const UOSC_MIN_MAJOR = 0;
const UOSC_MIN_MINOR = 35;
const UOSC_VERSION_TIMEOUT_MS = 5000;
// Fallback polling of time-pos/duration/playlist-pos. observe_property is
// the primary source, but a second, low-frequency get_property loop (like
// dev/mpv.js does) guarantees timecodes keep flowing even if property
// events are missed or dropped by mpv on a track change.
const POLL_MS = 1000;

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

// Remove stale lampa-mpv-* sockets/playlists from /tmp (after crashes)
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
// packaged -> resources/app/assets/mpv-uosc (via `files`).
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

// Isolated per-launch config dir with our uosc copy.
// The user's own mpv.conf is intentionally NOT loaded (--config-dir
// replaces the default config dir), which fixes conflicts with user setups.
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

// Human-readable title for mpv OSD/playlist. Returns '' when nothing
// usable is available (caller falls back to mpv defaults or the URL tail).
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

// Temporary .m3u with #EXTINF titles so mpv shows episode names in its
// own playlist / OSD (next/prev are native mpv features — there is no
// separate playlist UI in this app).
function writeM3uPlaylist(filePath, items) {
  const lines = ["#EXTM3U"];
  // Some sources give every episode the same generic title (the show name),
  // which would freeze the OSD header on one label. When titles collide,
  // append SxxExx (or at least a running number) so each entry is distinct.
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
  // Resume (continue-watching) position for the CURRENT file. Passed to mpv
  // as a per-file `start=+N` loadfile option (so it never leaks onto other
  // episodes) and re-applied via IPC if mpv drops it.
  resumeTarget: 0,
  resumeAttempts: 0,
  lastResumeSeekAt: 0,
  eofGuardAt: 0,
  eofGuardIndex: -1,
  internalPos: 0,
  uoscDir: null,
  uoscActive: false,
  playlistFile: null,
  pollTimer: null,

  // Path resolution: custom -> system paths -> which. Result is cached in memory.
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

  async setUoscEnabled(enabled) {
    store.set("mpvUosc", Boolean(enabled));
    console.log(
      `🔄 [mpv] uosc ${enabled ? "enabled" : "disabled"} (applies to next launch)`,
    );
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
    console.log(`✅ [mpv] custom path saved: ${trimmed}`);
    return this.getPathInfo();
  },

  resetCustomPath() {
    store.delete("mpvPath");
    cachedPath = null;
    cachedSource = null;
    cacheFilled = false;
    cachedVersion = null;
    cachedVersionFor = null;
    console.log("🔄 [mpv] custom path reset, using auto-detect");
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
    // Resolve the hash for the current episode: prefer the live hash we keep
    // on this.index, then the item's own timeline.
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
    // While a file is loading, mpv reports time-pos=0 (or the stale value
    // of the previous episode). Reporting that would wipe the new episode's
    // saved position in Lampa, so skip until playback actually advances.
    // Note: duration is deliberately NOT gated here — HLS streams may not
    // expose duration until segments load, and gating on it would silence
    // reporting for the whole episode (the bug this replaces).
    if (!force && time <= 0) return;
    // A resume seek is pending for this episode: while it has not landed,
    // playback may still sit near 0. Forwarding that would overwrite the
    // saved position in Lampa before mpv actually lands on the resume point.
    // Bound it with a wall-clock timeout so a seek that mpv silently drops
    // (unseekable HLS) cannot silence reporting forever.
    if (!force && this.resumeTarget > 0) {
      if (Date.now() - this.lastResumeSeekAt > 8000) {
        console.log("⚠️ [mpv] resume seek timed out — clearing");
        this.resumeTarget = 0;
      } else {
        return;
      }
    }
    const now = Date.now();
    if (!force && now - this.lastSentAt < TIME_THROTTLE_MS) return;
    this.lastSentAt = now;
    const percent = duration > 0 ? (time / duration) * 100 : 0;
    console.log(
      `🔄 [mpv] send-time idx=${this.index} hash=${hash} time=${Math.round(time)} dur=${Math.round(duration)} force=${force}`,
    );
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

  // Apply the armed resume seek once the demuxer is ready. Retries are
  // bounded and rate-limited: mpv can report time-pos=0 before the first
  // frame, and a seek sent too early is silently dropped. We re-send while
  // the reported position is still far below the target and attempts remain.
  consumeResumeSeek() {
    if (this.resumeTarget <= 0 || this.resumeAttempts >= 30) {
      this.resumeTarget = 0;
      return;
    }
    const target = this.resumeTarget;
    const now = Date.now();
    if (now - this.lastResumeSeekAt < 300) return;
    this.lastResumeSeekAt = now;
    // If playback already sits at/after the target this file is fresh
    // (or the previous seek landed) — nothing more to do.
    if (this.time >= target - 3) {
      this.resumeTarget = 0;
      return;
    }
    this.resumeAttempts += 1;
    // Use the `seek` command (not set_property time-pos): mpv queues it and
    // executes once the newly-loaded file can actually seek, so the resume
    // is never dropped just because the demuxer is still starting.
    if (this.sendCommand(["seek", target, "absolute"])) {
      this.time = target;
      console.log(`🔄 [mpv] resume seek #${this.resumeAttempts}: → ${target}s`);
    }
  },

  // Parse mpv stdout --term-status-msg lines (LAMPA_TIME:t|d|p|). This is a
  // second, socket-independent timecode channel — the same trick the
  // reference dev/mpv.js uses — so progress keeps flowing even if the IPC
  // socket stalls or drops events on a track switch.
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
    // Replies to our get_property polling (request_id 101..103). This is a
    // fallback for when observe_property events are missed — mpv answers
    // these even across a track change, which keeps timecodes flowing.
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
        const prev = this.duration;
        this.duration = v;
        if (prev <= 0 && v > 0) {
          console.log(
            `🔄 [mpv] duration loaded idx=${this.index} dur=${Math.round(v)}`,
          );
        }
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
            // New file ticks arrive after file-loaded; keep retrying resume
            // until the demuxer accepts the seek.
            if (this.resumeTarget > 0) this.consumeResumeSeek();
            this.maybeSendTime(false);
          }
          break;
        case "duration":
          if (typeof msg.data === "number") {
            const prev = this.duration;
            this.duration = msg.data;
            if (prev <= 0 && msg.data > 0) {
              console.log(
                `🔄 [mpv] duration loaded idx=${this.index} dur=${Math.round(msg.data)}`,
              );
            }
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
          // mpv advances its internal queue on its own (auto-next, OSD
          // next/prev, uosc playlist pick). The m3u is in our original
          // order, so mpv position == our playlist index directly.
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
    // A new file has started loading. Resume (if any) was applied by
    // --input-commands=seek for the launch file; if mpv dropped it, retry
    // here once the demuxer is actually ready.
    if (msg.event === "start-file") {
      console.log(
        `🔄 [mpv] start-file idx=${this.index} playlistPos=${this.internalPos}`,
      );
      this.time = 0;
      this.duration = 0;
      return;
    }
    if (msg.event === "file-loaded") {
      console.log(
        `🔄 [mpv] file-loaded idx=${this.index} playlistPos=${this.internalPos}`,
      );
      this.consumeResumeSeek();
      return;
    }
    // End of file
    if (msg.event === "end-file") {
      const reason = msg.reason || "unknown";
      console.log(`🔄 [mpv] end-file idx=${this.index} reason=${reason}`);
      if (reason === "eof") {
        this.handleEof();
      } else if (reason === "quit" || reason === "stop") {
        this.handleQuit(reason);
      }
    }
  },

  // mpv moved to another playlist entry on its own (auto-next / OSD
  // next/prev / uosc playlist pick). The m3u is in the ORIGINAL order, so
  // mpv position == our playlist index directly. Sync our index/hash so
  // timecodes are reported under the right episode, and arm resume only if
  // that episode has a saved position (auto-advance to an unwatched episode
  // starts at 0).
  syncIndexFromInternalPos() {
    if (!Number.isInteger(this.internalPos)) return;
    // mpv went idle: playlist fully played (or emptied). If we had a
    // session going, report the end and let the renderer close the player.
    if (this.internalPos < 0) {
      if (this.index >= 0 && this.playlist.length > 0 && this.proc) {
        console.log("✅ [mpv] playlist finished (idle) — closing player");
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
    // Flush the finished/abandoned episode before switching the cursor —
    // but only if it actually played (mpv also hops over entries that fail
    // to load, and flushing time=0 for those would wipe their saved state
    // in Lampa).
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
    // Do NOT force media-title here: mpv picks the next entry's #EXTINF
    // title itself once it loads, and a force set too early would freeze
    // the OSD header on a stale label.
    const label = item ? mpvDisplayTitle(item) : "";
    console.log(`🔄 [mpv] playlist moved to index=${this.index}`);
    sendToWindow("mpv-track", {
      index: this.index,
      hash: this.hash,
      title: label || "",
    });
    // Arm resume for the newly-active episode; seek is retried on
    // file-loaded/duration/time-pos.
    const resume = this.savedStartOf(item);
    this.resumeTarget = resume > 10 ? resume : 0;
    this.resumeAttempts = 0;
    this.lastResumeSeekAt = Date.now();
    if (this.resumeTarget > 0) this.consumeResumeSeek();
  },

  // Episode ended. Report the finished position (as watched). mpv advances
  // through the playlist on its own (keep-open=yes still auto-advances
  // between files); our cursor is synced by the playlist-pos event that
  // follows. Only when the LAST playlist entry ended do we quit mpv.
  handleEof() {
    // mpv fires eof twice (eof-reached + end-file) — guard.
    const now = Date.now();
    if (this.eofGuardIndex === this.index && now - this.eofGuardAt < 3000) {
      return;
    }
    this.eofGuardIndex = this.index;
    this.eofGuardAt = now;
    // Final flush of the completed episode. A finished episode counts as
    // watched: report ~95% of duration so Lampa marks it as viewed.
    if (this.resumeTarget <= 0) {
      const duration = Number(this.duration) || 0;
      if (duration > 0) {
        this.time = duration * 0.95;
        this.maybeSendTime(true);
      } else {
        this.maybeSendTime(true);
      }
    }
    // mpv owns the queue; "is there a next entry" is about the raw mpv
    // position (== our index, m3u is in original order).
    const hasNext =
      this.playlist.length > 0 && this.internalPos + 1 < this.playlist.length;
    sendToWindow("mpv-ended", {
      reason: "eof",
      autoNext: hasNext,
      index: this.index,
      hash: this.hash,
    });
    // Only when the REAL last playlist entry finished do we close mpv.
    // keep-open=yes parks it on the last frame otherwise, and mpv
    // auto-advances between entries on its own — quitting early (e.g. when
    // internalPos lags behind a fresh track switch) is what used to kill a
    // session right after moving to the next episode.
    if (!hasNext) {
      console.log("✅ [mpv] last episode finished — closing player");
      this.sendCommand(["quit"]);
    }
  },

  handleQuit(reason) {
    console.log(`🔄 [mpv] handleQuit reason=${reason || "quit"}`);
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
    console.log("🔄 [mpv] stopping previous process");
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
    // ESC за замовчуванням лише виходить з fullscreen — перепризначаємо
    // на повний вихід, щоб клієнт завжди отримував mpv-ended
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
    // Fallback polling (see POLL_MS): guarantees timecodes and track
    // position keep flowing even if observe_property events are missed.
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

    // uosc: isolated config dir (fixes conflicts with the user's own mpv.conf).
    // Requires mpv >= 0.35; falls back to the stock OSC otherwise.
    let uoscDir = null;
    let uoscActive = false;
    if (store.get("mpvUosc", true)) {
      const version = await this.getMpvVersion(mpvPath);
      if (isUoscSupported(version)) {
        uoscDir = prepareUoscConfigDir();
        uoscActive = Boolean(uoscDir);
        if (!uoscActive) {
          console.error("⚠️ [mpv] uosc assets missing — using stock OSC");
        }
      } else {
        console.log(
          `⚠️ [mpv] uosc needs mpv >= ${UOSC_MIN_MAJOR}.${UOSC_MIN_MINOR} (found ${version ? `${version.major}.${version.minor}.${version.patch}` : "unknown"}) — using stock OSC`,
        );
      }
    }

    const args = [
      // Terminal output is captured by us (see stdout fallback below), so
      // --terminal=yes (not --no-terminal) is required for --term-status-msg
      // to print. mpv writes plain text to our pipe — no console window.
      "--terminal=yes",
      "--force-window",
      // mpv owns the playlist: next/prev are native mpv/OSD features and
      // there is no separate playlist UI here. keep-open=yes lets mpv
      // advance through the playlist on its own, but it NEVER exits on its
      // own (not even after the last episode or a stream that fails to
      // start) — we decide when to quit, so a hiccup on one episode cannot
      // silently kill the whole session.
      "--keep-open=yes",
      "--keep-open-pause=no",
      "--idle=yes",
    ];
    if (store.get("mpvFullscreen", true)) {
      args.push("--fullscreen");
    }
    if (uoscDir) {
      args.push(`--config-dir=${uoscDir}`);
    }
    args.push(`--input-ipc-server=${sockPath}`, "--osd-level=1");
    // Fallback timecode channel (like dev/mpv.js): mpv prints a status line
    // with time/duration/playlist-pos on every tick. We parse it as a
    // backup so timecodes keep flowing even if the IPC socket ever stalls.
    args.push(
      "--term-status-msg=LAMPA_TIME:${=time-pos:0}|${=duration:0}|${playlist-pos:0}|",
    );
    // NOTE: no --title here. A static --title would override media-title for
    // the WHOLE session, freezing the OSD header on the show name while
    // episodes change. Without it, mpv takes each entry's #EXTINF title
    // (SxxExx etc.) and updates it on track switch — which is what uosc and
    // the window title show.

    // Launch resume position: the saved time of the episode that is current
    // at launch (list[idx]); the separately-passed `start` is the fallback.
    let launchStart = 0;
    if (list.length > 0) {
      const launchItem = list[Math.min(idx, list.length - 1)];
      const itemStart = this.savedStartOf(launchItem);
      if (itemStart > 10) launchStart = itemStart;
    }
    if (!(launchStart > 10)) launchStart = startSec > 10 ? startSec : 0;

    // Whole serial as one m3u -> mpv has a real playlist (next/prev in OSD,
    // uosc playlist button). The m3u is in the ORIGINAL order and mpv starts
    // on the launch episode via --playlist-start (verified working with
    // keep-open=yes): mpv playlist position == our index, so titles and
    // timecodes stay in sync.
    let playlistFile = null;
    if (list.length > 0) {
      socketCounter += 1;
      const candidate = path.join(
        os.tmpdir(),
        `lampa-mpv-${process.pid}-${socketCounter}.m3u`,
      );
      try {
        // Original order — mpv playlist position == our index. No rotation,
        // no base offset: this is what keeps titles/timecodes in sync.
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
      // Start from the launch episode. Works reliably with keep-open=yes:
      // mpv loads that entry, plays it, then advances through the rest.
      args.push(`--playlist-start=${idx}`);
    } else {
      this.playlistFile = null;
      args.push(url);
    }
    if (launchStart > 0) {
      // Resume of the launch episode only — runs once after its file loads,
      // does NOT leak onto the other entries (verified against mpv 0.41).
      args.push(`--input-commands=seek ${launchStart} absolute`);
      this.resumeTarget = launchStart;
      this.resumeAttempts = 0;
      this.lastResumeSeekAt = Date.now();
    }

    console.log(
      `🔄 [mpv] launch (playlist=${list.length} idx=${idx} start=${launchStart}): ${mpvPath} ${args.join(" ")}`,
    );
    // --term-status-msg needs stdout, so we capture it and parse the
    // LAMPA_TIME lines as a fallback timecode source (see handleStdout).
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
    this.hash = hash || null;
    this.time = launchStart || 0;
    this.duration = 0;
    this.paused = false;
    this.lastSentAt = 0;
    this.eofGuardAt = 0;
    this.eofGuardIndex = -1;
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
    proc.on("exit", (code, signal) => {
      console.log(
        `🔄 [mpv] process exited (code=${code} signal=${signal || "none"})`,
      );
      // Final event if not sent via quit/eof yet
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
      console.log(`✅ [mpv] IPC connected: ${sockPath}`);
      // mpv starts on the launch entry via --playlist-start. If
      // --input-commands=seek was dropped (file not seekable yet), keep
      // retrying via IPC after file-loaded.
      this.consumeResumeSeek();
    } catch (err) {
      console.error("❌ [mpv] failed to connect to IPC socket:", err.message);
      // Video plays without IPC — keep the process, but no timecodes
    }

    return { success: true, path: mpvPath };
  },

  // Store the playlist. mpv owns the queue from the m3u passed at launch,
  // so a late setPlaylist() only refreshes our copy for index mapping.
  setPlaylist(list) {
    if (!Array.isArray(list)) throw new Error("playlist must be an array");
    const clean = list.filter((it) => it && isHttpUrl(it.url));
    this.playlist = clean;
    if (this.index >= clean.length) this.index = 0;
    console.log(`✅ [mpv] playlist stored (${clean.length} items)`);
    return { success: true, length: clean.length };
  },

  // Navigation: ask mpv to move its playlist cursor to `index`. mpv loads
  // that episode, emits playlist-pos, and syncIndexFromInternalPos keeps our
  // index/hash/resume in step. Used from the renderer (Lampa UI next/prev/
  // episode pick) — the mpv-native playlist/OSD stays authoritative.
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
      // Flush the old position before switching.
      this.maybeSendTime(true);
    }
    if (this.sock && !this.sock.destroyed) {
      // m3u is in the original order, so mpv position == our index.
      this.sendCommand(["set_property", "playlist-pos", idx]);
      console.log(`🔄 [mpv] playAt index=${idx}`);
    } else {
      console.error("⚠️ [mpv] playAt without active IPC — cursor only updated");
    }
    return { success: true, index: idx };
  },

  // Switch to the episode whose url matches, without restarting the process.
  // Used by the renderer when Lampa re-plays an episode of the serial that
  // mpv is already playing.
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
    // A manual seek overrides any pending resume.
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
    console.log("✅ [mpv] stopped");
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
