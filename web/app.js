import {validatePackage,chooseHid,readHidInfo,enterDfu,chooseDfu,inspectDfu,installPackage} from './core.js';
const $=id=>document.getElementById(id);
let pkg=null,hid=null,dfu=null,info=null,hidSerial='',busy=false,writing=false,packageGeneration=0,pendingBoot=null,originalBytes=null;
const supported=isSecureContext&&!!navigator.usb&&!!navigator.hid&&!!globalThis.DecompressionStream;
$('unsupported').hidden=supported;
function log(text){$('log').textContent+=`${new Date().toLocaleTimeString()}  ${text}\n`;$('log').scrollTop=$('log').scrollHeight;}
function message(id,text,error=false){$(id).textContent=text;$(id).classList.toggle('error',error);}
function update(){
 for(const id of ['load-korean','load-original'])$(id).disabled=busy||!originalBytes;
 $('package-file').disabled=busy;
 $('connect-hid').disabled=busy||!supported;
 $('enter-dfu').disabled=busy||!supported||!hid||!info;
 $('connect-dfu').disabled=busy||!supported;
 $('install').disabled=busy||!supported||!pkg||!dfu;
 $('verify-boot').hidden=!pendingBoot;
 $('verify-boot').disabled=busy||!supported;
 $('install').textContent=pkg?.label.startsWith('원본')?'원본 펌웨어 설치':'선택한 펌웨어 설치';
 $('target').textContent=pkg&&dfu?`${pkg.label} → ${info?.model||'GT 계열 업데이트 장치'}`:'검증된 펌웨어와 업데이트 기기를 연결하면 설치할 수 있습니다.';
}
async function action(fn,status='device-status'){
 if(busy)return;busy=true;update();
 try{await fn();}catch(e){const text=String(e?.message||e);message(status,text,true);log(text);}finally{busy=false;update();}
}
async function selectBytes(buffer,name,mode='korean'){
 const generation=++packageGeneration;pkg=null;pendingBoot=null;update();message('package-status',`${name} 검증 중…`);
 const checked=await validatePackage(buffer,mode);
 if(generation!==packageGeneration)return;
 pkg=checked;message('package-status',`${checked.label} · 원본/패치/최종 DFU 해시 검증 완료`);
 log(`선택: ${name}\n원본 SHA-256 ${checked.sourceHash}`);update();
}
async function prepare(mode){await action(async()=>{
 pkg=null;pendingBoot=null;update();
 if(!originalBytes)throw Error('공식 원본 ZIP을 먼저 선택하세요.');
 await selectBytes(originalBytes,mode==='korean'?'한국어 패치 적용':'원본 복구 준비',mode);
},'package-status');}
$('load-korean').addEventListener('click',()=>prepare('korean'));
$('load-original').addEventListener('click',()=>prepare('original'));
$('package-file').addEventListener('change',event=>{const file=event.target.files[0];if(file)action(async()=>{
 pkg=null;pendingBoot=null;originalBytes=null;update();
 if(file.size>32*1024*1024)throw Error('원본 ZIP이 너무 큽니다.');
 const buffer=await file.arrayBuffer();
 await selectBytes(buffer,'한국어 패치 적용');originalBytes=buffer;
},'package-status');});
$('connect-hid').addEventListener('click',()=>action(async()=>{
 hid=null;info=null;hidSerial='';dfu=null;
 const selected=await chooseHid();
 try{const read=await readHidInfo(selected);hid=selected;info=read;hidSerial=selected.serialNumber||'';message('device-status',`${read.model} · 현재 버전 ${read.version}. ‘업데이트 모드 전환’을 누르세요.`);log(`HID 정보 확인: ${read.model}, ${read.version}`);}
 catch(e){try{await selected.close();}catch{}throw e;}
}));
$('enter-dfu').addEventListener('click',()=>action(async()=>{
 dfu=null;pendingBoot=null;await enterDfu(hid);hid=null;
 message('device-status','업데이트 모드 전환 요청을 보냈습니다. 잠시 기다린 뒤 ‘업데이트 기기 연결’을 누르세요.');log('HID 66 66: 사용자가 업데이트 모드 전환 요청');
}));
$('connect-dfu').addEventListener('click',()=>action(async()=>{
 dfu=null;const selected=await chooseDfu();
 try{
  if(hidSerial&&selected.serialNumber&&hidSerial!==selected.serialNumber)throw Error('앞서 선택한 안경과 일련번호가 다릅니다. 안경 한 대만 연결하세요.');
  const interfaces=await inspectDfu(selected);dfu=selected;
  message('device-status','GT 보드와 OSD·firmware 업데이트 인터페이스를 확인했습니다. 설치할 수 있습니다.');
  log('DFU 연결 확인: '+interfaces.map(x=>x.name||'이름 없음').join(', '));
 }catch(e){try{await selected.close();}catch{}throw e;}
}));
$('install').addEventListener('click',()=>action(async()=>{
 if(!pkg||!dfu)throw Error('펌웨어와 기기를 먼저 선택하세요.');
 const selectedPackage=pkg,selectedDevice=dfu;pendingBoot=null;writing=true;$('progress').value=0;
 message('result','설치를 시작했습니다. 연결을 유지해 주세요.');log('사용자가 설치 시작: '+selectedPackage.label);
 try{
  const outcome=await installPackage(selectedDevice,selectedPackage,{log,onState:kind=>message('result',`${kind==='osd_images'?'메뉴 이미지':'펌웨어'} 전송 중… 케이블을 분리하지 마세요.`),onProgress:p=>{
   $('progress').value=p.percent;if(p.phase==='manifest')message('result',`${p.kind==='osd_images'?'메뉴 이미지':'펌웨어'} 저장 완료 응답을 기다립니다…`);
  }});
  pendingBoot={board:info?.board,version:'20260922',korean:selectedPackage.label.startsWith('한국어')};
  if(outcome.completion==='reboot-pending'){
   message('result','두 파일 전송을 마쳤습니다. 마지막 완료 응답을 읽는 동안 업데이트 장치 연결이 해제되었습니다. 정상 재부팅 때도 발생합니다. 안경 화면이 돌아오면 ‘재부팅 확인’을 눌러 정상 모드와 버전을 확인하세요.');
   log('firmware: 종료 블록 전송 뒤 연결 해제. 재부팅 확인 대기 (설치 실패로 단정하지 않음).');
  }else{
   message('result','두 파일의 기기 완료 응답을 확인했습니다. 안경 화면이 돌아오면 ‘재부팅 확인’을 누르세요. 자동으로 돌아오지 않으면 케이블을 다시 연결한 뒤 확인하세요.');
   log('두 파일 전송 완료 응답 확인. 정상 모드와 버전은 재부팅 확인으로 조회할 수 있습니다.');
  }
 }catch(cause){
  const e=cause instanceof Error?cause:new Error(String(cause));
  const text=e.afterFinalBlock?`마지막 데이터 전송 후 완료 응답을 확인하지 못했습니다 (${e.task||'DFU'}). 성공으로 처리하지 않았습니다. 기록을 저장하고 기기의 재인식 상태를 확인하세요.\n${e.message}`:`설치가 중단됐습니다. 자동 재시도하지 않습니다.\n${e.message}`;
  message('result',text,true);log(text);
 }finally{writing=false;dfu=null;}
},'result'));
$('verify-boot').addEventListener('click',()=>action(async()=>{
 if(!pendingBoot)throw Error('먼저 펌웨어 전송을 완료하세요.');
 const expected=pendingBoot,selected=await chooseHid();
 try{
  const read=await readHidInfo(selected);
  log(`재부팅 정보 확인: ${read.model}, ${read.version}`);
  if(expected.board!=null&&read.board!==expected.board)throw Error('설치 전에 확인한 보드와 다릅니다. 설치한 안경 한 대만 연결한 뒤 다시 확인하세요.');
  if(read.version!==expected.version)throw Error(`정상 모드 응답은 받았지만 버전이 ${read.version}입니다. 설치 대상 버전 ${expected.version}과 일치하지 않아 완료를 확정하지 않았습니다.`);
  hid=selected;info=read;hidSerial=selected.serialNumber||'';dfu=null;pendingBoot=null;
  $('progress').value=100;
  message('device-status',`${read.model} · 정상 모드 · 버전 ${read.version}`);
  message('result',`선택한 GT의 정상 모드 응답과 버전 ${read.version}을 확인했습니다.${expected.korean?' 언어 메뉴에서 한국어를 선택하고 표시를 확인해 주세요.':' 안경 화면이 정상인지 확인해 주세요.'}`);
  log('정상 모드/대상 버전 확인 완료. 메뉴 표시 자체는 안경에서 확인 필요.');
 }finally{try{await selected.close();}catch{}}
},'result'));
$('save-log').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([$('log').textContent],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='RayNeo-install-log.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
window.addEventListener('beforeunload',e=>{if(writing){e.preventDefault();e.returnValue='';}});
navigator.usb?.addEventListener('disconnect',e=>{if(e.device===dfu&&!writing){dfu=null;message('device-status','업데이트 장치 연결이 해제됐습니다. 다시 연결해 주세요.');update();}});
navigator.hid?.addEventListener('disconnect',e=>{if(e.device===hid&&!writing){hid=null;update();}});
log('로컬 설치기 시작. 기기 연결/전송 자동 실행 없음.');update();
