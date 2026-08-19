(function AdvGUILib() {

const _isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

/* ══════════════════════════════════════════════════════════════════════════════
   ADVGUI  —  advgui.zl
   Extension library on top of gui.zl (Window/Scene/Button/Canvas/...).
   Adds: proper setBackgroundImage, advanced widgets, animation/effects,
   a virtual filesystem + drives, a simulated OS (desktop/taskbar/CLI),
   basic internet access, image processing, and 2D / pseudo-3D game helpers.
   All functions/globals exposed to the custom language are prefixed advgui_
   so they never collide with gui.zl's own names.
   ══════════════════════════════════════════════════════════════════════════════ */

if (_isBrowser) {

const _isElectron = (
  typeof process !== 'undefined' &&
  process.versions &&
  !!process.versions.electron
);

function _root() {
  let r = document.getElementById('zpp-gui-root');
  if (!r) {
    r = document.createElement('div');
    r.id = 'zpp-gui-root';
    r.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9000;font-family:"JetBrains Mono","Fira Code",Consolas,monospace;';
    document.body.appendChild(r);
  }
  return r;
}

function _view(kind, el) {
  return { __type__:'view', __viewKind__:kind, __el__:el, __children__:[], x:0, y:0, width:0, height:0 };
}

function _css(el, obj) {
  for (const k in obj) el.style[k] = obj[k];
  return el;
}

function _el(tag, cssText) {
  const e = document.createElement(tag);
  if (cssText) e.style.cssText = cssText;
  return e;
}

/* ─────────────────────────────────────────────────────────────────────────────
   1. IMAGE BACKGROUNDS  (the fixed, proper version of gui.zl's broken loadImage)
   ───────────────────────────────────────────────────────────────────────────── */

function advgui_setBackgroundImage(target, src, opts) {
  opts = opts || {};
  const fit = opts.fit || 'cover';
  const el = (target && target.__body__) || (target && target.__el__) || target;
  if (!el || !el.style) { if (opts.onError) opts.onError(target); return target; }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    el.style.backgroundImage = 'url("' + src.replace(/"/g,'\\"') + '")';
    el.style.backgroundSize = fit;
    el.style.backgroundPosition = opts.position || 'center';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundColor = opts.fallback || el.style.backgroundColor;
    if (opts.blur) el.style.filter = 'blur(' + opts.blur + 'px)';
    if (opts.dim) {
      el.style.backgroundBlendMode = 'darken';
      el.style.backgroundColor = 'rgba(0,0,0,' + opts.dim + ')';
    }
    if (target && typeof target === 'object') target.__bgReady__ = true;
    if (typeof opts.onLoad === 'function') opts.onLoad(target);
  };
  img.onerror = () => { if (typeof opts.onError === 'function') opts.onError(target); };
  img.src = src;
  if (target && typeof target === 'object' && !target.setBackgroundImage) {
    target.setBackgroundImage = (s, o) => advgui_setBackgroundImage(target, s, o);
  }
  return target;
}

function advgui_extend(view) {
  if (!view || typeof view !== 'object') return view;
  view.setBackgroundImage = (src, opts) => advgui_setBackgroundImage(view, src, opts);
  view.animate = (props, dur, easing, cb) => advgui_animate(view, props, dur, easing, cb);
  view.addEffect = (type, opts) => advgui_addEffect(view, type, opts);
  view.fadeIn = (dur, cb) => advgui_fadeIn(view, dur, cb);
  view.fadeOut = (dur, cb) => advgui_fadeOut(view, dur, cb);
  return view;
}

function advgui_loadImage(src, cb) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  const v = _view('image', null);
  v.__img__ = img; v.ready = false; v.src = src;
  img.onload = () => { v.ready = true; v.width = img.naturalWidth; v.height = img.naturalHeight; if (cb) cb(v); };
  img.onerror = () => { v.ready = false; if (cb) cb(null); };
  img.src = src;
  return v;
}

function advgui_pickImage(cb) {
  const inp = _el('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
  document.body.appendChild(inp);
  inp.addEventListener('change', () => {
    const f = inp.files[0];
    document.body.removeChild(inp);
    if (!f) { if (cb) cb(null); return; }
    advgui_loadImage(URL.createObjectURL(f), cb);
  });
  inp.click();
}

/* ─────────────────────────────────────────────────────────────────────────────
   2. ANIMATION ENGINE + EFFECTS
   ───────────────────────────────────────────────────────────────────────────── */

const _easings = {
  linear: t => t,
  easeIn: t => t*t,
  easeOut: t => t*(2-t),
  easeInOut: t => t<0.5 ? 2*t*t : -1+(4-2*t)*t,
  bounce: t => { const n1=7.5625,d1=2.75; if(t<1/d1) return n1*t*t; if(t<2/d1){t-=1.5/d1; return n1*t*t+0.75;} if(t<2.5/d1){t-=2.25/d1; return n1*t*t+0.9375;} t-=2.625/d1; return n1*t*t+0.984375; },
  elastic: t => t===0||t===1 ? t : -Math.pow(2,10*(t-1))*Math.sin((t-1.1)*5*Math.PI),
};

function advgui_animate(view, props, duration, easing, cb) {
  const el = (view && (view.__el__ || view.__body__)) || view;
  if (!el) return view;
  duration = duration || 400;
  const fn = _easings[easing] || _easings.easeInOut;
  const start = {}, delta = {};
  const numeric = ['left','top','width','height','opacity'];
  for (const k in props) {
    if (k === 'transform') continue;
    const cur = parseFloat(getComputedStyle(el)[k]) || 0;
    start[k] = cur; delta[k] = props[k] - cur;
  }
  const t0 = performance.now();
  function step(ts) {
    const p = Math.min(1, (ts - t0) / duration);
    const e = fn(p);
    for (const k in props) {
      if (k === 'transform') { el.style.transform = props.transform; continue; }
      const val = start[k] + delta[k]*e;
      el.style[k] = numeric.indexOf(k) >= 0 && k !== 'opacity' ? val+'px' : val;
    }
    if (p < 1) requestAnimationFrame(step);
    else if (cb) cb(view);
  }
  requestAnimationFrame(step);
  return view;
}

function advgui_fadeIn(view, dur, cb) {
  const el = (view && (view.__el__ || view.__body__)) || view;
  if (el) { el.style.opacity = 0; el.style.display = ''; }
  return advgui_animate(view, { opacity: 1 }, dur || 300, 'easeOut', cb);
}
function advgui_fadeOut(view, dur, cb) {
  return advgui_animate(view, { opacity: 0 }, dur || 300, 'easeIn', v => {
    const el = (v && (v.__el__ || v.__body__)) || v;
    if (el) el.style.display = 'none';
    if (cb) cb(v);
  });
}
function advgui_slideIn(view, dir, dur, cb) {
  const el = (view && (view.__el__ || view.__body__)) || view;
  if (!el) return view;
  const target = { left: view.x||0, top: view.y||0 };
  const off = 60;
  if (dir === 'left') el.style.left = (target.left - off) + 'px';
  else if (dir === 'right') el.style.left = (target.left + off) + 'px';
  else if (dir === 'up') el.style.top = (target.top - off) + 'px';
  else el.style.top = (target.top + off) + 'px';
  el.style.opacity = 0;
  return advgui_animate(view, Object.assign({opacity:1}, target), dur || 350, 'easeOut', cb);
}
function advgui_pulse(view, scale, dur) {
  const el = (view && (view.__el__ || view.__body__)) || view;
  if (!el) return view;
  el.style.transition = 'transform ' + (dur||150) + 'ms ease';
  el.style.transform = 'scale(' + (scale||1.08) + ')';
  setTimeout(() => { el.style.transform = 'scale(1)'; }, dur||150);
  return view;
}
function advgui_shake(view, dur) {
  const el = (view && (view.__el__ || view.__body__)) || view;
  if (!el) return view;
  const kf = '@keyframes advgui_shake{10%,90%{transform:translateX(-1px)}20%,80%{transform:translateX(2px)}30%,50%,70%{transform:translateX(-4px)}40%,60%{transform:translateX(4px)}}';
  _ensureStyle('advgui-shake-kf', kf);
  el.style.animation = 'advgui_shake ' + (dur||500) + 'ms';
  setTimeout(() => { el.style.animation = ''; }, dur||500);
  return view;
}

function _ensureStyle(id, css) {
  if (document.getElementById(id)) return;
  const s = _el('style'); s.id = id; s.textContent = css; document.head.appendChild(s);
}

function advgui_addEffect(view, type, opts) {
  opts = opts || {};
  const el = (view && (view.__el__ || view.__body__)) || view;
  if (!el) return view;
  if (type === 'glow') {
    el.style.boxShadow = '0 0 ' + (opts.size||18) + 'px ' + (opts.color||'#8be9fd');
  } else if (type === 'shadow') {
    el.style.boxShadow = (opts.x||0)+'px '+(opts.y||8)+'px '+(opts.blur||24)+'px '+(opts.color||'rgba(0,0,0,.5)');
  } else if (type === 'blur') {
    el.style.filter = 'blur(' + (opts.amount||4) + 'px)';
  } else if (type === 'glass') {
    el.style.backdropFilter = 'blur(' + (opts.amount||12) + 'px) saturate(140%)';
    el.style.background = opts.tint || 'rgba(255,255,255,0.08)';
    el.style.border = '1px solid rgba(255,255,255,0.15)';
  } else if (type === 'scanlines' || type === 'crt') {
    _ensureStyle('advgui-crt-kf', '@keyframes advgui_flicker{0%,100%{opacity:.94}50%{opacity:1}}');
    const overlay = _el('div', 'position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(rgba(0,0,0,0) 0px,rgba(0,0,0,.15) 1px,rgba(0,0,0,0) 2px);mix-blend-mode:multiply;animation:advgui_flicker 4s infinite;');
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.appendChild(overlay);
    if (type === 'crt') { el.style.filter = 'contrast(1.08) brightness(1.05)'; el.style.borderRadius = el.style.borderRadius || '10px'; }
  } else if (type === 'grain') {
    el.style.background = (el.style.background||'') + ', repeating-radial-gradient(circle,rgba(255,255,255,.03) 0,rgba(0,0,0,.03) 1px,transparent 2px)';
  }
  return view;
}

function advgui_particleBurst(canvasView, x, y, opts) {
  opts = opts || {};
  const ctx = canvasView && canvasView.__ctx__;
  if (!ctx) return;
  const n = opts.count || 24;
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random()*Math.PI*2, sp = 1+Math.random()*(opts.speed||4);
    parts.push({ x, y, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp, life: 1, color: opts.color || '#ffb86c', r: 1+Math.random()*3 });
  }
  const decay = opts.decay || 0.02;
  (function tick() {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    let alive = false;
    parts.forEach(p => {
      if (p.life <= 0) return;
      alive = true;
      p.x += p.vx; p.y += p.vy; p.vy += opts.gravity||0.05; p.life -= decay;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
    });
    ctx.restore();
    if (alive) requestAnimationFrame(tick);
  })();
}

/* ─────────────────────────────────────────────────────────────────────────────
   3. ADVANCED WIDGETS
   ───────────────────────────────────────────────────────────────────────────── */

function advgui_createSlider(x, y, w, min, max, value) {
  min = min===undefined?0:min; max = max===undefined?100:max; value = value===undefined?min:value; w = w||160;
  const el = _el('input', 'position:absolute;left:'+(x||0)+'px;top:'+(y||0)+'px;width:'+w+'px;accent-color:#bd93f9;');
  el.type = 'range'; el.min = min; el.max = max; el.value = value;
  const v = _view('slider', el); v.x=x||0; v.y=y||0; v.width=w; v.height=24;
  v.getValue = () => parseFloat(el.value);
  v.setValue = n => { el.value = n; return v; };
  v.onChange = fn => { el.addEventListener('input', () => fn(parseFloat(el.value))); return v; };
  v.setPosition = (nx,ny) => { v.x=nx; v.y=ny; el.style.left=nx+'px'; el.style.top=ny+'px'; return v; };
  return v;
}

function advgui_createCheckbox(label, x, y, checked) {
  const wrap = _el('label', 'position:absolute;left:'+(x||0)+'px;top:'+(y||0)+'px;display:flex;align-items:center;gap:6px;color:#f8f8f2;font-size:13px;cursor:pointer;user-select:none;');
  const box = _el('input'); box.type = 'checkbox'; box.checked = !!checked; box.style.accentColor = '#50fa7b';
  const span = _el('span'); span.textContent = label || '';
  wrap.appendChild(box); wrap.appendChild(span);
  const v = _view('checkbox', wrap); v.x=x||0; v.y=y||0; v.width=160; v.height=22;
  v.isChecked = () => box.checked;
  v.setChecked = b => { box.checked = !!b; return v; };
  v.onChange = fn => { box.addEventListener('change', () => fn(box.checked)); return v; };
  v.setText = t => { span.textContent = t; return v; };
  return v;
}

function advgui_createRadioGroup(options, x, y, name) {
  name = name || ('advgui_radio_' + Math.random().toString(36).slice(2));
  const wrap = _el('div', 'position:absolute;left:'+(x||0)+'px;top:'+(y||0)+'px;display:flex;flex-direction:column;gap:6px;color:#f8f8f2;font-size:13px;');
  const inputs = [];
  (options||[]).forEach((opt,i) => {
    const lbl = _el('label', 'display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;');
    const rb = _el('input'); rb.type='radio'; rb.name=name; if(i===0) rb.checked=true; rb.style.accentColor='#8be9fd';
    const sp = _el('span'); sp.textContent = String(opt);
    lbl.appendChild(rb); lbl.appendChild(sp); wrap.appendChild(lbl); inputs.push(rb);
  });
  const v = _view('radiogroup', wrap); v.x=x||0; v.y=y||0;
  v.getValue = () => { const i = inputs.findIndex(r=>r.checked); return i>=0 ? options[i] : null; };
  v.setValue = val => { const i = options.indexOf(val); if(i>=0) inputs[i].checked = true; return v; };
  v.onChange = fn => { inputs.forEach(r => r.addEventListener('change', () => { if(r.checked) fn(v.getValue()); })); return v; };
  return v;
}

function advgui_createDropdown(options, x, y, w) {
  const el = _el('select', 'position:absolute;left:'+(x||0)+'px;top:'+(y||0)+'px;width:'+(w||140)+'px;height:30px;background:#282a36;color:#f8f8f2;border:1px solid #44475a;border-radius:5px;font-family:inherit;font-size:13px;padding:2px 6px;');
  (options||[]).forEach(o => { const op = _el('option'); op.value = o; op.textContent = o; el.appendChild(op); });
  const v = _view('dropdown', el); v.x=x||0; v.y=y||0; v.width=w||140; v.height=30;
  v.getValue = () => el.value;
  v.setValue = val => { el.value = val; return v; };
  v.setOptions = opts => { el.innerHTML=''; (opts||[]).forEach(o=>{const op=_el('option');op.value=o;op.textContent=o;el.appendChild(op);}); return v; };
  v.onChange = fn => { el.addEventListener('change', () => fn(el.value)); return v; };
  return v;
}

function advgui_createProgressBar(x, y, w, h) {
  w=w||200; h=h||14;
  const track = _el('div', 'position:absolute;left:'+(x||0)+'px;top:'+(y||0)+'px;width:'+w+'px;height:'+h+'px;background:#282a36;border:1px solid #44475a;border-radius:'+(h/2)+'px;overflow:hidden;');
  const bar = _el('div', 'height:100%;width:0%;background:linear-gradient(90deg,#8be9fd,#50fa7b);transition:width .2s ease;');
  track.appendChild(bar);
  const v = _view('progressbar', track); v.x=x||0; v.y=y||0; v.width=w; v.height=h; v.__value__=0;
  v.setProgress = p => { v.__value__ = Math.max(0,Math.min(100,p)); bar.style.width = v.__value__+'%'; return v; };
  v.getProgress = () => v.__value__;
  v.setColor = (c1,c2) => { bar.style.background = c2 ? 'linear-gradient(90deg,'+c1+','+c2+')' : c1; return v; };
  return v;
}

function advgui_createTabs(tabs, x, y, w, h) {
  w=w||360; h=h||240;
  const wrap = _el('div', 'position:absolute;left:'+(x||0)+'px;top:'+(y||0)+'px;width:'+w+'px;height:'+h+'px;display:flex;flex-direction:column;background:#1e1e2e;border:1px solid #44475a;border-radius:8px;overflow:hidden;');
  const bar = _el('div', 'display:flex;background:#282a36;border-bottom:1px solid #44475a;');
  const body = _el('div', 'flex:1;position:relative;overflow:auto;');
  wrap.appendChild(bar); wrap.appendChild(body);
  const v = _view('tabs', wrap); v.x=x||0; v.y=y||0; v.width=w; v.height=h;
  const pages = [];
  (tabs||[]).forEach((t,i) => {
    const btn = _el('div', 'padding:8px 14px;cursor:pointer;font-size:12px;color:#f8f8f2;border-right:1px solid #44475a;user-select:none;');
    btn.textContent = t.title || ('Tab '+(i+1));
    btn.addEventListener('click', () => v.selectTab(i));
    bar.appendChild(btn);
    const page = _el('div', 'position:absolute;inset:0;padding:8px;display:none;overflow:auto;');
    if (t.content) page.appendChild(t.content.__el__ || t.content);
    body.appendChild(page);
    pages.push({ btn, page });
  });
  v.selectTab = i => {
    pages.forEach((p,j) => { p.page.style.display = j===i ? 'block' : 'none'; p.btn.style.background = j===i ? '#44475a' : ''; });
    v.__active__ = i;
    return v;
  };
  v.addTab = (title, content) => {
    const i = pages.length;
    const btn = _el('div', 'padding:8px 14px;cursor:pointer;font-size:12px;color:#f8f8f2;border-right:1px solid #44475a;');
    btn.textContent = title; btn.addEventListener('click', () => v.selectTab(i)); bar.appendChild(btn);
    const page = _el('div', 'position:absolute;inset:0;padding:8px;display:none;overflow:auto;');
    if (content) page.appendChild(content.__el__ || content);
    body.appendChild(page); pages.push({btn,page}); return v;
  };
  if (pages.length) v.selectTab(0);
  return v;
}

function advgui_createMenuBar(menus, x, y, w) {
  const bar = _el('div', 'position:absolute;left:'+(x||0)+'px;top:'+(y||0)+'px;width:'+(w||'100%')+'px;height:28px;display:flex;background:#282a36;border-bottom:1px solid #44475a;font-size:12px;color:#f8f8f2;user-select:none;');
  const v = _view('menubar', bar); v.x=x||0; v.y=y||0; v.height=28;
  (menus||[]).forEach(m => {
    const item = _el('div', 'padding:6px 12px;cursor:pointer;position:relative;');
    item.textContent = m.label;
    const dd = _el('div', 'position:absolute;top:100%;left:0;background:#282a36;border:1px solid #44475a;border-radius:4px;min-width:140px;display:none;flex-direction:column;z-index:10000;box-shadow:0 8px 20px #0009;');
    (m.items||[]).forEach(it => {
      const row = _el('div', 'padding:7px 12px;cursor:pointer;white-space:nowrap;');
      row.textContent = it.label;
      row.addEventListener('mouseenter', () => row.style.background = '#44475a');
      row.addEventListener('mouseleave', () => row.style.background = '');
      row.addEventListener('click', e => { e.stopPropagation(); dd.style.display='none'; if (it.action) it.action(); });
      dd.appendChild(row);
    });
    item.appendChild(dd);
    item.addEventListener('mouseenter', () => item.style.background = '#44475a');
    item.addEventListener('mouseleave', () => { if (dd.style.display!=='flex') item.style.background=''; });
    item.addEventListener('click', e => {
      e.stopPropagation();
      const opening = dd.style.display !== 'flex';
      bar.querySelectorAll('div > div').forEach(d => d.style.display = 'none');
      dd.style.display = opening ? 'flex' : 'none';
    });
    bar.appendChild(item);
  });
  document.addEventListener('click', () => bar.querySelectorAll('div > div').forEach(d => d.style.display='none'));
  return v;
}

function advgui_createContextMenu(items) {
  const menu = _el('div', 'position:fixed;background:#282a36;border:1px solid #44475a;border-radius:6px;padding:4px;display:none;z-index:99999;box-shadow:0 10px 30px #0009;font-size:12px;color:#f8f8f2;min-width:150px;');
  (items||[]).forEach(it => {
    const row = _el('div', 'padding:7px 12px;cursor:pointer;border-radius:4px;');
    row.textContent = it.label;
    row.addEventListener('mouseenter', () => row.style.background = '#44475a');
    row.addEventListener('mouseleave', () => row.style.background = '');
    row.addEventListener('click', () => { menu.style.display='none'; if (it.action) it.action(); });
    menu.appendChild(row);
  });
  document.body.appendChild(menu);
  document.addEventListener('click', () => menu.style.display = 'none');
  const v = _view('contextmenu', menu);
  v.showAt = (x,y) => { menu.style.left=x+'px'; menu.style.top=y+'px'; menu.style.display='block'; return v; };
  v.attachTo = target => {
    const t = (target && (target.__el__||target.__body__)) || target;
    if (t) t.addEventListener('contextmenu', e => { e.preventDefault(); v.showAt(e.clientX, e.clientY); });
    return v;
  };
  return v;
}

function advgui_createTooltip(target, text) {
  const t = (target && (target.__el__||target.__body__)) || target;
  if (!t) return null;
  const tip = _el('div', 'position:fixed;background:#282a36;color:#f8f8f2;padding:5px 9px;border-radius:5px;font-size:11px;border:1px solid #44475a;display:none;z-index:99999;pointer-events:none;white-space:nowrap;');
  tip.textContent = text;
  document.body.appendChild(tip);
  t.addEventListener('mouseenter', e => { tip.style.display='block'; tip.style.left=e.clientX+12+'px'; tip.style.top=e.clientY+12+'px'; });
  t.addEventListener('mousemove', e => { tip.style.left=e.clientX+12+'px'; tip.style.top=e.clientY+12+'px'; });
  t.addEventListener('mouseleave', () => tip.style.display='none');
  const v = _view('tooltip', tip);
  v.setText = txt => { tip.textContent = txt; return v; };
  return v;
}

function advgui_createModal(title, contentView, opts) {
  opts = opts || {};
  const overlay = _el('div', 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:99998;pointer-events:all;');
  const box = _el('div', 'width:'+(opts.width||420)+'px;background:#1e1e2e;border:1px solid #44475a;border-radius:10px;overflow:hidden;box-shadow:0 20px 60px #000c;');
  const bar = _el('div', 'display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#282a36;border-bottom:1px solid #44475a;');
  const ttl = _el('span', 'color:#f8f8f2;font-size:13px;font-weight:600;'); ttl.textContent = title||'';
  const close = _el('span', 'cursor:pointer;color:#6272a4;font-size:15px;'); close.textContent = '✕';
  bar.appendChild(ttl); bar.appendChild(close);
  const body = _el('div', 'padding:16px;color:#f8f8f2;font-size:13px;position:relative;min-height:60px;');
  if (contentView) body.appendChild(contentView.__el__ || contentView);
  box.appendChild(bar); box.appendChild(body); overlay.appendChild(box);
  document.body.appendChild(overlay);
  const v = _view('modal', overlay);
  v.close = () => overlay.remove();
  close.addEventListener('click', v.close);
  if (opts.closeOnOverlay !== false) overlay.addEventListener('click', e => { if (e.target===overlay) v.close(); });
  v.setTitle = t => { ttl.textContent = t; return v; };
  return v;
}

function advgui_createListView(items, x, y, w, h) {
  w=w||220; h=h||200;
  const wrap = _el('div', 'position:absolute;left:'+(x||0)+'px;top:'+(y||0)+'px;width:'+w+'px;height:'+h+'px;background:#1e1e2e;border:1px solid #44475a;border-radius:6px;overflow:auto;font-size:13px;color:#f8f8f2;');
  const v = _view('listview', wrap); v.x=x||0; v.y=y||0; v.width=w; v.height=h;
  let _selected = -1; const rows = [];
  const _selFn = [];
  function render(list) {
    wrap.innerHTML = ''; rows.length = 0;
    (list||[]).forEach((item,i) => {
      const row = _el('div', 'padding:7px 10px;cursor:pointer;border-bottom:1px solid #282a36;');
      row.textContent = typeof item === 'string' ? item : (item.label||JSON.stringify(item));
      row.addEventListener('mouseenter', () => { if(i!==_selected) row.style.background='#282a36'; });
      row.addEventListener('mouseleave', () => { if(i!==_selected) row.style.background=''; });
      row.addEventListener('click', () => { v.select(i); });
      wrap.appendChild(row); rows.push(row);
    });
  }
  v.setItems = list => { v.__items__ = list||[]; render(v.__items__); return v; };
  v.select = i => {
    rows.forEach((r,j) => r.style.background = j===i ? '#44475a' : '');
    _selected = i; _selFn.forEach(fn => fn(v.__items__[i], i));
    return v;
  };
  v.getSelected = () => _selected>=0 ? v.__items__[_selected] : null;
  v.onSelect = fn => { _selFn.push(fn); return v; };
  v.setItems(items);
  return v;
}

function advgui_createTextArea(x, y, w, h, placeholder) {
  const el = _el('textarea', 'position:absolute;left:'+(x||0)+'px;top:'+(y||0)+'px;width:'+(w||300)+'px;height:'+(h||180)+'px;background:#1e1e2e;color:#f8f8f2;border:1px solid #44475a;border-radius:6px;padding:8px;font-family:inherit;font-size:13px;resize:none;outline:none;box-sizing:border-box;');
  el.placeholder = placeholder || '';
  const v = _view('textarea', el); v.x=x||0; v.y=y||0; v.width=w||300; v.height=h||180;
  v.getValue = () => el.value;
  v.setValue = t => { el.value = t; return v; };
  v.onChange = fn => { el.addEventListener('input', () => fn(el.value)); return v; };
  v.focus = () => { el.focus(); return v; };
  v.setFont = (fam,sz) => { el.style.fontFamily = fam||el.style.fontFamily; el.style.fontSize=(sz||13)+'px'; return v; };
  return v;
}

function advgui_createCodeEditor(x, y, w, h, opts) {
  opts = opts || {};
  const wrap = _el('div', 'position:absolute;left:'+(x||0)+'px;top:'+(y||0)+'px;width:'+(w||480)+'px;height:'+(h||320)+'px;display:flex;background:#1e1e2e;border:1px solid #44475a;border-radius:6px;overflow:hidden;font-family:"Fira Code",Consolas,monospace;font-size:13px;');
  const gutter = _el('div', 'width:42px;background:#191927;color:#6272a4;text-align:right;padding:8px 6px 8px 0;box-sizing:border-box;overflow:hidden;line-height:20px;user-select:none;');
  const ta = _el('textarea', 'flex:1;background:transparent;color:#f8f8f2;border:none;outline:none;resize:none;padding:8px;line-height:20px;white-space:pre;overflow:auto;box-sizing:border-box;');
  ta.spellcheck = false; ta.value = opts.value || '';
  wrap.appendChild(gutter); wrap.appendChild(ta);
  const v = _view('codeeditor', wrap); v.x=x||0; v.y=y||0; v.width=w||480; v.height=h||320;
  function updateGutter() {
    const n = ta.value.split('\n').length;
    let s = ''; for (let i=1;i<=n;i++) s += i + '\n';
    gutter.textContent = s;
    gutter.scrollTop = ta.scrollTop;
  }
  ta.addEventListener('input', updateGutter);
  ta.addEventListener('scroll', () => gutter.scrollTop = ta.scrollTop);
  ta.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = ta.selectionStart, en = ta.selectionEnd;
      ta.value = ta.value.slice(0,s) + '  ' + ta.value.slice(en);
      ta.selectionStart = ta.selectionEnd = s+2;
      updateGutter();
    }
  });
  updateGutter();
  v.getValue = () => ta.value;
  v.setValue = t => { ta.value = t; updateGutter(); return v; };
  v.onChange = fn => { ta.addEventListener('input', () => fn(ta.value)); return v; };
  v.focus = () => { ta.focus(); return v; };
  return v;
}

function advgui_createTreeView(data, x, y, w, h) {
  w=w||220; h=h||280;
  const wrap = _el('div', 'position:absolute;left:'+(x||0)+'px;top:'+(y||0)+'px;width:'+w+'px;height:'+h+'px;background:#1e1e2e;border:1px solid #44475a;border-radius:6px;overflow:auto;font-size:13px;color:#f8f8f2;padding:6px;');
  const v = _view('treeview', wrap); v.x=x||0; v.y=y||0; v.width=w; v.height=h;
  const _sel = [];
  function renderNode(node, depth, parentEl) {
    const row = _el('div', 'padding:4px 6px;padding-left:'+(depth*14+4)+'px;cursor:pointer;border-radius:4px;white-space:nowrap;');
    const isFolder = !!(node.children && node.children.length);
    row.textContent = (isFolder ? (node.__open__ ? '▾ ' : '▸ ') : '  ') + (node.icon ? node.icon+' ' : '') + node.label;
    row.addEventListener('mouseenter', () => row.style.background = '#282a36');
    row.addEventListener('mouseleave', () => row.style.background = '');
    parentEl.appendChild(row);
    const childWrap = _el('div', isFolder && node.__open__ ? '' : 'display:none;');
    parentEl.appendChild(childWrap);
    row.addEventListener('click', () => {
      if (isFolder) { node.__open__ = !node.__open__; childWrap.style.display = node.__open__ ? '' : 'none'; row.textContent = (node.__open__?'▾ ':'▸ ')+(node.icon?node.icon+' ':'')+node.label; }
      _sel.forEach(fn => fn(node));
    });
    if (isFolder) node.children.forEach(c => renderNode(c, depth+1, childWrap));
  }
  v.setData = d => { wrap.innerHTML=''; v.__data__ = d||[]; v.__data__.forEach(n => renderNode(n,0,wrap)); return v; };
  v.onSelect = fn => { _sel.push(fn); return v; };
  v.setData(data);
  return v;
}

function advgui_createColorPicker(x, y, value) {
  const el = _el('input', 'position:absolute;left:'+(x||0)+'px;top:'+(y||0)+'px;width:44px;height:30px;border:1px solid #44475a;border-radius:5px;background:none;cursor:pointer;padding:0;');
  el.type = 'color'; el.value = value || '#ff79c6';
  const v = _view('colorpicker', el); v.x=x||0; v.y=y||0; v.width=44; v.height=30;
  v.getValue = () => el.value;
  v.setValue = c => { el.value = c; return v; };
  v.onChange = fn => { el.addEventListener('input', () => fn(el.value)); return v; };
  return v;
}

function advgui_createToolbar(x, y, w, buttons) {
  const bar = _el('div', 'position:absolute;left:'+(x||0)+'px;top:'+(y||0)+'px;width:'+(w||'100%')+'px;height:36px;display:flex;align-items:center;gap:4px;background:#282a36;border-bottom:1px solid #44475a;padding:0 6px;box-sizing:border-box;');
  const v = _view('toolbar', bar); v.x=x||0; v.y=y||0; v.height=36;
  v.addButton = (label, onClick, icon) => {
    const b = _el('button', 'background:none;border:none;color:#f8f8f2;padding:5px 9px;border-radius:5px;cursor:pointer;font-size:12px;font-family:inherit;');
    b.textContent = (icon?icon+' ':'') + label;
    b.addEventListener('mouseenter', () => b.style.background = '#44475a');
    b.addEventListener('mouseleave', () => b.style.background = '');
    b.addEventListener('click', () => onClick && onClick());
    bar.appendChild(b); return v;
  };
  v.addSeparator = () => { bar.appendChild(_el('div','width:1px;height:60%;background:#44475a;')); return v; };
  (buttons||[]).forEach(bt => v.addButton(bt.label, bt.action, bt.icon));
  return v;
}

function advgui_createStatusBar(x, y, w, text) {
  const el = _el('div', 'position:absolute;left:'+(x||0)+'px;top:'+(y||0)+'px;width:'+(w||'100%')+'px;height:22px;display:flex;align-items:center;padding:0 10px;background:#282a36;border-top:1px solid #44475a;color:#8be9fd;font-size:11px;box-sizing:border-box;');
  el.textContent = text || '';
  const v = _view('statusbar', el); v.x=x||0; v.y=y||0; v.height=22;
  v.setText = t => { el.textContent = t; return v; };
  return v;
}

function advgui_createSplitPane(x, y, w, h, leftView, rightView, ratio) {
  w=w||500; h=h||320; ratio = ratio || 0.3;
  const wrap = _el('div', 'position:absolute;left:'+(x||0)+'px;top:'+(y||0)+'px;width:'+w+'px;height:'+h+'px;display:flex;');
  const left = _el('div', 'width:'+(w*ratio)+'px;position:relative;overflow:auto;background:#1e1e2e;');
  const bar = _el('div', 'width:4px;cursor:col-resize;background:#44475a;');
  const right = _el('div', 'flex:1;position:relative;overflow:auto;background:#1e1e2e;');
  if (leftView) left.appendChild(leftView.__el__||leftView);
  if (rightView) right.appendChild(rightView.__el__||rightView);
  wrap.appendChild(left); wrap.appendChild(bar); wrap.appendChild(right);
  let dragging = false;
  bar.addEventListener('mousedown', () => dragging = true);
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const r = wrap.getBoundingClientRect();
    const nw = Math.max(40, Math.min(w-40, e.clientX - r.left));
    left.style.width = nw + 'px';
  });
  document.addEventListener('mouseup', () => dragging = false);
  const v = _view('splitpane', wrap); v.x=x||0; v.y=y||0; v.width=w; v.height=h;
  return v;
}

function advgui_createDesktopIcon(label, x, y, icon, onOpen) {
  const wrap = _el('div', 'position:absolute;left:'+(x||0)+'px;top:'+(y||0)+'px;width:76px;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;user-select:none;padding:6px;border-radius:6px;');
  const ic = _el('div', 'font-size:30px;line-height:1;filter:drop-shadow(0 3px 4px #0008);'); ic.textContent = icon || '🗂️';
  const lb = _el('div', 'color:#fff;font-size:11px;text-align:center;text-shadow:0 1px 3px #000;'); lb.textContent = label || 'Icon';
  wrap.appendChild(ic); wrap.appendChild(lb);
  wrap.addEventListener('mouseenter', () => wrap.style.background = 'rgba(255,255,255,.12)');
  wrap.addEventListener('mouseleave', () => wrap.style.background = '');
  wrap.addEventListener('dblclick', () => onOpen && onOpen());
  const v = _view('desktopicon', wrap); v.x=x||0; v.y=y||0; v.width=76; v.height=76;
  v.onOpen = fn => { wrap.addEventListener('dblclick', fn); return v; };
  return v;
}

/* ─────────────────────────────────────────────────────────────────────────────
   4. VIRTUAL FILESYSTEM / DRIVES
   ───────────────────────────────────────────────────────────────────────────── */

function advgui_createDrive(label, sizeMB) {
  label = (label || 'C').toUpperCase();
  const key = 'advgui_drive_' + label;
  sizeMB = sizeMB || 64;
  function load() { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch(_) { return {}; } }
  function save(files) { try { localStorage.setItem(key, JSON.stringify(files)); } catch(_) {} }
  let files = load();
  const drive = { label, sizeMB };
  drive.write = (path, content) => { files[path] = String(content); save(files); return true; };
  drive.read = path => (path in files) ? files[path] : null;
  drive.exists = path => path in files;
  drive.remove = path => { delete files[path]; save(files); return true; };
  drive.list = (dir) => {
    dir = dir || '';
    const prefix = dir ? dir.replace(/\/?$/, '/') : '';
    const out = new Set();
    Object.keys(files).forEach(p => {
      if (!p.startsWith(prefix)) return;
      const rest = p.slice(prefix.length);
      const seg = rest.split('/')[0];
      if (seg) out.add(seg + (rest.indexOf('/') >= 0 ? '/' : ''));
    });
    return [...out];
  };
  drive.usage = () => Object.values(files).reduce((s,c) => s + c.length, 0);
  drive.mkdir = path => { const p = path.replace(/\/?$/, '/') + '.keep'; if (!(p in files)) { files[p]=''; save(files); } return true; };
  drive.clear = () => { files = {}; save(files); };
  return drive;
}

function advgui_createFileSystem(drives) {
  const map = {};
  (drives || [advgui_createDrive('C')]).forEach(d => map[d.label] = d);
  const fs = { drives: map };
  function split(path) {
    const m = /^([A-Za-z]):[\/\\]?(.*)$/.exec(path || '');
    if (m) return { drive: m[1].toUpperCase(), rest: m[2] };
    const first = Object.keys(map)[0];
    return { drive: first, rest: path || '' };
  }
  fs.write = (path, content) => { const {drive,rest} = split(path); if (map[drive]) return map[drive].write(rest, content); return false; };
  fs.read = path => { const {drive,rest} = split(path); return map[drive] ? map[drive].read(rest) : null; };
  fs.exists = path => { const {drive,rest} = split(path); return !!map[drive] && map[drive].exists(rest); };
  fs.remove = path => { const {drive,rest} = split(path); return !!map[drive] && map[drive].remove(rest); };
  fs.list = path => { const {drive,rest} = split(path||''); return map[drive] ? map[drive].list(rest) : []; };
  fs.mkdir = path => { const {drive,rest} = split(path); return !!map[drive] && map[drive].mkdir(rest); };
  fs.addDrive = d => { map[d.label] = d; return fs; };
  fs.listDrives = () => Object.keys(map);
  return fs;
}

/* ─────────────────────────────────────────────────────────────────────────────
   5. SIMULATED OS  (desktop, taskbar, start menu, window manager, CLI)
   ───────────────────────────────────────────────────────────────────────────── */

function _osWindow(os, title, w, h) {
  w=w||480; h=h||340;
  const el = _el('div', 'position:absolute;left:'+(60+os.__wins__.length*24)+'px;top:'+(50+os.__wins__.length*24)+'px;width:'+w+'px;height:'+h+'px;background:#1e1e2e;border:1px solid #44475a;border-radius:8px;box-shadow:0 16px 40px #0009;display:flex;flex-direction:column;overflow:hidden;z-index:'+(++os.__z__)+';');
  const bar = _el('div', 'display:flex;align-items:center;height:30px;padding:0 10px;background:#282a36;border-bottom:1px solid #44475a;cursor:move;user-select:none;gap:8px;');
  const ttl = _el('span', 'flex:1;color:#cdd6f4;font-size:12px;font-weight:600;'); ttl.textContent = title||'App';
  const min = _el('span', 'cursor:pointer;color:#f1fa8c;'); min.textContent = '—';
  const max = _el('span', 'cursor:pointer;color:#50fa7b;'); max.textContent = '▢';
  const cls = _el('span', 'cursor:pointer;color:#ff5555;'); cls.textContent = '✕';
  [min,max,cls].forEach(b => b.style.cssText += 'padding:0 4px;font-size:13px;');
  bar.appendChild(ttl); bar.appendChild(min); bar.appendChild(max); bar.appendChild(cls);
  const body = _el('div', 'flex:1;position:relative;overflow:auto;background:#1e1e2e;');
  el.appendChild(bar); el.appendChild(body);
  os.desktopEl.appendChild(el);
  let ox=0, oy=0, dragging=false;
  bar.addEventListener('mousedown', e => { dragging=true; ox=e.clientX-el.offsetLeft; oy=e.clientY-el.offsetTop; el.style.zIndex=++os.__z__; });
  document.addEventListener('mousemove', e => { if(dragging){ el.style.left=(e.clientX-ox)+'px'; el.style.top=(e.clientY-oy)+'px'; }});
  document.addEventListener('mouseup', () => dragging=false);
  el.addEventListener('mousedown', () => el.style.zIndex = ++os.__z__);
  const winObj = _view('oswindow', el);
  winObj.body = body;
  winObj.close = () => { el.remove(); os.__wins__ = os.__wins__.filter(w2=>w2!==winObj); os.taskbar.remove(winObj); };
  cls.addEventListener('click', winObj.close);
  min.addEventListener('click', () => { el.style.display = el.style.display==='none' ? 'flex' : 'none'; });
  let maxed=false, saved='';
  max.addEventListener('click', () => {
    if (maxed) { el.style.cssText = saved; maxed=false; }
    else { saved = el.style.cssText; Object.assign(el.style,{left:'0',top:'0',width:'100%',height:'calc(100% - 44px)',borderRadius:'0'}); maxed=true; }
  });
  winObj.setTitle = t => { ttl.textContent = t; return winObj; };
  winObj.add = child => { body.appendChild(child.__el__ || child); return winObj; };
  winObj.setBackgroundImage = (src,opts) => advgui_setBackgroundImage(winObj, src, opts);
  os.__wins__.push(winObj);
  os.taskbar.add(winObj);
  return winObj;
}

function advgui_createOS(opts) {
  opts = opts || {};
  const container = _el('div', 'position:fixed;inset:0;overflow:hidden;background:'+(opts.background||'#0b0e1a')+';font-family:"JetBrains Mono","Fira Code",Consolas,monospace;user-select:none;');
  document.body.appendChild(container);
  const desktopEl = _el('div', 'position:absolute;top:0;left:0;right:0;bottom:44px;overflow:hidden;');
  const taskbarEl = _el('div', 'position:absolute;left:0;right:0;bottom:0;height:44px;background:#161824;border-top:1px solid #2a2d3e;display:flex;align-items:center;padding:0 8px;gap:8px;z-index:100000;');
  container.appendChild(desktopEl); container.appendChild(taskbarEl);

  const os = { container, desktopEl, taskbarEl, __wins__: [], __z__: 1000, apps: {} };

  const startBtn = _el('div', 'padding:7px 14px;background:#8be9fd22;border:1px solid #8be9fd55;border-radius:6px;color:#8be9fd;font-size:12px;font-weight:700;cursor:pointer;');
  startBtn.textContent = opts.startLabel || '☰ START';
  const clock = _el('div', 'margin-left:auto;color:#cdd6f4;font-size:12px;');
  const runningWrap = _el('div', 'display:flex;gap:6px;flex:1;overflow:hidden;');
  taskbarEl.appendChild(startBtn); taskbarEl.appendChild(runningWrap); taskbarEl.appendChild(clock);
  setInterval(() => { clock.textContent = new Date().toLocaleTimeString(); }, 1000);
  clock.textContent = new Date().toLocaleTimeString();

  os.taskbar = {
    add(win) {
      const chip = _el('div', 'padding:5px 12px;background:#20263a;border-radius:5px;color:#f8f8f2;font-size:11px;cursor:pointer;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;');
      chip.textContent = win.__el__.querySelector('span').textContent;
      chip.addEventListener('click', () => { win.__el__.style.display = win.__el__.style.display==='none' ? 'flex':'none'; win.__el__.style.zIndex = ++os.__z__; });
      runningWrap.appendChild(chip);
      win.__chip__ = chip;
    },
    remove(win) { if (win.__chip__) win.__chip__.remove(); }
  };

  const startMenu = _el('div', 'position:absolute;left:8px;bottom:52px;width:220px;background:#161824;border:1px solid #2a2d3e;border-radius:8px;display:none;flex-direction:column;padding:6px;z-index:100001;box-shadow:0 20px 50px #000a;');
  taskbarEl.parentNode.appendChild(startMenu);
  startBtn.addEventListener('click', () => { startMenu.style.display = startMenu.style.display==='flex' ? 'none' : 'flex'; });
  document.addEventListener('click', e => { if (!startMenu.contains(e.target) && e.target!==startBtn) startMenu.style.display='none'; });

  os.registerApp = (name, icon, launcher) => {
    os.apps[name] = launcher;
    const row = _el('div', 'padding:8px 10px;border-radius:5px;cursor:pointer;color:#f8f8f2;font-size:12px;display:flex;gap:8px;align-items:center;');
    row.innerHTML = '<span>'+(icon||'📦')+'</span><span>'+name+'</span>';
    row.addEventListener('mouseenter', () => row.style.background = '#20263a');
    row.addEventListener('mouseleave', () => row.style.background = '');
    row.addEventListener('click', () => { startMenu.style.display='none'; launcher(os); });
    startMenu.appendChild(row);
    return os;
  };

  os.addIcon = (label, x, y, icon, onOpen) => {
    const ic = advgui_createDesktopIcon(label, x, y, icon, onOpen);
    desktopEl.appendChild(ic.__el__);
    return ic;
  };

  os.openWindow = (title, w, h) => _osWindow(os, title, w, h);
  os.closeAll = () => { [...os.__wins__].forEach(w => w.close()); };
  os.shutdown = () => { container.remove(); };
  os.fs = opts.fs || advgui_createFileSystem([advgui_createDrive('C', 128)]);
  return os;
}

function advgui_createCLI(x, y, w, h, opts) {
  opts = opts || {};
  const wrap = _el('div', 'position:absolute;left:'+(x||0)+'px;top:'+(y||0)+'px;width:'+(w||500)+'px;height:'+(h||300)+'px;background:#0c0e14;border:1px solid #2a2d3e;border-radius:6px;overflow:hidden;display:flex;flex-direction:column;font-family:"Fira Code",Consolas,monospace;font-size:13px;color:#7CFC9A;');
  const out = _el('div', 'flex:1;overflow-y:auto;padding:8px 10px;white-space:pre-wrap;word-break:break-word;');
  const inputRow = _el('div', 'display:flex;align-items:center;padding:0 10px 8px;gap:6px;');
  const prompt = _el('span'); prompt.textContent = opts.prompt || '> ';
  const input = _el('input', 'flex:1;background:transparent;border:none;outline:none;color:#7CFC9A;font-family:inherit;font-size:13px;');
  inputRow.appendChild(prompt); inputRow.appendChild(input);
  wrap.appendChild(out); wrap.appendChild(inputRow);
  const v = _view('cli', wrap); v.x=x||0; v.y=y||0; v.width=w||500; v.height=h||300;

  const commands = {};
  const history = []; let hIdx = -1;
  v.print = (text) => { const l=_el('div'); l.textContent = String(text); out.appendChild(l); out.scrollTop = out.scrollHeight; return v; };
  v.clear = () => { out.innerHTML=''; return v; };
  v.setPrompt = p => { prompt.textContent = p; return v; };
  v.registerCommand = (name, fn, help) => { commands[name] = { fn, help: help||'' }; return v; };
  v.attachFS = fs => { v.fs = fs; return v; };
  v.focus = () => { input.focus(); return v; };
  v.run = (line) => {
    v.print(prompt.textContent + line);
    const parts = line.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return;
    const cmd = parts[0], args = parts.slice(1);
    if (commands[cmd]) { try { commands[cmd].fn(args, v); } catch(e) { v.print('Error: '+e.message); } }
    else v.print(cmd + ': command not found');
  };

  commands.help = { fn: () => { Object.keys(commands).forEach(c => v.print(c + (commands[c].help ? ' — '+commands[c].help : ''))); }, help: 'list commands' };
  commands.clear = { fn: () => v.clear(), help: 'clear screen' };
  commands.echo = { fn: args => v.print(args.join(' ')), help: 'print text' };
  commands.ls = { fn: (args) => { if (!v.fs) return v.print('no filesystem attached'); v.fs.list(args[0]||'').forEach(f => v.print(f)); }, help: 'list files' };
  commands.cat = { fn: (args) => { if (!v.fs) return v.print('no filesystem attached'); const c=v.fs.read(args[0]); v.print(c===null?'file not found':c); }, help: 'print file' };
  commands.write = { fn: (args) => { if (!v.fs) return v.print('no filesystem attached'); const path=args[0]; const content=args.slice(1).join(' '); v.fs.write(path,content); v.print('written '+path); }, help: 'write file' };
  commands.mkdir = { fn: (args) => { if (!v.fs) return v.print('no filesystem attached'); v.fs.mkdir(args[0]); v.print('created '+args[0]); }, help: 'make directory' };

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const line = input.value; input.value='';
      if (line.trim()) { history.push(line); hIdx = history.length; }
      v.run(line);
    } else if (e.key === 'ArrowUp') { if (hIdx>0){hIdx--; input.value=history[hIdx];} }
    else if (e.key === 'ArrowDown') { if (hIdx<history.length-1){hIdx++; input.value=history[hIdx];} else {hIdx=history.length; input.value='';} }
  });
  wrap.addEventListener('click', () => input.focus());
  return v;
}

/* ─────────────────────────────────────────────────────────────────────────────
   6. INTERNET ACCESS
   ───────────────────────────────────────────────────────────────────────────── */

function advgui_httpGet(url, cb) {
  fetch(url).then(r => r.text()).then(t => cb && cb(null, t)).catch(e => cb && cb(e, null));
}
function advgui_httpGetJSON(url, cb) {
  fetch(url).then(r => r.json()).then(j => cb && cb(null, j)).catch(e => cb && cb(e, null));
}
function advgui_httpPost(url, data, cb) {
  fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) })
    .then(r => r.text()).then(t => cb && cb(null, t)).catch(e => cb && cb(e, null));
}

function advgui_createBrowser(x, y, w, h, homeUrl) {
  w=w||640; h=h||420;
  const wrap = _el('div', 'position:absolute;left:'+(x||0)+'px;top:'+(y||0)+'px;width:'+w+'px;height:'+h+'px;display:flex;flex-direction:column;background:#1e1e2e;border:1px solid #44475a;border-radius:8px;overflow:hidden;');
  const bar = _el('div', 'display:flex;gap:6px;padding:6px;background:#282a36;border-bottom:1px solid #44475a;');
  const back = _el('button', 'background:#44475a;color:#f8f8f2;border:none;border-radius:4px;padding:4px 8px;cursor:pointer;'); back.textContent='←';
  const fwd = _el('button', 'background:#44475a;color:#f8f8f2;border:none;border-radius:4px;padding:4px 8px;cursor:pointer;'); fwd.textContent='→';
  const addr = _el('input', 'flex:1;background:#191927;color:#f8f8f2;border:1px solid #44475a;border-radius:4px;padding:5px 8px;font-family:inherit;font-size:12px;');
  const go = _el('button', 'background:#50fa7b;color:#1e1e2e;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-weight:700;'); go.textContent='Go';
  bar.appendChild(back); bar.appendChild(fwd); bar.appendChild(addr); bar.appendChild(go);
  const frame = _el('iframe', 'flex:1;border:none;background:#fff;');
  frame.setAttribute('sandbox','allow-scripts allow-forms allow-same-origin allow-popups');
  wrap.appendChild(bar); wrap.appendChild(frame);
  const v = _view('browser', wrap); v.x=x||0; v.y=y||0; v.width=w; v.height=h;
  const hist = []; let idx = -1;
  function navigate(url) {
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    frame.src = url; addr.value = url;
    hist.splice(idx+1); hist.push(url); idx = hist.length-1;
  }
  go.addEventListener('click', () => navigate(addr.value));
  addr.addEventListener('keydown', e => { if (e.key==='Enter') navigate(addr.value); });
  back.addEventListener('click', () => { if (idx>0) { idx--; frame.src = hist[idx]; addr.value = hist[idx]; } });
  fwd.addEventListener('click', () => { if (idx<hist.length-1) { idx++; frame.src = hist[idx]; addr.value = hist[idx]; } });
  v.navigate = url => { navigate(url); return v; };
  if (homeUrl) navigate(homeUrl);
  return v;
}

/* ─────────────────────────────────────────────────────────────────────────────
   7. IMAGE PROCESSING (operates on a gui.zl Canvas view's context)
   ───────────────────────────────────────────────────────────────────────────── */

function advgui_imgToCanvas(canvasView, src, cb) {
  const ctx = canvasView && canvasView.__ctx__;
  if (!ctx) { if (cb) cb(false); return; }
  const img = new Image(); img.crossOrigin = 'anonymous';
  img.onload = () => {
    ctx.clearRect(0,0,canvasView.width,canvasView.height);
    ctx.drawImage(img, 0, 0, canvasView.width, canvasView.height);
    if (cb) cb(true);
  };
  img.onerror = () => { if (cb) cb(false); };
  img.src = src;
}
function _getPixels(canvasView) {
  const ctx = canvasView.__ctx__;
  return { data: ctx.getImageData(0,0,canvasView.width,canvasView.height), ctx };
}
function advgui_imgGrayscale(canvasView) {
  const { data, ctx } = _getPixels(canvasView), d = data.data;
  for (let i=0;i<d.length;i+=4) { const g=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; d[i]=d[i+1]=d[i+2]=g; }
  ctx.putImageData(data,0,0); return canvasView;
}
function advgui_imgInvert(canvasView) {
  const { data, ctx } = _getPixels(canvasView), d = data.data;
  for (let i=0;i<d.length;i+=4) { d[i]=255-d[i]; d[i+1]=255-d[i+1]; d[i+2]=255-d[i+2]; }
  ctx.putImageData(data,0,0); return canvasView;
}
function advgui_imgBrightness(canvasView, amt) {
  const { data, ctx } = _getPixels(canvasView), d = data.data;
  for (let i=0;i<d.length;i+=4) { d[i]=Math.min(255,Math.max(0,d[i]+amt)); d[i+1]=Math.min(255,Math.max(0,d[i+1]+amt)); d[i+2]=Math.min(255,Math.max(0,d[i+2]+amt)); }
  ctx.putImageData(data,0,0); return canvasView;
}
function advgui_imgContrast(canvasView, amt) {
  const { data, ctx } = _getPixels(canvasView), d = data.data;
  const f = (259*(amt+255))/(255*(259-amt));
  for (let i=0;i<d.length;i+=4) { d[i]=f*(d[i]-128)+128; d[i+1]=f*(d[i+1]-128)+128; d[i+2]=f*(d[i+2]-128)+128; }
  ctx.putImageData(data,0,0); return canvasView;
}
function advgui_imgBlur(canvasView, radius) {
  const ctx = canvasView.__ctx__;
  ctx.save(); ctx.filter = 'blur(' + (radius||3) + 'px)';
  const tmp = document.createElement('canvas'); tmp.width=canvasView.width; tmp.height=canvasView.height;
  tmp.getContext('2d').drawImage(canvasView.__el__,0,0);
  ctx.clearRect(0,0,canvasView.width,canvasView.height);
  ctx.drawImage(tmp,0,0);
  ctx.restore(); return canvasView;
}
function advgui_imgFlip(canvasView, axis) {
  const ctx = canvasView.__ctx__, w=canvasView.width, h=canvasView.height;
  const tmp = document.createElement('canvas'); tmp.width=w; tmp.height=h;
  tmp.getContext('2d').drawImage(canvasView.__el__,0,0);
  ctx.save(); ctx.clearRect(0,0,w,h);
  if (axis === 'v') { ctx.translate(0,h); ctx.scale(1,-1); } else { ctx.translate(w,0); ctx.scale(-1,1); }
  ctx.drawImage(tmp,0,0); ctx.restore(); return canvasView;
}
function advgui_imgRotate(canvasView, deg) {
  const ctx = canvasView.__ctx__, w=canvasView.width, h=canvasView.height;
  const tmp = document.createElement('canvas'); tmp.width=w; tmp.height=h;
  tmp.getContext('2d').drawImage(canvasView.__el__,0,0);
  ctx.save(); ctx.clearRect(0,0,w,h);
  ctx.translate(w/2,h/2); ctx.rotate(deg*Math.PI/180); ctx.translate(-w/2,-h/2);
  ctx.drawImage(tmp,0,0); ctx.restore(); return canvasView;
}
function advgui_imgCrop(canvasView, x, y, w, h) {
  const ctx = canvasView.__ctx__;
  const data = ctx.getImageData(x,y,w,h);
  canvasView.setSize(w,h);
  ctx.putImageData(data,0,0);
  return canvasView;
}
function advgui_imgExport(canvasView, filename) {
  const url = canvasView.__el__.toDataURL('image/png');
  const a = _el('a'); a.href = url; a.download = filename || 'image.png';
  document.body.appendChild(a); a.click(); a.remove();
  return url;
}

/* ─────────────────────────────────────────────────────────────────────────────
   8. 2D / PSEUDO-3D GAME HELPERS
   ───────────────────────────────────────────────────────────────────────────── */

function advgui_createSprite(src, frameW, frameH, opts) {
  opts = opts || {};
  const img = new Image(); img.src = src;
  const s = { img, frameW, frameH, frame: 0, fps: opts.fps||8, cols: opts.cols||1, playing: true, __t__:0 };
  s.draw = (ctx, x, y, scale) => {
    scale = scale||1;
    const col = s.frame % s.cols, row = Math.floor(s.frame / s.cols);
    ctx.drawImage(img, col*frameW, row*frameH, frameW, frameH, x, y, frameW*scale, frameH*scale);
  };
  s.update = (dt) => {
    if (!s.playing) return;
    s.__t__ += dt;
    if (s.__t__ > 1000/s.fps) { s.__t__=0; s.frame = (s.frame+1) % (opts.frameCount || s.cols); }
  };
  s.setFrame = f => { s.frame = f; return s; };
  s.play = () => { s.playing = true; return s; };
  s.pause = () => { s.playing = false; return s; };
  return s;
}

function advgui_createParallax(canvasView, layers) {
  const p = { layers: layers||[], offset: 0 };
  p.render = (ctx) => {
    p.layers.forEach(l => {
      const w = canvasView.width, h = canvasView.height;
      const ox = -(p.offset * (l.speed||0.2)) % w;
      ctx.fillStyle = l.color || '#222';
      ctx.fillRect(ox, 0, w, h);
      ctx.fillRect(ox + w, 0, w, h);
      if (l.draw) l.draw(ctx, ox);
    });
  };
  p.scroll = dx => { p.offset += dx; return p; };
  return p;
}

function advgui_createTilemap(tileSize, map) {
  const tm = { tileSize: tileSize||32, map: map||[] };
  tm.draw = (ctx, tileset, camX, camY) => {
    camX = camX||0; camY = camY||0;
    tm.map.forEach((row, ry) => row.forEach((tile, rx) => {
      if (tile < 0) return;
      const sx = rx*tm.tileSize - camX, sy = ry*tm.tileSize - camY;
      if (tileset && tileset.img) {
        const cols = tileset.cols||8;
        const tcol = tile % cols, trow = Math.floor(tile/cols);
        ctx.drawImage(tileset.img, tcol*tm.tileSize, trow*tm.tileSize, tm.tileSize, tm.tileSize, sx, sy, tm.tileSize, tm.tileSize);
      } else {
        ctx.fillStyle = tile === 1 ? '#44475a' : '#282a36';
        ctx.fillRect(sx, sy, tm.tileSize, tm.tileSize);
      }
    }));
  };
  tm.solidAt = (px, py) => {
    const gx = Math.floor(px/tm.tileSize), gy = Math.floor(py/tm.tileSize);
    return !!(tm.map[gy] && tm.map[gy][gx] === 1);
  };
  return tm;
}

function advgui_createParticleSystem(opts) {
  opts = opts || {};
  const ps = { parts: [], gravity: opts.gravity!==undefined?opts.gravity:0.1 };
  ps.emit = (x,y,count,color,speed) => {
    for (let i=0;i<(count||10);i++) {
      const a = Math.random()*Math.PI*2, sp = Math.random()*(speed||3);
      ps.parts.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:1,color:color||'#fff',r:1+Math.random()*2});
    }
  };
  ps.update = () => { ps.parts = ps.parts.filter(p => p.life>0); ps.parts.forEach(p => { p.x+=p.vx; p.y+=p.vy; p.vy+=ps.gravity; p.life-=0.015; }); };
  ps.draw = (ctx) => { ps.parts.forEach(p => { ctx.globalAlpha=Math.max(0,p.life); ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1; }); };
  return ps;
}

function advgui_aabbCollide(a, b) {
  return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
}
function advgui_circleCollide(a, b) {
  const dx=a.x-b.x, dy=a.y-b.y;
  return Math.sqrt(dx*dx+dy*dy) < (a.r+b.r);
}

function advgui_createPhysicsBody(x, y, w, h, opts) {
  opts = opts || {};
  return { x, y, w, h, vx:0, vy:0, mass: opts.mass||1, friction: opts.friction!==undefined?opts.friction:0.85, grounded:false, static: !!opts.static };
}
function advgui_stepPhysics(bodies, gravity, groundY) {
  gravity = gravity===undefined?0.6:gravity;
  bodies.forEach(b => {
    if (b.static) return;
    b.vy += gravity;
    b.x += b.vx; b.y += b.vy;
    b.vx *= b.friction;
    if (groundY !== undefined && b.y+b.h >= groundY) { b.y = groundY-b.h; b.vy = 0; b.grounded = true; } else b.grounded = false;
  });
  for (let i=0;i<bodies.length;i++) for (let j=i+1;j<bodies.length;j++) {
    const a=bodies[i], c=bodies[j];
    if (a.static && c.static) continue;
    if (advgui_aabbCollide(a,c)) {
      const overlapX = Math.min(a.x+a.w-c.x, c.x+c.w-a.x);
      const overlapY = Math.min(a.y+a.h-c.y, c.y+c.h-a.y);
      if (overlapX < overlapY) { if (!a.static) a.x -= overlapX/2*Math.sign(a.x-c.x||1); if (!c.static) c.x += overlapX/2*Math.sign(a.x-c.x||1); }
      else { if (!a.static) a.y -= overlapY/2*Math.sign(a.y-c.y||1); if (!c.static) c.y += overlapY/2*Math.sign(a.y-c.y||1); }
    }
  }
}

function advgui_iso(x, y, z, opts) {
  opts = opts || {};
  const tw = opts.tileWidth||64, th = opts.tileHeight||32;
  return { sx: (x-y)*(tw/2), sy: (x+y)*(th/2) - (z||0)*(opts.heightScale||th) };
}
function advgui_project3D(x, y, z, camera) {
  camera = camera || { x:0, y:0, z:-400, fov:400 };
  const dz = z - camera.z;
  const scale = dz !== 0 ? camera.fov / dz : 1;
  return { sx: (x-camera.x)*scale + (camera.cx||0), sy: (y-camera.y)*scale + (camera.cy||0), scale };
}

/* ─────────────────────────────────────────────────────────────────────────────
   9. FILE I/O HELPERS (notepad / editor save-open)
   ───────────────────────────────────────────────────────────────────────────── */

function advgui_saveTextFile(filename, content) {
  const blob = new Blob([content], { type:'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = _el('a'); a.href = url; a.download = filename || 'untitled.txt';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function advgui_openTextFile(cb) {
  const inp = _el('input'); inp.type='file'; inp.accept='.txt,.js,.zl,.md,.json,text/*'; inp.style.display='none';
  document.body.appendChild(inp);
  inp.addEventListener('change', () => {
    const f = inp.files[0]; document.body.removeChild(inp);
    if (!f) { if (cb) cb(null,null); return; }
    const r = new FileReader();
    r.onload = () => cb && cb(f.name, r.result);
    r.readAsText(f);
  });
  inp.click();
}

/* ─────────────────────────────────────────────────────────────────────────────
   DSALibraries registration (browser / Electron renderer)
   ───────────────────────────────────────────────────────────────────────────── */

if (typeof DSALibraries !== 'undefined') {
  DSALibraries['advgui.zl'] = {
    description: 'ADVGUI extension for gui.zl: real setBackgroundImage, advanced widgets, animation/effects, virtual drives/filesystem, simulated OS + CLI, internet access, image processing, 2D/pseudo-3D game helpers',
    inject(G) {
      const names = [
        'advgui_setBackgroundImage','advgui_extend','advgui_loadImage','advgui_pickImage',
        'advgui_animate','advgui_fadeIn','advgui_fadeOut','advgui_slideIn','advgui_pulse','advgui_shake','advgui_addEffect','advgui_particleBurst',
        'advgui_createSlider','advgui_createCheckbox','advgui_createRadioGroup','advgui_createDropdown','advgui_createProgressBar',
        'advgui_createTabs','advgui_createMenuBar','advgui_createContextMenu','advgui_createTooltip','advgui_createModal',
        'advgui_createListView','advgui_createTextArea','advgui_createCodeEditor','advgui_createTreeView','advgui_createColorPicker',
        'advgui_createToolbar','advgui_createStatusBar','advgui_createSplitPane','advgui_createDesktopIcon',
        'advgui_createDrive','advgui_createFileSystem',
        'advgui_createOS','advgui_createCLI',
        'advgui_httpGet','advgui_httpGetJSON','advgui_httpPost','advgui_createBrowser',
        'advgui_imgToCanvas','advgui_imgGrayscale','advgui_imgInvert','advgui_imgBrightness','advgui_imgContrast','advgui_imgBlur','advgui_imgFlip','advgui_imgRotate','advgui_imgCrop','advgui_imgExport',
        'advgui_createSprite','advgui_createParallax','advgui_createTilemap','advgui_createParticleSystem',
        'advgui_aabbCollide','advgui_circleCollide','advgui_createPhysicsBody','advgui_stepPhysics','advgui_iso','advgui_project3D',
        'advgui_saveTextFile','advgui_openTextFile',
      ];
      if (typeof window !== 'undefined' && window.__ZPP__) {
        window.__ZPP__.registerBuiltins(names);
        window.__ZPP__.registerTypes(['view']);
      }

      G.advgui_setBackgroundImage = advgui_setBackgroundImage;
      G.advgui_extend             = advgui_extend;
      G.advgui_loadImage          = advgui_loadImage;
      G.advgui_pickImage          = advgui_pickImage;

      G.advgui_animate       = advgui_animate;
      G.advgui_fadeIn        = advgui_fadeIn;
      G.advgui_fadeOut       = advgui_fadeOut;
      G.advgui_slideIn       = advgui_slideIn;
      G.advgui_pulse         = advgui_pulse;
      G.advgui_shake         = advgui_shake;
      G.advgui_addEffect     = advgui_addEffect;
      G.advgui_particleBurst = advgui_particleBurst;

      G.advgui_createSlider      = advgui_createSlider;
      G.advgui_createCheckbox    = advgui_createCheckbox;
      G.advgui_createRadioGroup  = advgui_createRadioGroup;
      G.advgui_createDropdown    = advgui_createDropdown;
      G.advgui_createProgressBar = advgui_createProgressBar;
      G.advgui_createTabs        = advgui_createTabs;
      G.advgui_createMenuBar     = advgui_createMenuBar;
      G.advgui_createContextMenu = advgui_createContextMenu;
      G.advgui_createTooltip     = advgui_createTooltip;
      G.advgui_createModal       = advgui_createModal;
      G.advgui_createListView    = advgui_createListView;
      G.advgui_createTextArea    = advgui_createTextArea;
      G.advgui_createCodeEditor  = advgui_createCodeEditor;
      G.advgui_createTreeView    = advgui_createTreeView;
      G.advgui_createColorPicker = advgui_createColorPicker;
      G.advgui_createToolbar     = advgui_createToolbar;
      G.advgui_createStatusBar   = advgui_createStatusBar;
      G.advgui_createSplitPane   = advgui_createSplitPane;
      G.advgui_createDesktopIcon = advgui_createDesktopIcon;

      G.advgui_createDrive      = advgui_createDrive;
      G.advgui_createFileSystem = advgui_createFileSystem;
      G.advgui_createOS         = advgui_createOS;
      G.advgui_createCLI        = advgui_createCLI;

      G.advgui_httpGet      = advgui_httpGet;
      G.advgui_httpGetJSON  = advgui_httpGetJSON;
      G.advgui_httpPost     = advgui_httpPost;
      G.advgui_createBrowser= advgui_createBrowser;

      G.advgui_imgToCanvas   = advgui_imgToCanvas;
      G.advgui_imgGrayscale  = advgui_imgGrayscale;
      G.advgui_imgInvert     = advgui_imgInvert;
      G.advgui_imgBrightness = advgui_imgBrightness;
      G.advgui_imgContrast   = advgui_imgContrast;
      G.advgui_imgBlur       = advgui_imgBlur;
      G.advgui_imgFlip       = advgui_imgFlip;
      G.advgui_imgRotate     = advgui_imgRotate;
      G.advgui_imgCrop       = advgui_imgCrop;
      G.advgui_imgExport     = advgui_imgExport;

      G.advgui_createSprite         = advgui_createSprite;
      G.advgui_createParallax       = advgui_createParallax;
      G.advgui_createTilemap        = advgui_createTilemap;
      G.advgui_createParticleSystem = advgui_createParticleSystem;
      G.advgui_aabbCollide      = advgui_aabbCollide;
      G.advgui_circleCollide    = advgui_circleCollide;
      G.advgui_createPhysicsBody= advgui_createPhysicsBody;
      G.advgui_stepPhysics      = advgui_stepPhysics;
      G.advgui_iso              = advgui_iso;
      G.advgui_project3D        = advgui_project3D;

      G.advgui_saveTextFile = advgui_saveTextFile;
      G.advgui_openTextFile = advgui_openTextFile;
    }
  };
}

if (typeof module !== 'undefined') module.exports = {
  advgui_setBackgroundImage, advgui_extend, advgui_loadImage, advgui_pickImage,
  advgui_animate, advgui_fadeIn, advgui_fadeOut, advgui_slideIn, advgui_pulse, advgui_shake, advgui_addEffect, advgui_particleBurst,
  advgui_createSlider, advgui_createCheckbox, advgui_createRadioGroup, advgui_createDropdown, advgui_createProgressBar,
  advgui_createTabs, advgui_createMenuBar, advgui_createContextMenu, advgui_createTooltip, advgui_createModal,
  advgui_createListView, advgui_createTextArea, advgui_createCodeEditor, advgui_createTreeView, advgui_createColorPicker,
  advgui_createToolbar, advgui_createStatusBar, advgui_createSplitPane, advgui_createDesktopIcon,
  advgui_createDrive, advgui_createFileSystem, advgui_createOS, advgui_createCLI,
  advgui_httpGet, advgui_httpGetJSON, advgui_httpPost, advgui_createBrowser,
  advgui_imgToCanvas, advgui_imgGrayscale, advgui_imgInvert, advgui_imgBrightness, advgui_imgContrast, advgui_imgBlur, advgui_imgFlip, advgui_imgRotate, advgui_imgCrop, advgui_imgExport,
  advgui_createSprite, advgui_createParallax, advgui_createTilemap, advgui_createParticleSystem,
  advgui_aabbCollide, advgui_circleCollide, advgui_createPhysicsBody, advgui_stepPhysics, advgui_iso, advgui_project3D,
  advgui_saveTextFile, advgui_openTextFile,
};

return;
} // end if (_isBrowser)

/* ─────────────────────────────────────────────────────────────────────────────
   NODE / NON-BROWSER FALLBACK  (inert stubs so `require`/import never crashes)
   ───────────────────────────────────────────────────────────────────────────── */

function _stubView(kind) { return { __type__:'view', __viewKind__:kind, __el__:null, __children__:[], x:0,y:0,width:0,height:0,
  setBackgroundImage(){return this;}, animate(){return this;}, addEffect(){return this;}, fadeIn(){return this;}, fadeOut(){return this;} }; }

function advgui_setBackgroundImage(target){ return target; }
function advgui_extend(v){ return v; }
function advgui_loadImage(src, cb){ const v=_stubView('image'); if(cb) setTimeout(()=>cb(null),0); return v; }
function advgui_pickImage(cb){ if(cb) cb(null); }
function advgui_animate(v){ return v; }
function advgui_fadeIn(v,d,cb){ if(cb) cb(v); return v; }
function advgui_fadeOut(v,d,cb){ if(cb) cb(v); return v; }
function advgui_slideIn(v){ return v; }
function advgui_pulse(v){ return v; }
function advgui_shake(v){ return v; }
function advgui_addEffect(v){ return v; }
function advgui_particleBurst(){}
function advgui_createSlider(){ return _stubView('slider'); }
function advgui_createCheckbox(){ return _stubView('checkbox'); }
function advgui_createRadioGroup(){ return _stubView('radiogroup'); }
function advgui_createDropdown(){ return _stubView('dropdown'); }
function advgui_createProgressBar(){ return _stubView('progressbar'); }
function advgui_createTabs(){ return _stubView('tabs'); }
function advgui_createMenuBar(){ return _stubView('menubar'); }
function advgui_createContextMenu(){ return _stubView('contextmenu'); }
function advgui_createTooltip(){ return _stubView('tooltip'); }
function advgui_createModal(){ return _stubView('modal'); }
function advgui_createListView(){ return _stubView('listview'); }
function advgui_createTextArea(){ return _stubView('textarea'); }
function advgui_createCodeEditor(){ return _stubView('codeeditor'); }
function advgui_createTreeView(){ return _stubView('treeview'); }
function advgui_createColorPicker(){ return _stubView('colorpicker'); }
function advgui_createToolbar(){ return _stubView('toolbar'); }
function advgui_createStatusBar(){ return _stubView('statusbar'); }
function advgui_createSplitPane(){ return _stubView('splitpane'); }
function advgui_createDesktopIcon(){ return _stubView('desktopicon'); }

function advgui_createDrive(label, sizeMB) {
  label = (label||'C').toUpperCase(); let files = {};
  return {
    label, sizeMB: sizeMB||64,
    write:(p,c)=>{files[p]=String(c);return true;}, read:p=>(p in files)?files[p]:null,
    exists:p=>p in files, remove:p=>{delete files[p];return true;},
    list:()=>Object.keys(files), usage:()=>Object.values(files).reduce((s,c)=>s+c.length,0),
    mkdir:()=>true, clear:()=>{files={};},
  };
}
function advgui_createFileSystem(drives) {
  const map = {}; (drives||[advgui_createDrive('C')]).forEach(d=>map[d.label]=d);
  return {
    drives: map,
    write:(p,c)=>{const d=Object.values(map)[0]; return d?d.write(p,c):false;},
    read:p=>{const d=Object.values(map)[0]; return d?d.read(p):null;},
    exists:p=>{const d=Object.values(map)[0]; return d?d.exists(p):false;},
    remove:p=>{const d=Object.values(map)[0]; return d?d.remove(p):false;},
    list:()=>{const d=Object.values(map)[0]; return d?d.list():[];},
    mkdir:()=>true, addDrive:d=>{map[d.label]=d;}, listDrives:()=>Object.keys(map),
  };
}
function advgui_createOS(){ console.warn('[advgui.zl] createOS requires a browser environment'); return { apps:{}, registerApp(){return this;}, addIcon(){return null;}, openWindow(){return _stubView('oswindow');}, closeAll(){}, shutdown(){}, fs: advgui_createFileSystem() }; }
function advgui_createCLI(){ console.warn('[advgui.zl] createCLI requires a browser environment'); return _stubView('cli'); }

function advgui_httpGet(url, cb) {
  try {
    const https = url.startsWith('https') ? require('https') : require('http');
    https.get(url, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>cb&&cb(null,d)); }).on('error', e=>cb&&cb(e,null));
  } catch(e) { if (cb) cb(e, null); }
}
function advgui_httpGetJSON(url, cb) { advgui_httpGet(url, (e,t) => { if(e) return cb&&cb(e,null); try { cb&&cb(null, JSON.parse(t)); } catch(err){ cb&&cb(err,null); } }); }
function advgui_httpPost(url, data, cb) { if (cb) cb(new Error('advgui_httpPost requires a browser environment'), null); }
function advgui_createBrowser(){ console.warn('[advgui.zl] createBrowser requires a browser environment'); return _stubView('browser'); }

function advgui_imgToCanvas(v,s,cb){ if(cb) cb(false); }
function advgui_imgGrayscale(v){ return v; }
function advgui_imgInvert(v){ return v; }
function advgui_imgBrightness(v){ return v; }
function advgui_imgContrast(v){ return v; }
function advgui_imgBlur(v){ return v; }
function advgui_imgFlip(v){ return v; }
function advgui_imgRotate(v){ return v; }
function advgui_imgCrop(v){ return v; }
function advgui_imgExport(){ return ''; }

function advgui_createSprite(src, frameW, frameH, opts) {
  opts = opts||{};
  const s = { frameW, frameH, frame:0, fps:opts.fps||8, cols:opts.cols||1, playing:true };
  s.draw = () => {}; s.update = () => {}; s.setFrame=f=>{s.frame=f;return s;}; s.play=()=>{s.playing=true;return s;}; s.pause=()=>{s.playing=false;return s;};
  return s;
}
function advgui_createParallax(cv, layers) { return { layers: layers||[], offset:0, render(){}, scroll(dx){this.offset+=dx;return this;} }; }
function advgui_createTilemap(tileSize, map) {
  const tm = { tileSize: tileSize||32, map: map||[] };
  tm.draw = () => {};
  tm.solidAt = (px,py) => { const gx=Math.floor(px/tm.tileSize), gy=Math.floor(py/tm.tileSize); return !!(tm.map[gy] && tm.map[gy][gx]===1); };
  return tm;
}
function advgui_createParticleSystem(opts) {
  opts = opts||{};
  const ps = { parts:[], gravity: opts.gravity!==undefined?opts.gravity:0.1 };
  ps.emit = (x,y,count,color,speed) => { for(let i=0;i<(count||10);i++){ const a=Math.random()*Math.PI*2, sp=Math.random()*(speed||3); ps.parts.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:1,color:color||'#fff',r:1+Math.random()*2}); } };
  ps.update = () => { ps.parts = ps.parts.filter(p=>p.life>0); ps.parts.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=ps.gravity;p.life-=0.015;}); };
  ps.draw = () => {};
  return ps;
}
function advgui_aabbCollide(a,b){ return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y; }
function advgui_circleCollide(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return Math.sqrt(dx*dx+dy*dy)<(a.r+b.r); }
function advgui_createPhysicsBody(x,y,w,h,opts){ opts=opts||{}; return { x,y,w,h,vx:0,vy:0,mass:opts.mass||1,friction:opts.friction!==undefined?opts.friction:0.85,grounded:false,static:!!opts.static }; }
function advgui_stepPhysics(bodies, gravity, groundY) {
  gravity = gravity===undefined?0.6:gravity;
  bodies.forEach(b => { if (b.static) return; b.vy+=gravity; b.x+=b.vx; b.y+=b.vy; b.vx*=b.friction;
    if (groundY!==undefined && b.y+b.h>=groundY) { b.y=groundY-b.h; b.vy=0; b.grounded=true; } else b.grounded=false; });
}
function advgui_iso(x,y,z,opts){ opts=opts||{}; const tw=opts.tileWidth||64, th=opts.tileHeight||32; return { sx:(x-y)*(tw/2), sy:(x+y)*(th/2)-(z||0)*(opts.heightScale||th) }; }
function advgui_project3D(x,y,z,camera){ camera=camera||{x:0,y:0,z:-400,fov:400}; const dz=z-camera.z; const scale=dz!==0?camera.fov/dz:1; return { sx:(x-camera.x)*scale+(camera.cx||0), sy:(y-camera.y)*scale+(camera.cy||0), scale }; }

function advgui_saveTextFile(){ console.warn('[advgui.zl] saveTextFile requires a browser environment'); }
function advgui_openTextFile(cb){ if (cb) cb(null,null); }

if (typeof DSALibraries !== 'undefined') {
  DSALibraries['advgui.zl'] = {
    description: 'ADVGUI extension for gui.zl (CLI/Node stub mode — full features require a browser/Electron renderer)',
    inject(G) {
      G.advgui_setBackgroundImage=advgui_setBackgroundImage; G.advgui_extend=advgui_extend;
      G.advgui_loadImage=advgui_loadImage; G.advgui_pickImage=advgui_pickImage;
      G.advgui_animate=advgui_animate; G.advgui_fadeIn=advgui_fadeIn; G.advgui_fadeOut=advgui_fadeOut;
      G.advgui_slideIn=advgui_slideIn; G.advgui_pulse=advgui_pulse; G.advgui_shake=advgui_shake;
      G.advgui_addEffect=advgui_addEffect; G.advgui_particleBurst=advgui_particleBurst;
      G.advgui_createSlider=advgui_createSlider; G.advgui_createCheckbox=advgui_createCheckbox;
      G.advgui_createRadioGroup=advgui_createRadioGroup; G.advgui_createDropdown=advgui_createDropdown;
      G.advgui_createProgressBar=advgui_createProgressBar; G.advgui_createTabs=advgui_createTabs;
      G.advgui_createMenuBar=advgui_createMenuBar; G.advgui_createContextMenu=advgui_createContextMenu;
      G.advgui_createTooltip=advgui_createTooltip; G.advgui_createModal=advgui_createModal;
      G.advgui_createListView=advgui_createListView; G.advgui_createTextArea=advgui_createTextArea;
      G.advgui_createCodeEditor=advgui_createCodeEditor; G.advgui_createTreeView=advgui_createTreeView;
      G.advgui_createColorPicker=advgui_createColorPicker; G.advgui_createToolbar=advgui_createToolbar;
      G.advgui_createStatusBar=advgui_createStatusBar; G.advgui_createSplitPane=advgui_createSplitPane;
      G.advgui_createDesktopIcon=advgui_createDesktopIcon;
      G.advgui_createDrive=advgui_createDrive; G.advgui_createFileSystem=advgui_createFileSystem;
      G.advgui_createOS=advgui_createOS; G.advgui_createCLI=advgui_createCLI;
      G.advgui_httpGet=advgui_httpGet; G.advgui_httpGetJSON=advgui_httpGetJSON;
      G.advgui_httpPost=advgui_httpPost; G.advgui_createBrowser=advgui_createBrowser;
      G.advgui_imgToCanvas=advgui_imgToCanvas; G.advgui_imgGrayscale=advgui_imgGrayscale;
      G.advgui_imgInvert=advgui_imgInvert; G.advgui_imgBrightness=advgui_imgBrightness;
      G.advgui_imgContrast=advgui_imgContrast; G.advgui_imgBlur=advgui_imgBlur;
      G.advgui_imgFlip=advgui_imgFlip; G.advgui_imgRotate=advgui_imgRotate;
      G.advgui_imgCrop=advgui_imgCrop; G.advgui_imgExport=advgui_imgExport;
      G.advgui_createSprite=advgui_createSprite; G.advgui_createParallax=advgui_createParallax;
      G.advgui_createTilemap=advgui_createTilemap; G.advgui_createParticleSystem=advgui_createParticleSystem;
      G.advgui_aabbCollide=advgui_aabbCollide; G.advgui_circleCollide=advgui_circleCollide;
      G.advgui_createPhysicsBody=advgui_createPhysicsBody; G.advgui_stepPhysics=advgui_stepPhysics;
      G.advgui_iso=advgui_iso; G.advgui_project3D=advgui_project3D;
      G.advgui_saveTextFile=advgui_saveTextFile; G.advgui_openTextFile=advgui_openTextFile;
    }
  };
}

if (typeof module !== 'undefined') module.exports = {
  advgui_setBackgroundImage, advgui_extend, advgui_loadImage, advgui_pickImage,
  advgui_animate, advgui_fadeIn, advgui_fadeOut, advgui_slideIn, advgui_pulse, advgui_shake, advgui_addEffect, advgui_particleBurst,
  advgui_createSlider, advgui_createCheckbox, advgui_createRadioGroup, advgui_createDropdown, advgui_createProgressBar,
  advgui_createTabs, advgui_createMenuBar, advgui_createContextMenu, advgui_createTooltip, advgui_createModal,
  advgui_createListView, advgui_createTextArea, advgui_createCodeEditor, advgui_createTreeView, advgui_createColorPicker,
  advgui_createToolbar, advgui_createStatusBar, advgui_createSplitPane, advgui_createDesktopIcon,
  advgui_createDrive, advgui_createFileSystem, advgui_createOS, advgui_createCLI,
  advgui_httpGet, advgui_httpGetJSON, advgui_httpPost, advgui_createBrowser,
  advgui_imgToCanvas, advgui_imgGrayscale, advgui_imgInvert, advgui_imgBrightness, advgui_imgContrast, advgui_imgBlur, advgui_imgFlip, advgui_imgRotate, advgui_imgCrop, advgui_imgExport,
  advgui_createSprite, advgui_createParallax, advgui_createTilemap, advgui_createParticleSystem,
  advgui_aabbCollide, advgui_circleCollide, advgui_createPhysicsBody, advgui_stepPhysics, advgui_iso, advgui_project3D,
  advgui_saveTextFile, advgui_openTextFile,
};

})();
