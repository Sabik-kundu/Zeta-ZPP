(function LoaderLib() {
'use strict';

const _isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

let _fs   = null;
let _path = null;

if (!_isBrowser) {
  try { _fs   = require('fs');   } catch(_e) {}
  try { _path = require('path'); } catch(_e) {}
}

const _MIME_MAP = {
  png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif',
  webp:'image/webp', svg:'image/svg+xml', ico:'image/x-icon', bmp:'image/bmp',
  avif:'image/avif', tiff:'image/tiff',
  mp4:'video/mp4', webm:'video/webm', mkv:'video/x-matroska',
  avi:'video/x-msvideo', mov:'video/quicktime', ogv:'video/ogg',
  mp3:'audio/mpeg', wav:'audio/wav', flac:'audio/flac', aac:'audio/aac',
  m4a:'audio/mp4', opus:'audio/opus', oga:'audio/ogg', weba:'audio/webm',
  txt:'text/plain', md:'text/markdown', html:'text/html', htm:'text/html',
  css:'text/css', js:'text/javascript', ts:'text/typescript',
  jsx:'text/javascript', tsx:'text/typescript',
  json:'application/json', xml:'application/xml',
  csv:'text/csv', tsv:'text/tab-separated-values',
  yaml:'text/yaml', yml:'text/yaml',
  sh:'text/x-sh', py:'text/x-python', rb:'text/x-ruby',
  c:'text/x-c', cpp:'text/x-c++', h:'text/x-c',
  java:'text/x-java', rs:'text/x-rust', go:'text/x-go',
  pdf:'application/pdf', zip:'application/zip',
  gz:'application/gzip', tar:'application/x-tar',
  wasm:'application/wasm', ttf:'font/ttf', woff:'font/woff', woff2:'font/woff2',
};

const _IMG_EXTS  = ['png','jpg','jpeg','gif','webp','svg','bmp','ico','avif','tiff'];
const _AUD_EXTS  = ['mp3','wav','flac','aac','m4a','ogg','oga','opus','weba'];
const _VID_EXTS  = ['mp4','webm','mkv','avi','mov','ogv'];
const _TXT_EXTS  = ['txt','md','html','htm','css','js','ts','jsx','tsx','json','xml',
                    'csv','tsv','yaml','yml','sh','py','rb','c','cpp','h','java',
                    'rs','go','log','ini','toml','env'];

function _ext(name) {
  if (!name) return '';
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function _mimeOf(name) {
  return _MIME_MAP[_ext(name)] || 'application/octet-stream';
}

function _basename(p) {
  if (!p) return '';
  return String(p).replace(/\\/g, '/').split('/').pop() || String(p);
}

function _kindOf(e) {
  if (_IMG_EXTS.indexOf(e) >= 0) return 'image';
  if (_AUD_EXTS.indexOf(e) >= 0) return 'audio';
  if (_VID_EXTS.indexOf(e) >= 0) return 'video';
  if (e === 'json')               return 'json';
  if (_TXT_EXTS.indexOf(e) >= 0) return 'text';
  return 'binary';
}

function _makeFileView(kind, name, path, ext2, size, mime, data, url) {
  const v = {
    __type__     : 'file',
    __fileKind__ : kind,
    name  : name  || '',
    path  : path  || null,
    ext   : ext2  || '',
    size  : size  || 0,
    mime  : mime  || 'application/octet-stream',
    data  : data  !== undefined ? data : null,
    url   : url   || null,
    ready : true,
    __el__: null,
  };

  v.asText = () => {
    if (typeof v.data === 'string') return v.data;
    if (v.data && typeof v.data === 'object' && v.data.buffer) {
      try { return new TextDecoder().decode(v.data); } catch(_e) { return ''; }
    }
    if (v.data instanceof ArrayBuffer) {
      try { return new TextDecoder().decode(v.data); } catch(_e) { return ''; }
    }
    return '';
  };

  v.asJSON   = ()    => { try { return JSON.parse(v.asText()); } catch(_e) { return null; } };
  v.asBinary = ()    => (v.data instanceof ArrayBuffer ? v.data : null);
  v.asURL    = ()    => v.url;
  v.getName  = ()    => v.name;
  v.getPath  = ()    => v.path;
  v.getExt   = ()    => v.ext;
  v.getSize  = ()    => v.size;
  v.getMime  = ()    => v.mime;
  v.isImage  = ()    => v.__fileKind__ === 'image';
  v.isAudio  = ()    => v.__fileKind__ === 'audio';
  v.isVideo  = ()    => v.__fileKind__ === 'video';
  v.isText   = ()    => (v.__fileKind__ === 'text' || v.__fileKind__ === 'json');
  v.isBinary = ()    => v.__fileKind__ === 'binary';

  /**
   * edit(newContentOrFn, opts?)
   *
   * Two calling styles:
   *   file.edit('new raw content')
   *   file.edit({ output: 'out.txt' }, (content, file) => transformedContent)
   *   file.edit((content, file) => transformedContent, { output: 'out.txt' })
   */
  v.edit = (newContentOrFn, optsOrFn) => {
    let transformFn  = null;
    let opts         = {};
    let newContent   = null;

    if (typeof newContentOrFn === 'function') {
      transformFn = newContentOrFn;
      opts        = (optsOrFn && typeof optsOrFn === 'object') ? optsOrFn : {};
    } else if (typeof newContentOrFn === 'object' && newContentOrFn !== null && !ArrayBuffer.isView(newContentOrFn) && !(newContentOrFn instanceof ArrayBuffer)) {
      opts        = newContentOrFn;
      transformFn = (typeof optsOrFn === 'function') ? optsOrFn : null;
    } else {
      newContent = newContentOrFn;
      opts       = (optsOrFn && typeof optsOrFn === 'object') ? optsOrFn : {};
    }

    // If a transform function is provided, derive new content from the old
    if (transformFn) {
      const current = (v.__fileKind__ === 'json') ? v.asJSON()
                    : (v.isText && v.isText())     ? v.asText()
                    : v.data;
      const result = transformFn(current, v);
      newContent = (result !== undefined) ? result : current;
      // Serialise objects back to string for text/json files
      if (typeof newContent === 'object' && newContent !== null && !(newContent instanceof ArrayBuffer) && !ArrayBuffer.isView(newContent)) {
        newContent = JSON.stringify(newContent, null, 2);
      }
    }

    // Apply the new content
    v.data = newContent;

    if (_isBrowser && (typeof newContent === 'string' || newContent instanceof ArrayBuffer || (newContent && newContent.buffer))) {
      const blob2 = new Blob([newContent], { type: v.mime });
      if (v.url && v.url.startsWith('blob:')) URL.revokeObjectURL(v.url);
      v.url  = URL.createObjectURL(blob2);
      v.size = blob2.size;
      if (v.__el__) {
        if (v.__el__.src !== undefined) v.__el__.src = v.url;
        if (v.__el__.tagName === 'PRE')  v.__el__.textContent = v.asText();
      }
      // Re-sync any open media element
      if (v._mediaEl) { v._mediaEl.src = v.url; v._mediaEl.load(); }
    } else if (!_isBrowser && v.path && _fs) {
      const outputPath = opts.output || v.path;
      try { _fs.writeFileSync(outputPath, newContent); } catch(_e) {}
      if (opts.output && opts.output !== v.path) {
        // Return a new view pointing at the output file
        return _nodeReadFile(outputPath, null) || v;
      }
    }

    // Browser download to output file name if specified
    if (_isBrowser && opts.output) {
      v.download(opts.output);
    }

    return v;
  };

  v.save = (cb) => {
    if (_isBrowser) {
      v.download(v.name);
      if (cb) cb(null, v);
    } else if (_fs && v.path) {
      try {
        _fs.writeFileSync(v.path, v.data);
        if (cb) cb(null, v);
      } catch(e) { if (cb) cb(e, null); }
    }
    return v;
  };

  v.download = (fname) => {
    if (!_isBrowser) return v;
    const dname = fname || v.name || 'download';
    const a = document.createElement('a');
    if (v.url) {
      a.href = v.url;
    } else if (v.data !== null && v.data !== undefined) {
      const b2 = new Blob([v.data], { type: v.mime });
      a.href = URL.createObjectURL(b2);
    } else {
      return v;
    }
    a.download = dname;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 1200);
    return v;
  };

  v.toBase64 = (cb) => {
    if (_isBrowser) {
      const srcUrl = v.url;
      if (srcUrl) {
        fetch(srcUrl).then(r => r.blob()).then(b2 => {
          const rd = new FileReader();
          rd.onload = () => { if (cb) cb(rd.result.split(',')[1]); };
          rd.readAsDataURL(b2);
        }).catch(() => { if (cb) cb(null); });
      } else if (typeof v.data === 'string') {
        try { if (cb) cb(btoa(unescape(encodeURIComponent(v.data)))); } catch(_e) { if (cb) cb(null); }
      } else if (v.data instanceof ArrayBuffer) {
        const bytes = new Uint8Array(v.data);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        if (cb) cb(btoa(bin));
      } else { if (cb) cb(null); }
    } else if (_fs && v.path) {
      try { if (cb) cb(_fs.readFileSync(v.path).toString('base64')); }
      catch(e) { if (cb) cb(null); }
    } else { if (cb) cb(null); }
    return v;
  };

  v.toDataURL = (cb) => {
    v.toBase64(b64 => {
      if (b64) { if (cb) cb('data:' + v.mime + ';base64,' + b64); }
      else      { if (cb) cb(null); }
    });
    return v;
  };

  v.display = (container) => {
    if (!_isBrowser) return v;
    let el = null;

    if (v.__fileKind__ === 'image') {
      el = document.createElement('img');
      el.src = v.url || '';
      el.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;display:block;border-radius:4px;';
    } else if (v.__fileKind__ === 'audio') {
      el = document.createElement('audio');
      el.src = v.url || '';
      el.controls = true;
      el.style.cssText = 'width:100%;display:block;margin:8px 0;';
    } else if (v.__fileKind__ === 'video') {
      el = document.createElement('video');
      el.src = v.url || '';
      el.controls = true;
      el.style.cssText = 'max-width:100%;max-height:100%;display:block;border-radius:4px;';
    } else if (v.__fileKind__ === 'text' || v.__fileKind__ === 'json') {
      el = document.createElement('pre');
      el.textContent = v.asText();
      el.style.cssText = [
        'color:#f8f8f2','background:#1e1e2e','padding:10px 14px',
        'font-family:"JetBrains Mono","Fira Code",Consolas,monospace',
        'font-size:12px','overflow:auto','white-space:pre-wrap',
        'width:100%','box-sizing:border-box','margin:0','border-radius:4px',
      ].join(';');
    } else {
      el = document.createElement('div');
      el.textContent = '[' + v.__fileKind__ + '] ' + v.name + ' (' + v.size + ' bytes)';
      el.style.cssText = 'color:#6272a4;font-family:monospace;font-size:13px;padding:8px;';
    }

    v.__el__ = el;

    if      (container && container.__body__) container.__body__.appendChild(el);
    else if (container && container.__el__)   container.__el__.appendChild(el);
    else if (container instanceof HTMLElement) container.appendChild(el);

    return v;
  };

  v.preview = () => {
    if (!_isBrowser) return null;
    let el = null;
    if (v.__fileKind__ === 'image') {
      el = document.createElement('img');
      el.src = v.url || '';
      el.style.cssText = 'max-width:120px;max-height:90px;object-fit:contain;border-radius:4px;border:1.5px solid #44475a;display:block;';
    } else if (v.__fileKind__ === 'audio') {
      el = document.createElement('audio');
      el.src = v.url || '';
      el.controls = true;
      el.style.cssText = 'height:36px;width:220px;';
    } else if (v.__fileKind__ === 'video') {
      el = document.createElement('video');
      el.src = v.url || '';
      el.controls = true;
      el.style.cssText = 'max-width:160px;max-height:100px;border-radius:4px;display:block;';
    } else {
      el = document.createElement('span');
      el.textContent = v.name;
      el.style.cssText = 'color:#f8f8f2;font-family:monospace;font-size:12px;display:inline-block;';
    }
    v.__previewEl__ = el;
    return el;
  };

  // ── Media Playback (audio / video) ──────────────────────────────────────
  v._mediaEl = null;
  v._stopAtTime = null;   // used by timed playback
  v._stopTimer  = null;

  v._getMediaEl = () => {
    if (v._mediaEl) return v._mediaEl;
    if (_isBrowser && v.__el__ &&
        (v.__el__.tagName === 'VIDEO' || v.__el__.tagName === 'AUDIO')) {
      v._mediaEl = v.__el__;
    }
    return v._mediaEl;
  };

  v._ensureMediaEl = () => {
    const existing = v._getMediaEl();
    if (existing) {
      // Re-sync src if it drifted (e.g. after edit())
      const wantSrc = v.url || '';
      if (existing.src !== wantSrc && wantSrc) {
        existing.src = wantSrc;
        existing.load();
      }
      return existing;
    }
    if (!_isBrowser) return null;
    if (v.__fileKind__ !== 'audio' && v.__fileKind__ !== 'video') return null;
    const tag = v.__fileKind__ === 'video' ? 'video' : 'audio';
    const mel = document.createElement(tag);
    mel.preload = 'auto';
    mel.src     = v.url || '';
    mel.style.display = 'none';
    // Keep it in the DOM so the browser won't GC the media resource.
    document.body.appendChild(mel);
    mel.load();   // ← critical: actually begin buffering
    v._mediaEl = mel;
    return mel;
  };

  /**
   * play(opts?, cb?)
   *   opts.start_time  – seek to this position (seconds) before playing
   *   opts.stop_time   – pause/stop automatically at this position (seconds)
   *   opts.volume      – 0–1, applied before playback begins
   *   opts.loop        – boolean
   */
  v.play = (opts, cb) => {
    // Allow play(cb) shorthand
    if (typeof opts === 'function') { cb = opts; opts = {}; }
    opts = opts || {};
    if (!_isBrowser) { if (cb) cb(new Error('[loader] play() is browser-only')); return v; }
    const mel = v._ensureMediaEl();
    if (!mel) { if (cb) cb(new Error('[loader] No media element available')); return v; }

    // Clear any previous timed stop
    if (v._stopTimer) { clearTimeout(v._stopTimer); v._stopTimer = null; }

    // Apply pre-play options
    if (opts.volume   !== undefined) mel.volume = Math.max(0, Math.min(1, opts.volume));
    if (opts.loop     !== undefined) mel.loop   = !!opts.loop;
    if (opts.start_time !== undefined && isFinite(opts.start_time)) {
      mel.currentTime = opts.start_time;
    }

    const _doPlay = () => {
      const p = mel.play();
      if (p && p.then) {
        p.then(() => {
          _scheduleStop();
          if (cb) cb(null);
        }).catch(e => { if (cb) cb(e); });
      } else {
        _scheduleStop();
        if (cb) setTimeout(() => cb(null), 0);
      }
    };

    const _scheduleStop = () => {
      if (opts.stop_time !== undefined && isFinite(opts.stop_time)) {
        const remaining = (opts.stop_time - mel.currentTime) * 1000;
        if (remaining > 0) {
          v._stopTimer = setTimeout(() => {
            mel.pause();
            mel.currentTime = opts.stop_time;
            v._stopTimer = null;
          }, remaining);
        } else {
          mel.pause();
        }
      }
    };

    // If metadata not yet loaded, wait for it before seeking
    if (mel.readyState < 1 && (opts.start_time !== undefined || opts.stop_time !== undefined)) {
      mel.addEventListener('loadedmetadata', _doPlay, { once: true });
    } else {
      _doPlay();
    }
    return v;
  };

  v.pause = () => {
    if (!_isBrowser) return v;
    const mel = v._getMediaEl();
    if (mel) mel.pause();
    return v;
  };

  v.stop = () => {
    if (!_isBrowser) return v;
    if (v._stopTimer) { clearTimeout(v._stopTimer); v._stopTimer = null; }
    const mel = v._getMediaEl();
    if (mel) { mel.pause(); mel.currentTime = 0; }
    return v;
  };

  v.seek = (time) => {
    if (!_isBrowser) return v;
    const mel = v._getMediaEl();
    if (mel) mel.currentTime = time;
    return v;
  };

  v.volume = (level) => {
    if (!_isBrowser) return v;
    const mel = v._getMediaEl();
    if (mel) mel.volume = Math.max(0, Math.min(1, level));
    return v;
  };

  v.mute = (on) => {
    if (!_isBrowser) return v;
    const mel = v._getMediaEl();
    if (mel) mel.muted = (on !== false);
    return v;
  };

  v.getDuration = () => {
    const mel = v._getMediaEl();
    return (mel && isFinite(mel.duration)) ? mel.duration : 0;
  };

  v.getCurrentTime = () => {
    const mel = v._getMediaEl();
    return mel ? (mel.currentTime || 0) : 0;
  };

  v.isPlaying = () => {
    const mel = v._getMediaEl();
    return !!(mel && !mel.paused && !mel.ended && mel.readyState > 2);
  };

  v.onEnded = (fn) => {
    if (!_isBrowser || !fn) return v;
    const mel = v._ensureMediaEl();
    if (mel) mel.addEventListener('ended', fn);
    return v;
  };

  v.onTimeUpdate = (fn) => {
    if (!_isBrowser || !fn) return v;
    const mel = v._ensureMediaEl();
    if (mel) mel.addEventListener('timeupdate', () => fn(mel.currentTime, mel.duration));
    return v;
  };

  v.onPlay = (fn) => {
    if (!_isBrowser || !fn) return v;
    const mel = v._ensureMediaEl();
    if (mel) mel.addEventListener('play', fn);
    return v;
  };

  v.onPause = (fn) => {
    if (!_isBrowser || !fn) return v;
    const mel = v._ensureMediaEl();
    if (mel) mel.addEventListener('pause', fn);
    return v;
  };

  v.reload = (cb) => {
    if (v.path) {
      if (!_isBrowser) { return _nodeReadFile(v.path, (e, nv) => { if (!e && nv) { Object.assign(v, nv); } if (cb) cb(e, v); }); }
    }
    if (cb) cb(null, v);
    return v;
  };

  v.revoke = () => {
    if (_isBrowser && v.url && v.url.startsWith('blob:')) {
      URL.revokeObjectURL(v.url);
      v.url = null;
    }
    return v;
  };

  return v;
}

// ── doc type ─────────────────────────────────────────────────────────────────
// A 'doc' is a universal, chainable, self-aware file handle that wraps any
// fileView and exposes the full play / stop / edit API:
//
//   const file = await loader.docAsync('video.mp4');
//   loader.play(file, { start_time: 5, stop_time: 30 });
//   loader.edit(file, { output: 'out.txt' }, c => c.toUpperCase());
//
function _makeDocView(fileView) {
  const doc = Object.assign(Object.create(null), fileView);
  doc.__type__    = 'doc';
  doc.__wrapped__ = fileView;

  /** play(opts?, cb?)  –  opts: { start_time, stop_time, volume, loop } */
  doc.play = (opts, cb) => { fileView.play(opts, cb); return doc; };

  /** stop()  –  immediately pause and reset to 0 */
  doc.stop = () => { fileView.stop(); return doc; };

  /** pause()  –  pause without resetting */
  doc.pause = () => { fileView.pause(); return doc; };

  /** seek(seconds) */
  doc.seek = (t) => { fileView.seek(t); return doc; };

  /** volume(0–1) */
  doc.volume = (l) => { fileView.volume(l); return doc; };

  /** mute(bool) */
  doc.mute = (on) => { fileView.mute(on); return doc; };

  /**
   * edit(optsOrFnOrContent, fnOrOpts?)
   *
   * Examples:
   *   doc.edit(content => content.replace('foo','bar'))
   *   doc.edit({ output: 'result.txt' }, content => content.toUpperCase())
   *   doc.edit('new raw content')
   *   doc.edit('new raw content', { output: 'copy.txt' })
   */
  doc.edit = (optsOrFn, fnOrOpts) => { fileView.edit(optsOrFn, fnOrOpts); return doc; };

  /** display(container?)  –  render into a DOM element */
  doc.display = (container) => { fileView.display(container); return doc; };

  /** save(cb?)  –  save / trigger browser download */
  doc.save = (cb) => { fileView.save(cb); return doc; };

  /** download(name?)  –  browser download with custom filename */
  doc.download = (name) => { fileView.download(name); return doc; };

  /** Convenience content accessors */
  doc.text   = () => fileView.asText();
  doc.json   = () => fileView.asJSON();
  doc.binary = () => fileView.asBinary();
  doc.getURL = () => fileView.url;

  doc.getName     = () => fileView.name;
  doc.getPath     = () => fileView.path;
  doc.getExt      = () => fileView.ext;
  doc.getSize     = () => fileView.size;
  doc.getMime     = () => fileView.mime;
  doc.getDuration = () => fileView.getDuration();
  doc.isPlaying   = () => fileView.isPlaying();
  doc.isAudio     = () => fileView.__fileKind__ === 'audio';
  doc.isVideo     = () => fileView.__fileKind__ === 'video';
  doc.isImage     = () => fileView.__fileKind__ === 'image';
  doc.isText      = () => (fileView.__fileKind__ === 'text' || fileView.__fileKind__ === 'json');
  doc.isBinary    = () => fileView.__fileKind__ === 'binary';
  doc.isDoc       = () => true;

  doc.onEnded      = (fn) => { fileView.onEnded(fn);      return doc; };
  doc.onTimeUpdate = (fn) => { fileView.onTimeUpdate(fn); return doc; };
  doc.onPlay       = (fn) => { fileView.onPlay(fn);       return doc; };
  doc.onPause      = (fn) => { fileView.onPause(fn);      return doc; };

  doc.reload    = (cb) => { fileView.reload(cb);    return doc; };
  doc.revoke    = ()   => { fileView.revoke();       return doc; };
  doc.toBase64  = (cb) => { fileView.toBase64(cb);  return doc; };
  doc.toDataURL = (cb) => { fileView.toDataURL(cb); return doc; };

  return doc;
}

function _makeFolderView(name, path, entries) {
  const v = {
    __type__     : 'folder',
    __fileKind__ : 'folder',
    name    : name    || '',
    path    : path    || null,
    entries : entries || [],
    ready   : true,
  };
  v.list    = ()   => [...v.entries];
  v.files   = ()   => v.entries.filter(e => e.__type__ === 'file');
  v.folders = ()   => v.entries.filter(e => e.__type__ === 'folder');
  v.find    = (n)  => v.entries.find(e => e.name === n) || null;
  v.filter  = (fn) => v.entries.filter(fn);
  v.count   = ()   => v.entries.length;
  v.getName = ()   => v.name;
  v.getPath = ()   => v.path;
  return v;
}

function _browserReadBrowserFile(fileObj, cb) {
  const e2   = _ext(fileObj.name);
  const kind = _kindOf(e2);
  const mime = fileObj.type || _mimeOf(fileObj.name);
  const url  = URL.createObjectURL(fileObj);

  if (kind === 'image' || kind === 'audio' || kind === 'video') {
    const v = _makeFileView(kind, fileObj.name, null, e2, fileObj.size, mime, null, url);
    if (cb) setTimeout(() => cb(null, v), 0);
    return v;
  }

  const rd = new FileReader();
  rd.onerror = () => { if (cb) cb(rd.error, null); };

  if (kind === 'binary') {
    rd.onload = () => {
      const v = _makeFileView(kind, fileObj.name, null, e2, fileObj.size, mime, rd.result, url);
      if (cb) cb(null, v);
    };
    rd.readAsArrayBuffer(fileObj);
  } else {
    rd.onload = () => {
      const v = _makeFileView(kind, fileObj.name, null, e2, fileObj.size, mime, rd.result, url);
      if (cb) cb(null, v);
    };
    rd.readAsText(fileObj);
  }

  const vPending = _makeFileView(kind, fileObj.name, null, e2, fileObj.size, mime, null, url);
  vPending.ready = false;
  return vPending;
}

function _openPicker(accept, multiple, cb) {
  if (!_isBrowser) { if (cb) cb(null, multiple ? [] : null); return; }
  const inp = document.createElement('input');
  inp.type     = 'file';
  inp.accept   = accept  || '*/*';
  inp.multiple = !!multiple;
  inp.style.display = 'none';
  document.body.appendChild(inp);
  inp.onchange = () => {
    const files = Array.from(inp.files || []);
    inp.remove();
    if (!files.length) { if (cb) cb(null, multiple ? [] : null); return; }
    const results = new Array(files.length);
    let done = 0;
    files.forEach((f, i) => {
      _browserReadBrowserFile(f, (err, v) => {
        results[i] = err ? null : v;
        done++;
        if (done === files.length) {
          if (cb) cb(null, multiple ? results : results[0]);
        }
      });
    });
  };
  inp.click();
}

function _fetchAsFile(src, cb) {
  const name = _basename(src);
  const e2   = _ext(name);
  const kind = _kindOf(e2);
  const mime = _mimeOf(name);

  if (kind === 'image') {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => {
      const v = _makeFileView('image', name, src, e2, 0, mime, null, src);
      v.__img__ = img;
      if (cb) cb(null, v);
    };
    img.onerror = () => { if (cb) cb(new Error('Cannot load image: ' + src), null); };
    img.src = src;
    return;
  }

  if (kind === 'audio' || kind === 'video') {
    const v = _makeFileView(kind, name, src, e2, 0, mime, null, src);
    if (cb) setTimeout(() => cb(null, v), 0);
    return;
  }

  fetch(src)
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return kind === 'binary' ? r.arrayBuffer() : r.text(); })
    .then(data => {
      const blob2 = new Blob([data], { type: mime });
      const url2  = URL.createObjectURL(blob2);
      const v = _makeFileView(kind, name, src, e2, typeof data === 'string' ? data.length : data.byteLength, mime, data, url2);
      if (cb) cb(null, v);
    })
    .catch(e => { if (cb) cb(e, null); });
}

function _nodeReadFile(fpath, cb) {
  if (!_fs) { if (cb) cb(new Error('[loader.zl] fs module unavailable'), null); return null; }
  const name = _path ? _path.basename(fpath) : _basename(fpath);
  const e2   = _ext(name);
  const kind = _kindOf(e2);
  const mime = _mimeOf(name);
  try {
    let stat = null;
    try { stat = _fs.statSync(fpath); } catch(_e) {}
    const size = stat ? stat.size : 0;
    const data = (kind === 'binary' || kind === 'image' || kind === 'audio' || kind === 'video')
      ? _fs.readFileSync(fpath)
      : _fs.readFileSync(fpath, 'utf8');
    const v = _makeFileView(kind, name, fpath, e2, size, mime, data, null);
    if (cb) setTimeout(() => cb(null, v), 0);
    return v;
  } catch(e) {
    if (cb) setTimeout(() => cb(e, null), 0);
    return null;
  }
}

function _nodeReadFolder(fpath, cb) {
  if (!_fs) { if (cb) cb(new Error('[loader.zl] fs module unavailable'), null); return null; }
  try {
    const name = _path ? _path.basename(fpath) : _basename(fpath);
    const items = _fs.readdirSync(fpath);
    const entries = items.map(item => {
      const full = _path ? _path.join(fpath, item) : fpath + '/' + item;
      try {
        const s = _fs.statSync(full);
        if (s.isDirectory()) return _makeFolderView(item, full, []);
        const ei  = _ext(item);
        const ki  = _kindOf(ei);
        const mi  = _mimeOf(item);
        return _makeFileView(ki, item, full, ei, s.size, mi, null, null);
      } catch(_e) { return null; }
    }).filter(Boolean);
    const v = _makeFolderView(name, fpath, entries);
    if (cb) setTimeout(() => cb(null, v), 0);
    return v;
  } catch(e) {
    if (cb) setTimeout(() => cb(e, null), 0);
    return null;
  }
}

const loader = {};

loader.file = (src, cb) => {
  if (_isBrowser) {
    if (!src) { _openPicker('*/*', false, cb); return null; }
    if (typeof File !== 'undefined' && src instanceof File) { return _browserReadBrowserFile(src, cb); }
    if (typeof src === 'string') { _fetchAsFile(src, cb); return null; }
    _openPicker('*/*', false, cb);
    return null;
  }
  return _nodeReadFile(src, cb);
};

loader.text = (src, cb) => {
  if (_isBrowser) {
    if (!src) { _openPicker('text/*,.txt,.md,.json,.csv,.log,.js,.ts,.jsx,.tsx,.html,.css,.xml,.yaml,.yml,.sh,.py,.rb,.java,.rs,.go,.c,.cpp,.h', false, cb); return null; }
    if (typeof src === 'string') {
      fetch(src)
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(data => {
          const name = _basename(src);
          const e2   = _ext(name);
          const v = _makeFileView(_kindOf(e2), name, src, e2, data.length, _mimeOf(name), data, null);
          if (cb) cb(null, v);
        })
        .catch(e => { if (cb) cb(e, null); });
      return null;
    }
    _openPicker('text/*,.txt,.md,.json,.csv', false, cb);
    return null;
  }
  if (!_fs) { if (cb) cb(new Error('[loader.zl] fs unavailable'), null); return null; }
  try {
    const name = _path ? _path.basename(src) : _basename(src);
    const e2   = _ext(name);
    const data = _fs.readFileSync(src, 'utf8');
    const v    = _makeFileView(_kindOf(e2), name, src, e2, data.length, _mimeOf(name), data, null);
    if (cb) setTimeout(() => cb(null, v), 0);
    return v;
  } catch(e) { if (cb) setTimeout(() => cb(e, null), 0); return null; }
};

loader.json = (src, cb) => {
  loader.text(src, (err, v) => {
    if (err) { if (cb) cb(err, null); return; }
    if (v) v.__fileKind__ = 'json';
    if (cb) cb(null, v);
  });
  return null;
};

loader.binary = (src, cb) => {
  if (_isBrowser) {
    if (!src) { _openPicker('*/*', false, cb); return null; }
    if (typeof src === 'string') {
      fetch(src)
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
        .then(data => {
          const name = _basename(src);
          const e2   = _ext(name);
          const mime = _mimeOf(name);
          const blob2 = new Blob([data], { type: mime });
          const url  = URL.createObjectURL(blob2);
          const v    = _makeFileView('binary', name, src, e2, data.byteLength, mime, data, url);
          if (cb) cb(null, v);
        })
        .catch(e => { if (cb) cb(e, null); });
      return null;
    }
    _openPicker('*/*', false, cb);
    return null;
  }
  if (!_fs) { if (cb) cb(new Error('[loader.zl] fs unavailable'), null); return null; }
  try {
    const name = _path ? _path.basename(src) : _basename(src);
    const e2   = _ext(name);
    const data = _fs.readFileSync(src);
    const v    = _makeFileView('binary', name, src, e2, data.length, _mimeOf(name), data, null);
    if (cb) setTimeout(() => cb(null, v), 0);
    return v;
  } catch(e) { if (cb) setTimeout(() => cb(e, null), 0); return null; }
};

loader.image = (src, cb) => {
  if (_isBrowser) {
    if (!src) { _openPicker('image/*', false, cb); return null; }
    if (typeof File !== 'undefined' && src instanceof File) { return _browserReadBrowserFile(src, cb); }
    if (typeof src === 'string') {
      const img  = new Image();
      img.crossOrigin = 'anonymous';
      const name = _basename(src);
      const e2   = _ext(name) || 'png';
      img.onload  = () => {
        const v = _makeFileView('image', name, src, e2, 0, _mimeOf(name), null, src);
        v.__img__ = img;
        if (cb) cb(null, v);
      };
      img.onerror = () => { if (cb) cb(new Error('[loader.zl] Cannot load image: ' + src), null); };
      img.src = src;
      return null;
    }
    _openPicker('image/*', false, cb);
    return null;
  }
  return _nodeReadFile(src, cb);
};

loader.png = loader.image;

loader.audio = (src, cb) => {
  if (_isBrowser) {
    if (!src) { _openPicker('audio/*', false, cb); return null; }
    if (typeof File !== 'undefined' && src instanceof File) { return _browserReadBrowserFile(src, cb); }
    if (typeof src === 'string') {
      const name = _basename(src);
      const e2   = _ext(name) || 'mp3';
      const v    = _makeFileView('audio', name, src, e2, 0, _mimeOf(name), null, src);
      if (cb) setTimeout(() => cb(null, v), 0);
      return v;
    }
    _openPicker('audio/*', false, cb);
    return null;
  }
  return _nodeReadFile(src, cb);
};

loader.video = (src, cb) => {
  if (_isBrowser) {
    if (!src) { _openPicker('video/*', false, cb); return null; }
    if (typeof File !== 'undefined' && src instanceof File) { return _browserReadBrowserFile(src, cb); }
    if (typeof src === 'string') {
      const name = _basename(src);
      const e2   = _ext(name) || 'mp4';
      const v    = _makeFileView('video', name, src, e2, 0, _mimeOf(name), null, src);
      if (cb) setTimeout(() => cb(null, v), 0);
      return v;
    }
    _openPicker('video/*', false, cb);
    return null;
  }
  return _nodeReadFile(src, cb);
};

loader.folder = (src, cb) => {
  if (_isBrowser) {
    if (cb) cb(new Error('[loader.zl] Folder listing requires Node/Electron mode'), null);
    return null;
  }
  return _nodeReadFolder(src, cb);
};

loader.list = (src, cb) => loader.folder(src, cb);

// ═══════════════════════════════════════════════════════════════════════════
//  EXTENDED API — image tools, text tools, csv/json tools, media extras,
//                 async helpers, concat, hash, cache, and more
// ═══════════════════════════════════════════════════════════════════════════

// ── Promise wrappers for every major loader ──────────────────────────────────
loader.fileAsync   = (src) => new Promise((res,rej) => loader.file  (src,(e,v)=>e?rej(e):res(v)));
loader.textAsync   = (src) => new Promise((res,rej) => loader.text  (src,(e,v)=>e?rej(e):res(v)));
loader.jsonAsync   = (src) => new Promise((res,rej) => loader.json  (src,(e,v)=>e?rej(e):res(v)));
loader.imageAsync  = (src) => new Promise((res,rej) => loader.image (src,(e,v)=>e?rej(e):res(v)));
loader.audioAsync  = (src) => new Promise((res,rej) => loader.audio (src,(e,v)=>e?rej(e):res(v)));
loader.videoAsync  = (src) => new Promise((res,rej) => loader.video (src,(e,v)=>e?rej(e):res(v)));
loader.binaryAsync = (src) => new Promise((res,rej) => loader.binary(src,(e,v)=>e?rej(e):res(v)));
loader.makeAsync   = (p,c) => new Promise((res,rej) => loader.make  (p,c,(e,v)=>e?rej(e):res(v)));

// ── Batch loaders (all as docs) ──────────────────────────────────────────────
/**
 * loader.batchDocs(sources, cb)
 * Load multiple files simultaneously, each wrapped as a doc.
 */
loader.batchDocs = (sources, cb) => {
  if (!sources || !sources.length) { if (cb) cb(null, []); return []; }
  const results = new Array(sources.length);
  let done = 0;
  sources.forEach((src, i) => {
    loader.doc(src, (err, d) => {
      results[i] = err ? null : d;
      if (++done === sources.length && cb) cb(null, results);
    });
  });
  return results;
};

/** Promise version: const [a,b] = await loader.batchDocsAsync(['a.mp3','b.txt']) */
loader.batchDocsAsync = (sources) => new Promise((res,rej) =>
  loader.batchDocs(sources, (e,ds) => e ? rej(e) : res(ds))
);

// ── Upload shortcuts returning docs ──────────────────────────────────────────
loader.uploadDoc      = (cb) => loader.upload     ((e,v) => cb && cb(e, v?_makeDocView(v):null));
loader.uploadDocAudio = (cb) => loader.uploadAudio((e,v) => cb && cb(e, v?_makeDocView(v):null));
loader.uploadDocVideo = (cb) => loader.uploadVideo((e,v) => cb && cb(e, v?_makeDocView(v):null));
loader.uploadDocImage = (cb) => loader.uploadImage((e,v) => cb && cb(e, v?_makeDocView(v):null));
loader.uploadDocText  = (cb) => loader.uploadText ((e,v) => cb && cb(e, v?_makeDocView(v):null));

// ── In-memory file cache ──────────────────────────────────────────────────────
loader.cache = (() => {
  const _store = Object.create(null);
  return {
    get:    (k)    => _store[k] || null,
    set:    (k, v) => { _store[k] = v; return v; },
    has:    (k)    => !!_store[k],
    delete: (k)    => { delete _store[k]; },
    clear:  ()     => { Object.keys(_store).forEach(k => delete _store[k]); },
    keys:   ()     => Object.keys(_store),
    get size() { return Object.keys(_store).length; },
    /**
     * cache.load(key, src, cb)
     * Serve from cache if already loaded, otherwise fetch + cache it.
     */
    load: (key, src, cb) => {
      if (_store[key]) { if (cb) setTimeout(() => cb(null, _store[key]), 0); return _store[key]; }
      return loader.doc(src, (err, doc) => {
        if (!err && doc) _store[key] = doc;
        if (cb) cb(err, doc);
      });
    },
    loadAsync: (key, src) => new Promise((res,rej) =>
      loader.cache.load(key, src, (e,d) => e ? rej(e) : res(d))
    ),
  };
})();

// ── Media extras ──────────────────────────────────────────────────────────────
/**
 * loader.playbackRate(file, rate)
 * Set playback speed. 1.0 = normal, 0.5 = half speed, 2.0 = double.
 */
loader.playbackRate = (fileView, rate) => {
  if (!fileView || typeof fileView._getMediaEl !== 'function') return null;
  const mel = fileView._getMediaEl();
  if (mel) mel.playbackRate = Math.max(0.1, Math.min(16, rate));
  return fileView;
};

/**
 * loader.loop(file, bool)
 * Enable or disable media looping.
 */
loader.loop = (fileView, on) => {
  if (!fileView || typeof fileView._getMediaEl !== 'function') return null;
  const mel = fileView._getMediaEl();
  if (mel) mel.loop = (on !== false);
  return fileView;
};

/**
 * loader.restart(file, opts?, cb?)
 * Seek to 0 and play from the beginning. Accepts same opts as play().
 */
loader.restart = (fileView, opts, cb) => {
  if (!fileView) return null;
  const o = Object.assign({}, opts || {}, { start_time: 0 });
  if (typeof fileView.play === 'function') return fileView.play(o, cb);
  return null;
};

/**
 * loader.onProgress(file, fn)
 * Fires fn(percent, currentTime, duration) as media plays (0–100).
 */
loader.onProgress = (fileView, fn) => {
  if (!fileView || typeof fileView.onTimeUpdate !== 'function') return fileView;
  fileView.onTimeUpdate((cur, dur) => {
    if (fn && dur > 0) fn(Math.round((cur / dur) * 100), cur, dur);
  });
  return fileView;
};

// ── Text utilities ────────────────────────────────────────────────────────────
/**
 * loader.lines(file) → string[]
 * Split text content into individual lines.
 */
loader.lines = (fileView) => {
  const t = loader.asText(fileView);
  return t ? t.split(/\r?\n/) : [];
};

/**
 * loader.words(file) → string[]
 * Split text content into individual words.
 */
loader.words = (fileView) => {
  const t = loader.asText(fileView);
  return t ? (t.match(/\S+/g) || []) : [];
};

/**
 * loader.stats(file) → { lines, words, chars, bytes }
 */
loader.stats = (fileView) => {
  const t = loader.asText(fileView);
  if (!t) return { lines:0, words:0, chars:0, bytes: fileView ? fileView.size||0 : 0 };
  return {
    lines : t.split(/\r?\n/).length,
    words : (t.match(/\S+/g) || []).length,
    chars : t.length,
    bytes : fileView ? fileView.size || t.length : t.length,
  };
};

/**
 * loader.search(file, query, opts?) → { index, line, col, match }[]
 * Find all occurrences of a string or regex inside a text file.
 * opts.caseSensitive (default false), opts.regex (default false)
 */
loader.search = (fileView, query, opts) => {
  opts = opts || {};
  const text  = loader.asText(fileView);
  if (!text || !query) return [];
  const lines = text.split(/\r?\n/);
  let pattern;
  if (opts.regex) {
    try { pattern = new RegExp(query, opts.caseSensitive ? 'g' : 'gi'); } catch(_e) { return []; }
  } else {
    const esc = String(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pattern   = new RegExp(esc, opts.caseSensitive ? 'g' : 'gi');
  }
  const results = [];
  let charOffset = 0;
  lines.forEach((line, lineIdx) => {
    const lp = new RegExp(pattern.source, pattern.flags);
    let m;
    while ((m = lp.exec(line)) !== null) {
      results.push({ index: charOffset + m.index, line: lineIdx + 1, col: m.index + 1, match: m[0] });
    }
    charOffset += line.length + 1;
  });
  return results;
};

/**
 * loader.filterLines(file, predicateOrRegex) → string
 * Return only the lines that satisfy a predicate function or regex.
 */
loader.filterLines = (fileView, predOrRx) => {
  const lines = loader.lines(fileView);
  if (typeof predOrRx === 'function') return lines.filter(predOrRx).join('\n');
  const rx = (predOrRx instanceof RegExp) ? predOrRx : new RegExp(predOrRx, 'i');
  return lines.filter(l => rx.test(l)).join('\n');
};

/**
 * loader.replaceText(file, find, replace, opts?) → fileView (mutated)
 * opts.regex (bool), opts.caseSensitive (bool), opts.output (filename)
 */
loader.replaceText = (fileView, find, replace, opts) => {
  opts = opts || {};
  const text = loader.asText(fileView);
  if (!text) return fileView;
  let pattern;
  if (opts.regex) {
    try { pattern = new RegExp(find, opts.caseSensitive ? 'g' : 'gi'); } catch(_e) { return fileView; }
  } else {
    const esc = String(find).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pattern   = new RegExp(esc, opts.caseSensitive ? 'g' : 'gi');
  }
  const updated = text.replace(pattern, replace);
  return fileView.edit(opts.output ? { output: opts.output } : updated,
                       opts.output ? () => updated            : undefined);
};

/**
 * loader.concat(files, separator?) → string
 * Concatenate the text content of multiple files into a single string.
 */
loader.concat = (fileViews, separator) => {
  const sep = (separator !== undefined) ? separator : '\n';
  return fileViews.map(v => loader.asText(v)).filter(Boolean).join(sep);
};

/**
 * loader.concatTo(files, outputName, separator?, cb?) → fileView
 * Concatenate and save the result to outputName.
 */
loader.concatTo = (fileViews, outputName, separator, cb) => {
  if (typeof separator === 'function') { cb = separator; separator = '\n'; }
  return loader.make(outputName, loader.concat(fileViews, separator), cb);
};

// ── CSV utilities ─────────────────────────────────────────────────────────────
/**
 * loader.parseCSV(file, opts?) → string[][] | object[]
 * Parse a CSV/TSV file into a 2D array.
 * opts.delimiter  – default ',' (auto-detects '\t' for .tsv files)
 * opts.headers    – if true, returns array-of-objects keyed by first-row headers
 */
loader.parseCSV = (fileView, opts) => {
  opts = opts || {};
  const text  = loader.asText(fileView);
  if (!text) return [];
  const delim = opts.delimiter || ((fileView && fileView.ext === 'tsv') ? '\t' : ',');
  const lines = text.trim().split(/\r?\n/);
  const rows  = lines.map(line => {
    const cols = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === delim && !inQ) { cols.push(cur); cur = ''; }
      else cur += ch;
    }
    cols.push(cur);
    return cols;
  });
  if (opts.headers) {
    const headers = rows[0];
    return rows.slice(1).map(row => {
      const obj = Object.create(null);
      headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ''; });
      return obj;
    });
  }
  return rows;
};

/**
 * loader.toCSV(rows, headers?) → string
 * Serialise a 2D array or array-of-objects back into CSV text.
 */
loader.toCSV = (rows, headers) => {
  const esc = (v) => {
    const s = String(v == null ? '' : v);
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [];
  if (headers) lines.push(headers.map(esc).join(','));
  rows.forEach(row => {
    if (Array.isArray(row)) {
      lines.push(row.map(esc).join(','));
    } else {
      const keys = headers || Object.keys(row);
      lines.push(keys.map(k => esc(row[k])).join(','));
    }
  });
  return lines.join('\n');
};

// ── JSON utilities ────────────────────────────────────────────────────────────
/**
 * loader.filterJSON(file, fn) → any[]
 * Parse as JSON array and return only items where fn(item) is truthy.
 */
loader.filterJSON = (fileView, fn) => {
  const d = loader.asJSON(fileView);
  return Array.isArray(d) ? d.filter(fn) : [];
};

/**
 * loader.mapJSON(file, fn) → any[]
 */
loader.mapJSON = (fileView, fn) => {
  const d = loader.asJSON(fileView);
  return Array.isArray(d) ? d.map(fn) : [];
};

/**
 * loader.sortJSON(file, key, dir?) → any[]
 * Sort a JSON array by a property key. dir: 'asc' (default) | 'desc'
 */
loader.sortJSON = (fileView, key, dir) => {
  const d = loader.asJSON(fileView);
  if (!Array.isArray(d)) return [];
  const m = (dir === 'desc') ? -1 : 1;
  return [...d].sort((a, b) => a[key] < b[key] ? -m : a[key] > b[key] ? m : 0);
};

/**
 * loader.getJSON(file, 'dot.notation.path') → any
 * Deep-read a value from a JSON file.
 */
loader.getJSON = (fileView, keyPath) => {
  const d = loader.asJSON(fileView);
  if (d == null || !keyPath) return d;
  return String(keyPath).split('.').reduce((a, k) => (a != null ? a[k] : undefined), d);
};

/**
 * loader.setJSON(file, 'dot.notation.path', value) → fileView (mutated)
 * Deep-set a value in a JSON file.
 */
loader.setJSON = (fileView, keyPath, value) => {
  const d = loader.asJSON(fileView);
  if (d == null || !keyPath) return fileView;
  const keys = String(keyPath).split('.');
  let cur = d;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return fileView.edit(JSON.stringify(d, null, 2));
};

// ── Image utilities (browser, Canvas API) ────────────────────────────────────
/**
 * loader.imageToCanvas(file) → HTMLCanvasElement | null
 * Draw an image onto a new canvas and return it.
 */
loader.imageToCanvas = (fileView) => {
  if (!_isBrowser || !fileView || !fileView.isImage || !fileView.isImage()) return null;
  const canvas = document.createElement('canvas');
  const img    = fileView.__img__ || new Image();
  const draw   = () => {
    canvas.width  = img.naturalWidth  || img.width  || 300;
    canvas.height = img.naturalHeight || img.height || 150;
    canvas.getContext('2d').drawImage(img, 0, 0);
  };
  if (img.complete && img.naturalWidth) draw();
  else { img.onload = draw; if (!img.src) img.src = fileView.url || ''; }
  return canvas;
};

/**
 * loader.resizeImage(file, width, height, cb)
 * Returns a NEW fileView of the resized image as a PNG blob.
 */
loader.resizeImage = (fileView, width, height, cb) => {
  if (!_isBrowser) { if (cb) cb(new Error('[loader] browser-only'), null); return null; }
  const img = new Image(); img.crossOrigin = 'anonymous';
  img.onload = () => {
    const w = width || img.naturalWidth, h = height || img.naturalHeight;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    c.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const n   = (fileView.name||'img').replace(/\.[^.]+$/,'')+'_'+w+'x'+h+'.png';
      if (cb) cb(null, _makeFileView('image',n,null,'png',blob.size,'image/png',null,url));
    }, 'image/png');
  };
  img.onerror = () => cb && cb(new Error('[loader] cannot load image'), null);
  img.src = fileView && fileView.url ? fileView.url : '';
  return null;
};

/**
 * loader.cropImage(file, x, y, width, height, cb)
 * Crop a region and return a new PNG fileView.
 */
loader.cropImage = (fileView, x, y, w, h, cb) => {
  if (!_isBrowser) { if (cb) cb(new Error('[loader] browser-only'), null); return null; }
  const img = new Image(); img.crossOrigin = 'anonymous';
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);
    c.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const n   = (fileView.name||'img').replace(/\.[^.]+$/,'')+'_crop.png';
      if (cb) cb(null, _makeFileView('image',n,null,'png',blob.size,'image/png',null,url));
    }, 'image/png');
  };
  img.onerror = () => cb && cb(new Error('[loader] cannot load image'), null);
  img.src = fileView && fileView.url ? fileView.url : '';
  return null;
};

/**
 * loader.grayscale(file, cb)
 * Convert an image to grayscale. Returns a new PNG fileView.
 */
loader.grayscale = (fileView, cb) => {
  if (!_isBrowser) { if (cb) cb(new Error('[loader] browser-only'), null); return null; }
  const img = new Image(); img.crossOrigin = 'anonymous';
  img.onload = () => {
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const id  = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < id.data.length; i += 4) {
      const avg = 0.299*id.data[i] + 0.587*id.data[i+1] + 0.114*id.data[i+2];
      id.data[i] = id.data[i+1] = id.data[i+2] = avg;
    }
    ctx.putImageData(id, 0, 0);
    c.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const n   = (fileView.name||'img').replace(/\.[^.]+$/,'')+'_gray.png';
      if (cb) cb(null, _makeFileView('image',n,null,'png',blob.size,'image/png',null,url));
    }, 'image/png');
  };
  img.onerror = () => cb && cb(new Error('[loader] cannot load image'), null);
  img.src = fileView && fileView.url ? fileView.url : '';
  return null;
};

/**
 * loader.adjustImage(file, { brightness, contrast, opacity, blur, saturate, sepia, invert }, cb)
 * Apply CSS filter adjustments and return a new PNG fileView.
 */
loader.adjustImage = (fileView, opts, cb) => {
  if (!_isBrowser) { if (cb) cb(new Error('[loader] browser-only'), null); return null; }
  opts = opts || {};
  const img = new Image(); img.crossOrigin = 'anonymous';
  img.onload = () => {
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const filters = [];
    if (opts.brightness !== undefined) filters.push('brightness('+opts.brightness+')');
    if (opts.contrast   !== undefined) filters.push('contrast('  +opts.contrast  +')');
    if (opts.opacity    !== undefined) filters.push('opacity('   +opts.opacity   +')');
    if (opts.blur       !== undefined) filters.push('blur('      +opts.blur      +'px)');
    if (opts.saturate   !== undefined) filters.push('saturate('  +opts.saturate  +')');
    if (opts.sepia      !== undefined) filters.push('sepia('     +opts.sepia     +')');
    if (opts.invert     !== undefined) filters.push('invert('    +opts.invert    +')');
    if (filters.length) ctx.filter = filters.join(' ');
    ctx.drawImage(img, 0, 0);
    c.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const n   = (fileView.name||'img').replace(/\.[^.]+$/,'')+'_adj.png';
      if (cb) cb(null, _makeFileView('image',n,null,'png',blob.size,'image/png',null,url));
    }, 'image/png');
  };
  img.onerror = () => cb && cb(new Error('[loader] cannot load image'), null);
  img.src = fileView && fileView.url ? fileView.url : '';
  return null;
};

/**
 * loader.flipImage(file, 'horizontal'|'vertical'|'both', cb)
 */
loader.flipImage = (fileView, direction, cb) => {
  if (!_isBrowser) { if (cb) cb(new Error('[loader] browser-only'), null); return null; }
  const img = new Image(); img.crossOrigin = 'anonymous';
  img.onload = () => {
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const fH = direction==='horizontal'||direction==='both';
    const fV = direction==='vertical'  ||direction==='both';
    ctx.save(); ctx.translate(fH?w:0,fV?h:0); ctx.scale(fH?-1:1,fV?-1:1);
    ctx.drawImage(img,0,0); ctx.restore();
    c.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const n   = (fileView.name||'img').replace(/\.[^.]+$/,'')+'_flip.png';
      if (cb) cb(null, _makeFileView('image',n,null,'png',blob.size,'image/png',null,url));
    }, 'image/png');
  };
  img.onerror = () => cb && cb(new Error('[loader] cannot load image'), null);
  img.src = fileView && fileView.url ? fileView.url : '';
  return null;
};

/**
 * loader.rotateImage(file, degrees, cb)
 * Rotate by any angle. Canvas is resized to fit rotated image.
 */
loader.rotateImage = (fileView, degrees, cb) => {
  if (!_isBrowser) { if (cb) cb(new Error('[loader] browser-only'), null); return null; }
  const img = new Image(); img.crossOrigin = 'anonymous';
  img.onload = () => {
    const rad = degrees * Math.PI / 180;
    const sin = Math.abs(Math.sin(rad)), cos = Math.abs(Math.cos(rad));
    const w0  = img.naturalWidth, h0 = img.naturalHeight;
    const w   = Math.round(w0*cos + h0*sin), h = Math.round(w0*sin + h0*cos);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.translate(w/2,h/2); ctx.rotate(rad); ctx.drawImage(img,-w0/2,-h0/2);
    c.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const n   = (fileView.name||'img').replace(/\.[^.]+$/,'')+'_rot'+degrees+'.png';
      if (cb) cb(null, _makeFileView('image',n,null,'png',blob.size,'image/png',null,url));
    }, 'image/png');
  };
  img.onerror = () => cb && cb(new Error('[loader] cannot load image'), null);
  img.src = fileView && fileView.url ? fileView.url : '';
  return null;
};

// ── Hash / checksum ───────────────────────────────────────────────────────────
/**
 * loader.hash(file) → number
 * Fast 32-bit FNV-1a checksum. Useful for dedup / change detection.
 */
loader.hash = (fileView) => {
  let h = 0x811c9dc5;
  const t = loader.asText(fileView) || '';
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
  return h;
};

/**
 * loader.changed(fileA, fileB) → bool
 * True if the two files differ (by hash).
 */
loader.changed = (a, b) => loader.hash(a) !== loader.hash(b);

// ── Meta / introspection helpers ──────────────────────────────────────────────
/**
 * loader.format(file) → 'image'|'audio'|'video'|'text'|'json'|'binary'|'doc'|'folder'|'unknown'
 */
loader.format = (fileView) => {
  if (!fileView) return 'unknown';
  if (fileView.__type__ === 'doc')    return 'doc';
  if (fileView.__type__ === 'folder') return 'folder';
  return fileView.__fileKind__ || 'unknown';
};

/**
 * loader.clone(file, newName?) → fileView
 * Shallow clone a fileView (same data & url, optional new name).
 */
loader.clone = (fileView, newName) => {
  if (!fileView) return null;
  const v = _makeFileView(
    fileView.__fileKind__, newName || fileView.name,
    fileView.path, fileView.ext, fileView.size,
    fileView.mime, fileView.data, fileView.url
  );
  return fileView.__type__ === 'doc' ? _makeDocView(v) : v;
};

/**
 * loader.describe(file) → string
 * Human-readable one-liner summary of a file object.
 */
loader.describe = (fileView) => {
  if (!fileView) return '[null]';
  const kind = fileView.__fileKind__ || '?';
  const name = fileView.name || '(unnamed)';
  const sz   = fileView.size
    ? (' ' + (fileView.size > 1048576
        ? (fileView.size/1048576).toFixed(1)+'MB'
        : fileView.size > 1024
          ? (fileView.size/1024).toFixed(1)+'KB'
          : fileView.size+'B'))
    : '';
  const extra = (kind === 'text')
    ? ' (' + loader.stats(fileView).words + ' words)'
    : (kind === 'audio' || kind === 'video')
      ? ' (' + (loader.getDuration(fileView)||'?') + 's)'
      : '';
  return '[' + kind + '] ' + name + sz + extra;
};


/**
 * loader.doc(src, cb?)
 *
 * Load ANY file and return a full-featured 'doc' object.
 * Works exactly like loader.file() but wraps the result in _makeDocView.
 *
 * Usage:
 *   loader.doc('song.mp3', (err, file) => {
 *     loader.play(file, { start_time: 10, stop_time: 40 });
 *   });
 *
 *   // Async/await style with loader.docAsync:
 *   const file = await loader.docAsync('clip.mp4');
 *   file.play({ start_time: 0, stop_time: 5 });
 */
loader.doc = (src, cb) => {
  return loader.file(src, (err, fileView) => {
    if (err) { if (cb) cb(err, null); return; }
    const doc = _makeDocView(fileView);
    if (cb) cb(null, doc);
  });
};

/** Promise-based variant: const file = await loader.docAsync('x.mp3') */
loader.docAsync = (src) => new Promise((res, rej) => {
  loader.doc(src, (err, doc) => { if (err) rej(err); else res(doc); });
});

/** Wrap an already-loaded fileView in a doc */
loader.asDoc = (fileView) => {
  if (!fileView) return null;
  if (fileView.__type__ === 'doc') return fileView;  // already a doc
  return _makeDocView(fileView);
};

loader.isDoc = (v) => !!(v && v.__type__ === 'doc');



loader.make = (fpath, content, cb) => {
  const name    = _basename(fpath);
  const e2      = _ext(name);
  const kind    = _kindOf(e2);
  const mime    = _mimeOf(name);
  const payload = content !== undefined ? content : '';

  if (_isBrowser) {
    const blob2 = new Blob([payload], { type: mime });
    const url   = URL.createObjectURL(blob2);
    const v     = _makeFileView(kind, name, fpath, e2, blob2.size, mime, payload, url);
    if (cb) setTimeout(() => cb(null, v), 0);
    return v;
  }

  if (!_fs) { if (cb) cb(new Error('[loader.zl] fs unavailable'), null); return null; }
  try {
    if (_path) {
      const dir = _path.dirname(fpath);
      if (dir && !_fs.existsSync(dir)) _fs.mkdirSync(dir, { recursive: true });
    }
    _fs.writeFileSync(fpath, payload);
    return _nodeReadFile(fpath, cb);
  } catch(e) { if (cb) setTimeout(() => cb(e, null), 0); return null; }
};

loader.save  = (fpath, content, cb) => loader.make(fpath, content, cb);
loader.write = (fpath, content, cb) => loader.make(fpath, content, cb);
loader.read  = (src,   cb)          => loader.text(src, cb);

/**
 * loader.edit(target, optsOrFnOrContent?, fnOrOpts?)
 *
 * All calling styles are supported:
 *   loader.edit(file, 'new content')
 *   loader.edit(file, content => content.toUpperCase())
 *   loader.edit(file, { output: 'out.txt' }, content => content.replace('a','b'))
 *   loader.edit(file, content => ({ ...content, key: 'value' }))  // JSON files
 *   loader.edit('path/to/file.txt', 'new content', cb)            // path string (Node)
 */
loader.edit = (target, optsOrFnOrContent, fnOrOptsCb) => {
  if (target && target.__type__ === 'file' || target && target.__type__ === 'doc') {
    const result = target.edit(optsOrFnOrContent, fnOrOptsCb);
    if (typeof fnOrOptsCb === 'function' && !(fnOrOptsCb.length === 2 && typeof optsOrFnOrContent === 'object')) {
      // fnOrOptsCb was the transform fn — no extra cb
    }
    return result || target;
  }
  // Legacy: target is a path string
  if (typeof fnOrOptsCb === 'function') {
    return loader.make(target, optsOrFnOrContent, fnOrOptsCb);
  }
  return loader.make(target, optsOrFnOrContent, null);
};

loader.append = (fpath, content, cb) => {
  if (_isBrowser) { if (cb) cb(new Error('[loader.zl] append requires Node/Electron mode'), null); return null; }
  if (!_fs) { if (cb) cb(new Error('[loader.zl] fs unavailable'), null); return null; }
  try {
    _fs.appendFileSync(fpath, content);
    if (cb) setTimeout(() => cb(null, true), 0);
    return true;
  } catch(e) { if (cb) setTimeout(() => cb(e, null), 0); return null; }
};

loader.delete = (fpath, cb) => {
  if (_isBrowser) { if (cb) cb(new Error('[loader.zl] delete requires Node/Electron mode'), null); return false; }
  if (!_fs) { if (cb) cb(new Error('[loader.zl] fs unavailable'), null); return false; }
  try {
    _fs.unlinkSync(fpath);
    if (cb) setTimeout(() => cb(null, true), 0);
    return true;
  } catch(e) { if (cb) setTimeout(() => cb(e, null), 0); return false; }
};

loader.copy = (src, dest, cb) => {
  if (_isBrowser) { if (cb) cb(new Error('[loader.zl] copy requires Node/Electron mode'), null); return null; }
  if (!_fs) { if (cb) cb(new Error('[loader.zl] fs unavailable'), null); return null; }
  try {
    _fs.copyFileSync(src, dest);
    return _nodeReadFile(dest, cb);
  } catch(e) { if (cb) setTimeout(() => cb(e, null), 0); return null; }
};

loader.move = (src, dest, cb) => {
  if (_isBrowser) { if (cb) cb(new Error('[loader.zl] move requires Node/Electron mode'), null); return null; }
  if (!_fs) { if (cb) cb(new Error('[loader.zl] fs unavailable'), null); return null; }
  try {
    _fs.renameSync(src, dest);
    return _nodeReadFile(dest, cb);
  } catch(e) { if (cb) setTimeout(() => cb(e, null), 0); return null; }
};

loader.rename = (fpath, newName, cb) => {
  if (_isBrowser) { if (cb) cb(new Error('[loader.zl] rename requires Node/Electron mode'), null); return null; }
  if (!_fs || !_path) { if (cb) cb(new Error('[loader.zl] fs/path unavailable'), null); return null; }
  const dir  = _path.dirname(fpath);
  const dest = _path.join(dir, newName);
  return loader.move(fpath, dest, cb);
};

loader.exists = (fpath, cb) => {
  if (_isBrowser) {
    fetch(fpath, { method: 'HEAD' })
      .then(r => { if (cb) cb(null, r.ok); })
      .catch(() => { if (cb) cb(null, false); });
    return null;
  }
  if (!_fs) { if (cb) cb(new Error('[loader.zl] fs unavailable'), null); return false; }
  const result = _fs.existsSync(fpath);
  if (cb) setTimeout(() => cb(null, result), 0);
  return result;
};

loader.info = (fpath, cb) => {
  const name = _basename(fpath);
  const e2   = _ext(name);
  if (_isBrowser) {
    const info = { name, path: fpath, ext: e2, mime: _mimeOf(name), kind: _kindOf(e2), size: 0 };
    if (cb) setTimeout(() => cb(null, info), 0);
    return info;
  }
  if (!_fs) { if (cb) cb(new Error('[loader.zl] fs unavailable'), null); return null; }
  try {
    const s = _fs.statSync(fpath);
    const info = {
      name, path: fpath, ext: e2,
      mime: _mimeOf(name), kind: _kindOf(e2),
      size: s.size, created: s.birthtime, modified: s.mtime,
      isFile: s.isFile(), isFolder: s.isDirectory(),
    };
    if (cb) setTimeout(() => cb(null, info), 0);
    return info;
  } catch(e) { if (cb) setTimeout(() => cb(e, null), 0); return null; }
};

loader.watch = (fpath, fn) => {
  if (_isBrowser) { console.warn('[loader.zl] watch requires Node/Electron mode'); return { stop: () => {} }; }
  if (!_fs) return { stop: () => {} };
  try {
    const watcher = _fs.watch(fpath, { persistent: false }, (event, filename) => {
      if (fn) fn(event, filename, fpath);
    });
    return { stop: () => watcher.close() };
  } catch(e) { return { stop: () => {} }; }
};

loader.createDir = (fpath, cb) => {
  if (_isBrowser) { if (cb) cb(new Error('[loader.zl] createDir requires Node/Electron mode'), null); return false; }
  if (!_fs) { if (cb) cb(new Error('[loader.zl] fs unavailable'), null); return false; }
  try {
    _fs.mkdirSync(fpath, { recursive: true });
    if (cb) setTimeout(() => cb(null, true), 0);
    return true;
  } catch(e) { if (cb) setTimeout(() => cb(e, null), 0); return false; }
};

loader.deleteDir = (fpath, cb) => {
  if (_isBrowser) { if (cb) cb(new Error('[loader.zl] deleteDir requires Node/Electron mode'), null); return false; }
  if (!_fs) { if (cb) cb(new Error('[loader.zl] fs unavailable'), null); return false; }
  try {
    _fs.rmSync(fpath, { recursive: true, force: true });
    if (cb) setTimeout(() => cb(null, true), 0);
    return true;
  } catch(e) { if (cb) setTimeout(() => cb(e, null), 0); return false; }
};

loader.upload = (cb) => {
  _openPicker('*/*', false, cb);
  return null;
};

loader.uploadMany = (cb) => {
  _openPicker('*/*', true, cb);
  return null;
};

loader.uploadImage = (cb) => {
  _openPicker('image/*', false, cb);
  return null;
};

loader.uploadImages = (cb) => {
  _openPicker('image/*', true, cb);
  return null;
};

loader.uploadAudio = (cb) => {
  _openPicker('audio/*', false, cb);
  return null;
};

loader.uploadVideo = (cb) => {
  _openPicker('video/*', false, cb);
  return null;
};

loader.uploadText = (cb) => {
  _openPicker('text/*,.txt,.md,.json,.csv,.log,.js,.ts,.html,.css,.xml,.yaml,.yml', false, cb);
  return null;
};

loader.uploadAny = (cb) => {
  _openPicker('*/*', true, cb);
  return null;
};

loader.reupload = (fileView, cb) => {
  const acceptMap = {
    image:'image/*', audio:'audio/*', video:'video/*',
    text:'text/*', json:'application/json,.json', binary:'*/*',
  };
  const accept = (fileView && fileView.__fileKind__ && acceptMap[fileView.__fileKind__]) || '*/*';
  _openPicker(accept, false, (err, v) => {
    if (!err && v && fileView && fileView.__type__ === 'file') {
      fileView.data         = v.data;
      fileView.url          = v.url;
      fileView.name         = v.name;
      fileView.ext          = v.ext;
      fileView.size         = v.size;
      fileView.mime         = v.mime;
      fileView.__fileKind__ = v.__fileKind__;
      fileView.ready        = true;
      if (fileView.__el__) {
        if (fileView.__el__.src !== undefined) fileView.__el__.src = v.url;
        if (fileView.__el__.tagName === 'PRE')  fileView.__el__.textContent = v.asText();
      }
    }
    if (cb) cb(err, fileView || v);
  });
  return null;
};

loader.download = (filename, data, mime2, cb) => {
  if (!_isBrowser) { if (cb) cb(null, true); return; }
  const dname = _basename(filename) || 'download';
  const type  = mime2 || _mimeOf(dname) || 'application/octet-stream';
  const blob2 = new Blob([data], { type });
  const url   = URL.createObjectURL(blob2);
  const a     = document.createElement('a');
  a.href = url; a.download = dname;
  document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
  if (cb) setTimeout(() => cb(null, true), 0);
};

loader.downloadImage = (filename, dataUrlOrSrc, cb) => {
  if (!_isBrowser) { if (cb) cb(null, true); return; }
  const a = document.createElement('a');
  a.href = dataUrlOrSrc;
  a.download = _basename(filename) || 'image.png';
  document.body.appendChild(a); a.click();
  setTimeout(() => a.remove(), 1500);
  if (cb) setTimeout(() => cb(null, true), 0);
};

loader.toBase64 = (fileView, cb) => {
  if (!fileView || typeof fileView.toBase64 !== 'function') { if (cb) cb(new Error('[loader.zl] Invalid file view'), null); return null; }
  fileView.toBase64(b64 => { if (cb) cb(null, b64); });
  return null;
};

loader.toDataURL = (fileView, cb) => {
  if (!fileView || typeof fileView.toDataURL !== 'function') { if (cb) cb(new Error('[loader.zl] Invalid file view'), null); return null; }
  fileView.toDataURL(url => { if (cb) cb(null, url); });
  return null;
};

loader.fromBase64 = (b64, name, mime2, cb) => {
  const e2   = _ext(name || '');
  const kind = _kindOf(e2);
  const type = mime2 || _mimeOf(name || '');
  if (_isBrowser) {
    try {
      const bin   = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const buf   = bytes.buffer;
      const blob2 = new Blob([buf], { type });
      const url   = URL.createObjectURL(blob2);
      const v     = _makeFileView(kind, name || 'file', null, e2, buf.byteLength, type, buf, url);
      if (cb) setTimeout(() => cb(null, v), 0);
      return v;
    } catch(e) { if (cb) setTimeout(() => cb(e, null), 0); return null; }
  }
  try {
    const buf = Buffer.from(b64, 'base64');
    const v   = _makeFileView(kind, name || 'file', null, e2, buf.length, type, buf, null);
    if (cb) setTimeout(() => cb(null, v), 0);
    return v;
  } catch(e) { if (cb) setTimeout(() => cb(e, null), 0); return null; }
};

loader.fromDataURL = (dataUrl, name, cb) => {
  const comma = dataUrl.indexOf(',');
  const meta  = dataUrl.slice(5, comma);
  const b64   = dataUrl.slice(comma + 1);
  const mime2 = meta.replace(';base64', '');
  return loader.fromBase64(b64, name || 'file', mime2, cb);
};

loader.makeBlob = (data, mime2) => {
  if (!_isBrowser) return null;
  return new Blob([data], { type: mime2 || 'application/octet-stream' });
};

loader.makeObjectURL = (dataOrBlob, mime2) => {
  if (!_isBrowser) return null;
  const b2 = (typeof Blob !== 'undefined' && dataOrBlob instanceof Blob) ? dataOrBlob : new Blob([dataOrBlob], { type: mime2 || 'application/octet-stream' });
  return URL.createObjectURL(b2);
};

loader.revokeURL = (url) => {
  if (_isBrowser && url && String(url).startsWith('blob:')) URL.revokeObjectURL(url);
};

loader.display = (fileView, container) => {
  if (!fileView || typeof fileView.display !== 'function') return null;
  return fileView.display(container);
};

loader.preview = (fileView) => {
  if (!fileView || typeof fileView.preview !== 'function') return null;
  return fileView.preview();
};

// ── Media playback helpers ───────────────────────────────────────────────────
/**
 * loader.play(fileOrDoc, opts?, cb?)
 *   opts.start_time  – seek to this time before playing (seconds)
 *   opts.stop_time   – auto-stop at this time (seconds)
 *   opts.volume      – 0–1
 *   opts.loop        – boolean
 *
 * Examples:
 *   loader.play(file);
 *   loader.play(file, { start_time: 5, stop_time: 30 });
 *   loader.play(file, { start_time: 0 }, err => console.log('playing', err));
 */
loader.play = (fileView, opts, cb) => {
  if (typeof opts === 'function') { cb = opts; opts = {}; }
  if (!fileView || typeof fileView.play !== 'function') {
    if (cb) cb(new Error('[loader] play: invalid file object'));
    return null;
  }
  return fileView.play(opts || {}, cb);
};

loader.stop  = (fileView)     => (fileView && typeof fileView.stop  === 'function' ? fileView.stop()    : null);
loader.pause = (fileView)     => (fileView && typeof fileView.pause === 'function' ? fileView.pause()   : null);
loader.seek  = (fileView, t)  => (fileView && typeof fileView.seek  === 'function' ? fileView.seek(t)   : null);
loader.volume= (fileView, l)  => (fileView && typeof fileView.volume=== 'function' ? fileView.volume(l) : null);
loader.mute  = (fileView, on) => (fileView && typeof fileView.mute  === 'function' ? fileView.mute(on)  : null);
loader.isPlaying    = (v) => !!(v && typeof v.isPlaying    === 'function' && v.isPlaying());
loader.getDuration  = (v) =>   (v && typeof v.getDuration  === 'function' ? v.getDuration()  : 0);
loader.getCurrentTime=(v) =>   (v && typeof v.getCurrentTime==='function' ? v.getCurrentTime(): 0);

loader.asText   = (v) => (v && typeof v.asText   === 'function' ? v.asText()   : '');
loader.asJSON   = (v) => (v && typeof v.asJSON   === 'function' ? v.asJSON()   : null);
loader.asBinary = (v) => (v && typeof v.asBinary === 'function' ? v.asBinary() : null);
loader.asURL    = (v) => (v && typeof v.asURL    === 'function' ? v.asURL()    : null);

loader.isImage  = (v) => !!(v && v.__fileKind__ === 'image');
loader.isAudio  = (v) => !!(v && v.__fileKind__ === 'audio');
loader.isVideo  = (v) => !!(v && v.__fileKind__ === 'video');
loader.isText   = (v) => !!(v && (v.__fileKind__ === 'text' || v.__fileKind__ === 'json'));
loader.isBinary = (v) => !!(v && v.__fileKind__ === 'binary');
loader.isFolder = (v) => !!(v && v.__type__ === 'folder');
loader.isFile   = (v) => !!(v && v.__type__ === 'file');

loader.ext  = (v) => (v ? (v.ext  || _ext(_basename(typeof v === 'string' ? v : (v.name || '')))) : '');
loader.name = (v) => (v ? (v.name || '') : '');
loader.size = (v) => (v ? (v.size || 0)  : 0);
loader.mime = (v) => (v ? (v.mime || '') : '');
loader.path = (v) => (v ? (v.path || null) : null);

loader.mimeOf = (name) => _mimeOf(name);
loader.extOf  = (name) => _ext(name);
loader.kindOf = (name) => _kindOf(_ext(name));

loader.batch = (sources, cb) => {
  if (!sources || !sources.length) { if (cb) cb(null, []); return []; }
  const results = new Array(sources.length);
  let done = 0;
  sources.forEach((src, i) => {
    loader.file(src, (err, v) => {
      results[i] = err ? null : v;
      done++;
      if (done === sources.length && cb) cb(null, results);
    });
  });
  return results;
};

loader.batchImages = (sources, cb) => {
  if (!sources || !sources.length) { if (cb) cb(null, []); return []; }
  const results = new Array(sources.length);
  let done = 0;
  sources.forEach((src, i) => {
    loader.image(src, (err, v) => {
      results[i] = err ? null : v;
      done++;
      if (done === sources.length && cb) cb(null, results);
    });
  });
  return results;
};

loader.injectToCanvas = (fileView, canvas) => {
  if (!_isBrowser || !canvas || !fileView) return;
  if (!fileView.isImage || !fileView.isImage()) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    if (canvas.drawImage) canvas.drawImage(img, 0, 0, canvas.width || img.naturalWidth, canvas.height || img.naturalHeight);
    else if (canvas.__ctx__) canvas.__ctx__.drawImage(img, 0, 0, canvas.width || img.naturalWidth, canvas.height || img.naturalHeight);
  };
  img.src = fileView.url || '';
};

loader.injectToWindow = (fileView, win) => {
  if (!fileView || !win) return;
  if (win.loadImage && fileView.url) win.loadImage(fileView.url);
};

loader.injectToButton = (fileView, btn) => {
  if (!_isBrowser || !fileView || !btn || !btn.__el__) return;
  if (!fileView.isImage || !fileView.isImage()) return;
  btn.__el__.style.backgroundImage    = 'url(' + (fileView.url || '') + ')';
  btn.__el__.style.backgroundSize     = 'cover';
  btn.__el__.style.backgroundPosition = 'center';
  btn.__el__.textContent = '';
};

loader.isDir      = (fpath) => { if (_isBrowser || !_fs) return false; try { return _fs.statSync(fpath).isDirectory(); } catch(_e) { return false; } };
loader.isFileSync = (fpath) => { if (_isBrowser || !_fs) return false; try { return _fs.statSync(fpath).isFile();      } catch(_e) { return false; } };

if (typeof DSALibraries !== 'undefined') {
  DSALibraries['loader.zl'] = {
    description: 'File & media loader: load, display, edit, create, upload, download, watch — files, folders, images, PNG, audio, video, binary, text, JSON — browser + Node/Electron compatible',
    inject(G) {
      if (typeof window !== 'undefined' && window.__ZPP__) {
        window.__ZPP__.registerBuiltins([
          'doc', 'docAsync', 'asDoc', 'isDoc',
          'batchDocs', 'batchDocsAsync',
          'uploadDoc', 'uploadDocAudio', 'uploadDocVideo', 'uploadDocImage', 'uploadDocText',
          'fileAsync', 'textAsync', 'jsonAsync', 'imageAsync', 'audioAsync', 'videoAsync', 'binaryAsync', 'makeAsync',
          'cache',
          'playbackRate', 'loop', 'restart', 'onProgress',
          'lines', 'words', 'stats', 'search', 'filterLines', 'replaceText', 'concat', 'concatTo',
          'parseCSV', 'toCSV',
          'filterJSON', 'mapJSON', 'sortJSON', 'getJSON', 'setJSON',
          'imageToCanvas', 'resizeImage', 'cropImage', 'grayscale', 'adjustImage', 'flipImage', 'rotateImage',
          'hash', 'changed', 'format', 'clone', 'describe',
          'loader',
          'file', 'text', 'json', 'binary', 'image', 'png',
          'audio', 'video', 'folder', 'list',
          'make', 'save', 'write', 'read', 'edit', 'append',
          'delete', 'copy', 'move', 'rename',
          'exists', 'info', 'watch',
          'upload', 'uploadMany', 'uploadImage', 'uploadImages',
          'uploadAudio', 'uploadVideo', 'uploadText', 'uploadAny',
          'reupload',
          'download', 'downloadImage',
          'toBase64', 'toDataURL', 'fromBase64', 'fromDataURL',
          'makeBlob', 'makeObjectURL', 'revokeURL',
          'display', 'preview',
          'play', 'stop', 'pause', 'seek', 'volume', 'mute',
          'isPlaying', 'getDuration', 'getCurrentTime',
          'onEnded', 'onTimeUpdate', 'onPlay', 'onPause',
          'asText', 'asJSON', 'asBinary', 'asURL',
          'isImage', 'isAudio', 'isVideo', 'isText', 'isBinary',
          'isFolder', 'isFile',
          'ext', 'name', 'size', 'mime', 'path',
          'mimeOf', 'extOf', 'kindOf',
          'batch', 'batchImages',
          'createDir', 'deleteDir', 'isDir', 'isFileSync',
          'injectToCanvas', 'injectToWindow', 'injectToButton',
        ]);
        window.__ZPP__.registerTypes(['file', 'folder', 'media', 'doc']);
      }

      G.loader = loader;
    }
  };
}

if (typeof module !== 'undefined') module.exports = loader;

})();