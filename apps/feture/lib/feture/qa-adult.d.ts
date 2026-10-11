export function createQaAdultResolver(transport:import('./contracts').Transport):(accountHash:string)=>Promise<string|null>;
export function createQaAdultAdmin(transport:import('./contracts').Transport,accounts:import('./contracts').AccountStore,actor:import('./contracts').Actor):(action:string,body:Record<string,unknown>,res:import('./contracts').Response)=>Promise<boolean>;
