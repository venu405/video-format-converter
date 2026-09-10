// Video Format Converter 的通用服务端工具。

const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const sanitize = require("sanitize-filename");
const logger = require("./logger");
const { UPLOAD_DIR, OUTPUT_DIR, videoInput, mediaVideoTargets, downloads } = require("./config");

function ensureDirs() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: options.timeout || 1000 * 60 * 15 }, (error, stdout, stderr) => {
      if (error) {
        const detail = stderr || stdout || error.message;
        logger.warn(`Command failed: ${command} ${(args || []).join(" ")}`, { message: detail.trim() || error.message, stack: error.stack });
        reject(new Error(detail.trim()));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function runBuffer(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: options.timeout || 1000 * 60 * 15, encoding: "buffer", maxBuffer: options.maxBuffer || 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const detail = (Buffer.isBuffer(stderr) ? stderr.toString("utf8") : String(stderr || ""))
          || (Buffer.isBuffer(stdout) ? stdout.toString("utf8") : String(stdout || "")) || error.message;
        logger.warn(`Command failed: ${command} ${(args || []).join(" ")}`, { message: detail.trim() || error.message, stack: error.stack });
        reject(new Error(detail.trim()));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function commandExists(command, versionArgs = ["-version"]) {
  try {
    await run(command, versionArgs, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function extFromName(name = "") {
  return path.extname(String(name || "")).replace(".", "").toLowerCase();
}

function decodeUploadFileName(name = "") {
  const original = String(name || "file");
  try {
    const decoded = Buffer.from(original, "latin1").toString("utf8");
    const hasHighByte = [...original].some((character) => character.charCodeAt(0) >= 0x80);
    if (hasHighByte && decoded && decoded !== original && !decoded.includes("\uFFFD")) return decoded;
  } catch {
    // Keep the original name when a legacy upload name cannot be decoded.
  }
  return original;
}

function normalizeExt(ext) {
  return String(ext || "").toLowerCase();
}

function categoryForExt(rawExt) {
  return videoInput.has(normalizeExt(rawExt)) ? "video" : "unknown";
}

function targetsForExt(rawExt, tools = {}) {
  if (categoryForExt(rawExt) !== "video" || tools.ffmpeg === false) return [];
  return mediaVideoTargets.slice();
}

function platformCapabilities(platform = process.platform, arch = process.arch) {
  return { os: platform, arch };
}

function safeBaseName(originalName) {
  const parsed = path.parse(sanitize(originalName || "video"));
  return (parsed.name || "video").trim().slice(0, 180) || "video";
}

function outputNameFor(originalName, targetExt) {
  return `${safeBaseName(originalName)}.${targetExt}`;
}

function outputPathFor(originalName, targetExt) {
  return path.join(OUTPUT_DIR, `${Date.now()}-${randomUUID()}-${outputNameFor(originalName, targetExt)}`);
}

function previewKindFor(downloadName, mimeType) {
  return String(mimeType).startsWith("image/") || extFromName(downloadName) === "gif" ? "image" : "video";
}

function registerDownload(filePath, downloadName, mimeType) {
  const id = randomUUID();
  downloads.set(id, { filePath, downloadName, mimeType, createdAt: Date.now() });
  return { downloadUrl: `/downloads/${id}`, previewUrl: `/previews/${id}`, previewKind: previewKindFor(downloadName, mimeType) };
}

module.exports = {
  ensureDirs,
  run,
  runBuffer,
  commandExists,
  extFromName,
  decodeUploadFileName,
  normalizeExt,
  categoryForExt,
  targetsForExt,
  platformCapabilities,
  safeBaseName,
  outputNameFor,
  outputPathFor,
  previewKindFor,
  registerDownload
};
