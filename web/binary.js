// Standalone byte helpers; no network, USB or HID access.
export async function sha256(data){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function crc32(data){let crc=0xffffffff;for(const b of data){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
export async function inflate(data,format,limit){
 const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream(format)).getReader();
 const parts=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw Error('압축 해제 크기 제한 초과');parts.push(value);}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}
 const output=new Uint8Array(size);let offset=0;for(const part of parts){output.set(part,offset);offset+=part.length;}return output;
}
export async function unzipDfuEntries(buffer,depth=0,budget={bytes:0}){
 if(depth>3||buffer.byteLength>32*1024*1024)throw Error('ZIP 크기/중첩 제한 초과');
 const bytes=new Uint8Array(buffer),view=new DataView(buffer),n=bytes.length;
 let end=-1;
 for(let i=n-22;i>=Math.max(0,n-65557);i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===n){end=i;break;}
 if(end<0)throw Error('ZIP 끝 기록 없음');
 const count=view.getUint16(end+10,true),centralSize=view.getUint32(end+12,true),central=view.getUint32(end+16,true);
 if(view.getUint16(end+4,true)||view.getUint16(end+6,true)||view.getUint16(end+8,true)!==count||count>64||central+centralSize!==end)throw Error('지원하지 않는 ZIP 구조');
 const result=[];let cursor=central;
 for(let i=0;i<count;i++){
  if(cursor+46>end||view.getUint32(cursor,true)!==0x02014b50)throw Error('잘못된 ZIP 항목');
  const flags=view.getUint16(cursor+8,true),method=view.getUint16(cursor+10,true),crc=view.getUint32(cursor+16,true),compressed=view.getUint32(cursor+20,true),size=view.getUint32(cursor+24,true);
  const nameSize=view.getUint16(cursor+28,true),extra=view.getUint16(cursor+30,true),comment=view.getUint16(cursor+32,true),offset=view.getUint32(cursor+42,true);
  if(flags&1||![0,8].includes(method)||cursor+46+nameSize+extra+comment>end||offset+30>central)throw Error('지원하지 않는 ZIP 항목');
  const name=new TextDecoder().decode(bytes.subarray(cursor+46,cursor+46+nameSize));
  if(name.startsWith('/')||name.includes('\\')||name.split('/').includes('..'))throw Error('잘못된 ZIP 경로');
  if(view.getUint32(offset,true)!==0x04034b50||view.getUint16(offset+8,true)!==method||view.getUint16(offset+6,true)!==flags)throw Error('ZIP 헤더 불일치');
  const localName=view.getUint16(offset+26,true),start=offset+30+localName+view.getUint16(offset+28,true);
  if(new TextDecoder().decode(bytes.subarray(offset+30,offset+30+localName))!==name||start+compressed>central)throw Error('ZIP 데이터 범위 오류');
  cursor+=46+nameSize+extra+comment;
  if(name.endsWith('/'))continue;
  budget.bytes+=size;if(budget.bytes>32*1024*1024)throw Error('ZIP 압축 해제 크기 제한 초과');
  const packed=bytes.subarray(start,start+compressed),data=method===0?packed.slice():await inflate(packed,'deflate-raw',size);
  if(data.byteLength!==size||crc32(data)!==crc)throw Error('ZIP 체크섬 불일치');
  if(name.toLowerCase().endsWith('.dfu'))result.push({name,data:data.buffer});
  else if(name.toLowerCase().endsWith('.zip'))result.push(...await unzipDfuEntries(data.buffer,depth+1,budget));
 }
 if(cursor!==end)throw Error('ZIP 항목 길이 불일치');
 return result;
}
export async function applyDelta(source,compressed,expectedSize){
 if(!Number.isInteger(expectedSize)||expectedSize<1||expectedSize>25*1024*1024)throw Error('잘못된 패치 출력 크기');
 const raw=await inflate(compressed,'deflate',64*1024*1024),view=new DataView(raw.buffer);
 if(raw.length<8||new TextDecoder().decode(raw.subarray(0,4))!=='RNP1'||view.getUint32(4,true)!==expectedSize)throw Error('패치 헤더 불일치');
 const input=new Uint8Array(source),output=new Uint8Array(expectedSize);let cursor=8,written=0;
 while(cursor<raw.length){
  const op=raw[cursor++];let length,part;
  if(op===0){
   if(cursor+8>raw.length)throw Error('잘린 COPY 명령');
   const offset=view.getUint32(cursor,true);length=view.getUint32(cursor+4,true);cursor+=8;
   if(offset+length>input.length)throw Error('COPY 범위 오류');part=input.subarray(offset,offset+length);
  }else if(op===1){
   if(cursor+4>raw.length)throw Error('잘린 ADD 명령');length=view.getUint32(cursor,true);cursor+=4;
   if(cursor+length>raw.length)throw Error('ADD 범위 오류');part=raw.subarray(cursor,cursor+length);cursor+=length;
  }else throw Error('알 수 없는 패치 명령');
  if(!length||written+length>output.length)throw Error('패치 출력 범위 오류');output.set(part,written);written+=length;
 }
 if(written!==output.length)throw Error('패치 출력 길이 불일치');return output.buffer;
}
