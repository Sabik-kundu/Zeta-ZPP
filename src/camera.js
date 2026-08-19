// (function CameraLib() {
//   'use strict';

//   /**
//    * ══════════════════════════════════════════════════════════════════════════════
//    * ZETA CAMERA ENGINE — camera.js (Standard Library)
//    * A professional, cross-platform Vision and Video Processing library.
//    *
//    * Supports:
//    *  - Browser: WebRTC MediaDevices & Canvas API.
//    *  - CLI (Node.js): Mock/File-based capture or native bridge.
//    *  - OpenCV-style API: VideoCapture, imshow, cvtColor, threshold.
//    *  - Advanced: VideoRecorder, Motion Detection, Edge Detection, Drawing.
//    * ══════════════════════════════════════════════════════════════════════════════
//    */

//   const _isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
//   const _raf = _isBrowser ? window.requestAnimationFrame.bind(window) : (fn) => setTimeout(() => fn(Date.now()), 16);
//   const _caf = _isBrowser ? window.cancelAnimationFrame.bind(window) : (id) => clearTimeout(id);
  
//   let _fs = null;
//   let _path = null;

//   if (!_isBrowser) {
//     try { _fs = require('fs'); _path = require('path'); } catch (e) {}
//   }

//   // ── Utils ──────────────────────────────────────────────────────────────────

//   function _clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

//   function _createCanvas(w, h) {
//     if (_isBrowser) {
//       const c = document.createElement('canvas');
//       c.width = w; c.height = h;
//       return c;
//     } else {
//       try {
//         const { createCanvas } = require('canvas');
//         return createCanvas(w, h);
//       } catch (e) {
//         return { 
//           width: w, height: h, 
//           getContext: () => ({ 
//             drawImage: () => {}, 
//             getImageData: () => ({ data: new Uint8ClampedArray(w * h * 4) }),
//             putImageData: () => {},
//             clearRect: () => {},
//             fillRect: () => {},
//             strokeRect: () => {},
//             fillText: () => {},
//             beginPath: () => {},
//             arc: () => {},
//             stroke: () => {}
//           }),
//           toDataURL: () => ""
//         };
//       }
//     }
//   }

//   // ── Frame Object ────────────────────────────────────────────────────────────

//   class Frame {
//     constructor(canvas, ctx) {
//       this.canvas = canvas;
//       this.ctx = ctx;
//       this.width = canvas.width;
//       this.height = canvas.height;
//       this.timestamp = Date.now();
//     }

//     getData() {
//       if (!this.ctx.getImageData) return { data: new Uint8ClampedArray(this.width * this.height * 4) };
//       return this.ctx.getImageData(0, 0, this.width, this.height);
//     }

//     putData(imageData) {
//       if (this.ctx.putImageData) this.ctx.putImageData(imageData, 0, 0);
//       return this;
//     }

//     toDataURL(type = 'image/jpeg', quality = 0.8) {
//       return this.canvas.toDataURL(type, quality);
//     }

//     clone() {
//       const c = _createCanvas(this.width, this.height);
//       const x = c.getContext('2d');
//       x.drawImage(this.canvas, 0, 0);
//       return new Frame(c, x);
//     }
    
//     gray() {
//       const img = this.getData();
//       const d = img.data;
//       for (let i = 0; i < d.length; i += 4) {
//         const v = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
//         d[i] = d[i+1] = d[i+2] = v;
//       }
//       return this.putData(img);
//     }
//   }

//   // ── VideoCapture ────────────────────────────────────────────────────────────

//   class VideoCapture {
//     constructor(source = 0) {
//       this.source = source; 
//       this.active = false;
//       this.ready = false;
//       this.error = null;
//       this.width = 640;
//       this.height = 480;
//       this.FPS = 30;
//       this._frameCounter = 0;
//       this.showing = true;
//       this.recorder = null;

//       if (_isBrowser) {
//         this.video = document.createElement('video');
//         this.video.autoplay = true;
//         this.video.muted = true;
//         this.video.setAttribute('playsinline', '');
//         this.video.style.display = 'none';
//         document.body.appendChild(this.video);
        
//         this.canvas = _createCanvas(this.width, this.height);
//         this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
//         this.stream = null;
//         this.initBrowserMode();
//       } else {
//         this.canvas = _createCanvas(this.width, this.height);
//         this.ctx = this.canvas.getContext('2d');
//         this.initCLIMode();
//       }
//     }

//     async initBrowserMode() {
//       try {
//         console.log('[camera.js] Requesting camera access...');
//         let constraints = { 
//           video: { 
//             width: { ideal: this.width }, 
//             height: { ideal: this.height },
//             facingMode: 'user'
//           } 
//         };
        
//         if (typeof this.source === 'string' && (this.source.startsWith('http') || this.source.startsWith('.') || this.source.startsWith('/'))) {
//           this.video.src = this.source;
//           this.video.loop = true;
//           this.active = true;
//           this.video.onloadedmetadata = () => {
//             this.canvas.width = this.video.videoWidth;
//             this.canvas.height = this.video.videoHeight;
//             this.width = this.canvas.width;
//             this.height = this.canvas.height;
//             this.ready = true;
//             if (this.onReady) this.onReady();
//           };
//           this.video.play().catch(e => {
//             this.error = "Autoplay blocked: " + e.message;
//             console.warn('[camera.js]', this.error);
//           });
//           return;
//         }

//         // Try to get specific device if source is index
//         if (typeof this.source === 'number' && this.source >= 0) {
//           try {
//             const devices = await navigator.mediaDevices.enumerateDevices();
//             const videoDevices = devices.filter(d => d.kind === 'videoinput');
//             const deviceId = videoDevices[this.source]?.deviceId;
//             if (deviceId) constraints.video.deviceId = { exact: deviceId };
//           } catch(e) {}
//         }

//         try {
//           this.stream = await navigator.mediaDevices.getUserMedia(constraints);
//         } catch (e) {
//           console.warn('[camera.js] Ideal constraints failed, trying basic...', e);
//           this.stream = await navigator.mediaDevices.getUserMedia({ video: true });
//         }

//         this.video.srcObject = this.stream;
        
//         const playPromise = this.video.play();
//         if (playPromise !== undefined) {
//           playPromise.catch(error => {
//             this.error = "User interaction required to start camera feed.";
//             console.warn('[camera.js]', this.error);
//           });
//         }

//         this.active = true;
        
//         this.video.onloadedmetadata = () => {
//           this.canvas.width = this.video.videoWidth;
//           this.canvas.height = this.video.videoHeight;
//           this.width = this.canvas.width;
//           this.height = this.canvas.height;
//           this.ready = true;
//           console.log(`[camera.js] Capture ready: ${this.width}x${this.height}`);
//           if (this.onReady) this.onReady();
//         };

//       } catch (err) {
//         this.error = err.message || String(err);
//         console.error('[camera.js] Capture Init Error:', err);
//       }
//     }

//     initCLIMode() {
//       console.log('[camera.js] Initializing CLI Mode (Mock/File Support)');
//       this.active = true;
//       this.ready = true;
//     }

//     read() {
//       if (!this.ready || !this.active) return [false, null];
//       if (_isBrowser) {
//         if (this.video.readyState < 2) return [false, null]; // HAVE_CURRENT_DATA
//         this.ctx.drawImage(this.video, 0, 0, this.width, this.height);
//         return [true, new Frame(this.canvas, this.ctx)];
//       } else {
//         // CLI "Simulation" Mode
//         const ctx = this.ctx;
//         ctx.fillStyle = '#050510';
//         ctx.fillRect(0, 0, this.width, this.height);
//         this._frameCounter = (this._frameCounter + 2) % this.height;
//         ctx.strokeStyle = '#1e1e3e';
//         ctx.lineWidth = 1;
//         ctx.beginPath();
//         ctx.moveTo(0, this._frameCounter); ctx.lineTo(this.width, this._frameCounter);
//         ctx.stroke();
//         const x = this.width / 2 + Math.sin(Date.now() / 500) * 50;
//         const y = this.height / 2 + Math.cos(Date.now() / 500) * 30;
//         ctx.strokeStyle = '#7aa2f7';
//         ctx.lineWidth = 2;
//         ctx.beginPath();
//         ctx.arc(x, y, 10, 0, Math.PI * 2);
//         ctx.stroke();
//         return [true, new Frame(this.canvas, this.ctx)];
//       }
//     }

//     release() {
//       if (_isBrowser) {
//         if (this.stream) this.stream.getTracks().forEach(t => t.stop());
//         if (this.video.parentNode) this.video.parentNode.removeChild(this.video);
//       }
//       this.active = false;
//       this.ready = false;
//     }

//     display(visible) {
//       this.showing = visible;
//       return this;
//     }

//     startRecording() {
//       if (!_isBrowser) {
//         console.warn('[camera.js] Recording is only supported in browser mode.');
//         return;
//       }
//       if (!this.stream) return;
//       if (!this.recorder) {
//         this.recorder = new VideoRecorder(this.stream);
//       }
//       this.recorder.start();
//       console.log('[camera.js] Recording started.');
//     }

//     async stopRecording(filename = 'capture.webm') {
//       if (!this.recorder) return;
//       await this.recorder.save(filename);
//       console.log('[camera.js] Recording stopped and saved.');
//     }
//   }

//   // ── VideoRecorder ───────────────────────────────────────────────────────────

//   class VideoRecorder {
//     constructor(streamSource) {
//       // Handle potential canvas or video stream
//       this.source = streamSource.stream || streamSource; 
//       if (streamSource.canvas && streamSource.canvas.captureStream) {
//         this.source = streamSource.canvas.captureStream();
//       }
//       this.chunks = [];
//       this.recorder = null;
//       this.state = 'idle';
//     }

//     start() {
//       if (!_isBrowser) throw new Error('VideoRecorder requires browser environment.');
//       this.chunks = [];
//       let options = { mimeType: 'video/webm;codecs=vp8' };
//       if (!MediaRecorder.isTypeSupported(options.mimeType)) {
//         options = { mimeType: 'video/webm' };
//       }
//       try {
//         this.recorder = new MediaRecorder(this.source, options);
//         this.recorder.ondataavailable = e => { if(e.data.size > 0) this.chunks.push(e.data); };
//         this.recorder.start();
//         this.state = 'recording';
//       } catch (e) {
//         console.error('[camera.js] Failed to start recorder:', e);
//       }
//     }

//     stop() {
//       return new Promise(resolve => {
//         if (!this.recorder || this.state !== 'recording') return resolve(null);
//         this.recorder.onstop = () => {
//           const blob = new Blob(this.chunks, { type: 'video/webm' });
//           this.state = 'idle';
//           resolve(blob);
//         };
//         this.recorder.stop();
//       });
//     }

//     async save(filename = 'capture.webm') {
//       const blob = await this.stop();
//       if (!blob) return;
//       const url = URL.createObjectURL(blob);
//       const a = document.createElement('a');
//       a.href = url; a.download = filename; a.click();
//       URL.revokeObjectURL(url);
//     }
//   }

//   // ── Engine Functions ────────────────────────────────────────────────────────

//   const camera = {
//     VideoCapture: (src) => new VideoCapture(src),
//     VideoRecorder: (src) => new VideoRecorder(src),
    
//     display: (visible) => {
//       return true;
//     },

//     cvtColor: (frame, code) => {
//       if (code === 'gray' || code === 6 /* COLOR_BGR2GRAY */) return frame.gray();
//       return frame;
//     },

//     threshold: (frame, thresh, maxVal, type=0) => {
//       const img = frame.getData();
//       const d = img.data;
//       for (let i = 0; i < d.length; i += 4) {
//         const v = (d[i] + d[i+1] + d[i+2]) / 3;
//         let res = 0;
//         if (type === 0) res = v > thresh ? maxVal : 0; 
//         else if (type === 1) res = v > thresh ? 0 : maxVal; 
//         d[i] = d[i+1] = d[i+2] = res;
//       }
//       return frame.putData(img);
//     },

//     imshow: (target, frame) => {
//       if (!frame || !target) return;
      
//       // Resolve the target body/element
//       let body = target.__body__ || target.body || target.__el__ || target.el || target;
      
//       // Support for raw Canvas elements
//       if (body instanceof HTMLCanvasElement) {
//         if (body.width !== frame.width) body.width = frame.width;
//         if (body.height !== frame.height) body.height = frame.height;
//         const ctx = body.getContext('2d');
//         ctx.drawImage(frame.canvas, 0, 0);
//         return;
//       }

//       if (body instanceof HTMLElement) {
//         let display = body.querySelector('.camera-output');
//         if (!display) {
//            display = document.createElement('canvas');
//            display.className = 'camera-output';
//            display.style.cssText = 'width:100%; height:100%; object-fit:contain; display:block; image-rendering:pixelated;';
//            body.appendChild(display);
//         }
//         if (display.width !== frame.width) display.width = frame.width;
//         if (display.height !== frame.height) display.height = frame.height;
//         const ctx = display.getContext('2d');
//         ctx.drawImage(frame.canvas, 0, 0);
//       } else if (target.__ctx__ || target.ctx) {
//         const ctx = target.__ctx__ || target.ctx;
//         ctx.drawImage(frame.canvas, 0, 0, target.width || frame.width, target.height || frame.height);
//       }
//     },

//     createView: (x = 0, y = 0, w = 640, h = 480, capIndex = -1) => {
//       // Try to find gui globally or via window
//       const guiRef = typeof gui !== 'undefined' ? gui : (window.gui);
      
//       const v = (guiRef && guiRef.Scene) ? guiRef.Scene() : { __el__: document.createElement('div'), __type__: 'view' };
//       const el = v.__el__;
//       el.className = 'zeta-camera-view';
//       Object.assign(el.style, {
//         position: 'absolute', left: x+'px', top: y+'px', width: w+'px', height: h+'px',
//         background: '#050510', borderRadius: '4px', overflow: 'hidden', border: '1px solid #333'
//       });
      
//       const msg = document.createElement('div');
//       msg.style.cssText = 'position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#444; text-align:center; padding:20px; font-size:12px; font-family:monospace; z-index:10; pointer-events:none;';
//       msg.textContent = capIndex >= 0 ? 'INITIALIZING CAMERA...' : 'WAITING FOR INPUT...';
//       el.appendChild(msg);

//       let cap = null;
//       let active = true;
      
//       const loop = () => {
//         if (!active || capIndex < 0) return;
//         if (!cap) {
//           cap = camera.VideoCapture(capIndex);
//           v.cap = cap; // Attach cap to the view object
//           cap.onReady = () => { msg.style.display = 'none'; };
//         }
        
//         if (cap.error) {
//           msg.textContent = 'ERROR:\n' + cap.error;
//           msg.style.color = '#f7768e';
//           msg.style.display = 'flex';
//         } else {
//           const [ret, frame] = cap.read();
//           if (ret && cap.showing) camera.imshow(v, frame);
//         }
//         _raf(loop);
//       };
      
//       v.hideMessage = () => { msg.style.display = 'none'; };
//       v.stop = () => { active = false; if(cap) cap.release(); };
//       v.start = () => { active = true; if(capIndex >= 0) loop(); };
      
//       if(capIndex >= 0) v.start();
//       return v;
//     },

//     loop: (fn) => {
//       let active = true;
//       const _tick = () => {
//         if (!active) return;
//         try { fn(); } catch(e) { console.error('[camera.loop] Error:', e); active = false; }
//         _raf(_tick);
//       };
//       _raf(_tick);
//       return { stop: () => { active = false; } };
//     },

//     absdiff: (f1, f2) => {
//       const d1 = f1.getData(), d2 = f2.getData();
//       const out = f1.clone();
//       const od = out.getData();
//       for (let i = 0; i < d1.data.length; i += 4) {
//         od.data[i] = Math.abs(d1.data[i] - d2.data[i]);
//         od.data[i+1] = Math.abs(d1.data[i+1] - d2.data[i+1]);
//         od.data[i+2] = Math.abs(d1.data[i+2] - d2.data[i+2]);
//         od.data[i+3] = 255;
//       }
//       return out.putData(od);
//     },

//     getMotionLevel: (f1, f2) => {
//       const diff = camera.absdiff(f1, f2);
//       const d = diff.getData().data;
//       let count = 0;
//       for (let i=0; i<d.length; i+=4) {
//         if((d[i] + d[i+1] + d[i+2])/3 > 30) count++;
//       }
//       return (count / (d.length/4)) * 100;
//     },

//     flip: (f, mode) => {
//       const c = _createCanvas(f.width, f.height);
//       const x = c.getContext('2d');
//       x.translate(mode === 1 || mode === -1 ? f.width : 0, mode === 0 || mode === -1 ? f.height : 0);
//       x.scale(mode === 1 || mode === -1 ? -1 : 1, mode === 0 || mode === -1 ? -1 : 1);
//       x.drawImage(f.canvas, 0, 0);
//       f.ctx.clearRect(0,0,f.width,f.height);
//       f.ctx.drawImage(c, 0, 0);
//       return f;
//     },

//     blur: (frame, k) => {
//       frame.ctx.filter = `blur(${k}px)`;
//       frame.ctx.drawImage(frame.canvas, 0, 0);
//       frame.ctx.filter = 'none';
//       return frame;
//     },

//     enhance: (frame, brightness = 1.0, contrast = 1.0) => {
//       frame.ctx.filter = `brightness(${brightness}) contrast(${contrast})`;
//       frame.ctx.drawImage(frame.canvas, 0, 0);
//       frame.ctx.filter = 'none';
//       return frame;
//     },

//     sharpen: (frame, amount = 1.0) => {
//       // Simple sharpening filter using canvas context shadow trick or high-pass
//       // For performance, we'll use a convolution-like filter if amount is high
//       // but standard CSS filter is usually enough for "enhancement"
//       frame.ctx.filter = `contrast(${1 + amount * 0.5}) brightness(${1 + amount * 0.1})`;
//       frame.ctx.drawImage(frame.canvas, 0, 0);
//       frame.ctx.filter = 'none';
//       return frame;
//     },

//     Canny: (frame, low, high) => {
//       const img = frame.getData();
//       const d = img.data;
//       const w = frame.width;
//       const h = frame.height;
//       const gray = new Uint8ClampedArray(w * h);
//       for (let i=0; i<d.length; i+=4) gray[i/4] = (d[i]+d[i+1]+d[i+2])/3;
      
//       const result = new Uint8ClampedArray(d.length);
//       for (let y=1; y<h-1; y++) {
//         for (let x=1; x<w-1; x++) {
//           const idx = y * w + x;
//           const gh = (gray[idx+w-1] + 2*gray[idx+w] + gray[idx+w+1]) - (gray[idx-w-1] + 2*gray[idx-w] + gray[idx-w+1]);
//           const gv = (gray[idx-w+1] + 2*gray[idx+1] + gray[idx+w+1]) - (gray[idx-w-1] + 2*gray[idx-1] + gray[idx+w-1]);
//           const mag = Math.sqrt(gh*gh + gv*gv);
//           const c = mag > low ? 255 : 0;
//           const oidx = idx * 4;
//           result[oidx] = result[oidx+1] = result[oidx+2] = c;
//           result[oidx+3] = 255;
//         }
//       }
//       d.set(result);
//       return frame.putData(img);
//     },

//     putText: (f, t, x, y, c='#fff', s=20) => { f.ctx.fillStyle=c; f.ctx.font=`${s}px monospace`; f.ctx.fillText(t,x,y); return f; },
//     putRect: (f, x, y, w, h, c='#0f0', t=2) => { f.ctx.strokeStyle=c; f.ctx.lineWidth=t; f.ctx.strokeRect(x,y,w,h); return f; },
//     putCircle: (f, x, y, r, c='#00f', t=2) => { f.ctx.strokeStyle=c; f.ctx.lineWidth=t; f.ctx.beginPath(); f.ctx.arc(x,y,r,0,Math.PI*2); f.ctx.stroke(); return f; }
//   };

//   // ── DSALibraries Registration ──────────────────────────────────────────────
//   if (typeof DSALibraries !== 'undefined') {
//     DSALibraries['camera.zl'] = {
//       description: 'Zeta Camera Engine: VideoCapture, imshow, cvtColor, createView',
//       inject(G) {
//         Object.assign(G, camera);
//         G.camera = camera;
//         if (typeof window !== 'undefined' && window.__ZPP__) {
//           window.__ZPP__.registerBuiltins(Object.keys(camera));
//         }
//       }
//     };
//   }

//   if (typeof module !== 'undefined') module.exports = camera;
//   if (typeof window !== 'undefined') window.camera = camera;

// })();


//FROM HERE NEW CODE

(function CameraLib() {
  'use strict';

  /**
   * ══════════════════════════════════════════════════════════════════════════════
   * ZETA CAMERA ENGINE — camera.js (Standard Library)
   * A professional, cross-platform Vision and Video Processing library.
   *
   * Supports:
   *  - Browser: WebRTC MediaDevices & Canvas API.
   *  - CLI (Node.js): Mock/File-based capture or native bridge.
   *  - OpenCV-style API: VideoCapture, imshow, cvtColor, threshold.
   *  - Advanced: VideoRecorder, Motion Detection, Edge Detection, Drawing.
   * ══════════════════════════════════════════════════════════════════════════════
   */

  const _isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
  const _raf = _isBrowser ? window.requestAnimationFrame.bind(window) : (fn) => setTimeout(() => fn(Date.now()), 16);
  const _caf = _isBrowser ? window.cancelAnimationFrame.bind(window) : (id) => clearTimeout(id);
  
  let _fs = null;
  let _path = null;

  if (!_isBrowser) {
    try { _fs = require('fs'); _path = require('path'); } catch (e) {}
  }

  // ── Utils ──────────────────────────────────────────────────────────────────

  function _clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

  function _createCanvas(w, h) {
    if (_isBrowser) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      return c;
    } else {
      try {
        const { createCanvas } = require('canvas');
        return createCanvas(w, h);
      } catch (e) {
        return { 
          width: w, height: h, 
          getContext: () => ({ 
            drawImage: () => {}, 
            getImageData: () => ({ data: new Uint8ClampedArray(w * h * 4) }),
            putImageData: () => {},
            clearRect: () => {},
            fillRect: () => {},
            strokeRect: () => {},
            fillText: () => {},
            beginPath: () => {},
            arc: () => {},
            stroke: () => {}
          }),
          toDataURL: () => ""
        };
      }
    }
  }

  // ── Frame Object ────────────────────────────────────────────────────────────

  class Frame {
    constructor(canvas, ctx) {
      this.canvas = canvas;
      this.ctx = ctx;
      this.width = canvas.width;
      this.height = canvas.height;
      this.timestamp = Date.now();
    }

    getData() {
      if (!this.ctx.getImageData) return { data: new Uint8ClampedArray(this.width * this.height * 4) };
      return this.ctx.getImageData(0, 0, this.width, this.height);
    }

    putData(imageData) {
      if (this.ctx.putImageData) this.ctx.putImageData(imageData, 0, 0);
      return this;
    }

    toDataURL(type = 'image/jpeg', quality = 0.8) {
      return this.canvas.toDataURL(type, quality);
    }

    clone() {
      const c = _createCanvas(this.width, this.height);
      const x = c.getContext('2d');
      x.drawImage(this.canvas, 0, 0);
      return new Frame(c, x);
    }
    
    gray() {
      const img = this.getData();
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
        d[i] = d[i+1] = d[i+2] = v;
      }
      return this.putData(img);
    }
  }

  // ── VideoCapture ────────────────────────────────────────────────────────────

  // ── Mode Constants ──────────────────────────────────────────────────────────
  const COLOR = 0;
  const GRAY = 1;
  const CANNY = 2;
  const THRESHOLD = 3;
  const INVERT = 4;
  const BLUR = 5;

  class VideoCapture {
    constructor(source = 0) {
      this.source = source; 
      this.active = false;
      this.ready = false;
      this.error = null;
      this.width = 640;
      this.height = 480;
      this.FPS = 30;
      this._frameCounter = 0;
      this.showing = true;
      this.recorder = null;
      this.currentMode = COLOR;
      this.thresholdValue = 127;

      if (_isBrowser) {
        this.video = document.createElement('video');
        this.video.autoplay = true;
        this.video.muted = true;
        this.video.setAttribute('playsinline', '');
        this.video.style.display = 'none';
        document.body.appendChild(this.video);
        
        this.canvas = _createCanvas(this.width, this.height);
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.stream = null;
        this.initBrowserMode();
      } else {
        this.canvas = _createCanvas(this.width, this.height);
        this.ctx = this.canvas.getContext('2d');
        this.initCLIMode();
      }
    }

    async initBrowserMode() {
      try {
        console.log('[camera.js] Requesting camera access...');
        let constraints = { 
          video: { 
            width: { ideal: this.width }, 
            height: { ideal: this.height },
            facingMode: 'user'
          } 
        };
        
        if (typeof this.source === 'string' && (this.source.startsWith('http') || this.source.startsWith('.') || this.source.startsWith('/'))) {
          this.video.src = this.source;
          this.video.loop = true;
          this.active = true;
          this.video.onloadedmetadata = () => {
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
            this.width = this.canvas.width;
            this.height = this.canvas.height;
            this.ready = true;
            if (this.onReady) this.onReady();
          };
          this.video.play().catch(e => {
            this.error = "Autoplay blocked: " + e.message;
            console.warn('[camera.js]', this.error);
          });
          return;
        }

        // Try to get specific device if source is index
        if (typeof this.source === 'number' && this.source >= 0) {
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            const deviceId = videoDevices[this.source]?.deviceId;
            if (deviceId) constraints.video.deviceId = { exact: deviceId };
          } catch(e) {}
        }

        try {
          this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (e) {
          console.warn('[camera.js] Ideal constraints failed, trying basic...', e);
          this.stream = await navigator.mediaDevices.getUserMedia({ video: true });
        }

        this.video.srcObject = this.stream;
        
        const playPromise = this.video.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            this.error = "User interaction required to start camera feed.";
            console.warn('[camera.js]', this.error);
          });
        }

        this.active = true;
        
        this.video.onloadedmetadata = () => {
          this.canvas.width = this.video.videoWidth;
          this.canvas.height = this.video.videoHeight;
          this.width = this.canvas.width;
          this.height = this.canvas.height;
          this.ready = true;
          console.log(`[camera.js] Capture ready: ${this.width}x${this.height}`);
          if (this.onReady) this.onReady();
        };

      } catch (err) {
        this.error = err.message || String(err);
        console.error('[camera.js] Capture Init Error:', err);
      }
    }

    initCLIMode() {
      console.log('[camera.js] Initializing CLI Mode (Mock/File Support)');
      this.active = true;
      this.ready = true;
    }

    read() {
      if (!this.ready || !this.active) return [false, null];
      if (_isBrowser) {
        if (this.video.readyState < 2) return [false, null]; // HAVE_CURRENT_DATA
        this.ctx.drawImage(this.video, 0, 0, this.width, this.height);
        return [true, new Frame(this.canvas, this.ctx)];
      } else {
        // CLI "Simulation" Mode
        const ctx = this.ctx;
        ctx.fillStyle = '#050510';
        ctx.fillRect(0, 0, this.width, this.height);
        this._frameCounter = (this._frameCounter + 2) % this.height;
        ctx.strokeStyle = '#1e1e3e';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, this._frameCounter); ctx.lineTo(this.width, this._frameCounter);
        ctx.stroke();
        const x = this.width / 2 + Math.sin(Date.now() / 500) * 50;
        const y = this.height / 2 + Math.cos(Date.now() / 500) * 30;
        ctx.strokeStyle = '#7aa2f7';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.stroke();
        return [true, new Frame(this.canvas, this.ctx)];
      }
    }

    release() {
      if (_isBrowser) {
        if (this.stream) this.stream.getTracks().forEach(t => t.stop());
        if (this.video.parentNode) this.video.parentNode.removeChild(this.video);
      }
      this.active = false;
      this.ready = false;
    }

    display(visible) {
      this.showing = visible;
      return this;
    }

    setMode(mode, param) {
      this.currentMode = mode;
      if (mode === THRESHOLD && param !== undefined) this.thresholdValue = param;
      return this;
    }

    startRecording() {
      if (!_isBrowser) {
        console.warn('[camera.js] Recording is only supported in browser mode.');
        return;
      }
      if (!this.stream) return;
      if (!this.recorder) {
        this.recorder = new VideoRecorder(this.stream);
      }
      this.recorder.start();
      console.log('[camera.js] Recording started.');
    }

    async stopRecording(filename = 'capture.webm') {
      if (!this.recorder) return;
      await this.recorder.save(filename);
      console.log('[camera.js] Recording stopped and saved.');
    }
  }

  // ── VideoRecorder ───────────────────────────────────────────────────────────

  class VideoRecorder {
    constructor(streamSource) {
      // Handle potential canvas or video stream
      this.source = streamSource.stream || streamSource; 
      if (streamSource.canvas && streamSource.canvas.captureStream) {
        this.source = streamSource.canvas.captureStream();
      }
      this.chunks = [];
      this.recorder = null;
      this.state = 'idle';
    }

    start() {
      if (!_isBrowser) throw new Error('VideoRecorder requires browser environment.');
      this.chunks = [];
      let options = { mimeType: 'video/webm;codecs=vp8' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm' };
      }
      try {
        this.recorder = new MediaRecorder(this.source, options);
        this.recorder.ondataavailable = e => { if(e.data.size > 0) this.chunks.push(e.data); };
        this.recorder.start();
        this.state = 'recording';
      } catch (e) {
        console.error('[camera.js] Failed to start recorder:', e);
      }
    }

    stop() {
      return new Promise(resolve => {
        if (!this.recorder || this.state !== 'recording') return resolve(null);
        this.recorder.onstop = () => {
          const blob = new Blob(this.chunks, { type: 'video/webm' });
          this.state = 'idle';
          resolve(blob);
        };
        this.recorder.stop();
      });
    }

    async save(filename = 'capture.webm') {
      const blob = await this.stop();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    }
  }

  // ── Engine Functions ────────────────────────────────────────────────────────

  const camera = {
    VideoCapture: (src) => new VideoCapture(src),
    VideoRecorder: (src) => new VideoRecorder(src),
    
    display: (visible) => {
      return true;
    },

    cvtColor: (frame, code) => {
      if (code === 'gray' || code === 6 /* COLOR_BGR2GRAY */) return frame.gray();
      return frame;
    },

    threshold: (frame, thresh, maxVal, type=0) => {
      const img = frame.getData();
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = (d[i] + d[i+1] + d[i+2]) / 3;
        let res = 0;
        if (type === 0) res = v > thresh ? maxVal : 0; 
        else if (type === 1) res = v > thresh ? 0 : maxVal; 
        d[i] = d[i+1] = d[i+2] = res;
      }
      return frame.putData(img);
    },

    imshow: (target, frame) => {
      if (!frame || !target) return;
      
      // Resolve the target body/element
      let body = target.__body__ || target.body || target.__el__ || target.el || target;
      
      // Support for raw Canvas elements
      if (body instanceof HTMLCanvasElement) {
        if (body.width !== frame.width) body.width = frame.width;
        if (body.height !== frame.height) body.height = frame.height;
        const ctx = body.getContext('2d');
        ctx.drawImage(frame.canvas, 0, 0);
        return;
      }

      if (body instanceof HTMLElement) {
        let display = body.querySelector('.camera-output');
        if (!display) {
           display = document.createElement('canvas');
           display.className = 'camera-output';
           display.style.cssText = 'width:100%; height:100%; object-fit:contain; display:block; image-rendering:pixelated;';
           body.appendChild(display);
        }
        if (display.width !== frame.width) display.width = frame.width;
        if (display.height !== frame.height) display.height = frame.height;
        const ctx = display.getContext('2d');
        ctx.drawImage(frame.canvas, 0, 0);
      } else if (target.__ctx__ || target.ctx) {
        const ctx = target.__ctx__ || target.ctx;
        ctx.drawImage(frame.canvas, 0, 0, target.width || frame.width, target.height || frame.height);
      }
    },

    createView: (x = 0, y = 0, w = 640, h = 480, capIndex = -1) => {
      // Try to find gui globally or via window
      const guiRef = typeof gui !== 'undefined' ? gui : (window.gui);
      
      const v = (guiRef && guiRef.Scene) ? guiRef.Scene() : { __el__: document.createElement('div'), __type__: 'view' };
      const el = v.__el__;
      el.className = 'zeta-camera-view';
      Object.assign(el.style, {
        position: 'absolute', left: x+'px', top: y+'px', width: w+'px', height: h+'px',
        background: '#050510', borderRadius: '4px', overflow: 'hidden', border: '1px solid #333'
      });
      
      const msg = document.createElement('div');
      msg.style.cssText = 'position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#444; text-align:center; padding:20px; font-size:12px; font-family:monospace; z-index:10; pointer-events:none;';
      msg.textContent = capIndex >= 0 ? 'INITIALIZING CAMERA...' : 'WAITING FOR INPUT...';
      el.appendChild(msg);

      let cap = null;
      let active = true;
      
      const loop = () => {
        if (!active || capIndex < 0) return;
        if (!cap) {
          cap = camera.VideoCapture(capIndex);
          v.cap = cap; // Attach cap to the view object
          cap.onReady = () => { msg.style.display = 'none'; };
        }
        
        if (cap.error) {
          msg.textContent = 'ERROR:\n' + cap.error;
          msg.style.color = '#f7768e';
          msg.style.display = 'flex';
        } else {
          const [ret, frame] = cap.read();
          if (ret && cap.showing) {
            // Auto-processing based on mode
            if (cap.currentMode === GRAY) camera.cvtColor(frame, 'gray');
            else if (cap.currentMode === CANNY) camera.Canny(frame, 50, 150);
            else if (cap.currentMode === THRESHOLD) camera.threshold(frame, cap.thresholdValue, 255);
            else if (cap.currentMode === INVERT) {
               frame.ctx.globalCompositeOperation = 'difference';
               frame.ctx.fillStyle = 'white';
               frame.ctx.fillRect(0, 0, frame.width, frame.height);
               frame.ctx.globalCompositeOperation = 'source-over';
            }
            else if (cap.currentMode === BLUR) camera.blur(frame, 5);

            camera.imshow(v, frame);
          }
        }
        _raf(loop);
      };
      
      v.mode = (m, p) => { if (cap) cap.setMode(m, p); return v; };
      v.hideMessage = () => { msg.style.display = 'none'; };
      v.stop = () => { active = false; if(cap) cap.release(); };
      v.start = () => { active = true; if(capIndex >= 0) loop(); };
      
      if(capIndex >= 0) v.start();
      return v;
    },

    loop: (fn) => {
      let active = true;
      const _tick = () => {
        if (!active) return;
        try { fn(); } catch(e) { console.error('[camera.loop] Error:', e); active = false; }
        _raf(_tick);
      };
      _raf(_tick);
      return { stop: () => { active = false; } };
    },

    absdiff: (f1, f2) => {
      const d1 = f1.getData(), d2 = f2.getData();
      const out = f1.clone();
      const od = out.getData();
      for (let i = 0; i < d1.data.length; i += 4) {
        od.data[i] = Math.abs(d1.data[i] - d2.data[i]);
        od.data[i+1] = Math.abs(d1.data[i+1] - d2.data[i+1]);
        od.data[i+2] = Math.abs(d1.data[i+2] - d2.data[i+2]);
        od.data[i+3] = 255;
      }
      return out.putData(od);
    },

    getMotionLevel: (f1, f2) => {
      const diff = camera.absdiff(f1, f2);
      const d = diff.getData().data;
      let count = 0;
      for (let i=0; i<d.length; i+=4) {
        if((d[i] + d[i+1] + d[i+2])/3 > 30) count++;
      }
      return (count / (d.length/4)) * 100;
    },

    flip: (f, mode) => {
      const c = _createCanvas(f.width, f.height);
      const x = c.getContext('2d');
      x.translate(mode === 1 || mode === -1 ? f.width : 0, mode === 0 || mode === -1 ? f.height : 0);
      x.scale(mode === 1 || mode === -1 ? -1 : 1, mode === 0 || mode === -1 ? -1 : 1);
      x.drawImage(f.canvas, 0, 0);
      f.ctx.clearRect(0,0,f.width,f.height);
      f.ctx.drawImage(c, 0, 0);
      return f;
    },

    blur: (frame, k) => {
      frame.ctx.filter = `blur(${k}px)`;
      frame.ctx.drawImage(frame.canvas, 0, 0);
      frame.ctx.filter = 'none';
      return frame;
    },

    enhance: (frame, brightness = 1.0, contrast = 1.0) => {
      frame.ctx.filter = `brightness(${brightness}) contrast(${contrast})`;
      frame.ctx.drawImage(frame.canvas, 0, 0);
      frame.ctx.filter = 'none';
      return frame;
    },

    sharpen: (frame, amount = 1.0) => {
      // Simple sharpening filter using canvas context shadow trick or high-pass
      // For performance, we'll use a convolution-like filter if amount is high
      // but standard CSS filter is usually enough for "enhancement"
      frame.ctx.filter = `contrast(${1 + amount * 0.5}) brightness(${1 + amount * 0.1})`;
      frame.ctx.drawImage(frame.canvas, 0, 0);
      frame.ctx.filter = 'none';
      return frame;
    },

    COLOR, GRAY, CANNY, THRESHOLD, INVERT, BLUR,
    _color_cam: COLOR, _gray_cam: GRAY, _canny_cam: CANNY, _threshold_cam: THRESHOLD, _invert_cam: INVERT, _blur_cam: BLUR,

    Canny: (frame, low, high) => {
      const img = frame.getData();
      const d = img.data;
      const w = frame.width;
      const h = frame.height;
      const gray = new Uint8ClampedArray(w * h);
      for (let i=0; i<d.length; i+=4) gray[i/4] = (d[i]+d[i+1]+d[i+2])/3;
      
      const result = new Uint8ClampedArray(d.length);
      for (let y=1; y<h-1; y++) {
        for (let x=1; x<w-1; x++) {
          const idx = y * w + x;
          const gh = (gray[idx+w-1] + 2*gray[idx+w] + gray[idx+w+1]) - (gray[idx-w-1] + 2*gray[idx-w] + gray[idx-w+1]);
          const gv = (gray[idx-w+1] + 2*gray[idx+1] + gray[idx+w+1]) - (gray[idx-w-1] + 2*gray[idx-1] + gray[idx+w-1]);
          const mag = Math.sqrt(gh*gh + gv*gv);
          const c = mag > low ? 255 : 0;
          const oidx = idx * 4;
          result[oidx] = result[oidx+1] = result[oidx+2] = c;
          result[oidx+3] = 255;
        }
      }
      d.set(result);
      return frame.putData(img);
    },

    putText: (f, t, x, y, c='#fff', s=20) => { f.ctx.fillStyle=c; f.ctx.font=`${s}px monospace`; f.ctx.fillText(t,x,y); return f; },
    putRect: (f, x, y, w, h, c='#0f0', t=2) => { f.ctx.strokeStyle=c; f.ctx.lineWidth=t; f.ctx.strokeRect(x,y,w,h); return f; },
    putCircle: (f, x, y, r, c='#00f', t=2) => { f.ctx.strokeStyle=c; f.ctx.lineWidth=t; f.ctx.beginPath(); f.ctx.arc(x,y,r,0,Math.PI*2); f.ctx.stroke(); return f; }
  };

  // ── DSALibraries Registration ──────────────────────────────────────────────
  if (typeof DSALibraries !== 'undefined') {
    DSALibraries['camera.zl'] = {
      description: 'Zeta Camera Engine: VideoCapture, imshow, cvtColor, createView',
      inject(G) {
        Object.assign(G, camera);
        G.camera = camera;
        if (typeof window !== 'undefined' && window.__ZPP__) {
          window.__ZPP__.registerBuiltins(Object.keys(camera));
        }
      }
    };
  }

  if (typeof module !== 'undefined') module.exports = camera;
  if (typeof window !== 'undefined') window.camera = camera;

})();
