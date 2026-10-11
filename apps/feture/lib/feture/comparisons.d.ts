export type ComparisonCommand=
 |{action:'share.compare.list'}
 |{action:'share.compare.read'|'share.compare.revoke';comparisonId:string}
 |{action:'share.compare.approve';comparisonId:string;expectedRevision:number;reviewed:true}
 |{action:'share.compare.create';comparisonId:string;linkId:string;reviewed:true;selected:{interestId:string;expectedRevision:number}[]};
export type ComparisonRepository={execute(actor:import('./contracts').Actor,input:ComparisonCommand):Promise<Record<string,unknown>>};
export function comparisonCommand(input:unknown):ComparisonCommand;
export function isComparisonCommand(input:import('./shares').ShareCommand):input is ComparisonCommand;
export function createComparisonRepository(transport:import('./contracts').Transport,documents:import('./documents').DocumentsRepository):ComparisonRepository;
