// ============================================================
//  ZETA++ Interpreter  —  v9.0
//
//  New in v9:
//    const <type> x = val;        — immutable binding (any type)
//    const const <type> x = val;  — deep-frozen constant (freezes arrays/objects)
//    renameDatatype("num","int");  — type alias (compile-time, recursive, struct-aware)
//    Type enforcement on assign    — byte/float/char/bignum auto-coerce on every write
//    BigInt arithmetic             — bignum vars use real BigInt ops (+,-,*,/,%,**)
//    ** operator                   — exponentiation  (2 ** 10 = 1024)
//    array x = [N];               — shorthand: array of N zeros
//    array methods                 — .at() .findIndex() .lastIndexOf() .fill() .flat()
//                                    .dedupe() .compact() .first() .last() .chunk()
//                                    .rotate() .shuffle() .tally() .groupBy() .entries()
//                                    .sum() .avg() .min() .max()  (fixed .sort())
//    Global array helpers          — compact() flatten() first() last() nth()
//                                    zip() chunk() rotate() shuffle() tally() dedupe()
//    isFloat/isByte/isChar/isBigNum — type-check globals
//    float helpers                  — fround() epsilon() isNaN() isFinite() floatInfo()
//    byte helpers                   — byteAdd() byteSub() byteMul() byteClamp() byteFlip()
//    char helpers                   — nextChar() prevChar() isUpper() isLower() isAlpha()
//                                     isDigit() isSpace() upperChar() lowerChar() charRange()
//    bignum helpers                 — bigAdd() bigSub() bigMul() bigDiv() bigPow() bigMod()
//                                     bigCmp() bigAbs() bigGcd() bigToStr() bigFromStr()
//    renameDatatype() also runtime  — updates alias table at runtime for dynamic aliasing
//
//  All v8 / v7 / v6 / v5 / v4 features still present.
//
//  Previously in v8:
//    printsl(...)             — print on same line (no newline appended)
//    creator(text)            — program metadata / creator tag banner
//    LUCIFER IS THE LORD;     — special power-signature statement
//    float                    — floating-point type  (enforces decimal)
//    byte                     — 8-bit integer type   (0–255, auto-clamped)
//    char                     — single-character string type
//    bignum                   — big integer type     (BigInt-backed)
//    @ identifier prefix      — library namespaces (e.g. @term.print)
//    $ identifier prefix      — user / lib identifiers (e.g. $math.gcd)
//    @term library            — terminal I/O
//                                @term.print / @term.printsl / @term.input
//                                @term.nl / @term.warn / @term.error / @term.clear
//    $math library            — extended math
//                                $math.gcd / $math.lcm / $math.isPrime / $math.primes
//                                $math.factorial / $math.fibonacci / $math.clamp
//                                $math.lerp / $math.toHex / $math.toBin / $math.toOct
//                                $math.fromHex / $math.fromBin / $math.fromOct
//    $str library             — string utilities
//                                $str.reverse / $str.isPalindrome / $str.count
//                                $str.toTitle / $str.toCamel / $str.toSnake
//                                $str.template / $str.escape / $str.isAlpha / $str.isDigit
//                                $str.center / $str.wrap
//    $arr library             — array utilities
//                                $arr.zip / $arr.flatten / $arr.chunk / $arr.rotate
//                                $arr.shuffle / $arr.sample / $arr.tally
//                                $arr.partition / $arr.matrix / $arr.transpose
//                                $arr.product / $arr.groupBy
//    $io library              — I/O helpers
//                                $io.print / $io.printsl / $io.input / $io.readLines
//    $rand library            — random utilities
//                                $rand.int / $rand.float / $rand.bool
//                                $rand.pick / $rand.shuffle / $rand.uuid
//    $time library            — time utilities
//                                $time.now / $time.format / $time.since
//    $bit library             — bitwise operations
//                                $bit.and / $bit.or / $bit.xor / $bit.not
//                                $bit.lsh / $bit.rsh / $bit.count / $bit.mask
//    $conv library            — type conversions
//                                $conv.toFloat / $conv.toByte / $conv.toChar
//                                $conv.toBase / $conv.fromBase / $conv.fromChar
//    _medium @JS -> { }       — inline JavaScript code block
//    @export.funcName[f1, f2] — export functions from a JS block
//    -> result([@get.funcName(js): alias]) — import JS functions into ZPP scope
//
//  All v7 / v6 / v5 / v4 features still present.
// ============================================================

'use strict';

// ── Global DSALibraries registry ─────────────────────────────────────────────
(function _initDSALibraries() {
  const g = (typeof globalThis !== 'undefined') ? globalThis
          : (typeof global    !== 'undefined') ? global
          : (typeof window    !== 'undefined') ? window : {};
  if (!g.DSALibraries) g.DSALibraries = Object.create(null);
})();

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
    this.outputs       = [];
    this._sink         = opts.sink || null;
    this.structs       = Object.create(null);
    this._inputFn      = opts.inputFn || null;
    this._fileLoader   = opts.fileLoader || _defaultFileLoader;
    this._sameLineBuf  = '';
    // ── Type alias registry for renameDatatype ────────────────
    this._typeAliases  = Object.create(null);
    this.globalScope   = this._buildGlobals();
  }

  // ----------------------------------------------------------
  //  Type alias resolution  (follows rename chains, cycle-safe)
  // ----------------------------------------------------------
  _resolveTypeAlias(name) {
    const seen = new Set();
    let cur = name;
    while (this._typeAliases[cur] !== undefined) {
      if (seen.has(cur)) break;
      seen.add(cur);
      cur = this._typeAliases[cur];
    }
    return cur;
  }

  // ----------------------------------------------------------
  //  Type coercion  (called on every write to a typed variable)
  // ----------------------------------------------------------
  _coerceToType(val, type) {
    switch (type) {
      case 'num':
        if (typeof val === 'boolean') return val ? 1 : 0;
        if (typeof val === 'string')  { const n = Number(val.trim()); if (!isNaN(n)) return n; }
        if (typeof val !== 'number')  throw new Error(`Cannot assign ${typeof val} to num`);
        return val;
      case 'float':
        if (typeof val === 'boolean') return val ? 1.0 : 0.0;
        if (typeof val === 'string')  return parseFloat(val);
        return typeof val === 'number' ? val : Number(val);
      case 'byte':
        return Math.max(0, Math.min(255, Math.trunc(Number(val))));
      case 'char':
        if (typeof val === 'number') return String.fromCharCode(val);
        if (typeof val === 'string') return val.length === 1 ? val : (val[0] || '\0');
        throw new Error(`Cannot assign ${typeof val} to char`);
      case 'bignum':
        if (typeof val === 'bigint') return val;
        if (typeof BigInt !== 'undefined')
          return BigInt(Math.trunc(Number(String(val).replace(/n$/, ''))));
        return Math.trunc(Number(val));
      case 'str':
        return typeof val === 'number' ? String(val) : val;
      case 'bool':
        if (typeof val !== 'boolean') throw new Error(`Cannot assign ${typeof val} to bool`);
        return val;
      default:
        return val;
    }
  }

  // ----------------------------------------------------------
  //  Helper: get declared type of a variable in the scope chain
  // ----------------------------------------------------------
  _getVarType(scope, name) {
    let s = scope;
    while (s !== null) {
      if (Object.prototype.hasOwnProperty.call(s, name))
        return (s.__types__ && s.__types__[name]) || null;
      s = Object.getPrototypeOf(s);
    }
    return null;
  }

  // ----------------------------------------------------------
  //  printsl / print helpers
  // ----------------------------------------------------------
  _printSameLine(s) {
    this._sameLineBuf = (this._sameLineBuf || '') + s;
    if (this._sink) this._sink.write(s);
  }

  _flushSameLine() {
    if (this._sameLineBuf) {
      this.outputs.push(this._sameLineBuf);
      if (this._sink) this._sink.write('\n');
      this._sameLineBuf = '';
    }
  }

  _print(line) {
    const s = String(line);
    if (this._sameLineBuf) {
      const combined = this._sameLineBuf + s;
      this._sameLineBuf = '';
      this.outputs.push(combined);
      if (this._sink) this._sink.write(combined + '\n');
    } else {
      this.outputs.push(s);
      if (this._sink) this._sink.write(s + '\n');
    }
  }

  interpret(code) {
    this.outputs           = [];
    this._sameLineBuf      = '';
    this.structs           = Object.create(null);
    this.__exports__       = new Set();
    this._pendingNSImports = [];
    this._currentLine      = 1;
    code = this._preprocess(code);

    // ── Execute namespaced imports ────────────────────────────
    for (const { nsName, src } of this._pendingNSImports) {
      const savedExports = this.__exports__;
      this.__exports__ = new Set();
      const nsTokens = this.tokenize(src);
      const nsAst    = this.parse(nsTokens);
      const nsScope  = Object.create(this.globalScope);
      this._execBlock(nsAst.body, nsScope);
      const nsObj = Object.create(null);
      for (const name of this.__exports__) {
        if (nsScope[name] === undefined)
          throw new Error(`export: '${name}' was exported but not defined in "${nsName}"`);
        nsObj[name] = nsScope[name];
      }
      this.globalScope[nsName] = nsObj;
      this.__exports__ = savedExports;
    }

    const tokens = this.tokenize(code);
    const ast    = this.parse(tokens);
    try {
      this._execBlock(ast.body, this.globalScope);
    } catch (e) {
      if (!(e instanceof ReturnSignal) && !(e instanceof ThrowSignal) &&
          !(e instanceof BreakSignal)  && !(e instanceof ContinueSignal)) {
        if (!/^Line \d+:/.test(e.message))
          e.message = `Line ${this._currentLine}: ${e.message}`;
      }
      throw e;
    }
    this._flushSameLine();   // flush any trailing same-line content
    return this.outputs;
  }

  // ----------------------------------------------------------
  //  Preprocessor
  // ----------------------------------------------------------
  _preprocess(code) {
    // ── 1. renameDatatype — scan ENTIRE file before tokenising ─
    //    Compile-time: works regardless of call position in source.
    code = this._preprocessTypeAliases(code);

    // ── 2. _medium @JS -> { ... } -> result(...); ─────────────
    code = this._preprocessMediumJS(code);

    // ── Takeover import: #import["lib.zl"]; where the library defines
    //    a `takeover(source, interpreter)` hook. When present, ZPP stops
    //    compiling at that line — everything after it is handed to the
    //    library's own compiler untouched, and ZPP never tokenises it.
    //    (Datatypes, syntax, everything past this point belongs to the lib.)
    const takeoverRe = /^[ \t]*#import\[["']([^"']+\.zl)["']\];?[ \t]*(\r?\n|$)/m;
    const takeoverMatch = takeoverRe.exec(code);
    if (takeoverMatch) {
      const filename = takeoverMatch[1];
      const _dsa = (typeof globalThis !== 'undefined' ? globalThis.DSALibraries : null)
                || (typeof DSALibraries !== 'undefined' ? DSALibraries : null);
      const lib = _dsa && _dsa[filename];
      if (lib && typeof lib.takeover === 'function') {
        const before = code.slice(0, takeoverMatch.index);
        const after  = code.slice(takeoverMatch.index + takeoverMatch[0].length);
        if (typeof lib.inject === 'function') lib.inject(this.globalScope);
        const stub = lib.takeover(after, this) || '';
        return this._preprocess(before) + stub;
      }
      // no takeover hook on this library — fall through to normal handling below
    }

    // ── Namespaced import: #import["file.zpp":nsName]; ────────
    const nsImportRe = /^[ \t]*#import\[["']([^"']+)["']\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*)\];?[ \t]*(\r?\n|$)/gm;
    code = code.replace(nsImportRe, (_, filename, nsName) => {
      const ext = filename.split('.').pop().toLowerCase();
      if (ext !== 'zpp')
        throw new Error(`#import with namespace alias only supports .zpp files (got ".${ext}")`);
      const src = this._fileLoader(filename);
      if (!this._pendingNSImports) this._pendingNSImports = [];
      this._pendingNSImports.push({ nsName, src: this._preprocess(src) });
      return '';
    });

    // ── Plain import: #import["file.zpp"]; or #import["lib.zl"]; ──
    const importRe = /^[ \t]*#import\[["']([^"']+)["']\];?[ \t]*(\r?\n|$)/gm;
    let inlined = '';
    const processed = code.replace(importRe, (_, filename) => {
      const ext = filename.split('.').pop().toLowerCase();
      if (ext === 'zl') {
        const _dsa = (typeof globalThis !== 'undefined' ? globalThis.DSALibraries : null)
                  || (typeof DSALibraries !== 'undefined' ? DSALibraries : null);
        if (_dsa && _dsa[filename])
          _dsa[filename].inject(this.globalScope);
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

  // ── renameDatatype compile-time scan ─────────────────────────
  //  Strips all renameDatatype("x","y") calls from source and
  //  registers each alias before the rest of the code is tokenised.
  _preprocessTypeAliases(code) {
    const re = /renameDatatype\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*\)\s*;/g;
    return code.replace(re, (_, existing, newName) => {
      const resolved = this._resolveTypeAlias(existing);
      this._typeAliases[newName] = resolved;
      return '';   // remove directive from source
    });
  }

  // ── _medium @JS block preprocessor ───────────────────────────
  _preprocessMediumJS(code) {
    let out = '';
    let i   = 0;
    while (i < code.length) {
      // Try to match _medium  @JS  ->
      const rest = code.slice(i);
      const head = rest.match(/^_medium\s+@JS\s*->/);
      if (!head) { out += code[i++]; continue; }

      i += head[0].length;
      // skip whitespace
      while (i < code.length && /[ \t\r\n]/.test(code[i])) i++;
      // expect opening {
      if (code[i] !== '{')
        throw new Error('_medium @JS: expected `{` after `->`');
      i++;

      // collect JS body (depth-track braces)
      let depth = 1, jsBody = '';
      while (i < code.length && depth > 0) {
        if      (code[i] === '{') { depth++; jsBody += code[i++]; }
        else if (code[i] === '}') { depth--; if (depth > 0) jsBody += code[i]; i++; }
        else                      { jsBody += code[i++]; }
      }

      // skip whitespace, expect -> result(
      while (i < code.length && /[ \t\r\n]/.test(code[i])) i++;
      if (code.slice(i, i + 2) !== '->')
        throw new Error('_medium @JS: expected `->` after `}`');
      i += 2;
      while (i < code.length && /[ \t\r\n]/.test(code[i])) i++;
      if (!code.slice(i).startsWith('result('))
        throw new Error('_medium @JS: expected `result(` after `->`');
      i += 7; // skip 'result('

      // collect result spec (depth-track parens)
      let pDepth = 1, resultSpec = '';
      while (i < code.length && pDepth > 0) {
        if      (code[i] === '(') { pDepth++; resultSpec += code[i++]; }
        else if (code[i] === ')') { pDepth--; if (pDepth > 0) resultSpec += code[i]; i++; }
        else                      { resultSpec += code[i++]; }
      }

      // skip optional ;
      while (i < code.length && /[ \t]/.test(code[i])) i++;
      if (i < code.length && code[i] === ';') i++;

      out += this._transformJSBlock(jsBody, resultSpec);
    }
    return out;
  }

  _transformJSBlock(jsBody, resultSpec) {
    // Remove @export.funcName[...] lines from JS body
    const cleanJs = jsBody
      .replace(/@export\.funcName\s*\[[^\]]*\]\s*;?\s*/g, '')
      .trim();

    // Parse result spec: @get.funcName(jsName): alias
    const bindings = [];
    const bindRe = /@get\.funcName\s*\(\s*([a-zA-Z_$@][a-zA-Z0-9_$@]*)\s*\)\s*:\s*([a-zA-Z_$@][a-zA-Z0-9_$@]*)/g;
    let bm;
    while ((bm = bindRe.exec(resultSpec)) !== null)
      bindings.push({ jsName: bm[1], alias: bm[2] });

    // Escape for ZPP string literal
    const esc = cleanJs
      .replace(/\\/g, '\\\\')
      .replace(/"/g,  '\\"')
      .replace(/\r/g, '')
      .replace(/\n/g, '\\n');

    if (bindings.length === 0)
      return `__jsExec__("${esc}");\n`;

    return bindings
      .map(({ jsName, alias }) => `let ${alias} = __jsEval__("${esc}", "${jsName}");\n`)
      .join('');
  }

  // ----------------------------------------------------------
  //  Built-in globals
  // ----------------------------------------------------------
  _buildGlobals() {
    const G = Object.create(null);

    // ── Core I/O ──────────────────────────────────────────────
    G.print = (...args) => this._print(args.map(a => this._str(a)).join(' '));

    // NEW: printsl — print on same line, no trailing newline
    G.printsl = (...args) => this._printSameLine(args.map(a => this._str(a)).join(' '));

    G.input = (prompt) => {
      const raw = this._inputFn
        ? this._inputFn(prompt || '')
        : _readLineNode(prompt || '');
      const trimmed = raw.trim();
      const n = Number(trimmed);
      return (trimmed !== '' && !isNaN(n)) ? n : raw;
    };

    // NEW: creator — program metadata banner
    G.creator = (text) => {
      const s = String(text);
      const bar = '═'.repeat(Math.max(s.length + 4, 36));
      this._print(`╔${bar}╗`);
      this._print(`║  CREATOR: ${s.padEnd(bar.length - 13)}  ║`);
      this._print(`╚${bar}╝`);
      this._creatorInfo = s;
    };

    // NEW: JS block helpers (generated by _medium @JS preprocessor)
    G.__jsEval__ = (code, funcName) => {
      try {
        const factory = new Function(code + `\n; return typeof ${funcName} !== 'undefined' ? ${funcName} : undefined;`);
        const fn = factory();
        if (typeof fn !== 'function')
          throw new Error(`JS block: '${funcName}' is not a function or was not defined`);
        return fn;
      } catch (e) {
        throw new Error(`JS block error: ${e.message}`);
      }
    };
    G.__jsExec__ = (code) => {
      try { (new Function(code))(); }
      catch (e) { throw new Error(`JS block error: ${e.message}`); }
    };

    // ── renameDatatype — also available at runtime ────────────
    G.renameDatatype = (existing, newName) => {
      const resolved = this._resolveTypeAlias(String(existing));
      this._typeAliases[String(newName)] = resolved;
    };

    // ── Type conversions & queries ────────────────────────────
    G.toNum    = x => Number(x);
    G.toStr    = x => String(x);
    G.toBool   = x => Boolean(x);
    G.isNum    = x => typeof x === 'number';
    G.isStr    = x => typeof x === 'string';
    G.isBool   = x => typeof x === 'boolean';
    G.isArr    = x => Array.isArray(x);
    G.isNull   = x => x === null || x === undefined;
    G.isStruct = x => x instanceof StructInstance;
    G.typeOf   = x => {
      if (x instanceof StructInstance) return x.__type__;
      if (Array.isArray(x))            return 'array';
      if (typeof x === 'bigint')       return 'bignum';
      return typeof x;
    };

    // ── v9 type queries ───────────────────────────────────────
    // FIX: isFloat should distinguish decimal floats from plain integers.
    // A value is considered float if it is a number with a fractional part,
    // or if it is Infinity / NaN (which are float-domain values).
    G.isFloat  = x => typeof x === 'number' && (!Number.isInteger(x) || !isFinite(x));
    G.isByte   = x => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 255;
    G.isChar   = x => typeof x === 'string' && x.length === 1;
    G.isBigNum = x => typeof x === 'bigint';

    G.toFloat  = x => { const n = parseFloat(String(x)); if (isNaN(n)) throw new Error(`toFloat: cannot convert ${JSON.stringify(x)}`); return n; };
    G.toByte   = x => Math.max(0, Math.min(255, Math.trunc(Number(x))));
    G.toChar   = x => typeof x === 'number' ? String.fromCharCode(x) : (String(x)[0] || '\0');
    G.toBigNum = x => {
      if (typeof x === 'bigint') return x;
      if (typeof BigInt !== 'undefined') return BigInt(Math.trunc(Number(String(x).replace(/n$/, ''))));
      return Math.trunc(Number(x));
    };

    // ── float utilities ───────────────────────────────────────
    G.fround     = x  => Math.fround ? Math.fround(x) : x;
    G.epsilon    = () => Number.EPSILON;
    G.isNaN      = x  => isNaN(x);
    G.isFinite   = x  => isFinite(x);
    G.floatInfo  = x  => ({ value: x, isNaN: isNaN(x), isInf: !isFinite(x),
                             isInt: Number.isInteger(x), epsilon: Number.EPSILON });

    // ── byte utilities ────────────────────────────────────────
    // FIX: byteAdd/Sub/Mul now CLAMP (0-255) to match the byte type coercion
    // behaviour on assignment. Previously they wrapped via & 0xFF which was
    // inconsistent with how the byte type itself handles overflow.
    const _byteClamp = v => Math.max(0, Math.min(255, Math.trunc(v)));
    G.byteAdd   = (a, b) => _byteClamp(a + b);
    G.byteSub   = (a, b) => _byteClamp(a - b);
    G.byteMul   = (a, b) => _byteClamp(a * b);
    G.byteClamp = (x, lo, hi) => Math.max(lo ?? 0, Math.min(hi ?? 255, Math.trunc(x)));
    G.byteFlip  = x => (~x) & 0xFF;
    G.byteInfo  = x => ({ value: x, hex: x.toString(16).padStart(2,'0'), bin: x.toString(2).padStart(8,'0') });

    // ── char utilities ────────────────────────────────────────
    // FIX: unified charCode — accepts a single char OR a string + optional index.
    // This replaces both the char-helper version (line 531) and the string-section
    // duplicate (line 616) with one consistent definition.
    G.charCode  = (c, i) => String(c).charCodeAt(i ?? 0);
    // FIX: fromChar duplicate removed — kept here only; string section entry deleted.
    G.fromChar  = n => String.fromCharCode(n);
    G.nextChar  = c => String.fromCharCode(String(c).charCodeAt(0) + 1);
    G.prevChar  = c => String.fromCharCode(String(c).charCodeAt(0) - 1);
    G.isUpper   = c => /^[A-Z]$/.test(c);
    G.isLower   = c => /^[a-z]$/.test(c);
    G.isAlpha   = c => /^[a-zA-Z]$/.test(c);
    G.isDigitChar = c => /^[0-9]$/.test(c);
    G.isSpace   = c => /^\s$/.test(c);
    G.upperChar = c => String(c).toUpperCase();
    G.lowerChar = c => String(c).toLowerCase();
    G.charRange = (from, to) => {
      const res = [];
      const a = String(from).charCodeAt(0), b = String(to).charCodeAt(0);
      for (let i = a; i <= b; i++) res.push(String.fromCharCode(i));
      return res;
    };

    // ── bignum utilities ──────────────────────────────────────
    const _B = n => {
      if (typeof n === 'bigint') return n;
      if (typeof BigInt !== 'undefined') return BigInt(Math.trunc(Number(String(n).replace(/n$/, ''))));
      throw new Error('BigInt not available');
    };
    G.bigAdd    = (a, b) => _B(a) + _B(b);
    G.bigSub    = (a, b) => _B(a) - _B(b);
    G.bigMul    = (a, b) => _B(a) * _B(b);
    G.bigDiv    = (a, b) => { const d = _B(b); if (d === 0n) throw new Error('BigNum division by zero'); return _B(a) / d; };
    G.bigMod    = (a, b) => _B(a) % _B(b);
    G.bigPow    = (a, b) => _B(a) ** _B(b);
    G.bigCmp    = (a, b) => { const x = _B(a), y = _B(b); return x < y ? -1 : x > y ? 1 : 0; };
    G.bigAbs    = n      => { const b = _B(n); return b < 0n ? -b : b; };
    G.bigGcd    = (a, b) => { let x=_B(a)<0n?-_B(a):_B(a), y=_B(b)<0n?-_B(b):_B(b); while(y!==0n){const t=y;y=x%y;x=t;} return x; };
    G.bigToStr  = n      => (typeof n === 'bigint' ? n : _B(n)).toString();
    G.bigFromStr= s      => _B(String(s));

    // ── Math ──────────────────────────────────────────────────
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

    // ── Strings ───────────────────────────────────────────────
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
    // NOTE: charCode and fromChar are defined in the char utilities block above.
    // Duplicate entries removed here (Bug fix: they overwrote the char-helper versions).
    G.format     = (s, ...a) => s.replace(/{(\d+)}/g, (_, i) => a[i] ?? '');

    // ── Arrays ────────────────────────────────────────────────
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

    // ── v9 new array globals ──────────────────────────────────
    G.compact   = a       => a.filter(Boolean);
    G.flatten   = (a, d)  => a.flat(d ?? Infinity);
    G.first     = (a, n)  => n === undefined ? (a[0] ?? null) : a.slice(0, n);
    G.last      = (a, n)  => n === undefined ? (a[a.length-1] ?? null) : a.slice(-n);
    G.nth       = (a, n)  => a[n < 0 ? a.length + n : n] ?? null;
    G.zip       = (a, b)  => a.map((v, i) => [v, b[i] ?? null]);
    G.zipWith   = (a,b,fn)=> a.map((v,i) => fn(v, b[i] ?? null));
    G.chunk     = (a, n)  => { const r=[]; for(let i=0;i<a.length;i+=n) r.push(a.slice(i,i+n)); return r; };
    G.rotate    = (a, n)  => { if(!a.length)return[]; const s=((n%a.length)+a.length)%a.length; return [...a.slice(s),...a.slice(0,s)]; };
    G.shuffle   = a       => { const r=[...a]; for(let i=r.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[r[i],r[j]]=[r[j],r[i]];} return r; };
    G.tally     = a       => { const m=Object.create(null); a.forEach(x=>{const k=String(x);m[k]=(m[k]||0)+1;}); return m; };
    G.dedupe    = a       => [...new Set(a)];
    G.groupBy   = (a, fn) => { const m=Object.create(null); a.forEach(x=>{const k=String(fn(x));(m[k]||(m[k]=[])).push(x);}); return m; };
    G.partition = (a, fn) => [a.filter(x=>fn(x)), a.filter(x=>!fn(x))];
    G.diff      = (a, b)  => a.filter(x=>!b.includes(x));
    G.intersect = (a, b)  => a.filter(x=>b.includes(x));
    G.union     = (a, b)  => [...new Set([...a,...b])];
    G.matrix    = (r,c,v) => Array.from({length:r},()=>Array(c).fill(v??0));
    G.transpose = m       => m[0].map((_,i)=>m.map(row=>row[i]));
    G.product   = (a, b)  => a.flatMap(x=>b.map(y=>[x,y]));
    G.sample    = (a, n)  => { const s=[...a]; for(let i=s.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[s[i],s[j]]=[s[j],s[i]];} return s.slice(0,n??1); };
    G.sortBy    = (a, fn) => [...a].sort((x,y)=>{const kx=fn(x),ky=fn(y);return kx<ky?-1:kx>ky?1:0;});

    // ── JSON ──────────────────────────────────────────────────
    G.toJSON   = x => JSON.stringify(x instanceof StructInstance
      ? Object.fromEntries(Object.entries(x).filter(([k])=>k!=='__type__'))
      : x);
    G.fromJSON = s => JSON.parse(s);

    // ── Sorts ─────────────────────────────────────────────────
    G.sort         = a => [...a].sort((x,y) => typeof x==='string'&&typeof y==='string' ? x.localeCompare(y) : x-y);
    G.sortDesc     = a => [...a].sort((x,y) => typeof x==='string'&&typeof y==='string' ? y.localeCompare(x) : y-x);
    G.sortStr      = a => [...a].sort();
    G.bubbleSort   = arr => { arr=[...arr]; const n=arr.length; for(let i=0;i<n-1;i++) for(let j=0;j<n-i-1;j++) if(arr[j]>arr[j+1]){const t=arr[j];arr[j]=arr[j+1];arr[j+1]=t;} return arr; };
    G.selectionSort= arr => { arr=[...arr]; const n=arr.length; for(let i=0;i<n-1;i++){let m=i; for(let j=i+1;j<n;j++) if(arr[j]<arr[m])m=j; const t=arr[i];arr[i]=arr[m];arr[m]=t;} return arr; };
    G.insertionSort= arr => { arr=[...arr]; for(let i=1;i<arr.length;i++){const k=arr[i];let j=i-1; while(j>=0&&arr[j]>k){arr[j+1]=arr[j];j--;} arr[j+1]=k;} return arr; };
    G.mergeSort    = function ms(arr) { if(arr.length<=1)return arr; const m=arr.length>>1; const L=ms(arr.slice(0,m)),R=ms(arr.slice(m)); const res=[];let i=0,j=0; while(i<L.length&&j<R.length)res.push(L[i]<=R[j]?L[i++]:R[j++]); return res.concat(L.slice(i)).concat(R.slice(j)); };
    G.quickSort    = function qs(arr) { if(arr.length<=1)return arr; const p=arr[arr.length>>1]; return [...qs(arr.filter(x=>x<p)),...arr.filter(x=>x===p),...qs(arr.filter(x=>x>p))]; };
    G.heapSort     = arr => { arr=[...arr]; const n=arr.length; const h=(sz,i)=>{let lg=i,l=2*i+1,r=2*i+2; if(l<sz&&arr[l]>arr[lg])lg=l; if(r<sz&&arr[r]>arr[lg])lg=r; if(lg!==i){const t=arr[i];arr[i]=arr[lg];arr[lg]=t;h(sz,lg);}}; for(let i=Math.floor(n/2)-1;i>=0;i--)h(n,i); for(let i=n-1;i>0;i--){const t=arr[0];arr[0]=arr[i];arr[i]=t;h(i,0);} return arr; };
    G.countingSort = arr => { if(!arr.length)return[]; const mn=Math.min(...arr),mx=Math.max(...arr); const cnt=Array(mx-mn+1).fill(0); arr.forEach(x=>cnt[x-mn]++); const res=[]; cnt.forEach((c,i)=>{for(let j=0;j<c;j++)res.push(i+mn);}); return res; };

    // ── Search ────────────────────────────────────────────────
    G.linearSearch = (arr, t) => { for(let i=0;i<arr.length;i++) if(arr[i]===t) return i; return -1; };
    G.binarySearch = (arr, t) => { let lo=0,hi=arr.length-1; while(lo<=hi){const m=(lo+hi)>>1; if(arr[m]===t)return m; arr[m]<t?lo=m+1:hi=m-1;} return -1; };
    G.search = G.linearSearch;

    // ── NEW: @term — Terminal I/O namespace ───────────────────
    G['@term'] = {
      print:   (...args) => this._print(args.map(a => this._str(a)).join(' ')),
      printsl: (...args) => this._printSameLine(args.map(a => this._str(a)).join(' ')),
      nl:      ()        => this._print(''),
      warn:    (msg)     => this._print(`[WARN]  ${msg}`),
      error:   (msg)     => this._print(`[ERROR] ${msg}`),
      clear:   ()        => { for (let i = 0; i < 50; i++) this._print(''); },
      input:   (prompt)  => {
        const raw = this._inputFn
          ? this._inputFn(String(prompt || ''))
          : _readLineNode(String(prompt || ''));
        const trimmed = raw.trim();
        const n = Number(trimmed);
        return (trimmed !== '' && !isNaN(n)) ? n : raw;
      },
      flush:   ()        => this._flushSameLine(),
    };

    // ── NEW: $math — Extended math library ────────────────────
    G['$math'] = {
      clamp:     (x, lo, hi)   => Math.min(hi, Math.max(lo, x)),
      lerp:      (a, b, t)     => a + (b - a) * t,
      gcd:       function gcd(a, b) { a=Math.abs(a); b=Math.abs(b); while(b){const t=b; b=a%b; a=t;} return a; },
      lcm:       (a, b)        => Math.abs(a * b) / (function gcd(a,b){while(b){const t=b;b=a%b;a=t;}return a;})(Math.abs(a),Math.abs(b)),
      isPrime:   (n)           => { if(n<2)return false; if(n===2)return true; if(n%2===0)return false; for(let i=3;i<=Math.sqrt(n);i+=2)if(n%i===0)return false; return true; },
      primes:    (n)           => { const sieve=Array(n+1).fill(true); sieve[0]=sieve[1]=false; for(let i=2;i*i<=n;i++)if(sieve[i])for(let j=i*i;j<=n;j+=i)sieve[j]=false; return sieve.map((v,i)=>v?i:-1).filter(x=>x>0); },
      factorial: (n)           => { if(n<0)throw new Error('factorial: negative'); let r=1; for(let i=2;i<=n;i++)r*=i; return r; },
      fibonacci: (n)           => { if(n<=0)return 0; if(n===1)return 1; let a=0,b=1; for(let i=2;i<=n;i++){const c=a+b;a=b;b=c;} return b; },
      toHex:     (n)           => Math.trunc(n).toString(16),
      toBin:     (n)           => Math.trunc(n).toString(2),
      toOct:     (n)           => Math.trunc(n).toString(8),
      fromHex:   (s)           => parseInt(s, 16),
      fromBin:   (s)           => parseInt(s, 2),
      fromOct:   (s)           => parseInt(s, 8),
      toBase:    (n, b)        => Math.trunc(n).toString(b),
      fromBase:  (s, b)        => parseInt(s, b),
      sign:      (n)           => Math.sign(n),
      trunc:     (n)           => Math.trunc(n),
      frac:      (n)           => n - Math.trunc(n),
      cbrt:      (n)           => Math.cbrt(n),
      exp:       (n)           => Math.exp(n),
    };

    // ── NEW: $str — String utilities ──────────────────────────
    G['$str'] = {
      reverse:     (s)         => s.split('').reverse().join(''),
      isPalindrome:(s)         => { const c=s.toLowerCase().replace(/\s/g,''); return c===c.split('').reverse().join(''); },
      count:       (s, sub)    => { let n=0,i=0; while((i=s.indexOf(sub,i))!==-1){n++;i+=sub.length;} return n; },
      toTitle:     (s)         => s.replace(/\b\w/g, c => c.toUpperCase()),
      toCamel:     (s)         => s.replace(/[-_\s]+(.)/g, (_,c)=>c.toUpperCase()).replace(/^./, c=>c.toLowerCase()),
      toSnake:     (s)         => s.replace(/\s+/g,'_').replace(/([A-Z])/g, m=>'_'+m.toLowerCase()).replace(/^_/,''),
      template:    (s, obj)    => s.replace(/\{([^}]+)\}/g, (_,k)=>obj[k]!==undefined?String(obj[k]):`{${k}}`),
      escape:      (s)         => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
      isAlpha:     (s)         => /^[a-zA-Z]+$/.test(s),
      isDigit:     (s)         => /^\d+$/.test(s),
      isAlnum:     (s)         => /^[a-zA-Z0-9]+$/.test(s),
      center:      (s, n, ch)  => { const pad=Math.max(0,n-s.length); const l=Math.floor(pad/2); const r=pad-l; return (ch||' ').repeat(l)+s+(ch||' ').repeat(r); },
      wrap:        (s, n)      => { const words=s.split(' '); const lines=[]; let cur=''; for(const w of words){if(cur&&cur.length+1+w.length>n){lines.push(cur);cur=w;}else{cur=cur?cur+' '+w:w;}} if(cur)lines.push(cur); return lines.join('\n'); },
      lpad:        (s, n, c)   => s.padStart(n, c||' '),
      rpad:        (s, n, c)   => s.padEnd(n, c||' '),
      between:     (s, a, b)   => { const si=s.indexOf(a)+a.length; const ei=s.indexOf(b,si); return ei===-1?'':s.slice(si,ei); },
      repeat:      (s, n)      => s.repeat(n),
      normalize:   (s)         => s.trim().replace(/\s+/g,' '),
    };

    // ── NEW: $arr — Array utilities ───────────────────────────
    G['$arr'] = {
      zip:       (a, b)        => a.map((v, i) => [v, b[i] ?? null]),
      flatten:   (a)           => a.flat(Infinity),
      chunk:     (a, n)        => { const res=[]; for(let i=0;i<a.length;i+=n)res.push(a.slice(i,i+n)); return res; },
      rotate:    (a, n)        => { const len=a.length; if(!len)return[]; const s=((n%len)+len)%len; return [...a.slice(s),...a.slice(0,s)]; },
      shuffle:   (a)           => { const r=[...a]; for(let i=r.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[r[i],r[j]]=[r[j],r[i]];} return r; },
      sample:    (a, n)        => { const s=[...a]; for(let i=s.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[s[i],s[j]]=[s[j],s[i]];} return s.slice(0,n??1); },
      tally:     (a)           => { const m=Object.create(null); a.forEach(x=>{const k=String(x);m[k]=(m[k]||0)+1;}); return m; },
      partition: (a, fn)       => [a.filter(x=>fn(x)), a.filter(x=>!fn(x))],
      matrix:    (r, c, v)     => Array.from({length:r},()=>Array(c).fill(v??0)),
      transpose: (m)           => m[0].map((_,i)=>m.map(row=>row[i])),
      product:   (a, b)        => a.flatMap(x=>b.map(y=>[x,y])),
      groupBy:   (a, fn)       => { const m=Object.create(null); a.forEach(x=>{const k=String(fn(x));(m[k]||(m[k]=[])).push(x);}); return m; },
      diff:      (a, b)        => a.filter(x=>!b.includes(x)),
      intersect: (a, b)        => a.filter(x=>b.includes(x)),
      union:     (a, b)        => [...new Set([...a,...b])],
      sum:       (a)           => a.reduce((s,x)=>s+x,0),
      avg:       (a)           => a.reduce((s,x)=>s+x,0)/a.length,
      max:       (a)           => Math.max(...a),
      min:       (a)           => Math.min(...a),
    };

    // ── NEW: $io — I/O helpers ────────────────────────────────
    G['$io'] = {
      print:    (...args) => this._print(args.map(a => this._str(a)).join(' ')),
      printsl:  (...args) => this._printSameLine(args.map(a => this._str(a)).join(' ')),
      input:    (p)       => {
        const raw = this._inputFn ? this._inputFn(String(p||'')) : _readLineNode(String(p||''));
        const t = raw.trim(); const n = Number(t);
        return (t !== '' && !isNaN(n)) ? n : raw;
      },
      readLines: (n)      => {
        const lines = [];
        for (let i = 0; i < (n ?? 1); i++) {
          const raw = this._inputFn ? this._inputFn('') : _readLineNode('');
          lines.push(raw);
        }
        return lines;
      },
      flush:    ()        => this._flushSameLine(),
    };

    // ── NEW: $rand — Random utilities ─────────────────────────
    G['$rand'] = {
      int:     (min, max)  => Math.floor(Math.random() * (max - min + 1)) + min,
      float:   (min, max)  => Math.random() * (max - min) + min,
      bool:    ()          => Math.random() < 0.5,
      pick:    (arr)       => arr[Math.floor(Math.random() * arr.length)],
      shuffle: (arr)       => { const r=[...arr]; for(let i=r.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[r[i],r[j]]=[r[j],r[i]];} return r; },
      uuid:    ()          => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:r&0x3|0x8).toString(16);}),
      normal:  (mu, sigma) => { const u1=1-Math.random(),u2=Math.random(); return mu+sigma*Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2); },
      weighted:(arr, wts)  => { const tot=wts.reduce((s,w)=>s+w,0); let r=Math.random()*tot; for(let i=0;i<arr.length;i++){r-=wts[i];if(r<=0)return arr[i];} return arr[arr.length-1]; },
    };

    // ── NEW: $time — Time utilities ───────────────────────────
    G['$time'] = {
      now:    ()        => Date.now(),
      format: (ts, fmt) => {
        const d = new Date(ts ?? Date.now());
        if (!fmt) return d.toISOString();
        return fmt
          .replace('YYYY', d.getFullYear())
          .replace('MM',   String(d.getMonth()+1).padStart(2,'0'))
          .replace('DD',   String(d.getDate()).padStart(2,'0'))
          .replace('HH',   String(d.getHours()).padStart(2,'0'))
          .replace('mm',   String(d.getMinutes()).padStart(2,'0'))
          .replace('ss',   String(d.getSeconds()).padStart(2,'0'));
      },
      since:  (ts)      => Date.now() - ts,
      toDate: (ts)      => new Date(ts ?? Date.now()).toDateString(),
      year:   ()        => new Date().getFullYear(),
      month:  ()        => new Date().getMonth() + 1,
      day:    ()        => new Date().getDate(),
    };

    // ── NEW: $bit — Bitwise operations ────────────────────────
    G['$bit'] = {
      and:   (a, b) => (a|0) & (b|0),
      or:    (a, b) => (a|0) | (b|0),
      xor:   (a, b) => (a|0) ^ (b|0),
      not:   (a)    => ~(a|0),
      lsh:   (a, n) => (a|0) << (n|0),
      rsh:   (a, n) => (a|0) >> (n|0),
      ursh:  (a, n) => (a>>>0) >>> (n|0),
      count: (n)    => { let c=0,v=n>>>0; while(v){c+=v&1;v>>>=1;} return c; },  // popcount
      mask:  (n)    => (1 << n) - 1,
      getBit:(n, i) => (n >> i) & 1,
      setBit:(n, i) => n | (1 << i),
      clrBit:(n, i) => n & ~(1 << i),
      togBit:(n, i) => n ^ (1 << i),
    };

    // ── NEW: $conv — Type conversions ─────────────────────────
    G['$conv'] = {
      toFloat:   (x)    => parseFloat(String(x)),
      toByte:    (x)    => Math.max(0, Math.min(255, Math.trunc(Number(x)))),
      toChar:    (n)    => String.fromCharCode(n),
      fromChar:  (c)    => String(c).charCodeAt(0),
      toBase:    (n, b) => Math.trunc(Number(n)).toString(b),
      fromBase:  (s, b) => parseInt(String(s), b),
      toBigNum:  (x)    => (typeof BigInt !== 'undefined') ? BigInt(Math.trunc(Number(x))) : Math.trunc(Number(x)),
      toHex:     (n)    => '0x' + Math.trunc(Number(n)).toString(16),
      toBin:     (n)    => '0b' + Math.trunc(Number(n)).toString(2),
      toOct:     (n)    => '0o' + Math.trunc(Number(n)).toString(8),
      ord:       (s)    => String(s).charCodeAt(0),
      chr:       (n)    => String.fromCharCode(n),
      boolToInt: (b)    => b ? 1 : 0,
      intToBool: (n)    => n !== 0,
    };

    return G;
  }

  // ----------------------------------------------------------
  //  Tokenizer
  // ----------------------------------------------------------
  tokenize(code) {
    const tokens = [];
    let i = 0;
    let line = 1;

    const KEYWORDS = new Set([
      'let', 'set', 'str', 'num', 'bool', 'array', 'view',
      // NEW data types
      'float', 'byte', 'char', 'bignum',
      'const',   // v9: immutable modifier
      'if', 'else', 'for', 'each', 'while',
      'func', 'fn', 'return', 'in', 'to', 'step',
      'break', 'continue', 'struct', 'enum',
      'when', 'then',
      'attempt', 'rescue', 'raise',
      'match', 'on',
      'repeat', 'until',
      'is',
      'export'
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

      // NEW: identifiers starting with @  or  $
      // These become identifier tokens like "@term", "$math", etc.
      if (ch === '@' || ch === '$') {
        let word = ch; i++;
        while (i < code.length && /[a-zA-Z0-9_$]/.test(code[i])) word += code[i++];
        tokens.push({ type: 'identifier', value: word, line });
        continue;
      }

      // Regular identifiers / keywords — resolve type aliases first
      if (/[a-zA-Z_]/.test(ch)) {
        let word = '';
        while (i < code.length && /[a-zA-Z0-9_]/.test(code[i])) word += code[i++];
        // Resolve alias: "int" → "num", "string" → "str", etc.
        const effective = this._resolveTypeAlias(word);
        if      (effective === 'true')  tokens.push({ type: 'boolean', value: true,  line });
        else if (effective === 'false') tokens.push({ type: 'boolean', value: false, line });
        else if (effective === 'null')  tokens.push({ type: 'null',    value: null,  line });
        else if (KEYWORDS.has(effective)) tokens.push({ type: effective, line });
        else tokens.push({ type: 'identifier', value: effective, line });
        continue;
      }

      // Numbers
      if (/[0-9]/.test(ch)) {
        if (ch === '0' && (code[i+1]==='x'||code[i+1]==='X')) {
          let num = code[i++] + code[i++];
          while (i < code.length && /[0-9a-fA-F]/.test(code[i])) num += code[i++];
          tokens.push({ type: 'number', value: parseInt(num, 16), line });
        } else if (ch === '0' && (code[i+1]==='b'||code[i+1]==='B')) {
          let num = code[i++] + code[i++];
          while (i < code.length && /[01]/.test(code[i])) num += code[i++];
          tokens.push({ type: 'number', value: parseInt(num, 2), line });
        } else {
          let num = '';
          while (i < code.length && /[0-9.]/.test(code[i])) num += code[i++];
          tokens.push({ type: 'number', value: parseFloat(num), line });
        }
        continue;
      }

      // Strings "..." '...'
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
        tokens.push({ type: '...', line }); i += 3; continue;
      }

      // NEW: '->' arrow (for _medium @JS result spec, also usable in ZPP)
      if (ch === '-' && code[i+1] === '>') {
        tokens.push({ type: '->', line }); i += 2; continue;
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
        else if (ch==='*'&&nx==='*'){op='**'; i++;}   // v9 exponentiation
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

    // ── NEW: LUCIFER IS THE LORD; ─────────────────────────────
    if (t.type === 'identifier' && t.value === 'LUCIFER') {
      if (this._peek(1).value === 'IS'   &&
          this._peek(2).value === 'THE'  &&
          this._peek(3).value === 'LORD' &&
          this._peek(4).type  === ';') {
        this.pos += 5;   // consume LUCIFER IS THE LORD ;
        return { type: 'lucifer_decl', line };
      }
    }

    // ── NEW v9: const [const] <type> id = val; ───────────────
    if (t.type === 'const') {
      this._consume('const');
      let constLevel = 1;
      if (this._peek().type === 'const') { this._consume('const'); constLevel = 2; }
      return Object.assign(this._parseDecl(constLevel), { line });
    }

    // Standard type keywords (now includes float, byte, char, bignum)
    const DECL_KWS = ['let','set','str','num','bool','array','view','float','byte','char','bignum'];
    if (DECL_KWS.includes(t.type)) return Object.assign(this._parseDecl(0),          { line });
    if (t.type === 'struct')        return Object.assign(this._parseStructDef(),      { line });
    if (t.type === 'enum')          return Object.assign(this._parseEnum(),           { line });
    if (t.type === 'if')            return Object.assign(this._parseIf(),             { line });
    if (t.type === 'for')           return Object.assign(this._parseFor(),            { line });
    if (t.type === 'while')         return Object.assign(this._parseWhile(),          { line });
    if (t.type === 'repeat')        return Object.assign(this._parseRepeat(),         { line });
    if (t.type === 'func')          return Object.assign(this._parseFunc(),           { line });
    if (t.type === 'export')        return Object.assign(this._parseExport(),         { line });
    if (t.type === 'return')        return Object.assign(this._parseReturn(),         { line });
    if (t.type === 'raise')         return Object.assign(this._parseRaise(),          { line });
    if (t.type === 'attempt')       return Object.assign(this._parseAttempt(),        { line });
    if (t.type === 'match')         return Object.assign(this._parseMatch(),          { line });
    if (t.type === 'break')    { this.pos++; this._consume(';'); return { type: 'break',    line }; }
    if (t.type === 'continue') { this.pos++; this._consume(';'); return { type: 'continue', line }; }

    // StructName var; / StructName arr[n];
    if (t.type === 'identifier' && this._structNames.has(t.value)) {
      const t2 = this._peek(1);
      if (t2.type === 'identifier') return Object.assign(this._parseStructVarDecl(), { line });
    }

    if (t.type === 'identifier') return Object.assign(this._parseExprStmt(), { line });

    throw new Error(`Line ${line || '?'}: Unexpected token: '${t.type}'` +
      (t.value !== undefined ? ` ('${t.value}')` : ''));
  }

  // ----------------------------------------------------------
  //  Declarations (extended for float/byte/char/bignum)
  // ----------------------------------------------------------
  _parseDecl(constLevel = 0) {
    const keyword = this.tokens[this.pos++].type;
    const DECL_DEFAULTS = {
      num: 0, str: '', bool: false, let: null, set: null, array: [], view: null,
      float: 0.0, byte: 0, char: '\0', bignum: 0,
    };

    if (keyword === 'set' && this._peek().type !== 'identifier')
      throw new Error("'set' requires an identifier");

    // ── Destructuring: let [a,b] = arr;  let {x,y} = obj; ───
    if (keyword === 'let') {
      if (this._peek().type === '[') {
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
        return { type: 'destructure_arr', names, src, constLevel };
      }
      if (this._peek().type === '{') {
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
        return { type: 'destructure_obj', names, src, constLevel };
      }
    }

    const parseOne = (kw) => {
      const id = this._consume('identifier').value;
      if (this._peek().type === ';' || this._peek().type === ',') {
        if (kw === 'set') throw new Error(`'set' constant '${id}' must have a value`);
        return { type: 'decl', keyword: kw, id, value: null, defaultVal: DECL_DEFAULTS[kw], constLevel };
      }
      this._consume('=');

      // ── array shorthand: array x = [N];  → N zeros ──────────
      if (kw === 'array' && this._peek().type === '[') {
        const savedPos = this.pos;
        try {
          this._consume('[');
          if (this._peek().type === 'number' && this._peek(1).type === ']') {
            const count = this._consume('number').value;
            this._consume(']');
            return { type: 'decl', keyword: kw, id,
                     value: { type: 'array_shorthand', count }, defaultVal: undefined, constLevel };
          }
          this.pos = savedPos;   // not a shorthand — restore
        } catch (_) { this.pos = savedPos; }

        // Full typed init: array[type="num", num=5]
        if (this._peek().type === '[') {
          const t1 = this.tokens[this.pos+1], t2 = this.tokens[this.pos+2];
          if (t1 && t2 && t2.type==='=' && (t1.value==='type'||t1.type==='num')) {
            const init = this._parseArrayInit();
            return { type: 'decl', keyword: kw, id, value: init, defaultVal: undefined, constLevel };
          }
        }
      }

      const value = this._parseExpression();
      return { type: 'decl', keyword: kw, id, value, defaultVal: undefined, constLevel };
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
  //  struct definition
  // ----------------------------------------------------------
  _parseStructDef() {
    this._consume('struct');
    const name = this._consume('identifier').value;
    this._structNames.add(name);
    this._consume('{');
    const fields  = [];
    const methods = [];
    while (this._peek().type !== '}') {
      if (this._peek().type === 'fn') {
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
        if (['num','str','bool','float','byte','char','bignum'].includes(t.type)) {
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

  _parseRaise() {
    this._consume('raise');
    const value = this._parseExpression();
    this._consume(';');
    return { type: 'raise', value };
  }

  // ----------------------------------------------------------
  //  func — default params, variadic
  // ----------------------------------------------------------
  _parseFuncParams() {
    const params = [];
    const TYPE_KEYWORDS = new Set(['num','str','bool','let','array','float','byte','char','bignum']);
    while (this._peek().type !== ')') {
      if (this._peek().type === '...') {
        this._consume('...');
        const name = this._consume('identifier').value;
        params.push({ name, type: null, variadic: true, defaultVal: undefined });
        break;
      }
      let paramType = null;
      const pt = this._peek();
      if (TYPE_KEYWORDS.has(pt.type) || (pt.type==='identifier'&&this._structNames.has(pt.value))) {
        paramType = this.tokens[this.pos++].type || this.tokens[this.pos-1].value;
        if (this._peek().type !== 'identifier') {
          params.push({ name: paramType, type: null, variadic: false, defaultVal: undefined });
          if (this._peek().type === ',') this._consume(',');
          continue;
        }
      }
      const name = this._consume('identifier').value;
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

  _parseExport() {
    this._consume('export');
    const t = this._peek();
    if (t.type === 'func') {
      const funcNode = this._parseFunc();
      return { type: 'export_func', funcNode };
    }
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
  //  Expression statements
  // ----------------------------------------------------------
  _parseExprStmt() {
    const id = this._consume('identifier');

    if (this._peek().type === '=') {
      this._consume('=');
      const value = this._parseExpression();
      this._consume(';');
      return { type: 'assign', id: id.value, value };
    }

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

    if (this._peek().type === '[') {
      this._consume('[');
      const index = this._parseExpression();
      this._consume(']');

      if (this._peek().type === '.') {
        const chain = [];
        while (this._peek().type === '.') {
          this._consume('.'); chain.push(this._consume('identifier').value);
        }
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

      this._consume('=');
      const value = this._parseExpression();
      this._consume(';');
      return { type: 'array_assign', target: id.value, index, value };
    }

    if (this._peek().type === '.') {
      const chain = [];
      while (this._peek().type === '.') {
        this._consume('.'); chain.push(this._consume('identifier').value);
      }

      if (this._peek().type === '(') {
        const method = chain.pop();
        this._consume('(');
        const args = this._parseArgList();
        this._consume(')');
        this._consume(';');
        return { type: 'dot_method_stmt', target: id.value, chain, method, args };
      }

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

      this._consume('=');
      const value = this._parseExpression();
      this._consume(';');
      return { type: 'dot_assign', target: id.value, chain, value };
    }

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
    if (this._peek().type === 'when') {
      this._consume('when');
      const cond       = this._parseLogicalOr();
      this._consume('then');
      const consequent = this._parseLogicalOr();
      this._consume('else');
      const alternate  = this._parseExpression();
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
      if (t.type === 'is') {
        this._consume('is');
        const typeTok = this._peek();
        let typeName;
        if (['num','str','bool','array','func','float','byte','char','bignum'].includes(typeTok.type)) {
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
    let left = this._parsePower();
    while (['*','/','%'].includes(this._peek().value)) {
      const op = this._consume('operator').value;
      left = { type: 'binary', op, left, right: this._parsePower() };
    }
    return left;
  }
  // ── right-associative exponentiation (**) ─────────────────
  _parsePower() {
    const base = this._parseUnary();
    if (this._peek().value === '**') {
      const op = this._consume('operator').value;
      return { type: 'binary', op, left: base, right: this._parsePower() };
    }
    return base;
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

    if (t.type === '(') {
      this._consume('(');
      const expr = this._parseExpression();
      this._consume(')');
      return expr;
    }

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
    if (node.line) this._currentLine = node.line;

    switch (node.type) {

      case 'multi_decl': {
        for (const d of node.decls) this._exec(d, scope);
        return;
      }

      case 'decl': {
        // ── array shorthand: array x = [N]; ──────────────────
        if (node.value && node.value.type === 'array_shorthand') {
          scope[node.id] = Array(node.value.count).fill(0);
          this._markConst(scope, node.id, node.constLevel, node.keyword);
          return;
        }
        if (node.keyword === 'array' && node.value && node.value.type === 'array_init') {
          const count    = this._eval(node.value.countExpr, scope);
          const elemType = node.value.elemType;
          const defaults = { num: 0, str: '', float: 0.0, byte: 0, char: '\0', bignum: 0, bool: false, object: null };
          scope[node.id] = Array.from({ length: count }, () => defaults[elemType] ?? null);
          this._markConst(scope, node.id, node.constLevel, node.keyword);
          return;
        }

        let val = node.value !== null ? this._eval(node.value, scope) : node.defaultVal;

        // ── Type coercions / checks ────────────────────────────
        switch (node.keyword) {
          case 'num':
            if (typeof val === 'boolean') val = val ? 1 : 0;
            if (typeof val === 'string') { const n = Number(val.trim()); if (!isNaN(n)) { val = n; break; } }
            if (typeof val !== 'number') throw new Error(`Type error: '${node.id}' is num but got ${typeof val}`);
            break;
          case 'float':
            if (typeof val === 'boolean') { val = val ? 1.0 : 0.0; break; }
            if (typeof val === 'string')  { val = parseFloat(val); break; }
            if (typeof val !== 'number')  throw new Error(`Type error: '${node.id}' is float but got ${typeof val}`);
            break;
          case 'byte':
            val = Math.max(0, Math.min(255, Math.trunc(Number(val))));
            break;
          case 'char':
            if (typeof val === 'number') { val = String.fromCharCode(val); break; }
            if (typeof val === 'string' && val.length === 1) break;
            if (typeof val === 'string') { val = val[0] || '\0'; break; }
            throw new Error(`Type error: '${node.id}' is char but got ${JSON.stringify(val)}`);
          case 'bignum':
            if (typeof val === 'string') val = val.replace(/n$/, '');
            val = (typeof val === 'bigint') ? val
              : (typeof BigInt !== 'undefined' ? BigInt(Math.trunc(Number(val))) : Math.trunc(Number(val)));
            break;
          case 'str':
            if (typeof val === 'number') { val = String(val); break; }
            if (typeof val !== 'string') throw new Error(`Type error: '${node.id}' is str but got ${typeof val}`);
            break;
          case 'bool':
            if (typeof val !== 'boolean') throw new Error(`Type error: '${node.id}' is bool but got ${typeof val}`);
            break;
        }

        scope[node.id] = val;

        // ── Track type for auto-coercion on reassignment ───────
        const TYPED = new Set(['num','float','byte','char','bignum','str','bool']);
        if (TYPED.has(node.keyword)) {
          if (!Object.prototype.hasOwnProperty.call(scope, '__types__'))
            scope.__types__ = Object.create(null);
          scope.__types__[node.id] = node.keyword;
        }

        this._markConst(scope, node.id, node.constLevel, node.keyword);
        return;
      }

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

      case 'struct_def': {
        const { name, fields, methods } = node;
        this.structs[name] = fields;
        this.structs[name].__methods__ = methods || [];
        scope[name] = (...positionalArgs) => {
          const obj = new StructInstance(name, {});
          fields.forEach((f, i) => {
            const defaults = { num:0, str:'', bool:false, float:0.0, byte:0, char:'\0', bignum:0 };
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

      case 'enum_def': {
        const obj = Object.create(null);
        node.entries.forEach(e => { obj[e.name] = e.value; });
        Object.freeze(obj);
        scope[node.name] = obj;
        return;
      }

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

      case 'assign': {
        this._setVar(scope, node.id, this._eval(node.value, scope));
        return;
      }

      case 'compound_assign': {
        const cur = this._getVar(scope, node.id);
        const rhs = this._eval(node.value, scope);
        this._setVar(scope, node.id, this._applyOp(node.op, cur, rhs));
        return;
      }

      case 'array_assign': {
        const arr = this._getVar(scope, node.target);
        arr[this._eval(node.index, scope)] = this._eval(node.value, scope);
        return;
      }

      case 'index_compound': {
        const arr = this._getVar(scope, node.target);
        const idx = this._eval(node.index, scope);
        const rhs = this._eval(node.value, scope);
        arr[idx] = this._applyOp(node.op, arr[idx], rhs);
        return;
      }

      case 'index_dot_assign': {
        let obj = this._getVar(scope, node.target);
        obj = obj[this._eval(node.index, scope)];
        for (let i = 0; i < node.chain.length - 1; i++) obj = obj[node.chain[i]];
        obj[node.chain[node.chain.length - 1]] = this._eval(node.value, scope);
        return;
      }

      case 'index_dot_compound': {
        let obj = this._getVar(scope, node.target);
        obj = obj[this._eval(node.index, scope)];
        for (let i = 0; i < node.chain.length - 1; i++) obj = obj[node.chain[i]];
        const last = node.chain[node.chain.length - 1];
        const rhs  = this._eval(node.value, scope);
        obj[last] = this._applyOp(node.op, obj[last], rhs);
        return;
      }

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

      case 'call_stmt': {
        const fn = this._getVar(scope, node.id);
        if (typeof fn !== 'function') throw new Error(`'${node.id}' is not a function`);
        fn(...node.args.map(a => this._eval(a, scope)));
        return;
      }

      case 'if': {
        if (this._eval(node.condition, scope)) {
          return this._execBlock(node.thenBody, Object.create(scope));
        } else if (node.elseBody) {
          return this._execBlock(node.elseBody, Object.create(scope));
        }
        return;
      }

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

      case 'while': {
        while (this._eval(node.condition, scope)) {
          const sig = this._execBlock(node.body, Object.create(scope));
          if (sig instanceof ReturnSignal) return sig;
          if (sig instanceof ThrowSignal)  return sig;
          if (sig instanceof BreakSignal)  break;
        }
        return;
      }

      case 'repeat': {
        do {
          const sig = this._execBlock(node.body, Object.create(scope));
          if (sig instanceof ReturnSignal) return sig;
          if (sig instanceof ThrowSignal)  return sig;
          if (sig instanceof BreakSignal)  break;
        } while (this._eval(node.condition, scope) === false);
        return;
      }

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
        if (node.elseBody) return this._execBlock(node.elseBody, Object.create(scope));
        return;
      }

      case 'attempt': {
        let sig;
        try {
          sig = this._execBlock(node.tryBody, Object.create(scope));
        } catch (jsErr) {
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

      case 'raise': {
        const val = this._eval(node.value, scope);
        return new ThrowSignal(val);
      }

      case 'func': {
        scope[node.id] = this._makeFn(node.params, node.body, scope);
        return;
      }

      case 'return': {
        const val = node.value !== null ? this._eval(node.value, scope) : null;
        return new ReturnSignal(val);
      }

      case 'export_func': {
        this._exec(node.funcNode, scope);
        this.__exports__.add(node.funcNode.id);
        return;
      }

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

      // ── NEW: LUCIFER IS THE LORD; ─────────────────────────────
      case 'lucifer_decl': {
        const banner = [
          '╔══════════════════════════════════════════════╗',
          '║   ⚡  L U C I F E R   I S   T H E   L O R D  ⚡   ║',
          '║          ZETA++ v8.0  •  Power Mode ON        ║',
          '╚══════════════════════════════════════════════╝',
        ];
        banner.forEach(l => this._print(l));
        this._luciferMode = true;
        return;
      }

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

        if (isVar) { fs[name] = args.slice(argIdx); break; }

        let val = argIdx < args.length ? args[argIdx++]
          : (defVal !== undefined ? this._eval(defVal, closure) : null);

        if (ptype === 'num') {
          if (typeof val === 'string') {
            const n = Number(val);
            if (isNaN(n)) throw new Error(`Param '${name}' expects num, got "${val}"`);
            val = n;
          } else if (typeof val !== 'number' && val !== null) {
            throw new Error(`Param '${name}' expects num, got ${typeof val}`);
          }
        } else if (ptype === 'float') {
          if (typeof val === 'string') val = parseFloat(val);
          if (typeof val !== 'number' && val !== null)
            throw new Error(`Param '${name}' expects float, got ${typeof val}`);
        } else if (ptype === 'byte') {
          val = Math.max(0, Math.min(255, Math.trunc(Number(val))));
        } else if (ptype === 'char') {
          if (typeof val === 'number') val = String.fromCharCode(val);
          if (typeof val !== 'string' || val.length !== 1)
            throw new Error(`Param '${name}' expects char, got ${JSON.stringify(val)}`);
        } else if (ptype === 'bignum') {
          val = (typeof BigInt !== 'undefined') ? BigInt(Math.trunc(Number(val))) : Math.trunc(Number(val));
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
      if (sig instanceof ThrowSignal) throw sig;
      return sig instanceof ReturnSignal ? sig.value : null;
    };
  }

  _makeStructDefault(typeName, scope) {
    const def = this.structs[typeName];
    if (!def) return null;
    const typeDefaults = { num: 0, str: '', bool: false, float: 0.0, byte: 0, char: '\0', bignum: 0 };
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
          // Simple variable interpolation (supports $ and @ prefixes too)
          if (/[a-zA-Z_$@]/.test(src[i+1])) {
            let j = i + 1;
            while (j < src.length && /[a-zA-Z0-9_$@]/.test(src[j])) j++;
            while (j < src.length && src[j]==='.' && /[a-zA-Z_$@]/.test(src[j+1])) {
              j++;
              while (j < src.length && /[a-zA-Z0-9_$@]/.test(src[j])) j++;
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
          if (e instanceof ThrowSignal) return e;
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

      case 'lambda': {
        const capturedScope = scope;
        if (node.expr !== null) {
          return (...args) => {
            const fs = Object.create(capturedScope);
            node.params.forEach((p, i) => {
              const name = typeof p === 'string' ? p : p.name;
              fs[name] = args[i] ?? null;
            });
            return this._eval(node.expr, fs);
          };
        }
        return this._makeFn(node.params, node.body, capturedScope);
      }

      case 'when_expr': {
        return this._eval(node.cond, scope)
          ? this._eval(node.consequent, scope)
          : this._eval(node.alternate, scope);
      }

      case 'is_expr': {
        const val = this._eval(node.value, scope);
        const t   = node.typeName;
        if (t === 'num')    return typeof val === 'number';
        if (t === 'str')    return typeof val === 'string';
        if (t === 'bool')   return typeof val === 'boolean';
        if (t === 'array')  return Array.isArray(val);
        if (t === 'func')   return typeof val === 'function';
        if (t === 'null')   return val === null || val === undefined;
        // NEW types
        if (t === 'float')  return typeof val === 'number';
        if (t === 'byte')   return typeof val === 'number' && Number.isInteger(val) && val >= 0 && val <= 255;
        if (t === 'char')   return typeof val === 'string' && val.length === 1;
        if (t === 'bignum') return typeof val === 'bigint' || (typeof val === 'number' && Number.isInteger(val));
        return val instanceof StructInstance && val.__type__ === t;
      }

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

        // ── BigInt arithmetic ─────────────────────────────────
        if (typeof l === 'bigint' || typeof r === 'bigint') {
          const bl = typeof l==='bigint' ? l : (typeof BigInt!=='undefined' ? BigInt(Math.trunc(Number(l))) : Number(l));
          const br = typeof r==='bigint' ? r : (typeof BigInt!=='undefined' ? BigInt(Math.trunc(Number(r))) : Number(r));
          switch (node.op) {
            case '+':  return bl + br;
            case '-':  return bl - br;
            case '*':  return bl * br;
            case '/':  if (br === 0n) throw new Error('BigNum division by zero'); return bl / br;
            case '%':  return bl % br;
            case '**': return bl ** br;
            case '==': return bl === br;
            case '!=': return bl !== br;
            case '>':  return bl > br;
            case '<':  return bl < br;
            case '>=': return bl >= br;
            case '<=': return bl <= br;
            default:   throw new Error(`Operator '${node.op}' not supported for bignum`);
          }
        }

        switch (node.op) {
          case '+':  return l + r;
          case '-':  return l - r;
          case '*':  return l * r;
          case '/':  if (r === 0) throw new Error('Division by zero'); return l / r;
          case '%':  return l % r;
          case '**': return l ** r;                // v9 exponentiation
          case '==': return l === r;
          case '!=': return l !== r;
          case '>':  return l > r;
          case '<':  return l < r;
          case '>=': return l >= r;
          case '<=': return l <= r;
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
        case 'push':        target.push(...args);      return target;
        case 'pop':         return target.pop();
        case 'shift':       return target.shift();
        case 'unshift':     target.unshift(...args);   return target;
        case 'indexOf':     return target.indexOf(args[0]);
        case 'lastIndexOf': return target.lastIndexOf(args[0]);
        case 'findIndex':   return target.findIndex((x,i) => this._callFn(args[0],[x,i]));
        case 'includes':    return target.includes(args[0]);
        case 'join':        return target.join(args[0] ?? ',');
        case 'slice':       return target.slice(...args);
        case 'concat':      return target.concat(args[0]);
        case 'reverse':     return [...target].reverse();
        case 'len':         return target.length;
        case 'at':          { const idx=args[0]; return target[idx<0?target.length+idx:idx]??null; }
        case 'fill':        return target.fill(args[0], args[1], args[2]);
        case 'flat':        return target.flat(args[0] ?? 1);
        case 'flatten':     return target.flat(Infinity);
        case 'compact':     return target.filter(Boolean);
        case 'dedupe':      return [...new Set(target)];
        case 'unique':      return [...new Set(target)];
        case 'first':       return args[0]!==undefined ? target.slice(0,args[0]) : (target[0]??null);
        case 'last':        return args[0]!==undefined ? target.slice(-args[0])  : (target[target.length-1]??null);
        case 'sum':         return target.reduce((s,x) => s+x, 0);
        case 'avg':         return target.reduce((s,x) => s+x, 0) / target.length;
        case 'min':         return Math.min(...target);
        case 'max':         return Math.max(...target);
        case 'sort': {
          if (args[0]) return [...target].sort((a,b) => this._callFn(args[0],[a,b]));
          return [...target].sort((a,b) => typeof a==='string'&&typeof b==='string' ? a.localeCompare(b) : a-b);
        }
        case 'sortDesc':    return [...target].sort((a,b) => typeof a==='string'&&typeof b==='string' ? b.localeCompare(a) : b-a);
        case 'sortBy':      return [...target].sort((a,b) => { const ka=this._callFn(args[0],[a]),kb=this._callFn(args[0],[b]); return ka<kb?-1:ka>kb?1:0; });
        case 'map':         return target.map(   (x,i) => this._callFn(args[0],[x,i]));
        case 'filter':      return target.filter((x,i) => this._callFn(args[0],[x,i]));
        case 'find':        return target.find(  (x,i) => this._callFn(args[0],[x,i])) ?? null;
        case 'every':       return target.every( (x,i) => this._callFn(args[0],[x,i]));
        case 'some':        return target.some(  (x,i) => this._callFn(args[0],[x,i]));
        case 'flatMap':     return target.flatMap((x,i)=> this._callFn(args[0],[x,i]));
        case 'reduce': {
          if (args.length < 2) throw new Error('reduce requires initial value as 2nd arg');
          return target.reduce((acc,x) => this._callFn(args[0],[acc,x]), args[1]);
        }
        case 'sortBy': {
          return [...target].sort((a,b) => { const ka=this._callFn(args[0],[a]),kb=this._callFn(args[0],[b]); return ka<kb?-1:ka>kb?1:0; });
        }
        case 'count':       return args[0] ? target.filter(x=>this._callFn(args[0],[x])).length : target.length;
        case 'zip':         return target.map((v,i) => [v,(args[0]??[])[i]??null]);
        case 'chunk': {
          const n=args[0]; const r=[]; for(let i=0;i<target.length;i+=n) r.push(target.slice(i,i+n)); return r;
        }
        case 'rotate': {
          const n=args[0]??1; if(!target.length) return [];
          const s=((n%target.length)+target.length)%target.length;
          return [...target.slice(s),...target.slice(0,s)];
        }
        case 'shuffle': {
          const r=[...target]; for(let i=r.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[r[i],r[j]]=[r[j],r[i]];} return r;
        }
        case 'tally': {
          const m=Object.create(null); target.forEach(x=>{const k=String(x);m[k]=(m[k]||0)+1;}); return m;
        }
        case 'groupBy': {
          const m=Object.create(null); target.forEach(x=>{const k=String(this._callFn(args[0],[x]));(m[k]||(m[k]=[])).push(x);}); return m;
        }
        case 'partition':   return [target.filter(x=>this._callFn(args[0],[x])), target.filter(x=>!this._callFn(args[0],[x]))];
        case 'transpose':   return target[0].map((_,i) => target.map(row => row[i]));
        case 'entries':     return target.map((v,i) => [i,v]);
        case 'keys':        return target.map((_,i) => i);
        case 'values':      return [...target];
        case 'toStr':       return JSON.stringify(target);
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
        case 'at':         { const idx=args[0]; return target[idx<0?target.length+idx:idx]??null; }
        case 'indexOf':    return target.indexOf(args[0]);
        case 'includes':   return target.includes(args[0]);
        case 'replace':    return target.replace(args[0], args[1]);
        case 'replaceAll': return target.split(args[0]).join(args[1]);
        case 'startsWith': return target.startsWith(args[0]);
        case 'endsWith':   return target.endsWith(args[0]);
        case 'repeat':     return target.repeat(args[0]);
        case 'toNum':      return Number(target);
        case 'charCode':   return target.charCodeAt(args[0] ?? 0);
        case 'chars':      return target.split('');
        case 'words':      return target.trim().split(/\s+/);
        case 'lines':      return target.split('\n');
        case 'reverse':    return target.split('').reverse().join('');
        case 'isPalindrome':{ const c=target.toLowerCase().replace(/\s/g,''); return c===c.split('').reverse().join(''); }
        case 'toTitle':    return target.replace(/\b\w/g, c => c.toUpperCase());
        case 'toCamel':    return target.replace(/[-_\s]+(.)/g,(_,c)=>c.toUpperCase()).replace(/^./,c=>c.toLowerCase());
        case 'toSnake':    return target.replace(/\s+/g,'_').replace(/([A-Z])/g,m=>'_'+m.toLowerCase()).replace(/^_/,'');
        case 'count':      { let n=0,i=0; while((i=target.indexOf(args[0],i))!==-1){n++;i+=args[0].length;} return n; }
        case 'padLeft':    return target.padStart(args[0]??0, args[1]??' ');
        case 'padRight':   return target.padEnd(args[0]??0,   args[1]??' ');
        case 'isAlpha':    return /^[a-zA-Z]+$/.test(target);
        case 'isDigit':    return /^\d+$/.test(target);
        case 'isAlnum':    return /^[a-zA-Z0-9]+$/.test(target);
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

  // ── Helper: mark a variable as const/set and optionally freeze ─
  _markConst(scope, id, constLevel, keyword) {
    const isConst = (keyword === 'set') || (constLevel >= 1);
    if (isConst) {
      if (!Object.prototype.hasOwnProperty.call(scope, '__consts__'))
        scope.__consts__ = new Set();
      scope.__consts__.add(id);
    }
    // const const: deep-freeze arrays / objects
    if (constLevel >= 2) {
      const val = scope[id];
      if (val !== null && typeof val === 'object') Object.freeze(val);
    }
  }

  _setVar(scope, name, value) {
    let s = scope;
    while (s !== null) {
      if (Object.prototype.hasOwnProperty.call(s, name)) {
        if (s.__consts__ && s.__consts__.has(name))
          throw new Error(`Cannot reassign constant '${name}'`);
        // Auto-coerce on reassignment if the variable has a declared type
        if (s.__types__ && s.__types__[name])
          value = this._coerceToType(value, s.__types__[name]);
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
    if (typeof val === 'bigint')   return val.toString() + 'n';   // NEW: bignum display
    if (typeof val === 'function') return '<func>';
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
// ═══════════════════════════════════════════════════════════════
//  ZETA++ v9.0 — Feature Showcase
//  node interpreter.js          (runs this demo)
//  node interpreter.js file.zpp (runs your file)
// ═══════════════════════════════════════════════════════════════

creator("ZETA++ v9.0  —  Feature Showcase");
LUCIFER IS THE LORD;

// ── renameDatatype ────────────────────────────────────────────
renameDatatype("num",    "int");
renameDatatype("str",    "string");
renameDatatype("int",    "integer");   // chain: "integer" → "num"

int     age  = 25;       print("int age = #age");
string  name = "ZETA";   print("string name = #name");
integer val  = 999;      print("integer val = #val");

// ── const & const const ───────────────────────────────────────
const num PI = 3.14159;
print("const PI = #PI");
// PI = 0;   // ← would throw "Cannot reassign constant"

const const array PRIMES = [2, 3, 5, 7, 11];
print("const const PRIMES = " + join(PRIMES, ", "));

// ── float ─────────────────────────────────────────────────────
float f = 1.5;
f = 2.75;             // reassignment still allowed
print("float f = #f   isFloat=#(isFloat(f))");
print("2 ** 10 = " + (2 ** 10));

// ── byte  (auto-clamps on every write) ────────────────────────
byte b = 200;
b = 300;    print("byte 300 → #b");    // 255
b = -5;     print("byte -5  → #b");    // 0
b = 65;     print("byte 65  → #b (char: " + toChar(b) + ")");
print("byteAdd(200,100) = " + byteAdd(200,100));
print("byteFlip(0)      = " + byteFlip(0));
print("byteInfo(42)     = " + toJSON(byteInfo(42)));

// ── char  (auto-coerces to single char on write) ──────────────
char c = "A";
c = 66;       print("char = '#c'  nextChar = '#(nextChar(c))'");
print("charRange a-e: " + join(charRange("a","e"), " "));
print("isUpper(A) = " + isUpper("A") + "   isLower(z) = " + isLower("z"));

// ── bignum  (true BigInt arithmetic) ─────────────────────────
bignum huge = 9007199254740993;
bignum huge2 = 9007199254740993;
let bigResult = huge + huge2;
print("bignum + bignum = #bigResult");
print("bigPow(2n,64n)  = " + bigToStr(bigPow(2, 64)));
print("bigGcd(48,18)   = " + bigGcd(48, 18));

// ── Array v9 ─────────────────────────────────────────────────
array zeros = [5];          print("array[5]: " + join(zeros, " "));
array nums = [3,1,4,1,5,9,2,6,5,3];
print("sort (auto):   " + join(nums.sort(),       " "));
print("dedupe:        " + join(nums.dedupe(),      " "));
print("compact:       " + join([0,1,false,2,null,3].compact(), " "));
print("first(3):      " + join(nums.first(3),     " "));
print("last(2):       " + join(nums.last(2),      " "));
print("at(-1):        " + nums.at(-1));
print("findIndex >5:  " + nums.findIndex(fn(x) => x > 5));
print("chunk(4):      " + toJSON(nums.chunk(4)));
print("rotate(3):     " + join(nums.rotate(3),    " "));
print("tally:         " + toJSON(nums.tally()));
print("sum / avg:     " + nums.sum() + " / " + nums.avg());
print("entries[0]:    " + join(nums.entries()[0], ":"));

// ── global array helpers ──────────────────────────────────────
print("zip:           " + toJSON(zip([1,2,3],[4,5,6])));
print("flatten:       " + join(flatten([[1,[2]],[[3,4]]]), " "));
print("dedupe global: " + join(dedupe([1,1,2,3,3]), " "));

// ── printsl same-line ─────────────────────────────────────────
printsl("Counting: ");
for i in 1 to 5 { printsl(i + " "); }
print("done!");

// ── _medium @JS block ─────────────────────────────────────────
_medium @JS -> {
  function factorial(n){ return n<=1?1:n*factorial(n-1); }
  function greet(who){ return "JS says hello, " + who + "!"; }
  @export.funcName[factorial, greet];
} -> result([@get.funcName(factorial): jsFactorial, @get.funcName(greet): jsGreet]);

print(jsGreet("ZETA++ v9"));
print("12! = " + jsFactorial(12));

// ── existing features still work ─────────────────────────────
export func square(num n) { return n * n; }
print("square(9) = " + square(9));

enum Status { OK=200 NOT_FOUND=404 ERROR=500 }
print("Status.NOT_FOUND = " + Status.NOT_FOUND);
`;
  }
  try {
    interp.interpret(code);
  } catch (e) {
    process.stderr.write('\x1b[31mError:\x1b[0m ' + e.message + '\n');
    process.exit(1);
  }
}