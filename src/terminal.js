(function TerminalLib() {
'use strict';

/**
 * ── terminal.js — Zeta Terminal Engine ──────────────────────────────────────
 *
 *  In-process terminal graphics & control: images, video playback (with
 *  optional audio), cursor/color control, progress UI, banners, QR codes
 *  and simple input prompts — all rendered directly to stdout with raw
 *  ANSI escape sequences (no dependency on chalk/ansi-escapes).
 *
 *  Everything is exposed on a single `term` object. Every public function
 *  and attribute is named term_<func> / term_<attr> so it drops straight
 *  into DSA-style languages the same way audio.zl does.
 *
 *  Images:  term.term_image(path[, opts])            -> Promise
 *  Video:   term.term_video(path[, opts])             -> TermVideo instance
 *             .term_play() / .term_stop() / .term_pause() / .term_resume()
 *             .term_onEnd(fn) / .term_onFrame(fn)
 *
 *  Notes on fidelity:
 *   - Images/video frames are rendered with the "half-block" technique
 *     (▀ glyph, independent fg/bg truecolor) which doubles vertical
 *     resolution relative to plain block characters.
 *   - Video requires the `ffmpeg` binary on PATH (not an npm package).
 *   - Video audio is decoded to raw PCM by ffmpeg and piped straight into
 *     `speaker`; sync with frame timing is best-effort, not sample-accurate.
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

function _assert(condition, msg) {
  if (!condition) throw new TypeError('[terminal.js] ' + msg);
}

function _clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// ── Lazy dependency loading ──────────────────────────────────────────────

let _fsMod        = null;
let _pathMod      = null;
let _childProc    = null;
let _readlineMod  = null;
let _Jimp         = null;   // the Jimp *class* (jimp v1 exports { Jimp, intToRGBA, ... })
let _intToRGBA    = null;
let _SpeakerClass = null;
let _figletMod    = null;
let _qrcodeMod    = null;
let _ffmpegChecked = false;

function _requireCore() {
  if (_fsMod && _pathMod && _childProc && _readlineMod) return;
  try { _fsMod = require('fs'); } catch (_) { throw new Error('[terminal.js] Node.js "fs" module not found.'); }
  try { _pathMod = require('path'); } catch (_) { throw new Error('[terminal.js] Node.js "path" module not found.'); }
  try { _childProc = require('child_process'); } catch (_) { throw new Error('[terminal.js] Node.js "child_process" module not found.'); }
  try { _readlineMod = require('readline'); } catch (_) { throw new Error('[terminal.js] Node.js "readline" module not found.'); }
}

function _requireJimp() {
  if (_Jimp) return _Jimp;
  let mod;
  try {
    mod = require('jimp');
  } catch (_) {
    throw new Error('\n[terminal.js] Missing "jimp" package. Run: npm install jimp\n');
  }
  // jimp v1+ (ESM-first rewrite) exports { Jimp, intToRGBA, ... } from require().
  // jimp v0.x exported the class itself as module.exports. Support both.
  _Jimp = (mod && typeof mod.read === 'function') ? mod : mod.Jimp;
  _intToRGBA = (mod && typeof mod.intToRGBA === 'function') ? mod.intToRGBA
             : (_Jimp && typeof _Jimp.intToRGBA === 'function') ? _Jimp.intToRGBA
             : null;
  if (!_Jimp || typeof _Jimp.read !== 'function') {
    throw new Error('[terminal.js] Loaded "jimp" but could not find a usable Jimp.read() — unexpected jimp version/export shape.');
  }
  return _Jimp;
}

function _requireSpeaker() {
  if (_SpeakerClass) return _SpeakerClass;
  try {
    _SpeakerClass = require('speaker');
  } catch (_) {
    throw new Error('\n[terminal.js] Missing "speaker" package. Run: npm install speaker\n');
  }
  return _SpeakerClass;
}

function _requireFfmpeg() {
  _requireCore();
  if (_ffmpegChecked) return;
  const check = _childProc.spawnSync('ffmpeg', ['-version']);
  if (check.error || check.status !== 0) {
    throw new Error('\n[terminal.js] "ffmpeg" binary not found on PATH. Install ffmpeg to use term_video().\n');
  }
  _ffmpegChecked = true;
}

function _requireFfprobe() {
  _requireCore();
  const check = _childProc.spawnSync('ffprobe', ['-version']);
  if (check.error || check.status !== 0) {
    throw new Error('\n[terminal.js] "ffprobe" binary not found on PATH. Install ffmpeg (which bundles ffprobe) to use term_video().\n');
  }
}

function _tryRequire(name) {
  try { return require(name); } catch (_) { return null; }
}

// ── ANSI primitives ──────────────────────────────────────────────────────

const ESC = '\x1b[';
const RESET = ESC + '0m';

const _NAMED_COLORS = {
  black:   [0, 0, 0],       red:     [205, 0, 0],
  green:   [0, 205, 0],     yellow:  [205, 205, 0],
  blue:    [0, 0, 238],     magenta: [205, 0, 205],
  cyan:    [0, 205, 205],   white:   [229, 229, 229],
  gray:    [127, 127, 127], grey:    [127, 127, 127],
  orange:  [255, 140, 0],   purple:  [138, 43, 226],
  pink:    [255, 105, 180],
};

function _hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function _resolveColor(color) {
  if (Array.isArray(color) && color.length === 3) return color;
  if (typeof color === 'string') {
    if (color.startsWith('#')) return _hexToRgb(color);
    if (_NAMED_COLORS[color.toLowerCase()]) return _NAMED_COLORS[color.toLowerCase()];
  }
  return null;
}

function _fg(r, g, b) { return `${ESC}38;2;${r};${g};${b}m`; }
function _bg(r, g, b) { return `${ESC}48;2;${r};${g};${b}m`; }

// ── The `term` object ────────────────────────────────────────────────────

const term = {};

// -- attributes (term_<attr>) --------------------------------------------

Object.defineProperty(term, 'term_width', {
  get() { return (process.stdout && process.stdout.columns) || 80; },
});

Object.defineProperty(term, 'term_height', {
  get() { return (process.stdout && process.stdout.rows) || 24; },
});

Object.defineProperty(term, 'term_isTTY', {
  get() { return Boolean(process.stdout && process.stdout.isTTY); },
});

Object.defineProperty(term, 'term_supportsColor', {
  get() {
    return Boolean(
      process.stdout && process.stdout.isTTY &&
      process.env.TERM !== 'dumb'
    );
  },
});

// -- cursor & screen control (term_<func>) --------------------------------

term.term_clear = () => { process.stdout.write(ESC + '2J' + ESC + '0;0H'); return term; };
term.term_clearLine = () => { process.stdout.write(ESC + '2K' + '\r'); return term; };
term.term_write = (text) => { process.stdout.write(String(text)); return term; };
term.term_writeln = (text) => { process.stdout.write(String(text) + '\n'); return term; };
term.term_moveCursor = (x, y) => { process.stdout.write(`${ESC}${y};${x}H`); return term; };
term.term_hideCursor = () => { process.stdout.write(ESC + '?25l'); return term; };
term.term_showCursor = () => { process.stdout.write(ESC + '?25h'); return term; };
term.term_saveCursor = () => { process.stdout.write(ESC + 's'); return term; };
term.term_restoreCursor = () => { process.stdout.write(ESC + 'u'); return term; };
term.term_beep = () => { process.stdout.write('\x07'); return term; };
term.term_title = (str) => { process.stdout.write(`\x1b]0;${String(str)}\x07`); return term; };

// -- text styling (term_<func>) -------------------------------------------

term.term_color = (text, fg, bg) => {
  let out = '';
  const fgRgb = fg ? _resolveColor(fg) : null;
  const bgRgb = bg ? _resolveColor(bg) : null;
  if (fgRgb) out += _fg(...fgRgb);
  if (bgRgb) out += _bg(...bgRgb);
  return out + String(text) + RESET;
};

term.term_rgb = (r, g, b, text) => _fg(r, g, b) + String(text) + RESET;
term.term_bold = (text) => `${ESC}1m${text}${RESET}`;
term.term_dim = (text) => `${ESC}2m${text}${RESET}`;
term.term_italic = (text) => `${ESC}3m${text}${RESET}`;
term.term_underline = (text) => `${ESC}4m${text}${RESET}`;

// -- images (term_image) ---------------------------------------------------

/**
 * Half-block render: given a width x height (even) pixel getter, prints
 * height/2 rows of '▀' glyphs, one glyph carrying two vertically stacked
 * pixels (fg = top pixel, bg = bottom pixel).
 */
function _renderHalfBlocks(width, height, getPixel) {
  let out = '';
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x++) {
      const top = getPixel(x, y);
      const bot = (y + 1 < height) ? getPixel(x, y + 1) : { r: 0, g: 0, b: 0 };
      out += _fg(top.r, top.g, top.b) + _bg(bot.r, bot.g, bot.b) + '\u2580';
    }
    out += RESET + '\n';
  }
  return out;
}

/**
 * term.term_image(path[, opts])
 *   opts.width       target columns (default: term_width)
 *   opts.charAspect  terminal cell height/width ratio used to keep the
 *                     picture from looking squashed (default 2.1)
 */
term.term_image = async (path, opts = {}) => {
  _requireCore();
  _assert(typeof path === 'string' && path.trim() !== '', 'term_image: path must be a non-empty string.');
  if (!_fsMod.existsSync(path)) throw new Error(`[terminal.js] File not found: "${path}"`);

  const Jimp = _requireJimp();
  const image = await Jimp.read(path);
  const aspect = image.height / image.width;
  const charAspect = opts.charAspect || 2.1;

  const targetW = Math.max(1, Math.floor(opts.width || term.term_width));
  let targetH = Math.round(targetW * aspect * charAspect / 2);
  if (targetH % 2 !== 0) targetH += 1;
  targetH = Math.max(2, targetH);

  image.resize({ w: targetW, h: targetH });

  const out = _renderHalfBlocks(targetW, targetH, (x, y) => {
    const c = _intToRGBA(image.getPixelColor(x, y));
    return { r: c.r, g: c.g, b: c.b };
  });

  process.stdout.write(out);
  return term;
};

// -- video (term_video / TermVideo) ----------------------------------------

class TermVideo {
  constructor(path) {
    _requireCore();
    _assert(typeof path === 'string' && path.trim() !== '', 'TermVideo: path must be a non-empty string.');
    this._path = path;
    this._playing = false;
    this._paused = false;
    this._ended = false;
    this._destroyed = false;

    this._ffmpegVideo = null;
    this._ffmpegAudio = null;
    this._speaker = null;
    this._frameTimer = null;
    this._frameQueue = [];
    this._pendingBuf = Buffer.alloc(0);

    this._cols = 0;
    this._rows = 0;   // pixel rows (even)
    this._fps = 15;
    this._frameBytes = 0;

    this._endCallback = null;
    this._frameCallback = null;
  }

  term_onEnd(fn) { this._endCallback = fn; return this; }
  term_onFrame(fn) { this._frameCallback = fn; return this; }

  _probeSize() {
    _requireFfprobe();
    const res = _childProc.spawnSync('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=s=x:p=0', this._path,
    ]);
    const out = (res.stdout || '').toString().trim();
    const [w, h] = out.split('x').map(Number);
    return (w && h) ? { width: w, height: h } : { width: 16, height: 9 };
  }

  term_play(opts = {}) {
    if (this._playing || this._destroyed) return this;
    _requireFfmpeg();

    const src = this._probeSize();
    const aspect = src.height / src.width;
    const charAspect = opts.charAspect || 2.1;

    this._cols = Math.max(1, Math.floor(opts.width || term.term_width));
    let rows = Math.round(this._cols * aspect * charAspect / 2);
    if (rows % 2 !== 0) rows += 1;
    this._rows = Math.max(2, rows);
    this._fps = opts.fps || 15;
    this._frameBytes = this._cols * this._rows * 3; // rgb24
    this._loop = Boolean(opts.loop);
    this._withAudio = opts.audio !== false;

    this._playing = true;
    this._paused = false;
    this._ended = false;

    term.term_hideCursor();

    // ── video frames: raw rgb24 over stdout ──────────────────────────────
    this._ffmpegVideo = _childProc.spawn('ffmpeg', [
      '-i', this._path,
      '-vf', `fps=${this._fps},scale=${this._cols}:${this._rows}:flags=fast_bilinear`,
      '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-loglevel', 'error', '-',
    ]);

    this._ffmpegVideo.stdout.on('data', (chunk) => {
      this._pendingBuf = Buffer.concat([this._pendingBuf, chunk]);
      while (this._pendingBuf.length >= this._frameBytes) {
        this._frameQueue.push(this._pendingBuf.slice(0, this._frameBytes));
        this._pendingBuf = this._pendingBuf.slice(this._frameBytes);
      }
    });

    this._ffmpegVideo.on('error', (err) => this._fail(err));

    this._ffmpegVideo.on('close', () => {
      this._videoDone = true;
      this._maybeFinish();
    });

    // ── audio: raw pcm piped straight into speaker ───────────────────────
    if (this._withAudio) {
      try {
        const Speaker = _requireSpeaker();
        this._speaker = new Speaker({ channels: 2, bitDepth: 16, sampleRate: 44100 });
        this._ffmpegAudio = _childProc.spawn('ffmpeg', [
          '-i', this._path, '-vn',
          '-f', 's16le', '-ar', '44100', '-ac', '2', '-loglevel', 'error', '-',
        ]);
        this._ffmpegAudio.stdout.pipe(this._speaker);
        this._ffmpegAudio.on('error', () => { /* audio is best-effort */ });
      } catch (_) {
        // speaker not installed — silently play video-only
        this._withAudio = false;
      }
    }

    // ── frame pacing ──────────────────────────────────────────────────────
    this._frameTimer = setInterval(() => {
      if (this._paused) return;
      const frame = this._frameQueue.shift();
      if (!frame) return;
      let i = 0;
      const out = _renderHalfBlocks(this._cols, this._rows, (x, y) => {
        const idx = (y * this._cols + x) * 3;
        return { r: frame[idx], g: frame[idx + 1], b: frame[idx + 2] };
      });
      term.term_moveCursor(0, 0);
      process.stdout.write(out);
      if (this._frameCallback) this._frameCallback(this, i++);
    }, Math.round(1000 / this._fps));

    return this;
  }

  _maybeFinish() {
    if (!this._videoDone) return;
    if (this._frameQueue.length > 0) return; // let remaining frames drain
    this._finish();
  }

  _finish() {
    if (this._ended) return;
    this._teardown();
    if (this._loop && !this._destroyed) {
      this.term_play({ width: this._cols, fps: this._fps, audio: this._withAudio, loop: true });
      return;
    }
    this._ended = true;
    term.term_showCursor();
    if (this._endCallback) this._endCallback(this);
  }

  _fail(err) {
    this._teardown();
    term.term_showCursor();
    throw err;
  }

  term_pause() {
    this._paused = true;
    if (this._speaker && this._speaker.cork) this._speaker.cork();
    return this;
  }

  term_resume() {
    this._paused = false;
    if (this._speaker && this._speaker.uncork) this._speaker.uncork();
    return this;
  }

  term_stop() {
    this._teardown();
    term.term_showCursor();
    return this;
  }

  _teardown() {
    if (this._frameTimer) { clearInterval(this._frameTimer); this._frameTimer = null; }
    if (this._ffmpegVideo) { try { this._ffmpegVideo.kill('SIGKILL'); } catch (_) {} this._ffmpegVideo = null; }
    if (this._ffmpegAudio) { try { this._ffmpegAudio.kill('SIGKILL'); } catch (_) {} this._ffmpegAudio = null; }
    if (this._speaker) { try { this._speaker.end(); } catch (_) {} this._speaker = null; }
    this._frameQueue = [];
    this._pendingBuf = Buffer.alloc(0);
    this._playing = false;
  }

  term_isPlaying() { return this._playing; }
  term_destroy() { this._destroyed = true; this._teardown(); }
}

term.TermVideo = TermVideo;

/** term.term_video(path[, opts]) — creates + auto-plays a TermVideo. */
term.term_video = (path, opts = {}) => {
  const clip = new TermVideo(path);
  clip.term_play(opts);
  return clip;
};

// -- progress / spinner / box / table (term_<func>) -------------------------

term.term_progress = (percent, opts = {}) => {
  const width = opts.width || 30;
  const pct = _clamp(percent, 0, 100);
  const filled = Math.round((pct / 100) * width);
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
  const label = opts.label ? `${opts.label} ` : '';
  term.term_clearLine();
  process.stdout.write(`\r${label}[${bar}] ${pct.toFixed(0)}%`);
  if (pct >= 100 && !opts.noNewline) process.stdout.write('\n');
  return term;
};

const _SPINNER_FRAMES = ['\u280b', '\u2819', '\u2839', '\u2838', '\u283c', '\u2834', '\u2826', '\u2827', '\u2807', '\u280f'];

term.term_spinner = (text = '') => {
  let i = 0;
  term.term_hideCursor();
  const timer = setInterval(() => {
    term.term_clearLine();
    process.stdout.write(`\r${_SPINNER_FRAMES[i = ++i % _SPINNER_FRAMES.length]} ${text}`);
  }, 80);
  return {
    term_stop(finalText) {
      clearInterval(timer);
      term.term_clearLine();
      process.stdout.write(`\r${finalText !== undefined ? finalText : ''}\n`);
      term.term_showCursor();
    },
  };
};

term.term_box = (text, opts = {}) => {
  const lines = String(text).split('\n');
  const pad = opts.padding !== undefined ? opts.padding : 1;
  const innerWidth = Math.max(...lines.map(l => l.length)) + pad * 2;
  const top = '\u250c' + '\u2500'.repeat(innerWidth) + '\u2510';
  const bottom = '\u2514' + '\u2500'.repeat(innerWidth) + '\u2518';
  let out = top + '\n';
  for (const line of lines) {
    out += '\u2502' + ' '.repeat(pad) + line.padEnd(innerWidth - pad * 2) + ' '.repeat(pad) + '\u2502\n';
  }
  out += bottom + '\n';
  process.stdout.write(out);
  return term;
};

term.term_table = (rows, opts = {}) => {
  _assert(Array.isArray(rows) && rows.length > 0, 'term_table: rows must be a non-empty array of arrays.');
  const cols = rows[0].length;
  const widths = new Array(cols).fill(0);
  rows.forEach(r => r.forEach((cell, i) => { widths[i] = Math.max(widths[i], String(cell).length); }));

  const sep = '+' + widths.map(w => '-'.repeat(w + 2)).join('+') + '+';
  let out = sep + '\n';
  rows.forEach((r, ri) => {
    out += '|' + r.map((cell, i) => ' ' + String(cell).padEnd(widths[i]) + ' ').join('|') + '|\n';
    if (ri === 0 && opts.header !== false) out += sep + '\n';
  });
  out += sep + '\n';
  process.stdout.write(out);
  return term;
};

// -- banners / QR codes (optional deps) --------------------------------------

term.term_banner = (text, opts = {}) => {
  if (!_figletMod) _figletMod = _tryRequire('figlet');
  if (!_figletMod) {
    throw new Error('\n[terminal.js] Missing "figlet" package. Run: npm install figlet\n');
  }
  const out = _figletMod.textSync(String(text), { font: opts.font || 'Standard' });
  process.stdout.write(out + '\n');
  return term;
};

term.term_qrcode = (text, opts = {}) => {
  if (!_qrcodeMod) _qrcodeMod = _tryRequire('qrcode-terminal');
  if (!_qrcodeMod) {
    throw new Error('\n[terminal.js] Missing "qrcode-terminal" package. Run: npm install qrcode-terminal\n');
  }
  _qrcodeMod.generate(String(text), { small: opts.small !== false });
  return term;
};

// -- input (term_<func>, promise based) --------------------------------------

term.term_input = (promptText = '') => {
  _requireCore();
  return new Promise((resolve) => {
    const rl = _readlineMod.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(promptText, (answer) => { rl.close(); resolve(answer); });
  });
};

term.term_confirm = async (promptText = '') => {
  const answer = await term.term_input(`${promptText} (y/n) `);
  return /^y(es)?$/i.test(answer.trim());
};

// ── Global registration ──────────────────────────────────────────────────

if (typeof DSALibraries !== 'undefined') {
  DSALibraries['terminal.zl'] = {
    inject(G) { G.term = term; },
  };
}

if (typeof module !== 'undefined') module.exports = term;

})();