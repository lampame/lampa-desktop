// modules/ipcHandlers/mpvHandlers.js
// IPC handlers for system mpv (see src/modules/mpvManager.js)
const { ipcMain, dialog } = require("electron");
const mpvManager = require("../mpvManager");

function registerMpvHandlers(getMainWindow) {
  ipcMain.handle("mpv-play", async (event, params) => {
    try {
      return await mpvManager.play(params || {});
    } catch (err) {
      console.error("❌ [mpv] mpv-play:", err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("mpv-playlist", async (event, list) => {
    try {
      return mpvManager.setPlaylist(list || []);
    } catch (err) {
      console.error("❌ [mpv] mpv-playlist:", err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("mpv-play-at", async (event, index) => {
    try {
      return mpvManager.playAt(index);
    } catch (err) {
      console.error("❌ [mpv] mpv-play-at:", err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("mpv-seek", async (event, sec) => {
    try {
      return mpvManager.seek(sec);
    } catch (err) {
      console.error("❌ [mpv] mpv-seek:", err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("mpv-stop", async () => {
    try {
      return await mpvManager.stop();
    } catch (err) {
      console.error("❌ [mpv] mpv-stop:", err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("mpv-status", async () => {
    try {
      return { success: true, ...mpvManager.getStatus() };
    } catch (err) {
      console.error("❌ [mpv] mpv-status:", err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("mpv-get-path", async () => {
    try {
      return { success: true, ...mpvManager.getPathInfo() };
    } catch (err) {
      console.error("❌ [mpv] mpv-get-path:", err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("mpv-set-path", async (event, customPath) => {
    try {
      // Empty string = reset to auto-detect
      if (typeof customPath !== "string" || customPath.trim() === "") {
        return { success: true, ...mpvManager.resetCustomPath() };
      }
      return { success: true, ...mpvManager.setCustomPath(customPath) };
    } catch (err) {
      console.error("❌ [mpv] mpv-set-path:", err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("mpv-get-uosc", async () => {
    try {
      return { success: true, ...(await mpvManager.getUoscInfo()) };
    } catch (err) {
      console.error("❌ [mpv] mpv-get-uosc:", err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("mpv-set-uosc", async (event, enabled) => {
    try {
      return { success: true, ...(await mpvManager.setUoscEnabled(enabled)) };
    } catch (err) {
      console.error("❌ [mpv] mpv-set-uosc:", err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("mpv-get-fullscreen", async () => {
    try {
      const store = require("../storeManager");
      return { success: true, enabled: Boolean(store.get("mpvFullscreen", true)) };
    } catch (err) {
      console.error("❌ [mpv] mpv-get-fullscreen:", err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("mpv-set-fullscreen", async (event, enabled) => {
    try {
      const store = require("../storeManager");
      store.set("mpvFullscreen", Boolean(enabled));
      console.log(`🔄 [mpv] fullscreen ${enabled ? "enabled" : "disabled"} (applies to next launch)`);
      return { success: true, enabled: Boolean(enabled) };
    } catch (err) {
      console.error("❌ [mpv] mpv-set-fullscreen:", err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("mpv-select-path-dialog", async () => {
    try {
      const mainWindow = getMainWindow ? getMainWindow() : null;
      const result = await dialog.showOpenDialog(mainWindow, {
        title: "Select the mpv executable",
        properties: ["openFile"],
      });
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }
      const selected = result.filePaths[0];
      return { success: true, ...mpvManager.setCustomPath(selected) };
    } catch (err) {
      console.error("❌ [mpv] mpv-select-path-dialog:", err.message);
      return { success: false, error: err.message };
    }
  });
}

module.exports = registerMpvHandlers;
