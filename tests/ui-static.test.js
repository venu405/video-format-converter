const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { test } = require("node:test");

const publicRoot = path.join(__dirname, "..", "public");

function readPublic(fileName) {
  return fs.readFileSync(path.join(publicRoot, fileName), "utf8");
}

test("renderer exposes workflow hooks and drop zone copy", () => {
  const html = readPublic("index.html");
  assert.match(html, /id="workflowSteps"/);
  for (const step of ["select", "convert", "save"]) {
    assert.match(html, new RegExp(`data-step="${step}"`), `${step} workflow step is missing`);
  }
  assert.doesNotMatch(html, /data-step="analyze"/);
  assert.match(html, /id="dropZone"/);
  assert.match(html, /拖拽视频到这里|Drop video here/);
  assert.match(html, /id="dropHint"/);
});

test("renderer keeps mouse artwork, the support matrix, and sponsor widget removed", () => {
  const html = readPublic("index.html");
  const app = readPublic("app.js");
  const css = readPublic("styles.css");
  assert.doesNotMatch(html, /mouse-mascot|mouseMascot|mouse-stage/);
  assert.doesNotMatch(app, /mouseAssets|setMouseState|mouseMascot|mouseStateForConversion/);
  assert.doesNotMatch(css, /mouse-mascot|mouse-stage/);
  assert.doesNotMatch(html, /id="formatTable"|class="matrix"/);
  assert.doesNotMatch(html, /sponsorWidget|sponsorToggle|sponsor-qr\.jpg/);
  assert.doesNotMatch(app, /sponsorToggle|setSponsorOpen|"sponsor\./);
  assert.doesNotMatch(css, /sponsor-/);
  assert.doesNotMatch(html, /3465177342@qq\.com/);
});

test("renderer removes the header brand block but keeps the application favicon", () => {
  const html = readPublic("index.html");
  assert.doesNotMatch(html, /class="brand-mouse"|class="brand-lockup"/);
  assert.match(html, /rel="icon"/);
  assert.match(html, /href="\/assets\/app-icon\.svg"/);
});

test("Apple redesign keeps the shipped design tokens", () => {
  const css = readPublic("styles.css");
  assert.match(css, /--bg:\s*#f5f5f7/);
  assert.match(css, /--ink:\s*#1d1d1f/);
  assert.match(css, /--accent:\s*#0066cc/);
  assert.match(css, /backdrop-filter:\s*saturate\(180%\) blur\(20px\)/);
  assert.match(css, /\.workflow-steps/);
  assert.match(css, /\.drop-prompt/);
  assert.match(css, /border-radius:\s*9999px/);
});

test("renderer uses the simplified Chinese-only header and video converter title", () => {
  const html = readPublic("index.html");
  assert.doesNotMatch(html, /id="languageSelect"/);
  assert.match(html, /<title>Video Format Converter<\/title>/);
  assert.ok(html.indexOf("/i18n.js") < html.indexOf("/app.js"));
});

test("renderer exposes a persistent output directory picker", () => {
  const html = readPublic("index.html");
  const app = readPublic("app.js");
  assert.match(html, /id="outputDirectoryButton"/);
  assert.match(html, /id="outputDirectoryPath"/);
  assert.match(app, /logBridge\.getOutputDirectory/);
  assert.match(app, /logBridge\.chooseOutputDirectory/);
});

test("renderer does not inject dynamic HTML", () => {
  const app = readPublic("app.js");
  assert.doesNotMatch(app, /\.innerHTML\s*=/);
  assert.match(app, /\.textContent\s*=/);
});

test("renderer restores and updates target preferences through durable Electron settings", () => {
  const html = readPublic("index.html");
  const app = readPublic("app.js");
  assert.match(html, /conversion-preferences\.js/);
  assert.match(app, /migrateLegacySettings/);
  assert.match(app, /preferredTarget\(state\.settings\.targetBySource/);
  assert.match(app, /logBridge\.updateSettings\(\{\s*targetBySource\s*\}/s);
  assert.doesNotMatch(app, /preferredTarget\(localStorage/);
  assert.doesNotMatch(app, /rememberTarget\(localStorage/);
});

test("renderer removes the diagnostics export control from the simplified toolbar", () => {
  const html = readPublic("index.html");
  const app = readPublic("app.js");
  assert.doesNotMatch(html, /id="diagnosticsButton"/);
  assert.doesNotMatch(app, /const diagnosticsButton/);
  assert.match(app, /"diagnostics\.export": "导出诊断"/);
  assert.match(app, /"diagnostics\.export": "Export diagnostics"/);
  assert.doesNotMatch(app, /\.innerHTML\s*=/);
  assert.match(app, /result\?\.errorCode/);
  assert.match(app, /error\.errorCode/);
});

test("renderer removes the Agent control and keeps the legacy settings rail hidden", () => {
  const html = readPublic("index.html");
  const app = readPublic("app.js");
  assert.doesNotMatch(html, /id="agentInstallButton"/);
  assert.doesNotMatch(app, /const agentInstallButton/);
  assert.match(html, /<aside class="controls"[^>]*hidden/);
  assert.doesNotMatch(html, /class="topbar"/);
});

test("PDF to XLSX uses a contextual bilingual smart-table label and warning", () => {
  const html = readPublic("index.html");
  const app = readPublic("app.js");
  assert.match(html, /id="pdfExcelHint"[^>]*hidden/);
  assert.match(app, /Excel（智能表格提取）/);
  assert.match(app, /Excel \(smart table extraction\)/);
  assert.match(app, /适合电子版规则表格；扫描件、复杂表头和合并单元格可能不完整/);
  assert.match(app, /Best for digital PDFs with regular tables/);
  assert.match(app, /targetSelect\.value === "xlsx"[\s\S]*info\.category === "pdf"/);
});

test("video targets expose a codec selector (h264/h265/av1) for mp4/mov/mkv", () => {
  const html = readPublic("index.html");
  const app = readPublic("app.js");
  assert.match(html, /id="videoCodecField"[^>]*hidden/);
  assert.match(html, /id="videoCodec"/);
  assert.match(html, /value="auto"/);
  assert.match(app, /"videoCodec\.h264"/);
  assert.match(app, /"videoCodec\.h265"/);
  assert.match(app, /"videoCodec\.av1"/);
  assert.match(app, /\["mp4", "mov", "mkv"\]\.includes\(targetSelect\.value\)/);
  assert.match(app, /\["mp4", "mov", "mkv"\]\.includes\(targetFormat\)/);
  assert.match(app, /form\.append\("videoCodec"/);
});

test("video target configuration is limited to MP4, MKV, WEBM, and GIF", () => {
  const config = fs.readFileSync(path.join(__dirname, "..", "config.js"), "utf8");
  const utils = fs.readFileSync(path.join(__dirname, "..", "utils.js"), "utf8");
  assert.match(config, /const mediaVideoTargets = \["mp4", "mkv", "webm", "gif"\]/);
  assert.match(utils, /mediaVideoTargets\.forEach\(\(target\) => targets\.add\(target\)\)/);
});

test("single video selection exposes metadata and thumbnail inspection", () => {
  const html = readPublic("index.html");
  const app = readPublic("app.js");
  assert.match(html, /id="videoInsight"/);
  assert.match(html, /id="videoThumbnail"/);
  assert.match(html, /id="videoInfoGrid"/);
  assert.match(app, /fetch\("\/api\/media-info"/);
});

test("video targets omit the advanced transparent background selector", () => {
  const html = readPublic("index.html");
  const app = readPublic("app.js");
  assert.doesNotMatch(html, /id="alphaBackgroundField"/);
  assert.doesNotMatch(html, /id="alphaBackground"/);
  assert.doesNotMatch(app, /alphaBackground/);
  assert.doesNotMatch(app, /form\.append\("alphaBackground"/);
});

test("multiple images to PDF expose a merge/separate mode selector", () => {
  const html = readPublic("index.html");
  const app = readPublic("app.js");
  assert.match(html, /id="imagePdfModeField"[^>]*hidden/);
  assert.match(html, /id="imagePdfMode"/);
  assert.match(app, /"imagePdfMode\.label"/);
  assert.match(app, /"imagePdfMode\.merge"/);
  assert.match(app, /"imagePdfMode\.separate"/);
  assert.match(app, /imagePdfModeField\.hidden/);
  assert.match(app, /imagePdfMode\?\.value === "separate"/);
});

test("image capabilities include design inputs and expanded output formats", () => {
  const { imageInput, designInput, imageFormatTargets } = require("../config");
  const inputs = new Set([...imageInput, ...designInput]);
  for (const expected of ["svg", "ai", "psd", "jp2", "j2k", "jxl", "qoi", "ppm"]) {
    assert.ok(inputs.has(expected), `${expected} missing from image inputs`);
  }
  const targets = new Set(imageFormatTargets);
  for (const expected of ["png", "jpg", "webp", "gif", "avif", "tiff", "ico", "bmp", "tga", "jp2", "jxl", "qoi", "ppm", "pdf"]) {
    assert.ok(targets.has(expected), `${expected} missing from imageFormatTargets`);
  }
});

test("renderer no longer enforces a batch size limit and localizes resource errors", () => {
  const app = readPublic("app.js");
  assert.match(app, /maxBatchBytes/);
  assert.match(app, /maxBatchBytes \|\| Number\.MAX_SAFE_INTEGER/);
  assert.match(app, /result\?\.messages\?\.enUS/);
  assert.match(app, /result\?\.messages\?\.zhCN/);
});

test("renderer shows localized conversion warnings without HTML injection", () => {
  const app = readPublic("app.js");
  assert.match(app, /result\?\.warnings/);
  assert.match(app, /warning\?\.messages\?\.enUS/);
  assert.match(app, /warning\?\.messages\?\.zhCN/);
  assert.doesNotMatch(app, /\.innerHTML\s*=/);
});

test("renderer labels experimental inputs bilingually", () => {
  const app = readPublic("app.js");
  assert.match(app, /experimentalInputs/);
  assert.match(app, /Experimental\/unverified inputs/);
  assert.match(app, /实验性\/尚未完整验证的输入/);
  assert.doesNotMatch(app, /NCM|MFLAC|Audio Vivid/);
});

test("renderer keeps contextual feedback hints without the removed header notice", () => {
  const html = readPublic("index.html");
  const app = readPublic("app.js");
  const css = readPublic("styles.css");
  assert.doesNotMatch(html, /class="feedback-line"/);
  assert.doesNotMatch(html, /3465177342@qq\.com/);
  assert.match(app, /"feedback\.label": "问题反馈"/);
  assert.match(app, /"feedback\.label": "Feedback"/);
  assert.match(app, /"feedback\.hint": "如需帮助，请导出诊断报告/);
  assert.match(app, /"feedback\.hint": "For help, export the diagnostics report/);
  assert.match(app, /t\("feedback\.hint"\)/);
  assert.match(css, /\.feedback-line/);
});





test("PDF split mode exposes page/group options and a group-size field bilingually", () => {
  const html = readPublic("index.html");
  const app = readPublic("app.js");
  assert.match(html, /id="pdfSplitModeField"[^>]*hidden/);
  assert.match(html, /id="pdfSplitMode"/);
  assert.match(html, /id="pdfGroupSizeField"[^>]*hidden/);
  assert.match(html, /id="pdfGroupSize"/);
  assert.match(app, /"pdfSplitMode\.label": "拆分方式"/);
  assert.match(app, /"pdfSplitMode\.label": "Split mode"/);
  assert.match(app, /"pdfSplitMode\.page": "逐页拆分（每页一个 PDF）"/);
  assert.match(app, /"pdfSplitMode\.page": "Split into single pages"/);
  assert.match(app, /"pdfSplitMode\.group": "每 N 页一组"/);
  assert.match(app, /"pdfSplitMode\.group": "Group every N pages"/);
  assert.match(app, /"pdfGroupSize\.label": "每几页一组"/);
  assert.match(app, /"pdfGroupSize\.label": "Pages per group"/);
  assert.match(app, /form\.append\("splitMode"/);
  assert.match(app, /form\.append\("groupSize"/);
  assert.match(app, /pdfSplitMode\.addEventListener\("change", syncPdfActionFields\)/);
});

test("folder compression is removed from the UI (2026-09-04 feature removal)", () => {
  const html = readPublic("index.html");
  const app = readPublic("app.js");
  const css = readPublic("styles.css");
  assert.doesNotMatch(html, /compressFolderButton/);
  assert.doesNotMatch(html, /zipCompressionField/);
  assert.doesNotMatch(app, /compressFolder/);
  assert.doesNotMatch(app, /zipCompression/);
  assert.doesNotMatch(app, /"zip\./);
  assert.doesNotMatch(css, /compress-folder-button/);
  assert.doesNotMatch(app, /\.innerHTML\s*=/);
});

test("folder-to-PDF button is removed while folder drag traversal remains available", () => {
  const html = readPublic("index.html");
  const app = readPublic("app.js");
  assert.doesNotMatch(html, /id="folderInput"|id="chooseFolderButton"/);
  assert.doesNotMatch(app, /chooseFolderButton\.addEventListener|folderInput\.addEventListener/);
  assert.match(app, /state\.folderName/);
  assert.match(app, /collectEntryFiles/);
});

test("blank page insertion is exposed in the image merge queue", () => {
  const app = readPublic("app.js");
  assert.match(app, /insertBlankPage\(index\)/);
  assert.match(app, /removeBlankPage\(index\)/);
  assert.match(app, /isBlankPage/);
  assert.match(app, /data-insert-blank/);
  assert.match(app, /data-remove-blank/);
  assert.match(app, /form\.append\("blanks"/);
  assert.match(app, /Blank page/);
  assert.doesNotMatch(app, /\.innerHTML\s*=/);
});

test("annotated redesign removes the legacy header notices", () => {
  const html = readPublic("index.html");
  const app = readPublic("app.js");
  assert.doesNotMatch(html, /class="author-line"|class="feedback-line"/);
  assert.doesNotMatch(html, /牢蜂|LaoFeng/);
  // 渲染器不重新引入 innerHTML
  assert.doesNotMatch(app, /\.innerHTML\s*=/);
});
