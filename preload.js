const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("videoConverter", {
  getSettings() {
    return ipcRenderer.invoke("get-settings");
  },
  updateSettings(patch) {
    return ipcRenderer.invoke("update-settings", patch);
  },
  migrateLegacySettings(legacy) {
    return ipcRenderer.invoke("migrate-legacy-settings", legacy);
  },
  exportDiagnostics() {
    return ipcRenderer.invoke("export-diagnostics");
  },
  inspectAgentSkillTargets() {
    return ipcRenderer.invoke("inspect-agent-skill-targets");
  },
  installAgentSkill(payload) {
    return ipcRenderer.invoke("install-agent-skill", payload);
  },
  getOutputDirectory() {
    return ipcRenderer.invoke("get-output-directory");
  },
  chooseOutputDirectory() {
    return ipcRenderer.invoke("choose-output-directory");
  },
  checkOutputSpace(payload) {
    return ipcRenderer.invoke("check-output-space", payload);
  },
  saveConvertedFile(payload) {
    return ipcRenderer.invoke("save-converted-file", payload);
  },
  saveConvertedFiles(payload) {
    return ipcRenderer.invoke("save-converted-files", payload);
  },
  openSavedFile(filePath) {
    return ipcRenderer.invoke("open-saved-file", filePath);
  },
  showSavedFile(filePath) {
    return ipcRenderer.invoke("show-saved-file", filePath);
  },
  copySavedFilePath(filePath) {
    return ipcRenderer.invoke("copy-saved-file-path", filePath);
  },
  log(level, message) {
    return ipcRenderer.invoke("log-event", { level, message });
  },
  getAppVersion() {
    return ipcRenderer.invoke("get-app-version");
  }
});
