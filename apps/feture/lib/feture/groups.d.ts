import type {Actor,Transport} from './contracts';
import type {DocumentsRepository} from './documents';
export type GroupCursor={at:string;id:string};
export type GroupCommand={action:'groups.catalog';cursor:GroupCursor|null}|{action:'groups.preview';id:string};
export type GroupPreview={id:string;slug:string;title:string;summary:string;rules:string;visibility:'public'|'closed';publishedAt:string};
export function groupCommand(value:unknown):GroupCommand;
export function groupDto(value:unknown):GroupPreview;
export function isGroupsCommand(input:import('./contracts').Command):input is GroupCommand;
export function createGroupsRepository(transport:Transport,documents:DocumentsRepository|null):{execute(actor:Actor,input:GroupCommand):Promise<{entry:GroupPreview}|{items:GroupPreview[];nextCursor:GroupCursor|null}>};
