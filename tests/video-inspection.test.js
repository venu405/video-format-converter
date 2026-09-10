const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const { after, before, test } = require("node:test");

const { FFMPEG_PATH } = require("../config");
const { convertMedia, probeMediaInfo, renderVideoThumbnail } = require("../media");

const ffmpegAvailable = spawnSync(FFMPEG_PATH, ["-version"], { stdio: "ignore" }).status === 0;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "video-converter-video-inspection-"));
const inputPath = path.join(tempDir, "sample.mp4");

before(() => {
  if (!ffmpegAvailable) return;
  execFileSync(FFMPEG_PATH, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "testsrc2=duration=1:size=160x90:rate=12",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
    "-codec:v", "libx264", "-pix_fmt", "yuv420p",
    "-codec:a", "aac", "-shortest", inputPath
  ]);
});

after(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("真实 FFmpeg 探测视频信息并生成 JPEG 缩略图", { skip: !ffmpegAvailable }, async () => {
  const info = await probeMediaInfo(inputPath);
  assert.equal(info.hasVideo, true);
  assert.equal(info.hasAudio, true);
  assert.equal(info.width, 160);
  assert.equal(info.height, 90);
  assert.equal(info.fps, 12);
  assert.equal(info.videoCodec, "h264");
  assert.equal(info.audioCodec, "aac");
  assert.ok(info.duration >= 0.9 && info.duration <= 1.1);

  const thumbnail = await renderVideoThumbnail(inputPath, info);
  assert.ok(Buffer.isBuffer(thumbnail));
  assert.ok(thumbnail.length > 100);
  assert.deepEqual([...thumbnail.subarray(0, 3)], [0xff, 0xd8, 0xff]);
});

test("智能模式对兼容视频执行直拷，手动 H.264 执行重编码", { skip: !ffmpegAvailable }, async () => {
  const copyPath = path.join(tempDir, "copy.mkv");
  const transcodePath = path.join(tempDir, "transcode.mkv");
  const copied = await convertMedia(inputPath, copyPath, "mkv", "video", { videoCodec: "auto" });
  const transcoded = await convertMedia(inputPath, transcodePath, "mkv", "video", { videoCodec: "h264" });

  assert.equal(copied.mode, "stream-copy");
  assert.equal(copied.outputVideoCodec, "h264");
  assert.equal(transcoded.mode, "transcode");
  assert.equal(transcoded.outputVideoCodec, "h264");
  assert.ok(fs.statSync(copyPath).size > 0);
  assert.ok(fs.statSync(transcodePath).size > 0);
});
