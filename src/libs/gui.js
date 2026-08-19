/* ══════════════════════════════════════════════════════════════════════════════
   gui.zl  —  ZETA++ (ZPP) GUI LIBRARY

   ROUND 2 — game/canvas features, a code editor, and a form/data/popup widget
   set. Every addition below exists in THREE places, same as the rest of the
   file: the real browser implementation, the Electron-main-process stub (so
   require()'ing this file from main.js by mistake doesn't crash), and the
   DSALibraries inject(G) registration + module.exports for both modes.

   BUG FIXES
   ─────────
   1. Screen's method-proxy list was missing onMouse, setFont, and setSize —
      calling screen.onMouse(...) silently did nothing because Screen never
      forwarded it to its underlying Canvas. Now proxied in both the real
      Screen and the Node-stub Screen.
   2. drawImage(img,x,y,iw,ih) only ever drew the WHOLE source image — there
      was no way to draw a single frame out of a sprite sheet, which a
      canvas-heavy/game app needs constantly. Extended (backwards-compatibly)
      to drawImage(img,x,y,iw,ih, sx,sy,sw,sh) for a source-rect crop.
   3. loop(fn, fps) only ever gave you the raw rAF timestamp, so every game
      had to hand-roll delta-time math. fn is now called as fn(ts, dt) — ts
      is unchanged (old fn(ts){...} code keeps working), dt is NEW: seconds
      since the last frame, for frame-rate-independent movement. Added
      .getFPS() (also proxied onto Screen) for a live measured frame rate.

   NEW: GAME / CANVAS
   ───────────────────
   • createSpriteAnim(sheet, frameW, frameH, frameCount, fps, cols) — frame-
     based sprite-sheet animator: .update(dt), .draw(cvs,x,y,scale), .play()/
     .pause()/.stop()/.setLoop()/.gotoFrame()/.isDone().
   • loadSound(src, opts) / playSound(src, opts) — audio playback (SFX/music)
     with .play/.pause/.stop/.setVolume/.setLoop/.isPlaying.
   • Math/collision utilities: clamp, lerp, randRange, randInt, dist2D,
     rectsOverlap({x,y,w,h}), circleOverlap({x,y,r}), pointInRect(px,py,rect).

   NEW: CODE EDITOR
   ─────────────────
   • createCodeEditor(text,x,y,w,h,opts) — createTextArea wrapped with a
     synced line-number gutter, auto-indent on Enter (carries over the
     previous line's leading whitespace, adds a level after a line ending in
     { [ ( :), plus gotoLine/findNext/setLanguage/getLanguage on top of every
     createTextArea method.

   NEW: FORM CONTROLS / DATA DISPLAY / POPUPS
   ────────────────────────────────────────────
   • createCheckbox, createRadioGroup, createDropdown (native <select>),
     createSlider, createProgressBar, createTabs.
   • createListView (single-select scrollable list), createTable (sortable
     columns, row-select).
   • attachTooltip(widget, text) — hover tooltip anchored to any existing
     widget. createContextMenu(items).attachTo(widget) — right-click menu.
     showToast(msg, opts) — non-blocking corner notification.

   Everything from the previous round (Window/Scene/Button/Label/Canvas/
   Screen/Camera/Panel/Dialog/AskBox/TextArea/MenuBar/StatusBar/ConfirmBox/
   saveTextFile/openTextFile/onGlobalKey/make/...) is unchanged in behavior
   except the three bug fixes listed above.
   ══════════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════════
   ROUND 1 CHANGELOG (kept for history)
   Cleaned up + extended for building a Notepad-style app.

   WHAT CHANGED FROM YOUR VERSION
   ───────────────────────────────
   1. Removed ~2100 lines of dead, fully-commented-out first-draft code that
      was sitting above the real implementation (it started with
      "// (function GUILib() {" and ended at a "THIS IS THE SECOUND TIME"
      marker). None of it ever ran — it was just dead weight in the file.
   2. Fixed a real bug in createInput(): setPosition() moved the DOM element
      but never updated the tracked v.x/v.y, so re-adding that widget to an
      'open' scene later would snap it back to its original spot.
   3. Added setSize/setColor/setFontSize/setReadOnly/enable/disable to
      createInput() — it only had getValue/setValue/clear/focus before.
   4. Added createTextArea() — a real multi-line text widget. The old library
      had no way to edit multi-line text at all (createInput is a single-line
      <input>), which is the one thing a Notepad absolutely needs. It also
      fixes the default browser behavior where pressing Tab in a <textarea>
      jumps focus away instead of indenting — Tab now inserts a tab/spaces.
   5. Added createMenuBar() — File/Edit/Help-style dropdown menu bar
      (menuBar.addMenu("File").addItem("New", fn)...).
   6. Added createStatusBar() — a docked bottom bar for "Ln 4, Col 12" /
      "Saved" style status text.
   7. Added confirmBox() — Yes/No dialog (showPrompt only ever asked for
      typed text, there was no simple yes/no confirmation).
   8. Added saveTextFile(filename, content) and openTextFile(cb) — the only
      way to get text in/out of the browser sandbox (download-as-file and a
      native file picker + FileReader). Without these there was no way to
      actually save or open a document.
   9. Added onGlobalKey("ctrl+s", fn) — document-wide keyboard shortcuts for
      things like Ctrl+S / Ctrl+O / Ctrl+N that should fire no matter which
      widget currently has focus.
   10. Registered every new function/widget in both DSALibraries inject(G)
       blocks (browser mode AND the Electron-main-process fallback stubs),
       and in module.exports, so nothing breaks if the file is accidentally
       require()'d from the Electron main process instead of the renderer.

   Everything else (Window/Scene/Button/Label/Canvas/Screen/Camera/Panel/
   Dialog/AskBox/make/...) is your original code, untouched in behavior.
   ══════════════════════════════════════════════════════════════════════════════ */

(function GUILib() {
'use strict';

/* ══════════════════════════════════════════════════════════════════════════════
   DUAL-MODE GUI LIBRARY  —  gui.zl
   • Browser  : original DOM / Canvas implementation (unchanged)
   • Node CLI : @nodegui/nodegui (native Qt windows) + canvas npm (node-canvas)

   CLI install:  npm install @nodegui/nodegui canvas
   ══════════════════════════════════════════════════════════════════════════════ */

const _isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

/* ─────────────────────────────────────────────────────────────────────────────
   BROWSER MODE  (works in browser AND Electron renderer)
   ───────────────────────────────────────────────────────────────────────────── */
if (_isBrowser) {

/* Detect Electron renderer so we can make windows fill the native frame */
const _isElectron = (
  typeof process !== 'undefined' &&
  process.versions &&
  !!process.versions.electron
);

/* IPC helper — only available in Electron renderer */
let _ipc = null;
if (_isElectron) {
  try { _ipc = require('electron').ipcRenderer; } catch(_) {}
}

let _root    = null;
let _zTop    = 9000;
let _windows = [];

function _getRoot() {
  if (_root) return _root;
  _root = document.getElementById('zpp-gui-root');
  if (!_root) {
    _root = document.createElement('div');
    _root.id = 'zpp-gui-root';
    _root.style.cssText = [
      'position:fixed','top:0','left:0',
      'width:100%','height:100%',
      'pointer-events:none',
      'z-index:9000',
      'font-family:"JetBrains Mono","Fira Code",Consolas,monospace',
    ].join(';');
    document.body.appendChild(_root);
  }
  return _root;
}

function _view(kind, el) {
  return {
    __type__     : 'view',
    __viewKind__ : kind,
    __el__       : el,
    __children__ : [],
    x: 0, y: 0, width: 0, height: 0,
  };
}

function _drag(win, handle) {
  let ox = 0, oy = 0;
  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    ox = e.clientX - win.offsetLeft;
    oy = e.clientY - win.offsetTop;
    win.style.zIndex = ++_zTop;
    const move = e2 => { win.style.left=(e2.clientX-ox)+'px'; win.style.top=(e2.clientY-oy)+'px'; };
    const up   = ()  => { document.removeEventListener('mousemove',move); document.removeEventListener('mouseup',up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup',   up);
  });
}

function createWindow(w, h) {
  w = w || 400;  h = h || 300;
  const root = _getRoot();

  const el = document.createElement('div');

  if (_isElectron) {
    /* ── ELECTRON MODE ──────────────────────────────────────────
       The ZETA++ window IS the Electron window. Fill it entirely.
       No floating div, no offset, no box-shadow clutter.
       ────────────────────────────────────────────────────────── */
    el.style.cssText = [
      'position:fixed',
      'left:0','top:0',
      'width:100vw','height:100vh',
      'background:#1e1e2e',
      'display:flex','flex-direction:column',
      'overflow:hidden',
      'pointer-events:all',
      'z-index:'+(++_zTop),
    ].join(';');
    /* Tell Electron main process to resize the native window */
    if (_ipc) _ipc.send('win-set-size', w, h);
  } else {
    /* ── BROWSER MODE ───────────────────────────────────────────
       Classic floating draggable window inside a webpage.
       ────────────────────────────────────────────────────────── */
    el.style.cssText = [
      'position:absolute',
      'left:80px','top:60px',
      'width:'+w+'px','height:'+h+'px',
      'background:#1e1e2e',
      'border:1px solid #44475a',
      'border-radius:4px',
      'box-shadow:0 8px 24px #0007',
      'display:flex','flex-direction:column',
      'overflow:hidden',
      'pointer-events:all',
      'z-index:'+(++_zTop),
    ].join(';');
  }

  const bar = document.createElement('div');
  bar.style.cssText = [
    'display:flex','align-items:center',
    'height:32px','min-height:32px',
    'padding:0 0 0 10px',
    'background:#282a36',
    'border-bottom:1px solid #44475a',
    'user-select:none',
    /* In Electron, the titlebar drags the real OS window */
    _isElectron ? '-webkit-app-region:drag' : 'cursor:move',
  ].join(';');

  const titleEl = document.createElement('span');
  titleEl.style.cssText = 'flex:1;text-align:left;color:#cdd6f4;font-size:12px;font-weight:600;letter-spacing:.4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;pointer-events:none;';
  titleEl.textContent = 'ZETA++ Window';

  /* Windows-style caption buttons: Minimize / Maximize / Close, right-aligned,
     square hit-areas, flat until hovered. */
  const capBox = document.createElement('div');
  capBox.style.cssText = [
    'display:flex','align-items:stretch','height:100%','flex-shrink:0',
    _isElectron ? '-webkit-app-region:no-drag' : '',
  ].join(';');

  function _capBtn(label, hoverBg) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = [
      'width:44px','height:100%',
      'display:flex','align-items:center','justify-content:center',
      'background:none','border:none','outline:none',
      'color:#cdd6f4','font-size:11px','font-family:inherit',
      'cursor:pointer','transition:background .1s',
      _isElectron ? '-webkit-app-region:no-drag' : '',
    ].join(';');
    b.addEventListener('mouseenter', () => b.style.background = hoverBg);
    b.addEventListener('mouseleave', () => b.style.background = 'none');
    return b;
  }

  const minBtn = _capBtn('─', '#44475a');
  const maxBtn = _capBtn('□', '#44475a');
  const closeBtn = _capBtn('✕', '#e81123');

  minBtn.title   = 'Minimize';
  maxBtn.title   = 'Maximize';
  closeBtn.title = 'Close';

  /* Close / Minimise / Maximise — wire to IPC in Electron, DOM in browser */
  const _doClose = () => {
    if (_isElectron && _ipc) { _ipc.send('win-close'); return; }
    el.remove();
    _windows = _windows.filter(v => v.__el__ !== el);
  };
  closeBtn.addEventListener('click', _doClose);

  minBtn.addEventListener('click', () => {
    if (_isElectron && _ipc) { _ipc.send('win-minimize'); return; }
    body.style.display = body.style.display === 'none' ? 'block' : 'none';
  });

  maxBtn.addEventListener('click', () => {
    if (_isElectron && _ipc) { _ipc.send('win-maximize'); return; }
    if (el._maxed) {
      el.style.cssText = el._savedStyle; el._maxed = false;
    } else {
      el._savedStyle = el.style.cssText;
      Object.assign(el.style, { left:'0', top:'0', width:'100vw', height:'100vh', borderRadius:'0', zIndex:++_zTop });
      el._maxed = true;
    }
  });

  capBox.appendChild(minBtn);
  capBox.appendChild(maxBtn);
  capBox.appendChild(closeBtn);

  bar.appendChild(titleEl);
  bar.appendChild(capBox);
  el.appendChild(bar);

  const body = document.createElement('div');
  body.style.cssText = 'flex:1;position:relative;overflow:hidden;background:#1e1e2e;';
  el.appendChild(body);

  /* Drag only makes sense in browser mode — Electron uses -webkit-app-region */
  if (!_isElectron) _drag(el, bar);
  el.addEventListener('mousedown', () => { el.style.zIndex = ++_zTop; });
  root.appendChild(el);

  const v = _view('window', el);
  v.width  = w; v.height = h;
  v.__body__    = body;
  v.__titleEl__ = titleEl;
  v.__closeFns__= [_doClose];

  v.setTitle      = t  => {
    titleEl.textContent = String(t);
    if (_isElectron && _ipc) _ipc.send('win-set-title', String(t));
    return v;
  };
  v.setBackground = c  => { body.style.background = c; return v; };
  v.show          = () => { el.style.display = 'flex'; return v; };
  v.hide          = () => { el.style.display = 'none'; return v; };
  v.close         = () => _doClose();
  v.move          = (x,y) => {
    if (_isElectron && _ipc) { _ipc.send('win-move', x, y); return v; }
    el.style.left=x+'px'; el.style.top=y+'px'; return v;
  };
  v.resize        = (nw,nh) => {
    if (_isElectron && _ipc) { _ipc.send('win-set-size', nw, nh); return v; }
    el.style.width=nw+'px'; el.style.height=nh+'px'; return v;
  };
  v.onClose       = fn => { closeBtn.addEventListener('click', fn); return v; };
  v.loadImage     = src=> { body.style.backgroundImage= 'url('+src+');'; body.style.backgroundSize='cover'; return v; };

  v.setScene = scene => {
    body.innerHTML = '';
    if (scene && scene.__el__) {
      scene.__el__.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
      body.appendChild(scene.__el__);
    }
    v.currentScene = scene;
    return v;
  };

  v.add = child => {
    if (!v.currentScene) {
      v.setScene(createScene('open'));
    }
    if (v.currentScene && v.currentScene.add) {
      v.currentScene.add(child);
    }
    return v;
  };

  _windows.push(v);
  return v;
}

function createScene(layout) {
  layout = layout || 'open';
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;';

  const v = _view('scene', el);
  v.__layout__ = layout;

  if (layout === 'grid') {
    el.style.display = 'grid';
    el.style.gap     = '4px';
    el.style.padding = '4px';
    el.style.boxSizing = 'border-box';
  }

  v.setLayout = (type, cols, rows) => {
    v.__layout__ = type;
    if (type === 'grid') {
      el.style.display = 'grid';
      el.style.gridTemplateColumns = 'repeat('+(cols||2)+',1fr)';
      if (rows) el.style.gridTemplateRows = 'repeat('+rows+',1fr)';
      el.style.gap = '4px'; el.style.padding = '4px';
    } else {
      el.style.display = 'block';
    }
    return v;
  };

  v.add = child => {
    if (!child || !child.__el__) return v;
    v.__children__.push(child);
    const ce = child.__el__;
    if (v.__layout__ === 'open') {
      ce.style.position = 'absolute';
      ce.style.left = (child.x || 0)+'px';
      ce.style.top  = (child.y || 0)+'px';
    }
    el.appendChild(ce);
    return v;
  };

  v.remove = child => {
    v.__children__ = v.__children__.filter(c => c !== child);
    if (child && child.__el__ && child.__el__.parentNode === el) el.removeChild(child.__el__);
    return v;
  };

  v.clear = () => { v.__children__ = []; el.innerHTML = ''; return v; };

  return v;
}

function createButton(label, x, y, w, h) {
  label = (label === undefined || label === null) ? 'Button' : String(label);
  const el = document.createElement('button');
  el.textContent = label;
  el.style.cssText = [
    'position:absolute',
    'left:'+(x||0)+'px','top:'+(y||0)+'px',
    'width:'+(w||90)+'px','height:'+(h||36)+'px',
    'background:#6272a4','color:#f8f8f2',
    'border:none','border-radius:6px',
    'font-family:inherit','font-size:13px','font-weight:600',
    'cursor:pointer','outline:none',
    'transition:background .12s,transform .07s',
    'box-sizing:border-box','padding:0 8px',
  ].join(';');

  let _bg = '#6272a4';
  el.addEventListener('mouseenter', () => { el.style.background = _lighten(_bg); });
  el.addEventListener('mouseleave', () => { el.style.background = _bg; });
  el.addEventListener('mousedown',  () => { el.style.transform = 'scale(0.94)'; });
  el.addEventListener('mouseup',    () => { el.style.transform = ''; });

  const v = _view('button', el);
  v.x = x||0; v.y = y||0; v.width = w||90; v.height = h||36;

  v.listen = (event, fn) => {
    const map = { click:'click', pressed:'click', hover:'mouseenter', release:'mouseup' };
    el.addEventListener(map[event] || event, () => fn());
    return v;
  };

  v.pressed = () => {
    const b = { _fn: null };
    b.do = fn => { b._fn = fn; el.addEventListener('click', fn); return b; };
    return b;
  };

  v.work = handler => {
    if (typeof handler === 'function') el.addEventListener('click', handler);
    return v;
  };

  v.setLabel     = t  => { el.textContent = String(t); return v; };
  v.setText      = v.setLabel;
  v.setColor     = (fg, bg) => { el.style.color = fg; el.style.background = _bg = bg; return v; };
  v.setBackground= bg => { el.style.background = _bg = bg; return v; };
  v.setFontSize  = s  => { el.style.fontSize = s+'px'; return v; };
  v.setRadius    = r  => { el.style.borderRadius = r+'px'; return v; };
  v.setBorder    = (c,w2)=>{ el.style.border=(w2||1)+'px solid '+(c||'#fff'); return v; };
  v.setPosition  = (nx,ny)=>{ v.x=nx; v.y=ny; el.style.left=nx+'px'; el.style.top=ny+'px'; return v; };
  v.setSize      = (nw,nh)=>{ v.width=nw; v.height=nh; el.style.width=nw+'px'; el.style.height=nh+'px'; return v; };
  v.enable       = () => { el.disabled=false; el.style.opacity='1'; return v; };
  v.disable      = () => { el.disabled=true;  el.style.opacity='.4'; return v; };
  return v;
}

function createLabel(text, x, y) {
  const el = document.createElement('div');
  el.textContent = String(text == null ? '' : text);
  el.style.cssText = [
    'position:absolute',
    'left:'+(x||0)+'px','top:'+(y||0)+'px',
    'color:#f8f8f2',
    'font-family:inherit','font-size:14px',
    'pointer-events:none','user-select:none',
    'white-space:pre',
  ].join(';');

  const v = _view('label', el);
  v.x = x||0; v.y = y||0;
  v.setText     = t  => { el.textContent = String(t); return v; };
  v.setColor    = c  => { el.style.color = c; return v; };
  v.setFontSize = s  => { el.style.fontSize = s+'px'; return v; };
  v.setFont     = (fam,sz,wt)=>{ if(fam)el.style.fontFamily=fam; if(sz)el.style.fontSize=sz+'px'; if(wt)el.style.fontWeight=wt; return v; };
  v.setAlign    = a  => { el.style.textAlign = a; return v; };
  v.setPosition = (nx,ny)=>{ v.x=nx; v.y=ny; el.style.left=nx+'px'; el.style.top=ny+'px'; return v; };
  v.setSize     = (nw,nh)=>{ el.style.width=nw+'px'; el.style.height=nh+'px'; el.style.overflow='hidden'; return v; };
  v.setBackground = c => { el.style.background=c; el.style.padding='2px 6px'; return v; };
  return v;
}

function createInput(hint, x, y, w, h) {
  const el = document.createElement('input');
  el.type = 'text';
  el.placeholder = String(hint || '');
  el.style.cssText = [
    'position:absolute',
    'left:'+(x||0)+'px','top:'+(y||0)+'px',
    'width:'+(w||160)+'px','height:'+(h||34)+'px',
    'background:#282a36','color:#f8f8f2',
    'border:1.5px solid #6272a4','border-radius:5px',
    'font-family:inherit','font-size:13px',
    'padding:0 10px','outline:none','box-sizing:border-box',
  ].join(';');
  el.addEventListener('focus', () => el.style.borderColor = '#bd93f9');
  el.addEventListener('blur',  () => el.style.borderColor = '#6272a4');

  const v = _view('input', el);
  v.x = x||0; v.y = y||0; v.width = w||160; v.height = h||34;
  v.getValue  = ()=> el.value;
  v.setValue  = t => { el.value = String(t); return v; };
  v.clear     = ()=> { el.value = ''; return v; };
  v.focus     = ()=> { el.focus(); return v; };
  /* BUGFIX: setPosition previously moved the element but never updated v.x/v.y,
     so re-adding this view to an 'open' scene later would snap it back to its
     original spot. Now the tracked coords stay in sync. */
  v.setPosition = (nx,ny)=>{ v.x=nx; v.y=ny; el.style.left=nx+'px'; el.style.top=ny+'px'; return v; };
  v.setSize     = (nw,nh)=>{ v.width=nw; v.height=nh; el.style.width=nw+'px'; el.style.height=nh+'px'; return v; };
  v.setColor    = (fg,bg)=>{ if(fg) el.style.color=fg; if(bg) el.style.background=bg; return v; };
  v.setFontSize = s => { el.style.fontSize = s+'px'; return v; };
  v.setReadOnly = ro => { el.readOnly = !!ro; return v; };
  v.enable      = () => { el.disabled=false; el.style.opacity='1'; return v; };
  v.disable     = () => { el.disabled=true;  el.style.opacity='.5'; return v; };
  v.listen = (event, fn) => {
    if (event === 'change') el.addEventListener('input',   () => fn(el.value));
    if (event === 'enter')  el.addEventListener('keydown', e  => { if(e.key==='Enter') fn(el.value); });
    if (event === 'focus')  el.addEventListener('focus',   fn);
    if (event === 'blur')   el.addEventListener('blur',    fn);
    return v;
  };
  return v;
}

/* ── createTextArea ───────────────────────────────────────────────────────────
   Multi-line text editing widget — the piece the original library was missing
   entirely (createInput only ever wraps a single-line <input>). This is the
   core widget a Notepad-style app needs for the document body.
   ─────────────────────────────────────────────────────────────────────────── */
function createTextArea(text, x, y, w, h) {
  x=x||0; y=y||0; w=w||400; h=h||250;
  const el = document.createElement('textarea');
  el.value = String(text == null ? '' : text);
  el.spellcheck = false;
  el.wrap = 'off';
  el.style.cssText = [
    'position:absolute',
    'left:'+x+'px','top:'+y+'px',
    'width:'+w+'px','height:'+h+'px',
    'background:#1e1e2e','color:#f8f8f2',
    'border:1.5px solid #44475a','border-radius:5px',
    'font-family:"JetBrains Mono","Fira Code",Consolas,monospace',
    'font-size:14px','line-height:1.5',
    'padding:8px 10px','outline:none','box-sizing:border-box',
    'resize:none','white-space:pre','overflow:auto','tab-size:4',
  ].join(';');
  el.addEventListener('focus', () => el.style.borderColor = '#bd93f9');
  el.addEventListener('blur',  () => el.style.borderColor = '#44475a');

  /* BUGFIX / feature: plain <textarea> elements let Tab move focus away
     instead of indenting, which is unusable for a code/text editor. Insert
     a real tab character (or spaces) at the cursor instead. */
  el.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = el.selectionStart, en = el.selectionEnd;
      const insert = v.__useSpaces__ ? ' '.repeat(v.__tabSize__||4) : '\t';
      el.value = el.value.slice(0,s) + insert + el.value.slice(en);
      el.selectionStart = el.selectionEnd = s + insert.length;
      el.dispatchEvent(new Event('input'));
    }
  });

  const v = _view('textarea', el);
  v.x=x; v.y=y; v.width=w; v.height=h;
  v.__tabSize__  = 4;
  v.__useSpaces__= false;

  v.getValue   = ()      => el.value;
  v.setValue   = t       => { el.value = String(t==null?'':t); return v; };
  v.clear      = ()      => { el.value = ''; return v; };
  v.focus      = ()      => { el.focus(); return v; };
  v.setPosition= (nx,ny) => { v.x=nx; v.y=ny; el.style.left=nx+'px'; el.style.top=ny+'px'; return v; };
  v.setSize    = (nw,nh) => { v.width=nw; v.height=nh; el.style.width=nw+'px'; el.style.height=nh+'px'; return v; };
  v.setColor   = (fg,bg) => { if(fg) el.style.color=fg; if(bg) el.style.background=bg; return v; };
  v.setFont    = (fam,sz)=> { if(fam) el.style.fontFamily=fam; if(sz) el.style.fontSize=sz+'px'; return v; };
  v.setFontSize= s       => { el.style.fontSize = s+'px'; return v; };
  v.setWrap    = on      => { el.wrap = on?'soft':'off'; el.style.whiteSpace = on?'pre-wrap':'pre'; return v; };
  v.setReadOnly= ro      => { el.readOnly = !!ro; return v; };
  v.setTabSize = (n,useSpaces) => { v.__tabSize__=n||4; v.__useSpaces__=!!useSpaces; el.style.tabSize=String(n||4); return v; };
  v.setPlaceholder = t   => { el.placeholder = String(t||''); return v; };

  v.insertAtCursor = txt => {
    const s = el.selectionStart, en = el.selectionEnd;
    el.value = el.value.slice(0,s) + txt + el.value.slice(en);
    el.selectionStart = el.selectionEnd = s + txt.length;
    el.dispatchEvent(new Event('input'));
    return v;
  };
  v.getSelection   = () => el.value.slice(el.selectionStart, el.selectionEnd);
  v.selectAll      = () => { el.focus(); el.select(); return v; };
  v.getCursorLine  = () => el.value.slice(0, el.selectionStart).split('\n').length;
  v.getCursorColumn= () => { const upto = el.value.slice(0, el.selectionStart); return upto.length - upto.lastIndexOf('\n'); };
  v.getLineCount   = () => el.value.split('\n').length;
  v.getWordCount   = () => { const t = el.value.trim(); return t === '' ? 0 : t.split(/\s+/).length; };
  v.getCharCount   = () => el.value.length;
  v.undo           = () => { el.focus(); document.execCommand && document.execCommand('undo'); return v; };
  v.redo           = () => { el.focus(); document.execCommand && document.execCommand('redo'); return v; };

  v.listen = (event, fn) => {
    if (event === 'change')  el.addEventListener('input',    () => fn(el.value));
    if (event === 'keydown') el.addEventListener('keydown',  e  => fn(e.key, e));
    if (event === 'focus')   el.addEventListener('focus',    fn);
    if (event === 'blur')    el.addEventListener('blur',     fn);
    if (event === 'cursor')  el.addEventListener('click',    () => fn(v.getCursorLine(), v.getCursorColumn()));
    if (event === 'cursor')  el.addEventListener('keyup',    () => fn(v.getCursorLine(), v.getCursorColumn()));
    return v;
  };

  return v;
}

/* ── createCodeEditor ─────────────────────────────────────────────────────────
   A createTextArea wrapped with a synced line-number gutter, auto-indent on
   Enter (keeps the previous line's leading whitespace, and adds one more
   indent level after a line ending in { [ ( : ), and simple current-line
   highlighting. Not a full syntax-highlighting engine — .setLanguage() just
   stores a hint for now, so app code can branch on it if it adds one later.
   ─────────────────────────────────────────────────────────────────────────── */
function createCodeEditor(text, x, y, w, h, opts) {
  x=x||0; y=y||0; w=w||500; h=h||360; opts = opts || {};
  const gutterW = opts.gutterWidth || 46;

  const wrap = document.createElement('div');
  wrap.style.cssText = [
    'position:absolute','left:'+x+'px','top:'+y+'px','width:'+w+'px','height:'+h+'px',
    'display:flex','background:#1e1e2e','border:1.5px solid #44475a','border-radius:5px',
    'overflow:hidden','box-sizing:border-box',
    'font-family:"JetBrains Mono","Fira Code",Consolas,monospace','font-size:14px','line-height:1.5',
  ].join(';');

  const gutter = document.createElement('div');
  gutter.style.cssText = [
    'width:'+gutterW+'px','flex-shrink:0','overflow:hidden',
    'background:#191a24','color:#6272a4','text-align:right',
    'padding:8px 8px 8px 0','box-sizing:border-box','user-select:none','white-space:pre',
  ].join(';');

  const ta = createTextArea(text, 0, 0, w-gutterW, h, false);
  const el = ta.__el__;
  el.style.position = 'relative';
  el.style.left = ''; el.style.top = '';
  el.style.border = 'none'; el.style.borderRadius = '0';
  el.style.flex = '1';

  wrap.appendChild(gutter);
  wrap.appendChild(el);

  const v = _view('codeeditor', wrap);
  v.x=x; v.y=y; v.width=w; v.height=h;
  v.__lang__ = opts.language || null;

  function _updateGutter() {
    const n = el.value.split('\n').length;
    let s = '';
    for (let i = 1; i <= n; i++) s += i + '\n';
    gutter.textContent = s;
    gutter.scrollTop = el.scrollTop;
  }
  el.addEventListener('input', _updateGutter);
  el.addEventListener('scroll', () => { gutter.scrollTop = el.scrollTop; });
  _updateGutter();

  /* Auto-indent: Enter carries over the previous line's leading whitespace,
     and adds one extra indent level if that line opens a block. */
  el.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const s = el.selectionStart, en = el.selectionEnd;
    const before = el.value.slice(0, s);
    const lineStart = before.lastIndexOf('\n') + 1;
    const line = before.slice(lineStart);
    const indentMatch = line.match(/^[ \t]*/);
    let indent = indentMatch ? indentMatch[0] : '';
    if (/[{[(:]\s*$/.test(line)) indent += (ta.__useSpaces__ ? ' '.repeat(ta.__tabSize__||4) : '\t');
    const insert = '\n' + indent;
    el.value = el.value.slice(0,s) + insert + el.value.slice(en);
    el.selectionStart = el.selectionEnd = s + insert.length;
    el.dispatchEvent(new Event('input'));
  });

  v.getValue    = ta.getValue;
  v.setValue    = t => { ta.setValue(t); _updateGutter(); return v; };
  v.clear       = () => { ta.clear(); _updateGutter(); return v; };
  v.focus       = ta.focus;
  v.setColor    = ta.setColor;
  v.setFontSize = s => { wrap.style.fontSize = s+'px'; return v; };
  v.setReadOnly = ta.setReadOnly;
  v.setTabSize  = (n, useSpaces) => { ta.setTabSize(n, useSpaces); return v; };
  v.setLanguage = lang => { v.__lang__ = lang; return v; };
  v.getLanguage = () => v.__lang__;
  v.insertAtCursor = txt => { ta.insertAtCursor(txt); _updateGutter(); return v; };
  v.getSelection    = ta.getSelection;
  v.selectAll       = ta.selectAll;
  v.getCursorLine   = ta.getCursorLine;
  v.getCursorColumn = ta.getCursorColumn;
  v.getLineCount    = ta.getLineCount;
  v.getWordCount    = ta.getWordCount;
  v.getCharCount    = ta.getCharCount;
  v.undo            = ta.undo;
  v.redo            = ta.redo;
  v.gotoLine = n => {
    const lines = el.value.split('\n');
    n = clamp(n, 1, lines.length);
    let pos = 0;
    for (let i = 0; i < n-1; i++) pos += lines[i].length + 1;
    el.focus(); el.selectionStart = el.selectionEnd = pos;
    return v;
  };
  v.findNext = (query, fromPos) => {
    if (!query) return -1;
    const idx = el.value.indexOf(query, fromPos || 0);
    if (idx !== -1) { el.focus(); el.selectionStart = idx; el.selectionEnd = idx+query.length; }
    return idx;
  };
  v.replaceSelection = txt => { ta.insertAtCursor(txt); _updateGutter(); return v; };
  v.setPosition = (nx,ny) => { v.x=nx; v.y=ny; wrap.style.left=nx+'px'; wrap.style.top=ny+'px'; return v; };
  v.setSize     = (nw,nh) => {
    v.width=nw; v.height=nh; wrap.style.width=nw+'px'; wrap.style.height=nh+'px';
    el.style.width = (nw-gutterW)+'px';
    return v;
  };
  v.listen = (event, fn) => { ta.listen(event, fn); return v; };
  return v;
}

function createCanvas(w, h) {
  w = w || 400;  h = h || 300;

  const el  = document.createElement('canvas');
  el.width  = w;  el.height = h;
  el.style.cssText = 'position:absolute;top:0;left:0;display:block;outline:none;';
  el.setAttribute('tabindex','0');

  const ctx   = el.getContext('2d');
  let _loop   = null;
  let _keys   = {};
  let _onKey  = [];
  let _onKeyUp= [];

  el.addEventListener('keydown', e => {
    _keys[e.key] = _keys[e.code] = true;
    e.preventDefault();
    _onKey.forEach(f => f(e.key, e.code));
  });
  el.addEventListener('keyup', e => {
    _keys[e.key] = _keys[e.code] = false;
    _onKeyUp.forEach(f => f(e.key, e.code));
  });

  const v = _view('canvas', el);
  v.width = w;  v.height = h;
  v.__ctx__  = ctx;
  v.__keys__ = _keys;

  v.getCtx    = ()           => ctx;
  v.clear     = (bg)         => { if(bg){ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);}else ctx.clearRect(0,0,w,h); return v; };
  v.fill      = c            => { ctx.fillStyle=c; ctx.fillRect(0,0,w,h); return v; };
  v.drawRect  = (x,y,rw,rh,c,filled)=>{ if(filled===false){ctx.strokeStyle=c||'#fff';ctx.strokeRect(x,y,rw,rh);}else{ctx.fillStyle=c||'#fff';ctx.fillRect(x,y,rw,rh);} return v; };
  v.drawCircle= (x,y,r,c,filled)=>{ ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2); if(filled===false){ctx.strokeStyle=c||'#fff';ctx.stroke();}else{ctx.fillStyle=c||'#fff';ctx.fill();} return v; };
  v.drawText  = (t,x,y,c,sz,fam)=>{ ctx.fillStyle=c||'#fff'; ctx.font=(sz||14)+'px '+(fam||'monospace'); ctx.fillText(String(t),x,y); return v; };
  v.drawLine  = (x1,y1,x2,y2,c,lw)=>{ ctx.beginPath();ctx.strokeStyle=c||'#fff';ctx.lineWidth=lw||1;ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke(); return v; };
  v.drawPoly  = (pts,c,filled)=>{ if(!pts||pts.length<2)return v; ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);pts.slice(1).forEach(p=>ctx.lineTo(p[0],p[1]));ctx.closePath(); if(filled===false){ctx.strokeStyle=c||'#fff';ctx.stroke();}else{ctx.fillStyle=c||'#fff';ctx.fill();} return v; };
  v.drawArc   = (x,y,r,sa,ea,c,filled)=>{ ctx.beginPath();ctx.arc(x,y,r,sa,ea); if(filled===false){ctx.strokeStyle=c||'#fff';ctx.stroke();}else{ctx.fillStyle=c||'#fff';ctx.fill();} return v; };
  /* drawImage(img,x,y,iw,ih) draws the whole image.
     drawImage(img,x,y,iw,ih, sx,sy,sw,sh) draws just the sx,sy,sw,sh region of
     the source image (sprite-sheet frame) — needed for sprite animation. */
  v.drawImage = (img,x,y,iw,ih,sx,sy,sw,sh)=>{
    if(!(img&&img.__img__&&img.__img__.complete)) return v;
    const dw = iw||img.__img__.naturalWidth, dh = ih||img.__img__.naturalHeight;
    if (sx===undefined) { ctx.drawImage(img.__img__, x||0, y||0, dw, dh); }
    else { ctx.drawImage(img.__img__, sx,sy,sw,sh, x||0, y||0, dw, dh); }
    return v;
  };
  v.setFont   = (sz,fam)     => { ctx.font=(sz||14)+'px '+(fam||'monospace'); return v; };
  v.setAlpha  = a            => { ctx.globalAlpha = a; return v; };
  v.save      = ()           => { ctx.save(); return v; };
  v.restore   = ()           => { ctx.restore(); return v; };
  v.translate = (x,y)        => { ctx.translate(x,y); return v; };
  v.rotate    = deg          => { ctx.rotate(deg*Math.PI/180); return v; };
  v.scale2    = (sx,sy)      => { ctx.scale(sx,sy||sx); return v; };
  v.measureText= t           => ctx.measureText(String(t)).width;
  v.setSize   = (nw,nh)      => { el.width=nw; el.height=nh; v.width=nw; v.height=nh; return v; };
  v.toDataURL = ()           => el.toDataURL();

  v.isKeyDown = k => !!_keys[k];
  v.onKey     = fn => { _onKey.push(fn); return v; };
  v.onKeyUp   = fn => { _onKeyUp.push(fn); return v; };
  v.onClick   = fn => { el.addEventListener('click',e=>{const r=el.getBoundingClientRect();fn(e.clientX-r.left,e.clientY-r.top);}); return v; };
  v.onMouse   = (ev,fn)=>{ el.addEventListener(ev,e=>{const r=el.getBoundingClientRect();fn(e.clientX-r.left,e.clientY-r.top,e);}); return v; };
  v.focus     = ()  => { el.focus(); return v; };

  /* loop(fn, fps) calls fn(ts, dt) every frame — ts is the raw timestamp
     (same as before, so old fn(ts){...} code keeps working unchanged), dt is
     NEW: seconds since the last frame, for game-speed-independent movement
     (x += speed*dt). v.getFPS() reports the live measured rate. */
  let _fps = 0, _fpsAccum = 0, _fpsFrames = 0;
  v.loop = (fn, fps) => {
    if (_loop) cancelAnimationFrame(_loop);
    const capMs = fps ? 1000/fps : 0;
    let last = 0, lastFrame = 0;
    function tick(ts) {
      _loop = requestAnimationFrame(tick);
      if (capMs && ts - last < capMs) return;
      const dt = lastFrame ? Math.min((ts-lastFrame)/1000, 0.25) : 0;
      last = ts; lastFrame = ts;
      _fpsAccum += dt; _fpsFrames++;
      if (_fpsAccum >= 0.5) { _fps = Math.round(_fpsFrames/_fpsAccum); _fpsAccum=0; _fpsFrames=0; }
      fn(ts, dt);
    }
    _loop = requestAnimationFrame(tick);
    return v;
  };
  v.stopLoop = () => { if(_loop){cancelAnimationFrame(_loop);_loop=null;} return v; };
  v.getFPS   = () => _fps;

  return v;
}

function createScreen(w, h) {
  const win = createWindow(w || 600, h || 432);
  const cvs = createCanvas(w || 600, (h||432) - 32);
  cvs.__el__.style.cssText = 'position:absolute;top:0;left:0;display:block;outline:none;';

  const scene = createScene('open');
  scene.add(cvs);
  win.setScene(scene);
  win.__viewKind__ = 'screen';
  win.canvas = cvs;

  const proxy = ['clear','fill','drawRect','drawCircle','drawText','drawLine',
                  'drawPoly','drawArc','drawImage','loop','stopLoop','getFPS',
                  'onKey','onKeyUp','onClick','onMouse','isKeyDown','focus','getCtx',
                  'save','restore','translate','rotate','scale2','setAlpha','setFont','setSize',
                  'measureText','toDataURL'];
  proxy.forEach(m => { win[m] = (...a) => cvs[m](...a); });
  return win;
}

function createCamera(cvs) {
  const cam = _view('camera', null);
  cam.x = 0;  cam.y = 0;  cam.zoom = 1;
  cam.moveTo = (x,y)     => { cam.x=x; cam.y=y; return cam; };
  cam.zoomTo = z         => { cam.zoom=z; return cam; };
  cam.follow = (tgt, s)  => {
    s = s || 0.1;
    if (!cvs) return cam;
    cam.x += ((tgt.x - cvs.width/2)  - cam.x) * s;
    cam.y += ((tgt.y - cvs.height/2) - cam.y) * s;
    return cam;
  };
  cam.apply  = () => {
    if (cvs && cvs.__ctx__) {
      cvs.__ctx__.save();
      cvs.__ctx__.scale(cam.zoom, cam.zoom);
      cvs.__ctx__.translate(-cam.x, -cam.y);
    }
    return cam;
  };
  cam.reset  = () => { if(cvs&&cvs.__ctx__) cvs.__ctx__.restore(); return cam; };
  return cam;
}

function createPanel(x, y, w, h, bg) {
  const el = document.createElement('div');
  el.style.cssText = [
    'position:absolute',
    'left:'+(x||0)+'px','top:'+(y||0)+'px',
    'width:'+(w||200)+'px','height:'+(h||150)+'px',
    'background:'+(bg||'#282a36'),
    'border:1px solid #44475a','border-radius:6px',
    'overflow:hidden','box-sizing:border-box',
  ].join(';');

  const v = _view('panel', el);
  v.x=x||0; v.y=y||0; v.width=w||200; v.height=h||150;
  v.setBackground = c   => { el.style.background=c; return v; };
  v.setBorder     = (c,bw)=>{ el.style.border=(bw||1)+'px solid '+(c||'#44475a'); return v; };
  v.setRadius     = r   => { el.style.borderRadius=r+'px'; return v; };
  v.add = child => {
    if (child && child.__el__) {
      child.__el__.style.position = 'absolute';
      el.appendChild(child.__el__);
    }
    return v;
  };
  return v;
}

/* ── createStatusBar ─────────────────────────────────────────────────────────
   Thin docked bar for a "Ln 4, Col 12" / "Saved" style status readout —
   the kind of thing a Notepad clone needs at the bottom of the window.
   ─────────────────────────────────────────────────────────────────────────── */
function createStatusBar(text, w) {
  const el = document.createElement('div');
  el.style.cssText = [
    'position:absolute','left:0','bottom:0',
    'width:'+(w?w+'px':'100%'),'height:24px',
    'background:#282a36','border-top:1px solid #44475a',
    'color:#cdd6f4','font-family:inherit','font-size:12px',
    'display:flex','align-items:center','padding:0 10px',
    'box-sizing:border-box','user-select:none','gap:16px',
  ].join(';');
  el.textContent = String(text || '');

  const v = _view('statusbar', el);
  v.setText  = t => { el.textContent = String(t); return v; };
  v.setParts = parts => { el.textContent = (parts||[]).join('   |   '); return v; };
  v.setColor = c => { el.style.color = c; return v; };
  v.setBackground = c => { el.style.background = c; return v; };
  return v;
}

/* ── createMenuBar / addMenu / addItem ───────────────────────────────────────
   Classic File / Edit / Help dropdown menu bar, needed for any Notepad-style
   app. Menus close on outside click and on item selection.
   ─────────────────────────────────────────────────────────────────────────── */
function createMenuBar(w) {
  const el = document.createElement('div');
  el.style.cssText = [
    'position:absolute','left:0','top:0',
    'width:'+(w?w+'px':'100%'),'height:28px',
    'background:#282a36','border-bottom:1px solid #44475a',
    'display:flex','align-items:stretch',
    'font-family:inherit','font-size:13px','user-select:none',
  ].join(';');

  const v = _view('menubar', el);
  v.__menus__ = [];

  function _closeAllMenus() {
    v.__menus__.forEach(m => { m.__dropdown__.style.display = 'none'; m.__btn__.style.background = 'transparent'; });
  }
  document.addEventListener('mousedown', e => {
    if (!el.contains(e.target)) _closeAllMenus();
  });

  v.addMenu = label => {
    const btn = document.createElement('div');
    btn.textContent = String(label);
    btn.style.cssText = [
      'padding:0 12px','display:flex','align-items:center',
      'cursor:pointer','color:#f8f8f2',
    ].join(';');

    const dropdown = document.createElement('div');
    dropdown.style.cssText = [
      'position:absolute','display:none','min-width:160px',
      'background:#282a36','border:1px solid #44475a','border-radius:4px',
      'box-shadow:0 8px 24px #0007','padding:4px 0','z-index:20000',
    ].join(';');
    el.appendChild(dropdown);

    const menuObj = { __btn__: btn, __dropdown__: dropdown, __items__: [] };

    btn.addEventListener('mouseenter', () => { btn.style.background = '#44475a'; });
    btn.addEventListener('mouseleave', () => { if (dropdown.style.display==='none') btn.style.background='transparent'; });
    btn.addEventListener('mousedown', e => {
      e.stopPropagation();
      const wasOpen = dropdown.style.display === 'block';
      _closeAllMenus();
      if (!wasOpen) {
        const r = btn.getBoundingClientRect(), pr = el.getBoundingClientRect();
        dropdown.style.left = (r.left - pr.left) + 'px';
        dropdown.style.top  = '28px';
        dropdown.style.display = 'block';
        btn.style.background = '#44475a';
      }
    });

    menuObj.addItem = (label2, fn) => {
      const item = document.createElement('div');
      item.textContent = String(label2);
      item.style.cssText = [
        'padding:6px 16px','color:#f8f8f2','cursor:pointer','white-space:nowrap',
      ].join(';');
      item.addEventListener('mouseenter', () => item.style.background = '#6272a4');
      item.addEventListener('mouseleave', () => item.style.background = 'transparent');
      item.addEventListener('mousedown', e => {
        e.stopPropagation();
        _closeAllMenus();
        if (typeof fn === 'function') fn();
      });
      dropdown.appendChild(item);
      menuObj.__items__.push(item);
      return menuObj;
    };

    menuObj.addSeparator = () => {
      const sep = document.createElement('div');
      sep.style.cssText = 'height:1px;background:#44475a;margin:4px 0;';
      dropdown.appendChild(sep);
      return menuObj;
    };

    el.appendChild(btn);
    v.__menus__.push(menuObj);
    return menuObj;
  };

  return v;
}

/* ── createCheckbox ───────────────────────────────────────────────────────── */
function createCheckbox(label, x, y, checked) {
  const wrap = document.createElement('label');
  wrap.style.cssText = [
    'position:absolute','left:'+(x||0)+'px','top:'+(y||0)+'px',
    'display:flex','align-items:center','gap:8px','cursor:pointer',
    'color:#f8f8f2','font-family:inherit','font-size:13px','user-select:none',
  ].join(';');

  const box = document.createElement('span');
  box.style.cssText = [
    'width:18px','height:18px','border-radius:4px','flex-shrink:0',
    'border:1.5px solid #6272a4','background:#282a36',
    'display:flex','align-items:center','justify-content:center',
    'transition:background .12s,border-color .12s',
  ].join(';');
  box.innerHTML = '<span style="display:none;color:#fff;font-size:12px;line-height:1;">✓</span>';
  const tick = box.firstChild;

  const txt = document.createElement('span');
  txt.textContent = String(label || '');

  wrap.appendChild(box); wrap.appendChild(txt);

  let _checked = !!checked;
  let _listeners = [];
  function _sync() {
    tick.style.display = _checked ? 'block' : 'none';
    box.style.background   = _checked ? '#bd93f9' : '#282a36';
    box.style.borderColor  = _checked ? '#bd93f9' : '#6272a4';
  }
  _sync();

  wrap.addEventListener('click', () => {
    if (wrap._disabled) return;
    _checked = !_checked; _sync();
    _listeners.forEach(fn => fn(_checked));
  });

  const v = _view('checkbox', wrap);
  v.x = x||0; v.y = y||0; v.width = 160; v.height = 22;
  v.isChecked  = ()  => _checked;
  v.setChecked = b   => { _checked = !!b; _sync(); return v; };
  v.setLabel   = t   => { txt.textContent = String(t); return v; };
  v.setText    = v.setLabel;
  v.setPosition= (nx,ny) => { v.x=nx; v.y=ny; wrap.style.left=nx+'px'; wrap.style.top=ny+'px'; return v; };
  v.setColor   = c   => { txt.style.color = c; return v; };
  v.enable     = ()  => { wrap._disabled=false; wrap.style.opacity='1'; return v; };
  v.disable    = ()  => { wrap._disabled=true;  wrap.style.opacity='.5'; return v; };
  v.listen     = (event, fn) => { if (event === 'change') _listeners.push(fn); return v; };
  v.onChange   = fn  => v.listen('change', fn);
  return v;
}

/* ── createRadioGroup ─────────────────────────────────────────────────────────
   createRadioGroup(['A','B','C'], x, y) — vertical stack of radio buttons,
   mutually exclusive. .getValue() returns the selected label (or null).
   ─────────────────────────────────────────────────────────────────────────── */
function createRadioGroup(options, x, y, spacing) {
  options = options || []; spacing = spacing || 26;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:'+(x||0)+'px;top:'+(y||0)+'px;';

  const v = _view('radiogroup', wrap);
  v.x = x||0; v.y = y||0; v.width = 160; v.height = spacing*options.length;

  let _selected = null;
  let _listeners = [];
  const _dots = [];

  options.forEach((label, i) => {
    const row = document.createElement('label');
    row.style.cssText = [
      'position:absolute','left:0','top:'+(i*spacing)+'px',
      'display:flex','align-items:center','gap:8px','cursor:pointer',
      'color:#f8f8f2','font-family:inherit','font-size:13px','user-select:none',
    ].join(';');
    const ring = document.createElement('span');
    ring.style.cssText = [
      'width:16px','height:16px','border-radius:50%','flex-shrink:0',
      'border:1.5px solid #6272a4','background:#282a36',
      'display:flex','align-items:center','justify-content:center',
    ].join(';');
    ring.innerHTML = '<span style="display:none;width:8px;height:8px;border-radius:50%;background:#bd93f9;"></span>';
    const dot = ring.firstChild;
    const txt = document.createElement('span'); txt.textContent = String(label);
    row.appendChild(ring); row.appendChild(txt);
    wrap.appendChild(row);
    _dots.push(dot);
    row.addEventListener('click', () => {
      if (wrap._disabled) return;
      _selected = label;
      _dots.forEach(d => d.style.display = 'none');
      dot.style.display = 'block';
      _listeners.forEach(fn => fn(_selected));
    });
  });

  v.getValue   = () => _selected;
  v.setValue   = label => {
    const i = options.indexOf(label);
    if (i === -1) return v;
    _selected = label;
    _dots.forEach((d,j) => d.style.display = (j===i) ? 'block' : 'none');
    return v;
  };
  v.setPosition= (nx,ny) => { v.x=nx; v.y=ny; wrap.style.left=nx+'px'; wrap.style.top=ny+'px'; return v; };
  v.enable     = () => { wrap._disabled=false; wrap.style.opacity='1'; return v; };
  v.disable    = () => { wrap._disabled=true;  wrap.style.opacity='.5'; return v; };
  v.listen     = (event, fn) => { if (event === 'change') _listeners.push(fn); return v; };
  v.onChange   = fn => v.listen('change', fn);
  return v;
}

/* ── createDropdown ───────────────────────────────────────────────────────────
   createDropdown(['A','B','C'], x, y, w) — native <select> styled to match.
   Native <select> is used deliberately: free keyboard nav, mobile support,
   and no custom popup-positioning bugs to chase.
   ─────────────────────────────────────────────────────────────────────────── */
function createDropdown(options, x, y, w, h) {
  options = options || [];
  const el = document.createElement('select');
  el.style.cssText = [
    'position:absolute',
    'left:'+(x||0)+'px','top:'+(y||0)+'px',
    'width:'+(w||160)+'px','height:'+(h||34)+'px',
    'background:#282a36','color:#f8f8f2',
    'border:1.5px solid #6272a4','border-radius:5px',
    'font-family:inherit','font-size:13px',
    'padding:0 8px','outline:none','box-sizing:border-box','cursor:pointer',
  ].join(';');
  el.addEventListener('focus', () => el.style.borderColor = '#bd93f9');
  el.addEventListener('blur',  () => el.style.borderColor = '#6272a4');

  function _rebuild(opts, selectedVal) {
    el.innerHTML = '';
    opts.forEach(o => {
      const opt = document.createElement('option');
      opt.value = String(o); opt.textContent = String(o);
      el.appendChild(opt);
    });
    if (selectedVal !== undefined) el.value = selectedVal;
  }
  _rebuild(options);

  const v = _view('dropdown', el);
  v.x=x||0; v.y=y||0; v.width=w||160; v.height=h||34;
  v.getValue    = ()  => el.value;
  v.setValue    = val => { el.value = String(val); return v; };
  v.getIndex    = ()  => el.selectedIndex;
  v.setIndex    = i   => { el.selectedIndex = i; return v; };
  v.setOptions  = opts=> { _rebuild(opts||[]); return v; };
  v.addOption   = o   => { const opt=document.createElement('option'); opt.value=String(o); opt.textContent=String(o); el.appendChild(opt); return v; };
  v.setPosition = (nx,ny)=>{ v.x=nx; v.y=ny; el.style.left=nx+'px'; el.style.top=ny+'px'; return v; };
  v.setSize     = (nw,nh)=>{ v.width=nw; v.height=nh; el.style.width=nw+'px'; el.style.height=nh+'px'; return v; };
  v.setColor    = (fg,bg)=>{ if(fg) el.style.color=fg; if(bg) el.style.background=bg; return v; };
  v.enable      = ()  => { el.disabled=false; el.style.opacity='1'; return v; };
  v.disable     = ()  => { el.disabled=true;  el.style.opacity='.5'; return v; };
  v.listen = (event, fn) => {
    if (event === 'change') el.addEventListener('change', () => fn(el.value));
    if (event === 'focus')  el.addEventListener('focus',  fn);
    if (event === 'blur')   el.addEventListener('blur',   fn);
    return v;
  };
  v.onChange = fn => v.listen('change', fn);
  return v;
}

/* ── createSlider ─────────────────────────────────────────────────────────── */
function createSlider(min, max, value, x, y, w) {
  min = (min===undefined)?0:min; max = (max===undefined)?100:max;
  value = (value===undefined)? min : value;
  const el = document.createElement('input');
  el.type = 'range'; el.min = min; el.max = max; el.value = value;
  el.style.cssText = [
    'position:absolute',
    'left:'+(x||0)+'px','top:'+(y||0)+'px',
    'width:'+(w||160)+'px','height:20px',
    'accent-color:#bd93f9','cursor:pointer',
  ].join(';');

  const v = _view('slider', el);
  v.x=x||0; v.y=y||0; v.width=w||160; v.height=20;
  v.getValue   = ()  => Number(el.value);
  v.setValue   = n   => { el.value = n; return v; };
  v.setRange   = (mn,mx,step) => { el.min=mn; el.max=mx; if(step) el.step=step; return v; };
  v.setStep    = s   => { el.step = s; return v; };
  v.setPosition= (nx,ny)=>{ v.x=nx; v.y=ny; el.style.left=nx+'px'; el.style.top=ny+'px'; return v; };
  v.setSize    = (nw,nh)=>{ v.width=nw; el.style.width=nw+'px'; return v; };
  v.enable     = ()  => { el.disabled=false; el.style.opacity='1'; return v; };
  v.disable    = ()  => { el.disabled=true;  el.style.opacity='.5'; return v; };
  v.listen = (event, fn) => {
    if (event === 'change') el.addEventListener('input', () => fn(Number(el.value)));
    return v;
  };
  v.onChange = fn => v.listen('change', fn);
  return v;
}

/* ── createProgressBar ────────────────────────────────────────────────────── */
function createProgressBar(x, y, w, h, value, max) {
  x=x||0; y=y||0; w=w||200; h=h||14; max=(max===undefined)?100:max;
  const el = document.createElement('div');
  el.style.cssText = [
    'position:absolute','left:'+x+'px','top:'+y+'px',
    'width:'+w+'px','height:'+h+'px',
    'background:#282a36','border:1px solid #44475a','border-radius:'+(h/2)+'px',
    'overflow:hidden','box-sizing:border-box',
  ].join(';');
  const fill = document.createElement('div');
  fill.style.cssText = 'height:100%;background:#bd93f9;width:0%;transition:width .15s;';
  el.appendChild(fill);

  const v = _view('progressbar', el);
  v.x=x; v.y=y; v.width=w; v.height=h;
  let _val = (value===undefined)?0:value, _max = max;
  function _sync() { fill.style.width = Math.max(0,Math.min(100,(_val/_max)*100))+'%'; }
  _sync();

  v.getValue    = () => _val;
  v.setValue    = n  => { _val = n; _sync(); return v; };
  v.setMax      = m  => { _max = m; _sync(); return v; };
  v.setColor    = c  => { fill.style.background = c; return v; };
  v.setBackground=c  => { el.style.background = c; return v; };
  v.setPosition = (nx,ny)=>{ v.x=nx; v.y=ny; el.style.left=nx+'px'; el.style.top=ny+'px'; return v; };
  v.setSize     = (nw,nh)=>{ v.width=nw; v.height=nh; el.style.width=nw+'px'; el.style.height=nh+'px'; el.style.borderRadius=(nh/2)+'px'; return v; };
  return v;
}

/* ── createTabs ────────────────────────────────────────────────────────────── */
function createTabs(labels, x, y, w, h) {
  labels = labels || []; x=x||0; y=y||0; w=w||400; h=h||300;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:'+x+'px;top:'+y+'px;width:'+w+'px;height:'+h+'px;display:flex;flex-direction:column;';

  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;border-bottom:1px solid #44475a;flex-shrink:0;';
  const body = document.createElement('div');
  body.style.cssText = 'position:relative;flex:1;overflow:hidden;';
  wrap.appendChild(bar); wrap.appendChild(body);

  const v = _view('tabs', wrap);
  v.x=x; v.y=y; v.width=w; v.height=h;
  v.__panes__ = {};
  let _active = null;
  const _tabEls = {};

  labels.forEach(label => {
    const tabEl = document.createElement('div');
    tabEl.textContent = String(label);
    tabEl.style.cssText = [
      'padding:8px 16px','cursor:pointer','color:#f8f8f2','font-family:inherit',
      'font-size:13px','border-bottom:2px solid transparent','user-select:none',
    ].join(';');
    tabEl.addEventListener('click', () => v.selectTab(label));
    bar.appendChild(tabEl);
    _tabEls[label] = tabEl;

    const pane = document.createElement('div');
    pane.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:none;';
    body.appendChild(pane);
    v.__panes__[label] = pane;
  });

  v.addToTab = (label, child) => {
    const pane = v.__panes__[label];
    if (pane && child && child.__el__) {
      child.__el__.style.position = 'absolute';
      child.__el__.style.left = (child.x||0)+'px';
      child.__el__.style.top  = (child.y||0)+'px';
      pane.appendChild(child.__el__);
    }
    return v;
  };
  v.selectTab = label => {
    if (!(label in v.__panes__)) return v;
    _active = label;
    Object.keys(_tabEls).forEach(l => {
      _tabEls[l].style.borderBottomColor = (l===label) ? '#bd93f9' : 'transparent';
      _tabEls[l].style.color = (l===label) ? '#bd93f9' : '#f8f8f2';
      v.__panes__[l].style.display = (l===label) ? 'block' : 'none';
    });
    return v;
  };
  v.getActiveTab = () => _active;
  v.setPosition  = (nx,ny)=>{ v.x=nx; v.y=ny; wrap.style.left=nx+'px'; wrap.style.top=ny+'px'; return v; };
  v.setSize      = (nw,nh)=>{ v.width=nw; v.height=nh; wrap.style.width=nw+'px'; wrap.style.height=nh+'px'; return v; };
  if (labels.length) v.selectTab(labels[0]);
  return v;
}

/* ── createListView ───────────────────────────────────────────────────────────
   Scrollable single-select list. list.setItems(['a','b']), list.getSelected().
   ─────────────────────────────────────────────────────────────────────────── */
function createListView(items, x, y, w, h) {
  items = items || []; x=x||0; y=y||0; w=w||220; h=h||200;
  const el = document.createElement('div');
  el.style.cssText = [
    'position:absolute','left:'+x+'px','top:'+y+'px',
    'width:'+w+'px','height:'+h+'px','overflow-y:auto',
    'background:#1e1e2e','border:1.5px solid #44475a','border-radius:5px',
    'font-family:inherit','font-size:13px','box-sizing:border-box',
  ].join(';');

  const v = _view('listview', el);
  v.x=x; v.y=y; v.width=w; v.height=h;
  let _items = items.slice();
  let _selected = null, _selIndex = -1;
  let _listeners = [];
  const _rowEls = [];

  function _render() {
    el.innerHTML = ''; _rowEls.length = 0;
    _items.forEach((item, i) => {
      const row = document.createElement('div');
      row.textContent = String(item);
      row.style.cssText = [
        'padding:7px 12px','color:#f8f8f2','cursor:pointer','white-space:nowrap',
        'overflow:hidden','text-overflow:ellipsis',
        i===_selIndex ? 'background:#6272a4;' : '',
      ].join(';');
      row.addEventListener('mouseenter', () => { if(i!==_selIndex) row.style.background='#282a36'; });
      row.addEventListener('mouseleave', () => { if(i!==_selIndex) row.style.background='transparent'; });
      row.addEventListener('click', () => v.select(i));
      row.addEventListener('dblclick', () => _listeners.filter(l=>l.ev==='dblclick').forEach(l=>l.fn(item,i)));
      el.appendChild(row);
      _rowEls.push(row);
    });
  }
  _render();

  v.setItems = arr => { _items = (arr||[]).slice(); _selIndex=-1; _selected=null; _render(); return v; };
  v.getItems = () => _items.slice();
  v.addItem  = item => { _items.push(item); _render(); return v; };
  v.removeAt = i => { _items.splice(i,1); if(_selIndex===i){_selIndex=-1;_selected=null;} _render(); return v; };
  v.clearItems = () => { _items=[]; _selIndex=-1; _selected=null; _render(); return v; };
  v.select   = i => {
    if (i<0 || i>=_items.length) return v;
    _selIndex = i; _selected = _items[i];
    _rowEls.forEach((r,j)=> r.style.background = (j===i)?'#6272a4':'transparent');
    _listeners.filter(l=>l.ev==='change').forEach(l=>l.fn(_selected,i));
    return v;
  };
  v.getSelected      = () => _selected;
  v.getSelectedIndex = () => _selIndex;
  v.setPosition = (nx,ny)=>{ v.x=nx; v.y=ny; el.style.left=nx+'px'; el.style.top=ny+'px'; return v; };
  v.setSize     = (nw,nh)=>{ v.width=nw; v.height=nh; el.style.width=nw+'px'; el.style.height=nh+'px'; return v; };
  v.listen = (event, fn) => { _listeners.push({ev:event, fn}); return v; };
  v.onChange = fn => v.listen('change', fn);
  v.onDoubleClick = fn => v.listen('dblclick', fn);
  return v;
}

/* ── createTable ───────────────────────────────────────────────────────────────
   table.setColumns(['Name','Score']); table.setRows([['Ann',10],['Bo',7]]);
   Single-row-select, sortable columns by clicking the header.
   ─────────────────────────────────────────────────────────────────────────── */
function createTable(columns, rows, x, y, w, h) {
  columns = columns || []; rows = rows || [];
  x=x||0; y=y||0; w=w||400; h=h||240;
  const wrap = document.createElement('div');
  wrap.style.cssText = [
    'position:absolute','left:'+x+'px','top:'+y+'px','width:'+w+'px','height:'+h+'px',
    'background:#1e1e2e','border:1.5px solid #44475a','border-radius:5px',
    'overflow:auto','font-family:inherit','font-size:13px','box-sizing:border-box',
  ].join(';');
  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;color:#f8f8f2;';
  wrap.appendChild(table);

  const v = _view('table', wrap);
  v.x=x; v.y=y; v.width=w; v.height=h;
  let _cols = columns.slice(), _rows = rows.map(r=>r.slice());
  let _selIndex = -1, _listeners = [];

  function _render() {
    table.innerHTML = '';
    const thead = document.createElement('thead');
    const htr = document.createElement('tr');
    _cols.forEach((c,ci) => {
      const th = document.createElement('th');
      th.textContent = String(c);
      th.style.cssText = 'text-align:left;padding:8px 12px;background:#282a36;border-bottom:1px solid #44475a;position:sticky;top:0;cursor:pointer;user-select:none;';
      th.addEventListener('click', () => {
        _rows.sort((a,b)=> String(a[ci]).localeCompare(String(b[ci]), undefined, {numeric:true}));
        _render();
      });
      htr.appendChild(th);
    });
    thead.appendChild(htr); table.appendChild(thead);

    const tbody = document.createElement('tbody');
    _rows.forEach((row,ri) => {
      const tr = document.createElement('tr');
      tr.style.cssText = 'cursor:pointer;' + (ri===_selIndex ? 'background:#6272a4;' : '');
      tr.addEventListener('mouseenter', () => { if(ri!==_selIndex) tr.style.background='#282a36'; });
      tr.addEventListener('mouseleave', () => { if(ri!==_selIndex) tr.style.background='transparent'; });
      tr.addEventListener('click', () => v.selectRow(ri));
      row.forEach(cell => {
        const td = document.createElement('td');
        td.textContent = String(cell);
        td.style.cssText = 'padding:7px 12px;border-bottom:1px solid #282a36;';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }
  _render();

  v.setColumns = cols => { _cols = (cols||[]).slice(); _render(); return v; };
  v.setRows    = rws  => { _rows = (rws||[]).map(r=>r.slice()); _selIndex=-1; _render(); return v; };
  v.addRow     = row  => { _rows.push(row); _render(); return v; };
  v.removeRow  = i    => { _rows.splice(i,1); if(_selIndex===i)_selIndex=-1; _render(); return v; };
  v.getRows    = () => _rows.map(r=>r.slice());
  v.selectRow  = i => { _selIndex=i; _render(); _listeners.forEach(fn=>fn(_rows[i],i)); return v; };
  v.getSelectedRow = () => _selIndex>=0 ? _rows[_selIndex] : null;
  v.setPosition= (nx,ny)=>{ v.x=nx; v.y=ny; wrap.style.left=nx+'px'; wrap.style.top=ny+'px'; return v; };
  v.setSize    = (nw,nh)=>{ v.width=nw; v.height=nh; wrap.style.width=nw+'px'; wrap.style.height=nh+'px'; return v; };
  v.listen = (event, fn) => { if (event==='change') _listeners.push(fn); return v; };
  v.onChange = fn => v.listen('change', fn);
  return v;
}

/* ── attachTooltip ─────────────────────────────────────────────────────────────
   attachTooltip(anyWidget, "Explains this button") — hover-activated tooltip
   anchored to an existing widget. Works on any view with an __el__.
   ─────────────────────────────────────────────────────────────────────────── */
function attachTooltip(widget, text) {
  if (!widget || !widget.__el__ || !widget.__el__.addEventListener) return widget;
  const target = widget.__el__;
  let tipEl = null;
  function show(e) {
    tipEl = document.createElement('div');
    tipEl.textContent = String(text);
    tipEl.style.cssText = [
      'position:fixed','pointer-events:none','z-index:99999',
      'background:#282a36','color:#f8f8f2','border:1px solid #6272a4',
      'border-radius:4px','padding:5px 9px','font-family:inherit','font-size:12px',
      'box-shadow:0 4px 12px #0007','white-space:nowrap',
    ].join(';');
    document.body.appendChild(tipEl);
    const r = target.getBoundingClientRect();
    tipEl.style.left = r.left + 'px';
    tipEl.style.top  = (r.bottom + 6) + 'px';
  }
  function hide() { if (tipEl) { tipEl.remove(); tipEl = null; } }
  target.addEventListener('mouseenter', show);
  target.addEventListener('mouseleave', hide);
  target.addEventListener('mousedown',  hide);
  widget.setTooltip = t => { text = t; return widget; };
  widget.removeTooltip = () => { hide(); target.removeEventListener('mouseenter', show); target.removeEventListener('mouseleave', hide); return widget; };
  return widget;
}

/* ── createContextMenu ────────────────────────────────────────────────────────
   createContextMenu([{label:'Copy',fn:...},{label:'Delete',fn:...}])
   .attachTo(widget) shows it on right-click; .showAt(x,y) shows it anywhere.
   ─────────────────────────────────────────────────────────────────────────── */
function createContextMenu(items) {
  items = items || [];
  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed','display:none','min-width:160px','z-index:99999',
    'background:#282a36','border:1px solid #44475a','border-radius:4px',
    'box-shadow:0 8px 24px #0007','padding:4px 0',
    'font-family:inherit','font-size:13px',
  ].join(';');
  document.body.appendChild(el);

  function _render() {
    el.innerHTML = '';
    items.forEach(it => {
      if (it === '-' || it.separator) {
        const sep = document.createElement('div');
        sep.style.cssText = 'height:1px;background:#44475a;margin:4px 0;';
        el.appendChild(sep);
        return;
      }
      const row = document.createElement('div');
      row.textContent = String(it.label || '');
      row.style.cssText = 'padding:6px 16px;color:#f8f8f2;cursor:pointer;white-space:nowrap;';
      row.addEventListener('mouseenter', () => row.style.background = '#6272a4');
      row.addEventListener('mouseleave', () => row.style.background = 'transparent');
      row.addEventListener('mousedown', e => {
        e.stopPropagation();
        menu.hide();
        if (typeof it.fn === 'function') it.fn();
      });
      el.appendChild(row);
    });
  }
  _render();

  function _outside(e) { if (!el.contains(e.target)) menu.hide(); }

  const menu = {
    __el__: el,
    setItems: arr => { items = arr || []; _render(); return menu; },
    showAt: (x, y) => {
      el.style.left = x+'px'; el.style.top = y+'px'; el.style.display = 'block';
      setTimeout(() => document.addEventListener('mousedown', _outside, { once:true }), 0);
      return menu;
    },
    hide: () => { el.style.display = 'none'; return menu; },
    attachTo: widget => {
      if (widget && widget.__el__) {
        widget.__el__.addEventListener('contextmenu', e => { e.preventDefault(); menu.showAt(e.clientX, e.clientY); });
      } else {
        document.addEventListener('contextmenu', e => { e.preventDefault(); menu.showAt(e.clientX, e.clientY); });
      }
      return menu;
    },
  };
  return menu;
}

/* ── showToast ─────────────────────────────────────────────────────────────────
   showToast("Saved!", { type:'success', duration:2500 }) — a small dismissing
   notification in the corner of the screen, non-blocking (unlike showAlert).
   ─────────────────────────────────────────────────────────────────────────── */
function showToast(msg, opts) {
  opts = opts || {};
  const colors = { info:'#6272a4', success:'#50fa7b', error:'#ff5555', warning:'#f1fa8c' };
  const bg = colors[opts.type] || colors.info;
  const el = document.createElement('div');
  el.textContent = String(msg);
  el.style.cssText = [
    'position:fixed','right:20px','bottom:20px','z-index:999999',
    'background:#282a36','color:#f8f8f2','border-left:4px solid '+bg,
    'border-radius:5px','padding:12px 18px','font-family:"JetBrains Mono","Fira Code",Consolas,monospace',
    'font-size:13px','box-shadow:0 8px 24px #0007',
    'opacity:0','transform:translateY(12px)','transition:opacity .2s,transform .2s',
  ].join(';');
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity='1'; el.style.transform='translateY(0)'; });
  const duration = opts.duration || 2500;
  setTimeout(() => {
    el.style.opacity = '0'; el.style.transform = 'translateY(12px)';
    setTimeout(() => el.remove(), 220);
  }, duration);
  return { close: () => el.remove() };
}

function showAlert(msg, title) {
  const win = createWindow(360, 160);
  win.setTitle(title || 'Alert');
  win.move(Math.max(0,window.innerWidth/2-180), Math.max(0,window.innerHeight/2-80));
  const sc = createScene('open');
  const lbl = createLabel(String(msg), 20, 16);
  lbl.setFont(null, 13);
  const ok = createButton('OK', 140, 96, 80, 34);
  ok.setColor('#1e1e2e','#50fa7b');
  ok.__el__.addEventListener('click', () => win.close());
  sc.add(lbl); sc.add(ok);
  win.setScene(sc);
  return win;
}

function showPrompt(msg, cb, title) {
  const win = createWindow(380, 190);
  win.setTitle(title || 'Input');
  win.move(Math.max(0,window.innerWidth/2-190), Math.max(0,window.innerHeight/2-95));
  const sc  = createScene('open');
  const lbl = createLabel(String(msg), 20, 16);
  const inp = createInput('', 20, 56, 340, 32);
  const ok  = createButton('OK',     210, 112, 70, 32);
  const no  = createButton('Cancel', 290, 112, 80, 32);
  ok.setColor('#1e1e2e','#50fa7b');
  no.setColor('#f8f8f2','#ff5555');
  ok.__el__.addEventListener('click',()=>{ const val=inp.getValue(); win.close(); if(cb)cb(val); });
  no.__el__.addEventListener('click',()=>{ win.close(); if(cb)cb(null); });
  sc.add(lbl); sc.add(inp); sc.add(ok); sc.add(no);
  win.setScene(sc);
  setTimeout(()=>inp.focus(), 60);
  return win;
}

/* ── confirmBox ───────────────────────────────────────────────────────────────
   Yes/No confirmation dialog — e.g. "Discard unsaved changes?" — distinct from
   showPrompt (which asks for typed text).
   ─────────────────────────────────────────────────────────────────────────── */
function confirmBox(msg, cb, title) {
  const win = createWindow(360, 150);
  win.setTitle(title || 'Confirm');
  win.move(Math.max(0,window.innerWidth/2-180), Math.max(0,window.innerHeight/2-75));
  const sc  = createScene('open');
  const lbl = createLabel(String(msg), 20, 16);
  lbl.setFont(null, 13);
  const yes = createButton('Yes', 130, 90, 90, 34);
  const noB = createButton('No',  230, 90, 90, 34);
  yes.setColor('#1e1e2e','#50fa7b');
  noB.setColor('#f8f8f2','#ff5555');
  yes.__el__.addEventListener('click', () => { win.close(); if (cb) cb(true); });
  noB.__el__.addEventListener('click', () => { win.close(); if (cb) cb(false); });
  sc.add(lbl); sc.add(yes); sc.add(noB);
  win.setScene(sc);
  return win;
}

function loadWebImage(src, cb) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  const v = _view('image', null);
  v.__img__ = img;
  v.ready   = false;
  img.onload  = () => { v.ready=true; v.width=img.naturalWidth; v.height=img.naturalHeight; if(cb)cb(v); };
  img.onerror = () => { v.ready=false; if(cb)cb(null); };
  img.src = src;
  return v;
}

function openImage(cb) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
  document.body.appendChild(inp);
  inp.addEventListener('change', () => {
    const f = inp.files[0];
    if (!f) { document.body.removeChild(inp); return; }
    const url = URL.createObjectURL(f);
    loadWebImage(url, cb);
    document.body.removeChild(inp);
  });
  inp.click();
}

function _lighten(hex) {
  try {
    const n = parseInt(hex.replace('#',''),16);
    const r = Math.min(255,((n>>16)&255)+30);
    const g = Math.min(255,((n>>8 )&255)+30);
    const b = Math.min(255,( n     &255)+30);
    return '#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');
  } catch(_) { return hex; }
}

/* ── game math utilities ──────────────────────────────────────────────────────
   Plain helper functions for canvas/game code — clamping, interpolation,
   random ranges, distance and collision checks. No widget/DOM involved.
   ─────────────────────────────────────────────────────────────────────────── */
function clamp(v, lo, hi)      { return Math.min(hi, Math.max(lo, v)); }
function lerp(a, b, t)         { return a + (b - a) * t; }
function randRange(lo, hi)     { return lo + Math.random() * (hi - lo); }
function randInt(lo, hi)       { return Math.floor(randRange(lo, hi + 1)); }
function dist2D(x1, y1, x2, y2){ const dx=x2-x1, dy=y2-y1; return Math.sqrt(dx*dx+dy*dy); }
function rectsOverlap(a, b) {
  return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
}
function circleOverlap(a, b) {
  return dist2D(a.x,a.y,b.x,b.y) < (a.r + b.r);
}
function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x+r.w && py >= r.y && py <= r.y+r.h;
}

/* ── createSpriteAnim ─────────────────────────────────────────────────────────
   Frame-based sprite-sheet animator. sheet is the view returned by loadImage
   (or pickImage). Call anim.update(dt) once per frame, anim.draw(cvs,x,y,scale)
   to render the current frame — drawImage's new sx/sy/sw/sh args do the actual
   sprite-sheet clipping.
     const walk = createSpriteAnim(sheet, 32,32, 6, 10); // 6 frames @ 10fps
     walk.update(dt); walk.draw(cvs, player.x, player.y);
   ─────────────────────────────────────────────────────────────────────────── */
function createSpriteAnim(sheet, frameW, frameH, frameCount, fps, cols) {
  fps = fps || 10; cols = cols || frameCount;
  let _t = 0, _frame = 0, _playing = true, _loopAnim = true;
  const anim = {
    frameW, frameH, frameCount,
    setFPS   : f => { fps = f; return anim; },
    play     : () => { _playing = true; return anim; },
    pause    : () => { _playing = false; return anim; },
    stop     : () => { _playing = false; _frame = 0; _t = 0; return anim; },
    setLoop  : b => { _loopAnim = !!b; return anim; },
    gotoFrame: n => { _frame = ((n % frameCount) + frameCount) % frameCount; return anim; },
    getFrame : () => _frame,
    isDone   : () => (!_loopAnim && _frame === frameCount-1),
    update   : dt => {
      if (!_playing) return anim;
      _t += dt;
      const perFrame = 1/fps;
      while (_t >= perFrame) {
        _t -= perFrame;
        if (_frame < frameCount-1) _frame++;
        else if (_loopAnim) _frame = 0;
        else { _playing = false; break; }
      }
      return anim;
    },
    draw: (cvs, x, y, scale) => {
      scale = scale || 1;
      const col = _frame % cols, row = Math.floor(_frame / cols);
      cvs.drawImage(sheet, x, y, frameW*scale, frameH*scale, col*frameW, row*frameH, frameW, frameH);
      return anim;
    },
  };
  return anim;
}

/* ── loadSound / playSound ────────────────────────────────────────────────────
   Thin wrapper over HTMLAudioElement — enough for SFX/music in a game without
   pulling in Web Audio API complexity. Returns a controllable handle.
   ─────────────────────────────────────────────────────────────────────────── */
function loadSound(src, opts) {
  opts = opts || {};
  const audio = new Audio(src);
  audio.loop   = !!opts.loop;
  audio.volume = (opts.volume === undefined) ? 1 : opts.volume;
  audio.preload = 'auto';
  const s = { __audio__: audio, ready: false };
  audio.addEventListener('canplaythrough', () => { s.ready = true; }, { once: true });
  s.play    = () => { audio.currentTime = 0; audio.play().catch(()=>{}); return s; };
  s.resume  = () => { audio.play().catch(()=>{}); return s; };
  s.pause   = () => { audio.pause(); return s; };
  s.stop    = () => { audio.pause(); audio.currentTime = 0; return s; };
  s.setVolume = v => { audio.volume = clamp(v,0,1); return s; };
  s.setLoop   = b => { audio.loop = !!b; return s; };
  s.isPlaying = () => !audio.paused && !audio.ended;
  return s;
}
function playSound(src, opts) { const s = loadSound(src, opts); s.play(); return s; }

/* ── saveTextFile / openTextFile ─────────────────────────────────────────────
   The other missing piece for a Notepad clone: getting text in and out of the
   browser sandbox. saveTextFile triggers a normal browser download; openTextFile
   pops the native file picker and reads the chosen file as text. Works the
   same way whether gui.js is loaded in a plain page or an Electron renderer.
   ─────────────────────────────────────────────────────────────────────────── */
function saveTextFile(filename, content) {
  filename = String(filename || 'untitled.txt');
  const blob = new Blob([String(content == null ? '' : content)], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

function openTextFile(cb, accept) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = accept || '.txt,.zpp,.zl,.md,.json,text/plain';
  inp.style.display = 'none';
  document.body.appendChild(inp);
  inp.addEventListener('change', () => {
    const f = inp.files[0];
    document.body.removeChild(inp);
    if (!f) { if (cb) cb(null, null); return; }
    const reader = new FileReader();
    reader.onload = () => { if (cb) cb(String(reader.result), f.name); };
    reader.onerror= () => { if (cb) cb(null, null); };
    reader.readAsText(f);
  });
  inp.click();
}

/* ── onGlobalKey ──────────────────────────────────────────────────────────────
   Register a keyboard shortcut like "ctrl+s" / "ctrl+shift+n" against the
   whole document — needed for Notepad-style Save/Open/New shortcuts that
   should fire no matter which widget has focus.
   ─────────────────────────────────────────────────────────────────────────── */
function onGlobalKey(combo, fn) {
  const parts = String(combo).toLowerCase().split('+').map(p => p.trim());
  const wantCtrl  = parts.includes('ctrl')  || parts.includes('cmd') || parts.includes('meta');
  const wantShift = parts.includes('shift');
  const wantAlt   = parts.includes('alt');
  const key = parts.filter(p => !['ctrl','cmd','meta','shift','alt'].includes(p)).pop();
  const handler = e => {
    const ctrlOk = wantCtrl ? (e.ctrlKey || e.metaKey) : true;
    if (ctrlOk && (e.shiftKey === wantShift) && (e.altKey === wantAlt) && e.key.toLowerCase() === key) {
      e.preventDefault();
      fn(e);
    }
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler); // returns an unregister fn
}

/* ── DSALibraries registration (browser) ── */
if (typeof DSALibraries !== 'undefined') {
  DSALibraries['gui.zl'] = {
    description: 'Full GUI: Window, Scene, Button, Label, TextField, Canvas, Screen, Camera, Panel + game loops + image loading',
    inject(G) {
      if (typeof window !== 'undefined' && window.__ZPP__) {
        window.__ZPP__.registerBuiltins([
          'Window', 'Scene', 'Button', 'Label', 'TextField', 'TextArea', 'CodeEditor',
          'Canvas', 'Screen', 'Camera', 'Panel', 'Dialog', 'AskBox', 'ConfirmBox', 'Toast', 'make',
          'MenuBar', 'StatusBar', 'ContextMenu',
          'Checkbox', 'RadioGroup', 'Dropdown', 'Slider', 'ProgressBar', 'Tabs', 'ListView', 'Table',
          'loadImage', 'pickImage', 'saveTextFile', 'openTextFile', 'onGlobalKey',
          'loadSound', 'playSound', 'createSpriteAnim', 'attachTooltip',
          'rgb', 'rgba', 'hex',
          'clamp', 'lerp', 'randRange', 'randInt', 'dist2D', 'rectsOverlap', 'circleOverlap', 'pointInRect',
          'isWidget', 'closeAll', 'allWindows', 'viewPrint',
          'clear', 'fill',
          'drawRect', 'drawCircle', 'drawText', 'drawLine',
          'drawPoly', 'drawArc', 'drawImage',
          'setFont', 'setAlpha',
          'save', 'restore', 'translate', 'rotate', 'scale2',
          'measureText', 'toDataURL',
          'loop', 'stopLoop', 'getFPS',
          'isKeyDown', 'onKey', 'onKeyUp', 'onClick', 'onMouse',
          'setTitle', 'setBackground', 'setScene', 'move', 'close',
          'resize', 'setLayout', 'add', 'remove',
          'getValue', 'setValue', 'setLabel', 'setText', 'setParts',
          'setColor', 'setFontSize', 'setAlign', 'setWrap', 'setReadOnly',
          'setTabSize', 'setPlaceholder', 'insertAtCursor', 'getSelection',
          'selectAll', 'getCursorLine', 'getCursorColumn', 'getLineCount',
          'getWordCount', 'getCharCount', 'undo', 'redo',
          'setLanguage', 'getLanguage', 'gotoLine', 'findNext', 'replaceSelection',
          'isChecked', 'setChecked', 'getIndex', 'setIndex', 'setOptions', 'addOption',
          'setRange', 'setStep', 'setMax', 'addToTab', 'selectTab', 'getActiveTab',
          'setItems', 'getItems', 'addItem', 'removeAt', 'clearItems', 'select',
          'getSelected', 'getSelectedIndex', 'onDoubleClick', 'onChange',
          'setColumns', 'setRows', 'addRow', 'removeRow', 'getRows', 'selectRow', 'getSelectedRow',
          'setVolume', 'setLoop', 'isPlaying', 'resume', 'setTooltip', 'removeTooltip',
          'setFPS', 'play', 'pause', 'stop', 'gotoFrame', 'getFrame', 'isDone', 'update', 'draw',
          'setPosition', 'setSize',
          'enable', 'disable', 'listen',
          'getCtx', 'scale2',
          'moveTo', 'zoomTo', 'follow', 'apply', 'reset',
          'addMenu', 'addItem', 'addSeparator', 'showAt', 'hide', 'attachTo',
        ]);
        window.__ZPP__.registerTypes(['view']);
      }

      G.Window    = (w,h)          => createWindow(w,h);
      G.Scene     = (layout)       => createScene(layout);
      G.Button    = (l,x,y,w,h)   => createButton(l,x,y,w,h);
      G.Label     = (t,x,y)        => createLabel(t,x,y);
      G.TextField = (h,x,y,w,ht)  => createInput(h,x,y,w,ht);
      G.TextArea  = (t,x,y,w,ht)  => createTextArea(t,x,y,w,ht);
      G.CodeEditor= (t,x,y,w,ht,o)=> createCodeEditor(t,x,y,w,ht,o);
      G.Canvas    = (w,h)          => createCanvas(w,h);
      G.Screen    = (w,h)          => createScreen(w,h);
      G.Camera    = (cvs)          => createCamera(cvs);
      G.Panel     = (x,y,w,h,c)   => createPanel(x,y,w,h,c);
      G.MenuBar   = (w)            => createMenuBar(w);
      G.StatusBar = (t,w)          => createStatusBar(t,w);
      G.ContextMenu=(items)        => createContextMenu(items);
      G.Checkbox  = (l,x,y,c)      => createCheckbox(l,x,y,c);
      G.RadioGroup= (opts,x,y,s)  => createRadioGroup(opts,x,y,s);
      G.Dropdown  = (opts,x,y,w,h)=> createDropdown(opts,x,y,w,h);
      G.Slider    = (mn,mx,val,x,y,w) => createSlider(mn,mx,val,x,y,w);
      G.ProgressBar=(x,y,w,h,val,max)=> createProgressBar(x,y,w,h,val,max);
      G.Tabs      = (labels,x,y,w,h)  => createTabs(labels,x,y,w,h);
      G.ListView  = (items,x,y,w,h)   => createListView(items,x,y,w,h);
      G.Table     = (cols,rows,x,y,w,h)=> createTable(cols,rows,x,y,w,h);
      G.Dialog    = (m,t)          => showAlert(m,t);
      G.AskBox    = (m,cb,t)       => showPrompt(m,cb,t);
      G.ConfirmBox= (m,cb,t)       => confirmBox(m,cb,t);
      G.Toast     = (m,opts)       => showToast(m,opts);

      G.make = (type, ...args) => {
        if (typeof type === 'function') return type(...args);
        const map = {
          window:createWindow, scene:createScene, button:createButton,
          label:createLabel, textfield:createInput, textarea:createTextArea,
          codeeditor:createCodeEditor,
          canvas:createCanvas, screen:createScreen, camera:createCamera,
          panel:createPanel, menubar:createMenuBar, statusbar:createStatusBar,
          checkbox:createCheckbox, radiogroup:createRadioGroup, dropdown:createDropdown,
          slider:createSlider, progressbar:createProgressBar, tabs:createTabs,
          listview:createListView, table:createTable, contextmenu:createContextMenu,
        };
        const fn = map[String(type).toLowerCase()];
        if (!fn) throw new Error('make: unknown view type "'+type+'"');
        return fn(...args);
      };

      G.loadImage    = (src,cb)          => loadWebImage(src,cb);
      G.pickImage    = cb                => openImage(cb);
      G.saveTextFile = (filename,content)=> saveTextFile(filename,content);
      G.openTextFile = (cb,accept)       => openTextFile(cb,accept);
      G.onGlobalKey  = (combo,fn)        => onGlobalKey(combo,fn);
      G.loadSound    = (src,opts)        => loadSound(src,opts);
      G.playSound    = (src,opts)        => playSound(src,opts);
      G.createSpriteAnim = (sheet,fw,fh,fc,fps,cols) => createSpriteAnim(sheet,fw,fh,fc,fps,cols);
      G.attachTooltip= (widget,text)     => attachTooltip(widget,text);

      G.rgb  = (r,g,b)   => 'rgb('+r+','+g+','+b+')';
      G.rgba = (r,g,b,a) => 'rgba('+r+','+g+','+b+','+a+')';
      G.hex  = c         => String(c);

      G.clamp  = (v,lo,hi) => clamp(v,lo,hi);
      G.lerp   = (a,b,t)   => lerp(a,b,t);
      G.randRange = (lo,hi)=> randRange(lo,hi);
      G.randInt   = (lo,hi)=> randInt(lo,hi);
      G.dist2D    = (x1,y1,x2,y2) => dist2D(x1,y1,x2,y2);
      G.rectsOverlap = (a,b) => rectsOverlap(a,b);
      G.circleOverlap= (a,b) => circleOverlap(a,b);
      G.pointInRect  = (px,py,r) => pointInRect(px,py,r);

      G.isWidget  = v => !!(v && v.__type__ === 'view');
      G.closeAll  = () => { _windows.forEach(w=>{if(w.__el__)w.__el__.remove();}); _windows=[]; };
      G.allWindows= () => [..._windows];
      G.viewPrint = (win, text) => {
        if (!win || !win.__body__) return;
        const d = document.createElement('div');
        d.style.cssText = 'color:#f8f8f2;font-family:monospace;font-size:12px;padding:1px 8px;';
        d.textContent = String(text);
        win.__body__.appendChild(d);
        win.__body__.scrollTop = win.__body__.scrollHeight;
      };
    }
  };
}

if (typeof module !== 'undefined') module.exports = {
  createWindow, createScene, createButton, createLabel,
  createInput, createTextArea, createCodeEditor, createCanvas, createScreen, createCamera,
  createPanel, createMenuBar, createStatusBar, createContextMenu,
  createCheckbox, createRadioGroup, createDropdown, createSlider, createProgressBar,
  createTabs, createListView, createTable, attachTooltip,
  showAlert, showPrompt, confirmBox, showToast, saveTextFile, openTextFile, onGlobalKey,
  loadSound, playSound, createSpriteAnim,
  clamp, lerp, randRange, randInt, dist2D, rectsOverlap, circleOverlap, pointInRect,
};

return; // end browser mode
} // end if (_isBrowser)


/* ═════════════════════════════════════════════════════════════════════════════
   ELECTRON / CLI MODE  —  gui.zl
   • Launch your app with:  electron main.js
   • gui.js is loaded in the Electron renderer (index.html) — browser mode
     above runs automatically. No nodegui, no cmake, no C++ required.
   • This section is only reached when gui.js is require()'d directly from
     Node.js main process. It provides safe stubs + helpful error messages.

   Setup:
     npm install electron --save-dev
     (then see main.js + index.html setup below in README)
   ═════════════════════════════════════════════════════════════════════════════ */

/* ── Detect Electron context ─────────────────────────────────────────────── */
const _isElectronMain = (
  typeof process !== 'undefined' &&
  process.versions &&
  process.versions.electron &&
  typeof window === 'undefined'
);

const _isPlainNode = !_isElectronMain;

/* ── Colour helper (shared with stubs) ───────────────────────────────────── */
function _lighten(hex) {
  try {
    const n = parseInt(hex.replace('#',''),16);
    const r = Math.min(255,((n>>16)&255)+30);
    const g = Math.min(255,((n>>8 )&255)+30);
    const b = Math.min(255,( n     &255)+30);
    return '#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');
  } catch(_) { return hex; }
}

/* ── View wrapper stub ───────────────────────────────────────────────────── */
function _view(kind, el) {
  return {
    __type__     : 'view',
    __viewKind__ : kind,
    __el__       : el || {},
    __children__ : [],
    x: 0, y: 0, width: 0, height: 0,
  };
}

/* ── Shared state ─────────────────────────────────────────────────────────── */
let _windows = [];

/* ── Helper: warn once per call site ─────────────────────────────────────── */
function _warnCLI(fn) {
  console.warn(
    '\n[gui.zl] \'' + fn + '\' called outside Electron renderer.\n' +
    '  ➜  Load gui.js inside index.html, not from Node main process.\n' +
    '  ➜  Run:  electron main.js\n'
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   ALL FUNCTIONS BELOW have the EXACT same signature as the browser / nodegui
   versions. Zero API changes — only the backend changed to Electron.
   ══════════════════════════════════════════════════════════════════════════════ */

/* ── createWindow ─────────────────────────────────────────────────────────── */
function createWindow(w, h) {
  _warnCLI('createWindow');
  w = w||400; h = h||300;
  const v       = _view('window', null);
  v.width = w; v.height = h;
  v.__central__ = null;
  v.__body__    = null;
  v.__vpY__     = 0;

  v.setTitle      = t      => v;
  v.setBackground = c      => v;
  v.show          = ()     => v;
  v.hide          = ()     => v;
  v.close         = ()     => { _windows = _windows.filter(x=>x!==v); };
  v.move          = (x,y)  => v;
  v.resize        = (nw,nh)=> { v.width=nw; v.height=nh; return v; };
  v.onClose       = fn     => v;
  v.loadImage     = src    => v;
  v.setScene      = scene  => v;

  _windows.push(v);
  return v;
}

/* ── createScene ──────────────────────────────────────────────────────────── */
function createScene(layout) {
  layout = layout || 'open';
  const v = _view('scene', null);
  v.__layout__ = layout;

  v.add       = child => { if(child) v.__children__.push(child); return v; };
  v.remove    = child => { v.__children__ = v.__children__.filter(c=>c!==child); return v; };
  v.clear     = ()    => { v.__children__ = []; return v; };
  v.setLayout = (type, cols, rows) => { v.__layout__=type; return v; };

  return v;
}

/* ── createButton ─────────────────────────────────────────────────────────── */
function createButton(label, x, y, w, h) {
  label = (label===undefined||label===null) ? 'Button' : String(label);
  x=x||0; y=y||0; w=w||90; h=h||36;

  const v = _view('button', null);
  v.x=x; v.y=y; v.width=w; v.height=h;

  v.listen       = (event, fn) => v;
  v.pressed      = ()          => ({ do: fn => ({ _fn: fn }) });
  v.work         = handler     => v;
  v.setLabel     = t           => v;
  v.setText      = t           => v;
  v.setColor     = (fg,bg)     => v;
  v.setBackground= bg          => v;
  v.setFontSize  = s           => v;
  v.setRadius    = r           => v;
  v.setBorder    = (c,bw)      => v;
  v.setPosition  = (nx,ny)     => { v.x=nx; v.y=ny; return v; };
  v.setSize      = (nw,nh)     => { v.width=nw; v.height=nh; return v; };
  v.enable       = ()          => v;
  v.disable      = ()          => v;

  return v;
}

/* ── createLabel ──────────────────────────────────────────────────────────── */
function createLabel(text, x, y) {
  x=x||0; y=y||0;
  const v = _view('label', null);
  v.x=x; v.y=y; v.width=200; v.height=24;

  v.setText      = t           => v;
  v.setColor     = c           => v;
  v.setFontSize  = s           => v;
  v.setFont      = (fam,sz,wt) => v;
  v.setAlign     = a           => v;
  v.setBackground= c           => v;
  v.setPosition  = (nx,ny)     => { v.x=nx; v.y=ny; return v; };
  v.setSize      = (nw,nh)     => { v.width=nw; v.height=nh; return v; };

  return v;
}

/* ── createInput ──────────────────────────────────────────────────────────── */
function createInput(hint, x, y, w, h) {
  x=x||0; y=y||0; w=w||160; h=h||34;
  let _val = '';

  const v = _view('input', null);
  v.x=x; v.y=y; v.width=w; v.height=h;

  v.getValue  = ()        => _val;
  v.setValue  = t         => { _val=String(t); return v; };
  v.clear     = ()        => { _val=''; return v; };
  v.focus     = ()        => v;
  v.setPosition = (nx,ny) => { v.x=nx; v.y=ny; return v; };
  v.setSize     = (nw,nh) => { v.width=nw; v.height=nh; return v; };
  v.setColor    = (fg,bg) => v;
  v.setFontSize = s       => v;
  v.setReadOnly = ro      => v;
  v.enable      = ()      => v;
  v.disable     = ()      => v;
  v.listen    = (event,fn)=> v;

  return v;
}

/* ── createTextArea (Node stub) ───────────────────────────────────────────── */
function createTextArea(text, x, y, w, h) {
  x=x||0; y=y||0; w=w||400; h=h||250;
  let _val = String(text == null ? '' : text);

  const v = _view('textarea', null);
  v.x=x; v.y=y; v.width=w; v.height=h;

  v.getValue   = ()      => _val;
  v.setValue   = t       => { _val=String(t==null?'':t); return v; };
  v.clear      = ()      => { _val=''; return v; };
  v.focus      = ()      => v;
  v.setPosition= (nx,ny) => { v.x=nx; v.y=ny; return v; };
  v.setSize    = (nw,nh) => { v.width=nw; v.height=nh; return v; };
  v.setColor   = (fg,bg) => v;
  v.setFont    = (fam,sz)=> v;
  v.setFontSize= s       => v;
  v.setWrap    = on      => v;
  v.setReadOnly= ro      => v;
  v.setTabSize = (n,sp)  => v;
  v.setPlaceholder = t   => v;
  v.insertAtCursor = txt => { _val += String(txt); return v; };
  v.getSelection   = () => '';
  v.selectAll      = () => v;
  v.getCursorLine  = () => _val.split('\n').length;
  v.getCursorColumn= () => 1;
  v.getLineCount   = () => _val.split('\n').length;
  v.getWordCount   = () => { const t=_val.trim(); return t===''?0:t.split(/\s+/).length; };
  v.getCharCount   = () => _val.length;
  v.undo           = () => v;
  v.redo           = () => v;
  v.listen         = (event,fn) => v;

  return v;
}

/* ── createCanvas ─────────────────────────────────────────────────────────── */
function createCanvas(w, h) {
  w=w||400; h=h||300;

  const v = _view('canvas', null);
  v.width=w; v.height=h;
  v.__ctx__    = null;
  v.__canvas__ = null;
  v.__keys__   = {};
  v._flush     = () => {};

  /* drawing API — all no-ops in main process; real drawing happens in renderer */
  v.getCtx     = ()                    => null;
  v.clear      = bg                    => v;
  v.fill       = c                     => v;
  v.drawRect   = (x,y,rw,rh,c,filled) => v;
  v.drawCircle = (x,y,r,c,filled)     => v;
  v.drawText   = (t,x,y,c,sz,fam)     => v;
  v.drawLine   = (x1,y1,x2,y2,c,lw)  => v;
  v.drawPoly   = (pts,c,filled)        => v;
  v.drawArc    = (x,y,r,sa,ea,c,f)    => v;
  v.drawImage  = (img,x,y,iw,ih,sx,sy,sw,sh) => v;
  v.setFont    = (sz,fam)              => v;
  v.setAlpha   = a                     => v;
  v.save       = ()                    => v;
  v.restore    = ()                    => v;
  v.translate  = (x,y)                => v;
  v.rotate     = deg                   => v;
  v.scale2     = (sx,sy)              => v;
  v.measureText= t                     => 0;
  v.setSize    = (nw,nh)              => { v.width=nw; v.height=nh; return v; };
  v.toDataURL  = ()                    => '';

  v.isKeyDown = k  => false;
  v.onKey     = fn => v;
  v.onKeyUp   = fn => v;
  v.onClick   = fn => v;
  v.onMouse   = (ev,fn) => v;
  v.focus     = ()      => v;

  v.loop = (fn, fps) => v;
  v.stopLoop = ()    => v;
  v.getFPS   = ()    => 0;

  return v;
}

/* ── createScreen ─────────────────────────────────────────────────────────── */
function createScreen(w, h) {
  const win = createWindow(w||600, h||432);
  const cvs = createCanvas(w||600, (h||432)-32);

  const scene = createScene('open');
  cvs.x=0; cvs.y=0;
  scene.add(cvs);
  win.setScene(scene);
  win.__viewKind__ = 'screen';
  win.canvas = cvs;

  const proxy = [
    'clear','fill','drawRect','drawCircle','drawText','drawLine',
    'drawPoly','drawArc','drawImage','loop','stopLoop','getFPS',
    'onKey','onKeyUp','onClick','onMouse','isKeyDown','focus','getCtx',
    'save','restore','translate','rotate','scale2','setAlpha','setFont','setSize',
    'measureText','toDataURL',
  ];
  proxy.forEach(m => { win[m] = (...a) => cvs[m](...a); });
  return win;
}

/* ── createCamera ─────────────────────────────────────────────────────────── */
function createCamera(cvs) {
  const cam = _view('camera', null);
  cam.x=0; cam.y=0; cam.zoom=1;
  cam.moveTo = (x,y)    => { cam.x=x; cam.y=y; return cam; };
  cam.zoomTo = z        => { cam.zoom=z; return cam; };
  cam.follow = (tgt, s) => {
    s = s||0.1;
    if (!cvs) return cam;
    cam.x += ((tgt.x - (cvs.width||0)/2)  - cam.x) * s;
    cam.y += ((tgt.y - (cvs.height||0)/2) - cam.y) * s;
    return cam;
  };
  cam.apply  = () => cam;
  cam.reset  = () => cam;
  return cam;
}

/* ── createScreen ─────────────────────────────────────────────────────────── */
function createPanel(x, y, w, h, bg) {
  x=x||0; y=y||0; w=w||200; h=h||150;

  const v = _view('panel', null);
  v.x=x; v.y=y; v.width=w; v.height=h;

  v.setBackground = c      => v;
  v.setBorder     = (c,bw) => v;
  v.setRadius     = r      => v;
  v.add = child => {
    if (child) v.__children__.push(child);
    return v;
  };

  return v;
}

/* ── createStatusBar (Node stub) ──────────────────────────────────────────── */
function createStatusBar(text, w) {
  const v = _view('statusbar', null);
  v.setText  = t => v;
  v.setParts = parts => v;
  v.setColor = c => v;
  v.setBackground = c => v;
  return v;
}

/* ── createMenuBar (Node stub) ────────────────────────────────────────────── */
function createMenuBar(w) {
  const v = _view('menubar', null);
  v.__menus__ = [];
  v.addMenu = label => {
    const menuObj = { __items__: [] };
    menuObj.addItem      = () => menuObj;
    menuObj.addSeparator = () => menuObj;
    v.__menus__.push(menuObj);
    return menuObj;
  };
  return v;
}

/* ── new widgets (Node stubs) ──────────────────────────────────────────────
   Same API surface as the browser versions so scripts require()'d from the
   Electron main process (instead of the renderer) don't crash — everything
   below is inert until it actually runs in a renderer. */
function createCheckbox(label, x, y, checked) {
  const v = _view('checkbox', null);
  v.x=x||0; v.y=y||0; v.width=160; v.height=22;
  let _checked = !!checked;
  v.isChecked  = ()  => _checked;
  v.setChecked = b   => { _checked=!!b; return v; };
  v.setLabel   = t   => v;
  v.setText    = v.setLabel;
  v.setPosition= (nx,ny)=>{ v.x=nx; v.y=ny; return v; };
  v.setColor   = c   => v;
  v.enable     = ()  => v;
  v.disable    = ()  => v;
  v.listen     = (event,fn) => v;
  v.onChange   = fn  => v;
  return v;
}
function createRadioGroup(options, x, y, spacing) {
  options = options || [];
  const v = _view('radiogroup', null);
  v.x=x||0; v.y=y||0; v.width=160; v.height=(spacing||26)*options.length;
  let _selected = null;
  v.getValue = () => _selected;
  v.setValue = label => { _selected = label; return v; };
  v.setPosition = (nx,ny) => { v.x=nx; v.y=ny; return v; };
  v.enable = () => v;
  v.disable = () => v;
  v.listen = (event,fn) => v;
  v.onChange = fn => v;
  return v;
}
function createDropdown(options, x, y, w, h) {
  options = options || [];
  const v = _view('dropdown', null);
  v.x=x||0; v.y=y||0; v.width=w||160; v.height=h||34;
  let _val = options[0] !== undefined ? String(options[0]) : '';
  let _opts = options.slice();
  v.getValue   = () => _val;
  v.setValue   = val => { _val=String(val); return v; };
  v.getIndex   = () => _opts.indexOf(_val);
  v.setIndex   = i => { _val = String(_opts[i]); return v; };
  v.setOptions = opts => { _opts = opts||[]; return v; };
  v.addOption  = o => { _opts.push(o); return v; };
  v.setPosition= (nx,ny) => { v.x=nx; v.y=ny; return v; };
  v.setSize    = (nw,nh) => { v.width=nw; v.height=nh; return v; };
  v.setColor   = (fg,bg) => v;
  v.enable     = () => v;
  v.disable    = () => v;
  v.listen     = (event,fn) => v;
  v.onChange   = fn => v;
  return v;
}
function createSlider(min, max, value, x, y, w) {
  min=(min===undefined)?0:min; max=(max===undefined)?100:max;
  const v = _view('slider', null);
  v.x=x||0; v.y=y||0; v.width=w||160; v.height=20;
  let _val = (value===undefined)?min:value;
  v.getValue = () => _val;
  v.setValue = n => { _val=n; return v; };
  v.setRange = (mn,mx,step) => v;
  v.setStep  = s => v;
  v.setPosition = (nx,ny) => { v.x=nx; v.y=ny; return v; };
  v.setSize     = (nw,nh) => { v.width=nw; return v; };
  v.enable = () => v;
  v.disable = () => v;
  v.listen = (event,fn) => v;
  v.onChange = fn => v;
  return v;
}
function createProgressBar(x, y, w, h, value, max) {
  const v = _view('progressbar', null);
  v.x=x||0; v.y=y||0; v.width=w||200; v.height=h||14;
  let _val = (value===undefined)?0:value, _max = (max===undefined)?100:max;
  v.getValue = () => _val;
  v.setValue = n => { _val=n; return v; };
  v.setMax   = m => { _max=m; return v; };
  v.setColor = c => v;
  v.setBackground = c => v;
  v.setPosition = (nx,ny) => { v.x=nx; v.y=ny; return v; };
  v.setSize     = (nw,nh) => { v.width=nw; v.height=nh; return v; };
  return v;
}
function createTabs(labels, x, y, w, h) {
  labels = labels || [];
  const v = _view('tabs', null);
  v.x=x||0; v.y=y||0; v.width=w||400; v.height=h||300;
  v.__panes__ = {};
  labels.forEach(l => v.__panes__[l] = _view('pane', null));
  let _active = labels[0] || null;
  v.addToTab = (label, child) => { if (v.__panes__[label] && child) v.__panes__[label].__children__.push(child); return v; };
  v.selectTab = label => { if (label in v.__panes__) _active = label; return v; };
  v.getActiveTab = () => _active;
  v.setPosition = (nx,ny) => { v.x=nx; v.y=ny; return v; };
  v.setSize     = (nw,nh) => { v.width=nw; v.height=nh; return v; };
  return v;
}
function createListView(items, x, y, w, h) {
  const v = _view('listview', null);
  v.x=x||0; v.y=y||0; v.width=w||220; v.height=h||200;
  let _items = (items||[]).slice(), _selIndex=-1, _selected=null;
  v.setItems = arr => { _items=(arr||[]).slice(); _selIndex=-1; _selected=null; return v; };
  v.getItems = () => _items.slice();
  v.addItem  = item => { _items.push(item); return v; };
  v.removeAt = i => { _items.splice(i,1); return v; };
  v.clearItems = () => { _items=[]; return v; };
  v.select   = i => { _selIndex=i; _selected=_items[i]; return v; };
  v.getSelected = () => _selected;
  v.getSelectedIndex = () => _selIndex;
  v.setPosition = (nx,ny) => { v.x=nx; v.y=ny; return v; };
  v.setSize     = (nw,nh) => { v.width=nw; v.height=nh; return v; };
  v.listen = (event,fn) => v;
  v.onChange = fn => v;
  v.onDoubleClick = fn => v;
  return v;
}
function createTable(columns, rows, x, y, w, h) {
  const v = _view('table', null);
  v.x=x||0; v.y=y||0; v.width=w||400; v.height=h||240;
  let _cols=(columns||[]).slice(), _rows=(rows||[]).map(r=>r.slice()), _selIndex=-1;
  v.setColumns = cols => { _cols=(cols||[]).slice(); return v; };
  v.setRows    = rws  => { _rows=(rws||[]).map(r=>r.slice()); return v; };
  v.addRow     = row  => { _rows.push(row); return v; };
  v.removeRow  = i    => { _rows.splice(i,1); return v; };
  v.getRows    = () => _rows.map(r=>r.slice());
  v.selectRow  = i => { _selIndex=i; return v; };
  v.getSelectedRow = () => _selIndex>=0 ? _rows[_selIndex] : null;
  v.setPosition= (nx,ny) => { v.x=nx; v.y=ny; return v; };
  v.setSize    = (nw,nh) => { v.width=nw; v.height=nh; return v; };
  v.listen = (event,fn) => v;
  v.onChange = fn => v;
  return v;
}
function attachTooltip(widget, text) {
  if (widget) widget.setTooltip = t => widget;
  return widget;
}
function createContextMenu(items) {
  const menu = { __el__: null };
  menu.setItems = arr => menu;
  menu.showAt   = (x,y) => menu;
  menu.hide     = () => menu;
  menu.attachTo = widget => menu;
  return menu;
}
function showToast(msg, opts) {
  console.log('[gui.zl] Toast: ' + String(msg));
  return { close: () => {} };
}
function createCodeEditor(text, x, y, w, h, opts) {
  const v = _view('codeeditor', null);
  v.x=x||0; v.y=y||0; v.width=w||500; v.height=h||360;
  v.__lang__ = (opts && opts.language) || null;
  let _val = String(text==null?'':text);
  v.getValue = () => _val;
  v.setValue = t => { _val=String(t==null?'':t); return v; };
  v.clear    = () => { _val=''; return v; };
  v.focus    = () => v;
  v.setColor = (fg,bg) => v;
  v.setFontSize = s => v;
  v.setReadOnly = ro => v;
  v.setTabSize  = (n,sp) => v;
  v.setLanguage = lang => { v.__lang__=lang; return v; };
  v.getLanguage = () => v.__lang__;
  v.insertAtCursor = txt => { _val += String(txt); return v; };
  v.getSelection    = () => '';
  v.selectAll       = () => v;
  v.getCursorLine   = () => _val.split('\n').length;
  v.getCursorColumn = () => 1;
  v.getLineCount    = () => _val.split('\n').length;
  v.getWordCount    = () => { const t=_val.trim(); return t===''?0:t.split(/\s+/).length; };
  v.getCharCount    = () => _val.length;
  v.undo = () => v;
  v.redo = () => v;
  v.gotoLine = n => v;
  v.findNext = (query, fromPos) => _val.indexOf(query, fromPos||0);
  v.replaceSelection = txt => v;
  v.setPosition = (nx,ny) => { v.x=nx; v.y=ny; return v; };
  v.setSize     = (nw,nh) => { v.width=nw; v.height=nh; return v; };
  v.listen = (event,fn) => v;
  return v;
}
/* game math utilities — identical in every mode, pure functions */
function clamp(v, lo, hi)      { return Math.min(hi, Math.max(lo, v)); }
function lerp(a, b, t)         { return a + (b - a) * t; }
function randRange(lo, hi)     { return lo + Math.random() * (hi - lo); }
function randInt(lo, hi)       { return Math.floor(randRange(lo, hi + 1)); }
function dist2D(x1, y1, x2, y2){ const dx=x2-x1, dy=y2-y1; return Math.sqrt(dx*dx+dy*dy); }
function rectsOverlap(a, b)    { return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y; }
function circleOverlap(a, b)   { return dist2D(a.x,a.y,b.x,b.y) < (a.r + b.r); }
function pointInRect(px, py, r){ return px >= r.x && px <= r.x+r.w && py >= r.y && py <= r.y+r.h; }
function createSpriteAnim(sheet, frameW, frameH, frameCount, fps, cols) {
  fps = fps||10; cols = cols||frameCount;
  let _frame = 0, _playing = true, _loopAnim = true;
  const anim = {
    frameW, frameH, frameCount,
    setFPS: f => { fps=f; return anim; },
    play: () => { _playing=true; return anim; },
    pause: () => { _playing=false; return anim; },
    stop: () => { _playing=false; _frame=0; return anim; },
    setLoop: b => { _loopAnim=!!b; return anim; },
    gotoFrame: n => { _frame = ((n%frameCount)+frameCount)%frameCount; return anim; },
    getFrame: () => _frame,
    isDone: () => (!_loopAnim && _frame===frameCount-1),
    update: dt => anim,
    draw: (cvs,x,y,scale) => anim,
  };
  return anim;
}
function loadSound(src, opts) {
  _warnCLI('loadSound');
  const s = { ready:false };
  s.play=()=>s; s.resume=()=>s; s.pause=()=>s; s.stop=()=>s;
  s.setVolume=v=>s; s.setLoop=b=>s; s.isPlaying=()=>false;
  return s;
}
function playSound(src, opts) { return loadSound(src, opts); }

/* ── showAlert ────────────────────────────────────────────────────────────── */
function showAlert(msg, title) {
  console.log('[gui.zl] Alert ('+(title||'Alert')+'): '+String(msg));
  return null;
}

/* ── showPrompt ───────────────────────────────────────────────────────────── */
function showPrompt(msg, cb, title) {
  console.log('[gui.zl] Prompt ('+(title||'Input')+'): '+String(msg));
  if (cb) cb(null);
  return createWindow(380, 190);
}

/* ── confirmBox (Node stub) ───────────────────────────────────────────────── */
function confirmBox(msg, cb, title) {
  console.log('[gui.zl] Confirm ('+(title||'Confirm')+'): '+String(msg));
  if (cb) cb(false);
  return createWindow(360, 150);
}

/* ── loadImage (Node stub) ────────────────────────────────────────────────── */
function loadWebImage(src, cb) {
  const v = _view('image', null);
  v.__img__ = null;
  v.ready   = false;
  if (cb) setTimeout(() => cb(null), 0);
  return v;
}

/* ── saveTextFile / openTextFile / onGlobalKey (Node stubs) ──────────────── */
function saveTextFile(filename, content) {
  _warnCLI('saveTextFile');
  return false;
}
function openTextFile(cb, accept) {
  _warnCLI('openTextFile');
  if (cb) cb(null, null);
}
function onGlobalKey(combo, fn) {
  _warnCLI('onGlobalKey');
  return () => {};
}

/* ── DSALibraries registration (Electron / CLI) ───────────────────────────── */
if (typeof DSALibraries !== 'undefined') {
  DSALibraries['gui.zl'] = {
    description: 'Full GUI (Electron): Window, Scene, Button, Label, TextField, Canvas, Screen, Camera, Panel — runs in Electron renderer',
    inject(G) {
      G.Window    = (w,h)         => createWindow(w,h);
      G.Scene     = layout        => createScene(layout);
      G.Button    = (l,x,y,w,h)  => createButton(l,x,y,w,h);
      G.Label     = (t,x,y)       => createLabel(t,x,y);
      G.TextField = (h,x,y,w,ht) => createInput(h,x,y,w,ht);
      G.TextArea  = (t,x,y,w,ht) => createTextArea(t,x,y,w,ht);
      G.CodeEditor= (t,x,y,w,ht,o)=> createCodeEditor(t,x,y,w,ht,o);
      G.Canvas    = (w,h)         => createCanvas(w,h);
      G.Screen    = (w,h)         => createScreen(w,h);
      G.Camera    = cvs           => createCamera(cvs);
      G.Panel     = (x,y,w,h,c)  => createPanel(x,y,w,h,c);
      G.MenuBar   = (w)           => createMenuBar(w);
      G.StatusBar = (t,w)         => createStatusBar(t,w);
      G.ContextMenu=(items)       => createContextMenu(items);
      G.Checkbox  = (l,x,y,c)     => createCheckbox(l,x,y,c);
      G.RadioGroup= (opts,x,y,s) => createRadioGroup(opts,x,y,s);
      G.Dropdown  = (opts,x,y,w,h)=> createDropdown(opts,x,y,w,h);
      G.Slider    = (mn,mx,val,x,y,w) => createSlider(mn,mx,val,x,y,w);
      G.ProgressBar=(x,y,w,h,val,max)=> createProgressBar(x,y,w,h,val,max);
      G.Tabs      = (labels,x,y,w,h)  => createTabs(labels,x,y,w,h);
      G.ListView  = (items,x,y,w,h)   => createListView(items,x,y,w,h);
      G.Table     = (cols,rows,x,y,w,h)=> createTable(cols,rows,x,y,w,h);
      G.Dialog    = (m,t)         => showAlert(m,t);
      G.AskBox    = (m,cb,t)      => showPrompt(m,cb,t);
      G.ConfirmBox= (m,cb,t)      => confirmBox(m,cb,t);
      G.Toast     = (m,opts)      => showToast(m,opts);

      G.make = (type, ...args) => {
        if (typeof type === 'function') return type(...args);
        const map = {
          window:createWindow, scene:createScene, button:createButton,
          label:createLabel, textfield:createInput, textarea:createTextArea,
          codeeditor:createCodeEditor,
          canvas:createCanvas, screen:createScreen, camera:createCamera,
          panel:createPanel, menubar:createMenuBar, statusbar:createStatusBar,
          checkbox:createCheckbox, radiogroup:createRadioGroup, dropdown:createDropdown,
          slider:createSlider, progressbar:createProgressBar, tabs:createTabs,
          listview:createListView, table:createTable, contextmenu:createContextMenu,
        };
        const fn = map[String(type).toLowerCase()];
        if (!fn) throw new Error('make: unknown view type "'+type+'"');
        return fn(...args);
      };

      G.loadImage    = (src,cb)          => loadWebImage(src,cb);
      G.pickImage    = cb                => { console.warn('[gui.zl] pickImage not supported in CLI mode'); if(cb) cb(null); };
      G.saveTextFile = (filename,content)=> saveTextFile(filename,content);
      G.openTextFile = (cb,accept)       => openTextFile(cb,accept);
      G.onGlobalKey  = (combo,fn)        => onGlobalKey(combo,fn);
      G.loadSound    = (src,opts)        => loadSound(src,opts);
      G.playSound    = (src,opts)        => playSound(src,opts);
      G.createSpriteAnim = (sheet,fw,fh,fc,fps,cols) => createSpriteAnim(sheet,fw,fh,fc,fps,cols);
      G.attachTooltip= (widget,text)     => attachTooltip(widget,text);

      G.rgb  = (r,g,b)   => 'rgb('+r+','+g+','+b+')';
      G.rgba = (r,g,b,a) => 'rgba('+r+','+g+','+b+','+a+')';
      G.hex  = c         => String(c);

      G.clamp  = (v,lo,hi) => clamp(v,lo,hi);
      G.lerp   = (a,b,t)   => lerp(a,b,t);
      G.randRange = (lo,hi)=> randRange(lo,hi);
      G.randInt   = (lo,hi)=> randInt(lo,hi);
      G.dist2D    = (x1,y1,x2,y2) => dist2D(x1,y1,x2,y2);
      G.rectsOverlap = (a,b) => rectsOverlap(a,b);
      G.circleOverlap= (a,b) => circleOverlap(a,b);
      G.pointInRect  = (px,py,r) => pointInRect(px,py,r);

      G.isWidget   = v  => !!(v && v.__type__ === 'view');
      G.closeAll   = () => { _windows.forEach(w => { try { w.close(); } catch(_){} }); _windows=[]; };
      G.allWindows = () => [..._windows];
      G.viewPrint  = (win, text) => {
        console.log('[viewPrint]', String(text));
      };
    }
  };
}

if (typeof module !== 'undefined') module.exports = {
  createWindow, createScene, createButton, createLabel,
  createInput, createTextArea, createCodeEditor, createCanvas, createScreen, createCamera,
  createPanel, createMenuBar, createStatusBar, createContextMenu,
  createCheckbox, createRadioGroup, createDropdown, createSlider, createProgressBar,
  createTabs, createListView, createTable, attachTooltip,
  showAlert, showPrompt, confirmBox, showToast, saveTextFile, openTextFile, onGlobalKey,
  loadSound, playSound, createSpriteAnim,
  clamp, lerp, randRange, randInt, dist2D, rectsOverlap, circleOverlap, pointInRect,
};

})();