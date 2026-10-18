// Project-authored WebUSB adapter. No vendor JavaScript is loaded or embedded.
function requireIn(result, label, minimum=0) {
 if(result.status!=='ok'||!result.data||result.data.byteLength<minimum)throw Error(label+': short or unsuccessful USB response');
 return result.data;
}
async function standardIn(device,value,length,index=0) {
 return requireIn(await device.controlTransferIn({requestType:'standard',recipient:'device',request:6,value,index},length),'USB descriptor',length);
}
async function requestIn(device,number,request,length,value=0) {
 return requireIn(await device.controlTransferIn({requestType:'class',recipient:'interface',request,value,index:number},length),'DFU IN',length);
}
async function requestOut(device,number,request,data=new ArrayBuffer(0),value=0) {
 const result=await device.controlTransferOut({requestType:'class',recipient:'interface',request,value,index:number},data);
 if(result.status!=='ok')throw Error('DFU OUT: '+result.status);
 return result.bytesWritten;
}
async function readDeviceConfigurationDescriptor(device,index) {
 if(!device.opened)await device.open();
 const head=await standardIn(device,0x0200|index,9);
 if(head.getUint8(0)!==9||head.getUint8(1)!==2)throw Error('Invalid USB configuration header');
 const length=head.getUint16(2,true);
 if(length<9||length>65535)throw Error('Invalid USB configuration length');
 return standardIn(device,0x0200|index,length);
}
async function readString(device,index) {
 const langHead=await standardIn(device,0x0300,2);
 const languages=await standardIn(device,0x0300,langHead.getUint8(0));
 if(languages.byteLength<4||languages.getUint8(1)!==3)throw Error('Missing USB string language');
 const language=languages.getUint16(2,true);
 const head=await standardIn(device,0x0300|index,2,language);
 const length=head.getUint8(0);
 if(length<2||length%2)throw Error('Invalid USB string length');
 const data=await standardIn(device,0x0300|index,length,language);
 if(data.getUint8(1)!==3)throw Error('Invalid USB string descriptor');
 let text='';for(let i=2;i<length;i+=2)text+=String.fromCharCode(data.getUint16(i,true));
 return text;
}
function enumerateDfu(device) {
 const result=[];
 for(const configuration of device.configurations)
  for(const intf of configuration.interfaces)
   for(const alternate of intf.alternates)
    if(alternate.interfaceClass===254&&alternate.interfaceSubclass===1&&alternate.interfaceProtocol===2)
     result.push({configuration,interface:intf,alternate,name:alternate.interfaceName||null});
 return result;
}
async function resolveNames(device,interfaces) {
 if(!device.opened)await device.open();
 for(let index=0;index<device.configurations.length;index++){
  const missing=interfaces.filter(item=>!item.name&&item.configuration.configurationValue===device.configurations[index].configurationValue);
  if(!missing.length)continue;
  const data=await readDeviceConfigurationDescriptor(device,index);
  for(let offset=9;offset<data.byteLength;){
   if(offset+2>data.byteLength)throw Error('Truncated USB descriptor');
   const length=data.getUint8(offset),type=data.getUint8(offset+1);
   if(length<2||offset+length>data.byteLength)throw Error('Invalid USB descriptor bounds');
   if(type===4){
    if(length<9)throw Error('Short USB interface');
    for(const item of missing)if(item.interface.interfaceNumber===data.getUint8(offset+2)&&item.alternate.alternateSetting===data.getUint8(offset+3)){
     const nameIndex=data.getUint8(offset+8);if(nameIndex)item.name=await readString(device,nameIndex);
    }
   }
   offset+=length;
  }
 }
}
async function openTarget(device,settings) {
 if(!device.opened)await device.open();
 const config=settings.configuration.configurationValue,number=settings.interface.interfaceNumber;
 if(device.configuration?.configurationValue!==config)await device.selectConfiguration(config);
 const active=device.configuration.interfaces.find(item=>item.interfaceNumber===number);
 if(!active)throw Error('Selected USB interface is missing');
 if(!active.claimed)await device.claimInterface(number);
 if(active.alternate.alternateSetting!==settings.alternate.alternateSetting)await device.selectAlternateInterface(number,settings.alternate.alternateSetting);
}
async function closeSession(device) {
 if(!device?.opened)return;
 try{
  for(const intf of device.configuration?.interfaces||[])if(intf.claimed)await device.releaseInterface(intf.interfaceNumber);
 }finally{await device.close();}
}
const methods={enumerateDfu,resolveNames,openTarget,
 download(data,block){return requestOut(this.selectedDevice,this.settings.interface.interfaceNumber,1,data,block);},
 async getStatus(){
  const data=await requestIn(this.selectedDevice,this.settings.interface.interfaceNumber,3,6);
  return {status:data.getUint8(0),state:data.getUint8(4),pollTimeout:data.getUint8(1)|(data.getUint8(2)<<8)|(data.getUint8(3)<<16)};
 },
 clearStatus(){return requestOut(this.selectedDevice,this.settings.interface.interfaceNumber,4);}
};
export const transport={methods,webusb:{requestIn,requestOut,readDeviceConfigurationDescriptor,closeSession}};
