import {useCallback,useEffect,useMemo,useState} from 'react';
import {useNavigate,useParams,useSearchParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Check,ChevronLeft,ChevronRight,Globe,Image as ImageIcon,Images,MoreHorizontal,Pencil,Plus,Trash2,Users,X} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {AddCard,AlbumCard,AlbumMeta,AlbumRow,Ask,Btn,Card,Counter,Empty,Field,GalleryAdd,GalleryGrid,GalleryTile,Group,IconBtn,Input,Note,Row,SelectRow,SelectionBar,Sheet,Skel,SubBar,View} from './kit';
import {FIELD,serverFields,softMax,textError,textErrorMessage,textLength} from './kit/validate';
import {useFe} from './session';
import {useToast} from './toast';
import {useHideDock} from './dock';
import type {Post} from './feed';

/** V21 P20 «Галерея» and the album pieces used around it (wave 5): album cards filter the grid; an own gallery adds
 * «+ Добавить», new albums, the album menu (who sees it, order, cover, left / right, rename, delete with «Вернуть»)
 * and the selection mode (to an album, who sees it, to the profile, delete). The post menu's «Альбом в галерее»
 * (PostAlbumSheet) and the composer's album row (AlbumField) live here too. The server decides everything
 * (contracts/gallery.mjs); the client only asks first where the server would narrow posts. */

const media=z.object({id:z.uuid(),src:z.record(z.string(),z.string()).nullable(),pending:z.boolean().optional()}).passthrough();
const album=z.object({id:z.uuid(),title:z.string(),visibility:z.enum(['all','followers']),sort:z.enum(['new','old']),position:z.number(),count:z.number(),
 cover:media.nullable(),coverPostId:z.uuid().nullable().optional()});
export type Album=z.infer<typeof album>;
export const albumsRes=z.object({ok:z.literal(true),own:z.boolean(),items:z.array(album)});
const tile=z.object({postId:z.uuid(),media,count:z.number(),publishedAt:z.string(),audience:z.string().optional(),albumId:z.uuid().nullable().optional()});
export type Tile=z.infer<typeof tile>;
export const galleryRes=z.object({ok:z.literal(true),items:z.array(tile),next:z.string().nullable()});
const created=z.object({ok:z.literal(true),album}).passthrough();
const updated=z.object({ok:z.literal(true),album:album.optional(),narrowed:z.number().optional()}).passthrough();
const deletedRes=z.object({ok:z.literal(true),deleted:z.uuid(),postIds:z.array(z.uuid()),
 album:z.object({title:z.string(),visibility:z.enum(['all','followers']),sort:z.enum(['new','old']),position:z.number(),coverPostId:z.uuid().nullable()})});
const bulkRes=z.object({ok:z.literal(true),moved:z.number().optional(),narrowed:z.number().optional(),review:z.number().optional(),pending:z.array(z.string()).optional(),
 deleted:z.number().optional(),archived:z.number().optional(),added:z.number().optional(),skipped:z.number().optional(),full:z.boolean().optional()}).passthrough();
const setAlbumRes=z.object({ok:z.literal(true),audience:z.string(),rev:z.number()}).passthrough();
const okRes=z.object({ok:z.literal(true)}).passthrough();
const profileRes=z.object({ok:z.literal(true),profile:z.object({id:z.uuid(),handle:z.string().nullable(),name:z.string().nullable(),
 photos:z.array(media.extend({postId:z.uuid().optional()}))}).passthrough()});

type Call=ReturnType<typeof useFe>['call'];
export const tileSrc=(m:{src:Record<string,string>|null}|null|undefined,size:'thumb'|'card'='card')=>m?.src?(m.src[size]??m.src.card??m.src.thumb??null):null;
const nameOf=(a:{name?:string|null,handle?:string|null}|null|undefined)=>a?.name||(a?.handle?'@'+a.handle:'');
/** Every page of a gallery (or an album) up to `pages` × 30 posts: the album operations need the whole album. */
export async function galleryAll(call:Call,profileId:string,albumId?:string|null,pages=5):Promise<Tile[]>{
 const out:Tile[]=[];let cursor:string|null=null;
 for(let i=0;i<pages;i++){const r:z.infer<typeof galleryRes>=await call('gallery.list',{profileId,...(albumId?{albumId}:{}),...(cursor?{cursor}:{})},galleryRes);out.push(...r.items);cursor=r.next;if(!cursor)break;}
 return out;
}
/** Which album an own post is in, when the post itself does not say (older answers): looked up in the own gallery. */
export async function albumOfPost(call:Call,profileId:string,postId:string):Promise<string|null|undefined>{
 let cursor:string|null=null;
 for(let i=0;i<5;i++){const r:z.infer<typeof galleryRes>=await call('gallery.list',{profileId,...(cursor?{cursor}:{})},galleryRes);
  const hit=r.items.find(x=>x.postId===postId);if(hit)return hit.albumId??null;cursor=r.next;if(!cursor)return undefined;}
 return undefined;
}
const sameTitle=(albums:Album[],title:string,except?:string)=>albums.some(a=>a.id!==except&&a.title.trim().toLowerCase()===title.trim().toLowerCase());

/* ---------- name sheet: new album / rename ---------- */

/** `galAlbumNew` / `galAlbumRename`: the name field (40), «Создать» / «Сохранить»; an empty or repeated name is
 * explained under the field. `save` throws a FeError for the server's answer. */
function AlbumNameSheet({title,cta,initial='',albums,except,save,onClose}:{title:string,cta:string,initial?:string,albums:Album[],except?:string|undefined,
 save:(name:string)=>Promise<void>,onClose:()=>void}){
 const {t}=useI18n();const [name,setName]=useState(initial);const [err,setErr]=useState('');const [busy,setBusy]=useState(false);
 const go=async()=>{
  const v=name.trim();if(busy)return;
  if(!v){setErr(t('fe.gal.nameEmpty'));return;}
  const bad=textError(t,'albumTitle',v);if(bad){setErr(bad);return;}
  if(sameTitle(albums,v,except)){setErr(t('fe.gal.nameDup'));return;}
  setBusy(true);setErr('');
  try{await save(v);}
  catch(e){setErr(e instanceof FeError&&e.rule==='duplicate'?t('fe.gal.nameDup'):e instanceof FeError&&e.rule==='album_limit'?t('fe.gal.limit'):serverFields(e).some(f=>f.path==='title')?textErrorMessage(t,serverFields(e)[0]!.code,FIELD.albumTitle):feErrorMessage(e,t));}
  finally{setBusy(false);}
 };
 return <Sheet title={title} onClose={onClose} foot={<Btn onClick={go} busy={busy} disabled={busy}>{cta}</Btn>}>
  <Field id="albumName" name="albumName" label={t('fe.gal.name')} error={err||undefined}>
   <Input id="albumName" value={name} maxLength={softMax('albumTitle')} onBlur={()=>{if(name.trim())setErr(textError(t,'albumTitle',name)??'');}} autoFocus autoComplete="off" invalid={!!err} placeholder={t('fe.gal.namePh')}
    onChange={e=>{setName(e.target.value);setErr('');}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void go();}}}/>
   <Counter n={textLength(name)} max={FIELD.albumTitle.max}/>
  </Field>
 </Sheet>;
}

/** «Новый альбом»: creates it and hands it over (the caller says what happened). */
export function NewAlbumSheet({albums,onClose,onCreated}:{albums:Album[],onClose:()=>void,onCreated:(a:Album)=>void|Promise<void>}){
 const {call}=useFe();const {t}=useI18n();
 return <AlbumNameSheet title={t('fe.gal.new')} cta={t('fe.gal.create')} albums={albums} onClose={onClose}
  save={async name=>{const r=await call('album.create',{opId:newOpId(),title:name},created);onClose();await onCreated(r.album);}}/>;
}

/** The list of albums to put something in: «Без альбома», the albums, «Новый альбом…». */
function AlbumPickSheet({title,albums,current,onPick,onNew,onClose,busy}:{title:string,albums:Album[],current?:string|null|undefined,onPick:(id:string|null)=>void,
 onNew:()=>void,onClose:()=>void,busy?:boolean|undefined}){
 const {t}=useI18n();
 return <Sheet title={title} onClose={onClose}><Card list>
  {[[null,t('fe.gal.noAlbum')] as const,...albums.map(a=>[a.id,a.title] as const)].map(([id,name])=>
   <Row key={id??'none'} noChev icon={current!==undefined&&(current??null)===id?Check:ImageIcon} {...(current!==undefined?{pressed:(current??null)===id}:{})}
    title={name} sub={id&&albums.find(a=>a.id===id)?.visibility==='followers'?t('fe.gal.followersOnly'):undefined} disabled={!!busy} onClick={()=>onPick(id)}/>)}
  <Row noChev icon={Plus} title={t('fe.gal.newDots')} disabled={!!busy} onClick={onNew}/>
 </Card></Sheet>;
}

/* ---------- P20 gallery ---------- */

type SheetKind='menu'|'cover'|'rename'|'new'|'pick'|'newSel'|'aud'|null;
type AskKind='visFollowers'|'visAll'|'delete'|'selDelete'|{narrow:string|null,n:number}|null;

export function GalleryScreen(){
 const {id=''}=useParams();const [params,setParams]=useSearchParams();const asked=params.get('a');
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();const toast=useToast();
 const [p,setP]=useState<z.infer<typeof profileRes>['profile']|null>(null);
 const [albums,setAlbums]=useState<{own:boolean,items:Album[]}|null>(null);
 const [all,setAll]=useState<z.infer<typeof galleryRes>|null>(null);
 const [inAlbum,setInAlbum]=useState<z.infer<typeof galleryRes>|null>(null);
 const [error,setError]=useState<unknown>(null);const [tick,setTick]=useState(0);
 const [sel,setSel]=useState<Set<string>|null>(null);const [sheet,setSheet]=useState<SheetKind>(null);const [ask,setAsk]=useState<AskKind>(null);
 useHideDock(sel!==null); // the selection mode keeps its own bar at the bottom: no dock under it (V21 SC.P20 dock:false)
 const [busy,setBusy]=useState(false);const [more,setMore]=useState(false);
 const reload=useCallback(()=>setTick(n=>n+1),[]);
 useEffect(()=>{
  let live=true;setError(null);
  Promise.all([call('profile.get',{profileId:id},profileRes),call('album.list',{profileId:id},albumsRes),call('gallery.list',{profileId:id},galleryRes)])
   .then(([pr,al,g])=>{if(!live)return;setP(pr.profile);setAlbums({own:al.own,items:al.items});setAll(g);}).catch(e=>{if(live)setError(e);});
  return ()=>{live=false;};
 },[call,id,tick]);
 // An album that is gone (deleted, or not for this viewer) shows «Все»; one just made shows as soon as the list has it.
 const cur=albums?.items.find(x=>x.id===asked)??null;const a=cur?cur.id:null;
 useEffect(()=>{
  setInAlbum(null);if(!a)return;let live=true;
  call('gallery.list',{profileId:id,albumId:a},galleryRes).then(r=>{if(live)setInAlbum(r);}).catch(()=>{if(live)setInAlbum({ok:true,items:[],next:null});});
  return ()=>{live=false;};
 },[call,id,a,tick]);
 const open=(albumId:string|null)=>{setSel(null);setParams(albumId?{a:albumId}:{},{replace:true});};
 const own=!!albums?.own;
 const view=a?inAlbum:all;const items=view?.items??[];
 const loadMore=async()=>{
  if(!view?.next||more)return;setMore(true);
  try{const r=await call('gallery.list',{profileId:id,...(a?{albumId:a}:{}),cursor:view.next},galleryRes);
   (a?setInAlbum:setAll)(v=>v?{ok:true,items:[...v.items,...r.items],next:r.next}:r);}
  catch(e){toast(feErrorMessage(e,t),{type:'err'});}finally{setMore(false);}
 };
 const fail=(e:unknown)=>toast(feErrorMessage(e,t),{type:'err'});
 const run=async(fn:()=>Promise<void>)=>{if(busy)return;setBusy(true);try{await fn();}catch(e){fail(e);}finally{setBusy(false);}};
 const picked=items.filter(x=>sel?.has(x.postId));
 const sortLabel=(s:string)=>s==='old'?t('fe.gal.sortOld'):t('fe.gal.sortNew');

 /* album menu */
 const albumUpdate=(patch:Record<string,unknown>)=>call('album.update',{opId:newOpId(),albumId:cur!.id,...patch},updated);
 const setVisibility=(v:'all'|'followers',withPosts:boolean)=>run(async()=>{
  if(!cur)return;
  const r=await albumUpdate({visibility:v,...(v==='followers'?{confirm:true}:{})});
  let review=0,waits=0;
  if(v==='all'&&withPosts){
   const closed=(await galleryAll(call,id,cur.id)).filter(x=>x.audience==='followers').map(x=>x.postId);
   for(let i=0;i<closed.length;i+=50){const b=await call('gallery.bulk',{opId:newOpId(),postIds:closed.slice(i,i+50),change:'audience',audience:'all'},bulkRes);review+=b.review??0;waits+=b.pending?.length??0;}
  }
  setAsk(null);reload();
  toast((v==='followers'?t('fe.gal.visFollowersDone'):t('fe.gal.visAllDone'))+(r.narrowed?'. '+t('fe.gal.narrowedN',{n:r.narrowed}):'')+(review?'. '+t('fe.gal.reviewN',{n:review}):'')+(waits?'. '+t('fe.gal.pendingPartner'):''),{type:'ok'});
 });
 const removeAlbum=()=>run(async()=>{
  if(!cur)return;
  const r=await call('album.delete',{opId:newOpId(),albumId:cur.id},deletedRes);
  setAlbums(v=>v?{...v,items:v.items.filter(x=>x.id!==r.deleted)}:v);setAsk(null);open(null);reload();
  const was=r.album;const postIds=r.postIds;
  toast(t('fe.gal.deleted'),{type:'ok',action:{label:t('fe.gal.restore'),fn:()=>{void (async()=>{
   try{
    // «Вернуть»: the album again with its name, its posts, its settings and its place in the row.
    const c=await call('album.create',{opId:newOpId(),title:was.title},created);
    for(let i=0;i<postIds.length;i+=50)await call('gallery.bulk',{opId:newOpId(),postIds:postIds.slice(i,i+50),change:'album',albumId:c.album.id,confirm:true},bulkRes);
    if(was.visibility!=='all'||was.sort!=='new'||was.coverPostId)
     await call('album.update',{opId:newOpId(),albumId:c.album.id,...(was.visibility!=='all'?{visibility:was.visibility,confirm:true}:{}),...(was.sort!=='new'?{sort:was.sort}:{}),
      ...(was.coverPostId&&postIds.includes(was.coverPostId)?{coverPostId:was.coverPostId}:{})},updated).catch(()=>{});
    const l=await call('album.list',{profileId:id},albumsRes);const order=l.items.map(x=>x.id).filter(x=>x!==c.album.id);
    order.splice(Math.min(was.position,order.length),0,c.album.id);
    if(order.length>1)await call('album.move',{opId:newOpId(),order},okRes).catch(()=>{});
    reload();open(c.album.id);toast(t('fe.gal.restored'),{type:'ok'});
   }catch(e){fail(e);}
  })();}}});
 });
 const move=(direction:'left'|'right')=>run(async()=>{await call('album.move',{opId:newOpId(),albumId:cur!.id,direction},okRes);setSheet(null);reload();});

 /* selection */
 const bulk=(input:Record<string,unknown>)=>call('gallery.bulk',{opId:newOpId(),postIds:picked.map(x=>x.postId),...input},bulkRes);
 const done=(msg:string,o:Parameters<typeof toast>[1]={type:'ok'})=>{setSel(null);setSheet(null);setAsk(null);reload();toast(msg,o);};
 const toAlbum=(albumId:string|null,confirmed=false)=>{
  const target=albums?.items.find(x=>x.id===albumId);
  const wide=target?.visibility==='followers'?picked.filter(x=>x.audience==='all').length:0;
  if(wide&&!confirmed){setSheet(null);setAsk({narrow:albumId,n:wide});return;}
  void run(async()=>{const r=await bulk({change:'album',albumId,...(wide?{confirm:true}:{})});
   done((albumId?t('fe.gal.inAlbumN',{name:target?.title??'',n:r.moved??picked.length}):t('fe.gal.noAlbumN',{n:r.moved??picked.length}))+(r.narrowed?'. '+t('fe.gal.narrowedN',{n:r.narrowed}):''));});
 };
 const setAudience=(v:'all'|'followers')=>{
  const ids=picked.map(x=>x.postId);
  if(v==='all'){
   const closed=picked.filter(x=>albums?.items.find(y=>y.id===x.albumId)?.visibility==='followers');
   if(closed.length){setSheet(null);toast(t('fe.gal.inClosedAlbum',{n:closed.length}),{type:'warn'});return;}
  }
  const prev=picked.filter(x=>x.audience!==v).map(x=>x.postId);
  const fromProfile=v==='followers'?(p?.photos??[]).filter(ph=>ph.postId&&ids.includes(ph.postId)).length:0;
  void run(async()=>{
   const r=await bulk({change:'audience',audience:v});
   const who=v==='all'?t('fe.gal.whoAll'):t('fe.gal.whoFollowers');
   let msg=t('fe.gal.audDone',{who,n:ids.length});
   if(fromProfile)msg+='. '+t('fe.gal.leftProfile',{n:fromProfile});
   if(r.review)msg+='. '+t('fe.gal.reviewN',{n:r.review});
   if(r.pending?.length)msg+='. '+t('fe.gal.pendingPartner');
   done(msg,{type:'ok',...(prev.length?{action:{label:t('fe.gal.undo'),fn:()=>{
    void call('gallery.bulk',{opId:newOpId(),postIds:prev,change:'audience',audience:v==='all'?'followers':'all'},bulkRes)
     .then(u=>{reload();toast(t('fe.gal.undone')+(u.review?'. '+t('fe.gal.reviewN',{n:u.review}):''),{type:'ok'});}).catch(fail);}}}:{})});
  });
 };
 const toProfile=()=>{
  if(!picked.some(x=>x.audience==='all')){toast(t('fe.gal.profileOnlyAll'),{type:'warn'});return;}
  void run(async()=>{const r=await bulk({change:'profile'});
   const msg=r.pending?t('fe.gal.profilePending'):r.full&&!r.added?t('fe.gal.profileFull'):t('fe.gal.profileAdded',{n:r.added??0});
   done(msg+(r.skipped?'. '+t('fe.gal.profileSkipped',{n:r.skipped}):''),{type:r.full&&!r.added?'warn':'ok'});});
 };
 const removeSelected=()=>run(async()=>{const r=await bulk({change:'delete'});done(t('fe.gal.selDeleted',{n:(r.deleted??0)+(r.archived??0)}));});

 const allPics=(all?.items??[]).map(x=>tileSrc(x.media,'thumb')).filter((s):s is string=>!!s);
 const title=t('fe.br.gallery');
 return <>
  <SubBar title={title} sub={p?nameOf(p)||null:null}>
   {own&&items.length>0&&<Btn kind="text" auto pressed={!!sel} onClick={()=>setSel(s=>s?null:new Set())}>{sel?t('fe.gal.done'):t('fe.gal.select')}</Btn>}
   {own&&cur&&!sel&&<IconBtn icon={MoreHorizontal} kind="ghost" label={t('fe.gal.settings')} onClick={()=>setSheet('menu')}/>}
  </SubBar>
  <View {...(sel?{className:'nodock cta1'}:{})}>
   {error?<Empty icon={X} role="alert" title={t('fe.feed.unavailable')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={reload}>{t('fe.retry')}</Btn></Empty>
    :!albums||!all?<Skel kind="list"/>
    :<>
     {(own||albums.items.length>0)&&<AlbumRow label={t('fe.gal.albums')}>
      <AlbumCard title={t('fe.mx.gal.all')} count={all.items.length+(all.next?'+':'')} mosaic={allPics} icon={ImageIcon} on={!a} onClick={()=>open(null)}/>
      {albums.items.map(x=><AlbumCard key={x.id} title={x.title} count={x.count} cover={tileSrc(x.cover,'thumb')} on={a===x.id}
       locked={x.visibility==='followers'?t('fe.gal.followersOnly'):undefined} onClick={()=>open(x.id)}/>)}
      {own&&<AlbumCard title={t('fe.gal.album')} icon={Plus} label={t('fe.gal.new')} onClick={()=>setSheet('new')}/>}
     </AlbumRow>}
     {cur&&own&&<AlbumMeta title={cur.title} followers={cur.visibility==='followers'?t('fe.gal.followersSee'):undefined} order={sortLabel(cur.sort).toLowerCase()}/>}
     {a&&!inAlbum?<Skel kind="list"/>
      :items.length||(own&&!sel)?<GalleryGrid label={cur?.title??title}>
       {own&&!sel&&<GalleryAdd label={t('fe.gal.add')} onClick={()=>navigate('/n/feed/new?x=media'+(a?'&album='+a:''))}/>}
       {items.map((x,i)=>{const on=!!sel?.has(x.postId);
        return <GalleryTile key={x.postId} src={tileSrc(x.media)} label={t('fe.gal.tile',{n:i+1,total:items.length})} count={x.count}
         followers={x.audience==='followers'?t('fe.gal.followersOnly'):undefined} review={x.media.pending?t('fe.br.inReview'):undefined}
         selected={sel?on:undefined} onClick={()=>{if(!sel){navigate('/n/feed/post/'+x.postId);return;}
          setSel(s=>{const n=new Set(s);if(on)n.delete(x.postId);else n.add(x.postId);return n;});}}/>;})}
      </GalleryGrid>
      :<Empty icon={ImageIcon} title={t('fe.gal.empty')}/>}
     {own&&a&&inAlbum&&!items.length&&<Note className="mt12">{t('fe.gal.emptyAlbumHint')}</Note>}
     {view?.next&&<Btn kind="soft" className="mt12" busy={more} disabled={more} onClick={()=>void loadMore()}>{t('fe.gal.more')}</Btn>}
    </>}
  </View>
  {sel&&<SelectionBar status={picked.length?t('fe.gal.selectedN',{n:picked.length}):t('fe.gal.tapToSelect')} actions={[
   {icon:ImageIcon,label:t('fe.gal.toAlbum'),disabled:!picked.length||busy,onClick:()=>setSheet('pick')},
   {icon:Users,label:t('fe.gal.audience'),disabled:!picked.length||busy,onClick:()=>setSheet('aud')},
   {icon:Check,label:t('fe.gal.toProfile'),disabled:!picked.length||busy,onClick:toProfile},
   {icon:Trash2,label:t('fe.gal.delete'),danger:true,disabled:!picked.length||busy,onClick:()=>setAsk('selDelete')}]}/>}

  {sheet==='menu'&&cur&&(()=>{const i=albums!.items.findIndex(x=>x.id===cur.id);const n=albums!.items.length;
   return <Sheet title={cur.title} sub={t('fe.gal.settings')} onClose={()=>setSheet(null)}><Card list>
    <SelectRow row label={t('fe.gal.audience')} value={cur.visibility} disabled={busy} options={[['all',t('fe.gal.visAll')],['followers',t('fe.gal.visFollowers')]] as const}
     onChange={v=>{if(v===cur.visibility)return;setSheet(null);setAsk(v==='followers'?'visFollowers':'visAll');}}/>
    <SelectRow row label={t('fe.gal.order')} value={cur.sort} disabled={busy} options={[['new',t('fe.gal.sortNew')],['old',t('fe.gal.sortOld')]] as const}
     onChange={v=>void run(async()=>{await albumUpdate({sort:v});reload();})}/>
    <Row noChev icon={ImageIcon} title={t('fe.gal.cover')} sub={t('fe.gal.coverSub')} onClick={()=>{if(!cur.count){toast(t('fe.gal.coverEmpty'),{type:'warn'});return;}setSheet('cover');}}/>
    {i>0&&<Row noChev icon={ChevronLeft} title={t('fe.gal.left')} disabled={busy} onClick={()=>move('left')}/>}
    {i<n-1&&<Row noChev icon={ChevronRight} title={t('fe.gal.right')} disabled={busy} onClick={()=>move('right')}/>}
    <Row noChev icon={Pencil} title={t('fe.gal.rename')} onClick={()=>setSheet('rename')}/>
    <Row noChev icon={Trash2} title={t('fe.gal.deleteAlbum')} danger onClick={()=>{setSheet(null);setAsk('delete');}}/>
   </Card></Sheet>;})()}
  {sheet==='cover'&&cur&&<CoverSheet profileId={id} album={cur} onClose={()=>setSheet(null)} onSet={postId=>run(async()=>{
   await albumUpdate({coverPostId:postId});setSheet(null);reload();toast(t('fe.gal.coverDone'),{type:'ok'});})}/>}
  {sheet==='rename'&&cur&&<AlbumNameSheet title={t('fe.gal.renameTitle')} cta={t('fe.me.save')} initial={cur.title} albums={albums?.items??[]} except={cur.id} onClose={()=>setSheet(null)}
   save={async name=>{await call('album.rename',{opId:newOpId(),albumId:cur.id,title:name},okRes);setSheet(null);reload();toast(t('fe.gal.renamed'),{type:'ok'});}}/>}
  {sheet==='new'&&<NewAlbumSheet albums={albums?.items??[]} onClose={()=>setSheet(null)} onCreated={x=>{setAlbums(v=>v?{...v,items:[...v.items,x]}:v);reload();open(x.id);toast(t('fe.gal.created',{name:x.title}),{type:'ok'});}}/>}
  {sheet==='pick'&&<AlbumPickSheet title={t('fe.gal.moveTitle')} albums={albums?.items??[]} busy={busy} onClose={()=>setSheet(null)} onPick={x=>toAlbum(x)} onNew={()=>setSheet('newSel')}/>}
  {sheet==='newSel'&&<NewAlbumSheet albums={albums?.items??[]} onClose={()=>setSheet(null)} onCreated={async x=>{
   setAlbums(v=>v?{...v,items:[...v.items,x]}:v);
   try{const r=await call('gallery.bulk',{opId:newOpId(),postIds:picked.map(y=>y.postId),change:'album',albumId:x.id},bulkRes);
    done(t('fe.gal.createdWith',{name:x.title,n:r.moved??picked.length}));}catch(e){fail(e);reload();}}}/>}
  {sheet==='aud'&&<Sheet title={t('fe.gal.audience')} onClose={()=>setSheet(null)}><Card list>
   <Row noChev icon={Globe} title={t('fe.gal.visAll')} disabled={busy} onClick={()=>setAudience('all')}/>
   <Row noChev icon={Users} title={t('fe.gal.visFollowers')} sub={t('fe.gal.followersProfileNote')} disabled={busy} onClick={()=>setAudience('followers')}/>
  </Card></Sheet>}

  {ask==='visFollowers'&&cur&&<Ask icon={Users} tone="v" title={t('fe.gal.visFollowersQ')} text={t('fe.gal.visFollowersText',{n:cur.count})} ok={t('fe.gal.visFollowersOk')}
   busy={busy} onOk={()=>void setVisibility('followers',true)} onCancel={()=>setAsk(null)}/>}
  {ask==='visAll'&&cur&&<Ask icon={Globe} tone="v" title={t('fe.gal.visAllQ')} text={t('fe.gal.visAllText')} ok={t('fe.gal.visAllOk')} busy={busy}
   alt={{label:t('fe.gal.visAllOnly'),onClick:()=>void setVisibility('all',false)}} onOk={()=>void setVisibility('all',true)} onCancel={()=>setAsk(null)}/>}
  {ask==='delete'&&cur&&<Ask icon={Trash2} tone="l" danger title={t('fe.gal.deleteQ')} text={t('fe.gal.deleteText')} ok={t('fe.gal.delete')} busy={busy}
   onOk={()=>void removeAlbum()} onCancel={()=>setAsk(null)}/>}
  {ask==='selDelete'&&<Ask icon={Trash2} tone="l" danger title={t('fe.gal.selDeleteQ',{n:picked.length})} text={t('fe.gal.selDeleteText')} ok={t('fe.gal.delete')} busy={busy}
   onOk={()=>void removeSelected()} onCancel={()=>setAsk(null)}/>}
  {ask&&typeof ask==='object'&&<Ask icon={Users} tone="v" title={t('fe.gal.narrowQ')} text={t('fe.gal.narrowText',{n:ask.n})} ok={t('fe.gal.narrowOk')} busy={busy}
   onOk={()=>toAlbum(ask.narrow,true)} onCancel={()=>setAsk(null)}/>}
 </>;
}

/** `galAlbumCover`: the album's posts as a grid; the cover is framed; a tap makes another one the cover. */
function CoverSheet({profileId,album:al,onClose,onSet}:{profileId:string,album:Album,onClose:()=>void,onSet:(postId:string)=>void}){
 const {call}=useFe();const {t}=useI18n();const [list,setList]=useState<Tile[]|null>(null);
 useEffect(()=>{galleryAll(call,profileId,al.id).then(setList).catch(()=>setList([]));},[call,profileId,al.id]);
 const coverId=al.cover?.id;
 return <Sheet title={t('fe.gal.coverTitle')} sub={t('fe.gal.coverHint')} onClose={onClose}>
  {!list?<Skel kind="list"/>:<GalleryGrid label={t('fe.gal.coverTitle')}>{list.map((x,i)=>{const on=x.media.id===coverId;
   return <GalleryTile key={x.postId} src={tileSrc(x.media)} label={t('fe.gal.tile',{n:i+1,total:list.length})} picked={on} onClick={()=>{if(!on)onSet(x.postId);}}/>;})}</GalleryGrid>}
 </Sheet>;
}

/* ---------- the gallery block of «Я» ---------- */

/** `galleryOwn20()`: «Все» and the albums as cards (four to a line), «+ Альбом»; empty — one row to the first upload. */
export function MeGallery({profileId,couple,title}:{profileId:string,couple:boolean,title:string}){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();const toast=useToast();
 const [data,setData]=useState<{albums:Album[],all:z.infer<typeof galleryRes>}|null>(null);const [tick,setTick]=useState(0);const [creating,setCreating]=useState(false);
 useEffect(()=>{let live=true;
  Promise.all([call('album.list',{profileId},albumsRes),call('gallery.list',{profileId},galleryRes)]).then(([a,g])=>{if(live)setData({albums:a.items,all:g});}).catch(()=>{if(live)setData({albums:[],all:{ok:true,items:[],next:null}});});
  return ()=>{live=false;};},[call,profileId,tick]);
 const upload=()=>navigate('/n/feed/new?x=media');
 const go=(a?:string)=>navigate(`/n/people/${profileId}/gallery${a?'?a='+a:''}`);
 if(!data)return null;
 const pics=data.all.items.map(x=>tileSrc(x.media,'thumb')).filter((s):s is string=>!!s);
 return <>
  {!data.all.items.length&&!data.albums.length?<Group className="gal20" id="meGal" title={title}>
    <AddCard icon={ImageIcon} title={t('fe.mx.gal.first')} sub={couple?t('fe.mx.gal.firstSubCouple'):t('fe.mx.gal.firstSub')} onClick={upload}/></Group>
   :<Group className="gal20" id="meGal" title={title} action={<button type="button" onClick={upload}>{t('fe.mx.gal.upload')}</button>}><AlbumRow wrap label={t('fe.gal.albums')}>
    <AlbumCard title={t('fe.mx.gal.all')} count={data.all.items.length+(data.all.next?'+':'')} mosaic={pics} icon={ImageIcon} onClick={()=>go()}/>
    {data.albums.map(x=><AlbumCard key={x.id} title={x.title} count={x.count} cover={tileSrc(x.cover,'thumb')} locked={x.visibility==='followers'?t('fe.gal.followersOnly'):undefined} onClick={()=>go(x.id)}/>)}
    <AlbumCard title={t('fe.gal.album')} icon={Plus} label={t('fe.gal.new')} onClick={()=>setCreating(true)}/>
   </AlbumRow></Group>}
  {creating&&<NewAlbumSheet albums={data.albums} onClose={()=>setCreating(false)} onCreated={x=>{setTick(n=>n+1);toast(t('fe.gal.created',{name:x.title}),{type:'ok',action:{label:t('fe.gal.openAlbum'),fn:()=>go(x.id)}});}}/>}
 </>;
}

/* ---------- profile photos from own posts (P02 phToggle) ---------- */

/** The photos of own posts everyone sees: a tap puts one on the profile or takes it off (the editor saves). */
export function PostPhotoPicker({profileId,chosen,onToggle}:{profileId:string,chosen:string[],onToggle:(m:{id:string,src:string|null})=>void}){
 const {call}=useFe();const {t}=useI18n();const [list,setList]=useState<Tile[]|null>(null);
 useEffect(()=>{galleryAll(call,profileId,null,2).then(l=>setList(l.filter(x=>x.audience==='all'&&!x.media.pending))).catch(()=>setList([]));},[call,profileId]);
 if(!list?.length)return null;
 return <Group title={t('fe.gal.fromPosts')} foot={t('fe.gal.fromPostsFoot')}><GalleryGrid label={t('fe.gal.fromPosts')}>{list.map((x,i)=>{const on=chosen.includes(x.media.id);
  return <GalleryTile key={x.postId} src={tileSrc(x.media)} label={t('fe.gal.tile',{n:i+1,total:list.length})} selected={on} onClick={()=>onToggle({id:x.media.id,src:tileSrc(x.media)})}/>;})}</GalleryGrid></Group>;
}

/* ---------- the post menu's «Альбом в галерее» (F05 postAlbum) ---------- */

/** Whether a post may go into an album: own, published, with photos, for everyone or followers, not a discussion. */
export const inGallery=(p:Post)=>p.rev!=null&&(!p.state||p.state==='published')&&p.media.length>0&&(p.audience==='all'||p.audience==='followers'||!p.audience);

export function PostAlbumSheet({post,onClose,onChange}:{post:Post,onClose:()=>void,onChange?:((p:Post)=>void)|undefined}){
 const {call,acting}=useFe();const {t}=useI18n();const toast=useToast();
 const [albums,setAlbums]=useState<Album[]|null>(null);const [current,setCurrent]=useState<string|null|undefined>(post.albumId);
 const [creating,setCreating]=useState(false);const [busy,setBusy]=useState(false);
 useEffect(()=>{if(!acting)return;call('album.list',{profileId:acting.id},albumsRes).then(r=>setAlbums(r.items)).catch(()=>setAlbums([]));
  if(post.albumId===undefined)albumOfPost(call,acting.id,post.id).then(setCurrent).catch(()=>{});},[call,acting,post.id,post.albumId]);
 const put=async(albumId:string|null,msg?:string)=>{
  if(busy)return;setBusy(true);
  const target=albums?.find(a=>a.id===albumId);const narrow=target?.visibility==='followers'&&post.audience!=='followers';
  try{const r=await call('post.setAlbum',{opId:newOpId(),postId:post.id,albumId,...(narrow?{confirm:true}:{})},setAlbumRes);
   onChange?.({...post,albumId,audience:r.audience,rev:r.rev});onClose();
   toast((msg??(albumId?t('fe.gal.postMoved'):t('fe.gal.postOut')))+(narrow?'. '+t('fe.gal.postNarrowed'):''),{type:'ok'});}
  catch(e){toast(feErrorMessage(e,t),{type:'err'});}finally{setBusy(false);}
 };
 if(creating)return <NewAlbumSheet albums={albums??[]} onClose={()=>setCreating(false)} onCreated={x=>{setAlbums(l=>[...(l??[]),x]);return put(x.id,t('fe.gal.postNewDone'));}}/>;
 if(!albums)return <Sheet title={t('fe.gal.postAlbum')} onClose={onClose}><Skel kind="list"/></Sheet>;
 return <AlbumPickSheet title={t('fe.gal.postAlbum')} albums={albums} current={current} busy={busy} onClose={onClose} onPick={x=>{if(x!==(current??null))void put(x);else onClose();}} onNew={()=>setCreating(true)}/>;
}

/* ---------- the composer's album row (F07 setAlbum) ---------- */

/** «Альбом в галерее» in the composer, for a post with photos for everyone or followers. A followers-only album
 * narrows the post too (`onNarrow`); «Новый альбом…» creates one and picks it. */
export function AlbumField({value,onChange,audience,onNarrow}:{value:string|null,onChange:(v:string|null)=>void,audience:string,onNarrow:()=>void}){
 const {call,acting}=useFe();const {t}=useI18n();const toast=useToast();
 const [albums,setAlbums]=useState<Album[]>([]);const [creating,setCreating]=useState(false);
 useEffect(()=>{if(!acting)return;call('album.list',{profileId:acting.id},albumsRes).then(r=>setAlbums(r.items)).catch(()=>{});},[call,acting]);
 const pick=(id:string|null,list=albums)=>{
  onChange(id);
  if(id&&list.find(a=>a.id===id)?.visibility==='followers'&&audience!=='followers'){onNarrow();toast(t('fe.gal.postNarrowedInfo'),{type:'info'});}
 };
 const options=useMemo(()=>[['',t('fe.gal.noAlbum')] as const,...albums.map(a=>[a.id,a.title] as const),['__new',t('fe.gal.newDots')] as const],[albums,t]);
 // An album chosen elsewhere (from the gallery's «+ Добавить») shows once the list arrives.
 return <>
  <Card list className="mt8"><SelectRow row icon={Images} label={t('fe.gal.postAlbum')} sub={t('fe.gal.postAlbumSub')} value={value&&albums.some(a=>a.id===value)?value:''} options={options}
   onChange={v=>{if(v==='__new'){setCreating(true);return;}pick(v||null);}}/></Card>
  {creating&&<NewAlbumSheet albums={albums} onClose={()=>setCreating(false)} onCreated={x=>{const l=[...albums,x];setAlbums(l);pick(x.id,l);toast(t('fe.gal.createdShort'),{type:'ok'});}}/>}
 </>;
}

