import type {Actor,Command,Transport,AccountStore} from './contracts';
import type {DocumentsRepository} from './documents';
export type AccessCommand=
 | {action:'access.settings'}
 | {action:'access.disclosure';expectedRevision:number;publicFields:string[];grantedFields:string[]}
 | {action:'access.list';kind:'requests'|'grants'|'blocks';cursor:string|null}
 | {action:'access.request';targetId:string;operationId:string;scopes:string[];canMessage:boolean}
 | {action:'access.decide';requestId:string;decision:'approve'|'decline';scopes:string[];canMessage:boolean;days:number}
 | {action:'access.close';requestId:string;kind:'cancel'|'revoke'}
 | {action:'access.block';targetId:string;blocked:boolean}
 | {action:'access.profile';targetId:string}
 | {action:'access.preview';viewerId:string|null};
export interface AccessRepository{execute(actor:Actor,input:AccessCommand):Promise<Record<string,unknown>>}
export function accessCommand(input:unknown):AccessCommand;
export function isAccessCommand(input:Command):input is AccessCommand;
export function createAccessRepository(transport:Transport,documents:DocumentsRepository,store:AccountStore):AccessRepository;
