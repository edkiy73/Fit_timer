// Only restore a known FetUre invitation path after OTP. Never accept arbitrary
// URLs, origin-relative redirects, query strings, or admin/account destinations.
const uuid='[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const invitePath=new RegExp('^/(?:share/'+uuid+'|compare/(?:new/)?'+uuid+')$','i');

export function safeSignInReturnTo(state:unknown):string {
 if(!state||typeof state!=='object'||!('returnTo' in state))return '/';
 const path=(state as {returnTo:unknown}).returnTo;
 return typeof path==='string'&&(invitePath.test(path)||/^\/design\/[A-Z]\d{2}$/.test(path))?path:'/';
}
