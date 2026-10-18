import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {deflateSync} from 'node:zlib';
import * as core from '../web/core.js';
import {transport} from '../web/transport.js';
import {applyDelta,unzipDfuEntries} from '../web/binary.js';
import {FILES} from '../web/package-data.js';
const require=createRequire(import.meta.url),{SessionUsb}=require('./session_usb.cjs'),{StubUsb}=require('./stub_usb.cjs');
const exact=bytes=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const input=process.argv[2];if(!input)throw Error('Usage: node tests/core.test.mjs /path/to/official-20260922.zip');
const original=exact(fs.readFileSync(input)),checks=[];
Object.defineProperty(globalThis,'navigator',{value:{usb:new Proxy({},{get(){throw Error('Hardware forbidden');}}),hid:new Proxy({},{get(){throw Error('Hardware forbidden');}})}});
globalThis.fetch=async url=>{
 const file=fileURLToPath(url),allowed=fileURLToPath(new URL('../web/patches/',import.meta.url));
 assert(file.startsWith(allowed),'External request forbidden');return new Response(fs.readFileSync(file));
};
async function test(name,fn){await fn();checks.push(name);}
function context(device){const ctx={selectedDevice:device,settings:{interface:{interfaceNumber:0}}};for(const key of ['download','getStatus','clearStatus'])ctx[key]=transport.methods[key].bind(ctx);return ctx;}
let pkg;
await test('Exact official input reconstructs both pinned Korean DFU hashes',async()=>{
 pkg=await core.validatePackage(original);for(const file of pkg.files)assert.equal(await core.sha256(file.data),FILES[file.kind].targetSha256);
});
await test('Restore mode uses original DFUs and never fetches a patch',async()=>{
 const saved=fetch;globalThis.fetch=()=>{throw Error('Unexpected patch request');};
 try{const result=await core.validatePackage(original,'original');for(const file of result.files)assert.equal(await core.sha256(file.data),FILES[file.kind].sourceSha256);}finally{globalThis.fetch=saved;}
});
await test('Wrong original and mode are rejected before device access',async()=>{
 const bad=original.slice(0);new Uint8Array(bad)[50]^=1;await assert.rejects(core.validatePackage(bad));await assert.rejects(core.validatePackage(original,'other'));
});
await test('Corrupt patch is rejected',async()=>{
 const saved=fetch;globalThis.fetch=async()=>new Response(new Uint8Array([1,2,3]));try{await assert.rejects(core.validatePackage(original),/패치 파일 해시/);}finally{globalThis.fetch=saved;}
});
await test('Delta bounds and malformed archives fail closed',async()=>{
 const bad=Buffer.from('524e503108000000000000000009000000','hex');
 await assert.rejects(applyDelta(new ArrayBuffer(8),deflateSync(bad),8));await assert.rejects(unzipDfuEntries(new ArrayBuffer(40)));
});
await test('Device inspection is read-only and rejects other boards',async()=>{
 const device=new SessionUsb();await core.inspectDfu(device);assert.equal(device.accepted.length,0);
 const bad=new SessionUsb({board:0x42});await assert.rejects(core.installPackage(bad,pkg));assert.equal(bad.accepted.length,0);
});
await test('Full simulated install writes exact data in OSD then firmware order',async()=>{
 const device=new SessionUsb(),result=await core.installPackage(device,pkg);assert.equal(result.completion,'dfu-confirmed');assert.equal(result.deviceBootVerified,false);
 for(const file of pkg.files){const alt=file.kind==='osd_images'?1:0,rows=device.accepted.filter(w=>w.alternate===alt);assert.equal(rows.length,Math.ceil(file.data.byteLength/1024)+1);rows.forEach((w,i)=>assert.equal(w.block,i));assert.equal(rows.at(-1).data.length,0);assert.deepEqual(Buffer.concat(rows.slice(0,-1).map(w=>w.data)),Buffer.from(file.data));}
 assert.equal(device.accepted[0].alternate,1);assert.equal(device.accepted.at(-1).alternate,0);
});
await test('Tampered prepared data is rejected before DNLOAD',async()=>{
 const files=pkg.files.map(f=>({...f,data:f.data.slice(0)}));new Uint8Array(files[0].data)[0]^=1;const device=new SessionUsb();await assert.rejects(core.installPackage(device,{...pkg,files}),/해시/);assert.equal(device.accepted.length,0);
});
for(const opts of [{failBlock:1},{shortBlock:0},{zeroBlock:0},{chunkState:10,chunkStatus:7},{chunkState:5,chunkStatus:7},{outStatus:'stall'}])await test('Transfer stops without retry: '+JSON.stringify(opts),async()=>{
 const device=new StubUsb(opts);await assert.rejects(core.strictDfuDownload(context(device),new ArrayBuffer(2050)));assert.equal(device.finalSeen,false);assert(device.accepted.length<=1);
});
for(const opts of [{manifestState:10,manifestStatus:7},{manifestThrow:true}])await test('Manifest failure remains unconfirmed: '+JSON.stringify(opts),async()=>{
 const device=new StubUsb(opts);await assert.rejects(core.strictDfuDownload(context(device),new ArrayBuffer(8)),e=>e.afterFinalBlock===true);
});
await test('Device busy wait respects reported timeout',async()=>{
 const device=new StubUsb({chunkState:4,pollTimeout:10000}),waits=[];let clock=0;
 await core.strictDfuDownload(context(device),new ArrayBuffer(8),{now:()=>clock,wait:async ms=>{waits.push(ms);clock+=ms;device.state=5;}});assert.deepEqual(waits,[10000]);
});
await test('Endless busy state is bounded',async()=>{
 const device=new StubUsb({chunkState:4});let clock=0;await assert.rejects(core.strictDfuDownload(context(device),new ArrayBuffer(8),{now:()=>clock,wait:async ms=>{clock+=ms;},pollLimit:3}));assert.equal(device.accepted.length,1);
});
for(const phase of ['osd-final','firmware-data','firmware-final'])await test('Disconnect classification: '+phase,async()=>{
 class DisconnectUsb extends SessionUsb{async controlTransferIn(setup,length){if(setup.requestType==='class'&&setup.request===3&&this.accepted.length&&((phase==='osd-final'&&this.activeAlternate===1&&this.finalSeen)||(phase==='firmware-data'&&this.activeAlternate===0&&!this.finalSeen&&this.accepted.at(-1).alternate===0)||(phase==='firmware-final'&&this.activeAlternate===0&&this.finalSeen&&this.accepted.at(-1).alternate===0)))throw new DOMException("Failed to execute 'controlTransferIn' on 'USBDevice': The device was disconnected.",'NotFoundError');return super.controlTransferIn(setup,length);}}
 const device=new DisconnectUsb();if(phase==='firmware-final'){const result=await core.installPackage(device,pkg);assert.equal(result.completion,'reboot-pending');assert.equal(result.finalStatusConfirmed,false);}else await assert.rejects(core.installPackage(device,pkg));
});
const web=new URL('../web/',import.meta.url),names=fs.readdirSync(web).filter(name=>/\.(js|html)$/.test(name));
const testedFiles=Object.fromEntries(await Promise.all(names.map(async name=>[name,await core.sha256(fs.readFileSync(new URL(name,web)))])));
fs.writeFileSync(new URL('core-result.json',import.meta.url),JSON.stringify({pass:true,hardwareAccess:false,networkAccess:false,checks,testedFiles},null,2));
console.log(`PASS ${checks.length} core checks; no physical device or external network access.`);
