const assert = require("node:assert/strict");
const { test } = require("node:test");

const { videoEncoderArgs, parseMediaProbe, canStreamCopy } = require("../media");

test("parseMediaProbe 读取时长、分辨率、帧率和音视频编码", () => {
  const stderr = `
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'sample.mp4':
  Duration: 00:02:03.45, start: 0.000000, bitrate: 2456 kb/s
  Stream #0:0(und): Video: h264 (High), yuv420p(progressive), 1920x1080, 2250 kb/s, 29.97 fps, 30 tbr
  Stream #0:1(und): Audio: aac (LC), 48000 Hz, stereo, fltp, 192 kb/s
`;
  assert.deepEqual(parseMediaProbe(stderr), {
    duration: 123.45,
    width: 1920,
    height: 1080,
    fps: 29.97,
    bitrateKbps: 2456,
    container: "mov",
    videoCodec: "h264",
    audioCodec: "aac",
    pixelFormat: "yuv420p",
    hasVideo: true,
    hasAudio: true,
    hasAlpha: false
  });
});

test("canStreamCopy 仅允许目标容器兼容且无 alpha 的视频", () => {
  const h264Aac = { hasVideo: true, hasAudio: true, hasAlpha: false, videoCodec: "h264", audioCodec: "aac" };
  assert.equal(canStreamCopy(h264Aac, "mp4"), true);
  assert.equal(canStreamCopy(h264Aac, "mkv"), true);
  assert.equal(canStreamCopy({ ...h264Aac, audioCodec: "opus" }, "mp4"), false);
  assert.equal(canStreamCopy({ ...h264Aac, hasAlpha: true }, "mkv"), false);
  assert.equal(canStreamCopy(h264Aac, "webm"), false);
});

test("videoEncoderArgs 默认与 h264 → libx264 crf23", () => {
  const expected = ["-codec:v", "libx264", "-preset", "medium", "-crf", "23"];
  assert.deepEqual(videoEncoderArgs(undefined), expected);
  assert.deepEqual(videoEncoderArgs("h264"), expected);
});

test("videoEncoderArgs h265/hevc → libx265 crf28", () => {
  const expected = ["-codec:v", "libx265", "-preset", "medium", "-crf", "28"];
  assert.deepEqual(videoEncoderArgs("h265"), expected);
  assert.deepEqual(videoEncoderArgs("hevc"), expected);
});

test("videoEncoderArgs av1 → libsvtav1 preset8 crf32", () => {
  assert.deepEqual(videoEncoderArgs("av1"), ["-codec:v", "libsvtav1", "-preset", "8", "-crf", "32"]);
});

test("videoEncoderArgs 未知编码回退 h264", () => {
  const expected = ["-codec:v", "libx264", "-preset", "medium", "-crf", "23"];
  assert.deepEqual(videoEncoderArgs("vp9"), expected);
  assert.deepEqual(videoEncoderArgs(""), expected);
});

