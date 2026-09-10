#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { FFMPEG_PATH } = require("../config");
const { convertMedia, probeMediaInfo, renderVideoThumbnail } = require("../media");
const { run, runBuffer } = require("../utils");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "output", "video-benchmark");
const inputPath = path.join(outputDir, "source.mp4");

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function measure(label, codec, repetitions) {
  const runs = [];
  let lastOutput = "";
  let lastResult = null;
  for (let index = 0; index < repetitions; index += 1) {
    lastOutput = path.join(outputDir, `${label}-${index + 1}.mkv`);
    lastResult = await convertMedia(inputPath, lastOutput, "mkv", "video", { videoCodec: codec });
    runs.push(lastResult.elapsedMs);
  }
  return {
    mode: lastResult.mode,
    runsMs: runs,
    medianMs: median(runs),
    outputBytes: fs.statSync(lastOutput).size,
    outputPath: lastOutput
  };
}

async function qualityMetric(outputPath, filter, pattern) {
  try {
    const { stderr } = await run(FFMPEG_PATH, [
      "-hide_banner", "-i", inputPath, "-i", outputPath,
      "-lavfi", filter, "-f", "null", "-"
    ], { timeout: 1000 * 60 * 10 });
    return String(stderr).match(pattern)?.[1] || "unknown";
  } catch (error) {
    return String(error.message || "").match(pattern)?.[1] || "unknown";
  }
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  await run(FFMPEG_PATH, [
    "-hide_banner", "-y",
    "-f", "lavfi", "-i", "testsrc2=duration=8:size=1280x720:rate=30",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=8",
    "-codec:v", "libx264", "-preset", "medium", "-crf", "18",
    "-pix_fmt", "yuv420p", "-codec:a", "aac", "-b:a", "192k", "-shortest",
    inputPath
  ], { timeout: 1000 * 60 * 10 });

  const mediaInfo = await probeMediaInfo(inputPath);
  const thumbnail = await renderVideoThumbnail(inputPath, mediaInfo);
  fs.writeFileSync(path.join(outputDir, "thumbnail.jpg"), thumbnail);

  // 预热一次，降低首次加载编码器对结果的影响。
  await convertMedia(inputPath, path.join(outputDir, "warmup-copy.mkv"), "mkv", "video", { videoCodec: "auto" });
  await convertMedia(inputPath, path.join(outputDir, "warmup-h264.mkv"), "mkv", "video", { videoCodec: "h264" });

  const smartCopy = await measure("smart-copy", "auto", 5);
  const h264Transcode = await measure("h264-transcode", "h264", 3);
  // 容器重封装可能改变首帧时间戳；按帧序号重建时间轴后再比较画面，避免错帧导致假损失。
  const normalizedPair = `[0:v]settb=AVTB,setpts=N/(${mediaInfo.fps}*TB)[ref];[1:v]settb=AVTB,setpts=N/(${mediaInfo.fps}*TB)[test]`;
  const copySsim = await qualityMetric(smartCopy.outputPath, `${normalizedPair};[ref][test]ssim`, /All:([^\s]+)/);
  const transcodeSsim = await qualityMetric(h264Transcode.outputPath, `${normalizedPair};[ref][test]ssim`, /All:([^\s]+)/);
  const copyPsnr = await qualityMetric(smartCopy.outputPath, `${normalizedPair};[ref][test]psnr`, /average:([^\s]+)/);
  const transcodePsnr = await qualityMetric(h264Transcode.outputPath, `${normalizedPair};[ref][test]psnr`, /average:([^\s]+)/);

  const result = {
    environment: {
      platform: `${process.platform}-${process.arch}`,
      node: process.version,
      ffmpeg: FFMPEG_PATH
    },
    fixture: {
      durationSeconds: mediaInfo.duration,
      width: mediaInfo.width,
      height: mediaInfo.height,
      fps: mediaInfo.fps,
      videoCodec: mediaInfo.videoCodec,
      audioCodec: mediaInfo.audioCodec,
      inputBytes: fs.statSync(inputPath).size
    },
    smartCopy: { ...smartCopy, ssim: copySsim, psnrDb: copyPsnr },
    h264Transcode: { ...h264Transcode, ssim: transcodeSsim, psnrDb: transcodePsnr }
  };
  result.comparison = {
    speedup: Number((h264Transcode.medianMs / smartCopy.medianMs).toFixed(2)),
    timeReductionPercent: Number(((1 - smartCopy.medianMs / h264Transcode.medianMs) * 100).toFixed(2)),
    sizeChangePercent: Number(((smartCopy.outputBytes / h264Transcode.outputBytes - 1) * 100).toFixed(2))
  };

  fs.writeFileSync(path.join(outputDir, "results.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
