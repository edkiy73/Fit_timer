export type ShareCommand=
 |{action:'share.list'}
 |{action:'share.read';linkId:string}
 |{action:'share.revoke';linkId:string}
 |{action:'share.create';linkId:string;days:1|3|7;reviewed:true;selected:{interestId:string;expectedRevision:number}[]};
export type ShareRepository={execute(actor:import('./contracts').Actor,input:ShareCommand):Promise<Record<string,unknown>>};
