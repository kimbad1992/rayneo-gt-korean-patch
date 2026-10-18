'use strict';
// A pure in-memory WebUSB-shaped test double. It never discovers/opens hardware.
const assert = require('node:assert/strict');
class StubUsb {
  constructor(options = {}) {
    this.options = options;
    this.events = [];
    this.accepted = [];
    this.attempts = new Map();
    this.state = 2;
    this.finalSeen = false;
    this.opened = true;
    this.configuration = {configurationValue: 1, interfaces: []};
  }
  async controlTransferOut(setup, data) {
    this.guard(setup);
    const bytes = data == null ? Buffer.alloc(0) : Buffer.from(new Uint8Array(data.buffer || data, data.byteOffset || 0, data.byteLength));
    const event = {direction: 'out', ...setup, length: bytes.length, alternate: this.activeAlternate || 0};
    this.events.push(event);
    if (setup.request !== 1) {
      if (setup.request === 4 || setup.request === 6) {this.state = 2;this.finalSeen = false;}
      return {status: 'ok', bytesWritten: bytes.length};
    }
    const attemptKey = `${setup.index}/${setup.value}`;
    const attempt = (this.attempts.get(attemptKey) || 0) + 1;
    this.attempts.set(attemptKey, attempt);
    if (this.options.failBlock === setup.value && (!this.options.failOnce || attempt === 1)) {
      throw new Error('Injected USB failure');
    }
    if (this.options.outStatus && bytes.length) return {status: this.options.outStatus, bytesWritten: 0};
    const written = this.options.zeroBlock === setup.value && bytes.length ? 0
      : this.options.shortBlock === setup.value && bytes.length ? bytes.length - 1 : bytes.length;
    this.accepted.push({index: setup.index, alternate: this.activeAlternate || 0, block: setup.value, data: bytes, bytesWritten: written});
    if (bytes.length === 0) {
      this.finalSeen = true;
      this.state = this.options.manifestState ?? 2;
    } else {
      this.finalSeen = false;
      this.state = this.options.chunkState ?? 5;
    }
    return {status: 'ok', bytesWritten: written};
  }
  async controlTransferIn(setup, length) {
    this.guard(setup);
    assert.equal(setup.request, 3, 'Only DFU GETSTATUS is expected in this fixture');
    assert.equal(length, 6);
    this.events.push({direction: 'in', ...setup, length});
    if (this.finalSeen && this.options.manifestThrow) throw new Error('Injected manifest read failure');
    const bytes = new Uint8Array(6);
    bytes[0] = this.finalSeen ? (this.options.manifestStatus || 0) : (this.state === 5 || this.state === 10 ? (this.options.chunkStatus || 0) : 0);
    bytes[4] = this.state;
    const timeout = this.options.pollTimeout || 0;
    bytes[1] = timeout & 255;bytes[2] = (timeout >>> 8) & 255;bytes[3] = (timeout >>> 16) & 255;
    return {status: 'ok', data: new DataView(bytes.buffer)};
  }
  guard(setup) {
    assert.equal(setup.requestType, 'class');
    assert.equal(setup.recipient, 'interface');
    assert.ok(Number.isInteger(setup.index));
    if (this.events.length >= 100000) throw new Error('Stub transfer limit: polling did not terminate');
  }
  resetCapture() { this.events = []; this.accepted = []; this.attempts.clear(); }
  async open() { this.opened = true; }
  async close() { this.opened = false; }
  async selectConfiguration(value) { this.configuration.configurationValue = value; }
  async claimInterface() {}
  async releaseInterface() {}
  async selectAlternateInterface() {}
}
module.exports = {StubUsb};
