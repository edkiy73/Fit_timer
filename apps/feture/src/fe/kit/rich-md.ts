/** Markdown ⇄ editor DOM for `RichEditor` (owner 28.10.2026: «он сразу и отформатированный показывает»).
 * The stored text stays the same safe Markdown `RichText` shows and the server checks: **bold**, *italic*, ~~strike~~,
 * `code`, [links](https://…), lists, quotes, `## headings` and, in articles, `![](media:<id>)` pictures of the post's own
 * media. The DOM is always built with createElement/textContent — never innerHTML — and turning it back keeps only these
 * marks: anything else (pasted or browser-made) becomes its plain text. */

/** A link a post may carry: http(s) with a real host (the same rule RichText follows when it shows one). */
export function linkOk(url:string){
 if(!/^https?:\/\/[^\s()<>"']{1,400}$/i.test(url))return false;
 try{const u=new URL(url);return /\.[a-z]{2,}$/i.test(u.hostname)||u.hostname==='localhost';}catch{return false;}
}

/** One picture line of an article: `![alt](media:<uuid>)`. */
export const MEDIA_LINE=/^!\[([^\]\n]{0,120})\]\(media:([0-9a-f-]{36})\)$/;

const INLINE=/(`[^`\n]+`)|(\[[^\]\n]{1,120}\]\(https?:\/\/[^\s()<>"']{1,400}\))|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(~~[^~\n]+~~)|((?:^|(?<=[\s(]))[*_][^*_\n]+[*_](?=$|[\s).,!?:;]))|((?:^|(?<=[\s(]))@[a-z0-9_.]{2,30})/gi;

function inline(doc:Document,parent:Node,s:string){
 let last=0;
 for(const m of s.matchAll(INLINE)){
  const i=m.index??0;if(i>last)parent.appendChild(doc.createTextNode(s.slice(last,i)));const v=m[0];
  if(m[1]){const c=doc.createElement('code');c.textContent=v.slice(1,-1);parent.appendChild(c);}
  else if(m[2]){const mm=/^\[([^\]]+)\]\(([^)]+)\)$/.exec(v)!;const a=doc.createElement('a');a.setAttribute('href',mm[2]!);a.textContent=mm[1]!;parent.appendChild(a);}
  else if(m[3]){const b=doc.createElement('b');inline(doc,b,v.slice(2,-2));parent.appendChild(b);}
  else if(m[4]){const x=doc.createElement('s');inline(doc,x,v.slice(2,-2));parent.appendChild(x);}
  else if(m[5]){const x=doc.createElement('i');inline(doc,x,v.slice(1,-1));parent.appendChild(x);}
  // An @nick is drawn like a link in the editor; the stored text stays the plain «@nick» (domToMd keeps only the words).
  else if(m[6]){const x=doc.createElement('span');x.className='mention';x.textContent=v;parent.appendChild(x);}
  last=i+v.length;
 }
 if(last<s.length)parent.appendChild(doc.createTextNode(s.slice(last)));
}
const withBreaks=(doc:Document,el:HTMLElement,lines:string[])=>{lines.forEach((l,i)=>{if(i)el.appendChild(doc.createElement('br'));inline(doc,el,l);});return el;};

/** «@nick» (with the space after it) as the editor draws a picked mention: the coloured word and the space to go on typing in. */
export function mentionNodes(doc:Document,text:string):Node[]|null{
 if(!/^@[a-z0-9_.]{2,30} ?$/i.test(text))return null;const x=doc.createElement('span');x.className='mention';x.textContent=text.trim();
 return [x,doc.createTextNode(text.endsWith(' ')?'\u00a0':'')];
}

export type ImageSrc=(id:string)=>string|null|undefined;
/** The editor's picture block: not editable inside, removed by its ✕ or with Backspace. */
export function imageBlock(doc:Document,id:string,src:string|null|undefined,removeLabel:string){
 const f=doc.createElement('figure');f.className='rte-img';f.contentEditable='false';f.dataset.media=id;
 const img=doc.createElement('img');img.alt='';img.draggable=false;if(src)img.src=src;f.appendChild(img);
 const rm=doc.createElement('button');rm.type='button';rm.className='rte-img-rm';rm.dataset.rm='1';rm.setAttribute('aria-label',removeLabel);rm.title=removeLabel;
 // Lucide «x» drawn in place (the block lives outside React).
 const ns='http://www.w3.org/2000/svg';const svg=doc.createElementNS(ns,'svg');
 for(const [k,v] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'2','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(k,v);
 for(const d of ['M18 6 6 18','m6 6 12 12']){const p=doc.createElementNS(ns,'path');p.setAttribute('d',d);svg.appendChild(p);}
 rm.appendChild(svg);f.appendChild(rm);return f;
}

/** Markdown → the editor's blocks (appended to `root`, which is emptied first). */
export function mdToDom(root:HTMLElement,md:string,opts:{src?:ImageSrc,removeLabel?:string}={}){
 const doc=root.ownerDocument;while(root.firstChild)root.removeChild(root.firstChild);
 const lines=md.replace(/\r\n?/g,'\n').split('\n');let para:string[]=[];let list:HTMLElement|null=null;
 const flushP=()=>{if(para.length){root.appendChild(withBreaks(doc,doc.createElement('p'),para));para=[];}};
 const flushL=()=>{list=null;};
 for(let i=0;i<lines.length;i++){const l=lines[i]!;let m:RegExpMatchArray|null;
  if(!l.trim()){flushP();flushL();continue;}
  if((m=l.trim().match(MEDIA_LINE))){flushP();flushL();root.appendChild(imageBlock(doc,m[2]!,opts.src?.(m[2]!),opts.removeLabel??'×'));continue;}
  if(/^\\([-*]|\d+[.)]|>|#{1,3})\s/.test(l)){flushL();para.push(l.slice(1));continue;}
  if((m=l.match(/^\s*[-*]\s+(.*)/))||(m=l.match(/^\s*\d+[.)]\s+(.*)/))){const tag=/^\s*\d/.test(l)?'OL':'UL';flushP();
   if(!list||list.tagName!==tag){list=doc.createElement(tag.toLowerCase());root.appendChild(list);}
   const li=doc.createElement('li');inline(doc,li,m[1]!);list.appendChild(li);continue;}
  flushL();
  if((m=l.match(/^>\s?(.*)/))){flushP();const q=[m[1]!];while(i+1<lines.length&&/^>/.test(lines[i+1]!))q.push(lines[++i]!.replace(/^>\s?/,''));
   root.appendChild(withBreaks(doc,doc.createElement('blockquote'),q));continue;}
  if((m=l.match(/^#{1,3}\s+(.*)/))){flushP();const h=doc.createElement('h4');inline(doc,h,m[1]!);root.appendChild(h);continue;}
  para.push(l);
 }
 flushP();
}

/** The editor's DOM → Markdown. Only the marks above survive; everything else becomes its text. */
export function domToMd(root:Node):string{
 const wrap=(mk:string,x:string)=>{const t=x.match(/^(\s*)([\s\S]*?)(\s*)$/)!;return t[2]?`${t[1]}${mk}${t[2]}${mk}${t[3]}`:x;};
 const txt=(s:string)=>s.replace(/\u00a0/g,' ');
 const inl=(n:Node):string=>[...n.childNodes].map(c=>{if(c.nodeType===3)return txt(c.nodeValue??'');if(c.nodeType!==1)return '';const el=c as HTMLElement;const g=el.tagName;
  if(g==='FIGURE'||g==='BUTTON')return '';const x=inl(el);
  if(g==='BR')return '\n';if(g==='B'||g==='STRONG')return wrap('**',x);if(g==='I'||g==='EM')return wrap('*',x);if(g==='S'||g==='STRIKE'||g==='DEL')return wrap('~~',x);
  if(g==='CODE')return x?'`'+x.replace(/`/g,'')+'`':'';
  if(g==='A'){const h=el.getAttribute('href')??'';const w=x.replace(/[[\]\n]/g,' ').trim();return linkOk(h)&&w?`[${w}](${h})`:x;}
  if(g==='DIV'||g==='P'||g==='LI')return '\n'+x;return x;}).join('');
 const lines=(s:string)=>s.replace(/^\n+|\n+$/g,'').split('\n');const out:string[]=[];let run='';
 // A plain line that only looks like markup («- », «1. », «> », «## », a picture mark) stays literal with a backslash.
 const esc1=(l:string)=>/^\s*([-*]|\d+[.)]|>|#{1,3})\s/.test(l)?'\\'+l.replace(/^\s+/,''):l.trim().match(MEDIA_LINE)?'\\'+l:l;
 const flush=()=>{if(run.trim())out.push(lines(run).map(esc1).join('\n'));run='';};
 const BLK=/^(P|DIV|H[1-6]|BLOCKQUOTE|UL|OL|FIGURE)$/;
 const walk=(node:Node)=>[...node.childNodes].forEach(c=>{const g=c.nodeType===1?(c as HTMLElement).tagName:'';
  if((g==='P'||g==='DIV'||g==='BLOCKQUOTE')&&[...(c as HTMLElement).children].some(x=>x.tagName==='FIGURE')){flush();walk(c);flush();return;}
  if((g==='P'||g==='DIV')&&[...(c as HTMLElement).children].some(x=>BLK.test(x.tagName))){flush();walk(c);flush();return;}
  if(!g||!BLK.test(g)){run+=c.nodeType===3?txt(c.nodeValue??''):g==='BR'?'\n':inl({childNodes:[c]} as unknown as Node);return;}
  flush();const el=c as HTMLElement;
  if(g==='FIGURE'){const id=el.dataset.media;if(id&&/^[0-9a-f-]{36}$/.test(id))out.push(`![](media:${id})`);}
  else if(/^H/.test(g)){const t=inl(el).replace(/\n/g,' ').trim();if(t)out.push('## '+t);}
  else if(g==='BLOCKQUOTE'){const t=lines(inl(el)).filter(x=>x.trim());if(t.length)out.push(t.map(x=>'> '+x).join('\n'));}
  else if(g==='UL'||g==='OL'){const it=[...el.children].filter(x=>x.tagName==='LI').map(x=>inl(x).replace(/\n/g,' ').trim()).filter(Boolean);if(it.length)out.push(it.map((x,k)=>(g==='OL'?`${k+1}. `:'- ')+x).join('\n'));}
  else{const t=lines(inl(el)).map(esc1).join('\n');if(t.trim())out.push(t);}});
 walk(root);flush();return out.join('\n\n').trim();
}

/** Client mirror of the server's text rules (contracts/me.mjs `text`, contracts/posts.mjs `hasLongWord`), so a form says
 * what is wrong before sending. The server stays the authority. */
export const BAD_CHARS=/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩​-‏﻿]/;
export const LONG_WORD=120;
export const hasLongWord=(v:string)=>v.replace(/!?\[[^\]\n]{0,120}\]\([^)\s]{1,420}\)/g,' ').replace(/https?:\/\/\S+/g,' ').split(/\s+/).some(w=>[...w].length>LONG_WORD);

/** Ids of the pictures an article's text shows, in order (the server's `mediaRefs`). */
export const mdImages=(md:string)=>[...md.matchAll(/!\[[^\]\n]{0,120}\]\(media:([0-9a-f-]{36})\)/g)].map(m=>m[1]!);
