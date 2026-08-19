// ════════════════════════════════════════════════════════════════════════════════
// filesystem.zl  —  ZPP Standard Library
// Imported in ZPP as:  import filesystem.zl
// Accessed in ZPP as:  fs.<function>(...)
//
// ── ENVIRONMENT ──────────────────────────────────────────────────────────────
// Node / Electron  →  delegates to Node's built-in 'fs' + 'path' modules.
//                     All operations touch the real disk.
// Browser          →  uses a fully in-memory Virtual File System (VFS).
//                     Data is scoped to the current page session.
//                     On first use the VFS is seeded with a root  '/'  entry.
//
// ── HOW TO BUILD A NEW ZPP LIBRARY (developer guide) ─────────────────────────
//
//  1.  Wrap everything in a named IIFE so nothing leaks to global scope:
//        (function MyLib() { 'use strict'; ... })();
//
//  2.  Create the single public object your library exposes:
//        const mylib = {};
//
//  3.  Attach every public method to that object:
//        mylib.doThing = (arg) => { ... };
//      Private helpers stay as bare functions starting with '_':
//        function _helper(x) { ... }
//
//  4.  Register with DSALibraries at the bottom of the file:
//        if (typeof DSALibraries !== 'undefined') {
//          DSALibraries['mylib.zl'] = {
//            description: 'One-line description',
//            inject(G) {
//              if (typeof window !== 'undefined' && window.__ZPP__) {
//                window.__ZPP__.registerBuiltins(['mylib', 'doThing', ...]);
//                window.__ZPP__.registerTypes(['mylib']);
//              }
//              G.mylib = mylib;          // ← expose to ZPP runtime
//            }
//          };
//        }
//
//  5.  Export for Node / Electron so the file can also be require()'d:
//        if (typeof module !== 'undefined') module.exports = mylib;
//
//  6.  Each public method MUST have:
//        • A JSDoc comment block
//        • At least one usage example in the comment
//        • Input validation that returns a safe fallback (never throws)
//
//  7.  Style conventions:
//        • Internal constants  →  UPPER_SNAKE_CASE
//        • Internal helpers    →  _camelCase (underscore prefix)
//        • Public methods      →  camelCase attached to the main object
//        • Sections separated  →  // ── Section Name ──── comment banners
//
//  Example ZPP import and usage:
//        import filesystem.zl
//        fs.write('/notes/hello.txt', 'Hello ZPP!')
//        print( fs.read('/notes/hello.txt') )   // → Hello ZPP!
//        print( fs.exists('/notes/hello.txt') ) // → true
//        print( fs.ext('report.pdf') )          // → .pdf
//
// ════════════════════════════════════════════════════════════════════════════════

(function FilesystemLib() {
'use strict';

// ── Environment detection ─────────────────────────────────────────────────────

const _IS_NODE = (
  typeof process !== 'undefined' &&
  process.versions != null &&
  process.versions.node != null
);

// ── Node module handles (null in browser) ────────────────────────────────────

let _nfs   = null; // require('fs')
let _npath = null; // require('path')
let _nos   = null; // require('os')

if (_IS_NODE) {
  try { _nfs   = require('fs');   } catch (e) { /* sandboxed */ }
  try { _npath = require('path'); } catch (e) { /* sandboxed */ }
  try { _nos   = require('os');   } catch (e) { /* sandboxed */ }
}

// ── Virtual File System (browser / sandboxed Node) ───────────────────────────
//
//  _vfs is a flat Map keyed by normalised absolute path strings.
//  Each entry is a plain object:
//    { type: 'file'|'dir', content: string, createdAt: Date, modifiedAt: Date }
//
//  Directories are stored as entries with type:'dir' and content:''.
//  The root '/' always exists.

const _vfs = new Map();

function _vfsInit() {
  if (!_vfs.has('/')) {
    _vfs.set('/', { type: 'dir', content: '', createdAt: new Date(), modifiedAt: new Date() });
  }
}
_vfsInit();

// ── Internal path helpers ─────────────────────────────────────────────────────

/** Normalise a VFS path to a clean absolute string. */
function _normVFS(p) {
  if (typeof p !== 'string' || p.length === 0) return '/';
  // Normalise slashes, collapse '..' and '.' entries
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '..') { out.pop(); }
    else if (parts[i] !== '.') { out.push(parts[i]); }
  }
  return '/' + out.join('/');
}

/** Return the parent directory of a VFS path. */
function _vfsParent(p) {
  const norm = _normVFS(p);
  if (norm === '/') return '/';
  const idx = norm.lastIndexOf('/');
  return idx === 0 ? '/' : norm.slice(0, idx);
}

/** Return the last segment of a path (basename). */
function _vfsBasename(p) {
  const norm = _normVFS(p);
  if (norm === '/') return '/';
  return norm.slice(norm.lastIndexOf('/') + 1);
}

/** Check whether parent directory exists in VFS. */
function _vfsParentExists(p) {
  const parent = _vfsParent(p);
  const entry  = _vfs.get(parent);
  return entry != null && entry.type === 'dir';
}

/** Recursively ensure all directories in a path exist (like mkdir -p). */
function _vfsMkdirP(p) {
  const norm  = _normVFS(p);
  const parts = norm.split('/').filter(Boolean);
  let   cur   = '';
  for (let i = 0; i < parts.length; i++) {
    cur += '/' + parts[i];
    if (!_vfs.has(cur)) {
      _vfs.set(cur, { type: 'dir', content: '', createdAt: new Date(), modifiedAt: new Date() });
    }
  }
}

// ── Main fs object ────────────────────────────────────────────────────────────
const fs = {};

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 1 — Core File I/O
// ════════════════════════════════════════════════════════════════════════════════

/**
 * fs.read(path)
 * Reads the full text content of a file.
 * Returns null if the file does not exist or cannot be read.
 *
 *   fs.read('/data/notes.txt')    → 'Hello ZPP!'
 *   fs.read('/missing.txt')       → null
 */
fs.read = (path) => {
  if (typeof path !== 'string') return null;
  if (_IS_NODE && _nfs) {
    try { return _nfs.readFileSync(path, 'utf8'); }
    catch (e) { return null; }
  }
  const entry = _vfs.get(_normVFS(path));
  if (!entry || entry.type !== 'file') return null;
  return entry.content;
};

/**
 * fs.write(path, content)
 * Creates or overwrites a file with the given text content.
 * Automatically creates parent directories if they don't exist.
 * Returns true on success, false on failure.
 *
 *   fs.write('/logs/app.log', 'started')   → true
 *   fs.write('/logs/app.log', 42)          → false  (content must be a string)
 */
fs.write = (path, content) => {
  if (typeof path !== 'string' || typeof content !== 'string') return false;
  if (_IS_NODE && _nfs) {
    try {
      const dir = _npath.dirname(path);
      _nfs.mkdirSync(dir, { recursive: true });
      _nfs.writeFileSync(path, content, 'utf8');
      return true;
    } catch (e) { return false; }
  }
  const norm = _normVFS(path);
  _vfsMkdirP(_vfsParent(norm));
  const now  = new Date();
  const prev = _vfs.get(norm);
  _vfs.set(norm, {
    type       : 'file',
    content    : content,
    createdAt  : prev ? prev.createdAt : now,
    modifiedAt : now,
  });
  return true;
};

/**
 * fs.append(path, content)
 * Appends text to the end of a file.  Creates the file if it doesn't exist.
 * Returns true on success, false on failure.
 *
 *   fs.append('/logs/app.log', '\nnew line')   → true
 */
fs.append = (path, content) => {
  if (typeof path !== 'string' || typeof content !== 'string') return false;
  if (_IS_NODE && _nfs) {
    try { _nfs.appendFileSync(path, content, 'utf8'); return true; }
    catch (e) { return false; }
  }
  const norm    = _normVFS(path);
  const current = fs.read(path) || '';
  return fs.write(path, current + content);
};

/**
 * fs.delete(path)
 * Deletes a file.  Returns true on success, false if the file doesn't exist.
 *
 *   fs.delete('/tmp/draft.txt')   → true
 *   fs.delete('/missing.txt')     → false
 */
fs.delete = (path) => {
  if (typeof path !== 'string') return false;
  if (_IS_NODE && _nfs) {
    try { _nfs.unlinkSync(path); return true; }
    catch (e) { return false; }
  }
  const norm  = _normVFS(path);
  const entry = _vfs.get(norm);
  if (!entry || entry.type !== 'file') return false;
  _vfs.delete(norm);
  return true;
};

/**
 * fs.copy(src, dest)
 * Copies a file from src to dest.
 * Creates parent directories of dest automatically.
 * Returns true on success, false on failure.
 *
 *   fs.copy('/src/config.json', '/backup/config.json')   → true
 */
fs.copy = (src, dest) => {
  if (typeof src !== 'string' || typeof dest !== 'string') return false;
  if (_IS_NODE && _nfs) {
    try {
      const dir = _npath.dirname(dest);
      _nfs.mkdirSync(dir, { recursive: true });
      _nfs.copyFileSync(src, dest);
      return true;
    } catch (e) { return false; }
  }
  const content = fs.read(src);
  if (content === null) return false;
  return fs.write(dest, content);
};

/**
 * fs.move(src, dest)
 * Moves a file from src to dest (copy + delete).
 * Returns true on success, false on failure.
 *
 *   fs.move('/tmp/draft.txt', '/docs/final.txt')   → true
 */
fs.move = (src, dest) => {
  if (typeof src !== 'string' || typeof dest !== 'string') return false;
  if (_IS_NODE && _nfs) {
    try {
      const dir = _npath.dirname(dest);
      _nfs.mkdirSync(dir, { recursive: true });
      _nfs.renameSync(src, dest);
      return true;
    } catch (e) { return false; }
  }
  if (!fs.copy(src, dest)) return false;
  fs.delete(src);
  return true;
};

/**
 * fs.rename(oldPath, newPath)
 * Renames a file or directory.  Alias for fs.move() for clarity.
 * Returns true on success, false on failure.
 *
 *   fs.rename('/notes/todo.txt', '/notes/done.txt')   → true
 */
fs.rename = (oldPath, newPath) => fs.move(oldPath, newPath);

/**
 * fs.exists(path)
 * Returns true if a file or directory exists at the given path.
 *
 *   fs.exists('/data/notes.txt')   → true
 *   fs.exists('/nope/nope.txt')    → false
 */
fs.exists = (path) => {
  if (typeof path !== 'string') return false;
  if (_IS_NODE && _nfs) {
    try { _nfs.accessSync(path); return true; }
    catch (e) { return false; }
  }
  return _vfs.has(_normVFS(path));
};

/**
 * fs.touch(path)
 * Creates an empty file if it doesn't exist;
 * if it does exist, updates its modification timestamp.
 * Returns true on success, false on failure.
 *
 *   fs.touch('/logs/run.log')   → true
 */
fs.touch = (path) => {
  if (typeof path !== 'string') return false;
  if (_IS_NODE && _nfs) {
    try {
      const now = new Date();
      try { _nfs.utimesSync(path, now, now); }
      catch (e2) { _nfs.writeFileSync(path, '', 'utf8'); }
      return true;
    } catch (e) { return false; }
  }
  const norm  = _normVFS(path);
  const entry = _vfs.get(norm);
  if (entry && entry.type === 'file') {
    entry.modifiedAt = new Date();
    return true;
  }
  return fs.write(path, '');
};

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Directory Operations
// ════════════════════════════════════════════════════════════════════════════════

/**
 * fs.mkdir(path)
 * Creates a directory (and any missing parent directories).
 * Returns true on success, false on failure.
 *
 *   fs.mkdir('/projects/zpp/src')   → true
 */
fs.mkdir = (path) => {
  if (typeof path !== 'string') return false;
  if (_IS_NODE && _nfs) {
    try { _nfs.mkdirSync(path, { recursive: true }); return true; }
    catch (e) { return false; }
  }
  _vfsMkdirP(_normVFS(path));
  return true;
};

/**
 * fs.rmdir(path)
 * Removes an empty directory.
 * Returns true on success, false if the directory is not empty or doesn't exist.
 * To delete a non-empty directory use fs.deleteDir(path).
 *
 *   fs.rmdir('/tmp/empty')   → true
 */
fs.rmdir = (path) => {
  if (typeof path !== 'string') return false;
  if (_IS_NODE && _nfs) {
    try { _nfs.rmdirSync(path); return true; }
    catch (e) { return false; }
  }
  const norm  = _normVFS(path);
  const entry = _vfs.get(norm);
  if (!entry || entry.type !== 'dir') return false;
  // Check for children
  const prefix = norm === '/' ? '/' : norm + '/';
  for (const key of _vfs.keys()) {
    if (key !== norm && key.startsWith(prefix)) return false; // not empty
  }
  _vfs.delete(norm);
  return true;
};

/**
 * fs.deleteDir(path)
 * Recursively deletes a directory and all its contents.
 * Returns true on success, false on failure.
 *
 *   fs.deleteDir('/tmp/build')   → true
 */
fs.deleteDir = (path) => {
  if (typeof path !== 'string') return false;
  if (_IS_NODE && _nfs) {
    try {
      // Node 14.14+
      if (_nfs.rmSync) { _nfs.rmSync(path, { recursive: true, force: true }); }
      else             { _rmdirRecursiveNode(path); }
      return true;
    } catch (e) { return false; }
  }
  const norm   = _normVFS(path);
  const entry  = _vfs.get(norm);
  if (!entry || entry.type !== 'dir') return false;
  const prefix = norm === '/' ? '/' : norm + '/';
  for (const key of Array.from(_vfs.keys())) {
    if (key === norm || key.startsWith(prefix)) _vfs.delete(key);
  }
  return true;
};

/** @internal Node <14 recursive remove fallback */
function _rmdirRecursiveNode(dirPath) {
  if (!_nfs.existsSync(dirPath)) return;
  for (const entry of _nfs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = _npath.join(dirPath, entry.name);
    if (entry.isDirectory()) _rmdirRecursiveNode(full);
    else                     _nfs.unlinkSync(full);
  }
  _nfs.rmdirSync(dirPath);
}

/**
 * fs.list(path)
 * Returns an array of entry names (files + subdirectories) inside a directory.
 * Returns an empty array if the directory doesn't exist or is empty.
 *
 *   fs.list('/projects')   → ['app.zpp', 'lib', 'readme.txt']
 */
fs.list = (path) => {
  if (typeof path !== 'string') return [];
  if (_IS_NODE && _nfs) {
    try { return _nfs.readdirSync(path); }
    catch (e) { return []; }
  }
  const norm   = _normVFS(path);
  const entry  = _vfs.get(norm);
  if (!entry || entry.type !== 'dir') return [];
  const prefix = norm === '/' ? '/' : norm + '/';
  const result = new Set();
  for (const key of _vfs.keys()) {
    if (key === norm) continue;
    if (key.startsWith(prefix)) {
      const rest = key.slice(prefix.length);
      if (rest.length > 0) {
        const segment = rest.split('/')[0];
        if (segment) result.add(segment);
      }
    }
  }
  return Array.from(result).sort();
};

/**
 * fs.listFull(path)
 * Like fs.list() but returns full absolute paths instead of just names.
 *
 *   fs.listFull('/projects')   → ['/projects/app.zpp', '/projects/lib', ...]
 */
fs.listFull = (path) => {
  const names = fs.list(path);
  const base  = typeof path === 'string' ? path.replace(/\/+$/, '') : '';
  return names.map(n => base + '/' + n);
};

/**
 * fs.isDir(path)
 * Returns true if the path points to a directory.
 *
 *   fs.isDir('/projects')       → true
 *   fs.isDir('/projects/app.zpp') → false
 */
fs.isDir = (path) => {
  if (typeof path !== 'string') return false;
  if (_IS_NODE && _nfs) {
    try { return _nfs.statSync(path).isDirectory(); }
    catch (e) { return false; }
  }
  const entry = _vfs.get(_normVFS(path));
  return entry != null && entry.type === 'dir';
};

/**
 * fs.isFile(path)
 * Returns true if the path points to a regular file.
 *
 *   fs.isFile('/data/notes.txt')   → true
 *   fs.isFile('/data')             → false
 */
fs.isFile = (path) => {
  if (typeof path !== 'string') return false;
  if (_IS_NODE && _nfs) {
    try { return _nfs.statSync(path).isFile(); }
    catch (e) { return false; }
  }
  const entry = _vfs.get(_normVFS(path));
  return entry != null && entry.type === 'file';
};

/**
 * fs.isEmpty(path)
 * For a file   → returns true if the file contains no characters.
 * For a directory → returns true if the directory has no children.
 *
 *   fs.isEmpty('/tmp/blank.txt')   → true
 *   fs.isEmpty('/projects')        → false
 */
fs.isEmpty = (path) => {
  if (typeof path !== 'string') return true;
  if (fs.isDir(path))  return fs.list(path).length === 0;
  if (fs.isFile(path)) return (fs.read(path) || '').length === 0;
  return true;
};

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 3 — Path Utilities
// ════════════════════════════════════════════════════════════════════════════════

/**
 * fs.join(...parts)
 * Joins path segments into a single path string.
 *
 *   fs.join('/home', 'user', 'notes.txt')   → '/home/user/notes.txt'
 *   fs.join('src', 'lib', 'util.zpp')       → 'src/lib/util.zpp'
 */
fs.join = (...parts) => {
  if (_IS_NODE && _npath) return _npath.join(...parts);
  const joined = parts.filter(p => typeof p === 'string').join('/');
  return joined.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
};

/**
 * fs.basename(path)
 * Returns the last component of a path (the filename or directory name).
 *
 *   fs.basename('/home/user/notes.txt')   → 'notes.txt'
 *   fs.basename('/home/user/')            → 'user'
 */
fs.basename = (path) => {
  if (typeof path !== 'string') return '';
  if (_IS_NODE && _npath) return _npath.basename(path);
  return _vfsBasename(path);
};

/**
 * fs.dirname(path)
 * Returns the directory portion of a path (all but the last segment).
 *
 *   fs.dirname('/home/user/notes.txt')   → '/home/user'
 *   fs.dirname('/home/user')             → '/home'
 *   fs.dirname('/')                      → '/'
 */
fs.dirname = (path) => {
  if (typeof path !== 'string') return '';
  if (_IS_NODE && _npath) return _npath.dirname(path);
  return _vfsParent(path);
};

/**
 * fs.ext(path)
 * Returns the file extension including the dot.
 * Returns an empty string if there is no extension.
 *
 *   fs.ext('report.pdf')            → '.pdf'
 *   fs.ext('/home/user/notes.txt')  → '.txt'
 *   fs.ext('/home/user/noext')      → ''
 */
fs.ext = (path) => {
  if (typeof path !== 'string') return '';
  if (_IS_NODE && _npath) return _npath.extname(path);
  const base = _vfsBasename(path);
  const dot  = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot) : '';
};

/**
 * fs.stripExt(path)
 * Returns the path with the file extension removed.
 *
 *   fs.stripExt('/docs/report.pdf')   → '/docs/report'
 *   fs.stripExt('/docs/noext')        → '/docs/noext'
 */
fs.stripExt = (path) => {
  if (typeof path !== 'string') return '';
  const extension = fs.ext(path);
  return extension ? path.slice(0, path.length - extension.length) : path;
};

/**
 * fs.changeExt(path, newExt)
 * Replaces the file extension.  newExt should include the leading dot.
 *
 *   fs.changeExt('/docs/report.pdf', '.html')   → '/docs/report.html'
 *   fs.changeExt('/docs/noext', '.txt')          → '/docs/noext.txt'
 */
fs.changeExt = (path, newExt) => {
  if (typeof path !== 'string') return '';
  if (typeof newExt !== 'string') newExt = '';
  return fs.stripExt(path) + newExt;
};

/**
 * fs.normalize(path)
 * Resolves '..' and '.' segments and collapses duplicate slashes.
 *
 *   fs.normalize('/home//user/../docs/./notes.txt')   → '/home/docs/notes.txt'
 */
fs.normalize = (path) => {
  if (typeof path !== 'string') return '';
  if (_IS_NODE && _npath) return _npath.normalize(path);
  return _normVFS(path);
};

/**
 * fs.resolve(...parts)
 * Resolves a sequence of path segments into an absolute path.
 * In Node this uses process.cwd() as the base.
 * In the browser VFS it resolves relative to '/'.
 *
 *   fs.resolve('home', 'user', 'notes.txt')   → '/home/user/notes.txt'  (VFS)
 *   fs.resolve('/abs/path', '../sibling')     → '/abs/sibling'
 */
fs.resolve = (...parts) => {
  if (_IS_NODE && _npath) return _npath.resolve(...parts);
  return _normVFS('/' + parts.join('/'));
};

/**
 * fs.split(path)
 * Splits a path into an array of its components.
 *
 *   fs.split('/home/user/notes.txt')   → ['home', 'user', 'notes.txt']
 *   fs.split('src/lib/util.zpp')       → ['src', 'lib', 'util.zpp']
 */
fs.split = (path) => {
  if (typeof path !== 'string') return [];
  return path.replace(/\\/g, '/').split('/').filter(Boolean);
};

/**
 * fs.isAbsolute(path)
 * Returns true if the path is absolute (starts with '/' or a drive letter on Windows).
 *
 *   fs.isAbsolute('/home/user')    → true
 *   fs.isAbsolute('relative/path') → false
 */
fs.isAbsolute = (path) => {
  if (typeof path !== 'string') return false;
  if (_IS_NODE && _npath) return _npath.isAbsolute(path);
  return path.startsWith('/');
};

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 4 — Metadata & Stats
// ════════════════════════════════════════════════════════════════════════════════

/**
 * fs.stat(path)
 * Returns a metadata object describing the file or directory at path.
 * Returns null if the path does not exist.
 *
 *   fs.stat('/data/notes.txt')
 *   → {
 *       path       : '/data/notes.txt',
 *       name       : 'notes.txt',
 *       ext        : '.txt',
 *       isFile     : true,
 *       isDir      : false,
 *       size       : 42,          // bytes (character count in VFS)
 *       createdAt  : Date,
 *       modifiedAt : Date
 *     }
 */
fs.stat = (path) => {
  if (typeof path !== 'string') return null;
  if (_IS_NODE && _nfs) {
    try {
      const s = _nfs.statSync(path);
      return {
        path       : path,
        name       : _npath.basename(path),
        ext        : _npath.extname(path),
        isFile     : s.isFile(),
        isDir      : s.isDirectory(),
        size       : s.size,
        createdAt  : s.birthtime,
        modifiedAt : s.mtime,
      };
    } catch (e) { return null; }
  }
  const norm  = _normVFS(path);
  const entry = _vfs.get(norm);
  if (!entry) return null;
  return {
    path       : norm,
    name       : _vfsBasename(norm),
    ext        : fs.ext(norm),
    isFile     : entry.type === 'file',
    isDir      : entry.type === 'dir',
    size       : entry.type === 'file' ? entry.content.length : 0,
    createdAt  : entry.createdAt,
    modifiedAt : entry.modifiedAt,
  };
};

/**
 * fs.size(path)
 * Returns the size of a file in bytes (character count in browser VFS).
 * Returns -1 if the file doesn't exist.
 *
 *   fs.size('/data/notes.txt')   → 42
 */
fs.size = (path) => {
  const s = fs.stat(path);
  return s ? s.size : -1;
};

/**
 * fs.modifiedAt(path)
 * Returns the last modification Date of a file or directory.
 * Returns null if the path doesn't exist.
 *
 *   fs.modifiedAt('/data/notes.txt')   → Date object
 */
fs.modifiedAt = (path) => {
  const s = fs.stat(path);
  return s ? s.modifiedAt : null;
};

/**
 * fs.createdAt(path)
 * Returns the creation Date of a file or directory.
 * Returns null if the path doesn't exist.
 *
 *   fs.createdAt('/data/notes.txt')   → Date object
 */
fs.createdAt = (path) => {
  const s = fs.stat(path);
  return s ? s.createdAt : null;
};

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 5 — Content Helpers
// ════════════════════════════════════════════════════════════════════════════════

/**
 * fs.readLines(path)
 * Reads a file and returns an array of lines (splits on '\n').
 * Trailing empty strings from a trailing newline are removed.
 * Returns an empty array if the file doesn't exist.
 *
 *   fs.readLines('/data/list.txt')   → ['apple', 'banana', 'cherry']
 */
fs.readLines = (path) => {
  const content = fs.read(path);
  if (content === null) return [];
  const lines = content.split('\n');
  // Trim a single trailing empty entry caused by a final newline
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
};

/**
 * fs.writeLines(path, lines)
 * Writes an array of strings to a file, one per line (joined with '\n').
 * Returns true on success, false on failure.
 *
 *   fs.writeLines('/data/list.txt', ['apple', 'banana', 'cherry'])   → true
 */
fs.writeLines = (path, lines) => {
  if (!Array.isArray(lines)) return false;
  return fs.write(path, lines.join('\n'));
};

/**
 * fs.appendLine(path, line)
 * Appends a single line (with a leading newline separator) to a file.
 * If the file is empty or doesn't exist, no leading newline is added.
 * Returns true on success, false on failure.
 *
 *   fs.appendLine('/logs/run.log', 'server started')   → true
 */
fs.appendLine = (path, line) => {
  if (typeof line !== 'string') return false;
  const existing = fs.read(path);
  if (existing === null || existing === '') return fs.write(path, line);
  return fs.append(path, '\n' + line);
};

/**
 * fs.readJSON(path)
 * Reads and parses a JSON file.
 * Returns the parsed value on success, null on failure or parse error.
 *
 *   fs.readJSON('/config/settings.json')   → { theme: 'dark', lang: 'en' }
 */
fs.readJSON = (path) => {
  const content = fs.read(path);
  if (content === null) return null;
  try { return JSON.parse(content); }
  catch (e) { return null; }
};

/**
 * fs.writeJSON(path, value, indent?)
 * Serialises a value to JSON and writes it to a file.
 * indent controls pretty-printing (default: 2 spaces).
 * Returns true on success, false on failure.
 *
 *   fs.writeJSON('/config/settings.json', { theme: 'dark' })       → true
 *   fs.writeJSON('/config/settings.json', { theme: 'dark' }, 4)    → true (4-space indent)
 *   fs.writeJSON('/config/settings.json', { theme: 'dark' }, 0)    → true (minified)
 */
fs.writeJSON = (path, value, indent) => {
  if (typeof indent !== 'number') indent = 2;
  try { return fs.write(path, JSON.stringify(value, null, indent)); }
  catch (e) { return false; }
};

/**
 * fs.clear(path)
 * Truncates a file to zero bytes (erases its content but keeps the file).
 * Returns true on success, false if the file doesn't exist.
 *
 *   fs.clear('/logs/run.log')   → true
 */
fs.clear = (path) => {
  if (!fs.exists(path) || !fs.isFile(path)) return false;
  return fs.write(path, '');
};

/**
 * fs.lineCount(path)
 * Returns the number of lines in a file.
 * Returns 0 if the file is empty or doesn't exist.
 *
 *   fs.lineCount('/data/list.txt')   → 3
 */
fs.lineCount = (path) => fs.readLines(path).length;

/**
 * fs.wordCount(path)
 * Returns the number of whitespace-separated words in a file.
 * Returns 0 if the file is empty or doesn't exist.
 *
 *   fs.wordCount('/data/poem.txt')   → 128
 */
fs.wordCount = (path) => {
  const content = fs.read(path);
  if (!content || content.trim() === '') return 0;
  return content.trim().split(/\s+/).length;
};

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 6 — Search
// ════════════════════════════════════════════════════════════════════════════════

/**
 * fs.find(dir, pattern)
 * Recursively searches a directory for entries whose name matches the pattern.
 * pattern can be a string (substring match) or a RegExp.
 * Returns an array of full paths.
 *
 *   fs.find('/projects', '.zpp')         → ['/projects/main.zpp', ...]
 *   fs.find('/projects', /^test/)        → ['/projects/test_runner.zpp', ...]
 */
fs.find = (dir, pattern) => {
  if (typeof dir !== 'string') return [];
  const results = [];
  const queue   = [dir];
  while (queue.length > 0) {
    const current = queue.shift();
    const entries = fs.listFull(current);
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const name  = fs.basename(entry);
      const match = pattern instanceof RegExp
        ? pattern.test(name)
        : (typeof pattern === 'string' ? name.includes(pattern) : true);
      if (match) results.push(entry);
      if (fs.isDir(entry)) queue.push(entry);
    }
  }
  return results;
};

/**
 * fs.findByExt(dir, ext)
 * Recursively finds all files with a given extension inside dir.
 * ext should include the leading dot.
 *
 *   fs.findByExt('/projects', '.zpp')   → ['/projects/main.zpp', ...]
 *   fs.findByExt('/docs', '.txt')       → ['/docs/readme.txt', '/docs/notes.txt']
 */
fs.findByExt = (dir, ext) => {
  if (typeof ext !== 'string') return [];
  const normalExt = ext.startsWith('.') ? ext : '.' + ext;
  return fs.find(dir, (name) => true).filter(p => fs.ext(p) === normalExt);
};

/**
 * fs.grep(path, pattern)
 * Returns an array of objects for every line that matches the pattern.
 * Each result object has { line, number, match } properties.
 * pattern can be a string (substring) or a RegExp.
 *
 *   fs.grep('/logs/app.log', 'ERROR')
 *   → [{ line: 'ERROR: disk full', number: 14, match: 'ERROR' }, ...]
 *
 *   fs.grep('/logs/app.log', /WARN|ERROR/)
 *   → [...]
 */
fs.grep = (path, pattern) => {
  const lines   = fs.readLines(path);
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let matchStr = null;
    if (pattern instanceof RegExp) {
      const m = line.match(pattern);
      if (m) matchStr = m[0];
    } else if (typeof pattern === 'string') {
      if (line.includes(pattern)) matchStr = pattern;
    }
    if (matchStr !== null) {
      results.push({ line: line, number: i + 1, match: matchStr });
    }
  }
  return results;
};

/**
 * fs.countIn(path, pattern)
 * Counts the total number of non-overlapping occurrences of pattern
 * across all lines in a file.
 * pattern can be a string or RegExp.
 *
 *   fs.countIn('/logs/app.log', 'ERROR')   → 7
 */
fs.countIn = (path, pattern) => {
  const content = fs.read(path);
  if (!content) return 0;
  if (pattern instanceof RegExp) {
    const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    return (content.match(global) || []).length;
  }
  if (typeof pattern !== 'string') return 0;
  let count = 0;
  let pos   = 0;
  while ((pos = content.indexOf(pattern, pos)) !== -1) { count++; pos += pattern.length; }
  return count;
};

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 7 — Environment & Runtime Info
// ════════════════════════════════════════════════════════════════════════════════

/**
 * fs.cwd()
 * Returns the current working directory.
 * In Node returns process.cwd(); in browser returns '/'.
 *
 *   fs.cwd()   → '/home/user/project'  (Node)
 *   fs.cwd()   → '/'                   (browser VFS)
 */
fs.cwd = () => {
  if (_IS_NODE) {
    try { return process.cwd(); } catch (e) { return '/'; }
  }
  return '/';
};

/**
 * fs.home()
 * Returns the current user's home directory.
 * In browser VFS returns '/home'.
 *
 *   fs.home()   → '/home/alice'  (Node)
 *   fs.home()   → '/home'        (browser VFS)
 */
fs.home = () => {
  if (_IS_NODE && _nos) {
    try { return _nos.homedir(); } catch (e) { return '/home'; }
  }
  return '/home';
};

/**
 * fs.temp()
 * Returns the system's temporary directory path.
 * In browser VFS returns '/tmp'.
 *
 *   fs.temp()   → '/tmp'  or  'C:\\Users\\alice\\AppData\\Local\\Temp'
 */
fs.temp = () => {
  if (_IS_NODE && _nos) {
    try { return _nos.tmpdir(); } catch (e) { return '/tmp'; }
  }
  return '/tmp';
};

/**
 * fs.sep
 * The platform path separator character ('/' on POSIX, '\\' on Windows).
 *
 *   fs.sep   → '/'   (Linux / macOS / browser)
 *   fs.sep   → '\\'  (Windows)
 */
fs.sep = (_IS_NODE && _npath) ? _npath.sep : '/';

/**
 * fs.env
 * A string indicating the current runtime environment.
 *
 *   fs.env   → 'node'     (Node.js / Electron)
 *   fs.env   → 'browser'  (Web browser)
 */
fs.env = _IS_NODE ? 'node' : 'browser';

/**
 * fs.vfsSnapshot()
 * Browser VFS only: returns a plain object mapping every path to its content.
 * Useful for debugging, serialising, or backing up the virtual filesystem.
 * In Node returns an empty object.
 *
 *   fs.vfsSnapshot()
 *   → { '/notes/hello.txt': 'Hello ZPP!', '/data/list.txt': 'a\nb\nc' }
 */
fs.vfsSnapshot = () => {
  if (_IS_NODE) return {};
  const snap = {};
  for (const [key, val] of _vfs.entries()) {
    snap[key] = val.type === 'file' ? val.content : '[dir]';
  }
  return snap;
};

/**
 * fs.vfsClear()
 * Browser VFS only: wipes the entire in-memory filesystem and re-seeds root.
 * Has no effect in Node. Returns true.
 *
 *   fs.vfsClear()   → true
 */
fs.vfsClear = () => {
  if (!_IS_NODE) {
    _vfs.clear();
    _vfsInit();
  }
  return true;
};

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 8 — Tree & Summary
// ════════════════════════════════════════════════════════════════════════════════

/**
 * fs.tree(dir, depth?, _prefix?)
 * Returns a formatted ASCII-art directory tree as a string.
 * depth controls how many levels deep to recurse (default: unlimited).
 *
 *   fs.tree('/projects')
 *   →
 *   /projects
 *   ├── main.zpp
 *   ├── lib
 *   │   ├── math.zpp
 *   │   └── string.zpp
 *   └── readme.txt
 */
fs.tree = (dir, depth, _prefix) => {
  if (typeof dir    !== 'string') return '';
  if (typeof depth  !== 'number') depth = Infinity;
  if (typeof _prefix !== 'string') _prefix = '';
  const lines   = [(_prefix === '' ? dir : '')];
  if (depth < 0) return lines.join('\n');
  const entries = fs.list(dir);
  for (let i = 0; i < entries.length; i++) {
    const last      = i === entries.length - 1;
    const connector = last ? '└── ' : '├── ';
    const childPfx  = last ? '    ' : '│   ';
    const fullPath  = fs.join(dir, entries[i]);
    lines.push(_prefix + connector + entries[i]);
    if (fs.isDir(fullPath) && depth > 0) {
      const sub = fs.tree(fullPath, depth - 1, _prefix + childPfx);
      const subLines = sub.split('\n').filter(l => l.trim() !== '');
      lines.push(...subLines);
    }
  }
  return lines.join('\n');
};

/**
 * fs.summary(path)
 * Returns a descriptive summary object for a file or directory.
 *
 *   fs.summary('/projects')
 *   → {
 *       path      : '/projects',
 *       type      : 'dir',
 *       children  : 5,
 *       totalFiles: 12,
 *       totalDirs : 3,
 *       totalSize : 8420
 *     }
 *
 *   fs.summary('/projects/main.zpp')
 *   → {
 *       path      : '/projects/main.zpp',
 *       type      : 'file',
 *       size      : 420,
 *       lines     : 18,
 *       words     : 74,
 *       ext       : '.zpp',
 *       modifiedAt: Date
 *     }
 */
fs.summary = (path) => {
  if (typeof path !== 'string') return null;
  if (fs.isFile(path)) {
    return {
      path       : path,
      type       : 'file',
      size       : fs.size(path),
      lines      : fs.lineCount(path),
      words      : fs.wordCount(path),
      ext        : fs.ext(path),
      modifiedAt : fs.modifiedAt(path),
    };
  }
  if (fs.isDir(path)) {
    const all   = fs.find(path);
    let   files = 0, dirs = 0, size = 0;
    for (let i = 0; i < all.length; i++) {
      if (fs.isFile(all[i])) { files++; size += fs.size(all[i]) || 0; }
      else if (fs.isDir(all[i])) { dirs++; }
    }
    return {
      path       : path,
      type       : 'dir',
      children   : fs.list(path).length,
      totalFiles : files,
      totalDirs  : dirs,
      totalSize  : size,
    };
  }
  return null;
};

// ════════════════════════════════════════════════════════════════════════════════
// DSALibraries Registration  —  do NOT modify the structure below
// ════════════════════════════════════════════════════════════════════════════════

if (typeof DSALibraries !== 'undefined') {
  DSALibraries['filesystem.zl'] = {
    description:
      'Filesystem utilities for ZPP: read/write/delete files, directory management, ' +
      'path helpers, JSON/line I/O, search (find/grep), metadata/stats, directory trees. ' +
      'Uses real Node fs in Electron/Node; fully in-memory Virtual FS in the browser.',

    inject(G) {
      if (typeof window !== 'undefined' && window.__ZPP__) {
        window.__ZPP__.registerBuiltins([
          // Namespace
          'fs',
          // ── Section 1: Core File I/O ──
          'read', 'write', 'append', 'delete', 'copy', 'move', 'rename',
          'exists', 'touch',
          // ── Section 2: Directory Operations ──
          'mkdir', 'rmdir', 'deleteDir',
          'list', 'listFull',
          'isDir', 'isFile', 'isEmpty',
          // ── Section 3: Path Utilities ──
          'join', 'basename', 'dirname', 'ext',
          'stripExt', 'changeExt',
          'normalize', 'resolve', 'split', 'isAbsolute',
          // ── Section 4: Metadata & Stats ──
          'stat', 'size', 'modifiedAt', 'createdAt',
          // ── Section 5: Content Helpers ──
          'readLines', 'writeLines', 'appendLine',
          'readJSON', 'writeJSON',
          'clear', 'lineCount', 'wordCount',
          // ── Section 6: Search ──
          'find', 'findByExt', 'grep', 'countIn',
          // ── Section 7: Environment ──
          'cwd', 'home', 'temp', 'sep', 'env',
          'vfsSnapshot', 'vfsClear',
          // ── Section 8: Tree & Summary ──
          'tree', 'summary',
        ]);

        window.__ZPP__.registerTypes(['fs']);
      }

      G.fs = fs;  // ← exposes  fs.<method>  inside the ZPP runtime
    }
  };
}

if (typeof module !== 'undefined') module.exports = fs;

})();
