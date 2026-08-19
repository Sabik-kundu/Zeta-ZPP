// ============================================================
//  ZETA++ Electron Host  —  main.js
//  Opens a frameless native window and lets gui.zl control it
//  via IPC from the renderer process.
// ============================================================
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// The .zpp file is passed as the last argument:
//   electron main.js /full/path/to/script.zpp
const zppFile = process.argv[process.argv.length - 1];

let win = null;

app.whenReady().then(() => {
  win = new BrowserWindow({
    // Start with a sensible default — gui.zl will resize via IPC
    width  : 800,
    height : 600,

    // Frameless = no OS titlebar. gui.zl draws its own.
    frame       : false,
    transparent : false,
    resizable   : true,

    // Centre on screen
    center: true,

    backgroundColor: '#1e1e2e',

    webPreferences: {
      nodeIntegration   : true,
      contextIsolation  : false,
      // Pass the .zpp path into the renderer
      additionalArguments: ['--zpp=' + zppFile],
    },
  });

  win.loadFile(path.join(__dirname, 'index.html'));

  // Uncomment to open DevTools for debugging:
  // win.webContents.openDevTools();
});

app.on('window-all-closed', () => app.quit());

// ── IPC handlers (called by gui.zl browser mode) ─────────────

ipcMain.on('win-close',    ()        => win && win.close());
ipcMain.on('win-minimize', ()        => win && win.minimize());
ipcMain.on('win-maximize', ()        => {
  if (!win) return;
  win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.on('win-set-size', (_, w, h) => {
  if (!win) return;
  // Add 32px for the gui.zl titlebar height
  win.setSize(Math.round(w), Math.round(h));
  win.center();
});
ipcMain.on('win-set-title', (_, t)   => win && win.setTitle(String(t)));
ipcMain.on('win-move',      (_, x, y)=> win && win.setPosition(Math.round(x), Math.round(y)));