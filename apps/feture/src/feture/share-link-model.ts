import {z} from 'zod';
import product from '../../config/product.json';

export const linkSchema=z.object({id:z.uuid(),expiresAt:z.iso.datetime({offset:true}),revoked:z.boolean()}).strict();
export const createdSchema=z.object({ok:z.literal(true),link:linkSchema,replayed:z.boolean(),requestId:z.uuid()}).strict();
export const listedSchema=z.object({ok:z.literal(true),items:z.array(linkSchema.extend({createdAt:z.iso.datetime({offset:true}),count:z.number().int().min(1).max(6)})).max(25),requestId:z.uuid()}).strict();
export const revokedSchema=z.object({ok:z.literal(true),revoked:z.literal(true),requestId:z.uuid()}).strict();
export const readSchema=z.object({ok:z.literal(true),card:z.object({
 items:z.array(z.object({title:z.string().min(1).max(160),stance:z.enum(['curious','fantasy','want_to_try','not_interested'])}).strict()).min(1).max(6),
 expiresAt:z.iso.datetime({offset:true})
}).strict(),requestId:z.uuid()}).strict();

/** Hash-router fragment is not included in HTTP referer and keeps hosting configurable. */
export function shareLinkUrl(id:string):string{
 const base=new URL(String(product.defaultPublicUrl));
 if(base.protocol!=='https:')throw Error('public_url_invalid');
 return new URL(base.pathname.replace(/\\/$/,'')+'/#/share/'+encodeURIComponent(id),base.origin).toString();
}
export const STANCE_LABELS:Record<string,string>={curious:'Интересно',fantasy:'Фантазия',want_to_try:'Хочу попробовать',not_interested:'Не интересно'};
