#!/usr/bin/env node
'use strict';

// ============================================================
//  appify.js  —  zeta appify <file.zpp>
//  Converts any .zpp file into a shareable, double-clickable
//  app bundle that works on macOS, Windows, and Linux.
//
//  Output layout:
//    <AppName>.zapp/
//      <file>.zpp          ← original source (copied)
//      <AppName>.command   ← macOS  double-click launcher
//      <AppName>.bat       ← Windows double-click launcher
//      <AppName>.sh        ← Linux  shell launcher
//      <AppName>.desktop   ← Linux  desktop entry
//      README.txt          ← instructions for the recipient
// ============================================================

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── ANSI helpers (self-contained; no import from zeta.js) ────
const BOLD    = s => `\x1b[1m${s}\x1b[0m`;
const RED     = s => `\x1b[31m${s}\x1b[0m`;
const GREEN   = s => `\x1b[32m${s}\x1b[0m`;
const YELLOW  = s => `\x1b[33m${s}\x1b[0m`;
const CYAN    = s => `\x1b[36m${s}\x1b[0m`;
const DIM     = s => `\x1b[2m${s}\x1b[0m`;
const MAGENTA = s => `\x1b[35m${s}\x1b[0m`;

// ── Detect GUI vs CLI script ──────────────────────────────────
function isGuiScript(code) {
  return /#import\s*\[\s*["']gui\.zl["']\s*\]/.test(code) ||
         /#import\s*\[\s*["']threeD\.zl["']\s*\]/.test(code);
}

// ── Platform launcher templates ───────────────────────────────

function macLauncherScript(zppFile, appName, isGui) {
  return `#!/bin/bash
# ──────────────────────────────────────────────
#  ${appName} — ZETA++ App  (macOS launcher)
#  Double-click this file to run your app.
# ──────────────────────────────────────────────
cd "$(dirname "$0")"

# Check that zeta is installed
if ! command -v zeta &>/dev/null; then
  osascript -e 'display alert "Zeta not installed" message "Please install Zeta first:\\n  npm install -g zeta-lang" as warning'
  echo ""
  echo "  Zeta is not installed."
  echo "  Run: npm install -g zeta-lang"
  echo ""
  read -rp "Press Enter to close…"
  exit 1
fi
${isGui ? `
# Check that electron is installed
if ! command -v electron &>/dev/null; then
  osascript -e 'display alert "Electron not installed" message "This is a GUI app. Please install Electron:\\n  npm install -g electron" as warning'
  echo ""
  echo "  Electron is not installed."
  echo "  Run: npm install -g electron"
  echo ""
  read -rp "Press Enter to close…"
  exit 1
fi
` : ''}
zeta run "${zppFile}"
${isGui ? '' : 'echo ""\nread -rp "Press Enter to close…"'}
`;
}

function winLauncherScript(zppFile, appName, isGui) {
  return `@echo off
REM ──────────────────────────────────────────────────────────
REM  ${appName} — ZETA++ App  (Windows launcher)
REM  Double-click this file to run your app.
REM ──────────────────────────────────────────────────────────
cd /d "%~dp0"

where zeta >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  Zeta is not installed.
    echo  Run:  npm install -g zeta-lang
    echo.
    pause
    exit /b 1
)
${isGui ? `
where electron >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  Electron is not installed ^(required for GUI apps^).
    echo  Run:  npm install -g electron
    echo.
    pause
    exit /b 1
)
` : ''}
zeta run "${zppFile}"
${isGui ? '' : 'echo.\npause'}
`;
}

function linuxLauncherScript(zppFile, appName, isGui) {
  return `#!/bin/bash
# ──────────────────────────────────────────────
#  ${appName} — ZETA++ App  (Linux launcher)
#  chmod +x ${appName}.sh  then  ./${appName}.sh
# ──────────────────────────────────────────────
cd "$(dirname "$0")"

if ! command -v zeta &>/dev/null; then
  echo ""
  echo "  Error: Zeta is not installed."
  echo "  Run:   npm install -g zeta-lang"
  echo ""
  exit 1
fi
${isGui ? `
if ! command -v electron &>/dev/null; then
  echo ""
  echo "  Error: Electron is not installed (required for GUI apps)."
  echo "  Run:   npm install -g electron"
  echo ""
  exit 1
fi
` : ''}
zeta run "${zppFile}"
${isGui ? '' : '\necho ""\nread -rp "Press Enter to close…"'}
`;
}

function linuxDesktopEntry(zppFile, appName, outputDir, isGui) {
  return `[Desktop Entry]
Version=1.0
Type=Application
Name=${appName}
Comment=ZETA++ Application
Exec=bash -c 'cd "${outputDir}" && bash "${appName}.sh"'
Terminal=${isGui ? 'false' : 'true'}
Categories=Application;
StartupNotify=true
`;
}

function readmeText(zppFile, appName, isGui) {
  const guiNote = isGui
    ? `\nNOTE: This is a GUI app — it requires Electron to be installed.\n      npm install -g electron\n`
    : '';

  return `ZETA++ App — ${appName}
${'═'.repeat(50)}

Packaged with : zeta appify
Source file   : ${zppFile}
App type      : ${isGui ? 'GUI  (opens an Electron window)' : 'CLI  (runs in your terminal)'}
${guiNote}
HOW TO RUN
──────────
  macOS   →  Double-click   ${appName}.command
  Windows →  Double-click   ${appName}.bat
  Linux   →  Double-click   ${appName}.desktop
              or in terminal: bash ${appName}.sh

REQUIREMENTS (must be installed on the recipient's machine)
────────────────────────────────────────────────────────────
  Node.js   https://nodejs.org
  Zeta CLI  npm install -g zeta-lang
${isGui ? '  Electron  npm install -g electron\n' : ''}
Share the entire folder — all launchers must stay alongside
the .zpp file and each other.

──────────────────────────────────────────────────────────────
Built with ZETA++  ·  github.com/your-repo/zeta
`;
}

// ── Main entry point ──────────────────────────────────────────

/**
 * appifyFile(filePath, opts)
 *
 * opts.name    — override the app display name (default: stem of filePath)
 * opts.output  — override the output directory  (default: <name>.zapp)
 */
function appifyFile(filePath, opts = {}) {
  // ── 1. Validate input ───────────────────────────────────────
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

  // ── 2. Resolve names & paths ────────────────────────────────
  const stem      = path.basename(resolved, path.extname(resolved));
  const appName   = (opts.name || stem).replace(/[^\w\-. ]/g, '_'); // sanitise
  const zppFile   = path.basename(resolved);
  const outputDir = path.resolve(opts.output || (appName + '.zapp'));
  const isGui     = isGuiScript(code);

  // ── 3. Create output directory ──────────────────────────────
  try {
    fs.mkdirSync(outputDir, { recursive: true });
  } catch (e) {
    process.stderr.write(RED(`Error creating output directory: ${e.message}\n`));
    process.exit(1);
  }

  // ── 4. Copy source file ─────────────────────────────────────
  fs.copyFileSync(resolved, path.join(outputDir, zppFile));

  // ── 5. macOS launcher (.command) ────────────────────────────
  const macPath = path.join(outputDir, appName + '.command');
  fs.writeFileSync(macPath, macLauncherScript(zppFile, appName, isGui), 'utf8');
  try { fs.chmodSync(macPath, 0o755); } catch (_) {}   // make executable

  // ── 6. Windows launcher (.bat) ──────────────────────────────
  fs.writeFileSync(
    path.join(outputDir, appName + '.bat'),
    winLauncherScript(zppFile, appName, isGui),
    'utf8'
  );

  // ── 7. Linux shell launcher (.sh) ───────────────────────────
  const linuxPath = path.join(outputDir, appName + '.sh');
  fs.writeFileSync(linuxPath, linuxLauncherScript(zppFile, appName, isGui), 'utf8');
  try { fs.chmodSync(linuxPath, 0o755); } catch (_) {}

  // ── 8. Linux desktop entry (.desktop) ───────────────────────
  fs.writeFileSync(
    path.join(outputDir, appName + '.desktop'),
    linuxDesktopEntry(zppFile, appName, outputDir, isGui),
    'utf8'
  );

  // ── 9. README ────────────────────────────────────────────────
  fs.writeFileSync(
    path.join(outputDir, 'README.txt'),
    readmeText(zppFile, appName, isGui),
    'utf8'
  );

  // ── 10. Pretty summary ───────────────────────────────────────
  const relOut = path.relative(process.cwd(), outputDir) || outputDir;

  process.stdout.write('\n');
  process.stdout.write(CYAN('╭─ ') + BOLD(GREEN('App packaged successfully!')) + '\n');
  process.stdout.write(CYAN('│\n'));
  process.stdout.write(CYAN('│  ') + DIM('Output    ') + BOLD(CYAN(relOut + path.sep)) + '\n');
  process.stdout.write(CYAN('│  ') + DIM('Source    ') + zppFile + '\n');
  process.stdout.write(CYAN('│  ') + DIM('App type  ') + (isGui ? YELLOW('GUI  (Electron window)') : GREEN('CLI  (terminal)')) + '\n');
  process.stdout.write(CYAN('│\n'));
  process.stdout.write(CYAN('│  ') + BOLD('Files inside ') + BOLD(CYAN(relOut + path.sep)) + '\n');

  const files = [
    [appName + '.command', 'macOS  double-click launcher'],
    [appName + '.bat',     'Windows double-click launcher'],
    [appName + '.sh',      'Linux  shell launcher'],
    [appName + '.desktop', 'Linux  desktop entry'],
    [zppFile,              'ZETA++ source'],
    ['README.txt',         'instructions for recipients'],
  ];
  for (const [f, note] of files) {
    process.stdout.write(CYAN('│    ') + GREEN('✓') + '  ' + f.padEnd(28) + DIM(note) + '\n');
  }

  process.stdout.write(CYAN('│\n'));
  process.stdout.write(
    CYAN('│  ') + DIM('Zip ') + BOLD(relOut + path.sep) +
    DIM(' and share it — that\'s all!\n')
  );
  process.stdout.write(
    CYAN('│  ') + DIM('Recipients need: ') + GREEN('npm install -g zeta-lang') + '\n'
  );
  if (isGui) {
    process.stdout.write(
      CYAN('│  ') + DIM('And also:        ') + GREEN('npm install -g electron') + '\n'
    );
  }
  process.stdout.write(CYAN('╰' + '─'.repeat(52)) + '\n\n');
}

module.exports = { appifyFile };
