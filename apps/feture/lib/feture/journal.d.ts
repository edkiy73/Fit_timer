import type {Actor,InterestDTO} from './contracts';
export type JournalCursor={at:string;id:string};
export type JournalEntry={id:string;title:string;text:string;topicId:string|null;deleted:boolean;revision:number;createdAt:string;updatedAt:string};
export type InterestHistory={id:string;interestId:string;revision:number;entry:InterestDTO;createdAt:string};
export type JournalCommand={action:'journal.list'|'history.list';cursor:JournalCursor|null}|{action:'journal.read';id:string}|{action:'journal.save';id:string;operationId:string;expectedRevision:number;title:string;text:string;topicId:string|null}|{action:'journal.delete';id:string;operationId:string;expectedRevision:number}|{action:'history.clear';operationId:string};
export interface JournalRepository{execute(actor:Actor,input:JournalCommand):Promise<Record<string,unknown>>}
export function journalCommand(input:unknown):JournalCommand;
export function isJournalCommand(input:import('./contracts').Command):input is JournalCommand;
export function createJournalRepository(transport:import('./contracts').Transport,documents:import('./documents').DocumentsRepository):JournalRepository;
