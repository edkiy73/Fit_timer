'use strict';
/* Disposable / throwaway mailbox domains (security audit 06.11.2026): a product that opts in (createAuthHandler({blockDisposableEmail:true}))
   refuses a sign-in code for them, so bots cannot make accounts from free inboxes. A short list of the common ones — not a promise to
   catch every one; extend it with the DISPOSABLE_EMAIL_DOMAINS environment variable (comma-separated). */
const BUILTIN = `
mailinator.com mailinator.net mailinator2.com guerrillamail.com guerrillamail.net guerrillamail.org guerrillamail.biz guerrillamail.de
guerrillamailblock.com sharklasers.com grr.la spam4.me pokemail.net 10minutemail.com 10minutemail.net 10minutemail.co.uk 20minutemail.com
tempmail.com temp-mail.org temp-mail.io tempmail.net tempmailo.com tempmailaddress.com tempail.com tmpmail.org tmpmail.net temporarymail.com
yopmail.com yopmail.net yopmail.fr cool.fr.nf jetable.fr.nf nospam.ze.tc nomail.xl.cx mega.zik.dj speed.1s.fr courriel.fr.nf moncourrier.fr.nf
trashmail.com trashmail.net trashmail.de trashmail.org trash-mail.com wegwerfmail.de wegwerfmail.net wegwerfmail.org
getnada.com nada.email dispostable.com maildrop.cc mailnesia.com mailcatch.com mailnull.com mintemail.com mohmal.com moakt.com moakt.cc
emailondeck.com burnermail.io fakeinbox.com fakemail.net fakemailgenerator.com throwawaymail.com throwam.com spamgourmet.com
mytemp.email mailtemp.info anonbox.net discard.email discardmail.com discardmail.de spambox.us spamex.com spamfree24.org
1secmail.com 1secmail.net 1secmail.org kzccv.com qiott.com wuuvo.com icznn.com ezztt.com vjuum.com laafd.com txcct.com
inboxkitten.com mailsac.com harakirimail.com tempinbox.com tempr.email tempmailer.com luxusmail.org minuteinbox.com
emailfake.com email-fake.com crazymailing.com fexpost.com fexbox.org fexbox.ru gmailnator.com mail.tm mail.gw
dropmail.me 10mail.org 33mail.com linshiyouxiang.net mvrht.net spamhereplease.com cuvox.de dayrep.com einrot.com fleckens.hu
gustr.com jourrapide.com rhyta.com superrito.com teleworm.us armyspy.com yomail.info byom.de
`.split(/\s+/).filter(Boolean);

function extra(){
  return String(process.env.DISPOSABLE_EMAIL_DOMAINS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

/** Is this address on a throwaway domain (or a subdomain of one)? */
function isDisposableEmail(email){
  const at = String(email || '').toLowerCase().lastIndexOf('@');
  if(at < 0) return false;
  const domain = String(email).toLowerCase().slice(at + 1).trim();
  const list = new Set([...BUILTIN, ...extra()]);
  const parts = domain.split('.');
  for(let i = 0; i < parts.length - 1; i++) if(list.has(parts.slice(i).join('.'))) return true;
  return false;
}

module.exports = { isDisposableEmail };
