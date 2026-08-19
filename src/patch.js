/**
 * patch2.js — robustly rewrites the Login Success block in server.js
 * Run with:  node patch2.js
 */

const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'server.js');

if (!fs.existsSync(FILE)) {
  console.error('ERROR: server.js not found next to this script.');
  console.error('Make sure patch2.js is in: C:\\Users\\SABIK KUNDU\\desktop\\zeta\\zeta\\src\\');
  process.exit(1);
}

let src = fs.readFileSync(FILE, 'utf8');

// ── Backup ─────────────────────────────────────────────────────────────────────
fs.writeFileSync(FILE + '.bak2', src);
console.log('Backup saved: server.js.bak2');

// ── The correct Login Success block (no _mc_write_varint(0) for 1.16.x) ────────
const CORRECT = `
    // Build Login Success
    const uuidStr  = _mcOfflineUUID(player.username);
    const uuidHex  = uuidStr.replace(/-/g, '');
    const uuidBuf  = Buffer.from(uuidHex, 'hex');

    let loginBuf;
    if (player.protocol >= 735) {
      // 1.16 – 1.18.2: raw 16-byte UUID + username string.
      // Properties VarInt was only added in 1.19 (protocol 759+).
      const parts = [uuidBuf, _mc_write_string(player.username)];
      if (player.protocol >= 759) parts.push(_mc_write_varint(0));
      loginBuf = Buffer.concat(parts);
    } else {
      // Pre-1.16: UUID as dashed string, then username
      loginBuf = Buffer.concat([
        _mc_write_string(uuidStr),
        _mc_write_string(player.username),
      ]);
    }
`;

// ── Match everything between the two stable anchors ────────────────────────────
//   Anchor start : _emit(s, 'login', player);
//   Anchor end   : player.socket.write(_mc_make_packet(0x02, loginBuf));
//
//   We replace everything BETWEEN those two lines (exclusive).

const ANCHOR_START = `_emit(s, 'login', player);`;
const ANCHOR_END   = `player.socket.write(_mc_make_packet(0x02, loginBuf));`;

const idxStart = src.indexOf(ANCHOR_START);
const idxEnd   = src.indexOf(ANCHOR_END);

if (idxStart === -1) {
  console.error("ERROR: Could not find anchor: " + ANCHOR_START);
  process.exit(1);
}
if (idxEnd === -1) {
  console.error("ERROR: Could not find anchor: " + ANCHOR_END);
  process.exit(1);
}
if (idxEnd <= idxStart) {
  console.error("ERROR: Anchors found in wrong order.");
  process.exit(1);
}

// Slice: keep everything up to and including ANCHOR_START,
//        insert CORRECT block,
//        then continue from ANCHOR_END onward.
const before = src.slice(0, idxStart + ANCHOR_START.length);
const after  = src.slice(idxEnd);

const result = before + '\n' + CORRECT + '\n    ' + after;

fs.writeFileSync(FILE, result);
console.log('Patched: Login Success block rewritten.');

// ── Verify ─────────────────────────────────────────────────────────────────────
const verify = fs.readFileSync(FILE, 'utf8');

// Check the varint(0) is now only inside the protocol >= 759 guard
const lines = verify.split('\n');
let inGuard = false;
let violation = false;
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (l.includes('protocol >= 759')) inGuard = true;
  if (inGuard && l.includes('_mc_write_varint(0)')) { inGuard = false; continue; }
  if (!inGuard && l.includes('_mc_write_varint(0)')) {
    console.error('WARNING: _mc_write_varint(0) still present outside guard at line ' + (i+1));
    violation = true;
  }
}

if (!violation) {
  console.log('Verified OK — _mc_write_varint(0) is safely guarded.');
  console.log('\nNow run:  zpp server.zpp\n');
} else {
  console.error('Verification failed. Restoring backup...');
  fs.writeFileSync(FILE, src);
}