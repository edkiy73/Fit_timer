/** Live data (owner 03.11.2026: «данные не обновляются сами»). A realtime signal names what changed (server/live.mjs):
 * `changed` with an entity, or one of the older kinds. This file is the one registry of which reads each entity
 * touches: a signal forgets only those reads (session.tsx) and wakes only the screens that listen for it (`useLive`).
 * A reconnect, a return to the app or `boot` forgets everything. */
import type {RtKind} from './realtime';

export type LiveEntity='profile'|'couple'|'check'|'media'|'post'|'counts'|'chat'|'decide'|'notify'|'boot';
/** What the server may name in `changed` (server/live.mjs ENTITIES); `notify` is the client's own (the notifications list). */
const SERVER_ENTITIES:readonly string[]=['profile','couple','check','media','post','counts','chat','decide','boot'];

/** entity → the read commands whose answers it changes. A read missing here still refreshes on a resync, on its own
 * screen's revisit after 30 s, and after any write. */
export const LIVE_READS:Record<Exclude<LiveEntity,'boot'>,RegExp>={
 profile:/^(profile\.(get|settings|mine|compat|followers|activity)|settings\.get|interests\.list|links\.(mine|ofProfile)|private\.get|premium\.status|dating\.status|location\.get|blocks\.list|people\.byNick|access\.(lists|quota)|staff\.me|discover\.filter|notifications\.settings\.get)$/,
 couple:/^(couple\.(get|invites)|decide\.(approvals|approval)|profile\.(get|settings|mine))$/,
 check:/^(verification\.(ageStatus|photoStatus)|profile\.(get|settings|mine)|settings\.get|premium\.status|discover\.(deck|count|card))$/,
 media:/^(profile\.(get|mine|posts)|gallery\.list|album\.list|me\.posts|post\.get|feed\.list|verification\.(ageStatus|photoStatus))$/,
 post:/^(feed\.list|post\.(get|replies|likers)|poll\.voters|profile\.(posts|activity)|activity\.items|me\.posts|gallery\.list|album\.list|discussions\.popular|community\.discussions|saved\.list)$/,
 counts:/^(inbox\.counts|decide\.list|staff\.counts)$/,
 chat:/^(chats\.list|chat\.(messages|starters)|inbox\.counts|matches\.list)$/,
 decide:/^(decide\.(list|approvals|approval)|inbox\.counts|couple\.(get|invites)|access\.lists|community\.requests|event\.applications|links\.mine)$/,
 notify:/^(notifications\.list|inbox\.counts|decide\.list|chats\.list|likes\.(incoming|outgoing)|matches\.list|staff\.counts)$/,
};

/** What a signal changed: entities, or 'all' (a reconnect or a return: anything may have been missed; `boot`). */
export function signalEntities(kind:RtKind|null,tag?:string):LiveEntity[]|'all'{
 if(kind===null)return 'all';
 switch(kind){
  case 'typing':return [];
  case 'chat':return ['chat','counts'];
  case 'notify':return ['notify','counts'];
  case 'decide':return ['decide','counts'];
  case 'feed':return ['post'];
  case 'changed':return tag==='boot'?'all':tag&&SERVER_ENTITIES.includes(tag)?[tag as LiveEntity]:[];
 }
 return [];
}

/** Does a read of `action` depend on any of `entities`? */
export function readDependsOn(action:string,entities:LiveEntity[]|'all'){
 if(entities==='all')return true;
 return entities.some(e=>e!=='boot'&&LIVE_READS[e].test(action));
}

/** The older kinds a `changed` signal also stands for, so screens that still listen by kind (`useRealtime`) hear it. */
export function legacyKind(kind:RtKind|null,tag?:string):RtKind|null|undefined{
 if(kind!=='changed')return kind;
 return tag==='boot'?null:tag==='chat'?'chat':tag==='decide'?'decide':tag==='counts'?'notify':undefined;
}

/** Writes after which the counters (bell, tabs, «Нужно решить») are pulled at once on this device. */
export const COUNT_WRITES=/^(notifications\.read|chat\.(read|requestAnswer)|decide\.|couple\.(inviteAnswer|inviteWithdraw|linkAccept)|access\.(grant|decline|undoDecline|cancel)|link\.(answer|answerChange)|community\.requestDecide|event\.applicationDecide|tag\.answer|like\.dismiss)/;
