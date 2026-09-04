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

const TIME_THROTTLE_MS = 2000;
const SOCKET_CONNECT_RETRIES = 15;
const SOCKET_CONNECT_DELAY_MS = 200;
const QUIT_GRACE_MS = 1500;
const UOSC_MIN_MAJOR = 0;
const UOSC_MIN_MINOR = 35;
const UOSC_VERSION_TIMEOUT_MS = 5000;

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

// Remove stale lampa-mpv-* sockets from /tmp (after crashes)
function cleanupStaleSockets() {
  if (process.platform === "win32") return;
  let files = [];
  try {
    files = readdirSync(os.tmpdir());
  } catch {
    return;
  }
  for (const file of files) {
    if (!file.startsWith("lampa-mpv-") || !file.endsWith(".sock")) continue;
    const full = path.join(os.tmpdir(), file);
    // Do not touch our own current socket
    if (manager.sockPath && full === manager.sockPath) continue;
    try {
      unlinkSync(full);
    } catch {
      // Busy socket (live process) — skip
    }
  }
}

function parseMpvVersion(output) {
  const match = /mpv\s+v?(\d+)\.(\d+)(?:\.(\d+))?/i.exec(
    String(output || ""),
  );
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
  return (
    version.major === UOSC_MIN_MAJOR && version.minor >= UOSC_MIN_MINOR
  );
}

// Vendored uosc assets: dev -> <repo>/assets/mpv-uosc,
// packaged -> resources/app/assets/mpv-uosc (via `files`).
function resolveUoscSourceDir() {
  const candidates = [];
  try {
    if (
      typeof process.resourcesPath === "string" &&
      process.resourcesPath
    ) {
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
    cpSync(path.join(source, "scripts", "uosc"), path.join(dir, "scripts", "uosc"), {
      recursive: true,
    });
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
  base: 0,
  internalPos: 0,
  pendingSeek: null,
  quitTimer: null,
  eofGuardAt: 0,
  eofGuardIndex: -1,
  uoscDir: null,
  uoscActive: false,

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
      console.error(`⚠️ [mpv] custom path invalid: ${custom}, falling back to auto-detect`);
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
        const proc = spawn(target, ["--version"], { stdio: ["ignore", "pipe", "ignore"] });
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
      version: version ? `${version.major}.${version.minor}.${version.patch}` : null,
      minVersion: `${UOSC_MIN_MAJOR}.${UOSC_MIN_MINOR}.0`,
    };
  },

  async setUoscEnabled(enabled) {
    store.set("mpvUosc", Boolean(enabled));
    console.log(`🔄 [mpv] uosc ${enabled ? "enabled" : "disabled"} (applies to next launch)`);
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
    if (!this.hash) return;
    const now = Date.now();
    if (!force && now - this.lastSentAt < TIME_THROTTLE_MS) return;
    this.lastSentAt = now;
    const duration = Number(this.duration) || 0;
    const time = Number(this.time) || 0;
    const percent = duration > 0 ? (time / duration) * 100 : 0;
    // Keep the stored item position fresh so playAt can resume correctly
    const currentItem = this.playlist[this.index];
    if (currentItem && typeof currentItem === "object") {
      if (!currentItem.timeline || typeof currentItem.timeline !== "object") {
        currentItem.timeline = {};
      }
      currentItem.timeline.time = time;
      currentItem.timeline.duration = duration;
      currentItem.timeline.percent = percent;
    }
    sendToWindow("mpv-time", {
      hash: this.hash,
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

  consumePendingSeek() {
    if (this.pendingSeek == null) return;
    const target = Number(this.pendingSeek);
    this.pendingSeek = null;
    if (!Number.isFinite(target) || target <= 10) return;
    // Only seek forward to the saved position, never rewind a fresh file
    // that already plays past it
    if (Number(this.time) >= target - 3) return;
    if (this.sendCommand(["set_property", "time-pos", target])) {
      this.time = target;
      console.log(`🔄 [mpv] resume from saved position ${target}s`);
    }
  },

  handleMessage(msg) {
    if (!msg || typeof msg !== "object") return;
    // Property events
    if (msg.event === "property-change") {
      switch (msg.name) {
        case "time-pos":
          if (typeof msg.data === "number") {
            this.time = msg.data;
            this.consumePendingSeek();
            this.maybeSendTime(false);
          }
          break;
        case "duration":
          if (typeof msg.data === "number") {
            this.duration = msg.data;
            this.consumePendingSeek();
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
          // Internal mpv playlist cursor — track it so auto-advance
          // and manual next/prev inside mpv stay in sync
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
    // End of file
    if (msg.event === "end-file") {
      const reason = msg.reason || "unknown";
      if (reason === "eof") {
        this.handleEof();
      } else if (reason === "quit" || reason === "stop") {
        this.handleQuit(reason);
      }
    }
  },

  syncIndexFromInternalPos() {
    // mpv advances its internal queue on its own (auto-next, OSD next/prev).
    // Map the internal position back to our playlist index via the base offset.
    const mapped = this.internalPos - this.base;
    if (!Number.isInteger(mapped)) return;
    if (mapped < 0 || mapped >= this.playlist.length) return;
    if (mapped === this.index) return;
    // Flush the old episode before switching the cursor
    this.maybeSendTime(true);
    this.index = mapped;
    const item = this.playlist[this.index];
    this.hash = (item && (item.hash || item?.timeline?.hash)) || this.hash;
    this.time = 0;
    this.duration = 0;
    this.paused = false;
    this.lastSentAt = 0;
    this.pendingSeek = this.savedStartOf(item);
    console.log(`🔄 [mpv] internal playlist moved to index=${this.index}`);
  },

  handleEof() {
    // mpv fires end-file twice for the same file (eof-reached + end-file event).
    // Guard against double-advance.
    const now = Date.now();
    if (this.eofGuardIndex === this.index && now - this.eofGuardAt < 3000) {
      return;
    }
    this.eofGuardIndex = this.index;
    this.eofGuardAt = now;
    // Final flush of the current position
    this.maybeSendTime(true);
    const hasNext = this.index < this.playlist.length - 1;
    if (hasNext) {
      this.index += 1;
      const next = this.playlist[this.index];
      this.hash = (next && (next.hash || next?.timeline?.hash)) || this.hash;
      // New file starts from zero — reset counters so the first ticks
      // of the next episode are reported immediately
      this.time = 0;
      this.duration = 0;
      this.paused = false;
      this.lastSentAt = 0;
      this.pendingSeek = this.savedStartOf(next);
      console.log(`🔄 [mpv] auto-advance to next item (index=${this.index})`);
      sendToWindow("mpv-ended", {
        reason: "eof",
        autoNext: true,
        index: this.index,
        hash: this.hash,
      });
    } else {
      console.log("✅ [mpv] playback finished (eof)");
      sendToWindow("mpv-ended", {
        reason: "eof",
        autoNext: false,
        index: this.index,
        hash: this.hash,
      });
    }
  },

  handleQuit(reason) {
    this.maybeSendTime(true);
    sendToWindow("mpv-ended", {
      reason: reason || "quit",
      autoNext: false,
      index: this.index,
      hash: this.hash,
    });
    this.cleanupProc(false);
  },

  cleanupProc(removeSocket = true) {
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
    // Subscribe to properties
    const props = ["time-pos", "duration", "pause", "eof-reached", "playlist-pos"];
    props.forEach((name, i) => {
      this.sendCommand(["observe_property", i + 1, name]);
    });
  },

  async play({ url, title, start, hash, playlist, index } = {}) {
    if (!isHttpUrl(url)) {
      throw new Error(`Invalid URL (http(s):// required): ${url}`);
    }
    const mpvPath = this.resolvePath();
    if (!mpvPath) {
      throw new Error("mpv not found. Install via brew install mpv or set the path manually");
    }

    await this.killPrevious();
    cleanupStaleSockets();

    const startSec = Number(start) || 0;
    const list = Array.isArray(playlist) ? playlist.filter((it) => it && isHttpUrl(it.url)) : [];
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

    const args = ["--no-terminal", "--force-window", "--keep-open=no"];
    if (store.get("mpvFullscreen", true)) {
      args.push("--fullscreen");
    }
    if (uoscDir) {
      args.push(`--config-dir=${uoscDir}`);
    }
    if (startSec > 0) args.push(`--start=${startSec}`);
    args.push(`--input-ipc-server=${sockPath}`, "--osd-level=1");
    if (title) args.push(`--title=${title}`);
    // Load the whole playlist at once so mpv owns next/prev/eof order.
    // The current episode goes first; base maps mpv positions back to ours.
    const ordered =
      list.length > 0
        ? [list[idx], ...list.slice(0, idx), ...list.slice(idx + 1)]
        : [];
    for (const item of ordered) {
      args.push(item.url);
    }
    if (ordered.length === 0) args.push(url);

    console.log(`🔄 [mpv] launch: ${mpvPath} ${args.join(" ")}`);
    const proc = spawn(mpvPath, args, { stdio: "ignore" });
    this.proc = proc;
    this.sockPath = sockPath;
    this.playlist = list;
    this.index = list.length > 0 ? idx : 0;
    this.base = list.length > 0 ? idx : 0;
    this.internalPos = 0;
    this.pendingSeek = null;
    this.eofGuardAt = 0;
    this.eofGuardIndex = -1;
    this.hash = hash || null;
    this.time = startSec;
    this.duration = 0;
    this.paused = false;
    this.lastSentAt = 0;
    this.uoscDir = uoscDir;
    this.uoscActive = uoscActive;

    proc.on("error", (err) => {
      console.error("❌ [mpv] process launch failed:", err.message);
      sendToWindow("mpv-ended", { reason: "error", index: this.index, hash: this.hash });
      this.cleanupProc(true);
      this.proc = null;
    });
    proc.on("exit", (code) => {
      console.log(`🔄 [mpv] process exited (code=${code})`);
      // Final event if not sent via quit/eof yet
      sendToWindow("mpv-ended", { reason: "quit", index: this.index, hash: this.hash });
      this.cleanupProc(true);
      this.proc = null;
    });

    try {
      const sock = await this.connectSocket(sockPath);
      this.attachSocket(sock);
      console.log(`✅ [mpv] IPC connected: ${sockPath}`);
      // Playlist is already on the command line — nothing to append.
      // Re-apply the saved position in case --start was ignored.
      if (startSec > 10) {
        this.pendingSeek = startSec;
        this.consumePendingSeek();
      }
    } catch (err) {
      console.error("❌ [mpv] failed to connect to IPC socket:", err.message);
      // Video plays without IPC — keep the process, but no timecodes
    }

    return { success: true, path: mpvPath };
  },

  setPlaylist(list) {
    if (!Array.isArray(list)) throw new Error("playlist must be an array");
    const clean = list.filter((it) => it && isHttpUrl(it.url));
    this.playlist = clean;
    if (this.index >= clean.length) this.index = 0;
    // Base mapping is only valid for the launch playlist; a late set()
    // cannot reorder the running mpv queue, so reset the mapping.
    this.base = this.index;
    this.internalPos = 0;
    // If mpv is already playing — append only items not yet in the queue
    if (this.proc && this.sock) {
      for (const item of clean) {
        this.sendCommand(["loadfile", item.url, "append"]);
      }
      this.base = 0;
    }
    console.log(`✅ [mpv] playlist stored (${clean.length} items)`);
    return { success: true, length: clean.length };
  },

  // Navigation via the internal mpv playlist when possible:
  // our index -> mpv position = index - base (mod length).
  // Falls back to loadfile (replace) if IPC is down.
  playAt(index) {
    const idx = Number(index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.playlist.length) {
      throw new Error(`Invalid playlist index: ${index}`);
    }
    const item = this.playlist[idx];
    if (!item || !isHttpUrl(item.url)) {
      throw new Error(`No valid URL for index=${idx}`);
    }
    // Flush the old position before switching
    this.maybeSendTime(true);
    this.index = idx;
    this.hash = item.hash || item?.timeline?.hash || this.hash;
    this.time = 0;
    this.duration = 0;
    this.paused = false;
    this.lastSentAt = 0;
    this.pendingSeek = this.savedStartOf(item);
    if (this.sock && !this.sock.destroyed) {
      const n = this.playlist.length;
      const pos = ((idx - this.base) % n + n) % n;
      this.sendCommand(["set_property", "playlist-pos", pos]);
      console.log(`🔄 [mpv] playAt index=${idx} (mpv pos=${pos})`);
    } else {
      console.error("⚠️ [mpv] playAt without active IPC — cursor only updated");
    }
    return { success: true, index: idx };
  },

  seek(sec) {
    const value = Number(sec);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid seek position: ${sec}`);
    }
    if (!this.sendCommand(["set_property", "time-pos", value])) {
      throw new Error("mpv is not running (no IPC connection)");
    }
    this.time = value;
    this.maybeSendTime(true);
    return { success: true, time: value };
  },

  async stop() {
    if (!this.proc) {
      this.cleanupProc(true);
      return { success: true };
    }
    this.maybeSendTime(true);
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
