import type { IncomingMessage, ServerResponse } from 'node:http';
export type Request = IncomingMessage & { body?: unknown; rawBody?: unknown };
export type Response = Pick<ServerResponse, 'setHeader' | 'end' | 'statusCode'>;
export type Actor = Readonly<{accountHash:string; verifiedAdult:boolean}>;
export interface AccountStore { configured():boolean; get(key:string):Promise<string|null> }
export interface Transport { configured():boolean; request(path:string,options?:{timeoutMs?:number;method?:string;headers?:Record<string,string>;body?:string}):Promise<globalThis.Response> }
export type ProfileDTO = {displayName:string; about:string; createdAt:string; updatedAt:string};
export type InterestState = {stance:'unknown'|'curious'|'fantasy'|'want_to_try'|'not_interested';experience:'unspecified'|'none'|'tried'|'ongoing';boundary:'none'|'conditional'|'hard';boundaryNote:string|null;intensity:number|null;visibility:'private'|'public'|'granted';useForDiscovery:boolean};
export type InterestDTO = InterestState & {interestId:string;revision:number;updatedAt:string;source:'manual'|'test';testVersion:string|null;deleted:boolean};
export type Mutation = {action:'interests.set';interestId:string;operationId:string;expectedRevision:number;state:InterestState}|{action:'interests.delete';interestId:string;operationId:string;expectedRevision:number};
export type MutationResult = {ok:true;replayed:boolean;appliedRevision:number;appliedAt:string;entry:InterestDTO}|{ok:false;error:'operation_conflict'|'revision_conflict';entry:InterestDTO|null};
export type Page = {limit:number;after:string|null};
export type VerificationStatusDTO = {state:'unavailable';verifiedAdult:false;validUntil:null;reason:'provider_not_configured'};
export type Command = {action:'verification.status'} | {action:'profile.get'} | ({action:'interests.list'} & Page) | Mutation;
export interface Repository { getProfile(actor:Actor):Promise<ProfileDTO|null>; listInterests(actor:Actor,page:Page):Promise<{items:InterestDTO[];nextCursor:string|null}>; mutateInterest(actor:Actor,input:Mutation):Promise<MutationResult> }
export type AuditEvent = Readonly<{requestId:string; action:Command['action']|'unknown';outcome:string}>;
