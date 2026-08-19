/* ══════════════════════════════════════════════════════════════════════════════
   worlib.zl  —  ZETA++ (ZPP) LOW-LEVEL RETRO GUI LIBRARY
   "Old-Windows-style chrome, Win32-flavored handle+function API."

   DESIGN NOTES
   ─────────────
   - Every public function name starts with wl_ (e.g. wl_CreateWindow).
   - Every public attribute on a handle starts with wl_ too (handle.wl_x,
     handle.wl_el, handle.wl_kind, ...). Fields starting with __ are private
     bookkeeping and are not part of the public API.
   - This is deliberately LOWER-LEVEL than gui.zl: instead of chainable
     objects with their own methods, worlib.zl uses free functions that take
     a handle as their first argument (Win32 CreateWindow/MoveWindow/
     SetWindowText style) — call wl_MoveWindow(win, x, y), not win.move(x,y).
   - Every function is safe to call outside a browser/Electron renderer: it
     will no-op and print a one-time console warning instead of crashing.
   - wl_SetStyle() is a deliberate raw-CSS escape hatch so nothing you want
     to build is ever blocked by a missing helper function.
   - Companion file worlib_structs.zpp defines real ZPP structs (wl_Point,
     wl_Size, wl_Rect, wl_Color) you can pass into most functions that take
     a position/size/color — or just pass plain numbers, both work.
   ══════════════════════════════════════════════════════════════════════════════ */

(function WorLib() {
'use strict';

const _isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

/* ── one-time warnings when called outside a browser/Electron renderer ── */
const _warned = {};
function _warn(fnName) {
  if (_warned[fnName]) return;
  _warned[fnName] = true;
  console.warn(
    '[worlib.zl] "' + fnName + '" called outside a browser/Electron renderer — it will no-op.\n' +
    '  ➜  Load worlib.js inside index.html (the renderer), not from Node/Electron main.'
  );
}
/* Guard clause used at the top of every DOM-touching function. Returns true
   (and warns) when the function should no-op. */
function _needsBrowser(fnName) {
  if (_isBrowser) return false;
  _warn(fnName);
  return true;
}

/* ══════════════════════════════════════════════════════════════════════════
   AUTO-RELAUNCH UNDER ELECTRON
   ─────────────────────────────
   worlib.zl is normally loaded inside an already-open renderer (index.html).
   This block makes that optional: if #import["worlib.zl"] happens with no
   DOM present at all, worlib relaunches the running program under a real
   Electron renderer for you, so the caller doesn't need its own Electron
   boilerplate.

   This is a SIMPLE, FULL-SCRIPT relaunch, not an IPC proxy: the entire
   program (from process.argv[1] / require.main) is re-run a second time
   inside the renderer. That means:
     - wl_ calls in the ORIGINAL (main-process) run stay safe no-ops, same
       as always — the REAL, interactive copy is the one in the renderer.
     - Anything that is NOT a wl_ call (console.log, file writes, network
       requests, etc.) WILL execute twice: once in the main-process copy,
       once in the renderer copy. If a side effect must only happen once,
       guard it yourself, e.g. `if (typeof window !== 'undefined') { ... }`.

   Two cases are handled:
     CASE 1 — plain `node script.js`: require('electron') resolves to a
       *string* (the path to the Electron binary) rather than the Electron
       API. We spawn `electron script.js` as a child process, inherit its
       stdio, and exit with its exit code.
     CASE 2 — already inside Electron's main process (launched directly via
       `electron script.js`, or by CASE 1's spawn above): require('electron')
       gives the real API object with `.app`/`.BrowserWindow`. We open a
       BrowserWindow pointed at a tiny generated index.html that simply
       re-requires the same entry script, this time in a real renderer
       (nodeIntegration on, so `require`/`process` are still available
       there too).
   ══════════════════════════════════════════════════════════════════════════ */
let _relaunchAttempted = false;
let _ipcWired = false;

function _tryElectronRelaunch() {
  if (_isBrowser) return false; /* already have a DOM, nothing to do */
  if (_relaunchAttempted) return true; /* only ever try once per process */
  if (typeof require !== 'function' || typeof process === 'undefined' ||
      !process.versions || !process.versions.node) {
    return false; /* not running under Node at all — can't relaunch */
  }
  _relaunchAttempted = true;

  let electron;
  try {
    electron = require('electron');
  } catch (e) {
    console.warn(
      '[worlib.zl] No DOM detected and Electron is not installed — GUI calls will no-op.\n' +
      '  ➜  npm install electron, then re-run, or load worlib.js inside an\n' +
      '     existing renderer\'s index.html.'
    );
    return false;
  }

  /* CASE 1: plain Node process — relaunch the whole thing under Electron. */
  if (typeof electron === 'string') {
    if (process.env.WORLIB_RELAUNCHED === '1') {
      console.warn(
        '[worlib.zl] Already relaunched once but still no Electron runtime — giving up.\n' +
        '  ➜  GUI calls will no-op for the rest of this run.'
      );
      return false;
    }
    const { spawnSync } = require('child_process');
    const entry = (require.main && require.main.filename) || process.argv[1];
    if (!entry) {
      console.warn('[worlib.zl] Could not determine the entry script to relaunch — GUI calls will no-op.');
      return false;
    }
    console.warn('[worlib.zl] No DOM detected — relaunching under Electron: ' + entry);
    const result = spawnSync(electron, [entry].concat(process.argv.slice(2)), {
      stdio: 'inherit',
      env: Object.assign({}, process.env, { WORLIB_RELAUNCHED: '1' }),
    });
    process.exit(result.status == null ? 1 : result.status);
    return true; /* unreachable — process.exit already tore us down */
  }

  /* CASE 2: already Electron's main process. */
  if (electron && electron.app) {
    const { app, BrowserWindow } = electron;
    const path = require('path');
    const os = require('os');
    const fs = require('fs');
    const entry = (require.main && require.main.filename) || process.argv[1];
    if (!entry) {
      console.warn('[worlib.zl] Could not determine the entry script to load in the renderer — GUI calls will no-op.');
      return false;
    }

    app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

    const launchWindow = () => {
      /* Kill Electron's own chrome entirely — no native title bar, no
         File/Edit/View menu bar. worlib draws its own Win9x-style window
         chrome (title bars, borders, buttons) inside the page, so the OS
         window itself should look like nothing more than a blank canvas,
         same as a native C/C++ desktop-shell app would. */
      try { electron.Menu.setApplicationMenu(null); } catch (_) {}

      const win = new BrowserWindow({
        width: 480, height: 360,   /* modest default — real app windows resize this to fit exactly */
        title: 'ZPP / worlib.zl',
        frame: false,          /* no native title bar / min-max-close buttons */
        backgroundColor: '#181825', /* dark desktop, avoids a white flash before content paints */
        show: false,           /* reveal only once positioned, avoids a flash/jump */
        center: true,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
          sandbox: false,
        },
      });

      win.once('ready-to-show', () => { win.show(); });

      /* frame:false also removes the Cmd+Q / menu-driven quit accelerator on
         macOS since there's no menu bar left to hang it off — wire up a
         plain keyboard fallback so the app can still be closed without a
         mouse. Ctrl/Cmd+Q closes just this window; worlib's own
         wl_OnWindowClose / close buttons handle everything else. */
      win.webContents.on('before-input-event', (event, input) => {
        const quitCombo = input.key.toLowerCase() === 'q' && (input.control || input.meta);
        if (quitCombo && input.type === 'keyDown') win.close();
      });

      /* ── real OS-level window control, driven over IPC ──────────────────
         window.resizeTo()/moveTo() called from the renderer are NOT a
         reliable way to actually minimize/maximize a window — they can be
         silently blocked by the platform/CSP, and there is no DOM API for
         "minimize" at all. That mismatch is what causes the div (drawn by
         worlib) and the real OS window to fall out of sync: the div claims
         to be maximized/hidden while the actual BrowserWindow never moved,
         leaving a blank host canvas behind, or a "window" that visually
         vanished without the OS window following it. Routing these through
         ipcMain, straight to the real BrowserWindow instance, makes the
         main process (which always has authority over the OS window) the
         single source of truth instead. */
      const { ipcMain } = electron;
      if (!_ipcWired) {
        _ipcWired = true;
        ipcMain.on('worlib:minimize', (event) => {
          const w = BrowserWindow.fromWebContents(event.sender);
          if (w && !w.isDestroyed()) w.minimize();
        });
        ipcMain.on('worlib:restore', (event) => {
          const w = BrowserWindow.fromWebContents(event.sender);
          if (w && !w.isDestroyed()) {
            if (w.isMinimized()) w.restore();
            w.show();
            w.focus();
          }
        });
        ipcMain.on('worlib:maximize', (event) => {
          const w = BrowserWindow.fromWebContents(event.sender);
          if (w && !w.isDestroyed()) w.maximize();
        });
        ipcMain.on('worlib:unmaximize', (event) => {
          const w = BrowserWindow.fromWebContents(event.sender);
          if (w && !w.isDestroyed()) w.unmaximize();
        });
      }
      /* Whenever the REAL window's bounds change (for any reason — our own
         maximize/unmaximize calls above, the user dragging an OS-level
         resize edge, a Windows/macOS keyboard shortcut, etc.) push the
         authoritative content size back down to the renderer so worlib can
         snap its maximized window div(s) to match exactly, instead of the
         renderer guessing at screen.availWidth/Height up front and hoping
         it lines up. */
      const _sendHostBounds = () => {
        if (win.isDestroyed()) return;
        const b = win.getContentBounds();
        win.webContents.send('worlib:host-bounds', {
          width: b.width, height: b.height, maximized: win.isMaximized(),
        });
      };
      win.on('resize', _sendHostBounds);
      win.on('maximize', _sendHostBounds);
      win.on('unmaximize', _sendHostBounds);
      win.on('restore', _sendHostBounds);

      const htmlPath = path.join(os.tmpdir(), 'worlib-' + process.pid + '.html');
      const html =
        '<!doctype html><html><head><meta charset="utf-8">' +
        '<title>ZPP / worlib.zl</title></head><body>' +
        '<script>try { require(' + JSON.stringify(entry) + '); } ' +
        'catch (e) { document.body.textContent = String((e && e.stack) || e); console.error(e); }</script>' +
        '</body></html>';
      fs.writeFileSync(htmlPath, html);
      win.loadFile(htmlPath);
      win.on('closed', () => { try { fs.unlinkSync(htmlPath); } catch (_) {} });
    };

    if (app.isReady()) {
      launchWindow();
    } else {
      app.whenReady().then(launchWindow);
    }
    return true;
  }

  console.warn('[worlib.zl] Unrecognized Electron environment — GUI calls will no-op.');
  return false;
}

/* ══════════════════════════════════════════════════════════════════════════
   THEME — dark, rounded, modern "native app" chrome
   ══════════════════════════════════════════════════════════════════════════ */
const WL_BG          = '#1e1e2e';   /* window body */
const WL_BG_DARK      = '#181825';
const WL_TITLEBAR     = '#1e1e2e';  /* flat, same as body — no gradient bar */
const WL_TITLEBAR_INACTIVE = '#1e1e2e';
const WL_FONT         = "'Cascadia Code','Fira Code','Consolas',monospace";
const WL_TEXT         = '#cdd6f4';
const WL_TITLE_TEXT   = '#89b4fa';
const WL_HILITE       = '#89b4fa';
const WL_BORDER       = '#313244';
const WL_RADIUS       = '10px';

function _bevel(el, mode) {
  /* Flat, borderless "native" look — kept as a no-op shim so every existing
     call site (_bevel(el, 'raised') etc.) still works without touching every
     control's code. Controls get their look from _applyCommonStyle /
     inline styles instead of a beveled 3D border now. */
  el.style.border = 'none';
}

function _applyCommonStyle(el) {
  el.style.fontFamily = WL_FONT;
  el.style.fontSize = '13px';
  el.style.color = WL_TEXT;
  el.style.boxSizing = 'border-box';
}

/* ══════════════════════════════════════════════════════════════════════════
   HANDLE — the shape returned by every wl_Create* function
   ══════════════════════════════════════════════════════════════════════════ */
let _zCounter = 15000;
function _nextZ() { return ++_zCounter; }

function _handle(kind, el) {
  return {
    wl_kind: kind,
    wl_el: el || null,
    wl_x: 0, wl_y: 0, wl_width: 0, wl_height: 0,
    wl_visible: true,
    wl_enabled: true,
    wl_parent: null,
    wl_children: [],
    __listeners: {},   /* event name -> [{fn, domFn}] for wl_Off bookkeeping */
    __private: {},      /* free-form internal bag (drag state, item lists, etc.) */
  };
}

function _isHandle(v) {
  return !!(v && typeof v === 'object' && typeof v.wl_kind === 'string');
}

/* Pull an {x,y} out of either two numbers or a wl_Point-like struct/object. */
function _pt(a, b) {
  if (a && typeof a === 'object' && 'x' in a) return { x: a.x, y: a.y };
  return { x: a || 0, y: b || 0 };
}
/* Pull a {w,h} out of either two numbers or a wl_Size-like struct/object. */
function _sz(a, b) {
  if (a && typeof a === 'object' && ('w' in a || 'width' in a)) {
    return { w: ('w' in a ? a.w : a.width), h: ('h' in a ? a.h : a.height) };
  }
  return { w: a || 0, h: b || 0 };
}
/* Turn a wl_Color-like struct/object, a CSS string, or nothing into a CSS
   color string. */
function _col(c, fallback) {
  if (c == null) return fallback;
  if (typeof c === 'string') return c;
  if (typeof c === 'object' && 'r' in c) {
    const a = ('a' in c && c.a != null) ? c.a : 1;
    return 'rgba(' + (c.r|0) + ',' + (c.g|0) + ',' + (c.b|0) + ',' + a + ')';
  }
  return fallback;
}

/* ══════════════════════════════════════════════════════════════════════════
   DESKTOP ROOT — every window mounts here
   ══════════════════════════════════════════════════════════════════════════ */
let _desktopEl = null;
function _desktop() {
  if (_desktopEl && document.body.contains(_desktopEl)) return _desktopEl;
  _desktopEl = document.createElement('div');
  _desktopEl.className = 'worlib-desktop';
  _desktopEl.style.cssText = [
    'position:fixed', 'inset:0', 'overflow:hidden',
    'pointer-events:none', 'z-index:14500',
  ].join(';');
  document.body.appendChild(_desktopEl);
  return _desktopEl;
}

let _allWindows = [];

/* window.resizeTo()/moveTo() are asynchronous under the hood (they go
   through an IPC round-trip to the main process), so a window that just
   maximized can briefly — or, if something else nudges the layout mid-
   flight, persistently — end up a different size than the div we set by
   hand. This listener is the fix: whenever the OS window's real size
   actually changes, snap every currently-maximized window's div to
   window.innerWidth/innerHeight (the one authoritative source of truth),
   instead of trusting whatever size we originally guessed at. */
let _maxSyncBound = false;
function _bindMaximizeSync() {
  if (_maxSyncBound || !_isBrowser) return;
  _maxSyncBound = true;
  window.addEventListener('resize', () => {
    const w = window.innerWidth, h = window.innerHeight;
    _allWindows.forEach(hh => {
      if (!hh || !hh.wl_el || hh.wl_visible === false) return;
      if (!hh.__private || !hh.__private.maximized) return;
      hh.wl_el.style.left = '0px';
      hh.wl_el.style.top = '0px';
      hh.wl_el.style.width = w + 'px';
      hh.wl_el.style.height = h + 'px';
      hh.wl_x = 0; hh.wl_y = 0; hh.wl_width = w; hh.wl_height = h;
    });
  });
}

function _visibleWindowCount() {
  return _allWindows.filter(h => h && h.wl_visible !== false).length;
}

/* Each window registers a small closure here that re-decides whether ITS
   titlebar should use native OS drag. Called any time the open/visible
   window set changes (create, close, show, hide). */
let _dragRegionRefreshers = [];
function _refreshAllDragRegions() {
  _dragRegionRefreshers.forEach(fn => { try { fn(); } catch (e) { /* ignore */ } });
}

/* When running as the auto-relaunched Electron renderer (not a plain
   browser tab), the host OS window can size itself to exactly fit
   worlib's own window(s) instead of staying a big empty canvas with a
   small app window floating in the middle of it. */
function _isElectronRenderer() {
  return typeof process !== 'undefined' && process.versions && !!process.versions.electron &&
    typeof window !== 'undefined';
}

/* ── renderer-side half of the real OS-window bridge (see ipcMain wiring
   in _tryElectronRelaunch above) ── */
let _ipcRenderer = null;
function _ipc() {
  if (_ipcRenderer !== null) return _ipcRenderer;
  if (!_isElectronRenderer()) { _ipcRenderer = false; return false; }
  try { _ipcRenderer = require('electron').ipcRenderer || false; }
  catch (e) { _ipcRenderer = false; }
  return _ipcRenderer;
}
function _hostMinimize()   { const ipc = _ipc(); if (ipc) ipc.send('worlib:minimize'); }
function _hostRestore()    { const ipc = _ipc(); if (ipc) ipc.send('worlib:restore'); }
function _hostMaximize()   { const ipc = _ipc(); if (ipc) ipc.send('worlib:maximize'); }
function _hostUnmaximize() { const ipc = _ipc(); if (ipc) ipc.send('worlib:unmaximize'); }

let _hostBridgeBound = false;
function _bindHostBridge() {
  const ipc = _ipc();
  if (!ipc || _hostBridgeBound) return;
  _hostBridgeBound = true;
  ipc.on('worlib:host-bounds', (event, bounds) => {
    /* This is the authoritative size of the real OS window — snap every
       currently-maximized worlib window div to it exactly. Fixes the
       "div says one size, real window is another" desync that
       window.resizeTo()-based guessing could leave behind. */
    _allWindows.forEach(hh => {
      if (!hh || !hh.wl_el || hh.wl_visible === false) return;
      if (!hh.__private || !hh.__private.maximized) return;
      hh.wl_el.style.left = '0px';
      hh.wl_el.style.top = '0px';
      hh.wl_el.style.width = bounds.width + 'px';
      hh.wl_el.style.height = bounds.height + 'px';
      hh.wl_x = 0; hh.wl_y = 0; hh.wl_width = bounds.width; hh.wl_height = bounds.height;
    });
  });
}

let _fitPending = false;
function _fitHostWindowToWindows() {
  if (!_isElectronRenderer()) return;
  if (_fitPending) return;
  _fitPending = true;
  /* Debounce to the next frame so a burst of window creates/moves during
     app startup only triggers one real resize. */
  requestAnimationFrame(() => {
    _fitPending = false;
    const visible = _allWindows.filter(h => h && h.wl_el && h.wl_visible !== false);
    if (!visible.length) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    visible.forEach(h => {
      minX = Math.min(minX, h.wl_x);
      minY = Math.min(minY, h.wl_y);
      maxX = Math.max(maxX, h.wl_x + h.wl_width);
      maxY = Math.max(maxY, h.wl_y + h.wl_height);
    });
    if (!isFinite(minX)) return;

    const pad = 0; /* host window bounds == app window bounds, exactly */
    const w = Math.max(200, Math.ceil(maxX - minX) + pad * 2);
    const h = Math.max(120, Math.ceil(maxY - minY) + pad * 2);

    /* Re-anchor every window so its position stays correct relative to the
       new, tightly-fit origin. */
    const dx = pad - minX, dy = pad - minY;
    if (dx || dy) {
      visible.forEach(hh => {
        hh.wl_x += dx; hh.wl_y += dy;
        hh.wl_el.style.left = hh.wl_x + 'px';
        hh.wl_el.style.top = hh.wl_y + 'px';
      });
    }

    try {
      window.resizeTo(w, h);
      const availW = (window.screen && window.screen.availWidth) || w;
      const availH = (window.screen && window.screen.availHeight) || h;
      window.moveTo(Math.max(0, Math.round((availW - w) / 2)), Math.max(0, Math.round((availH - h) / 2)));
    } catch (e) { /* some platforms/CSPs block resizeTo — degrade silently */ }
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   DRAGGING (shared by windows and anything else that wants it)
   ══════════════════════════════════════════════════════════════════════════ */
function _makeDraggable(handleEl, gripEl, onMove) {
  let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0, lastX = 0, lastY = 0;
  gripEl.addEventListener('mousedown', e => {
    dragging = true; sx = e.clientX; sy = e.clientY;
    const r = handleEl.getBoundingClientRect();
    ox = r.left; oy = r.top;
    lastX = e.clientX; lastY = e.clientY;
    e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const nx = ox + (e.clientX - sx);
    const ny = oy + (e.clientY - sy);
    /* dx/dy: incremental delta since the last mousemove tick — what you
       want for window.moveBy(); nx/ny stay the running total for callers
       that just reposition a div. */
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    onMove(nx, ny, dx, dy);
  });
  window.addEventListener('mouseup', () => { dragging = false; });
}

/* ══════════════════════════════════════════════════════════════════════════
   WINDOWS
   ══════════════════════════════════════════════════════════════════════════ */
function wl_CreateWindow(title, x, y, w, h) {
  if (_needsBrowser('wl_CreateWindow')) return _handle('window', null);

  const pos = _pt(x, y), size = _sz(w, h);
  const px = pos.x || 80, py = pos.y || 60;
  const pw = size.w || 480, ph = size.h || 340;

  const win = document.createElement('div');
  win.style.cssText = [
    'position:absolute', 'left:' + px + 'px', 'top:' + py + 'px',
    'width:' + pw + 'px', 'height:' + ph + 'px',
    'background:' + WL_BG, 'display:flex', 'flex-direction:column',
    'pointer-events:auto', 'box-shadow:0 8px 30px rgba(0,0,0,.55)',
    'border-radius:' + WL_RADIUS, 'overflow:hidden',
    'border:1px solid ' + WL_BORDER,
  ].join(';');
  _applyCommonStyle(win);
  win.style.zIndex = String(_nextZ());

  const bar = document.createElement('div');
  bar.style.cssText = [
    'height:38px', 'flex:0 0 auto', 'display:flex', 'align-items:center',
    'padding:0 10px 0 14px', 'background:' + WL_TITLEBAR, 'color:' + WL_TITLE_TEXT,
    'font-weight:bold', 'font-size:13px', 'cursor:default', 'user-select:none',
    'border-bottom:1px solid ' + WL_BORDER,
  ].join(';');
  const barTitle = document.createElement('div');
  barTitle.textContent = String(title || 'Untitled');
  barTitle.style.cssText = 'flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:' + WL_FONT + ';letter-spacing:.5px;';
  bar.appendChild(barTitle);

  function _sysBtn(glyph, opts) {
    opts = opts || {};
    const b = document.createElement('div');
    b.textContent = glyph;
    b.style.cssText = [
      'width:22px', 'height:22px', 'margin-left:6px',
      'color:' + (opts.color || '#a6adc8'), 'font-size:12px',
      'line-height:22px', 'text-align:center', 'cursor:pointer',
      'flex:0 0 auto', 'font-family:' + WL_FONT, 'border-radius:5px',
      'transition:background .1s ease,color .1s ease',
    ].join(';');
    b.addEventListener('mouseenter', () => {
      b.style.background = opts.hoverBg || 'rgba(255,255,255,.08)';
      if (opts.hoverColor) b.style.color = opts.hoverColor;
    });
    b.addEventListener('mouseleave', () => {
      b.style.background = 'transparent';
      b.style.color = opts.color || '#a6adc8';
    });
    return b;
  }
  const btnMin = _sysBtn('\u2013');
  const btnMax = _sysBtn('\u25A1');
  const btnClose = _sysBtn('\u2715', { hoverBg: '#f38ba8', hoverColor: '#1e1e2e' });
  [btnMin, btnMax, btnClose].forEach(b => b.style.setProperty('-webkit-app-region', 'no-drag'));
  bar.appendChild(btnMin); bar.appendChild(btnMax); bar.appendChild(btnClose);

  const body = document.createElement('div');
  body.style.cssText = [
    'position:relative', 'flex:1 1 auto', 'overflow:auto',
    'background:' + WL_BG,
  ].join(';');

  win.appendChild(bar);
  win.appendChild(body);
  _desktop().appendChild(win);

  const h_ = _handle('window', win);
  h_.wl_x = px; h_.wl_y = py; h_.wl_width = pw; h_.wl_height = ph;
  h_.__private.body = body;
  h_.__private.bar = bar;
  h_.__private.closeCallbacks = [];
  h_.__private.restoreRect = null;
  h_.__private.maximized = false;

  function raise() {
    win.style.zIndex = String(_nextZ());
  }
  win.addEventListener('mousedown', raise, true);

  /* With exactly one visible window in an Electron renderer, the host OS
     window is sized to fit it exactly (no margin) — so "dragging the
     window" IS dragging the real OS window. That's done with native CSS
     app-region dragging (Chromium/Electron move the OS window directly,
     no JS involved), NOT a hand-rolled mousemove + window.moveBy() loop:
     moving a window under a stationary cursor via moveBy() causes the
     browser to keep re-reporting mousemove at shifted coordinates, which
     feeds back into more moveBy() calls and runs away (this is what was
     making the window drift/grow to fill the screen). Native app-region
     drag has no such loop because the OS — not our script — owns the
     whole gesture. With multiple windows sharing one host, native drag
     would drag the entire host (all windows at once), so that case still
     falls back to the old div-drag + refit behavior below. */
  function _refreshDragRegion() {
    const native = _isElectronRenderer() && h_.wl_visible !== false && _visibleWindowCount() === 1;
    bar.style.setProperty('-webkit-app-region', native ? 'drag' : 'no-drag');
  }
  _dragRegionRefreshers.push(_refreshDragRegion);
  h_.__private._refreshDragRegion = _refreshDragRegion;

  let _dragFitTimer = null;
  _makeDraggable(win, bar, (nx, ny) => {
    if (_isElectronRenderer() && _visibleWindowCount() === 1) return; /* native drag owns this gesture */
    win.style.left = nx + 'px'; win.style.top = ny + 'px';
    h_.wl_x = nx; h_.wl_y = ny;
    clearTimeout(_dragFitTimer);
    _dragFitTimer = setTimeout(_fitHostWindowToWindows, 150);
  });
  btnMin.addEventListener('click', () => { wl_HideWindow(h_); });
  btnMax.addEventListener('click', () => {
    const electron = _isElectronRenderer();
    /* Only the single-visible-window case maps onto "maximize the real OS
       window" — with several worlib windows sharing one host, the host's
       size is governed by _fitHostWindowToWindows() instead, so maximize
       there stays a div-only resize against the screen's available area
       (unchanged from before). */
    const single = electron && _visibleWindowCount() === 1;
    if (h_.__private.maximized) {
      /* RESTORE */
      h_.__private.maximized = false;
      const r = h_.__private.restoreRect;
      if (single) {
        _hostUnmaximize(); /* real OS unmaximize; 'worlib:host-bounds' will confirm the size */
      } else if (electron && r) {
        try { window.resizeTo(r.osW, r.osH); window.moveTo(r.osX, r.osY); }
        catch (e) { /* platform blocked it — div still restores below */ }
      }
      if (r) {
        win.style.left = r.x + 'px'; win.style.top = r.y + 'px';
        win.style.width = r.w + 'px'; win.style.height = r.h + 'px';
        h_.wl_x = r.x; h_.wl_y = r.y; h_.wl_width = r.w; h_.wl_height = r.h;
      }
      h_.__private.restoreRect = null;
    } else {
      /* MAXIMIZE */
      h_.__private.restoreRect = {
        x: h_.wl_x, y: h_.wl_y, w: h_.wl_width, h: h_.wl_height,
        osX: typeof window.screenX === 'number' ? window.screenX : 0,
        osY: typeof window.screenY === 'number' ? window.screenY : 0,
        osW: window.outerWidth || h_.wl_width,
        osH: window.outerHeight || h_.wl_height,
      };
      h_.__private.maximized = true;
      const availW = (window.screen && window.screen.availWidth) || window.outerWidth || h_.wl_width;
      const availH = (window.screen && window.screen.availHeight) || window.outerHeight || h_.wl_height;
      if (single) {
        _hostMaximize(); /* real OS maximize; 'worlib:host-bounds' will correct the size below */
      } else if (electron) {
        try { window.resizeTo(availW, availH); window.moveTo(0, 0); }
        catch (e) { /* platform blocked it — div still maximizes below */ }
      }
      /* Set an immediate best-guess size so there's no visible flash, then
         the authoritative 'worlib:host-bounds' IPC message (Electron) or
         the 'resize' listener (plain browser tab) corrects it to the real
         final size once the OS resize actually lands. */
      win.style.left = '0px'; win.style.top = '0px';
      win.style.width = availW + 'px'; win.style.height = availH + 'px';
      h_.wl_x = 0; h_.wl_y = 0; h_.wl_width = availW; h_.wl_height = availH;
    }
  });
  btnClose.addEventListener('click', () => { wl_CloseWindow(h_); });

  _allWindows.push(h_);
  _fitHostWindowToWindows();
  _refreshAllDragRegions();
  return h_;
}

function wl_ShowWindow(win) {
  if (_needsBrowser('wl_ShowWindow') || !win || !win.wl_el) return;
  win.wl_el.style.display = 'flex';
  win.wl_visible = true;
  if (_isElectronRenderer()) {
    /* Bring the real OS window back too, in case wl_HideWindow (below)
       had actually minimized it. Harmless no-op if it wasn't minimized. */
    _hostRestore();
  }
  _fitHostWindowToWindows();
  _refreshAllDragRegions();
}
function wl_HideWindow(win) {
  if (_needsBrowser('wl_HideWindow') || !win || !win.wl_el) return;
  win.wl_visible = false;
  const anyStillVisible = _visibleWindowCount() > 0;
  if (_isElectronRenderer() && !anyStillVisible) {
    /* This was the last visible worlib window — actually minimize the
       real OS window instead of just hiding the div. Previously this only
       set display:none on the div, which left the (now blank) OS window
       sitting on screen — the exact "renderer stays, window is gone"
       disconnect. Leaving the div's own display style untouched means the
       content is preserved exactly as it was; the OS handles hiding it
       while minimized, and wl_ShowWindow's _hostRestore() above brings it
       straight back. */
    _hostMinimize();
  } else {
    win.wl_el.style.display = 'none';
  }
  _fitHostWindowToWindows();
  _refreshAllDragRegions();
}
function wl_CloseWindow(win) {
  if (_needsBrowser('wl_CloseWindow') || !win) return;
  (win.__private.closeCallbacks || []).forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  if (win.wl_el && win.wl_el.parentNode) win.wl_el.parentNode.removeChild(win.wl_el);
  _allWindows = _allWindows.filter(w => w !== win);
  _dragRegionRefreshers = _dragRegionRefreshers.filter(fn => fn !== win.__private._refreshDragRegion);
  if (_allWindows.length === 0 && _isElectronRenderer()) {
    /* No windows left — the host OS window (and, via the main process's
       window-all-closed handler, the whole app) closes with it. */
    try { window.close(); return; } catch (e) { /* fall through to refit */ }
  }
  _fitHostWindowToWindows();
  _refreshAllDragRegions();
}
function wl_SetWindowTitle(win, text) {
  if (_needsBrowser('wl_SetWindowTitle') || !win) return;
  const t = win.__private.bar && win.__private.bar.firstChild;
  if (t) t.textContent = String(text);
}
function wl_MoveWindow(win, x, y) {
  if (_needsBrowser('wl_MoveWindow') || !win || !win.wl_el) return;
  const p = _pt(x, y);
  win.wl_el.style.left = p.x + 'px'; win.wl_el.style.top = p.y + 'px';
  win.wl_x = p.x; win.wl_y = p.y;
  _fitHostWindowToWindows();
}
function wl_ResizeWindow(win, w, h) {
  if (_needsBrowser('wl_ResizeWindow') || !win || !win.wl_el) return;
  const s = _sz(w, h);
  win.wl_el.style.width = s.w + 'px'; win.wl_el.style.height = s.h + 'px';
  win.wl_width = s.w; win.wl_height = s.h;
  _fitHostWindowToWindows();
}
function wl_FocusWindow(win) {
  if (_needsBrowser('wl_FocusWindow') || !win || !win.wl_el) return;
  win.wl_el.style.zIndex = String(_nextZ());
}
function wl_OnWindowClose(win, fn) {
  if (_needsBrowser('wl_OnWindowClose') || !win || typeof fn !== 'function') return;
  win.__private.closeCallbacks.push(fn);
}
function wl_SetWindowBackground(win, color) {
  if (_needsBrowser('wl_SetWindowBackground') || !win) return;
  const bg = _col(color, WL_BG);
  if (win.__private.body) win.__private.body.style.background = bg;
}
function wl_AddChild(parent, child) {
  if (_needsBrowser('wl_AddChild') || !parent || !child || !child.wl_el) return;
  const container = (parent.__private && parent.__private.body) ? parent.__private.body : parent.wl_el;
  if (!container) return;
  child.wl_el.style.position = 'absolute';
  container.appendChild(child.wl_el);
  child.wl_parent = parent;
  parent.wl_children.push(child);
}

/* ══════════════════════════════════════════════════════════════════════════
   BASIC WIDGETS
   ══════════════════════════════════════════════════════════════════════════ */

function wl_CreateLabel(text, x, y) {
  if (_needsBrowser('wl_CreateLabel')) return _handle('label', null);
  const p = _pt(x, y);
  const el = document.createElement('div');
  el.textContent = String(text == null ? '' : text);
  el.style.cssText = 'position:absolute;left:' + p.x + 'px;top:' + p.y + 'px;white-space:nowrap;pointer-events:none;';
  _applyCommonStyle(el);
  const h_ = _handle('label', el);
  h_.wl_x = p.x; h_.wl_y = p.y;
  return h_;
}

function wl_CreateButton(text, x, y, w, h) {
  if (_needsBrowser('wl_CreateButton')) return _handle('button', null);
  const p = _pt(x, y), s = _sz(w, h);
  const pw = s.w || 80, ph = s.h || 24;
  const el = document.createElement('div');
  el.textContent = String(text == null ? 'Button' : text);
  el.style.cssText = [
    'position:absolute', 'left:' + p.x + 'px', 'top:' + p.y + 'px',
    'width:' + pw + 'px', 'height:' + ph + 'px',
    'background:' + WL_BG, 'display:flex', 'align-items:center', 'justify-content:center',
    'cursor:pointer', 'user-select:none', 'text-align:center',
  ].join(';');
  _bevel(el, 'raised');
  _applyCommonStyle(el);
  el.addEventListener('mousedown', () => { _bevel(el, 'sunken'); });
  el.addEventListener('mouseup',   () => { _bevel(el, 'raised'); });
  el.addEventListener('mouseleave',() => { _bevel(el, 'raised'); });
  const h_ = _handle('button', el);
  h_.wl_x = p.x; h_.wl_y = p.y; h_.wl_width = pw; h_.wl_height = ph;
  return h_;
}

function wl_CreateEditBox(placeholder, x, y, w, h) {
  if (_needsBrowser('wl_CreateEditBox')) return _handle('editbox', null);
  const p = _pt(x, y), s = _sz(w, h);
  const pw = s.w || 140, ph = s.h || 20;
  const el = document.createElement('input');
  el.type = 'text';
  el.placeholder = String(placeholder || '');
  el.style.cssText = [
    'position:absolute', 'left:' + p.x + 'px', 'top:' + p.y + 'px',
    'width:' + pw + 'px', 'height:' + ph + 'px', 'background:#ffffff',
    'outline:none', 'padding:1px 3px',
  ].join(';');
  _bevel(el, 'sunken');
  _applyCommonStyle(el);
  const h_ = _handle('editbox', el);
  h_.wl_x = p.x; h_.wl_y = p.y; h_.wl_width = pw; h_.wl_height = ph;
  return h_;
}

function wl_CreateTextArea(text, x, y, w, h) {
  if (_needsBrowser('wl_CreateTextArea')) return _handle('textarea', null);
  const p = _pt(x, y), s = _sz(w, h);
  const pw = s.w || 300, ph = s.h || 160;
  const el = document.createElement('textarea');
  el.value = String(text == null ? '' : text);
  el.spellcheck = false;
  el.style.cssText = [
    'position:absolute', 'left:' + p.x + 'px', 'top:' + p.y + 'px',
    'width:' + pw + 'px', 'height:' + ph + 'px', 'background:#ffffff',
    'outline:none', 'resize:none', 'padding:3px', 'white-space:pre',
    'font-family:Consolas,"Courier New",monospace', 'tab-size:4',
  ].join(';');
  _bevel(el, 'sunken');
  el.style.fontSize = '12px'; el.style.color = WL_TEXT;
  el.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const sIdx = el.selectionStart, eIdx = el.selectionEnd;
      el.value = el.value.slice(0, sIdx) + '\t' + el.value.slice(eIdx);
      el.selectionStart = el.selectionEnd = sIdx + 1;
      el.dispatchEvent(new Event('input'));
    }
  });
  const h_ = _handle('textarea', el);
  h_.wl_x = p.x; h_.wl_y = p.y; h_.wl_width = pw; h_.wl_height = ph;
  return h_;
}

function wl_CreateCheckbox(label, x, y, checked) {
  if (_needsBrowser('wl_CreateCheckbox')) return _handle('checkbox', null);
  const p = _pt(x, y);
  const wrap = document.createElement('label');
  wrap.style.cssText = 'position:absolute;left:' + p.x + 'px;top:' + p.y + 'px;display:flex;align-items:center;gap:5px;cursor:pointer;user-select:none;';
  _applyCommonStyle(wrap);
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = !!checked;
  box.style.cssText = 'margin:0;width:13px;height:13px;';
  const lbl = document.createElement('span');
  lbl.textContent = String(label || '');
  wrap.appendChild(box); wrap.appendChild(lbl);
  const h_ = _handle('checkbox', wrap);
  h_.wl_x = p.x; h_.wl_y = p.y;
  h_.__private.input = box;
  return h_;
}

const _radioGroups = {};
function wl_CreateRadioButton(label, x, y, group, checked) {
  if (_needsBrowser('wl_CreateRadioButton')) return _handle('radio', null);
  const p = _pt(x, y);
  const groupName = String(group || 'default');
  const wrap = document.createElement('label');
  wrap.style.cssText = 'position:absolute;left:' + p.x + 'px;top:' + p.y + 'px;display:flex;align-items:center;gap:5px;cursor:pointer;user-select:none;';
  _applyCommonStyle(wrap);
  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = 'wl_radio_' + groupName;
  radio.checked = !!checked;
  radio.style.cssText = 'margin:0;width:13px;height:13px;';
  const lbl = document.createElement('span');
  lbl.textContent = String(label || '');
  wrap.appendChild(radio); wrap.appendChild(lbl);
  const h_ = _handle('radio', wrap);
  h_.wl_x = p.x; h_.wl_y = p.y;
  h_.__private.input = radio;
  h_.__private.group = groupName;
  (_radioGroups[groupName] = _radioGroups[groupName] || []).push(h_);
  return h_;
}

function wl_CreateSlider(x, y, w, min, max, value) {
  if (_needsBrowser('wl_CreateSlider')) return _handle('slider', null);
  const p = _pt(x, y);
  const pw = w || 150;
  const el = document.createElement('input');
  el.type = 'range';
  el.min = String(min == null ? 0 : min);
  el.max = String(max == null ? 100 : max);
  el.value = String(value == null ? min || 0 : value);
  el.style.cssText = 'position:absolute;left:' + p.x + 'px;top:' + p.y + 'px;width:' + pw + 'px;margin:0;';
  const h_ = _handle('slider', el);
  h_.wl_x = p.x; h_.wl_y = p.y; h_.wl_width = pw;
  return h_;
}

function wl_CreateProgressBar(x, y, w, h, value) {
  if (_needsBrowser('wl_CreateProgressBar')) return _handle('progressbar', null);
  const p = _pt(x, y), s = _sz(w, h);
  const pw = s.w || 200, ph = s.h || 18;
  const outer = document.createElement('div');
  outer.style.cssText = 'position:absolute;left:' + p.x + 'px;top:' + p.y + 'px;width:' + pw + 'px;height:' + ph + 'px;background:#ffffff;';
  _bevel(outer, 'sunken');
  const fill = document.createElement('div');
  fill.style.cssText = 'height:100%;background:' + WL_HILITE + ';width:0%;';
  outer.appendChild(fill);
  const h_ = _handle('progressbar', outer);
  h_.wl_x = p.x; h_.wl_y = p.y; h_.wl_width = pw; h_.wl_height = ph;
  h_.__private.fill = fill;
  h_.__private.value = 0;
  h_.__private.max = 100;
  wl_SetValue(h_, value == null ? 0 : value);
  return h_;
}

function wl_CreateComboBox(items, x, y, w) {
  if (_needsBrowser('wl_CreateComboBox')) return _handle('combobox', null);
  const p = _pt(x, y);
  const pw = w || 140;
  const el = document.createElement('select');
  el.style.cssText = 'position:absolute;left:' + p.x + 'px;top:' + p.y + 'px;width:' + pw + 'px;height:20px;background:#fff;';
  _bevel(el, 'sunken');
  _applyCommonStyle(el);
  (items || []).forEach(it => {
    const opt = document.createElement('option');
    opt.textContent = String(it); opt.value = String(it);
    el.appendChild(opt);
  });
  const h_ = _handle('combobox', el);
  h_.wl_x = p.x; h_.wl_y = p.y; h_.wl_width = pw;
  return h_;
}

function wl_CreateListBox(items, x, y, w, h) {
  if (_needsBrowser('wl_CreateListBox')) return _handle('listbox', null);
  const p = _pt(x, y), s = _sz(w, h);
  const pw = s.w || 160, ph = s.h || 120;
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;left:' + p.x + 'px;top:' + p.y + 'px;width:' + pw + 'px;height:' + ph + 'px;background:#fff;overflow:auto;';
  _bevel(el, 'sunken');
  _applyCommonStyle(el);
  const h_ = _handle('listbox', el);
  h_.wl_x = p.x; h_.wl_y = p.y; h_.wl_width = pw; h_.wl_height = ph;
  h_.__private.rows = [];
  h_.__private.selectedIndex = -1;
  h_.__private.onSelect = null;
  (items || []).forEach(it => wl_AddListItem(h_, it));
  return h_;
}
function wl_AddListItem(listbox, text) {
  if (_needsBrowser('wl_AddListItem') || !listbox || listbox.wl_kind !== 'listbox') return;
  const row = document.createElement('div');
  row.textContent = String(text);
  row.style.cssText = 'padding:1px 4px;cursor:pointer;white-space:nowrap;';
  const idx = listbox.__private.rows.length;
  row.addEventListener('click', () => {
    listbox.__private.rows.forEach(r => { r.style.background = ''; r.style.color = WL_TEXT; });
    row.style.background = WL_HILITE; row.style.color = '#fff';
    listbox.__private.selectedIndex = idx;
    if (listbox.__private.onSelect) listbox.__private.onSelect(idx, text);
  });
  listbox.wl_el.appendChild(row);
  listbox.__private.rows.push(row);
}
function wl_ClearListBox(listbox) {
  if (_needsBrowser('wl_ClearListBox') || !listbox || listbox.wl_kind !== 'listbox') return;
  listbox.wl_el.innerHTML = '';
  listbox.__private.rows = [];
  listbox.__private.selectedIndex = -1;
}
function wl_GetSelectedIndex(listbox) {
  if (!listbox || !listbox.__private) return -1;
  return listbox.__private.selectedIndex == null ? -1 : listbox.__private.selectedIndex;
}
function wl_OnListSelect(listbox, fn) {
  if (_needsBrowser('wl_OnListSelect') || !listbox || listbox.wl_kind !== 'listbox') return;
  listbox.__private.onSelect = fn;
}

function wl_CreateGroupBox(label, x, y, w, h) {
  if (_needsBrowser('wl_CreateGroupBox')) return _handle('groupbox', null);
  const p = _pt(x, y), s = _sz(w, h);
  const pw = s.w || 200, ph = s.h || 120;
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;left:' + p.x + 'px;top:' + p.y + 'px;width:' + pw + 'px;height:' + ph + 'px;padding-top:10px;';
  _bevel(el, 'sunken');
  const chip = document.createElement('div');
  chip.textContent = String(label || '');
  chip.style.cssText = 'position:absolute;left:8px;top:-8px;background:' + WL_BG + ';padding:0 4px;font-size:11px;font-weight:bold;';
  _applyCommonStyle(chip);
  el.appendChild(chip);
  const h_ = _handle('groupbox', el);
  h_.wl_x = p.x; h_.wl_y = p.y; h_.wl_width = pw; h_.wl_height = ph;
  h_.__private.body = el;
  return h_;
}

function wl_CreatePanel(x, y, w, h) {
  if (_needsBrowser('wl_CreatePanel')) return _handle('panel', null);
  const p = _pt(x, y), s = _sz(w, h);
  const pw = s.w || 200, ph = s.h || 150;
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;left:' + p.x + 'px;top:' + p.y + 'px;width:' + pw + 'px;height:' + ph + 'px;background:' + WL_BG + ';overflow:hidden;';
  const h_ = _handle('panel', el);
  h_.wl_x = p.x; h_.wl_y = p.y; h_.wl_width = pw; h_.wl_height = ph;
  h_.__private.body = el;
  return h_;
}

/* ══════════════════════════════════════════════════════════════════════════
   MENU
   ══════════════════════════════════════════════════════════════════════════ */
function wl_CreateMenu() {
  if (_needsBrowser('wl_CreateMenu')) return _handle('menu', null);
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:20px;background:' + WL_BG + ';display:flex;align-items:stretch;font-size:12px;';
  _bevel(el, 'raised');
  el.style.borderWidth = '1px';
  _applyCommonStyle(el);
  const h_ = _handle('menu', el);
  h_.__private.subs = [];
  document.addEventListener('mousedown', e => {
    if (!el.contains(e.target)) {
      h_.__private.subs.forEach(s => { s.__private.dropdown.style.display = 'none'; });
    }
  });
  return h_;
}
function wl_AddMenu(menubar, label) {
  if (_needsBrowser('wl_AddMenu') || !menubar || menubar.wl_kind !== 'menu') return _handle('submenu', null);
  const btn = document.createElement('div');
  btn.textContent = String(label);
  btn.style.cssText = 'padding:0 10px;display:flex;align-items:center;cursor:pointer;';
  const dropdown = document.createElement('div');
  dropdown.style.cssText = 'position:absolute;display:none;min-width:150px;background:' + WL_BG + ';z-index:25000;padding:1px;';
  _bevel(dropdown, 'raised');
  menubar.wl_el.appendChild(btn);
  menubar.wl_el.appendChild(dropdown);
  btn.addEventListener('mousedown', e => {
    e.stopPropagation();
    const wasOpen = dropdown.style.display === 'block';
    menubar.__private.subs.forEach(s => { s.__private.dropdown.style.display = 'none'; });
    if (!wasOpen) {
      const r = btn.getBoundingClientRect(), pr = menubar.wl_el.getBoundingClientRect();
      dropdown.style.left = (r.left - pr.left) + 'px';
      dropdown.style.top = '20px';
      dropdown.style.display = 'block';
    }
  });
  const sub = _handle('submenu', dropdown);
  sub.__private.dropdown = dropdown;
  sub.__private.btn = btn;
  menubar.__private.subs.push(sub);
  return sub;
}
function wl_AddMenuItem(submenu, label, fn) {
  if (_needsBrowser('wl_AddMenuItem') || !submenu || submenu.wl_kind !== 'submenu') return;
  const item = document.createElement('div');
  item.textContent = String(label);
  item.style.cssText = 'padding:3px 18px 3px 10px;cursor:pointer;white-space:nowrap;';
  item.addEventListener('mouseenter', () => { item.style.background = WL_HILITE; item.style.color = '#fff'; });
  item.addEventListener('mouseleave', () => { item.style.background = ''; item.style.color = WL_TEXT; });
  item.addEventListener('mousedown', e => {
    e.stopPropagation();
    submenu.__private.dropdown.style.display = 'none';
    if (typeof fn === 'function') fn();
  });
  submenu.__private.dropdown.appendChild(item);
}
function wl_AddMenuSeparator(submenu) {
  if (_needsBrowser('wl_AddMenuSeparator') || !submenu || submenu.wl_kind !== 'submenu') return;
  const sep = document.createElement('div');
  sep.style.cssText = 'height:1px;background:' + WL_BORDER + ';margin:4px 2px;';
  submenu.__private.dropdown.appendChild(sep);
}
function wl_SetMenu(win, menu) {
  if (_needsBrowser('wl_SetMenu') || !win || !menu || !win.__private.bar) return;
  menu.wl_el.style.position = 'relative';
  menu.wl_el.style.width = '100%';
  win.wl_el.insertBefore(menu.wl_el, win.__private.body);
}

/* ══════════════════════════════════════════════════════════════════════════
   TOOLBAR
   ══════════════════════════════════════════════════════════════════════════ */
function wl_CreateToolbar(x, y, w) {
  if (_needsBrowser('wl_CreateToolbar')) return _handle('toolbar', null);
  const p = _pt(x, y);
  const pw = w || 300;
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;left:' + p.x + 'px;top:' + p.y + 'px;width:' + pw + 'px;height:28px;background:' + WL_BG + ';display:flex;align-items:center;gap:2px;padding:2px;';
  _bevel(el, 'raised');
  const h_ = _handle('toolbar', el);
  h_.wl_x = p.x; h_.wl_y = p.y; h_.wl_width = pw; h_.wl_height = 28;
  return h_;
}
function wl_AddToolbarButton(toolbar, text, fn) {
  if (_needsBrowser('wl_AddToolbarButton') || !toolbar || toolbar.wl_kind !== 'toolbar') return;
  const b = document.createElement('div');
  b.textContent = String(text);
  b.style.cssText = 'padding:2px 8px;cursor:pointer;font-size:12px;height:20px;display:flex;align-items:center;';
  _applyCommonStyle(b);
  _bevel(b, 'flat');
  b.addEventListener('mouseenter', () => _bevel(b, 'raised'));
  b.addEventListener('mouseleave', () => _bevel(b, 'flat'));
  b.addEventListener('mousedown', () => _bevel(b, 'sunken'));
  b.addEventListener('mouseup', () => _bevel(b, 'raised'));
  b.addEventListener('click', () => { if (typeof fn === 'function') fn(); });
  toolbar.wl_el.appendChild(b);
}

/* ══════════════════════════════════════════════════════════════════════════
   STATUS BAR
   ══════════════════════════════════════════════════════════════════════════ */
function wl_CreateStatusBar(x, w) {
  if (_needsBrowser('wl_CreateStatusBar')) return _handle('statusbar', null);
  const pw = w || null;
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;left:0;bottom:0;width:' + (pw ? pw + 'px' : '100%') + ';height:20px;background:' + WL_BG + ';display:flex;align-items:center;padding:0 6px;font-size:11px;gap:10px;';
  _bevel(el, 'sunken');
  el.style.borderWidth = '1px';
  _applyCommonStyle(el);
  const h_ = _handle('statusbar', el);
  return h_;
}
function wl_SetStatusText(sb, text) {
  if (_needsBrowser('wl_SetStatusText') || !sb) return;
  sb.wl_el.textContent = String(text);
}
function wl_SetStatusParts(sb, parts) {
  if (_needsBrowser('wl_SetStatusParts') || !sb) return;
  sb.wl_el.textContent = (parts || []).join('  |  ');
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB CONTROL
   ══════════════════════════════════════════════════════════════════════════ */
function wl_CreateTabControl(x, y, w, h) {
  if (_needsBrowser('wl_CreateTabControl')) return _handle('tabcontrol', null);
  const p = _pt(x, y), s = _sz(w, h);
  const pw = s.w || 300, ph = s.h || 200;
  const outer = document.createElement('div');
  outer.style.cssText = 'position:absolute;left:' + p.x + 'px;top:' + p.y + 'px;width:' + pw + 'px;height:' + ph + 'px;';
  const tabRow = document.createElement('div');
  tabRow.style.cssText = 'display:flex;height:20px;';
  const pageArea = document.createElement('div');
  pageArea.style.cssText = 'position:relative;width:100%;height:calc(100% - 20px);background:' + WL_BG + ';overflow:auto;';
  _bevel(pageArea, 'raised');
  outer.appendChild(tabRow); outer.appendChild(pageArea);
  const h_ = _handle('tabcontrol', outer);
  h_.wl_x = p.x; h_.wl_y = p.y; h_.wl_width = pw; h_.wl_height = ph;
  h_.__private.tabRow = tabRow;
  h_.__private.pageArea = pageArea;
  h_.__private.tabs = [];
  return h_;
}
function wl_AddTab(tabctrl, label) {
  if (_needsBrowser('wl_AddTab') || !tabctrl || tabctrl.wl_kind !== 'tabcontrol') return _handle('panel', null);
  const btn = document.createElement('div');
  btn.textContent = String(label);
  btn.style.cssText = 'padding:2px 12px;cursor:pointer;font-size:12px;display:flex;align-items:center;margin-right:2px;';
  _applyCommonStyle(btn);
  _bevel(btn, 'raised');
  const page = document.createElement('div');
  page.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:none;';
  tabctrl.__private.tabRow.appendChild(btn);
  tabctrl.__private.pageArea.appendChild(page);
  const idx = tabctrl.__private.tabs.length;
  const pageHandle = _handle('panel', page);
  pageHandle.__private.body = page;
  btn.addEventListener('click', () => wl_SelectTab(tabctrl, idx));
  tabctrl.__private.tabs.push({ btn, page: pageHandle });
  if (idx === 0) wl_SelectTab(tabctrl, 0);
  return pageHandle;
}
function wl_SelectTab(tabctrl, index) {
  if (_needsBrowser('wl_SelectTab') || !tabctrl || tabctrl.wl_kind !== 'tabcontrol') return;
  tabctrl.__private.tabs.forEach((t, i) => {
    t.page.wl_el.style.display = (i === index) ? 'block' : 'none';
    _bevel(t.btn, (i === index) ? 'sunken' : 'raised');
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   TREE VIEW
   ══════════════════════════════════════════════════════════════════════════ */
function wl_CreateTreeView(x, y, w, h) {
  if (_needsBrowser('wl_CreateTreeView')) return _handle('treeview', null);
  const p = _pt(x, y), s = _sz(w, h);
  const pw = s.w || 180, ph = s.h || 200;
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;left:' + p.x + 'px;top:' + p.y + 'px;width:' + pw + 'px;height:' + ph + 'px;background:#fff;overflow:auto;padding:2px;';
  _bevel(el, 'sunken');
  _applyCommonStyle(el);
  el.style.fontSize = '12px';
  const h_ = _handle('treeview', el);
  h_.wl_x = p.x; h_.wl_y = p.y; h_.wl_width = pw; h_.wl_height = ph;
  h_.__private.onSelect = null;
  h_.__private.selected = null;
  return h_;
}
function wl_AddTreeNode(tree, parentNode, label) {
  if (_needsBrowser('wl_AddTreeNode') || !tree || tree.wl_kind !== 'treeview') return _handle('treenode', null);
  const depth = parentNode ? (parentNode.__private.depth + 1) : 0;
  const row = document.createElement('div');
  row.style.cssText = 'padding:1px 4px;padding-left:' + (6 + depth * 14) + 'px;cursor:pointer;white-space:nowrap;';
  row.textContent = '\uD83D\uDCC1 ' + String(label);
  const container = parentNode ? parentNode.__private.childContainer : tree.wl_el;
  const childContainer = document.createElement('div');
  container.appendChild(row);
  container.appendChild(childContainer);
  const node = _handle('treenode', row);
  node.__private.depth = depth;
  node.__private.childContainer = childContainer;
  row.addEventListener('click', () => {
    if (tree.__private.selected) tree.__private.selected.style.background = '';
    row.style.background = WL_HILITE; row.style.color = '#fff';
    tree.__private.selected = row;
    if (tree.__private.onSelect) tree.__private.onSelect(node, label);
  });
  return node;
}
function wl_OnTreeSelect(tree, fn) {
  if (_needsBrowser('wl_OnTreeSelect') || !tree || tree.wl_kind !== 'treeview') return;
  tree.__private.onSelect = fn;
}

/* ══════════════════════════════════════════════════════════════════════════
   LIST VIEW (simple multi-column list, e.g. Explorer "details" style)
   ══════════════════════════════════════════════════════════════════════════ */
function wl_CreateListView(x, y, w, h, columns) {
  if (_needsBrowser('wl_CreateListView')) return _handle('listview', null);
  const p = _pt(x, y), s = _sz(w, h);
  const pw = s.w || 300, ph = s.h || 180;
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;left:' + p.x + 'px;top:' + p.y + 'px;width:' + pw + 'px;height:' + ph + 'px;background:#fff;overflow:auto;';
  _bevel(el, 'sunken');
  _applyCommonStyle(el);
  el.style.fontSize = '12px';
  const cols = columns || ['Name'];
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;background:' + WL_BG + ';font-weight:bold;position:sticky;top:0;';
  _bevel(header, 'raised'); header.style.borderWidth = '1px';
  cols.forEach(c => {
    const cell = document.createElement('div');
    cell.textContent = String(c);
    cell.style.cssText = 'flex:1;padding:2px 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    header.appendChild(cell);
  });
  el.appendChild(header);
  const h_ = _handle('listview', el);
  h_.wl_x = p.x; h_.wl_y = p.y; h_.wl_width = pw; h_.wl_height = ph;
  h_.__private.cols = cols.length;
  h_.__private.rows = [];
  h_.__private.onSelect = null;
  return h_;
}
function wl_AddListViewRow(lv, cells) {
  if (_needsBrowser('wl_AddListViewRow') || !lv || lv.wl_kind !== 'listview') return;
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;cursor:pointer;';
  (cells || []).forEach(c => {
    const cell = document.createElement('div');
    cell.textContent = String(c);
    cell.style.cssText = 'flex:1;padding:1px 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    row.appendChild(cell);
  });
  const idx = lv.__private.rows.length;
  row.addEventListener('click', () => {
    lv.__private.rows.forEach(r => { r.style.background = ''; r.style.color = WL_TEXT; });
    row.style.background = WL_HILITE; row.style.color = '#fff';
    if (lv.__private.onSelect) lv.__private.onSelect(idx, cells);
  });
  lv.wl_el.appendChild(row);
  lv.__private.rows.push(row);
}
function wl_ClearListView(lv) {
  if (_needsBrowser('wl_ClearListView') || !lv || lv.wl_kind !== 'listview') return;
  lv.__private.rows.forEach(r => r.remove());
  lv.__private.rows = [];
}
function wl_OnListViewSelect(lv, fn) {
  if (_needsBrowser('wl_OnListViewSelect') || !lv || lv.wl_kind !== 'listview') return;
  lv.__private.onSelect = fn;
}

/* ══════════════════════════════════════════════════════════════════════════
   CANVAS — raw 2D drawing surface with direct pixel access
   ══════════════════════════════════════════════════════════════════════════ */
function wl_CreateCanvas(x, y, w, h) {
  if (_needsBrowser('wl_CreateCanvas')) return _handle('canvas', null);
  const p = _pt(x, y), s = _sz(w, h);
  const pw = s.w || 320, ph = s.h || 240;
  const el = document.createElement('canvas');
  el.width = pw; el.height = ph;
  el.style.cssText = 'position:absolute;left:' + p.x + 'px;top:' + p.y + 'px;width:' + pw + 'px;height:' + ph + 'px;';
  el.tabIndex = 0;
  const h_ = _handle('canvas', el);
  h_.wl_x = p.x; h_.wl_y = p.y; h_.wl_width = pw; h_.wl_height = ph;
  h_.__private.ctx = el.getContext('2d');
  return h_;
}
/* Raw, unrestricted access to the underlying CanvasRenderingContext2D — the
   ultimate low-level escape hatch: if a wl_Draw* helper below doesn't do
   what you need, get the real context and call any Canvas2D API directly. */
function wl_GetContext(canvas) {
  if (!canvas || canvas.wl_kind !== 'canvas') return null;
  return canvas.__private.ctx;
}
function wl_Clear(canvas, color) {
  if (_needsBrowser('wl_Clear') || !canvas || canvas.wl_kind !== 'canvas') return;
  const ctx = canvas.__private.ctx;
  if (color == null) { ctx.clearRect(0, 0, canvas.wl_el.width, canvas.wl_el.height); return; }
  ctx.fillStyle = _col(color, '#000');
  ctx.fillRect(0, 0, canvas.wl_el.width, canvas.wl_el.height);
}
function wl_FillRect(canvas, x, y, w, h, color) {
  if (_needsBrowser('wl_FillRect') || !canvas) return;
  const ctx = canvas.__private.ctx;
  ctx.fillStyle = _col(color, '#000');
  ctx.fillRect(x, y, w, h);
}
function wl_DrawRect(canvas, x, y, w, h, color, lineWidth) {
  if (_needsBrowser('wl_DrawRect') || !canvas) return;
  const ctx = canvas.__private.ctx;
  ctx.strokeStyle = _col(color, '#000');
  ctx.lineWidth = lineWidth || 1;
  ctx.strokeRect(x, y, w, h);
}
function wl_FillCircle(canvas, x, y, r, color) {
  if (_needsBrowser('wl_FillCircle') || !canvas) return;
  const ctx = canvas.__private.ctx;
  ctx.fillStyle = _col(color, '#000');
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
function wl_DrawCircle(canvas, x, y, r, color, lineWidth) {
  if (_needsBrowser('wl_DrawCircle') || !canvas) return;
  const ctx = canvas.__private.ctx;
  ctx.strokeStyle = _col(color, '#000');
  ctx.lineWidth = lineWidth || 1;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
}
function wl_DrawLine(canvas, x1, y1, x2, y2, color, lineWidth) {
  if (_needsBrowser('wl_DrawLine') || !canvas) return;
  const ctx = canvas.__private.ctx;
  ctx.strokeStyle = _col(color, '#000');
  ctx.lineWidth = lineWidth || 1;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function wl_DrawText(canvas, text, x, y, color, size, font) {
  if (_needsBrowser('wl_DrawText') || !canvas) return;
  const ctx = canvas.__private.ctx;
  ctx.fillStyle = _col(color, '#000');
  ctx.font = (size || 14) + 'px ' + (font || 'monospace');
  ctx.fillText(String(text), x, y);
}
function wl_GetPixel(canvas, x, y) {
  if (_needsBrowser('wl_GetPixel') || !canvas) return { r: 0, g: 0, b: 0, a: 0 };
  const d = canvas.__private.ctx.getImageData(x, y, 1, 1).data;
  return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
}
function wl_SetPixel(canvas, x, y, color) {
  if (_needsBrowser('wl_SetPixel') || !canvas) return;
  const ctx = canvas.__private.ctx;
  ctx.fillStyle = _col(color, '#000');
  ctx.fillRect(x, y, 1, 1);
}
function wl_GetImageData(canvas, x, y, w, h) {
  if (_needsBrowser('wl_GetImageData') || !canvas) return { data: [], width: 0, height: 0 };
  const id = canvas.__private.ctx.getImageData(x || 0, y || 0, w || canvas.wl_el.width, h || canvas.wl_el.height);
  return { data: Array.from(id.data), width: id.width, height: id.height, __raw: id };
}
function wl_PutImageData(canvas, imgData, x, y) {
  if (_needsBrowser('wl_PutImageData') || !canvas || !imgData) return;
  let raw = imgData.__raw;
  if (!raw) {
    raw = new ImageData(new Uint8ClampedArray(imgData.data), imgData.width, imgData.height);
  }
  canvas.__private.ctx.putImageData(raw, x || 0, y || 0);
}
function wl_SaveCanvasAsImage(canvas, filename) {
  if (_needsBrowser('wl_SaveCanvasAsImage') || !canvas) return;
  const a = document.createElement('a');
  a.href = canvas.wl_el.toDataURL('image/png');
  a.download = String(filename || 'canvas.png');
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

/* ══════════════════════════════════════════════════════════════════════════
   IMAGE LOADING
   ══════════════════════════════════════════════════════════════════════════ */
function wl_LoadImage(src, callback) {
  if (_needsBrowser('wl_LoadImage')) { if (callback) callback(null); return; }
  const img = new Image();
  img.onload = () => {
    const h_ = _handle('image', img);
    h_.wl_width = img.naturalWidth; h_.wl_height = img.naturalHeight;
    h_.__private.ready = true;
    if (callback) callback(h_);
  };
  img.onerror = () => { if (callback) callback(null); };
  img.src = src;
}
function wl_PickImageFile(callback) {
  if (_needsBrowser('wl_PickImageFile')) { if (callback) callback(null); return; }
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
  document.body.appendChild(inp);
  inp.addEventListener('change', () => {
    const f = inp.files[0];
    document.body.removeChild(inp);
    if (!f) { if (callback) callback(null); return; }
    const reader = new FileReader();
    reader.onload = () => wl_LoadImage(String(reader.result), callback);
    reader.onerror = () => { if (callback) callback(null); };
    reader.readAsDataURL(f);
  });
  inp.click();
}
function wl_DrawImage(canvas, img, x, y, w, h) {
  if (_needsBrowser('wl_DrawImage') || !canvas || !img || !img.wl_el) return;
  const ctx = canvas.__private.ctx;
  if (w != null && h != null) ctx.drawImage(img.wl_el, x, y, w, h);
  else ctx.drawImage(img.wl_el, x, y);
}
function wl_ImageToDataURL(img) {
  if (!img || !img.wl_el) return '';
  if (img.wl_kind === 'canvas') return img.wl_el.toDataURL();
  const c = document.createElement('canvas');
  c.width = img.wl_width; c.height = img.wl_height;
  c.getContext('2d').drawImage(img.wl_el, 0, 0);
  return c.toDataURL();
}

/* ══════════════════════════════════════════════════════════════════════════
   TEXT FILE I/O
   ══════════════════════════════════════════════════════════════════════════ */
function wl_SaveTextFile(filename, content) {
  if (_needsBrowser('wl_SaveTextFile')) return false;
  const blob = new Blob([String(content == null ? '' : content)], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = String(filename || 'untitled.txt');
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
function wl_OpenTextFile(callback, accept) {
  if (_needsBrowser('wl_OpenTextFile')) { if (callback) callback(null, null); return; }
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = accept || '.txt,.zpp,.zl,.md,.json,text/plain';
  inp.style.display = 'none';
  document.body.appendChild(inp);
  inp.addEventListener('change', () => {
    const f = inp.files[0];
    document.body.removeChild(inp);
    if (!f) { if (callback) callback(null, null); return; }
    const reader = new FileReader();
    reader.onload = () => { if (callback) callback(String(reader.result), f.name); };
    reader.onerror = () => { if (callback) callback(null, null); };
    reader.readAsText(f);
  });
  inp.click();
}

/* ══════════════════════════════════════════════════════════════════════════
   DIALOGS — retro MessageBox-style popups
   ══════════════════════════════════════════════════════════════════════════ */
function wl_MessageBox(message, title) {
  if (_needsBrowser('wl_MessageBox')) return _handle('window', null);
  const win = wl_CreateWindow(title || 'Message', window.innerWidth / 2 - 150, window.innerHeight / 2 - 70, 300, 130);
  const icon = wl_CreateLabel('\u2139', 14, 16); icon.wl_el.style.fontSize = '22px';
  wl_AddChild(win, icon);
  const lbl = wl_CreateLabel(String(message), 48, 20);
  lbl.wl_el.style.whiteSpace = 'normal'; lbl.wl_el.style.width = '230px';
  wl_AddChild(win, lbl);
  const ok = wl_CreateButton('OK', 105, 75, 75, 24);
  wl_AddChild(win, ok);
  ok.wl_el.addEventListener('click', () => wl_CloseWindow(win));
  return win;
}
function wl_ConfirmBox(message, callback, title) {
  if (_needsBrowser('wl_ConfirmBox')) { if (callback) callback(false); return _handle('window', null); }
  const win = wl_CreateWindow(title || 'Confirm', window.innerWidth / 2 - 150, window.innerHeight / 2 - 70, 300, 130);
  const lbl = wl_CreateLabel(String(message), 14, 18);
  lbl.wl_el.style.whiteSpace = 'normal'; lbl.wl_el.style.width = '270px';
  wl_AddChild(win, lbl);
  const yes = wl_CreateButton('Yes', 90, 78, 70, 24);
  const no  = wl_CreateButton('No', 165, 78, 70, 24);
  wl_AddChild(win, yes); wl_AddChild(win, no);
  yes.wl_el.addEventListener('click', () => { wl_CloseWindow(win); if (callback) callback(true); });
  no.wl_el.addEventListener('click',  () => { wl_CloseWindow(win); if (callback) callback(false); });
  return win;
}
function wl_InputBox(message, callback, title, defaultValue) {
  if (_needsBrowser('wl_InputBox')) { if (callback) callback(null); return _handle('window', null); }
  const win = wl_CreateWindow(title || 'Input', window.innerWidth / 2 - 160, window.innerHeight / 2 - 75, 320, 150);
  const lbl = wl_CreateLabel(String(message), 14, 16);
  lbl.wl_el.style.whiteSpace = 'normal'; lbl.wl_el.style.width = '290px';
  wl_AddChild(win, lbl);
  const field = wl_CreateEditBox('', 14, 55, 290, 20);
  field.wl_el.value = String(defaultValue == null ? '' : defaultValue);
  wl_AddChild(win, field);
  const ok = wl_CreateButton('OK', 145, 95, 75, 24);
  const cancel = wl_CreateButton('Cancel', 225, 95, 75, 24);
  wl_AddChild(win, ok); wl_AddChild(win, cancel);
  ok.wl_el.addEventListener('click', () => { const v = field.wl_el.value; wl_CloseWindow(win); if (callback) callback(v); });
  cancel.wl_el.addEventListener('click', () => { wl_CloseWindow(win); if (callback) callback(null); });
  field.wl_el.addEventListener('keydown', e => { if (e.key === 'Enter') ok.wl_el.click(); });
  field.wl_el.focus();
  return win;
}

/* ══════════════════════════════════════════════════════════════════════════
   INPUT — keyboard / mouse
   ══════════════════════════════════════════════════════════════════════════ */
const _keysDown = {};
let _mousePos = { x: 0, y: 0 };
let _inputWired = false;
function _wireInputOnce() {
  if (_inputWired || !_isBrowser) return;
  _inputWired = true;
  document.addEventListener('keydown', e => { _keysDown[e.key] = true; _keysDown[e.code] = true; });
  document.addEventListener('keyup',   e => { _keysDown[e.key] = false; _keysDown[e.code] = false; });
  document.addEventListener('mousemove', e => { _mousePos = { x: e.clientX, y: e.clientY }; });
}
function wl_IsKeyDown(key) {
  if (_needsBrowser('wl_IsKeyDown')) return false;
  _wireInputOnce();
  return !!_keysDown[key];
}
function wl_OnKeyDown(fn) {
  if (_needsBrowser('wl_OnKeyDown')) return;
  document.addEventListener('keydown', e => fn(e.key, e.code, e));
}
function wl_OnKeyUp(fn) {
  if (_needsBrowser('wl_OnKeyUp')) return;
  document.addEventListener('keyup', e => fn(e.key, e.code, e));
}
function wl_OnHotkey(combo, fn) {
  if (_needsBrowser('wl_OnHotkey')) return () => {};
  const parts = String(combo).toLowerCase().split('+').map(p => p.trim());
  const wantCtrl = parts.includes('ctrl') || parts.includes('cmd') || parts.includes('meta');
  const wantShift = parts.includes('shift');
  const wantAlt = parts.includes('alt');
  const key = parts.filter(p => !['ctrl','cmd','meta','shift','alt'].includes(p)).pop();
  const handler = e => {
    const ctrlOk = wantCtrl ? (e.ctrlKey || e.metaKey) : true;
    if (ctrlOk && e.shiftKey === wantShift && e.altKey === wantAlt && e.key.toLowerCase() === key) {
      e.preventDefault(); fn(e);
    }
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}
function wl_GetMousePos() {
  if (_needsBrowser('wl_GetMousePos')) return { x: 0, y: 0 };
  _wireInputOnce();
  return { x: _mousePos.x, y: _mousePos.y };
}

/* Generic event binding usable on ANY handle — deliberately low-level: pass
   through raw DOM event names ("click","input","change","mousedown", ...). */
function wl_On(handle, event, fn) {
  if (_needsBrowser('wl_On') || !handle || !handle.wl_el || typeof fn !== 'function') return;
  const target = (handle.__private && handle.__private.input) ? handle.__private.input : handle.wl_el;
  const domFn = e => fn(e, handle);
  target.addEventListener(event, domFn);
  (handle.__listeners[event] = handle.__listeners[event] || []).push({ fn, domFn, target });
}
function wl_Off(handle, event, fn) {
  if (_needsBrowser('wl_Off') || !handle || !handle.__listeners[event]) return;
  handle.__listeners[event] = handle.__listeners[event].filter(rec => {
    if (rec.fn === fn) { rec.target.removeEventListener(event, rec.domFn); return false; }
    return true;
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   GENERIC PROPERTY FUNCTIONS — apply broadly across widget kinds
   ══════════════════════════════════════════════════════════════════════════ */
function wl_SetPos(handle, x, y) {
  if (_needsBrowser('wl_SetPos') || !handle || !handle.wl_el) return;
  const p = _pt(x, y);
  handle.wl_el.style.left = p.x + 'px'; handle.wl_el.style.top = p.y + 'px';
  handle.wl_x = p.x; handle.wl_y = p.y;
}
function wl_SetSize(handle, w, h) {
  if (_needsBrowser('wl_SetSize') || !handle || !handle.wl_el) return;
  const s = _sz(w, h);
  handle.wl_el.style.width = s.w + 'px'; handle.wl_el.style.height = s.h + 'px';
  handle.wl_width = s.w; handle.wl_height = s.h;
}
function wl_SetText(handle, text) {
  if (_needsBrowser('wl_SetText') || !handle) return;
  const k = handle.wl_kind;
  if (k === 'editbox' || k === 'textarea' || k === 'combobox') { handle.wl_el.value = String(text); return; }
  if (k === 'window') { wl_SetWindowTitle(handle, text); return; }
  if (k === 'checkbox' || k === 'radio') {
    const span = handle.wl_el.querySelector('span');
    if (span) span.textContent = String(text);
    return;
  }
  handle.wl_el.textContent = String(text);
}
function wl_GetText(handle) {
  if (!handle || !handle.wl_el) return '';
  const k = handle.wl_kind;
  if (k === 'editbox' || k === 'textarea' || k === 'combobox') return handle.wl_el.value;
  if (k === 'window') return handle.__private.bar ? handle.__private.bar.firstChild.textContent : '';
  return handle.wl_el.textContent;
}
function wl_SetValue(handle, value) {
  if (_needsBrowser('wl_SetValue') || !handle) return;
  const k = handle.wl_kind;
  if (k === 'checkbox' || k === 'radio') { handle.__private.input.checked = !!value; return; }
  if (k === 'slider' || k === 'editbox' || k === 'textarea' || k === 'combobox') { handle.wl_el.value = value; return; }
  if (k === 'progressbar') {
    const pct = Math.max(0, Math.min(100, (value / (handle.__private.max || 100)) * 100));
    handle.__private.value = value;
    handle.__private.fill.style.width = pct + '%';
    return;
  }
}
function wl_GetValue(handle) {
  if (!handle) return null;
  const k = handle.wl_kind;
  if (k === 'checkbox' || k === 'radio') return handle.__private.input.checked;
  if (k === 'slider') return Number(handle.wl_el.value);
  if (k === 'editbox' || k === 'textarea' || k === 'combobox') return handle.wl_el.value;
  if (k === 'progressbar') return handle.__private.value;
  return null;
}
function wl_SetVisible(handle, visible) {
  if (_needsBrowser('wl_SetVisible') || !handle || !handle.wl_el) return;
  handle.wl_el.style.display = visible ? '' : 'none';
  handle.wl_visible = !!visible;
}
function wl_SetEnabled(handle, enabled) {
  if (_needsBrowser('wl_SetEnabled') || !handle || !handle.wl_el) return;
  handle.wl_enabled = !!enabled;
  handle.wl_el.style.opacity = enabled ? '1' : '.5';
  handle.wl_el.style.pointerEvents = enabled ? '' : 'none';
  const input = handle.__private && handle.__private.input;
  if (input) input.disabled = !enabled;
  if (handle.wl_el.disabled !== undefined) handle.wl_el.disabled = !enabled;
}
/* Raw CSS escape hatch — appends/overrides style declarations directly.
   This is the guarantee that nothing worlib.zl doesn't already expose is
   ever truly out of reach. */
function wl_SetStyle(handle, cssText) {
  if (_needsBrowser('wl_SetStyle') || !handle || !handle.wl_el) return;
  handle.wl_el.style.cssText += ';' + String(cssText);
}
function wl_SetBevel(handle, mode) {
  if (_needsBrowser('wl_SetBevel') || !handle || !handle.wl_el) return;
  _bevel(handle.wl_el, mode);
}
function wl_Destroy(handle) {
  if (_needsBrowser('wl_Destroy') || !handle) return;
  if (handle.wl_kind === 'window') { wl_CloseWindow(handle); return; }
  if (handle.wl_el && handle.wl_el.parentNode) handle.wl_el.parentNode.removeChild(handle.wl_el);
}
function wl_Focus(handle) {
  if (_needsBrowser('wl_Focus') || !handle) return;
  if (handle.wl_kind === 'window') { wl_FocusWindow(handle); return; }
  const target = (handle.__private && handle.__private.input) ? handle.__private.input : handle.wl_el;
  if (target && target.focus) target.focus();
}

/* ══════════════════════════════════════════════════════════════════════════
   LOOP / TIMING
   ══════════════════════════════════════════════════════════════════════════ */
const _loops = {};
let _loopIdCounter = 1;
function wl_StartLoop(fn, fps) {
  if (_needsBrowser('wl_StartLoop')) return -1;
  const id = _loopIdCounter++;
  const interval = 1000 / (fps || 60);
  let last = performance.now();
  let raf = null;
  function tick(now) {
    if (!_loops[id]) return;
    const dt = (now - last) / 1000;
    if (now - last >= interval - 1) {
      last = now;
      try { fn(dt, now / 1000); } catch (e) { console.error('[worlib.zl] wl_StartLoop callback error:', e); }
    }
    raf = requestAnimationFrame(tick);
  }
  _loops[id] = true;
  raf = requestAnimationFrame(tick);
  _loops[id] = { raf: () => raf };
  return id;
}
function wl_StopLoop(id) {
  if (_needsBrowser('wl_StopLoop') || !_loops[id]) return;
  cancelAnimationFrame(_loops[id].raf());
  delete _loops[id];
}
function wl_Now() {
  return Date.now();
}
function wl_SetTimeout(fn, ms) {
  if (_needsBrowser('wl_SetTimeout')) return -1;
  return setTimeout(fn, ms);
}
function wl_ClearTimeout(id) {
  if (_needsBrowser('wl_ClearTimeout')) return;
  clearTimeout(id);
}

/* ══════════════════════════════════════════════════════════════════════════
   SOUND
   ══════════════════════════════════════════════════════════════════════════ */
let _audioCtx = null;
function _getAudioCtx() {
  if (!_audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    _audioCtx = new AC();
  }
  return _audioCtx;
}
function wl_Beep(frequency, durationMs) {
  if (_needsBrowser('wl_Beep')) return;
  const ctx = _getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = frequency || 800;
  gain.gain.value = 0.15;
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start();
  setTimeout(() => { osc.stop(); }, durationMs || 120);
}
function wl_LoadSound(src, callback) {
  if (_needsBrowser('wl_LoadSound')) { if (callback) callback(null); return; }
  const audio = new Audio(src);
  audio.addEventListener('canplaythrough', () => {
    const h_ = _handle('sound', audio);
    if (callback) callback(h_);
  }, { once: true });
  audio.addEventListener('error', () => { if (callback) callback(null); });
}
function wl_PlaySound(sound) {
  if (_needsBrowser('wl_PlaySound') || !sound || !sound.wl_el) return;
  try { sound.wl_el.currentTime = 0; sound.wl_el.play(); } catch (e) {}
}
function wl_StopSound(sound) {
  if (_needsBrowser('wl_StopSound') || !sound || !sound.wl_el) return;
  sound.wl_el.pause(); sound.wl_el.currentTime = 0;
}
function wl_SetVolume(sound, vol) {
  if (_needsBrowser('wl_SetVolume') || !sound || !sound.wl_el) return;
  sound.wl_el.volume = Math.max(0, Math.min(1, vol));
}

/* ══════════════════════════════════════════════════════════════════════════
   UTILITY
   ══════════════════════════════════════════════════════════════════════════ */
function wl_IsHandle(v) { return _isHandle(v); }
function wl_CloseAllWindows() { [..._allWindows].forEach(w => wl_CloseWindow(w)); }
function wl_AllWindows() { return [..._allWindows]; }
function wl_Log(win, text) {
  if (_needsBrowser('wl_Log') || !win || !win.__private.body) return;
  const line = document.createElement('div');
  line.textContent = String(text);
  line.style.cssText = 'font-family:Consolas,monospace;font-size:11px;padding:0 4px;color:#000;';
  win.__private.body.appendChild(line);
  win.__private.body.scrollTop = win.__private.body.scrollHeight;
}

/* ══════════════════════════════════════════════════════════════════════════
   DSALibraries REGISTRATION
   ══════════════════════════════════════════════════════════════════════════ */
if (typeof DSALibraries !== 'undefined') {
  DSALibraries['worlib.zl'] = {
    description: 'Low-level retro (Win9x-style) GUI library for ZETA++. Handle+function API, all names prefixed wl_.',
    inject(G) {
      _tryElectronRelaunch();
      _bindMaximizeSync();
      _bindHostBridge();

      if (typeof window !== 'undefined' && window.__ZPP__) {
        window.__ZPP__.registerBuiltins([
          'wl_CreateWindow','wl_ShowWindow','wl_HideWindow','wl_CloseWindow','wl_SetWindowTitle',
          'wl_MoveWindow','wl_ResizeWindow','wl_FocusWindow','wl_OnWindowClose','wl_SetWindowBackground','wl_AddChild',
          'wl_CreateLabel','wl_CreateButton','wl_CreateEditBox','wl_CreateTextArea','wl_CreateCheckbox',
          'wl_CreateRadioButton','wl_CreateSlider','wl_CreateProgressBar','wl_CreateComboBox',
          'wl_CreateListBox','wl_AddListItem','wl_ClearListBox','wl_GetSelectedIndex','wl_OnListSelect',
          'wl_CreateGroupBox','wl_CreatePanel',
          'wl_CreateMenu','wl_AddMenu','wl_AddMenuItem','wl_AddMenuSeparator','wl_SetMenu',
          'wl_CreateToolbar','wl_AddToolbarButton',
          'wl_CreateStatusBar','wl_SetStatusText','wl_SetStatusParts',
          'wl_CreateTabControl','wl_AddTab','wl_SelectTab',
          'wl_CreateTreeView','wl_AddTreeNode','wl_OnTreeSelect',
          'wl_CreateListView','wl_AddListViewRow','wl_ClearListView','wl_OnListViewSelect',
          'wl_CreateCanvas','wl_GetContext','wl_Clear','wl_FillRect','wl_DrawRect','wl_FillCircle',
          'wl_DrawCircle','wl_DrawLine','wl_DrawText','wl_GetPixel','wl_SetPixel','wl_GetImageData',
          'wl_PutImageData','wl_SaveCanvasAsImage',
          'wl_LoadImage','wl_PickImageFile','wl_DrawImage','wl_ImageToDataURL',
          'wl_SaveTextFile','wl_OpenTextFile',
          'wl_MessageBox','wl_ConfirmBox','wl_InputBox',
          'wl_IsKeyDown','wl_OnKeyDown','wl_OnKeyUp','wl_OnHotkey','wl_GetMousePos','wl_On','wl_Off',
          'wl_SetPos','wl_SetSize','wl_SetText','wl_GetText','wl_SetValue','wl_GetValue',
          'wl_SetVisible','wl_SetEnabled','wl_SetStyle','wl_SetBevel','wl_Destroy','wl_Focus',
          'wl_StartLoop','wl_StopLoop','wl_Now','wl_SetTimeout','wl_ClearTimeout',
          'wl_Beep','wl_LoadSound','wl_PlaySound','wl_StopSound','wl_SetVolume',
          'wl_IsHandle','wl_CloseAllWindows','wl_AllWindows','wl_Log',
        ]);
        window.__ZPP__.registerTypes(['wl_handle']);
      }

      G.wl_CreateWindow = wl_CreateWindow;   G.wl_ShowWindow = wl_ShowWindow;
      G.wl_HideWindow = wl_HideWindow;       G.wl_CloseWindow = wl_CloseWindow;
      G.wl_SetWindowTitle = wl_SetWindowTitle; G.wl_MoveWindow = wl_MoveWindow;
      G.wl_ResizeWindow = wl_ResizeWindow;   G.wl_FocusWindow = wl_FocusWindow;
      G.wl_OnWindowClose = wl_OnWindowClose; G.wl_SetWindowBackground = wl_SetWindowBackground;
      G.wl_AddChild = wl_AddChild;

      G.wl_CreateLabel = wl_CreateLabel;     G.wl_CreateButton = wl_CreateButton;
      G.wl_CreateEditBox = wl_CreateEditBox; G.wl_CreateTextArea = wl_CreateTextArea;
      G.wl_CreateCheckbox = wl_CreateCheckbox; G.wl_CreateRadioButton = wl_CreateRadioButton;
      G.wl_CreateSlider = wl_CreateSlider;   G.wl_CreateProgressBar = wl_CreateProgressBar;
      G.wl_CreateComboBox = wl_CreateComboBox;
      G.wl_CreateListBox = wl_CreateListBox; G.wl_AddListItem = wl_AddListItem;
      G.wl_ClearListBox = wl_ClearListBox;   G.wl_GetSelectedIndex = wl_GetSelectedIndex;
      G.wl_OnListSelect = wl_OnListSelect;
      G.wl_CreateGroupBox = wl_CreateGroupBox; G.wl_CreatePanel = wl_CreatePanel;

      G.wl_CreateMenu = wl_CreateMenu;       G.wl_AddMenu = wl_AddMenu;
      G.wl_AddMenuItem = wl_AddMenuItem;     G.wl_AddMenuSeparator = wl_AddMenuSeparator;
      G.wl_SetMenu = wl_SetMenu;

      G.wl_CreateToolbar = wl_CreateToolbar; G.wl_AddToolbarButton = wl_AddToolbarButton;

      G.wl_CreateStatusBar = wl_CreateStatusBar; G.wl_SetStatusText = wl_SetStatusText;
      G.wl_SetStatusParts = wl_SetStatusParts;

      G.wl_CreateTabControl = wl_CreateTabControl; G.wl_AddTab = wl_AddTab;
      G.wl_SelectTab = wl_SelectTab;

      G.wl_CreateTreeView = wl_CreateTreeView; G.wl_AddTreeNode = wl_AddTreeNode;
      G.wl_OnTreeSelect = wl_OnTreeSelect;

      G.wl_CreateListView = wl_CreateListView; G.wl_AddListViewRow = wl_AddListViewRow;
      G.wl_ClearListView = wl_ClearListView;   G.wl_OnListViewSelect = wl_OnListViewSelect;

      G.wl_CreateCanvas = wl_CreateCanvas;   G.wl_GetContext = wl_GetContext;
      G.wl_Clear = wl_Clear;                 G.wl_FillRect = wl_FillRect;
      G.wl_DrawRect = wl_DrawRect;           G.wl_FillCircle = wl_FillCircle;
      G.wl_DrawCircle = wl_DrawCircle;       G.wl_DrawLine = wl_DrawLine;
      G.wl_DrawText = wl_DrawText;           G.wl_GetPixel = wl_GetPixel;
      G.wl_SetPixel = wl_SetPixel;           G.wl_GetImageData = wl_GetImageData;
      G.wl_PutImageData = wl_PutImageData;   G.wl_SaveCanvasAsImage = wl_SaveCanvasAsImage;

      G.wl_LoadImage = wl_LoadImage;         G.wl_PickImageFile = wl_PickImageFile;
      G.wl_DrawImage = wl_DrawImage;         G.wl_ImageToDataURL = wl_ImageToDataURL;

      G.wl_SaveTextFile = wl_SaveTextFile;   G.wl_OpenTextFile = wl_OpenTextFile;

      G.wl_MessageBox = wl_MessageBox;       G.wl_ConfirmBox = wl_ConfirmBox;
      G.wl_InputBox = wl_InputBox;

      G.wl_IsKeyDown = wl_IsKeyDown;         G.wl_OnKeyDown = wl_OnKeyDown;
      G.wl_OnKeyUp = wl_OnKeyUp;             G.wl_OnHotkey = wl_OnHotkey;
      G.wl_GetMousePos = wl_GetMousePos;     G.wl_On = wl_On;   G.wl_Off = wl_Off;

      G.wl_SetPos = wl_SetPos;               G.wl_SetSize = wl_SetSize;
      G.wl_SetText = wl_SetText;             G.wl_GetText = wl_GetText;
      G.wl_SetValue = wl_SetValue;           G.wl_GetValue = wl_GetValue;
      G.wl_SetVisible = wl_SetVisible;       G.wl_SetEnabled = wl_SetEnabled;
      G.wl_SetStyle = wl_SetStyle;           G.wl_SetBevel = wl_SetBevel;
      G.wl_Destroy = wl_Destroy;             G.wl_Focus = wl_Focus;

      G.wl_StartLoop = wl_StartLoop;         G.wl_StopLoop = wl_StopLoop;
      G.wl_Now = wl_Now;                     G.wl_SetTimeout = wl_SetTimeout;
      G.wl_ClearTimeout = wl_ClearTimeout;

      G.wl_Beep = wl_Beep;                   G.wl_LoadSound = wl_LoadSound;
      G.wl_PlaySound = wl_PlaySound;         G.wl_StopSound = wl_StopSound;
      G.wl_SetVolume = wl_SetVolume;

      G.wl_IsHandle = wl_IsHandle;           G.wl_CloseAllWindows = wl_CloseAllWindows;
      G.wl_AllWindows = wl_AllWindows;       G.wl_Log = wl_Log;
    }
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    wl_CreateWindow, wl_ShowWindow, wl_HideWindow, wl_CloseWindow, wl_SetWindowTitle,
    wl_MoveWindow, wl_ResizeWindow, wl_FocusWindow, wl_OnWindowClose, wl_SetWindowBackground, wl_AddChild,
    wl_CreateLabel, wl_CreateButton, wl_CreateEditBox, wl_CreateTextArea, wl_CreateCheckbox,
    wl_CreateRadioButton, wl_CreateSlider, wl_CreateProgressBar, wl_CreateComboBox,
    wl_CreateListBox, wl_AddListItem, wl_ClearListBox, wl_GetSelectedIndex, wl_OnListSelect,
    wl_CreateGroupBox, wl_CreatePanel,
    wl_CreateMenu, wl_AddMenu, wl_AddMenuItem, wl_AddMenuSeparator, wl_SetMenu,
    wl_CreateToolbar, wl_AddToolbarButton,
    wl_CreateStatusBar, wl_SetStatusText, wl_SetStatusParts,
    wl_CreateTabControl, wl_AddTab, wl_SelectTab,
    wl_CreateTreeView, wl_AddTreeNode, wl_OnTreeSelect,
    wl_CreateListView, wl_AddListViewRow, wl_ClearListView, wl_OnListViewSelect,
    wl_CreateCanvas, wl_GetContext, wl_Clear, wl_FillRect, wl_DrawRect, wl_FillCircle,
    wl_DrawCircle, wl_DrawLine, wl_DrawText, wl_GetPixel, wl_SetPixel, wl_GetImageData,
    wl_PutImageData, wl_SaveCanvasAsImage,
    wl_LoadImage, wl_PickImageFile, wl_DrawImage, wl_ImageToDataURL,
    wl_SaveTextFile, wl_OpenTextFile,
    wl_MessageBox, wl_ConfirmBox, wl_InputBox,
    wl_IsKeyDown, wl_OnKeyDown, wl_OnKeyUp, wl_OnHotkey, wl_GetMousePos, wl_On, wl_Off,
    wl_SetPos, wl_SetSize, wl_SetText, wl_GetText, wl_SetValue, wl_GetValue,
    wl_SetVisible, wl_SetEnabled, wl_SetStyle, wl_SetBevel, wl_Destroy, wl_Focus,
    wl_StartLoop, wl_StopLoop, wl_Now, wl_SetTimeout, wl_ClearTimeout,
    wl_Beep, wl_LoadSound, wl_PlaySound, wl_StopSound, wl_SetVolume,
    wl_IsHandle, wl_CloseAllWindows, wl_AllWindows, wl_Log,
  };
}

})();
