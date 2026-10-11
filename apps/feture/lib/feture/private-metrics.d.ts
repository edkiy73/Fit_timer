import type {Actor} from './contracts';
export declare const EVENTS:readonly string[];
export function createPrivateMetrics(store:{incr(key:string,ttl:number):Promise<unknown>;many(keys:string[]):Promise<unknown[]>}):{
 record(action:string,actor:Actor,result:unknown):Promise<void>;
 summary(days:7|30):Promise<{days:7|30;events:readonly string[];cohorts:readonly string[];counts:Record<string,Record<string,number|null>>;operations:{windowCount:number|null;weekCount:number|null;observedWindowDays:7|30;retentionDays:35;maxActiveCounterKeys:number;readKeys:number;maxReadKeys:number;threshold:number|null;status:'not_configured'|'invalid_configuration'|'warning'|'within_threshold'}}>;
};
