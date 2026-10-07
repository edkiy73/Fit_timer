/* Web layout for Vercel (launch plan, decision 17): the landing page is the site root and the web
   app moves to /app. Runs after `vite build` only in the Vercel build command — the Android/iOS
   shells keep dist/index.html as the app (Capacitor loads it), so nothing changes there.
   Assets stay in dist/assets; the app page points to them absolutely, and vercel.json maps any
   other /app/* path (privacy.html, icon.png…) to the root. */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = fileURLToPath(new URL('..', import.meta.url));
const PLAY_URL = 'https://play.google.com/store/apps/details?id=app.unmute.english';

export function siteUrl(env = process.env){
  const product = JSON.parse(readFileSync(join(APP_DIR, 'config', 'product.json'), 'utf8'));
  const own = String(env.UNMUTE_SITE_URL || '').trim();
  const vercel = String(env.VERCEL_PROJECT_PRODUCTION_URL || '').trim();
  return (own || (vercel ? 'https://' + vercel : '') || String(product.defaultApiUrl)).replace(/\/$/, '');
}

export function layoutWeb(dist, {site = siteUrl(), landing = readFileSync(join(APP_DIR, 'web', 'landing.html'), 'utf8')} = {}){
  const appHtml = readFileSync(join(dist, 'index.html'), 'utf8')
    .replace(/(src|href)="\.\/assets\//g, '$1="/assets/');
  mkdirSync(join(dist, 'app'), {recursive: true});
  writeFileSync(join(dist, 'app', 'index.html'), appHtml);
  const page = landing.replaceAll('{{SITE}}', site).replaceAll('{{PLAY_URL}}', PLAY_URL);
  if(page.includes('{{')) throw new Error('landing has an unfilled placeholder');
  writeFileSync(join(dist, 'index.html'), page);
  return {site};
}

if(process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]){
  const {site} = layoutWeb(join(APP_DIR, 'dist'));
  console.log('web layout: landing at /, app at /app (' + site + ')');
}
