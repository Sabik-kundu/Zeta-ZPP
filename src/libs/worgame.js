/* ══════════════════════════════════════════════════════════════════════════════
   worgame.zl  —  ZETA++ (ZPP) 2D GAME ENGINE
   Every public function/attribute is prefixed wg_.

   INTEGRATION WITH worlib.zl (optional, automatic)
   ───────────────────────────────────────────────────
   If worlib.zl was imported BEFORE worgame.zl, wg_CreateGame() will use
   worlib's retro window chrome to host the game canvas (so you get a real
   draggable/closable window for free). If worlib.zl was NOT imported,
   worgame.zl creates its own plain floating canvas instead — it never
   requires worlib.zl to function.

   All sprite/tilemap drawing happens through the raw Canvas2D context
   directly (not through worlib's drawing helpers), so worgame.zl stays
   fully self-contained either way.
   ══════════════════════════════════════════════════════════════════════════════ */

(function WorGame() {
'use strict';

const _isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
const _warned = {};
function _warn(fnName) {
  if (_warned[fnName]) return;
  _warned[fnName] = true;
  console.warn('[worgame.zl] "' + fnName + '" called outside a browser/Electron renderer — it will no-op.');
}
function _needsBrowser(fnName) {
  if (_isBrowser) return false;
  _warn(fnName);
  return true;
}

/* Captured at inject() time so worgame can optionally call into worlib.zl's
   functions if they're already present on the shared global scope object. */
let _hostG = null;

/* ══════════════════════════════════════════════════════════════════════════
   GAME — window + canvas + loop
   ══════════════════════════════════════════════════════════════════════════ */
function wg_CreateGame(title, w, h) {
  if (_needsBrowser('wg_CreateGame')) {
    return { wg_kind: 'game', wg_width: w || 640, wg_height: h || 480, wg_entities: [], __private: {} };
  }
  const width = w || 640, height = h || 480;
  let canvasEl, containerEl, worlibWindow = null;

  if (_hostG && typeof _hostG.wl_CreateWindow === 'function') {
    /* worlib.zl is loaded — host the game inside a real retro window. */
    worlibWindow = _hostG.wl_CreateWindow(title || 'Game', 60, 60, width + 12, height + 40);
    const wlCanvas = _hostG.wl_CreateCanvas(0, 0, width, height);
    _hostG.wl_AddChild(worlibWindow, wlCanvas);
    _hostG.wl_ShowWindow(worlibWindow);
    canvasEl = wlCanvas.wl_el;
  } else {
    /* Standalone fallback: a plain floating canvas with a thin border. */
    canvasEl = document.createElement('canvas');
    canvasEl.width = width; canvasEl.height = height;
    canvasEl.style.cssText = [
      'position:fixed', 'left:40px', 'top:40px', 'border:1px solid #444',
      'background:#000', 'z-index:15200',
    ].join(';');
    document.body.appendChild(canvasEl);
  }
  canvasEl.tabIndex = 0;
  canvasEl.setAttribute('data-worgame', '1');

  const game = {
    wg_kind: 'game',
    wg_width: width, wg_height: height,
    wg_entities: [],
    wg_camera: { x: 0, y: 0, zoom: 1 },
    wg_running: false,
    __private: {
      canvasEl, ctx: canvasEl.getContext('2d'),
      worlibWindow,
      background: '#000000',
      raf: null,
      lastTime: null,
      keysDown: {}, keysPressedThisFrame: {}, keysReleasedThisFrame: {}, prevKeysDown: {},
      mouseDown: {}, mousePos: { x: 0, y: 0 },
    },
  };

  canvasEl.addEventListener('keydown', e => { game.__private.keysDown[e.key] = true; });
  canvasEl.addEventListener('keyup',   e => { game.__private.keysDown[e.key] = false; });
  window.addEventListener('keydown',   e => { game.__private.keysDown[e.key] = true; });
  window.addEventListener('keyup',     e => { game.__private.keysDown[e.key] = false; });
  canvasEl.addEventListener('mousedown', e => { game.__private.mouseDown[e.button] = true; });
  canvasEl.addEventListener('mouseup',   e => { game.__private.mouseDown[e.button] = false; });
  canvasEl.addEventListener('mousemove', e => {
    const r = canvasEl.getBoundingClientRect();
    game.__private.mousePos = { x: e.clientX - r.left, y: e.clientY - r.top };
  });

  return game;
}

function wg_SetBackground(game, color) {
  if (_needsBrowser('wg_SetBackground') || !game || !game.__private) return;
  game.__private.background = color;
}
function wg_GetContext(game) {
  if (!game || !game.__private) return null;
  return game.__private.ctx;
}

function wg_Run(game, updateFn, renderFn) {
  if (_needsBrowser('wg_Run') || !game || !game.__private) return;
  const p = game.__private;
  game.wg_running = true;
  p.lastTime = performance.now();

  function tick(now) {
    if (!game.wg_running) return;
    const dt = Math.min((now - p.lastTime) / 1000, 1 / 20);
    p.lastTime = now;

    /* edge-detect key presses/releases for this frame */
    p.keysPressedThisFrame = {}; p.keysReleasedThisFrame = {};
    for (const k in p.keysDown) {
      if (p.keysDown[k] && !p.prevKeysDown[k]) p.keysPressedThisFrame[k] = true;
      if (!p.keysDown[k] && p.prevKeysDown[k]) p.keysReleasedThisFrame[k] = true;
    }
    p.prevKeysDown = Object.assign({}, p.keysDown);

    if (typeof updateFn === 'function') { try { updateFn(dt); } catch (e) { console.error('[worgame.zl] update error:', e); } }

    p.ctx.setTransform(1, 0, 0, 1, 0, 0);
    p.ctx.fillStyle = p.background;
    p.ctx.fillRect(0, 0, game.wg_width, game.wg_height);
    p.ctx.save();
    p.ctx.translate(-game.wg_camera.x, -game.wg_camera.y);
    p.ctx.scale(game.wg_camera.zoom, game.wg_camera.zoom);

    if (typeof renderFn === 'function') { try { renderFn(p.ctx); } catch (e) { console.error('[worgame.zl] render error:', e); } }
    else { wg_DrawAllSprites(game); }

    p.ctx.restore();

    p.raf = requestAnimationFrame(tick);
  }
  p.raf = requestAnimationFrame(tick);
}
function wg_Stop(game) {
  if (_needsBrowser('wg_Stop') || !game || !game.__private) return;
  game.wg_running = false;
  if (game.__private.raf) cancelAnimationFrame(game.__private.raf);
}

/* ══════════════════════════════════════════════════════════════════════════
   SPRITES / ENTITIES
   ══════════════════════════════════════════════════════════════════════════ */
function wg_CreateSprite(x, y, w, h, color) {
  return {
    wg_kind: 'sprite',
    wg_x: x || 0, wg_y: y || 0,
    wg_width: w || 20, wg_height: h || 20,
    wg_vx: 0, wg_vy: 0,
    wg_color: color || '#ffffff',
    wg_image: null,
    wg_rotation: 0,
    wg_visible: true,
    wg_active: true,
    __private: {},
  };
}
function wg_SetSpriteImage(sprite, imgHandle) {
  if (!sprite) return;
  sprite.wg_image = imgHandle;
}
function wg_AddEntity(game, entity) {
  if (!game || !entity) return;
  game.wg_entities.push(entity);
}
function wg_RemoveEntity(game, entity) {
  if (!game || !entity) return;
  game.wg_entities = game.wg_entities.filter(e => e !== entity);
}
function wg_UpdateSpritePhysics(sprite, dt) {
  if (!sprite) return;
  sprite.wg_x += sprite.wg_vx * dt;
  sprite.wg_y += sprite.wg_vy * dt;
}
function wg_DrawSprite(game, sprite) {
  if (_needsBrowser('wg_DrawSprite') || !game || !sprite || !sprite.wg_visible) return;
  const ctx = game.__private.ctx;
  ctx.save();
  ctx.translate(sprite.wg_x + sprite.wg_width / 2, sprite.wg_y + sprite.wg_height / 2);
  if (sprite.wg_rotation) ctx.rotate(sprite.wg_rotation);
  if (sprite.wg_image && sprite.wg_image.wl_el) {
    ctx.drawImage(sprite.wg_image.wl_el, -sprite.wg_width / 2, -sprite.wg_height / 2, sprite.wg_width, sprite.wg_height);
  } else if (sprite.wg_image && sprite.wg_image.__el) {
    ctx.drawImage(sprite.wg_image.__el, -sprite.wg_width / 2, -sprite.wg_height / 2, sprite.wg_width, sprite.wg_height);
  } else {
    ctx.fillStyle = sprite.wg_color;
    ctx.fillRect(-sprite.wg_width / 2, -sprite.wg_height / 2, sprite.wg_width, sprite.wg_height);
  }
  ctx.restore();
}
function wg_DrawAllSprites(game) {
  if (_needsBrowser('wg_DrawAllSprites') || !game) return;
  for (const e of game.wg_entities) {
    if (e.wg_kind === 'sprite' && e.wg_active) wg_DrawSprite(game, e);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   COLLISION
   ══════════════════════════════════════════════════════════════════════════ */
function wg_CollideAABB(a, b) {
  if (!a || !b) return false;
  return a.wg_x < b.wg_x + b.wg_width && a.wg_x + a.wg_width > b.wg_x &&
         a.wg_y < b.wg_y + b.wg_height && a.wg_y + a.wg_height > b.wg_y;
}
function wg_CollideCircle(a, b) {
  if (!a || !b) return false;
  const ra = (a.wg_radius != null) ? a.wg_radius : a.wg_width / 2;
  const rb = (b.wg_radius != null) ? b.wg_radius : b.wg_width / 2;
  const acx = a.wg_x + a.wg_width / 2, acy = a.wg_y + a.wg_height / 2;
  const bcx = b.wg_x + b.wg_width / 2, bcy = b.wg_y + b.wg_height / 2;
  const dx = acx - bcx, dy = acy - bcy;
  const rr = ra + rb;
  return (dx * dx + dy * dy) < rr * rr;
}
function wg_PointInRect(px, py, rect) {
  if (!rect) return false;
  const rx = rect.wg_x != null ? rect.wg_x : rect.x;
  const ry = rect.wg_y != null ? rect.wg_y : rect.y;
  const rw = rect.wg_width != null ? rect.wg_width : rect.w;
  const rh = rect.wg_height != null ? rect.wg_height : rect.h;
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

/* ══════════════════════════════════════════════════════════════════════════
   CAMERA
   ══════════════════════════════════════════════════════════════════════════ */
function wg_SetCamera(game, x, y, zoom) {
  if (!game) return;
  game.wg_camera.x = x; game.wg_camera.y = y;
  if (zoom != null) game.wg_camera.zoom = zoom;
}
function wg_CameraFollow(game, target, smoothing) {
  if (!game || !target) return;
  const s = smoothing == null ? 0.1 : smoothing;
  const targetX = target.wg_x - game.wg_width / 2;
  const targetY = target.wg_y - game.wg_height / 2;
  game.wg_camera.x += (targetX - game.wg_camera.x) * s;
  game.wg_camera.y += (targetY - game.wg_camera.y) * s;
}

/* ══════════════════════════════════════════════════════════════════════════
   INPUT
   ══════════════════════════════════════════════════════════════════════════ */
function wg_KeyDown(game, key) {
  if (!game || !game.__private) return false;
  return !!game.__private.keysDown[key];
}
function wg_KeyPressed(game, key) {
  if (!game || !game.__private) return false;
  return !!game.__private.keysPressedThisFrame[key];
}
function wg_KeyReleased(game, key) {
  if (!game || !game.__private) return false;
  return !!game.__private.keysReleasedThisFrame[key];
}
function wg_MousePos(game) {
  if (!game || !game.__private) return { x: 0, y: 0 };
  return { x: game.__private.mousePos.x, y: game.__private.mousePos.y };
}
function wg_MouseDown(game, button) {
  if (!game || !game.__private) return false;
  return !!game.__private.mouseDown[button == null ? 0 : button];
}

/* ══════════════════════════════════════════════════════════════════════════
   TIMERS
   ══════════════════════════════════════════════════════════════════════════ */
function wg_Cooldown(seconds) {
  return { wg_kind: 'cooldown', wg_remaining: seconds || 0, wg_duration: seconds || 0 };
}
function wg_TickCooldown(timer, dt) {
  if (!timer) return;
  timer.wg_remaining = Math.max(0, timer.wg_remaining - dt);
}
function wg_IsCooldownDone(timer) {
  return !timer || timer.wg_remaining <= 0;
}
function wg_ResetCooldown(timer, seconds) {
  if (!timer) return;
  timer.wg_duration = seconds == null ? timer.wg_duration : seconds;
  timer.wg_remaining = timer.wg_duration;
}

/* ══════════════════════════════════════════════════════════════════════════
   TILEMAP
   ══════════════════════════════════════════════════════════════════════════ */
function wg_CreateTilemap(cols, rows, tileSize) {
  return {
    wg_kind: 'tilemap',
    wg_cols: cols, wg_rows: rows, wg_tileSize: tileSize || 32,
    __data: new Array(cols * rows).fill(0),
  };
}
function wg_SetTile(map, col, row, value) {
  if (!map || col < 0 || row < 0 || col >= map.wg_cols || row >= map.wg_rows) return;
  map.__data[row * map.wg_cols + col] = value;
}
function wg_GetTile(map, col, row) {
  if (!map || col < 0 || row < 0 || col >= map.wg_cols || row >= map.wg_rows) return 0;
  return map.__data[row * map.wg_cols + col];
}
function wg_DrawTilemap(game, map, tileColors) {
  if (_needsBrowser('wg_DrawTilemap') || !game || !map) return;
  const ctx = game.__private.ctx;
  const ts = map.wg_tileSize;
  for (let row = 0; row < map.wg_rows; row++) {
    for (let col = 0; col < map.wg_cols; col++) {
      const v = wg_GetTile(map, col, row);
      if (v === 0) continue;
      ctx.fillStyle = (tileColors && tileColors[v]) || '#888888';
      ctx.fillRect(col * ts, row * ts, ts, ts);
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   IMAGES — standalone image loading (works even without worlib.zl loaded;
   wg_DrawSprite also accepts a worlib.zl wl_LoadImage() handle directly).
   ══════════════════════════════════════════════════════════════════════════ */
function wg_LoadImage(src, callback) {
  if (_needsBrowser('wg_LoadImage')) { if (callback) callback(null); return; }
  const img = new Image();
  img.onload = () => {
    callback({ wg_kind: 'image', __el: img, wg_width: img.naturalWidth, wg_height: img.naturalHeight });
  };
  img.onerror = () => { if (callback) callback(null); };
  img.src = src;
}

/* ══════════════════════════════════════════════════════════════════════════
   SPRITE SHEETS
   ══════════════════════════════════════════════════════════════════════════ */
function wg_LoadSpriteSheet(src, frameW, frameH, callback) {
  if (_needsBrowser('wg_LoadSpriteSheet')) { if (callback) callback(null); return; }
  const img = new Image();
  img.onload = () => {
    callback({
      wg_kind: 'spritesheet',
      __el: img,
      wg_frameW: frameW, wg_frameH: frameH,
      wg_cols: Math.floor(img.naturalWidth / frameW),
      wg_rows: Math.floor(img.naturalHeight / frameH),
    });
  };
  img.onerror = () => { if (callback) callback(null); };
  img.src = src;
}
function wg_DrawFrame(game, sheet, frameIndex, x, y, scale) {
  if (_needsBrowser('wg_DrawFrame') || !game || !sheet) return;
  const ctx = game.__private.ctx;
  const col = frameIndex % sheet.wg_cols;
  const row = Math.floor(frameIndex / sheet.wg_cols);
  const s = scale || 1;
  ctx.drawImage(
    sheet.__el,
    col * sheet.wg_frameW, row * sheet.wg_frameH, sheet.wg_frameW, sheet.wg_frameH,
    x, y, sheet.wg_frameW * s, sheet.wg_frameH * s
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   DRAWING HELPERS (thin, self-contained — no worlib dependency required)
   ══════════════════════════════════════════════════════════════════════════ */
function wg_Clear(game, color) {
  if (_needsBrowser('wg_Clear') || !game) return;
  const ctx = game.__private.ctx;
  ctx.fillStyle = color || game.__private.background;
  ctx.fillRect(0, 0, game.wg_width, game.wg_height);
}
function wg_FillRect(game, x, y, w, h, color) {
  if (_needsBrowser('wg_FillRect') || !game) return;
  const ctx = game.__private.ctx;
  ctx.fillStyle = color || '#fff';
  ctx.fillRect(x, y, w, h);
}
function wg_DrawRect(game, x, y, w, h, color, lineWidth) {
  if (_needsBrowser('wg_DrawRect') || !game) return;
  const ctx = game.__private.ctx;
  ctx.strokeStyle = color || '#fff';
  ctx.lineWidth = lineWidth || 1;
  ctx.strokeRect(x, y, w, h);
}
function wg_FillCircle(game, x, y, r, color) {
  if (_needsBrowser('wg_FillCircle') || !game) return;
  const ctx = game.__private.ctx;
  ctx.fillStyle = color || '#fff';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
function wg_DrawText(game, text, x, y, color, size, font) {
  if (_needsBrowser('wg_DrawText') || !game) return;
  const ctx = game.__private.ctx;
  ctx.fillStyle = color || '#fff';
  ctx.font = (size || 16) + 'px ' + (font || 'monospace');
  ctx.fillText(String(text), x, y);
}

/* ══════════════════════════════════════════════════════════════════════════
   SOUND (self-contained; doesn't require worlib.zl)
   ══════════════════════════════════════════════════════════════════════════ */
function wg_LoadSound(src, callback) {
  if (_needsBrowser('wg_LoadSound')) { if (callback) callback(null); return; }
  const audio = new Audio(src);
  audio.addEventListener('canplaythrough', () => callback({ wg_kind: 'sound', __el: audio }), { once: true });
  audio.addEventListener('error', () => { if (callback) callback(null); });
}
function wg_PlaySound(sound) {
  if (_needsBrowser('wg_PlaySound') || !sound || !sound.__el) return;
  try { sound.__el.currentTime = 0; sound.__el.play(); } catch (e) {}
}

/* ══════════════════════════════════════════════════════════════════════════
   UTILITY
   ══════════════════════════════════════════════════════════════════════════ */
function wg_Now() { return Date.now(); }

/* ══════════════════════════════════════════════════════════════════════════
   DSALibraries REGISTRATION
   ══════════════════════════════════════════════════════════════════════════ */
if (typeof DSALibraries !== 'undefined') {
  DSALibraries['worgame.zl'] = {
    description: 'Small 2D game engine for ZETA++ (loop, sprites, collision, camera, input, tilemaps). Optionally hosts inside a worlib.zl window. All names prefixed wg_.',
    inject(G) {
      _hostG = G;
      if (typeof window !== 'undefined' && window.__ZPP__) {
        window.__ZPP__.registerBuiltins([
          'wg_CreateGame','wg_SetBackground','wg_GetContext','wg_Run','wg_Stop',
          'wg_CreateSprite','wg_SetSpriteImage','wg_AddEntity','wg_RemoveEntity',
          'wg_UpdateSpritePhysics','wg_DrawSprite','wg_DrawAllSprites',
          'wg_CollideAABB','wg_CollideCircle','wg_PointInRect',
          'wg_SetCamera','wg_CameraFollow',
          'wg_KeyDown','wg_KeyPressed','wg_KeyReleased','wg_MousePos','wg_MouseDown',
          'wg_Cooldown','wg_TickCooldown','wg_IsCooldownDone','wg_ResetCooldown',
          'wg_CreateTilemap','wg_SetTile','wg_GetTile','wg_DrawTilemap',
          'wg_LoadImage','wg_LoadSpriteSheet','wg_DrawFrame',
          'wg_Clear','wg_FillRect','wg_DrawRect','wg_FillCircle','wg_DrawText',
          'wg_LoadSound','wg_PlaySound','wg_Now',
        ]);
        window.__ZPP__.registerTypes(['wg_game', 'wg_sprite']);
      }
      G.wg_CreateGame = wg_CreateGame;       G.wg_SetBackground = wg_SetBackground;
      G.wg_GetContext = wg_GetContext;       G.wg_Run = wg_Run;   G.wg_Stop = wg_Stop;
      G.wg_CreateSprite = wg_CreateSprite;   G.wg_SetSpriteImage = wg_SetSpriteImage;
      G.wg_AddEntity = wg_AddEntity;         G.wg_RemoveEntity = wg_RemoveEntity;
      G.wg_UpdateSpritePhysics = wg_UpdateSpritePhysics;
      G.wg_DrawSprite = wg_DrawSprite;       G.wg_DrawAllSprites = wg_DrawAllSprites;
      G.wg_CollideAABB = wg_CollideAABB;     G.wg_CollideCircle = wg_CollideCircle;
      G.wg_PointInRect = wg_PointInRect;
      G.wg_SetCamera = wg_SetCamera;         G.wg_CameraFollow = wg_CameraFollow;
      G.wg_KeyDown = wg_KeyDown;             G.wg_KeyPressed = wg_KeyPressed;
      G.wg_KeyReleased = wg_KeyReleased;     G.wg_MousePos = wg_MousePos;
      G.wg_MouseDown = wg_MouseDown;
      G.wg_Cooldown = wg_Cooldown;           G.wg_TickCooldown = wg_TickCooldown;
      G.wg_IsCooldownDone = wg_IsCooldownDone; G.wg_ResetCooldown = wg_ResetCooldown;
      G.wg_CreateTilemap = wg_CreateTilemap; G.wg_SetTile = wg_SetTile;
      G.wg_GetTile = wg_GetTile;             G.wg_DrawTilemap = wg_DrawTilemap;
      G.wg_LoadImage = wg_LoadImage;
      G.wg_LoadSpriteSheet = wg_LoadSpriteSheet; G.wg_DrawFrame = wg_DrawFrame;
      G.wg_Clear = wg_Clear;                 G.wg_FillRect = wg_FillRect;
      G.wg_DrawRect = wg_DrawRect;           G.wg_FillCircle = wg_FillCircle;
      G.wg_DrawText = wg_DrawText;
      G.wg_LoadSound = wg_LoadSound;         G.wg_PlaySound = wg_PlaySound;
      G.wg_Now = wg_Now;
    }
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    wg_CreateGame, wg_SetBackground, wg_GetContext, wg_Run, wg_Stop,
    wg_CreateSprite, wg_SetSpriteImage, wg_AddEntity, wg_RemoveEntity,
    wg_UpdateSpritePhysics, wg_DrawSprite, wg_DrawAllSprites,
    wg_CollideAABB, wg_CollideCircle, wg_PointInRect,
    wg_SetCamera, wg_CameraFollow,
    wg_KeyDown, wg_KeyPressed, wg_KeyReleased, wg_MousePos, wg_MouseDown,
    wg_Cooldown, wg_TickCooldown, wg_IsCooldownDone, wg_ResetCooldown,
    wg_CreateTilemap, wg_SetTile, wg_GetTile, wg_DrawTilemap,
    wg_LoadImage, wg_LoadSpriteSheet, wg_DrawFrame,
    wg_Clear, wg_FillRect, wg_DrawRect, wg_FillCircle, wg_DrawText,
    wg_LoadSound, wg_PlaySound, wg_Now,
  };
}

})();
