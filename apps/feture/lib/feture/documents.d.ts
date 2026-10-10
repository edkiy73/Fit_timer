import type {Actor,Transport} from './contracts';
export type DocumentBlock={type:'heading'|'paragraph';text:string}|{type:'list';items:string[]};
export type DocumentKey='terms'|'privacy'|'community'|'adult-content'|'complaints'|'age'|'retention'|'cookies'|'copyright';
export type DocumentDTO={id:string;key:DocumentKey;locale:'ru'|'en';version:number;title:string;blocks:DocumentBlock[];hash:string;requiresAccept:boolean;publishedAt:string;effectiveAt:string};
export type DocumentSummary=Omit<DocumentDTO,'blocks'|'publishedAt'> & {accepted:boolean};
export type ConsentStatus={ready:boolean;accepted:boolean;documents:DocumentSummary[]};
export interface DocumentsRepository {status(actor:Actor,locale:'ru'|'en'):Promise<ConsentStatus>;accept(actor:Actor,locale:'ru'|'en',ids:string[]):Promise<ConsentStatus>;requireCurrent(actor:Actor):Promise<void>}
export function blocks(input:unknown):DocumentBlock[];
export function uuid(input:unknown):input is string;
export function documentDTO(input:unknown):DocumentDTO;
export const KEYS:DocumentKey[];
export function createDocumentsRepository(transport:Transport):DocumentsRepository & {rpc(name:string,body:Record<string,unknown>):Promise<Record<string,unknown>>};
