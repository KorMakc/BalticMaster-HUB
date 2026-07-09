import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { createRequire } from "module";
import { ZipArchive } from "archiver";

const require = createRequire(import.meta.url);
const JimpLib = require("jimp");
const Jimp = JimpLib.Jimp || JimpLib;

const workspaceRoot = process.cwd();
const buildDir = path.join(workspaceRoot, "desktop-build");

console.log("=== STARTING MACOS APP BUILD PROCESS ===");

// 1. Ensure the offline HTML is fresh
console.log("Step 1: Regenerating single-file offline HTML...");
const appUrlEnv = process.env.APP_URL ? `APP_URL="${process.env.APP_URL}" ` : "";
execSync(`${appUrlEnv}npx tsx generate-single-html.js`, { stdio: "inherit" });

const offlineHtmlPath = path.join(workspaceRoot, "baltic_master_zen.html");
if (!fs.existsSync(offlineHtmlPath)) {
  console.error("Error: baltic_master_zen.html was not generated.");
  process.exit(1);
}

// 2. Create the desktop-build directory
console.log("Step 2: Preparing build directories...");
if (fs.existsSync(buildDir)) {
  fs.rmSync(buildDir, { recursive: true, force: true });
}
fs.mkdirSync(buildDir, { recursive: true });
fs.mkdirSync(path.join(buildDir, "build"), { recursive: true });

// 3. Copy baltic_master_zen.html to build folder
fs.copyFileSync(offlineHtmlPath, path.join(buildDir, "baltic_master_zen.html"));
console.log("Copied baltic_master_zen.html to desktop-build/");

// 4. Find the generated icon and convert it to PNG format
const iconSource = path.join(workspaceRoot, "src/assets/images/mac_app_icon_1782714607199.jpg");
if (fs.existsSync(iconSource)) {
  console.log("Converting JPG icon to PNG format using Jimp...");
  try {
    const image = await Jimp.read(iconSource);
    const dest1 = path.join(buildDir, "build", "icon.png");
    const dest2 = path.join(buildDir, "icon.png");
    
    if (typeof image.writeAsync === "function") {
      await image.writeAsync(dest1);
      await image.writeAsync(dest2);
    } else {
      await image.write(dest1);
      await image.write(dest2);
    }
    console.log("Successfully converted and saved app icon as PNG!");
  } catch (err) {
    console.error("Jimp icon conversion failed. Falling back to copy.", err);
    fs.copyFileSync(iconSource, path.join(buildDir, "build", "icon.png"));
    fs.copyFileSync(iconSource, path.join(buildDir, "icon.png"));
  }
} else {
  console.log("Warning: Source app icon not found at", iconSource);
}

// 5. Create package.json for Electron
console.log("Step 3: Creating desktop package.json...");
const packageJson = {
  name: "baltic-master-zen",
  version: "2.9.0",
  description: "Baltic Master Zen - Автоматизация SEO и генерация контента",
  main: "main.cjs",
  author: "Baltic Master Service",
  private: true,
  build: {
    appId: "com.balticmaster.zen",
    productName: "Baltic Master Zen",
    electronVersion: "34.0.0",
    directories: {
      output: "dist"
    },
    mac: {
      target: ["dmg", "zip"],
      category: "public.app-category.productivity",
      icon: "icon.png"
    }
  }
};
fs.writeFileSync(path.join(buildDir, "package.json"), JSON.stringify(packageJson, null, 2));

// 6. Create main.cjs for Electron
console.log("Step 4: Creating Electron main process script...");
const mainCjsContent = `const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
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
`;
fs.writeFileSync(path.join(buildDir, "main.cjs"), mainCjsContent);

const preloadCjsContent = `const { contextBridge, ipcRenderer } = require('electron');

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
`;
fs.writeFileSync(path.join(buildDir, "preload.cjs"), preloadCjsContent);

// Helper function to zip a folder programmatically using archiver
function zipDirectory(sourceDir, outPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = new ZipArchive({
      zlib: { level: 9 } // Maximum compression
    });

    output.on("close", () => {
      console.log(`ZIP file successfully created! Total size: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`);
      resolve();
    });

    archive.on("warning", (err) => {
      if (err.code === "ENOENT") {
        console.warn("Archiver warning:", err);
      } else {
        reject(err);
      }
    });

    archive.on("error", (err) => {
      reject(err);
    });

    archive.pipe(output);

    // We add the .app folder itself into the zip, so when unzipped, it appears as "Baltic Master Zen.app"
    archive.directory(sourceDir, "Baltic Master Zen.app");

    archive.finalize();
  });
}

// 7. Run electron-packager targeting macOS Apple Silicon (arm64)
console.log("Step 5: Packaging application for macOS (arm64) using electron-packager...");
try {
  const packagerOutDir = path.join(buildDir, "dist");
  if (fs.existsSync(packagerOutDir)) {
    fs.rmSync(packagerOutDir, { recursive: true, force: true });
  }

  // Compile the app for macOS Apple Silicon
  execSync(
    `npx electron-packager "${buildDir}" "Baltic Master Zen" --platform=darwin --arch=arm64 --out="${packagerOutDir}" --overwrite --icon="${path.join(buildDir, "icon.png")}"`,
    { stdio: "inherit" }
  );

  console.log("Step 6: Creating ZIP archive for distribution...");

  // Create public release distribution folder if it doesn't exist
  const distPublicDir = path.join(workspaceRoot, "dist-mac");
  if (!fs.existsSync(distPublicDir)) {
    fs.mkdirSync(distPublicDir, { recursive: true });
  }

  const appFolder = path.join(packagerOutDir, "Baltic Master Zen-darwin-arm64", "Baltic Master Zen.app");
  const zipOutputPath = path.join(distPublicDir, "Baltic_Master_Zen_macOS_M4.zip");

  if (!fs.existsSync(appFolder)) {
    throw new Error(`Compiled application folder not found at: ${appFolder}`);
  }

  await zipDirectory(appFolder, zipOutputPath);

  // Generate local update.json manifest so it is always present after a new build
  console.log("Step 6.5: Generating local update.json manifest...");
  const updateInfo = {
    latestVersion: "2.9.0",
    minCompatibleVersion: "2.0.0",
    releaseDate: new Date().toISOString().split("T")[0],
    changelog: [
      "Комплексный аудит и оптимизация исходного кода: устранены мелкие дефекты рендеринга и защищены критические циклы обновления React",
      "Ускоренный двунаправленный механизм синхронизации с GitHub и раздачи обновлений OTA",
      "Интерактивные индикаторы статуса API и оптимизированное время ожидания для бесперебойной работы ИИ-модулей",
      "Полная поддержка раздельного скачивания macOS-архива для высокоскоростного развертывания"
    ],
    downloadUrl: "baltic_master_zen.html"
  };
  const jsonContent = JSON.stringify(updateInfo, null, 2);
  fs.writeFileSync(path.join(workspaceRoot, "update.json"), jsonContent, "utf8");
  fs.writeFileSync(path.join(distPublicDir, "update.json"), jsonContent, "utf8");
  console.log("Successfully created update.json in workspace root and dist-mac/!");

  // 8. Split the ZIP file into 24MB chunks for safe download through proxy limits
  console.log("Step 7: Splitting ZIP archive into 24MB chunks for safe downloading...");
  const chunkSize = 24 * 1024 * 1024; // 24MB
  const fileBuffer = fs.readFileSync(zipOutputPath);
  const totalBytes = fileBuffer.length;
  let chunkIndex = 0;

  // Remove any old chunks first
  const existingParts = fs.readdirSync(distPublicDir).filter(f => f.startsWith("Baltic_Master_Zen_macOS_M4.zip.part"));
  existingParts.forEach(f => {
    try {
      fs.unlinkSync(path.join(distPublicDir, f));
    } catch (e) {}
  });

  const suffixChars = "abcdefghijklmnopqrstuvwxyz";
  while (chunkIndex * chunkSize < totalBytes) {
    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, totalBytes);
    const chunk = fileBuffer.subarray(start, end);

    // Generate standard aa, ab, ac suffix
    const firstChar = suffixChars[Math.floor(chunkIndex / 26)];
    const secondChar = suffixChars[chunkIndex % 26];
    const partSuffix = firstChar + secondChar;

    const chunkPath = path.join(distPublicDir, `Baltic_Master_Zen_macOS_M4.zip.part${partSuffix}`);
    fs.writeFileSync(chunkPath, chunk);
    console.log(`Created chunk part${partSuffix} (${(chunk.length / 1024 / 1024).toFixed(2)} MB)`);
    chunkIndex++;
  }

  console.log("=== MACOS APP BUILD SUCCESSFUL ===");
  console.log(`Artifact generated: ${zipOutputPath} and its parts in /dist-mac/`);
} catch (err) {
  console.error("Error packaging macOS application:", err);
  process.exit(1);
}
