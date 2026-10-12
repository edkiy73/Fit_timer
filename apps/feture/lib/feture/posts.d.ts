import type {Actor,Command,Transport} from './contracts';
import type {DocumentsRepository} from './documents';
export type PostCursor={at:string;id:string};
export type PostEntry={id:string;text:string;kind:'text'|'story'|'question';authorLabel:string;audience:'private'|'public'|'granted';plannedAudience:'public'|'granted';recipientCodes:string[];state:'draft'|'pending'|'published'|'rejected'|'hidden'|'deleted';revision:number;createdAt:string;updatedAt:string;publishedAt:string|null;mine:boolean};
export type PostTestCommand={action:'posts.testPreview';attemptId:string}|{action:'posts.fromTest';attemptId:string;versionId:string;expectedAttemptRevision:number;projectionHash:string;id:string;operationId:string;selected:string[];authorLabel:string;plannedAudience:'public'|'granted';recipientCodes:string[];consent:true};
export type PostBookmarkCommand={action:'posts.bookmarks';cursor:PostCursor|null}|{action:'posts.bookmarkSave'|'posts.bookmarkRemove';id:string;operationId:string};
export type PostCommand=import('./post-comments').CommentCommand|import('./post-reactions').ReactionCommand|PostBookmarkCommand|PostTestCommand|{action:'posts.address'}|{action:'posts.rotateAddress';operationId:string}|{action:'posts.revokeRecipient';id:string;operationId:string;expectedRevision:number;code:string}|import('./post-reports').PostReportCommand | {action:'posts.feed'|'posts.mine';cursor:PostCursor|null}|{action:'posts.read';id:string}|{action:'posts.save';id:string;operationId:string;expectedRevision:number;text:string;kind:PostEntry['kind'];authorLabel:string;plannedAudience:'public'|'granted';recipientCodes:string[]}|{action:'posts.submit'|'posts.delete';id:string;operationId:string;expectedRevision:number};
export interface PostsRepository{execute(actor:Actor,input:PostCommand):Promise<Record<string,unknown>>}
export function postCommand(input:unknown):PostCommand;
export function isPostCommand(input:Command):input is PostCommand;
export function createPostsRepository(transport:Transport,documents:DocumentsRepository):PostsRepository;

export function postDto(value:unknown):PostEntry;
