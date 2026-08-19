(function AsciiLib() {
'use strict';

// ── Control character names (0–31 + 127) ────────────────────────────────────
const _CTRL_NAMES = {
   0:'NUL',  1:'SOH',  2:'STX',  3:'ETX',  4:'EOT',  5:'ENQ',  6:'ACK',
   7:'BEL',  8:'BS',   9:'HT',  10:'LF',  11:'VT',  12:'FF',  13:'CR',
  14:'SO',  15:'SI',  16:'DLE', 17:'DC1', 18:'DC2', 19:'DC3', 20:'DC4',
  21:'NAK', 22:'SYN', 23:'ETB', 24:'CAN', 25:'EM',  26:'SUB', 27:'ESC',
  28:'FS',  29:'GS',  30:'RS',  31:'US',  127:'DEL',
};

// ── Printable ASCII names (32–126) ───────────────────────────────────────────
const _PRINT_NAMES = {
   32:'SPACE',        33:'EXCLAMATION MARK',  34:'QUOTATION MARK',
   35:'NUMBER SIGN',  36:'DOLLAR SIGN',       37:'PERCENT SIGN',
   38:'AMPERSAND',    39:'APOSTROPHE',        40:'LEFT PARENTHESIS',
   41:'RIGHT PARENTHESIS', 42:'ASTERISK',     43:'PLUS SIGN',
   44:'COMMA',        45:'HYPHEN-MINUS',      46:'FULL STOP',
   47:'SOLIDUS',      48:'DIGIT ZERO',        49:'DIGIT ONE',
   50:'DIGIT TWO',    51:'DIGIT THREE',       52:'DIGIT FOUR',
   53:'DIGIT FIVE',   54:'DIGIT SIX',         55:'DIGIT SEVEN',
   56:'DIGIT EIGHT',  57:'DIGIT NINE',        58:'COLON',
   59:'SEMICOLON',    60:'LESS-THAN SIGN',    61:'EQUALS SIGN',
   62:'GREATER-THAN SIGN', 63:'QUESTION MARK', 64:'COMMERCIAL AT',
   65:'LATIN CAPITAL LETTER A', 66:'LATIN CAPITAL LETTER B',
   67:'LATIN CAPITAL LETTER C', 68:'LATIN CAPITAL LETTER D',
   69:'LATIN CAPITAL LETTER E', 70:'LATIN CAPITAL LETTER F',
   71:'LATIN CAPITAL LETTER G', 72:'LATIN CAPITAL LETTER H',
   73:'LATIN CAPITAL LETTER I', 74:'LATIN CAPITAL LETTER J',
   75:'LATIN CAPITAL LETTER K', 76:'LATIN CAPITAL LETTER L',
   77:'LATIN CAPITAL LETTER M', 78:'LATIN CAPITAL LETTER N',
   79:'LATIN CAPITAL LETTER O', 80:'LATIN CAPITAL LETTER P',
   81:'LATIN CAPITAL LETTER Q', 82:'LATIN CAPITAL LETTER R',
   83:'LATIN CAPITAL LETTER S', 84:'LATIN CAPITAL LETTER T',
   85:'LATIN CAPITAL LETTER U', 86:'LATIN CAPITAL LETTER V',
   87:'LATIN CAPITAL LETTER W', 88:'LATIN CAPITAL LETTER X',
   89:'LATIN CAPITAL LETTER Y', 90:'LATIN CAPITAL LETTER Z',
   91:'LEFT SQUARE BRACKET',    92:'REVERSE SOLIDUS',
   93:'RIGHT SQUARE BRACKET',   94:'CIRCUMFLEX ACCENT',
   95:'LOW LINE',               96:'GRAVE ACCENT',
   97:'LATIN SMALL LETTER A',   98:'LATIN SMALL LETTER B',
   99:'LATIN SMALL LETTER C',  100:'LATIN SMALL LETTER D',
  101:'LATIN SMALL LETTER E',  102:'LATIN SMALL LETTER F',
  103:'LATIN SMALL LETTER G',  104:'LATIN SMALL LETTER H',
  105:'LATIN SMALL LETTER I',  106:'LATIN SMALL LETTER J',
  107:'LATIN SMALL LETTER K',  108:'LATIN SMALL LETTER L',
  109:'LATIN SMALL LETTER M',  110:'LATIN SMALL LETTER N',
  111:'LATIN SMALL LETTER O',  112:'LATIN SMALL LETTER P',
  113:'LATIN SMALL LETTER Q',  114:'LATIN SMALL LETTER R',
  115:'LATIN SMALL LETTER S',  116:'LATIN SMALL LETTER T',
  117:'LATIN SMALL LETTER U',  118:'LATIN SMALL LETTER V',
  119:'LATIN SMALL LETTER W',  120:'LATIN SMALL LETTER X',
  121:'LATIN SMALL LETTER Y',  122:'LATIN SMALL LETTER Z',
  123:'LEFT CURLY BRACKET',    124:'VERTICAL LINE',
  125:'RIGHT CURLY BRACKET',   126:'TILDE',
};

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Resolve input to a char code.
 *   'A'  → 65
 *    65  → 65   (pass-through)
 * Returns NaN for anything invalid.
 */
function _toCode(input) {
  if (typeof input === 'number') return input;
  if (typeof input === 'string' && input.length > 0) return input.charCodeAt(0);
  return NaN;
}

/**
 * Resolve input to a single character.
 *   65   → 'A'
 *  'A'   → 'A'  (pass-through of first char)
 */
function _toChar(input) {
  if (typeof input === 'string' && input.length > 0) return input[0];
  if (typeof input === 'number' && !isNaN(input)) return String.fromCharCode(input);
  return '';
}

function _inAsciiRange(code) {
  return typeof code === 'number' && code >= 0 && code <= 127;
}

// ── Main ascii object ────────────────────────────────────────────────────────
const ascii = {};

// ── Core conversions ─────────────────────────────────────────────────────────

/**
 * ascii.get(char)
 * Returns the ASCII code for a character.
 *   ascii.get('H')   → 72
 *   ascii.get('a')   → 97
 *   ascii.get(' ')   → 32
 */
ascii.get = (char) => {
  const code = _toCode(char);
  return isNaN(code) ? null : code;
};

/**
 * ascii.convert(code)
 * Returns the character for an ASCII code.
 *   ascii.convert(97)   → 'a'
 *   ascii.convert(72)   → 'H'
 *   ascii.convert(32)   → ' '
 */
ascii.convert = (code) => {
  if (typeof code !== 'number' || isNaN(code)) return null;
  return String.fromCharCode(code);
};

// ── Encoding / Decoding ──────────────────────────────────────────────────────

/**
 * ascii.encode(str)
 * Converts a string into an array of ASCII codes.
 *   ascii.encode('Hi!')   → [72, 105, 33]
 */
ascii.encode = (str) => {
  if (typeof str !== 'string') return [];
  const result = [];
  for (let i = 0; i < str.length; i++) result.push(str.charCodeAt(i));
  return result;
};

/**
 * ascii.decode(codes)
 * Converts an array of ASCII codes into a string.
 *   ascii.decode([72, 105, 33])   → 'Hi!'
 */
ascii.decode = (codes) => {
  if (!Array.isArray(codes)) return '';
  return codes.map(c => (typeof c === 'number' ? String.fromCharCode(c) : '')).join('');
};

// ── Case utilities ────────────────────────────────────────────────────────────

/**
 * ascii.toUpper(charOrCode)
 * Converts a lowercase letter to uppercase.
 *   ascii.toUpper('a')   → 'A'
 *   ascii.toUpper(97)    → 'A'
 */
ascii.toUpper = (input) => {
  const ch = _toChar(input);
  return ch.toUpperCase();
};

/**
 * ascii.toLower(charOrCode)
 * Converts an uppercase letter to lowercase.
 *   ascii.toLower('A')   → 'a'
 *   ascii.toLower(65)    → 'a'
 */
ascii.toLower = (input) => {
  const ch = _toChar(input);
  return ch.toLowerCase();
};

/**
 * ascii.swapCase(str)
 * Swaps the case of every letter in a string.
 *   ascii.swapCase('Hello World')   → 'hELLO wORLD'
 */
ascii.swapCase = (str) => {
  if (typeof str !== 'string') return '';
  return str.split('').map(ch => {
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90)  return String.fromCharCode(c + 32);
    if (c >= 97 && c <= 122) return String.fromCharCode(c - 32);
    return ch;
  }).join('');
};

// ── Classification checks ────────────────────────────────────────────────────

/**
 * ascii.isLetter(charOrCode)
 * Returns true if A–Z or a–z.
 *   ascii.isLetter('A')   → true
 *   ascii.isLetter(51)    → false  (digit '3')
 */
ascii.isLetter = (input) => {
  const c = _toCode(input);
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
};

/**
 * ascii.isDigit(charOrCode)
 * Returns true if '0'–'9'.
 *   ascii.isDigit('5')   → true
 *   ascii.isDigit(48)    → true
 */
ascii.isDigit = (input) => {
  const c = _toCode(input);
  return c >= 48 && c <= 57;
};

/**
 * ascii.isAlphanumeric(charOrCode)
 * Returns true if letter or digit.
 *   ascii.isAlphanumeric('z')   → true
 *   ascii.isAlphanumeric('!')   → false
 */
ascii.isAlphanumeric = (input) => ascii.isLetter(input) || ascii.isDigit(input);

/**
 * ascii.isUpper(charOrCode)
 * Returns true if uppercase letter A–Z.
 *   ascii.isUpper('A')   → true
 *   ascii.isUpper('a')   → false
 */
ascii.isUpper = (input) => {
  const c = _toCode(input);
  return c >= 65 && c <= 90;
};

/**
 * ascii.isLower(charOrCode)
 * Returns true if lowercase letter a–z.
 *   ascii.isLower('a')   → true
 *   ascii.isLower('A')   → false
 */
ascii.isLower = (input) => {
  const c = _toCode(input);
  return c >= 97 && c <= 122;
};

/**
 * ascii.isPrintable(charOrCode)
 * Returns true if code is 32–126 (visible + space).
 *   ascii.isPrintable(65)   → true
 *   ascii.isPrintable(7)    → false  (BEL)
 */
ascii.isPrintable = (input) => {
  const c = _toCode(input);
  return c >= 32 && c <= 126;
};

/**
 * ascii.isWhitespace(charOrCode)
 * Returns true for space (32), tab (9), newline (10), carriage return (13),
 * vertical tab (11), form feed (12).
 *   ascii.isWhitespace(' ')    → true
 *   ascii.isWhitespace('\t')   → true
 */
ascii.isWhitespace = (input) => {
  const c = _toCode(input);
  return c === 32 || c === 9 || c === 10 || c === 13 || c === 11 || c === 12;
};

/**
 * ascii.isControl(charOrCode)
 * Returns true for control characters (0–31 and 127).
 *   ascii.isControl(0)     → true  (NUL)
 *   ascii.isControl(127)   → true  (DEL)
 *   ascii.isControl(65)    → false
 */
ascii.isControl = (input) => {
  const c = _toCode(input);
  return (c >= 0 && c <= 31) || c === 127;
};

/**
 * ascii.isPunctuation(charOrCode)
 * Returns true for punctuation / symbol characters
 * (33–47, 58–64, 91–96, 123–126).
 *   ascii.isPunctuation('!')   → true
 *   ascii.isPunctuation('A')   → false
 */
ascii.isPunctuation = (input) => {
  const c = _toCode(input);
  return (c >= 33 && c <= 47)  ||
         (c >= 58 && c <= 64)  ||
         (c >= 91 && c <= 96)  ||
         (c >= 123 && c <= 126);
};

/**
 * ascii.isAscii(charOrCode)
 * Returns true if the code is within valid ASCII range 0–127.
 *   ascii.isAscii('A')   → true
 *   ascii.isAscii(200)   → false
 */
ascii.isAscii = (input) => {
  const c = _toCode(input);
  return _inAsciiRange(c);
};

// ── Metadata ──────────────────────────────────────────────────────────────────

/**
 * ascii.name(charOrCode)
 * Returns the official name of an ASCII character.
 *   ascii.name(65)    → 'LATIN CAPITAL LETTER A'
 *   ascii.name('\n')  → 'LF'
 *   ascii.name(42)    → 'ASTERISK'
 */
ascii.name = (input) => {
  const c = _toCode(input);
  if (isNaN(c)) return null;
  return _CTRL_NAMES[c] || _PRINT_NAMES[c] || null;
};

/**
 * ascii.category(charOrCode)
 * Returns a human-readable category string.
 *   ascii.category('A')   → 'uppercase'
 *   ascii.category('a')   → 'lowercase'
 *   ascii.category('5')   → 'digit'
 *   ascii.category(' ')   → 'whitespace'
 *   ascii.category('!')   → 'punctuation'
 *   ascii.category(0)     → 'control'
 */
ascii.category = (input) => {
  if (ascii.isControl(input))     return 'control';
  if (ascii.isWhitespace(input))  return 'whitespace';
  if (ascii.isUpper(input))       return 'uppercase';
  if (ascii.isLower(input))       return 'lowercase';
  if (ascii.isDigit(input))       return 'digit';
  if (ascii.isPunctuation(input)) return 'punctuation';
  return 'unknown';
};

/**
 * ascii.describe(charOrCode)
 * Returns a full descriptor object for an ASCII character.
 *   ascii.describe('A')
 *   → { char:'A', code:65, hex:'0x41', binary:'01000001',
 *       name:'LATIN CAPITAL LETTER A', category:'uppercase' }
 */
ascii.describe = (input) => {
  const c   = _toCode(input);
  if (isNaN(c)) return null;
  const ch  = String.fromCharCode(c);
  return {
    char     : ascii.isPrintable(c) ? ch : null,
    code     : c,
    hex      : ascii.toHex(c),
    binary   : ascii.toBin(c),
    octal    : '0' + c.toString(8),
    name     : ascii.name(c),
    category : ascii.category(c),
  };
};

// ── Number base conversions ──────────────────────────────────────────────────

/**
 * ascii.toHex(charOrCode)
 * Returns the hex representation of the ASCII code (e.g. '0x41').
 *   ascii.toHex('A')   → '0x41'
 *   ascii.toHex(97)    → '0x61'
 */
ascii.toHex = (input) => {
  const c = _toCode(input);
  if (isNaN(c)) return null;
  return '0x' + c.toString(16).toUpperCase().padStart(2, '0');
};

/**
 * ascii.toBin(charOrCode)
 * Returns the 8-bit binary string of the ASCII code.
 *   ascii.toBin('A')   → '01000001'
 *   ascii.toBin(10)    → '00001010'
 */
ascii.toBin = (input) => {
  const c = _toCode(input);
  if (isNaN(c)) return null;
  return c.toString(2).padStart(8, '0');
};

/**
 * ascii.toOctal(charOrCode)
 * Returns the octal string of the ASCII code.
 *   ascii.toOctal('A')   → '0101'
 */
ascii.toOctal = (input) => {
  const c = _toCode(input);
  if (isNaN(c)) return null;
  return '0' + c.toString(8);
};

/**
 * ascii.fromHex(hexStr)
 * Returns the character for a hex code string.
 *   ascii.fromHex('0x41')   → 'A'
 *   ascii.fromHex('61')     → 'a'
 */
ascii.fromHex = (hexStr) => {
  if (typeof hexStr !== 'string') return null;
  const code = parseInt(hexStr.replace(/^0x/i, ''), 16);
  return isNaN(code) ? null : String.fromCharCode(code);
};

/**
 * ascii.fromBin(binStr)
 * Returns the character for an 8-bit binary string.
 *   ascii.fromBin('01000001')   → 'A'
 */
ascii.fromBin = (binStr) => {
  if (typeof binStr !== 'string') return null;
  const code = parseInt(binStr, 2);
  return isNaN(code) ? null : String.fromCharCode(code);
};

// ── Shifting & ciphers ────────────────────────────────────────────────────────

/**
 * ascii.shift(charOrCode, n)
 * Shifts a character's code by n positions.
 *   ascii.shift('A', 1)    → 'B'
 *   ascii.shift('z', -1)   → 'y'
 *   ascii.shift(65, 3)     → 'D'
 */
ascii.shift = (input, n) => {
  const c = _toCode(input);
  if (isNaN(c)) return null;
  return String.fromCharCode(c + (n || 0));
};

/**
 * ascii.rot13(str)
 * Applies ROT-13 substitution cipher to a string (letters only).
 *   ascii.rot13('Hello')    → 'Uryyb'
 *   ascii.rot13('Uryyb')    → 'Hello'
 */
ascii.rot13 = (str) => {
  if (typeof str !== 'string') return '';
  return str.split('').map(ch => {
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90)  return String.fromCharCode(((c - 65 + 13) % 26) + 65);
    if (c >= 97 && c <= 122) return String.fromCharCode(((c - 97 + 13) % 26) + 97);
    return ch;
  }).join('');
};

/**
 * ascii.caesar(str, shift)
 * Applies a Caesar cipher with a given shift (letters only, wraps within alphabet).
 *   ascii.caesar('Hello', 3)    → 'Khoor'
 *   ascii.caesar('Khoor', -3)   → 'Hello'
 */
ascii.caesar = (str, shift) => {
  if (typeof str !== 'string') return '';
  const s = ((shift % 26) + 26) % 26;
  return str.split('').map(ch => {
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90)  return String.fromCharCode(((c - 65 + s) % 26) + 65);
    if (c >= 97 && c <= 122) return String.fromCharCode(((c - 97 + s) % 26) + 97);
    return ch;
  }).join('');
};

// ── Range & table utilities ──────────────────────────────────────────────────

/**
 * ascii.range(start, end)
 * Returns an array of characters from start to end code (inclusive).
 *   ascii.range(65, 69)   → ['A','B','C','D','E']
 *   ascii.range('a', 'e') → ['a','b','c','d','e']
 */
ascii.range = (start, end) => {
  const s = _toCode(start);
  const e = _toCode(end);
  if (isNaN(s) || isNaN(e)) return [];
  const result = [];
  const step = s <= e ? 1 : -1;
  for (let i = s; step > 0 ? i <= e : i >= e; i += step) {
    result.push(String.fromCharCode(i));
  }
  return result;
};

/**
 * ascii.codes(start, end)
 * Like ascii.range() but returns code numbers instead of characters.
 *   ascii.codes(65, 69)   → [65, 66, 67, 68, 69]
 */
ascii.codes = (start, end) => {
  const s = _toCode(start);
  const e = _toCode(end);
  if (isNaN(s) || isNaN(e)) return [];
  const result = [];
  const step = s <= e ? 1 : -1;
  for (let i = s; step > 0 ? i <= e : i >= e; i += step) result.push(i);
  return result;
};

/**
 * ascii.table(filter?)
 * Returns the printable ASCII table (codes 32–126) as an array of descriptor objects.
 * Optional filter: 'letters' | 'digits' | 'punctuation' | 'uppercase' | 'lowercase'
 *   ascii.table()
 *   ascii.table('uppercase')
 */
ascii.table = (filter) => {
  const rows = [];
  for (let c = 32; c <= 126; c++) {
    const entry = ascii.describe(c);
    if (!filter) {
      rows.push(entry);
    } else {
      if (filter === 'letters'     && ascii.isLetter(c))      rows.push(entry);
      if (filter === 'digits'      && ascii.isDigit(c))       rows.push(entry);
      if (filter === 'punctuation' && ascii.isPunctuation(c)) rows.push(entry);
      if (filter === 'uppercase'   && ascii.isUpper(c))       rows.push(entry);
      if (filter === 'lowercase'   && ascii.isLower(c))       rows.push(entry);
      if (filter === 'whitespace'  && ascii.isWhitespace(c))  rows.push(entry);
    }
  }
  return rows;
};

/**
 * ascii.controlTable()
 * Returns an array of all 33 control characters (0–31 + 127) with their names.
 */
ascii.controlTable = () => {
  const rows = [];
  for (let c = 0; c <= 31; c++) rows.push(ascii.describe(c));
  rows.push(ascii.describe(127));
  return rows;
};

// ── String utilities ─────────────────────────────────────────────────────────

/**
 * ascii.clean(str)
 * Strips all non-printable / non-ASCII characters from a string.
 *   ascii.clean('Hello\x00World\x07')   → 'HelloWorld'
 */
ascii.clean = (str) => {
  if (typeof str !== 'string') return '';
  return str.split('').filter(ch => {
    const c = ch.charCodeAt(0);
    return c >= 32 && c <= 126;
  }).join('');
};

/**
 * ascii.isPureAscii(str)
 * Returns true if every character in the string is within 0–127.
 *   ascii.isPureAscii('Hello!')    → true
 *   ascii.isPureAscii('Héllo!')    → false
 */
ascii.isPureAscii = (str) => {
  if (typeof str !== 'string') return false;
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 127) return false;
  }
  return true;
};

/**
 * ascii.stats(str)
 * Returns a breakdown of character categories in a string.
 *   ascii.stats('Hello, World! 123')
 *   → { total:18, letters:10, uppercase:2, lowercase:8,
 *        digits:3, punctuation:2, whitespace:2, control:0, other:0 }
 */
ascii.stats = (str) => {
  if (typeof str !== 'string') return null;
  const s = { total:0, letters:0, uppercase:0, lowercase:0,
              digits:0, punctuation:0, whitespace:0, control:0, other:0 };
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    s.total++;
    if      (ascii.isControl(ch))     s.control++;
    else if (ascii.isWhitespace(ch))  s.whitespace++;
    else if (ascii.isUpper(ch))     { s.letters++; s.uppercase++; }
    else if (ascii.isLower(ch))     { s.letters++; s.lowercase++; }
    else if (ascii.isDigit(ch))       s.digits++;
    else if (ascii.isPunctuation(ch)) s.punctuation++;
    else                              s.other++;
  }
  return s;
};

/**
 * ascii.filter(str, category)
 * Keeps only characters matching the given category.
 * Categories: 'letters' | 'uppercase' | 'lowercase' | 'digits'
 *           | 'alphanumeric' | 'punctuation' | 'printable' | 'whitespace'
 *   ascii.filter('Hello, World! 123', 'letters')   → 'HelloWorld'
 *   ascii.filter('Hello, World! 123', 'digits')    → '123'
 */
ascii.filter = (str, category) => {
  if (typeof str !== 'string') return '';
  const checks = {
    letters      : ascii.isLetter,
    uppercase    : ascii.isUpper,
    lowercase    : ascii.isLower,
    digits       : ascii.isDigit,
    alphanumeric : ascii.isAlphanumeric,
    punctuation  : ascii.isPunctuation,
    printable    : ascii.isPrintable,
    whitespace   : ascii.isWhitespace,
  };
  const fn = checks[category];
  if (!fn) return str;
  return str.split('').filter(ch => fn(ch)).join('');
};

/**
 * ascii.compare(a, b)
 * Compares two chars / codes by their ASCII value.
 * Returns -1, 0, or 1.
 *   ascii.compare('A', 'B')   → -1
 *   ascii.compare('B', 'A')   → 1
 *   ascii.compare('A', 65)    → 0
 */
ascii.compare = (a, b) => {
  const ca = _toCode(a);
  const cb = _toCode(b);
  if (ca < cb) return -1;
  if (ca > cb) return  1;
  return 0;
};

/**
 * ascii.sort(arr, direction?)
 * Sorts an array of characters / codes by ASCII value.
 * direction: 'asc' (default) | 'desc'
 *   ascii.sort(['z','a','m'])          → ['a','m','z']
 *   ascii.sort(['z','a','m'], 'desc')  → ['z','m','a']
 */
ascii.sort = (arr, direction) => {
  if (!Array.isArray(arr)) return [];
  const copy = arr.slice();
  copy.sort((a, b) => ascii.compare(a, b));
  if (direction === 'desc') copy.reverse();
  return copy;
};

// ── Lookup shortcuts ──────────────────────────────────────────────────────────

/** ascii.letters()   → Array of all 52 ASCII letters (A–Z then a–z) */
ascii.letters     = () => ascii.range(65, 90).concat(ascii.range(97, 122));

/** ascii.uppercase() → Array of uppercase letters A–Z */
ascii.uppercase   = () => ascii.range(65, 90);

/** ascii.lowercase() → Array of lowercase letters a–z */
ascii.lowercase   = () => ascii.range(97, 122);

/** ascii.digits()    → Array of digit characters ['0'..'9'] */
ascii.digits      = () => ascii.range(48, 57);

/** ascii.printable() → Array of all printable characters (32–126) */
ascii.printable   = () => ascii.range(32, 126);

/** ascii.alphabet()  → Array ['A'..'Z'] */
ascii.alphabet    = () => ascii.range(65, 90);

// ── DSALibraries registration (matches loader.zl pattern) ────────────────────
if (typeof DSALibraries !== 'undefined') {
  DSALibraries['ascii.zl'] = {
    description: 'ASCII utilities: char↔code conversions, classification, encoding/decoding, ' +
                 'ciphers (ROT-13, Caesar), hex/binary/octal, table lookups, string filtering — ' +
                 'browser + Node/Electron compatible',
    inject(G) {
      if (typeof window !== 'undefined' && window.__ZPP__) {
        window.__ZPP__.registerBuiltins([
          // Core
          'ascii',
          // Conversions
          'get', 'convert',
          // Encode / Decode
          'encode', 'decode',
          // Case
          'toUpper', 'toLower', 'swapCase',
          // Classification
          'isLetter', 'isDigit', 'isAlphanumeric',
          'isUpper', 'isLower',
          'isPrintable', 'isWhitespace', 'isControl', 'isPunctuation', 'isAscii',
          // Metadata
          'name', 'category', 'describe',
          // Number bases
          'toHex', 'toBin', 'toOctal', 'fromHex', 'fromBin',
          // Ciphers / Shifting
          'shift', 'rot13', 'caesar',
          // Range & Table
          'range', 'codes', 'table', 'controlTable',
          // String utilities
          'clean', 'isPureAscii', 'stats', 'filter', 'compare', 'sort',
          // Shortcut arrays
          'letters', 'uppercase', 'lowercase', 'digits', 'printable', 'alphabet',
        ]);
        window.__ZPP__.registerTypes(['ascii']);
      }

      G.ascii = ascii;
    }
  };
}

if (typeof module !== 'undefined') module.exports = ascii;

})();
