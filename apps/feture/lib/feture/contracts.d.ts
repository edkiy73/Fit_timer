import type { IncomingMessage, ServerResponse } from 'node:http';
export type Request = IncomingMessage & { body?: unknown; rawBody?: unknown };
export type Response = Pick<ServerResponse, 'setHeader' | 'end' | 'statusCode'>;
export type Actor = Readonly<{accountHash:string; verifiedAdult:boolean}>;
export interface AccountStore { configured():boolean; get(key:string):Promise<string|null> }
export interface Transport { configured():boolean; request(path:string,options?:{timeoutMs?:number}):Promise<globalThis.Response> }
export type ProfileDTO = {displayName:string; about:string; createdAt:string; updatedAt:string};
export type InterestDTO = {interestId:string;status:string;intensity:number|null;visibility:string;updatedAt:string};
export type Page = {limit:number;after:string|null};
export type Command = {action:'profile.get'} | ({action:'interests.list'} & Page);
export interface Repository { getProfile(actor:Actor):Promise<ProfileDTO|null>; listInterests(actor:Actor,page:Page):Promise<{items:InterestDTO[];nextCursor:string|null}> }
export type AuditEvent = Readonly<{requestId:string; action:'profile.get'|'interests.list'|'unknown';outcome:string}>;
