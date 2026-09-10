const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");

test("视频队列暴露新版 DOM 钩子并兼容缺失节点", () => {
  for (const id of ["queueToolbar", "addFilesButton", "queueCount", "queueEmptyHint"]) {
    assert.match(source, new RegExp(`querySelector\\(\\\"#${id}\\\"\\)`));
  }
  assert.match(source, /if \(queueToolbar\) queueToolbar\.hidden/);
  assert.match(source, /workspace\?\.classList\.toggle\("queue-mode"/);
});

test("视频队列严格限制四种目标格式并提供追加、删除、单项转换", () => {
  assert.match(source, /VIDEO_QUEUE_TARGETS = Object\.freeze\(\["mp4", "mkv", "webm", "gif"\]\)/);
  assert.match(source, /state\.files\.push\(\.\.\.files\)/);
  assert.match(source, /const existingKeys = new Set\(state\.files\.map\(taskKey\)\)/);
  assert.match(source, /data-convert-one/);
  assert.match(source, /data-remove/);
  assert.match(source, /async function convertQueueItem/);
  assert.match(source, /async function convertQueueFiles/);
});

test("前端只接收视频扩展名，并拒绝图片、音频、文档和 PDF", () => {
  assert.match(source, /VIDEO_INPUT_EXTENSIONS = Object\.freeze/);
  assert.match(source, /supplied\.filter\(\(file\) => !isVideoFile\(file\)\)/);
  assert.match(source, /本工具只支持视频文件，图片、音频、文档和 PDF 已忽略/);
  assert.match(source, /return isVideoFile\(file, info\) \? VIDEO_QUEUE_TARGETS\.slice\(\) : \[\]/);
});

test("队列项目渲染媒体元数据、缩略图和状态进度", () => {
  assert.match(source, /batch-thumbnail/);
  assert.match(source, /media\.duration/);
  assert.match(source, /media\.width && media\.height/);
  assert.match(source, /result\.status === "converting"/);
  assert.match(source, /batch-progress/);
});

test("队列在转换前标注无需转换、无损快速转换或重新编码，并自动跳过重复任务", () => {
  assert.match(source, /function queueConversionPlan\(index\)/);
  assert.match(source, /function canFastRemuxInQueue\(media, target\)/);
  assert.match(source, /"无需转换：源文件已符合当前设置"/);
  assert.match(source, /"无损快速转换"/);
  assert.match(source, /"需要重新编码"/);
  assert.match(source, /plan\.kind === "skip"/);
  assert.match(source, /skippedCount \+= 1/);
  assert.match(source, /status: "skipped", progress: 100/);
});

test("上传提示只展示四种视频目标格式", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  assert.match(html, /MP4<\/span><span>MKV<\/span><span>WEBM<\/span><span>GIF/);
  assert.doesNotMatch(html, /<span>MOV<\/span>/);
  assert.doesNotMatch(source, /支持 MP4、MOV、MKV、AVI、WEBM/);
  assert.doesNotMatch(source, /MP4, MOV, MKV, AVI, WEBM/);
});

test("初始态不显示重复空状态，队列按钮文案随状态切换", () => {
  assert.match(source, /queueEmptyHint\.hidden = true/);
  assert.match(source, /"Convert all"/);
  assert.match(source, /"全部转换"/);
  assert.match(source, /"Clear queue"/);
  assert.match(source, /"清空队列"/);
  assert.match(source, /: t\("action\.convert"\)/);
  assert.match(source, /: t\("action\.clear"\)/);
});

test("队列面板在上传框隐藏后仍持续接收拖拽文件", () => {
  assert.match(source, /dropPanel\.addEventListener\("dragover"/);
  assert.match(source, /dropPanel\.addEventListener\("dragleave"/);
  assert.match(source, /dropPanel\.addEventListener\("drop"/);
  assert.match(source, /acceptFiles\(event\.dataTransfer\.files\)/);
  assert.doesNotMatch(source, /dropZone\.addEventListener\("drop"/);
});

test("每个队列任务提供独立视频编码选择并在转换时提交", () => {
  assert.match(source, /queueCodecs: Object\.create\(null\)/);
  assert.match(source, /className = "batch-codec-select"/);
  assert.match(source, /codec\.dataset\.codecIndex = String\(index\)/);
  assert.match(source, /function setTaskCodec\(index, codec\)/);
  assert.match(source, /convertOneFile\(file, target, codecForIndex\(index\)\)/);
  assert.match(source, /form\.append\("videoCodec", codecOverride \|\|/);
});

test("视频编码选项向普通用户说明兼容性、体积与速度取舍", () => {
  assert.match(source, /智能转换（优先无损快速转换）/);
  assert.match(source, /H\.264（兼容性最好，文件较大）/);
  assert.match(source, /H\.265（清晰度相近，文件更小）/);
  assert.match(source, /AV1（清晰度相近，文件最小，转换较慢）/);
});

test("队列完成态显示进度勾号并移除重复的右侧完成框与单文件保存按钮", () => {
  assert.match(source, /className = "batch-progress-wrap"/);
  assert.match(source, /"batch-progress-check", "✓"/);
  assert.match(source, /downloadButton\.hidden = true/);
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8");
  assert.match(css, /\.workspace\.queue-mode \.status-box/);
  assert.match(css, /\.workspace\.queue-mode #downloadButton/);
});

test("队列目标格式与视频编码采用上下布局避免字段互相覆盖", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8");
  assert.match(css, /\.batch-target \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.batch-codec \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.batch-target-label \{[\s\S]*?min-width: 0/);
  assert.match(css, /\.batch-codec-label \{[\s\S]*?min-width: 0/);
  assert.doesNotMatch(source, /createTextElement\("span", "batch-status"/);
});

test("队列工具栏提供一键转换并把保存位置移出右侧栏", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8");
  assert.match(html, /id="quickConvertButton"[^>]*>一键转换<\/button>/);
  assert.match(source, /quickConvertButton\?\.addEventListener\("click", convertCurrentFiles\)/);
  assert.match(html, /output-directory-bar[\s\S]*converter-grid/);
  assert.match(css, /\.converter-grid \{\s*grid-template-columns: minmax\(0, 1fr\)/);
});

test("预览抽屉的关闭符号在圆形按钮内居中", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8");
  assert.match(css, /\.preview-close \{[\s\S]*?display: grid;[\s\S]*?place-items: center;[\s\S]*?padding: 0;/);
});

test("空队列不会由工作区最小高度制造额外滚动空白", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8");
  const workspaceBlocks = css.match(/\.workspace \{[^}]*\}/g) || [];
  assert.ok(workspaceBlocks.some((block) => /min-height: 0;/.test(block)));
  assert.ok(workspaceBlocks.every((block) => !/min-height: 100vh;/.test(block)));
});

test("桌面空状态铺满工作区，超长队列仅在队列区域滚动", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8");
  assert.match(css, /html,\s*body \{[\s\S]*?height: 100%;[\s\S]*?overflow: hidden;/);
  assert.match(css, /\.workspace \{[\s\S]*?display: flex;[\s\S]*?flex-direction: column;/);
  assert.match(css, /\.converter-grid \{[\s\S]*?flex: 1 1 auto;[\s\S]*?min-height: 0;/);
  assert.match(css, /\.workspace\.queue-mode \.batch-list,[\s\S]*?overflow-y: auto;/);
});
