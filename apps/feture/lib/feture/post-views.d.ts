import type {Actor,Transport} from './contracts';
import type {DocumentsRepository} from './documents';
export type PostViewCommand={action:'posts.viewOpen';id:string};
export type PostViewResponse={hidden:boolean;uniqueDailyOpens:number|null};
export function postViewCommand(v:unknown):PostViewCommand;
export function createPostViewsRepository(transport:Transport,documents:DocumentsRepository):{
 execute(actor:Actor,input:PostViewCommand):Promise<PostViewResponse>;
};
