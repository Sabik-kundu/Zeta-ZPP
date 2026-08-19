(function TextLoaderLib() {
'use strict';

// ── Internal state ────────────────────────────────────────────────────────────

/** Active loaded content cache: { path → string } */
const _cache = {};

/** Detect runtime environment */
const _ENV = (function () {
  if (typeof process !== 'undefined' && process.versions && process.versions.node) return 'node';
  if (typeof window  !== 'undefined' && window.__ZPP__)                           return 'zpp';
  return 'browser';
})();

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Synchronously read a file (Node / Electron only).
 * Returns the file content as a string, or null on failure.
 */
function _fsRead(path) {
  if (_ENV === 'node') {
    try {
      const fs = require('fs');
      return fs.readFileSync(path, 'utf8');
    } catch (e) {
      return null;
    }
  }
  return null;
}

/**
 * Synchronously write a file (Node / Electron only).
 * Returns true on success, false on failure.
 */
function _fsWrite(path, content) {
  if (_ENV === 'node') {
    try {
      const fs   = require('fs');
      const path_ = require('path');
      const dir  = path_.dirname(path);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path, content, 'utf8');
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

/**
 * Detect file extension (lower-case, no dot).
 *   _ext('notes.txt')  → 'txt'
 *   _ext('data.CSV')   → 'csv'
 */
function _ext(path) {
  const parts = String(path).split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/**
 * Validate that `content` is a string; throw a clear error otherwise.
 */
function _requireStr(content, method) {
  if (typeof content !== 'string') {
    throw new TypeError('[textloader] ' + method + '() expects a string, got ' + typeof content);
  }
}

// ── Main text object ──────────────────────────────────────────────────────────
const text = {};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Loading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * text.load(path)
 * Loads a text file from the file system and returns its full content as a string.
 * Works with any plain-text format: .txt, .csv, .json, .md, .log, .zl, .html …
 * The result is also stored in the internal cache (see text.cached).
 *
 *   let src = text.load("notes.txt");
 *   let src = text.load("data/config.json");
 */
text.load = (path) => {
  if (typeof path !== 'string' || path.trim() === '') {
    throw new TypeError('[textloader] load() requires a non-empty file path.');
  }

  // Node / Electron — synchronous fs read
  if (_ENV === 'node') {
    const content = _fsRead(path);
    if (content === null) throw new Error('[textloader] Cannot read file: ' + path);
    _cache[path] = content;
    return content;
  }

  // Browser / ZPP — try __ZPP__.readFile if provided, else throw helpful message
  if (typeof window !== 'undefined' && window.__ZPP__ && typeof window.__ZPP__.readFile === 'function') {
    const content = window.__ZPP__.readFile(path);
    if (content === null || content === undefined) {
      throw new Error('[textloader] Cannot read file: ' + path);
    }
    _cache[path] = String(content);
    return String(content);
  }

  throw new Error('[textloader] load() is not supported in this environment. Use text.fromString() to load raw text instead.');
};

/**
 * text.loadLines(path)
 * Loads a file and returns its content split into an array of lines.
 * Empty trailing newline is removed automatically.
 *
 *   let rows = text.loadLines("log.txt");
 *   // → ["line one", "line two", ...]
 */
text.loadLines = (path) => {
  const raw = text.load(path);
  const lines = raw.split(/\r\n|\r|\n/);
  // Drop a single trailing empty line produced by a file-ending newline
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
};

/**
 * text.fromString(str)
 * Wraps a raw string so it can be used with all text.* methods.
 * Useful in browser environments where file access is unavailable,
 * or when you already have content in memory.
 *
 *   let src = text.fromString("hello world\nsecond line");
 */
text.fromString = (str) => {
  if (typeof str !== 'string') throw new TypeError('[textloader] fromString() expects a string.');
  return str;
};

/**
 * text.cached(path)
 * Returns the cached content of a previously loaded file, or null if not cached.
 *
 *   let src = text.cached("notes.txt");
 */
text.cached = (path) => _cache[path] !== undefined ? _cache[path] : null;

/**
 * text.clearCache(path?)
 * Clears the cache. Pass a path to clear only one entry, or call with no
 * argument to clear everything.
 *
 *   text.clearCache("notes.txt");   // clear one
 *   text.clearCache();              // clear all
 */
text.clearCache = (path) => {
  if (path !== undefined) {
    delete _cache[path];
  } else {
    Object.keys(_cache).forEach(k => delete _cache[k]);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Editing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * text.edit(content, fn)
 * Applies a custom editor function to the content string and returns the result.
 * The function receives the full string and must return a new string.
 *
 *   let result = text.edit(src, s => s.split(" ").reverse().join(" "));
 */
text.edit = (content, fn) => {
  _requireStr(content, 'edit');
  if (typeof fn !== 'function') throw new TypeError('[textloader] edit() requires a function as the second argument.');
  const result = fn(content);
  if (typeof result !== 'string') throw new TypeError('[textloader] edit() function must return a string.');
  return result;
};

/**
 * text.replace(content, from, to)
 * Replaces all occurrences of `from` (string or RegExp) with `to`.
 *
 *   let result = text.replace(src, "foo", "bar");
 *   let result = text.replace(src, /foo/gi, "bar");
 */
text.replace = (content, from, to) => {
  _requireStr(content, 'replace');
  if (typeof to !== 'string') throw new TypeError('[textloader] replace() requires a string as the third argument.');
  if (typeof from === 'string') {
    // Replace ALL occurrences (not just the first like String.replace)
    return content.split(from).join(to);
  }
  if (from instanceof RegExp) return content.replace(from, to);
  throw new TypeError('[textloader] replace() from must be a string or RegExp.');
};

/**
 * text.insert(content, position, str)
 * Inserts `str` at character index `position`.
 * Negative positions count from the end.
 *
 *   let result = text.insert(src, 5, "---");
 *   let result = text.insert(src, -1, "EOF");
 */
text.insert = (content, position, str) => {
  _requireStr(content, 'insert');
  if (typeof str !== 'string') throw new TypeError('[textloader] insert() requires a string as the third argument.');
  const len = content.length;
  let pos = typeof position === 'number' ? position : parseInt(position, 10);
  if (isNaN(pos)) throw new TypeError('[textloader] insert() position must be a number.');
  if (pos < 0) pos = Math.max(0, len + pos + 1);
  if (pos > len) pos = len;
  return content.slice(0, pos) + str + content.slice(pos);
};

/**
 * text.remove(content, start, end)
 * Removes characters from index `start` up to (not including) index `end`.
 * Negative indices count from the end.
 *
 *   let result = text.remove(src, 0, 5);    // remove first 5 chars
 *   let result = text.remove(src, -3);      // remove last 3 chars
 */
text.remove = (content, start, end) => {
  _requireStr(content, 'remove');
  const len = content.length;
  let s = typeof start === 'number' ? start : 0;
  let e = end !== undefined ? end : len;
  if (s < 0) s = Math.max(0, len + s);
  if (e < 0) e = Math.max(0, len + e);
  return content.slice(0, s) + content.slice(e);
};

/**
 * text.append(content, str)
 * Appends `str` to the end of `content`.
 *
 *   let result = text.append(src, "\n-- end --");
 */
text.append = (content, str) => {
  _requireStr(content, 'append');
  return content + String(str);
};

/**
 * text.prepend(content, str)
 * Prepends `str` to the beginning of `content`.
 *
 *   let result = text.prepend(src, "HEADER\n");
 */
text.prepend = (content, str) => {
  _requireStr(content, 'prepend');
  return String(str) + content;
};

/**
 * text.trim(content, mode?)
 * Removes surrounding whitespace.
 * mode: 'both' (default) | 'start' | 'end'
 *
 *   let result = text.trim(src);
 *   let result = text.trim(src, 'start');
 */
text.trim = (content, mode) => {
  _requireStr(content, 'trim');
  if (!mode || mode === 'both') return content.trim();
  if (mode === 'start')         return content.trimStart ? content.trimStart() : content.replace(/^\s+/, '');
  if (mode === 'end')           return content.trimEnd   ? content.trimEnd()   : content.replace(/\s+$/, '');
  return content.trim();
};

/**
 * text.upper(content)
 * Converts the entire content to uppercase.
 *
 *   let result = text.upper(src);
 */
text.upper = (content) => {
  _requireStr(content, 'upper');
  return content.toUpperCase();
};

/**
 * text.lower(content)
 * Converts the entire content to lowercase.
 *
 *   let result = text.lower(src);
 */
text.lower = (content) => {
  _requireStr(content, 'lower');
  return content.toLowerCase();
};

/**
 * text.capitalize(content)
 * Capitalizes the first letter of every word.
 *
 *   text.capitalize("hello world")   → "Hello World"
 */
text.capitalize = (content) => {
  _requireStr(content, 'capitalize');
  return content.replace(/\b[a-z]/g, ch => ch.toUpperCase());
};

/**
 * text.reverse(content)
 * Reverses the entire string character by character.
 *
 *   text.reverse("hello")   → "olleh"
 */
text.reverse = (content) => {
  _requireStr(content, 'reverse');
  return content.split('').reverse().join('');
};

/**
 * text.wrap(content, width)
 * Word-wraps the content so no line exceeds `width` characters.
 *
 *   let result = text.wrap(src, 80);
 */
text.wrap = (content, width) => {
  _requireStr(content, 'wrap');
  const w = typeof width === 'number' && width > 0 ? width : 80;
  return content.split('\n').map(line => {
    if (line.length <= w) return line;
    const words = line.split(' ');
    const rows  = [];
    let   cur   = '';
    for (const word of words) {
      if ((cur + (cur ? ' ' : '') + word).length > w) {
        if (cur) rows.push(cur);
        cur = word;
      } else {
        cur = cur ? cur + ' ' + word : word;
      }
    }
    if (cur) rows.push(cur);
    return rows.join('\n');
  }).join('\n');
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Line operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * text.lines(content)
 * Splits content into an array of lines. Handles \r\n, \r, and \n.
 *
 *   let arr = text.lines(src);
 */
text.lines = (content) => {
  _requireStr(content, 'lines');
  return content.split(/\r\n|\r|\n/);
};

/**
 * text.joinLines(arr, sep?)
 * Joins an array of lines back into a single string.
 * Default separator is "\n".
 *
 *   let joined = text.joinLines(arr);
 *   let joined = text.joinLines(arr, "\r\n");
 */
text.joinLines = (arr, sep) => {
  if (!Array.isArray(arr)) throw new TypeError('[textloader] joinLines() expects an array.');
  return arr.join(sep !== undefined ? String(sep) : '\n');
};

/**
 * text.getLine(content, n)
 * Returns the nth line (0-indexed). Negative n counts from the end.
 * Returns null if out of bounds.
 *
 *   let first = text.getLine(src, 0);
 *   let last  = text.getLine(src, -1);
 */
text.getLine = (content, n) => {
  _requireStr(content, 'getLine');
  const arr = text.lines(content);
  const idx = n < 0 ? arr.length + n : n;
  return idx >= 0 && idx < arr.length ? arr[idx] : null;
};

/**
 * text.setLine(content, n, newLine)
 * Replaces the nth line with `newLine`. Returns the modified content string.
 *
 *   let result = text.setLine(src, 0, "# New Title");
 */
text.setLine = (content, n, newLine) => {
  _requireStr(content, 'setLine');
  const arr = text.lines(content);
  const idx = n < 0 ? arr.length + n : n;
  if (idx < 0 || idx >= arr.length) throw new RangeError('[textloader] setLine() index out of bounds: ' + n);
  arr[idx] = String(newLine);
  return arr.join('\n');
};

/**
 * text.deleteLine(content, n)
 * Deletes the nth line and returns the modified content string.
 *
 *   let result = text.deleteLine(src, 2);
 */
text.deleteLine = (content, n) => {
  _requireStr(content, 'deleteLine');
  const arr = text.lines(content);
  const idx = n < 0 ? arr.length + n : n;
  if (idx < 0 || idx >= arr.length) throw new RangeError('[textloader] deleteLine() index out of bounds: ' + n);
  arr.splice(idx, 1);
  return arr.join('\n');
};

/**
 * text.insertLine(content, n, newLine)
 * Inserts `newLine` before the nth line. Returns the modified content string.
 *
 *   let result = text.insertLine(src, 0, "# Title");
 */
text.insertLine = (content, n, newLine) => {
  _requireStr(content, 'insertLine');
  const arr = text.lines(content);
  const idx = n < 0 ? Math.max(0, arr.length + n) : Math.min(n, arr.length);
  arr.splice(idx, 0, String(newLine));
  return arr.join('\n');
};

/**
 * text.filterLines(content, fn)
 * Keeps only lines for which fn(line, index) returns true.
 *
 *   let result = text.filterLines(src, line => line.trim() !== '');
 */
text.filterLines = (content, fn) => {
  _requireStr(content, 'filterLines');
  if (typeof fn !== 'function') throw new TypeError('[textloader] filterLines() requires a function.');
  return text.lines(content).filter(fn).join('\n');
};

/**
 * text.mapLines(content, fn)
 * Transforms every line with fn(line, index) and returns the new content string.
 *
 *   let result = text.mapLines(src, line => "> " + line);
 */
text.mapLines = (content, fn) => {
  _requireStr(content, 'mapLines');
  if (typeof fn !== 'function') throw new TypeError('[textloader] mapLines() requires a function.');
  return text.lines(content).map(fn).join('\n');
};

/**
 * text.sortLines(content, direction?)
 * Sorts lines alphabetically.
 * direction: 'asc' (default) | 'desc'
 *
 *   let result = text.sortLines(src);
 *   let result = text.sortLines(src, 'desc');
 */
text.sortLines = (content, direction) => {
  _requireStr(content, 'sortLines');
  const arr = text.lines(content).slice().sort((a, b) => a.localeCompare(b));
  if (direction === 'desc') arr.reverse();
  return arr.join('\n');
};

/**
 * text.uniqueLines(content)
 * Removes duplicate lines, preserving the order of first occurrences.
 *
 *   let result = text.uniqueLines(src);
 */
text.uniqueLines = (content) => {
  _requireStr(content, 'uniqueLines');
  const seen = new Set();
  return text.lines(content).filter(line => {
    if (seen.has(line)) return false;
    seen.add(line);
    return true;
  }).join('\n');
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — Searching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * text.search(content, query)
 * Searches for a string or RegExp in `content`.
 * Returns an array of match objects: { index, line, col, match }
 *
 *   let hits = text.search(src, "error");
 *   let hits = text.search(src, /warn(ing)?/gi);
 */
text.search = (content, query) => {
  _requireStr(content, 'search');
  const matches = [];
  const lines_  = text.lines(content);

  if (typeof query === 'string') {
    let offset = 0;
    for (let li = 0; li < lines_.length; li++) {
      const line = lines_[li];
      let col = line.indexOf(query);
      while (col !== -1) {
        matches.push({ index: offset + col, line: li, col, match: query });
        col = line.indexOf(query, col + 1);
      }
      offset += line.length + 1; // +1 for '\n'
    }
  } else if (query instanceof RegExp) {
    const re = new RegExp(query.source, query.flags.includes('g') ? query.flags : query.flags + 'g');
    let m;
    let offset = 0;
    for (let li = 0; li < lines_.length; li++) {
      re.lastIndex = 0;
      const line = lines_[li];
      while ((m = re.exec(line)) !== null) {
        matches.push({ index: offset + m.index, line: li, col: m.index, match: m[0] });
      }
      offset += line.length + 1;
    }
  } else {
    throw new TypeError('[textloader] search() query must be a string or RegExp.');
  }

  return matches;
};

/**
 * text.contains(content, query)
 * Returns true if `content` contains `query` (string or RegExp).
 *
 *   if (text.contains(src, "TODO")) { ... }
 */
text.contains = (content, query) => {
  _requireStr(content, 'contains');
  if (typeof query === 'string')   return content.includes(query);
  if (query instanceof RegExp)     return query.test(content);
  throw new TypeError('[textloader] contains() query must be a string or RegExp.');
};

/**
 * text.count(content, query)
 * Counts the number of occurrences of `query` (string or RegExp) in `content`.
 *
 *   let n = text.count(src, "error");
 */
text.count = (content, query) => {
  _requireStr(content, 'count');
  return text.search(content, query).length;
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — Extracting / Slicing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * text.slice(content, start, end?)
 * Returns a substring from index `start` to `end` (exclusive).
 * Mirrors String.prototype.slice — negative indices count from the end.
 *
 *   let part = text.slice(src, 0, 100);
 *   let tail = text.slice(src, -50);
 */
text.slice = (content, start, end) => {
  _requireStr(content, 'slice');
  return end !== undefined ? content.slice(start, end) : content.slice(start);
};

/**
 * text.between(content, start, end)
 * Extracts the first substring found between `start` marker and `end` marker.
 * Returns null if markers are not found.
 *
 *   let body = text.between(src, "<body>", "</body>");
 */
text.between = (content, start, end) => {
  _requireStr(content, 'between');
  const si = content.indexOf(String(start));
  if (si === -1) return null;
  const from = si + String(start).length;
  const ei   = content.indexOf(String(end), from);
  if (ei === -1) return null;
  return content.slice(from, ei);
};

/**
 * text.extract(content, pattern)
 * Extracts all strings matching a RegExp (returns array of match strings).
 *
 *   let emails = text.extract(src, /[a-z]+@[a-z]+\.[a-z]+/gi);
 */
text.extract = (content, pattern) => {
  _requireStr(content, 'extract');
  if (!(pattern instanceof RegExp)) throw new TypeError('[textloader] extract() requires a RegExp.');
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  const out = [];
  let m;
  while ((m = re.exec(content)) !== null) out.push(m[0]);
  return out;
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — Info / Stats
// ─────────────────────────────────────────────────────────────────────────────

/**
 * text.info(content)
 * Returns a full statistics object about the content.
 *
 *   let stats = text.info(src);
 *   // → { chars, lines, words, sentences, paragraphs, bytes }
 */
text.info = (content) => {
  _requireStr(content, 'info');
  const linesArr  = text.lines(content);
  const words     = content.trim() === '' ? 0 : content.trim().split(/\s+/).length;
  const sentences = (content.match(/[^.!?]*[.!?]+/g) || []).length;
  const parasArr  = content.split(/\n{2,}/);
  const paragraphs = parasArr.filter(p => p.trim() !== '').length;
  const bytes      = typeof TextEncoder !== 'undefined'
    ? new TextEncoder().encode(content).length
    : Buffer.byteLength(content, 'utf8');

  return {
    chars      : content.length,
    lines      : linesArr.length,
    words,
    sentences,
    paragraphs,
    bytes,
  };
};

/**
 * text.wordCount(content)
 * Returns the number of words in the content.
 *
 *   let n = text.wordCount(src);
 */
text.wordCount = (content) => {
  _requireStr(content, 'wordCount');
  return content.trim() === '' ? 0 : content.trim().split(/\s+/).length;
};

/**
 * text.lineCount(content)
 * Returns the number of lines in the content.
 *
 *   let n = text.lineCount(src);
 */
text.lineCount = (content) => {
  _requireStr(content, 'lineCount');
  return text.lines(content).length;
};

/**
 * text.charCount(content)
 * Returns the total number of characters (including whitespace & newlines).
 *
 *   let n = text.charCount(src);
 */
text.charCount = (content) => {
  _requireStr(content, 'charCount');
  return content.length;
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * text.indent(content, spaces?)
 * Indents every line by `spaces` spaces (default 4).
 *
 *   let result = text.indent(src, 2);
 */
text.indent = (content, spaces) => {
  _requireStr(content, 'indent');
  const pad = ' '.repeat(typeof spaces === 'number' && spaces >= 0 ? spaces : 4);
  return text.lines(content).map(l => pad + l).join('\n');
};

/**
 * text.dedent(content)
 * Removes the common leading whitespace from all non-empty lines.
 *
 *   let result = text.dedent(src);
 */
text.dedent = (content) => {
  _requireStr(content, 'dedent');
  const lines_ = text.lines(content);
  const nonempty = lines_.filter(l => l.trim() !== '');
  if (nonempty.length === 0) return content;
  const minIndent = nonempty.reduce((min, l) => {
    const match = l.match(/^(\s*)/);
    const len   = match ? match[1].length : 0;
    return Math.min(min, len);
  }, Infinity);
  return lines_.map(l => l.slice(minIndent)).join('\n');
};

/**
 * text.padStart(content, totalLength, fillStr?)
 * Pads the first line from the start to reach `totalLength` characters.
 *
 *   let result = text.padStart(src, 20, '0');
 */
text.padStart = (content, totalLength, fillStr) => {
  _requireStr(content, 'padStart');
  return content.padStart(totalLength, fillStr !== undefined ? String(fillStr) : ' ');
};

/**
 * text.padEnd(content, totalLength, fillStr?)
 * Pads the content from the end to reach `totalLength` characters.
 *
 *   let result = text.padEnd(src, 20, '.');
 */
text.padEnd = (content, totalLength, fillStr) => {
  _requireStr(content, 'padEnd');
  return content.padEnd(totalLength, fillStr !== undefined ? String(fillStr) : ' ');
};

/**
 * text.repeat(content, n)
 * Repeats `content` n times.
 *
 *   let divider = text.repeat("-", 40);
 */
text.repeat = (content, n) => {
  _requireStr(content, 'repeat');
  if (typeof n !== 'number' || n < 0) throw new TypeError('[textloader] repeat() n must be a non-negative number.');
  return content.repeat(n);
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8 — Saving
// ─────────────────────────────────────────────────────────────────────────────

/**
 * text.save(path, content)
 * Saves `content` to a file at `path`, overwriting if it already exists.
 * Returns true on success.
 *
 *   text.save("output/result.txt", edited);
 */
text.save = (path, content) => {
  if (typeof path !== 'string' || path.trim() === '') {
    throw new TypeError('[textloader] save() requires a non-empty file path.');
  }
  _requireStr(content, 'save');

  if (_ENV === 'node') {
    const ok = _fsWrite(path, content);
    if (!ok) throw new Error('[textloader] Failed to write file: ' + path);
    _cache[path] = content;
    return true;
  }

  if (typeof window !== 'undefined' && window.__ZPP__ && typeof window.__ZPP__.writeFile === 'function') {
    const ok = window.__ZPP__.writeFile(path, content);
    if (!ok) throw new Error('[textloader] Failed to write file: ' + path);
    _cache[path] = content;
    return true;
  }

  // Browser fallback — trigger a download
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    text.download(content, path.split('/').pop() || 'file.txt');
    return true;
  }

  throw new Error('[textloader] save() is not supported in this environment.');
};

/**
 * text.saveAs(content, filename)
 * Downloads / saves `content` as a new file named `filename`.
 * In a browser this triggers a file download. In Node it writes to disk.
 *
 *   text.saveAs(result, "edited_notes.txt");
 */
text.saveAs = (content, filename) => {
  _requireStr(content, 'saveAs');
  const name = filename !== undefined ? String(filename) : 'file.txt';
  return text.save(name, content);
};

/**
 * text.download(content, filename?)
 * Browser-only: triggers a download of `content` as a .txt file.
 *
 *   text.download(result, "report.txt");
 */
text.download = (content, filename) => {
  _requireStr(content, 'download');
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('[textloader] download() is only available in browser environments.');
  }
  const name = filename !== undefined ? String(filename) : 'textloader_output.txt';
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9 — Format detection & conversion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * text.detectFormat(path)
 * Returns a simple format tag based on the file extension.
 * Supported: 'txt' | 'csv' | 'json' | 'md' | 'html' | 'log' | 'zl' | 'unknown'
 *
 *   text.detectFormat("data.csv")   → "csv"
 */
text.detectFormat = (path) => {
  const known = ['txt', 'csv', 'json', 'md', 'html', 'htm', 'log', 'zl', 'xml', 'yaml', 'yml', 'ini', 'env'];
  const e     = _ext(path);
  return known.includes(e) ? e : 'unknown';
};

/**
 * text.parseCSV(content, sep?)
 * Parses CSV content into a 2D array. Default separator is ",".
 *
 *   let table = text.parseCSV(src);
 *   let table = text.parseCSV(src, ";");
 */
text.parseCSV = (content, sep) => {
  _requireStr(content, 'parseCSV');
  const d = typeof sep === 'string' ? sep : ',';
  return text.lines(content)
    .filter(l => l.trim() !== '')
    .map(line => line.split(d).map(cell => cell.trim()));
};

/**
 * text.toCSV(table, sep?)
 * Converts a 2D array back into a CSV string.
 *
 *   let csv = text.toCSV(table);
 */
text.toCSV = (table, sep) => {
  if (!Array.isArray(table)) throw new TypeError('[textloader] toCSV() expects a 2D array.');
  const d = typeof sep === 'string' ? sep : ',';
  return table.map(row => {
    if (!Array.isArray(row)) throw new TypeError('[textloader] toCSV() each row must be an array.');
    return row.join(d);
  }).join('\n');
};

/**
 * text.parseJSON(content)
 * Parses JSON content into a JavaScript object. Throws a clear error on failure.
 *
 *   let obj = text.parseJSON(src);
 */
text.parseJSON = (content) => {
  _requireStr(content, 'parseJSON');
  try {
    return JSON.parse(content);
  } catch (e) {
    throw new SyntaxError('[textloader] parseJSON() failed: ' + e.message);
  }
};

/**
 * text.toJSON(obj, pretty?)
 * Converts a JavaScript object to a JSON string.
 * pretty: false (default) | true (2-space indent)
 *
 *   let json = text.toJSON(obj, true);
 */
text.toJSON = (obj, pretty) => {
  try {
    return JSON.stringify(obj, null, pretty ? 2 : 0);
  } catch (e) {
    throw new TypeError('[textloader] toJSON() failed: ' + e.message);
  }
};

// ── DSALibraries registration (matches loader.zl pattern) ────────────────────
if (typeof DSALibraries !== 'undefined') {
  DSALibraries['textloader.zl'] = {
    description: 'TextLoader — load text from any file type, edit, search, analyse, ' +
                 'and save back to disk. Methods: load, loadLines, fromString, cached, ' +
                 'clearCache, edit, replace, insert, remove, append, prepend, trim, ' +
                 'upper, lower, capitalize, reverse, wrap, lines, joinLines, getLine, ' +
                 'setLine, deleteLine, insertLine, filterLines, mapLines, sortLines, ' +
                 'uniqueLines, search, contains, count, slice, between, extract, info, ' +
                 'wordCount, lineCount, charCount, indent, dedent, padStart, padEnd, ' +
                 'repeat, save, saveAs, download, detectFormat, parseCSV, toCSV, ' +
                 'parseJSON, toJSON — browser + Node/Electron compatible.',
    inject(G) {
      if (typeof window !== 'undefined' && window.__ZPP__) {
        window.__ZPP__.registerBuiltins([
          // object
          'text',
          // Loading
          'load', 'loadLines', 'fromString', 'cached', 'clearCache',
          // Editing
          'edit', 'replace', 'insert', 'remove', 'append', 'prepend',
          'trim', 'upper', 'lower', 'capitalize', 'reverse', 'wrap',
          // Line ops
          'lines', 'joinLines', 'getLine', 'setLine', 'deleteLine',
          'insertLine', 'filterLines', 'mapLines', 'sortLines', 'uniqueLines',
          // Searching
          'search', 'contains', 'count',
          // Extracting
          'slice', 'between', 'extract',
          // Info
          'info', 'wordCount', 'lineCount', 'charCount',
          // Formatting
          'indent', 'dedent', 'padStart', 'padEnd', 'repeat',
          // Saving
          'save', 'saveAs', 'download',
          // Format helpers
          'detectFormat', 'parseCSV', 'toCSV', 'parseJSON', 'toJSON',
        ]);
        window.__ZPP__.registerTypes(['text']);
      }

      G.text = text;
    }
  };
}

if (typeof module !== 'undefined') module.exports = text;

})();
