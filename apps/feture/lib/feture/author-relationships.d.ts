import type {Actor,Transport} from './contracts';
export type RelationshipKind='follow'|'mute';
export type RelationshipCursor={at:string;id:string};
export type RelationshipCommand=
 {action:'relationships.mine';kind:RelationshipKind;cursor:RelationshipCursor|null}|
 {action:'relationships.state';kind:RelationshipKind;postId:string;publicAuthorId:string}|
 {action:'relationships.set';kind:RelationshipKind;postId:string|null;publicAuthorId:string;active:boolean;operationId:string};
export function relationshipCommand(value:unknown):RelationshipCommand;
export function createAuthorRelationshipsRepository(transport:Transport):{execute(actor:Actor,command:RelationshipCommand):Promise<Record<string,unknown>>};
