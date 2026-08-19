// ════════════════════════════════════════════════════════════════════════════
//  crtlib.zl  —  Custom Runtime Library  v2.0
//
//  • Define your own functions and call them by bare name anywhere in .zpp
//  • No $ in ZPP syntax — $ is stripped automatically so the parser never chokes
//  • Commas in arguments work: every name is pushed to registerBuiltins instantly
//  • Built-in numeric types: float  double  long  int  uint  byte  short  …
//  • Save / export / import functions across files
//  • All management functions are themselves global (no crt.xxx required)
//
//  Browser + Node/Electron compatible
// ════════════════════════════════════════════════════════════════════════════
(function () {
'use strict';

// ─────────────────────────────────────────────────────────────────────────
//  Internal state
// ─────────────────────────────────────────────────────────────────────────
const _registry = Object.create(null);   // name → { fn, meta }
const _store    = Object.create(null);   // name → { src, meta }  (serialisable)
const _NAME_RE  = /^[A-Za-z_][A-Za-z0-9_]*$/;

let _ZPP = null;   // window.__ZPP__  once inject() runs
let _G   = null;   // interpreter global scope G passed to inject()

// ─────────────────────────────────────────────────────────────────────────
//  _cleanName
//  Strip a leading $ so users can write define('$myFunc', fn) and it still
//  works.  The ZPP parser never sees the $; it only sees the bare name.
// ─────────────────────────────────────────────────────────────────────────
function _cleanName(raw) {
  const name = (typeof raw === 'string' && raw[0] === '$') ? raw.slice(1) : raw;
  if (typeof name !== 'string' || !_NAME_RE.test(name))
    throw new TypeError(
      `crtlib: "${raw}" is not a valid function name. ` +
      `Use letters/digits/underscores starting with a letter or _.`
    );
  return name;
}

function _guardFn(fn, label) {
  if (typeof fn !== 'function')
    throw new TypeError(`crtlib: ${label} must be a function, got ${typeof fn}`);
}

// ─────────────────────────────────────────────────────────────────────────
//  _injectGlobal
//
//  Push a function into EVERY scope the ZPP interpreter can reach:
//    • window        (browser)
//    • global        (Node / Electron)
//    • globalThis    (universal fallback)
//    • G             (interpreter's own global scope object)
//
//  Then call registerBuiltins so the PARSER knows the name is a callable.
//  This is the fix for the comma-in-arguments parse error — the parser
//  only allows  name(a, b, c)  syntax for names it has been told about.
// ─────────────────────────────────────────────────────────────────────────
function _injectGlobal(name, fn) {
  if (typeof window     !== 'undefined') window[name]     = fn;
  if (typeof global     !== 'undefined') global[name]     = fn;
  if (typeof globalThis !== 'undefined') globalThis[name] = fn;
  if (_G)                                _G[name]         = fn;

  // Tell the ZPP parser about this name RIGHT NOW so that any call
  // written after this point in the same file parses without errors.
  if (_ZPP && typeof _ZPP.registerBuiltins === 'function') {
    _ZPP.registerBuiltins([name]);
  }
}

function _ejectGlobal(name) {
  if (typeof window     !== 'undefined') delete window[name];
  if (typeof global     !== 'undefined') delete global[name];
  if (typeof globalThis !== 'undefined') delete globalThis[name];
  if (_G)                                delete _G[name];
}

// ─────────────────────────────────────────────────────────────────────────
//  _hydrate  —  reconstruct a live function from its .toString() source
// ─────────────────────────────────────────────────────────────────────────
function _hydrate(src) {
  // eslint-disable-next-line no-new-func
  return new Function(`return (${src})`)();
}


// ═════════════════════════════════════════════════════════════════════════
//
//  SECTION 1 — NUMERIC TYPE EMULATIONS
//
//  ZPP has no float / double / long / int / uint / byte / short.
//  These functions fill that gap.  They are all injected as globals.
//
// ═════════════════════════════════════════════════════════════════════════

// ── float(x) ──────────────────────────────────────────────────────────────
//   Convert to a floating-point number (IEEE-754 double, same as JS Number).
//   float(3)      →  3.0
//   float("2.5")  →  2.5
//   float(true)   →  1.0
function float(x) {
  const n = Number(x);
  if (isNaN(n)) throw new TypeError(`float: cannot convert ${JSON.stringify(x)} to float`);
  return n;
}

// ── double(x) ─────────────────────────────────────────────────────────────
//   Alias of float.  JS Numbers are already 64-bit doubles.
//   Provided so code written with a C / Java mental model still reads right.
const double = float;

// ── int(x) ────────────────────────────────────────────────────────────────
//   Truncate to a 32-bit signed integer  (−2 147 483 648 … 2 147 483 647).
//   int(3.9)   →  3
//   int(-1.1)  →  -1
function int(x) {
  const n = Number(x);
  if (isNaN(n)) throw new TypeError(`int: cannot convert ${JSON.stringify(x)} to int`);
  return (n | 0);
}

// ── uint(x) ───────────────────────────────────────────────────────────────
//   Truncate to a 32-bit UNSIGNED integer  (0 … 4 294 967 295).
//   uint(-1)          →  4294967295
//   uint(4294967296)  →  0   (wraps)
function uint(x) {
  const n = Number(x);
  if (isNaN(n)) throw new TypeError(`uint: cannot convert ${JSON.stringify(x)} to uint`);
  return (n >>> 0);
}

// ── long(x) ───────────────────────────────────────────────────────────────
//   Convert to a BigInt (arbitrary-precision integer, models 64-bit long).
//   long(9007199254740993)  →  9007199254740993n   (exact, no float drift)
//   long("12345678901234")  →  12345678901234n
function long(x) {
  try { return BigInt(typeof x === 'number' ? Math.trunc(x) : x); }
  catch (_) { throw new TypeError(`long: cannot convert ${JSON.stringify(x)} to long`); }
}

// ── ulong(x) ──────────────────────────────────────────────────────────────
//   Unsigned 64-bit long.  Negative BigInts are clamped to 0n.
function ulong(x) {
  const n = long(x);
  return n < 0n ? 0n : n;
}

// ── short(x) ──────────────────────────────────────────────────────────────
//   Signed 16-bit integer  (−32 768 … 32 767).
function short(x) {
  const n = Number(x);
  if (isNaN(n)) throw new TypeError(`short: cannot convert ${JSON.stringify(x)} to short`);
  const t = (n & 0xFFFF);          // keep lower 16 bits
  return (t << 16) >> 16;          // sign-extend
}

// ── ushort(x) ─────────────────────────────────────────────────────────────
//   Unsigned 16-bit integer  (0 … 65 535).
function ushort(x) {
  const n = Number(x);
  if (isNaN(n)) throw new TypeError(`ushort: cannot convert ${JSON.stringify(x)} to ushort`);
  return (n & 0xFFFF);
}

// ── byte(x) ───────────────────────────────────────────────────────────────
//   Unsigned 8-bit integer  (0 … 255).
function byte(x) {
  const n = Number(x);
  if (isNaN(n)) throw new TypeError(`byte: cannot convert ${JSON.stringify(x)} to byte`);
  return (n & 0xFF);
}

// ── sbyte(x) ──────────────────────────────────────────────────────────────
//   Signed 8-bit integer  (−128 … 127).
function sbyte(x) {
  const n = Number(x);
  if (isNaN(n)) throw new TypeError(`sbyte: cannot convert ${JSON.stringify(x)} to sbyte`);
  const t = (n & 0xFF);
  return (t << 24) >> 24;
}

// ── bool(x) ───────────────────────────────────────────────────────────────
//   Convert to boolean.  Recognises "false" / "0" strings as false.
function bool(x) {
  if (typeof x === 'string') {
    const s = x.trim().toLowerCase();
    if (s === 'false' || s === '0' || s === 'no' || s === '') return false;
    return true;
  }
  return Boolean(x);
}

// ── char(x) ───────────────────────────────────────────────────────────────
//   Convert to a single character.
//   char(65)     →  'A'
//   char("abc")  →  'a'   (first character)
function char(x) {
  if (typeof x === 'number') return String.fromCharCode(Math.trunc(x));
  if (typeof x === 'string') return x[0] ?? '';
  if (typeof x === 'bigint') return String.fromCharCode(Number(x & 0xFFFFn));
  return String(x)[0] ?? '';
}

// ── str(x) ────────────────────────────────────────────────────────────────
//   Explicit string conversion.  Nicer than calling String() in .zpp.
function str(x) {
  if (typeof x === 'bigint') return x.toString();
  return String(x);
}

// ─────────────────────────────────────────────────────────────────────────
//  Numeric type utilities
// ─────────────────────────────────────────────────────────────────────────

// ── isFloat(x) ────────────────────────────────────────────────────────────
//   true if x is a Number with a fractional part.
function isFloat(x) { return typeof x === 'number' && !Number.isInteger(x); }

// ── isInt(x) ──────────────────────────────────────────────────────────────
//   true if x is an integer-valued Number (not BigInt).
function isInt(x)   { return typeof x === 'number' && Number.isInteger(x); }

// ── isLong(x) ─────────────────────────────────────────────────────────────
//   true if x is a BigInt (what long() returns).
function isLong(x)  { return typeof x === 'bigint'; }

// ── isNum(x) ──────────────────────────────────────────────────────────────
//   true for any Number that is not NaN.
function isNum(x)   { return typeof x === 'number' && !isNaN(x); }

// ── clamp(val, min, max) ──────────────────────────────────────────────────
//   Constrain val between min and max (inclusive).
function clamp(val, lo, hi) { return val < lo ? lo : val > hi ? hi : val; }

// ── lerp(a, b, t) ─────────────────────────────────────────────────────────
//   Linear interpolate between a and b by factor t  (0 → a, 1 → b).
function lerp(a, b, t) { return a + (b - a) * t; }

// ── roundTo(val, decimals) ────────────────────────────────────────────────
//   Round val to a fixed number of decimal places.
//   roundTo(3.14159, 2)  →  3.14
function roundTo(val, decimals) {
  const f = Math.pow(10, decimals);
  return Math.round(val * f) / f;
}

// ── frac(x) ───────────────────────────────────────────────────────────────
//   Fractional part.  frac(3.75)  →  0.75
function frac(x) { return x - Math.trunc(x); }

// ── sign(x) ───────────────────────────────────────────────────────────────
//   Returns −1, 0, or 1.
function sign(x) { return x < 0 ? -1 : x > 0 ? 1 : 0; }

// ── inRange(val, lo, hi) ─────────────────────────────────────────────────
//   true if lo ≤ val ≤ hi.
function inRange(val, lo, hi) { return val >= lo && val <= hi; }

// ── toFloat(x)  toInt(x)  toLong(x) ─────────────────────────────────────
//   Explicit conversion helpers (same as float/int/long, alternate names).
const toFloat = float;
const toInt   = int;
const toLong  = long;


// ═════════════════════════════════════════════════════════════════════════
//
//  SECTION 2 — CORE MANAGEMENT (the crt object)
//
//  All methods are ALSO injected as global bare functions so that .zpp
//  files can call:   define("myFunc", ...)   without any crt. prefix.
//
// ═════════════════════════════════════════════════════════════════════════

const crt = {

  // ── define(name, fn [, meta]) ─────────────────────────────────────────
  //
  //   Create a new custom function and make it globally available.
  //
  //   In .zpp:
  //     define("add", function(a, b) { return a + b; })
  //     add(3, 4)   →  7
  //
  //   The name may optionally start with $ — it will be stripped:
  //     define("$add", ...)  is the same as  define("add", ...)
  //
  define(name, fn, meta) {
    name = _cleanName(name);
    _guardFn(fn, `second argument of define("${name}", ...)`);
    meta = meta || {};

    _registry[name] = {
      fn,
      meta: Object.assign({}, meta, { name, createdAt: Date.now() })
    };
    _injectGlobal(name, fn);
    return crt;
  },

  // ── redefine(name, fn) ────────────────────────────────────────────────
  //
  //   Replace the implementation of an existing function.
  //   Throws if the name has not been defined yet.
  //
  redefine(name, fn) {
    name = _cleanName(name);
    if (!_registry[name])
      throw new ReferenceError(
        `crtlib: cannot redefine unknown function "${name}". Use define() first.`
      );
    _guardFn(fn, `second argument of redefine("${name}", ...)`);
    _registry[name].fn = fn;
    _injectGlobal(name, fn);
    return crt;
  },

  // ── has(name) ─────────────────────────────────────────────────────────
  //   Returns true if a function with this name has been defined.
  //
  has(name) {
    name = _cleanName(name);
    return Object.prototype.hasOwnProperty.call(_registry, name);
  },

  // ── remove(name) ──────────────────────────────────────────────────────
  //   Unregister a function and remove it from global scope.
  //
  remove(name) {
    name = _cleanName(name);
    if (!_registry[name]) return false;
    delete _registry[name];
    delete _store[name];
    _ejectGlobal(name);
    return true;
  },

  // ── list() ────────────────────────────────────────────────────────────
  //   Return an array of descriptor objects for every defined function.
  //
  list() {
    return Object.keys(_registry).map(function(name) {
      return Object.assign({ name, saved: Object.prototype.hasOwnProperty.call(_store, name) },
                           _registry[name].meta);
    });
  },

  // ── meta(name) ────────────────────────────────────────────────────────
  //   Return a copy of the metadata stored with this function.
  //
  meta(name) {
    name = _cleanName(name);
    return _registry[name] ? Object.assign({}, _registry[name].meta) : null;
  },

  // ── describe(name) ────────────────────────────────────────────────────
  //   Human-readable one-liner about a function.
  //
  describe(name) {
    name = _cleanName(name);
    const m = crt.meta(name);
    if (!m) return `"${name}": not defined`;
    const when = new Date(m.createdAt).toISOString();
    const desc = m.description ? ` — ${m.description}` : '';
    return `${name}${desc}  [created ${when}]`;
  },

  // ── tag(name) ─────────────────────────────────────────────────────────
  //   Retrieve the raw function reference.
  //   Use when you want to pass it as a value:
  //     [1,2,3].map(tag("double"))
  //
  tag(name) {
    name = _cleanName(name);
    if (!_registry[name])
      throw new ReferenceError(`crtlib: function "${name}" is not defined`);
    return _registry[name].fn;
  },

  // ── callTag(name, ...args) ────────────────────────────────────────────
  //   Call a defined function by name string.
  //   Useful when the name is stored in a variable.
  //
  callTag(name) {
    name = _cleanName(name);
    if (!_registry[name])
      throw new ReferenceError(`crtlib: function "${name}" is not defined`);
    const args = Array.prototype.slice.call(arguments, 1);
    return _registry[name].fn.apply(null, args);
  },

  // ── batch(fnMap) ──────────────────────────────────────────────────────
  //   Define many functions at once from a plain object.
  //
  //   batch({
  //     double : function(x) { return x * 2; },
  //     square : function(x) { return x * x; }
  //   })
  //   double(5)  →  10
  //   square(5)  →  25
  //
  batch(fnMap) {
    if (!fnMap || typeof fnMap !== 'object')
      throw new TypeError('crtlib.batch: expected a plain object');
    Object.keys(fnMap).forEach(function(name) { crt.define(name, fnMap[name]); });
    return crt;
  },

  // ── alias(existing, newName) ──────────────────────────────────────────
  //   Give an existing function an additional name.
  //
  alias(existing, newName) {
    existing = _cleanName(existing);
    newName  = _cleanName(newName);
    if (!_registry[existing])
      throw new ReferenceError(`crtlib: cannot alias undefined function "${existing}"`);
    return crt.define(newName, _registry[existing].fn,
      Object.assign({}, _registry[existing].meta, { aliasOf: existing }));
  },

  // ── combine(fn1, fn2 [, name]) ────────────────────────────────────────
  //
  //   Create a NEW function that pipes its input through fn1 then fn2.
  //   If a name is given, the result is also registered globally.
  //
  //   combine(double, square, "doubleSquare")
  //   doubleSquare(3)  →  square(double(3))  →  36
  //
  combine(fn1, fn2, name) {
    _guardFn(fn1, 'combine first argument');
    _guardFn(fn2, 'combine second argument');
    const combined = function combined() {
      return fn2(fn1.apply(null, arguments));
    };
    if (name) crt.define(name, combined, { description: 'combined function' });
    return combined;
  },

  // ─────────────────────────────────────────────────────────────────────
  //  Persistence
  // ─────────────────────────────────────────────────────────────────────

  // ── save(name) ────────────────────────────────────────────────────────
  //   Serialise a function's source so it survives export/import.
  //   Call before exportFns() if you want it included.
  //
  save(name) {
    name = _cleanName(name);
    if (!_registry[name])
      throw new ReferenceError(`crtlib: cannot save undefined function "${name}"`);
    _store[name] = {
      src:  _registry[name].fn.toString(),
      meta: Object.assign({}, _registry[name].meta)
    };
    return crt;
  },

  // ── saveAll() ─────────────────────────────────────────────────────────
  //   Serialise every currently defined user function.
  //
  saveAll() {
    Object.keys(_registry).forEach(function(n) {
      if (!_BUILTINS.has(n)) crt.save(n);
    });
    return crt;
  },

  // ── exportFns([names]) ────────────────────────────────────────────────
  //   Return a JSON string of saved functions.
  //   Pass an array of names to export only a subset.
  //   Tip:  crt.saveAll().exportFns()  gives you everything.
  //
  exportFns(names) {
    const keys = names
      ? [].concat(names).filter(function(n) { return _store[n]; })
      : Object.keys(_store);
    const snapshot = {};
    keys.forEach(function(n) { snapshot[n] = _store[n]; });
    return JSON.stringify(snapshot, null, 2);
  },

  // ── importFns(jsonOrObj) ──────────────────────────────────────────────
  //   Re-hydrate an export snapshot (JSON string or plain object).
  //   Each entry becomes a live function available in the interpreter.
  //
  //   Typical cross-file workflow:
  //     FILE A:  crt.saveAll()
  //              const blob = crt.exportFns()
  //              // write blob to localStorage / a .json file
  //
  //     FILE B:  crt.importFns(blob)
  //              add(3, 4)   →  7    // works immediately
  //
  importFns(jsonOrObj) {
    const data = typeof jsonOrObj === 'string' ? JSON.parse(jsonOrObj) : jsonOrObj;
    if (!data || typeof data !== 'object')
      throw new TypeError('crtlib.importFns: expected a JSON string or plain object');
    Object.keys(data).forEach(function(name) {
      const entry = data[name];
      const fn = _hydrate(entry.src);
      crt.define(name, fn, entry.meta || {});
      _store[name] = entry;     // keep serialised copy
    });
    return crt;
  },

  // ── toFile() ──────────────────────────────────────────────────────────
  //   saveAll() + exportFns() in one step.
  //   Returns a JSON string ready to write to disk / localStorage.
  //
  toFile() {
    return crt.saveAll().exportFns();
  },

  // ── fromFile(content) ─────────────────────────────────────────────────
  //   importFns() under the file-loading mental model name.
  //
  fromFile(content) {
    return crt.importFns(content);
  },

  // ── reset() ───────────────────────────────────────────────────────────
  //   Remove every USER-defined function.
  //   Does NOT remove the built-in crtlib helpers (pipe, compose, etc.).
  //
  reset() {
    Object.keys(_registry).forEach(function(n) {
      if (!_BUILTINS.has(n)) crt.remove(n);
    });
    Object.keys(_store).forEach(function(n) {
      if (!_BUILTINS.has(n)) delete _store[n];
    });
    return crt;
  },

  // ── preregister(name) ─────────────────────────────────────────────────
  //
  //   Pre-declare a function name with the ZPP PARSER before the function
  //   body is available.  This is important if the interpreter does a
  //   full parse pass THEN executes — use preregister() at the top of a
  //   .zpp file so that calls like  myFunc(a, b)  don't get a comma error
  //   even before the define() line is reached.
  //
  //   preregister("myFunc")
  //   define("myFunc", function(x) { return x * 2; })
  //   myFunc(5)   →  10
  //
  preregister(name) {
    name = _cleanName(name);
    if (_ZPP && typeof _ZPP.registerBuiltins === 'function') {
      _ZPP.registerBuiltins([name]);
    }
    // Also inject a stub so calls before define() give a clear error
    if (!_registry[name]) {
      const stub = (function(n) {
        return function() {
          throw new ReferenceError(
            `crtlib: "${n}" was pre-registered but not yet defined. ` +
            `Call define("${n}", fn) before using it.`
          );
        };
      })(name);
      _injectGlobal(name, stub);
    }
    return crt;
  },


  // ─────────────────────────────────────────────────────────────────────
  //  Higher-order helpers
  //  All are also injected as globals — call as  pipe(...)  not  crt.pipe(...)
  // ─────────────────────────────────────────────────────────────────────

  // ── pipe(value, ...fns) ───────────────────────────────────────────────
  //
  //   Thread a value through a left-to-right pipeline of functions.
  //
  //   pipe(5, double, square)   →  100
  //
  pipe(value) {
    const fns = Array.prototype.slice.call(arguments, 1);
    return fns.reduce(function(v, f) {
      _guardFn(f, 'pipe argument');
      return f(v);
    }, value);
  },

  // ── compose(...fns) ───────────────────────────────────────────────────
  //
  //   Right-to-left function composition.
  //   compose(f, g)(x)  ≡  f(g(x))
  //
  //   Returns a new function.  Register it with define() if you want
  //   it available by name.
  //
  compose() {
    const fns = Array.prototype.slice.call(arguments);
    fns.forEach(function(f, i) { _guardFn(f, 'compose argument[' + i + ']'); });
    return function composed() {
      const args = Array.prototype.slice.call(arguments);
      return fns.reduceRight(function(v, f, i) {
        return i === fns.length - 1 ? f.apply(null, v) : f(v);
      }, args);
    };
  },

  // ── partial(fn, ...preset) ────────────────────────────────────────────
  //
  //   Partial application — bind leading arguments.
  //
  //   const add5 = partial(add, 5)
  //   add5(3)   →  8
  //
  partial(fn) {
    _guardFn(fn, 'partial first argument');
    const preset = Array.prototype.slice.call(arguments, 1);
    return function partiallyApplied() {
      const rest = Array.prototype.slice.call(arguments);
      return fn.apply(null, preset.concat(rest));
    };
  },

  // ── curry(fn) ─────────────────────────────────────────────────────────
  //
  //   Auto-curry based on declared arity.
  //
  //   const addC = curry(function(a, b) { return a + b; })
  //   addC(3)(4)   →  7
  //
  curry(fn) {
    _guardFn(fn, 'curry argument');
    const arity = fn.length;
    function curried() {
      const args = Array.prototype.slice.call(arguments);
      if (args.length >= arity) return fn.apply(null, args);
      return function() {
        return curried.apply(null, args.concat(Array.prototype.slice.call(arguments)));
      };
    }
    return curried;
  },

  // ── memoize(fn [, keyFn]) ─────────────────────────────────────────────
  //
  //   Cache results by arguments.
  //
  memoize(fn, keyFn) {
    _guardFn(fn, 'memoize first argument');
    const cache = Object.create(null);
    const key = keyFn || function() { return JSON.stringify(Array.prototype.slice.call(arguments)); };
    return function memoized() {
      const k = key.apply(null, arguments);
      if (k in cache) return cache[k];
      const result = fn.apply(null, arguments);
      cache[k] = result;
      return result;
    };
  },

  // ── once(fn) ──────────────────────────────────────────────────────────
  //
  //   Run fn only on its first call; return that result on all later calls.
  //
  once(fn) {
    _guardFn(fn, 'once argument');
    let called = false, result;
    return function onceFn() {
      if (!called) { called = true; result = fn.apply(null, arguments); }
      return result;
    };
  },

  // ── repeat(fn, n [, initial]) ─────────────────────────────────────────
  //
  //   Call fn n times, threading the return value.
  //   repeat(function(x) { return x * 2; }, 4, 1)   →  16
  //
  repeat(fn, n, initial) {
    _guardFn(fn, 'repeat first argument');
    if (!Number.isInteger(n) || n < 0)
      throw new RangeError('crtlib.repeat: n must be a non-negative integer');
    let v = initial;
    for (let i = 0; i < n; i++) v = fn(v, i);
    return v;
  },

  // ── throttle(fn, ms) ──────────────────────────────────────────────────
  //   Limit fn to at most one call per ms milliseconds.
  //
  throttle(fn, ms) {
    _guardFn(fn, 'throttle first argument');
    let last = 0;
    return function throttled() {
      const now = Date.now();
      if (now - last >= ms) { last = now; return fn.apply(null, arguments); }
    };
  },

  // ── debounce(fn, ms) ──────────────────────────────────────────────────
  //   Delay fn until ms milliseconds have passed without a new call.
  //
  debounce(fn, ms) {
    _guardFn(fn, 'debounce first argument');
    let timer;
    return function debounced() {
      const a = arguments;
      clearTimeout(timer);
      timer = setTimeout(function() { fn.apply(null, a); }, ms);
    };
  },

};

// ─────────────────────────────────────────────────────────────────────────
//  Names that are "built-in" — reset() will not remove them
// ─────────────────────────────────────────────────────────────────────────
const _BUILTINS = new Set([
  // HOF helpers
  'pipe', 'compose', 'partial', 'curry',
  'memoize', 'once', 'repeat',
  'throttle', 'debounce', 'batch', 'alias', 'combine',
  // Management (these are globals but not in _registry — just a safeguard)
  'define', 'redefine', 'has', 'remove', 'list', 'meta', 'describe',
  'tag', 'callTag', 'save', 'saveAll', 'exportFns', 'importFns',
  'toFile', 'fromFile', 'reset', 'preregister',
  // Numeric types
  'float', 'double', 'int', 'uint', 'long', 'ulong',
  'short', 'ushort', 'byte', 'sbyte', 'bool', 'char', 'str',
  // Numeric utilities
  'isFloat', 'isInt', 'isLong', 'isNum',
  'clamp', 'lerp', 'roundTo', 'frac', 'sign', 'inRange',
  'toFloat', 'toInt', 'toLong',
]);

// Register every HOF built-in into _registry so they are visible to list()
['pipe','compose','partial','curry','memoize','once','repeat',
 'throttle','debounce','batch','alias','combine'].forEach(function(name) {
  if (typeof crt[name] === 'function') {
    _registry[name] = {
      fn:   crt[name],
      meta: { name, createdAt: Date.now(), description: 'crtlib built-in HOF: ' + name }
    };
  }
});


// ═════════════════════════════════════════════════════════════════════════
//
//  SECTION 3 — DSALibraries registration
//
// ═════════════════════════════════════════════════════════════════════════
if (typeof DSALibraries !== 'undefined') {
  DSALibraries['crtlib.zl'] = {

    description:
      'Custom Runtime Library — define, save, export, import, and globally inject ' +
      'custom functions into the ZPP interpreter. ' +
      'Built-in numeric types: float double int uint long ulong short ushort byte sbyte bool char str. ' +
      'Built-in HOF helpers: pipe compose partial curry memoize once repeat throttle debounce batch alias combine. ' +
      'Browser + Node/Electron compatible.',

    inject(G) {

      // ── Step 1: grab the ZPP runtime and store the global scope ────────
      if (typeof window !== 'undefined' && window.__ZPP__) {
        _ZPP = window.__ZPP__;
      }
      _G = G;

      // ── Step 2: register ALL names the parser will ever encounter ──────
      //   This one call prevents every parse error that would otherwise
      //   come from the parser seeing an unknown identifier followed by (
      //   with commas inside — the classic "unexpected ," error.
      if (_ZPP && typeof _ZPP.registerBuiltins === 'function') {
        _ZPP.registerBuiltins([
          // crt namespace itself
          'crt',
          // Management functions (callable as bare globals)
          'define', 'redefine', 'has', 'remove', 'list',
          'meta', 'describe', 'tag', 'callTag',
          'save', 'saveAll', 'exportFns', 'importFns',
          'toFile', 'fromFile', 'reset', 'preregister',
          'batch', 'alias', 'combine',
          // HOF helpers
          'pipe', 'compose', 'partial', 'curry',
          'memoize', 'once', 'repeat',
          'throttle', 'debounce',
          // Numeric types
          'float', 'double', 'int', 'uint',
          'long', 'ulong', 'short', 'ushort',
          'byte', 'sbyte', 'bool', 'char', 'str',
          // Numeric utilities
          'isFloat', 'isInt', 'isLong', 'isNum',
          'clamp', 'lerp', 'roundTo', 'frac', 'sign', 'inRange',
          'toFloat', 'toInt', 'toLong',
        ]);

        if (typeof _ZPP.registerTypes === 'function') {
          _ZPP.registerTypes(['crt']);
        }
      }

      // ── Step 3: inject numeric type functions as globals ───────────────
      const _numericTypes = {
        float, double, int, uint, long, ulong,
        short, ushort, byte, sbyte, bool, char, str,
        isFloat, isInt, isLong, isNum,
        clamp, lerp, roundTo, frac, sign, inRange,
        toFloat, toInt, toLong
      };
      Object.keys(_numericTypes).forEach(function(name) {
        _injectGlobal(name, _numericTypes[name]);
      });

      // ── Step 4: inject HOF helpers as globals ──────────────────────────
      _BUILTINS.forEach(function(name) {
        if (typeof crt[name] === 'function') _injectGlobal(name, crt[name]);
      });

      // ── Step 5: inject management functions as globals ─────────────────
      //   So .zpp files can call  define("foo", ...)  without crt. prefix
      const _mgmt = [
        'define','redefine','has','remove','list','meta','describe',
        'tag','callTag','save','saveAll','exportFns','importFns',
        'toFile','fromFile','reset','preregister','batch','alias','combine'
      ];
      _mgmt.forEach(function(name) {
        if (typeof crt[name] === 'function') _injectGlobal(name, crt[name].bind(crt));
      });

      // ── Step 6: expose the crt namespace itself ────────────────────────
      G.crt = crt;
    }
  };
}


// ─────────────────────────────────────────────────────────────────────────
//  Node / CommonJS
// ─────────────────────────────────────────────────────────────────────────
if (typeof module !== 'undefined') module.exports = crt;

// ─────────────────────────────────────────────────────────────────────────
//  Universal global fallback (ESM, Service Workers, etc.)
// ─────────────────────────────────────────────────────────────────────────
if (typeof globalThis !== 'undefined') {
  globalThis.crt = crt;

  // Also pre-expose numeric types and HOFs even before inject() is called,
  // so plain Node scripts can  require('crtlib')  and get everything.
  [float, double, int, uint, long, ulong, short, ushort, byte, sbyte, bool, char, str,
   isFloat, isInt, isLong, isNum, clamp, lerp, roundTo, frac, sign, inRange,
   toFloat, toInt, toLong].forEach(function(fn) {
    globalThis[fn.name] = fn;
  });
}

})();
// ════════════════════════════════════════════════════════════════════════════
//  End of crtlib.zl  v2.0
// ════════════════════════════════════════════════════════════════════════════
