import type {Actor,Transport} from './contracts';
import type {DocumentsRepository} from './documents';
import type {EventDraft,EventCursor,EventCommand} from './event-contract';
export type EventOwnerEntry={id:string;revision:number;state:'draft'|'pending'|'approved'|'rejected'|'cancelled'|'published';draft:EventDraft;createdAt:string;updatedAt:string};
export function ownerDto(value:unknown):EventOwnerEntry;
export function publicCardDto(value:unknown):import('./event-contract').PublicEvent;
export function requestQueueDto(value:unknown):{requestId:string;requestedAt:string;state:'pending'};
export function attendeeDto(value:unknown):{participationId:string;kind:'rsvp'|'request';status:'interested'|'going'|'approved';updatedAt:string;displayName:string|null};
export function attendeeCountsDto(value:unknown):{interested:number;going:number;rsvpDeclined:number;requestsPending:number;requestsApproved:number;requestsDeclined:number};
export function peerDto(value:unknown):{participationId:string;status:'interested'|'going';displayName:string;updatedAt:string};
export function isEventsCommand(input:import('./contracts').Command):input is EventCommand;
export function createEventsRepository(transport:Transport,documents:DocumentsRepository|null):{
 execute(actor:Actor,input:EventCommand):Promise<{entry:EventOwnerEntry;replayed?:boolean}|{items:EventOwnerEntry[];nextCursor:EventCursor|null}|{event:{id:string;state:'cancelled';revision:number};replayed:boolean}|{items:{participationId:string;status:'interested'|'going';updatedAt:string;displayName:string}[];nextCursor:EventCursor|null}|{items:{participationId:string;kind:'rsvp'|'request';status:'interested'|'going'|'approved';updatedAt:string;displayName:string|null}[];nextCursor:EventCursor|null;counts:{interested:number;going:number;rsvpDeclined:number;requestsPending:number;requestsApproved:number;requestsDeclined:number}}|{items:{requestId:string;requestedAt:string;state:'pending'}[];nextCursor:EventCursor|null}|{request:{requestId:string;state:'approved'|'declined';revision:number};replayed:boolean}|{state:'none'|'pending'|'approved'|'declined'|'withdrawn';replayed:boolean}|{status:'none'|'interested'|'going'|'declined'|'withdrawn';visibleToAttendees:boolean;counts:{interested:number|null;going:number|null};replayed:boolean}|{entry:import('./event-contract').PublicEvent}|{items:import('./event-contract').PublicEvent[];nextCursor:EventCursor|null}>;
};
