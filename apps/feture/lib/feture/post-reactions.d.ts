import type {Actor,Transport} from './contracts';
export type ReactionCommand={action:'posts.reactionState';id:string}|{action:'posts.reactionSet';id:string;operationId:string;kind:'like';active:boolean};
export function reactionCommand(value:unknown):ReactionCommand;
export function createReactionsRepository(transport:Transport):{execute(actor:Actor,command:ReactionCommand):Promise<{liked:boolean;likes:number;replayed?:boolean}>};
