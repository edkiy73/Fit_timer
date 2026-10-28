import {useI18n} from '@appbase/ui-react/i18n.js';
import {publicOrigin} from '../api-url';
import {useToast} from './toast';

/** One «Скопировать ссылку» for the whole app (owner 29.10.2026: one action — one component): a post, a profile, a
 * community, an event, a discussion. The link is the public site's hash route; copied — the toast says so; the
 * clipboard refused — the toast shows the link to copy by hand. Never a screen's own clipboard code. */
export const appUrl=(path:string)=>`${publicOrigin()}/#${path}`;

/** Copies a link; true when it reached the clipboard. */
export async function copyLink(url:string){
 try{await navigator.clipboard.writeText(url);return true;}catch{return false;}
}

/** `copy('/n/feed/post/'+id, t('fe.fd.linkCopied'))` — copies the app link of a path and tells the outcome. */
export function useCopyLink(){
 const toast=useToast();const {t}=useI18n();
 return async(path:string,copied?:string)=>{const url=appUrl(path);const ok=await copyLink(url);
  if(ok)toast(copied??t('fe.fd.linkCopied'),{type:'ok'});else toast(url,{type:'info'});return ok;};
}
