// Video Format Converter 的运行时配置。
// 本项目只保留视频输入与 MP4 / MKV / WEBM / GIF 输出。

const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = __dirname;
const DEFAULT_PORT = Number(process.env.PORT || 5177);
const RUNTIME_DIR = process.env.FLYINGMOUSE_RUNTIME_DIR || path.join(os.tmpdir(), "video-format-converter-runtime");
const UPLOAD_DIR = path.join(RUNTIME_DIR, "uploads");
const OUTPUT_DIR = path.join(RUNTIME_DIR, "converted");
const MAX_UPLOAD_BYTES = Number.MAX_SAFE_INTEGER;
const PRODUCT_EXPIRY_MS = 1000 * 60 * 60 * 24;

function bundledFfmpegPath() {
  const resourcesPath = process.resourcesPath || "";
  const candidates = [
    process.env.FLYINGMOUSE_FFMPEG_PATH,
    resourcesPath && path.join(resourcesPath, "ffmpeg", "ffmpeg.exe"),
    path.join(ROOT, "bin", "ffmpeg", "ffmpeg.exe"),
    path.join(process.cwd(), "bin", "ffmpeg", "ffmpeg.exe")
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || "ffmpeg";
}

const FFMPEG_PATH = bundledFfmpegPath();
const videoInput = new Set(["mp4", "mov", "mkv", "webm", "avi", "m4v", "m4s", "wmv", "flv"]);
const mediaVideoTargets = ["mp4", "mkv", "webm", "gif"];
const allTargets = new Set(mediaVideoTargets);
const downloads = new Map();

module.exports = {
  ROOT,
  DEFAULT_PORT,
  RUNTIME_DIR,
  UPLOAD_DIR,
  OUTPUT_DIR,
  MAX_UPLOAD_BYTES,
  PRODUCT_EXPIRY_MS,
  FFMPEG_PATH,
  videoInput,
  mediaVideoTargets,
  allTargets,
  downloads
};
