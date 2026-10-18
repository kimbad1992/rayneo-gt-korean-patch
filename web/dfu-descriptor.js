// Read only: this module has no USB calls or browser side effects.
// USB DFU 1.1 sections 4.1.3 and 4.2 permit one functional descriptor
// shared by the alternate settings of one DFU interface.
// https://www.usb.org/sites/default/files/DFU_1.1.pdf
export function parseDfuDescriptor(data, settings) {
  const fail = message => { throw new Error('DFU 규격 확인 실패: ' + message); };
  if (!(data instanceof DataView) || data.byteLength < 9) fail('configuration descriptor가 짧습니다.');
  const configurationValue = settings?.configuration?.configurationValue;
  const interfaceNumber = settings?.interface?.interfaceNumber;
  const alternateSetting = settings?.alternate?.alternateSetting;
  for (const value of [configurationValue, interfaceNumber, alternateSetting]) {
    if (!Number.isInteger(value) || value < 0 || value > 255) fail('선택한 USB 대상 정보가 잘못되었습니다.');
  }
  const configLength = data.getUint8(0), totalLength = data.getUint16(2, true);
  if (configLength < 9 || data.getUint8(1) !== 2 || totalLength < configLength || totalLength > data.byteLength) {
    fail('configuration descriptor 길이/형식이 잘못되었습니다.');
  }
  if (data.getUint8(5) !== configurationValue) fail('선택한 configuration과 일치하지 않습니다.');

  const alternates = new Map(), functional = [];
  let current = null;
  for (let offset = configLength; offset < totalLength;) {
    if (offset + 2 > totalLength) fail('descriptor 머리말이 잘렸습니다.');
    const length = data.getUint8(offset), type = data.getUint8(offset + 1);
    if (length < 2 || offset + length > totalLength) fail('descriptor 길이가 범위를 벗어났습니다.');
    if (type === 2) fail('configuration descriptor가 중복되었습니다.');
    if (type === 4) {
      if (length < 9) fail('interface descriptor가 짧습니다.');
      current = {
        number: data.getUint8(offset + 2), alternate: data.getUint8(offset + 3),
        class: data.getUint8(offset + 5), subclass: data.getUint8(offset + 6),
        protocol: data.getUint8(offset + 7),
      };
      const key = current.number + '/' + current.alternate;
      if (alternates.has(key)) fail('interface/alternate descriptor가 중복되었습니다.');
      alternates.set(key, current);
    } else if (type === 0x21 && current?.class === 0xfe && current?.subclass === 1 && current?.protocol === 2) {
      // 0x21 is also a HID descriptor type. Only interpret it in DFU scope.
      if (length < 9) fail('DFU functional descriptor가 짧습니다.');
      const attributes = data.getUint8(offset + 2);
      functional.push({
        number: current.number, alternate: current.alternate,
        properties: {
          WillDetach: Boolean(attributes & 8), ManifestationTolerant: Boolean(attributes & 4),
          CanUpload: Boolean(attributes & 2), CanDnload: Boolean(attributes & 1),
          TransferSize: data.getUint16(offset + 5, true),
          DetachTimeOut: data.getUint16(offset + 3, true),
          DFUVersion: data.getUint16(offset + 7, true),
        },
      });
    }
    offset += length;
  }
  const selected = alternates.get(interfaceNumber + '/' + alternateSetting);
  if (!selected || selected.class !== 0xfe || selected.subclass !== 1 || selected.protocol !== 2) {
    fail('선택한 DFU interface/alternate가 configuration에 없습니다.');
  }
  const own = functional.filter(item => item.number === interfaceNumber);
  const exact = own.filter(item => item.alternate === alternateSetting);
  if (exact.length > 1) fail('선택한 alternate의 DFU 규격이 중복되었습니다.');
  if (exact.length === 1) return {...exact[0].properties, DescriptorSource: 'selected-alternate'};
  if (own.length === 1) return {...own[0].properties, DescriptorSource: 'shared-interface'};
  fail(own.length ? '여러 alternate의 DFU 규격 중 대상을 확정할 수 없습니다.' : '대상 interface의 DFU 규격이 없습니다.');
}
