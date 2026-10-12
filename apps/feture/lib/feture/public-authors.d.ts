import type {Actor,Transport} from './contracts';
export type AuthorCommand={action:'authors.status'}|{action:'authors.enable';operationId:string;consent:true}|{action:'authors.disable'|'authors.rotate';operationId:string};
export function authorCommand(input:unknown):AuthorCommand;
export function createPublicAuthorsRepository(transport:Transport):{execute(actor:Actor,input:AuthorCommand):Promise<{enabled:boolean;publicAuthorId:string|null;replayed:boolean}>};
