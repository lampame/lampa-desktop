// modules/videoProfiles.js
// mpv quality profiles (upscale): CLI flags per level, platform-aware.
//
// Winners for darwin/arm64 (MacBook M1 Pro, brew mpv, built-in ProMotion):
//   balanced = vo=gpu-next + ewa_lanczos upscale + mitchell downscale +
//     sigmoid upscaling + correct downscaling + light deband,
//     hwdec=auto-safe (resolves to videotoolbox), gpu-api=vulkan (MoltenVK).
//   quality adds full deband + bt.2390 HDR tone mapping.
//   Smooth motion stays off by default (ProMotion needs no interpolation;
//   fixed 60Hz external screens may enable it separately).
const os = require("node:os");

const QUALITY_LEVELS = ["off", "balanced", "quality"];
const QUALITY_DEFAULT = "balanced";
const QUALITY_MIN_MAJOR = 0;
const QUALITY_MIN_MINOR = 33;

// Flags users must not override: they carry our control socket, uosc
// config dir and playlist. Conflicts resolve in favor of the app.
const RESERVED_PREFIXES = [
  "--input-ipc-server",
  "--config-dir",
  "--playlist",
  "--term-status-msg",
  "--input-commands",
];

function normalizeLevel(level, fallback = QUALITY_DEFAULT) {
  return QUALITY_LEVELS.includes(level) ? level : fallback;
}

function getGpuApiChain(platform = process.platform, arch = os.arch()) {
  if (platform === "win32") return ["d3d11", "opengl"];
  if (platform === "darwin") {
    return arch === "arm64" ? ["vulkan", "opengl"] : ["opengl", "vulkan"];
  }
  if (platform === "linux") return ["vulkan", "opengl"];
  return ["auto"];
}

function isVersionSupported(version) {
  if (!version) return true; // unknown — the dry-run probe decides
  if (version.major !== QUALITY_MIN_MAJOR) {
    return version.major > QUALITY_MIN_MAJOR;
  }
  return version.minor >= QUALITY_MIN_MINOR;
}

// Split free-form input into --flags. Invalid or reserved tokens are
// skipped with a log — they must never break the launch.
function parseCustomArgs(raw) {
  if (typeof raw !== "string" || !raw.trim()) return [];
  const tokens = raw.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  const flags = [];
  for (const token of tokens) {
    const flag = token.replace(/["']/g, "");
    if (!flag.startsWith("--") || flag.length < 3) {
      console.log(`⚠️ [mpv] ignoring invalid custom flag: ${token}`);
      continue;
    }
    const name = flag.split("=")[0];
    if (RESERVED_PREFIXES.includes(name)) {
      console.log(`⚠️ [mpv] ignoring reserved custom flag: ${name}`);
      continue;
    }
    flags.push(flag);
  }
  return flags;
}

function getQualityArgs({
  level = QUALITY_DEFAULT,
  smoothMotion = false,
  customArgs = "",
  version = null,
} = {}) {
  const normalized = normalizeLevel(level);
  const custom = parseCustomArgs(customArgs);
  if (normalized === "off" || !isVersionSupported(version)) {
    if (normalized !== "off" && version) {
      console.log(
        `⚠️ [mpv] mpv ${version.major}.${version.minor} < ${QUALITY_MIN_MAJOR}.${QUALITY_MIN_MINOR} — quality flags off`,
      );
    }
    return [...custom];
  }
  const args = [
    "--vo=gpu-next",
    `--gpu-api=${getGpuApiChain()[0]}`,
    "--hwdec=auto-safe",
    "--scale=ewa_lanczos",
    "--cscale=ewa_lanczos",
    "--dscale=mitchell",
    "--sigmoid-upscaling=yes",
    "--correct-downscaling=yes",
    "--deband=yes",
  ];
  if (normalized === "quality") {
    args.push(
      "--deband-iterations=4",
      "--deband-threshold=48",
      "--deband-range=16",
      "--deband-grain=48",
      "--tone-mapping=bt.2390",
      "--hdr-compute-peak=yes",
    );
  } else {
    args.push(
      "--deband-iterations=2",
      "--deband-threshold=64",
      "--deband-range=16",
      "--deband-grain=32",
    );
  }
  if (smoothMotion) {
    args.push(
      "--video-sync=display-resample",
      "--interpolation=yes",
      "--tscale=oversample",
    );
  }
  // Custom flags last: mpv prefers the last occurrence on conflicts.
  return [...args, ...custom];
}

module.exports = {
  QUALITY_LEVELS,
  QUALITY_DEFAULT,
  QUALITY_MIN_MAJOR,
  QUALITY_MIN_MINOR,
  normalizeLevel,
  getGpuApiChain,
  isVersionSupported,
  parseCustomArgs,
  getQualityArgs,
};
