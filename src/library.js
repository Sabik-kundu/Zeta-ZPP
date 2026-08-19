// const DSALibraries = {
//   'math.zl': {
//     description: 'Extended math: factorial, prime, gcd, fibonacci, combinations, clamp, lerp…',
//     inject(G) {

//       // Angle conversion
//       G.degrees  = x => x * (180 / Math.PI);
//       G.radians  = x => x * (Math.PI / 180);

//       // Trig with degree input (convenience wrappers)
//       G.sinD = x => Math.sin(x * Math.PI / 180);
//       G.cosD = x => Math.cos(x * Math.PI / 180);
//       G.tanD = x => Math.tan(x * Math.PI / 180);

//       // Rounding variants
//       G.truncate = x => Math.trunc(x);
//       G.sign     = x => Math.sign(x);
//       G.clamp    = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
//       G.lerp     = (a, b, t)   => a + (b - a) * t;
//       G.map      = (x, a, b, c, d) => c + (x - a) / (b - a) * (d - c);

//       G.pi = x => Math.PI;
//       G.sqrt = x => Math.sqrt(x);

//       // Number theory
//       G.factorial = n => {
//         n = Math.floor(Math.abs(n));
//         if (n === 0 || n === 1) return 1;
//         let r = 1;
//         for (let i = 2; i <= n; i++) r *= i;
//         return r;
//       };

//       G.isPrime = n => {
//         n = Math.floor(n);
//         if (n < 2) return false;
//         if (n === 2) return true;
//         if (n % 2 === 0) return false;
//         for (let i = 3; i <= Math.sqrt(n); i += 2)
//           if (n % i === 0) return false;
//         return true;
//       };

//       G.gcd = (a, b) => {
//         a = Math.abs(Math.floor(a)); b = Math.abs(Math.floor(b));
//         while (b) { const t = b; b = a % b; a = t; }
//         return a;
//       };

//       G.lcm = (a, b) => {
//         const g = G.gcd(a, b);
//         return g === 0 ? 0 : Math.abs(a * b) / g;
//       };

//       G.fibonacci = n => {
//         n = Math.floor(Math.abs(n));
//         if (n <= 1) return n;
//         let a = 0, b = 1;
//         for (let i = 2; i <= n; i++) { const t = a + b; a = b; b = t; }
//         return b;
//       };

//       G.fibSequence = n => {
//         const seq = [0, 1];
//         for (let i = 2; i < Math.floor(Math.abs(n)); i++)
//           seq.push(seq[i-1] + seq[i-2]);
//         return seq.slice(0, Math.floor(Math.abs(n)));
//       };

//       G.primes = n => {
//         // Sieve of Eratosthenes up to n
//         const sieve = Array(n + 1).fill(true);
//         sieve[0] = sieve[1] = false;
//         for (let i = 2; i * i <= n; i++)
//           if (sieve[i]) for (let j = i*i; j <= n; j += i) sieve[j] = false;
//         return sieve.map((v, i) => v ? i : -1).filter(i => i > 0);
//       };

//       // Combinatorics
//       G.combination = (n, r) => {
//         if (r > n) return 0;
//         return G.factorial(n) / (G.factorial(r) * G.factorial(n - r));
//       };

//       G.permutation = (n, r) => {
//         if (r > n) return 0;
//         return G.factorial(n) / G.factorial(n - r);
//       };

//       // Geometry
//       G.hypot      = (...args) => Math.hypot(...args);
//       G.distance2D = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
//       G.distance3D = (x1,y1,z1, x2,y2,z2) => Math.hypot(x2-x1, y2-y1, z2-z1);

//       // Statistics helpers
//       G.median = arr => {
//         const s = [...arr].sort((a, b) => a - b);
//         const m = s.length >> 1;
//         return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2;
//       };

//       G.mode = arr => {
//         const count = {};
//         arr.forEach(x => count[x] = (count[x] || 0) + 1);
//         let maxC = 0, mode = null;
//         Object.entries(count).forEach(([k, v]) => { if (v > maxC) { maxC = v; mode = Number(k); } });
//         return mode;
//       };

//       G.variance = arr => {
//         const mean = arr.reduce((s, x) => s + x, 0) / arr.length;
//         return arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length;
//       };

//       G.stddev = arr => Math.sqrt(G.variance(arr));

//       // Matrix (2D array) helpers
//       G.matMul = (A, B) => {
//         const rows = A.length, cols = B[0].length, inner = B.length;
//         return Array.from({ length: rows }, (_, i) =>
//           Array.from({ length: cols }, (_, j) =>
//             Array.from({ length: inner }, (_, k) => A[i][k] * B[k][j])
//             .reduce((s, v) => s + v, 0)));
//       };

//       G.matTranspose = A => A[0].map((_, j) => A.map(row => row[j]));
//     }
//   },

//   'time.zl': {
//     description: 'Date/time: now, year, month, day, hour, minute, second, format, elapsed…',
//     inject(G) {

//       G.now        = () => Date.now();                          // ms since epoch
//       G.year       = () => new Date().getFullYear();
//       G.month      = () => new Date().getMonth() + 1;          // 1-12
//       G.day        = () => new Date().getDate();               // 1-31
//       G.hour       = () => new Date().getHours();              // 0-23
//       G.minute     = () => new Date().getMinutes();
//       G.second     = () => new Date().getSeconds();
//       G.millisecond= () => new Date().getMilliseconds();
//       G.dayOfWeek  = () => ['Sunday','Monday','Tuesday','Wednesday',
//                             'Thursday','Friday','Saturday'][new Date().getDay()];
//       G.monthName  = () => ['January','February','March','April','May','June',
//                             'July','August','September','October','November',
//                             'December'][new Date().getMonth()];

//       // Formatted strings
//       G.dateStr    = () => new Date().toLocaleDateString();
//       G.timeStr    = () => new Date().toLocaleTimeString();
//       G.timestamp  = () => new Date().toISOString();
//       G.dateTimeStr= () => new Date().toLocaleString();

//       // Format a timestamp (ms) into a readable string
//       G.formatTime = ms => {
//         const d = new Date(ms);
//         const pad = n => String(n).padStart(2, '0');
//         return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ` +
//                `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
//       };

//       // Duration breakdown
//       G.msToSeconds = ms => ms / 1000;
//       G.msToMinutes = ms => ms / 60000;
//       G.msToHours   = ms => ms / 3600000;

//       G.formatDuration = ms => {
//         const s = Math.floor(ms / 1000);
//         const m = Math.floor(s / 60);
//         const h = Math.floor(m / 60);
//         const d = Math.floor(h / 24);
//         if (d > 0) return `${d}d ${h%24}h ${m%60}m`;
//         if (h > 0) return `${h}h ${m%60}m ${s%60}s`;
//         if (m > 0) return `${m}m ${s%60}s`;
//         return `${s}s`;
//       };

//       // Stopwatch  (use timerStart / timerEnd)
//       let _timerStart = null;
//       G.timerStart = () => { _timerStart = Date.now(); return _timerStart; };
//       G.timerEnd   = () => {
//         if (_timerStart === null) return 0;
//         const elapsed = Date.now() - _timerStart;
//         _timerStart = null;
//         return elapsed;
//       };
//       G.timerElapsed = () => _timerStart !== null ? Date.now() - _timerStart : 0;

//       // Unix epoch helpers
//       G.unixNow     = () => Math.floor(Date.now() / 1000);
//       G.fromUnix    = s  => new Date(s * 1000).toLocaleString();
//       G.daysBetween = (a, b) => Math.round(Math.abs(b - a) / 86400000);

//       // ── Live Clock widget ─────────────────────────────────────
//       // startClock(theme?)  — injects a real-time clock into the
//       //   terminal output and ticks every 100 ms via setInterval.
//       //   theme: 'neon' (default) | 'retro' | 'minimal'
//       // stopClock()         — stops the running clock and removes it.

//       let _clockInterval = null;
//       let _clockEl       = null;

//       const _clockThemes = {
//         neon: {
//           bg:        '#0a0a1a',
//           border:    '#00f5ff',
//           glow:      '0 0 20px #00f5ff, 0 0 40px #00f5ff44',
//           digitClr:  '#00f5ff',
//           digitGlow: '0 0 12px #00f5ff, 0 0 30px #00f5ffaa',
//           colonClr:  '#00f5ff',
//           ampmClr:   '#ff6ec7',
//           ampmGlow:  '0 0 10px #ff6ec7',
//           dateClr:   '#a0d8ef',
//           unixClr:   '#546e7a',
//           barBg:     '#0d2233',
//           barFill:   'linear-gradient(90deg,#00f5ff,#ff6ec7)',
//           secRingClr:'#00f5ff',
//           btnBg:     '#ff6ec722',
//           btnBdr:    '#ff6ec7',
//           btnClr:    '#ff6ec7',
//           label:     'ZETA++ NEON CLOCK',
//           labelClr:  '#ffffff44',
//         },
//         retro: {
//           bg:        '#1a0e00',
//           border:    '#ff8c00',
//           glow:      '0 0 16px #ff8c0088',
//           digitClr:  '#ffb347',
//           digitGlow: '0 0 10px #ff8c00',
//           colonClr:  '#ff8c00',
//           ampmClr:   '#ffd700',
//           ampmGlow:  '0 0 8px #ffd700',
//           dateClr:   '#cc8844',
//           unixClr:   '#7a5c2e',
//           barBg:     '#2a1800',
//           barFill:   'linear-gradient(90deg,#ff8c00,#ffd700)',
//           secRingClr:'#ff8c00',
//           btnBg:     '#ff8c0022',
//           btnBdr:    '#ff8c00',
//           btnClr:    '#ff8c00',
//           label:     'ZETA++ RETRO CLOCK',
//           labelClr:  '#ffffff33',
//         },
//         minimal: {
//           bg:        '#111118',
//           border:    '#444466',
//           glow:      'none',
//           digitClr:  '#e2e8f0',
//           digitGlow: 'none',
//           colonClr:  '#6b7280',
//           ampmClr:   '#94a3b8',
//           ampmGlow:  'none',
//           dateClr:   '#64748b',
//           unixClr:   '#374151',
//           barBg:     '#1e1e2e',
//           barFill:   'linear-gradient(90deg,#6366f1,#818cf8)',
//           secRingClr:'#6366f1',
//           btnBg:     '#ffffff08',
//           btnBdr:    '#4b5563',
//           btnClr:    '#9ca3af',
//           label:     'ZETA++ CLOCK',
//           labelClr:  '#ffffff22',
//         },
//       };

//       G.startClock = (theme = 'neon') => {
//         // Stop any existing clock
//         if (_clockInterval) { clearInterval(_clockInterval); _clockInterval = null; }
//         if (typeof _clockEl !== 'undefined' && _clockEl && _clockEl.parentNode)
//           _clockEl.parentNode.removeChild(_clockEl);

//         // ── Terminal (Node.js) mode ──────────────────────────
//         if (typeof document === 'undefined') {
//           const pad2 = n => String(n).padStart(2, '0');
//           const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
//           const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
//           process.stdout.write('\n');
//           const tick = () => {
//             const d = new Date();
//             const h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
//             const ampm = h >= 12 ? 'PM' : 'AM';
//             const h12  = h % 12 || 12;
//             const dateStr = `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${pad2(d.getDate())} ${d.getFullYear()}`;
//             const timeStr = `\x1b[96m${pad2(h12)}:${pad2(m)}:${pad2(s)}\x1b[93m ${ampm}\x1b[0m`;
//             const unixStr = `\x1b[90mUnix: ${Math.floor(Date.now()/1000)}\x1b[0m`;
//             process.stdout.write(`\r\x1b[K⏰  ${timeStr}  \x1b[90m${dateStr}\x1b[0m  ${unixStr}  `);
//           };
//           tick();
//           _clockInterval = setInterval(tick, 1000);
//           // Keep process alive until stopClock
//           if (_clockInterval.unref) _clockInterval.unref = undefined; // keep alive
//           return 'Clock started (terminal mode, theme ignored). Call stopClock() to stop.';
//         }

//         // ── Browser mode (original) ──────────────────────────

//         const T  = _clockThemes[theme] || _clockThemes.neon;
//         const id = 'zpp-clock-' + Date.now();

//         // Build the widget HTML
//         const html = `
// <div id="${id}" style="
//   display:inline-block; min-width:520px;
//   background:${T.bg};
//   border:2px solid ${T.border};
//   border-radius:16px;
//   box-shadow:${T.glow};
//   padding:28px 36px 22px;
//   font-family:'JetBrains Mono','Fira Code',Consolas,monospace;
//   margin:8px 0; user-select:none;
// ">
//   <!-- Label -->
//   <div style="
//     text-align:center; letter-spacing:6px; font-size:11px;
//     color:${T.labelClr}; margin-bottom:18px; text-transform:uppercase;
//   ">${T.label}</div>

//   <!-- Main time row -->
//   <div style="display:flex;align-items:baseline;justify-content:center;gap:0">
//     <span id="${id}-h"  style="font-size:72px;font-weight:700;letter-spacing:-2px;color:${T.digitClr};text-shadow:${T.digitGlow};line-height:1">00</span>
//     <span id="${id}-c1" style="font-size:60px;font-weight:300;color:${T.colonClr};margin:0 4px;line-height:1;animation:${id}blink 1s step-end infinite">:</span>
//     <span id="${id}-m"  style="font-size:72px;font-weight:700;letter-spacing:-2px;color:${T.digitClr};text-shadow:${T.digitGlow};line-height:1">00</span>
//     <span id="${id}-c2" style="font-size:60px;font-weight:300;color:${T.colonClr};margin:0 4px;line-height:1;animation:${id}blink 1s step-end infinite">:</span>
//     <span id="${id}-s"  style="font-size:72px;font-weight:700;letter-spacing:-2px;color:${T.digitClr};text-shadow:${T.digitGlow};line-height:1">00</span>
//     <span id="${id}-ap" style="font-size:22px;font-weight:600;color:${T.ampmClr};text-shadow:${T.ampmGlow};margin-left:12px;align-self:flex-start;padding-top:12px">AM</span>
//   </div>

//   <!-- Millisecond progress bar -->
//   <div style="margin:16px 0 6px;background:${T.barBg};border-radius:4px;height:6px;overflow:hidden;">
//     <div id="${id}-ms" style="height:100%;width:0%;background:${T.barFill};border-radius:4px;transition:width 0.1s linear;"></div>
//   </div>
//   <div style="display:flex;justify-content:space-between;font-size:10px;color:${T.unixClr};margin-bottom:16px">
//     <span>0ms</span><span id="${id}-msv" style="color:${T.dateClr}">0ms</span><span>999ms</span>
//   </div>

//   <!-- Seconds ring row -->
//   <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
//     <svg width="56" height="56" viewBox="0 0 56 56">
//       <circle cx="28" cy="28" r="24" fill="none" stroke="${T.barBg}" stroke-width="5"/>
//       <circle id="${id}-ring" cx="28" cy="28" r="24" fill="none"
//         stroke="${T.secRingClr}" stroke-width="5"
//         stroke-dasharray="150.8" stroke-dashoffset="150.8"
//         stroke-linecap="round"
//         transform="rotate(-90 28 28)"
//         style="transition:stroke-dashoffset 0.1s linear;"/>
//       <text id="${id}-sv" x="28" y="33" text-anchor="middle"
//         fill="${T.digitClr}" font-size="13" font-family="monospace" font-weight="700">00</text>
//     </svg>
//     <div>
//       <div id="${id}-date" style="font-size:15px;color:${T.dateClr};letter-spacing:1px;">Loading…</div>
//       <div id="${id}-unix" style="font-size:11px;color:${T.unixClr};margin-top:4px;">Unix: …</div>
//       <div id="${id}-24h" style="font-size:11px;color:${T.unixClr};margin-top:2px;">24h: …</div>
//     </div>
//   </div>

//   <!-- Stop button -->
//   <div style="text-align:center">
//     <button onclick="
//       (function(){
//         var el=document.getElementById('${id}');
//         if(window.__zppClockStop)window.__zppClockStop();
//         if(el)el.innerHTML='<span style=\\'color:#546e7a;font-size:13px\\'>⏹ Clock stopped.</span>';
//       })()
//     " style="
//       background:${T.btnBg}; border:1px solid ${T.btnBdr};
//       color:${T.btnClr}; border-radius:6px; padding:5px 18px;
//       font-family:inherit; font-size:12px; cursor:pointer; letter-spacing:2px;
//     ">⏹ STOP</button>
//   </div>
// </div>
// <style>
// @keyframes ${id}blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
// </style>`;

//         // Inject into output terminal
//         const out = document.getElementById('output');
//         if (!out) return 'startClock: no #output element found (browser only)';

//         const wrap = document.createElement('div');
//         wrap.innerHTML = html;
//         out.appendChild(wrap);
//         _clockEl = wrap;
//         out.scrollTop = out.scrollHeight;

//         const pad2 = n => String(n).padStart(2, '0');
//         const MONTHS = ['January','February','March','April','May','June',
//                         'July','August','September','October','November','December'];
//         const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

//         const tick = () => {
//           const now  = new Date();
//           const h24  = now.getHours();
//           const m    = now.getMinutes();
//           const s    = now.getSeconds();
//           const ms   = now.getMilliseconds();
//           const h12  = h24 % 12 || 12;
//           const ampm = h24 >= 12 ? 'PM' : 'AM';

//           const g = sel => document.getElementById(id + sel);
//           const set = (sel, v) => { const el = g(sel); if (el) el.textContent = v; };
//           const style = (sel, p, v) => { const el = g(sel); if (el) el.style[p] = v; };

//           set('-h',  pad2(h12));
//           set('-m',  pad2(m));
//           set('-s',  pad2(s));
//           set('-ap', ampm);
//           set('-sv', pad2(s));
//           set('-msv', ms + 'ms');
//           style('-ms', 'width', ((ms / 1000) * 100).toFixed(1) + '%');

//           // Seconds ring: circumference = 2π×24 ≈ 150.8
//           const dashOffset = (150.8 * (1 - s / 60)).toFixed(2);
//           const ring = g('-ring');
//           if (ring) ring.setAttribute('stroke-dashoffset', dashOffset);

//           const dateStr = DAYS[now.getDay()] + ', ' +
//             MONTHS[now.getMonth()] + ' ' + pad2(now.getDate()) +
//             ', ' + now.getFullYear();
//           set('-date', dateStr);
//           set('-unix', 'Unix: ' + Math.floor(Date.now() / 1000));
//           set('-24h',  '24h: ' + pad2(h24) + ':' + pad2(m) + ':' + pad2(s));
//         };

//         tick();
//         _clockInterval = setInterval(tick, 100);

//         // Expose stop globally so the button can call it
//         window.__zppClockStop = () => {
//           if (_clockInterval) { clearInterval(_clockInterval); _clockInterval = null; }
//         };

//         return 'Clock started. (theme: ' + theme + ')';
//       };

//       G.stopClock = () => {
//         if (_clockInterval) {
//           clearInterval(_clockInterval);
//           _clockInterval = null;
//         }
//         if (typeof document === 'undefined') {
//           process.stdout.write('\n\x1b[90m⏹ Clock stopped.\x1b[0m\n');
//           return 'Clock stopped.';
//         }
//         if (_clockEl && _clockEl.parentNode) {
//           const stopped = document.createElement('div');
//           stopped.style.cssText = 'color:#546e7a;font-size:13px;padding:4px 0';
//           stopped.textContent   = '⏹ Clock stopped.';
//           _clockEl.parentNode.replaceChild(stopped, _clockEl);
//           _clockEl = null;
//         }
//         return 'Clock stopped.';
//       };

//       // ── termClock() — plain text clock, lives inside the terminal ──
//       // Renders as a single updating pre block — pure monospace text,
//       // no widgets. Ticks every second.
//       // stopClock() stops it just like startClock().

//       G.termClock = () => {
//         if (_clockInterval) { clearInterval(_clockInterval); _clockInterval = null; }
//         if (typeof _clockEl !== 'undefined' && _clockEl && _clockEl.parentNode)
//           _clockEl.parentNode.removeChild(_clockEl);

//         if (typeof document === 'undefined') {
//           return G.startClock('minimal');
//         }

//         const out = document.getElementById('output');
//         if (!out) return 'termClock: browser only';

//         const pre = document.createElement('pre');
//         pre.style.cssText = [
//           'margin:6px 0', 'padding:0',
//           'background:transparent', 'border:none',
//           'font-family:inherit', 'font-size:inherit',
//           'line-height:inherit', 'color:#e2e8f0',
//           'white-space:pre',
//         ].join(';');
//         out.appendChild(pre);
//         _clockEl = pre;
//         out.scrollTop = out.scrollHeight;

//         const pad  = n => String(n).padStart(2,'0');
//         const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
//         const MONS = ['January','February','March','April','May','June',
//                       'July','August','September','October','November','December'];

//         // 5x7 pixel-font digits (each char = 1 pixel, 5 wide × 7 tall)
//         const GLYPHS = {
//           '0': ['\u2588\u2588\u2588\u2588\u2588','\u2588   \u2588','\u2588   \u2588','\u2588   \u2588','\u2588   \u2588','\u2588   \u2588','\u2588\u2588\u2588\u2588\u2588'],
//           '1': ['  \u2588  ','  \u2588  ','  \u2588  ','  \u2588  ','  \u2588  ','  \u2588  ','  \u2588  '],
//           '2': ['\u2588\u2588\u2588\u2588\u2588','    \u2588','    \u2588','\u2588\u2588\u2588\u2588\u2588','\u2588    ','\u2588    ','\u2588\u2588\u2588\u2588\u2588'],
//           '3': ['\u2588\u2588\u2588\u2588\u2588','    \u2588','    \u2588','\u2588\u2588\u2588\u2588\u2588','    \u2588','    \u2588','\u2588\u2588\u2588\u2588\u2588'],
//           '4': ['\u2588   \u2588','\u2588   \u2588','\u2588   \u2588','\u2588\u2588\u2588\u2588\u2588','    \u2588','    \u2588','    \u2588'],
//           '5': ['\u2588\u2588\u2588\u2588\u2588','\u2588    ','\u2588    ','\u2588\u2588\u2588\u2588\u2588','    \u2588','    \u2588','\u2588\u2588\u2588\u2588\u2588'],
//           '6': ['\u2588\u2588\u2588\u2588\u2588','\u2588    ','\u2588    ','\u2588\u2588\u2588\u2588\u2588','\u2588   \u2588','\u2588   \u2588','\u2588\u2588\u2588\u2588\u2588'],
//           '7': ['\u2588\u2588\u2588\u2588\u2588','    \u2588','    \u2588','    \u2588','    \u2588','    \u2588','    \u2588'],
//           '8': ['\u2588\u2588\u2588\u2588\u2588','\u2588   \u2588','\u2588   \u2588','\u2588\u2588\u2588\u2588\u2588','\u2588   \u2588','\u2588   \u2588','\u2588\u2588\u2588\u2588\u2588'],
//           '9': ['\u2588\u2588\u2588\u2588\u2588','\u2588   \u2588','\u2588   \u2588','\u2588\u2588\u2588\u2588\u2588','    \u2588','    \u2588','\u2588\u2588\u2588\u2588\u2588'],
//           ':': ['     ','  \u2588  ','  \u2588  ','     ','  \u2588  ','  \u2588  ','     '],
//           ' ': ['     ','     ','     ','     ','     ','     ','     '],
//         };

//         const renderTime = (str) => {
//           const rows = Array(7).fill('');
//           for (const ch of str) {
//             const g = GLYPHS[ch] || GLYPHS[' '];
//             for (let r = 0; r < 7; r++) rows[r] += g[r] + ' ';
//           }
//           return rows.join('\n');
//         };

//         const tick = () => {
//           const now  = new Date();
//           const h24  = now.getHours();
//           const m    = now.getMinutes();
//           const s    = now.getSeconds();
//           const ms   = now.getMilliseconds();
//           const h12  = h24 % 12 || 12;
//           const ampm = h24 >= 12 ? 'PM' : 'AM';

//           const timeStr = pad(h12) + ':' + pad(m) + ':' + pad(s);
//           const big     = renderTime(timeStr);

//           // Millisecond bar — 40 chars wide
//           const BAR_W   = 40;
//           const filled  = Math.round((ms / 1000) * BAR_W);
//           const bar     = '\u2588'.repeat(filled) + '\u2591'.repeat(BAR_W - filled);

//           const dateStr = DAYS[now.getDay()] + '  ' +
//             MONS[now.getMonth()] + ' ' + pad(now.getDate()) +
//             '  ' + now.getFullYear();
//           const unix    = 'Unix: ' + Math.floor(Date.now()/1000);
//           const h24str  = '24h: ' + pad(h24)+':'+pad(m)+':'+pad(s) + '  ' + ampm;
//           const width   = 44;
//           const line    = '\u2500'.repeat(width);

//           const center  = (txt) => {
//             const pad2 = Math.max(0, Math.floor((width - txt.length) / 2));
//             return ' '.repeat(pad2) + txt;
//           };

//           pre.textContent = [
//             center('\u250c' + line + '\u2510'),
//             big.split('\n').map(r => center('\u2502 ' + r.padEnd(width-2) + ' \u2502')).join('\n'),
//             center('\u2502' + ' '.repeat(width) + '\u2502'),
//             center('\u2502  [' + bar + ']  \u2502'),
//             center('\u2502' + ' '.repeat(width) + '\u2502'),
//             center('\u2502  ' + dateStr.padEnd(width-4) + '  \u2502'),
//             center('\u2502  ' + h24str.padEnd(width-4) + '  \u2502'),
//             center('\u2502  ' + unix.padEnd(width-4)    + '  \u2502'),
//             center('\u2514' + line + '\u2518'),
//           ].join('\n');

//           out.scrollTop = out.scrollHeight;
//         };

//         tick();
//         _clockInterval = setInterval(tick, 1000);
//         window.__zppClockStop = () => {
//           if (_clockInterval) { clearInterval(_clockInterval); _clockInterval = null; }
//         };
//         return null;   // no extra print — the clock IS the output
//       };
//     }
//   },

//   'net.zl': {
//     description: 'Fetch URL data: fetchText, fetchJSON, fetchCSV, fetchLines, fetchTable…',
//     inject(G) {

//       // Core sync fetch — returns raw text or throws
//       const _syncFetch = url => {
//         // ── Browser ──────────────────────────────────────────
//         if (typeof XMLHttpRequest !== 'undefined') {
//           const xhr = new XMLHttpRequest();
//           xhr.open('GET', url, false);   // false = synchronous
//           try { xhr.send(); }
//           catch (e) { throw new Error(`net: fetch failed for "${url}": ${e.message}`); }
//           if (xhr.status < 200 || xhr.status >= 300)
//             throw new Error(`net: HTTP ${xhr.status} for "${url}"`);
//           return xhr.responseText;
//         }
//         // ── Node.js ──────────────────────────────────────────
//         try {
//           const { execSync } = require('child_process');
//           // Try curl first, then wget as fallback
//           try {
//             return execSync(`curl -sL --max-time 10 "${url}"`, { timeout: 12000 }).toString();
//           } catch (_) {
//             return execSync(`wget -qO- "${url}"`, { timeout: 12000 }).toString();
//           }
//         } catch (e) {
//           throw new Error(`net: fetch failed for "${url}": ${e.message}\n  Hint: make sure curl or wget is installed.`);
//         }
//       };

//       // fetchText(url) → raw string
//       G.fetchText = url => _syncFetch(String(url));

//       // fetchLines(url) → array of strings, one per line (empty lines removed)
//       G.fetchLines = url => _syncFetch(String(url))
//         .split('\n')
//         .map(l => l.replace(/\r$/, ''))
//         .filter(l => l.length > 0);

//       // fetchJSON(url) → parsed JS object / array
//       G.fetchJSON = url => {
//         const text = _syncFetch(String(url));
//         try { return JSON.parse(text); }
//         catch (e) { throw new Error(`net: invalid JSON from "${url}": ${e.message}`); }
//       };

//       G.fetchCSV = (url, hasHeader = true) => {
//         const lines = _syncFetch(String(url))
//           .split('\n')
//           .map(l => l.replace(/\r$/, ''))
//           .filter(l => l.length > 0);

//         const parseRow = line => {
//           // Handles quoted fields with commas inside
//           const row = [];
//           let field = '', inQuote = false;
//           for (let i = 0; i < line.length; i++) {
//             const c = line[i];
//             if (c === '"') { inQuote = !inQuote; continue; }
//             if (c === ',' && !inQuote) { row.push(field.trim()); field = ''; }
//             else field += c;
//           }
//           row.push(field.trim());
//           return row;
//         };

//         if (!hasHeader) return lines.map(parseRow);

//         const headers = parseRow(lines[0]);
//         return lines.slice(1).map(line => {
//           const vals = parseRow(line);
//           const obj = {};
//           headers.forEach((h, i) => {
//             const v = vals[i] ?? '';
//             const n = Number(v);
//             obj[h] = (v !== '' && !isNaN(n)) ? n : v;
//           });
//           return obj;
//         });
//       };

//       G.fetchTable = url => {
//         const rows = G.fetchCSV(url, true);
//         if (!rows.length) return '(empty)';
//         const headers = Object.keys(rows[0]);
//         const widths  = headers.map(h =>
//           Math.max(h.length, ...rows.map(r => String(r[h] ?? '').length)));
//         const pad = (s, w) => String(s).padEnd(w);
//         const sep  = '+' + widths.map(w => '-'.repeat(w + 2)).join('+') + '+';
//         const head = '| ' + headers.map((h, i) => pad(h, widths[i])).join(' | ') + ' |';
//         const body = rows.map(r =>
//           '| ' + headers.map((h, i) => pad(r[h] ?? '', widths[i])).join(' | ') + ' |');
//         return [sep, head, sep, ...body, sep].join('\n');
//       };

//       // jsonGet(obj, path) — deep get from parsed JSON: jsonGet(data, "user.name")
//       G.jsonGet = (obj, path) => {
//         const parts = String(path).split('.');
//         let cur = obj;
//         for (const p of parts) {
//           if (cur === null || cur === undefined) return null;
//           cur = cur[p];
//         }
//         return cur ?? null;
//       };

//       // jsonKeys(obj) → array of keys at top level
//       G.jsonKeys  = obj => Object.keys(obj);

//       // jsonToArray(obj) → converts array-like JSON to DSA-Lang array
//       G.jsonToArray = obj => Array.isArray(obj) ? obj : Object.values(obj);
//     }
//   },

//   'convert.zl': {
//     description: 'Unit conversions: temperature, distance, weight, speed, data size…',
//     inject(G) {
//       // Temperature
//       G.cToF      = c => c * 9/5 + 32;
//       G.fToC      = f => (f - 32) * 5/9;
//       G.cToK      = c => c + 273.15;
//       G.kToC      = k => k - 273.15;

//       // Distance
//       G.kmToMiles  = km => km * 0.621371;
//       G.milesToKm  = m  => m  * 1.60934;
//       G.mToFt      = m  => m  * 3.28084;
//       G.ftToM      = f  => f  * 0.3048;
//       G.mToInches  = m  => m  * 39.3701;
//       G.cmToInches = c  => c  * 0.393701;
//       G.inchesToCm = i  => i  * 2.54;

//       // Weight
//       G.kgToLbs   = kg => kg * 2.20462;
//       G.lbsToKg   = lb => lb * 0.453592;
//       G.gToOz     = g  => g  * 0.035274;
//       G.ozToG     = oz => oz * 28.3495;

//       // Speed
//       G.kmhToMph  = k => k * 0.621371;
//       G.mphToKmh  = m => m * 1.60934;
//       G.msToKmh   = m => m * 3.6;
//       G.kmhToMs   = k => k / 3.6;

//       // Data size (base-1024)
//       G.bytesToKB = b  => b  / 1024;
//       G.bytesToMB = b  => b  / (1024 ** 2);
//       G.bytesToGB = b  => b  / (1024 ** 3);
//       G.kbToBytes = kb => kb * 1024;
//       G.mbToBytes = mb => mb * (1024 ** 2);
//       G.gbToBytes = gb => gb * (1024 ** 3);

//       G.formatBytes = b => {
//         if (b >= 1024**3) return (b/1024**3).toFixed(2) + ' GB';
//         if (b >= 1024**2) return (b/1024**2).toFixed(2) + ' MB';
//         if (b >= 1024)    return (b/1024).toFixed(2) + ' KB';
//         return b + ' B';
//       };
//     }
//   },

//   'random.zl': {
//     description: 'Random: uuid, shuffle, pick, coin, dice, gaussianRandom, seed…',
//     inject(G) {

//       let _seed = Date.now();
//       G.setSeed = s => { _seed = s >>> 0; };
//       const _seeded = () => {
//         _seed |= 0; _seed = _seed + 0x6D2B79F5 | 0;
//         let t = Math.imul(_seed ^ _seed >>> 15, 1 | _seed);
//         t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
//         return ((t ^ t >>> 14) >>> 0) / 4294967296;
//       };

//       G.randSeed  = ()       => _seeded();
//       G.randInt   = (a, b)   => Math.floor(Math.random() * (b - a + 1)) + a;
//       G.randFloat = (a, b)   => Math.random() * (b - a) + a;
//       G.randBool  = ()       => Math.random() < 0.5;
//       G.coinFlip  = ()       => Math.random() < 0.5 ? 'heads' : 'tails';
//       G.dice      = sides    => Math.floor(Math.random() * (sides || 6)) + 1;

//       G.pick      = arr      => arr[Math.floor(Math.random() * arr.length)];

//       G.shuffle   = arr => {
//         arr = [...arr];
//         for (let i = arr.length - 1; i > 0; i--) {
//           const j = Math.floor(Math.random() * (i + 1));
//           [arr[i], arr[j]] = [arr[j], arr[i]];
//         }
//         return arr;
//       };
//       G.sample = (arr, k) => G.shuffle(arr).slice(0, k);

      
//       G.gaussianRandom = (mean = 0, std = 1) => {
//         let u = 0, v = 0;
//         while (u === 0) u = Math.random();
//         while (v === 0) v = Math.random();
//         return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
//       };

//       // UUID v4
//       G.uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
//         const r = Math.random() * 16 | 0;
//         return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
//       });
//     }
//   },

  
//   'str.zl': {
//     description: 'Extended strings: count, wrap, truncate, titleCase, camelCase, template…',
//     inject(G) {
//       G.countOccurrences = (s, sub) => {
//         let count = 0, pos = 0;
//         while ((pos = s.indexOf(sub, pos)) !== -1) { count++; pos += sub.length; }
//         return count;
//       };

//       G.isPalindrome = s => {
//         const clean = s.toLowerCase().replace(/[^a-z0-9]/g, '');
//         return clean === clean.split('').reverse().join('');
//       };

//       G.titleCase  = s => s.replace(/\w\S*/g, t => t[0].toUpperCase() + t.slice(1).toLowerCase());
//       G.camelCase  = s => s.replace(/[-_\s]+(.)/g, (_, c) => c.toUpperCase()).replace(/^./, c => c.toLowerCase());
//       G.snakeCase  = s => s.replace(/\s+/g, '_').replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
//       G.capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

//       G.truncate   = (s, n, suffix = '…') =>
//         s.length > n ? s.slice(0, n - suffix.length) + suffix : s;

//       G.wordWrap   = (s, width) => {
//         const words = s.split(' ');
//         const lines = []; let line = '';
//         words.forEach(w => {
//           if ((line + ' ' + w).trim().length <= width) {
//             line = (line + ' ' + w).trim();
//           } else { if (line) lines.push(line); line = w; }
//         });
//         if (line) lines.push(line);
//         return lines.join('\n');
//       };

//       G.countWords  = s => s.trim().split(/\s+/).filter(w => w).length;
//       G.countLines  = s => s.split('\n').length;
//       G.reverseStr  = s => s.split('').reverse().join('');
//       G.reverseWords= s => s.split(' ').reverse().join(' ');

//       G.isNumStr    = s => s.trim() !== '' && !isNaN(Number(s.trim()));
//       G.isEmailStr  = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
//       G.isURLStr    = s => { try { new URL(s); return true; } catch { return false; } };

//       G.lpad        = (s, n, c = ' ') => String(s).padStart(n, c);
//       G.rpad        = (s, n, c = ' ') => String(s).padEnd(n, c);
//       G.center      = (s, n, c = ' ') => {
//         s = String(s);
//         const total = n - s.length;
//         if (total <= 0) return s;
//         const left = Math.floor(total / 2);
//         return c.repeat(left) + s + c.repeat(total - left);
//       };

//       G.escapeHtml  = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;')
//                             .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
//       G.stripHtml   = s => s.replace(/<[^>]*>/g, '');
//       G.countChar   = (s, c) => [...s].filter(ch => ch === c).length;

//       // Simple string template: template("Hello {name}!", {name: "Alice"})
//       G.template = (s, vars) => {
//         return s.replace(/\{([^}]+)\}/g, (_, key) =>
//           vars[key] !== undefined ? String(vars[key]) : `{${key}}`);
//       };
//     }
//   },

//   'algo.zl': {
//     description: 'Data structures: stack, queue, linkedList, priorityQueue, graph helpers…',
//     inject(G) {

//       // ── Stack ────────────────────────────────────────────
//       G.makeStack = () => ({
//         data: [], size: 0,
//         push:  function(v) { this.data.push(v); this.size++; },
//         pop:   function()  { if (!this.size) throw new Error('Stack underflow'); this.size--; return this.data.pop(); },
//         peek:  function()  { return this.data[this.size - 1]; },
//         isEmpty: function(){ return this.size === 0; },
//         toArray: function(){ return [...this.data]; }
//       });

//       // ── Queue ────────────────────────────────────────────
//       G.makeQueue = () => ({
//         data: [], head: 0,
//         enqueue: function(v) { this.data.push(v); },
//         dequeue: function()  {
//           if (this.head >= this.data.length) throw new Error('Queue empty');
//           return this.data[this.head++];
//         },
//         peek:    function()  { return this.data[this.head]; },
//         isEmpty: function()  { return this.head >= this.data.length; },
//         size:    function()  { return this.data.length - this.head; },
//         toArray: function()  { return this.data.slice(this.head); }
//       });

//       // ── Min Priority Queue ───────────────────────────────
//       G.makeMinPQ = () => ({
//         heap: [],
//         push: function(val, priority) {
//           this.heap.push({ val, priority });
//           let i = this.heap.length - 1;
//           while (i > 0) {
//             const p = (i - 1) >> 1;
//             if (this.heap[p].priority <= this.heap[i].priority) break;
//             [this.heap[p], this.heap[i]] = [this.heap[i], this.heap[p]]; i = p;
//           }
//         },
//         pop: function() {
//           if (!this.heap.length) throw new Error('PriorityQueue empty');
//           const top = this.heap[0];
//           const last = this.heap.pop();
//           if (this.heap.length) {
//             this.heap[0] = last;
//             let i = 0;
//             while (true) {
//               let s = i, l = 2*i+1, r = 2*i+2;
//               if (l < this.heap.length && this.heap[l].priority < this.heap[s].priority) s = l;
//               if (r < this.heap.length && this.heap[r].priority < this.heap[s].priority) s = r;
//               if (s === i) break;
//               [this.heap[i], this.heap[s]] = [this.heap[s], this.heap[i]]; i = s;
//             }
//           }
//           return top.val;
//         },
//         peek:    function() { return this.heap[0]?.val; },
//         isEmpty: function() { return this.heap.length === 0; },
//         size:    function() { return this.heap.length; }
//       });

//       // ── Linked list node helper ──────────────────────────
//       G.makeNode     = val => ({ val, next: null });
//       G.makeLinkedList = () => ({
//         head: null, size: 0,
//         push: function(val) {
//           const n = G.makeNode(val);
//           if (!this.head) { this.head = n; }
//           else { let c = this.head; while (c.next) c = c.next; c.next = n; }
//           this.size++;
//         },
//         pop: function() {
//           if (!this.head) throw new Error('List empty');
//           if (!this.head.next) { const v = this.head.val; this.head = null; this.size--; return v; }
//           let c = this.head;
//           while (c.next.next) c = c.next;
//           const v = c.next.val; c.next = null; this.size--; return v;
//         },
//         toArray: function() {
//           const arr = []; let c = this.head;
//           while (c) { arr.push(c.val); c = c.next; }
//           return arr;
//         }
//       });

//       // ── Graph helpers (adjacency list) ───────────────────
//       G.makeGraph = (directed = false) => ({
//         adj: {},
//         addNode: function(n) { if (!this.adj[n]) this.adj[n] = []; },
//         addEdge: function(a, b, w = 1) {
//           this.addNode(a); this.addNode(b);
//           this.adj[a].push({ to: b, w });
//           if (!directed) this.adj[b].push({ to: a, w });
//         },
//         neighbors: function(n) { return (this.adj[n] || []).map(e => e.to); },
//         bfs: function(start) {
//           const visited = {}, order = [];
//           const q = [start]; visited[start] = true;
//           while (q.length) {
//             const n = q.shift(); order.push(n);
//             for (const e of (this.adj[n] || []))
//               if (!visited[e.to]) { visited[e.to] = true; q.push(e.to); }
//           }
//           return order;
//         },
//         dfs: function(start) {
//           const visited = {}, order = [];
//           const go = n => {
//             visited[n] = true; order.push(n);
//             for (const e of (this.adj[n] || []))
//               if (!visited[e.to]) go(e.to);
//           };
//           go(start); return order;
//         },
//         dijkstra: function(start) {
//           const dist = {}, pq = G.makeMinPQ();
//           Object.keys(this.adj).forEach(n => dist[n] = Infinity);
//           dist[start] = 0; pq.push(start, 0);
//           while (!pq.isEmpty()) {
//             const u = pq.pop();
//             for (const e of (this.adj[u] || [])) {
//               const nd = dist[u] + e.w;
//               if (nd < dist[e.to]) { dist[e.to] = nd; pq.push(e.to, nd); }
//             }
//           }
//           return dist;
//         }
//       });
//     }
//   }

// };

// if (typeof module !== 'undefined') module.exports = { DSALibraries };





















// ============================================================
//  ZETA++ Interpreter  —  v7.0
//
//  New in v7:
//    Line numbers in all error messages
//    export func name(...) { }         — define and export a func
//    export { name1, name2 };          — export existing names
//    #import["file.zpp":ns];           — namespaced import
//      → use as  ns.funcName(args)
//
//  New in v6 (unique ZETA++ syntax):
//    for each item in arr { }       — foreach loop
//    when cond then a else b        — ternary expression
//    attempt { } rescue e { }       — try / catch
//    raise expr                     — throw
//    match val { on x => { } }      — switch / pattern match
//    repeat { } until cond;         — do-while
//    fn(x) => expr                  — inline lambda
//    fn(x) { body }                 — block lambda
//    func f(x = default) { }        — default parameters
//    func f(...nums) { }            — variadic parameters
//    fn method() { } in struct      — struct methods (self bound)
//    x is num / x is MyStruct       — type-check operator
//    val in arr / "k" in obj        — membership operator
//    & | ^ ~ << >>                  — bitwise operators
//    hero.hp -= 10 / hero.hp++      — compound assign on fields
//    arr[i] += 5  / arr[i]++        — compound assign on indices
//    let [a, b] = arr;              — array destructuring
//    let {x, y} = obj;              — object/struct destructuring
//    arr.map(fn) .filter .reduce    — functional array methods
//    enum Color { RED GREEN BLUE }  — enumerations
//
//  All v5 / v4 features still present.
// ============================================================

'use strict';

const _fs   = (() => { try { return require('fs');   } catch { return null; } })();
const _proc = (typeof process !== 'undefined') ? process : null;

function _readLineNode(prompt) {
  if (_proc && _proc.stdout && prompt) _proc.stdout.write(prompt);
  if (!_fs) return '';
  const buf = Buffer.alloc(1);
  let out = ''; let fd = 0; let openedTty = false;
  try { fd = _fs.openSync('/dev/tty', 'r'); openedTty = true; } catch (_) {}
  try {
    while (true) {
      const n = _fs.readSync(fd, buf, 0, 1);
      if (n === 0) break;
      const c = buf.toString('utf8', 0, 1);
      if (c === '\n') break;
      if (c !== '\r') out += c;
    }
  } catch (e) { if (_proc) _proc.stderr.write('input() error: ' + e.message + '\n'); }
  if (openedTty) try { _fs.closeSync(fd); } catch (_) {}
  return out;
}

// ── Control-flow signals ─────────────────────────────────────
class ReturnSignal   { constructor(v) { this.value = v; } }
class BreakSignal    {}
class ContinueSignal {}
class ThrowSignal    { constructor(v) { this.value = v; } }

// ── Struct instance marker ────────────────────────────────────
class StructInstance {
  constructor(typeName, fields) {
    this.__type__ = typeName;
    Object.assign(this, fields);
  }
}

// ── Default file loader ───────────────────────────────────────
function _defaultFileLoader(filename) {
  if (typeof require !== 'undefined') {
    const fs = require('fs'), path = require('path');
    const runFile = process.argv[2] || '';
    const runDir  = runFile ? path.dirname(path.resolve(runFile)) : process.cwd();
    const candidates = [
      path.resolve(runDir, filename),
      path.resolve(process.cwd(), filename),
      path.resolve(path.dirname(process.argv[1] || '.'), filename)
    ];
    for (const p of candidates) if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
    throw new Error(`#import: file "${filename}" not found`);
  }
  throw new Error(`#import: no file loader for "${filename}"`);
}

// ============================================================
//  Interpreter
// ============================================================
class Interpreter {
  constructor(opts = {}) {
    this.outputs     = [];
    this._sink       = opts.sink || null;
    this.structs     = Object.create(null);
    this._inputFn    = opts.inputFn || null;
    this._fileLoader = opts.fileLoader || _defaultFileLoader;
    this.globalScope = this._buildGlobals();
  }

  interpret(code) {
    this.outputs          = [];
    this.structs          = Object.create(null);
    this.__exports__      = new Set();   // names marked for export
    this._pendingNS       = {};          // namespaced imports collected in _preprocess
    this._currentLine     = 1;           // tracks current execution line for error reporting
    code = this._preprocess(code);
    // Inject namespace objects gathered during preprocessing
    for (const [nsName, nsObj] of Object.entries(this._pendingNS)) {
      this.globalScope[nsName] = nsObj;
    }
    const tokens = this.tokenize(code);
    const ast    = this.parse(tokens);
    try {
      this._execBlock(ast.body, this.globalScope);
    } catch (e) {
      // Enrich non-signal errors with line info
      if (!(e instanceof ReturnSignal) && !(e instanceof ThrowSignal) &&
          !(e instanceof BreakSignal)  && !(e instanceof ContinueSignal)) {
        if (!/^Line \d+:/.test(e.message))
          e.message = `Line ${this._currentLine}: ${e.message}`;
      }
      throw e;
    }
    return this.outputs;
  }

  _preprocess(code) {
    // ── Namespaced import: #import["file.zpp":nsName]; ────────────
    // Runs the file in a sub-interpreter, collects its exports, and
    // makes them available as  nsName.funcName(...)  in this file.
    const nsImportRe = /^[ \t]*#import\[["']([^"']+)["']\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*)\];?[ \t]*(\r?\n|$)/gm;
    code = code.replace(nsImportRe, (_, filename, nsName) => {
      const ext = filename.split('.').pop().toLowerCase();
      if (ext !== 'zpp')
        throw new Error(`#import with namespace alias only supports .zpp files (got ".${ext}")`);
      const src = this._fileLoader(filename);
      const subInterp = new Interpreter({ fileLoader: this._fileLoader });
      subInterp.interpret(src);
      const nsObj = Object.create(null);
      for (const name of subInterp.__exports__)
        nsObj[name] = subInterp.globalScope[name];
      if (!this._pendingNS) this._pendingNS = {};
      this._pendingNS[nsName] = nsObj;
      return '';
    });

    // ── Plain import: #import["file.zpp"]; or #import["lib.zl"]; ──
    const importRe = /^[ \t]*#import\[["']([^"']+)["']\];?[ \t]*(\r?\n|$)/gm;
    let inlined = '';
    const processed = code.replace(importRe, (_, filename) => {
      const ext = filename.split('.').pop().toLowerCase();
      if (ext === 'zl') {
        if (typeof DSALibraries !== 'undefined' && DSALibraries[filename])
          DSALibraries[filename].inject(this.globalScope);
        else throw new Error(`#import: library "${filename}" not found`);
        return '';
      } else if (ext === 'zpp') {
        const src = this._fileLoader(filename);
        inlined += this._preprocess(src) + '\n';
        return '';
      }
      throw new Error(`#import: unknown type ".${ext}"`);
    });
    return inlined + processed;
  }

  _print(line) {
    const s = String(line);
    this.outputs.push(s);
    if (this._sink) this._sink.write(s + '\n');
  }

  // ----------------------------------------------------------
  //  Built-in globals
  // ----------------------------------------------------------
  _buildGlobals() {
    const G = Object.create(null);

    G.print = (...args) => this._print(args.map(a => this._str(a)).join(' '));

    G.input = (prompt) => {
      const raw = this._inputFn
        ? this._inputFn(prompt || '')
        : _readLineNode(prompt || '');
      const trimmed = raw.trim();
      const n = Number(trimmed);
      return (trimmed !== '' && !isNaN(n)) ? n : raw;
    };

    G.toNum  = x => Number(x);
    G.toStr  = x => String(x);
    G.toBool = x => Boolean(x);

    G.isNum    = x => typeof x === 'number';
    G.isStr    = x => typeof x === 'string';
    G.isBool   = x => typeof x === 'boolean';
    G.isArr    = x => Array.isArray(x);
    G.isNull   = x => x === null || x === undefined;
    G.isStruct = x => x instanceof StructInstance;
    G.typeOf   = x => {
      if (x instanceof StructInstance) return x.__type__;
      if (Array.isArray(x))            return 'array';
      return typeof x;
    };

    G.abs    = x      => Math.abs(x);
    G.ceil   = x      => Math.ceil(x);
    G.floor  = x      => Math.floor(x);
    G.round  = x      => Math.round(x);
    G.sqrt   = x      => Math.sqrt(x);
    G.pow    = (x, y) => Math.pow(x, y);
    G.log    = x      => Math.log(x);
    G.log2   = x      => Math.log2(x);
    G.log10  = x      => Math.log10(x);
    G.sin    = x      => Math.sin(x);
    G.cos    = x      => Math.cos(x);
    G.tan    = x      => Math.tan(x);
    G.asin   = x      => Math.asin(x);
    G.acos   = x      => Math.acos(x);
    G.atan   = x      => Math.atan(x);
    G.atan2  = (y, x) => Math.atan2(y, x);
    G.hypot  = (x, y) => Math.hypot(x, y);
    G.PI     = Math.PI;
    G.E      = Math.E;
    G.INF    = Infinity;
    G.max    = (...a) => Math.max(...(a.length===1&&Array.isArray(a[0])?a[0]:a));
    G.min    = (...a) => Math.min(...(a.length===1&&Array.isArray(a[0])?a[0]:a));
    G.random    = ()     => Math.random();
    G.randomInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

    G.calculate = expr => {
      const safe = String(expr).replace(/[^0-9+\-*/.() %]/g, '');
      try   { return Function('"use strict";return(' + safe + ')')(); }
      catch (_) { throw new Error(`calculate: invalid expression "${expr}"`); }
    };

    // Strings
    G.len        = x         => x.length;
    G.upper      = s         => s.toUpperCase();
    G.lower      = s         => s.toLowerCase();
    G.trim       = s         => s.trim();
    G.split      = (s, d)    => s.split(d ?? '');
    G.join       = (a, d)    => a.join(d ?? ',');
    G.slice      = (x, a, b) => x.slice(a, b);
    G.substr     = (s, a, b) => s.substring(a, b);
    G.indexOf    = (x, v)    => x.indexOf(v);
    G.includes   = (x, v)    => x.includes(v);
    G.replace    = (s, a, b) => s.replace(a, b);
    G.startsWith = (s, p)    => s.startsWith(p);
    G.endsWith   = (s, p)    => s.endsWith(p);
    G.repeat     = (s, n)    => s.repeat(n);
    G.padLeft    = (s, n, c) => s.padStart(n, c ?? ' ');
    G.padRight   = (s, n, c) => s.padEnd(n, c ?? ' ');
    G.charCode   = (s, i)    => s.charCodeAt(i ?? 0);
    G.fromChar   = n         => String.fromCharCode(n);
    G.format     = (s, ...a) => s.replace(/{(\d+)}/g, (_, i) => a[i] ?? '');

    // Arrays
    G.range = (a, b, step = 1) => {
      const arr = [];
      if (step > 0) for (let i = a; i <= b; i += step) arr.push(i);
      else          for (let i = a; i >= b; i += step) arr.push(i);
      return arr;
    };
    G.fill    = (n, v)              => Array(n).fill(v);
    G.sum     = a                   => a.reduce((s, x) => s + x, 0);
    G.avg     = a                   => a.reduce((s, x) => s + x, 0) / a.length;
    G.unique  = a                   => [...new Set(a)];
    G.copy    = a                   => [...a];
    G.flat    = (a, d = 1)          => a.flat(d);
    G.concat  = (a, b)              => a.concat(b);
    G.push    = (a, ...v)           => { a.push(...v); return a; };
    G.pop     = a                   => a.pop();
    G.shift   = a                   => a.shift();
    G.unshift = (a, v)              => { a.unshift(v); return a; };
    G.splice  = (a, i, d, ...items) => { a.splice(i, d, ...items); return a; };
    G.reverse = a                   => [...a].reverse();
    G.keys    = o                   => Object.keys(o);
    G.values  = o                   => Object.values(o);
    G.has     = (o, k)              => k in Object(o);

    // JSON
    G.toJSON   = x => JSON.stringify(x instanceof StructInstance
      ? Object.fromEntries(Object.entries(x).filter(([k])=>k!=='__type__'))
      : x);
    G.fromJSON = s => JSON.parse(s);

    // Sorts
    G.sort         = a => [...a].sort((x, y) => x - y);
    G.sortDesc     = a => [...a].sort((x, y) => y - x);
    G.sortStr      = a => [...a].sort();
    G.bubbleSort   = arr => { arr=[...arr]; const n=arr.length; for(let i=0;i<n-1;i++) for(let j=0;j<n-i-1;j++) if(arr[j]>arr[j+1]){const t=arr[j];arr[j]=arr[j+1];arr[j+1]=t;} return arr; };
    G.selectionSort= arr => { arr=[...arr]; const n=arr.length; for(let i=0;i<n-1;i++){let m=i; for(let j=i+1;j<n;j++) if(arr[j]<arr[m])m=j; const t=arr[i];arr[i]=arr[m];arr[m]=t;} return arr; };
    G.insertionSort= arr => { arr=[...arr]; for(let i=1;i<arr.length;i++){const k=arr[i];let j=i-1; while(j>=0&&arr[j]>k){arr[j+1]=arr[j];j--;} arr[j+1]=k;} return arr; };
    G.mergeSort    = function ms(arr) { if(arr.length<=1)return arr; const m=arr.length>>1; const L=ms(arr.slice(0,m)),R=ms(arr.slice(m)); const res=[];let i=0,j=0; while(i<L.length&&j<R.length)res.push(L[i]<=R[j]?L[i++]:R[j++]); return res.concat(L.slice(i)).concat(R.slice(j)); };
    G.quickSort    = function qs(arr) { if(arr.length<=1)return arr; const p=arr[arr.length>>1]; return [...qs(arr.filter(x=>x<p)),...arr.filter(x=>x===p),...qs(arr.filter(x=>x>p))]; };
    G.heapSort     = arr => { arr=[...arr]; const n=arr.length; const h=(sz,i)=>{let lg=i,l=2*i+1,r=2*i+2; if(l<sz&&arr[l]>arr[lg])lg=l; if(r<sz&&arr[r]>arr[lg])lg=r; if(lg!==i){const t=arr[i];arr[i]=arr[lg];arr[lg]=t;h(sz,lg);}}; for(let i=Math.floor(n/2)-1;i>=0;i--)h(n,i); for(let i=n-1;i>0;i--){const t=arr[0];arr[0]=arr[i];arr[i]=t;h(i,0);} return arr; };
    G.countingSort = arr => { if(!arr.length)return[]; const mn=Math.min(...arr),mx=Math.max(...arr); const cnt=Array(mx-mn+1).fill(0); arr.forEach(x=>cnt[x-mn]++); const res=[]; cnt.forEach((c,i)=>{for(let j=0;j<c;j++)res.push(i+mn);}); return res; };

    // Search
    G.linearSearch = (arr, t) => { for(let i=0;i<arr.length;i++) if(arr[i]===t) return i; return -1; };
    G.binarySearch = (arr, t) => { let lo=0,hi=arr.length-1; while(lo<=hi){const m=(lo+hi)>>1; if(arr[m]===t)return m; arr[m]<t?lo=m+1:hi=m-1;} return -1; };
    G.search = G.linearSearch;

    return G;
  }

  // ----------------------------------------------------------
  //  Tokenizer
  // ----------------------------------------------------------
  tokenize(code) {
    const tokens = [];
    let i = 0;
    let line = 1;   // ── line counter ─────────────────────────────

    const KEYWORDS = new Set([
      'let', 'set', 'str', 'num', 'bool', 'array', 'view',
      'if', 'else', 'for', 'each', 'while',
      'func', 'fn', 'return', 'in', 'to', 'step',
      'break', 'continue', 'struct', 'enum',
      'when', 'then',
      'attempt', 'rescue', 'raise',
      'match', 'on',
      'repeat', 'until',
      'is',
      'export'   // ── new keyword ──────────────────────────────────
    ]);

    while (i < code.length) {
      const ch = code[i];

      if (/\s/.test(ch)) { if (ch === '\n') line++; i++; continue; }

      // Single-line comment
      if (ch === '/' && code[i+1] === '/') {
        while (i < code.length && code[i] !== '\n') i++;
        continue;
      }
      // Block comment
      if (ch === '/' && code[i+1] === '*') {
        i += 2;
        while (i < code.length-1 && !(code[i]==='*'&&code[i+1]==='/')) {
          if (code[i] === '\n') line++;
          i++;
        }
        i += 2;
        continue;
      }

      // Identifiers / keywords
      if (/[a-zA-Z_]/.test(ch)) {
        let word = '';
        while (i < code.length && /[a-zA-Z0-9_]/.test(code[i])) word += code[i++];
        if      (word === 'true')  tokens.push({ type: 'boolean', value: true,  line });
        else if (word === 'false') tokens.push({ type: 'boolean', value: false, line });
        else if (word === 'null')  tokens.push({ type: 'null',    value: null,  line });
        else if (KEYWORDS.has(word)) tokens.push({ type: word, line });
        else tokens.push({ type: 'identifier', value: word, line });
        continue;
      }

      // Numbers
      if (/[0-9]/.test(ch)) {
        if (ch === '0' && (code[i+1]==='x'||code[i+1]==='X')) {
          let num = code[i++] + code[i++];
          while (i < code.length && /[0-9a-fA-F]/.test(code[i])) num += code[i++];
          tokens.push({ type: 'number', value: parseInt(num, 16), line });
        } else {
          let num = '';
          while (i < code.length && /[0-9.]/.test(code[i])) num += code[i++];
          tokens.push({ type: 'number', value: parseFloat(num), line });
        }
        continue;
      }

      // Strings
      if (ch === '"' || ch === "'") {
        const quote = ch; i++;
        let str = '';
        while (i < code.length && code[i] !== quote) {
          if (code[i] === '\\') {
            i++;
            const ESC = { n:'\n', t:'\t', r:'\r', '\\':'\\', '"':'"', "'":"'" };
            str += (code[i] in ESC) ? ESC[code[i]] : code[i];
          } else { str += code[i]; }
          i++;
        }
        i++;
        tokens.push({ type: 'string', value: str, line });
        continue;
      }

      // Backtick multi-line strings
      if (ch === '`') {
        i++;
        let str = '';
        while (i < code.length && code[i] !== '`') {
          if (code[i] === '\n') line++;
          if (code[i] === '\\') {
            i++;
            const ESC = { n:'\n', t:'\t', r:'\r', '\\':'\\', '`':'`' };
            str += (code[i] in ESC) ? ESC[code[i]] : code[i];
          } else { str += code[i]; }
          i++;
        }
        i++;
        tokens.push({ type: 'string', value: str, line });
        continue;
      }

      // '=' vs '==' vs '=>'
      if (ch === '=') {
        if (code[i+1]==='=')      { tokens.push({ type: 'operator', value: '==', line }); i+=2; }
        else if (code[i+1]==='>') { tokens.push({ type: '=>', line });                     i+=2; }
        else                       { tokens.push({ type: '=', line });                      i++;  }
        continue;
      }

      // '...' spread/variadic
      if (ch === '.' && code[i+1] === '.' && code[i+2] === '.') {
        tokens.push({ type: '...', line });
        i += 3;
        continue;
      }

      // Multi-char operators (including bitwise)
      if ('+-*/%><!&|^~'.includes(ch)) {
        let op = ch; i++;
        const nx = code[i] ?? '';
        if      (ch==='!'&&nx==='='){op='!='; i++;}
        else if (ch==='>'&&nx==='='){op='>='; i++;}
        else if (ch==='<'&&nx==='='){op='<='; i++;}
        else if (ch==='&'&&nx==='&'){op='&&'; i++;}
        else if (ch==='|'&&nx==='|'){op='||'; i++;}
        else if (ch==='+'&&nx==='+'){op='++'; i++;}
        else if (ch==='-'&&nx==='-'){op='--'; i++;}
        else if (ch==='+'&&nx==='='){op='+='; i++;}
        else if (ch==='-'&&nx==='='){op='-='; i++;}
        else if (ch==='*'&&nx==='='){op='*='; i++;}
        else if (ch==='/'&&nx==='='){op='/='; i++;}
        else if (ch==='%'&&nx==='='){op='%='; i++;}
        else if (ch==='&'&&nx==='='){op='&='; i++;}
        else if (ch==='|'&&nx==='='){op='|='; i++;}
        else if (ch==='^'&&nx==='='){op='^='; i++;}
        else if (ch==='<'&&nx==='<'){op='<<'; i++;}
        else if (ch==='>'&&nx==='>'){op='>>'; i++;}
        // single char bitwise: &, |, ^, ~  (already in op)
        tokens.push({ type: 'operator', value: op, line });
        continue;
      }

      // Single-char symbols
      if ('[]{}(),;:.?'.includes(ch)) { tokens.push({ type: ch, line }); i++; continue; }

      throw new Error(`Line ${line}: Unexpected character '${ch}'`);
    }
    return tokens;
  }

  // ----------------------------------------------------------
  //  Parser
  // ----------------------------------------------------------
  parse(tokens) {
    this.tokens       = tokens;
    this.pos          = 0;
    this._structNames = new Set();
    const body = [];
    while (this.pos < this.tokens.length) body.push(this._parseStatement());
    return { type: 'program', body };
  }

  _peek(offset = 0) { return this.tokens[this.pos + offset] || { type: 'EOF' }; }

  _consume(type) {
    const tok = this.tokens[this.pos++];
    const lineInfo = tok ? `Line ${tok.line}: ` : `Line ${this._lastLine || '?'}: `;
    if (!tok) throw new Error(`${lineInfo}Expected '${type}' but reached end of input`);
    if (tok.line) this._lastLine = tok.line;
    if (tok.type !== type && tok.value !== type)
      throw new Error(`${lineInfo}Expected '${type}' but got '${tok.type}'` +
        (tok.value !== undefined ? ` ('${tok.value}')` : ''));
    return tok;
  }

  _parseBlock() {
    const stmts = [];
    while (this._peek().type !== '}' && this._peek().type !== 'EOF')
      stmts.push(this._parseStatement());
    return stmts;
  }

  // ----------------------------------------------------------
  //  Statement dispatch
  // ----------------------------------------------------------
  _parseStatement() {
    const t    = this._peek();
    const line = t.line;

    if (['let','set','str','num','bool','array','view'].includes(t.type)) return Object.assign(this._parseDecl(),          { line });
    if (t.type === 'struct')   return Object.assign(this._parseStructDef(), { line });
    if (t.type === 'enum')     return Object.assign(this._parseEnum(),      { line });
    if (t.type === 'if')       return Object.assign(this._parseIf(),        { line });
    if (t.type === 'for')      return Object.assign(this._parseFor(),       { line });
    if (t.type === 'while')    return Object.assign(this._parseWhile(),     { line });
    if (t.type === 'repeat')   return Object.assign(this._parseRepeat(),    { line });
    if (t.type === 'func')     return Object.assign(this._parseFunc(),      { line });
    if (t.type === 'export')   return Object.assign(this._parseExport(),    { line });
    if (t.type === 'return')   return Object.assign(this._parseReturn(),    { line });
    if (t.type === 'raise')    return Object.assign(this._parseRaise(),     { line });
    if (t.type === 'attempt')  return Object.assign(this._parseAttempt(),   { line });
    if (t.type === 'match')    return Object.assign(this._parseMatch(),     { line });
    if (t.type === 'break')    { this.pos++; this._consume(';'); return { type: 'break',    line }; }
    if (t.type === 'continue') { this.pos++; this._consume(';'); return { type: 'continue', line }; }

    // StructName var;  /  StructName arr[n];
    if (t.type === 'identifier' && this._structNames.has(t.value)) {
      const t2 = this._peek(1);
      if (t2.type === 'identifier') return Object.assign(this._parseStructVarDecl(), { line });
    }

    if (t.type === 'identifier') return Object.assign(this._parseExprStmt(), { line });

    throw new Error(`Line ${line || '?'}: Unexpected token: '${t.type}'` +
      (t.value !== undefined ? ` ('${t.value}')` : ''));
  }

  // ----------------------------------------------------------
  //  Declarations
  // ----------------------------------------------------------
  _parseDecl() {
    const keyword = this.tokens[this.pos++].type;
    const DECL_DEFAULTS = { num:0, str:'', bool:false, let:null, set:null, array:[], view:null };

    if (keyword === 'set' && this._peek().type !== 'identifier')
      throw new Error("'set' requires an identifier");

    // ── Destructuring: let [a,b] = arr;  let {x,y} = obj; ───
    if (keyword === 'let') {
      if (this._peek().type === '[') {
        // Array destructuring
        this._consume('[');
        const names = [];
        while (this._peek().type !== ']') {
          names.push(this._consume('identifier').value);
          if (this._peek().type === ',') this._consume(',');
        }
        this._consume(']');
        this._consume('=');
        const src = this._parseExpression();
        this._consume(';');
        return { type: 'destructure_arr', names, src };
      }
      if (this._peek().type === '{') {
        // Object/struct destructuring
        this._consume('{');
        const names = [];
        while (this._peek().type !== '}') {
          names.push(this._consume('identifier').value);
          if (this._peek().type === ',') this._consume(',');
        }
        this._consume('}');
        this._consume('=');
        const src = this._parseExpression();
        this._consume(';');
        return { type: 'destructure_obj', names, src };
      }
    }

    const parseOne = (kw) => {
      const id = this._consume('identifier').value;
      if (this._peek().type === ';' || this._peek().type === ',') {
        if (kw === 'set') throw new Error(`'set' constant '${id}' must have a value`);
        return { type: 'decl', keyword: kw, id, value: null, defaultVal: DECL_DEFAULTS[kw] };
      }
      this._consume('=');
      if (kw === 'array' && this._peek().type === '[') {
        const t1 = this.tokens[this.pos+1], t2 = this.tokens[this.pos+2];
        if (t1 && t2 && t2.type==='=' && (t1.value==='type'||t1.type==='num')) {
          const init = this._parseArrayInit();
          return { type: 'decl', keyword: kw, id, value: init, defaultVal: undefined };
        }
      }
      const value = this._parseExpression();
      return { type: 'decl', keyword: kw, id, value, defaultVal: undefined };
    };

    const decls = [parseOne(keyword)];
    while (this._peek().type === ',') {
      this._consume(',');
      decls.push(parseOne(keyword));
    }
    this._consume(';');
    if (decls.length === 1) return decls[0];
    return { type: 'multi_decl', decls };
  }

  _parseArrayInit() {
    this._consume('[');
    let elemType = null, countExpr = null;
    while (this._peek().type !== ']') {
      const kt = this._peek();
      if (kt.type !== 'identifier' && kt.type !== 'num')
        throw new Error(`Expected key in array init`);
      const key = kt.type === 'num' ? (this.pos++, 'num') : this._consume('identifier').value;
      this._consume('=');
      if (key === 'type')     { elemType  = this._consume('string').value; }
      else if (key === 'num') { countExpr = this._parseExpression(); }
      else throw new Error(`Unknown array init key '${key}'`);
      if (this._peek().type === ',') this._consume(',');
    }
    this._consume(']');
    if (!elemType)  throw new Error('array init missing type=');
    if (!countExpr) throw new Error('array init missing num=');
    return { type: 'array_init', elemType, countExpr };
  }

  // ----------------------------------------------------------
  //  struct definition — now supports fn methods
  // ----------------------------------------------------------
  _parseStructDef() {
    this._consume('struct');
    const name = this._consume('identifier').value;
    this._structNames.add(name);
    this._consume('{');
    const fields  = [];
    const methods = [];   // fn methodName(params) { body }
    while (this._peek().type !== '}') {
      if (this._peek().type === 'fn') {
        // method definition
        this._consume('fn');
        const mname = this._consume('identifier').value;
        this._consume('(');
        const params = this._parseFuncParams();
        this._consume(')');
        this._consume('{');
        const body = this._parseBlock();
        this._consume('}');
        methods.push({ name: mname, params, body });
      } else {
        let fieldType = null;
        const t = this._peek();
        if (['num','str','bool'].includes(t.type)) {
          fieldType = this.tokens[this.pos++].type;
        } else if (t.type === 'identifier' && this._structNames.has(t.value)) {
          fieldType = this.tokens[this.pos++].value;
        }
        const fieldName = this._consume('identifier').value;
        this._consume(';');
        fields.push({ name: fieldName, type: fieldType });
      }
    }
    this._consume('}');
    return { type: 'struct_def', name, fields, methods };
  }

  // ----------------------------------------------------------
  //  enum
  // ----------------------------------------------------------
  _parseEnum() {
    this._consume('enum');
    const name    = this._consume('identifier').value;
    this._consume('{');
    const entries = [];
    let auto = 0;
    while (this._peek().type !== '}') {
      const ename = this._consume('identifier').value;
      let val = auto++;
      if (this._peek().type === '=') {
        this._consume('=');
        const tok = this._consume('number');
        val  = tok.value;
        auto = val + 1;
      }
      entries.push({ name: ename, value: val });
    }
    this._consume('}');
    return { type: 'enum_def', name, entries };
  }

  // ----------------------------------------------------------
  //  if / for / while / repeat / match / attempt
  // ----------------------------------------------------------
  _parseIf() {
    this._consume('if');
    const condition = this._parseExpression();
    this._consume('{');
    const thenBody  = this._parseBlock();
    this._consume('}');
    let elseBody = null;
    if (this._peek().type === 'else') {
      this._consume('else');
      if (this._peek().type === 'if') {
        elseBody = [this._parseIf()];
      } else {
        this._consume('{');
        elseBody = this._parseBlock();
        this._consume('}');
      }
    }
    return { type: 'if', condition, thenBody, elseBody };
  }

  _parseFor() {
    this._consume('for');
    // for each item in arr { }
    if (this._peek().type === 'each') {
      this._consume('each');
      const id  = this._consume('identifier').value;
      this._consume('in');
      const src = this._parseExpression();
      this._consume('{');
      const body = this._parseBlock();
      this._consume('}');
      return { type: 'for_each', id, src, body };
    }
    // for i in start to end [step n] { }
    const id    = this._consume('identifier').value;
    this._consume('in');
    const start = this._parseExpression();
    this._consume('to');
    const end   = this._parseExpression();
    let step = null;
    if (this._peek().type === 'step') { this._consume('step'); step = this._parseExpression(); }
    this._consume('{');
    const body = this._parseBlock();
    this._consume('}');
    return { type: 'for', id, start, end, step, body };
  }

  _parseWhile() {
    this._consume('while');
    const condition = this._parseExpression();
    this._consume('{');
    const body = this._parseBlock();
    this._consume('}');
    return { type: 'while', condition, body };
  }

  // repeat { } until cond;
  _parseRepeat() {
    this._consume('repeat');
    this._consume('{');
    const body = this._parseBlock();
    this._consume('}');
    this._consume('until');
    const condition = this._parseExpression();
    this._consume(';');
    return { type: 'repeat', body, condition };
  }

  // match val { on x => { } on y => { } else => { } }
  _parseMatch() {
    this._consume('match');
    const subject = this._parseExpression();
    this._consume('{');
    const arms = [];
    let elseBody = null;
    while (this._peek().type !== '}') {
      if (this._peek().type === 'else') {
        this._consume('else');
        this._consume('=>');
        this._consume('{');
        elseBody = this._parseBlock();
        this._consume('}');
      } else {
        this._consume('on');
        const pattern = this._parseExpression();
        this._consume('=>');
        this._consume('{');
        const body = this._parseBlock();
        this._consume('}');
        arms.push({ pattern, body });
      }
    }
    this._consume('}');
    return { type: 'match', subject, arms, elseBody };
  }

  // attempt { } rescue errVar { }
  _parseAttempt() {
    this._consume('attempt');
    this._consume('{');
    const tryBody = this._parseBlock();
    this._consume('}');
    this._consume('rescue');
    const errVar = this._consume('identifier').value;
    this._consume('{');
    const catchBody = this._parseBlock();
    this._consume('}');
    return { type: 'attempt', tryBody, errVar, catchBody };
  }

  // raise expr;
  _parseRaise() {
    this._consume('raise');
    const value = this._parseExpression();
    this._consume(';');
    return { type: 'raise', value };
  }

  // ----------------------------------------------------------
  //  func — default params, variadic (...name)
  // ----------------------------------------------------------
  _parseFuncParams() {
    const params = [];
    const TYPE_KEYWORDS = new Set(['num','str','bool','let','array']);
    while (this._peek().type !== ')') {
      // variadic: ...name
      if (this._peek().type === '...') {
        this._consume('...');
        const name = this._consume('identifier').value;
        params.push({ name, type: null, variadic: true, defaultVal: undefined });
        // must be last param
        break;
      }
      let paramType = null;
      const pt = this._peek();
      if (TYPE_KEYWORDS.has(pt.type) || (pt.type==='identifier'&&this._structNames.has(pt.value))) {
        paramType = this.tokens[this.pos++].type || this.tokens[this.pos-1].value;
        if (this._peek().type !== 'identifier') {
          // consumed name not type
          params.push({ name: paramType, type: null, variadic: false, defaultVal: undefined });
          if (this._peek().type === ',') this._consume(',');
          continue;
        }
      }
      const name = this._consume('identifier').value;
      // default value?
      let defaultVal = undefined;
      if (this._peek().type === '=') {
        this._consume('=');
        defaultVal = this._parseExpression();
      }
      params.push({ name, type: paramType, variadic: false, defaultVal });
      if (this._peek().type === ',') this._consume(',');
    }
    return params;
  }

  _parseFunc() {
    this._consume('func');
    const id = this._consume('identifier').value;
    this._consume('(');
    const params = this._parseFuncParams();
    this._consume(')');
    this._consume('{');
    const body = this._parseBlock();
    this._consume('}');
    return { type: 'func', id, params, body };
  }

  // ----------------------------------------------------------
  //  export — two forms:
  //    export func name(...) { }      — define + export
  //    export { name1, name2, ... };  — export existing names
  // ----------------------------------------------------------
  _parseExport() {
    this._consume('export');
    const t = this._peek();

    // export func name(...) { body }
    if (t.type === 'func') {
      const funcNode = this._parseFunc();
      return { type: 'export_func', funcNode };
    }

    // export { name1, name2, ... };
    if (t.type === '{') {
      this._consume('{');
      const names = [];
      while (this._peek().type !== '}') {
        names.push(this._consume('identifier').value);
        if (this._peek().type === ',') this._consume(',');
      }
      this._consume('}');
      this._consume(';');
      return { type: 'export_names', names };
    }

    throw new Error(`Line ${t.line || '?'}: Expected 'func' or '{' after 'export', got '${t.type}'`);
  }

  _parseReturn() {
    this._consume('return');
    if (this._peek().type === ';') { this._consume(';'); return { type: 'return', value: null }; }
    const value = this._parseExpression();
    this._consume(';');
    return { type: 'return', value };
  }

  // ----------------------------------------------------------
  //  Struct var decl  (C-style)
  // ----------------------------------------------------------
  _parseStructVarDecl() {
    const structName = this._consume('identifier').value;
    const parseOneDeclarator = () => {
      const varName = this._consume('identifier').value;
      if (this._peek().type === '[') {
        this._consume('['); const countExpr = this._parseExpression(); this._consume(']');
        return { kind: 'array', varName, structName, countExpr };
      }
      if (this._peek().type === '=') {
        this._consume('='); const initExpr = this._parseExpression();
        return { kind: 'init', varName, structName, initExpr };
      }
      return { kind: 'single', varName, structName };
    };
    const declarators = [parseOneDeclarator()];
    while (this._peek().type === ',') { this._consume(','); declarators.push(parseOneDeclarator()); }
    this._consume(';');
    if (declarators.length === 1) return { type: 'struct_var_decl', ...declarators[0] };
    return { type: 'struct_multi_decl', declarators };
  }

  // ----------------------------------------------------------
  //  Expression statements — extended for field/index compound
  // ----------------------------------------------------------
  _parseExprStmt() {
    const id = this._consume('identifier');

    // ── simple assign: x = expr; ─────────────────────────────
    if (this._peek().type === '=') {
      this._consume('=');
      const value = this._parseExpression();
      this._consume(';');
      return { type: 'assign', id: id.value, value };
    }

    // ── compound assign on variable: x += expr; x++; ─────────
    if (this._peek().type === 'operator' &&
        ['+=','-=','*=','/=','%=','&=','|=','^=','++','--'].includes(this._peek().value)) {
      const op = this._consume('operator').value;
      if (op === '++' || op === '--') {
        this._consume(';');
        return { type: 'compound_assign', id: id.value,
                 op: op==='++'?'+=':'-=', value: { type: 'number', value: 1 } };
      }
      const value = this._parseExpression();
      this._consume(';');
      return { type: 'compound_assign', id: id.value, op, value };
    }

    // ── arr[i] ... ───────────────────────────────────────────
    if (this._peek().type === '[') {
      this._consume('[');
      const index = this._parseExpression();
      this._consume(']');

      // arr[i].field ... (struct field after index)
      if (this._peek().type === '.') {
        const chain = [];
        while (this._peek().type === '.') {
          this._consume('.'); chain.push(this._consume('identifier').value);
        }
        // compound assign on chained field
        if (this._peek().type === 'operator' &&
            ['+=','-=','*=','/=','%=','&=','|=','^=','++','--'].includes(this._peek().value)) {
          const op = this._consume('operator').value;
          if (op === '++' || op === '--') {
            this._consume(';');
            return { type: 'index_dot_compound', target: id.value, index, chain,
                     op: op==='++'?'+=':'-=', value: { type: 'number', value: 1 } };
          }
          const value = this._parseExpression();
          this._consume(';');
          return { type: 'index_dot_compound', target: id.value, index, chain, op, value };
        }
        this._consume('=');
        const value = this._parseExpression();
        this._consume(';');
        return { type: 'index_dot_assign', target: id.value, index, chain, value };
      }

      // arr[i] += expr; / arr[i]++;
      if (this._peek().type === 'operator' &&
          ['+=','-=','*=','/=','%=','&=','|=','^=','++','--'].includes(this._peek().value)) {
        const op = this._consume('operator').value;
        if (op === '++' || op === '--') {
          this._consume(';');
          return { type: 'index_compound', target: id.value, index,
                   op: op==='++'?'+=':'-=', value: { type: 'number', value: 1 } };
        }
        const value = this._parseExpression();
        this._consume(';');
        return { type: 'index_compound', target: id.value, index, op, value };
      }

      // arr[i] = expr;
      this._consume('=');
      const value = this._parseExpression();
      this._consume(';');
      return { type: 'array_assign', target: id.value, index, value };
    }

    // ── obj.field ...  /  obj.method(args); ──────────────────
    if (this._peek().type === '.') {
      const chain = [];
      while (this._peek().type === '.') {
        this._consume('.'); chain.push(this._consume('identifier').value);
      }

      // method call
      if (this._peek().type === '(') {
        const method = chain.pop();
        this._consume('(');
        const args = this._parseArgList();
        this._consume(')');
        this._consume(';');
        return { type: 'dot_method_stmt', target: id.value, chain, method, args };
      }

      // compound assign on field: hero.hp -= 10 / hero.hp++;
      if (this._peek().type === 'operator' &&
          ['+=','-=','*=','/=','%=','&=','|=','^=','++','--'].includes(this._peek().value)) {
        const op = this._consume('operator').value;
        if (op === '++' || op === '--') {
          this._consume(';');
          return { type: 'dot_compound', target: id.value, chain,
                   op: op==='++'?'+=':'-=', value: { type: 'number', value: 1 } };
        }
        const value = this._parseExpression();
        this._consume(';');
        return { type: 'dot_compound', target: id.value, chain, op, value };
      }

      // plain dot assign
      this._consume('=');
      const value = this._parseExpression();
      this._consume(';');
      return { type: 'dot_assign', target: id.value, chain, value };
    }

    // ── f(args); ─────────────────────────────────────────────
    if (this._peek().type === '(') {
      this._consume('(');
      const args = this._parseArgList();
      this._consume(')');
      this._consume(';');
      return { type: 'call_stmt', id: id.value, args };
    }

    throw new Error(`Line ${id.line || '?'}: Unexpected token after '${id.value}': '${this._peek().type}'`);
  }

  _parseArgList() {
    const args = [];
    while (this._peek().type !== ')') {
      args.push(this._parseExpression());
      if (this._peek().type === ',') this._consume(',');
    }
    return args;
  }

  // ----------------------------------------------------------
  //  Expression parsers
  // ----------------------------------------------------------
  _parseExpression() {
    // when cond then a else b  (ternary)
    if (this._peek().type === 'when') {
      this._consume('when');
      const cond       = this._parseLogicalOr();
      this._consume('then');
      const consequent = this._parseLogicalOr();
      this._consume('else');
      const alternate  = this._parseExpression(); // recursive for chaining
      return { type: 'when_expr', cond, consequent, alternate };
    }
    return this._parseLogicalOr();
  }

  _parseLogicalOr() {
    let left = this._parseLogicalAnd();
    while (this._peek().value === '||') {
      const op = this._consume('operator').value;
      left = { type: 'binary', op, left, right: this._parseLogicalAnd() };
    }
    return left;
  }
  _parseLogicalAnd() {
    let left = this._parseEquality();
    while (this._peek().value === '&&') {
      const op = this._consume('operator').value;
      left = { type: 'binary', op, left, right: this._parseEquality() };
    }
    return left;
  }
  _parseEquality() {
    let left = this._parseRelational();
    while (['==','!='].includes(this._peek().value)) {
      const op = this._consume('operator').value;
      left = { type: 'binary', op, left, right: this._parseRelational() };
    }
    return left;
  }
  _parseRelational() {
    let left = this._parseBitwise();
    while (true) {
      const t = this._peek();
      // x is Type
      if (t.type === 'is') {
        this._consume('is');
        const typeTok = this._peek();
        let typeName;
        if (['num','str','bool','array','func'].includes(typeTok.type)) {
          typeName = this.tokens[this.pos++].type;
        } else if (typeTok.type === 'null') {
          typeName = 'null'; this.pos++;
        } else if (typeTok.type === 'identifier') {
          typeName = this.tokens[this.pos++].value;
        } else {
          throw new Error(`Expected type name after 'is'`);
        }
        left = { type: 'is_expr', value: left, typeName };
        continue;
      }
      // val in arr / "k" in obj
      if (t.type === 'in') {
        this._consume('in');
        const right = this._parseBitwise();
        left = { type: 'in_expr', value: left, collection: right };
        continue;
      }
      if (['>', '<', '>=', '<='].includes(t.value)) {
        const op = this._consume('operator').value;
        left = { type: 'binary', op, left, right: this._parseBitwise() };
        continue;
      }
      break;
    }
    return left;
  }
  _parseBitwise() {
    let left = this._parseAdditive();
    while (['&','|','^','<<','>>'].includes(this._peek().value)) {
      const op = this._consume('operator').value;
      left = { type: 'binary', op, left, right: this._parseAdditive() };
    }
    return left;
  }
  _parseAdditive() {
    let left = this._parseMultiplicative();
    while (['+','-'].includes(this._peek().value)) {
      const op = this._consume('operator').value;
      left = { type: 'binary', op, left, right: this._parseMultiplicative() };
    }
    return left;
  }
  _parseMultiplicative() {
    let left = this._parseUnary();
    while (['*','/','%'].includes(this._peek().value)) {
      const op = this._consume('operator').value;
      left = { type: 'binary', op, left, right: this._parseUnary() };
    }
    return left;
  }
  _parseUnary() {
    if (this._peek().type === 'operator' && ['!','-','~'].includes(this._peek().value)) {
      const op = this._consume('operator').value;
      return { type: 'unary', op, right: this._parseUnary() };
    }
    return this._parsePostfix();
  }
  _parsePostfix() {
    let node = this._parsePrimary();
    while (true) {
      if (this._peek().type === '[') {
        this._consume('[');
        const index = this._parseExpression();
        this._consume(']');
        node = { type: 'index', target: node, index };
      } else if (this._peek().type === '.') {
        this._consume('.');
        const prop = this._consume('identifier').value;
        if (this._peek().type === '(') {
          this._consume('(');
          const args = this._parseArgList();
          this._consume(')');
          node = { type: 'method_expr', target: node, method: prop, args };
        } else {
          node = { type: 'prop', target: node, prop };
        }
      } else { break; }
    }
    return node;
  }

  _parsePrimary() {
    const t = this._peek();

    if (t.type === 'number' || t.type === 'boolean') return this.tokens[this.pos++];
    if (t.type === 'null')                            return this.tokens[this.pos++];
    if (t.type === 'string')                          return this.tokens[this.pos++];

    // ── fn lambda:  fn(params) => expr   fn(params) { body } ─
    if (t.type === 'fn') {
      this._consume('fn');
      this._consume('(');
      const params = this._parseFuncParams();
      this._consume(')');
      if (this._peek().type === '=>') {
        this._consume('=>');
        const expr = this._parseExpression();
        return { type: 'lambda', params, body: null, expr };
      }
      this._consume('{');
      const body = this._parseBlock();
      this._consume('}');
      return { type: 'lambda', params, body, expr: null };
    }

    if (t.type === 'identifier') {
      const id = this.tokens[this.pos++];

      // Struct literal
      if (this._peek().type === '{' && this._structNames && this._structNames.has(id.value)) {
        this._consume('{');
        const fields = [];
        while (this._peek().type !== '}') {
          const kt = this._peek();
          if (kt.type !== 'identifier' && kt.type !== 'string')
            throw new Error(`Struct field name must be identifier`);
          const key = this.tokens[this.pos++].value;
          this._consume(':');
          const value = this._parseExpression();
          fields.push({ key, value });
          if (this._peek().type === ',') this._consume(',');
        }
        this._consume('}');
        return { type: 'struct_new', name: id.value, fields };
      }

      // Function call
      if (this._peek().type === '(') {
        this._consume('(');
        const args = this._parseArgList();
        this._consume(')');
        return { type: 'call', id: id.value, args };
      }

      return id;
    }

    // Parenthesised expression
    if (t.type === '(') {
      this._consume('(');
      const expr = this._parseExpression();
      this._consume(')');
      return expr;
    }

    // Array literal
    if (t.type === '[') {
      this._consume('[');
      const elements = [];
      while (this._peek().type !== ']') {
        elements.push(this._parseExpression());
        if (this._peek().type === ',') this._consume(',');
      }
      this._consume(']');
      return { type: 'array', elements };
    }

    // Object literal
    if (t.type === '{') {
      this._consume('{');
      const props = [];
      while (this._peek().type !== '}') {
        const kt = this._peek();
        if (kt.type !== 'identifier' && kt.type !== 'string')
          throw new Error(`Object key must be identifier or string`);
        const key = this.tokens[this.pos++].value;
        this._consume(':');
        const value = this._parseExpression();
        props.push({ key, value });
        if (this._peek().type === ',') this._consume(',');
      }
      this._consume('}');
      return { type: 'object', props };
    }

    throw new Error(`Line ${t.line || '?'}: Unexpected token in expression: '${t.type}'` +
      (t.value !== undefined ? ` ('${t.value}')` : ''));
  }

  // ----------------------------------------------------------
  //  Execution engine
  // ----------------------------------------------------------
  _execBlock(stmts, scope) {
    for (const stmt of stmts) {
      const sig = this._exec(stmt, scope);
      if (sig instanceof ReturnSignal   ||
          sig instanceof BreakSignal    ||
          sig instanceof ContinueSignal ||
          sig instanceof ThrowSignal) return sig;
    }
  }

  _exec(node, scope) {
    // Track line for runtime error reporting
    if (node.line) this._currentLine = node.line;

    switch (node.type) {

      // ── multi_decl ────────────────────────────────────────────
      case 'multi_decl': {
        for (const d of node.decls) this._exec(d, scope);
        return;
      }

      // ── decl ──────────────────────────────────────────────────
      case 'decl': {
        if (node.keyword === 'array' && node.value && node.value.type === 'array_init') {
          const count   = this._eval(node.value.countExpr, scope);
          const elemType = node.value.elemType;
          const defaults = { num: 0, str: '', object: null };
          scope[node.id] = Array.from({ length: count }, () => defaults[elemType]);
          return;
        }
        let val = node.value !== null ? this._eval(node.value, scope) : node.defaultVal;
        if (node.keyword === 'num' && typeof val === 'string') {
          const n = Number(val.trim());
          if (isNaN(n)) throw new Error(`Type error: '${node.id}' is num but got "${val}"`);
          val = n;
        }
        if (node.keyword === 'str' && typeof val === 'number') val = String(val);
        // view and let: accept any value — no type checking
        if (!['let','view'].includes(node.keyword)) {
          if (node.keyword === 'num'  && typeof val !== 'number')
            throw new Error(`Type error: '${node.id}' is num but got ${typeof val}`);
          if (node.keyword === 'str'  && typeof val !== 'string')
            throw new Error(`Type error: '${node.id}' is str but got ${typeof val}`);
          if (node.keyword === 'bool' && typeof val !== 'boolean')
            throw new Error(`Type error: '${node.id}' is bool but got ${typeof val}`);
        }
        scope[node.id] = val;
        if (node.keyword === 'set') {
          if (!Object.prototype.hasOwnProperty.call(scope, '__consts__'))
            scope.__consts__ = new Set();
          scope.__consts__.add(node.id);
        }
        return;
      }

      // ── destructuring ─────────────────────────────────────────
      case 'destructure_arr': {
        const src = this._eval(node.src, scope);
        if (!Array.isArray(src)) throw new Error('Array destructuring requires an array');
        node.names.forEach((name, i) => { scope[name] = src[i] ?? null; });
        return;
      }
      case 'destructure_obj': {
        const src = this._eval(node.src, scope);
        if (src === null || typeof src !== 'object')
          throw new Error('Object destructuring requires an object or struct');
        node.names.forEach(name => { scope[name] = src[name] ?? null; });
        return;
      }

      // ── struct_def ────────────────────────────────────────────
      case 'struct_def': {
        const { name, fields, methods } = node;
        this.structs[name] = fields;
        // store methods on structs table for binding at call time
        this.structs[name].__methods__ = methods || [];

        scope[name] = (...positionalArgs) => {
          const obj = new StructInstance(name, {});
          fields.forEach((f, i) => {
            const defaults = { num:0, str:'', bool:false };
            obj[f.name] = positionalArgs[i] !== undefined
              ? positionalArgs[i]
              : (f.type ? (defaults[f.type] ?? null) : null);
          });
          this._bindMethods(obj, methods, scope);
          return obj;
        };
        scope[name].__isStructCtor__ = true;
        scope[name].__structName__   = name;
        return;
      }

      // ── enum_def ──────────────────────────────────────────────
      case 'enum_def': {
        const obj = Object.create(null);
        node.entries.forEach(e => { obj[e.name] = e.value; });
        Object.freeze(obj);
        scope[node.name] = obj;
        return;
      }

      // ── struct_var_decl / struct_multi_decl ───────────────────
      case 'struct_multi_decl': {
        for (const d of node.declarators) this._exec({ type: 'struct_var_decl', ...d }, scope);
        return;
      }
      case 'struct_var_decl': {
        const def = this.structs[node.structName];
        if (!def) throw new Error(`Unknown struct type: '${node.structName}'`);
        const makeDefault = () => this._makeStructDefault(node.structName, scope);
        if (node.kind === 'array') {
          const count = this._eval(node.countExpr, scope);
          scope[node.varName] = Array.from({ length: count }, makeDefault);
        } else if (node.kind === 'init') {
          scope[node.varName] = this._eval(node.initExpr, scope);
        } else {
          scope[node.varName] = makeDefault();
        }
        return;
      }

      // ── assign ────────────────────────────────────────────────
      case 'assign': {
        this._setVar(scope, node.id, this._eval(node.value, scope));
        return;
      }

      // ── compound_assign ───────────────────────────────────────
      case 'compound_assign': {
        const cur = this._getVar(scope, node.id);
        const rhs = this._eval(node.value, scope);
        this._setVar(scope, node.id, this._applyOp(node.op, cur, rhs));
        return;
      }

      // ── array_assign ──────────────────────────────────────────
      case 'array_assign': {
        const arr = this._getVar(scope, node.target);
        arr[this._eval(node.index, scope)] = this._eval(node.value, scope);
        return;
      }

      // ── index_compound  arr[i] += 5 ──────────────────────────
      case 'index_compound': {
        const arr = this._getVar(scope, node.target);
        const idx = this._eval(node.index, scope);
        const rhs = this._eval(node.value, scope);
        arr[idx] = this._applyOp(node.op, arr[idx], rhs);
        return;
      }

      // ── index_dot_assign  arr[i].field = expr ─────────────────
      case 'index_dot_assign': {
        let obj = this._getVar(scope, node.target);
        obj = obj[this._eval(node.index, scope)];
        for (let i = 0; i < node.chain.length - 1; i++) obj = obj[node.chain[i]];
        obj[node.chain[node.chain.length - 1]] = this._eval(node.value, scope);
        return;
      }

      // ── index_dot_compound  arr[i].field += 5 ─────────────────
      case 'index_dot_compound': {
        let obj = this._getVar(scope, node.target);
        obj = obj[this._eval(node.index, scope)];
        for (let i = 0; i < node.chain.length - 1; i++) obj = obj[node.chain[i]];
        const last = node.chain[node.chain.length - 1];
        const rhs  = this._eval(node.value, scope);
        obj[last] = this._applyOp(node.op, obj[last], rhs);
        return;
      }

      // ── dot_assign  obj.a.b = expr ────────────────────────────
      case 'dot_assign': {
        let obj = this._getVar(scope, node.target);
        for (let i = 0; i < node.chain.length - 1; i++) {
          obj = obj[node.chain[i]];
          if (obj === null || obj === undefined)
            throw new Error(`Cannot set property on null/undefined`);
        }
        obj[node.chain[node.chain.length - 1]] = this._eval(node.value, scope);
        return;
      }

      // ── dot_compound  hero.hp -= 10 ───────────────────────────
      case 'dot_compound': {
        let obj = this._getVar(scope, node.target);
        for (let i = 0; i < node.chain.length - 1; i++) {
          obj = obj[node.chain[i]];
          if (obj === null || obj === undefined)
            throw new Error(`Cannot compound-assign on null/undefined`);
        }
        const last = node.chain[node.chain.length - 1];
        const rhs  = this._eval(node.value, scope);
        obj[last] = this._applyOp(node.op, obj[last], rhs);
        return;
      }

      // ── dot_method_stmt ───────────────────────────────────────
      case 'dot_method_stmt': {
        let obj = this._getVar(scope, node.target);
        for (const key of node.chain) obj = obj[key];
        const args = node.args.map(a => this._eval(a, scope));
        this._applyMethod(obj, node.method, args);
        return;
      }

      case 'method_stmt': {
        const tgt  = this._getVar(scope, node.target);
        const args = node.args.map(a => this._eval(a, scope));
        this._applyMethod(tgt, node.method, args);
        return;
      }

      // ── call_stmt ─────────────────────────────────────────────
      case 'call_stmt': {
        const fn = this._getVar(scope, node.id);
        if (typeof fn !== 'function') throw new Error(`'${node.id}' is not a function`);
        fn(...node.args.map(a => this._eval(a, scope)));
        return;
      }

      // ── if ────────────────────────────────────────────────────
      case 'if': {
        if (this._eval(node.condition, scope)) {
          return this._execBlock(node.thenBody, Object.create(scope));
        } else if (node.elseBody) {
          return this._execBlock(node.elseBody, Object.create(scope));
        }
        return;
      }

      // ── for i in start to end ─────────────────────────────────
      case 'for': {
        const start = this._eval(node.start, scope);
        const end   = this._eval(node.end,   scope);
        const step  = node.step ? this._eval(node.step, scope) : (start <= end ? 1 : -1);
        const cmp   = step > 0 ? (a, b) => a <= b : (a, b) => a >= b;
        for (let idx = start; cmp(idx, end); idx += step) {
          const ls = Object.create(scope);
          ls[node.id] = idx;
          const sig = this._execBlock(node.body, ls);
          if (sig instanceof ReturnSignal) return sig;
          if (sig instanceof ThrowSignal)  return sig;
          if (sig instanceof BreakSignal)  break;
        }
        return;
      }

      // ── for each item in arr ──────────────────────────────────
      case 'for_each': {
        const src = this._eval(node.src, scope);
        const items = Array.isArray(src) ? src
          : typeof src === 'string' ? src.split('')
          : Object.values(src);
        for (const item of items) {
          const ls = Object.create(scope);
          ls[node.id] = item;
          const sig = this._execBlock(node.body, ls);
          if (sig instanceof ReturnSignal) return sig;
          if (sig instanceof ThrowSignal)  return sig;
          if (sig instanceof BreakSignal)  break;
        }
        return;
      }

      // ── while ─────────────────────────────────────────────────
      case 'while': {
        while (this._eval(node.condition, scope)) {
          const sig = this._execBlock(node.body, Object.create(scope));
          if (sig instanceof ReturnSignal) return sig;
          if (sig instanceof ThrowSignal)  return sig;
          if (sig instanceof BreakSignal)  break;
        }
        return;
      }

      // ── repeat { } until cond; ────────────────────────────────
      case 'repeat': {
        do {
          const sig = this._execBlock(node.body, Object.create(scope));
          if (sig instanceof ReturnSignal) return sig;
          if (sig instanceof ThrowSignal)  return sig;
          if (sig instanceof BreakSignal)  break;
        } while (this._eval(node.condition, scope) === false);
        return;
      }

      // ── match val { on x => { } else => { } } ────────────────
      case 'match': {
        const subject = this._eval(node.subject, scope);
        for (const arm of node.arms) {
          const pattern = this._eval(arm.pattern, scope);
          if (subject === pattern) {
            const sig = this._execBlock(arm.body, Object.create(scope));
            if (sig) return sig;
            return;
          }
        }
        if (node.elseBody) {
          return this._execBlock(node.elseBody, Object.create(scope));
        }
        return;
      }

      // ── attempt { } rescue e { } ──────────────────────────────
      case 'attempt': {
        let sig;
        try {
          sig = this._execBlock(node.tryBody, Object.create(scope));
        } catch (jsErr) {
          // catch both raise (ThrowSignal) and real JS runtime errors
          const cs = Object.create(scope);
          cs[node.errVar] = jsErr instanceof ThrowSignal ? jsErr.value : jsErr.message;
          return this._execBlock(node.catchBody, cs);
        }
        if (sig instanceof ThrowSignal) {
          const cs = Object.create(scope);
          cs[node.errVar] = sig.value;
          return this._execBlock(node.catchBody, cs);
        }
        return sig;
      }

      // ── raise expr; ───────────────────────────────────────────
      case 'raise': {
        const val = this._eval(node.value, scope);
        return new ThrowSignal(val);
      }

      // ── func ──────────────────────────────────────────────────
      case 'func': {
        const cls = scope;
        scope[node.id] = this._makeFn(node.params, node.body, cls);
        return;
      }

      case 'return': {
        const val = node.value !== null ? this._eval(node.value, scope) : null;
        return new ReturnSignal(val);
      }

      // ── export func name(...) { } ────────────────────────────
      case 'export_func': {
        this._exec(node.funcNode, scope);   // define the function normally
        this.__exports__.add(node.funcNode.id);
        return;
      }

      // ── export { name1, name2 } ───────────────────────────────
      case 'export_names': {
        for (const name of node.names) {
          if (this._getVar(scope, name) === undefined)
            throw new Error(`export: '${name}' is not defined`);
          this.__exports__.add(name);
        }
        return;
      }

      case 'break':    return new BreakSignal();
      case 'continue': return new ContinueSignal();

      default:
        throw new Error(`Line ${node.line || this._currentLine || '?'}: Unknown statement type: '${node.type}'`);
    }
  }

  // ----------------------------------------------------------
  //  Helpers
  // ----------------------------------------------------------
  _applyOp(op, cur, rhs) {
    switch (op) {
      case '+=': return cur + rhs;
      case '-=': return cur - rhs;
      case '*=': return cur * rhs;
      case '/=': if (rhs === 0) throw new Error('Division by zero'); return cur / rhs;
      case '%=': return cur % rhs;
      case '&=': return (cur | 0) & (rhs | 0);
      case '|=': return (cur | 0) | (rhs | 0);
      case '^=': return (cur | 0) ^ (rhs | 0);
      default:   throw new Error(`Unknown compound op '${op}'`);
    }
  }

  _makeFn(params, body, closure) {
    return (...args) => {
      const fs = Object.create(closure);
      let argIdx = 0;
      for (const param of params) {
        const name   = param.name;
        const ptype  = param.type;
        const isVar  = param.variadic;
        const defVal = param.defaultVal;

        if (isVar) {
          // collect all remaining args into an array
          fs[name] = args.slice(argIdx);
          break;
        }

        let val = argIdx < args.length ? args[argIdx++]
          : (defVal !== undefined ? this._eval(defVal, closure) : null);

        // type coercion
        if (ptype === 'num') {
          if (typeof val === 'string') {
            const n = Number(val);
            if (isNaN(n)) throw new Error(`Param '${name}' expects num, got "${val}"`);
            val = n;
          } else if (typeof val !== 'number' && val !== null) {
            throw new Error(`Param '${name}' expects num, got ${typeof val}`);
          }
        } else if (ptype === 'str') {
          if (typeof val === 'number') val = String(val);
          else if (typeof val !== 'string' && val !== null)
            throw new Error(`Param '${name}' expects str, got ${typeof val}`);
        } else if (ptype === 'bool') {
          if (typeof val !== 'boolean' && val !== null)
            throw new Error(`Param '${name}' expects bool, got ${typeof val}`);
        }

        fs[name] = val;
      }
      const sig = this._execBlock(body, fs);
      if (sig instanceof ThrowSignal) throw sig;  // propagate up
      return sig instanceof ReturnSignal ? sig.value : null;
    };
  }

  _makeStructDefault(typeName, scope) {
    const def = this.structs[typeName];
    if (!def) return null;
    const typeDefaults = { num: 0, str: '', bool: false };
    const inst = new StructInstance(typeName, {});
    def.forEach(f => {
      if (f.type && typeDefaults.hasOwnProperty(f.type))   inst[f.name] = typeDefaults[f.type];
      else if (f.type && this.structs[f.type])              inst[f.name] = this._makeStructDefault(f.type, scope);
      else                                                   inst[f.name] = null;
    });
    this._bindMethods(inst, def.__methods__ || [], scope || this.globalScope);
    return inst;
  }

  _bindMethods(inst, methods, scope) {
    for (const m of methods) {
      // Close over inst as 'self'
      const capturedInst = inst;
      inst[m.name] = (...args) => {
        const ms = Object.create(scope);
        ms['self'] = capturedInst;
        m.params.forEach((p, i) => {
          const name = typeof p === 'string' ? p : p.name;
          ms[name] = args[i] ?? null;
        });
        const sig = this._execBlock(m.body, ms);
        if (sig instanceof ThrowSignal) throw sig;
        return sig instanceof ReturnSignal ? sig.value : null;
      };
    }
  }

  // ----------------------------------------------------------
  //  Expression evaluator
  // ----------------------------------------------------------
  _eval(node, scope) {
    switch (node.type) {

      case 'number':
      case 'boolean': return node.value;
      case 'null':    return null;

      // String interpolation
      case 'string': {
        if (!node.value.includes('#')) return node.value;
        const src = node.value;
        let out = '', i = 0;
        while (i < src.length) {
          if (src[i] !== '#') { out += src[i++]; continue; }
          if (src[i+1] === '#') { out += '#'; i += 2; continue; }
          if (src[i+1] === '(') {
            let depth = 0, j = i + 1;
            while (j < src.length) {
              if (src[j]==='(') depth++;
              else if (src[j]===')') { depth--; if (depth===0) break; }
              j++;
            }
            const exprText = src.slice(i + 2, j);
            try {
              const savedToks = this.tokens, savedPos = this.pos;
              this.tokens = this.tokenize(exprText); this.pos = 0;
              const exprNode = this._parseExpression();
              this.tokens = savedToks; this.pos = savedPos;
              out += this._str(this._eval(exprNode, scope));
            } catch (_) { out += src.slice(i, j+1); }
            i = j + 1; continue;
          }
          if (/[a-zA-Z_]/.test(src[i+1])) {
            let j = i + 1;
            while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
            while (j < src.length && src[j]==='.' && /[a-zA-Z_]/.test(src[j+1])) {
              j++;
              while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
            }
            const varExpr = src.slice(i+1, j);
            const parts   = varExpr.split('.');
            let val = this._getVar(scope, parts[0]);
            if (val !== undefined) {
              for (let k = 1; k < parts.length; k++) {
                if (val == null) { val = undefined; break; }
                val = val[parts[k]];
              }
            }
            out += val !== undefined ? this._str(val) : src.slice(i, j);
            i = j; continue;
          }
          out += src[i++];
        }
        return out;
      }

      case 'identifier': {
        const val = this._getVar(scope, node.value);
        if (val === undefined) throw new Error(`Undefined variable: '${node.value}'`);
        return val;
      }

      case 'call': {
        const fn = this._getVar(scope, node.id);
        if (typeof fn !== 'function') throw new Error(`'${node.id}' is not a function`);
        try {
          return fn(...node.args.map(a => this._eval(a, scope)));
        } catch (e) {
          if (e instanceof ThrowSignal) return e; // re-wrap
          throw e;
        }
      }

      case 'index':      return this._eval(node.target, scope)[this._eval(node.index, scope)];
      case 'prop':       return this._eval(node.target, scope)[node.prop];

      case 'method_expr': {
        const tgt  = this._eval(node.target, scope);
        const args = node.args.map(a => this._eval(a, scope));
        return this._applyMethod(tgt, node.method, args, scope);
      }

      case 'array':  return node.elements.map(e => this._eval(e, scope));

      case 'object': {
        const obj = {};
        node.props.forEach(p => obj[p.key] = this._eval(p.value, scope));
        return obj;
      }

      // ── struct instantiation ───────────────────────────────────
      case 'struct_new': {
        const def = this.structs[node.name];
        if (!def) throw new Error(`Unknown struct type: '${node.name}'`);
        const inst = this._makeStructDefault(node.name, scope);
        node.fields.forEach(f => {
          if (!def.find(d => d.name === f.key))
            throw new Error(`Struct '${node.name}' has no field '${f.key}'`);
          inst[f.key] = this._eval(f.value, scope);
        });
        return inst;
      }

      // ── lambda ────────────────────────────────────────────────
      case 'lambda': {
        const capturedScope = scope;
        if (node.expr !== null) {
          // arrow lambda: fn(x) => expr
          return (...args) => {
            const fs = Object.create(capturedScope);
            node.params.forEach((p, i) => {
              const name = typeof p === 'string' ? p : p.name;
              fs[name] = args[i] ?? null;
            });
            return this._eval(node.expr, fs);
          };
        }
        // block lambda: fn(x) { body }
        return this._makeFn(node.params, node.body, capturedScope);
      }

      // ── when cond then a else b ────────────────────────────────
      case 'when_expr': {
        return this._eval(node.cond, scope)
          ? this._eval(node.consequent, scope)
          : this._eval(node.alternate, scope);
      }

      // ── x is Type ─────────────────────────────────────────────
      case 'is_expr': {
        const val  = this._eval(node.value, scope);
        const t    = node.typeName;
        if (t === 'num')   return typeof val === 'number';
        if (t === 'str')   return typeof val === 'string';
        if (t === 'bool')  return typeof val === 'boolean';
        if (t === 'array') return Array.isArray(val);
        if (t === 'func')  return typeof val === 'function';
        if (t === 'null')  return val === null || val === undefined;
        // struct type
        return val instanceof StructInstance && val.__type__ === t;
      }

      // ── val in arr / "k" in obj ───────────────────────────────
      case 'in_expr': {
        const val = this._eval(node.value, scope);
        const col = this._eval(node.collection, scope);
        if (Array.isArray(col)) return col.includes(val);
        if (typeof col === 'string') return col.includes(val);
        if (typeof col === 'object' && col !== null) return val in col;
        throw new Error(`'in' requires an array, string, or object`);
      }

      case 'binary': {
        if (node.op === '&&')
          return this._eval(node.left, scope) && this._eval(node.right, scope);
        if (node.op === '||')
          return this._eval(node.left, scope) || this._eval(node.right, scope);
        const l = this._eval(node.left,  scope);
        const r = this._eval(node.right, scope);
        switch (node.op) {
          case '+':  return l + r;
          case '-':  return l - r;
          case '*':  return l * r;
          case '/':  if (r === 0) throw new Error('Division by zero'); return l / r;
          case '%':  return l % r;
          case '==': return l === r;
          case '!=': return l !== r;
          case '>':  return l > r;
          case '<':  return l < r;
          case '>=': return l >= r;
          case '<=': return l <= r;
          // bitwise
          case '&':  return (l|0) & (r|0);
          case '|':  return (l|0) | (r|0);
          case '^':  return (l|0) ^ (r|0);
          case '<<': return (l|0) << (r|0);
          case '>>': return (l|0) >> (r|0);
          default:   throw new Error(`Unknown binary operator '${node.op}'`);
        }
      }

      case 'unary': {
        const v = this._eval(node.right, scope);
        if (node.op === '!') return !v;
        if (node.op === '-') return -v;
        if (node.op === '~') return ~(v|0);
        throw new Error(`Unknown unary operator '${node.op}'`);
      }

      default:
        throw new Error(`Unknown expression type: '${node.type}'`);
    }
  }

  // ----------------------------------------------------------
  //  Method dispatch
  // ----------------------------------------------------------
  _applyMethod(target, method, args, scope) {
    if (Array.isArray(target)) {
      switch (method) {
        case 'push':     target.push(...args);      return target;
        case 'pop':      return target.pop();
        case 'shift':    return target.shift();
        case 'unshift':  target.unshift(...args);   return target;
        case 'indexOf':  return target.indexOf(args[0]);
        case 'includes': return target.includes(args[0]);
        case 'join':     return target.join(args[0] ?? ',');
        case 'slice':    return target.slice(...args);
        case 'concat':   return target.concat(args[0]);
        case 'reverse':  return [...target].reverse();
        case 'len':      return target.length;
        case 'sort':     return [...target].sort((a, b) => a - b);
        // ── Functional methods (accept fn lambda or JS function) ──
        case 'map':     return target.map(   (x, i) => this._callFn(args[0], [x, i]));
        case 'filter':  return target.filter((x, i) => this._callFn(args[0], [x, i]));
        case 'find':    return target.find(  (x, i) => this._callFn(args[0], [x, i])) ?? null;
        case 'every':   return target.every( (x, i) => this._callFn(args[0], [x, i]));
        case 'some':    return target.some(  (x, i) => this._callFn(args[0], [x, i]));
        case 'flatMap': return target.flatMap((x, i) => this._callFn(args[0], [x, i]));
        case 'reduce': {
          if (args.length < 2) throw new Error('reduce requires an initial value as 2nd arg');
          return target.reduce((acc, x) => this._callFn(args[0], [acc, x]), args[1]);
        }
        case 'sortBy': {
          return [...target].sort((a, b) => {
            const ka = this._callFn(args[0], [a]);
            const kb = this._callFn(args[0], [b]);
            return ka < kb ? -1 : ka > kb ? 1 : 0;
          });
        }
        case 'count': {
          if (!args[0]) return target.length;
          return target.filter(x => this._callFn(args[0], [x])).length;
        }
        default: throw new Error(`Unknown array method: '${method}'`);
      }
    }

    if (typeof target === 'string') {
      switch (method) {
        case 'len':        return target.length;
        case 'upper':      return target.toUpperCase();
        case 'lower':      return target.toLowerCase();
        case 'trim':       return target.trim();
        case 'split':      return target.split(args[0] ?? '');
        case 'slice':      return target.slice(...args);
        case 'indexOf':    return target.indexOf(args[0]);
        case 'includes':   return target.includes(args[0]);
        case 'replace':    return target.replace(args[0], args[1]);
        case 'startsWith': return target.startsWith(args[0]);
        case 'endsWith':   return target.endsWith(args[0]);
        case 'repeat':     return target.repeat(args[0]);
        case 'toNum':      return Number(target);
        case 'charCode':   return target.charCodeAt(args[0] ?? 0);
        case 'chars':      return target.split('');
        case 'words':      return target.trim().split(/\s+/);
        case 'lines':      return target.split('\n');
        default: throw new Error(`Unknown string method: '${method}'`);
      }
    }

    if (target instanceof StructInstance || (typeof target === 'object' && target !== null)) {
      if (typeof target[method] === 'function') {
        return target[method].apply(target, args);
      }
      switch (method) {
        case 'keys':   return Object.keys(target).filter(k => k !== '__type__' && typeof target[k] !== 'function');
        case 'values': return Object.entries(target).filter(([k,v]) => k !== '__type__' && typeof v !== 'function').map(([,v])=>v);
        case 'has':    return args[0] in target;
        default: throw new Error(`Unknown object method: '${method}' on ${target.__type__ || 'object'}`);
      }
    }

    throw new Error(`Cannot call '${method}' on ${typeof target}`);
  }

  // Call a ZETA++ lambda or JS function with given args
  _callFn(fn, args) {
    if (typeof fn !== 'function')
      throw new Error(`Expected a function (lambda), got ${typeof fn}`);
    try {
      const result = fn(...args);
      if (result instanceof ThrowSignal) throw result;
      if (result instanceof ReturnSignal) return result.value;
      return result;
    } catch (e) {
      if (e instanceof ThrowSignal) throw e;
      throw e;
    }
  }

  // ----------------------------------------------------------
  //  Scope helpers
  // ----------------------------------------------------------
  _getVar(scope, name) {
    let s = scope;
    while (s !== null) {
      if (Object.prototype.hasOwnProperty.call(s, name)) return s[name];
      s = Object.getPrototypeOf(s);
    }
    return undefined;
  }

  _setVar(scope, name, value) {
    let s = scope;
    while (s !== null) {
      if (Object.prototype.hasOwnProperty.call(s, name)) {
        if (s.__consts__ && s.__consts__.has(name))
          throw new Error(`Cannot reassign constant '${name}' (declared with 'set')`);
        s[name] = value;
        return;
      }
      s = Object.getPrototypeOf(s);
    }
    scope[name] = value;
  }

  // ----------------------------------------------------------
  //  Stringify
  // ----------------------------------------------------------
  _str(val) {
    if (val === null)              return 'null';
    if (val === undefined)         return 'undefined';
    if (typeof val === 'boolean')  return val ? 'true' : 'false';
    if (typeof val === 'function') return '<func>';
    // gui.zl view objects carry __type__ = 'view' set by _view()
    if (typeof val === 'object' && val !== null && val.__type__ === 'view')
      return `<view:${val.__viewKind__ || 'widget'}>`;
    if (val instanceof StructInstance) {
      const fields = Object.entries(val)
        .filter(([k, v]) => k !== '__type__' && typeof v !== 'function')
        .map(([k, v]) => `${k}: ${this._str(v)}`)
        .join(', ');
      return `${val.__type__} { ${fields} }`;
    }
    if (Array.isArray(val))
      return '[' + val.map(v => typeof v === 'string' ? `"${v}"` : this._str(v)).join(', ') + ']';
    if (typeof val === 'object')
      return '{' + Object.entries(val).map(([k, v]) => `${k}: ${this._str(v)}`).join(', ') + '}';
    return String(val);
  }
}

// ============================================================
//  Public API
// ============================================================
class InputNeededError extends Error {
  constructor(prompt, outputSoFar) {
    super('__INPUT_NEEDED__');
    this.isInputNeeded = true;
    this.prompt        = prompt || '';
    this.outputSoFar   = outputSoFar || [];
  }
}

function interpretDSALang(code, answers, opts) {
  answers = answers || [];
  opts    = opts    || {};
  let idx = 0;

  const fileLoader = opts.files
    ? (filename) => {
        if (opts.files[filename] === undefined)
          throw new Error(`#import: "${filename}" not found`);
        return opts.files[filename];
      }
    : _defaultFileLoader;

  const interp = new Interpreter({
    fileLoader,
    inputFn: (prompt) => {
      if (idx < answers.length) return String(answers[idx++]);
      throw new InputNeededError(prompt, [...interp.outputs]);
    }
  });
  return interp.interpret(code);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { interpretDSALang, InputNeededError, Interpreter };
}

if (typeof require !== 'undefined' && require.main === module) {
  const nodefs = require('fs');
  const interp = new Interpreter({ sink: process.stdout });
  let code;
  if (process.argv[2]) {
    code = nodefs.readFileSync(process.argv[2], 'utf8');
  } else {
    code = `
// ZETA++ v6 — Feature Showcase
// Run any .zpp file with:  node interpreter.js file.zpp

// 1. foreach
let nums = [1,2,3,4,5];
for each n in nums { print("num: " + n); }

// 2. ternary
num x = 7;
str label = when x > 5 then "big" else "small";
print("label: " + label);

// 3. match
match x {
  on 1 => { print("one"); }
  on 7 => { print("seven!"); }
  else  => { print("other"); }
}

// 4. attempt / rescue / raise
attempt {
  raise "oops!";
} rescue e {
  print("caught: " + e);
}

// 5. repeat until
num i = 0;
repeat { i++; } until i >= 3;
print("i after repeat: " + i);

// 6. lambda + map/filter
let doubled = nums.map(fn(n) => n * 2);
print("doubled: " + join(doubled, " "));
let evens = nums.filter(fn(n) => n % 2 == 0);
print("evens: " + join(evens, " "));

// 7. enum
enum Direction { NORTH SOUTH EAST WEST }
print("NORTH=" + Direction.NORTH + " WEST=" + Direction.WEST);

// 8. struct methods
struct Circle {
  num radius;
  fn area() { return 3.14159 * self.radius * self.radius; }
  fn describe() { print("Circle r=" + self.radius + " area=" + self.area()); }
}
Circle c; c.radius = 5;
c.describe();

// 9. destructuring
let [a, b, cc] = [10, 20, 30];
print("destructured: a=#a b=#b c=#cc");

// 10. bitwise
print("5 & 3 = " + (5 & 3));
print("5 | 3 = " + (5 | 3));
print("5 ^ 3 = " + (5 ^ 3));
print("1 << 3 = " + (1 << 3));

// 11. is / in
print("5 is num: " + (5 is num));
print("3 in nums: " + (3 in nums));

// 12. compound assign on fields
struct Point { num x; num y; }
Point p;
p.x = 10;
p.x -= 3;
p.x++;
print("p.x = " + p.x);
`;
  }
  try {
    interp.interpret(code);
  } catch (e) {
    // Error messages already include "Line N:" prefix from the interpreter
    process.stderr.write('\x1b[31mError:\x1b[0m ' + e.message + '\n');
    process.exit(1);
  }
}