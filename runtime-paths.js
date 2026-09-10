const path = require("node:path");

function override(env, name, fallback) {
  const value = String(env?.[name] || "").trim();
  return value || fallback;
}

function resolveRuntimePaths(options = {}) {
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const resourcesPath = String(options.resourcesPath || process.resourcesPath || "");
  const env = options.env || process.env;

  if (platform === "win32") {
    if (arch !== "x64") throw new Error(`Unsupported Windows architecture: ${arch}`);
    return {
      ffmpeg: override(env, "FLYINGMOUSE_FFMPEG_PATH", path.join(resourcesPath, "ffmpeg", "ffmpeg.exe"))
    };
  }

  if (platform === "darwin") {
    if (!new Set(["arm64", "x64"]).has(arch)) throw new Error(`Unsupported macOS architecture: ${arch}`);
    const engineRoot = path.join(resourcesPath, "engines", `darwin-${arch}`);
    return {
      ffmpeg: override(env, "FLYINGMOUSE_FFMPEG_PATH", path.join(engineRoot, "runtime", "bin", "ffmpeg"))
    };
  }

  throw new Error(`Unsupported platform: ${platform}`);
}

module.exports = { resolveRuntimePaths };
