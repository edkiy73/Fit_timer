import type {Actor,Transport} from './contracts';
import type {DocumentsRepository} from './documents';
export type PhotoReviewCommand={action:'photo.reviewStatus';id:string}|{action:'photo.reviewConsent';id:string;operationId:string;expectedRevision:number;expectedConsentRevision:number;consent:true;consentVersion:'photo-staff-review-v1'}|{action:'photo.reviewRevoke';id:string;operationId:string;expectedConsentRevision:number};
export type PhotoCommand=PhotoReviewCommand|{action:'photo.read';id:string;revision:number}|{action:'photo.put';id:string;operationId:string;expectedRevision:number;image:string;consent:true}|{action:'photo.remove';id:string;operationId:string;expectedRevision:number};
export function photoCommand(input:unknown):PhotoCommand;
export function normalizePhoto(image:string):Promise<{data:Buffer;width:number;height:number}>;
export function createPhotoRepository(transport:Transport,documents:DocumentsRepository):{execute(actor:Actor,input:PhotoCommand):Promise<Record<string,unknown>>};

export function cleanupPhotoObjects(transport:Transport):Promise<void>;
