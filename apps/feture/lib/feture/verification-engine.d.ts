export type Policy = Readonly<{issuer:string;environment:'sandbox'|'production';version:string;threshold:18;proofLifetimeMs:number}>;
export type ProviderEvent = Readonly<{eventId:string;attemptId:string;providerReference:string;issuer:string;environment:'sandbox'|'production';policyVersion:string;threshold:18;occurredAt:number;outcome:'approved'|'rejected'|'revoked';adult:boolean;identity:boolean}>;
export type Attempt = Readonly<{id:string;accountHash:string;providerReference:string;issuer:string;environment:'sandbox'|'production';policyVersion:string;threshold:18;createdAt:number;expiresAt:number;state:'pending'|'verified'|'rejected'|'revoked';lastEventAt:number|null;proof:Proof|null}>;
export type Proof = Readonly<{issuedAt:number;expiresAt:number;adult:true;identity:boolean}>;
export type Receipt = Readonly<{digest:string}>;
export type Transition = Readonly<{attempt:Attempt;receipt:Receipt;replayed:boolean}>;
export interface Provider { verify(rawBody:Buffer,headers:Readonly<Record<string,string>>):Promise<unknown> }
// Implementations must lock the attempt AND event key, resolve ownership from stored attempts,
// require the current attempt for that account, and commit receipt + state together.
// Missing/deleted accounts must fail. There is deliberately no production implementation yet.
export interface EventStore { apply(event:ProviderEvent,digest:string,policy:Policy,now:number):Promise<Transition> }
export type Status = {state:'pending'|'verified'|'rejected'|'expired'|'unverified';verifiedAdult:boolean;validUntil:string|null};
