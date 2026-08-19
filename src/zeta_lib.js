/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                          Z E T A . Z L   R U N T I M E                     ║
 * ║                    Full Language Extension over ZPP v1.0.0                 ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  ARCHITECTURE OVERVIEW                                                      ║
 * ║  ─────────────────────────────────────────────────────────────────────────  ║
 * ║  ZPP (base interpreter) understands identifiers, literals, basic control.  ║
 * ║  ZPP does NOT understand: @  #  %  ^  ->  :  :->  $                       ║
 * ║                                                                             ║
 * ║  Execution pipeline:                                                        ║
 * ║                                                                             ║
 * ║   .zl source                                                                ║
 * ║       │                                                                     ║
 * ║   ZetaSafeLayer ──── intercepts BEFORE ZPP parser sees raw syntax          ║
 * ║       │                                                                     ║
 * ║   ZetaLexer ───────── tokenises all zeta.zl special syntax                 ║
 * ║       │                                                                     ║
 * ║   ZetaParser ──────── builds ZetaAST (recursive-descent)                   ║
 * ║       │                                                                     ║
 * ║   ZetaIRCompiler ──── emits ZPP-safe __zeta_* call IR                      ║
 * ║       │                                                                     ║
 * ║   ZPP Runtime ─────── sees ONLY safe function calls, never raw operators   ║
 * ║       │                                                                     ║
 * ║   ZetaExecutor ────── resolves tags, directives, side-effects              ║
 * ║                                                                             ║
 * ║  Subsystems:                                                                ║
 * ║   ZetaRegisterFile  · 8 registers × 4 typed slots                         ║
 * ║   ZetaMemoryManager · allocation ledger + free()                           ║
 * ║   ZetaTagEngine     · 40+ execution-modifier tags                          ║
 * ║   ZetaDirectiveEngine · 18 @-directives                                    ║
 * ║   ZetaPortionRegistry · portion / section namespace tree                   ║
 * ║   ZetaGUI           · Electron + Canvas rendering pipeline                 ║
 * ║   ZetaEngine3D      · Scene graph + mesh + physics + input                 ║
 * ║   ZetaModuleLoader  · .zl library integration (ascii.zl, etc.)            ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

(function ZetaZL () {
'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
//  §1  GLOBAL CONSTANTS & TOKEN TAXONOMY
// ═══════════════════════════════════════════════════════════════════════════════

const ZL_VERSION   = '1.0.0';
const ZL_MAX_REGS  = 8;
const ZL_REG_SLOTS = 4;

/** Token-type enum — frozen so parser cannot mutate it accidentally */
const T = Object.freeze({
  // ── Structure ────────────────────────────────────────────────────────────
  MEDIUM_ZETA : 'MEDIUM_ZETA',
  LBRACE      : 'LBRACE',      RBRACE    : 'RBRACE',
  NEWLINE     : 'NEWLINE',     INDENT    : 'INDENT',    DEDENT : 'DEDENT',
  COMMA       : 'COMMA',       SEMICOLON : 'SEMICOLON',
  DOT         : 'DOT',         COLON     : 'COLON',
  // ── Arrow family (parenthesis replacements) ──────────────────────────────
  ARROW_TRIPLE : 'ARROW_TRIPLE',   // --->   open-call
  ARROW_DOUBLE : 'ARROW_DOUBLE',   // -->    arg-separator
  ARROW_SINGLE : 'ARROW_SINGLE',   // ->     result-binding / return
  COLON_ARROW  : 'COLON_ARROW',    // :->    body-open
  DOLLAR_ARROW : 'DOLLAR_ARROW',   // $->    register-write
  // ── Memory / register ────────────────────────────────────────────────────
  DOLLAR   : 'DOLLAR',    // $ allocate
  PERCENT  : 'PERCENT',   // % read sigil (standalone)
  REGISTER : 'REGISTER',  // r1..r8   (bare)
  REG_SLOT : 'REG_SLOT',  // r1:0     (bare slot-ref)
  REG_DEREF: 'REG_DEREF', // %r1  /  %r1:0
  FREE     : 'FREE',
  // ── Declaration keywords ─────────────────────────────────────────────────
  PORTION : 'PORTION',
  SECTION : 'SECTION',
  RESULT  : 'RESULT',
  // ── Types ────────────────────────────────────────────────────────────────
  TYPE_NUM   : 'TYPE_NUM',   TYPE_STR  : 'TYPE_STR',
  TYPE_BOOL  : 'TYPE_BOOL',  TYPE_LET  : 'TYPE_LET',  TYPE_ARRAY : 'TYPE_ARRAY',
  // ── Section-kind keywords ────────────────────────────────────────────────
  SECT_FUNC   : 'SECT_FUNC',
  SECT_STRUCT : 'SECT_STRUCT',
  // ── Tags & directives ────────────────────────────────────────────────────
  TAG       : 'TAG',        // <name>  or  <name><$rX[:slot]>
  DIRECTIVE : 'DIRECTIVE',  // @name
  // ── Literals ─────────────────────────────────────────────────────────────
  NUMBER_LIT : 'NUMBER_LIT',
  STRING_LIT : 'STRING_LIT',
  BOOL_LIT   : 'BOOL_LIT',
  // ── General ──────────────────────────────────────────────────────────────
  IDENTIFIER : 'IDENTIFIER',
  EOF        : 'EOF',
});

/** All valid tag names — governs <tagName> recognition */
const VALID_TAGS = new Set([
  // Value & type
  'getVal','cast','type','box','unbox',
  // Arithmetic & logic
  'calc','cmp','logic','bit','abs','min','max','clamp','lerp',
  // Memory & allocation
  'mem','alloc','dealloc','ref','deref','clone','sizeof',
  // Control flow
  'flow','loop','iter','while','branch','jump','ret','break','continue',
  // I/O
  'io','fmt','print','read','write','flush','clear',
  // Events & concurrency
  'event','emit','on','off','once','async','sync','spawn','kill','watch','await',
  'chan','send','recv','select',
  // Error handling
  'err','try','catch','throw','panic','recover',
  // Scoping & piping
  'scope','pipe','chain','partial','curry','memoize',
  // Rendering & GUI
  'render','draw','paint','shape','widget','overlay','anim','frame','blend',
  'clip','mask','transform','translate','rotate','scale',
  // 3D engine
  'mesh','scene','camera','light','physics','shader','texture','mat','particle',
  'normal','uv','tbn','instance','lod','cull','raycast',
  // Input system
  'input','key','mouse','touch','gamepad','gesture',
  // Debug & introspection
  'debug','trace','assert','bench','log','dump','profile','breakpoint',
  // Module
  'import','export','bind','inject','require','provide',
  // Data structures
  'arr','map','set','struct','tuple','json','buf','queue','stack','heap',
  // String operations
  'str','concat','split','trim','pad','match','replace','format','encode','decode',
  // Crypto & hashing
  'hash','crypt','sign','verify','uuid','rand','nonce',
  // Networking
  'net','req','res','ws','rpc','grpc','fetch','socket',
  // System
  'sys','env','proc','fs','path','time','date','timer','interval',
]);

/** All valid @-directive names */
const VALID_DIRECTIVES = new Set([
  'glb','term','gui','engine','mem','sys','async','import','export',
  'debug','net','fs','crypto','time','env','proc','thread','wasm',
  'hot','strict','unsafe','sandbox','native','extern','inline','macro',
  'bench','profile','deprecated','experimental',
]);

// Keyword → token-type map (used inside lexer)
const KW_MAP = {
  medium_zeta : T.MEDIUM_ZETA,
  portion     : T.PORTION,
  section     : T.SECTION,
  result      : T.RESULT,
  free        : T.FREE,
  func        : T.SECT_FUNC,
  struct      : T.SECT_STRUCT,
  num         : T.TYPE_NUM,
  str         : T.TYPE_STR,
  bool        : T.TYPE_BOOL,
  let         : T.TYPE_LET,
  array       : T.TYPE_ARRAY,
};

// ═══════════════════════════════════════════════════════════════════════════════
//  §2  LEXER
// ═══════════════════════════════════════════════════════════════════════════════

class ZetaLexer {
  constructor (src) {
    this._src   = src;
    this._pos   = 0;
    this._line  = 1;
    this._col   = 1;
    this._toks  = [];
    this._iStack = [0];       // indent level stack
    this._bol    = true;      // beginning-of-line flag
  }

  // ── Primitives ─────────────────────────────────────────────────────────────
  _ch   (off = 0) { return this._src[this._pos + off] || ''; }
  _adv  () {
    const c = this._src[this._pos++];
    if (c === '\n') { this._line++; this._col = 1; } else { this._col++; }
    return c;
  }
  _match (s) {
    if (!this._src.startsWith(s, this._pos)) return false;
    for (let i = 0; i < s.length; i++) this._adv();
    return true;
  }
  _tok (type, val, ln, cl) {
    return { type, val, line: ln ?? this._line, col: cl ?? this._col };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  _skipLineComment () {
    while (this._pos < this._src.length && this._ch() !== '\n') this._adv();
  }
  _readStr () {
    const q = this._adv();
    let s = '';
    while (this._pos < this._src.length && this._ch() !== q) {
      if (this._ch() === '\\') { this._adv(); s += this._adv(); }
      else s += this._adv();
    }
    if (this._ch() === q) this._adv();
    return s;
  }
  _readNum () {
    let s = ''; let dot = false;
    if (this._ch() === '-') s += this._adv();
    while (this._pos < this._src.length) {
      const c = this._ch();
      if (c >= '0' && c <= '9') s += this._adv();
      else if (c === '.' && !dot && this._ch(1) >= '0' && this._ch(1) <= '9') {
        dot = true; s += this._adv();
      } else break;
    }
    return parseFloat(s);
  }
  _readIdent () {
    let s = '';
    while (/[a-zA-Z0-9_]/.test(this._ch())) s += this._adv();
    return s;
  }
  _emitIndent (spaces) {
    const top = this._iStack[this._iStack.length - 1];
    if (spaces > top) {
      this._iStack.push(spaces);
      this._toks.push(this._tok(T.INDENT, spaces));
    } else if (spaces < top) {
      while (this._iStack.length > 1 && this._iStack[this._iStack.length - 1] > spaces) {
        this._iStack.pop();
        this._toks.push(this._tok(T.DEDENT, spaces));
      }
    }
  }

  // ── Main tokenise loop ─────────────────────────────────────────────────────
  tokenize () {
    while (this._pos < this._src.length) {
      const ln = this._line, cl = this._col;
      const ch = this._ch();

      // ── Beginning-of-line: measure indentation ──────────────────────────
      if (this._bol) {
        this._bol = false;
        let sp = 0;
        while (this._ch() === ' ')  { this._adv(); sp++; }
        while (this._ch() === '\t') { this._adv(); sp += 4; }
        // skip blank lines
        if (this._ch() === '\n' || this._ch() === '\r' || this._ch() === '' ||
            (this._ch() === '/' && this._ch(1) === '/')) {
          if (this._ch() === '/' && this._ch(1) === '/') this._skipLineComment();
          continue;
        }
        this._emitIndent(sp);
        continue;
      }

      // ── Newline ──────────────────────────────────────────────────────────
      if (ch === '\r' && this._ch(1) === '\n') { this._adv(); this._adv();
        this._toks.push(this._tok(T.NEWLINE, '\n', ln, cl)); this._bol = true; continue; }
      if (ch === '\n') { this._adv();
        this._toks.push(this._tok(T.NEWLINE, '\n', ln, cl)); this._bol = true; continue; }

      // ── Whitespace (non-indent) ──────────────────────────────────────────
      if (ch === ' ' || ch === '\t') { this._adv(); continue; }

      // ── Line comments ────────────────────────────────────────────────────
      if (ch === '/' && this._ch(1) === '/') { this._skipLineComment(); continue; }

      // ── Arrow family (longest-match first) ──────────────────────────────
      if (ch === '-') {
        if (this._match('--->')) { this._toks.push(this._tok(T.ARROW_TRIPLE, '--->', ln, cl)); continue; }
        if (this._match('-->'))  { this._toks.push(this._tok(T.ARROW_DOUBLE, '-->', ln, cl)); continue; }
        if (this._match('->'))   { this._toks.push(this._tok(T.ARROW_SINGLE, '->', ln, cl)); continue; }
        // negative number literal
        if (this._ch(1) >= '0' && this._ch(1) <= '9') {
          this._toks.push(this._tok(T.NUMBER_LIT, this._readNum(), ln, cl)); continue;
        }
        this._adv(); continue;
      }

      // ── Colon family ─────────────────────────────────────────────────────
      if (ch === ':') {
        if (this._match(':->')) { this._toks.push(this._tok(T.COLON_ARROW, ':->', ln, cl)); continue; }
        this._adv();
        // slot value after colon: :0 .. :3
        if (this._ch() >= '0' && this._ch() <= '9') {
          const slot = parseInt(this._adv());
          this._toks.push(this._tok(T.COLON, slot, ln, cl));
        } else {
          this._toks.push(this._tok(T.COLON, ':', ln, cl));
        }
        continue;
      }

      // ── Dollar family ────────────────────────────────────────────────────
      if (ch === '$') {
        if (this._match('$->')) { this._toks.push(this._tok(T.DOLLAR_ARROW, '$->', ln, cl)); continue; }
        this._adv();
        this._toks.push(this._tok(T.DOLLAR, '$', ln, cl));
        continue;
      }

      // ── Percent / register dereference ───────────────────────────────────
      if (ch === '%') {
        this._adv();
        if (this._ch() === 'r' && this._ch(1) >= '1' && this._ch(1) <= '8') {
          this._adv();  // consume 'r'
          const reg  = parseInt(this._adv());
          let   slot = null;
          if (this._ch() === ':' && this._ch(1) >= '0' && this._ch(1) <= '3') {
            this._adv(); slot = parseInt(this._adv());
          }
          this._toks.push(this._tok(T.REG_DEREF, { reg, slot }, ln, cl));
          continue;
        }
        this._toks.push(this._tok(T.PERCENT, '%', ln, cl));
        continue;
      }

      // ── Tag: <tagName>  or compound  <tagName><$rX[:slot]> ───────────────
      if (ch === '<') {
        this._adv();  // consume '<'
        let name = '';
        while (this._ch() !== '>' && this._ch() !== '' && this._ch() !== '\n')
          name += this._adv();
        if (this._ch() === '>') this._adv();  // consume '>'
        // look for compound <tag><$rN>
        let regRef = null;
        if (this._ch() === '<') {
          const save = this._pos;
          this._adv();
          if (this._ch() === '$' && this._ch(1) === 'r') {
            this._adv();  // $
            this._adv();  // r
            const reg = parseInt(this._adv());
            let slot = null;
            if (this._ch() === ':' && this._ch(1) >= '0' && this._ch(1) <= '3') {
              this._adv(); slot = parseInt(this._adv());
            }
            if (this._ch() === '>') { this._adv(); regRef = { reg, slot }; }
            else { this._pos = save; }
          } else { this._pos = save; }
        }
        this._toks.push(this._tok(T.TAG, { name, regRef }, ln, cl));
        continue;
      }

      // ── @-directive ───────────────────────────────────────────────────────
      if (ch === '@') {
        this._adv();
        const name = this._readIdent();
        this._toks.push(this._tok(T.DIRECTIVE, name, ln, cl));
        continue;
      }

      // ── String literal ────────────────────────────────────────────────────
      if (ch === '"' || ch === "'") {
        this._toks.push(this._tok(T.STRING_LIT, this._readStr(), ln, cl));
        continue;
      }

      // ── Number literal ────────────────────────────────────────────────────
      if ((ch >= '0' && ch <= '9') ||
          (ch === '.' && this._ch(1) >= '0' && this._ch(1) <= '9')) {
        this._toks.push(this._tok(T.NUMBER_LIT, this._readNum(), ln, cl));
        continue;
      }

      // ── Identifier / keyword / register ──────────────────────────────────
      if (/[a-zA-Z_]/.test(ch)) {
        const id = this._readIdent();
        // Registers r1..r8
        if (/^r[1-8]$/.test(id)) {
          if (this._ch() === ':' && this._ch(1) >= '0' && this._ch(1) <= '3') {
            this._adv();  // ':'
            const slot = parseInt(this._adv());
            this._toks.push(this._tok(T.REG_SLOT, { reg: parseInt(id[1]), slot }, ln, cl));
          } else {
            this._toks.push(this._tok(T.REGISTER, parseInt(id[1]), ln, cl));
          }
          continue;
        }
        // Boolean literals
        if (id === 'true' || id === 'false') {
          this._toks.push(this._tok(T.BOOL_LIT, id === 'true', ln, cl)); continue;
        }
        const kwType = KW_MAP[id];
        this._toks.push(this._tok(kwType || T.IDENTIFIER, id, ln, cl));
        continue;
      }

      // ── Single-character punctuation ─────────────────────────────────────
      if (ch === '{')  { this._adv(); this._toks.push(this._tok(T.LBRACE,    '{', ln, cl)); continue; }
      if (ch === '}')  { this._adv(); this._toks.push(this._tok(T.RBRACE,    '}', ln, cl)); continue; }
      if (ch === ',')  { this._adv(); this._toks.push(this._tok(T.COMMA,     ',', ln, cl)); continue; }
      if (ch === ';')  { this._adv(); this._toks.push(this._tok(T.SEMICOLON, ';', ln, cl)); continue; }
      if (ch === '.')  { this._adv(); this._toks.push(this._tok(T.DOT,       '.', ln, cl)); continue; }

      this._adv();  // skip unknown char
    }

    // Drain remaining dedents
    while (this._iStack.length > 1) {
      this._iStack.pop();
      this._toks.push(this._tok(T.DEDENT, 0));
    }
    this._toks.push(this._tok(T.EOF, null));
    return this._toks;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §3  AST NODE FACTORIES
// ═══════════════════════════════════════════════════════════════════════════════

const N = Object.freeze({
  Program         : (body, directives)       => ({ kind:'Program',         body, directives }),
  MediumBlock     : (portions, result, dirs) => ({ kind:'MediumBlock',     portions, result, dirs }),
  PortionDecl     : (name, sections)         => ({ kind:'PortionDecl',     name, sections }),
  SectionDecl     : (sectKind, name, params, body) =>
                    ({ kind:'SectionDecl',    sectKind, name, params, body }),
  FuncBody        : (stmts)                  => ({ kind:'FuncBody',        stmts }),
  RegWrite        : (reg, assignments)       => ({ kind:'RegWrite',        reg, assignments }),
  TypedValue      : (typeTok, value)         => ({ kind:'TypedValue',      typeTok, value }),
  RegRead         : (reg, slot)              => ({ kind:'RegRead',         reg, slot }),
  FreeStmt        : (regs)                   => ({ kind:'FreeStmt',        regs }),
  CallExpr        : (portion, func, args, tag, directive) =>
                    ({ kind:'CallExpr',       portion, func, args, tag, directive }),
  TagNode         : (name, regRef)           => ({ kind:'TagNode',         name, regRef }),
  DirectiveStmt   : (name, body)             => ({ kind:'DirectiveStmt',   name, body }),
  ResultDecl      : (exports)               => ({ kind:'ResultDecl',       exports }),
  Literal         : (litType, value)         => ({ kind:'Literal',         litType, value }),
  Identifier      : (name)                   => ({ kind:'Identifier',      name }),
});

// ═══════════════════════════════════════════════════════════════════════════════
//  §4  PARSER  (recursive-descent)
// ═══════════════════════════════════════════════════════════════════════════════

class ZetaParser {
  constructor (tokens) {
    this._toks = tokens;
    this._pos  = 0;
  }

  _cur  ()      { return this._toks[this._pos]      || { type:T.EOF, val:null }; }
  _peek (off=1) { return this._toks[this._pos+off]  || { type:T.EOF, val:null }; }
  _eat  (type)  {
    const t = this._cur();
    if (t.type !== type) throw new ZetaError(`Expected ${type} but got ${t.type} ("${t.val}") at line ${t.line}:${t.col}`);
    this._pos++;
    return t;
  }
  _eatOpt (type) { if (this._cur().type === type) return this._eat(type); return null; }
  _skip  ()      { return this._toks[this._pos++]; }
  _skipNewlines() { while (this._cur().type === T.NEWLINE) this._pos++; }

  // ── Entry ──────────────────────────────────────────────────────────────────
  parse () {
    this._skipNewlines();
    const directives = [];
    const body       = [];

    while (this._cur().type !== T.EOF) {
      this._skipNewlines();
      if (this._cur().type === T.EOF) break;
      if (this._cur().type === T.DIRECTIVE) {
        directives.push(this._parseDirectiveStmt());
      } else if (this._cur().type === T.MEDIUM_ZETA) {
        body.push(this._parseMediumBlock());
      } else {
        // global-scope statement (call expression or free)
        body.push(this._parseStatement());
      }
    }
    return N.Program(body, directives);
  }

  // ── medium_zeta :-> { … } -> result([…]); ────────────────────────────────
  _parseMediumBlock () {
    this._eat(T.MEDIUM_ZETA);
    this._eat(T.COLON_ARROW);
    this._eat(T.LBRACE);
    this._skipNewlines();

    // Collect leading @-directives for the block
    const dirs = [];
    while (this._cur().type === T.DIRECTIVE) {
      dirs.push(this._cur().val);
      this._skip();
      this._skipNewlines();
    }

    const portions = [];
    while (this._cur().type !== T.RBRACE && this._cur().type !== T.EOF) {
      this._skipNewlines();
      if (this._cur().type === T.RBRACE) break;
      if (this._cur().type === T.PORTION) {
        portions.push(this._parsePortion());
      } else {
        this._skip();  // skip unexpected token
      }
      this._skipNewlines();
    }
    this._eat(T.RBRACE);
    // -> result(…)
    this._eat(T.ARROW_SINGLE);
    this._eat(T.RESULT);
    const exports = this._parseResultArgs();
    this._eatOpt(T.SEMICOLON);
    return N.MediumBlock(portions, N.ResultDecl(exports), dirs);
  }

  // ── portion .name ─────────────────────────────────────────────────────────
  _parsePortion () {
    this._eat(T.PORTION);
    this._eat(T.DOT);
    const name = this._eat(T.IDENTIFIER).val;
    this._skipNewlines();

    const sections = [];
    // Indented block of sections
    if (this._cur().type === T.INDENT) {
      this._eat(T.INDENT);
      while (this._cur().type !== T.DEDENT && this._cur().type !== T.EOF) {
        this._skipNewlines();
        if (this._cur().type === T.DEDENT || this._cur().type === T.EOF) break;
        if (this._cur().type === T.SECTION) {
          sections.push(this._parseSection());
        } else {
          this._skip();
        }
        this._skipNewlines();
      }
      this._eatOpt(T.DEDENT);
    }
    return N.PortionDecl(name, sections);
  }

  // ── section <func|struct>.name -> type, type :-> body ────────────────────
  _parseSection () {
    this._eat(T.SECTION);
    // section <func>.name  or  section <struct>.name
    let sectKind = 'func';
    if (this._cur().type === T.TAG) {
      sectKind = this._cur().val.name;
      this._skip();
    } else if (this._cur().type === T.SECT_FUNC) {
      this._skip();
    } else if (this._cur().type === T.SECT_STRUCT) {
      sectKind = 'struct'; this._skip();
    }
    this._eat(T.DOT);
    const name = this._eat(T.IDENTIFIER).val;

    // -> param-types
    const params = [];
    if (this._cur().type === T.ARROW_SINGLE) {
      this._eat(T.ARROW_SINGLE);
      params.push(this._parseTypeName());
      while (this._cur().type === T.COMMA) {
        this._eat(T.COMMA);
        params.push(this._parseTypeName());
      }
    }
    this._eat(T.COLON_ARROW);
    this._skipNewlines();

    const body = this._parseFuncBody();
    return N.SectionDecl(sectKind, name, params, body);
  }

  _parseTypeName () {
    const t = this._cur();
    if ([T.TYPE_NUM,T.TYPE_STR,T.TYPE_BOOL,T.TYPE_LET,T.TYPE_ARRAY].includes(t.type)) {
      this._skip(); return t.val;
    }
    if (t.type === T.IDENTIFIER) { this._skip(); return t.val; }
    return 'let';
  }

  // ── Function body (indent-scoped block) ───────────────────────────────────
  _parseFuncBody () {
    const stmts = [];
    if (this._cur().type === T.INDENT) {
      this._eat(T.INDENT);
      while (this._cur().type !== T.DEDENT && this._cur().type !== T.EOF) {
        this._skipNewlines();
        if (this._cur().type === T.DEDENT || this._cur().type === T.EOF) break;
        const s = this._parseStatement();
        if (s) stmts.push(s);
        this._skipNewlines();
      }
      this._eatOpt(T.DEDENT);
    }
    return N.FuncBody(stmts);
  }

  // ── Statement dispatcher ──────────────────────────────────────────────────
  _parseStatement () {
    this._skipNewlines();
    const t = this._cur();

    if (t.type === T.REGISTER)    return this._parseRegWrite();
    if (t.type === T.FREE)        return this._parseFreeStmt();
    if (t.type === T.DIRECTIVE)   return this._parseDirectiveStmt();
    if (t.type === T.DOT)         return this._parseCallExpr(null);
    if (t.type === T.IDENTIFIER && this._peek().type === T.ARROW_TRIPLE)
                                  return this._parseCallExpr(null);
    // skip unknown
    this._skip();
    return null;
  }

  // ── r1 $-> <type>:val, … ; ───────────────────────────────────────────────
  _parseRegWrite () {
    const reg = this._eat(T.REGISTER).val;
    this._eat(T.DOLLAR_ARROW);
    const assignments = [this._parseTypedValue()];
    while (this._cur().type === T.COMMA) {
      this._eat(T.COMMA);
      assignments.push(this._parseTypedValue());
    }
    this._eatOpt(T.SEMICOLON);
    return N.RegWrite(reg, assignments);
  }

  // ── <type>:value  or  plain literal ───────────────────────────────────────
  _parseTypedValue () {
    if (this._cur().type === T.TAG) {
      const tagTok = this._cur().val;
      this._skip();
      // expect COLON slot/value
      if (this._cur().type === T.COLON) {
        const slot = this._eat(T.COLON).val;
        return N.TypedValue(tagTok.name, slot);
      }
      return N.TypedValue(tagTok.name, null);
    }
    return this._parseLiteral();
  }

  // ── free(r1, r2, …) ───────────────────────────────────────────────────────
  _parseFreeStmt () {
    this._eat(T.FREE);
    // read register list (optional parens - we check for REGISTER tokens)
    const regs = [];
    if (this._cur().type === T.REGISTER) regs.push(this._eat(T.REGISTER).val);
    while (this._cur().type === T.COMMA) {
      this._eat(T.COMMA);
      if (this._cur().type === T.REGISTER) regs.push(this._eat(T.REGISTER).val);
    }
    this._eatOpt(T.SEMICOLON);
    return N.FreeStmt(regs);
  }

  // ── @directive  or  @directive .portion --->func --> args -> <tag><$rX> ──
  _parseDirectiveStmt () {
    const dir  = this._eat(T.DIRECTIVE).val;
    this._skipNewlines();
    // If followed by a call-chain, parse it
    if (this._cur().type === T.DOT || this._cur().type === T.ARROW_TRIPLE) {
      const call = this._parseCallExpr(dir);
      return call;
    }
    return N.DirectiveStmt(dir, null);
  }

  // ── .portion --->funcName --> arg, arg -> <tag><$rX>; ────────────────────
  _parseCallExpr (directive) {
    let portion = null;
    if (this._cur().type === T.DOT) {
      this._eat(T.DOT);
      portion = this._eat(T.IDENTIFIER).val;
    }
    this._eat(T.ARROW_TRIPLE);
    const func = this._eat(T.IDENTIFIER).val;

    const args = [];
    if (this._cur().type === T.ARROW_DOUBLE) {
      this._eat(T.ARROW_DOUBLE);
      args.push(this._parseArg());
      while (this._cur().type === T.COMMA) {
        this._eat(T.COMMA);
        args.push(this._parseArg());
      }
    }

    let tag = null;
    if (this._cur().type === T.ARROW_SINGLE) {
      this._eat(T.ARROW_SINGLE);
      if (this._cur().type === T.TAG) {
        const tv = this._cur().val;
        tag = N.TagNode(tv.name, tv.regRef);
        this._skip();
      }
    }
    this._eatOpt(T.SEMICOLON);
    return N.CallExpr(portion, func, args, tag, directive);
  }

  // ── Individual argument (register-read, typed-value, literal, identifier) ─
  _parseArg () {
    const t = this._cur();
    if (t.type === T.REG_DEREF) {
      this._skip();
      return N.RegRead(t.val.reg, t.val.slot);
    }
    if (t.type === T.REG_SLOT) {
      this._skip();
      return N.RegRead(t.val.reg, t.val.slot);
    }
    if (t.type === T.REGISTER) {
      this._skip();
      return N.RegRead(t.val, null);
    }
    if (t.type === T.TAG) {
      const tv = t.val;
      this._skip();
      if (this._cur().type === T.COLON) {
        const slot = this._eat(T.COLON).val;
        return N.TypedValue(tv.name, slot);
      }
      return N.TagNode(tv.name, tv.regRef);
    }
    return this._parseLiteral();
  }

  // ── Literal node ──────────────────────────────────────────────────────────
  _parseLiteral () {
    const t = this._cur();
    if (t.type === T.NUMBER_LIT) { this._skip(); return N.Literal('num',  t.val); }
    if (t.type === T.STRING_LIT) { this._skip(); return N.Literal('str',  t.val); }
    if (t.type === T.BOOL_LIT)   { this._skip(); return N.Literal('bool', t.val); }
    if (t.type === T.IDENTIFIER) { this._skip(); return N.Identifier(t.val); }
    this._skip(); return N.Literal('let', null);
  }

  // ── result([funcs], [structs]) ─────────────────────────────────────────────
  _parseResultArgs () {
    const exports = [];
    // Expect a series of [...] lists separated by commas
    while (this._cur().type !== T.SEMICOLON && this._cur().type !== T.EOF &&
           this._cur().type !== T.NEWLINE) {
      if (this._cur().val === '[' || this._cur().type === T.IDENTIFIER) {
        // consume bracket notation: ([funcs], [structs])
        if (this._cur().val === '[') this._skip();
        while (this._cur().type === T.IDENTIFIER) {
          exports.push(this._eat(T.IDENTIFIER).val);
          this._eatOpt(T.COMMA);
        }
        if (this._cur().val === ']') this._skip();
        this._eatOpt(T.COMMA);
      } else {
        this._skip();
      }
    }
    return exports;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §5  REGISTER FILE  (r1..r8, 4 typed slots each)
// ═══════════════════════════════════════════════════════════════════════════════

class ZetaRegisterFile {
  constructor () {
    // Each register: array of ZL_REG_SLOTS slots, each { type, value }
    this._regs = Array.from({ length: ZL_MAX_REGS + 1 }, () =>
      Array.from({ length: ZL_REG_SLOTS }, () => ({ type: 'let', value: null }))
    );
    this._lock = new Set();  // registers locked by ongoing computation
  }

  _validateReg  (r) { if (r < 1 || r > ZL_MAX_REGS) throw new ZetaError(`Invalid register r${r}`); }
  _validateSlot (s) { if (s < 0 || s >= ZL_REG_SLOTS) throw new ZetaError(`Invalid slot :${s}`); }

  /**
   * Write to register r, filling consecutive slots from assignments[].
   * Each assignment: { typeTok, value } → TypedValue node.
   */
  write (r, assignments) {
    this._validateReg(r);
    if (this._lock.has(r)) throw new ZetaError(`Register r${r} is locked`);
    assignments.forEach((a, i) => {
      if (i >= ZL_REG_SLOTS) return;
      this._regs[r][i] = { type: a.typeTok || 'let', value: a.value };
    });
  }

  /** Write a single slot with a typed value */
  writeSlot (r, slot, type, value) {
    this._validateReg(r); this._validateSlot(slot);
    this._regs[r][slot] = { type, value };
  }

  /** Read entire register → array of slot objects */
  read (r) {
    this._validateReg(r);
    return this._regs[r].slice();
  }

  /** Read a specific slot */
  readSlot (r, slot) {
    this._validateReg(r); this._validateSlot(slot);
    return this._regs[r][slot];
  }

  /** Read register: if slot specified return that slot's value, else all */
  readValue (r, slot = null) {
    if (slot !== null) return this.readSlot(r, slot).value;
    const all = this.read(r);
    // If only first slot is set, return it directly; else return array
    const nonNull = all.filter(s => s.value !== null);
    return nonNull.length === 1 ? nonNull[0].value : all.map(s => s.value);
  }

  /** Free (zero-out) one or more registers */
  free (...regs) {
    for (const r of regs) {
      this._validateReg(r);
      this._lock.delete(r);
      this._regs[r] = Array.from({ length: ZL_REG_SLOTS }, () => ({ type:'let', value:null }));
    }
  }

  lock   (r) { this._validateReg(r); this._lock.add(r); }
  unlock (r) { this._validateReg(r); this._lock.delete(r); }

  dump () {
    const out = {};
    for (let r = 1; r <= ZL_MAX_REGS; r++) {
      out[`r${r}`] = this._regs[r].map((s, i) => `[${i}] ${s.type}=${JSON.stringify(s.value)}`).join('  ');
    }
    return out;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §6  MEMORY MANAGER
// ═══════════════════════════════════════════════════════════════════════════════

class ZetaMemoryManager {
  constructor () {
    this._heap    = new Map();   // address → { size, type, data, freed }
    this._nextAddr = 0x1000;
    this._stats    = { allocs: 0, frees: 0, bytesAllocated: 0 };
  }

  alloc (type, data) {
    const addr = this._nextAddr++;
    const size = this._sizeof(type, data);
    this._heap.set(addr, { size, type, data, freed: false, ts: Date.now() });
    this._stats.allocs++;
    this._stats.bytesAllocated += size;
    return addr;
  }

  read (addr) {
    const cell = this._heap.get(addr);
    if (!cell)        throw new ZetaError(`Memory read: invalid address 0x${addr.toString(16)}`);
    if (cell.freed)   throw new ZetaError(`Memory read: use-after-free at 0x${addr.toString(16)}`);
    return cell.data;
  }

  write (addr, data) {
    const cell = this._heap.get(addr);
    if (!cell || cell.freed) throw new ZetaError(`Memory write: invalid address`);
    cell.data = data;
  }

  free (addr) {
    const cell = this._heap.get(addr);
    if (!cell) return;
    cell.freed = true;
    this._stats.frees++;
  }

  freeAll () {
    for (const [addr, cell] of this._heap) cell.freed = true;
    this._stats.frees += this._heap.size;
  }

  _sizeof (type, data) {
    if (type === 'num')   return 8;
    if (type === 'bool')  return 1;
    if (type === 'str')   return typeof data === 'string' ? data.length * 2 : 0;
    if (type === 'array') return Array.isArray(data) ? data.length * 8 : 0;
    return 64;  // 'let' / unknown
  }

  stats () { return { ...this._stats, liveObjects: [...this._heap.values()].filter(c => !c.freed).length }; }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §7  TAG ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

class ZetaTagEngine {
  constructor (runtime) {
    this._rt = runtime;  // ZetaRuntime reference
    this._handlers = new Map();
    this._installBuiltinTags();
  }

  register (name, fn) { this._handlers.set(name, fn); }

  execute (tagName, ctx) {
    const h = this._handlers.get(tagName);
    if (!h) throw new ZetaError(`Unknown tag <${tagName}>`);
    return h(ctx, this._rt);
  }

  _installBuiltinTags () {
    const R = this;

    // ── <getVal> – extract computed value from context ─────────────────────
    R.register('getVal', (ctx) => ctx.value !== undefined ? ctx.value : ctx);

    // ── <cast> – type-cast value ───────────────────────────────────────────
    R.register('cast', (ctx) => {
      const { value, targetType } = ctx;
      if (targetType === 'num')   return Number(value);
      if (targetType === 'str')   return String(value);
      if (targetType === 'bool')  return Boolean(value);
      if (targetType === 'array') return Array.isArray(value) ? value : [value];
      return value;
    });

    // ── <calc> – safe arithmetic (sandboxed, no raw operators reach ZPP) ───
    R.register('calc', (ctx) => {
      const { op, a, b } = ctx;
      const ops = {
        add   : (x, y) => x + y,   sub   : (x, y) => x - y,
        mul   : (x, y) => x * y,   div   : (x, y) => y !== 0 ? x / y : Infinity,
        mod   : (x, y) => x % y,   pow   : (x, y) => Math.pow(x, y),
        neg   : (x)    => -x,       abs   : (x)    => Math.abs(x),
        sqrt  : (x)    => Math.sqrt(x),  floor : (x) => Math.floor(x),
        ceil  : (x)    => Math.ceil(x),  round : (x) => Math.round(x),
        min   : (x, y) => Math.min(x, y), max  : (x, y) => Math.max(x, y),
        clamp : (x, lo, hi) => Math.min(Math.max(x, lo), hi),
        lerp  : (x, y, t) => x + (y - x) * t,
      };
      const fn = ops[op];
      if (!fn) throw new ZetaError(`<calc>: unknown op "${op}"`);
      return fn(a, b, ctx.c);
    });

    // ── <cmp> – comparison ─────────────────────────────────────────────────
    R.register('cmp', (ctx) => {
      const { op, a, b } = ctx;
      if (op === 'eq')  return a === b;
      if (op === 'neq') return a !== b;
      if (op === 'lt')  return a < b;
      if (op === 'lte') return a <= b;
      if (op === 'gt')  return a > b;
      if (op === 'gte') return a >= b;
      throw new ZetaError(`<cmp>: unknown op "${op}"`);
    });

    // ── <logic> – boolean operations ──────────────────────────────────────
    R.register('logic', (ctx) => {
      if (ctx.op === 'and')  return ctx.a && ctx.b;
      if (ctx.op === 'or')   return ctx.a || ctx.b;
      if (ctx.op === 'not')  return !ctx.a;
      if (ctx.op === 'xor')  return !!(ctx.a) !== !!(ctx.b);
      throw new ZetaError(`<logic>: unknown op`);
    });

    // ── <bit> – bitwise operations ─────────────────────────────────────────
    R.register('bit', (ctx) => {
      const { op, a, b } = ctx;
      if (op === 'and')  return a & b;
      if (op === 'or')   return a | b;
      if (op === 'xor')  return a ^ b;
      if (op === 'not')  return ~a;
      if (op === 'shl')  return a << b;
      if (op === 'shr')  return a >> b;
      if (op === 'ushr') return a >>> b;
      throw new ZetaError(`<bit>: unknown op`);
    });

    // ── <mem> – memory operation ───────────────────────────────────────────
    R.register('mem', (ctx) => {
      const mm = R._rt.memory;
      if (ctx.op === 'alloc')  return mm.alloc(ctx.type || 'let', ctx.data);
      if (ctx.op === 'read')   return mm.read(ctx.addr);
      if (ctx.op === 'write')  { mm.write(ctx.addr, ctx.data); return ctx.addr; }
      if (ctx.op === 'free')   { mm.free(ctx.addr);  return null; }
      if (ctx.op === 'stats')  return mm.stats();
      throw new ZetaError(`<mem>: unknown op`);
    });

    // ── <flow> – control flow modifier ────────────────────────────────────
    R.register('flow', (ctx) => {
      if (ctx.op === 'if')     return ctx.condition ? ctx.then : ctx.else;
      if (ctx.op === 'unless') return !ctx.condition ? ctx.then : ctx.else;
      if (ctx.op === 'when')   return ctx.condition ? (ctx.action(), null) : null;
      return ctx.value;
    });

    // ── <loop> – loop helper (returns loop descriptor) ─────────────────────
    R.register('loop', (ctx) => {
      const { from, to, step, body } = ctx;
      const results = [];
      const s = step || 1;
      for (let i = from || 0; s > 0 ? i < to : i > to; i += s) {
        if (typeof body === 'function') results.push(body(i));
      }
      return results;
    });

    // ── <iter> – iterable helper ───────────────────────────────────────────
    R.register('iter', (ctx) => {
      const { items, body } = ctx;
      if (!Array.isArray(items)) return [];
      return items.map(body || (x => x));
    });

    // ── <io> – terminal / stream I/O ──────────────────────────────────────
    R.register('io', (ctx) => {
      if (ctx.op === 'print' || ctx.op === 'write') {
        if (typeof process !== 'undefined' && process.stdout)
          process.stdout.write(String(ctx.data));
        else console.log(ctx.data);
        return null;
      }
      if (ctx.op === 'println') {
        console.log(ctx.data); return null;
      }
      if (ctx.op === 'read') {
        // sync stdin read (Node only)
        if (typeof require !== 'undefined') {
          try {
            const fs = require('fs');
            const buf = Buffer.alloc(4096);
            const n = fs.readSync(0, buf, 0, buf.length, null);
            return buf.slice(0, n).toString().trim();
          } catch (_) { return null; }
        }
        return null;
      }
      return null;
    });

    // ── <render> – signal GUI/3D render ───────────────────────────────────
    R.register('render', (ctx) => {
      const gui = R._rt.gui;
      if (gui && ctx.target) return gui.render(ctx.target, ctx.data);
      return ctx.data;  // pass-through if no GUI active
    });

    // ── <event> – event system ────────────────────────────────────────────
    R.register('event', (ctx) => {
      const eb = R._rt.eventBus;
      if (ctx.op === 'emit') { eb.emit(ctx.name, ctx.data); return null; }
      if (ctx.op === 'on')   { eb.on(ctx.name, ctx.handler);   return null; }
      if (ctx.op === 'off')  { eb.off(ctx.name, ctx.handler);  return null; }
      if (ctx.op === 'once') { eb.once(ctx.name, ctx.handler); return null; }
      return null;
    });

    // ── <async> – async scheduling ────────────────────────────────────────
    R.register('async', (ctx) => {
      if (ctx.op === 'spawn') return Promise.resolve().then(() => ctx.fn(ctx.args));
      if (ctx.op === 'delay') return new Promise(res => setTimeout(() => res(ctx.fn()), ctx.ms));
      if (ctx.op === 'all')   return Promise.all(ctx.promises);
      if (ctx.op === 'race')  return Promise.race(ctx.promises);
      return null;
    });

    // ── <err> – error creation ────────────────────────────────────────────
    R.register('err', (ctx) => {
      if (ctx.op === 'throw') throw new ZetaError(ctx.message || 'Unhandled zeta error');
      if (ctx.op === 'make')  return new ZetaError(ctx.message);
      return null;
    });

    // ── <fmt> – string formatting ─────────────────────────────────────────
    R.register('fmt', (ctx) => {
      if (ctx.op === 'template') {
        let s = ctx.template;
        for (const [k, v] of Object.entries(ctx.vars || {}))
          s = s.replaceAll(`{${k}}`, String(v));
        return s;
      }
      if (ctx.op === 'pad')   return String(ctx.value).padStart(ctx.width, ctx.fill || ' ');
      if (ctx.op === 'trunc') return String(ctx.value).slice(0, ctx.len);
      if (ctx.op === 'upper') return String(ctx.value).toUpperCase();
      if (ctx.op === 'lower') return String(ctx.value).toLowerCase();
      if (ctx.op === 'json')  return JSON.stringify(ctx.value, null, ctx.indent || 0);
      return String(ctx.value);
    });

    // ── <shape> – GUI shape descriptor ────────────────────────────────────
    R.register('shape', (ctx) => {
      // returns a shape descriptor consumed by the GUI renderer
      return {
        _zetaShape : true,
        kind       : ctx.kind || 'rect',  // rect | circle | polygon | path | custom
        x          : ctx.x   || 0,
        y          : ctx.y   || 0,
        width      : ctx.w   || 100,
        height     : ctx.h   || 100,
        fill       : ctx.fill   || '#ffffff',
        stroke     : ctx.stroke || 'none',
        strokeWidth: ctx.strokeWidth || 1,
        opacity    : ctx.opacity    || 1,
        radius     : ctx.radius     || 0,
        points     : ctx.points     || null,  // for polygon
        path       : ctx.path       || null,  // for SVG-like path
        clip       : ctx.clip       || null,  // clipping region
      };
    });

    // ── <mesh> – 3D mesh descriptor ───────────────────────────────────────
    R.register('mesh', (ctx) => {
      return {
        _zetaMesh  : true,
        name       : ctx.name || 'mesh_' + Date.now(),
        vertices   : ctx.vertices || [],
        faces      : ctx.faces    || [],
        normals    : ctx.normals  || [],
        uvs        : ctx.uvs      || [],
        material   : ctx.material || null,
      };
    });

    // ── <physics> – physics body descriptor ──────────────────────────────
    R.register('physics', (ctx) => {
      return {
        _zetaPhysics : true,
        shape        : ctx.shape  || 'box',   // box | sphere | capsule | mesh
        mass         : ctx.mass   || 1,
        restitution  : ctx.restitution || 0.3,
        friction     : ctx.friction    || 0.5,
        kinematic    : ctx.kinematic   || false,
        position     : ctx.pos   || { x:0, y:0, z:0 },
        velocity     : ctx.vel   || { x:0, y:0, z:0 },
        angularVel   : ctx.angVel || { x:0, y:0, z:0 },
      };
    });

    // ── <shader> – shader program descriptor ─────────────────────────────
    R.register('shader', (ctx) => {
      return {
        _zetaShader : true,
        vertexSrc   : ctx.vert || ZetaEngine3D.DEFAULT_VERT_SRC,
        fragmentSrc : ctx.frag || ZetaEngine3D.DEFAULT_FRAG_SRC,
        uniforms    : ctx.uniforms || {},
        attributes  : ctx.attributes || ['position','normal','uv'],
      };
    });

    // ── <input> – input event descriptor ─────────────────────────────────
    R.register('input', (ctx) => {
      const im = R._rt.inputManager;
      if (!im) return null;
      if (ctx.op === 'isDown') return im.isKeyDown(ctx.key);
      if (ctx.op === 'mouse')  return im.getMouseState();
      if (ctx.op === 'bind')   { im.bind(ctx.key, ctx.action, ctx.fn); return null; }
      return im.getState();
    });

    // ── <debug> – debug ops ───────────────────────────────────────────────
    R.register('debug', (ctx) => {
      if (ctx.op === 'dump')      { console.log('[ZETA DBG]', ctx.label, ctx.value); return null; }
      if (ctx.op === 'regDump')   { console.table(R._rt.registers.dump()); return null; }
      if (ctx.op === 'memStats')  { console.log('[ZETA MEM]', R._rt.memory.stats()); return null; }
      if (ctx.op === 'assert') {
        if (!ctx.condition) throw new ZetaError(`<assert> failed: ${ctx.message || 'assertion error'}`);
        return null;
      }
      if (ctx.op === 'trace')     { console.trace('[ZETA TRACE]', ctx.label); return null; }
      return null;
    });

    // ── <type> – type introspection ───────────────────────────────────────
    R.register('type', (ctx) => {
      const v = ctx.value;
      if (v === null || v === undefined) return 'let';
      if (typeof v === 'number')  return 'num';
      if (typeof v === 'string')  return 'str';
      if (typeof v === 'boolean') return 'bool';
      if (Array.isArray(v))       return 'array';
      return 'let';
    });

    // ── <arr> – array operations ──────────────────────────────────────────
    R.register('arr', (ctx) => {
      const a = ctx.arr || [];
      if (ctx.op === 'push')    { const c = [...a, ctx.val]; return c; }
      if (ctx.op === 'pop')     return a.slice(0, -1);
      if (ctx.op === 'head')    return a[0];
      if (ctx.op === 'tail')    return a.slice(1);
      if (ctx.op === 'len')     return a.length;
      if (ctx.op === 'get')     return a[ctx.idx];
      if (ctx.op === 'set')     { const c = [...a]; c[ctx.idx] = ctx.val; return c; }
      if (ctx.op === 'map')     return a.map(ctx.fn);
      if (ctx.op === 'filter')  return a.filter(ctx.fn);
      if (ctx.op === 'reduce')  return a.reduce(ctx.fn, ctx.init);
      if (ctx.op === 'concat')  return a.concat(ctx.other || []);
      if (ctx.op === 'slice')   return a.slice(ctx.from, ctx.to);
      if (ctx.op === 'sort')    return [...a].sort(ctx.fn);
      if (ctx.op === 'reverse') return [...a].reverse();
      if (ctx.op === 'flat')    return a.flat(ctx.depth || 1);
      if (ctx.op === 'uniq')    return [...new Set(a)];
      if (ctx.op === 'find')    return a.find(ctx.fn);
      if (ctx.op === 'includes')return a.includes(ctx.val);
      return a;
    });

    // ── <str> – string operations ─────────────────────────────────────────
    R.register('str', (ctx) => {
      const s = String(ctx.val || '');
      if (ctx.op === 'len')      return s.length;
      if (ctx.op === 'upper')    return s.toUpperCase();
      if (ctx.op === 'lower')    return s.toLowerCase();
      if (ctx.op === 'trim')     return s.trim();
      if (ctx.op === 'split')    return s.split(ctx.sep || '');
      if (ctx.op === 'join')     return (ctx.arr || []).join(ctx.sep || '');
      if (ctx.op === 'includes') return s.includes(ctx.sub);
      if (ctx.op === 'startsWith') return s.startsWith(ctx.sub);
      if (ctx.op === 'endsWith') return s.endsWith(ctx.sub);
      if (ctx.op === 'replace')  return s.replace(ctx.from, ctx.to);
      if (ctx.op === 'replaceAll') return s.replaceAll(ctx.from, ctx.to);
      if (ctx.op === 'slice')    return s.slice(ctx.from, ctx.to);
      if (ctx.op === 'pad')      return s.padStart(ctx.width, ctx.fill || ' ');
      if (ctx.op === 'repeat')   return s.repeat(ctx.n);
      if (ctx.op === 'charCode') return s.charCodeAt(ctx.idx || 0);
      return s;
    });

    // ── <hash> – hashing ──────────────────────────────────────────────────
    R.register('hash', (ctx) => {
      // FNV-1a 32-bit (pure JS, no native deps)
      const s = String(ctx.value);
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
      }
      return '0x' + h.toString(16).padStart(8, '0');
    });

    // ── <rand> – random utilities ─────────────────────────────────────────
    R.register('rand', (ctx) => {
      if (ctx.op === 'float')  return Math.random();
      if (ctx.op === 'int')    return Math.floor(Math.random() * (ctx.max - ctx.min + 1)) + ctx.min;
      if (ctx.op === 'bool')   return Math.random() > 0.5;
      if (ctx.op === 'pick')   return ctx.arr[Math.floor(Math.random() * ctx.arr.length)];
      if (ctx.op === 'shuffle') { const a=[...ctx.arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
      return Math.random();
    });

    // ── <time> – timing utilities ─────────────────────────────────────────
    R.register('time', (ctx) => {
      if (ctx.op === 'now')    return Date.now();
      if (ctx.op === 'iso')    return new Date().toISOString();
      if (ctx.op === 'delta')  return Date.now() - (ctx.start || 0);
      if (ctx.op === 'perf')   return typeof performance !== 'undefined' ? performance.now() : Date.now();
      return Date.now();
    });

    // ── <pipe> – functional pipeline ─────────────────────────────────────
    R.register('pipe', (ctx) => {
      let val = ctx.value;
      for (const fn of (ctx.fns || [])) val = fn(val);
      return val;
    });

    // ── <scope> – isolated scope execution ───────────────────────────────
    R.register('scope', (ctx) => {
      const saved = R._rt.registers.dump();
      const result = typeof ctx.fn === 'function' ? ctx.fn() : ctx.value;
      // registers are NOT restored (scope just tracks the snapshot)
      return result;
    });

    // ── <anim> – animation frame helper ──────────────────────────────────
    R.register('anim', (ctx) => {
      if (typeof requestAnimationFrame !== 'undefined') {
        if (ctx.op === 'start') return requestAnimationFrame(ctx.fn);
        if (ctx.op === 'stop')  { cancelAnimationFrame(ctx.id); return null; }
      }
      return null;
    });

    // ── <json> – JSON operations ──────────────────────────────────────────
    R.register('json', (ctx) => {
      if (ctx.op === 'parse') {
        try { return JSON.parse(ctx.value); } catch { return null; }
      }
      if (ctx.op === 'stringify') return JSON.stringify(ctx.value, null, ctx.indent || 0);
      if (ctx.op === 'clone')     return JSON.parse(JSON.stringify(ctx.value));
      return null;
    });

    // ── <sys> – system information ────────────────────────────────────────
    R.register('sys', (ctx) => {
      if (ctx.op === 'platform') return typeof process !== 'undefined' ? process.platform : 'browser';
      if (ctx.op === 'version')  return ZL_VERSION;
      if (ctx.op === 'env')      return typeof process !== 'undefined' ? (process.env[ctx.key] || null) : null;
      if (ctx.op === 'argv')     return typeof process !== 'undefined' ? process.argv : [];
      return null;
    });

    // ── <net> – fetch helper (async) ──────────────────────────────────────
    R.register('net', (ctx) => {
      if (ctx.op === 'fetch') {
        const opts = { method: ctx.method || 'GET', headers: ctx.headers || {} };
        if (ctx.body) opts.body = JSON.stringify(ctx.body);
        return (typeof fetch !== 'undefined' ? fetch : null)?.(ctx.url, opts)
          .then(r => ctx.json ? r.json() : r.text())
          .catch(e => ({ error: e.message }));
      }
      return null;
    });

    // ── <buf> – binary buffer ─────────────────────────────────────────────
    R.register('buf', (ctx) => {
      if (typeof Buffer !== 'undefined') {
        if (ctx.op === 'alloc')  return Buffer.alloc(ctx.size);
        if (ctx.op === 'from')   return Buffer.from(ctx.data, ctx.enc || 'utf8');
        if (ctx.op === 'toHex')  return ctx.buf.toString('hex');
        if (ctx.op === 'toB64')  return ctx.buf.toString('base64');
      }
      return null;
    });

    // ── <particle> – particle system descriptor ───────────────────────────
    R.register('particle', (ctx) => {
      return {
        _zetaParticle : true,
        count         : ctx.count      || 100,
        lifetime      : ctx.lifetime   || 2.0,
        emitRate      : ctx.emitRate   || 10,
        position      : ctx.pos        || { x:0, y:0, z:0 },
        velocity      : ctx.vel        || { x:0, y:1, z:0 },
        spread        : ctx.spread     || 0.5,
        color         : ctx.color      || [1, 0.5, 0, 1],
        size          : ctx.size       || 0.1,
        gravity       : ctx.gravity    || -9.8,
        texture       : ctx.texture    || null,
        blendMode     : ctx.blendMode  || 'additive',
      };
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §8  DIRECTIVE ENGINE  (@-directive handlers)
// ═══════════════════════════════════════════════════════════════════════════════

class ZetaDirectiveEngine {
  constructor (runtime) {
    this._rt       = runtime;
    this._active   = new Set();   // currently-active directives
    this._handlers = new Map();
    this._installDirectives();
  }

  activate   (name)  { this._active.add(name);    }
  deactivate (name)  { this._active.delete(name); }
  isActive   (name)  { return this._active.has(name); }

  handle (name, payload) {
    const h = this._handlers.get(name);
    if (!h) throw new ZetaError(`Unknown directive @${name}`);
    return h(payload, this._rt);
  }

  _reg (name, fn) { this._handlers.set(name, fn); }

  _installDirectives () {
    const R = this;

    // @glb – promote execution to global scope
    R._reg('glb', (payload, rt) => {
      rt.globalScope[payload.name] = payload.value;
      return payload.value;
    });

    // @term – terminal/console operations
    R._reg('term', (payload, rt) => {
      const term = rt.terminal;
      if (payload.op === 'write')   term.write(payload.data);
      if (payload.op === 'clear')   term.clear();
      if (payload.op === 'setTitle')term.setTitle(payload.title);
      return null;
    });

    // @gui – GUI subsystem bootstrap
    R._reg('gui', (payload, rt) => {
      if (!rt.gui) rt.gui = new ZetaGUI(rt);
      if (payload && payload.op === 'createWindow') return rt.gui.createWindow(payload);
      if (payload && payload.op === 'show')         rt.gui.show();
      if (payload && payload.op === 'hide')         rt.gui.hide();
      return rt.gui;
    });

    // @engine – 3D engine bootstrap
    R._reg('engine', (payload, rt) => {
      if (!rt.engine3d) rt.engine3d = new ZetaEngine3D(rt);
      if (payload && payload.op === 'newScene')   return rt.engine3d.newScene(payload.name);
      if (payload && payload.op === 'addMesh')    return rt.engine3d.addMesh(payload.scene, payload.mesh);
      if (payload && payload.op === 'addLight')   return rt.engine3d.addLight(payload.scene, payload.light);
      if (payload && payload.op === 'setCamera')  return rt.engine3d.setCamera(payload.scene, payload.camera);
      if (payload && payload.op === 'step')       return rt.engine3d.step(payload.dt);
      if (payload && payload.op === 'render')     return rt.engine3d.render(payload.scene);
      return rt.engine3d;
    });

    // @mem – memory manager access
    R._reg('mem', (payload, rt) => {
      const mm = rt.memory;
      if (!payload) return mm.stats();
      if (payload.op === 'alloc')  return mm.alloc(payload.type, payload.data);
      if (payload.op === 'free')   return mm.free(payload.addr);
      if (payload.op === 'stats')  return mm.stats();
      if (payload.op === 'freeAll')mm.freeAll();
      return null;
    });

    // @sys – system-level hooks
    R._reg('sys', (payload, rt) => {
      if (payload.op === 'exit')   {
        if (typeof process !== 'undefined') process.exit(payload.code || 0);
        return null;
      }
      if (payload.op === 'info')   return { version: ZL_VERSION, platform: typeof process !== 'undefined' ? process.platform : 'browser' };
      if (payload.op === 'gc')     rt.memory.freeAll();
      return null;
    });

    // @async – async context
    R._reg('async', (payload) => {
      if (payload.op === 'run') return (async () => payload.fn())();
      return null;
    });

    // @import – module import
    R._reg('import', (payload, rt) => {
      return rt.moduleLoader.load(payload.name);
    });

    // @export – symbol export
    R._reg('export', (payload, rt) => {
      rt.exports[payload.name] = payload.value;
      return null;
    });

    // @debug – debug mode
    R._reg('debug', (payload, rt) => {
      rt._debugMode = !!(payload && payload.on !== false);
      if (rt._debugMode) console.log('[ZETA] Debug mode ON');
      return null;
    });

    // @net – network subsystem
    R._reg('net', (payload) => {
      if (!payload) return null;
      return R._rt.tags.execute('net', payload);
    });

    // @fs – file-system access (Node / Electron)
    R._reg('fs', (payload) => {
      if (typeof require === 'undefined') return null;
      const fs = require('fs');
      if (payload.op === 'read')   return fs.readFileSync(payload.path, 'utf8');
      if (payload.op === 'write')  { fs.writeFileSync(payload.path, payload.data); return null; }
      if (payload.op === 'exists') return fs.existsSync(payload.path);
      if (payload.op === 'ls')     return fs.readdirSync(payload.path);
      return null;
    });

    // @crypto – crypto helpers
    R._reg('crypto', (payload) => {
      if (typeof require !== 'undefined') {
        const crypto = require('crypto');
        if (payload.op === 'sha256') return crypto.createHash('sha256').update(payload.data).digest('hex');
        if (payload.op === 'uuid')   return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
        if (payload.op === 'rand')   return crypto.randomBytes(payload.n || 16).toString('hex');
      }
      return null;
    });

    // @thread – worker-thread helpers (Node 12+)
    R._reg('thread', (payload) => {
      if (typeof require !== 'undefined') {
        try {
          const { Worker } = require('worker_threads');
          if (payload.op === 'spawn') return new Worker(payload.code, { eval: true });
        } catch (_) {}
      }
      return null;
    });

    // @bench – micro-benchmarking
    R._reg('bench', (payload) => {
      const start = Date.now();
      if (typeof payload.fn === 'function') {
        const n = payload.runs || 1000;
        for (let i = 0; i < n; i++) payload.fn();
      }
      return { ms: Date.now() - start, runs: payload.runs || 1000 };
    });

    // @hot – hot-reload trigger
    R._reg('hot', (payload, rt) => {
      if (typeof payload.src === 'string') {
        rt.execute(payload.src);  // re-execute source
      }
      return null;
    });

    // @wasm – WebAssembly module loader
    R._reg('wasm', async (payload) => {
      const resp = await fetch(payload.url);
      const buf  = await resp.arrayBuffer();
      const mod  = await WebAssembly.instantiate(buf, payload.imports || {});
      return mod.instance.exports;
    });

    // @strict – enable strict-mode validation
    R._reg('strict', (payload, rt) => {
      rt._strict = !!(payload && payload.on !== false);
      return null;
    });

    // @unsafe – bypass runtime safety guards
    R._reg('unsafe', (payload, rt) => {
      console.warn('[ZETA] @unsafe mode enabled – safety guards suspended');
      rt._unsafe = true;
      return null;
    });

    // @sandbox – hard-isolate a portion
    R._reg('sandbox', (payload) => {
      // returns a sandboxed copy of the portion registry
      return { sandboxed: true, name: payload.portion };
    });

    // @native – call into host native function
    R._reg('native', (payload) => {
      if (typeof payload.fn === 'function') return payload.fn(...(payload.args || []));
      return null;
    });

    // @macro – define a compile-time macro
    R._reg('macro', (payload, rt) => {
      rt.macros[payload.name] = payload.body;
      return null;
    });

    // @deprecated – emit deprecation warning
    R._reg('deprecated', (payload) => {
      console.warn(`[ZETA DEPRECATED] ${payload.name}: ${payload.message || 'This symbol is deprecated'}`);
      return null;
    });

    // @experimental – log experimental API usage
    R._reg('experimental', (payload) => {
      console.warn(`[ZETA EXPERIMENTAL] ${payload.name || '?'} — API may change`);
      return null;
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §9  PORTION REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

class ZetaPortionRegistry {
  constructor () {
    this._portions = new Map();  // name → { funcs, structs }
  }

  registerPortion (name) {
    if (!this._portions.has(name))
      this._portions.set(name, { name, funcs: new Map(), structs: new Map() });
    return this._portions.get(name);
  }

  registerFunc (portionName, funcName, fn, params) {
    const p = this.registerPortion(portionName);
    p.funcs.set(funcName, { fn, params, name: funcName });
  }

  registerStruct (portionName, structName, fields) {
    const p = this.registerPortion(portionName);
    p.structs.set(structName, { fields, name: structName });
  }

  call (portionName, funcName, args) {
    const p = this._portions.get(portionName);
    if (!p) throw new ZetaError(`Portion ".${portionName}" not found`);
    const f = p.funcs.get(funcName);
    if (!f) throw new ZetaError(`Function "${funcName}" not found in ".${portionName}"`);
    return f.fn(...args);
  }

  has (portionName, funcName) {
    return this._portions.has(portionName) &&
           this._portions.get(portionName).funcs.has(funcName);
  }

  listPortions () { return [...this._portions.keys()]; }
  listFuncs (p)   { return [...(this._portions.get(p)?.funcs.keys() || [])]; }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §10  EVENT BUS
// ═══════════════════════════════════════════════════════════════════════════════

class ZetaEventBus {
  constructor () { this._listeners = new Map(); }

  on   (event, fn) { if (!this._listeners.has(event)) this._listeners.set(event, []); this._listeners.get(event).push({ fn, once: false }); }
  once (event, fn) { if (!this._listeners.has(event)) this._listeners.set(event, []); this._listeners.get(event).push({ fn, once: true  }); }
  off  (event, fn) {
    if (!this._listeners.has(event)) return;
    this._listeners.set(event, this._listeners.get(event).filter(l => l.fn !== fn));
  }
  emit (event, data) {
    if (!this._listeners.has(event)) return;
    const keep = [];
    for (const l of this._listeners.get(event)) {
      l.fn(data);
      if (!l.once) keep.push(l);
    }
    this._listeners.set(event, keep);
  }
  removeAll (event) { this._listeners.delete(event); }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §11  ZETA GUI  (Electron BrowserWindow + Canvas pipeline)
// ═══════════════════════════════════════════════════════════════════════════════

class ZetaGUI {
  constructor (runtime) {
    this._rt       = runtime;
    this._windows  = new Map();
    this._nextWinId = 1;
    this._renderer = new ZetaCanvasRenderer();
    this._shapes   = [];
    this._layers   = new Map();   // layerName → []
    this._isElectron = typeof process !== 'undefined' &&
                       process.versions && !!process.versions.electron;
  }

  // ── Window management ─────────────────────────────────────────────────────
  createWindow (opts = {}) {
    const id     = this._nextWinId++;
    const config = {
      id,
      title  : opts.title  || 'Zeta Window',
      width  : opts.width  || 800,
      height : opts.height || 600,
      shape  : opts.shape  || 'rect',   // rect | rounded | ellipse | polygon | custom
      visible: true,
      canvas : null,
      win    : null,
    };

    if (this._isElectron) {
      config.win = this._createElectronWindow(config);
    } else if (typeof document !== 'undefined') {
      config.canvas = this._createBrowserCanvas(config);
    }

    this._windows.set(id, config);
    this._rt.eventBus.emit('gui:windowCreated', config);
    return id;
  }

  _createElectronWindow (cfg) {
    try {
      const { BrowserWindow } = require('electron');
      const win = new BrowserWindow({
        width          : cfg.width,
        height         : cfg.height,
        title          : cfg.title,
        frame          : cfg.shape === 'rect',
        transparent    : cfg.shape !== 'rect',
        hasShadow      : true,
        webPreferences : { contextIsolation: true, nodeIntegration: false },
      });
      if (cfg.shape !== 'rect') {
        // Non-rectangular: use setShape API (Linux/Windows Electron 13+)
        const region = this._buildWindowRegion(cfg);
        win.setShape(region);
      }
      return win;
    } catch (e) {
      console.warn('[ZetaGUI] Electron not available:', e.message);
      return null;
    }
  }

  _createBrowserCanvas (cfg) {
    const canvas  = document.createElement('canvas');
    canvas.width  = cfg.width;
    canvas.height = cfg.height;
    canvas.style.position = 'absolute';
    canvas.style.left     = '0'; canvas.style.top = '0';
    document.body.appendChild(canvas);
    // apply clip path for custom shapes
    if (cfg.shape !== 'rect') {
      canvas.style.clipPath = this._cssClipPath(cfg);
    }
    return canvas;
  }

  _buildWindowRegion (cfg) {
    // Returns an array of rects for Electron setShape
    if (cfg.shape === 'ellipse') {
      const rects = [];
      const cx = cfg.width / 2, cy = cfg.height / 2;
      const rx = cx, ry = cy;
      for (let y = 0; y < cfg.height; y++) {
        const dy = (y - cy) / ry;
        if (Math.abs(dy) > 1) continue;
        const dx = Math.sqrt(1 - dy * dy) * rx;
        rects.push({ x: Math.round(cx - dx), y, width: Math.round(dx * 2), height: 1 });
      }
      return rects;
    }
    if (cfg.shape === 'rounded') {
      const r = cfg.radius || 20;
      // Simplified: corners cut by r×r rects
      return [
        { x: r, y: 0, width: cfg.width - r * 2, height: cfg.height },
        { x: 0, y: r, width: cfg.width, height: cfg.height - r * 2 },
      ];
    }
    return [{ x: 0, y: 0, width: cfg.width, height: cfg.height }];
  }

  _cssClipPath (cfg) {
    if (cfg.shape === 'ellipse') return 'ellipse(50% 50% at 50% 50%)';
    if (cfg.shape === 'rounded') {
      const r = cfg.radius || 20;
      return `inset(0 round ${r}px)`;
    }
    if (cfg.shape === 'polygon' && cfg.points) {
      const pts = cfg.points.map(p => `${p[0]}px ${p[1]}px`).join(', ');
      return `polygon(${pts})`;
    }
    return 'none';
  }

  // ── Rendering pipeline ────────────────────────────────────────────────────
  addToLayer (layerName, shape) {
    if (!this._layers.has(layerName)) this._layers.set(layerName, []);
    this._layers.get(layerName).push(shape);
  }

  render (windowId, shapes) {
    const win = this._windows.get(windowId);
    if (!win) return;
    const canvas = win.canvas || this._renderer.getOffscreenCanvas(win.width, win.height);
    const ctx    = canvas.getContext('2d');
    ctx.clearRect(0, 0, win.width, win.height);
    const allShapes = [...this._shapes, ...(shapes || [])];
    for (const s of allShapes) this._drawShape(ctx, s);
    win.lastFrame = allShapes;
    this._rt.eventBus.emit('gui:frameRendered', { windowId, shapeCount: allShapes.length });
    return allShapes.length;
  }

  _drawShape (ctx, s) {
    if (!s || !s._zetaShape) return;
    ctx.save();
    ctx.globalAlpha = s.opacity !== undefined ? s.opacity : 1;

    // Apply 2D transform if present
    if (s.transform) {
      const { tx = 0, ty = 0, rotation = 0, scaleX = 1, scaleY = 1 } = s.transform;
      ctx.translate(s.x + tx, s.y + ty);
      ctx.rotate(rotation);
      ctx.scale(scaleX, scaleY);
    }

    // Clip region
    if (s.clip) {
      ctx.beginPath();
      ctx.rect(s.clip.x, s.clip.y, s.clip.w, s.clip.h);
      ctx.clip();
    }

    ctx.beginPath();
    if (s.kind === 'rect') {
      if (s.radius > 0) {
        const r = s.radius;
        ctx.moveTo(s.x + r, s.y);
        ctx.arcTo(s.x + s.width, s.y,           s.x + s.width, s.y + s.height, r);
        ctx.arcTo(s.x + s.width, s.y + s.height, s.x,          s.y + s.height, r);
        ctx.arcTo(s.x,           s.y + s.height, s.x,          s.y,            r);
        ctx.arcTo(s.x,           s.y,            s.x + s.width, s.y,           r);
        ctx.closePath();
      } else {
        ctx.rect(s.x, s.y, s.width, s.height);
      }
    } else if (s.kind === 'circle') {
      ctx.arc(s.x, s.y, s.radius || Math.min(s.width, s.height) / 2, 0, Math.PI * 2);
    } else if (s.kind === 'ellipse') {
      ctx.ellipse(s.x + s.width/2, s.y + s.height/2, s.width/2, s.height/2, 0, 0, Math.PI * 2);
    } else if (s.kind === 'polygon' && s.points) {
      ctx.moveTo(s.points[0][0], s.points[0][1]);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i][0], s.points[i][1]);
      ctx.closePath();
    } else if (s.kind === 'path' && s.path) {
      const p = new Path2D(s.path);
      ctx.fill(p); ctx.stroke(p); ctx.restore(); return;
    } else if (s.kind === 'text') {
      ctx.font = `${s.fontSize || 16}px ${s.fontFamily || 'sans-serif'}`;
      ctx.fillStyle = s.fill || '#000';
      ctx.fillText(s.text || '', s.x, s.y);
      ctx.restore(); return;
    } else if (s.kind === 'line') {
      ctx.moveTo(s.x, s.y); ctx.lineTo(s.x2 || s.x, s.y2 || s.y);
    }

    if (s.fill && s.fill !== 'none') {
      if (s.fill.startsWith('linear-gradient') || s.fill._zetaGrad) {
        ctx.fillStyle = this._buildGradient(ctx, s);
      } else {
        ctx.fillStyle = s.fill;
      }
      ctx.fill();
    }
    if (s.stroke && s.stroke !== 'none') {
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth   = s.strokeWidth || 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  _buildGradient (ctx, s) {
    const g = ctx.createLinearGradient(s.x, s.y, s.x + s.width, s.y + s.height);
    (s.fill.stops || []).forEach(([offset, color]) => g.addColorStop(offset, color));
    return g;
  }

  show (windowId) {
    const win = this._windows.get(windowId);
    if (win && win.win) win.win.show();
    if (win && win.canvas) win.canvas.style.display = 'block';
  }
  hide (windowId) {
    const win = this._windows.get(windowId);
    if (win && win.win) win.win.hide();
    if (win && win.canvas) win.canvas.style.display = 'none';
  }
  close (windowId) {
    const win = this._windows.get(windowId);
    if (win && win.win) win.win.close();
    if (win && win.canvas && win.canvas.parentNode) win.canvas.parentNode.removeChild(win.canvas);
    this._windows.delete(windowId);
  }

  // ── Event wiring ──────────────────────────────────────────────────────────
  on (windowId, eventName, handler) {
    const win = this._windows.get(windowId);
    if (!win) return;
    if (win.canvas) {
      win.canvas.addEventListener(eventName, handler);
    } else if (win.win) {
      win.win.webContents.on(eventName, handler);
    }
  }
}

// ── Canvas renderer helper ─────────────────────────────────────────────────────
class ZetaCanvasRenderer {
  getOffscreenCanvas (w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = w; c.height = h; return c;
    }
    // Node / headless — return stub
    return { getContext: () => ({ clearRect: ()=>{}, save: ()=>{}, restore: ()=>{},
      beginPath: ()=>{}, rect: ()=>{}, arc: ()=>{}, fill: ()=>{}, stroke: ()=>{},
      fillText: ()=>{}, moveTo: ()=>{}, lineTo: ()=>{}, closePath: ()=>{},
      translate: ()=>{}, rotate: ()=>{}, scale: ()=>{}, clip: ()=>{},
      arcTo: ()=>{}, ellipse: ()=>{}, createLinearGradient: ()=>({ addColorStop:()=>{} }),
    }) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §12  ZETA ENGINE 3D  (Scene graph · Mesh · Physics · Input)
// ═══════════════════════════════════════════════════════════════════════════════

class ZetaEngine3D {
  constructor (runtime) {
    this._rt      = runtime;
    this._scenes  = new Map();
    this._gl      = null;     // WebGL context when available
    this._three   = null;     // Three.js reference if loaded
    this._physics = new ZetaPhysicsWorld();
    this._clock   = { last: Date.now(), delta: 0 };
    this._tryThree();
  }

  _tryThree () {
    try {
      if (typeof THREE !== 'undefined') this._three = THREE;
      else if (typeof require !== 'undefined') this._three = require('three');
    } catch (_) { /* Three.js not present — use software renderer */ }
  }

  // ── Scene management ──────────────────────────────────────────────────────
  newScene (name) {
    const scene = {
      name,
      id       : Symbol(name),
      meshes   : [],
      lights   : [],
      camera   : this._defaultCamera(),
      skybox   : null,
      fog      : null,
      physics  : this._physics.createWorld(),
      _three   : this._three ? new this._three.Scene() : null,
    };
    this._scenes.set(name, scene);
    this._rt.eventBus.emit('engine:sceneCreated', { name });
    return name;
  }

  getScene (name) {
    const s = this._scenes.get(name);
    if (!s) throw new ZetaError(`Scene "${name}" not found`);
    return s;
  }

  // ── Camera ────────────────────────────────────────────────────────────────
  _defaultCamera () {
    return {
      kind       : 'perspective',
      fov        : 75,
      near       : 0.1,
      far        : 1000,
      position   : { x: 0, y: 0, z: 5 },
      target     : { x: 0, y: 0, z: 0 },
      up         : { x: 0, y: 1, z: 0 },
      _three     : null,
    };
  }

  setCamera (sceneName, camOpts) {
    const scene  = this.getScene(sceneName);
    Object.assign(scene.camera, camOpts);
    if (this._three && scene._three) {
      if (!scene.camera._three) {
        scene.camera._three = new this._three.PerspectiveCamera(
          scene.camera.fov, 1, scene.camera.near, scene.camera.far
        );
        scene._three.add(scene.camera._three);
      }
      const cam = scene.camera._three;
      cam.position.set(scene.camera.position.x, scene.camera.position.y, scene.camera.position.z);
      cam.lookAt(scene.camera.target.x, scene.camera.target.y, scene.camera.target.z);
    }
    return scene.camera;
  }

  // ── Mesh management ───────────────────────────────────────────────────────
  addMesh (sceneName, meshDesc) {
    const scene = this.getScene(sceneName);
    const mesh  = {
      ...(meshDesc._zetaMesh ? meshDesc : { _zetaMesh: true, name: meshDesc, vertices:[], faces:[], normals:[], uvs:[], material:null }),
      _id       : Symbol(),
      transform : { position:{x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}, scale:{x:1,y:1,z:1} },
      visible   : true,
      castShadow   : true,
      receiveShadow: true,
    };

    // Built-in primitive factories
    if (typeof meshDesc === 'string') {
      Object.assign(mesh, ZetaEngine3D.primitives(meshDesc));
    }

    if (this._three && scene._three) {
      mesh._threeObj = this._buildThreeMesh(mesh);
      if (mesh._threeObj) scene._three.add(mesh._threeObj);
    }

    scene.meshes.push(mesh);
    if (mesh._zetaPhysics) this._physics.addBody(scene.physics, mesh);
    this._rt.eventBus.emit('engine:meshAdded', { scene: sceneName, mesh: mesh.name });
    return mesh;
  }

  _buildThreeMesh (mesh) {
    if (!this._three) return null;
    let geo, mat;
    const T3 = this._three;

    if (mesh.name === 'cube' || mesh.name === 'box') {
      geo = new T3.BoxGeometry(mesh.width||1, mesh.height||1, mesh.depth||1);
    } else if (mesh.name === 'sphere') {
      geo = new T3.SphereGeometry(mesh.radius||0.5, mesh.segments||32, mesh.segments||32);
    } else if (mesh.name === 'plane') {
      geo = new T3.PlaneGeometry(mesh.width||1, mesh.height||1);
    } else if (mesh.name === 'cylinder') {
      geo = new T3.CylinderGeometry(mesh.radiusTop||0.5, mesh.radiusBottom||0.5, mesh.height||1, mesh.segments||32);
    } else if (mesh.vertices && mesh.vertices.length > 0) {
      geo = new T3.BufferGeometry();
      geo.setAttribute('position', new T3.Float32BufferAttribute(mesh.vertices.flat(), 3));
      if (mesh.normals.length) geo.setAttribute('normal', new T3.Float32BufferAttribute(mesh.normals.flat(), 3));
      if (mesh.uvs.length)     geo.setAttribute('uv',     new T3.Float32BufferAttribute(mesh.uvs.flat(), 2));
      if (mesh.faces.length)   geo.setIndex(mesh.faces.flat());
    } else {
      return null;
    }

    mat = mesh.material && mesh.material._threeObj
      ? mesh.material._threeObj
      : new T3.MeshStandardMaterial({ color: mesh.color || 0xffffff });

    const obj = new T3.Mesh(geo, mat);
    obj.castShadow    = mesh.castShadow;
    obj.receiveShadow = mesh.receiveShadow;
    return obj;
  }

  removeMesh (sceneName, meshOrName) {
    const scene = this.getScene(sceneName);
    const name  = typeof meshOrName === 'string' ? meshOrName : meshOrName.name;
    const idx   = scene.meshes.findIndex(m => m.name === name);
    if (idx !== -1) {
      const m = scene.meshes.splice(idx, 1)[0];
      if (m._threeObj && scene._three) scene._three.remove(m._threeObj);
    }
  }

  // ── Light management ──────────────────────────────────────────────────────
  addLight (sceneName, lightOpts = {}) {
    const scene = this.getScene(sceneName);
    const light = {
      kind      : lightOpts.kind     || 'point',   // point | directional | spot | ambient | area
      color     : lightOpts.color    || 0xffffff,
      intensity : lightOpts.intensity|| 1.0,
      position  : lightOpts.pos      || { x: 0, y: 10, z: 0 },
      castShadow: lightOpts.castShadow !== false,
      _threeObj : null,
    };

    if (this._three && scene._three) {
      const T3 = this._three;
      let l;
      if (light.kind === 'point')       l = new T3.PointLight(light.color, light.intensity);
      else if (light.kind === 'directional') l = new T3.DirectionalLight(light.color, light.intensity);
      else if (light.kind === 'spot')   l = new T3.SpotLight(light.color, light.intensity);
      else if (light.kind === 'ambient')l = new T3.AmbientLight(light.color, light.intensity);
      if (l) {
        l.position.set(light.position.x, light.position.y, light.position.z);
        l.castShadow = light.castShadow;
        scene._three.add(l);
        light._threeObj = l;
      }
    }

    scene.lights.push(light);
    return light;
  }

  // ── Material factory ──────────────────────────────────────────────────────
  createMaterial (opts = {}) {
    const mat = {
      kind       : opts.kind      || 'standard',   // standard | phong | toon | wireframe | unlit
      color      : opts.color     || 0xffffff,
      roughness  : opts.roughness !== undefined ? opts.roughness : 0.5,
      metalness  : opts.metalness !== undefined ? opts.metalness : 0.0,
      emissive   : opts.emissive  || 0x000000,
      opacity    : opts.opacity   !== undefined ? opts.opacity : 1.0,
      transparent: opts.transparent || false,
      wireframe  : opts.wireframe || false,
      map        : opts.map       || null,
      normalMap  : opts.normalMap || null,
      _threeObj  : null,
    };

    if (this._three) {
      const T3 = this._three;
      let m;
      if (mat.kind === 'standard')   m = new T3.MeshStandardMaterial({ color: mat.color, roughness: mat.roughness, metalness: mat.metalness, emissive: mat.emissive, opacity: mat.opacity, transparent: mat.transparent, wireframe: mat.wireframe });
      else if (mat.kind === 'phong') m = new T3.MeshPhongMaterial({ color: mat.color, shininess: (1 - mat.roughness) * 100, opacity: mat.opacity, transparent: mat.transparent });
      else if (mat.kind === 'toon')  m = new T3.MeshToonMaterial({ color: mat.color });
      else if (mat.kind === 'unlit') m = new T3.MeshBasicMaterial({ color: mat.color, wireframe: mat.wireframe });
      if (m) mat._threeObj = m;
    }
    return mat;
  }

  // ── Render loop ───────────────────────────────────────────────────────────
  step (dt) {
    const now    = Date.now();
    this._clock.delta = dt !== undefined ? dt : (now - this._clock.last) / 1000;
    this._clock.last  = now;
    this._physics.step(this._clock.delta);
    this._rt.eventBus.emit('engine:step', { dt: this._clock.delta });
    return this._clock.delta;
  }

  render (sceneName, rendererTarget) {
    const scene = this.getScene(sceneName);
    if (scene._three && this._three) {
      // Three.js path
      if (rendererTarget && rendererTarget._threeRenderer) {
        rendererTarget._threeRenderer.render(scene._three, scene.camera._three || this._makeThreeCamera(scene));
        return true;
      }
    }
    // Software rasteriser fallback
    return this._softRender(scene, rendererTarget);
  }

  _makeThreeCamera (scene) {
    if (!this._three) return null;
    const cam = new this._three.PerspectiveCamera(scene.camera.fov, 1, scene.camera.near, scene.camera.far);
    cam.position.set(scene.camera.position.x, scene.camera.position.y, scene.camera.position.z);
    cam.lookAt(scene.camera.target.x, scene.camera.target.y, scene.camera.target.z);
    return cam;
  }

  _softRender (scene, target) {
    // Minimal Z-sorted painter's algorithm for headless / preview renders
    const w = (target && target.width)  || 800;
    const h = (target && target.height) || 600;
    const buf = new Array(w * h).fill(0);
    const zbuf= new Float32Array(w * h).fill(Infinity);
    // Project and rasterize triangles
    for (const mesh of scene.meshes) {
      if (!mesh.visible) continue;
      ZetaEngine3D._projectMesh(mesh, scene.camera, buf, zbuf, w, h);
    }
    this._rt.eventBus.emit('engine:softRenderDone', { meshCount: scene.meshes.length, resolution: `${w}×${h}` });
    return buf;
  }

  // ── Static helpers ────────────────────────────────────────────────────────
  static DEFAULT_VERT_SRC = `
    attribute vec3 position;
    attribute vec3 normal;
    attribute vec2 uv;
    uniform mat4 modelViewMatrix;
    uniform mat4 projectionMatrix;
    varying vec3 vNormal;
    varying vec2 vUv;
    void main() {
      vNormal = normalize(mat3(modelViewMatrix) * normal);
      vUv     = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  static DEFAULT_FRAG_SRC = `
    precision mediump float;
    varying vec3 vNormal;
    varying vec2 vUv;
    uniform vec3  lightDir;
    uniform vec3  baseColor;
    uniform sampler2D map;
    uniform bool  useMap;
    void main() {
      float diff = max(dot(vNormal, normalize(lightDir)), 0.1);
      vec4  col  = useMap ? texture2D(map, vUv) : vec4(baseColor, 1.0);
      gl_FragColor = vec4(col.rgb * diff, col.a);
    }
  `;

  static primitives (name) {
    if (name === 'cube'  || name === 'box')    return { name:'cube',     width:1, height:1, depth:1 };
    if (name === 'sphere')                      return { name:'sphere',   radius:0.5, segments:32 };
    if (name === 'plane')                       return { name:'plane',    width:1, height:1 };
    if (name === 'cylinder')                    return { name:'cylinder', radiusTop:0.5, radiusBottom:0.5, height:1, segments:32 };
    if (name === 'cone')                        return { name:'cylinder', radiusTop:0,   radiusBottom:0.5, height:1, segments:32 };
    if (name === 'torus')                       return { name:'torus',    radius:0.5, tube:0.2, segments:32 };
    return { name, vertices:[], faces:[], normals:[], uvs:[] };
  }

  static _projectMesh (mesh, cam, buf, zbuf, w, h) {
    // Simplified orthographic projection for headless rasterizer
    const { position: cp } = cam;
    for (let fi = 0; fi < mesh.faces.length; fi++) {
      const f = mesh.faces[fi];
      if (!f || f.length < 3) continue;
      const v0 = mesh.vertices[f[0]], v1 = mesh.vertices[f[1]], v2 = mesh.vertices[f[2]];
      if (!v0 || !v1 || !v2) continue;
      // Project to screen (placeholder orthographic)
      const sx0 = Math.round((v0[0] - cp.x + 1) * w / 2);
      const sy0 = Math.round((v0[1] - cp.y + 1) * h / 2);
      if (sx0 >= 0 && sx0 < w && sy0 >= 0 && sy0 < h) {
        const z = v0[2] || 0;
        const idx = sy0 * w + sx0;
        if (z < zbuf[idx]) { zbuf[idx] = z; buf[idx] = fi + 1; }
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §13  PHYSICS WORLD  (impulse-based, broadphase AABB)
// ═══════════════════════════════════════════════════════════════════════════════

class ZetaPhysicsWorld {
  constructor () { this._worlds = new Map(); }

  createWorld () {
    const w = {
      bodies  : [],
      gravity : { x: 0, y: -9.8, z: 0 },
      substeps: 4,
      _pairs  : [],
    };
    this._worlds.set(Symbol(), w);
    return w;
  }

  addBody (world, meshOrDesc) {
    const body = {
      position  : { ...(meshOrDesc.transform?.position || { x:0,y:0,z:0 }) },
      velocity  : { x:0, y:0, z:0 },
      angularVel: { x:0, y:0, z:0 },
      mass      : meshOrDesc._zetaPhysics?.mass || 1,
      restitution: meshOrDesc._zetaPhysics?.restitution || 0.3,
      friction  : meshOrDesc._zetaPhysics?.friction     || 0.5,
      kinematic : meshOrDesc._zetaPhysics?.kinematic    || false,
      aabb      : { min:{x:-0.5,y:-0.5,z:-0.5}, max:{x:0.5,y:0.5,z:0.5} },
      meshRef   : meshOrDesc,
    };
    world.bodies.push(body);
    return body;
  }

  step (dt) {
    for (const world of this._worlds.values()) {
      const sub = 1 / world.substeps;
      for (let s = 0; s < world.substeps; s++) {
        this._integrate(world, dt * sub);
        this._detectCollisions(world);
        this._resolveCollisions(world);
      }
    }
  }

  _integrate (world, dt) {
    for (const b of world.bodies) {
      if (b.kinematic || b.mass === 0) continue;
      // Apply gravity
      b.velocity.x += world.gravity.x * dt;
      b.velocity.y += world.gravity.y * dt;
      b.velocity.z += world.gravity.z * dt;
      // Integrate position
      b.position.x += b.velocity.x * dt;
      b.position.y += b.velocity.y * dt;
      b.position.z += b.velocity.z * dt;
      // Sync transform
      if (b.meshRef && b.meshRef.transform) {
        Object.assign(b.meshRef.transform.position, b.position);
        if (b.meshRef._threeObj) {
          b.meshRef._threeObj.position.set(b.position.x, b.position.y, b.position.z);
        }
      }
    }
  }

  _detectCollisions (world) {
    world._pairs = [];
    const bs = world.bodies;
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        if (this._aabbOverlap(bs[i], bs[j])) world._pairs.push([bs[i], bs[j]]);
      }
    }
  }

  _aabbOverlap (a, b) {
    const pa = a.position, pb = b.position;
    const ea = 0.5, eb = 0.5;
    return Math.abs(pa.x - pb.x) < ea + eb &&
           Math.abs(pa.y - pb.y) < ea + eb &&
           Math.abs(pa.z - pb.z) < ea + eb;
  }

  _resolveCollisions (world) {
    for (const [a, b] of world._pairs) {
      // Simple impulse response
      const restitution = Math.min(a.restitution, b.restitution);
      const relVelX = a.velocity.x - b.velocity.x;
      const relVelY = a.velocity.y - b.velocity.y;
      const relVelZ = a.velocity.z - b.velocity.z;
      const invMassSum = (a.kinematic ? 0 : 1/a.mass) + (b.kinematic ? 0 : 1/b.mass);
      if (invMassSum === 0) continue;
      const j = -(1 + restitution) * (relVelX + relVelY + relVelZ) / invMassSum / 3;
      if (!a.kinematic) { a.velocity.x += j/a.mass; a.velocity.y += j/a.mass; a.velocity.z += j/a.mass; }
      if (!b.kinematic) { b.velocity.x -= j/b.mass; b.velocity.y -= j/b.mass; b.velocity.z -= j/b.mass; }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §14  INPUT MANAGER
// ═══════════════════════════════════════════════════════════════════════════════

class ZetaInputManager {
  constructor (runtime) {
    this._rt       = runtime;
    this._keys     = new Map();   // key → { down, frames }
    this._mouse    = { x:0, y:0, buttons:{left:false, right:false, middle:false}, wheel:0 };
    this._gamepads = new Map();
    this._bindings = new Map();   // action → fn
    this._attached = false;
  }

  attach () {
    if (this._attached || typeof window === 'undefined') return;
    this._attached = true;
    window.addEventListener('keydown', e => {
      this._keys.set(e.code, { down: true, frames: 0 });
      const action = this._bindings.get(e.code) || this._bindings.get(e.key);
      if (action) action(e);
      this._rt.eventBus.emit('input:keydown', { key: e.code, raw: e });
    });
    window.addEventListener('keyup', e => {
      this._keys.set(e.code, { down: false, frames: 0 });
      this._rt.eventBus.emit('input:keyup', { key: e.code, raw: e });
    });
    window.addEventListener('mousemove', e => {
      this._mouse.x = e.clientX; this._mouse.y = e.clientY;
      this._rt.eventBus.emit('input:mousemove', this._mouse);
    });
    window.addEventListener('mousedown', e => {
      const btn = ['left','middle','right'][e.button] || 'left';
      this._mouse.buttons[btn] = true;
      this._rt.eventBus.emit('input:mousedown', { button: btn, x: e.clientX, y: e.clientY });
    });
    window.addEventListener('mouseup', e => {
      const btn = ['left','middle','right'][e.button] || 'left';
      this._mouse.buttons[btn] = false;
      this._rt.eventBus.emit('input:mouseup', { button: btn });
    });
    window.addEventListener('wheel', e => {
      this._mouse.wheel = e.deltaY;
      this._rt.eventBus.emit('input:wheel', { delta: e.deltaY });
    });
    window.addEventListener('gamepadconnected', e => {
      this._gamepads.set(e.gamepad.index, e.gamepad);
      this._rt.eventBus.emit('input:gamepadConnected', { index: e.gamepad.index });
    });
    window.addEventListener('gamepaddisconnected', e => {
      this._gamepads.delete(e.gamepad.index);
    });
  }

  tick () {
    // advance key frame counters
    for (const [k, v] of this._keys) if (v.down) v.frames++;
    // poll gamepads
    if (typeof navigator !== 'undefined' && navigator.getGamepads) {
      for (const gp of navigator.getGamepads()) {
        if (gp) this._gamepads.set(gp.index, gp);
      }
    }
  }

  isKeyDown   (code)      { return this._keys.get(code)?.down || false; }
  isKeyJustDown(code)     { const k=this._keys.get(code); return k?.down && k.frames===1; }
  isKeyJustUp (code)      { const k=this._keys.get(code); return !k?.down && k?.frames===0; }
  getMouseState ()        { return { ...this._mouse }; }
  getGamepad  (idx)       { return this._gamepads.get(idx) || null; }
  bind        (key, action, fn) { this._bindings.set(key, fn); }
  getState    ()          { return { keys: Object.fromEntries(this._keys), mouse: this.getMouseState() }; }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §15  MODULE LOADER  (integrates ascii.zl and other .zl libraries)
// ═══════════════════════════════════════════════════════════════════════════════

class ZetaModuleLoader {
  constructor (runtime) {
    this._rt     = runtime;
    this._loaded = new Map();
    this._searchPaths = ['./', './lib/', './modules/'];
  }

  /**
   * Load a .zl module.
   * Checks DSALibraries first (e.g. ascii.zl already registered there),
   * then tries require() / fetch() for .js/.zl files on disk.
   */
  load (moduleName) {
    if (this._loaded.has(moduleName)) return this._loaded.get(moduleName);

    // 1. Check DSALibraries registry (ascii.zl etc.)
    if (typeof DSALibraries !== 'undefined' && DSALibraries[moduleName]) {
      const lib = DSALibraries[moduleName];
      const G   = this._rt.globalScope;
      lib.inject(G);
      this._loaded.set(moduleName, G);
      console.log(`[ZetaModuleLoader] Loaded "${moduleName}" from DSALibraries`);
      return G;
    }

    // 2. Try Node require() for .js shims
    if (typeof require !== 'undefined') {
      for (const dir of this._searchPaths) {
        try {
          const m = require(dir + moduleName.replace('.zl', '.js'));
          this._loaded.set(moduleName, m);
          return m;
        } catch (_) { /* try next */ }
      }
    }

    // 3. Try parsing .zl source from fs
    if (typeof require !== 'undefined') {
      const fs = require('fs');
      for (const dir of this._searchPaths) {
        const p = dir + moduleName;
        if (fs.existsSync(p)) {
          const src = fs.readFileSync(p, 'utf8');
          const mod = this._rt.execute(src);
          this._loaded.set(moduleName, mod);
          return mod;
        }
      }
    }

    throw new ZetaError(`Module "${moduleName}" not found. Searched: DSALibraries, ${this._searchPaths.join(', ')}`);
  }

  addSearchPath (p) { this._searchPaths.push(p); }
  listLoaded    ()  { return [...this._loaded.keys()]; }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §16  TERMINAL SHIM
// ═══════════════════════════════════════════════════════════════════════════════

class ZetaTerminal {
  write   (s) { process?.stdout?.write(String(s)) ?? console.log(s); }
  writeln (s) { console.log(s); }
  clear   ()  { process?.stdout?.write('\x1Bc') ?? console.clear(); }
  setTitle(t) { process?.stdout?.write(`\x1b]0;${t}\x07`); }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §17  INTERPRETER SAFETY LAYER  (ZetaSafeLayer)
//       This layer is the ONLY entry point ZPP ever uses.
//       It transforms raw .zl syntax into __zeta_* calls that ZPP understands.
//       ZPP NEVER sees raw @, %, :, ->, $, <>, or unguarded arithmetic.
// ═══════════════════════════════════════════════════════════════════════════════

class ZetaSafeLayer {
  /**
   * Transform zeta.zl source to ZPP-safe IR string.
   * Each special construct maps to a __zeta_ prefixed call.
   *
   * Sandboxing strategy:
   *   1. All special chars are lexed by ZetaLexer (not ZPP's lexer)
   *   2. The parser builds a ZetaAST (not ZPP's AST)
   *   3. The IR compiler emits only ZPP-legal identifiers + call syntax
   *   4. Arithmetic operators +,-,*,/,=,>,< never appear in the emitted IR;
   *      they are replaced by __zeta_calc('op', a, b) calls
   *   5. The emitted IR is then executed by ZetaRuntime (NOT passed to ZPP's raw eval)
   */

  static transform (src) {
    // Phase 1: Strip and capture all special-char regions
    const regions = [];
    let   safe    = src;
    let   idx     = 0;

    // Replace every special zeta.zl construct with a safe placeholder
    const replacements = [
      // :->   →  __ZL_BODYOPEN__
      { rx: /:->/g,   rep: '__ZL_BODYOPEN__' },
      // $->   →  __ZL_REGWRITE__
      { rx: /\$->/g,  rep: '__ZL_REGWRITE__' },
      // ---> →  __ZL_CALLOPEN__
      { rx: /--->/g,  rep: '__ZL_CALLOPEN__' },
      // -->  →  __ZL_ARGSEP__
      { rx: /-->/g,   rep: '__ZL_ARGSEP__' },
      // ->   →  __ZL_BIND__
      { rx: /->/g,    rep: '__ZL_BIND__' },
      // @word → __ZL_DIR_word__
      { rx: /@([a-zA-Z_][a-zA-Z0-9_]*)/g, rep: '__ZL_DIR_$1__' },
      // %r[1-8](:N)? → __ZL_REGREAD_N_S__
      { rx: /%r([1-8])(?::([0-3]))?/g,
        rep: (_, r, s) => `__ZL_REGREAD_${r}_${s !== undefined ? s : 'ALL'}__` },
      // <tagName><$rN> or <tagName> → __ZL_TAG_tagName_rN__ / __ZL_TAG_tagName__
      { rx: /<([a-zA-Z][a-zA-Z0-9_]*)><\$r([1-8])(?::([0-3]))?>/g,
        rep: (_, t, r, s) => `__ZL_TAG_${t}_REG${r}_${s !== undefined ? s : 'ALL'}__` },
      { rx: /<([a-zA-Z][a-zA-Z0-9_]*)>/g,
        rep: (_, t) => `__ZL_TAG_${t}__` },
      // Arithmetic protection: a op b  → __zl_op__(a, 'op', b)
      // Only protect FREE operators not inside string literals
      // (Numbers and identifiers separated by + - * / = > < are sandboxed)
      { rx: /([a-zA-Z0-9_]+)\s*\+\s*([a-zA-Z0-9_]+)/g,
        rep: '__zl_calc__($1,"add",$2)' },
      { rx: /([a-zA-Z0-9_]+)\s*-\s*([a-zA-Z0-9_]+)/g,
        rep: '__zl_calc__($1,"sub",$2)' },
      { rx: /([a-zA-Z0-9_]+)\s*\*\s*([a-zA-Z0-9_]+)/g,
        rep: '__zl_calc__($1,"mul",$2)' },
      { rx: /([a-zA-Z0-9_]+)\s*\/\s*([a-zA-Z0-9_]+)/g,
        rep: '__zl_calc__($1,"div",$2)' },
    ];

    for (const { rx, rep } of replacements) {
      safe = safe.replace(rx, rep);
    }

    return safe;
  }

  /** Reverse-map a safe IR token back to zeta.zl for diagnostics */
  static reverseMap (irToken) {
    return irToken
      .replace(/__ZL_BODYOPEN__/g,  ':->')
      .replace(/__ZL_REGWRITE__/g,  '$->')
      .replace(/__ZL_CALLOPEN__/g,  '--->')
      .replace(/__ZL_ARGSEP__/g,    '-->')
      .replace(/__ZL_BIND__/g,      '->')
      .replace(/__ZL_DIR_(\w+)__/g, '@$1')
      .replace(/__ZL_REGREAD_(\d)_ALL__/g, '%r$1')
      .replace(/__ZL_REGREAD_(\d)_(\d)__/g,'%r$1:$2')
      .replace(/__ZL_TAG_(\w+)_REG(\d)_ALL__/g, '<$1><$r$2>')
      .replace(/__ZL_TAG_(\w+)__/g, '<$1>');
  }

  /** Validate that no unsafe raw operators remain in output */
  static auditIR (ir) {
    const UNSAFE = [/(?<![_a-zA-Z0-9])[-+*\/=><!]{1,2}(?![_a-zA-Z0-9=])/g];
    const violations = [];
    for (const rx of UNSAFE) {
      let m;
      while ((m = rx.exec(ir)) !== null) {
        violations.push({ op: m[0], pos: m.index });
      }
    }
    return violations;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §18  IR COMPILER  (ZetaAST → ZPP-safe __zeta_* call strings)
// ═══════════════════════════════════════════════════════════════════════════════

class ZetaIRCompiler {
  constructor () { this._output = []; this._indent = 0; }

  compile (ast) {
    this._output = [];
    this._visit(ast);
    return this._output.join('\n');
  }

  _emit (s) { this._output.push('  '.repeat(this._indent) + s); }
  _in  ()   { this._indent++; }
  _out ()   { this._indent = Math.max(0, this._indent - 1); }

  _visit (node) {
    if (!node) return;
    const m = `_visit_${node.kind}`;
    if (this[m]) this[m](node);
    else this._emit(`/* unhandled AST node: ${node.kind} */`);
  }

  _visit_Program (n) {
    n.directives.forEach(d => this._visit(d));
    n.body.forEach(s => this._visit(s));
  }

  _visit_MediumBlock (n) {
    this._emit(`__zeta_medium_open__(${JSON.stringify(n.dirs || [])})`);
    this._in();
    n.portions.forEach(p => this._visit(p));
    this._out();
    this._emit(`__zeta_medium_close__()`);;
    this._visit(n.result);
  }

  _visit_PortionDecl (n) {
    this._emit(`__zeta_portion_begin__(${JSON.stringify(n.name)})`);
    this._in();
    n.sections.forEach(s => this._visit(s));
    this._out();
    this._emit(`__zeta_portion_end__(${JSON.stringify(n.name)})`);
  }

  _visit_SectionDecl (n) {
    const params = JSON.stringify(n.params);
    this._emit(`__zeta_section_begin__(${JSON.stringify(n.sectKind)},${JSON.stringify(n.name)},${params})`);
    this._in();
    if (n.body) this._visit(n.body);
    this._out();
    this._emit(`__zeta_section_end__(${JSON.stringify(n.name)})`);
  }

  _visit_FuncBody (n) {
    n.stmts.forEach(s => this._visit(s));
  }

  _visit_RegWrite (n) {
    const assignments = n.assignments.map(a => {
      if (a.kind === 'TypedValue') return `__zeta_typed__(${JSON.stringify(a.typeTok)},${JSON.stringify(a.value)})`;
      if (a.kind === 'Literal')    return `__zeta_lit__(${JSON.stringify(a.litType)},${JSON.stringify(a.value)})`;
      return `null`;
    });
    this._emit(`__zeta_reg_write__(${n.reg},[${assignments.join(',')}])`);
  }

  _visit_FreeStmt (n) {
    this._emit(`__zeta_reg_free__(${n.regs.join(',')})`);
  }

  _visit_CallExpr (n) {
    const portion  = JSON.stringify(n.portion);
    const func     = JSON.stringify(n.func);
    const args     = `[${n.args.map(a => this._exprIR(a)).join(',')}]`;
    const tag      = n.tag ? `__zeta_tag__(${JSON.stringify(n.tag.name)},${JSON.stringify(n.tag.regRef)})` : 'null';
    const directive= JSON.stringify(n.directive);
    this._emit(`__zeta_call__(${portion},${func},${args},${tag},${directive})`);
  }

  _visit_DirectiveStmt (n) {
    this._emit(`__zeta_directive__(${JSON.stringify(n.name)},null)`);
  }

  _visit_ResultDecl (n) {
    this._emit(`__zeta_result__(${JSON.stringify(n.exports)})`);
  }

  _exprIR (n) {
    if (!n) return 'null';
    if (n.kind === 'Literal')    return `__zeta_lit__(${JSON.stringify(n.litType)},${JSON.stringify(n.value)})`;
    if (n.kind === 'Identifier') return `__zeta_id__(${JSON.stringify(n.name)})`;
    if (n.kind === 'RegRead')    return `__zeta_reg_read__(${n.reg},${JSON.stringify(n.slot)})`;
    if (n.kind === 'TypedValue') return `__zeta_typed__(${JSON.stringify(n.typeTok)},${JSON.stringify(n.value)})`;
    if (n.kind === 'TagNode')    return `__zeta_tag__(${JSON.stringify(n.name)},${JSON.stringify(n.regRef)})`;
    return 'null';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §19  EXECUTOR  (walks AST and produces runtime values)
// ═══════════════════════════════════════════════════════════════════════════════

class ZetaExecutor {
  constructor (runtime) { this._rt = runtime; }

  exec (ast) {
    if (!ast) return null;
    const m = `_exec_${ast.kind}`;
    if (this[m]) return this[m](ast);
    return null;
  }

  _exec_Program (n) {
    let last = null;
    n.directives.forEach(d => this.exec(d));
    n.body.forEach(s => { last = this.exec(s); });
    return last;
  }

  _exec_MediumBlock (n) {
    n.dirs.forEach(d => this._rt.directives.activate(d));
    n.portions.forEach(p => this.exec(p));
    return this.exec(n.result);
  }

  _exec_PortionDecl (n) {
    this._rt.portions.registerPortion(n.name);
    for (const sec of n.sections) {
      this.exec(sec, n.name);
    }
    return n.name;
  }

  _exec_SectionDecl (n, portionName) {
    const self = this;
    const rt   = this._rt;
    if (n.sectKind === 'func' || n.sectKind === 'function') {
      // Build a callable JS function wrapping the func body
      const fn = function (...args) {
        // Load args into registers
        args.forEach((a, i) => {
          if (i < ZL_MAX_REGS) rt.registers.writeSlot(i + 1, 0, n.params[i] || 'let', a);
        });
        return self._execFuncBody(n.body);
      };
      fn._zlParams = n.params;
      fn._zlName   = n.name;
      this._rt.portions.registerFunc(portionName || '_global', n.name, fn, n.params);
      this._rt.globalScope[n.name] = fn;
    } else {
      // struct — register as factory
      const factory = (initData = {}) => ({ _zlStruct: n.name, ...initData });
      this._rt.portions.registerStruct(portionName || '_global', n.name, n.params);
      this._rt.globalScope[n.name] = factory;
    }
    return n.name;
  }

  _execFuncBody (body) {
    if (!body) return null;
    let result = null;
    for (const stmt of body.stmts) {
      result = this.exec(stmt);
      if (result !== null && result !== undefined && result?._zlReturn) {
        return result.value;
      }
    }
    return result;
  }

  _exec_RegWrite (n) {
    const assignments = n.assignments.map(a => ({
      typeTok : a.kind === 'TypedValue' ? a.typeTok : (a.litType || 'let'),
      value   : a.kind === 'TypedValue' ? this._coerce(a.typeTok, a.value)
                                        : (a.value !== undefined ? a.value : null),
    }));
    this._rt.registers.write(n.reg, assignments);
    return null;
  }

  _coerce (type, val) {
    if (val === null || val === undefined) return null;
    if (type === 'num')  return Number(val);
    if (type === 'str')  return String(val);
    if (type === 'bool') return Boolean(val);
    if (type === 'array')return Array.isArray(val) ? val : [val];
    return val;
  }

  _exec_FreeStmt (n) {
    this._rt.registers.free(...n.regs);
    return null;
  }

  _exec_CallExpr (n) {
    const rt = this._rt;
    // Evaluate arguments
    const args = n.args.map(a => this._evalArg(a));

    let result;
    // Directive-scoped call (e.g. @gui, @engine, @term)
    if (n.directive) {
      const payload = { op: n.func, portion: n.portion, args };
      if (n.args.length > 0) payload.data = args[0];
      if (n.args.length > 1) payload.target = args[1];
      try {
        result = rt.directives.handle(n.directive, payload);
      } catch (e) {
        if (rt._strict) throw e;
        console.warn(`[ZetaExecutor] @${n.directive} handler error:`, e.message);
        result = null;
      }
    } else if (n.portion) {
      // Portion call:  .portion --->func --> args
      if (rt.portions.has(n.portion, n.func)) {
        result = rt.portions.call(n.portion, n.func, args);
      } else {
        // try global scope
        result = typeof rt.globalScope[n.func] === 'function'
          ? rt.globalScope[n.func](...args) : null;
      }
    } else {
      result = typeof rt.globalScope[n.func] === 'function'
        ? rt.globalScope[n.func](...args) : null;
    }

    // Apply result tag
    if (n.tag) {
      result = this._applyTag(n.tag, result);
    }

    return result;
  }

  _applyTag (tagNode, value) {
    const rt  = this._rt;
    const ctx = { value };
    const res = rt.tags.execute(tagNode.name, ctx);
    // If tag has a register ref, write result into that register
    if (tagNode.regRef) {
      const { reg, slot } = tagNode.regRef;
      if (slot !== null && slot !== undefined) {
        rt.registers.writeSlot(reg, slot, 'let', res);
      } else {
        rt.registers.write(reg, [{ typeTok: 'let', value: res }]);
      }
    }
    return res;
  }

  _evalArg (n) {
    if (!n) return null;
    if (n.kind === 'Literal')    return n.value;
    if (n.kind === 'Identifier') return this._rt.globalScope[n.name] ?? n.name;
    if (n.kind === 'RegRead')    return this._rt.registers.readValue(n.reg, n.slot);
    if (n.kind === 'TypedValue') return this._coerce(n.typeTok, n.value);
    if (n.kind === 'TagNode')    return this._rt.tags.execute(n.name, { value: null });
    return null;
  }

  _exec_DirectiveStmt (n) {
    this._rt.directives.activate(n.name);
    return null;
  }

  _exec_ResultDecl (n) {
    const out = {};
    for (const name of n.exports) {
      out[name] = this._rt.globalScope[name] ?? this._rt.portions.listFuncs(name);
    }
    return out;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §20  ZETA RUNTIME  (top-level orchestrator)
// ═══════════════════════════════════════════════════════════════════════════════

class ZetaRuntime {
  constructor (opts = {}) {
    this.registers    = new ZetaRegisterFile();
    this.memory       = new ZetaMemoryManager();
    this.eventBus     = new ZetaEventBus();
    this.portions     = new ZetaPortionRegistry();
    this.globalScope  = Object.create(null);
    this.exports      = Object.create(null);
    this.macros       = Object.create(null);
    this.tags         = new ZetaTagEngine(this);
    this.directives   = new ZetaDirectiveEngine(this);
    this.moduleLoader = new ZetaModuleLoader(this);
    this.terminal     = new ZetaTerminal();
    this.inputManager = new ZetaInputManager(this);
    this.gui          = null;    // lazy-initialised on @gui
    this.engine3d     = null;    // lazy-initialised on @engine
    this._debugMode   = opts.debug   || false;
    this._strict      = opts.strict  || false;
    this._unsafe      = opts.unsafe  || false;
    this._compiler    = new ZetaIRCompiler();
    this._executor    = new ZetaExecutor(this);

    // Expose standard ZPP builtins via globalScope
    this._bootstrapGlobalScope();
  }

  _bootstrapGlobalScope () {
    const rt = this;
    // __zeta_* IR helpers (the IR compiler emits these, the executor resolves them)
    this.globalScope['__zeta_medium_open__']    = (dirs)           => { dirs.forEach(d => rt.directives.activate(d)); };
    this.globalScope['__zeta_medium_close__']   = ()               => {};
    this.globalScope['__zeta_portion_begin__']  = (name)           => rt.portions.registerPortion(name);
    this.globalScope['__zeta_portion_end__']    = ()               => {};
    this.globalScope['__zeta_section_begin__']  = (k, n, p)       => ({ _kind:k, _name:n, _params:p });
    this.globalScope['__zeta_section_end__']    = ()               => {};
    this.globalScope['__zeta_reg_write__']      = (r, a)          => rt.registers.write(r, a);
    this.globalScope['__zeta_reg_read__']       = (r, s)          => rt.registers.readValue(r, s);
    this.globalScope['__zeta_reg_free__']       = (...rs)         => rt.registers.free(...rs);
    this.globalScope['__zeta_call__']           = (p, f, a, t, d) => rt._execCall(p, f, a, t, d);
    this.globalScope['__zeta_tag__']            = (name, regRef)  => ({ _zetaTagRef: true, name, regRef });
    this.globalScope['__zeta_directive__']      = (name, payload) => rt.directives.handle(name, payload || {});
    this.globalScope['__zeta_result__']         = (exports)       => rt._buildResult(exports);
    this.globalScope['__zeta_typed__']          = (type, val)     => ({ type, value: val });
    this.globalScope['__zeta_lit__']            = (type, val)     => val;
    this.globalScope['__zeta_id__']             = (name)          => rt.globalScope[name] ?? name;
    this.globalScope['__zl_calc__']             = (a, op, b)      => rt.tags.execute('calc', { op, a, b });

    // Convenience shorthands exposed to .zl programs
    this.globalScope['zeta']    = { version: ZL_VERSION, runtime: this };
    this.globalScope['console'] = console;
  }

  /**
   * Primary entry point: parse + execute a .zl source string.
   * The source NEVER reaches ZPP's raw parser — ZetaSafeLayer strips
   * all special syntax first, then the ZetaLexer+Parser+Executor handle it.
   */
  execute (src) {
    // Phase 0: safety check — verify no ZPP-unsafe tokens remain after lexing
    const lexer  = new ZetaLexer(src);
    const tokens = lexer.tokenize();

    if (this._debugMode) {
      console.log('[ZetaRuntime] Tokens:', tokens.length);
    }

    // Phase 1: parse
    const parser = new ZetaParser(tokens);
    const ast    = parser.parse();

    if (this._debugMode) {
      console.log('[ZetaRuntime] AST:', JSON.stringify(ast, null, 2));
    }

    // Phase 2: (optional) emit IR for ZPP
    const ir = this._compiler.compile(ast);

    if (this._debugMode) {
      console.log('[ZetaRuntime] IR:\n', ir);
    }

    // Phase 3: execute via ZetaExecutor (NOT via ZPP's raw eval)
    const result = this._executor.exec(ast);

    this.eventBus.emit('runtime:executed', { tokenCount: tokens.length });
    return result;
  }

  _execCall (portion, func, args, tagRef, directive) {
    let result;
    if (directive) {
      const payload = { op: func, portion, args, data: args[0], target: args[1] };
      try { result = this.directives.handle(directive, payload); }
      catch (e) { if (this._strict) throw e; result = null; }
    } else if (portion && this.portions.has(portion, func)) {
      result = this.portions.call(portion, func, args);
    } else {
      const fn = this.globalScope[func];
      result = typeof fn === 'function' ? fn(...args) : null;
    }
    if (tagRef && tagRef._zetaTagRef) {
      const tagCtx = { value: result };
      result = this.tags.execute(tagRef.name, tagCtx);
      if (tagRef.regRef) {
        const { reg, slot } = tagRef.regRef;
        this.registers.writeSlot(reg, slot ?? 0, 'let', result);
      }
    }
    return result;
  }

  _buildResult (exports) {
    const out = {};
    for (const name of exports) {
      out[name] = this.globalScope[name] ??
                  this.portions.listFuncs(name);
    }
    return out;
  }

  /** Register a ZPP builtin name so the safe-layer can reference it */
  registerBuiltins (names) {
    names.forEach(n => { if (!this.globalScope[n]) this.globalScope[n] = null; });
  }
  registerTypes (names) {
    names.forEach(n => { this.globalScope['__zltype_' + n] = n; });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §21  ZETA ERROR
// ═══════════════════════════════════════════════════════════════════════════════

class ZetaError extends Error {
  constructor (msg) {
    super(`[zeta.zl] ${msg}`);
    this.name = 'ZetaError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §22  BUILT-IN EXAMPLE PROGRAMS
//       These show valid zeta.zl syntax and are executed by the runtime.
// ═══════════════════════════════════════════════════════════════════════════════

const EXAMPLES = Object.freeze({

  // ─────────────────────────────────────────────────────────────────────────
  //  EXAMPLE 1: Hello World
  // ─────────────────────────────────────────────────────────────────────────
  HELLO_WORLD: `
medium_zeta :-> {
    portion .io
        section <func>.print -> str :->
            r1 $-> <str>:0;
            .io --->write --> %r1:0 -> <io><$r2>;
            free r1
} -> result([print]);

@term
.io --->print --> "Hello, World!" -> <io><$r1>;
`,

  // ─────────────────────────────────────────────────────────────────────────
  //  EXAMPLE 2: Math — add, multiply, hypotenuse
  // ─────────────────────────────────────────────────────────────────────────
  MATH_FUNCTIONS: `
medium_zeta :-> {
    portion .math
        section <func>.add -> num, num :->
            r1 $-> <num>:0, <num>:1;
            r2 $-> <calc>add --> %r1:0, %r1:1 -> <getVal><$r2>;
            free r1

        section <func>.multiply -> num, num :->
            r1 $-> <num>:0, <num>:1;
            r2 $-> <calc>mul --> %r1:0, %r1:1 -> <getVal><$r2>;
            free r1

        section <func>.hypotenuse -> num, num :->
            r1 $-> <num>:0, <num>:1;
            r3 $-> <calc>pow --> %r1:0, 2 -> <getVal><$r3>;
            r4 $-> <calc>pow --> %r1:1, 2 -> <getVal><$r4>;
            r5 $-> <calc>add --> %r3:0, %r4:0 -> <getVal><$r5>;
            r6 $-> <calc>sqrt --> %r5:0 -> <getVal><$r6>;
            free r1, r3, r4, r5

        section <func>.clamp -> num, num, num :->
            r1 $-> <num>:0, <num>:1, <num>:2;
            r2 $-> <calc>clamp --> %r1:0, %r1:1, %r1:2 -> <getVal><$r2>;
            free r1
} -> result([add, multiply, hypotenuse, clamp]);
`,

  // ─────────────────────────────────────────────────────────────────────────
  //  EXAMPLE 3: GUI Window with custom shapes
  // ─────────────────────────────────────────────────────────────────────────
  GUI_WINDOW: `
@gui
medium_zeta :-> {
    portion .ui
        section <func>.createMainWindow -> str, num, num :->
            r1 $-> <str>:0, <num>:1, <num>:2;
            @gui --->createWindow --> %r1:0, %r1:1, %r1:2 -> <render><$r2>;
            r3 $-> <shape>rounded --> %r2:0, 600, 400 -> <getVal><$r3>;
            @gui --->show --> %r2:0 -> <render><$r4>;
            free r1, r3

        section <func>.drawButton -> str, num, num :->
            r1 $-> <str>:0, <num>:1, <num>:2;
            r5 $-> <shape>rect --> %r1:1, %r1:2, 120, 40 -> <getVal><$r5>;
            r6 $-> <render>draw --> %r5:0 -> <getVal><$r6>;
            free r1, r5

        section <func>.drawHexagon -> num, num :->
            r1 $-> <num>:0, <num>:1;
            r7 $-> <shape>polygon --> %r1:0, %r1:1 -> <getVal><$r7>;
            free r1

} -> result([createMainWindow, drawButton, drawHexagon]);
`,

  // ─────────────────────────────────────────────────────────────────────────
  //  EXAMPLE 4: 3D Scene
  // ─────────────────────────────────────────────────────────────────────────
  SCENE_3D: `
@engine
medium_zeta :-> {
    portion .world
        section <func>.initScene -> str :->
            r1 $-> <str>:0;
            @engine --->newScene --> %r1:0 -> <render><$r2>;
            @engine --->addLight --> %r2:0, "directional" -> <getVal><$r3>;
            @engine --->setCamera --> %r2:0, 75, 0.1, 1000 -> <getVal><$r4>;
            free r1

        section <func>.spawnCube -> str, num, num, num :->
            r1 $-> <str>:0, <num>:1, <num>:2, <num>:3;
            r2 $-> <mesh>cube --> %r1:1, %r1:2, %r1:3 -> <getVal><$r2>;
            @engine --->addMesh --> %r1:0, %r2:0 -> <getVal><$r5>;
            r3 $-> <physics>box --> %r2:0, 1.0 -> <getVal><$r3>;
            free r1, r2

        section <func>.spawnSphere -> str, num :->
            r1 $-> <str>:0, <num>:1;
            r2 $-> <mesh>sphere --> %r1:1 -> <getVal><$r2>;
            r3 $-> <physics>sphere --> %r2:0, 1.0 -> <getVal><$r3>;
            @engine --->addMesh --> %r1:0, %r2:0 -> <getVal><$r4>;
            free r1, r2

        section <func>.renderLoop -> str :->
            r1 $-> <str>:0;
            @engine --->step --> %r1:0 -> <getVal><$r2>;
            @engine --->render --> %r1:0 -> <render><$r3>;
            free r1

} -> result([initScene, spawnCube, spawnSphere, renderLoop]);
`,

  // ─────────────────────────────────────────────────────────────────────────
  //  EXAMPLE 5: ASCII module integration (uses ascii.zl)
  // ─────────────────────────────────────────────────────────────────────────
  ASCII_INTEGRATION: `
@import
medium_zeta :-> {
    portion .text
        section <func>.encodeMessage -> str :->
            r1 $-> <str>:0;
            @import --->load --> "ascii.zl" -> <getVal><$r2>;
            r3 $-> <str>encode --> %r1:0 -> <getVal><$r3>;
            free r1, r2

        section <func>.caesarCipher -> str, num :->
            r1 $-> <str>:0, <num>:1;
            @import --->load --> "ascii.zl" -> <getVal><$r2>;
            r3 $-> <str>caesar --> %r1:0, %r1:1 -> <getVal><$r3>;
            free r1, r2

        section <func>.charStats -> str :->
            r1 $-> <str>:0;
            @import --->load --> "ascii.zl" -> <getVal><$r2>;
            r3 $-> <str>stats --> %r1:0 -> <getVal><$r3>;
            free r1, r2

} -> result([encodeMessage, caesarCipher, charStats]);
`,
});

// ═══════════════════════════════════════════════════════════════════════════════
//  §23  ZPP BOOTSTRAP  — source pre-processor + ZPP host wiring
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Source pre-processor ──────────────────────────────────────────────────────
//  Scans a .zpp source string for every  medium_zeta :-> { ... } -> result(...);
//  block, executes each through ZetaRuntime (which owns all special-char handling),
//  then ERASES the block from the source so ZPP's own parser never sees
//  $, ->, :, :-> , %, <>, or @ anywhere in the file.
function _extractAndRunMediumBlocks (src, runtime) {
  let out    = src;
  let offset = 0;

  while (true) {
    // Find next medium_zeta keyword
    const kwIdx = out.indexOf('medium_zeta', offset);
    if (kwIdx === -1) break;

    // Walk forward to find the opening {
    let braceStart = -1;
    for (let i = kwIdx + 11; i < out.length; i++) {
      if (out[i] === '{') { braceStart = i; break; }
    }
    if (braceStart === -1) break;

    // Count braces to find the matching }
    let depth = 0, braceEnd = -1;
    for (let i = braceStart; i < out.length; i++) {
      if      (out[i] === '{') depth++;
      else if (out[i] === '}') { depth--; if (depth === 0) { braceEnd = i; break; } }
    }
    if (braceEnd === -1) break;

    // Capture the -> result(...); tail that follows the closing brace
    const tail      = out.slice(braceEnd + 1);
    const tailMatch = tail.match(/^\s*->\s*result\s*\([^)]*\)\s*;?/);
    const tailLen   = tailMatch ? tailMatch[0].length : 0;
    const blockEnd  = braceEnd + 1 + tailLen;
    const block     = out.slice(kwIdx, blockEnd);

    // Execute the block through ZetaRuntime — all special chars handled here
    try {
      runtime.execute(block);
    } catch (e) {
      console.error('[zeta.zl] Error in medium_zeta block:', e.message);
    }

    // Erase the block from source — replace with blank lines so ZPP
    // line numbers stay meaningful in any remaining ZPP error messages
    const padding = '\n'.repeat(block.split('\n').length - 1);
    out    = out.slice(0, kwIdx) + padding + out.slice(blockEnd);
    offset = kwIdx; // re-scan from same position (block is now gone)
  }

  return out;
}

function _bootstrapZPP (runtime) {
  // Resolve the ZPP host object — works in browser and ZPP's Node/CLI runner
  // (ZPP CLI injects __ZPP__ into globalThis before executing user code)
  const host = (typeof window     !== 'undefined' && window.__ZPP__)
             ? window.__ZPP__
             : (typeof globalThis !== 'undefined' && globalThis.__ZPP__)
             ? globalThis.__ZPP__
             : null;

  if (!host) return;

  // 1. Attach the zeta runtime
  host.__zeta__ = runtime;

  // 2. Register all __zeta_* IR helpers as known safe builtins in ZPP
  const builtinNames = Object.keys(runtime.globalScope)
    .filter(k => k.startsWith('__zeta') || k.startsWith('__zl'));
  if (typeof host.registerBuiltins === 'function')
    host.registerBuiltins(builtinNames);

  // 3. Register zeta type names
  if (typeof host.registerTypes === 'function')
    host.registerTypes(['num','str','bool','let','array']);

  // 4. SOURCE PRE-PROCESSOR — the critical piece
  //    ZPP calls this on the raw .zpp source BEFORE its own parser runs.
  //    We strip out every medium_zeta block so ZPP never chokes on
  //    $  ->  :->  %rN  <tag>  @directive  etc.
  const preProcessor = (src) => _extractAndRunMediumBlocks(src, runtime);

  // Register under every hook name different ZPP versions might expose
  if (typeof host.registerSourceTransform === 'function') host.registerSourceTransform(preProcessor);
  if (typeof host.registerPreProcessor    === 'function') host.registerPreProcessor(preProcessor);
  host.sourceTransform = preProcessor;
  host.preProcess      = preProcessor;
  host.zlPreProcess    = preProcessor;

  // 5. Expose helpers
  host.executeZL    = (src) => runtime.execute(src);
  host.zlTransform  = ZetaSafeLayer.transform;
  host.zlReverseMap = ZetaSafeLayer.reverseMap;
  host.zlAuditIR    = ZetaSafeLayer.auditIR;

  console.log(`[zeta.zl v${ZL_VERSION}] Pre-processor registered — ZPP will never see raw zeta.zl syntax`);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §24  DSALibraries REGISTRATION  (mirrors ascii.js pattern)
// ═══════════════════════════════════════════════════════════════════════════════

// Create the singleton runtime
const _zetaRuntime = new ZetaRuntime({ debug: false, strict: false });

// ═══════════════════════════════════════════════════════════════════════════════
//  IMMEDIATE CORE PATCH
//  zeta.zl.js is injected into the ZPP interpreter core, so it runs before
//  ANY .zpp file is loaded. We patch ZPP's execution entry points right here,
//  the instant this file is evaluated. This guarantees the pre-processor
//  strips every medium_zeta block BEFORE ZPP's lexer ever sees $, ->, <>, @.
// ═══════════════════════════════════════════════════════════════════════════════

(function _immediateCorePatch () {
  const preProcess = (src) => _extractAndRunMediumBlocks(src, _zetaRuntime);

  // Resolve the ZPP host (browser or Node/CLI)
  const host = (typeof globalThis !== 'undefined' && globalThis.__ZPP__)
             ? globalThis.__ZPP__
             : (typeof window    !== 'undefined' && window.__ZPP__)
             ? window.__ZPP__
             : null;

  if (host) {
    // ── Register under every standard hook name ────────────────────────────
    host.sourceTransform = preProcess;
    host.preProcess      = preProcess;
    host.zlPreProcess    = preProcess;
    if (typeof host.registerSourceTransform === 'function') host.registerSourceTransform(preProcess);
    if (typeof host.registerPreProcessor    === 'function') host.registerPreProcessor(preProcess);

    // ── Patch every possible execution entry point ─────────────────────────
    //    ZPP calls one of these with the raw .zpp source string.
    //    We wrap it so the source is cleaned first.
    const ENTRY_POINTS = [
      'run', 'exec', 'execute', 'evaluate', 'eval',
      'interpret', 'runFile', 'execFile', 'executeFile',
      'loadAndRun', 'parseAndRun', 'compile', 'transpile',
      'runSource', 'execSource', 'executeSource',
    ];

    for (const method of ENTRY_POINTS) {
      if (typeof host[method] === 'function') {
        const _orig = host[method].bind(host);
        host[method] = function (src, ...rest) {
          if (typeof src === 'string') src = preProcess(src);
          return _orig(src, ...rest);
        };
        host[method]._zetaPatched = true;
      }
    }

    console.log('[zeta.zl] Core patch applied — ZPP execution entry points wrapped');
  }

  // ── Node.js fallback: patch Module._compile ────────────────────────────────
  //    When ZPP's CLI uses Node's require() to load .zpp files, this fires.
  if (typeof require !== 'undefined') {
    try {
      const Module = require('module');
      const _origCompile = Module.prototype._compile;
      Module.prototype._compile = function (content, filename) {
        if (typeof filename === 'string' && filename.endsWith('.zpp')) {
          content = preProcess(content);
        }
        return _origCompile.call(this, content, filename);
      };
    } catch (_) { /* not a Node environment */ }
  }
}());

if (typeof DSALibraries !== 'undefined') {
  DSALibraries['zeta.zl'] = {
    description:
      'Full zeta.zl language runtime: lexer, parser, AST, register file (r1–r8×4 slots), ' +
      'memory manager, 40+ execution tags, 28 @-directives, GUI pipeline (Electron+Canvas), ' +
      '3D engine (Three.js adapter + software rasterizer), physics, input manager, ' +
      'module loader (ascii.zl compatible), ZPP safety sandbox.',
    version: ZL_VERSION,

    /** Called by DSALibraries loader; injects runtime into the ZPP global scope */
    inject (G) {

      // Execute the core medium_zeta definitions so portions get registered
      _zetaRuntime.execute(EXAMPLES.HELLO_WORLD);
      _zetaRuntime.execute(EXAMPLES.MATH_FUNCTIONS);
      _zetaRuntime.execute(EXAMPLES.GUI_WINDOW);
      _zetaRuntime.execute(EXAMPLES.SCENE_3D);

      // Build the clean zeta.portionName.funcName API that ZPP code calls
      const api = Object.create(null);
      for (const portionName of _zetaRuntime.portions.listPortions()) {
        api[portionName] = Object.create(null);
        for (const funcName of _zetaRuntime.portions.listFuncs(portionName)) {
          api[portionName][funcName] = (...args) =>
            _zetaRuntime.portions.call(portionName, funcName, args);
        }
      }
      G.zeta = api;

      // Register all __zeta_* helpers into ZPP's global
      for (const [k, v] of Object.entries(_zetaRuntime.globalScope)) {
        G[k] = v;
      }
      // Expose top-level API
      G.ZetaRuntime    = ZetaRuntime;
      G.ZetaLexer      = ZetaLexer;
      G.ZetaParser     = ZetaParser;
      G.ZetaSafeLayer  = ZetaSafeLayer;
      G.ZetaIRCompiler = ZetaIRCompiler;
      G.ZetaExecutor   = ZetaExecutor;
      G.ZetaGUI        = ZetaGUI;
      G.ZetaEngine3D   = ZetaEngine3D;
      G.ZetaPhysicsWorld = ZetaPhysicsWorld;
      G.ZetaInputManager = ZetaInputManager;
      G.ZetaModuleLoader = ZetaModuleLoader;
      G.ZetaTagEngine  = ZetaTagEngine;
      G.ZetaDirectiveEngine = ZetaDirectiveEngine;
      G.ZetaError      = ZetaError;
      G.ZETA_EXAMPLES  = EXAMPLES;
      G.zeta           = _zetaRuntime;

      if (typeof window !== 'undefined' && window.__ZPP__) {
        _bootstrapZPP(_zetaRuntime);
        window.__ZPP__.registerBuiltins([
          'ZetaRuntime','ZetaLexer','ZetaParser','ZetaSafeLayer',
          'ZetaGUI','ZetaEngine3D','ZetaPhysicsWorld','ZetaInputManager',
          'ZetaTagEngine','ZetaDirectiveEngine','ZetaError','ZETA_EXAMPLES','zeta',
        ]);
        window.__ZPP__.registerTypes(['zeta','portion','section','tag','directive']);
      }

      console.log(`[zeta.zl v${ZL_VERSION}] Injected into runtime`);
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §25  NODE / BROWSER MODULE EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined') {
  module.exports = {
    ZetaRuntime,
    ZetaLexer,
    ZetaParser,
    ZetaIRCompiler,
    ZetaExecutor,
    ZetaSafeLayer,
    ZetaRegisterFile,
    ZetaMemoryManager,
    ZetaTagEngine,
    ZetaDirectiveEngine,
    ZetaPortionRegistry,
    ZetaEventBus,
    ZetaGUI,
    ZetaEngine3D,
    ZetaPhysicsWorld,
    ZetaInputManager,
    ZetaModuleLoader,
    ZetaTerminal,
    ZetaError,
    EXAMPLES,
    // Singleton runtime
    runtime : _zetaRuntime,
    // Quick-execute helper
    execute : (src) => _zetaRuntime.execute(src),
    // Load a registered .zl module
    require : (name) => _zetaRuntime.moduleLoader.load(name),
  };
}

// ── Expose on globalThis for browser <script> usage ───────────────────────────
if (typeof globalThis !== 'undefined') {
  globalThis.ZetaZL  = { runtime: _zetaRuntime, EXAMPLES, ZetaError };
}

})(); // end ZetaZL IIFE


/* ═══════════════════════════════════════════════════════════════════════════════
   ARCHITECTURE DESIGN NOTES
   ═══════════════════════════════════════════════════════════════════════════════

   1. PIPELINE STAGES
      ─────────────────
      .zl source → ZetaLexer → ZetaParser → ZetaAST → ZetaIRCompiler → IR string
                                                      ↓
                                               ZetaExecutor ← ZetaRuntime
                                                      ↓
                                               side-effects (registers, memory,
                                               GUI, 3D engine, events)

   2. SAFETY SANDBOX  (how ZPP never sees raw special syntax)
      ────────────────────────────────────────────────────────
      • ZetaSafeLayer.transform() rewrites every @, %, :, ->, $, <> construct
        into __ZL_XXX__ placeholders BEFORE any ZPP pre-processor can see them.
      • Arithmetic operators (+,-,*,/,=,>,<) are rewritten to __zl_calc__() calls.
      • The ZetaLexer runs FIRST and owns all special-char regions.
      • The IR emitted by ZetaIRCompiler contains only:
          identifiers, string literals, number literals, and function-call syntax.
        No raw operator ever appears in the IR.
      • ZetaSafeLayer.auditIR() validates the output for any leaked operators.
      • ZPP only ever calls __zeta_* functions, which are pre-registered
        as safe builtins via window.__ZPP__.registerBuiltins().

   3. REGISTER FILE
      ──────────────
      • 8 registers (r1–r8), each with 4 typed slots.
      • $->  writes consecutive slots.
      • %rN  reads all slots (returns array if multiple non-null).
      • %rN:S reads a specific slot's value.
      • rN:S  (bare, no %) is a slot ref expression.
      • free(r1, r2) zeros all slots and clears locks.
      • Registers are locked during 3D/physics operations.

   4. TAG ENGINE
      ───────────
      • Tags are execution-modifier functions, not syntax.
      • <tagName> is parsed as a TAG token by ZetaLexer.
      • <tagName><$rN> is a compound tag that stores its output in register rN.
      • The tag engine dispatches to a Map of handler functions.
      • New tags can be registered at runtime: runtime.tags.register(name, fn).

   5. DIRECTIVE ENGINE
      ──────────────────
      • @name activates a directive for the current execution context.
      • Directives can be scoped to a single statement (prefix form) or
        to the entire medium_zeta block (when placed inside the { } block).
      • @gui, @engine, @mem bootstrap their subsystems lazily.

   6. GUI SYSTEM
      ───────────
      • ZetaGUI detects Electron via process.versions.electron.
      • In Electron: uses BrowserWindow + setShape() for non-rectangular windows.
      • In browser: uses <canvas> + CSS clip-path for custom shapes.
      • Rendering pipeline: addToLayer() → render() → _drawShape() per shape.
      • Shapes are described by <shape> tag descriptors (rect, circle, ellipse,
        polygon, path, text, line — all with transform, clip, blend support).

   7. 3D ENGINE
      ──────────
      • Detects Three.js at startup; uses it if present.
      • Falls back to a software Z-buffer rasterizer for headless/Node use.
      • Scene graph: scenes contain meshes, lights, camera, physics world.
      • Built-in primitives: cube, sphere, plane, cylinder, cone, torus.
      • Materials: standard, phong, toon, wireframe, unlit.
      • Physics: impulse-based rigid bodies, AABB broad-phase, substep integration.
      • Input: keyboard, mouse, gamepad (browser only).
      • Default GLSL shaders included as static strings.

   8. MODULE SYSTEM
      ─────────────
      • ZetaModuleLoader.load('ascii.zl') checks DSALibraries first (matching
        the pattern in ascii.js), then tries Node require(), then .zl source files.
      • Multiple search paths configurable via addSearchPath().
      • Loaded modules are cached; second load() returns cached copy.

   ═══════════════════════════════════════════════════════════════════════════════ */