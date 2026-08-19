const DSALibraries = {
  'math.zl': {
    description: 'Extended math: factorial, prime, gcd, fibonacci, combinations, clamp, lerp…',
    inject(G) {

      // Angle conversion
      G.degrees  = x => x * (180 / Math.PI);
      G.radians  = x => x * (Math.PI / 180);

      // Trig with degree input (convenience wrappers)
      G.sinD = x => Math.sin(x * Math.PI / 180);
      G.cosD = x => Math.cos(x * Math.PI / 180);
      G.tanD = x => Math.tan(x * Math.PI / 180);

      // Rounding variants
      G.truncate = x => Math.trunc(x);
      G.sign     = x => Math.sign(x);
      G.clamp    = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
      G.lerp     = (a, b, t)   => a + (b - a) * t;
      G.map      = (x, a, b, c, d) => c + (x - a) / (b - a) * (d - c);

      G.pi = x => Math.PI;
      G.sqrt = x => Math.sqrt(x);

      // Number theory
      G.factorial = n => {
        n = Math.floor(Math.abs(n));
        if (n === 0 || n === 1) return 1;
        let r = 1;
        for (let i = 2; i <= n; i++) r *= i;
        return r;
      };

      G.isPrime = n => {
        n = Math.floor(n);
        if (n < 2) return false;
        if (n === 2) return true;
        if (n % 2 === 0) return false;
        for (let i = 3; i <= Math.sqrt(n); i += 2)
          if (n % i === 0) return false;
        return true;
      };

      G.gcd = (a, b) => {
        a = Math.abs(Math.floor(a)); b = Math.abs(Math.floor(b));
        while (b) { const t = b; b = a % b; a = t; }
        return a;
      };

      G.lcm = (a, b) => {
        const g = G.gcd(a, b);
        return g === 0 ? 0 : Math.abs(a * b) / g;
      };

      G.fibonacci = n => {
        n = Math.floor(Math.abs(n));
        if (n <= 1) return n;
        let a = 0, b = 1;
        for (let i = 2; i <= n; i++) { const t = a + b; a = b; b = t; }
        return b;
      };

      G.fibSequence = n => {
        const seq = [0, 1];
        for (let i = 2; i < Math.floor(Math.abs(n)); i++)
          seq.push(seq[i-1] + seq[i-2]);
        return seq.slice(0, Math.floor(Math.abs(n)));
      };

      G.primes = n => {
        // Sieve of Eratosthenes up to n
        const sieve = Array(n + 1).fill(true);
        sieve[0] = sieve[1] = false;
        for (let i = 2; i * i <= n; i++)
          if (sieve[i]) for (let j = i*i; j <= n; j += i) sieve[j] = false;
        return sieve.map((v, i) => v ? i : -1).filter(i => i > 0);
      };

      // Combinatorics
      G.combination = (n, r) => {
        if (r > n) return 0;
        return G.factorial(n) / (G.factorial(r) * G.factorial(n - r));
      };

      G.permutation = (n, r) => {
        if (r > n) return 0;
        return G.factorial(n) / G.factorial(n - r);
      };

      // Geometry
      G.hypot      = (...args) => Math.hypot(...args);
      G.distance2D = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
      G.distance3D = (x1,y1,z1, x2,y2,z2) => Math.hypot(x2-x1, y2-y1, z2-z1);

      // Statistics helpers
      G.median = arr => {
        const s = [...arr].sort((a, b) => a - b);
        const m = s.length >> 1;
        return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2;
      };

      G.mode = arr => {
        const count = {};
        arr.forEach(x => count[x] = (count[x] || 0) + 1);
        let maxC = 0, mode = null;
        Object.entries(count).forEach(([k, v]) => { if (v > maxC) { maxC = v; mode = Number(k); } });
        return mode;
      };

      G.variance = arr => {
        const mean = arr.reduce((s, x) => s + x, 0) / arr.length;
        return arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length;
      };

      G.stddev = arr => Math.sqrt(G.variance(arr));

      // Matrix (2D array) helpers
      G.matMul = (A, B) => {
        const rows = A.length, cols = B[0].length, inner = B.length;
        return Array.from({ length: rows }, (_, i) =>
          Array.from({ length: cols }, (_, j) =>
            Array.from({ length: inner }, (_, k) => A[i][k] * B[k][j])
            .reduce((s, v) => s + v, 0)));
      };

      G.matTranspose = A => A[0].map((_, j) => A.map(row => row[j]));
    }
  },

  'time.zl': {
    description: 'Date/time: now, year, month, day, hour, minute, second, format, elapsed…',
    inject(G) {

      G.now        = () => Date.now();                          // ms since epoch
      G.year       = () => new Date().getFullYear();
      G.month      = () => new Date().getMonth() + 1;          // 1-12
      G.day        = () => new Date().getDate();               // 1-31
      G.hour       = () => new Date().getHours();              // 0-23
      G.minute     = () => new Date().getMinutes();
      G.second     = () => new Date().getSeconds();
      G.millisecond= () => new Date().getMilliseconds();
      G.dayOfWeek  = () => ['Sunday','Monday','Tuesday','Wednesday',
                            'Thursday','Friday','Saturday'][new Date().getDay()];
      G.monthName  = () => ['January','February','March','April','May','June',
                            'July','August','September','October','November',
                            'December'][new Date().getMonth()];

      // Formatted strings
      G.dateStr    = () => new Date().toLocaleDateString();
      G.timeStr    = () => new Date().toLocaleTimeString();
      G.timestamp  = () => new Date().toISOString();
      G.dateTimeStr= () => new Date().toLocaleString();

      // Format a timestamp (ms) into a readable string
      G.formatTime = ms => {
        const d = new Date(ms);
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ` +
               `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      };

      // Duration breakdown
      G.msToSeconds = ms => ms / 1000;
      G.msToMinutes = ms => ms / 60000;
      G.msToHours   = ms => ms / 3600000;

      G.formatDuration = ms => {
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const h = Math.floor(m / 60);
        const d = Math.floor(h / 24);
        if (d > 0) return `${d}d ${h%24}h ${m%60}m`;
        if (h > 0) return `${h}h ${m%60}m ${s%60}s`;
        if (m > 0) return `${m}m ${s%60}s`;
        return `${s}s`;
      };

      // Stopwatch  (use timerStart / timerEnd)
      let _timerStart = null;
      G.timerStart = () => { _timerStart = Date.now(); return _timerStart; };
      G.timerEnd   = () => {
        if (_timerStart === null) return 0;
        const elapsed = Date.now() - _timerStart;
        _timerStart = null;
        return elapsed;
      };
      G.timerElapsed = () => _timerStart !== null ? Date.now() - _timerStart : 0;

      // Unix epoch helpers
      G.unixNow     = () => Math.floor(Date.now() / 1000);
      G.fromUnix    = s  => new Date(s * 1000).toLocaleString();
      G.daysBetween = (a, b) => Math.round(Math.abs(b - a) / 86400000);

      // ── Live Clock widget ─────────────────────────────────────
      // startClock(theme?)  — injects a real-time clock into the
      //   terminal output and ticks every 100 ms via setInterval.
      //   theme: 'neon' (default) | 'retro' | 'minimal'
      // stopClock()         — stops the running clock and removes it.

      let _clockInterval = null;
      let _clockEl       = null;

      const _clockThemes = {
        neon: {
          bg:        '#0a0a1a',
          border:    '#00f5ff',
          glow:      '0 0 20px #00f5ff, 0 0 40px #00f5ff44',
          digitClr:  '#00f5ff',
          digitGlow: '0 0 12px #00f5ff, 0 0 30px #00f5ffaa',
          colonClr:  '#00f5ff',
          ampmClr:   '#ff6ec7',
          ampmGlow:  '0 0 10px #ff6ec7',
          dateClr:   '#a0d8ef',
          unixClr:   '#546e7a',
          barBg:     '#0d2233',
          barFill:   'linear-gradient(90deg,#00f5ff,#ff6ec7)',
          secRingClr:'#00f5ff',
          btnBg:     '#ff6ec722',
          btnBdr:    '#ff6ec7',
          btnClr:    '#ff6ec7',
          label:     'ZETA++ NEON CLOCK',
          labelClr:  '#ffffff44',
        },
        retro: {
          bg:        '#1a0e00',
          border:    '#ff8c00',
          glow:      '0 0 16px #ff8c0088',
          digitClr:  '#ffb347',
          digitGlow: '0 0 10px #ff8c00',
          colonClr:  '#ff8c00',
          ampmClr:   '#ffd700',
          ampmGlow:  '0 0 8px #ffd700',
          dateClr:   '#cc8844',
          unixClr:   '#7a5c2e',
          barBg:     '#2a1800',
          barFill:   'linear-gradient(90deg,#ff8c00,#ffd700)',
          secRingClr:'#ff8c00',
          btnBg:     '#ff8c0022',
          btnBdr:    '#ff8c00',
          btnClr:    '#ff8c00',
          label:     'ZETA++ RETRO CLOCK',
          labelClr:  '#ffffff33',
        },
        minimal: {
          bg:        '#111118',
          border:    '#444466',
          glow:      'none',
          digitClr:  '#e2e8f0',
          digitGlow: 'none',
          colonClr:  '#6b7280',
          ampmClr:   '#94a3b8',
          ampmGlow:  'none',
          dateClr:   '#64748b',
          unixClr:   '#374151',
          barBg:     '#1e1e2e',
          barFill:   'linear-gradient(90deg,#6366f1,#818cf8)',
          secRingClr:'#6366f1',
          btnBg:     '#ffffff08',
          btnBdr:    '#4b5563',
          btnClr:    '#9ca3af',
          label:     'ZETA++ CLOCK',
          labelClr:  '#ffffff22',
        },
      };

      G.startClock = (theme = 'neon') => {
        // Stop any existing clock
        if (_clockInterval) { clearInterval(_clockInterval); _clockInterval = null; }
        if (typeof _clockEl !== 'undefined' && _clockEl && _clockEl.parentNode)
          _clockEl.parentNode.removeChild(_clockEl);

        // ── Terminal (Node.js) mode ──────────────────────────
        if (typeof document === 'undefined') {
          const pad2 = n => String(n).padStart(2, '0');
          const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
          const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          process.stdout.write('\n');
          const tick = () => {
            const d = new Date();
            const h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
            const ampm = h >= 12 ? 'PM' : 'AM';
            const h12  = h % 12 || 12;
            const dateStr = `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${pad2(d.getDate())} ${d.getFullYear()}`;
            const timeStr = `\x1b[96m${pad2(h12)}:${pad2(m)}:${pad2(s)}\x1b[93m ${ampm}\x1b[0m`;
            const unixStr = `\x1b[90mUnix: ${Math.floor(Date.now()/1000)}\x1b[0m`;
            process.stdout.write(`\r\x1b[K⏰  ${timeStr}  \x1b[90m${dateStr}\x1b[0m  ${unixStr}  `);
          };
          tick();
          _clockInterval = setInterval(tick, 1000);
          // Keep process alive until stopClock
          if (_clockInterval.unref) _clockInterval.unref = undefined; // keep alive
          return 'Clock started (terminal mode, theme ignored). Call stopClock() to stop.';
        }

        // ── Browser mode (original) ──────────────────────────

        const T  = _clockThemes[theme] || _clockThemes.neon;
        const id = 'zpp-clock-' + Date.now();

        // Build the widget HTML
        const html = `
<div id="${id}" style="
  display:inline-block; min-width:520px;
  background:${T.bg};
  border:2px solid ${T.border};
  border-radius:16px;
  box-shadow:${T.glow};
  padding:28px 36px 22px;
  font-family:'JetBrains Mono','Fira Code',Consolas,monospace;
  margin:8px 0; user-select:none;
">
  <!-- Label -->
  <div style="
    text-align:center; letter-spacing:6px; font-size:11px;
    color:${T.labelClr}; margin-bottom:18px; text-transform:uppercase;
  ">${T.label}</div>

  <!-- Main time row -->
  <div style="display:flex;align-items:baseline;justify-content:center;gap:0">
    <span id="${id}-h"  style="font-size:72px;font-weight:700;letter-spacing:-2px;color:${T.digitClr};text-shadow:${T.digitGlow};line-height:1">00</span>
    <span id="${id}-c1" style="font-size:60px;font-weight:300;color:${T.colonClr};margin:0 4px;line-height:1;animation:${id}blink 1s step-end infinite">:</span>
    <span id="${id}-m"  style="font-size:72px;font-weight:700;letter-spacing:-2px;color:${T.digitClr};text-shadow:${T.digitGlow};line-height:1">00</span>
    <span id="${id}-c2" style="font-size:60px;font-weight:300;color:${T.colonClr};margin:0 4px;line-height:1;animation:${id}blink 1s step-end infinite">:</span>
    <span id="${id}-s"  style="font-size:72px;font-weight:700;letter-spacing:-2px;color:${T.digitClr};text-shadow:${T.digitGlow};line-height:1">00</span>
    <span id="${id}-ap" style="font-size:22px;font-weight:600;color:${T.ampmClr};text-shadow:${T.ampmGlow};margin-left:12px;align-self:flex-start;padding-top:12px">AM</span>
  </div>

  <!-- Millisecond progress bar -->
  <div style="margin:16px 0 6px;background:${T.barBg};border-radius:4px;height:6px;overflow:hidden;">
    <div id="${id}-ms" style="height:100%;width:0%;background:${T.barFill};border-radius:4px;transition:width 0.1s linear;"></div>
  </div>
  <div style="display:flex;justify-content:space-between;font-size:10px;color:${T.unixClr};margin-bottom:16px">
    <span>0ms</span><span id="${id}-msv" style="color:${T.dateClr}">0ms</span><span>999ms</span>
  </div>

  <!-- Seconds ring row -->
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="24" fill="none" stroke="${T.barBg}" stroke-width="5"/>
      <circle id="${id}-ring" cx="28" cy="28" r="24" fill="none"
        stroke="${T.secRingClr}" stroke-width="5"
        stroke-dasharray="150.8" stroke-dashoffset="150.8"
        stroke-linecap="round"
        transform="rotate(-90 28 28)"
        style="transition:stroke-dashoffset 0.1s linear;"/>
      <text id="${id}-sv" x="28" y="33" text-anchor="middle"
        fill="${T.digitClr}" font-size="13" font-family="monospace" font-weight="700">00</text>
    </svg>
    <div>
      <div id="${id}-date" style="font-size:15px;color:${T.dateClr};letter-spacing:1px;">Loading…</div>
      <div id="${id}-unix" style="font-size:11px;color:${T.unixClr};margin-top:4px;">Unix: …</div>
      <div id="${id}-24h" style="font-size:11px;color:${T.unixClr};margin-top:2px;">24h: …</div>
    </div>
  </div>

  <!-- Stop button -->
  <div style="text-align:center">
    <button onclick="
      (function(){
        var el=document.getElementById('${id}');
        if(window.__zppClockStop)window.__zppClockStop();
        if(el)el.innerHTML='<span style=\\'color:#546e7a;font-size:13px\\'>⏹ Clock stopped.</span>';
      })()
    " style="
      background:${T.btnBg}; border:1px solid ${T.btnBdr};
      color:${T.btnClr}; border-radius:6px; padding:5px 18px;
      font-family:inherit; font-size:12px; cursor:pointer; letter-spacing:2px;
    ">⏹ STOP</button>
  </div>
</div>
<style>
@keyframes ${id}blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
</style>`;

        // Inject into output terminal
        const out = document.getElementById('output');
        if (!out) return 'startClock: no #output element found (browser only)';

        const wrap = document.createElement('div');
        wrap.innerHTML = html;
        out.appendChild(wrap);
        _clockEl = wrap;
        out.scrollTop = out.scrollHeight;

        const pad2 = n => String(n).padStart(2, '0');
        const MONTHS = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];
        const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

        const tick = () => {
          const now  = new Date();
          const h24  = now.getHours();
          const m    = now.getMinutes();
          const s    = now.getSeconds();
          const ms   = now.getMilliseconds();
          const h12  = h24 % 12 || 12;
          const ampm = h24 >= 12 ? 'PM' : 'AM';

          const g = sel => document.getElementById(id + sel);
          const set = (sel, v) => { const el = g(sel); if (el) el.textContent = v; };
          const style = (sel, p, v) => { const el = g(sel); if (el) el.style[p] = v; };

          set('-h',  pad2(h12));
          set('-m',  pad2(m));
          set('-s',  pad2(s));
          set('-ap', ampm);
          set('-sv', pad2(s));
          set('-msv', ms + 'ms');
          style('-ms', 'width', ((ms / 1000) * 100).toFixed(1) + '%');

          // Seconds ring: circumference = 2π×24 ≈ 150.8
          const dashOffset = (150.8 * (1 - s / 60)).toFixed(2);
          const ring = g('-ring');
          if (ring) ring.setAttribute('stroke-dashoffset', dashOffset);

          const dateStr = DAYS[now.getDay()] + ', ' +
            MONTHS[now.getMonth()] + ' ' + pad2(now.getDate()) +
            ', ' + now.getFullYear();
          set('-date', dateStr);
          set('-unix', 'Unix: ' + Math.floor(Date.now() / 1000));
          set('-24h',  '24h: ' + pad2(h24) + ':' + pad2(m) + ':' + pad2(s));
        };

        tick();
        _clockInterval = setInterval(tick, 100);

        // Expose stop globally so the button can call it
        window.__zppClockStop = () => {
          if (_clockInterval) { clearInterval(_clockInterval); _clockInterval = null; }
        };

        return 'Clock started. (theme: ' + theme + ')';
      };

      G.stopClock = () => {
        if (_clockInterval) {
          clearInterval(_clockInterval);
          _clockInterval = null;
        }
        if (typeof document === 'undefined') {
          process.stdout.write('\n\x1b[90m⏹ Clock stopped.\x1b[0m\n');
          return 'Clock stopped.';
        }
        if (_clockEl && _clockEl.parentNode) {
          const stopped = document.createElement('div');
          stopped.style.cssText = 'color:#546e7a;font-size:13px;padding:4px 0';
          stopped.textContent   = '⏹ Clock stopped.';
          _clockEl.parentNode.replaceChild(stopped, _clockEl);
          _clockEl = null;
        }
        return 'Clock stopped.';
      };

      // ── termClock() — plain text clock, lives inside the terminal ──
      // Renders as a single updating pre block — pure monospace text,
      // no widgets. Ticks every second.
      // stopClock() stops it just like startClock().

      G.termClock = () => {
        if (_clockInterval) { clearInterval(_clockInterval); _clockInterval = null; }
        if (typeof _clockEl !== 'undefined' && _clockEl && _clockEl.parentNode)
          _clockEl.parentNode.removeChild(_clockEl);

        if (typeof document === 'undefined') {
          return G.startClock('minimal');
        }

        const out = document.getElementById('output');
        if (!out) return 'termClock: browser only';

        const pre = document.createElement('pre');
        pre.style.cssText = [
          'margin:6px 0', 'padding:0',
          'background:transparent', 'border:none',
          'font-family:inherit', 'font-size:inherit',
          'line-height:inherit', 'color:#e2e8f0',
          'white-space:pre',
        ].join(';');
        out.appendChild(pre);
        _clockEl = pre;
        out.scrollTop = out.scrollHeight;

        const pad  = n => String(n).padStart(2,'0');
        const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const MONS = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];

        // 5x7 pixel-font digits (each char = 1 pixel, 5 wide × 7 tall)
        const GLYPHS = {
          '0': ['\u2588\u2588\u2588\u2588\u2588','\u2588   \u2588','\u2588   \u2588','\u2588   \u2588','\u2588   \u2588','\u2588   \u2588','\u2588\u2588\u2588\u2588\u2588'],
          '1': ['  \u2588  ','  \u2588  ','  \u2588  ','  \u2588  ','  \u2588  ','  \u2588  ','  \u2588  '],
          '2': ['\u2588\u2588\u2588\u2588\u2588','    \u2588','    \u2588','\u2588\u2588\u2588\u2588\u2588','\u2588    ','\u2588    ','\u2588\u2588\u2588\u2588\u2588'],
          '3': ['\u2588\u2588\u2588\u2588\u2588','    \u2588','    \u2588','\u2588\u2588\u2588\u2588\u2588','    \u2588','    \u2588','\u2588\u2588\u2588\u2588\u2588'],
          '4': ['\u2588   \u2588','\u2588   \u2588','\u2588   \u2588','\u2588\u2588\u2588\u2588\u2588','    \u2588','    \u2588','    \u2588'],
          '5': ['\u2588\u2588\u2588\u2588\u2588','\u2588    ','\u2588    ','\u2588\u2588\u2588\u2588\u2588','    \u2588','    \u2588','\u2588\u2588\u2588\u2588\u2588'],
          '6': ['\u2588\u2588\u2588\u2588\u2588','\u2588    ','\u2588    ','\u2588\u2588\u2588\u2588\u2588','\u2588   \u2588','\u2588   \u2588','\u2588\u2588\u2588\u2588\u2588'],
          '7': ['\u2588\u2588\u2588\u2588\u2588','    \u2588','    \u2588','    \u2588','    \u2588','    \u2588','    \u2588'],
          '8': ['\u2588\u2588\u2588\u2588\u2588','\u2588   \u2588','\u2588   \u2588','\u2588\u2588\u2588\u2588\u2588','\u2588   \u2588','\u2588   \u2588','\u2588\u2588\u2588\u2588\u2588'],
          '9': ['\u2588\u2588\u2588\u2588\u2588','\u2588   \u2588','\u2588   \u2588','\u2588\u2588\u2588\u2588\u2588','    \u2588','    \u2588','\u2588\u2588\u2588\u2588\u2588'],
          ':': ['     ','  \u2588  ','  \u2588  ','     ','  \u2588  ','  \u2588  ','     '],
          ' ': ['     ','     ','     ','     ','     ','     ','     '],
        };

        const renderTime = (str) => {
          const rows = Array(7).fill('');
          for (const ch of str) {
            const g = GLYPHS[ch] || GLYPHS[' '];
            for (let r = 0; r < 7; r++) rows[r] += g[r] + ' ';
          }
          return rows.join('\n');
        };

        const tick = () => {
          const now  = new Date();
          const h24  = now.getHours();
          const m    = now.getMinutes();
          const s    = now.getSeconds();
          const ms   = now.getMilliseconds();
          const h12  = h24 % 12 || 12;
          const ampm = h24 >= 12 ? 'PM' : 'AM';

          const timeStr = pad(h12) + ':' + pad(m) + ':' + pad(s);
          const big     = renderTime(timeStr);

          // Millisecond bar — 40 chars wide
          const BAR_W   = 40;
          const filled  = Math.round((ms / 1000) * BAR_W);
          const bar     = '\u2588'.repeat(filled) + '\u2591'.repeat(BAR_W - filled);

          const dateStr = DAYS[now.getDay()] + '  ' +
            MONS[now.getMonth()] + ' ' + pad(now.getDate()) +
            '  ' + now.getFullYear();
          const unix    = 'Unix: ' + Math.floor(Date.now()/1000);
          const h24str  = '24h: ' + pad(h24)+':'+pad(m)+':'+pad(s) + '  ' + ampm;
          const width   = 44;
          const line    = '\u2500'.repeat(width);

          const center  = (txt) => {
            const pad2 = Math.max(0, Math.floor((width - txt.length) / 2));
            return ' '.repeat(pad2) + txt;
          };

          pre.textContent = [
            center('\u250c' + line + '\u2510'),
            big.split('\n').map(r => center('\u2502 ' + r.padEnd(width-2) + ' \u2502')).join('\n'),
            center('\u2502' + ' '.repeat(width) + '\u2502'),
            center('\u2502  [' + bar + ']  \u2502'),
            center('\u2502' + ' '.repeat(width) + '\u2502'),
            center('\u2502  ' + dateStr.padEnd(width-4) + '  \u2502'),
            center('\u2502  ' + h24str.padEnd(width-4) + '  \u2502'),
            center('\u2502  ' + unix.padEnd(width-4)    + '  \u2502'),
            center('\u2514' + line + '\u2518'),
          ].join('\n');

          out.scrollTop = out.scrollHeight;
        };

        tick();
        _clockInterval = setInterval(tick, 1000);
        window.__zppClockStop = () => {
          if (_clockInterval) { clearInterval(_clockInterval); _clockInterval = null; }
        };
        return null;   // no extra print — the clock IS the output
      };
    }
  },

  'net.zl': {
    description: 'Fetch URL data: fetchText, fetchJSON, fetchCSV, fetchLines, fetchTable…',
    inject(G) {

      // Core sync fetch — returns raw text or throws
      const _syncFetch = url => {
        // ── Browser ──────────────────────────────────────────
        if (typeof XMLHttpRequest !== 'undefined') {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', url, false);   // false = synchronous
          try { xhr.send(); }
          catch (e) { throw new Error(`net: fetch failed for "${url}": ${e.message}`); }
          if (xhr.status < 200 || xhr.status >= 300)
            throw new Error(`net: HTTP ${xhr.status} for "${url}"`);
          return xhr.responseText;
        }
        // ── Node.js ──────────────────────────────────────────
        try {
          const { execSync } = require('child_process');
          // Try curl first, then wget as fallback
          try {
            return execSync(`curl -sL --max-time 10 "${url}"`, { timeout: 12000 }).toString();
          } catch (_) {
            return execSync(`wget -qO- "${url}"`, { timeout: 12000 }).toString();
          }
        } catch (e) {
          throw new Error(`net: fetch failed for "${url}": ${e.message}\n  Hint: make sure curl or wget is installed.`);
        }
      };

      // fetchText(url) → raw string
      G.fetchText = url => _syncFetch(String(url));

      // fetchLines(url) → array of strings, one per line (empty lines removed)
      G.fetchLines = url => _syncFetch(String(url))
        .split('\n')
        .map(l => l.replace(/\r$/, ''))
        .filter(l => l.length > 0);

      // fetchJSON(url) → parsed JS object / array
      G.fetchJSON = url => {
        const text = _syncFetch(String(url));
        try { return JSON.parse(text); }
        catch (e) { throw new Error(`net: invalid JSON from "${url}": ${e.message}`); }
      };

      G.fetchCSV = (url, hasHeader = true) => {
        const lines = _syncFetch(String(url))
          .split('\n')
          .map(l => l.replace(/\r$/, ''))
          .filter(l => l.length > 0);

        const parseRow = line => {
          // Handles quoted fields with commas inside
          const row = [];
          let field = '', inQuote = false;
          for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') { inQuote = !inQuote; continue; }
            if (c === ',' && !inQuote) { row.push(field.trim()); field = ''; }
            else field += c;
          }
          row.push(field.trim());
          return row;
        };

        if (!hasHeader) return lines.map(parseRow);

        const headers = parseRow(lines[0]);
        return lines.slice(1).map(line => {
          const vals = parseRow(line);
          const obj = {};
          headers.forEach((h, i) => {
            const v = vals[i] ?? '';
            const n = Number(v);
            obj[h] = (v !== '' && !isNaN(n)) ? n : v;
          });
          return obj;
        });
      };

      G.fetchTable = url => {
        const rows = G.fetchCSV(url, true);
        if (!rows.length) return '(empty)';
        const headers = Object.keys(rows[0]);
        const widths  = headers.map(h =>
          Math.max(h.length, ...rows.map(r => String(r[h] ?? '').length)));
        const pad = (s, w) => String(s).padEnd(w);
        const sep  = '+' + widths.map(w => '-'.repeat(w + 2)).join('+') + '+';
        const head = '| ' + headers.map((h, i) => pad(h, widths[i])).join(' | ') + ' |';
        const body = rows.map(r =>
          '| ' + headers.map((h, i) => pad(r[h] ?? '', widths[i])).join(' | ') + ' |');
        return [sep, head, sep, ...body, sep].join('\n');
      };

      // jsonGet(obj, path) — deep get from parsed JSON: jsonGet(data, "user.name")
      G.jsonGet = (obj, path) => {
        const parts = String(path).split('.');
        let cur = obj;
        for (const p of parts) {
          if (cur === null || cur === undefined) return null;
          cur = cur[p];
        }
        return cur ?? null;
      };

      // jsonKeys(obj) → array of keys at top level
      G.jsonKeys  = obj => Object.keys(obj);

      // jsonToArray(obj) → converts array-like JSON to DSA-Lang array
      G.jsonToArray = obj => Array.isArray(obj) ? obj : Object.values(obj);
    }
  },

  'convert.zl': {
    description: 'Unit conversions: temperature, distance, weight, speed, data size…',
    inject(G) {
      // Temperature
      G.cToF      = c => c * 9/5 + 32;
      G.fToC      = f => (f - 32) * 5/9;
      G.cToK      = c => c + 273.15;
      G.kToC      = k => k - 273.15;

      // Distance
      G.kmToMiles  = km => km * 0.621371;
      G.milesToKm  = m  => m  * 1.60934;
      G.mToFt      = m  => m  * 3.28084;
      G.ftToM      = f  => f  * 0.3048;
      G.mToInches  = m  => m  * 39.3701;
      G.cmToInches = c  => c  * 0.393701;
      G.inchesToCm = i  => i  * 2.54;

      // Weight
      G.kgToLbs   = kg => kg * 2.20462;
      G.lbsToKg   = lb => lb * 0.453592;
      G.gToOz     = g  => g  * 0.035274;
      G.ozToG     = oz => oz * 28.3495;

      // Speed
      G.kmhToMph  = k => k * 0.621371;
      G.mphToKmh  = m => m * 1.60934;
      G.msToKmh   = m => m * 3.6;
      G.kmhToMs   = k => k / 3.6;

      // Data size (base-1024)
      G.bytesToKB = b  => b  / 1024;
      G.bytesToMB = b  => b  / (1024 ** 2);
      G.bytesToGB = b  => b  / (1024 ** 3);
      G.kbToBytes = kb => kb * 1024;
      G.mbToBytes = mb => mb * (1024 ** 2);
      G.gbToBytes = gb => gb * (1024 ** 3);

      G.formatBytes = b => {
        if (b >= 1024**3) return (b/1024**3).toFixed(2) + ' GB';
        if (b >= 1024**2) return (b/1024**2).toFixed(2) + ' MB';
        if (b >= 1024)    return (b/1024).toFixed(2) + ' KB';
        return b + ' B';
      };
    }
  },

  'random.zl': {
    description: 'Random: uuid, shuffle, pick, coin, dice, gaussianRandom, seed…',
    inject(G) {

      let _seed = Date.now();
      G.setSeed = s => { _seed = s >>> 0; };
      const _seeded = () => {
        _seed |= 0; _seed = _seed + 0x6D2B79F5 | 0;
        let t = Math.imul(_seed ^ _seed >>> 15, 1 | _seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };

      G.randSeed  = ()       => _seeded();
      G.randInt   = (a, b)   => Math.floor(Math.random() * (b - a + 1)) + a;
      G.randFloat = (a, b)   => Math.random() * (b - a) + a;
      G.randBool  = ()       => Math.random() < 0.5;
      G.coinFlip  = ()       => Math.random() < 0.5 ? 'heads' : 'tails';
      G.dice      = sides    => Math.floor(Math.random() * (sides || 6)) + 1;

      G.pick      = arr      => arr[Math.floor(Math.random() * arr.length)];

      G.shuffle   = arr => {
        arr = [...arr];
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      };
      G.sample = (arr, k) => G.shuffle(arr).slice(0, k);

      
      G.gaussianRandom = (mean = 0, std = 1) => {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      };

      // UUID v4
      G.uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
    }
  },

  
  'str.zl': {
    description: 'Extended strings: count, wrap, truncate, titleCase, camelCase, template…',
    inject(G) {
      G.countOccurrences = (s, sub) => {
        let count = 0, pos = 0;
        while ((pos = s.indexOf(sub, pos)) !== -1) { count++; pos += sub.length; }
        return count;
      };

      G.isPalindrome = s => {
        const clean = s.toLowerCase().replace(/[^a-z0-9]/g, '');
        return clean === clean.split('').reverse().join('');
      };

      G.titleCase  = s => s.replace(/\w\S*/g, t => t[0].toUpperCase() + t.slice(1).toLowerCase());
      G.camelCase  = s => s.replace(/[-_\s]+(.)/g, (_, c) => c.toUpperCase()).replace(/^./, c => c.toLowerCase());
      G.snakeCase  = s => s.replace(/\s+/g, '_').replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
      G.capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

      G.truncate   = (s, n, suffix = '…') =>
        s.length > n ? s.slice(0, n - suffix.length) + suffix : s;

      G.wordWrap   = (s, width) => {
        const words = s.split(' ');
        const lines = []; let line = '';
        words.forEach(w => {
          if ((line + ' ' + w).trim().length <= width) {
            line = (line + ' ' + w).trim();
          } else { if (line) lines.push(line); line = w; }
        });
        if (line) lines.push(line);
        return lines.join('\n');
      };

      G.countWords  = s => s.trim().split(/\s+/).filter(w => w).length;
      G.countLines  = s => s.split('\n').length;
      G.reverseStr  = s => s.split('').reverse().join('');
      G.reverseWords= s => s.split(' ').reverse().join(' ');

      G.isNumStr    = s => s.trim() !== '' && !isNaN(Number(s.trim()));
      G.isEmailStr  = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
      G.isURLStr    = s => { try { new URL(s); return true; } catch { return false; } };

      G.lpad        = (s, n, c = ' ') => String(s).padStart(n, c);
      G.rpad        = (s, n, c = ' ') => String(s).padEnd(n, c);
      G.center      = (s, n, c = ' ') => {
        s = String(s);
        const total = n - s.length;
        if (total <= 0) return s;
        const left = Math.floor(total / 2);
        return c.repeat(left) + s + c.repeat(total - left);
      };

      G.escapeHtml  = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;')
                            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      G.stripHtml   = s => s.replace(/<[^>]*>/g, '');
      G.countChar   = (s, c) => [...s].filter(ch => ch === c).length;

      // Simple string template: template("Hello {name}!", {name: "Alice"})
      G.template = (s, vars) => {
        return s.replace(/\{([^}]+)\}/g, (_, key) =>
          vars[key] !== undefined ? String(vars[key]) : `{${key}}`);
      };
    }
  },

  'algo.zl': {
    description: 'Data structures: stack, queue, linkedList, priorityQueue, graph helpers…',
    inject(G) {

      // ── Stack ────────────────────────────────────────────
      G.makeStack = () => ({
        data: [], size: 0,
        push:  function(v) { this.data.push(v); this.size++; },
        pop:   function()  { if (!this.size) throw new Error('Stack underflow'); this.size--; return this.data.pop(); },
        peek:  function()  { return this.data[this.size - 1]; },
        isEmpty: function(){ return this.size === 0; },
        toArray: function(){ return [...this.data]; }
      });

      // ── Queue ────────────────────────────────────────────
      G.makeQueue = () => ({
        data: [], head: 0,
        enqueue: function(v) { this.data.push(v); },
        dequeue: function()  {
          if (this.head >= this.data.length) throw new Error('Queue empty');
          return this.data[this.head++];
        },
        peek:    function()  { return this.data[this.head]; },
        isEmpty: function()  { return this.head >= this.data.length; },
        size:    function()  { return this.data.length - this.head; },
        toArray: function()  { return this.data.slice(this.head); }
      });

      // ── Min Priority Queue ───────────────────────────────
      G.makeMinPQ = () => ({
        heap: [],
        push: function(val, priority) {
          this.heap.push({ val, priority });
          let i = this.heap.length - 1;
          while (i > 0) {
            const p = (i - 1) >> 1;
            if (this.heap[p].priority <= this.heap[i].priority) break;
            [this.heap[p], this.heap[i]] = [this.heap[i], this.heap[p]]; i = p;
          }
        },
        pop: function() {
          if (!this.heap.length) throw new Error('PriorityQueue empty');
          const top = this.heap[0];
          const last = this.heap.pop();
          if (this.heap.length) {
            this.heap[0] = last;
            let i = 0;
            while (true) {
              let s = i, l = 2*i+1, r = 2*i+2;
              if (l < this.heap.length && this.heap[l].priority < this.heap[s].priority) s = l;
              if (r < this.heap.length && this.heap[r].priority < this.heap[s].priority) s = r;
              if (s === i) break;
              [this.heap[i], this.heap[s]] = [this.heap[s], this.heap[i]]; i = s;
            }
          }
          return top.val;
        },
        peek:    function() { return this.heap[0]?.val; },
        isEmpty: function() { return this.heap.length === 0; },
        size:    function() { return this.heap.length; }
      });

      // ── Linked list node helper ──────────────────────────
      G.makeNode     = val => ({ val, next: null });
      G.makeLinkedList = () => ({
        head: null, size: 0,
        push: function(val) {
          const n = G.makeNode(val);
          if (!this.head) { this.head = n; }
          else { let c = this.head; while (c.next) c = c.next; c.next = n; }
          this.size++;
        },
        pop: function() {
          if (!this.head) throw new Error('List empty');
          if (!this.head.next) { const v = this.head.val; this.head = null; this.size--; return v; }
          let c = this.head;
          while (c.next.next) c = c.next;
          const v = c.next.val; c.next = null; this.size--; return v;
        },
        toArray: function() {
          const arr = []; let c = this.head;
          while (c) { arr.push(c.val); c = c.next; }
          return arr;
        }
      });

      // ── Graph helpers (adjacency list) ───────────────────
      G.makeGraph = (directed = false) => ({
        adj: {},
        addNode: function(n) { if (!this.adj[n]) this.adj[n] = []; },
        addEdge: function(a, b, w = 1) {
          this.addNode(a); this.addNode(b);
          this.adj[a].push({ to: b, w });
          if (!directed) this.adj[b].push({ to: a, w });
        },
        neighbors: function(n) { return (this.adj[n] || []).map(e => e.to); },
        bfs: function(start) {
          const visited = {}, order = [];
          const q = [start]; visited[start] = true;
          while (q.length) {
            const n = q.shift(); order.push(n);
            for (const e of (this.adj[n] || []))
              if (!visited[e.to]) { visited[e.to] = true; q.push(e.to); }
          }
          return order;
        },
        dfs: function(start) {
          const visited = {}, order = [];
          const go = n => {
            visited[n] = true; order.push(n);
            for (const e of (this.adj[n] || []))
              if (!visited[e.to]) go(e.to);
          };
          go(start); return order;
        },
        dijkstra: function(start) {
          const dist = {}, pq = G.makeMinPQ();
          Object.keys(this.adj).forEach(n => dist[n] = Infinity);
          dist[start] = 0; pq.push(start, 0);
          while (!pq.isEmpty()) {
            const u = pq.pop();
            for (const e of (this.adj[u] || [])) {
              const nd = dist[u] + e.w;
              if (nd < dist[e.to]) { dist[e.to] = nd; pq.push(e.to, nd); }
            }
          }
          return dist;
        }
      });
    }
  }

};

if (typeof module !== 'undefined') module.exports = { DSALibraries };