import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDfuDescriptor} from '../web/dfu-descriptor.js';

const settings = (number = 0, alternate = 0, configurationValue = 1) => ({
  configuration: {configurationValue}, interface: {interfaceNumber: number}, alternate: {alternateSetting: alternate},
});
const intf = (number = 0, alternate = 0, cls = 0xfe, sub = 1, protocol = 2) => [9, 4, number, alternate, 0, cls, sub, protocol, 0];
const func = (size = 1024, attributes = 3, version = 0x0110) => [9, 0x21, attributes, 0xff, 0, size & 255, size >> 8, version & 255, version >> 8];
function config(parts, value = 1) {
  const bytes = [9, 2, 0, 0, 2, value, 0, 0x80, 50, ...parts.flat()];
  bytes[2] = bytes.length & 255; bytes[3] = bytes.length >> 8;
  return new DataView(Uint8Array.from(bytes).buffer);
}

test('selects the second interface properties instead of the first descriptor', () => {
  const data = config([intf(0), func(64), intf(1), func(1024, 7)]);
  assert.equal(parseDfuDescriptor(data, settings(0)).TransferSize, 64);
  assert.equal(parseDfuDescriptor(data, settings(1)).TransferSize, 1024);
  assert.equal(parseDfuDescriptor(data, settings(1)).ManifestationTolerant, true);
});
test('selects explicit alternate-specific properties', () => {
  const data = config([intf(0, 0), func(64), intf(0, 1), func(1024)]);
  assert.equal(parseDfuDescriptor(data, settings(0, 0)).TransferSize, 64);
  assert.equal(parseDfuDescriptor(data, settings(0, 1)).TransferSize, 1024);
});
test('supports one functional descriptor shared by multiple alternates', () => {
  const data = config([intf(0, 0), intf(0, 1), func(1024)]);
  assert.equal(parseDfuDescriptor(data, settings(0, 0)).DescriptorSource, 'shared-interface');
  assert.equal(parseDfuDescriptor(data, settings(0, 1)).TransferSize, 1024);
});
test('never borrows another interface descriptor', () => {
  const data = config([intf(0), func(1024), intf(1)]);
  assert.throws(() => parseDfuDescriptor(data, settings(1)), /대상 interface/);
});
test('does not treat a HID descriptor as a DFU descriptor', () => {
  const data = config([intf(0, 0, 3, 0, 0), [9, 0x21, 0x11, 1, 0, 1, 0x22, 64, 0], intf(1), func(2048)]);
  assert.equal(parseDfuDescriptor(data, settings(1)).TransferSize, 2048);
  assert.throws(() => parseDfuDescriptor(data, settings(0)), /DFU interface/);
});
test('rejects missing and ambiguous selected alternate metadata', () => {
  assert.throws(() => parseDfuDescriptor(config([intf(0), func(), intf(0, 1), func(), intf(0, 2)]), settings(0, 2)), /확정/);
  assert.throws(() => parseDfuDescriptor(config([intf(0), func(), func()]), settings()), /중복/);
  assert.throws(() => parseDfuDescriptor(config([intf(0), func()]), settings(0, 1)), /없습니다/);
});
test('rejects malformed length, configuration mismatch and duplicate interface', () => {
  const truncated = config([intf(), func()]); truncated.setUint16(2, truncated.byteLength + 1, true);
  assert.throws(() => parseDfuDescriptor(truncated, settings()), /길이/);
  assert.throws(() => parseDfuDescriptor(config([[0, 4]]), settings()), /길이/);
  assert.throws(() => parseDfuDescriptor(config([intf(), [8, 0x21, 3, 0, 0, 0, 4, 0x10]]), settings()), /짧습니다/);
  assert.throws(() => parseDfuDescriptor(config([intf(), func()], 2), settings()), /configuration/);
  assert.throws(() => parseDfuDescriptor(config([intf(), func(), intf()]), settings()), /중복/);
});
test('honors a DataView subrange rather than the backing buffer start', () => {
  const original = config([intf(), func(4096)]), wrapped = new Uint8Array(original.byteLength + 20);
  wrapped.set(new Uint8Array(original.buffer), 10);
  assert.equal(parseDfuDescriptor(new DataView(wrapped.buffer, 10, original.byteLength), settings()).TransferSize, 4096);
});
