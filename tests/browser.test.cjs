// Browser UI integration uses fake USB/HID only; never opens hardware permission.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const originalZip=process.argv[2];if(!originalZip)throw Error('Pass the official 20260922 ZIP path');
const testedFiles=Object.fromEntries(['app.js','index.html','core.js','binary.js','transport.js','package-data.js'].map(name=>[name,require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,'web',name))).digest('hex')]));
(async()=>{
 const server=require('node:child_process').spawn(process.env.PYTHON||'python',[path.join(root,'server.py'),'--no-browser','--port','18761'],{stdio:['ignore','pipe','pipe'],windowsHide:true});
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Test server startup timeout')),10000);server.stdout.on('data',d=>{if(String(d).includes('127.0.0.1:18761')){clearTimeout(timeout);resolve();}});server.on('exit',code=>{clearTimeout(timeout);reject(Error('Test server exit '+code));});server.on('error',reject);});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:1100}}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>requests.push(r.url()));
  await page.addInitScript(()=>{
   const trace=window.__test={scenario:'normal',hidVersion:[26,9,22],hidBoard:0x40,hidQueries:0,modeChanges:0,usbChoices:0,writes:0,markers:[],blocks:{},permissionCalls:0,disconnects:0};
   class FakeDfu {
    constructor(){this.vendorId=0x3941;this.productId=0xaf51;this.opened=false;this.state=2;this.alt=0;this.manifestPending=false;this.dataChunks={};
     const alternates=['firmware','osd_images'].map((interfaceName,alternateSetting)=>({interfaceName,alternateSetting,interfaceClass:0xfe,interfaceSubclass:1,interfaceProtocol:2}));
     this.configuration={configurationValue:1,interfaces:[{interfaceNumber:0,claimed:false,alternate:alternates[0],alternates}]};this.configurations=[this.configuration];}
    async open(){this.opened=true;}async close(){this.opened=false;}async selectConfiguration(){}
    async claimInterface(){this.configuration.interfaces[0].claimed=true;}async releaseInterface(){this.configuration.interfaces[0].claimed=false;}
    async selectAlternateInterface(_,n){this.alt=n;this.manifestPending=false;this.configuration.interfaces[0].alternate=this.configuration.interfaces[0].alternates[n];}
    async controlTransferIn(s,n){
     if(s.requestType==='standard'){const a=Uint8Array.from([9,2,45,0,1,1,0,128,50,9,4,0,0,0,254,1,2,1,9,33,3,0,0,0,4,0,1,9,4,0,1,0,254,1,2,2,9,33,3,0,0,0,4,0,1]);return {status:'ok',data:new DataView(a.buffer.slice(0,n))};}
     const shouldDisconnect=s.request===3&&(
      (trace.scenario==='firmware-manifest-disconnect'&&this.alt===0&&this.manifestPending)||
      (trace.scenario==='osd-manifest-disconnect'&&this.alt===1&&this.manifestPending)||
      (trace.scenario==='firmware-mid-transfer-disconnect'&&this.alt===0&&!this.manifestPending&&this.dataChunks[0]>0)
     );
     if(shouldDisconnect){trace.disconnects++;this.opened=false;throw new DOMException('The device was disconnected.','NotFoundError');}
     const a=new Uint8Array(n);if(s.request===2&&s.value===0xff00){a[0]=0x40;this.state=9;}else if(s.request===3){a[4]=this.state;this.manifestPending=false;}else throw Error('Unexpected fake IN');
     return {status:'ok',data:new DataView(a.buffer)};
    }
    async controlTransferOut(s,data=new ArrayBuffer(0)){
     if(s.request===1){trace.writes++;trace.blocks[this.alt]=(trace.blocks[this.alt]||0)+1;if(data.byteLength){this.state=5;this.dataChunks[this.alt]=(this.dataChunks[this.alt]||0)+1;}else{trace.markers.push(this.alt);this.state=2;this.manifestPending=true;}}
     else if(s.request===6||s.request===4)this.state=2;else throw Error('Unexpected fake OUT');
     return {status:'ok',bytesWritten:data.byteLength};
    }
   }
   class FakeHid extends EventTarget {
    constructor(){super();this.vendorId=0x3941;this.productId=0xaf50;this.opened=false;}
    async open(){this.opened=true;}async close(){this.opened=false;}
    async sendReport(_,a){if(a[1]===0){trace.hidQueries++;const b=new Uint8Array(64);b[1]=0xc8;b[21]=trace.hidBoard;b[36]=trace.hidVersion[0]&255;b[37]=trace.hidVersion[0]>>8;b[38]=trace.hidVersion[1];b[39]=trace.hidVersion[2];const e=new Event('inputreport');Object.defineProperty(e,'data',{value:new DataView(b.buffer)});this.dispatchEvent(e);}else if(a[1]===0x66){trace.modeChanges++;this.opened=false;}else throw Error('Unexpected fake HID');}
   }
   const usb=new EventTarget(),hid=new EventTarget(),device=new FakeDfu(),hdevice=new FakeHid();
   usb.requestDevice=async()=>{trace.permissionCalls++;trace.usbChoices++;return device;};
   hid.requestDevice=async()=>{trace.permissionCalls++;return [hdevice];};
   Object.defineProperty(navigator,'usb',{value:usb});Object.defineProperty(navigator,'hid',{value:hid});
  });
  const getTrace=()=>page.evaluate(()=>window.__test),snapshots={};
  const fullWrites=Math.ceil(14469916/1024)+Math.ceil(1288376/1024)+2;
  async function prepare(scenario='normal'){
   await page.goto('http://127.0.0.1:18761/',{waitUntil:'networkidle'});
   await page.evaluate(name=>{window.__test.scenario=name;},scenario);
   assert.equal(await page.locator('#install').isDisabled(),true);
   assert.equal(await page.locator('#verify-boot').isHidden(),true);
   assert.equal((await getTrace()).permissionCalls,0);
   await page.setInputFiles('#package-file',originalZip);await page.waitForFunction(()=>document.querySelector('#package-status').textContent.includes('검증 완료'));
   assert.equal(await page.locator('#install').isDisabled(),true);
   await page.click('#connect-hid');await page.waitForFunction(()=>!document.querySelector('#enter-dfu').disabled);
   assert.equal((await getTrace()).writes,0);
   await page.click('#enter-dfu');await page.waitForFunction(()=>document.querySelector('#device-status').textContent.includes('전환 요청'));
   await page.click('#connect-dfu');await page.waitForFunction(()=>!document.querySelector('#install').disabled);
   const trace=await getTrace();assert.equal(trace.writes,0);assert.equal(trace.modeChanges,1);
   assert.equal(await page.locator('#verify-boot').isHidden(),true);
  }
  async function runInstall(){
   await page.click('#install');
   await page.waitForFunction(()=>!document.querySelector('#package-file').disabled,{},{timeout:60000});
   assert.equal(await page.locator('#install').isDisabled(),true);
  }
  async function queryBoot({version,board,success}){
   await page.evaluate(({version,board})=>{if(version)window.__test.hidVersion=version;if(board!==undefined)window.__test.hidBoard=board;},{version,board});
   const before=await getTrace();await page.click('#verify-boot');
   await page.waitForFunction(()=>!document.querySelector('#package-file').disabled);
   const after=await getTrace();
   assert.equal(after.hidQueries,before.hidQueries+1,'Boot verification must send exactly one HID information query');
   assert.equal(after.permissionCalls,before.permissionCalls+1);
   assert.equal(after.writes,before.writes,'Boot verification must never write firmware');
   assert.equal(after.modeChanges,before.modeChanges,'Boot verification must not enter DFU');
   assert.equal(after.usbChoices,before.usbChoices,'Boot verification must only choose HID');
   assert.equal(await page.locator('#result').evaluate(e=>e.classList.contains('error')),!success);
   assert.equal(await page.locator('#verify-boot').isHidden(),success);
   if(success){
    assert.match(await page.locator('#result').textContent(),/정상 모드 응답과 버전/);
    assert.equal(await page.locator('#progress').evaluate(e=>e.value),100);
   }
   return after;
  }

  // A normal DFU completion still offers an explicit read-only boot check.
  await prepare();await runInstall();
  assert.match(await page.locator('#result').textContent(),/두 파일의 기기 완료 응답/);
  assert.equal(await page.locator('#result').evaluate(e=>e.classList.contains('error')),false);
  assert.equal(await page.locator('#verify-boot').isVisible(),true);
  let trace=await getTrace();assert.deepEqual(trace.markers,[1,0]);assert.equal(trace.writes,fullWrites);
  await queryBoot({board:0x41,success:false});
  snapshots.normal=await queryBoot({board:0x40,success:true});

  // Firmware may reboot before the final GETSTATUS. This is pending verification, not failure.
  await prepare('firmware-manifest-disconnect');await runInstall();
  const pending=await page.locator('#result').textContent();assert.match(pending,/두 파일 전송을 마쳤습니다/);assert.match(pending,/재부팅 확인/);
  assert.equal(await page.locator('#result').evaluate(e=>e.classList.contains('error')),false);
  assert.equal(await page.locator('#progress').evaluate(e=>e.value),99);
  assert.equal(await page.locator('#verify-boot').isVisible(),true);
  trace=await getTrace();assert.deepEqual(trace.markers,[1,0]);assert.equal(trace.writes,fullWrites);assert.equal(trace.disconnects,1);
  await queryBoot({version:[26,8,1],success:false});
  assert.equal(await page.locator('#progress').evaluate(e=>e.value),99);
  snapshots.reboot=await queryBoot({version:[26,9,22],success:true});

  // A different package invalidates an outstanding boot verification result.
  await prepare('firmware-manifest-disconnect');await runInstall();
  assert.equal(await page.locator('#verify-boot').isVisible(),true);trace=await getTrace();
  await page.click('#load-original');await page.waitForFunction(()=>document.querySelector('#package-status').textContent.includes('원본 20260922')&&document.querySelector('#package-status').textContent.includes('검증 완료'));
  assert.equal(await page.locator('#verify-boot').isHidden(),true);
  assert.equal((await getTrace()).writes,trace.writes);
  await page.setInputFiles('#package-file',{name:'bad.zip',mimeType:'application/zip',buffer:Buffer.from('invalid')});
  await page.waitForFunction(()=>document.querySelector('#package-status').classList.contains('error'));
  assert.equal(await page.locator('#install').isDisabled(),true);assert.equal((await getTrace()).writes,trace.writes);
  assert.equal(await page.locator('#verify-boot').isHidden(),true);

  // The same disconnect in either earlier phase remains a transfer failure.
  for(const scenario of ['firmware-mid-transfer-disconnect','osd-manifest-disconnect']){
   await prepare(scenario);await runInstall();trace=await getTrace();
   assert.equal(await page.locator('#result').evaluate(e=>e.classList.contains('error')),true);
   assert.equal(await page.locator('#verify-boot').isHidden(),true);
   assert.deepEqual(trace.markers,[1]);assert.equal(trace.disconnects,1);assert(trace.writes<fullWrites);
   if(scenario==='osd-manifest-disconnect')assert.equal(trace.blocks[0],undefined,'Firmware must not start after OSD failed');
   snapshots[scenario]=trace;
  }
  assert.equal(errors.length,0,errors.join('\n'));
  assert(requests.every(u=>u.startsWith('http://127.0.0.1:18761/')),'Unexpected external request');
  // Capture a clean user-facing screen, without simulated device success.
  await page.reload({waitUntil:'networkidle'});await page.setInputFiles('#package-file',originalZip);await page.waitForFunction(()=>document.querySelector('#package-status').textContent.includes('검증 완료'));
  await page.screenshot({path:path.join(root,'tests/installer-preview.png'),fullPage:true});
  for(const [name,hash] of Object.entries(testedFiles))assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,'web',name))).digest('hex'),hash,'Tested file changed during browser run: '+name);
  const report={pass:true,hardwareAccess:false,testedFiles,checks:['initial no device access','official ZIP locally patched to pinned Korean DFU hashes','manual HID query','explicit DFU transition','DFU board inspection without DNLOAD','complete simulated two-image install','normal completion offers boot verification','firmware final disconnect is neutral reboot pending at 99%','boot board mismatch rejected','old boot version rejected then correct version reaches 100%','boot verification only sends HID information query','package change clears pending boot verification','mid-transfer disconnect remains failure','OSD final disconnect remains failure and stops firmware','original package validation','invalid ZIP clears install readiness','no automatic retry','no external network requests','no page errors'],simulatedScenarios:snapshots};
  fs.writeFileSync(path.join(root,'tests/browser_result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
