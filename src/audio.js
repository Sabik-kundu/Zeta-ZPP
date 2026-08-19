(function AudioLib() {
'use strict';

/**
 * ── audio.js — Zeta Audio Engine ────────────────────────────────────────────
 *
 *  In-process audio playback using node-lame and speaker.
 *  Corrected to handle node-lame's specific API requirements.
 *
 *  Play() signatures:
 *    song.play()           plays the whole song
 *    song.play(132)        plays from 132 s to the end
 *    song.play(null, 132)  plays from the start up to 132 s (till 132 sec)
 *    song.play(100, 200)   plays the 100 s – 200 s window
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

function _clamp(value, min, max) {
  return Math.min(Math.max(parseFloat(value), min), max);
}

function _assert(condition, msg) {
  if (!condition) throw new TypeError('[audio.js] ' + msg);
}

let _speakerMod = null;
let _LameClass  = null;   
let _fsMod      = null;

/**
 * Lazy-load dependencies. 
 * node-lame (moreno-s version) exports a class named 'Lame'.
 */
function _requireDeps() {
  if (_speakerMod && _LameClass && _fsMod) return;

  try { _fsMod = require('fs'); }
  catch (_) { throw new Error('[audio.js] Node.js "fs" module not found.'); }

  let lameMod;
  try {
    lameMod = require('node-lame');
  } catch (_) {
    throw new Error('\n[audio.js] Missing "node-lame" package. Run: npm install node-lame\n');
  }

  // node-lame exports { Lame }
  _LameClass = lameMod.Lame || (lameMod.default && lameMod.default.Lame) || lameMod;

  if (typeof _LameClass !== 'function') {
    throw new Error('[audio.js] node-lame loaded but Lame constructor was not found.');
  }

  try {
    _speakerMod = require('speaker');
  } catch (_) {
    throw new Error('\n[audio.js] Missing "speaker" package. Run: npm install speaker\n');
  }
}

class AudioClip {
  constructor(path) {
    _assert(typeof path === 'string' && path.trim() !== '', 'AudioClip: path must be a non-empty string.');
    _requireDeps();

    this._path        = path;
    this._playing     = false;
    this._paused      = false;
    this._ended       = false;
    this._destroyed   = false;
    this._muted       = false;
    this._volume      = 1.0;
    this._pan         = 0.0;    // -1.0 (left) to 1.0 (right)
    this._loop        = false;

    // Active streams/timers
    this._speaker     = null;
    this._endTimer    = null;
    this._pcmStream   = null; 
    this._fadeInterval = null;

    // Metadata & Tracking
    this._startTime   = 0;      // wall-clock start
    this._duration    = 0;      // calculated from buffer
    this._playOffset  = 0;      // offset from start of file in seconds

    this._lastRange   = { start: 0, end: null };
    this._listeners   = Object.create(null);
    this._endCallback = null;

    // Track globally for mass-control
    if (!audio._allClips) audio._allClips = new Set();
    audio._allClips.add(this);
  }

  _emit(event, ...args) {
    const fns = this._listeners[event];
    if (fns) fns.slice().forEach(fn => fn(...args));
  }

  _on(event, fn) {
    (this._listeners[event] || (this._listeners[event] = [])).push(fn);
    return this;
  }

  _teardown() {
    if (this._endTimer !== null) {
      clearTimeout(this._endTimer);
      this._endTimer = null;
    }
    if (this._fadeInterval !== null) {
      clearInterval(this._fadeInterval);
      this._fadeInterval = null;
    }
    if (this._pcmStream) {
      try { this._pcmStream.unpipe(); this._pcmStream.destroy(); } catch (_) {}
      this._pcmStream = null;
    }
    if (this._speaker) {
      try { this._speaker.end(); } catch (_) {}
      this._speaker = null;
    }
    this._playing = false;
  }

  /**
   * Pipeline logic using node-lame to decode to a buffer, then streaming that buffer to speaker.
   * This is more reliable for node-lame than trying to use it as a stream.
   */
  async _startPipeline(onFinish, range) {
    const { start = 0, end = null } = range || {};
    const fs = _fsMod;
    const Lame = _LameClass;
    const Speaker = _speakerMod;

    if (!fs.existsSync(this._path)) {
      this._emit('error', this, new Error(`File not found: "${this._path}"`));
      return;
    }

    this._playing = true;
    this._paused  = false;
    this._ended   = false;
    this._playOffset = start;

    try {
      const decoder = new Lame({ output: 'buffer' }).setFile(this._path);
      await decoder.decode();
      const fullPcmBuffer = decoder.getBuffer();

      /**
       * PCM 16-bit LE 44100Hz Stereo is roughly 176400 bytes per second.
       */
      const bytesPerSec = 44100 * 2 * 2; 
      this._duration = fullPcmBuffer.length / bytesPerSec;

      let startByte = Math.floor(start * bytesPerSec);
      if (startByte % 4 !== 0) startByte -= (startByte % 4); // Align to sample block (4 bytes: L+R)

      let endByte = (end !== null) ? Math.floor(end * bytesPerSec) : fullPcmBuffer.length;
      if (endByte % 4 !== 0) endByte -= (endByte % 4);
      
      const playBuffer = fullPcmBuffer.slice(startByte, Math.min(endByte, fullPcmBuffer.length));

      if (this._destroyed || !this._playing) return;

      this._speaker = new Speaker({
        channels: 2,
        bitDepth: 16,
        sampleRate: 44100
      });

      // ── Process Audio (Volume + Pan + Mute) ───────────────────────────────
      if (this._muted) {
        playBuffer.fill(0);
      } else {
        const vol = this._volume;
        const pan = this._pan; // -1 to 1
        
        // Linear Panning (Simplest)
        const leftGain  = pan <= 0 ? 1 : 1 - pan;
        const rightGain = pan >= 0 ? 1 : 1 + Math.abs(pan);

        if (vol < 1.0 || pan !== 0) {
          for (let i = 0; i < playBuffer.length - 3; i += 4) {
            // Left Channel
            const leftSample = playBuffer.readInt16LE(i);
            playBuffer.writeInt16LE(Math.round(leftSample * vol * leftGain), i);
            
            // Right Channel
            const rightSample = playBuffer.readInt16LE(i + 2);
            playBuffer.writeInt16LE(Math.round(rightSample * vol * rightGain), i + 2);
          }
        }
      }

      const { Readable } = require('stream');
      this._pcmStream = new Readable({
        read() {
          this.push(playBuffer);
          this.push(null);
        }
      });

      this._speaker.on('error', (err) => {
        this._emit('error', this, err);
        this._teardown();
      });

      this._speaker.on('close', () => {
        if (this._playing) {
          this._teardown();
          this._ended = true;
          this._emit('end', this);
          if (this._endCallback) this._endCallback();
          if (onFinish) onFinish();
        }
      });

      this._startTime = Date.now();
      this._pcmStream.pipe(this._speaker);
      this._emit('play', this);

    } catch (err) {
      this._emit('error', this, err);
      this._teardown();
    }
  }

  /**
   * song.play([start[, end]])
   */
  play(start, end) {
    if (this._playing) return this;
    if (this._destroyed) return this;

    const s = (start !== undefined && start !== null && !isNaN(start)) ? parseFloat(start) : 0;
    const e = (end !== undefined && end !== null && !isNaN(end)) ? parseFloat(end) : null;

    this._lastRange = { start: s, end: e };

    const loopCb = () => {
      if (this._loop && !this._destroyed) {
        this._startPipeline(loopCb, this._lastRange);
      }
    };

    this._startPipeline(loopCb, this._lastRange);
    return this;
  }

  pause() {
    if (!this._playing) return this;
    // Store where we were to resume properly
    this._playOffset = this.getTime() + this._playOffset;
    this._teardown();
    this._paused = true;
    this._emit('pause', this);
    return this;
  }

  resume() {
    if (this._paused) {
      this._paused = false;
      this._startPipeline(null, { start: this._playOffset, end: this._lastRange.end });
    }
    return this;
  }

  stop() {
    this._teardown();
    this._playOffset = 0;
    this._paused = false;
    this._ended  = false;
    this._emit('stop', this);
    return this;
  }

  restart() {
    this.stop();
    return this.play();
  }

  // ── Advanced Effects ──────────────────────────────────────────────────────

  fadeIn(durationSec = 2) {
    this.setVolume(0);
    this.play();
    let step = 0;
    const interval = 50;
    const totalSteps = (durationSec * 1000) / interval;
    
    if (this._fadeInterval) clearInterval(this._fadeInterval);
    this._fadeInterval = setInterval(() => {
      step++;
      this.setVolume(step / totalSteps);
      if (step >= totalSteps) {
        clearInterval(this._fadeInterval);
        this._fadeInterval = null;
      }
    }, interval);
    return this;
  }

  fadeOut(durationSec = 2) {
    if (!this._playing) return this;
    let currentVol = this._volume;
    const interval = 50;
    const totalSteps = (durationSec * 1000) / interval;
    const volStep = currentVol / totalSteps;

    if (this._fadeInterval) clearInterval(this._fadeInterval);
    this._fadeInterval = setInterval(() => {
      currentVol -= volStep;
      this.setVolume(Math.max(0, currentVol));
      if (currentVol <= 0) {
        clearInterval(this._fadeInterval);
        this._fadeInterval = null;
        this.stop();
      }
    }, interval);
    return this;
  }

  setPan(value) {
    this._pan = _clamp(value, -1.0, 1.0);
    // Pan requires buffer re-processing, easiest to restart or wait for next play
    if (this._playing) {
      const current = this.getTime() + this._playOffset;
      this._teardown();
      this._startPipeline(null, { start: current, end: this._lastRange.end });
    }
    return this;
  }

  getTime() {
    if (!this._playing) return 0;
    return (Date.now() - this._startTime) / 1000;
  }

  getDuration() {
    return this._duration;
  }

  setVolume(level) {
    const oldVol = this._volume;
    this._volume = _clamp(level, 0.00, 1.00);
    // If playing, we need to adjust the active buffer or restart. 
    // Restarting is safest for standard speaker implementation.
    if (this._playing && Math.abs(oldVol - this._volume) > 0.05 && !this._fadeInterval) {
      const current = this.getTime() + this._playOffset;
      this._teardown();
      this._startPipeline(null, { start: current, end: this._lastRange.end });
    }
    return this;
  }

  getVolume() { return this._volume; }

  mute()   { this._muted = true;  return this; }
  unmute() { this._muted = false; return this; }

  loop(enabled = true) {
    this._loop = Boolean(enabled);
    return this;
  }

  isPlaying() { return this._playing; }
  isPaused()  { return this._paused;  }
  isEnded()   { return this._ended;   }

  onEnd(fn)   { this._endCallback = fn; return this; }
  onError(fn) { this._on('error', (_c, err) => fn(err)); return this; }

  destroy() {
    this._destroyed = true;
    this._teardown();
    this._listeners = Object.create(null);
  }
}

const audio = {};

audio.load = (path) => new AudioClip(path);

audio.play = (path, start, end) => {
  const clip = new AudioClip(path);
  clip.play(start, end);
  return clip;
};

/**
 * audio.background(path[, volume])
 * Perfect for games. Looping background music.
 */
audio.background = (path, volume = 0.5) => {
  const clip = new AudioClip(path);
  clip.setVolume(volume);
  clip.loop(true);
  clip.play();
  return clip;
};

audio.AudioClip = AudioClip;

/**
 * Global Management
 */
audio.stopAll = () => {
  if (audio._allClips) {
    audio._allClips.forEach(clip => clip.stop());
  }
};

audio.muteAll = () => {
  if (audio._allClips) {
    audio._allClips.forEach(clip => clip.mute());
  }
};

audio.unmuteAll = () => {
  if (audio._allClips) {
    audio._allClips.forEach(clip => clip.unmute());
  }
};

if (typeof DSALibraries !== 'undefined') {
  DSALibraries['audio.zl'] = {
    inject(G) { G.audio = audio; }
  };
}

if (typeof module !== 'undefined') module.exports = audio;

})();
