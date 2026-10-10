/** Narrow server-session contract for checked product compositions.
 * The existing CommonJS runtime remains in util.js; server handlers run without a TS build. */
export interface SessionDevice {h:string; at:string; expiresAt?:string}
export interface SessionAccountStore {get(key:string):Promise<string|null>}
export const SESSION_TTL: number;
export function sessionExpiresAt(device:SessionDevice|null|undefined):number;
export function validSession(device:SessionDevice|null|undefined,token:string,accountStore?:SessionAccountStore):Promise<boolean>;
export function revokeSession(device:SessionDevice):Promise<void>;
export function activeSession(device:SessionDevice|null|undefined,accountStore?:SessionAccountStore):Promise<boolean>;
