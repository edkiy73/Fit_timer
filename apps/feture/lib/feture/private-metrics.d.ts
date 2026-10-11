import type {Actor} from './contracts';
export declare const EVENTS:readonly string[];
export function createPrivateMetrics(store:{incr(key:string,ttl:number):Promise<unknown>;many(keys:string[]):Promise<unknown[]>}):{
 record(action:string,actor:Actor,result:unknown):Promise<void>;
 summary(days:7|30):Promise<{days:7|30;events:readonly string[];cohorts:readonly string[];counts:Record<string,Record<string,number|null>>}>;
};
