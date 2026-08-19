(function OSSimLib() {
'use strict';

const fs = require('fs');
const path = require('path');
const _nodeOS = require('os');

function _uid(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 10) + '_' + (Date.now() % 100000);
}

function _assert(condition, msg) {
  if (!condition) throw new TypeError('[os_sim.zl] ' + msg);
}

const _globalAppIcons = new Map();

function _isVM(x) {
  return x instanceof VirtualMachine;
}

function _toDataURI(imagePath) {
  if (/^https?:\/\//i.test(imagePath) || /^data:/i.test(imagePath)) return imagePath;
  _assert(fs.existsSync(imagePath), 'os_app_icon: image file not found at "' + imagePath + '".');
  const ext = path.extname(imagePath).slice(1).toLowerCase();
  const mimeMap = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    svg: 'image/svg+xml', webp: 'image/webp', ico: 'image/x-icon', bmp: 'image/bmp'
  };
  const mime = mimeMap[ext] || 'application/octet-stream';
  const buf = fs.readFileSync(imagePath);
  return 'data:' + mime + ';base64,' + buf.toString('base64');
}

function _escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

class EventedBase {
  constructor() {
    this._listeners = Object.create(null);
  }
  _emit(event, ...args) {
    const fns = this._listeners[event];
    if (fns) fns.slice().forEach(fn => fn(...args));
  }
  on(event, fn) {
    (this._listeners[event] || (this._listeners[event] = [])).push(fn);
    return this;
  }
  off(event, fn) {
    const fns = this._listeners[event];
    if (!fns) return this;
    const idx = fns.indexOf(fn);
    if (idx !== -1) fns.splice(idx, 1);
    return this;
  }
}

class VirtualMemory extends EventedBase {
  constructor(totalBytes) {
    super();
    _assert(typeof totalBytes === 'number' && totalBytes > 0, 'VirtualMemory: totalBytes must be > 0.');
    this._total = totalBytes;
    this._used = 0;
    this._blocks = new Map();
  }
  alloc(size, owner) {
    _assert(typeof size === 'number' && size > 0, 'memory_alloc: size must be > 0.');
    if (this._used + size > this._total) {
      this._emit('outOfMemory', size, owner);
      throw new RangeError('[os_sim.zl] Out of virtual memory: requested ' + size + ', available ' + (this._total - this._used) + '.');
    }
    const ptr = _uid('mem');
    this._blocks.set(ptr, { size, owner: owner || null, data: null });
    this._used += size;
    this._emit('alloc', ptr, size, owner);
    return ptr;
  }
  free(ptr) {
    const block = this._blocks.get(ptr);
    if (!block) return false;
    this._used -= block.size;
    this._blocks.delete(ptr);
    this._emit('free', ptr);
    return true;
  }
  read(ptr) {
    const block = this._blocks.get(ptr);
    _assert(block, 'memory_read: invalid pointer "' + ptr + '".');
    return block.data;
  }
  write(ptr, data) {
    const block = this._blocks.get(ptr);
    _assert(block, 'memory_write: invalid pointer "' + ptr + '".');
    block.data = data;
    this._emit('write', ptr, data);
    return true;
  }
  usage() {
    return { total: this._total, used: this._used, free: this._total - this._used, blocks: this._blocks.size };
  }
  defragment() {
    this._emit('defragment');
    return this.usage();
  }
}

class VirtualProcess extends EventedBase {
  constructor(pid, name, fn, priority) {
    super();
    this.pid = pid;
    this.name = name;
    this._fn = fn || null;
    this.priority = (typeof priority === 'number') ? priority : 5;
    this.state = 'ready';
    this.createdAt = Date.now();
    this._wakeAt = 0;
    this._context = {};
  }
  run(vm) {
    if (this.state === 'terminated') return;
    this.state = 'running';
    this._emit('run', this);
    if (this._fn) {
      try {
        this._fn(vm, this);
      } catch (err) {
        this._emit('error', this, err);
      }
    }
    if (this.state === 'running') this.state = 'ready';
  }
  sleep(ms) {
    this.state = 'sleeping';
    this._wakeAt = Date.now() + ms;
    this._emit('sleep', this, ms);
  }
  wake() {
    if (this.state === 'sleeping') {
      this.state = 'ready';
      this._emit('wake', this);
    }
  }
  kill() {
    this.state = 'terminated';
    this._emit('terminated', this);
  }
}

class VirtualScheduler extends EventedBase {
  constructor(algorithm) {
    super();
    this.algorithm = algorithm || 'round_robin';
    this._rrPointer = 0;
  }
  setAlgorithm(algorithm) {
    this.algorithm = algorithm;
  }
  tick(vm) {
    const procs = Array.from(vm._processes.values()).filter(p => p.state !== 'terminated');
    procs.forEach(p => {
      if (p.state === 'sleeping' && Date.now() >= p._wakeAt) p.wake();
    });
    const runnable = procs.filter(p => p.state === 'ready');
    if (runnable.length === 0) return null;

    let chosen;
    if (this.algorithm === 'priority') {
      chosen = runnable.reduce((best, p) => (p.priority > best.priority ? p : best), runnable[0]);
    } else if (this.algorithm === 'fcfs') {
      chosen = runnable.reduce((oldest, p) => (p.createdAt < oldest.createdAt ? p : oldest), runnable[0]);
    } else {
      this._rrPointer = this._rrPointer % runnable.length;
      chosen = runnable[this._rrPointer];
      this._rrPointer++;
    }
    chosen.run(vm);
    this._emit('scheduled', chosen);
    return chosen;
  }
  getQueue(vm) {
    return Array.from(vm._processes.values()).map(p => ({ pid: p.pid, name: p.name, state: p.state, priority: p.priority }));
  }
}

class VirtualCPU extends EventedBase {
  constructor(cores) {
    super();
    this.cores = cores || 1;
    this._cycles = 0;
    this._usageHistory = [];
  }
  tick(vm) {
    this._cycles++;
    const scheduled = vm.scheduler.tick(vm);
    const busy = scheduled ? 1 : 0;
    this._usageHistory.push(busy);
    if (this._usageHistory.length > 50) this._usageHistory.shift();
    this._emit('tick', this._cycles, scheduled);
    return scheduled;
  }
  usage() {
    if (this._usageHistory.length === 0) return 0;
    const sum = this._usageHistory.reduce((a, b) => a + b, 0);
    return sum / this._usageHistory.length;
  }
}

class FSNode {
  constructor(name, type, owner) {
    this.name = name;
    this.type = type;
    this.owner = owner || 'root';
    this.mode = type === 'dir' ? 0o755 : 0o644;
    this.data = type === 'file' ? '' : null;
    this.children = type === 'dir' ? new Map() : null;
    this.createdAt = Date.now();
    this.modifiedAt = Date.now();
  }
}

class VirtualFileSystem extends EventedBase {
  constructor(rootLabel) {
    super();
    this.label = rootLabel || 'root';
    this.root = new FSNode('/', 'dir', 'root');
  }
  _split(p) {
    return p.split('/').filter(Boolean);
  }
  _resolveParent(p) {
    const parts = this._split(p);
    const name = parts.pop();
    let node = this.root;
    for (const part of parts) {
      _assert(node.children && node.children.has(part), 'fs: path segment "' + part + '" does not exist.');
      node = node.children.get(part);
      _assert(node.type === 'dir', 'fs: "' + part + '" is not a directory.');
    }
    return { parent: node, name };
  }
  resolve(p) {
    if (p === '/' || p === '') return this.root;
    const parts = this._split(p);
    let node = this.root;
    for (const part of parts) {
      _assert(node.children && node.children.has(part), 'fs: path "' + p + '" does not exist.');
      node = node.children.get(part);
    }
    return node;
  }
  exists(p) {
    try { this.resolve(p); return true; } catch (_) { return false; }
  }
  mkdir(p, owner) {
    const { parent, name } = this._resolveParent(p);
    _assert(!parent.children.has(name), 'fs_mkdir: "' + p + '" already exists.');
    const dir = new FSNode(name, 'dir', owner);
    parent.children.set(name, dir);
    this._emit('mkdir', p);
    return dir;
  }
  touch(p, owner) {
    const { parent, name } = this._resolveParent(p);
    if (parent.children.has(name)) return parent.children.get(name);
    const file = new FSNode(name, 'file', owner);
    parent.children.set(name, file);
    this._emit('touch', p);
    return file;
  }
  writeFile(p, data, owner) {
    let node;
    if (this.exists(p)) {
      node = this.resolve(p);
      _assert(node.type === 'file', 'fs_writeFile: "' + p + '" is a directory.');
    } else {
      node = this.touch(p, owner);
    }
    node.data = data;
    node.modifiedAt = Date.now();
    this._emit('write', p, data);
    return true;
  }
  readFile(p) {
    const node = this.resolve(p);
    _assert(node.type === 'file', 'fs_readFile: "' + p + '" is a directory.');
    return node.data;
  }
  deleteFile(p) {
    const { parent, name } = this._resolveParent(p);
    _assert(parent.children.has(name), 'fs_deleteFile: "' + p + '" does not exist.');
    const node = parent.children.get(name);
    _assert(node.type === 'file', 'fs_deleteFile: "' + p + '" is a directory, use fs_deleteDir.');
    parent.children.delete(name);
    this._emit('delete', p);
    return true;
  }
  deleteDir(p) {
    const { parent, name } = this._resolveParent(p);
    _assert(parent.children.has(name), 'fs_deleteDir: "' + p + '" does not exist.');
    const node = parent.children.get(name);
    _assert(node.type === 'dir', 'fs_deleteDir: "' + p + '" is a file, use fs_deleteFile.');
    parent.children.delete(name);
    this._emit('deleteDir', p);
    return true;
  }
  list(p) {
    const node = this.resolve(p || '/');
    _assert(node.type === 'dir', 'fs_list: "' + p + '" is not a directory.');
    return Array.from(node.children.values()).map(n => ({
      name: n.name, type: n.type, size: n.type === 'file' ? (n.data || '').length : null,
      owner: n.owner, mode: n.mode
    }));
  }
  rename(oldPath, newName) {
    const { parent, name } = this._resolveParent(oldPath);
    _assert(parent.children.has(name), 'fs_rename: "' + oldPath + '" does not exist.');
    const node = parent.children.get(name);
    parent.children.delete(name);
    node.name = newName;
    parent.children.set(newName, node);
    this._emit('rename', oldPath, newName);
    return true;
  }
  move(srcPath, dstPath) {
    const { parent: srcParent, name: srcName } = this._resolveParent(srcPath);
    _assert(srcParent.children.has(srcName), 'fs_move: "' + srcPath + '" does not exist.');
    const node = srcParent.children.get(srcName);
    const { parent: dstParent, name: dstName } = this._resolveParent(dstPath);
    srcParent.children.delete(srcName);
    node.name = dstName;
    dstParent.children.set(dstName, node);
    this._emit('move', srcPath, dstPath);
    return true;
  }
  stat(p) {
    const node = this.resolve(p);
    return {
      name: node.name, type: node.type, owner: node.owner, mode: node.mode,
      createdAt: node.createdAt, modifiedAt: node.modifiedAt,
      size: node.type === 'file' ? (node.data || '').length : null
    };
  }
  chmod(p, mode) {
    const node = this.resolve(p);
    node.mode = mode;
    this._emit('chmod', p, mode);
    return true;
  }
  chown(p, owner) {
    const node = this.resolve(p);
    node.owner = owner;
    this._emit('chown', p, owner);
    return true;
  }
}

class VirtualDisk extends EventedBase {
  constructor(label, sizeBytes) {
    super();
    this.label = label;
    this.size = sizeBytes;
    this.formatted = false;
    this.fsType = null;
    this.fs = null;
    this.mountPoint = null;
  }
  format(fsType) {
    this.fsType = fsType || 'zfsim';
    this.fs = new VirtualFileSystem(this.label);
    this.formatted = true;
    this._emit('format', fsType);
    return true;
  }
  usage() {
    if (!this.fs) return { total: this.size, used: 0, free: this.size };
    const used = this._sizeOf(this.fs.root);
    return { total: this.size, used, free: this.size - used };
  }
  _sizeOf(node) {
    if (node.type === 'file') return (node.data || '').length;
    let total = 0;
    if (node.children) node.children.forEach(child => { total += this._sizeOf(child); });
    return total;
  }
}

class VirtualUser {
  constructor(username, password, role) {
    this.username = username;
    this._password = password;
    this.role = role || 'user';
    this.createdAt = Date.now();
  }
}

class PermissionManager extends EventedBase {
  constructor() {
    super();
    this._acl = new Map();
  }
  grant(p, user, perm) {
    if (!this._acl.has(p)) this._acl.set(p, new Map());
    const users = this._acl.get(p);
    if (!users.has(user)) users.set(user, new Set());
    users.get(user).add(perm);
    this._emit('grant', p, user, perm);
    return true;
  }
  revoke(p, user, perm) {
    const users = this._acl.get(p);
    if (!users || !users.has(user)) return false;
    users.get(user).delete(perm);
    this._emit('revoke', p, user, perm);
    return true;
  }
  check(p, user, perm) {
    if (user === 'root') return true;
    const users = this._acl.get(p);
    if (!users || !users.has(user)) return false;
    return users.get(user).has(perm);
  }
}

class VirtualRegistry extends EventedBase {
  constructor() {
    super();
    this._store = new Map();
  }
  set(key, value) {
    this._store.set(key, value);
    this._emit('set', key, value);
    return true;
  }
  get(key) {
    return this._store.has(key) ? this._store.get(key) : null;
  }
  delete(key) {
    const existed = this._store.delete(key);
    if (existed) this._emit('delete', key);
    return existed;
  }
  list(prefix) {
    const keys = Array.from(this._store.keys());
    return prefix ? keys.filter(k => k.startsWith(prefix)) : keys;
  }
}

class VirtualService extends EventedBase {
  constructor(name, fn) {
    super();
    this.name = name;
    this._fn = fn;
    this.status = 'stopped';
    this._handle = null;
  }
  start(vm) {
    if (this.status === 'running') return false;
    this.status = 'running';
    this._handle = this._fn ? this._fn(vm, this) : null;
    this._emit('start', this);
    return true;
  }
  stop() {
    if (this.status !== 'running') return false;
    this.status = 'stopped';
    if (typeof this._handle === 'function') {
      try { this._handle(); } catch (_) {}
    }
    this._handle = null;
    this._emit('stop', this);
    return true;
  }
}

class VirtualDriver {
  constructor(name, handlers) {
    this.name = name;
    this._handlers = handlers || {};
    this.registered = true;
  }
  call(method, ...args) {
    _assert(typeof this._handlers[method] === 'function', 'driver_call: "' + this.name + '" has no method "' + method + '".');
    return this._handlers[method](...args);
  }
}

class VirtualNetwork extends EventedBase {
  constructor() {
    super();
    this._connections = new Map();
    this._listenersByPort = new Map();
    this._online = true;
  }
  connect(hostAddr) {
    const connId = _uid('conn');
    this._connections.set(connId, { hostAddr, connectedAt: Date.now() });
    this._emit('connect', connId, hostAddr);
    return connId;
  }
  disconnect(connId) {
    const existed = this._connections.delete(connId);
    if (existed) this._emit('disconnect', connId);
    return existed;
  }
  send(connId, data) {
    _assert(this._connections.has(connId), 'network_send: unknown connection "' + connId + '".');
    this._emit('send', connId, data);
    return true;
  }
  listen(port, handler) {
    this._listenersByPort.set(port, handler);
    this._emit('listen', port);
    return true;
  }
  setOnline(online) {
    this._online = Boolean(online);
    this._emit('onlineChange', this._online);
  }
}

class IPCChannel extends EventedBase {
  constructor(name) {
    super();
    this.name = name;
    this._queues = new Map();
  }
  send(pid, message) {
    if (!this._queues.has(pid)) this._queues.set(pid, []);
    this._queues.get(pid).push(message);
    this._emit('message', pid, message);
    return true;
  }
  receive(pid) {
    const queue = this._queues.get(pid);
    if (!queue || queue.length === 0) return null;
    return queue.shift();
  }
  broadcast(message) {
    this._queues.forEach((queue) => { queue.push(message); });
    this._emit('broadcast', message);
    return true;
  }
}

class OSWindow extends EventedBase {
  constructor(id, options) {
    super();
    this.id = id;
    this.title = (options && options.title) || 'Untitled';
    this.width = (options && options.width) || 640;
    this.height = (options && options.height) || 480;
    this.x = (options && options.x) || 40;
    this.y = (options && options.y) || 40;
    this.resizable = (options && options.resizable !== undefined) ? options.resizable : true;
    this.state = 'normal';
    this.content = null;
  }
  setContent(content) {
    this.content = content;
    this._emit('contentChange', content);
    return this;
  }
  move(x, y) {
    this.x = x; this.y = y;
    this._emit('move', x, y);
    return this;
  }
  resize(w, h) {
    _assert(this.resizable, 'window_resize: window "' + this.title + '" is not resizable.');
    this.width = w; this.height = h;
    this._emit('resize', w, h);
    return this;
  }
  minimize() { this.state = 'minimized'; this._emit('minimize', this); return this; }
  maximize() { this.state = 'maximized'; this._emit('maximize', this); return this; }
  restore()  { this.state = 'normal';    this._emit('restore', this);  return this; }
  focus()    { this._emit('focus', this); return this; }
  close() {
    this.state = 'closed';
    this._emit('close', this);
    return this;
  }
}

class OSTaskbar extends EventedBase {
  constructor(id, options) {
    super();
    this.id = id;
    this.position = (options && options.position) || 'bottom';
    this._items = new Map();
  }
  addItem(windowId) {
    this._items.set(windowId, { windowId, addedAt: Date.now() });
    this._emit('itemAdded', windowId);
    return true;
  }
  removeItem(windowId) {
    const existed = this._items.delete(windowId);
    if (existed) this._emit('itemRemoved', windowId);
    return existed;
  }
  items() {
    return Array.from(this._items.keys());
  }
}

class OSStartMenu extends EventedBase {
  constructor(id, options) {
    super();
    this.id = id;
    this.label = (options && options.label) || 'Start';
    this._entries = new Map();
  }
  addEntry(label, onClick) {
    this._entries.set(label, onClick || null);
    this._emit('entryAdded', label);
    return true;
  }
  removeEntry(label) {
    const existed = this._entries.delete(label);
    if (existed) this._emit('entryRemoved', label);
    return existed;
  }
  trigger(label) {
    const fn = this._entries.get(label);
    _assert(fn, 'startmenu: no entry named "' + label + '".');
    return fn();
  }
  entries() {
    return Array.from(this._entries.keys());
  }
}

class OSIcon extends EventedBase {
  constructor(id, options) {
    super();
    this.id = id;
    this.label = (options && options.label) || 'Icon';
    this.x = (options && options.x) || 0;
    this.y = (options && options.y) || 0;
    this.src = null;
    this._onDoubleClick = (options && options.onDoubleClick) || null;
  }
  move(x, y) { this.x = x; this.y = y; this._emit('move', x, y); return this; }
  doubleClick() {
    if (this._onDoubleClick) this._onDoubleClick(this);
    this._emit('doubleClick', this);
  }
}

class OSFileExplorer extends EventedBase {
  constructor(id, vm, options) {
    super();
    this.id = id;
    this._vm = vm;
    this.path = (options && options.path) || '/';
    this.windowId = null;
  }
  navigate(p) {
    _assert(this._vm.fs.exists(p), 'fileexplorer_navigate: "' + p + '" does not exist.');
    this.path = p;
    this._emit('navigate', p);
    return this.refresh();
  }
  refresh() {
    const listing = this._vm.fs.list(this.path);
    this._emit('refresh', listing);
    return listing;
  }
}

class OSDialog extends EventedBase {
  constructor(id, options) {
    super();
    this.id = id;
    this.type = (options && options.type) || 'info';
    this.message = (options && options.message) || '';
    this.buttons = (options && options.buttons) || ['OK'];
    this.visible = false;
    this.result = null;
  }
  show() { this.visible = true; this._emit('show', this); return this; }
  close(result) {
    this.visible = false;
    this.result = result !== undefined ? result : null;
    this._emit('close', this.result);
    return this;
  }
}

class OSDesktop extends EventedBase {
  constructor(id, options) {
    super();
    this.id = id;
    this.background = (options && options.background) || '#008080';
    this.theme = (options && options.theme) || 'classic';
    this.icons = [];
    this.windows = [];
  }
  render() {
    this._emit('render', this);
    return { background: this.background, theme: this.theme, icons: this.icons.length, windows: this.windows.length };
  }
}

class OSShell extends EventedBase {
  constructor(id, vm, options) {
    super();
    this.id = id;
    this._vm = vm;
    this.prompt = (options && options.prompt) || '$ ';
    this._commands = new Map();
    this.cwd = '/';
  }
  registerCommand(name, handler) {
    this._commands.set(name, handler);
    return true;
  }
  unregisterCommand(name) {
    return this._commands.delete(name);
  }
  execute(commandLine) {
    const parts = commandLine.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    const cmdName = parts[0];
    const args = parts.slice(1);
    const handler = this._commands.get(cmdName);
    if (!handler) {
      const out = cmdName + ': command not found';
      this._emit('output', out);
      return out;
    }
    let result;
    try {
      result = handler(this._vm, this, args);
    } catch (err) {
      result = 'error: ' + err.message;
    }
    this._emit('output', result);
    return result;
  }
  pipe(commandLine1, commandLine2) {
    const intermediate = this.execute(commandLine1);
    const parts2 = commandLine2.trim().split(/\s+/).filter(Boolean);
    const cmdName2 = parts2[0];
    const handler2 = this._commands.get(cmdName2);
    if (!handler2) return intermediate;
    return handler2(this._vm, this, parts2.slice(1), intermediate);
  }
  runScript(lines) {
    return lines.map(line => this.execute(line));
  }
}

class OSTerminal extends EventedBase {
  constructor(id, shell, options) {
    super();
    this.id = id;
    this.shell = shell;
    this.cols = (options && options.cols) || 80;
    this.rows = (options && options.rows) || 24;
    this._buffer = [];
    this._inputHandler = null;
    this.windowId = null;
  }
  write(text) {
    this._buffer.push(text);
    this._emit('write', text);
    return this;
  }
  clear() {
    this._buffer = [];
    this._emit('clear');
    return this;
  }
  onInput(handler) {
    this._inputHandler = handler;
    return this;
  }
  input(line) {
    if (this._inputHandler) this._inputHandler(line);
    const output = this.shell.execute(line);
    this.write(this.shell.prompt + line);
    if (output) this.write(String(output));
    return output;
  }
  getBuffer() {
    return this._buffer.slice();
  }
}

class BootSequence extends EventedBase {
  constructor() {
    super();
    this._steps = [];
  }
  addStep(name, fn) {
    this._steps.push({ name, fn });
    return this;
  }
  setSequence(steps) {
    this._steps = steps.slice();
    return this;
  }
  run(vm) {
    const log = [];
    for (const step of this._steps) {
      this._emit('stepStart', step.name);
      try {
        step.fn(vm);
        log.push({ name: step.name, ok: true });
      } catch (err) {
        log.push({ name: step.name, ok: false, error: err.message });
        this._emit('stepError', step.name, err);
        break;
      }
      this._emit('stepEnd', step.name);
    }
    this._emit('bootComplete', log);
    return log;
  }
}

class VirtualMachine extends EventedBase {
  constructor(config) {
    super();
    config = config || {};
    this.label = config.label || _uid('vm');
    this.memory = new VirtualMemory(config.memoryBytes || 1024 * 1024 * 64);
    this.cpu = new VirtualCPU(config.cores || 1);
    this.scheduler = new VirtualScheduler(config.schedulerAlgorithm || 'round_robin');
    this.fs = new VirtualFileSystem('root');
    this.registry = new VirtualRegistry();
    this.permissions = new PermissionManager();
    this.network = new VirtualNetwork();
    this.boot = new BootSequence();

    this._processes = new Map();
    this._disks = new Map();
    this._users = new Map();
    this._services = new Map();
    this._drivers = new Map();
    this._ipcChannels = new Map();
    this._windows = new Map();
    this._taskbars = new Map();
    this._startMenus = new Map();
    this._icons = new Map();
    this._explorers = new Map();
    this._dialogs = new Map();
    this._desktops = new Map();
    this._shells = new Map();
    this._terminals = new Map();
    this._appIcons = new Map();

    this._screen = null;
    this._taskManagerWindows = null;
    this._settingsWindows = null;

    this.currentUser = null;
    this.booted = false;

    this._users.set('root', new VirtualUser('root', config.rootPassword || 'root', 'admin'));
  }
}

function _requireElectronMain() {
  let electron;
  try {
    electron = require('electron');
  } catch (_) {
    throw new Error('[os_sim.zl] os_screen_create requires the "electron" package. Install it with: npm install electron --save-dev');
  }
  if (typeof electron === 'string' || !electron || typeof electron.BrowserWindow !== 'function' || !electron.app) {
    throw new Error('[os_sim.zl] os_screen_create must run inside Electron\'s main process. Launch your ZPP host script with the electron binary (for example: "electron main.js"), not plain "node".');
  }
  return electron;
}

function _screenSend(vm, type, payload) {
  const screen = vm._screen;
  if (!screen) return;
  const msg = { type: type, payload: payload || {} };
  if (screen.ready && screen.win && !screen.win.isDestroyed()) {
    screen.win.webContents.send('os:event-' + vm.label, msg);
  } else {
    screen.queue.push(msg);
  }
}

function _screenSyncAll(vm) {
  vm._desktops.forEach(desk => {
    _screenSend(vm, 'desktop:background', { background: desk.background });
  });
  vm._windows.forEach(win => {
    _screenSend(vm, 'window:create', {
      id: win.id, title: win.title, x: win.x, y: win.y,
      width: win.width, height: win.height, resizable: win.resizable
    });
    if (win.content) _screenSend(vm, 'window:contentChange', { id: win.id, content: win.content });
    if (win.state === 'minimized') _screenSend(vm, 'window:minimize', { id: win.id });
  });
  vm._icons.forEach(icon => {
    _screenSend(vm, 'icon:create', { id: icon.id, label: icon.label, x: icon.x, y: icon.y, src: icon.src });
  });
  vm._startMenus.forEach(menu => {
    menu.entries().forEach(label => _screenSend(vm, 'startmenu:entryAdded', { menuId: menu.id, label: label }));
  });
}

function _refreshTaskManagers(vm) {
  if (!vm._taskManagerWindows) return;
  vm._taskManagerWindows.forEach(id => {
    const win = vm._windows.get(id);
    if (win && win._tmRender) win._tmRender();
  });
}

function _refreshSettings(vm) {
  if (!vm._settingsWindows) return;
  vm._settingsWindows.forEach(id => {
    const win = vm._windows.get(id);
    if (win && win._settingsRender) win._settingsRender();
  });
}

function _calculatorHTML(winId) {
  const keys = ['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', 'C', '0', '=', '+'];
  let buttons = '';
  keys.forEach(k => {
    buttons += '<button style="width:25%;box-sizing:border-box;height:40px;font-size:16px;" onclick="oscalcPress(\'' + winId + '\',\'' + k + '\')">' + k + '</button>';
  });
  return '<div id="calc-disp-' + winId + '" style="background:#fff;border:1px inset #888;padding:8px;text-align:right;' +
    'font-family:Consolas,monospace;font-size:20px;height:30px;margin-bottom:6px;overflow:hidden;"></div>' +
    '<div style="display:flex;flex-wrap:wrap;">' + buttons + '</div>';
}

function _clientScript(vmLabel) {
  return `
const { ipcRenderer } = require('electron');
const VM_LABEL = ${JSON.stringify(vmLabel)};
const ACTION_CHANNEL = 'os:action-' + VM_LABEL;
const EVENT_CHANNEL = 'os:event-' + VM_LABEL;

function send(type, payload) {
  ipcRenderer.send(ACTION_CHANNEL, Object.assign({ type: type }, payload || {}));
}
window.send = send;

var oscalcState = {};
window.oscalcPress = function (winId, key) {
  var st = oscalcState[winId] || (oscalcState[winId] = { expr: '' });
  var disp = document.getElementById('calc-disp-' + winId);
  if (key === 'C') {
    st.expr = '';
  } else if (key === '=') {
    try { st.expr = String(Function('"use strict"; return (' + st.expr + ')')()); }
    catch (e) { st.expr = 'Error'; }
  } else {
    st.expr += key;
  }
  if (disp) disp.textContent = st.expr;
};

var windowsEl = document.getElementById('windows');
var iconsEl = document.getElementById('icons');
var taskbarItemsEl = document.getElementById('taskbar-items');
var startMenuEl = document.getElementById('startmenu');
var dialogsEl = document.getElementById('dialogs');
var startBtnEl = document.getElementById('startbtn');

startBtnEl.addEventListener('click', function () {
  startMenuEl.classList.toggle('open');
});
document.getElementById('desktop').addEventListener('mousedown', function () {
  startMenuEl.classList.remove('open');
});

var zTop = 10;
function bringToFront(el) {
  zTop += 1;
  el.style.zIndex = String(zTop);
}

function makeDraggable(handleEl, winEl, onEnd) {
  handleEl.addEventListener('mousedown', function (e) {
    if (e.target.classList.contains('os-window-btn')) return;
    var startX = e.clientX, startY = e.clientY;
    var rect = winEl.getBoundingClientRect();
    var parentRect = winEl.parentElement.getBoundingClientRect();
    var origLeft = rect.left - parentRect.left;
    var origTop = rect.top - parentRect.top;
    bringToFront(winEl);
    function onMove(ev) {
      var dx = ev.clientX - startX;
      var dy = ev.clientY - startY;
      winEl.style.left = (origLeft + dx) + 'px';
      winEl.style.top = (origTop + dy) + 'px';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      onEnd(parseInt(winEl.style.left, 10), parseInt(winEl.style.top, 10));
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function makeResizable(handleEl, winEl, onEnd) {
  handleEl.addEventListener('mousedown', function (e) {
    e.stopPropagation();
    var startX = e.clientX, startY = e.clientY;
    var startW = winEl.offsetWidth, startH = winEl.offsetHeight;
    function onMove(ev) {
      var dw = ev.clientX - startX;
      var dh = ev.clientY - startY;
      winEl.style.width = Math.max(160, startW + dw) + 'px';
      winEl.style.height = Math.max(100, startH + dh) + 'px';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      onEnd(winEl.offsetWidth, winEl.offsetHeight);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function createWindowEl(win) {
  var el = document.createElement('div');
  el.className = 'os-window';
  el.id = 'win-' + win.id;
  el.style.left = win.x + 'px';
  el.style.top = win.y + 'px';
  el.style.width = win.width + 'px';
  el.style.height = win.height + 'px';
  el.innerHTML =
    '<div class="os-window-titlebar">' +
      '<span class="os-window-title"></span>' +
      '<div class="os-window-btn" data-act="minimize">_</div>' +
      '<div class="os-window-btn" data-act="maximize">□</div>' +
      '<div class="os-window-btn" data-act="close">x</div>' +
    '</div>' +
    '<div class="os-window-body"></div>' +
    (win.resizable ? '<div class="os-window-resize"></div>' : '');
  el.querySelector('.os-window-title').textContent = win.title;
  windowsEl.appendChild(el);
  bringToFront(el);
  var titlebar = el.querySelector('.os-window-titlebar');
  titlebar.addEventListener('mousedown', function () { send('window:focus', { id: win.id }); bringToFront(el); });
  makeDraggable(titlebar, el, function (x, y) { send('window:moveEnd', { id: win.id, x: x, y: y }); });
  var resizeHandle = el.querySelector('.os-window-resize');
  if (resizeHandle) makeResizable(resizeHandle, el, function (w, h) { send('window:resizeEnd', { id: win.id, width: w, height: h }); });
  el.querySelector('[data-act="minimize"]').addEventListener('click', function () { send('window:minimize', { id: win.id }); });
  el.querySelector('[data-act="maximize"]').addEventListener('click', function () { send('window:maximize', { id: win.id }); });
  el.querySelector('[data-act="close"]').addEventListener('click', function () { send('window:closeRequest', { id: win.id }); });
  return el;
}

function addTaskbarItem(windowId, title) {
  var btn = document.createElement('div');
  btn.className = 'os-taskbar-item';
  btn.id = 'task-' + windowId;
  btn.textContent = title;
  btn.addEventListener('click', function () { send('taskbar:click', { windowId: windowId }); });
  taskbarItemsEl.appendChild(btn);
}

function iconMarkup(icon) {
  return icon.src
    ? '<img src="' + icon.src + '">'
    : '<div class="os-icon-fallback">' + (icon.label || '?').charAt(0).toUpperCase() + '</div>';
}

function createIconEl(icon) {
  var el = document.createElement('div');
  el.className = 'os-icon';
  el.id = 'icon-' + icon.id;
  el.style.left = icon.x + 'px';
  el.style.top = icon.y + 'px';
  el.innerHTML = iconMarkup(icon) + '<span class="os-icon-label"></span>';
  el.querySelector('.os-icon-label').textContent = icon.label;
  el.addEventListener('dblclick', function () { send('icon:doubleclick', { id: icon.id }); });
  iconsEl.appendChild(el);
  return el;
}

ipcRenderer.on(EVENT_CHANNEL, function (event, msg) {
  var t = msg.type, p = msg.payload || {};
  var el, tb, out, container, up, item, overlay, buttonsHtml, body, input;
  switch (t) {
    case 'window:create':
      createWindowEl(p);
      addTaskbarItem(p.id, p.title);
      break;
    case 'window:move':
      el = document.getElementById('win-' + p.id);
      if (el) { el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; }
      break;
    case 'window:resize':
      el = document.getElementById('win-' + p.id);
      if (el) { el.style.width = p.width + 'px'; el.style.height = p.height + 'px'; }
      break;
    case 'window:minimize':
      el = document.getElementById('win-' + p.id);
      if (el) el.style.display = 'none';
      break;
    case 'window:maximize':
      el = document.getElementById('win-' + p.id);
      if (el) {
        el.dataset.prevLeft = el.style.left; el.dataset.prevTop = el.style.top;
        el.dataset.prevW = el.style.width; el.dataset.prevH = el.style.height;
        el.style.left = '0px'; el.style.top = '0px';
        el.style.width = windowsEl.offsetWidth + 'px';
        el.style.height = windowsEl.offsetHeight + 'px';
        el.style.display = '';
      }
      break;
    case 'window:restore':
      el = document.getElementById('win-' + p.id);
      if (el) {
        el.style.display = '';
        if (el.dataset.prevLeft) {
          el.style.left = el.dataset.prevLeft; el.style.top = el.dataset.prevTop;
          el.style.width = el.dataset.prevW; el.style.height = el.dataset.prevH;
        }
      }
      break;
    case 'window:focus':
      el = document.getElementById('win-' + p.id);
      if (el) bringToFront(el);
      Array.prototype.forEach.call(document.querySelectorAll('.os-taskbar-item'), function (b) { b.classList.remove('active'); });
      tb = document.getElementById('task-' + p.id);
      if (tb) tb.classList.add('active');
      break;
    case 'window:contentChange':
      el = document.getElementById('win-' + p.id);
      if (el) el.querySelector('.os-window-body').innerHTML = p.content || '';
      break;
    case 'window:removed':
      el = document.getElementById('win-' + p.id);
      if (el) el.remove();
      tb = document.getElementById('task-' + p.id);
      if (tb) tb.remove();
      break;
    case 'icon:create':
      createIconEl(p);
      break;
    case 'icon:move':
      el = document.getElementById('icon-' + p.id);
      if (el) { el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; }
      break;
    case 'icon:removed':
      el = document.getElementById('icon-' + p.id);
      if (el) el.remove();
      break;
    case 'startmenu:entryAdded':
      item = document.createElement('div');
      item.className = 'os-startmenu-entry';
      item.textContent = p.label;
      item.addEventListener('click', function () {
        send('startmenu:click', { menuId: p.menuId, label: p.label });
        startMenuEl.classList.remove('open');
      });
      startMenuEl.appendChild(item);
      break;
    case 'startmenu:entryRemoved':
      Array.prototype.forEach.call(startMenuEl.children, function (c) { if (c.textContent === p.label) c.remove(); });
      break;
    case 'desktop:background':
      document.getElementById('desktop').style.background = p.background;
      break;
    case 'dialog:show':
      overlay = document.createElement('div');
      overlay.className = 'os-dialog-overlay';
      overlay.id = 'dialog-' + p.id;
      buttonsHtml = (p.buttons || ['OK']).map(function (b) { return '<button data-btn="' + b + '">' + b + '</button>'; }).join('');
      overlay.innerHTML =
        '<div class="os-dialog-box">' +
          '<div class="os-dialog-titlebar">' + (p.type || 'info').toUpperCase() + '</div>' +
          '<div class="os-dialog-message"></div>' +
          '<div class="os-dialog-buttons">' + buttonsHtml + '</div>' +
        '</div>';
      overlay.querySelector('.os-dialog-message').textContent = p.message || '';
      Array.prototype.forEach.call(overlay.querySelectorAll('[data-btn]'), function (btn) {
        btn.addEventListener('click', function () { send('dialog:buttonClick', { id: p.id, button: btn.getAttribute('data-btn') }); });
      });
      dialogsEl.appendChild(overlay);
      break;
    case 'dialog:close':
      el = document.getElementById('dialog-' + p.id);
      if (el) el.remove();
      break;
    case 'terminal:mount':
      el = document.getElementById('win-' + p.windowId);
      if (el) {
        body = el.querySelector('.os-window-body');
        body.innerHTML = '<pre id="term-out-' + p.id + '" style="margin:0;white-space:pre-wrap;font-family:Consolas,monospace;font-size:12px;"></pre>' +
          '<input id="term-in-' + p.id + '" style="width:100%;box-sizing:border-box;font-family:Consolas,monospace;font-size:12px;" placeholder="' + (p.prompt || '$ ') + '">';
        input = document.getElementById('term-in-' + p.id);
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && input.value.trim() !== '') {
            send('terminal:input', { id: p.id, line: input.value });
            input.value = '';
          }
        });
      }
      break;
    case 'terminal:write':
      out = document.getElementById('term-out-' + p.id);
      if (out) {
        out.textContent += p.text + String.fromCharCode(10);
        out.parentElement.scrollTop = out.parentElement.scrollHeight;
      }
      break;
    case 'explorer:mount':
      el = document.getElementById('win-' + p.windowId);
      if (el) el.querySelector('.os-window-body').innerHTML = '<div id="exp-' + p.id + '"></div>';
      break;
    case 'explorer:listing':
      container = document.getElementById('exp-' + p.id);
      if (container) {
        container.innerHTML = '';
        up = document.createElement('div');
        up.textContent = 'Path: ' + p.path;
        up.style.fontWeight = 'bold';
        up.style.marginBottom = '6px';
        container.appendChild(up);
        (p.entries || []).forEach(function (entry) {
          var row = document.createElement('div');
          row.textContent = (entry.type === 'dir' ? '[DIR] ' : '') + entry.name;
          row.style.cursor = entry.type === 'dir' ? 'pointer' : 'default';
          row.style.padding = '2px 0';
          if (entry.type === 'dir') {
            row.addEventListener('dblclick', function () {
              var base = p.path === '/' ? '' : p.path;
              send('fileexplorer:navigate', { id: p.id, path: base + '/' + entry.name });
            });
          }
          container.appendChild(row);
        });
      }
      break;
    default:
      break;
  }
});

send('screen:ready', {});
`;
}

function _composeShellHTML(vmLabel, options) {
  const title = (options && options.title) || 'os_sim Screen';
  const bg = '#008080';
  const head =
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + _escapeHTML(title) + '</title><style>' +
    'html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden; font-family: Tahoma, Geneva, sans-serif; font-size:12px; user-select:none; }' +
    '#desktop { position:absolute; top:0; left:0; right:0; bottom:32px; background:' + bg + '; overflow:hidden; }' +
    '#icons { position:absolute; top:0; left:0; right:0; bottom:0; }' +
    '.os-icon { position:absolute; width:72px; height:76px; text-align:center; cursor:pointer; color:#fff; text-shadow:1px 1px 1px #000; }' +
    '.os-icon img, .os-icon .os-icon-fallback { width:40px; height:40px; margin:4px auto; display:block; }' +
    '.os-icon .os-icon-fallback { background:#444; color:#fff; line-height:40px; border-radius:6px; font-weight:bold; }' +
    '.os-icon .os-icon-label { display:block; margin-top:2px; word-break:break-word; }' +
    '#windows { position:absolute; top:0; left:0; right:0; bottom:32px; pointer-events:none; }' +
    '.os-window { position:absolute; background:#c0c0c0; border:2px outset #dfdfdf; box-shadow:2px 2px 6px rgba(0,0,0,0.4); pointer-events:auto; display:flex; flex-direction:column; min-width:160px; min-height:100px; }' +
    '.os-window-titlebar { background:linear-gradient(90deg,#000080,#1084d0); color:#fff; padding:3px 4px; display:flex; align-items:center; cursor:move; font-weight:bold; }' +
    '.os-window-title { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }' +
    '.os-window-btn { width:16px; height:14px; margin-left:2px; background:#c0c0c0; border:1px outset #fff; font-size:10px; line-height:12px; text-align:center; cursor:pointer; color:#000; }' +
    '.os-window-body { flex:1; overflow:auto; background:#fff; padding:6px; }' +
    '.os-window-resize { position:absolute; width:12px; height:12px; right:0; bottom:0; cursor:nwse-resize; }' +
    '#taskbar { position:absolute; left:0; right:0; bottom:0; height:32px; background:#c0c0c0; border-top:2px outset #dfdfdf; display:flex; align-items:center; padding:0 2px; }' +
    '#startbtn { background:#c0c0c0; border:2px outset #dfdfdf; padding:3px 10px; font-weight:bold; cursor:pointer; }' +
    '#taskbar-items { flex:1; display:flex; gap:2px; margin-left:4px; overflow:hidden; }' +
    '.os-taskbar-item { background:#c0c0c0; border:1px outset #dfdfdf; padding:3px 8px; cursor:pointer; max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }' +
    '.os-taskbar-item.active { border:1px inset #dfdfdf; }' +
    '#startmenu { position:absolute; left:0; bottom:32px; width:200px; background:#c0c0c0; border:2px outset #dfdfdf; display:none; flex-direction:column; z-index:9999; }' +
    '#startmenu.open { display:flex; }' +
    '.os-startmenu-entry { padding:6px 10px; cursor:pointer; }' +
    '.os-startmenu-entry:hover { background:#000080; color:#fff; }' +
    '#dialogs { position:absolute; top:0; left:0; right:0; bottom:0; pointer-events:none; }' +
    '.os-dialog-overlay { position:absolute; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center; pointer-events:auto; }' +
    '.os-dialog-box { background:#c0c0c0; border:2px outset #dfdfdf; min-width:260px; max-width:400px; }' +
    '.os-dialog-titlebar { background:#000080; color:#fff; padding:3px 6px; font-weight:bold; }' +
    '.os-dialog-message { padding:14px; }' +
    '.os-dialog-buttons { display:flex; justify-content:flex-end; gap:6px; padding:8px; }' +
    '.os-dialog-buttons button { padding:4px 12px; }' +
    '</style></head><body>' +
    '<div id="desktop"><div id="icons"></div></div>' +
    '<div id="windows"></div>' +
    '<div id="dialogs"></div>' +
    '<div id="startmenu"></div>' +
    '<div id="taskbar"><div id="startbtn">Start</div><div id="taskbar-items"></div></div>' +
    '<script>';
  const tail = '</script></body></html>';
  return head + _clientScript(vmLabel) + tail;
}

const os_sim = {};

os_sim.os_vm_create = (config) => new VirtualMachine(config);

os_sim.os_vm_boot = (vm) => {
  _assert(vm instanceof VirtualMachine, 'os_vm_boot: expected a VM instance.');
  const log = vm.boot.run(vm);
  vm.booted = true;
  vm._emit('booted', log);
  return log;
};

os_sim.os_vm_shutdown = (vm) => {
  vm._processes.forEach(p => p.kill());
  vm._services.forEach(s => s.stop());
  vm._windows.forEach(w => w.close());
  vm.booted = false;
  vm._emit('shutdown');
  return true;
};

os_sim.os_vm_reset = (vm) => {
  os_sim.os_vm_shutdown(vm);
  vm._processes.clear();
  vm.fs = new VirtualFileSystem('root');
  vm._emit('reset');
  return true;
};

os_sim.os_cpu_create = (vm, cores) => { vm.cpu = new VirtualCPU(cores); return vm.cpu; };
os_sim.os_cpu_tick = (vm) => vm.cpu.tick(vm);
os_sim.os_cpu_getUsage = (vm) => vm.cpu.usage();

os_sim.os_memory_create = (vm, totalBytes) => { vm.memory = new VirtualMemory(totalBytes); return vm.memory; };
os_sim.os_memory_alloc = (vm, size, owner) => vm.memory.alloc(size, owner);
os_sim.os_memory_free = (vm, ptr) => vm.memory.free(ptr);
os_sim.os_memory_read = (vm, ptr) => vm.memory.read(ptr);
os_sim.os_memory_write = (vm, ptr, data) => vm.memory.write(ptr, data);
os_sim.os_memory_getUsage = (vm) => vm.memory.usage();
os_sim.os_memory_defragment = (vm) => vm.memory.defragment();

os_sim.os_process_create = (vm, name, fn, priority) => {
  const pid = _uid('pid');
  const proc = new VirtualProcess(pid, name, fn, priority);
  vm._processes.set(pid, proc);
  vm._emit('processCreated', proc);
  return proc;
};
os_sim.os_process_kill = (vm, pid) => {
  const proc = vm._processes.get(pid);
  if (!proc) return false;
  proc.kill();
  return true;
};
os_sim.os_process_list = (vm) => Array.from(vm._processes.values());
os_sim.os_process_get = (vm, pid) => vm._processes.get(pid) || null;
os_sim.os_process_setPriority = (vm, pid, priority) => {
  const proc = vm._processes.get(pid);
  _assert(proc, 'os_process_setPriority: unknown pid "' + pid + '".');
  proc.priority = priority;
  return true;
};
os_sim.os_process_sleep = (vm, pid, ms) => {
  const proc = vm._processes.get(pid);
  _assert(proc, 'os_process_sleep: unknown pid "' + pid + '".');
  proc.sleep(ms);
  return true;
};
os_sim.os_process_wake = (vm, pid) => {
  const proc = vm._processes.get(pid);
  _assert(proc, 'os_process_wake: unknown pid "' + pid + '".');
  proc.wake();
  return true;
};

os_sim.os_scheduler_create = (vm, algorithm) => { vm.scheduler = new VirtualScheduler(algorithm); return vm.scheduler; };
os_sim.os_scheduler_setAlgorithm = (vm, algorithm) => { vm.scheduler.setAlgorithm(algorithm); return true; };
os_sim.os_scheduler_tick = (vm) => vm.scheduler.tick(vm);
os_sim.os_scheduler_getQueue = (vm) => vm.scheduler.getQueue(vm);

os_sim.os_fs_mkdir = (vm, p, owner) => vm.fs.mkdir(p, owner || (vm.currentUser && vm.currentUser.username));
os_sim.os_fs_touch = (vm, p, owner) => vm.fs.touch(p, owner || (vm.currentUser && vm.currentUser.username));
os_sim.os_fs_writeFile = (vm, p, data, owner) => vm.fs.writeFile(p, data, owner || (vm.currentUser && vm.currentUser.username));
os_sim.os_fs_readFile = (vm, p) => vm.fs.readFile(p);
os_sim.os_fs_deleteFile = (vm, p) => vm.fs.deleteFile(p);
os_sim.os_fs_deleteDir = (vm, p) => vm.fs.deleteDir(p);
os_sim.os_fs_list = (vm, p) => vm.fs.list(p);
os_sim.os_fs_exists = (vm, p) => vm.fs.exists(p);
os_sim.os_fs_rename = (vm, oldPath, newName) => vm.fs.rename(oldPath, newName);
os_sim.os_fs_move = (vm, src, dst) => vm.fs.move(src, dst);
os_sim.os_fs_stat = (vm, p) => vm.fs.stat(p);
os_sim.os_fs_chmod = (vm, p, mode) => vm.fs.chmod(p, mode);
os_sim.os_fs_chown = (vm, p, user) => vm.fs.chown(p, user);

os_sim.os_disk_create = (vm, label, sizeBytes) => {
  const disk = new VirtualDisk(label, sizeBytes);
  vm._disks.set(label, disk);
  return disk;
};
os_sim.os_disk_mount = (vm, disk, mountPoint) => {
  _assert(disk instanceof VirtualDisk, 'os_disk_mount: expected a disk instance.');
  if (!disk.formatted) disk.format('zfsim');
  disk.mountPoint = mountPoint;
  if (mountPoint === '/' || !mountPoint) {
    vm.fs = disk.fs;
  } else {
    const { parent, name } = vm.fs._resolveParent(mountPoint);
    parent.children.set(name, disk.fs.root);
  }
  vm._emit('diskMounted', disk, mountPoint);
  return true;
};
os_sim.os_disk_unmount = (vm, mountPoint) => {
  if (mountPoint === '/') return false;
  const { parent, name } = vm.fs._resolveParent(mountPoint);
  return parent.children.delete(name);
};
os_sim.os_disk_format = (vm, disk, fsType) => disk.format(fsType);
os_sim.os_disk_getUsage = (vm, disk) => disk.usage();

os_sim.os_user_create = (vm, username, password, role) => {
  const user = new VirtualUser(username, password, role);
  vm._users.set(username, user);
  vm._emit('userCreated', user);
  return user;
};
os_sim.os_user_delete = (vm, username) => vm._users.delete(username);
os_sim.os_user_login = (vm, username, password) => {
  const user = vm._users.get(username);
  if (!user || user._password !== password) {
    vm._emit('loginFailed', username);
    return false;
  }
  vm.currentUser = user;
  vm._emit('login', user);
  return true;
};
os_sim.os_user_logout = (vm) => {
  vm.currentUser = null;
  vm._emit('logout');
  return true;
};
os_sim.os_user_getCurrent = (vm) => vm.currentUser;

os_sim.os_permission_grant = (vm, p, user, perm) => vm.permissions.grant(p, user, perm);
os_sim.os_permission_revoke = (vm, p, user, perm) => vm.permissions.revoke(p, user, perm);
os_sim.os_permission_check = (vm, p, user, perm) => vm.permissions.check(p, user, perm);

os_sim.os_registry_set = (vm, key, value) => vm.registry.set(key, value);
os_sim.os_registry_get = (vm, key) => vm.registry.get(key);
os_sim.os_registry_delete = (vm, key) => vm.registry.delete(key);
os_sim.os_registry_list = (vm, prefix) => vm.registry.list(prefix);

os_sim.os_service_create = (vm, name, fn) => {
  const svc = new VirtualService(name, fn);
  vm._services.set(name, svc);
  return svc;
};
os_sim.os_service_start = (vm, name) => {
  const svc = vm._services.get(name);
  _assert(svc, 'os_service_start: unknown service "' + name + '".');
  return svc.start(vm);
};
os_sim.os_service_stop = (vm, name) => {
  const svc = vm._services.get(name);
  _assert(svc, 'os_service_stop: unknown service "' + name + '".');
  return svc.stop();
};
os_sim.os_service_status = (vm, name) => {
  const svc = vm._services.get(name);
  return svc ? svc.status : 'unknown';
};
os_sim.os_service_list = (vm) => Array.from(vm._services.values()).map(s => ({ name: s.name, status: s.status }));

os_sim.os_driver_register = (vm, name, handlers) => {
  const drv = new VirtualDriver(name, handlers);
  vm._drivers.set(name, drv);
  return drv;
};
os_sim.os_driver_unregister = (vm, name) => vm._drivers.delete(name);
os_sim.os_driver_call = (vm, name, method, ...args) => {
  const drv = vm._drivers.get(name);
  _assert(drv, 'os_driver_call: unknown driver "' + name + '".');
  return drv.call(method, ...args);
};
os_sim.os_driver_list = (vm) => Array.from(vm._drivers.keys());

os_sim.os_network_connect = (vm, hostAddr) => vm.network.connect(hostAddr);
os_sim.os_network_disconnect = (vm, connId) => vm.network.disconnect(connId);
os_sim.os_network_send = (vm, connId, data) => vm.network.send(connId, data);
os_sim.os_network_listen = (vm, port, handler) => vm.network.listen(port, handler);
os_sim.os_network_setOnline = (vm, online) => vm.network.setOnline(online);

os_sim.os_network_request = (vm, url, options) => {
  if (!vm.network._online) {
    return Promise.reject(new Error('[os_sim.zl] network_request: network is offline.'));
  }
  const fetchFn = (typeof fetch === 'function') ? fetch : null;
  _assert(fetchFn, 'os_network_request: no global fetch found. Use Node.js 18+ or run inside Electron.');
  vm.network._emit('request', url, options);
  return fetchFn(url, options || {}).then((res) => {
    return res.text().then((body) => ({
      url: url,
      status: res.status,
      ok: res.ok,
      headers: (() => { const h = {}; res.headers.forEach((v, k) => { h[k] = v; }); return h; })(),
      body: body,
      simulated: false
    }));
  });
};

os_sim.os_network_ping = (vm, addr) => {
  if (!vm.network._online) return Promise.resolve(-1);
  const fetchFn = (typeof fetch === 'function') ? fetch : null;
  if (!fetchFn) return Promise.resolve(-1);
  const target = /^https?:\/\//i.test(addr) ? addr : ('https://' + addr);
  const start = Date.now();
  vm.network._emit('ping', addr);
  return fetchFn(target, { method: 'HEAD' }).then(() => Date.now() - start).catch(() => -1);
};

os_sim.os_ipc_createChannel = (vm, name) => {
  const ch = new IPCChannel(name);
  vm._ipcChannels.set(name, ch);
  return ch;
};
os_sim.os_ipc_send = (vm, channel, pid, message) => {
  const ch = vm._ipcChannels.get(channel);
  _assert(ch, 'os_ipc_send: unknown channel "' + channel + '".');
  return ch.send(pid, message);
};
os_sim.os_ipc_receive = (vm, channel, pid) => {
  const ch = vm._ipcChannels.get(channel);
  _assert(ch, 'os_ipc_receive: unknown channel "' + channel + '".');
  return ch.receive(pid);
};
os_sim.os_ipc_broadcast = (vm, channel, message) => {
  const ch = vm._ipcChannels.get(channel);
  _assert(ch, 'os_ipc_broadcast: unknown channel "' + channel + '".');
  return ch.broadcast(message);
};
os_sim.os_ipc_closeChannel = (vm, channel) => vm._ipcChannels.delete(channel);

os_sim.os_boot_setSequence = (vm, steps) => vm.boot.setSequence(steps);
os_sim.os_boot_addStep = (vm, name, fn) => vm.boot.addStep(name, fn);
os_sim.os_boot_run = (vm) => os_sim.os_vm_boot(vm);

os_sim.os_window_create = (vm, options) => {
  const id = _uid('win');
  const win = new OSWindow(id, options);
  vm._windows.set(id, win);

  win.on('move', (x, y) => _screenSend(vm, 'window:move', { id: win.id, x: x, y: y }));
  win.on('resize', (w, h) => _screenSend(vm, 'window:resize', { id: win.id, width: w, height: h }));
  win.on('minimize', () => _screenSend(vm, 'window:minimize', { id: win.id }));
  win.on('maximize', () => _screenSend(vm, 'window:maximize', { id: win.id }));
  win.on('restore', () => _screenSend(vm, 'window:restore', { id: win.id }));
  win.on('focus', () => _screenSend(vm, 'window:focus', { id: win.id }));
  win.on('contentChange', (content) => _screenSend(vm, 'window:contentChange', { id: win.id, content: content }));
  win.on('close', () => _screenSend(vm, 'window:removed', { id: win.id }));

  _screenSend(vm, 'window:create', {
    id: win.id, title: win.title, x: win.x, y: win.y,
    width: win.width, height: win.height, resizable: win.resizable
  });

  vm._emit('windowCreated', win);
  return win;
};
os_sim.os_window_close = (vm, windowId) => {
  const win = vm._windows.get(windowId);
  _assert(win, 'os_window_close: unknown window "' + windowId + '".');
  win.close();
  vm._windows.delete(windowId);
  return true;
};
os_sim.os_window_move = (vm, windowId, x, y) => {
  const win = vm._windows.get(windowId);
  _assert(win, 'os_window_move: unknown window "' + windowId + '".');
  win.move(x, y);
  return true;
};
os_sim.os_window_resize = (vm, windowId, w, h) => {
  const win = vm._windows.get(windowId);
  _assert(win, 'os_window_resize: unknown window "' + windowId + '".');
  win.resize(w, h);
  return true;
};
os_sim.os_window_minimize = (vm, windowId) => {
  const win = vm._windows.get(windowId);
  _assert(win, 'os_window_minimize: unknown window "' + windowId + '".');
  win.minimize();
  return true;
};
os_sim.os_window_maximize = (vm, windowId) => {
  const win = vm._windows.get(windowId);
  _assert(win, 'os_window_maximize: unknown window "' + windowId + '".');
  win.maximize();
  return true;
};
os_sim.os_window_focus = (vm, windowId) => {
  const win = vm._windows.get(windowId);
  _assert(win, 'os_window_focus: unknown window "' + windowId + '".');
  win.focus();
  return true;
};
os_sim.os_window_setContent = (vm, windowId, content) => {
  const win = vm._windows.get(windowId);
  _assert(win, 'os_window_setContent: unknown window "' + windowId + '".');
  win.setContent(content);
  return true;
};
os_sim.os_window_onEvent = (vm, windowId, event, handler) => {
  const win = vm._windows.get(windowId);
  _assert(win, 'os_window_onEvent: unknown window "' + windowId + '".');
  win.on(event, handler);
  return true;
};

os_sim.os_taskbar_create = (vm, options) => {
  const id = _uid('taskbar');
  const tb = new OSTaskbar(id, options);
  vm._taskbars.set(id, tb);
  return tb;
};
os_sim.os_taskbar_addItem = (vm, taskbarId, windowId) => {
  const tb = vm._taskbars.get(taskbarId);
  _assert(tb, 'os_taskbar_addItem: unknown taskbar "' + taskbarId + '".');
  return tb.addItem(windowId);
};
os_sim.os_taskbar_removeItem = (vm, taskbarId, windowId) => {
  const tb = vm._taskbars.get(taskbarId);
  _assert(tb, 'os_taskbar_removeItem: unknown taskbar "' + taskbarId + '".');
  return tb.removeItem(windowId);
};

os_sim.os_startmenu_create = (vm, options) => {
  const id = _uid('startmenu');
  const menu = new OSStartMenu(id, options);
  vm._startMenus.set(id, menu);
  return menu;
};
os_sim.os_startmenu_addEntry = (vm, menuId, label, onClick) => {
  const menu = vm._startMenus.get(menuId);
  _assert(menu, 'os_startmenu_addEntry: unknown menu "' + menuId + '".');
  const result = menu.addEntry(label, onClick);
  _screenSend(vm, 'startmenu:entryAdded', { menuId: menuId, label: label });
  return result;
};
os_sim.os_startmenu_removeEntry = (vm, menuId, label) => {
  const menu = vm._startMenus.get(menuId);
  _assert(menu, 'os_startmenu_removeEntry: unknown menu "' + menuId + '".');
  const result = menu.removeEntry(label);
  if (result) _screenSend(vm, 'startmenu:entryRemoved', { menuId: menuId, label: label });
  return result;
};

os_sim.os_icon_create = (vm, options) => {
  const id = _uid('icon');
  const icon = new OSIcon(id, options);
  let src = null;
  if (options && options.icon) {
    src = _toDataURI(options.icon);
  } else if (options && options.appName) {
    const vmIcon = vm._appIcons && vm._appIcons.get(options.appName);
    src = vmIcon || _globalAppIcons.get(options.appName) || null;
  }
  icon.src = src;
  vm._icons.set(id, icon);

  icon.on('move', (x, y) => _screenSend(vm, 'icon:move', { id: icon.id, x: x, y: y }));

  _screenSend(vm, 'icon:create', { id: icon.id, label: icon.label, x: icon.x, y: icon.y, src: icon.src });

  return icon;
};
os_sim.os_icon_remove = (vm, iconId) => {
  const existed = vm._icons.delete(iconId);
  if (existed) _screenSend(vm, 'icon:removed', { id: iconId });
  return existed;
};
os_sim.os_icon_move = (vm, iconId, x, y) => {
  const icon = vm._icons.get(iconId);
  _assert(icon, 'os_icon_move: unknown icon "' + iconId + '".');
  icon.move(x, y);
  return true;
};

os_sim.os_fileexplorer_create = (vm, options) => {
  const id = _uid('explorer');
  const exp = new OSFileExplorer(id, vm, options);
  vm._explorers.set(id, exp);

  let windowId = options && options.windowId;
  if (!windowId && vm._screen) {
    const win = os_sim.os_window_create(vm, { title: (options && options.title) || 'File Explorer', width: 520, height: 400 });
    windowId = win.id;
  }
  exp.windowId = windowId || null;

  exp.on('refresh', (listing) => _screenSend(vm, 'explorer:listing', { id: exp.id, path: exp.path, entries: listing }));

  if (windowId) {
    _screenSend(vm, 'explorer:mount', { id: exp.id, windowId: windowId });
    exp.refresh();
  }

  return exp;
};
os_sim.os_fileexplorer_navigate = (vm, explorerId, p) => {
  const exp = vm._explorers.get(explorerId);
  _assert(exp, 'os_fileexplorer_navigate: unknown explorer "' + explorerId + '".');
  return exp.navigate(p);
};
os_sim.os_fileexplorer_refresh = (vm, explorerId) => {
  const exp = vm._explorers.get(explorerId);
  _assert(exp, 'os_fileexplorer_refresh: unknown explorer "' + explorerId + '".');
  return exp.refresh();
};

os_sim.os_dialog_create = (vm, options) => {
  const id = _uid('dialog');
  const dlg = new OSDialog(id, options);
  vm._dialogs.set(id, dlg);
  return dlg;
};
os_sim.os_dialog_show = (vm, dialogId) => {
  const dlg = vm._dialogs.get(dialogId);
  _assert(dlg, 'os_dialog_show: unknown dialog "' + dialogId + '".');
  dlg.show();
  _screenSend(vm, 'dialog:show', { id: dlg.id, type: dlg.type, message: dlg.message, buttons: dlg.buttons });
  return dlg;
};
os_sim.os_dialog_close = (vm, dialogId, result) => {
  const dlg = vm._dialogs.get(dialogId);
  _assert(dlg, 'os_dialog_close: unknown dialog "' + dialogId + '".');
  dlg.close(result);
  _screenSend(vm, 'dialog:close', { id: dlg.id });
  return dlg;
};

os_sim.os_desktop_create = (vm, options) => {
  const id = _uid('desktop');
  const desk = new OSDesktop(id, options);
  vm._desktops.set(id, desk);
  _screenSend(vm, 'desktop:background', { background: desk.background });
  return desk;
};
os_sim.os_desktop_render = (vm, desktopId) => {
  const desk = vm._desktops.get(desktopId);
  _assert(desk, 'os_desktop_render: unknown desktop "' + desktopId + '".');
  return desk.render();
};

os_sim.os_shell_create = (vm, options) => {
  const id = _uid('shell');
  const shell = new OSShell(id, vm, options);
  vm._shells.set(id, shell);
  return shell;
};
os_sim.os_shell_registerCommand = (vm, shellId, name, handler) => {
  const shell = vm._shells.get(shellId);
  _assert(shell, 'os_shell_registerCommand: unknown shell "' + shellId + '".');
  return shell.registerCommand(name, handler);
};
os_sim.os_shell_unregisterCommand = (vm, shellId, name) => {
  const shell = vm._shells.get(shellId);
  _assert(shell, 'os_shell_unregisterCommand: unknown shell "' + shellId + '".');
  return shell.unregisterCommand(name);
};
os_sim.os_shell_execute = (vm, shellId, commandLine) => {
  const shell = vm._shells.get(shellId);
  _assert(shell, 'os_shell_execute: unknown shell "' + shellId + '".');
  return shell.execute(commandLine);
};
os_sim.os_shell_pipe = (vm, shellId, commandLine1, commandLine2) => {
  const shell = vm._shells.get(shellId);
  _assert(shell, 'os_shell_pipe: unknown shell "' + shellId + '".');
  return shell.pipe(commandLine1, commandLine2);
};

os_sim.os_terminal_create = (vm, options) => {
  const id = _uid('terminal');
  const shell = (options && options.shellId) ? vm._shells.get(options.shellId) : os_sim.os_shell_create(vm, {});
  _assert(shell, 'os_terminal_create: invalid shellId.');
  const term = new OSTerminal(id, shell, options);
  vm._terminals.set(id, term);

  let windowId = options && options.windowId;
  if (!windowId && vm._screen) {
    const win = os_sim.os_window_create(vm, { title: (options && options.title) || 'Terminal', width: 640, height: 380 });
    windowId = win.id;
  }
  term.windowId = windowId || null;

  term.on('write', (text) => _screenSend(vm, 'terminal:write', { id: term.id, text: text }));

  if (windowId) {
    _screenSend(vm, 'terminal:mount', { id: term.id, windowId: windowId, prompt: shell.prompt });
  }

  return term;
};
os_sim.os_terminal_write = (vm, terminalId, text) => {
  const term = vm._terminals.get(terminalId);
  _assert(term, 'os_terminal_write: unknown terminal "' + terminalId + '".');
  return term.write(text);
};
os_sim.os_terminal_clear = (vm, terminalId) => {
  const term = vm._terminals.get(terminalId);
  _assert(term, 'os_terminal_clear: unknown terminal "' + terminalId + '".');
  return term.clear();
};
os_sim.os_terminal_onInput = (vm, terminalId, handler) => {
  const term = vm._terminals.get(terminalId);
  _assert(term, 'os_terminal_onInput: unknown terminal "' + terminalId + '".');
  return term.onInput(handler);
};
os_sim.os_terminal_input = (vm, terminalId, line) => {
  const term = vm._terminals.get(terminalId);
  _assert(term, 'os_terminal_input: unknown terminal "' + terminalId + '".');
  return term.input(line);
};

os_sim.os_script_run = (vm, shellId, scriptLines) => {
  const shell = vm._shells.get(shellId);
  _assert(shell, 'os_script_run: unknown shell "' + shellId + '".');
  return shell.runScript(scriptLines);
};

os_sim.os_app_icon = (a, b, c) => {
  let vm = null, appName, imagePath;
  if (_isVM(a)) { vm = a; appName = b; imagePath = c; }
  else { appName = a; imagePath = b; }
  _assert(typeof appName === 'string' && appName.trim() !== '', 'os_app_icon: appName must be a non-empty string.');
  _assert(typeof imagePath === 'string' && imagePath.trim() !== '', 'os_app_icon: imagePath must be a non-empty string.');
  const dataUri = _toDataURI(imagePath);
  if (vm) {
    vm._appIcons.set(appName, dataUri);
  } else {
    _globalAppIcons.set(appName, dataUri);
  }
  return dataUri;
};

os_sim.os_screen_create = (vm, options) => {
  _assert(vm instanceof VirtualMachine, 'os_screen_create: expected a VM instance.');
  const electron = _requireElectronMain();
  const { app, BrowserWindow, ipcMain } = electron;

  const screen = { win: null, ready: false, queue: [] };
  vm._screen = screen;

  const actionChannel = 'os:action-' + vm.label;
  const eventChannel = 'os:event-' + vm.label;

  const actionListener = (event, action) => {
    try {
      switch (action.type) {
        case 'screen:ready': {
          screen.ready = true;
          _screenSyncAll(vm);
          const queued = screen.queue.splice(0);
          queued.forEach(msg => {
            if (screen.win && !screen.win.isDestroyed()) screen.win.webContents.send(eventChannel, msg);
          });
          break;
        }
        case 'window:moveEnd': os_sim.os_window_move(vm, action.id, action.x, action.y); break;
        case 'window:resizeEnd': os_sim.os_window_resize(vm, action.id, action.width, action.height); break;
        case 'window:minimize': os_sim.os_window_minimize(vm, action.id); break;
        case 'window:maximize': os_sim.os_window_maximize(vm, action.id); break;
        case 'window:focus': os_sim.os_window_focus(vm, action.id); break;
        case 'window:closeRequest': os_sim.os_window_close(vm, action.id); break;
        case 'icon:doubleclick': { const icon = vm._icons.get(action.id); if (icon) icon.doubleClick(); break; }
        case 'startmenu:click': { const menu = vm._startMenus.get(action.menuId); if (menu) menu.trigger(action.label); break; }
        case 'taskbar:click': {
          const w = vm._windows.get(action.windowId);
          if (w) {
            if (w.state === 'minimized') w.restore();
            os_sim.os_window_focus(vm, action.windowId);
          }
          break;
        }
        case 'dialog:buttonClick': { os_sim.os_dialog_close(vm, action.id, action.button); break; }
        case 'terminal:input': { os_sim.os_terminal_input(vm, action.id, action.line); break; }
        case 'fileexplorer:navigate': { os_sim.os_fileexplorer_navigate(vm, action.id, action.path); break; }
        case 'app:texteditor:save': {
          const current = os_sim.os_user_getCurrent(vm);
          os_sim.os_fs_writeFile(vm, action.path, action.content, current ? current.username : 'root');
          break;
        }
        case 'app:taskmanager:kill': {
          os_sim.os_process_kill(vm, action.pid);
          _refreshTaskManagers(vm);
          break;
        }
        case 'app:taskmanager:refresh': {
          _refreshTaskManagers(vm);
          break;
        }
        case 'app:settings:toggleNetwork': {
          os_sim.os_network_setOnline(vm, !vm.network._online);
          _refreshSettings(vm);
          break;
        }
        case 'app:settings:refresh': {
          _refreshSettings(vm);
          break;
        }
        default:
          break;
      }
    } catch (err) {
      if (screen.win && !screen.win.isDestroyed()) {
        screen.win.webContents.send(eventChannel, { type: 'system:error', payload: { message: err.message } });
      }
    }
  };

  ipcMain.on(actionChannel, actionListener);

  const builtinApps = !(options && options.builtinApps === false);
  if (builtinApps) {
    os_sim.os_icon_create(vm, { label: 'Calculator', x: 20, y: 20, onDoubleClick: () => os_sim.os_app_calculator_open(vm) });
    os_sim.os_icon_create(vm, { label: 'Text Editor', x: 20, y: 110, onDoubleClick: () => os_sim.os_app_texteditor_open(vm, '/untitled.txt') });
    os_sim.os_icon_create(vm, { label: 'Task Manager', x: 20, y: 200, onDoubleClick: () => os_sim.os_app_taskmanager_open(vm) });
    os_sim.os_icon_create(vm, { label: 'Settings', x: 20, y: 290, onDoubleClick: () => os_sim.os_app_settings_open(vm) });
  }

  const launch = () => {
    const win = new BrowserWindow({
      width: (options && options.width) || 1024,
      height: (options && options.height) || 700,
      title: (options && options.title) || 'os_sim Screen',
      webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    screen.win = win;
    const html = _composeShellHTML(vm.label, options);
    const tmpPath = path.join(_nodeOS.tmpdir(), 'os_sim_screen_' + vm.label + '.html');
    fs.writeFileSync(tmpPath, html, 'utf8');
    win.loadFile(tmpPath);
    win.on('closed', () => {
      ipcMain.removeListener(actionChannel, actionListener);
      vm._screen = null;
    });
  };

  if (app.isReady()) launch(); else app.whenReady().then(launch);

  return screen;
};

os_sim.os_screen_close = (vm) => {
  if (vm._screen && vm._screen.win && !vm._screen.win.isDestroyed()) {
    vm._screen.win.close();
    return true;
  }
  return false;
};

os_sim.os_screen_isOpen = (vm) => Boolean(vm._screen && vm._screen.win && !vm._screen.win.isDestroyed());

os_sim.os_app_texteditor_open = (vm, filePath) => {
  _assert(vm._screen, 'os_app_texteditor_open: requires an active screen (call os_screen_create first).');
  const exists = vm.fs.exists(filePath);
  const initial = exists ? vm.fs.readFile(filePath) : '';
  const win = os_sim.os_window_create(vm, { title: 'Text Editor - ' + filePath, width: 560, height: 420 });
  const bodyId = 'editor-' + win.id;
  const html =
    '<textarea id="' + bodyId + '-area" style="width:100%;height:calc(100% - 30px);box-sizing:border-box;font-family:Consolas,monospace;font-size:13px;">' +
    _escapeHTML(initial) +
    '</textarea><button id="' + bodyId + '-save">Save</button><span id="' + bodyId + '-status" style="margin-left:8px;color:#080;"></span>';
  os_sim.os_window_setContent(vm, win.id, html);
  _screenSend(vm, 'app:texteditor:bind', { windowId: win.id, bodyId: bodyId, filePath: filePath });
  return win;
};

os_sim.os_app_calculator_open = (vm) => {
  _assert(vm._screen, 'os_app_calculator_open: requires an active screen (call os_screen_create first).');
  const win = os_sim.os_window_create(vm, { title: 'Calculator', width: 240, height: 320, resizable: false });
  const html = _calculatorHTML(win.id);
  os_sim.os_window_setContent(vm, win.id, html);
  return win;
};

os_sim.os_app_taskmanager_open = (vm) => {
  _assert(vm._screen, 'os_app_taskmanager_open: requires an active screen (call os_screen_create first).');
  const win = os_sim.os_window_create(vm, { title: 'Task Manager', width: 420, height: 320 });
  const render = () => {
    const queue = os_sim.os_scheduler_getQueue(vm);
    let rows = '';
    queue.forEach(p => {
      rows += '<tr><td>' + p.pid + '</td><td>' + p.name + '</td><td>' + p.state + '</td><td>' + p.priority + '</td>' +
        '<td><button onclick="send(\'app:taskmanager:kill\',{pid:\'' + p.pid + '\'})">Kill</button></td></tr>';
    });
    const html =
      '<button onclick="send(\'app:taskmanager:refresh\',{})">Refresh</button>' +
      '<table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:12px;">' +
      '<tr style="text-align:left;background:#ccc;"><th>PID</th><th>Name</th><th>State</th><th>Priority</th><th></th></tr>' +
      rows + '</table>';
    os_sim.os_window_setContent(vm, win.id, html);
  };
  render();
  win._tmRender = render;
  if (!vm._taskManagerWindows) vm._taskManagerWindows = new Set();
  vm._taskManagerWindows.add(win.id);
  win.on('close', () => { if (vm._taskManagerWindows) vm._taskManagerWindows.delete(win.id); });
  return win;
};

os_sim.os_app_settings_open = (vm) => {
  _assert(vm._screen, 'os_app_settings_open: requires an active screen (call os_screen_create first).');
  const win = os_sim.os_window_create(vm, { title: 'Settings', width: 360, height: 280 });
  const render = () => {
    const mem = os_sim.os_memory_getUsage(vm);
    const cpu = Math.round(os_sim.os_cpu_getUsage(vm) * 100);
    const online = vm.network._online;
    const html =
      '<div>CPU usage: ' + cpu + '%</div>' +
      '<div>Memory: ' + mem.used + ' / ' + mem.total + ' bytes</div>' +
      '<div style="margin-top:10px;">Network: <b>' + (online ? 'Online' : 'Offline') + '</b> ' +
      '<button onclick="send(\'app:settings:toggleNetwork\',{})">Toggle</button></div>' +
      '<div style="margin-top:10px;"><button onclick="send(\'app:settings:refresh\',{})">Refresh</button></div>';
    os_sim.os_window_setContent(vm, win.id, html);
  };
  render();
  win._settingsRender = render;
  if (!vm._settingsWindows) vm._settingsWindows = new Set();
  vm._settingsWindows.add(win.id);
  win.on('close', () => { if (vm._settingsWindows) vm._settingsWindows.delete(win.id); });
  return win;
};

os_sim.VirtualMachine = VirtualMachine;
os_sim.VirtualProcess = VirtualProcess;
os_sim.VirtualDisk = VirtualDisk;
os_sim.VirtualUser = VirtualUser;
os_sim.OSWindow = OSWindow;

if (typeof DSALibraries !== 'undefined') {
  DSALibraries['os_sim.zl'] = {
    inject(G) { G.os_sim = os_sim; }
  };
}

if (typeof module !== 'undefined') module.exports = os_sim;

})();
