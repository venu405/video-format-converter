const state = {
  files: [],
  fileInfos: [],
  capabilities: null,
  converted: null,
  batchResults: [],
  isConverting: false,
  progressValue: 0,
  previewResult: null,
  previewOpener: null,
  folderName: "",
  selectionVersion: 0,
  settings: { schemaVersion: 2, targetBySource: {} },
  outputDirectory: "",
  // 队列模式使用稳定任务键，不依赖 DOM index，追加/删除任务不会覆盖既有结果。
  taskIds: [],
  queueTargets: Object.create(null),
  queueCodecs: Object.create(null)
};

/* --- 渲染进程日志：转发到主进程 debug.log --- */
const logBridge = window.flyingMouseFormat || {};

function rendererLog(level, message, error) {
  const detail = error ? `${message}\n${error.stack || error.message || error}` : message;
  try {
    if (typeof logBridge.log === "function") {
      logBridge.log(level, detail).catch(() => {});
    } else {
      // 非桌面环境（纯浏览器预览）退化为 console
      if (level === "error") console.error(detail);
      else if (level === "warn") console.warn(detail);
      else console.info(detail);
    }
  } catch {
    // 日志转发失败不应影响功能
  }
}

window.addEventListener("error", (event) => {
  rendererLog("error", `未捕获的渲染进程错误: ${event.message || "unknown"}`, event.error);
});

window.addEventListener("unhandledrejection", (event) => {
  rendererLog("error", "未处理的 Promise 拒绝", event.reason);
});

const fileInput = document.querySelector("#fileInput");
const dropZone = document.querySelector("#dropZone");
const fileStrip = document.querySelector("#fileStrip");
const fileName = document.querySelector("#fileName");
const fileMeta = document.querySelector("#fileMeta");
const videoInsight = document.querySelector("#videoInsight");
const videoThumbnail = document.querySelector("#videoThumbnail");
const videoInfoGrid = document.querySelector("#videoInfoGrid");
const videoInfoStatus = document.querySelector("#videoInfoStatus");
const targetSelect = document.querySelector("#targetSelect");
const outputDirectoryButton = document.querySelector("#outputDirectoryButton");
const outputDirectoryPath = document.querySelector("#outputDirectoryPath");
const videoCodecField = document.querySelector("#videoCodecField");
const videoCodec = document.querySelector("#videoCodec");
const convertButton = document.querySelector("#convertButton");
const clearButton = document.querySelector("#clearButton");
const statusBox = document.querySelector("#statusBox");
const downloadButton = document.querySelector("#downloadButton");
const batchSaveButton = document.querySelector("#batchSaveButton");
const previewButton = document.querySelector("#previewButton");
const previewDrawer = document.querySelector("#previewDrawer");
const previewBackdrop = document.querySelector("#previewBackdrop");
const previewClose = document.querySelector("#previewClose");
const previewTitle = document.querySelector("#previewTitle");
const previewMeta = document.querySelector("#previewMeta");
const previewContent = document.querySelector("#previewContent");
const dropHint = document.querySelector("#dropHint");
const batchList = document.querySelector("#batchList");
// 这些节点由新版工作台提供；旧版 HTML 缺失时保持空值兼容。
const queueToolbar = document.querySelector("#queueToolbar");
const quickConvertButton = document.querySelector("#quickConvertButton");
const addFilesButton = document.querySelector("#addFilesButton");
const queueCount = document.querySelector("#queueCount");
const queueEmptyHint = document.querySelector("#queueEmptyHint");
const workspace = document.querySelector(".workspace");
const dropPanel = document.querySelector(".drop-panel");
const progressPanel = document.querySelector("#progressPanel");
const progressLabel = document.querySelector("#progressLabel");
const progressPercent = document.querySelector("#progressPercent");
const progressTrack = document.querySelector(".progress-track");
const progressFill = document.querySelector("#progressFill");
const mouseMascot = document.querySelector("#mouseMascot");
const workflowSteps = [...document.querySelectorAll("[data-step]")];
const {
  STORAGE_KEY: LEGACY_TARGET_STORAGE_KEY,
  readPreferences,
  rememberTarget,
  preferredTarget
} = window.FlyingMouseConversionPreferences;
const { LANGUAGE_STORAGE_KEY, createI18n } = window.FlyingMouseI18n;

const messages = {
  "zh-CN": {
    "workspace.aria": "文件转换工作台", "brand.title": "鼠鼠帮你把文件转成需要的格式",
    "language.label": "语言", "health.checking": "正在检测转换引擎", "health.failed": "检测失败",
    "diagnostics.export": "导出诊断", "diagnostics.saved": "诊断报告已保存到：{path}",
    "diagnostics.canceled": "已取消导出诊断报告。", "diagnostics.failed": "导出诊断失败：{message}",
    "agent.install": "接入 Agent", "agent.checking": "正在检索已安装 Agent 的 skill 目录…",
    "agent.none": "没有发现现有的 Agent skill 目录。请先安装 Codex、Claude 或创建 ~/.agents/skills。",
    "agent.canceled": "已取消接入 Agent。", "agent.installed": "已接入 {count} 个 Agent：{paths}",
    "agent.partial": "已接入 {count} 个 Agent，另有 {failed} 个失败：{message}", "agent.failed": "接入 Agent 失败：{message}",
    "preview.open": "预览", "preview.eyebrow": "转换结果", "preview.title": "文件预览",
    "preview.close": "关闭预览", "preview.loading": "正在载入预览…", "preview.unsupported": "此格式暂不支持内嵌预览，可以保存后使用系统应用打开。",
    "preview.tooLarge": "文本文件超过 2 MB，为避免界面卡顿，请保存后查看。", "preview.failed": "预览失败：{message}",
    "workflow.aria": "转换流程", "workflow.select": "选择文件", "workflow.analyze": "识别格式",
    "workflow.convert": "开始转换", "workflow.save": "保存结果", "upload.aria": "上传文件",
    "upload.title": "拖拽视频到这里", "upload.hint": "或点击选择视频 · 拖入后自动生成缩略图",
    "action.clear": "清空", "action.convert": "开始转换", "action.download": "下载转换后的文件",
    "action.save": "保存", "action.saveAll": "保存全部",
    "target.label": "目标格式",
    "target.placeholder": "先选择文件", "target.analyzing": "正在识别", "target.none": "无共同目标格式",
    "formats.experimental": "实验性/尚未完整验证的输入：{formats}",
    "videoCodec.label": "视频编码", "videoCodec.auto": "智能转换（兼容时无损直拷）", "videoCodec.h264": "H.264（兼容性最好）",
    "videoCodec.h265": "H.265（体积更小）", "videoCodec.av1": "AV1（压缩率最高）",
    "outputDirectory.label": "保存位置", "outputDirectory.loading": "正在获取保存目录…", "outputDirectory.choose": "选择文件夹",
    "mediaInfo.title": "视频信息", "mediaInfo.thumbnailAlt": "视频缩略图",
    "settings.aria": "转换设置", "progress.label": "转换进度", "status.ready": "选择文件后会显示可用的转换格式。",
    "formats.aria": "支持格式", "formats.title": "当前支持",
    "formats.description": "仅支持常见视频格式之间的离线转换。",
    "sponsor.aria": "支持鼠鼠", "sponsor.close": "收起", "sponsor.title": "请鼠鼠吃小鱼干 🐟",
    "sponsor.description": "本软件永久免费。如果帮到了你，欢迎请鼠鼠吃根小鱼干～纯自愿。若有人收费售卖本软件，那一定是套壳圈钱的骗子，请勿上当。",
    "sponsor.qrAlt": "微信收款码",
    "feedback.label": "问题反馈", "feedback.hint": "如需帮助，请导出诊断报告并查看错误提示。",
    "feedback.guide": "问题反馈：转换遇到问题，请导出诊断报告并查看错误提示，帮助信息详见软件说明。",
    "tutorial.close": "关闭",
    "tutorial.copyTemplate": "复制模板",
    "tutorial.gotIt": "我知道了"
  },
  "en-US": {
    "workspace.aria": "File conversion workspace", "brand.title": "Let Mouse convert files into the format you need",
    "language.label": "Language", "health.checking": "Checking conversion engines", "health.failed": "Check failed",
    "diagnostics.export": "Export diagnostics", "diagnostics.saved": "Diagnostics saved to: {path}",
    "diagnostics.canceled": "Diagnostics export canceled.", "diagnostics.failed": "Diagnostics export failed: {message}",
    "agent.install": "Connect to Agent", "agent.checking": "Looking for existing Agent skill directories…",
    "agent.none": "No existing Agent skill directory was found. Install Codex or Claude, or create ~/.agents/skills first.",
    "agent.canceled": "Agent connection canceled.", "agent.installed": "Connected to {count} Agent target(s): {paths}",
    "agent.partial": "Connected to {count} target(s); {failed} failed: {message}", "agent.failed": "Agent connection failed: {message}",
    "preview.open": "Preview", "preview.eyebrow": "Conversion result", "preview.title": "File preview",
    "preview.close": "Close preview", "preview.loading": "Loading preview…", "preview.unsupported": "This format cannot be previewed here. Save it and open it with a system application.",
    "preview.tooLarge": "This text file is larger than 2 MB. Save it to view without slowing the app.", "preview.failed": "Preview failed: {message}",
    "workflow.aria": "Conversion workflow", "workflow.select": "Select files", "workflow.analyze": "Detect format",
    "workflow.convert": "Convert", "workflow.save": "Save results", "upload.aria": "Upload files",
    "upload.title": "Drop video here", "upload.hint": "or click to choose · thumbnails generated automatically",
    "action.clear": "Clear", "action.convert": "Convert", "action.download": "Download converted file",
    "action.save": "Save", "action.saveAll": "Save all",
    "target.label": "Target format",
    "target.placeholder": "Select files first", "target.analyzing": "Detecting", "target.none": "No common target format",
    "formats.experimental": "Experimental/unverified inputs: {formats}",
    "videoCodec.label": "Video codec", "videoCodec.auto": "Smart (lossless copy when compatible)", "videoCodec.h264": "H.264 (best compatibility)",
    "videoCodec.h265": "H.265 (smaller size)", "videoCodec.av1": "AV1 (highest compression)",
    "outputDirectory.label": "Save location", "outputDirectory.loading": "Loading save folder…", "outputDirectory.choose": "Choose folder",
    "mediaInfo.title": "Video information", "mediaInfo.thumbnailAlt": "Video thumbnail",
    "settings.aria": "Conversion settings", "progress.label": "Conversion progress", "status.ready": "Available target formats appear after you select files.",
    "formats.aria": "Supported formats", "formats.title": "Supported now",
    "formats.description": "Offline conversion between common video formats only.",
    "sponsor.aria": "Support Mouse", "sponsor.close": "Close", "sponsor.title": "Buy Mouse a dried fish 🐟",
    "sponsor.description": "This app is permanently free. If it helped you, you can buy Mouse a snack — completely optional. If anyone charges you for this app, it's a scam.",
    "sponsor.qrAlt": "WeChat payment QR code",
    "feedback.label": "Feedback", "feedback.hint": "For help, export the diagnostics report and check the error details.",
    "feedback.guide": "Feedback: if a conversion fails, export the diagnostics report and check the error details. Help is described in the app documentation.",
    "tutorial.close": "Close",
    "tutorial.copyTemplate": "Copy template",
    "tutorial.gotIt": "Got it"
  }
};

const i18n = createI18n({ storage: localStorage, systemLanguage: "zh-CN", messages });
const t = (key, params) => i18n.t(key, params);

function applyStaticTranslations() {
  document.documentElement.lang = i18n.language;
  for (const element of document.querySelectorAll("[data-i18n]")) element.textContent = t(element.dataset.i18n);
  for (const element of document.querySelectorAll("[data-i18n-aria]")) element.setAttribute("aria-label", t(element.dataset.i18nAria));
  for (const element of document.querySelectorAll("[data-i18n-title]")) element.title = t(element.dataset.i18nTitle);
  for (const element of document.querySelectorAll("[data-i18n-alt]")) element.alt = t(element.dataset.i18nAlt);
}

function renderHealth() {
  // 引擎能力不再占用主界面位置；错误会在转换状态区按需显示。
}

function refreshLanguage() {
  applyStaticTranslations();
  updateQueueMode();
  renderHealth();
  if (!state.files.length) setStatus(t("status.ready"));
  resetProgress();
  renderBatchList();
}

const mouseAssets = {
  idle: "/assets/mouse-format/mouse-idle.png",
  upload: "/assets/mouse-format/mouse-upload.png",
  analyzing: "/assets/mouse-format/mouse-analyzing.png",
  converting: "/assets/mouse-format/mouse-converting.png",
  batch: "/assets/mouse-format/mouse-batch.png",
  success: "/assets/mouse-format/mouse-success.png",
  error: "/assets/mouse-format/mouse-error.png"
};

const statusLabels = {
  pending: "等待",
  converting: "转换中",
  success: "完成",
  skipped: "无需转换",
  error: "失败"
};

const englishStatusLabels = { pending: "Waiting", converting: "Converting", success: "Complete", skipped: "No conversion needed", error: "Failed" };
const batchStatusLabel = (key) => i18n.language === "en-US" ? (englishStatusLabels[key] || "Waiting") : (statusLabels[key] || statusLabels.pending);

function extensionOf(name) {
  const parts = String(name || "").split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

function formatSize(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function setSelectPlaceholder(select, value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.replaceChildren(option);
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function setStatus(message, type = "") {
  statusBox.textContent = message;
  statusBox.className = `status-box ${type}`.trim();
}

function setMouseState(name) {
  if (!mouseMascot) return;
  mouseMascot.src = mouseAssets[name] || mouseAssets.idle;
  mouseMascot.dataset.state = name;
}

function setWorkflowStep(step) {
  const visibleStep = step === "analyze" ? "select" : step;
  for (const item of workflowSteps) {
    item.classList.toggle("active", item.dataset.step === visibleStep);
  }
}

const VIDEO_QUEUE_TARGETS = Object.freeze(["mp4", "mkv", "webm", "gif"]);
const VIDEO_INPUT_EXTENSIONS = Object.freeze(["mp4", "mov", "mkv", "webm", "avi", "m4v", "m4s", "wmv", "flv"]);

function taskKey(file) {
  if (!file) return "";
  // webkitRelativePath prevents two identically named files from different folders
  // being collapsed, while repeated selection of the same file remains idempotent.
  return [file.webkitRelativePath || file.name || "", file.size || 0, file.lastModified || 0, file.type || ""].join("::");
}

function taskIdFor(file, occurrence = 0) {
  return `${taskKey(file)}::${occurrence}`;
}

function isVideoFile(file, info) {
  return info?.category === "video" || VIDEO_INPUT_EXTENSIONS.includes(extensionOf(file?.name));
}

function allowedTargetsFor(info, file) {
  return isVideoFile(file, info) ? VIDEO_QUEUE_TARGETS.slice() : [];
}

function targetForIndex(index) {
  const file = state.files[index];
  const info = state.fileInfos[index];
  const id = state.taskIds[index] || taskIdFor(file, index);
  const allowed = allowedTargetsFor(info, file);
  const selected = state.queueTargets[id];
  if (selected && allowed.includes(selected)) return selected;
  if (allowed.includes(targetSelect?.value)) return targetSelect.value;
  return allowed[0] || "";
}

function codecOptionsForTarget(target) {
  if (["mp4", "mkv"].includes(target)) {
    return [
      ["auto", i18n.language === "en-US" ? "Smart (lossless when possible)" : "智能转换（优先无损快速转换）"],
      ["h264", i18n.language === "en-US" ? "H.264 (best compatibility)" : "H.264（兼容性最好，文件较大）"],
      ["h265", i18n.language === "en-US" ? "H.265 (similar quality, smaller file)" : "H.265（清晰度相近，文件更小）"],
      ["av1", i18n.language === "en-US" ? "AV1 (similar quality, smallest file, slower)" : "AV1（清晰度相近，文件最小，转换较慢）"]
    ];
  }
  if (target === "webm") return [["auto", i18n.language === "en-US" ? "VP9 (WEBM fixed)" : "VP9（WEBM 固定）"]];
  if (target === "gif") return [["auto", i18n.language === "en-US" ? "GIF (fixed)" : "GIF（固定）"]];
  return [["auto", t("videoCodec.auto")]];
}

function codecForIndex(index) {
  const file = state.files[index];
  const id = state.taskIds[index] || taskIdFor(file, index);
  const target = targetForIndex(index);
  const allowed = codecOptionsForTarget(target).map(([value]) => value);
  const selected = state.queueCodecs[id];
  if (selected && allowed.includes(selected)) return selected;
  if (allowed.includes(videoCodec?.value)) return videoCodec.value;
  return allowed[0] || "auto";
}

// Conversion planning deliberately stays conservative: only the smart/default
// choice can be skipped.  If someone explicitly picks a codec, they are asking
// for a new encode even when the source happens to use that codec already.
function canFastRemuxInQueue(media, target) {
  if (!media?.hasVideo || media.hasAlpha) return false;
  const videoCodec = String(media.videoCodec || "").toLowerCase();
  const audioCodec = String(media.audioCodec || "").toLowerCase();
  if (target === "mkv") return Boolean(videoCodec);
  if (target === "mp4") {
    const videoCompatible = new Set(["h264", "hevc", "h265", "av1", "mpeg4"]).has(videoCodec);
    const audioCompatible = !media.hasAudio || new Set(["aac", "mp3", "alac", "ac3", "eac3"]).has(audioCodec);
    return videoCompatible && audioCompatible;
  }
  return false;
}

function queueConversionPlan(index) {
  const file = state.files[index];
  const info = state.fileInfos[index] || {};
  const media = info.media;
  const target = targetForIndex(index);
  const codec = codecForIndex(index);
  if (!isVideoFile(file, info) || !target) return { kind: "transcode", text: "需要重新编码" };
  if (!media || !media.hasVideo) {
    return { kind: "analyzing", text: i18n.language === "en-US" ? "Analyzing conversion method" : "正在分析转换方式" };
  }

  // Same container + Smart means the current file already matches the chosen
  // outcome. Alpha sources are excluded because the conversion path flattens
  // transparency for broad playback compatibility.
  if (codec === "auto" && extensionOf(file?.name) === target && !media.hasAlpha) {
    return {
      kind: "skip",
      text: i18n.language === "en-US" ? "No conversion needed" : "无需转换：源文件已符合当前设置"
    };
  }
  if (codec === "auto" && canFastRemuxInQueue(media, target)) {
    return {
      kind: "remux",
      text: i18n.language === "en-US" ? "Fast lossless conversion" : "无损快速转换"
    };
  }
  return {
    kind: "transcode",
    text: i18n.language === "en-US" ? "Re-encoding required" : "需要重新编码"
  };
}

function resetQueueResultForSettingsChange(index) {
  const existing = state.batchResults[index];
  if (!existing || existing.status === "pending" || existing.status === "converting") return;
  state.batchResults[index] = { status: "pending", detail: i18n.language === "en-US" ? "Waiting to convert" : "等待转换" };
  state.converted = null;
  batchSaveButton.hidden = state.batchResults.filter((item) => item.status === "success" && item.result).length < 2;
}

function updateQueueMode() {
  const hasFiles = state.files.length > 0;
  if (dropZone) dropZone.hidden = hasFiles;
  if (batchList) batchList.hidden = !hasFiles;
  if (queueToolbar) queueToolbar.hidden = !hasFiles;
  // 上传幕布已经承担初始态空状态；避免初始页面同时出现第二块空态提示。
  if (queueEmptyHint) queueEmptyHint.hidden = true;
  if (queueCount) queueCount.textContent = String(state.files.length);
  if (quickConvertButton) quickConvertButton.disabled = !hasFiles || state.isConverting;
  if (convertButton) convertButton.textContent = hasFiles
    ? (i18n.language === "en-US" ? "Convert all" : "全部转换")
    : t("action.convert");
  if (clearButton) clearButton.textContent = hasFiles
    ? (i18n.language === "en-US" ? "Clear queue" : "清空队列")
    : t("action.clear");
  workspace?.classList.toggle("queue-mode", hasFiles);
  dropPanel?.classList.toggle("queue-mode", hasFiles);
}

function setTaskTarget(index, target) {
  const file = state.files[index];
  const info = state.fileInfos[index];
  const allowed = allowedTargetsFor(info, file);
  if (!allowed.includes(target)) return;
  const id = state.taskIds[index] || taskIdFor(file, index);
  state.queueTargets[id] = target;
  // Keep the legacy settings controls in sync for codecs and special converters.
  if (index === 0 && targetSelect) targetSelect.value = target;
  if (index === 0) syncVideoCodecField();
  resetQueueResultForSettingsChange(index);
  renderBatchList();
}

function setTaskCodec(index, codec) {
  const file = state.files[index];
  const id = state.taskIds[index] || taskIdFor(file, index);
  const allowed = codecOptionsForTarget(targetForIndex(index)).map(([value]) => value);
  if (!allowed.includes(codec)) return;
  state.queueCodecs[id] = codec;
  resetQueueResultForSettingsChange(index);
  renderBatchList();
}

function progressForResult(result) {
  return Number.isFinite(Number(result?.progress)) ? Math.max(0, Math.min(100, Number(result.progress))) : (result?.status === "success" ? 100 : 0);
}

function estimatedOutputBytesFor(indices) {
  return indices.reduce((total, index) => {
    const file = state.files[index];
    if (!file) return total;
    const plan = queueConversionPlan(index);
    if (plan.kind === "skip") return total;
    // 重编码后的文件可能稍大于源文件；这里宁可保守预留一点空间。
    const multiplier = plan.kind === "remux" ? 1.05 : 1.35;
    return total + Math.ceil((file.size || 0) * multiplier);
  }, 0);
}

async function ensureOutputSpace(indices) {
  if (typeof logBridge.checkOutputSpace !== "function") return true;
  const estimatedBytes = estimatedOutputBytesFor(indices);
  if (!estimatedBytes) return true;
  try {
    const result = await logBridge.checkOutputSpace({ estimatedBytes });
    if (!result?.checked || result.enough) return true;
    setStatus(i18n.language === "en-US"
      ? `Not enough space in the save folder. Need about ${formatSize(estimatedBytes)}, but only ${formatSize(result.availableBytes || 0)} is available.`
      : `保存位置空间不足：预计至少需要 ${formatSize(estimatedBytes)}，当前仅剩 ${formatSize(result.availableBytes || 0)}。`, "error");
    return false;
  } catch (error) {
    rendererLog("warn", "保存位置空间检查失败，继续转换", error);
    return true;
  }
}

function mouseStateForConversion() {
  return state.files.length > 1 ? "batch" : "converting";
}

function setProgress(value, label, type = "") {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));
  state.progressValue = safeValue;
  progressPanel.hidden = false;
  progressPanel.className = `progress-panel ${type}`.trim();
  progressLabel.textContent = label;
  progressPercent.textContent = `${safeValue}%`;
  progressFill.style.width = `${safeValue}%`;
  progressTrack.setAttribute("aria-valuenow", String(safeValue));
}

// 不确定进度：单个视频转码无实时进度时，用滑动动画表达正在处理。
function setIndeterminateProgress(label) {
  state.progressValue = 0;
  progressPanel.hidden = false;
  progressPanel.className = "progress-panel indeterminate";
  progressLabel.textContent = label;
  progressPercent.textContent = "";
  progressFill.style.width = "";
  progressTrack.setAttribute("aria-valuenow", "0");
}

const LONG_TASK_TARGETS = new Set(["mp4", "mkv", "webm", "gif"]);

function isLongTaskTarget(target) {
  return LONG_TASK_TARGETS.has(String(target || "").toLowerCase());
}

function longTaskProgressLabel(target) {
  const fmt = String(target || "").toLowerCase();
  return i18n.language === "en-US"
    ? "Transcoding video — this can take a few minutes, please wait…"
    : "正在转码视频，可能需要几分钟，请耐心等待…";
}

function resetProgress() {
  state.progressValue = 0;
  progressPanel.hidden = true;
  progressPanel.className = "progress-panel";
  progressLabel.textContent = t("progress.label");
  progressPercent.textContent = "0%";
  progressFill.style.width = "0%";
  progressTrack.setAttribute("aria-valuenow", "0");
}

function resetDownload() {
  state.converted = null;
  state.batchResults = [];
  downloadButton.hidden = true;
  downloadButton.removeAttribute("href");
  downloadButton.removeAttribute("download");
  batchSaveButton.hidden = true;
  previewButton.hidden = true;
  closePreview();
}

function clearFile() {
  state.selectionVersion += 1;
  state.files = [];
  state.fileInfos = [];
  state.taskIds = [];
  state.queueTargets = Object.create(null);
  state.queueCodecs = Object.create(null);
  state.isConverting = false;
  fileInput.value = "";
  fileStrip.hidden = true;
  batchList.hidden = true;
  batchList.replaceChildren();
  updateQueueMode();
  resetVideoInsight();
  setSelectPlaceholder(targetSelect, "", t("target.placeholder"));
  targetSelect.disabled = true;
  convertButton.disabled = true;
  resetDownload();
  resetProgress();
  setMouseState("upload");
  setStatus(t("status.ready"));
  setWorkflowStep("select");
}

function resetVideoInsight() {
  if (!videoInsight) return;
  videoInsight.hidden = true;
  videoThumbnail.removeAttribute("src");
  videoInfoGrid.replaceChildren();
  videoInfoStatus.textContent = "";
}

function formatMediaDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${minutes}:${String(secs).padStart(2, "0")}`;
}

function addVideoInfoItem(label, value) {
  const item = document.createElement("p");
  item.className = "video-info-item";
  const strong = document.createElement("strong");
  strong.textContent = `${label}：`;
  item.append(strong, document.createTextNode(value || "—"));
  videoInfoGrid.append(item);
}

async function loadVideoInsight(file, selectionVersion) {
  resetVideoInsight();
  videoInsight.hidden = false;
  videoInfoStatus.textContent = i18n.language === "en-US" ? "Reading video metadata and thumbnail…" : "正在读取视频信息和缩略图…";

  try {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/media-info", { method: "POST", body: form });
    const result = await parseResponse(response);
    if (!response.ok) throw responseError(result, response.status);
    if (selectionVersion !== state.selectionVersion) return;

    const media = result.media || {};
    videoInfoGrid.replaceChildren();
    addVideoInfoItem(i18n.language === "en-US" ? "Duration" : "时长", formatMediaDuration(media.duration));
    addVideoInfoItem(i18n.language === "en-US" ? "Resolution" : "分辨率", media.width && media.height ? `${media.width} × ${media.height}` : "—");
    addVideoInfoItem(i18n.language === "en-US" ? "Frame rate" : "帧率", media.fps ? `${media.fps} FPS` : "—");
    addVideoInfoItem(i18n.language === "en-US" ? "Video codec" : "视频编码", String(media.videoCodec || "—").toUpperCase());
    addVideoInfoItem(i18n.language === "en-US" ? "Audio codec" : "音频编码", media.hasAudio ? String(media.audioCodec || "—").toUpperCase() : (i18n.language === "en-US" ? "None" : "无"));
    addVideoInfoItem(i18n.language === "en-US" ? "Bitrate" : "总码率", media.bitrateKbps ? `${Math.round(media.bitrateKbps)} kb/s` : "—");
    if (result.thumbnailDataUrl) {
      videoThumbnail.src = result.thumbnailDataUrl;
      videoThumbnail.hidden = false;
    } else {
      videoThumbnail.hidden = true;
    }
    videoInfoStatus.textContent = result.thumbnailDataUrl
      ? (i18n.language === "en-US" ? "Thumbnail captured at 10% of the video." : "缩略图取自视频约 10% 位置。")
      : (i18n.language === "en-US" ? "Metadata loaded; thumbnail unavailable." : "视频信息已读取，缩略图暂不可用。");
  } catch (error) {
    if (selectionVersion !== state.selectionVersion) return;
    videoThumbnail.hidden = true;
    videoInfoGrid.replaceChildren();
    videoInfoStatus.textContent = i18n.language === "en-US" ? `Video inspection failed: ${error.message}` : `视频信息读取失败：${error.message}`;
  }
}

async function fetchCapabilities() {
  const response = await fetch("/api/capabilities");
  if (!response.ok) throw new Error(i18n.language === "en-US" ? "Unable to read conversion capabilities." : "无法读取转换能力。");
  state.capabilities = await response.json();

  renderHealth();
}

async function loadTargets(file) {
  const extension = extensionOf(file.name);
  const response = await fetch("/api/targets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ extension })
  });

  if (!response.ok) throw new Error("无法判断目标格式。");
  return response.json();
}

function commonTargetsFrom(infos) {
  if (!infos.length) return [];
  const [first, ...rest] = infos;
  const common = new Set(first.targets);
  for (const info of rest) {
    for (const target of [...common]) {
      if (!info.targets.includes(target)) common.delete(target);
    }
  }
  return [...common];
}

function summarizeFiles(files) {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (files.length === 1) {
    return {
      name: files[0].name,
      meta: `${formatSize(files[0].size)} · ${files[0].type || (i18n.language === "en-US" ? "Unknown MIME" : "未知 MIME")}`
    };
  }
  return {
    name: i18n.language === "en-US" ? `${files.length} files selected` : `已选择 ${files.length} 个文件`,
    meta: i18n.language === "en-US" ? `${formatSize(totalBytes)} total · Converted one by one` : `总大小 ${formatSize(totalBytes)} · 将按队列逐个转换`
  };
}

function renderBatchList() {
  if (!state.files.length) {
    batchList.hidden = true;
    batchList.replaceChildren();
    updateQueueMode();
    return;
  }

  batchList.hidden = false;
  const entries = state.files.map((file, index) => {
    const result = state.batchResults[index] || { status: "pending", detail: "等待转换" };
    const info = state.fileInfos[index] || {};
    const article = document.createElement("article");
    article.className = `batch-item ${result.status}`;
    article.dataset.taskId = state.taskIds[index] || taskIdFor(file, index);
    article.dataset.index = String(index);

    const main = document.createElement("div");
    main.className = "batch-main";
    const thumbnail = info.thumbnailDataUrl || info.media?.thumbnailDataUrl;
    if (thumbnail) {
      const image = document.createElement("img");
      image.className = "batch-thumbnail";
      image.src = thumbnail;
      image.alt = file.name || "video thumbnail";
      main.append(image);
    }
    const media = info.media || {};
    const plan = queueConversionPlan(index);
    const details = [];
    if (file?.size !== undefined) details.push(formatSize(file.size));
    if (media.duration) details.push(formatMediaDuration(media.duration));
    if (media.width && media.height) details.push(`${media.width} × ${media.height}`);
    const source = extensionOf(file?.name);
    if (source) details.push(source.toUpperCase());
    if (media.videoCodec) details.push(String(media.videoCodec).toUpperCase());
    main.append(
      createTextElement("p", "batch-name", file.isBlankPage ? (i18n.language === "en-US" ? "Blank page" : "空白页") : file.name),
      createTextElement("p", "batch-detail", details.join(" · ") || result.detail || batchStatusLabel(result.status)),
      createTextElement("p", "batch-result-detail", result.detail || batchStatusLabel(result.status))
    );
    if (result.status === "pending") {
      main.append(createTextElement("p", `batch-conversion-plan ${plan.kind}`, plan.text));
    }

    const settingsRow = document.createElement("div");
    settingsRow.className = "batch-settings";
    const targetWrap = document.createElement("label");
    targetWrap.className = "batch-target";
    targetWrap.append(createTextElement("span", "batch-target-label", i18n.language === "en-US" ? "Output" : "目标格式"));
    const target = document.createElement("select");
    target.className = "batch-target-select";
    target.dataset.targetIndex = String(index);
    const allowed = allowedTargetsFor(info, file);
    for (const targetName of allowed) {
      const option = document.createElement("option");
      option.value = targetName;
      option.textContent = targetName.toUpperCase();
      target.append(option);
    }
    if (!allowed.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = t("target.analyzing");
      target.append(option);
    }
    target.value = targetForIndex(index);
    target.disabled = !allowed.length || state.isConverting;
    targetWrap.append(target);

    const codecWrap = document.createElement("label");
    codecWrap.className = "batch-codec";
    codecWrap.append(createTextElement("span", "batch-codec-label", t("videoCodec.label")));
    const codec = document.createElement("select");
    codec.className = "batch-codec-select";
    codec.dataset.codecIndex = String(index);
    const selectedTarget = targetForIndex(index);
    const codecOptions = codecOptionsForTarget(selectedTarget);
    for (const [value, label] of codecOptions) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      codec.append(option);
    }
    codec.value = codecForIndex(index);
    codec.disabled = state.isConverting || codecOptions.length < 2;
    codecWrap.append(codec);
    settingsRow.append(targetWrap, codecWrap);
    main.append(settingsRow);

    if (result.status === "converting" || result.status === "success" || result.status === "skipped") {
      const progressWrap = document.createElement("div");
      progressWrap.className = "batch-progress-wrap";
      const progress = document.createElement("progress");
      progress.className = "batch-progress";
      progress.max = 100;
      progress.value = progressForResult(result);
      progress.setAttribute("aria-label", `${file.name || "file"} ${progress.value}%`);
      progressWrap.append(progress);
      if (result.status === "success" || result.status === "skipped") {
        const check = createTextElement("span", "batch-progress-check", "✓");
        check.setAttribute("aria-label", result.status === "skipped"
          ? (i18n.language === "en-US" ? "No conversion needed" : "无需转换")
          : (i18n.language === "en-US" ? "Complete" : "已完成"));
        progressWrap.append(check);
      }
      main.append(progressWrap);
    }

    const actions = document.createElement("div");
    actions.className = "batch-actions";
    const convertOne = createTextElement("button", "mini-button", i18n.language === "en-US" ? "Convert" : "转换");
    convertOne.type = "button";
    convertOne.dataset.convertOne = String(index);
    convertOne.disabled = state.isConverting || !allowed.length || result.status === "converting";
    actions.append(convertOne);
    const removeOne = createTextElement("button", "mini-button", i18n.language === "en-US" ? "Remove" : "删除");
    removeOne.type = "button";
    removeOne.dataset.remove = String(index);
    removeOne.disabled = state.isConverting;
    actions.append(removeOne);
    if (result.status === "success" && result.result) {
      const resultPreviewButton = createTextElement("button", "mini-button", t("preview.open"));
      resultPreviewButton.type = "button";
      resultPreviewButton.dataset.previewIndex = String(index);
      actions.append(resultPreviewButton);
      if (result.result.savedPath) {
        const openButton = createTextElement("button", "mini-button", i18n.language === "en-US" ? "Open" : "打开");
        openButton.type = "button";
        openButton.dataset.openSavedIndex = String(index);
        const revealButton = createTextElement("button", "mini-button", i18n.language === "en-US" ? "Show folder" : "打开文件夹");
        revealButton.type = "button";
        revealButton.dataset.revealSavedIndex = String(index);
        const copyButton = createTextElement("button", "mini-button", i18n.language === "en-US" ? "Copy path" : "复制路径");
        copyButton.type = "button";
        copyButton.dataset.copySavedIndex = String(index);
        actions.append(openButton, revealButton, copyButton);
      } else {
        const saveButton = createTextElement("button", "mini-button", t("action.save"));
        saveButton.type = "button";
        saveButton.dataset.saveIndex = String(index);
        actions.append(saveButton);
      }
    }

    article.append(main, actions);
    return article;
  });
  batchList.replaceChildren(...entries);
  updateQueueMode();
}

function setBatchResult(index, patch) {
  state.batchResults[index] = {
    ...(state.batchResults[index] || { status: "pending", detail: "等待转换" }),
    ...patch
  };
  renderBatchList();
}

function removeQueueItem(index) {
  if (state.isConverting || index < 0 || index >= state.files.length) return;
  state.selectionVersion += 1;
  state.files.splice(index, 1);
  state.fileInfos.splice(index, 1);
  state.batchResults.splice(index, 1);
  state.taskIds.splice(index, 1);
  // Rebuild keyed targets after the positional arrays change.
  const nextTargets = Object.create(null);
  state.taskIds.forEach((id) => { if (state.queueTargets[id]) nextTargets[id] = state.queueTargets[id]; });
  state.queueTargets = nextTargets;
  const nextCodecs = Object.create(null);
  state.taskIds.forEach((id) => { if (state.queueCodecs[id]) nextCodecs[id] = state.queueCodecs[id]; });
  state.queueCodecs = nextCodecs;
  if (!state.files.length) {
    clearFile();
    return;
  }
  resetDownload();
  renderBatchList();
  const targets = commonTargetsFrom(state.fileInfos);
  if (targetSelect && targets.length) {
    targetSelect.replaceChildren(...targets.map((value) => {
      const option = document.createElement("option"); option.value = value; option.textContent = value.toUpperCase(); return option;
    }));
    targetSelect.value = targetForIndex(0);
    targetSelect.disabled = false;
  }
  convertButton.disabled = false;
  setStatus(i18n.language === "en-US" ? `${state.files.length} file(s) remaining.` : `队列剩余 ${state.files.length} 个文件。`);
}

async function convertQueueItem(index) {
  if (state.isConverting || !state.files[index]) return;
  const file = state.files[index];
  const target = targetForIndex(index);
  if (!target) return;
  const plan = queueConversionPlan(index);
  if (plan.kind === "skip") {
    setBatchResult(index, { status: "skipped", progress: 100, detail: plan.text });
    setStatus(i18n.language === "en-US" ? "No conversion was needed for this file." : "该文件已符合当前设置，无需转换。", "success");
    return;
  }
  state.isConverting = true;
  renderBatchList();
  if (!await ensureOutputSpace([index])) {
    state.isConverting = false;
    renderBatchList();
    return;
  }
  setBatchResult(index, { status: "converting", progress: 0, detail: i18n.language === "en-US" ? `Converting to ${target.toUpperCase()}` : `正在转换为 ${target.toUpperCase()}` });
  try {
    const result = await convertOneFile(file, target, codecForIndex(index));
    setBatchResult(index, { status: "success", progress: 100, detail: result.fileName, result });
    state.converted = result;
    downloadButton.hidden = true;
    previewButton.hidden = false;
    setStatus(i18n.language === "en-US" ? `Converted: ${result.fileName}` : `转换完成：${result.fileName}`, "success");
  } catch (error) {
    setBatchResult(index, { status: "error", progress: 0, detail: error.message || (i18n.language === "en-US" ? "Unknown error" : "未知错误") });
    setStatus(i18n.language === "en-US" ? `Conversion failed: ${error.message || "Unknown error"}` : `转换失败：${error.message || "未知错误"}`, "error");
  } finally {
    state.isConverting = false;
    renderBatchList();
  }
}

async function convertQueueFiles() {
  if (!state.files.length || state.isConverting) return;
  state.isConverting = true;
  renderBatchList();
  const pendingIndices = state.files.map((_, index) => index)
    .filter((index) => queueConversionPlan(index).kind !== "skip");
  if (!await ensureOutputSpace(pendingIndices)) {
    state.isConverting = false;
    renderBatchList();
    return;
  }
  let successCount = 0;
  let skippedCount = 0;
  let failCount = 0;
  for (let index = 0; index < state.files.length; index += 1) {
    const file = state.files[index];
    const target = targetForIndex(index);
    if (!target) {
      failCount += 1;
      setBatchResult(index, { status: "error", detail: i18n.language === "en-US" ? "No target format" : "没有目标格式" });
      continue;
    }
    const plan = queueConversionPlan(index);
    if (plan.kind === "skip") {
      skippedCount += 1;
      setBatchResult(index, { status: "skipped", progress: 100, detail: plan.text });
      continue;
    }
    setBatchResult(index, { status: "converting", progress: 0, detail: i18n.language === "en-US" ? `Converting to ${target.toUpperCase()}` : `正在转换为 ${target.toUpperCase()}` });
    try {
      const result = await convertOneFile(file, target, codecForIndex(index));
      successCount += 1;
      setBatchResult(index, { status: "success", progress: 100, detail: result.fileName, result });
    } catch (error) {
      failCount += 1;
      setBatchResult(index, { status: "error", progress: 0, detail: error.message || (i18n.language === "en-US" ? "Unknown error" : "未知错误") });
    }
  }
  const successful = state.batchResults.filter((item) => item.status === "success" && item.result);
  state.converted = successful.length === 1 ? successful[0].result : null;
  batchSaveButton.hidden = successful.length < 2;
  if (successful.length === 1) {
    downloadButton.hidden = true;
    previewButton.hidden = false;
  }
  state.isConverting = false;
  renderBatchList();
  setStatus(i18n.language === "en-US"
    ? `Queue complete: ${successCount} converted, ${skippedCount} skipped, ${failCount} failed.`
    : `队列转换完成：成功 ${successCount} 个，跳过 ${skippedCount} 个，失败 ${failCount} 个。`, failCount ? "error" : "success");
}

function syncVideoCodecField() {
  if (!videoCodecField || !videoCodec) return;
  videoCodecField.hidden = !["mp4", "mov", "mkv"].includes(targetSelect.value);
}

async function acceptFiles(fileList) {
  const supplied = [...(fileList || [])].filter((file) => file && file.size >= 0);
  const rejected = supplied.filter((file) => !isVideoFile(file));
  const incoming = supplied.filter((file) => isVideoFile(file));
  if (rejected.length) {
    setStatus(i18n.language === "en-US"
      ? "Only video files can be added. Images, audio, documents, and PDFs were ignored."
      : "本工具只支持视频文件，图片、音频、文档和 PDF 已忽略。", "error");
  }
  if (!incoming.length) {
    fileInput.value = "";
    return;
  }
  const existingKeys = new Set(state.files.map(taskKey));
  const files = incoming.filter((file) => !existingKeys.has(taskKey(file)));
  if (!files.length) {
    setStatus(i18n.language === "en-US" ? "These files are already in the queue." : "这些文件已经在队列中。", "");
    return;
  }
  const maxBatchBytes = state.capabilities?.limits?.maxBatchBytes || Number.MAX_SAFE_INTEGER;
  const totalBytes = [...state.files, ...files].reduce((sum, file) => sum + (file.size || 0), 0);
  if (!Number.isSafeInteger(totalBytes) || totalBytes > maxBatchBytes) {
    setStatus(i18n.language === "en-US"
      ? "This batch is too large for this computer. Convert the files in smaller batches."
      : "本批文件总大小超出当前电脑可处理范围，请分批转换。", "error");
    setMouseState("error");
    fileInput.value = "";
    return;
  }

  const hadExisting = state.files.length > 0;
  const startIndex = state.files.length;
  state.selectionVersion += 1;
  const selectionVersion = state.selectionVersion;
  state.files.push(...files);
  state.fileInfos.push(...files.map(() => null));
  state.batchResults.push(...files.map(() => ({ status: "pending", detail: "等待转换" })));
  files.forEach((file) => {
    const base = taskKey(file);
    const occurrence = state.taskIds.filter((id) => id.startsWith(`${base}::`)).length;
    state.taskIds.push(taskIdFor(file, occurrence));
  });
  // 文件夹名：来自 <input webkitdirectory> 或拖入文件夹时 File.webkitRelativePath。
  const firstRel = files.find((file) => file.webkitRelativePath);
  const folderName = firstRel ? firstRel.webkitRelativePath.split("/")[0] : "";
  if (folderName && folderName !== firstRel.webkitRelativePath) state.folderName = folderName;
  if (!hadExisting) {
    resetDownload();
    resetProgress();
    resetVideoInsight();
  }
  setMouseState(state.files.length > 1 ? "batch" : "analyzing");
  setWorkflowStep("analyze");
  updateQueueMode();
  const summary = summarizeFiles(state.files);
  fileName.textContent = summary.name;
  fileMeta.textContent = summary.meta;
  fileStrip.hidden = false;
  renderBatchList();

  targetSelect.disabled = true;
  convertButton.disabled = true;
  setSelectPlaceholder(targetSelect, "", t("target.analyzing"));
  setStatus(i18n.language === "en-US"
    ? `Analyzing ${files.length} new file(s)${hadExisting ? `; ${state.files.length} total in queue` : ""}...`
    : `正在分析新增 ${files.length} 个文件${hadExisting ? `，队列共 ${state.files.length} 个` : ""}...`);

  try {
    const infos = await Promise.all(files.map(loadTargets));
    if (selectionVersion !== state.selectionVersion) return;
    infos.forEach((info, offset) => {
      const index = startIndex + offset;
      state.fileInfos[index] = info;
      const id = state.taskIds[index];
      const allowed = allowedTargetsFor(info, state.files[index]);
      if (!state.queueTargets[id] && allowed.length) state.queueTargets[id] = allowed[0];
    });
    if (state.files.length === 1 && infos[0]?.category === "video") {
      void loadVideoInsight(state.files[0], selectionVersion);
    }
    for (let offset = 0; offset < files.length; offset += 1) {
      const index = startIndex + offset;
      if (isVideoFile(files[offset], infos[offset])) void loadQueueVideoInfo(files[offset], index, selectionVersion);
    }
    const allInfos = state.fileInfos.filter(Boolean);
    const targets = commonTargetsFrom(allInfos);
    targetSelect.replaceChildren();
    if (!targets.length) {
      setSelectPlaceholder(targetSelect, "", t("target.none"));
      setStatus(i18n.language === "en-US" ? "No common target format is available." : "队列中没有共同的目标格式。", "error");
      setMouseState("error");
      renderBatchList();
      return;
    }
    for (const target of targets) {
      const option = document.createElement("option");
      option.value = target;
      option.textContent = target.toUpperCase();
      targetSelect.append(option);
    }
    const rememberedTarget = preferredTarget(state.settings.targetBySource, state.files.map((file) => extensionOf(file.name)), targets);
    if (rememberedTarget) targetSelect.value = rememberedTarget;
    targetSelect.disabled = false;
    convertButton.disabled = false;
    syncVideoCodecField();
    setMouseState(state.files.length > 1 ? "batch" : "idle");
    setStatus(i18n.language === "en-US"
      ? `Queued ${state.files.length} file(s). Select an output per item and convert.`
      : `已加入 ${state.files.length} 个文件。请为每项选择目标格式后转换。`);
    setWorkflowStep("convert");
    renderBatchList();
  } catch (error) {
    if (selectionVersion !== state.selectionVersion) return;
    setStatus(i18n.language === "en-US" ? `Detection failed: ${error.message}` : `识别失败：${error.message}`, "error");
    setWorkflowStep("analyze");
    setMouseState("error");
  } finally {
    fileInput.value = "";
  }
}

async function loadQueueVideoInfo(file, index, selectionVersion) {
  try {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/media-info", { method: "POST", body: form });
    const result = await parseResponse(response);
    if (!response.ok) throw responseError(result, response.status);
    if (selectionVersion !== state.selectionVersion || state.files[index] !== file) return;
    state.fileInfos[index] = { ...(state.fileInfos[index] || {}), media: result.media || {}, thumbnailDataUrl: result.thumbnailDataUrl || "" };
    renderBatchList();
  } catch (error) {
    rendererLog("warn", `视频信息读取失败: ${file?.name || "unknown"}`, error);
    // 缩略图/媒体信息失败不能阻断转换队列，文件本身仍保持可转换。
  }
}
async function parseResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function responseErrorMessage(result, status) {
  const localized = i18n.language === "en-US" ? result?.messages?.enUS : result?.messages?.zhCN;
  return localized || result?.error || (i18n.language === "en-US" ? `Server returned ${status}` : `服务器返回 ${status}`);
}

function responseError(result, status) {
  const errorCode = result?.errorCode ? String(result.errorCode) : "";
  const message = responseErrorMessage(result, status);
  const error = new Error(errorCode ? `${message} [${errorCode}]` : message);
  error.errorCode = errorCode;
  return error;
}

function localizedWarnings(result) {
  return (Array.isArray(result?.warnings) ? result.warnings : []).map((warning) => {
    const localized = i18n.language === "en-US" ? warning?.messages?.enUS : warning?.messages?.zhCN;
    return localized || warning?.code || "";
  }).filter(Boolean);
}

async function convertOneFile(file, targetFormat, codecOverride = "") {
  if (!VIDEO_QUEUE_TARGETS.includes(targetFormat)) throw new Error("目标格式只支持 MP4、MKV、WEBM 或 GIF。");
  const form = new FormData();
  form.append("file", file);
  form.append("targetFormat", targetFormat);
  if (["mp4", "mkv"].includes(targetFormat)) {
    form.append("videoCodec", codecOverride || videoCodec?.value || "auto");
  }

  const response = await fetch("/api/convert", {
    method: "POST",
    body: form
  });
  const result = await parseResponse(response);

  if (!response.ok) {
    throw responseError(result, response.status);
  }
  return result;
}

async function convertCurrentFiles() {
  if (!state.files.length || state.isConverting) return;
  await convertQueueFiles();
}

async function saveResult(result) {
  if (!result) return;

  if (window.flyingMouseFormat?.saveConvertedFile) {
    setStatus(`正在保存 ${result.fileName} 到所选目录…`);
    const saved = await window.flyingMouseFormat.saveConvertedFile({
      downloadUrl: result.downloadUrl,
      fileName: result.fileName,
      assets: Array.isArray(result.assets) ? result.assets : undefined
    });
    if (saved?.canceled) {
      setStatus(i18n.language === "en-US" ? `Converted: ${result.fileName}. Not saved yet.` : `转换完成：${result.fileName}。尚未保存。`, "success");
      return saved;
    }
    result.savedPath = saved.filePath;
    renderBatchList();
    setStatus(i18n.language === "en-US" ? `Saved to: ${saved.filePath}` : `已保存到：${saved.filePath}`, "success");
    return saved;
  }

  const link = document.createElement("a");
  link.href = result.downloadUrl;
  link.download = result.fileName;
  link.click();
  return { canceled: false };
}

function showOutputDirectory(directory) {
  state.outputDirectory = String(directory || "");
  if (!outputDirectoryPath) return;
  outputDirectoryPath.textContent = state.outputDirectory || "未选择保存目录";
  outputDirectoryPath.title = state.outputDirectory;
}

async function loadOutputDirectory() {
  if (typeof logBridge.getOutputDirectory !== "function") {
    showOutputDirectory("浏览器下载目录");
    return;
  }
  const result = await logBridge.getOutputDirectory();
  showOutputDirectory(result?.directory);
}

async function chooseOutputDirectory() {
  if (typeof logBridge.chooseOutputDirectory !== "function") return;
  outputDirectoryButton.disabled = true;
  try {
    const result = await logBridge.chooseOutputDirectory();
    if (!result?.canceled) showOutputDirectory(result.directory);
  } catch (error) {
    setStatus(`选择保存目录失败：${error.message || "未知错误"}`, "error");
  } finally {
    outputDirectoryButton.disabled = false;
  }
}

function previewFallback(result, message) {
  const wrapper = document.createElement("div");
  wrapper.className = "preview-fallback";
  wrapper.append(
    createTextElement("p", "preview-fallback-name", result.fileName),
    createTextElement("p", "", message),
    createTextElement("p", "preview-fallback-meta", `${result.mimeType || "application/octet-stream"} · ${formatSize(result.previewSize || 0)}`)
  );
  previewContent.replaceChildren(wrapper);
}

async function renderPreview(result) {
  previewTitle.textContent = result.fileName || t("preview.title");
  previewMeta.textContent = `${result.mimeType || "application/octet-stream"} · ${formatSize(result.previewSize || 0)}`;
  previewContent.replaceChildren(createTextElement("p", "preview-loading", t("preview.loading")));
  const previewKind = result.previewKind;
  if (!result.previewUrl || previewKind === "unsupported") {
    previewFallback(result, t("preview.unsupported"));
    return;
  }
  if (previewKind === "image") {
    const image = document.createElement("img");
    image.className = "preview-image";
    image.alt = result.fileName;
    image.src = result.previewUrl;
    previewContent.replaceChildren(image);
    return;
  }
  if (previewKind === "video") {
    const media = document.createElement("video");
    media.className = "preview-video";
    media.controls = true;
    media.preload = "metadata";
    media.src = result.previewUrl;
    previewContent.replaceChildren(media);
    return;
  }
  previewFallback(result, t("preview.unsupported"));
}

async function openPreview(result, opener) {
  if (!result) return;
  state.previewResult = result;
  state.previewOpener = opener || document.activeElement;
  previewDrawer.hidden = false;
  previewBackdrop.hidden = false;
  document.body.classList.add("preview-open");
  previewClose.focus();
  try {
    await renderPreview(result);
  } catch (error) {
    previewFallback(result, t("preview.failed", { message: error.message || "unknown" }));
  }
}

function closePreview() {
  if (!previewDrawer || previewDrawer.hidden) return;
  previewDrawer.hidden = true;
  previewBackdrop.hidden = true;
  previewContent.replaceChildren();
  document.body.classList.remove("preview-open");
  const opener = state.previewOpener;
  state.previewResult = null;
  state.previewOpener = null;
  if (opener && document.contains(opener)) opener.focus();
}

async function saveConvertedFile(event) {
  if (!state.converted) return;
  event.preventDefault();

  try {
    await saveResult(state.converted);
  } catch (error) {
    setStatus(i18n.language === "en-US" ? `Save failed: ${error.message || "Unknown error"}` : `保存失败：${error.message || "未知错误"}`, "error");
  }
}

async function saveAllConvertedFiles() {
  const results = state.batchResults
    .filter((item) => item.status === "success" && item.result)
    .map((item) => item.result);
  if (!results.length) return;

  try {
    if (window.flyingMouseFormat?.saveConvertedFiles) {
      setStatus(`正在保存 ${results.length} 个文件到所选目录…`);
      const saved = await window.flyingMouseFormat.saveConvertedFiles({ files: results });
      if (saved?.canceled) {
        setStatus(i18n.language === "en-US" ? `${results.length} files converted. Not saved yet.` : `已转换 ${results.length} 个文件，尚未保存。`, "success");
        return;
      }
      const failList = Array.isArray(saved?.failed) ? saved.failed : [];
      const savedEntries = Array.isArray(saved?.entries) ? saved.entries : [];
      for (const entry of savedEntries) {
        const item = state.batchResults.find((candidate) => candidate.status === "success"
          && candidate.result?.fileName === entry.fileName
          && !candidate.result.savedPath);
        if (item?.result) item.result.savedPath = entry.filePath;
      }
      batchSaveButton.hidden = state.batchResults
        .filter((item) => item.status === "success" && item.result)
        .every((item) => item.result.savedPath);
      renderBatchList();
      if (failList.length) {
        const names = failList.map((f) => f.name).join("、");
        setStatus(i18n.language === "en-US"
          ? `Saved ${saved.savedCount}; ${failList.length} failed (${names}). ${failList[0].reason}`
          : `已保存 ${saved.savedCount} 个，失败 ${failList.length} 个（${names}）。${failList[0].reason}`, "error");
      } else {
        setStatus(i18n.language === "en-US" ? `Saved ${saved.savedCount} files to: ${saved.directory}` : `已保存 ${saved.savedCount} 个文件到：${saved.directory}`, "success");
      }
      return;
    }

    for (const result of results) {
      const link = document.createElement("a");
      link.href = result.downloadUrl;
      link.download = result.fileName;
      link.click();
    }
  } catch (error) {
    setStatus(i18n.language === "en-US" ? `Save all failed: ${error.message || "Unknown error"}` : `保存全部失败：${error.message || "未知错误"}`, "error");
  }
}

dropZone.addEventListener("click", () => fileInput.click());
if (addFilesButton) addFilesButton.addEventListener("click", () => fileInput.click());

dropPanel.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  dropPanel.classList.add("dragging");
  setMouseState("upload");
});

dropPanel.addEventListener("dragleave", (event) => {
  if (event.relatedTarget && dropPanel.contains(event.relatedTarget)) return;
  dropPanel.classList.remove("dragging");
  setMouseState(state.files.length > 1 ? "batch" : state.files.length ? "idle" : "upload");
});

dropPanel.addEventListener("drop", async (event) => {
  event.preventDefault();
  event.stopPropagation();
  dropPanel.classList.remove("dragging");
  // 支持拖入文件夹：遍历 items 用 webkitGetAsEntry 递归收集文件，
  // 并把文件夹名记录到 state.folderName（用于图片合并 PDF 命名）。
  const items = [...(event.dataTransfer?.items || [])];
  const entries = items.map((item) => item.webkitGetAsEntry && item.webkitGetAsEntry()).filter(Boolean);
  const hasDirectory = entries.some((entry) => entry?.isDirectory);
  if (hasDirectory) {
    const collected = [];
    let firstDirName = "";
    for (const entry of entries) {
      await collectEntryFiles(entry, collected, (dirName) => { firstDirName = firstDirName || dirName; });
    }
    if (collected.length) {
      state.folderName = firstDirName || "";
      acceptFiles(collected);
      return;
    }
  }
  acceptFiles(event.dataTransfer.files);
});

// 递归收集文件夹/文件条目（webkitGetAsEntry），onDirName 回调首个目录名。
async function collectEntryFiles(entry, collected, onDirName) {
  if (!entry) return;
  if (entry.isFile) {
    const file = await new Promise((resolve) => entry.file(resolve));
    if (file) collected.push(file);
    return;
  }
  if (entry.isDirectory) {
    if (onDirName) onDirName(entry.name);
    const reader = entry.createReader();
    let batch = await new Promise((resolve) => reader.readEntries(resolve));
    // readEntries 可能分批返回，循环读到空
    while (batch && batch.length) {
      for (const child of batch) await collectEntryFiles(child, collected, onDirName);
      batch = await new Promise((resolve) => reader.readEntries(resolve));
    }
  }
}

fileInput.addEventListener("change", () => {
  acceptFiles(fileInput.files);
});

batchList.addEventListener("click", async (event) => {
  const removeButton = event.target.closest("[data-remove]");
  if (removeButton) {
    removeQueueItem(Number(removeButton.dataset.remove));
    return;
  }
  const convertOneButton = event.target.closest("[data-convert-one]");
  if (convertOneButton) {
    await convertQueueItem(Number(convertOneButton.dataset.convertOne));
    return;
  }
  const previewAction = event.target.closest("[data-preview-index]");
  if (previewAction) {
    const result = state.batchResults[Number(previewAction.dataset.previewIndex)]?.result;
    await openPreview(result, previewAction);
    return;
  }
  const savedAction = [
    ["[data-open-saved-index]", "openSavedFile", "openSavedIndex"],
    ["[data-reveal-saved-index]", "showSavedFile", "revealSavedIndex"],
    ["[data-copy-saved-index]", "copySavedFilePath", "copySavedIndex"]
  ].map(([selector, method, datasetKey]) => ({ button: event.target.closest(selector), method, datasetKey }))
    .find((item) => item.button);
  if (savedAction) {
    const index = Number(savedAction.button.dataset[savedAction.datasetKey]);
    const result = state.batchResults[index]?.result;
    if (!result?.savedPath || typeof logBridge[savedAction.method] !== "function") return;
    try {
      await logBridge[savedAction.method](result.savedPath);
      if (savedAction.method === "copySavedFilePath") setStatus(`已复制路径：${result.savedPath}`, "success");
    } catch (error) {
      setStatus(`操作失败：${error.message || "未知错误"}`, "error");
    }
    return;
  }
  const button = event.target.closest("[data-save-index]");
  if (!button) return;
  const index = Number(button.dataset.saveIndex);
  const result = state.batchResults[index]?.result;
  try {
    await saveResult(result);
  } catch (error) {
  setStatus(`保存失败：${error.message || "未知错误"}`, "error");
  }
});

batchList.addEventListener("change", (event) => {
  const codecSelect = event.target.closest("[data-codec-index]");
  if (codecSelect) {
    setTaskCodec(Number(codecSelect.dataset.codecIndex), codecSelect.value);
    return;
  }
  const select = event.target.closest("[data-target-index]");
  if (!select) return;
  setTaskTarget(Number(select.dataset.targetIndex), select.value);
});

clearButton.addEventListener("click", clearFile);
convertButton.addEventListener("click", convertCurrentFiles);
quickConvertButton?.addEventListener("click", convertCurrentFiles);
outputDirectoryButton?.addEventListener("click", chooseOutputDirectory);
targetSelect.addEventListener("change", async () => {
  syncVideoCodecField();
  renderBatchList();
  const targetBySource = rememberTarget(
    state.settings.targetBySource,
    state.files.map((file) => extensionOf(file.name)),
    targetSelect.value
  );
  if (typeof logBridge.updateSettings === "function") {
    state.settings = await logBridge.updateSettings({ targetBySource });
  } else {
    state.settings.targetBySource = targetBySource;
  }
});
downloadButton.addEventListener("click", saveConvertedFile);
batchSaveButton.addEventListener("click", saveAllConvertedFiles);
previewButton.addEventListener("click", () => openPreview(state.converted, previewButton));
previewClose.addEventListener("click", closePreview);
previewBackdrop.addEventListener("click", closePreview);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !previewDrawer.hidden) closePreview();
});
async function initializeDurableSettings() {
  const legacy = {
    targetBySource: readPreferences(localStorage),
    language: (() => {
      try { return localStorage.getItem(LANGUAGE_STORAGE_KEY); } catch { return null; }
    })()
  };
  if (typeof logBridge.migrateLegacySettings === "function") {
    state.settings = await logBridge.migrateLegacySettings(legacy);
    try {
      localStorage.removeItem(LEGACY_TARGET_STORAGE_KEY);
      localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    } catch {
      // A blocked origin store must not prevent startup after main settings load.
    }
  } else if (typeof logBridge.getSettings === "function") {
    state.settings = await logBridge.getSettings();
  } else {
    state.settings.targetBySource = legacy.targetBySource;
  }
  i18n.setLanguage("zh-CN", { persist: false });
}

async function initializeApp() {
  await initializeDurableSettings();
  applyStaticTranslations();
  await loadOutputDirectory();
  updateQueueMode();
  setMouseState("upload");
  setWorkflowStep("select");
  await fetchCapabilities();
}

initializeApp().catch((error) => {
  setMouseState("error");
  setStatus(error.message, "error");
  rendererLog("error", "能力检测失败", error);
});

