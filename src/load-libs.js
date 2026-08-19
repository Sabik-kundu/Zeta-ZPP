'use strict';

// ============================================================
//  Zeta Library Auto-Loader
//
//  HOW TO ADD A NEW LIBRARY:
//    1. Drop your .js file into  src/libs/
//    2. That's it. No other changes needed.
//
//  Each file must either:
//    a) Export { DSALibraries } and it will be merged in, OR
//    b) Register itself via  global.DSALibraries['name.zl'] = {...}
//       (the global is already set before any lib file is loaded)
//
//  Load order: library.js first, ml.js second, rest alphabetical.
// ============================================================

const fs   = require('fs');
const path = require('path');

const LIBS_DIR = path.join(__dirname, 'libs');

// ── Step 1: Bootstrap DSALibraries global ────────────────────
//  library.js exports { DSALibraries } — use it as the base
const { DSALibraries } = require(path.join(LIBS_DIR, 'library.js'));
global.DSALibraries = DSALibraries;

// ── Step 2: Load everything else in the libs/ folder ─────────
//  Fixed order for known files, then alphabetical for unknown ones
const LOAD_ORDER = ['ml.js', 'gui.js', 'threeD.js'];

const allFiles = fs.readdirSync(LIBS_DIR)
  .filter(f => f.endsWith('.js') && f !== 'library.js');

// Sort: known files first (in LOAD_ORDER), then rest alphabetically
const sorted = [
  ...LOAD_ORDER.filter(f => allFiles.includes(f)),
  ...allFiles.filter(f => !LOAD_ORDER.includes(f)).sort(),
];

for (const file of sorted) {
  const fullPath = path.join(LIBS_DIR, file);
  try {
    require(fullPath);
    // If it exported its own DSALibraries object, merge it in
    const mod = require.cache[require.resolve(fullPath)];
    if (mod && mod.exports && mod.exports.DSALibraries) {
      Object.assign(global.DSALibraries, mod.exports.DSALibraries);
    }
  } catch (e) {
    process.stderr.write(
      `\x1b[33mWarning: failed to load lib "${file}": ${e.message}\x1b[0m\n`
    );
  }
}

// ── Step 3: Patch browser-only libraries for Node.js ─────────
//  gui.zl and threeD.zl use the DOM — wrap their inject() so
//  they print a clear error instead of crashing.
const BROWSER_ONLY = ['gui.zl', 'threeD.zl'];

for (const name of BROWSER_ONLY) {
  const lib = global.DSALibraries[name];
  if (!lib) continue;
  const originalInject = lib.inject.bind(lib);
  lib.inject = function(G) {
    if (typeof window === 'undefined') {
      throw new Error(
        `"${name}" is a browser-only library and cannot be used in terminal mode.\n` +
        `  It works in the ZETA++ web editor, but not with "zeta run".`
      );
    }
    return originalInject(G);
  };
}

module.exports = { DSALibraries: global.DSALibraries };
