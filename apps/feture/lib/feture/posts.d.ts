import type {Actor,Command,Transport} from './contracts';
import type {DocumentsRepository} from './documents';
export type PostCursor={at:string;id:string};
export type PostEntry={id:string;text:string;kind:'text'|'story'|'question';authorLabel:string;audience:'private'|'public';state:'draft'|'pending'|'published'|'rejected'|'hidden'|'deleted';revision:number;createdAt:string;updatedAt:string;publishedAt:string|null;mine:boolean};
export type PostCommand={action:'posts.feed'|'posts.mine';cursor:PostCursor|null}|{action:'posts.read';id:string}|{action:'posts.save';id:string;operationId:string;expectedRevision:number;text:string;kind:PostEntry['kind'];authorLabel:string}|{action:'posts.submit'|'posts.delete';id:string;operationId:string;expectedRevision:number};
export interface PostsRepository{execute(actor:Actor,input:PostCommand):Promise<Record<string,unknown>>}
export function postCommand(input:unknown):PostCommand;
export function isPostCommand(input:Command):input is PostCommand;
export function createPostsRepository(transport:Transport,documents:DocumentsRepository):PostsRepository;
