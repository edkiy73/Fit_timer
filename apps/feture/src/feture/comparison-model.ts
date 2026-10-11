import {z} from 'zod';
const stance=z.enum(['curious','fantasy','want_to_try','not_interested']);
export const comparisonMeta=z.object({id:z.uuid(),linkId:z.uuid(),role:z.enum(['owner','guest']),revision:z.number().int().positive().max(Number.MAX_SAFE_INTEGER-1),state:z.enum(['pending','active','revoked','unavailable']),expiresAt:z.iso.datetime({offset:true})}).strict();
export const comparisonCreated=z.object({ok:z.literal(true),comparison:comparisonMeta,requestId:z.uuid()}).strict();
export const comparisonList=z.object({ok:z.literal(true),items:z.array(comparisonMeta).max(25),requestId:z.uuid()}).strict();
export const comparisonRead=z.object({ok:z.literal(true),comparison:comparisonMeta,myItems:z.array(z.object({title:z.string().min(1).max(160),stance}).strict()).min(1).max(6),items:z.array(z.object({title:z.string().min(1).max(160),mine:stance,theirs:stance}).strict()).max(6).nullable(),requestId:z.uuid()}).strict().refine(v=>v.comparison.state==='pending'?v.items===null:v.comparison.state==='active'&&v.items!==null);
export const uuidV4=(s:string|undefined):s is string=>!!s&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
