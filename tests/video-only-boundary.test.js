const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "video-only-boundary-"));
process.env.FLYINGMOUSE_RUNTIME_DIR = runtimeDir;

const config = require("../config");
const { startServer } = require("../server");
const { categoryForExt, targetsForExt } = require("../utils");

let started;

before(async () => {
  started = await startServer(0);
});

after(async () => {
  await new Promise((resolve) => started.server.close(resolve));
  fs.rmSync(runtimeDir, { recursive: true, force: true });
});

test("视频专用配置只公开视频输入和四种输出", () => {
  assert.deepEqual([...config.mediaVideoTargets], ["mp4", "mkv", "webm", "gif"]);
  assert.equal("imageInput" in config, false);
  assert.equal(categoryForExt("mp4"), "video");
  assert.equal(categoryForExt("png"), "unknown");
  assert.deepEqual(targetsForExt("png", { ffmpeg: true }), []);
});

test("服务端不再为图片返回转换目标，也不再注册图片转换路由", async () => {
  const targets = await fetch(`${started.url}/api/targets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ extension: "png" })
  });
  assert.equal(targets.status, 200);
  assert.deepEqual(await targets.json(), { extension: "png", category: "unknown", targets: [], videoOnly: true });

  const removedRoute = await fetch(`${started.url}/api/convert-images-to-pdf`, { method: "POST" });
  assert.equal(removedRoute.status, 404);
});

test("即使绕过前端，图片直传到视频接口也会被拒绝", async () => {
  const form = new FormData();
  form.append("file", new Blob(["not a video"], { type: "image/png" }), "still.png");
  form.append("targetFormat", "mp4");
  const response = await fetch(`${started.url}/api/convert`, { method: "POST", body: form });
  assert.equal(response.status, 415);
  assert.deepEqual(await response.json(), {
    error: "本工具只支持视频文件。",
    errorCode: "VIDEO_ONLY_INPUT"
  });
});
