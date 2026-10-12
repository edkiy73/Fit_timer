import type {Actor,Transport} from './contracts';
import type {DocumentsRepository} from './documents';
import type {EventDraft,EventCursor,EventCommand} from './event-contract';
export type EventOwnerEntry={id:string;revision:number;state:'draft'|'pending'|'approved'|'rejected'|'cancelled';draft:EventDraft;createdAt:string;updatedAt:string};
export function ownerDto(value:unknown):EventOwnerEntry;
export function isEventsCommand(input:import('./contracts').Command):input is EventCommand;
export function createEventsRepository(transport:Transport,documents:DocumentsRepository|null):{
 execute(actor:Actor,input:EventCommand):Promise<{entry:EventOwnerEntry;replayed?:boolean}|{items:EventOwnerEntry[];nextCursor:EventCursor|null}|{event:{id:string;state:'cancelled';revision:number};replayed:boolean}|{status:'none'|'interested'|'going'|'declined'|'withdrawn';visibleToAttendees:boolean;counts:{interested:number|null;going:number|null};replayed:boolean}>;
};
