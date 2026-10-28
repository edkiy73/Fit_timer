/** A small QR encoder (ISO/IEC 18004: byte mode, error correction M, versions 1–20, the best of the eight masks),
 * so an authenticator key becomes a picture without a library or an outside QR service. Returns the module grid
 * (true = dark), without the quiet zone. The algorithm follows the well-known reference by Project Nayuki (MIT). */

const ECC_PER_BLOCK=[-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26];
const BLOCKS=[-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16];
const MAX_VERSION=20;

function rawModules(ver:number){
 let r=(16*ver+128)*ver+64;
 if(ver>=2){const n=Math.floor(ver/7)+2;r-=(25*n-10)*n-55;if(ver>=7)r-=36;}
 return r;
}
const dataCodewords=(ver:number)=>Math.floor(rawModules(ver)/8)-ECC_PER_BLOCK[ver]!*BLOCKS[ver]!;

function gfMul(x:number,y:number){let z=0;for(let i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11d);z^=((y>>>i)&1)*x;}return z&0xff;}
function rsDivisor(degree:number){
 const r=new Array<number>(degree).fill(0);r[degree-1]=1;let root=1;
 for(let i=0;i<degree;i++){for(let j=0;j<r.length;j++){r[j]=gfMul(r[j]!,root);if(j+1<r.length)r[j]!^=r[j+1]!;}root=gfMul(root,2);}
 return r;
}
function rsRemainder(data:number[],div:number[]){
 const r=div.map(()=>0);
 for(const b of data){const f=b^r.shift()!;r.push(0);div.forEach((c,i)=>{r[i]!^=gfMul(c,f);});}
 return r;
}

function alignment(ver:number,size:number){
 if(ver===1)return [] as number[];
 const n=Math.floor(ver/7)+2;const step=Math.ceil((ver*4+4)/(n*2-2))*2;const r=[6];
 for(let pos=size-7;r.length<n;pos-=step)r.splice(1,0,pos);
 return r;
}

const bit=(x:number,i:number)=>((x>>>i)&1)!==0;
const MASKS:((x:number,y:number)=>boolean)[]=[
 (x,y)=>(x+y)%2===0,(_x,y)=>y%2===0,(x)=>x%3===0,(x,y)=>(x+y)%3===0,
 (x,y)=>(Math.floor(x/3)+Math.floor(y/2))%2===0,(x,y)=>x*y%2+x*y%3===0,(x,y)=>(x*y%2+x*y%3)%2===0,(x,y)=>((x+y)%2+x*y%3)%2===0,
];

export function qrMatrix(text:string):boolean[][]{
 const bytes=[...new TextEncoder().encode(text)];
 let ver=1;
 for(;ver<=MAX_VERSION;ver++){const cc=ver<=9?8:16;if(4+cc+bytes.length*8<=dataCodewords(ver)*8)break;}
 if(ver>MAX_VERSION)throw new Error('qr_too_long');
 // Data bits: byte mode, count, the bytes, terminator, padding.
 const bits:number[]=[];const put=(v:number,n:number)=>{for(let i=n-1;i>=0;i--)bits.push((v>>>i)&1);};
 put(4,4);put(bytes.length,ver<=9?8:16);for(const b of bytes)put(b,8);
 const cap=dataCodewords(ver)*8;
 put(0,Math.min(4,cap-bits.length));put(0,(8-bits.length%8)%8);
 for(let pad=0xec;bits.length<cap;pad^=0xec^0x11)put(pad,8);
 const data:number[]=[];for(let i=0;i<bits.length;i+=8)data.push(parseInt(bits.slice(i,i+8).join(''),2));
 // Error correction per block, then interleaved.
 const nb=BLOCKS[ver]!,ecLen=ECC_PER_BLOCK[ver]!,raw=Math.floor(rawModules(ver)/8);
 const nShort=nb-raw%nb,shortLen=Math.floor(raw/nb),div=rsDivisor(ecLen);
 const blocks:number[][]=[];
 for(let i=0,k=0;i<nb;i++){
  const dat=data.slice(k,k+shortLen-ecLen+(i<nShort?0:1));k+=dat.length;
  const ecc=rsRemainder(dat,div);if(i<nShort)dat.push(0);blocks.push(dat.concat(ecc));
 }
 const words:number[]=[];
 for(let i=0;i<blocks[0]!.length;i++)blocks.forEach((b,j)=>{if(i!==shortLen-ecLen||j>=nShort)words.push(b[i]!);});

 const size=ver*4+17;
 const m:boolean[][]=Array.from({length:size},()=>new Array<boolean>(size).fill(false));
 const fn:boolean[][]=Array.from({length:size},()=>new Array<boolean>(size).fill(false));
 const set=(x:number,y:number,v:boolean)=>{m[y]![x]=v;fn[y]![x]=true;};
 for(let i=0;i<size;i++){set(6,i,i%2===0);set(i,6,i%2===0);}
 for(const [cx,cy] of [[3,3],[size-4,3],[3,size-4]] as const)
  for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const d=Math.max(Math.abs(dx),Math.abs(dy));const x=cx+dx,y=cy+dy;if(x>=0&&x<size&&y>=0&&y<size)set(x,y,d!==2&&d!==4);}
 const al=alignment(ver,size);
 al.forEach((a,i)=>al.forEach((b,j)=>{
  if((i===0&&j===0)||(i===0&&j===al.length-1)||(i===al.length-1&&j===0))return;
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(a+dx,b+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);
 }));
 const format=(mask:number)=>{
  const d=(0<<3)|mask;let rem=d;for(let i=0;i<10;i++)rem=(rem<<1)^((rem>>>9)*0x537);
  const f=((d<<10)|rem)^0x5412;
  for(let i=0;i<=5;i++)set(8,i,bit(f,i));
  set(8,7,bit(f,6));set(8,8,bit(f,7));set(7,8,bit(f,8));
  for(let i=9;i<15;i++)set(14-i,8,bit(f,i));
  for(let i=0;i<8;i++)set(size-1-i,8,bit(f,i));
  for(let i=8;i<15;i++)set(8,size-15+i,bit(f,i));
  set(8,size-8,true);
 };
 format(0);
 if(ver>=7){
  let rem=ver;for(let i=0;i<12;i++)rem=(rem<<1)^((rem>>>11)*0x1f25);
  const v=(ver<<12)|rem;
  for(let i=0;i<18;i++){const b=bit(v,i),a=size-11+i%3,c=Math.floor(i/3);set(a,c,b);set(c,a,b);}
 }
 // Codewords in the zigzag.
 let i=0;
 for(let right=size-1;right>=1;right-=2){
  if(right===6)right=5;
  for(let vert=0;vert<size;vert++)for(let j=0;j<2;j++){
   const x=right-j,up=((right+1)&2)===0,y=up?size-1-vert:vert;
   if(!fn[y]![x]&&i<words.length*8){m[y]![x]=bit(words[i>>>3]!,7-(i&7));i++;}
  }
 }
 const masked=(mask:number)=>{const out=m.map(r=>r.slice());const f=MASKS[mask]!;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(!fn[y]![x]&&f(x,y))out[y]![x]=!out[y]![x];return out;};
 let best:boolean[][]|null=null,bestScore=Infinity,bestMask=0;
 for(let k=0;k<8;k++){format(k);const g=masked(k);const s=penalty(g);if(s<bestScore){bestScore=s;best=g;bestMask=k;}}
 format(bestMask);
 // The format bits are function modules: copy them into the chosen grid.
 for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(fn[y]![x])best![y]![x]=m[y]![x]!;
 return best!;
}

function penalty(g:boolean[][]){
 const n=g.length;let s=0;
 const lines=[...g.map(r=>r),...g.map((_,x)=>g.map(r=>r[x]!))];
 for(const line of lines){
  let run=1;
  for(let i=1;i<=n;i++){if(i<n&&line[i]===line[i-1])run++;else{if(run>=5)s+=3+run-5;run=1;}}
  const str=line.map(v=>v?'1':'0').join('');
  for(const p of ['10111010000','00001011101'])for(let at=str.indexOf(p);at>=0;at=str.indexOf(p,at+1))s+=40;
 }
 for(let y=0;y<n-1;y++)for(let x=0;x<n-1;x++){const c=g[y]![x];if(c===g[y]![x+1]&&c===g[y+1]![x]&&c===g[y+1]![x+1])s+=3;}
 const dark=g.reduce((a,r)=>a+r.filter(Boolean).length,0),total=n*n;
 s+=(Math.ceil(Math.abs(dark*20-total*10)/total)-1)*10;
 return s;
}
