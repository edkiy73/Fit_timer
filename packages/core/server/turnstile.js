'use strict';
/* Cloudflare Turnstile (security audit 06.11.2026, B1): the app asks for a token before it requests a sign-in code and the server
   checks it with Cloudflare. Off until TURNSTILE_SECRET_KEY is set. A product can exempt addresses (test accounts with no real
   mailbox) with `skip(email)`. A Cloudflare outage must not lock everybody out: `failOpen` lets sign-in through when the check
   itself cannot be reached (an answer of «no» is always a refusal). */
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function createTurnstile({skip = () => false, failOpen = true, secret = () => process.env.TURNSTILE_SECRET_KEY, fetchImpl = globalThis.fetch} = {}){
  return {
    async ok(req, email, token){
      const key = String(secret() || '').trim();
      if(!key) return true;                       // not set up yet: nothing is asked
      if(skip(email)) return true;
      const response = typeof token === 'string' ? token.trim() : '';
      if(!response || response.length > 4096) return false;
      const form = new URLSearchParams({secret: key, response});
      const ip = String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim();
      if(ip) form.set('remoteip', ip);
      try{
        const r = await fetchImpl(VERIFY_URL, {method: 'POST', body: form, signal: AbortSignal.timeout(5000)});
        const j = await r.json();
        return j && j.success === true;
      }catch(e){
        return failOpen;
      }
    }
  };
}

module.exports = { createTurnstile, VERIFY_URL };
