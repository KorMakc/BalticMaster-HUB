const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    title: 'Baltic Master Zen',
    backgroundColor: '#0f172a', // Slate-900 background matching the theme
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  const userDataPath = app.getPath('userData');
  const updatedHtmlPath = path.join(userDataPath, 'baltic_master_zen.html');
  if (fs.existsSync(updatedHtmlPath)) {
    console.log('Loading updated HTML from userData:', updatedHtmlPath);
    mainWindow.loadFile(updatedHtmlPath);
  } else {
    console.log('Loading bundled HTML:', path.join(__dirname, 'baltic_master_zen.html'));
    mainWindow.loadFile(path.join(__dirname, 'baltic_master_zen.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in user's default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

ipcMain.on('reload-window', () => {
  if (mainWindow) {
    mainWindow.reload();
  }
});

ipcMain.handle('save-app-html', async (event, htmlContent) => {
  try {
    const userDataPath = app.getPath('userData');
    const updatedHtmlPath = path.join(userDataPath, 'baltic_master_zen.html');
    fs.writeFileSync(updatedHtmlPath, htmlContent, 'utf8');
    console.log('Successfully saved updated HTML to:', updatedHtmlPath);
    return true;
  } catch (err) {
    console.error('Failed to save updated HTML:', err);
    return false;
  }
});

function createMenu() {
  const template = [
    {
      label: 'Baltic Master Zen',
      submenu: [
        { role: 'about', label: 'О программе' },
        { type: 'separator' },
        {
          label: 'Сбросить обновление (Очистить кэш)',
          click: async () => {
            const fs = require('fs');
            const path = require('path');
            try {
              const userDataPath = app.getPath('userData');
              const updatedHtmlPath = path.join(userDataPath, 'baltic_master_zen.html');
              if (fs.existsSync(updatedHtmlPath)) {
                fs.unlinkSync(updatedHtmlPath);
                console.log('Cleared updated HTML file.');
              }
              app.relaunch();
              app.exit(0);
            } catch (err) {
              console.error('Failed to clear update:', err);
            }
          }
        },
        { type: 'separator' },
        { role: 'services', label: 'Службы' },
        { type: 'separator' },
        { role: 'hide', label: 'Скрыть' },
        { role: 'hideOthers', label: 'Скрыть остальные' },
        { role: 'unhide', label: 'Показать все' },
        { type: 'separator' },
        { role: 'quit', label: 'Выйти из программы' }
      ]
    },
    {
      label: 'Правка',
      submenu: [
        { role: 'undo', label: 'Отменить' },
        { role: 'redo', label: 'Повторить' },
        { type: 'separator' },
        { role: 'cut', label: 'Вырезать' },
        { role: 'copy', label: 'Копировать' },
        { role: 'paste', label: 'Вставить' },
        { role: 'selectAll', label: 'Выделить всё' }
      ]
    },
    {
      label: 'Вид',
      submenu: [
        { role: 'reload', label: 'Перезагрузить страницу' },
        { role: 'forceReload', label: 'Принудительная перезагрузка' },
        { role: 'toggleDevTools', label: 'Инструменты разработчика (DevTools)' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Сбросить масштаб' },
        { role: 'zoomIn', label: 'Увеличить масштаб' },
        { role: 'zoomOut', label: 'Уменьшить масштаб' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Полноэкранный режим' }
      ]
    },
    {
      label: 'Окно',
      submenu: [
        { role: 'minimize', label: 'Свернуть' },
        { role: 'zoom', label: 'Масштабировать' },
        { type: 'separator' },
        { role: 'front', label: 'Все окна на передний план' }
      ]
    },
    {
      label: 'Контакты & Сервис',
      submenu: [
        {
          label: 'Официальный сайт',
          click: async () => {
            await shell.openExternal('https://balticmaster.ru');
          }
        },
        {
          label: 'Вызов мастера: +7 (921) 957-27-65',
          click: async () => {
            await shell.openExternal('tel:+79219572765');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  createMenu();
  createWindow();

  app.on('activate', () => {
    if (mainWindow === null) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
