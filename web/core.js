import {transport} from './transport.js';
import {sha256,crc32,unzipDfuEntries,applyDelta} from './binary.js';
import {FILES} from './package-data.js';
export {sha256,crc32};
import {parseDfuDescriptor} from './dfu-descriptor.js';
const VID=0x3941, NORMAL_PID=0xaf50, DFU_PID=0xaf51;
export const KNOWN_PACKAGES = Object.freeze({
 '84a3f46f3dac75ba17a472540266a65e738a7dbf900eeea364efe45b77ac7c36':'한국어 추가 v1',
 'd5ecaf7ad5ae587ffe4c4b31af7a3d8eb96e6c7cd6ff56af14b6481a86e2da4d':'원본 20260922'
});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function bounded(promise,label,ms=30000) {
 let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+' 응답 시간 초과. 추가 전송을 중단했습니다.')),ms);})]).finally(()=>clearTimeout(timer));
}
export function validateDfu(buffer,kind) {
 const a=new Uint8Array(buffer),v=new DataView(buffer),n=a.length;
 if(n<16||a[n-8]!==85||a[n-7]!==70||a[n-6]!==68||a[n-5]!==16)throw Error('DFU 꼬리말 형식 오류: '+kind);
 if(v.getUint32(n-4,true)!==((~crc32(a.subarray(0,n-4)))>>>0))throw Error('DFU 체크섬 오류: '+kind);
 if(kind==='osd_images' && n>0x1800000)throw Error('OSD 저장 공간 초과');
 if(kind==='firmware') {
  if(n>0x280000||a[0]!==78||a[1]!==66||a[4]!==7)throw Error('GT 펌웨어 컨테이너 오류');
  const addresses=[0x600a0000,0x60120000,0x60140000,0x60160000,0x600c0000,0x603a0000,0x603e0000];
  let p=8;for(let i=0;i<7;i++) {
   if(p+8>n-16||v.getUint32(p,true)!==addresses[i])throw Error('펌웨어 쓰기 주소 불일치');
   const len=v.getUint32(p+4,true);if(i===3&&len>0x100000)throw Error('CPU1 저장 공간 초과');
   p+=8+len;
  }
  if(p!==n-16)throw Error('펌웨어 길이 불일치');
 }
}
export async function validatePackage(buffer,mode='korean') {
 if(!['korean','original'].includes(mode))throw Error('잘못된 설치 모드');
 if(!(buffer instanceof ArrayBuffer)||buffer.byteLength>32*1024*1024)throw Error('잘못된 ZIP 크기');
 const sourceHash=await sha256(buffer);
 if(sourceHash!=='d5ecaf7ad5ae587ffe4c4b31af7a3d8eb96e6c7cd6ff56af14b6481a86e2da4d')throw Error('지원하는 공식 원본 20260922 ZIP과 일치하지 않습니다. 원본 파일을 선택하세요.');
 const entries=await unzipDfuEntries(buffer);
 if(entries.length!==2)throw Error('원본 ZIP의 DFU 항목 수가 다릅니다.');
 const files=[];
 for(const kind of ['osd_images','firmware']){
  const spec=FILES[kind],found=entries.filter(e=>e.name.split('/').at(-1)===spec.name);
  if(found.length!==1)throw Error('원본 DFU 파일 누락/중복');
  let data=found[0].data;
  if(data.byteLength!==spec.sourceBytes||await sha256(data)!==spec.sourceSha256)throw Error('원본 DFU 해시 불일치');
  if(mode==='korean'){
   const response=await fetch(new URL(spec.patchFile,import.meta.url));if(!response.ok)throw Error('패치 파일을 읽을 수 없습니다. ZIP 전체를 압축 해제하세요.');
   const patch=await response.arrayBuffer();
   if(await sha256(patch)!==spec.patchSha256)throw Error('패치 파일 해시 불일치');
   data=await applyDelta(data,patch,spec.targetBytes);
   if(await sha256(data)!==spec.targetSha256)throw Error('패치 결과 해시 불일치');
  }
  validateDfu(data,kind);files.push({kind,name:spec.name,data});
 }
 const hash=mode==='korean'?'84a3f46f3dac75ba17a472540266a65e738a7dbf900eeea364efe45b77ac7c36':sourceHash;
 return {hash,sourceHash,label:KNOWN_PACKAGES[hash],bytes:buffer.byteLength,files};
}
export function assertDevice(device,mode) {
 if(!device||device.vendorId!==VID||device.productId!==(mode==='hid'?NORMAL_PID:DFU_PID))throw Error('RayNeo GT / GT Max 업데이트 장치가 아닙니다.');
}
export function parseInfo(view) {
 const a=new Uint8Array(view.buffer,view.byteOffset,view.byteLength);
 if(a.length<40||a[1]!==0xc8||a[8]!==0)return null;
 const board=a[21];if(board!==0x40&&board!==0x41)throw Error('지원 대상 GT / GT Max 보드가 아닙니다.');
 const year=a[36]|a[37]<<8;
 return {board,model:`GT 계열 (Gemini${board===0x40?'1':'2'})`,version:`20${year}${String(a[38]).padStart(2,'0')}${String(a[39]).padStart(2,'0')}`};
}
export async function readHidInfo(device,timeout=8000) {
 assertDevice(device,'hid');if(!device.opened)await device.open();
 return new Promise((resolve,reject)=>{
  let timer;const finish=(err,value)=>{clearTimeout(timer);device.removeEventListener('inputreport',receive);err?reject(err):resolve(value);};
  const receive=event=>{try{const value=parseInfo(event.data);if(value)finish(null,value);}catch(e){finish(e);}};
  device.addEventListener('inputreport',receive);
  timer=setTimeout(()=>finish(Error('GT 정보 응답이 없습니다. 다른 RayNeo 앱을 닫고 다시 연결하세요.')),timeout);
  const report=new Uint8Array(64);report[0]=0x66;report[1]=0;
  device.sendReport(0,report).catch(e=>finish(e));
 });
}
export async function enterDfu(device) {
 assertDevice(device,'hid');await readHidInfo(device);
 const report=new Uint8Array(64);report[0]=0x66;report[1]=0x66;
 await device.sendReport(0,report);
 try{await device.close();}catch{} // Mode change may already have disconnected HID.
}
export function requireTwoTasks(interfaces,files) {
 const tasks=['osd_images','firmware'].map(kind=>{
  const candidates=interfaces.filter(i=>i.alternate.interfaceClass===0xfe&&i.alternate.interfaceSubclass===1&&i.alternate.interfaceProtocol===2&&String(i.name||'').toLowerCase().includes(kind));
  const matches=files.filter(f=>f.kind===kind);
  if(candidates.length!==1||matches.length!==1)throw Error('DFU 인터페이스/파일이 없거나 중복됩니다: '+kind);
  return {kind,settings:candidates[0],file:matches[0]};
 });
 const keys=tasks.map(t=>`${t.settings.configuration.configurationValue}/${t.settings.interface.interfaceNumber}/${t.settings.alternate.alternateSetting}`);
 if(keys[0]===keys[1])throw Error('OSD와 firmware가 동일한 DFU 인터페이스로 지정됐습니다.');
 return tasks;
}
function context(device,settings) {
 const ctx={selectedDevice:device,settings,$t:k=>k,handleFailedTrack(){}};
 for(const key of ['enumerateDfu','resolveNames','openTarget','download','getStatus','clearStatus'])ctx[key]=transport.methods[key].bind(ctx);
 return ctx;
}
export async function inspectDfu(device) {
 assertDevice(device,'dfu');
 const ctx=context(device,null),interfaces=ctx.enumerateDfu(device);
 // Resolve missing names from USB string descriptors before selecting targets.
 for(const i of interfaces)if(!i.name)i.name=null;
 await bounded(ctx.resolveNames(device,interfaces),'USB 인터페이스 확인');
 const tasks=requireTwoTasks(interfaces,[{kind:'osd_images'},{kind:'firmware'}]);
 const probe=context(device,tasks[1].settings);
 await bounded(probe.openTarget(device,tasks[1].settings),'DFU 정보 인터페이스 열기');
 const number=tasks[1].settings.interface.interfaceNumber;
 let state=await bounded(probe.getStatus(),'DFU 정보 상태');
 if(state.state===10){await probe.clearStatus();state=await probe.getStatus();}
 if(state.state===5||state.state===9){await transport.webusb.requestOut(device,number,6);state=await probe.getStatus();}
 if(state.state!==2||state.status!==0)throw Error('기기가 DFU 작업 중입니다. 다른 업데이터를 닫고 재연결하세요.');
 let identity;
 try {
  identity=await bounded(transport.webusb.requestIn(device,number,2,16,0xff00),'GT 보드 확인');
 } finally {
  // UPLOAD changes the DFU state to upload-idle; return to idle without DNLOAD.
  await bounded(transport.webusb.requestOut(device,number,6),'DFU 정보 조회 종료');
 }
 if(!identity||identity.byteLength<4||![0x40,0x41].includes(identity.getUint8(0)))throw Error('GT 계열 보드 정보를 확인하지 못했습니다. 펌웨어를 전송하지 않았습니다.');
 state=await probe.getStatus();if(state.state!==2||state.status!==0)throw Error('정보 조회 후 DFU 대기 상태 확인 실패');
 await transport.webusb.closeSession(device);
 return interfaces;
}
export async function strictDfuDownload(ctx,data,{onProgress=()=>{},wait=sleep,now=Date.now,pollLimit=120000}={}) {
 if(!(data instanceof ArrayBuffer)||!data.byteLength)throw Error('빈 DFU 파일');
 const status=async()=>{
  const s=await bounded(ctx.getStatus(),'DFU 상태 조회');
  if(s.status!==0||s.state===10)throw Error(`기기 DFU 오류: state=${s.state}, status=${s.status}`);
  return s;
 };
 const poll=async(states)=>{
  const deadline=now()+pollLimit;
  for(let rounds=0;rounds<20000;rounds++) {
   const s=await status();if(states.includes(s.state))return s;
   if(now()>=deadline)throw Error('DFU 완료 상태 대기 시간 초과');
   const pause=Math.max(1,s.pollTimeout||1);
   if(now()+pause>deadline)throw Error('장치가 요청한 DFU 대기 시간이 제한을 초과합니다.');
   await wait(pause);
  }
  throw Error('DFU 상태 응답 횟수 초과');
 };
 // A prior partial transfer must not be continued at block zero.
 let initial=await bounded(ctx.getStatus(),'DFU 시작 상태');
 if(initial.state===10||initial.status!==0){await ctx.clearStatus();initial=await status();}
 if(initial.state===5||initial.state===9){await transport.webusb.requestOut(ctx.selectedDevice,ctx.settings.interface.interfaceNumber,6);initial=await status();}
 if(initial.state!==2||initial.status!==0)throw Error('DFU가 대기 상태가 아닙니다. 재연결 후 다시 시도하세요.');
 let offset=0,block=0;
 while(offset<data.byteLength) {
  const chunk=data.slice(offset,Math.min(offset+1024,data.byteLength));
  // No blind retransmission after an uncertain USB write.
  const wrote=await bounded(ctx.download(chunk,block),'DFU 블록 전송');
  if(wrote!==chunk.byteLength)throw Error(`USB 부분 전송: ${wrote}/${chunk.byteLength}. 추가 쓰기를 중단했습니다.`);
  await poll([5]);offset+=wrote;block++;onProgress(offset,data.byteLength,'data');
 }
 const wrote=await bounded(ctx.download(new ArrayBuffer(0),block),'DFU 종료 블록');
 if(wrote!==0)throw Error('DFU 종료 블록 응답 오류');
 onProgress(offset,data.byteLength,'manifest');
 try {
  const final=await poll([2,8]);onProgress(offset,data.byteLength,'complete');return final;
 } catch(cause) {
  const e=cause instanceof Error?cause:new Error(String(cause));
  e.afterFinalBlock=true;throw e; // Never convert an unconfirmed final status into success.
 }
}
function isManifestDisconnect(error) {
 // Accept only specific WebUSB disconnect messages, not arbitrary NotFoundError values.
 const detail=String(error?.message??error);
 const disconnected="(?:Failed to execute 'controlTransferIn' on 'USBDevice': )?(?:The device was disconnected\\.|Device unavailable\\.)";
 if(error?.name==='NotFoundError')return new RegExp('^'+disconnected+'$').test(detail);
 return new RegExp('^(?:(?:DFU GETSTATUS failed: )?ControlTransferIn failed: )?NotFoundError: '+disconnected+'$').test(detail);
}
export async function installPackage(device,pkg,{onProgress=()=>{},log=()=>{},onState=()=>{}}={}) {
 assertDevice(device,'dfu');
 if(!KNOWN_PACKAGES[pkg?.hash]||pkg.files?.length!==2)throw Error('먼저 펌웨어 ZIP을 검증하세요.');
 for(const kind of ['osd_images','firmware']){
  const selected=pkg.files.filter(f=>f.kind===kind);
  if(selected.length!==1)throw Error('설치 파일 누락/중복');
  const spec=FILES[kind],expected=pkg.hash==='84a3f46f3dac75ba17a472540266a65e738a7dbf900eeea364efe45b77ac7c36'?spec.targetSha256:spec.sourceSha256;
  if(await sha256(selected[0].data)!==expected)throw Error('설치 직전 파일 해시 불일치');
 }

 const interfaces=await inspectDfu(device),tasks=requireTwoTasks(interfaces,pkg.files);
 // Inspect both target capabilities before any DNLOAD/erase/program operation.
 for(const task of tasks) {
  await transport.webusb.closeSession(device);
  const ctx=context(device,task.settings);await bounded(ctx.openTarget(device,task.settings),'DFU 인터페이스 열기');
  const configIndex=device.configurations.findIndex(c=>c.configurationValue===task.settings.configuration.configurationValue);
  if(configIndex<0)throw Error('DFU 구성 번호 불일치');
  const raw=await bounded(transport.webusb.readDeviceConfigurationDescriptor(device,configIndex),'DFU 규격 확인');
  const d=parseDfuDescriptor(raw,task.settings);
  if(!d||![0x0100,0x0101,0x0110].includes(d.DFUVersion)||!Number.isInteger(d.TransferSize)||d.TransferSize<1024||d.CanDnload!==true)throw Error('지원하지 않는 DFU 규격입니다. 쓰기를 시작하지 않았습니다.');
 }
 let osdConfirmed=false;
 for(let i=0;i<tasks.length;i++) {
  const task=tasks[i];onState(task.kind);log(`${task.kind}: ${task.file.data.byteLength.toLocaleString()} bytes 전송 시작`);
  await transport.webusb.closeSession(device);
  const ctx=context(device,task.settings);await bounded(ctx.openTarget(device,task.settings),'DFU 인터페이스 열기');
  try {
   const result=await strictDfuDownload(ctx,task.file.data,{onProgress:(sent,total,phase)=>onProgress({kind:task.kind,index:i,sent,total,phase,percent:Math.floor((i+sent/total*.98)/2*100)})});
   if(result.state===8&&i===0)throw Error('OSD 처리 후 재부팅 대기 상태입니다. 두 번째 파일을 전송하지 않았습니다.');
   if(task.kind==='osd_images')osdConfirmed=true;
   log(`${task.kind}: 기기 완료 응답 확인 (state ${result.state})`);
  } catch(cause) {
   const e=cause instanceof Error?cause:new Error(String(cause));e.task=task.kind;
   if(osdConfirmed&&task.kind==='firmware'&&i===tasks.length-1&&e.afterFinalBlock===true&&isManifestDisconnect(e)) {
    onProgress({kind:task.kind,index:i,sent:task.file.data.byteLength,total:task.file.data.byteLength,phase:'reboot',percent:99});
    return {transferred:true,completion:'reboot-pending',finalStatusConfirmed:false,deviceBootVerified:false};
   }
   throw e;
  }
 }
 try{await transport.webusb.closeSession(device);}catch{}
 onProgress({kind:'firmware',index:1,sent:1,total:1,phase:'complete',percent:100});
 return {transferred:true,completion:'dfu-confirmed',finalStatusConfirmed:true,deviceBootVerified:false};
}
export async function chooseHid(){const devices=await navigator.hid.requestDevice({filters:[{vendorId:VID,productId:NORMAL_PID}]});if(!devices.length)throw Error('기기 선택을 취소했습니다.');return devices[0];}
export async function chooseDfu(){return navigator.usb.requestDevice({filters:[{vendorId:VID,productId:DFU_PID}]});}
