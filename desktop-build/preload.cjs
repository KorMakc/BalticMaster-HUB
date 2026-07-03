const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  updateAppHTML: async (htmlContent) => {
    try {
      const success = await ipcRenderer.invoke('save-app-html', htmlContent);
      if (success) {
        ipcRenderer.send('reload-window');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error in updateAppHTML bridge:', error);
      return false;
    }
  }
});
