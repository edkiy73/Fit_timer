import {Plus,X} from 'lucide-react';
import {VideoBadge} from './av';

export type Tile={id:string,src:string,video?:boolean|undefined,durationMs?:number|null|undefined};
/** The photo-tile grid of an editor (owner, 29.10.2026): a fixed 3-column grid of equal cells (4:5 or square), every
 * thumbnail cover-cropped — a tall screenshot never stretches its cell — and the «+» cell the same size as the others.
 * Each tile has ✕ and a tap-to-view layer; a clip shows its badge. */
export function PhotoTiles({tiles,ratio='4:5',onRemove,onView,add,removeLabel,viewLabel}:{tiles:Tile[],ratio?:'4:5'|'1:1',onRemove:(id:string)=>void,onView?:((index:number)=>void)|undefined,
 add?:{label:string,onClick:()=>void,disabled?:boolean|undefined}|undefined,removeLabel:string,viewLabel:string}){
 return <div className={'k-ptiles'+(ratio==='1:1'?' sq':'')}>
  {tiles.map((m,i)=><div key={m.id} className="k-ptile"><img src={m.src} alt=""/>{m.video&&<VideoBadge durationMs={m.durationMs}/>}
   <button type="button" className="rm" aria-label={removeLabel} onClick={()=>onRemove(m.id)}><X/></button>
   {onView&&<button type="button" className="vw" aria-label={viewLabel} onClick={()=>onView(i)}/>}</div>)}
  {add&&<button type="button" className="k-ptile add" aria-label={add.label} disabled={add.disabled} onClick={add.onClick}><Plus/></button>}
 </div>;
}
