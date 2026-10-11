export function safeFetureDiagnostic(input:unknown):{
 readonly action:'client_error';
 readonly kind:'error'|'rejection';
 readonly name:string;
 readonly message:'feture_client_error';
 readonly stack:'';
 readonly build:string;
 readonly platform:'android'|'ios'|'web';
 readonly locale:'ru'|'en';
};
