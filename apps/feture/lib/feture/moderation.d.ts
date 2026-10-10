import type {Actor,AccountStore,Command,Transport} from './contracts';
export type ModerationCommand=
 | {action:'moderation.report';operationId:string;targetId:string;reason:string;note:string;field:string|null}
 | {action:'moderation.status';kind:'reports'|'appeals';cursor:string|null}
 | {action:'moderation.appeal';operationId:string;caseId:string;text:string};
export interface ModerationRepository{execute(actor:Actor,input:ModerationCommand):Promise<Record<string,unknown>>;rpc(name:string,body:Record<string,unknown>):Promise<Record<string,unknown>>}
export function moderationCommand(input:unknown):ModerationCommand;
export function isModerationCommand(input:Command):input is ModerationCommand;
export function createModerationRepository(transport:Transport,store:AccountStore):ModerationRepository;
export function queueItem(input:unknown):Record<string,unknown>;
