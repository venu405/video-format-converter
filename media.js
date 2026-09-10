// media.js — 视频格式转换（FFmpeg 封装）。

const { FFMPEG_PATH } = require("./config");
const { run, runBuffer } = require("./utils");

async function readProbeOutput(inputPath) {
  const { stderr } = await run(FFMPEG_PATH, [
    "-hide_banner", "-i", inputPath,
    "-map", "0", "-codec", "copy", "-t", "0", "-f", "null", "-"
  ], { timeout: 30000 });
  return stderr || "";
}

function durationToSeconds(value) {
  const match = String(value || "").match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (!match) return 0;
  return (Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3]);
}

function parseMediaProbe(stderr) {
  const text = String(stderr || "");
  const durationMatch = text.match(/Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/i);
  const bitrateMatch = text.match(/Duration:[^\n]*bitrate:\s*([\d.]+)\s*kb\/s/i);
  const formatMatch = text.match(/Input #0,\s*([^,\n]+(?:,[^,\n]+)*),\s*from/i);
  const videoLine = text.match(/Stream #\d+:\d+(?:\([^\n)]*\))?(?:\[[^\n]*\])?:\s*Video:\s*([^\n]+)/i)?.[1] || "";
  const audioLine = text.match(/Stream #\d+:\d+(?:\([^\n)]*\))?(?:\[[^\n]*\])?:\s*Audio:\s*([^\n]+)/i)?.[1] || "";
  const videoCodec = videoLine.match(/^\s*([^\s,(]+)/)?.[1]?.toLowerCase() || "";
  const audioCodec = audioLine.match(/^\s*([^\s,(]+)/)?.[1]?.toLowerCase() || "";
  const pixelFormat = videoLine.match(/,\s*([a-z0-9_]+)(?:\([^)]*\))?\s*,/i)?.[1] || "";
  const size = videoLine.match(/,\s*(\d{2,6})x(\d{2,6})\b/);
  const fpsMatch = videoLine.match(/([\d.]+)\s*fps\b/i);
  const duration = durationToSeconds(durationMatch?.[1]);
  const hasAlpha = /^(rgba|argb|bgra|abgr|yuva|yuv[0-9]+a)/i.test(pixelFormat);

  return {
    duration,
    width: size ? Number(size[1]) : 0,
    height: size ? Number(size[2]) : 0,
    fps: fpsMatch ? Number(fpsMatch[1]) : 0,
    bitrateKbps: bitrateMatch ? Number(bitrateMatch[1]) : 0,
    container: formatMatch?.[1]?.split(",")[0]?.trim() || "",
    videoCodec,
    audioCodec,
    pixelFormat,
    hasVideo: Boolean(videoLine),
    hasAudio: Boolean(audioLine),
    hasAlpha
  };
}

async function probeMediaInfo(inputPath) {
  return parseMediaProbe(await readProbeOutput(inputPath));
}

async function probeVideoInfo(inputPath) {
  return probeMediaInfo(inputPath);
}

async function renderVideoThumbnail(inputPath, mediaInfo) {
  const duration = Number(mediaInfo?.duration || 0);
  const timestamp = duration > 0 ? Math.min(Math.max(duration * 0.1, 0.1), Math.max(duration - 0.1, 0.1)) : 0;
  const { stdout } = await runBuffer(FFMPEG_PATH, [
    "-hide_banner", "-loglevel", "error",
    "-ss", String(timestamp),
    "-i", inputPath,
    "-frames:v", "1",
    "-vf", "scale='min(480,iw)':-2:flags=lanczos",
    "-q:v", "4",
    "-f", "image2pipe",
    "-codec:v", "mjpeg",
    "pipe:1"
  ], { timeout: 30000 });
  return stdout;
}

function videoEncoderArgs(codec) {
  // 视频输出编码选择：默认 h264，可选 h265 / av1。
  if (codec === "h265" || codec === "hevc") {
    return ["-codec:v", "libx265", "-preset", "medium", "-crf", "28"];
  }
  if (codec === "av1") {
    return ["-codec:v", "libsvtav1", "-preset", "8", "-crf", "32"];
  }
  return ["-codec:v", "libx264", "-preset", "medium", "-crf", "23"];
}

function canStreamCopy(mediaInfo, target) {
  if (!mediaInfo?.hasVideo || mediaInfo.hasAlpha) return false;
  const videoCodec = String(mediaInfo.videoCodec || "").toLowerCase();
  const audioCodec = String(mediaInfo.audioCodec || "").toLowerCase();
  if (target === "mkv") return Boolean(videoCodec);
  if (target === "mp4") {
    const videoCompatible = new Set(["h264", "hevc", "h265", "av1", "mpeg4"]).has(videoCodec);
    const audioCompatible = !mediaInfo.hasAudio || new Set(["aac", "mp3", "alac", "ac3", "eac3"]).has(audioCodec);
    return videoCompatible && audioCompatible;
  }
  return false;
}

async function convertMedia(inputPath, outputPath, target, category, options = {}) {
  const startedAt = Date.now();
  const args = ["-hide_banner", "-y", "-i", inputPath];
  const videoInfo = await probeVideoInfo(inputPath);

  const useStreamCopy = category === "video"
    && options.videoCodec === "auto"
    && canStreamCopy(videoInfo, target);

  if (useStreamCopy) {
    args.push("-map", "0:v:0", "-map", "0:a?", "-codec", "copy");
    if (target === "mp4") args.push("-movflags", "+faststart");
  } else if (target === "mp4") {
    args.push(...videoEncoderArgs(options.videoCodec === "auto" ? "h264" : options.videoCodec), "-codec:a", "aac", "-movflags", "+faststart");
  } else if (target === "webm") {
    args.push("-codec:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-codec:a", "libopus");
  } else if (target === "mkv") {
    args.push(...videoEncoderArgs(options.videoCodec === "auto" ? "h264" : options.videoCodec), "-codec:a", "aac");
  } else if (target === "gif") {
    // 输出质量：宽度上限 480→720（保留更多细节）、fps 10→12（更流畅）、
    // palettegen stats_mode=diff（按帧差异生成调色板，减少闪烁）+ sierra2_4a 抖动（更平滑，减少色带）
    args.push(
      "-vf", "fps=12,scale='min(720,iw)':-2:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=sierra2_4a",
      "-loop", "0"
    );
  }

  for (const [key, value] of Object.entries(options.metadata || {})) {
    if (value) args.push("-metadata", `${key}=${value}`);
  }
  args.push(...(options.coverArgs || []));

  args.push(outputPath);
  await run(FFMPEG_PATH, args, { timeout: 1000 * 60 * 30 });
  return {
    mode: useStreamCopy ? "stream-copy" : "transcode",
    elapsedMs: Date.now() - startedAt,
    inputVideoCodec: videoInfo?.videoCodec || "",
    outputVideoCodec: useStreamCopy ? (videoInfo?.videoCodec || "copy") : (options.videoCodec === "auto" ? "h264" : options.videoCodec || "h264")
  };
}

module.exports = {
  probeVideoInfo,
  probeMediaInfo,
  parseMediaProbe,
  renderVideoThumbnail,
  videoEncoderArgs,
  canStreamCopy,
  convertMedia
};
