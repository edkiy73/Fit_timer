export type ShareCommand=import('./comparisons').ComparisonCommand
 |{action:'share.list'}
 |{action:'share.read';linkId:string}
 |{action:'share.revoke';linkId:string}
 |{action:'share.create';linkId:string;days:1|3|7;reviewed:true;selected:{interestId:string;expectedRevision:number}[]};
export type ShareRepository={execute(actor:import('./contracts').Actor,input:ShareCommand):Promise<Record<string,unknown>>};

export function shareCommand(input:unknown):ShareCommand;
export function isShareCommand(input:import('./contracts').Command):input is ShareCommand;
export function createShareRepository(transport:import('./contracts').Transport,documents:import('./documents').DocumentsRepository):ShareRepository;
export function cardDTO(value:unknown):{items:{title:string;stance:string}[];expiresAt:string};
