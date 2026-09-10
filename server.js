// Video Format Converter 本地服务：只接收视频，全部转换由 FFmpeg 执行。

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const express = require("express");
const mime = require("mime-types");
const multer = require("multer");
const logger = require("./logger");
const {
  ROOT,
  DEFAULT_PORT,
  RUNTIME_DIR,
  UPLOAD_DIR,
  OUTPUT_DIR,
  MAX_UPLOAD_BYTES,
  PRODUCT_EXPIRY_MS,
  FFMPEG_PATH,
  mediaVideoTargets,
  allTargets,
  downloads
} = require("./config");
const {
  ensureDirs,
  commandExists,
  extFromName,
  decodeUploadFileName,
  normalizeExt,
  categoryForExt,
  targetsForExt,
  platformCapabilities,
  outputNameFor,
  outputPathFor,
  registerDownload
} = require("./utils");
const { convertMedia, probeMediaInfo, renderVideoThumbnail } = require("./media");

if (process.env.FLYINGMOUSE_LOG_FILE) logger.setLogFile(process.env.FLYINGMOUSE_LOG_FILE);

const app = express();
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:",
  "connect-src 'self'", "frame-src 'self'", "media-src 'self'", "object-src 'none'",
  "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'"
].join("; ");
const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: MAX_UPLOAD_BYTES } });
let cachedTools = null;
let cleanupTimer = null;

function isLocalWebOrigin(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function assertLocalWebRequest(req, res, next) {
  if ((req.headers.origin && !isLocalWebOrigin(req.headers.origin))
    || (req.headers.referer && !isLocalWebOrigin(req.headers.referer))) {
    res.status(403).json({ error: "拒绝跨站请求。" });
    return;
  }
  next();
}

function registeredFilePaths(registry) {
  return new Set([...registry.values()].map((item) => item.filePath && path.resolve(item.filePath)).filter(Boolean));
}

async function cleanupOldFiles({ dirs = [UPLOAD_DIR, OUTPUT_DIR], registry = downloads } = {}) {
  const cutoff = Date.now() - PRODUCT_EXPIRY_MS;
  const registered = registeredFilePaths(registry);
  for (const directory of dirs) {
    const entries = await fsp.readdir(directory).catch(() => []);
    await Promise.all(entries.map(async (entry) => {
      const filePath = path.join(directory, entry);
      if (registered.has(path.resolve(filePath))) return;
      const stat = await fsp.stat(filePath).catch(() => null);
      if (stat?.mtimeMs < cutoff) await fsp.rm(filePath, { recursive: true, force: true }).catch(() => {});
    }));
  }
}

async function purgeRuntimeDirs({ dirs = [UPLOAD_DIR, OUTPUT_DIR] } = {}) {
  for (const directory of dirs) {
    await fsp.rm(directory, { recursive: true, force: true }).catch(() => {});
    await fsp.mkdir(directory, { recursive: true }).catch(() => {});
  }
}

function purgeRuntimeDirsSync({ dirs = [UPLOAD_DIR, OUTPUT_DIR], fsModule = fs } = {}) {
  for (const directory of dirs) {
    try { fsModule.rmSync(directory, { recursive: true, force: true }); } catch {}
    try { fsModule.mkdirSync(directory, { recursive: true }); } catch {}
  }
}

async function purgeStaleRuntimeDirs({ runtimeDir = RUNTIME_DIR } = {}) {
  const parent = path.dirname(runtimeDir);
  const prefix = path.basename(runtimeDir).replace(/-\d+$/, "-");
  const cutoff = Date.now() - PRODUCT_EXPIRY_MS;
  const entries = await fsp.readdir(parent, { withFileTypes: true }).catch(() => []);
  await Promise.all(entries.filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map(async (entry) => {
      const directory = path.join(parent, entry.name);
      if (directory === runtimeDir) return;
      const stat = await fsp.stat(directory).catch(() => null);
      if (stat?.mtimeMs < cutoff) await fsp.rm(directory, { recursive: true, force: true }).catch(() => {});
    }));
}

async function getTools() {
  if (!cachedTools) cachedTools = { ffmpeg: await commandExists(FFMPEG_PATH) };
  return cachedTools;
}

async function getToolDiagnostics() {
  const tools = await getTools();
  return { ffmpeg: { enabled: tools.ffmpeg, executable: FFMPEG_PATH } };
}

app.use((_req, res, next) => {
  res.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  next();
});
app.use(express.static(path.join(ROOT, "public")));
app.use(express.json());

app.get("/api/capabilities", async (_req, res) => {
  const tools = await getTools();
  res.json({
    tools,
    platform: platformCapabilities(),
    maxUploadBytes: MAX_UPLOAD_BYTES,
    groups: { video: { inputs: ["mp4", "mov", "mkv", "webm", "avi", "m4v", "m4s", "wmv", "flv"], targets: mediaVideoTargets } }
  });
});

app.post("/api/targets", assertLocalWebRequest, async (req, res) => {
  const tools = await getTools();
  const extension = normalizeExt(String(req.body?.extension || ""));
  const category = categoryForExt(extension);
  res.json({ extension, category, targets: targetsForExt(extension, tools), videoOnly: true });
});

app.post("/api/media-info", assertLocalWebRequest, upload.single("file"), async (req, res) => {
  const file = req.file;
  const originalName = decodeUploadFileName(file?.originalname);
  if (!file) {
    res.status(400).json({ error: "请先选择一个视频文件。", errorCode: "MEDIA_FILE_REQUIRED" });
    return;
  }
  try {
    if (categoryForExt(extFromName(originalName)) !== "video") {
      res.status(415).json({ error: "本工具只支持视频文件。", errorCode: "VIDEO_ONLY_INPUT" });
      return;
    }
    const media = await probeMediaInfo(file.path);
    if (!media.hasVideo) {
      res.status(422).json({ error: "没有检测到可读取的视频轨道。", errorCode: "MEDIA_VIDEO_TRACK_MISSING" });
      return;
    }
    let thumbnailDataUrl = "";
    try {
      const thumbnail = await renderVideoThumbnail(file.path, media);
      if (thumbnail?.length) thumbnailDataUrl = `data:image/jpeg;base64,${thumbnail.toString("base64")}`;
    } catch (error) {
      logger.warn(`Video thumbnail failed: ${originalName}`, error);
    }
    res.json({ ok: true, media, thumbnailDataUrl });
  } catch (error) {
    logger.error(`Media inspection failed: ${originalName}`, error);
    res.status(500).json({ error: error.message || "视频信息读取失败。", errorCode: "MEDIA_INFO_FAILED" });
  } finally {
    await fsp.rm(file.path, { force: true }).catch(() => {});
  }
});

app.post("/api/convert", assertLocalWebRequest, upload.single("file"), async (req, res) => {
  const file = req.file;
  const originalName = decodeUploadFileName(file?.originalname);
  const target = normalizeExt(String(req.body?.targetFormat || ""));
  if (!file) {
    res.status(400).json({ error: "请先选择一个视频文件。", errorCode: "VIDEO_FILE_REQUIRED" });
    return;
  }
  const sourceExtension = extFromName(originalName);
  if (categoryForExt(sourceExtension) !== "video") {
    await fsp.rm(file.path, { force: true }).catch(() => {});
    res.status(415).json({ error: "本工具只支持视频文件。", errorCode: "VIDEO_ONLY_INPUT" });
    return;
  }
  if (!allTargets.has(target)) {
    await fsp.rm(file.path, { force: true }).catch(() => {});
    res.status(400).json({ error: "目标格式只支持 MP4、MKV、WEBM 或 GIF。", errorCode: "VIDEO_TARGET_UNSUPPORTED" });
    return;
  }

  const outputPath = outputPathFor(originalName, target);
  const downloadName = outputNameFor(originalName, target);
  const videoCodec = ["auto", "h264", "h265", "av1"].includes(String(req.body?.videoCodec || ""))
    ? String(req.body.videoCodec) : "auto";
  try {
    const conversionResult = await convertMedia(file.path, outputPath, target, "video", { videoCodec });
    const mimeType = mime.lookup(downloadName) || "application/octet-stream";
    const registered = registerDownload(outputPath, downloadName, mimeType);
    const previewSize = (await fsp.stat(outputPath)).size;
    logger.info(`Video converted: ${originalName} -> ${downloadName}`);
    res.json({
      ok: true,
      fileName: downloadName,
      category: "video",
      mimeType,
      ...registered,
      previewSize,
      mediaConversion: {
        mode: conversionResult.mode,
        elapsedMs: conversionResult.elapsedMs,
        inputVideoCodec: conversionResult.inputVideoCodec,
        outputVideoCodec: conversionResult.outputVideoCodec
      }
    });
  } catch (error) {
    logger.error(`Video conversion failed: ${originalName} -> ${target}`, error);
    await fsp.rm(outputPath, { force: true }).catch(() => {});
    res.status(500).json({ error: error.message || "视频转换失败。", errorCode: "VIDEO_CONVERSION_FAILED" });
  } finally {
    await fsp.rm(file.path, { force: true }).catch(() => {});
  }
});

app.get("/downloads/:id", (req, res) => {
  const item = downloads.get(req.params.id);
  if (!item) return res.status(404).send("File expired or not found.");
  res.download(item.filePath, item.downloadName, (error) => {
    if (error && !res.headersSent) res.status(500).send(error.message);
  });
});

app.get("/previews/:id", (req, res) => {
  const item = downloads.get(req.params.id);
  if (!item || !/^[A-Za-z0-9-]+$/.test(req.params.id) || req.originalUrl.includes("?")) {
    return res.status(404).send("File expired or not found.");
  }
  const inlineName = encodeURIComponent(path.basename(item.downloadName)).replaceAll("'", "%27");
  res.setHeader("Content-Type", item.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="preview"; filename*=UTF-8''${inlineName}`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'self'");
  res.sendFile(path.resolve(item.filePath), (error) => {
    if (error && !res.headersSent) res.status(500).send(error.message);
  });
});

app.use((error, _req, res, _next) => {
  if (error?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "视频文件太大，无法上传。", errorCode: "VIDEO_FILE_TOO_LARGE" });
  logger.error("Unhandled server error", error);
  res.status(500).json({ error: error.message || "服务器出错。" });
});

function startServer(port = DEFAULT_PORT) {
  ensureDirs();
  if (!cleanupTimer) {
    cleanupTimer = setInterval(() => cleanupOldFiles(), 1000 * 60 * 20);
    cleanupTimer.unref();
  }
  purgeStaleRuntimeDirs().catch(() => {});
  return new Promise((resolve, reject) => {
    const server = app.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      resolve({ server, port: actualPort, url: `http://127.0.0.1:${actualPort}` });
    });
    server.on("error", reject);
  });
}

if (require.main === module) {
  startServer().then(({ url }) => console.log(`Video Format Converter running at ${url}`)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  app,
  startServer,
  getToolDiagnostics,
  platformCapabilities,
  cleanupOldFiles,
  purgeRuntimeDirs,
  purgeRuntimeDirsSync,
  purgeStaleRuntimeDirs
};
