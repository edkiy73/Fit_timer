import type {Actor,Transport} from './contracts';
export type CommentCursor={at:string;id:string};
export type CommentEntry={id:string;postId:string;parentId:string|null;text:string;state:'pending'|'published'|'hidden'|'deleted';revision:number;mine:boolean;createdAt:string;updatedAt:string};
export type CommentCommand={action:'comments.page';postId:string;cursor:CommentCursor|null}|{action:'comments.read';id:string}|{action:'comments.create';id:string;postId:string;parentId:string|null;operationId:string;text:string}|{action:'comments.edit';id:string;operationId:string;expectedRevision:number;text:string}|{action:'comments.delete';id:string;operationId:string;expectedRevision:number};
export function commentCommand(value:unknown):CommentCommand;
export function commentDto(value:unknown):CommentEntry;
export function createCommentsRepository(transport:Transport):{execute(actor:Actor,command:CommentCommand):Promise<Record<string,unknown>>};
