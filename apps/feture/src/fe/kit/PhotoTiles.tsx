import {Plus,X} from 'lucide-react';
import {VideoBadge} from './av';
import {useDragOrder} from './reorder';

export type Tile={id:string,src:string,video?:boolean|undefined,durationMs?:number|null|undefined};
/** The photo-tile grid of an editor (owner, 29.10.2026): a fixed 3-column grid of equal cells (4:5 or square), every
 * thumbnail cover-cropped — a tall screenshot never stretches its cell — and the «+» cell the same size as the others.
 * Each tile has ✕ and a tap-to-view layer; a clip shows its badge. With `onReorder` a tile is dragged like the profile
 * photos (a finger: press and hold; a mouse: drag) — no handle; the first one is the main photo. */
export function PhotoTiles({tiles,ratio='4:5',wide,onRemove,onView,onReorder,add,removeLabel,viewLabel}:{tiles:Tile[],ratio?:'4:5'|'1:1',/** One full-width 16:9 cell (an article's cover). */ wide?:boolean,onRemove:(id:string)=>void,onView?:((index:number)=>void)|undefined,
 /** Reorder: the ids in their new order. */ onReorder?:((ids:string[])=>void)|undefined,
 add?:{label:string,onClick:()=>void,disabled?:boolean|undefined}|undefined,removeLabel:string,viewLabel:string}){
 const drag=useDragOrder<'t'>((_,ids)=>onReorder?.(ids),'.k-ptile[data-id]');
 const list=drag.arrange('t',tiles);const ids=tiles.map(x=>x.id);
 return <div className={'k-ptiles'+(wide?' wide':ratio==='1:1'?' sq':'')}>
  {list.map((m,i)=><div key={m.id} data-id={m.id} className={'k-ptile'+(drag.preview?.drag===m.id?' drag':'')} {...(onReorder?{onPointerDown:(e:React.PointerEvent<HTMLElement>)=>drag.down(e,'t',ids,m.id)}:{})}><img src={m.src} alt="" draggable={false}/>{m.video&&<VideoBadge durationMs={m.durationMs}/>}
   <button type="button" className="rm" aria-label={removeLabel} onClick={()=>onRemove(m.id)}><X/></button>
   {onView&&<button type="button" className="vw" aria-label={viewLabel} onClick={()=>onView(i)}/>}</div>)}
  {add&&<button type="button" className="k-ptile add" aria-label={add.label} disabled={add.disabled} onClick={add.onClick}><Plus/>{wide&&<span>{add.label}</span>}</button>}
 </div>;
}
