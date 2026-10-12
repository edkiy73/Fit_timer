export type EventDraft={
 title:string;summary:string;description:string;conditions:string;
 format:'online'|'offline';visibility:'public'|'private';startsAt:string;endsAt:string;
 timeZone:string;language:string;city:string;publicLocation:string;
 privateLocation:string|null;privateJoinUrl:string|null;ticketUrl:string|null;
 price:{amountMinor:number;currency:string}|null;
};
export type EventCursor={at:string;id:string};
export type EventCommand=
 | {action:'events.mine'|'events.catalog';cursor:EventCursor|null}
 | {action:'events.read';id:string}
 | {action:'events.save';id:string;operationId:string;expectedRevision:number;draft:EventDraft}
 | {action:'events.submit'|'events.cancel';id:string;operationId:string;expectedRevision:number};
export type PublicEvent=Pick<EventDraft,'title'|'summary'|'description'|'conditions'|'format'|'startsAt'|'endsAt'|'timeZone'|'language'|'city'|'publicLocation'|'price'> &{
 id:string;revision:number;hasExternalTickets:boolean;
};
export function eventDraft(value:unknown):EventDraft;
export function eventCommand(value:unknown):EventCommand;
export function publicEventDto(value:unknown):PublicEvent;
