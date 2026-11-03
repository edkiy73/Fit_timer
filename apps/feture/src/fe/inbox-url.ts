import {FILTERS,type Filter} from '../../contracts/notifications.mjs';

/** The notification center's place in the address (stage 5): the tab, the filter chip and the item a link points at.
 * Going back to `/n/inbox?tab=all&f=likes` opens the same tab with the same filter (the scroll is kept per this
 * address by the kit `View keep`). Anything unknown reads as «not chosen». */
export type InboxTab='todo'|'all';
export type InboxFilter='all'|Filter;
export type InboxUrl={tab:InboxTab|null,filter:InboxFilter,item:string|null};

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function readInboxUrl(p:URLSearchParams):InboxUrl{
 const tab=p.get('tab');const f=p.get('f');const item=p.get('item');
 return {
  tab:tab==='todo'||tab==='all'?tab:null,
  filter:f&&(FILTERS as readonly string[]).includes(f)?f as Filter:'all',
  item:item&&UUID.test(item)?item:null,
 };
}

/** The query for a state: the tab once chosen, the filter unless «Все»; the item only while it is being shown. Keys
 * this screen does not own (`as`) stay. */
export function inboxSearch(prev:URLSearchParams,next:{tab:InboxTab|null,filter:InboxFilter,item?:string|null}):URLSearchParams{
 const p=new URLSearchParams(prev);
 if(next.tab)p.set('tab',next.tab);else p.delete('tab');
 if(next.filter!=='all')p.set('f',next.filter);else p.delete('f');
 if(next.item)p.set('item',next.item);else p.delete('item');
 return p;
}

/** The key the scroll position is kept under: one per tab and filter. */
export const inboxScrollKey=(u:{tab:InboxTab,filter:InboxFilter})=>`/n/inbox?tab=${u.tab}&f=${u.filter}`;

/** Rows of one page merged into what is already shown: each id once (a newer copy wins), newest first, ties by id —
 * the server's order (created_at desc, id desc), so a refetched first page never duplicates or reorders the rest. */
export function mergeRows<T extends {id:string,at:string}>(have:readonly T[],add:readonly T[]):T[]{
 const byId=new Map<string,T>();
 for(const r of have)byId.set(r.id,r);
 for(const r of add)byId.set(r.id,r);
 return [...byId.values()].sort((a,b)=>{const ta=Date.parse(a.at),tb=Date.parse(b.at);return ta!==tb?tb-ta:a.id<b.id?1:a.id>b.id?-1:0;});
}

/** Rows next to each other with the same collapse key and the same read state make one summary card («Алиса и ещё
 * 3 …»); everything else stays a row of its own. */
export function groupRows<T extends {id:string,read:boolean,collapse?:string|null|undefined}>(rows:readonly T[]):T[][]{
 const out:T[][]=[];
 for(const r of rows){
  const last=out[out.length-1];const head=last?.[0];
  if(head&&r.collapse&&head.collapse===r.collapse&&head.read===r.read)last.push(r);else out.push([r]);
 }
 return out;
}
