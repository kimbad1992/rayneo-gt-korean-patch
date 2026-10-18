'use strict';
const assert = require('node:assert/strict');
const {StubUsb} = require('./stub_usb.cjs');
class SessionUsb extends StubUsb {
  constructor(options = {}) {
    super(options);
    this.vendorId = 0x3941;this.productId = 0xaf51;
    this.serialNumber = 'TEST-NOT-A-REAL-DEVICE';
    const alternates = ['firmware','osd_images'].map((interfaceName, alternateSetting) => ({
      alternateSetting, interfaceName, interfaceClass: 0xfe, interfaceSubclass: 1, interfaceProtocol: 2}));
    this.configuration = {configurationValue: 1, interfaces: [{interfaceNumber: 0, claimed: false, alternate: alternates[0], alternates}]};
    this.configurations = [this.configuration];
    this.activeAlternate = 0;
  }
  async controlTransferIn(setup,length) {
    if (setup.requestType === 'standard') {
      assert.equal(setup.recipient, 'device');assert.equal(setup.request, 6);
      assert.equal(setup.value, 0x0200);
      const bytes = Uint8Array.from([9,2,45,0,1,1,0,0x80,50,
        9,4,0,0,0,0xfe,1,2,1, 9,0x21,3,0,0,0,4,0,1,
        9,4,0,1,0,0xfe,1,2,2, 9,0x21,3,0,0,0,4,0,1]);
      this.events.push({direction:'in',...setup,length});
      return {status:'ok',data:new DataView(bytes.buffer.slice(0,length))};
    }
    if (setup.requestType === 'class' && setup.request === 2 && setup.value === 0xff00) {
      const bytes = new Uint8Array(length);bytes[0] = this.options.board ?? 0x40;
      this.state = 9;
      this.events.push({direction:'in',...setup,length});
      return {status:'ok',data:new DataView(bytes.buffer)};
    }
    return super.controlTransferIn(setup,length);
  }
  async claimInterface(number) {this.configuration.interfaces.find(i=>i.interfaceNumber===number).claimed=true;}
  async releaseInterface(number) {this.configuration.interfaces.find(i=>i.interfaceNumber===number).claimed=false;}
  async selectAlternateInterface(number,alt) {
    const intf = this.configuration.interfaces.find(i=>i.interfaceNumber===number);
    intf.alternate = intf.alternates.find(a=>a.alternateSetting===alt);this.activeAlternate=alt;
    this.events.push({direction:'select',interface:number,alternate:alt});
  }
}
module.exports = {SessionUsb};
