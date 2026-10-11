import type {Actor,Transport,Command} from './contracts';
import type {DocumentsRepository} from './documents';
export type ReportReason='policy'|'privacy'|'nonconsent'|'minor'|'illegal'|'spam'|'other';
export type PostReport={id:string;postId:string;postRevision:number;reason:ReportReason;state:'open'|'resolved';revision:number;createdAt:string;resolvedAt:string|null;resolution:'dismiss'|'hide'|null};
export type PostReportCommand={action:'posts.reports';cursor:{at:string;id:string}|null}|{action:'posts.report';id:string;reportId:string;expectedRevision:number;reason:ReportReason;note:string};
export function reportCommand(input:unknown):PostReportCommand;
export function reportDTO(input:unknown):PostReport;
export function createPostReportsRepository(transport:Transport,documents:DocumentsRepository):{execute(actor:Actor,input:PostReportCommand):Promise<Record<string,unknown>>};
export function reportReview(transport:Transport,actor:Actor,body:Record<string,unknown>):Promise<Record<string,unknown>>;
