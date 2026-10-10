import type {Actor,Transport} from './contracts';
import type {DocumentsRepository} from './documents';
export type ProfileData={nickname:string;about:string;pronouns:string;identity:string;orientation:string;relationships:string;city:string};
export type PrivateProfile={id:string;data:ProfileData;revision:number;updatedAt:string};
export type ProfileCommand={action:'profile.read'}|{action:'profile.save';operationId:string;expectedRevision:number;data:ProfileData};
export interface ProfileRepository{read(actor:Actor):Promise<PrivateProfile|null>;save(actor:Actor,input:Extract<ProfileCommand,{action:'profile.save'}>):Promise<{profile:PrivateProfile;replayed:boolean}>}
export function profileData(input:unknown):ProfileData;
export function profileCommand(input:unknown):ProfileCommand;
export function createProfileRepository(transport:Transport,documents:DocumentsRepository):ProfileRepository;
