#!/usr/bin/env node
'use strict';

// ============================================================
//  Zeta CLI  —  zeta run <file.zpp>
//  Runs ZETA++ programs from the terminal, just like
// zeta run main.zpp
// ============================================================

const fs   = require('fs');
const path = require('path');

const PKG_ROOT = path.resolve(__dirname, '..');

require(path.join(PKG_ROOT, 'src', 'load-libs.js'));
const { Interpreter } = require(path.join(PKG_ROOT, 'src', 'interpreter.js'));

const { appifyFile } = require(path.join(__dirname, 'appify.js'));

const BOLD   = s => `\x1b[1m${s}\x1b[0m`;
const RED    = s => `\x1b[31m${s}\x1b[0m`;
const GREEN  = s => `\x1b[32m${s}\x1b[0m`;
const YELLOW = s => `\x1b[33m${s}\x1b[0m`;
const CYAN   = s => `\x1b[36m${s}\x1b[0m`;
const DIM    = s => `\x1b[2m${s}\x1b[0m`;
const MAGENTA = s => `\x1b[35m${s}\x1b[0m`;

const VERSION  = '1.2.5';
const LANG_VER = 'v2.5';

// ============================================================
//  ERROR ENGINE
//  classifyError  — maps message keywords to a human label
//  getSuggestion  — returns a "did you mean / hint" string
//  formatError    — builds a full diagnostic block:
//    ╭─ Error Type
//    │  File: foo.zpp:12:5
//    │
//    │   10 │  func add(a b) {
//    │   11 │    return a + b
//    │ → 12 │  }}}
//    │       │  ~~~
//    │
//    │  Unexpected token "}"
//    │  Hint: Check for an extra closing brace.
//    ╰──────────────────────────────────────────
// ============================================================

function classifyError(msg) {
  const m = msg.toLowerCase();
  if (/unexpected token|expected\s|unterminated|invalid syntax|parse error/i.test(m))
    return { label: 'Syntax Error',     color: RED };
  if (/is not defined|not declared|undefined variable/i.test(m))
    return { label: 'Reference Error',  color: RED };
  if (/is not a function|cannot call|not callable/i.test(m))
    return { label: 'Type Error',       color: YELLOW };
  if (/cannot read|null|of undefined|of null/i.test(m))
    return { label: 'Null Reference',   color: YELLOW };
  if (/stack overflow|maximum call stack|infinite recursion/i.test(m))
    return { label: 'Stack Overflow',   color: RED };
  if (/import|module not found|library|\.zl/i.test(m))
    return { label: 'Import Error',     color: MAGENTA };
  if (/division by zero|divide by zero/i.test(m))
    return { label: 'Math Error',       color: YELLOW };
  if (/index out of|out of bounds/i.test(m))
    return { label: 'Index Error',      color: YELLOW };
  if (/raise\b|raised:/i.test(m))
    return { label: 'Raised Exception', color: CYAN };
  return   { label: 'Runtime Error',   color: RED };
}

function getSuggestion(msg) {
  if (/is not defined/i.test(msg)) {
    const name = (msg.match(/['"]([\w$]+)['"]\s+is not defined/i) ||
                  msg.match(/([\w$]+)\s+is not defined/i))?.[1];
    return name
      ? `Did you declare "${name}"? Check for a typo or a missing #import.`
      : 'Check for a typo or a missing #import["lib.zl"].';
  }
  if (/unexpected token/i.test(msg)) {
    const tok = msg.match(/unexpected token\s+["']?([^\s"']+)["']?/i)?.[1];
    return tok
      ? `Unexpected "${tok}" — check for a missing semicolon, bracket, or brace before this point.`
      : 'Check for missing semicolons, mismatched brackets, or extra braces.';
  }
  if (/expected\s+["']?([^"'\s]+)["']?/i.test(msg)) {
    const tok = msg.match(/expected\s+["']?([^"'\s]+)["']?/i)?.[1];
    return `The parser expected "${tok}" here. Check the surrounding syntax.`;
  }
  if (/is not a function/i.test(msg)) {
    const name = msg.match(/([\w$.]+)\s+is not a function/i)?.[1];
    return name
      ? `"${name}" is not callable — check the spelling or whether you need to call a method instead.`
      : 'The value you are calling is not a function — check its type.';
  }
  if (/cannot read prop|of null|of undefined/i.test(msg))
    return 'You may be accessing a property on a null/undefined variable — check it was initialised.';
  if (/stack overflow|maximum call stack/i.test(msg))
    return 'Your function is calling itself endlessly — make sure there is a base case that stops the recursion.';
  if (/division by zero|divide by zero/i.test(msg))
    return 'The divisor evaluated to zero — add a check before dividing.';
  if (/index out of|out of bounds/i.test(msg))
    return 'The index is past the end of the list — check your loop bounds or list length.';
  if (/import|\.zl/i.test(msg))
    return 'Verify the library name is correct and the .zl file is in your project\'s libs folder.';
  if (/unterminated string/i.test(msg))
    return 'A string literal is missing its closing quote.';
  return null;
}

// Extract line / column from error object or message text
function _extractPosition(e) {
  // Some interpreters attach these directly
  if (e.line   && typeof e.line   === 'number') return { line: e.line,   col: e.col   || e.column || null };
  if (e.lineNumber) return { line: e.lineNumber, col: e.columnNumber || null };

  // Parse from message:  "at line 5"  ":5:3"  "[5:3]"  "line 5, col 3"
  const msg = e.message || '';
  const patterns = [
    /\bat\s+line[:\s]+(\d+)(?:[,\s]+col(?:umn)?[:\s]+(\d+))?/i,
    /\bline[:\s]+(\d+)(?:[,\s]+col(?:umn)?[:\s]+(\d+))?/i,
    /\[(\d+):(\d+)\]/,
    /:(\d+):(\d+)/,
  ];
  for (const rx of patterns) {
    const m = msg.match(rx);
    if (m) return { line: parseInt(m[1], 10), col: m[2] ? parseInt(m[2], 10) : null };
  }
  return { line: null, col: null };
}

// Strip position info already embedded in the raw message so we don't print it twice
function _cleanMessage(msg) {
  return msg
    .replace(/\bat line[:\s]+\d+(?:[,\s]+col(?:umn)?[:\s]+\d+)?/gi, '')
    .replace(/\bline[:\s]+\d+(?:[,\s]+col(?:umn)?[:\s]+\d+)?/gi,    '')
    .replace(/\[\d+:\d+\]/g, '')
    .replace(/:\d+:\d+/g,    '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * formatError(e, filePath, code)
 * Returns a fully-formatted, human-readable error string.
 * filePath and code are optional; if supplied, a code snippet is shown.
 */
function formatError(e, filePath, code) {
  const { label, color } = classifyError(e.message || '');
  const { line, col }    = _extractPosition(e);
  const sourceLines      = code ? code.split('\n') : [];
  const cleanMsg         = _cleanMessage(e.message || 'An unknown error occurred.');
  const suggestion       = getSuggestion(e.message || '');

  const W = 56; // box width
  const bar  = color('│');
  const top  = color('╭─ ') + color(BOLD(label));
  const bot  = color('╰' + '─'.repeat(W));

  let out = '\n' + top + '\n' + bar + '\n';

  // ── File + position line ──────────────────────────────────────
  if (filePath) {
    let loc = CYAN(path.basename(filePath));
    if (line) loc += DIM(':') + YELLOW(String(line));
    if (col)  loc += DIM(':') + YELLOW(String(col));
    out += bar + '  ' + DIM('in ') + loc + '\n' + bar + '\n';
  }

  // ── Code context (up to 3 lines before + error line + 1 after) ─
  if (line && sourceLines.length >= line) {
    const ctxStart = Math.max(0,                    line - 4);
    const ctxEnd   = Math.min(sourceLines.length - 1, line);

    for (let i = ctxStart; i <= ctxEnd; i++) {
      const lno     = String(i + 1).padStart(4);
      const isErr   = (i + 1) === line;
      const rawLine = sourceLines[i];

      if (isErr) {
        out += color('│ → ') + color(BOLD(lno + ' │ ')) + RED(rawLine) + '\n';
        // Caret row
        const indent = 9; // "│ →  NNN │ " prefix length
        if (col && col > 0) {
          out += bar + ' '.repeat(indent + col - 1) + RED('^') + '\n';
        } else {
          // Underline the whole trimmed token area
          const trimStart = rawLine.search(/\S/);
          const underline = trimStart >= 0
            ? ' '.repeat(indent + trimStart) + RED('~'.repeat(Math.max(1, rawLine.trimStart().length)))
            : ' '.repeat(indent) + RED('~'.repeat(Math.max(1, rawLine.length)));
          out += bar + underline + '\n';
        }
      } else {
        out += bar + DIM('   ' + lno + ' │ ' + rawLine) + '\n';
      }
    }
    out += bar + '\n';
  }

  // ── Message ───────────────────────────────────────────────────
  out += bar + '  ' + BOLD(cleanMsg) + '\n';

  // ── Hint ──────────────────────────────────────────────────────
  if (suggestion) {
    out += bar + '\n';
    out += bar + '  ' + CYAN('Hint: ') + suggestion + '\n';
  }

  // ── ZETA_TRACE reminder ───────────────────────────────────────
  if (process.env.ZETA_TRACE && e.stack) {
    out += bar + '\n';
    e.stack.split('\n').slice(1, 6).forEach(l =>
      out += bar + DIM('  ' + l.trim()) + '\n'
    );
  } else if (!process.env.ZETA_TRACE) {
    out += bar + '\n';
    out += bar + DIM('  Set ZETA_TRACE=1 for the full JS stack trace.') + '\n';
  }

  out += bot + '\n\n';
  return out;
}

// ── GUI detection ─────────────────────────────────────────────
//  Returns true if the source code imports gui.zl or threeD.zl.
//  Those libraries need a real DOM, so we launch Electron instead
//  of running in plain Node.
//  Handles both quote styles and optional whitespace.
function isGuiScript(code) {
  return /#import\s*\[\s*["']gui\.zl["']\s*\]/.test(code) ||
         /#import\s*\[\s*["']threeD\.zl["']\s*\]/.test(code) ||
         /#import\s*["']gui\.zl["']/.test(code) ||
         /#import\s*["']threeD\.zl["']/.test(code) ||
         /#import\s*\[\s*["']worlib\.zl["']\s*\]/.test(code) ||
         /#import\s*["']worlib\.zl["']/.test(code);

}

// ── Launch Electron for GUI scripts ───────────────────────────
//  Spawns:  electron <PKG_ROOT>/main.js <resolved-zpp-path>
//  main.js opens a BrowserWindow that loads index.html, which
//  then runs the interpreter in the renderer (browser) context
//  so that gui.js browser-mode kicks in with a real DOM.
function launchElectron(resolvedZppPath) {
  const { spawn } = require('child_process');
  let electronBin;
  try {
    electronBin = require('electron'); // returns the path to the electron binary
  } catch (e) {
    process.stderr.write(
      RED('Error: electron is not installed.\n') +
      DIM('  Run:  npm install electron --save-dev\n')
    );
    process.exit(1);
  }

  const mainJs = path.join(PKG_ROOT, 'main.js');
  if (!fs.existsSync(mainJs)) {
    process.stderr.write(
      RED('Error: main.js not found at: ' + mainJs + '\n') +
      DIM('  Create main.js in your project root (see README).\n')
    );
    process.exit(1);
  }

  process.stdout.write(CYAN('[zeta] ') + DIM('GUI script detected — launching Electron…\n'));

  const child = spawn(electronBin, [mainJs, resolvedZppPath], {
    stdio : 'inherit',
    detached: false,
  });

  child.on('error', err => {
    process.stderr.write(RED('Failed to start Electron: ' + err.message + '\n'));
    process.exit(1);
  });

  child.on('close', code => process.exit(code || 0));
}

// ── Help text ─────────────────────────────────────────────────
function printHelp() {
  process.stdout.write(`
${BOLD(CYAN('Zeta'))} — ZETA++ Interpreter ${DIM(LANG_VER)}

${BOLD('USAGE')}
  ${GREEN('zeta')} ${YELLOW('run')} ${CYAN('<file.zpp>')}                    Run a ZETA++ source file
  ${GREEN('zeta')} ${YELLOW('check')} ${CYAN('<file.zpp>')}                  Parse and report errors without running
  ${GREEN('zeta')} ${YELLOW('watch')} ${CYAN('<file.zpp>')}                  Re-run automatically on every save
  ${GREEN('zeta')} ${YELLOW('bench')} ${CYAN('<file.zpp>')} ${DIM('[--runs N]')}        Benchmark execution time
  ${GREEN('zeta')} ${YELLOW('stats')} ${CYAN('<file.zpp>')}                  Show code statistics
  ${GREEN('zeta')} ${YELLOW('appify')} ${CYAN('<file.zpp>')} ${DIM('[--name N] [--output dir]')}  Package as a double-click app
  ${GREEN('zeta')} ${YELLOW('new')} ${CYAN('<name>')} ${DIM('[--template blank|cli|gui|ml]')}  Scaffold a new .zpp file
  ${GREEN('zeta')} ${YELLOW('init')}                               Init a project (zeta.json + main.zpp)
  ${GREEN('zeta')} ${YELLOW('docs')} ${DIM('[lib]')}                         Show docs for a .zl library
  ${GREEN('zeta')} ${YELLOW('snippet')} ${DIM('[topic]')}                    Browse runnable code snippets
  ${GREEN('zeta')} ${YELLOW('version')}                            Show version info
  ${GREEN('zeta')} ${YELLOW('update')}                            Update the system
  ${GREEN('zeta')} ${YELLOW('help')}                               Show this help

${BOLD('EXAMPLES')}
  ${DIM('# Run a file')}
  zeta run hello.zpp

  ${DIM('# Run a file in another folder')}
  zeta run ./programs/fibonacci.zpp

  ${DIM('# Watch a file and auto-rerun on save')}
  zeta watch hello.zpp

  ${DIM('# Benchmark over 20 runs')}
  zeta bench fib.zpp --runs 20

  ${DIM("# Package a script as a shareable app")}
  zeta appify mygame.zpp

  ${DIM('# Scaffold a new ML project')}
  zeta new mymodel --template ml

  ${DIM('# Look up the math.zl library API')}
  zeta docs math.zl

  ${DIM('# Show a runnable struct snippet')}
  zeta snippet struct

${BOLD('ZETA++ QUICK REFERENCE')}
  ${DIM('Variables')}      num x = 5;   str s = "hi";   bool b = true;
  ${DIM('Print')}          print("Hello, world!");
  ${DIM('Input')}          str name = input("Name: ");
  ${DIM('If / Else')}      if x > 0 { print("pos"); } else { print("neg"); }
  ${DIM('For loop')}       for i = 0 to 10 { print(i); }
  ${DIM('While loop')}     while x > 0 { x--; }
  ${DIM('For each')}       for each item in arr { print(item); }
  ${DIM('Functions')}      func greet(name) { print("Hi " + name); }
  ${DIM('Struct')}         struct Point { num x; num y; }
  ${DIM('Lambda')}         let sq = fn(n) => n * n;
  ${DIM('Ternary')}        str r = when x > 0 then "pos" else "neg";
  ${DIM('Match')}          match x { on 1 => { } on 2 => { } else => { } }
  ${DIM('Try/Catch')}      attempt { raise "oops"; } rescue e { print(e); }
  ${DIM('Import libs')}    #import["math.zl"];  #import["ml.zl"];

${BOLD('AVAILABLE LIBRARIES (.zl)')}
  ${CYAN('— Standard Libraries')}
  math.zl        factorial, prime, gcd, fibonacci, stats, matrices…
  time.zl        now, year, month, day, hour, formatTime, timerStart…
  net.zl         fetchText, fetchJSON, fetchCSV, fetchTable…
  convert.zl     cToF, kmToMiles, kgToLbs, bytesToMB…
  random.zl      uuid, shuffle, pick, dice, gaussianRandom…
  str.zl         isPalindrome, titleCase, camelCase, wordWrap…
  algo.zl        makeStack, makeQueue, makeMinPQ, makeGraph…
  ml.zl          LinearRegression, KNN, DecisionTree, MLP, KMeans…

  ${CYAN('— Media & Hardware')}
  audio          playSound, stopSound, setVolume, onBeat…
  camera         openCamera, snapshot, videoStream, applyFilter…
  ascii          asciiArt, boxDraw, gradient, banner…
  textloader     loadTxt, loadCSV, loadLines, streamFile…
  filesystem     loadFile, editFile, loadText…

  ${CYAN('— GUI & Graphics')}  ${YELLOW('(Electron required)')}
  gui.zl         Window, Scene, Button, Label, Canvas, run…
  threeD.zl      Forge3D, tdCube, tdSphere, tdCamera, tdScene3D…

  ${CYAN('— Server & Routing')} 
  server.zl      _make_server, .type, .port...

  ${CYAN('— OS Simulator -> learn how system works')}
  ossim.zl

  ${DIM('Use `zeta docs <lib>` for full API reference.')}
  ${DIM('Use `zeta docs manual` for the complete language manual.')}

${DIM(`Zeta CLI ${VERSION}  |  ZETA++ ${LANG_VER}  |  Node.js ${process.version}`)}
`);
}

// ── Run a .zpp file ───────────────────────────────────────────
function runFile(filePath, checkOnly = false) {
  const resolved = path.resolve(filePath);

  if (!fs.existsSync(resolved)) {
    process.stderr.write(RED(`Error: File not found: "${filePath}"\n`));
    process.exit(1);
  }

  const ext = path.extname(resolved).toLowerCase();
  if (ext !== '.zpp') {
    process.stderr.write(
      YELLOW(`Warning: "${path.basename(resolved)}" doesn't have a .zpp extension.\n`)
    );
  }

  let code;
  try {
    code = fs.readFileSync(resolved, 'utf8');
  } catch (e) {
    process.stderr.write(RED(`Error reading file: ${e.message}\n`));
    process.exit(1);
  }

  // ── GUI check: hand off to Electron if needed ────────────────
  if (!checkOnly && isGuiScript(code)) {
    launchElectron(resolved);
    return; // launchElectron handles process.exit
  }

  if (checkOnly) {
    // Parse only — don't execute
    try {
      const interp = new Interpreter();
      const tokens = interp.tokenize(interp._preprocess(code));
      interp.parse(tokens);
      const guiNote = isGuiScript(code)
        ? '  ' + YELLOW('[GUI/3D script — Electron required to run]\n')
        : '';
      process.stdout.write(GREEN(`✓ "${path.basename(resolved)}" parsed OK — no syntax errors.\n`) + guiNote);
    } catch (e) {
      process.stderr.write(formatError(e, resolved, code));
      process.exit(1);
    }
    return;
  }

  // Execute in plain Node (no GUI)
  const interp = new Interpreter({ sink: process.stdout });

  // Override process.argv[2] so the interpreter's _defaultFileLoader
  // resolves #import paths relative to the .zpp file being run
  process.argv[2] = resolved;

  try {
    interp.interpret(code);
  } catch (e) {
    process.stderr.write(formatError(e, resolved, code));
    process.exit(1);
  }
}

// ============================================================
//  NEW COMMAND: zeta watch <file.zpp>
//  Re-runs the file automatically every time it is saved.
//  Uses fs.watch with a 150 ms debounce to avoid double-fires.
// ============================================================
function watchFile(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    process.stderr.write(RED(`Error: File not found: "${filePath}"\n`));
    process.exit(1);
  }

  const SEP = DIM('─'.repeat(52));

  function runNow() {
    // Clear terminal and print a fresh header each run
    process.stdout.write('\x1Bc'); // ANSI clear screen
    process.stdout.write(SEP + '\n');
    process.stdout.write(
      CYAN('[zeta watch] ') +
      BOLD(path.basename(resolved)) +
      DIM(`  ${new Date().toLocaleTimeString()}`) + '\n'
    );
    process.stdout.write(SEP + '\n\n');

    try {
      const code = fs.readFileSync(resolved, 'utf8');
      const interp = new Interpreter({ sink: process.stdout });
      process.argv[2] = resolved;
      interp.interpret(code);
      process.stdout.write('\n' + SEP + '\n');
      process.stdout.write(GREEN('✓ Finished. ') + DIM('Watching for changes — Ctrl+C to stop.\n'));
    } catch (e) {
      process.stderr.write(formatError(e, resolved, (() => {
        try { return fs.readFileSync(resolved, 'utf8'); } catch(_) { return ''; }
      })()));
      process.stdout.write(DIM('  Watching for changes — fix the error and save.\n'));
    }
  }

  runNow(); // first run immediately

  let debounceTimer = null;
  fs.watch(resolved, () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runNow, 150);
  });
}

// ============================================================
//  NEW COMMAND: zeta bench <file.zpp> [--runs N]
//  Runs the file N times (default 10) with output suppressed,
//  then prints avg / min / max / stddev in milliseconds.
// ============================================================
function benchFile(filePath, runs = 10) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    process.stderr.write(RED(`Error: File not found: "${filePath}"\n`));
    process.exit(1);
  }

  let code;
  try {
    code = fs.readFileSync(resolved, 'utf8');
  } catch (e) {
    process.stderr.write(RED(`Error reading file: ${e.message}\n`));
    process.exit(1);
  }

  process.stdout.write(
    '\n' + CYAN('[zeta bench] ') +
    `Benchmarking ${BOLD(path.basename(resolved))} ` +
    `over ${YELLOW(String(runs))} run${runs !== 1 ? 's' : ''}…\n\n`
  );

  // Null sink — suppresses all print() output during bench runs
  const nullSink = { write: () => {} };
  const times = [];

  for (let i = 0; i < runs; i++) {
    const interp = new Interpreter({ sink: nullSink });
    process.argv[2] = resolved;
    const start = process.hrtime.bigint();
    try {
      interp.interpret(code);
    } catch (e) {
      process.stderr.write(formatError(e, resolved, code));
      process.exit(1);
    }
    const elapsed = Number(process.hrtime.bigint() - start) / 1e6; // → ms
    times.push(elapsed);

    // Live progress bar
    const filled  = Math.round(((i + 1) / runs) * 20);
    const bar     = GREEN('█'.repeat(filled)) + DIM('░'.repeat(20 - filled));
    process.stdout.write(`\r  [${bar}] ${i + 1}/${runs}`);
  }

  process.stdout.write('\n\n');

  const avg    = times.reduce((a, b) => a + b, 0) / times.length;
  const min    = Math.min(...times);
  const max    = Math.max(...times);
  const stddev = Math.sqrt(
    times.map(t => (t - avg) ** 2).reduce((a, b) => a + b, 0) / times.length
  );

  // Simple horizontal spark bar (relative to max)
  const sparkWidth = 20;
  function spark(val) {
    const filled = Math.round((val / max) * sparkWidth);
    return CYAN('▪'.repeat(filled)) + DIM('·'.repeat(sparkWidth - filled));
  }

  const W = 10; // label width
  process.stdout.write(DIM('  ' + '─'.repeat(44)) + '\n');
  process.stdout.write(`  ${'Runs'.padEnd(W)} ${YELLOW(String(runs))}\n`);
  process.stdout.write(`  ${'Avg'.padEnd(W)} ${GREEN(avg.toFixed(3) + ' ms')}  ${spark(avg)}\n`);
  process.stdout.write(`  ${'Min'.padEnd(W)} ${GREEN(min.toFixed(3) + ' ms')}  ${spark(min)}\n`);
  process.stdout.write(`  ${'Max'.padEnd(W)} ${YELLOW(max.toFixed(3) + ' ms')}  ${spark(max)}\n`);
  process.stdout.write(`  ${'Std Dev'.padEnd(W)} ${DIM(stddev.toFixed(3) + ' ms')}\n`);
  process.stdout.write(DIM('  ' + '─'.repeat(44)) + '\n\n');
}

// ============================================================
//  NEW COMMAND: zeta stats <file.zpp>
//  Analyses the source and prints a dashboard: line counts,
//  symbol counts (functions, structs, imports…) and complexity.
// ============================================================
function statsFile(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    process.stderr.write(RED(`Error: File not found: "${filePath}"\n`));
    process.exit(1);
  }

  const code  = fs.readFileSync(resolved, 'utf8');
  const lines = code.split('\n');
  const bytes = Buffer.byteLength(code, 'utf8');

  const totalLines   = lines.length;
  const blankLines   = lines.filter(l => l.trim() === '').length;
  const commentLines = lines.filter(l => l.trim().startsWith('//')).length;
  const codeLines    = totalLines - blankLines - commentLines;

  const count = rx => (code.match(rx) || []).length;

  const functions  = count(/\bfunc\s+\w+/g);
  const lambdas    = count(/\bfn\s*\(/g);
  const structs    = count(/\bstruct\s+\w+/g);
  const imports    = count(/#import\s*\[/g);
  const variables  = count(/\b(num|str|bool|list|map)\s+\w+/g);
  const loops      = count(/\b(for|while)\b/g);
  const conditions = count(/\bif\b/g);
  const matches    = count(/\bmatch\b/g);
  const tryCatch   = count(/\battempt\b/g);
  const raises     = count(/\braise\b/g);

  // Simple cyclomatic-complexity proxy: branches + 1
  const complexity = conditions + loops + matches + tryCatch + 1;
  const complexLabel =
    complexity <= 5  ? GREEN('Low')    :
    complexity <= 10 ? YELLOW('Medium') :
                       RED('High');

  const row = (label, value, color = CYAN) =>
    `  ${DIM(label.padEnd(22))} ${color(String(value))}\n`;

  process.stdout.write('\n');
  process.stdout.write('  ' + BOLD(CYAN('ZETA++ Code Statistics')) + '\n');
  process.stdout.write(DIM('  ' + '─'.repeat(40)) + '\n');
  process.stdout.write(row('File',          path.basename(resolved), s => s));
  process.stdout.write(row('Size',          bytes + ' bytes',        DIM));
  process.stdout.write('\n');
  process.stdout.write(row('Lines  total',  totalLines,   YELLOW));
  process.stdout.write(row('Lines  code',   codeLines,    GREEN));
  process.stdout.write(row('Lines  comment',commentLines, DIM));
  process.stdout.write(row('Lines  blank',  blankLines,   DIM));
  process.stdout.write('\n');
  process.stdout.write(row('Functions',     functions));
  process.stdout.write(row('Lambdas',       lambdas));
  process.stdout.write(row('Structs',       structs));
  process.stdout.write(row('Imports',       imports));
  process.stdout.write(row('Variables',     variables));
  process.stdout.write(row('Loops',         loops));
  process.stdout.write(row('Conditionals',  conditions));
  process.stdout.write(row('Match blocks',  matches));
  process.stdout.write(row('Try / Catch',   tryCatch));
  process.stdout.write(row('Raises',        raises));
  process.stdout.write('\n');
  process.stdout.write(`  ${DIM('Complexity (proxy)'.padEnd(22))} ${complexLabel} ${DIM('(' + complexity + ')')}\n`);
  process.stdout.write(DIM('  ' + '─'.repeat(40)) + '\n\n');
}

// ============================================================
//  NEW COMMAND: zeta new <name> [--template blank|cli|gui|ml]
//  Scaffolds a ready-to-run .zpp file from a built-in template.
// ============================================================
const TEMPLATES = {
  blank: name => (
`// ${name}.zpp — ZETA++ Program

print("Hello from ${name}!");
`),
  cli: name => (
`// ${name}.zpp — CLI Program
#import["str.zl"];

print("Welcome to ${name}!");
str input_val = input("Enter something: ");
print("You typed: " + titleCase(input_val));
`),
  gui: name => (
`// ${name}.zpp — GUI Program
#import["gui.zl"];

num w   = Window(800, 600, "${name}");
num scn = Scene(w);
num lbl = Label(scn, "Hello from ${name}!", 50, 50);
num btn = Button(scn, "Click me", 50, 100);
run(w);
`),
  ml: name => (
`// ${name}.zpp — ML Program
#import["ml.zl"];
#import["math.zl"];

// Sample training data  (X = features, y = labels)
list X = [[1], [2], [3], [4], [5]];
list y = [2, 4, 6, 8, 10];

num model = LinearRegression();
model.fit(X, y);

num pred = model.predict([[6]]);
print("Prediction for input 6: " + pred);
`),
};

function newProject(name, template = 'blank') {
  if (!name) {
    process.stderr.write(RED('Error: No project name specified.\n'));
    process.stderr.write(DIM('Usage: zeta new <name> [--template blank|cli|gui|ml]\n'));
    process.exit(1);
  }
  if (!TEMPLATES[template]) {
    process.stderr.write(RED(`Error: Unknown template "${template}".\n`));
    process.stderr.write(DIM('Available templates: blank, cli, gui, ml\n'));
    process.exit(1);
  }

  const baseName = name.replace(/\.zpp$/, '');
  const fileName = baseName + '.zpp';
  const resolved = path.resolve(fileName);

  if (fs.existsSync(resolved)) {
    process.stdout.write(YELLOW(`"${fileName}" already exists. Overwrite? `) + DIM('(y/N): '));
    // Synchronous one-character read
    const buf = Buffer.alloc(8);
    let n = 0;
    try { n = fs.readSync(process.stdin.fd, buf, 0, 8); } catch (_) {}
    if (!buf.slice(0, n).toString().trim().toLowerCase().startsWith('y')) {
      process.stdout.write(DIM('Aborted.\n'));
      process.exit(0);
    }
  }

  fs.writeFileSync(resolved, TEMPLATES[template](baseName), 'utf8');

  process.stdout.write('\n');
  process.stdout.write(GREEN(`✓ Created "${fileName}"`) + ` using the ${CYAN(template)} template.\n`);
  process.stdout.write(DIM('  Run it: ') + GREEN(`zeta run ${fileName}`) + '\n\n');
}

// ============================================================
//  NEW COMMAND: zeta init
//  Creates zeta.json (project config) and main.zpp in the
//  current working directory — like `npm init` for ZETA++.
// ============================================================
function initProject() {
  const cwd        = process.cwd();
  const configPath = path.join(cwd, 'zeta.json');
  const mainPath   = path.join(cwd, 'main.zpp');
  const projectName = path.basename(cwd);

  process.stdout.write('\n' + BOLD(CYAN('  Initialising ZETA++ project')) + '\n');
  process.stdout.write(DIM('  ' + '─'.repeat(36)) + '\n');

  if (fs.existsSync(configPath)) {
    process.stdout.write(YELLOW('  zeta.json already exists — skipped.\n'));
  } else {
    const config = {
      name:        projectName,
      version:     '1.2.5',
      description: '',
      author:      '',
      entry:       'main.zpp',
      zeta:        LANG_VER,
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    process.stdout.write(GREEN('  ✓ Created zeta.json\n'));
  }

  if (fs.existsSync(mainPath)) {
    process.stdout.write(DIM('  main.zpp already exists — skipped.\n'));
  } else {
    const content =
`// main.zpp — ${projectName} entry point
// Generated by \`zeta init\`

print("Hello from ${projectName}!");
`;
    fs.writeFileSync(mainPath, content, 'utf8');
    process.stdout.write(GREEN('  ✓ Created main.zpp\n'));
  }

  process.stdout.write(DIM('  ' + '─'.repeat(36)) + '\n');
  process.stdout.write('\n  ' + DIM('Run your project: ') + GREEN('zeta run main.zpp') + '\n\n');
}

// ============================================================
//  COMMAND: zeta docs [lib]
//  Streams the matching .txt file from the docs/ folder
//  directly to the terminal.  `zeta docs` lists everything.
// ============================================================

// Folder that holds all .txt documentation files
const DOCS_DIR = path.join(PKG_ROOT, 'docs');

// Maps every user-facing alias to its filename inside docs/
// Keys are lower-cased for case-insensitive lookup.
const DOC_FILES = {
  // Standard .zl libraries
  'math.zl':          'math.zl.txt',
  'math':             'math.zl.txt',
  'time.zl':          'time.zl.txt',
  'time':             'time.zl.txt',
  'net.zl':           'net.zl.txt',
  'net':              'net.zl.txt',
  'convert.zl':       'convet.zl.txt',   // intentional filename in docs/
  'convert':          'convet.zl.txt',
  'random.zl':        'random.zl.txt',
  'random':           'random.zl.txt',
  'str.zl':           'str.zl.txt',
  'str':              'str.zl.txt',
  'algo.zl':          'algo.zl.txt',
  'algo':             'algo.zl.txt',
  // GUI / 3D (Electron)
  'gui.zl':           'GUI_DOCUMENTATION.txt',
  'gui':              'GUI_DOCUMENTATION.txt',
  'threed.zl':        'THREED_DOCUMENTATION.txt',
  'threed':           'THREED_DOCUMENTATION.txt',
  '3d':               'THREED_DOCUMENTATION.txt',
  // Media & hardware
  'audio':            'AUDIO_DOCUMENTATION.txt',
  'camera':           'CAMERA_DOCUMENTATION.txt',
  'ascii':            'ASCII_DOCUMENTATION.txt',
  'textloader':       'TEXTLOADER_DOCUMENTATION.txt',
  // Reference docs
  'core':             'core.txt',
  'core.txt':         'core.txt',
  'manual':           'MANUAL_DOCS.txt',
  'ml.zl': 'ml.txt',
  'ml': 'ml.txt',
  'ML': 'ml.txt',

  'fs': 'fs_docs.txt',
  'filesystem': 'fs_docs.txt',
  'filesystem.zl': 'fs_docs.txt',

  'server.zl': 'server.txt',
  'server' : 'server.txt',

  'os': 'OS_SIM.txt',
  'os_sim': 'OS_SIM.txt',
  'os_sim.zl': 'OS_SIM.txt',

  'advgui' : 'ADVGUI.txt',
  'advgui.zl': 'ADVGUI.txt',

  'worlib': '',
  'worgame': '',
  'worphics': '',
  
  'worlib.zl': '',
  'worgame.zl': '',
  'worphics.zl': '',

  'worlib_docs' : 'WDOCS.txt'
};

// Pretty display names shown in the listing
const DOC_LISTING = [
  { alias: 'math.zl',    file: 'math.zl.txt',              note: 'Mathematics — factorial, primes, matrices, stats…'   },
  { alias: 'time.zl',    file: 'time.zl.txt',              note: 'Time & date — now, formatTime, timerStart…'          },
  { alias: 'net.zl',     file: 'net.zl.txt',               note: 'Network — fetchText, fetchJSON, fetchCSV…'           },
  { alias: 'convert.zl', file: 'convet.zl.txt',            note: 'Unit conversion — cToF, kmToMiles, kgToLbs…'        },
  { alias: 'random.zl',  file: 'random.zl.txt',            note: 'Randomness — uuid, shuffle, pick, dice…'            },
  { alias: 'str.zl',     file: 'str.zl.txt',               note: 'String utils — titleCase, camelCase, wordWrap…'      },
  { alias: 'algo.zl',    file: 'algo.zl.txt',              note: 'Algorithms — Stack, Queue, Graph, sorts…'           },
  { alias: 'gui.zl',     file: 'GUI_DOCUMENTATION.txt',    note: 'GUI — Window, Scene, Button, Label  (Electron)'     },
  { alias: 'threeD.zl',  file: 'THREED_DOCUMENTATION.txt', note: '3D graphics — Forge3D, tdCube, tdCamera  (Electron)'},
  { alias: 'audio',      file: 'AUDIO_DOCUMENTATION.txt',  note: 'Audio — playSound, stopSound, setVolume, onBeat…'   },
  { alias: 'filesystem', file: 'fs_docs.txt',              note: 'Official File System Library of ZPP'                },
  { alias: 'camera',     file: 'CAMERA_DOCUMENTATION.txt', note: 'Camera — openCamera, snapshot, videoStream…'        },
  { alias: 'ascii',      file: 'ASCII_DOCUMENTATION.txt',  note: 'ASCII art — asciiArt, boxDraw, banner, gradient…'   },
  { alias: 'textloader', file: 'TEXTLOADER_DOCUMENTATION.txt', note: 'Text loader — loadTxt, loadCSV, loadLines…'     },
  { alias: 'core',       file: 'core.txt',                 note: 'Core built-ins (IO, math, strings, arrays)'         },
  { alias: 'manual',     file: 'MANUAL_DOCS.txt',          note: 'Complete ZETA++ language manual'                    },
  { alias: 'server.zl',    file: 'server.txt',note: 'Server Making & Routing'   },
  { alias: 'worlib.zl',  file: '', note: 'Secound GUI LIBRARY More Control ADVGUI' },
  { alias: 'worgame.zl',  file: '', note: 'Game Engine Library of worlib.zl' },
  { alias: 'worphisics.zl',  file: '', note: 'Phisics Engine Library of worlib.zl' },
  { alias: 'worlib_docs', file: 'worlib.txt', note: 'A combined note on worlib, type zeta docs worlib_docs'}
];

function showDocs(lib) {
  if (!lib) {
    // ── List all available docs ───────────────────────────────
    process.stdout.write('\n' + BOLD(CYAN('  ZETA++ Documentation')) + '\n');
    process.stdout.write(DIM('  ' + '─'.repeat(58)) + '\n');
    DOC_LISTING.forEach(({ alias, file }) => {
      const docPath = path.join(DOCS_DIR, file);
      const exists  = fs.existsSync(docPath);
      const status  = exists ? GREEN('✓') : DIM('–');
      const entry   = DOC_LISTING.find(d => d.alias === alias);
      process.stdout.write(
        `  ${status} ${GREEN(alias.padEnd(14))}  ${DIM((entry ? entry.note : '').padEnd(50))}  ${DIM('zeta docs ' + alias)}\n`
      );
    });
    process.stdout.write(DIM('  ' + '─'.repeat(58)) + '\n');
    process.stdout.write(DIM('  Usage: zeta docs <lib>   e.g. zeta docs math.zl\n\n'));
    return;
  }

  // ── Look up the doc file ──────────────────────────────────
  const key      = lib.toLowerCase().replace(/^threed\.zl$/, 'threed.zl');
  const fileName = DOC_FILES[key] || DOC_FILES[key.replace(/\.zl$/, '')];

  if (!fileName) {
    process.stderr.write(RED(`No docs found for "${lib}".\n`));
    process.stderr.write(DIM('Run `zeta docs` to list all available documentation.\n'));
    process.exit(1);
  }

  const docPath = path.join(DOCS_DIR, fileName);

  if (!fs.existsSync(docPath)) {
    process.stderr.write(RED(`Docs file not found: "${fileName}"\n`));
    process.stderr.write(DIM(`Expected at: ${docPath}\n`));
    process.exit(1);
  }

  // ── Stream the file straight to stdout ───────────────────
  try {
    const content = fs.readFileSync(docPath, 'utf8');
    process.stdout.write('\n');
    process.stdout.write(content);
    // Ensure a trailing newline
    if (!content.endsWith('\n')) process.stdout.write('\n');
    process.stdout.write('\n');
  } catch (e) {
    process.stderr.write(RED(`Error reading docs: ${e.message}\n`));
    process.exit(1);
  }
}

// ============================================================
//  NEW COMMAND: zeta snippet [topic]
//  Prints a short, runnable ZETA++ snippet for a given topic.
//  `zeta snippet` alone lists all available topics.
// ============================================================
const SNIPPETS = {
  hello:   { title: 'Hello World',           code: `print("Hello, World!");\n` },
  input:   { title: 'User Input',            code: `str name = input("Your name: ");\nprint("Hi, " + name + "!");\n` },
  if:      { title: 'If / Else',             code: `num x = 10;\nif x > 5 {\n  print("big");\n} else {\n  print("small");\n}\n` },
  for:     { title: 'For Loop',              code: `for i = 1 to 5 {\n  print(i);\n}\n` },
  while:   { title: 'While Loop',            code: `num n = 5;\nwhile n > 0 {\n  print(n);\n  n--;\n}\n` },
  foreach: { title: 'For Each',              code: `list fruits = ["apple", "banana", "cherry"];\nfor each fruit in fruits {\n  print(fruit);\n}\n` },
  func:    { title: 'Functions',             code: `func add(a, b) {\n  return a + b;\n}\nprint(add(3, 4));\n` },
  lambda:  { title: 'Lambda',               code: `let square = fn(n) => n * n;\nprint(square(5));\n` },
  struct:  { title: 'Struct',               code: `struct Point {\n  num x;\n  num y;\n}\nPoint p;\np.x = 3;\np.y = 4;\nprint(p.x + ", " + p.y);\n` },
  match:   { title: 'Match',               code: `num day = 2;\nmatch day {\n  on 1 => { print("Mon"); }\n  on 2 => { print("Tue"); }\n  else  => { print("Other"); }\n}\n` },
  try:     { title: 'Try / Catch',          code: `attempt {\n  raise "something went wrong";\n} rescue e {\n  print("Caught: " + e);\n}\n` },
  ternary: { title: 'Ternary (when/then)',  code: `num x = 7;\nstr result = when x > 5 then "big" else "small";\nprint(result);\n` },
  list:    { title: 'Lists',               code: `list nums = [1, 2, 3, 4, 5];\nnums.push(6);\nprint(nums.length);\nprint(nums[0]);\n` },
  map:     { title: 'Maps',               code: `map person = { "name": "Alice", "age": 30 };\nprint(person["name"]);\nperson["city"] = "NYC";\nprint(person["city"]);\n` },
  import:  { title: 'Importing Libraries', code: `#import["math.zl"];\n\nprint(factorial(5));\nprint(isPrime(17));\n` },
  ml:      { title: 'ML — Linear Regression', code: `#import["ml.zl"];\n\nlist X = [[1],[2],[3],[4],[5]];\nlist y = [2, 4, 6, 8, 10];\nnum model = LinearRegression();\nmodel.fit(X, y);\nprint(model.predict([[6]]));\n` },
  algo:    { title: 'Stack (algo.zl)',     code: `#import["algo.zl"];\n\nnum s = makeStack();\ns.push(10);\ns.push(20);\ns.push(30);\nprint(s.pop());\nprint(s.peek());\n` },
  random:  { title: 'Random (random.zl)', code: `#import["random.zl"];\n\nlist items = ["rock", "paper", "scissors"];\nprint(pick(items));\nprint(dice(6));\nprint(uuid());\n` },
};

function showSnippet(topic) {
  if (!topic) {
    process.stdout.write('\n' + BOLD(CYAN('  Available Snippets')) + '\n');
    process.stdout.write(DIM('  ' + '─'.repeat(44)) + '\n');
    Object.entries(SNIPPETS).forEach(([k, v]) =>
      process.stdout.write(`  ${GREEN(k.padEnd(12))}  ${DIM(v.title)}\n`)
    );
    process.stdout.write(DIM('  ' + '─'.repeat(44)) + '\n');
    process.stdout.write(DIM('\n  Usage: zeta snippet <topic>   e.g. zeta snippet struct\n\n'));
    return;
  }

  const s = SNIPPETS[topic.toLowerCase()];
  if (!s) {
    process.stderr.write(RED(`No snippet found for "${topic}".\n`));
    process.stderr.write(DIM('Run `zeta snippet` to list all topics.\n'));
    process.exit(1);
  }

  process.stdout.write('\n' + '  ' + BOLD(CYAN(s.title)) + '\n');
  process.stdout.write(DIM('  ' + '─'.repeat(44)) + '\n');
  s.code.split('\n').forEach(line =>
    process.stdout.write('  ' + MAGENTA(line) + '\n')
  );
  process.stdout.write(DIM('  ' + '─'.repeat(44)) + '\n');
  process.stdout.write(DIM('  Save to a file and run with: ') + GREEN('zeta run <file.zpp>') + '\n\n');
}

// ── REPL — interactive prompt ─────────────────────────────────
function startREPL() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
    prompt: CYAN('zeta> '),
  });

  process.stdout.write(
    BOLD(CYAN('\nZETA++ Interactive REPL')) +
    DIM(` ${LANG_VER}`) + '\n' +
    DIM('  Type .help for commands, .exit to quit, or any ZETA++ code.\n') +
    DIM('  Multi-line: end a line with \\ to continue.\n\n')
  );

  const interp = new Interpreter({ sink: process.stdout });
  let multiLine = '';

  rl.prompt();

  rl.on('line', (line) => {
    const trimmed = line.trim();

    if (trimmed === '.exit' || trimmed === '.quit') {
      process.stdout.write(DIM('Goodbye!\n'));
      process.exit(0);
    }
    if (trimmed === '.help') {
      printHelp();
      rl.prompt();
      return;
    }
    if (trimmed === '.clear') {
      interp.globalScope = interp._buildGlobals();
      interp.structs     = Object.create(null);
      process.stdout.write(DIM('Scope cleared.\n'));
      rl.prompt();
      return;
    }
    if (trimmed === '') {
      rl.prompt();
      return;
    }

    // Multi-line continuation
    if (line.endsWith('\\')) {
      multiLine += line.slice(0, -1) + '\n';
      process.stdout.write('... ');
      return;
    }

    const code = multiLine + line;
    multiLine  = '';

    try {
      const processed = interp._preprocess(code);
      const tokens    = interp.tokenize(processed);
      const ast       = interp.parse(tokens);
      interp._execBlock(ast.body, interp.globalScope);
    } catch (e) {
      process.stderr.write(formatError(e, null, code));
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.stdout.write('\n' + DIM('Goodbye!\n'));
    process.exit(0);
  });
}

// ── Entry point ───────────────────────────────────────────────
const args = process.argv.slice(2);
const cmd  = args[0];

switch (cmd) {

  // ── Existing commands ───────────────────────────────────────

  case 'run': {
    if (!args[1]) {
      process.stderr.write(RED('Error: No file specified.\n'));
      process.stderr.write(DIM('Usage: zeta run <file.zpp>\n'));
      process.exit(1);
    }
    runFile(args[1]);
    break;
  }

  case 'check': {
    if (!args[1]) {
      process.stderr.write(RED('Error: No file specified.\n'));
      process.stderr.write(DIM('Usage: zeta check <file.zpp>\n'));
      process.exit(1);
    }
    runFile(args[1], true);
    break;
  }

  case 'repl':
  case undefined: {
    startREPL();
    break;
  }

  case 'version':
  case '--version':
  case '-v': {
    process.stdout.write(
      `${BOLD(CYAN('Zeta'))} CLI ${VERSION}  |  ZETA++ Language ${LANG_VER}  |  Node.js ${process.version}\n`
    );
    break;
  }

  case '-u':
  case '--update':
  case '--u':
  case 'update': {
  const { execSync } = require('child_process');
  const projectPath = String.raw`C:\Users\SABIK KUNDU\desktop\zeta\zeta`;

  process.stdout.write(CYAN('[zeta] ') + DIM('Reinstalling CLI from source…\n'));

  try {
    execSync('npm install -g .', {
      cwd: projectPath,
      stdio: 'inherit',
      shell: 'powershell.exe',
    });
    process.stdout.write(GREEN('✓ Zeta CLI updated successfully.\n'));
  } catch (e) {
    process.stderr.write(RED('Update failed.\n'));
    process.exit(1);
  }
  break;
}

  case 'help':
  case '--help':
  case '-h': {
    printHelp();
    break;
  }

  case 'creator': {
    process.stdout.write(DIM('-LUCIFER-\n'));
    break;
  }

  // ── NEW: Developer workflow ─────────────────────────────────

  case 'watch': {
    if (!args[1]) {
      process.stderr.write(RED('Error: No file specified.\n'));
      process.stderr.write(DIM('Usage: zeta watch <file.zpp>\n'));
      process.exit(1);
    }
    watchFile(args[1]);
    break;
  }

  case 'bench': {
    if (!args[1]) {
      process.stderr.write(RED('Error: No file specified.\n'));
      process.stderr.write(DIM('Usage: zeta bench <file.zpp> [--runs N]\n'));
      process.exit(1);
    }
    // Parse optional --runs N flag
    let runs = 10;
    const runsIdx = args.indexOf('--runs');
    if (runsIdx !== -1 && args[runsIdx + 1]) {
      runs = parseInt(args[runsIdx + 1], 10);
      if (isNaN(runs) || runs < 1) {
        process.stderr.write(RED('Error: --runs must be a positive integer.\n'));
        process.exit(1);
      }
    }
    benchFile(args[1], runs);
    break;
  }

  case 'stats': {
    if (!args[1]) {
      process.stderr.write(RED('Error: No file specified.\n'));
      process.stderr.write(DIM('Usage: zeta stats <file.zpp>\n'));
      process.exit(1);
    }
    statsFile(args[1]);
    break;
  }

  case 'appify': {
    if (!args[1]) {
      process.stderr.write(RED('Error: No file specified.\n'));
      process.stderr.write(DIM('Usage: zeta appify <file.zpp> [--name AppName] [--output dir]\n'));
      process.exit(1);
    }
    // Parse optional flags
    const appOpts = {};
    const nameIdx = args.indexOf('--name');
    if (nameIdx !== -1 && args[nameIdx + 1]) appOpts.name   = args[nameIdx + 1];
    const outIdx  = args.indexOf('--output');
    if (outIdx  !== -1 && args[outIdx  + 1]) appOpts.output = args[outIdx  + 1];
    appifyFile(args[1], appOpts);
    break;
  }

  // ── NEW: Project scaffolding ────────────────────────────────

  case 'new': {
    // Parse optional --template <name> flag
    let template = 'blank';
    const tplIdx = args.indexOf('--template');
    if (tplIdx !== -1 && args[tplIdx + 1]) {
      template = args[tplIdx + 1];
    }
    newProject(args[1], template);
    break;
  }

  case 'init': {
    initProject();
    break;
  }

  // ── NEW: Docs & discovery ───────────────────────────────────

  case 'docs': {
    showDocs(args[1]); // args[1] may be undefined → shows list
    break;
  }

  case 'snippet': {
    showSnippet(args[1]); // args[1] may be undefined → shows list
    break;
  }

  // ── Fallback: treat bare .zpp paths as `zeta run` ───────────

  default: {
    if (cmd.endsWith('.zpp') || fs.existsSync(path.resolve(cmd))) {
      runFile(cmd);
    } else {
      process.stderr.write(RED(`Unknown command: "${cmd}"\n`));
      process.stderr.write(DIM('Run `zeta help` for usage.\n'));
      process.exit(1);
    }
  }
}