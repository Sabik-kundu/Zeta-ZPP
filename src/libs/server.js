(function ServerLib() {
'use strict';

// ── Node.js module imports (soft — won't crash if unavailable) ────────────────
let http, https, net, dgram, fs, pathMod, urlMod, crypto;

try { http    = require('http');   } catch(e) { http    = null; }
try { https   = require('https');  } catch(e) { https   = null; }
try { net     = require('net');    } catch(e) { net     = null; }
try { dgram   = require('dgram'); } catch(e) { dgram   = null; }
try { fs      = require('fs');     } catch(e) { fs      = null; }
try { pathMod = require('path');   } catch(e) { pathMod = null; }
try { urlMod  = require('url');    } catch(e) { urlMod  = null; }
try { crypto  = require('crypto'); } catch(e) { crypto  = null; }

// ── MIME type lookup table ────────────────────────────────────────────────────
const _MIME = {
  '.html' : 'text/html; charset=utf-8',
  '.htm'  : 'text/html; charset=utf-8',
  '.css'  : 'text/css; charset=utf-8',
  '.js'   : 'application/javascript; charset=utf-8',
  '.mjs'  : 'application/javascript; charset=utf-8',
  '.json' : 'application/json; charset=utf-8',
  '.txt'  : 'text/plain; charset=utf-8',
  '.md'   : 'text/plain; charset=utf-8',
  '.xml'  : 'application/xml',
  '.svg'  : 'image/svg+xml',
  '.png'  : 'image/png',
  '.jpg'  : 'image/jpeg',
  '.jpeg' : 'image/jpeg',
  '.gif'  : 'image/gif',
  '.webp' : 'image/webp',
  '.ico'  : 'image/x-icon',
  '.pdf'  : 'application/pdf',
  '.woff' : 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf'  : 'font/ttf',
  '.otf'  : 'font/otf',
  '.mp3'  : 'audio/mpeg',
  '.wav'  : 'audio/wav',
  '.ogg'  : 'audio/ogg',
  '.mp4'  : 'video/mp4',
  '.webm' : 'video/webm',
  '.zip'  : 'application/zip',
  '.gz'   : 'application/gzip',
};

// ═════════════════════════════════════════════════════════════════════════════
//  INTERNAL HELPERS
// ═════════════════════════════════════════════════════════════════════════════

function _mimeFor(filePath) {
  if (!pathMod) return 'application/octet-stream';
  const ext = pathMod.extname(filePath).toLowerCase();
  return _MIME[ext] || 'application/octet-stream';
}

// Read full request body into a Buffer promise
function _readBodyPromise(req) {
  return new Promise(function(resolve, reject) {
    const chunks = [];
    req.on('data',  function(chunk) { chunks.push(chunk); });
    req.on('end',   function()      { resolve(Buffer.concat(chunks)); });
    req.on('error', function(err)   { reject(err); });
  });
}

// Parse a URL query string into a plain object
function _parseQuery(raw) {
  if (!raw) return {};
  const out = {};
  String(raw).replace(/^\?/, '').split('&').forEach(function(pair) {
    if (!pair) return;
    const eq  = pair.indexOf('=');
    const k   = eq >= 0 ? pair.slice(0, eq) : pair;
    const v   = eq >= 0 ? pair.slice(eq + 1) : '';
    try { out[decodeURIComponent(k)] = decodeURIComponent(v); }
    catch(e) { out[k] = v; }
  });
  return out;
}

// Match a route pattern (with :params) against a URL pathname
function _matchRoute(pattern, pathname) {
  const patParts = pattern.split('/');
  const urlParts = pathname.split('/');
  if (patParts.length !== urlParts.length) return { matched: false };
  const params = {};
  for (let i = 0; i < patParts.length; i++) {
    const seg = patParts[i];
    if (seg.startsWith(':')) {
      params[seg.slice(1)] = decodeURIComponent(urlParts[i] || '');
    } else if (seg !== urlParts[i]) {
      return { matched: false };
    }
  }
  return { matched: true, params };
}

// Emit a server-level event to all registered handlers
function _emit(s, event) {
  const args     = Array.prototype.slice.call(arguments, 2);
  const handlers = (s._events && s._events[event]) || [];
  handlers.forEach(function(fn) {
    try { fn.apply(null, args); }
    catch(e) { console.error('[server.zl] Event "' + event + '" handler error:', e.message); }
  });
}

// Run an array of middleware functions sequentially, then call done()
function _runMiddlewareChain(middlewares, req, res, done) {
  let idx = 0;
  function next() {
    if (res._sent) return;
    if (idx < middlewares.length) {
      const mw = middlewares[idx++];
      try { mw(req, res, next); }
      catch(e) {
        console.error('[server.zl] Middleware error:', e.message);
        if (!res._sent) _send(res, 500, 'Middleware error: ' + e.message);
      }
    } else {
      done();
    }
  }
  next();
}

// Generate a short unique id
function _uid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ═════════════════════════════════════════════════════════════════════════════
//  MINECRAFT PROTOCOL HELPERS  (internal + exported)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Write a Minecraft VarInt to a Buffer.
 * VarInts are variable-length 1–5 byte integers used in the MC protocol.
 */
function _mc_write_varint(val) {
  const bytes = [];
  val = val >>> 0;                  // treat as unsigned 32-bit
  do {
    let b = val & 0x7F;
    val >>>= 7;
    if (val !== 0) b |= 0x80;
    bytes.push(b);
  } while (val !== 0);
  return Buffer.from(bytes);
}

/**
 * Read a Minecraft VarInt from a buffer at a given offset.
 * Returns { value, offset } on success, or null if incomplete.
 */
function _mc_read_varint(buf, offset) {
  let result = 0, shift = 0, b, pos = offset || 0;
  do {
    if (pos >= buf.length) return null;   // incomplete — need more data
    b = buf[pos++];
    result |= (b & 0x7F) << shift;
    shift += 7;
    if (shift > 35) return null;          // malformed
  } while (b & 0x80);
  return { value: result, offset: pos };
}

/**
 * Write a Minecraft-protocol string: VarInt(byteLength) + UTF-8 bytes.
 */
function _mc_write_string(str) {
  const bytes = Buffer.from(str || '', 'utf8');
  return Buffer.concat([_mc_write_varint(bytes.length), bytes]);
}

/**
 * Read a Minecraft-protocol string from buf at offset.
 * Returns { value, offset } on success, or null if incomplete.
 */
function _mc_read_string(buf, offset) {
  const len = _mc_read_varint(buf, offset);
  if (!len) return null;
  if (len.offset + len.value > buf.length) return null;
  const str = buf.slice(len.offset, len.offset + len.value).toString('utf8');
  return { value: str, offset: len.offset + len.value };
}

/**
 * _mc_make_packet(packetId, data?)
 * Build a VarInt-length-prefixed Minecraft packet.
 * data should be a Buffer of the packet payload (not including the packet ID).
 *
 * Example:
 *   // Status response
 *   let pkt = _mc_make_packet(0x00, _mc_write_string(JSON.stringify(statusObj)));
 *   player.socket.write(pkt);
 */
function _mc_make_packet(packetId, data) {
  const idBuf  = _mc_write_varint(packetId);
  const payload = data ? Buffer.concat([idBuf, data]) : idBuf;
  const lenBuf  = _mc_write_varint(payload.length);
  return Buffer.concat([lenBuf, payload]);
}

/**
 * _mc_parse_packet(buf)
 * Try to extract one complete VarInt-framed Minecraft packet from a buffer.
 * Returns { id, data, remaining } on success, or null if the buffer is incomplete.
 *
 * Example:
 *   _on(s, "rawbuf", fn(player, buf) {
 *     let pkt = _mc_parse_packet(buf);
 *     if (pkt) { _log("Packet id: " + pkt.id); }
 *   });
 */
function _mc_parse_packet(buf) {
  const lenInfo = _mc_read_varint(buf, 0);
  if (!lenInfo) return null;
  const { value: packetLen, offset: headerLen } = lenInfo;
  if (headerLen + packetLen > buf.length) return null;    // not enough data yet

  const packetBuf = buf.slice(headerLen, headerLen + packetLen);
  const idInfo    = _mc_read_varint(packetBuf, 0);
  if (!idInfo) return null;

  return {
    id        : idInfo.value,
    data      : packetBuf.slice(idInfo.offset),
    remaining : buf.slice(headerLen + packetLen),
  };
}

// ── Generate offline UUID for a username (matches vanilla offline-mode UUID) ──
function _mcOfflineUUID(username) {
  if (crypto) {
    const hash = crypto.createHash('md5')
      .update('OfflinePlayer:' + username)
      .digest('hex');
    const a = hash.split('');
    a[12] = '3';
    a[16] = ((parseInt(a[16], 16) & 0x3) | 0x8).toString(16);
    return a[0]+a[1]+a[2]+a[3]+a[4]+a[5]+a[6]+a[7]+'-'+
           a[8]+a[9]+a[10]+a[11]+'-'+
           a[12]+a[13]+a[14]+a[15]+'-'+
           a[16]+a[17]+a[18]+a[19]+'-'+
           a[20]+a[21]+a[22]+a[23]+a[24]+a[25]+a[26]+a[27]+a[28]+a[29]+a[30]+a[31];
  }
  return 'xxxxxxxx-xxxx-3xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  MINIMAL NBT WRITER  (private — used to build Minecraft dimension codec)
// ─────────────────────────────────────────────────────────────────────────────

function _nbtTag(type, name, valueBytes) {
  const n = Buffer.from(name, 'utf8');
  const h = Buffer.alloc(3 + n.length);
  h[0] = type;
  h.writeUInt16BE(n.length, 1);
  n.copy(h, 3);
  return Buffer.concat([h, valueBytes]);
}
function _nbtEnd()           { return Buffer.from([0x00]); }
function _nbtByte(nm, v)     { return _nbtTag(1, nm, Buffer.from([v & 0xFF])); }
function _nbtInt(nm, v)      { const b = Buffer.alloc(4); b.writeInt32BE(v);  return _nbtTag(3, nm, b); }
function _nbtFloat(nm, v)    { const b = Buffer.alloc(4); b.writeFloatBE(v);  return _nbtTag(5, nm, b); }
function _nbtDouble(nm, v)   { const b = Buffer.alloc(8); b.writeDoubleBE(v); return _nbtTag(6, nm, b); }
function _nbtStr(nm, v)      {
  const vb = Buffer.from(v, 'utf8'), lb = Buffer.alloc(2);
  lb.writeUInt16BE(vb.length); return _nbtTag(8, nm, Buffer.concat([lb, vb]));
}
function _nbtCompound(nm) {
  const children = Array.prototype.slice.call(arguments, 1);
  const n = Buffer.from(nm, 'utf8');
  const h = Buffer.alloc(3 + n.length);
  h[0] = 10; h.writeUInt16BE(n.length, 1); n.copy(h, 3);
  return Buffer.concat([h].concat(children).concat([_nbtEnd()]));
}
// Anonymous compound payload for TAG_List<Compound> items (no type byte / name)
function _nbtAnonCompound() {
  const children = Array.prototype.slice.call(arguments);
  return Buffer.concat(children.concat([_nbtEnd()]));
}
// TAG_List of TAG_String items
function _nbtListStr(nm, items) {
  const n = Buffer.from(nm, 'utf8');
  const h = Buffer.alloc(3 + n.length + 1 + 4);
  let o = 0;
  h[o++] = 9; h.writeUInt16BE(n.length, o); o += 2;
  n.copy(h, o); o += n.length;
  h[o++] = 8;                              // element type = TAG_String
  h.writeInt32BE(items.length, o);
  const parts = [h];
  items.forEach(function(sv) {
    const sb = Buffer.from(sv, 'utf8');
    const lb = Buffer.alloc(2); lb.writeUInt16BE(sb.length);
    parts.push(Buffer.concat([lb, sb]));
  });
  return Buffer.concat(parts);
}
// TAG_Long
function _nbtLong(nm, hi, lo) {
  const b = Buffer.alloc(8);
  b.writeInt32BE(hi >>> 0, 0);
  b.writeInt32BE(lo >>> 0, 4);
  return _nbtTag(4, nm, b);
}
// TAG_List of TAG_Compound items
function _nbtListCompounds(nm, items) {
  const n = Buffer.from(nm, 'utf8');
  const h = Buffer.alloc(3 + n.length + 1 + 4);
  let o = 0;
  h[o++] = 9; h.writeUInt16BE(n.length, o); o += 2;
  n.copy(h, o); o += n.length;
  h[o++] = 10;                                  // element type = TAG_Compound
  h.writeInt32BE(items.length, o);
  return Buffer.concat([h].concat(items));
}

// ── Build dimension + biome + chat_type codec NBT for 1.19–1.20.1 (proto 759–763) ──
function _buildCodec1_19() {
  const dimEntry = _nbtAnonCompound(
    _nbtStr('name', 'minecraft:overworld'),
    _nbtInt('id', 0),
    _nbtCompound('element',
      _nbtByte('piglin_safe', 0),
      _nbtByte('natural', 1),
      _nbtFloat('ambient_light', 0.0),
      _nbtStr('infiniburn', 'minecraft:infiniburn_overworld'),
      _nbtByte('respawn_anchor_works', 0),
      _nbtByte('has_skylight', 1),
      _nbtByte('bed_works', 1),
      _nbtStr('effects', 'minecraft:overworld'),
      _nbtByte('has_raids', 1),
      _nbtInt('min_y', -64),
      _nbtInt('height', 384),
      _nbtInt('logical_height', 384),
      _nbtDouble('coordinate_scale', 1.0),
      _nbtByte('ultrawarm', 0),
      _nbtByte('has_ceiling', 0),
      _nbtInt('monster_spawn_light_level', 0),
      _nbtInt('monster_spawn_block_light_limit', 0)
    )
  );
  const biomeEntry = _nbtAnonCompound(
    _nbtStr('name', 'minecraft:plains'),
    _nbtInt('id', 0),
    _nbtCompound('element',
      _nbtStr('precipitation', 'none'),
      _nbtFloat('temperature', 0.8),
      _nbtFloat('downfall', 0.4),
      _nbtCompound('effects',
        _nbtInt('sky_color', 8364543),
        _nbtInt('water_fog_color', 329011),
        _nbtInt('fog_color', 12638463),
        _nbtInt('water_color', 4159204),
        _nbtCompound('mood_sound',
          _nbtInt('tick_delay', 6000),
          _nbtDouble('offset', 2.0),
          _nbtStr('sound', 'minecraft:ambient.cave'),
          _nbtInt('block_search_extent', 8)
        )
      )
    )
  );
  // chat_type registry — required from 1.19 onward
  const chatEntry = _nbtAnonCompound(
    _nbtStr('name', 'minecraft:chat'),
    _nbtInt('id', 0),
    _nbtCompound('element',
      _nbtCompound('chat',
        _nbtStr('translation_key', 'chat.type.text'),
        _nbtListStr('parameters', ['sender', 'content'])
      ),
      _nbtCompound('narration',
        _nbtStr('translation_key', 'chat.type.text.narrate'),
        _nbtListStr('parameters', ['sender', 'content'])
      )
    )
  );
  return Buffer.concat([
    Buffer.from([0x0A, 0x00, 0x00]),
    _nbtCompound('minecraft:dimension_type',
      _nbtStr('type', 'minecraft:dimension_type'),
      _nbtListCompounds('value', [dimEntry])
    ),
    _nbtCompound('minecraft:worldgen/biome',
      _nbtStr('type', 'minecraft:worldgen/biome'),
      _nbtListCompounds('value', [biomeEntry])
    ),
    _nbtCompound('minecraft:chat_type',
      _nbtStr('type', 'minecraft:chat_type'),
      _nbtListCompounds('value', [chatEntry])
    ),
    _nbtEnd()
  ]);
}

// ── Build dimension codec NBT for 1.16.x (protocol 735–754) ─────────────────
function _buildCodec1_16() {
  const dimEntry = _nbtAnonCompound(
    _nbtStr('name', 'minecraft:overworld'),
    _nbtInt('id', 0),
    _nbtCompound('element',
      _nbtByte('piglin_safe', 0),
      _nbtByte('natural', 1),
      _nbtFloat('ambient_light', 0.0),
      _nbtStr('infiniburn', 'minecraft:infiniburn_overworld'),
      _nbtByte('respawn_anchor_works', 0),
      _nbtByte('has_skylight', 1),
      _nbtByte('bed_works', 1),
      _nbtStr('effects', 'minecraft:overworld'),
      _nbtByte('has_raids', 1),
      _nbtInt('logical_height', 256),
      _nbtDouble('coordinate_scale', 1.0),
      _nbtByte('ultrawarm', 0),
      _nbtByte('has_ceiling', 0)
    )
  );
  const biomeEntry = _nbtAnonCompound(
    _nbtStr('name', 'minecraft:plains'),
    _nbtInt('id', 0),
    _nbtCompound('element',
      _nbtStr('precipitation', 'none'),
      _nbtFloat('depth', 0.125),
      _nbtFloat('temperature', 0.8),
      _nbtFloat('scale', 0.05),
      _nbtFloat('downfall', 0.4),
      _nbtStr('category', 'none'),
      _nbtCompound('effects',
        _nbtInt('sky_color', 8364543),
        _nbtInt('water_fog_color', 329011),
        _nbtInt('fog_color', 12638463),
        _nbtInt('water_color', 4159204),
        _nbtCompound('mood_sound',
          _nbtInt('tick_delay', 6000),
          _nbtDouble('offset', 2.0),
          _nbtStr('sound', 'minecraft:ambient.cave'),
          _nbtInt('block_search_extent', 8)
        )
      )
    )
  );
  return Buffer.concat([
    Buffer.from([0x0A, 0x00, 0x00]),  // TAG_Compound, anonymous root
    _nbtCompound('minecraft:dimension_type',
      _nbtStr('type', 'minecraft:dimension_type'),
      _nbtListCompounds('value', [dimEntry])
    ),
    _nbtCompound('minecraft:worldgen/biome',
      _nbtStr('type', 'minecraft:worldgen/biome'),
      _nbtListCompounds('value', [biomeEntry])
    ),
    _nbtEnd()
  ]);
}

// ── Overworld dimension NBT for 1.16.x current-dimension field ───────────────
function _buildCurDim1_16() {
  return Buffer.concat([
    Buffer.from([0x0A, 0x00, 0x00]),
    _nbtByte('piglin_safe', 0),
    _nbtByte('natural', 1),
    _nbtFloat('ambient_light', 0.0),
    _nbtStr('infiniburn', 'minecraft:infiniburn_overworld'),
    _nbtByte('respawn_anchor_works', 0),
    _nbtByte('has_skylight', 1),
    _nbtByte('bed_works', 1),
    _nbtStr('effects', 'minecraft:overworld'),
    _nbtByte('has_raids', 1),
    _nbtInt('logical_height', 256),
    _nbtDouble('coordinate_scale', 1.0),
    _nbtByte('ultrawarm', 0),
    _nbtByte('has_ceiling', 0),
    _nbtEnd()
  ]);
}

// ── Build dimension codec NBT for 1.17–1.18 (protocol 755–758) ───────────────
function _buildCodec1_17(minY, height) {
  minY   = minY   !== undefined ? minY   : 0;
  height = height !== undefined ? height : 256;
  const dimEntry = _nbtAnonCompound(
    _nbtStr('name', 'minecraft:overworld'),
    _nbtInt('id', 0),
    _nbtCompound('element',
      _nbtByte('piglin_safe', 0),
      _nbtByte('natural', 1),
      _nbtFloat('ambient_light', 0.0),
      _nbtStr('infiniburn', 'minecraft:infiniburn_overworld'),
      _nbtByte('respawn_anchor_works', 0),
      _nbtByte('has_skylight', 1),
      _nbtByte('bed_works', 1),
      _nbtStr('effects', 'minecraft:overworld'),
      _nbtByte('has_raids', 1),
      _nbtInt('min_y', minY),
      _nbtInt('height', height),
      _nbtInt('logical_height', height),
      _nbtDouble('coordinate_scale', 1.0),
      _nbtByte('ultrawarm', 0),
      _nbtByte('has_ceiling', 0)
    )
  );
  const biomeEntry = _nbtAnonCompound(
    _nbtStr('name', 'minecraft:plains'),
    _nbtInt('id', 0),
    _nbtCompound('element',
      _nbtStr('precipitation', 'none'),
      _nbtFloat('depth', 0.125),
      _nbtFloat('temperature', 0.8),
      _nbtFloat('scale', 0.05),
      _nbtFloat('downfall', 0.4),
      _nbtStr('category', 'none'),
      _nbtCompound('effects',
        _nbtInt('sky_color', 8364543),
        _nbtInt('water_fog_color', 329011),
        _nbtInt('fog_color', 12638463),
        _nbtInt('water_color', 4159204),
        _nbtCompound('mood_sound',
          _nbtInt('tick_delay', 6000),
          _nbtDouble('offset', 2.0),
          _nbtStr('sound', 'minecraft:ambient.cave'),
          _nbtInt('block_search_extent', 8)
        )
      )
    )
  );
  return Buffer.concat([
    Buffer.from([0x0A, 0x00, 0x00]),
    _nbtCompound('minecraft:dimension_type',
      _nbtStr('type', 'minecraft:dimension_type'),
      _nbtListCompounds('value', [dimEntry])
    ),
    _nbtCompound('minecraft:worldgen/biome',
      _nbtStr('type', 'minecraft:worldgen/biome'),
      _nbtListCompounds('value', [biomeEntry])
    ),
    _nbtEnd()
  ]);
}

// ═════════════════════════════════════════════════════════════════════════════
//  _make_server()
// ═════════════════════════════════════════════════════════════════════════════

/**
 * _make_server()
 * Creates a new server descriptor. Does NOT start it.
 * Configure properties, register routes/events, then call _host() to launch.
 *
 * ── Core config ────────────────────────────────────────────────────────────
 *   s.type     — "http" | "https" | "tcp" | "udp" | "ws" | "minecraft"
 *   s.port     — port to listen on.    Default: 8080  (25565 for minecraft)
 *   s.host     — bind address.         Default: "0.0.0.0"
 *   s.logging  — log each request.     Default: false
 *   s.options  — extra options (e.g. { ssl: { key, cert } } for https)
 *
 * ── HTTP / HTTPS controls ──────────────────────────────────────────────────
 *   s._cors              — CORS origin string or true for "*".  Default: false
 *   s._timeout           — request timeout in ms (0 = disabled). Default: 0
 *   s._trust_proxy       — trust X-Forwarded-For/X-Real-IP.    Default: false
 *   s._ssl_key_file      — path to SSL private key file (.pem)
 *   s._ssl_cert_file     — path to SSL certificate file (.pem)
 *   s._not_found_handler — fn(req, res) custom 404 handler
 *   s._error_handler     — fn(err, req, res) custom error handler
 *
 * ── TCP controls ───────────────────────────────────────────────────────────
 *   s._keep_alive        — enable TCP keep-alive on sockets.   Default: true
 *   s._no_delay          — disable Nagle algorithm.            Default: true
 *   s._max_connections   — max simultaneous connections (0=∞). Default: 0
 *
 * ── Minecraft controls ─────────────────────────────────────────────────────
 *   s._max_players       — max players allowed.                Default: 20
 *   s._motd              — message of the day shown in list.   Default: "A ZPP Server"
 *   s._favicon           — base64-encoded PNG favicon string
 *   s._version_name      — version string shown in server list.Default: "1.16.5"
 *   s._protocol_version  — Minecraft protocol number.          Default: 754
 *   s._online_mode       — require Mojang auth.                Default: false
 *   s._view_distance     — view distance in chunks.            Default: 10
 *   s._simulation_distance — simulation distance in chunks.    Default: 10
 *   s._join_game_packet  — pre-built raw Buffer for Join Game (required for 1.19+)
 *
 * Example:
 *   let s = _make_server();
 *   s.type = "minecraft";
 *   s._max_players = 10;
 *   s._motd = "My ZPP Server";
 *   _host(s, fn() { _log("MC server up on :25565"); });
 */
function _make_server() {
  return {
    // ── Core config ──────────────────────────────────────────
    type    : 'http',
    port    : 8080,
    host    : '0.0.0.0',
    logging : false,
    options : {},

    // ── HTTP / HTTPS controls ────────────────────────────────
    _cors              : false,
    _timeout           : 0,
    _trust_proxy       : false,
    _ssl_key_file      : null,
    _ssl_cert_file     : null,
    _not_found_handler : null,
    _error_handler     : null,

    // ── TCP controls ─────────────────────────────────────────
    _keep_alive        : true,
    _no_delay          : true,
    _max_connections   : 0,

    // ── Minecraft controls ───────────────────────────────────
    _max_players          : 20,
    _motd                 : 'A ZPP Server',
    _favicon              : null,
    _version_name         : '1.20.1',
    _protocol_version     : 763,
    _online_mode          : false,
    _view_distance        : 10,
    _simulation_distance  : 10,
    _join_game_packet     : null,

    // ── Internal state (do not touch directly) ───────────────
    _routes      : [],
    _middlewares : [],
    _staticDirs  : [],
    _events      : {},
    _handle      : null,
    _clients     : [],
    _players     : {},
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  HTTP ROUTING
// ═════════════════════════════════════════════════════════════════════════════

/**
 * _route(s, method, path, fn)
 * Register a route for a specific HTTP method and path.
 *   method — "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "*" (any)
 *   path   — exact path or pattern with :params, e.g. "/users/:id"
 *
 * Example:
 *   _route(s, "GET", "/greet/:name", fn(req, res) {
 *     _html(res, "<h1>Hello, " + _param(req, "name") + "!</h1>");
 *   });
 */
function _route(s, method, routePath, fn) {
  s._routes.push({ method: String(method).toUpperCase(), path: routePath, fn: fn });
}

/**
 * _get / _post / _put / _del / _patch / _any
 * Convenience wrappers around _route() for common HTTP methods.
 *
 * Example:
 *   _get(s,   "/",        fn(req, res) { _html(res, "<h1>Home</h1>"); });
 *   _post(s,  "/submit",  fn(req, res) { _body_json(req, fn(d) { _json(res, d); }); });
 *   _del(s,   "/item/:id",fn(req, res) { _json(res, { deleted: _param(req,"id") }); });
 *   _any(s,   "/ping",    fn(req, res) { _text(res, "pong"); });
 */
function _get(s, p, fn)   { _route(s, 'GET',    p, fn); }
function _post(s, p, fn)  { _route(s, 'POST',   p, fn); }
function _put(s, p, fn)   { _route(s, 'PUT',    p, fn); }
function _del(s, p, fn)   { _route(s, 'DELETE', p, fn); }
function _patch(s, p, fn) { _route(s, 'PATCH',  p, fn); }
function _any(s, p, fn)   { _route(s, '*',      p, fn); }

/**
 * _middleware(s, fn)
 * Add middleware that runs before every HTTP request.
 * Call next() to continue; return without calling next() to stop the chain.
 *
 * Example — auth guard:
 *   _middleware(s, fn(req, res, next) {
 *     if (_header_get(req, "x-api-key") == "secret") { next(); }
 *     else { _json(res, { error: "Unauthorized" }, 401); }
 *   });
 */
function _middleware(s, fn) {
  s._middlewares.push(fn);
}

/**
 * _static(s, dir, prefix?)
 * Serve static files from a local directory.
 *   dir    — path to directory, e.g. "./public"
 *   prefix — URL prefix to mount at.  Default: "/"
 *
 * Example:
 *   _static(s, "./www");               // serves /index.html, /style.css, …
 *   _static(s, "./uploads", "/files"); // serves /files/photo.jpg, …
 */
function _static(s, dir, prefix) {
  s._staticDirs.push({ dir: dir, prefix: prefix || '/' });
}

// ═════════════════════════════════════════════════════════════════════════════
//  HTTP RESPONSE HELPERS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * _send(res, status, body, headers?)
 * Send a raw HTTP response. All other response helpers call this.
 * Automatically adds Content-Length for proper HTTP compliance.
 *
 * Example:
 *   _send(res, 200, "OK");
 *   _send(res, 403, "Forbidden", { "X-Reason": "ip-banned" });
 */
function _send(res, status, body, headers) {
  if (res._sent) return;
  res._sent = true;
  const base  = { 'Content-Type': 'text/plain; charset=utf-8' };
  const extra = res._extraHeaders || {};
  const hdrs  = Object.assign(base, extra, headers || {});
  const bodyBuf = body !== undefined && body !== null
    ? (Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8'))
    : Buffer.alloc(0);
  hdrs['Content-Length'] = bodyBuf.length;
  res.writeHead(status || 200, hdrs);
  res.end(bodyBuf);
}

/**
 * _html(res, html, status?)
 * Send an HTML response. Status defaults to 200.
 *
 * Example:
 *   _html(res, "<h1>Welcome!</h1>");
 *   _html(res, "<h1>Not Found</h1>", 404);
 */
function _html(res, html, status) {
  _send(res, status || 200, html, { 'Content-Type': 'text/html; charset=utf-8' });
}

/**
 * _json(res, obj, status?)
 * Serialize obj to JSON and send it. Status defaults to 200.
 *
 * Example:
 *   _json(res, { user: "Alice" });
 *   _json(res, { error: "Not found" }, 404);
 */
function _json(res, obj, status) {
  _send(res, status || 200,
    JSON.stringify(obj, null, 2),
    { 'Content-Type': 'application/json; charset=utf-8' }
  );
}

/**
 * _text(res, text, status?)
 * Send a plain-text response. Status defaults to 200.
 */
function _text(res, text, status) {
  _send(res, status || 200, String(text), { 'Content-Type': 'text/plain; charset=utf-8' });
}

/**
 * _redirect(res, location, status?)
 * Redirect the client. Status defaults to 302 (temporary). Use 301 for permanent.
 *
 * Example:
 *   _redirect(res, "/login");
 *   _redirect(res, "https://example.com", 301);
 */
function _redirect(res, location, status) {
  _send(res, status || 302, '', { 'Location': location });
}

/**
 * _set_header(res, name, value)
 * Set a custom response header before calling a response function.
 * Must be called BEFORE _html / _json / _send / _file etc.
 *
 * Example:
 *   _set_header(res, "Cache-Control", "max-age=3600");
 *   _set_header(res, "X-Powered-By", "ZPP");
 *   _html(res, "<h1>Hello</h1>");
 */
function _set_header(res, name, value) {
  if (!res._extraHeaders) res._extraHeaders = {};
  res._extraHeaders[name] = value;
}

/**
 * _file(res, filePath, status?)
 * Read a file from disk and send it as the response.
 * MIME type is auto-detected. Sends 404 if the file does not exist.
 *
 * Example:
 *   _file(res, "./public/index.html");
 */
function _file(res, filePath, status) {
  if (!fs) return _send(res, 500, 'Filesystem not available');
  try {
    const abs  = pathMod ? pathMod.resolve(filePath) : filePath;
    const data = fs.readFileSync(abs);
    _send(res, status || 200, data, { 'Content-Type': _mimeFor(filePath) });
  } catch(e) {
    _send(res, 404, 'File not found: ' + filePath);
  }
}

/**
 * _stream_file(res, filePath, status?)
 * Stream a file from disk without loading it all into memory.
 * Supports HTTP Range requests for video/audio seeking.
 * Better than _file() for large media files.
 *
 * Example:
 *   _stream_file(res, "./videos/big.mp4");
 */
function _stream_file(res, filePath, status) {
  if (!fs) return _send(res, 500, 'Filesystem not available');
  try {
    const abs  = pathMod ? pathMod.resolve(filePath) : filePath;
    const stat = fs.statSync(abs);
    const mime = _mimeFor(filePath);
    const total = stat.size;

    // Handle Range requests (needed for video/audio seeking in browsers)
    const range = res.req && res.req.headers && res.req.headers['range'];
    if (range) {
      const match = range.match(/bytes=(\d*)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10) || 0;
        const end   = match[2] ? parseInt(match[2], 10) : total - 1;
        const chunkSize = end - start + 1;
        if (res._sent) return;
        res._sent = true;
        res.writeHead(206, {
          'Content-Range'  : 'bytes ' + start + '-' + end + '/' + total,
          'Accept-Ranges'  : 'bytes',
          'Content-Length' : chunkSize,
          'Content-Type'   : mime,
        });
        fs.createReadStream(abs, { start: start, end: end }).pipe(res);
        return;
      }
    }

    if (res._sent) return;
    res._sent = true;
    res.writeHead(status || 200, {
      'Content-Type'  : mime,
      'Content-Length': total,
      'Accept-Ranges' : 'bytes',
    });
    fs.createReadStream(abs).pipe(res);
  } catch(e) {
    if (!res._sent) _send(res, 404, 'File not found: ' + filePath);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  HTTP REQUEST HELPERS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * _body(req, fn)
 * Asynchronously read the full request body as a raw string.
 *
 * Example:
 *   _post(s, "/echo", fn(req, res) {
 *     _body(req, fn(raw) { _text(res, "You sent: " + raw); });
 *   });
 */
function _body(req, fn) {
  _readBodyPromise(req)
    .then(function(buf) { fn(buf.toString('utf8')); })
    .catch(function()   { fn(''); });
}

/**
 * _body_json(req, fn)
 * Read the request body and parse it as JSON.
 * fn(data, error) — data is the parsed object; error is a string on failure.
 *
 * Example:
 *   _post(s, "/user", fn(req, res) {
 *     _body_json(req, fn(data, err) {
 *       if (err) { _json(res, { error: err }, 400); return; }
 *       _json(res, { created: data.name });
 *     });
 *   });
 */
function _body_json(req, fn) {
  _readBodyPromise(req).then(function(buf) {
    try        { fn(JSON.parse(buf.toString('utf8')), null); }
    catch(e)   { fn(null, 'JSON parse error: ' + e.message); }
  }).catch(function(e) { fn(null, 'Read error: ' + e.message); });
}

/**
 * _query(req, name?)
 * Get query string parameters.
 * Pass a name to get one value, or omit to get all as an object.
 *
 * Example:
 *   // URL: /search?q=hello&page=2
 *   let term = _query(req, "q");    // → "hello"
 *   let all  = _query(req);         // → { q: "hello", page: "2" }
 */
function _query(req, name) {
  const raw    = req.url.indexOf('?') >= 0 ? req.url.slice(req.url.indexOf('?') + 1) : '';
  const params = _parseQuery(raw);
  return name !== undefined ? (params[name] !== undefined ? params[name] : null) : params;
}

/**
 * _param(req, name)
 * Get a named URL path parameter populated by the router.
 *
 * Example:
 *   // Route: /post/:id/comment/:cid
 *   // URL:   /post/99/comment/7
 *   _param(req, "id")   // → "99"
 *   _param(req, "cid")  // → "7"
 */
function _param(req, name) {
  return (req._params && req._params[name] !== undefined) ? req._params[name] : null;
}

/**
 * _header_get(req, name)
 * Get a specific HTTP request header value (case-insensitive).
 *
 * Example:
 *   let ct   = _header_get(req, "content-type");
 *   let auth = _header_get(req, "authorization");
 */
function _header_get(req, name) {
  return req.headers[String(name).toLowerCase()] || null;
}

/**
 * _ip(req)
 * Get the client's IP address.
 * Respects X-Forwarded-For when s._trust_proxy is true (set on the server).
 * Works behind Nginx / Cloudflare / load balancers.
 *
 * Example:
 *   let ip = _ip(req);
 *   _log("Request from: " + ip);
 */
function _ip(req) {
  if (req._trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    const realIp = req.headers['x-real-ip'];
    if (realIp) return realIp.trim();
  }
  return (req.socket && req.socket.remoteAddress) || null;
}

// ═════════════════════════════════════════════════════════════════════════════
//  HTTP / SERVER CONFIGURATION HELPERS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * _cors(s, origin?)
 * Enable CORS headers on an HTTP/HTTPS server.
 * origin — specific origin or "*" for all. Defaults to "*".
 *
 * Example:
 *   _cors(s);                        // Allow all origins
 *   _cors(s, "https://myapp.com");   // Allow one origin only
 */
function _cors(s, origin) {
  s._cors = origin || '*';
}

/**
 * _not_found(s, fn)
 * Register a custom 404 handler instead of the built-in text response.
 *
 * Example:
 *   _not_found(s, fn(req, res) {
 *     _html(res, "<h1>404 – Page not found</h1>", 404);
 *   });
 */
function _not_found(s, fn) {
  s._not_found_handler = fn;
}

/**
 * _error_handler(s, fn)
 * Register a custom error handler for uncaught route/middleware errors.
 * fn(err, req, res) — err is the Error, req/res are the request/response.
 *
 * Example:
 *   _error_handler(s, fn(err, req, res) {
 *     _json(res, { error: err.message }, 500);
 *   });
 */
function _error_handler(s, fn) {
  s._error_handler = fn;
}

/**
 * _set_timeout(s, ms)
 * Set a request timeout for HTTP/HTTPS or connection timeout for TCP.
 * Connections that exceed this time are forcibly closed.
 *
 * Example:
 *   _set_timeout(s, 30000);  // 30 second timeout
 */
function _set_timeout(s, ms) {
  s._timeout = ms;
}

/**
 * _trust_proxy(s, enable?)
 * Make _ip() respect X-Forwarded-For and X-Real-IP headers.
 * Enable this when your server is behind Nginx, Cloudflare, or a load balancer.
 *
 * Example:
 *   _trust_proxy(s);         // enable
 *   _trust_proxy(s, false);  // disable
 */
function _trust_proxy(s, enable) {
  s._trust_proxy = (enable === undefined) ? true : !!enable;
}

// ═════════════════════════════════════════════════════════════════════════════
//  SERVER LIFECYCLE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * _host(s, fn?)
 * Start the server. Calls fn(s) once it is successfully listening.
 *
 * Example — HTTP website:
 *   let s = _make_server();
 *   s.type = "http";
 *   s.port = 3000;
 *   _get(s, "/", fn(req, res) { _html(res, "<h1>Hello!</h1>"); });
 *   _host(s, fn() { _log("Website up on :3000"); });
 *
 * Example — HTTPS website:
 *   let s = _make_server();
 *   s.type = "https";
 *   s.port = 443;
 *   s._ssl_key_file  = "/etc/ssl/private.key";
 *   s._ssl_cert_file = "/etc/ssl/cert.pem";
 *   _host(s, fn() { _log("HTTPS up on :443"); });
 *
 * Example — Minecraft server:
 *   let s = _make_server();
 *   s.type = "minecraft";
 *   s._max_players = 10;
 *   s._motd = "Welcome!";
 *   _on(s, "join", fn(player) { _log(player.username + " joined!"); });
 *   _host(s, fn() { _log("MC server on :25565"); });
 */
function _host(s, fn) {
  const type = String(s.type || 'http').toLowerCase();
  if      (type === 'http')      { _startHttp(s, false, fn); }
  else if (type === 'https')     { _startHttp(s, true,  fn); }
  else if (type === 'tcp')       { _startTcp(s, fn);         }
  else if (type === 'udp')       { _startUdp(s, fn);         }
  else if (type === 'ws')        { _startWs(s, fn);          }
  else if (type === 'minecraft') { _startMinecraft(s, fn);   }
  else {
    throw new Error(
      '[server.zl] Unknown server type: "' + type + '". ' +
      'Valid types: "http", "https", "tcp", "udp", "ws", "minecraft"'
    );
  }
}

/**
 * _stop(s, fn?)
 * Gracefully shut down the server and close all active connections.
 *
 * Example:
 *   _stop(s, fn() { _log("Server stopped."); });
 */
function _stop(s, fn) {
  if (!s._handle) { if (fn) fn(); return; }
  if (s._clients && s._clients.length > 0) {
    s._clients.forEach(function(c) {
      try {
        if (c.destroy)    c.destroy();
        else if (c.close) c.close();
        else if (c.terminate) c.terminate();
      } catch(e) {}
    });
    s._clients = [];
  }
  try {
    s._handle.close(function() { if (fn) fn(); });
  } catch(e) {
    if (fn) fn(e);
  }
  s._handle = null;
}

/**
 * _on(s, event, fn)
 * Register an event listener on the server.
 *
 * Common events (all types):
 *   "error"      — fn(err)
 *   "close"      — fn()
 *
 * TCP / WS / Minecraft:
 *   "connect"    — fn(client)
 *   "disconnect" — fn(client)
 *   "data"       — fn(client, buffer)
 *
 * WebSocket:
 *   "message"    — fn(client, messageString)
 *
 * Minecraft:
 *   "login"      — fn(player)   — after username parsed, before PLAY
 *   "join"       — fn(player)   — player entered PLAY state
 *   "status"     — fn(player, statusObj)  — status ping received
 *   "packet"     — fn(player, packetId, data)  — raw packet event
 *
 * UDP:
 *   "message"    — fn(msgBuffer, remoteInfo)
 */
function _on(s, event, fn) {
  if (!s._events[event]) s._events[event] = [];
  s._events[event].push(fn);
}

/**
 * _off(s, event, fn?)
 * Remove a specific event listener, or all listeners for that event.
 *
 * Example:
 *   _off(s, "data", myHandler);  // remove one
 *   _off(s, "data");             // remove all
 */
function _off(s, event, fn) {
  if (!s._events[event]) return;
  if (!fn) { s._events[event] = []; return; }
  s._events[event] = s._events[event].filter(function(h) { return h !== fn; });
}

// ═════════════════════════════════════════════════════════════════════════════
//  INTERNAL: HTTP / HTTPS STARTUP
// ═════════════════════════════════════════════════════════════════════════════

function _buildCorsHeaders(s, reqOrigin) {
  const origin = s._cors === true ? '*' : (s._cors || '*');
  return {
    'Access-Control-Allow-Origin'  : origin,
    'Access-Control-Allow-Methods' : 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
    'Access-Control-Allow-Headers' : 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age'       : '86400',
  };
}

function _startHttp(s, secure, readyCb) {
  if (!http) throw new Error('[server.zl] Node "http" module is not available.');

  // Auto-load SSL files for HTTPS
  if (secure && fs) {
    s.options.ssl = s.options.ssl || {};
    if (s._ssl_key_file && !s.options.ssl.key) {
      try { s.options.ssl.key = fs.readFileSync(s._ssl_key_file); }
      catch(e) { throw new Error('[server.zl] Cannot read SSL key: ' + e.message); }
    }
    if (s._ssl_cert_file && !s.options.ssl.cert) {
      try { s.options.ssl.cert = fs.readFileSync(s._ssl_cert_file); }
      catch(e) { throw new Error('[server.zl] Cannot read SSL cert: ' + e.message); }
    }
  }

  function requestHandler(req, res) {
    req._params       = {};
    req._trustProxy   = s._trust_proxy;
    res._sent         = false;
    res._extraHeaders = {};
    res.req           = req;  // needed for Range support in _stream_file

    // CORS headers — apply to all responses
    if (s._cors) {
      const corsHdrs = _buildCorsHeaders(s, req.headers['origin']);
      Object.assign(res._extraHeaders, corsHdrs);
      // Preflight
      if (req.method === 'OPTIONS') {
        _send(res, 204, '', corsHdrs);
        return;
      }
    }

    // Optional request logging
    if (s.logging) {
      console.log(
        '[server.zl ' + new Date().toISOString() + '] ' +
        req.method + ' ' + req.url +
        ' from ' + _ip(req)
      );
    }

    // Optional request timeout
    if (s._timeout > 0) {
      req.setTimeout(s._timeout, function() {
        if (!res._sent) _send(res, 408, 'Request Timeout');
      });
    }

    const qIdx     = req.url.indexOf('?');
    const pathname = qIdx >= 0 ? req.url.slice(0, qIdx) : req.url;

    _runMiddlewareChain(s._middlewares, req, res, function() {
      if (res._sent) return;

      // ── Static file directories ──────────────────────────────
      for (let si = 0; si < s._staticDirs.length; si++) {
        const sd     = s._staticDirs[si];
        const prefix = sd.prefix === '/' ? '' : sd.prefix.replace(/\/$/, '');
        if (pathname === sd.prefix || pathname === '/' || pathname.startsWith(prefix + '/')) {
          const rel  = pathname.slice(prefix.length).replace(/^\//, '') || 'index.html';
          const base = pathMod ? pathMod.resolve(sd.dir) : sd.dir;
          const full = pathMod ? pathMod.join(base, rel) : base + '/' + rel;
          if (fs && fs.existsSync(full) && fs.statSync(full).isFile()) {
            _stream_file(res, full); return;
          }
          const idxFile = pathMod ? pathMod.join(full, 'index.html') : full + '/index.html';
          if (fs && fs.existsSync(idxFile)) {
            _stream_file(res, idxFile); return;
          }
        }
      }

      // ── Route matching ───────────────────────────────────────
      const method = req.method.toUpperCase();
      for (let ri = 0; ri < s._routes.length; ri++) {
        const route = s._routes[ri];
        if (route.method !== '*' && route.method !== method) continue;
        const match = _matchRoute(route.path, pathname);
        if (match.matched) {
          req._params = match.params;
          try {
            const result = route.fn(req, res);
            if (result && typeof result.catch === 'function') {
              result.catch(function(e) {
                console.error('[server.zl] Async route error:', e.message);
                if (!res._sent) {
                  if (s._error_handler) { s._error_handler(e, req, res); }
                  else { _send(res, 500, 'Internal Server Error'); }
                }
              });
            }
          } catch(e) {
            console.error('[server.zl] Route error:', e.message);
            if (!res._sent) {
              if (s._error_handler) { s._error_handler(e, req, res); }
              else { _send(res, 500, 'Internal Server Error: ' + e.message); }
            }
          }
          return;
        }
      }

      // ── No route matched → 404 ───────────────────────────────
      if (!res._sent) {
        if (s._not_found_handler) {
          try { s._not_found_handler(req, res); } catch(e) { _send(res, 404, 'Not Found'); }
        } else {
          _send(res, 404, 'Cannot ' + method + ' ' + pathname);
        }
      }
    });
  }

  const sslOpts = (s.options && s.options.ssl) ? s.options.ssl : {};
  const srv = secure
    ? https.createServer(sslOpts, requestHandler)
    : http.createServer(requestHandler);

  // Tune server-level timeout
  if (s._timeout > 0) srv.timeout = s._timeout;

  srv.on('error', function(err) { _emit(s, 'error', err); });
  srv.on('close', function()    { _emit(s, 'close'); });

  srv.listen(s.port, s.host, function() {
    s._handle = srv;
    if (readyCb) readyCb(s);
  });

  s._handle = srv;
}

// ═════════════════════════════════════════════════════════════════════════════
//  INTERNAL: TCP STARTUP
// ═════════════════════════════════════════════════════════════════════════════

function _startTcp(s, readyCb) {
  if (!net) throw new Error('[server.zl] Node "net" module is not available.');

  const srv = net.createServer(function(socket) {

    // Max connections guard
    if (s._max_connections > 0 && s._clients.length >= s._max_connections) {
      socket.destroy();
      return;
    }

    socket._id = _uid();

    // Socket-level tuning
    if (s._keep_alive !== false) socket.setKeepAlive(true, 60000);
    if (s._no_delay   !== false) socket.setNoDelay(true);
    if (s._timeout    >   0)     socket.setTimeout(s._timeout);

    s._clients.push(socket);
    _emit(s, 'connect', socket);

    socket.on('data',    function(data) { _emit(s, 'data', socket, data); });
    socket.on('timeout', function()     { socket.destroy(); });
    socket.on('end',     function() {
      s._clients = s._clients.filter(function(c) { return c !== socket; });
      _emit(s, 'disconnect', socket);
    });
    socket.on('error', function(err) {
      s._clients = s._clients.filter(function(c) { return c !== socket; });
      _emit(s, 'error', err);
    });
  });

  if (s._max_connections > 0) srv.maxConnections = s._max_connections;

  srv.on('error', function(err) { _emit(s, 'error', err); });
  srv.on('close', function()    { _emit(s, 'close'); });
  srv.listen(s.port, s.host, function() {
    s._handle = srv;
    if (readyCb) readyCb(s);
  });
  s._handle = srv;
}

// ═════════════════════════════════════════════════════════════════════════════
//  INTERNAL: UDP STARTUP
// ═════════════════════════════════════════════════════════════════════════════

function _startUdp(s, readyCb) {
  if (!dgram) throw new Error('[server.zl] Node "dgram" module is not available.');

  const sock = dgram.createSocket(s.options.ipv6 ? 'udp6' : 'udp4');
  sock.on('message', function(msg, rinfo) { _emit(s, 'message', msg, rinfo); });
  sock.on('error',   function(err)        { _emit(s, 'error', err); });
  sock.on('close',   function()           { _emit(s, 'close'); });
  sock.bind(s.port, s.host, function() {
    s._handle = sock;
    if (readyCb) readyCb(s);
  });
  s._handle = sock;
}

// ═════════════════════════════════════════════════════════════════════════════
//  INTERNAL: WEBSOCKET STARTUP
// ═════════════════════════════════════════════════════════════════════════════

function _startWs(s, readyCb) {
  let WSServer;
  try {
    const ws = require('ws');
    WSServer  = ws.WebSocketServer || ws.Server;
  } catch(e) {
    throw new Error('[server.zl] WebSocket requires the "ws" npm package. Run: npm install ws');
  }

  const wsOpts = Object.assign({ port: s.port, host: s.host }, s.options);
  const wss    = new WSServer(wsOpts);

  wss.on('connection', function(wsClient, req) {
    wsClient._id  = _uid();
    wsClient._req = req;
    s._clients.push(wsClient);
    _emit(s, 'connect', wsClient, req);

    wsClient.on('message', function(data) {
      _emit(s, 'message', wsClient, data.toString());
      _emit(s, 'data',    wsClient, data);
    });
    wsClient.on('close', function() {
      s._clients = s._clients.filter(function(c) { return c !== wsClient; });
      _emit(s, 'disconnect', wsClient);
    });
    wsClient.on('error', function(err) {
      s._clients = s._clients.filter(function(c) { return c !== wsClient; });
      _emit(s, 'error', err);
    });
  });

  wss.on('error',     function(err) { _emit(s, 'error', err); });
  wss.on('close',     function()    { _emit(s, 'close'); });
  wss.on('listening', function()    { s._handle = wss; if (readyCb) readyCb(s); });
  s._handle = wss;
}

// ═════════════════════════════════════════════════════════════════════════════
//  INTERNAL: MINECRAFT STARTUP  (full Java Edition protocol implementation)
// ═════════════════════════════════════════════════════════════════════════════
//
//  SUPPORTED PROTOCOL VERSIONS:
//    ≤ 340  (≤ 1.12.2)  — fully supported
//    341–578 (1.13–1.15.2) — fully supported
//    735–754 (1.16.x)   — fully supported (dimension codec included)
//    755–756 (1.17.x)   — fully supported (updated dimension codec)
//    757–758 (1.18.x)   — fully supported (min_y / height fields)
//    759+   (1.19+)     — STATUS + LOGIN work; set s._join_game_packet for PLAY
//
//  FLOW:  HANDSHAKE → STATUS (list ping) | LOGIN → PLAY
//
//  Events fired:
//    "connect"    fn(player)                  — TCP connection established
//    "login"      fn(player)                  — Login Start received; username set
//    "join"       fn(player)                  — player entered PLAY state
//    "packet"     fn(player, packetId, data)  — every parsed packet
//    "status"     fn(player, statusObject)    — status ping served
//    "disconnect" fn(player)                  — connection closed
//    "error"      fn(err)                     — socket/server error
// ─────────────────────────────────────────────────────────────────────────────

function _startMinecraft(s, readyCb) {
  if (!net) throw new Error('[server.zl] Node "net" module is not available.');

  if (s.port === 8080) s.port = 25565;

  // Pre-build dimension codecs once (not per-connection)
  const codec16  = _buildCodec1_16();
  const curDim16 = _buildCurDim1_16();
  const codec17  = _buildCodec1_17(0, 256);
  const codec18  = _buildCodec1_17(-64, 384);
  const codec19  = _buildCodec1_19();

  const srv = net.createServer(function(socket) {

    // Check max players (count only those in PLAY state)
    const activePlayers = Object.keys(s._players).filter(function(k) {
      return s._players[k].state === 'PLAY';
    }).length;
    if (s._max_players > 0 && activePlayers >= s._max_players) {
      socket.destroy();
      return;
    }

    const pid = _uid();
    socket._id       = pid;
    socket._mcState  = 'HANDSHAKE';
    socket._mcBuf    = Buffer.alloc(0);

    const player = {
      id       : pid,
      socket   : socket,
      state    : 'HANDSHAKE',
      username : null,
      address  : socket.remoteAddress,
      protocol : 0,
    };

    s._clients.push(socket);
    s._players[pid] = player;
    _emit(s, 'connect', player);

    socket.on('data', function(raw) {
      // Accumulate data to handle TCP fragmentation correctly
      socket._mcBuf = Buffer.concat([socket._mcBuf, raw]);

      // Process all complete packets from the buffer
      let pkt;
      while ((pkt = _mc_parse_packet(socket._mcBuf)) !== null) {
        socket._mcBuf = pkt.remaining;
        try {
          _mcHandlePacket(s, player, pkt.id, pkt.data,
            codec16, curDim16, codec17, codec18, codec19);
        } catch(e) {
          console.error('[server.zl] MC packet handler error:', e.message);
        }
      }
    });

    socket.on('end', function() {
      s._clients = s._clients.filter(function(c) { return c !== socket; });
      delete s._players[pid];
      _emit(s, 'disconnect', player);
    });

    socket.on('error', function(err) {
      s._clients = s._clients.filter(function(c) { return c !== socket; });
      delete s._players[pid];
      _emit(s, 'error', err);
    });
  });

  srv.on('error', function(err) { _emit(s, 'error', err); });
  srv.on('close', function()    { _emit(s, 'close'); });
  srv.listen(s.port, s.host, function() {
    s._handle = srv;
    if (readyCb) readyCb(s);
  });
  s._handle = srv;
}

function _mcHandlePacket(s, player, packetId, data, codec16, curDim16, codec17, codec18, codec19) {
  // Emit raw packet event for user-level handling
  _emit(s, 'packet', player, packetId, data);

  const st = player.state;

  // ── HANDSHAKE ─────────────────────────────────────────────────────────────
  if (st === 'HANDSHAKE') {
    if (packetId !== 0x00) return;
    const protoInfo = _mc_read_varint(data, 0);
    if (!protoInfo) return;
    player.protocol = protoInfo.value;

    const addrInfo = _mc_read_string(data, protoInfo.offset);
    if (!addrInfo) return;
    const portOff  = addrInfo.offset + 2;            // skip server port (UShort)
    const nextInfo = _mc_read_varint(data, portOff);
    if (!nextInfo) return;

    if (nextInfo.value === 1) {
      player.state = player.socket._mcState = 'STATUS';
    } else if (nextInfo.value === 2) {
      player.state = player.socket._mcState = 'LOGIN';
    }
    return;
  }

  // ── STATUS ────────────────────────────────────────────────────────────────
  if (st === 'STATUS') {
    if (packetId === 0x00) {
      // Status Request → send Status Response
      const onlineCount = Object.keys(s._players).filter(function(k) {
        return s._players[k].state === 'PLAY';
      }).length;

      const statusObj = {
        version: {
          name    : s._version_name     || '1.16.5',
          protocol: s._protocol_version || player.protocol || 754,
        },
        players: {
          max   : s._max_players || 20,
          online: onlineCount,
          sample: [],
        },
        description: { text: s._motd || 'A ZPP Server' },
      };

      if (s._favicon) {
        statusObj.favicon = s._favicon.startsWith('data:')
          ? s._favicon
          : 'data:image/png;base64,' + s._favicon;
      }

      _emit(s, 'status', player, statusObj);

      const jsonStr = JSON.stringify(statusObj);
      player.socket.write(_mc_make_packet(0x00, _mc_write_string(jsonStr)));

    } else if (packetId === 0x01) {
      // Ping → Pong (echo 8-byte payload to pass latency test)
      if (data.length >= 8) {
        player.socket.write(_mc_make_packet(0x01, data.slice(0, 8)));
      }
    }
    return;
  }

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  if (st === 'LOGIN') {
    if (packetId !== 0x00) return;   // Login Start is the only packet we handle here

    const nameInfo = _mc_read_string(data, 0);
    if (!nameInfo) return;
    player.username = nameInfo.value;

    _emit(s, 'login', player);

    // Build Login Success
    const uuidStr  = _mcOfflineUUID(player.username);
    const uuidHex  = uuidStr.replace(/-/g, '');
    const uuidBuf  = Buffer.from(uuidHex, 'hex');

    let loginBuf;
    if (player.protocol >= 759) {
      // 1.19+: 16-byte UUID, String username, VarInt 0 (no properties array)
      loginBuf = Buffer.concat([
        uuidBuf,
        _mc_write_string(player.username),
        _mc_write_varint(0),
      ]);
    } else if (player.protocol >= 735) {
      // 1.16–1.18.2: 16-byte UUID, String username — NO properties field
      // (the extra VarInt(0) was the "extra space / trailing byte" error)
      loginBuf = Buffer.concat([
        uuidBuf,
        _mc_write_string(player.username),
      ]);
    } else {
      // Pre-1.16: UUID as dashed string, then username
      loginBuf = Buffer.concat([
        _mc_write_string(uuidStr),
        _mc_write_string(player.username),
      ]);
    }
    player.socket.write(_mc_make_packet(0x02, loginBuf));

    player.state = player.socket._mcState = 'PLAY';

    _mcSendJoinGame(s, player, codec16, curDim16, codec17, codec18, codec19);
    _emit(s, 'join', player);
    return;
  }

  // ── PLAY ─────────────────────────────────────────────────────────────────
  if (st === 'PLAY') {
    // Handle keep-alive response (client echoes server's keep-alive ID)
    // Just re-emit for user; no auto-response needed from server side
    _emit(s, 'data', player, data);
  }
}

function _mcSendJoinGame(s, player, codec16, curDim16, codec17, codec18, codec19) {
  const proto  = player.protocol;
  const maxP   = s._max_players       || 20;
  const vDist  = s._view_distance      || 10;
  const sDist  = s._simulation_distance || 10;

  // If user supplied a pre-built Join Game packet (required for 1.19+), use it
  if (s._join_game_packet) {
    player.socket.write(s._join_game_packet);
    _mcSendSpawnPosition(player, proto);
    return;
  }

  try {
    let buf, pktId;

    if (proto <= 340) {
      // ─── 1.8 – 1.12.2 (protocol ≤ 340) — Join Game 0x23 ───────────────────
      pktId = 0x23;
      const eid = Buffer.alloc(4); eid.writeInt32BE(1);
      const dim = Buffer.alloc(4); dim.writeInt32BE(0);
      buf = Buffer.concat([
        eid,
        Buffer.from([0x00]),          // gamemode: survival
        dim,                          // dimension: overworld
        Buffer.from([0x00]),          // difficulty: peaceful
        Buffer.from([Math.min(maxP, 255) & 0xFF]),
        _mc_write_string('default'),  // level type
        Buffer.from([0x00]),          // reducedDebugInfo
      ]);

    } else if (proto <= 404) {
      // ─── 1.13 (protocol 393–404) — Join Game 0x25 ──────────────────────────
      pktId = 0x25;
      const eid = Buffer.alloc(4); eid.writeInt32BE(1);
      const dim = Buffer.alloc(4); dim.writeInt32BE(0);
      buf = Buffer.concat([
        eid,
        Buffer.from([0x00]),
        dim,
        Buffer.from([0x00]),
        Buffer.from([Math.min(maxP, 255) & 0xFF]),
        _mc_write_string('default'),
        _mc_write_varint(vDist),
        Buffer.from([0x00, 0x01]),    // reducedDebugInfo, enableRespawnScreen
      ]);

    } else if (proto <= 578) {
      // ─── 1.14 – 1.15.2 (protocol 477–578) — Join Game 0x26 ────────────────
      pktId = 0x26;
      const eid  = Buffer.alloc(4); eid.writeInt32BE(1);
      const dim  = Buffer.alloc(4); dim.writeInt32BE(0);
      const seed = Buffer.alloc(8);
      buf = Buffer.concat([
        eid,
        Buffer.from([0x00]),
        dim,
        seed,
        Buffer.from([Math.min(maxP, 255) & 0xFF]),
        _mc_write_string('default'),
        _mc_write_varint(vDist),
        Buffer.from([0x00, 0x01]),
      ]);

    } else if (proto <= 754) {
      // ─── 1.16 – 1.16.5 (protocol 735–754) — Join Game 0x24 ────────────────
      pktId = 0x24;
      const eid  = Buffer.alloc(4); eid.writeInt32BE(1);
      const seed = Buffer.alloc(8);
      buf = Buffer.concat([
        eid,
        Buffer.from([0x00]),                        // isHardcore
        Buffer.from([0x00]),                        // gamemode: survival
        Buffer.from([0xFF]),                        // prevGamemode: -1 (none)
        _mc_write_varint(1),                        // worldCount
        _mc_write_string('minecraft:overworld'),    // world names
        codec16,                                    // dimensionCodec NBT
        curDim16,                                   // currentDimension NBT
        _mc_write_string('minecraft:overworld'),    // worldName
        seed,
        _mc_write_varint(maxP),
        _mc_write_varint(vDist),
        Buffer.from([0x00]),                        // reducedDebugInfo
        Buffer.from([0x01]),                        // enableRespawnScreen
        Buffer.from([0x00]),                        // isDebug
        Buffer.from([0x00]),                        // isFlat
      ]);

    } else if (proto <= 756) {
      // ─── 1.17 – 1.17.1 (protocol 755–756) — Join Game 0x26 ────────────────
      pktId = 0x26;
      const eid  = Buffer.alloc(4); eid.writeInt32BE(1);
      const seed = Buffer.alloc(8);
      buf = Buffer.concat([
        eid,
        Buffer.from([0x00]),
        _mc_write_varint(1),
        _mc_write_string('minecraft:overworld'),
        codec17,
        _mc_write_string('minecraft:overworld'),    // dimensionType (string)
        _mc_write_string('minecraft:overworld'),    // worldName
        seed,
        _mc_write_varint(maxP),
        _mc_write_varint(vDist),
        _mc_write_varint(vDist),                    // simulationDistance (same as view)
        Buffer.from([0x00]),
        Buffer.from([0x01]),
        Buffer.from([0x00]),
        Buffer.from([0x00]),
      ]);

    } else if (proto <= 758) {
      // ─── 1.18 – 1.18.2 (protocol 757–758) — Join Game 0x26 ────────────────
      pktId = 0x26;
      const eid  = Buffer.alloc(4); eid.writeInt32BE(1);
      const seed = Buffer.alloc(8);
      buf = Buffer.concat([
        eid,
        Buffer.from([0x00]),
        Buffer.from([0x00]),                        // gamemode
        Buffer.from([0xFF]),                        // prevGamemode
        _mc_write_varint(1),
        _mc_write_string('minecraft:overworld'),
        codec18,
        _mc_write_string('minecraft:overworld'),
        _mc_write_string('minecraft:overworld'),
        seed,
        _mc_write_varint(maxP),
        _mc_write_varint(vDist),
        _mc_write_varint(sDist),
        Buffer.from([0x00, 0x01, 0x00, 0x00]),
      ]);

    } else if (proto <= 763) {
      // ─── 1.19 – 1.20.1 (protocol 759–763) ────────────────────────────────────
      // Packet IDs:  759–760 → 0x23 | 761 → 0x24 | 762–763 → 0x28
      if      (proto <= 760) pktId = 0x23;
      else if (proto <= 761) pktId = 0x24;
      else                   pktId = 0x28;

      const eid  = Buffer.alloc(4); eid.writeInt32BE(1);
      const seed = Buffer.alloc(8);
      // Has Death Location: false (0x00)
      // Portal Cooldown (VarInt 0) only present from 1.19.4+ (proto 762+)
      const tail = proto >= 762
        ? Buffer.concat([Buffer.from([0x00]), _mc_write_varint(0)])
        : Buffer.from([0x00]);

      buf = Buffer.concat([
        eid,
        Buffer.from([0x00]),                        // isHardcore
        Buffer.from([0x00]),                        // gamemode: survival
        Buffer.from([0xFF]),                        // prevGamemode: -1 (none)
        _mc_write_varint(1),                        // worldCount = 1
        _mc_write_string('minecraft:overworld'),    // world name
        codec19,                                    // full registry codec (dim + biome + chat)
        _mc_write_string('minecraft:overworld'),    // dimensionType (identifier)
        _mc_write_string('minecraft:overworld'),    // worldName
        seed,                                       // hashed seed
        _mc_write_varint(maxP),
        _mc_write_varint(vDist),
        _mc_write_varint(sDist),
        Buffer.from([0x00]),                        // reducedDebugInfo
        Buffer.from([0x01]),                        // enableRespawnScreen
        Buffer.from([0x00]),                        // isDebug
        Buffer.from([0x00]),                        // isFlat
        tail,                                       // hasDeathLocation [+ portalCooldown]
      ]);

    } else {
      // ─── 1.20.2+ (protocol 764+) ──────────────────────────────────────────────
      // These versions send registries via separate Registry Data packets (0x07)
      // before Join Game, and the Join Game packet structure changed significantly.
      // Set  s._join_game_packet  to a pre-built raw Buffer for your exact version,
      // or connect with a 1.20.1 / 1.19.x client (protocol ≤ 763) for full support.
      const msg = JSON.stringify({
        text: 'Protocol ' + proto + ' (1.20.2+) requires s._join_game_packet. ' +
              'Use a 1.20.1 client (protocol 763) or set s._version_name="1.20.1" ' +
              'and s._protocol_version=763 to use built-in support.',
        color: 'red'
      });
      // PLAY disconnect — packet ID 0x19 for 1.20.x, best-effort for newer
      const discId = proto <= 766 ? 0x19 : 0x1A;
      player.socket.write(_mc_make_packet(discId, _mc_write_string(msg)));
      setTimeout(function() {
        try { player.socket.destroy(); } catch(e) {}
      }, 500);
      return;
    }

    player.socket.write(_mc_make_packet(pktId, buf));
    _mcSendSpawnPosition(player, proto);

  } catch(e) {
    console.error('[server.zl] Error sending Join Game packet:', e.message);
  }
}

function _mcSendSpawnPosition(player, proto) {
  // Player Position and Look — tells the client where to spawn.
  // Without this, the client will time out waiting for position data.
  try {
    const parts = [];
    const xyz = Buffer.alloc(24);
    xyz.writeDoubleBE(0,  0);   // X
    xyz.writeDoubleBE(64, 8);   // Y
    xyz.writeDoubleBE(0,  16);  // Z
    parts.push(xyz);
    const rot = Buffer.alloc(8);
    rot.writeFloatBE(0, 0);     // Yaw
    rot.writeFloatBE(0, 4);     // Pitch
    parts.push(rot);
    parts.push(Buffer.from([0x00]));    // Flags: absolute position
    parts.push(_mc_write_varint(1));    // TeleportID
    if (proto >= 755) parts.push(Buffer.from([0x00])); // dismountVehicle (1.17+)

    const payload = Buffer.concat(parts);
    let pktId;
    if      (proto <= 110) pktId = 0x2E;
    else if (proto <= 315) pktId = 0x2F;
    else if (proto <= 340) pktId = 0x2E;
    else if (proto <= 393) pktId = 0x32;
    else if (proto <= 404) pktId = 0x32;
    else if (proto <= 477) pktId = 0x35;
    else if (proto <= 498) pktId = 0x35;
    else if (proto <= 578) pktId = 0x36;
    else if (proto <= 736) pktId = 0x35;
    else if (proto <= 754) pktId = 0x34;
    else if (proto <= 756) pktId = 0x38;
    else if (proto <= 758) pktId = 0x38;
    else if (proto <= 760) pktId = 0x36;   // 1.19.0–1.19.2
    else if (proto <= 761) pktId = 0x38;   // 1.19.3
    else if (proto <= 763) pktId = 0x3C;   // 1.19.4–1.20.1
    else                   pktId = 0x3E;   // 1.20.2+ (approximate)

    player.socket.write(_mc_make_packet(pktId, payload));
  } catch(e) {}
}

// ═════════════════════════════════════════════════════════════════════════════
//  TCP / WS / MINECRAFT — SEND HELPERS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * _send_to(client, data)
 * Send data to a specific connected client.
 * Works for TCP sockets, WebSocket connections, and Minecraft players.
 *
 * Example (TCP echo):
 *   _on(s, "data", fn(client, buf) { _send_to(client, buf); });
 */
function _send_to(client, data) {
  try {
    if (client && client.socket && client.socket.write) {
      // Minecraft player object
      const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
      if (!client.socket.destroyed) client.socket.write(buf);
      return;
    }
    if (client && client.readyState !== undefined) {
      // WebSocket
      if (client.readyState === 1) client.send(data);
      return;
    }
    if (client && client.write && !client.destroyed) {
      // Raw TCP socket
      const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
      client.write(buf);
    }
  } catch(e) {
    console.error('[server.zl] _send_to error:', e.message);
  }
}

/**
 * _broadcast(s, data, exclude?)
 * Send data to ALL currently connected clients.
 * Optionally skip one client (e.g. the sender).
 *
 * Example (chat):
 *   _on(s, "message", fn(client, msg) {
 *     _broadcast(s, client._id + ": " + msg, client);
 *   });
 */
function _broadcast(s, data, exclude) {
  s._clients.forEach(function(c) {
    if (c === exclude) return;
    if (exclude && exclude.socket && c === exclude.socket) return;
    _send_to(c, data);
  });
}

/**
 * _kick(s, client, reason?)
 * Forcibly disconnect a client from a TCP / WS / Minecraft server.
 *
 * Example:
 *   _on(s, "join", fn(player) {
 *     if (bannedList.includes(player.address)) {
 *       _kick(s, player, "You are banned.");
 *     }
 *   });
 */
function _kick(s, client, reason) {
  try {
    const target = (client && client.socket) ? client.socket : client;
    if (target) {
      if (target.destroy)        target.destroy();
      else if (target.close)     target.close();
      else if (target.terminate) target.terminate();
    }
    s._clients = s._clients.filter(function(c) { return c !== target && c !== client; });
    if (client && client.id && s._players) delete s._players[client.id];
  } catch(e) {
    console.error('[server.zl] _kick error:', e.message);
  }
}

/**
 * _send_packet(client, data)
 * Send raw binary packet data to a TCP / Minecraft client.
 * data — Buffer or array of byte values.
 *
 * Example:
 *   _send_packet(player, [0x00, 0x2F, 0x01]);
 */
function _send_packet(client, data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  _send_to(client, buf);
}

// ═════════════════════════════════════════════════════════════════════════════
//  UDP SEND HELPER
// ═════════════════════════════════════════════════════════════════════════════

/**
 * _udp_send(s, data, port, address, fn?)
 * Send a UDP datagram from a UDP server.
 *
 * Example:
 *   _udp_send(s, "hello", 9001, "192.168.1.10");
 */
function _udp_send(s, data, port, address, fn) {
  if (!s._handle || String(s.type).toLowerCase() !== 'udp') {
    if (fn) fn(new Error('Not a running UDP server'));
    return;
  }
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  s._handle.send(buf, 0, buf.length, port, address, fn || function() {});
}

// ═════════════════════════════════════════════════════════════════════════════
//  MINECRAFT HELPERS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * _set_motd(s, text)
 * Set the server's Message of the Day shown in the Minecraft server list.
 * Equivalent to setting  s._motd = text  directly.
 *
 * Example:
 *   _set_motd(s, "§aWelcome to §bZPP Server!");
 *   // §a / §b are Minecraft colour codes
 */
function _set_motd(s, text) {
  s._motd = text;
}

/**
 * _set_max_players(s, n)
 * Set the maximum number of players allowed on the Minecraft server.
 * Equivalent to setting  s._max_players = n  directly.
 *
 * Example:
 *   _set_max_players(s, 10);
 *   // or: s._max_players = 10;
 */
function _set_max_players(s, n) {
  s._max_players = n;
}

/**
 * _set_favicon(s, filePath)
 * Load a 64×64 PNG from disk and set it as the server list favicon.
 * Overwrites s._favicon.
 *
 * Example:
 *   _set_favicon(s, "./server-icon.png");
 */
function _set_favicon(s, filePath) {
  if (!fs) { console.error('[server.zl] _set_favicon: fs not available'); return; }
  try {
    const abs  = pathMod ? pathMod.resolve(filePath) : filePath;
    const data = fs.readFileSync(abs);
    s._favicon = 'data:image/png;base64,' + data.toString('base64');
  } catch(e) {
    console.error('[server.zl] _set_favicon: cannot read file:', e.message);
  }
}

/**
 * _mc_online_count(s)
 * Returns the number of players currently in the PLAY state.
 *
 * Example:
 *   _log("Online: " + _mc_online_count(s) + " / " + s._max_players);
 */
function _mc_online_count(s) {
  return Object.keys(s._players || {}).filter(function(k) {
    return s._players[k].state === 'PLAY';
  }).length;
}

/**
 * _mc_broadcast_chat(s, message, color?)
 * Send a JSON chat message to all players currently in PLAY state.
 *   message — plain text (will be wrapped in Minecraft JSON chat format)
 *   color   — optional Minecraft color name, e.g. "yellow" (default: "white")
 *
 * Example:
 *   _mc_broadcast_chat(s, "Server restarts in 60 seconds!", "red");
 */
function _mc_broadcast_chat(s, message, color) {
  const chat = JSON.stringify({ text: message || '', color: color || 'white' });
  Object.keys(s._players || {}).forEach(function(k) {
    const p = s._players[k];
    if (p.state !== 'PLAY') return;
    try {
      // Chat Message (clientbound) — packet ID varies by version
      let pktId;
      const proto = p.protocol || 754;
      if      (proto <= 340) pktId = 0x0F;
      else if (proto <= 404) pktId = 0x0E;
      else if (proto <= 578) pktId = 0x0E;
      else if (proto <= 754) pktId = 0x0E;
      else if (proto <= 758) pktId = 0x0F;
      else                   pktId = 0x60;  // 1.19+ uses different chat system
      const payload = Buffer.concat([
        _mc_write_string(chat),
        Buffer.from([0x00]),  // position: chat box
      ]);
      p.socket.write(_mc_make_packet(pktId, payload));
    } catch(e) {}
  });
}

/**
 * _mc_kick_player(s, player, reason?)
 * Kick a player with a Minecraft disconnect packet (shows reason in the client).
 *   reason — plain text reason (default: "Kicked by server")
 *
 * Example:
 *   _on(s, "join", fn(player) {
 *     if (player.username == "griefer") {
 *       _mc_kick_player(s, player, "You are banned.");
 *     }
 *   });
 */
function _mc_kick_player(s, player, reason) {
  const msg = JSON.stringify({ text: reason || 'Kicked by server' });
  try {
    // Disconnect (Play) packet ID varies by version
    let pktId;
    const proto = (player && player.protocol) || 754;
    if      (proto <= 340) pktId = 0x1A;
    else if (proto <= 393) pktId = 0x1B;
    else if (proto <= 404) pktId = 0x1B;
    else if (proto <= 578) pktId = 0x1A;
    else if (proto <= 754) pktId = 0x1A;
    else if (proto <= 758) pktId = 0x17;
    else                   pktId = 0x19;
    player.socket.write(_mc_make_packet(pktId, _mc_write_string(msg)));
    setTimeout(function() {
      _kick(s, player, reason);
    }, 200);
  } catch(e) {
    _kick(s, player, reason);
  }
}

/**
 * _players(s)
 * Returns the map of connected Minecraft players (only meaningful for type "minecraft").
 * Each entry is: { id, socket, state, username, address, protocol }
 *
 * Example:
 *   let all = _players(s);
 *   _log("Total connections: " + Object.keys(all).length);
 */
function _players(s) {
  return s._players || {};
}

/**
 * _set_mc_state(player, state)
 * Manually update a player's connection state.
 * Valid states: "HANDSHAKE" | "STATUS" | "LOGIN" | "PLAY"
 *
 * Example:
 *   _on(s, "packet", fn(player, id, data) {
 *     if (player.state == "HANDSHAKE") {
 *       _set_mc_state(player, "LOGIN");
 *     }
 *   });
 */
function _set_mc_state(player, state) {
  if (player) {
    player.state = state;
    if (player.socket) player.socket._mcState = state;
  }
}

/**
 * _set_mc_username(player, name)
 * Assign a username to a player object (after manual Login Start parsing).
 *
 * Example:
 *   _set_mc_username(player, "Steve");
 */
function _set_mc_username(player, name) {
  if (player) player.username = name;
}

// ═════════════════════════════════════════════════════════════════════════════
//  UTILITY
// ═════════════════════════════════════════════════════════════════════════════

/**
 * _server_info(s)
 * Returns a plain object describing the server's current state.
 *
 * Example:
 *   let info = _server_info(s);
 *   _log(info.type + " on " + info.address + ":" + info.port);
 *   _log("Running: " + info.running + "  Clients: " + info.clients);
 */
function _server_info(s) {
  let address = s.host, port = s.port;
  try {
    if (s._handle && typeof s._handle.address === 'function') {
      const a = s._handle.address();
      if (a) { address = a.address; port = a.port; }
    }
  } catch(e) {}
  return {
    type    : s.type,
    address : address,
    port    : port,
    running : !!(s._handle),
    clients : s._clients ? s._clients.length : 0,
    players : s._players ? _mc_online_count(s) : 0,
    routes  : s._routes  ? s._routes.length    : 0,
    logging : s.logging,
  };
}

/**
 * _log_requests(s, enable?)
 * Toggle request logging for an HTTP/HTTPS server.
 * Defaults to enabling when no second argument is passed.
 *
 * Example:
 *   _log_requests(s);         // enable
 *   _log_requests(s, false);  // disable
 */
function _log_requests(s, enable) {
  s.logging = (enable === undefined || enable === null) ? true : !!enable;
}

/**
 * _port_check(port, fn)
 * Check whether a port is free on this machine.
 * fn(isFree: boolean)
 *
 * Example:
 *   _port_check(3000, fn(free) {
 *     if (free) { _log("Port 3000 is available!"); }
 *   });
 */
function _port_check(port, fn) {
  if (!net) return fn(false);
  const tester = net.createServer();
  tester.once('error',     function() { fn(false); });
  tester.once('listening', function() { tester.close(); fn(true); });
  tester.listen(port, '127.0.0.1');
}

/**
 * _clients(s)
 * Returns the array of currently connected raw sockets/connections.
 * For Minecraft player objects with more detail, use _players(s).
 */
function _clients(s) {
  return s._clients || [];
}

// ═════════════════════════════════════════════════════════════════════════════
//  DSALibraries REGISTRATION  (matches server.zl loader pattern)
// ═════════════════════════════════════════════════════════════════════════════

if (typeof DSALibraries !== 'undefined') {
  DSALibraries['server.zl'] = {

    description:
      'Full-featured server library for ZPP. All functions are injected globally ' +
      'with the _ prefix. Supports HTTP, HTTPS, TCP, UDP, WebSocket, and Minecraft ' +
      'server types with full Java Edition protocol support (handshake, status ping, ' +
      'login, join game for 1.8–1.20.1). ' +
      'HTTP routing: _get _post _put _del _patch _any _route. ' +
      'Middleware: _middleware _cors _not_found _error_handler _trust_proxy. ' +
      'Static files: _static. ' +
      'Response: _html _json _text _send _redirect _set_header _file _stream_file. ' +
      'Request: _body _body_json _query _param _header_get _ip. ' +
      'Lifecycle: _host _stop _on _off _set_timeout. ' +
      'TCP/WS/MC: _send_to _broadcast _kick _send_packet. ' +
      'Minecraft: _set_motd _set_max_players _set_favicon _mc_online_count ' +
      '_mc_broadcast_chat _mc_kick_player _mc_make_packet _mc_parse_packet ' +
      '_mc_write_string _mc_write_varint _mc_read_varint ' +
      '_set_mc_state _set_mc_username _players. ' +
      'UDP: _udp_send. ' +
      'Util: _server_info _log_requests _port_check _clients.',

    inject(G) {
      // ── Server factory ─────────────────────────────────
      G._make_server         = _make_server;

      // ── HTTP routing ────────────────────────────────────
      G._route               = _route;
      G._get                 = _get;
      G._post                = _post;
      G._put                 = _put;
      G._del                 = _del;
      G._patch               = _patch;
      G._any                 = _any;
      G._middleware          = _middleware;
      G._static              = _static;

      // ── HTTP config helpers ─────────────────────────────
      G._cors                = _cors;
      G._not_found           = _not_found;
      G._error_handler       = _error_handler;
      G._set_timeout         = _set_timeout;
      G._trust_proxy         = _trust_proxy;

      // ── HTTP response helpers ───────────────────────────
      G._send                = _send;
      G._html                = _html;
      G._json                = _json;
      G._text                = _text;
      G._redirect            = _redirect;
      G._set_header          = _set_header;
      G._file                = _file;
      G._stream_file         = _stream_file;

      // ── HTTP request helpers ────────────────────────────
      G._body                = _body;
      G._body_json           = _body_json;
      G._query               = _query;
      G._param               = _param;
      G._header_get          = _header_get;
      G._ip                  = _ip;

      // ── Server lifecycle ────────────────────────────────
      G._host                = _host;
      G._stop                = _stop;
      G._on                  = _on;
      G._off                 = _off;

      // ── TCP / WS / Minecraft helpers ────────────────────
      G._send_to             = _send_to;
      G._broadcast           = _broadcast;
      G._kick                = _kick;
      G._send_packet         = _send_packet;

      // ── UDP helpers ─────────────────────────────────────
      G._udp_send            = _udp_send;

      // ── Minecraft helpers ───────────────────────────────
      G._set_motd            = _set_motd;
      G._set_max_players     = _set_max_players;
      G._set_favicon         = _set_favicon;
      G._mc_online_count     = _mc_online_count;
      G._mc_broadcast_chat   = _mc_broadcast_chat;
      G._mc_kick_player      = _mc_kick_player;
      G._mc_make_packet      = _mc_make_packet;
      G._mc_parse_packet     = _mc_parse_packet;
      G._mc_write_string     = _mc_write_string;
      G._mc_write_varint     = _mc_write_varint;
      G._mc_read_varint      = _mc_read_varint;
      G._set_mc_state        = _set_mc_state;
      G._set_mc_username     = _set_mc_username;
      G._players             = _players;

      // ── Utility ─────────────────────────────────────────
      G._server_info         = _server_info;
      G._log_requests        = _log_requests;
      G._port_check          = _port_check;
      G._clients             = _clients;

      // ── Register builtin names with the ZPP runtime ─────
      if (typeof window !== 'undefined' && window.__ZPP__) {
        window.__ZPP__.registerBuiltins([
          '_make_server',
          '_route', '_get', '_post', '_put', '_del', '_patch', '_any',
          '_middleware', '_static',
          '_cors', '_not_found', '_error_handler', '_set_timeout', '_trust_proxy',
          '_send', '_html', '_json', '_text', '_redirect',
          '_set_header', '_file', '_stream_file',
          '_body', '_body_json', '_query', '_param', '_header_get', '_ip',
          '_host', '_stop', '_on', '_off',
          '_send_to', '_broadcast', '_kick', '_send_packet',
          '_udp_send',
          '_set_motd', '_set_max_players', '_set_favicon',
          '_mc_online_count', '_mc_broadcast_chat', '_mc_kick_player',
          '_mc_make_packet', '_mc_parse_packet',
          '_mc_write_string', '_mc_write_varint', '_mc_read_varint',
          '_set_mc_state', '_set_mc_username', '_players',
          '_server_info', '_log_requests', '_port_check', '_clients',
        ]);
      }
    },
  };
}

// ── CommonJS export (Node.js direct require) ─────────────────────────────────
if (typeof module !== 'undefined') {
  module.exports = {
    _make_server,
    _route, _get, _post, _put, _del, _patch, _any, _middleware, _static,
    _cors, _not_found, _error_handler, _set_timeout, _trust_proxy,
    _send, _html, _json, _text, _redirect, _set_header, _file, _stream_file,
    _body, _body_json, _query, _param, _header_get, _ip,
    _host, _stop, _on, _off,
    _send_to, _broadcast, _kick, _send_packet,
    _udp_send,
    _set_motd, _set_max_players, _set_favicon,
    _mc_online_count, _mc_broadcast_chat, _mc_kick_player,
    _mc_make_packet, _mc_parse_packet,
    _mc_write_string, _mc_write_varint, _mc_read_varint,
    _set_mc_state, _set_mc_username, _players,
    _server_info, _log_requests, _port_check, _clients,
  };
}

})();