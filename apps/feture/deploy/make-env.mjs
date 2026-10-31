#!/usr/bin/env node
// Creates deploy/.env (compose: domain, database, PostgREST) and deploy/app.env (the app's own secrets) with fresh
// random values (docs/infra/migration-plan.md, deploy/README.md). Run once, on the server:
//   node make-env.mjs && chmod 600 .env app.env
// Then fill the lines marked «вставить». Never commit these files; secrets never pass through chat.
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';

const rnd = (n = 32) => randomBytes(n).toString('base64url');
const b64 = (/** @type {object} */ o) => Buffer.from(JSON.stringify(o)).toString('base64url');
/** HS256 JWT PostgREST accepts as the server key: role=service_role, no expiry (rotate by changing the secret). */
export function serviceKey(/** @type {string} */ secret) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ role: 'service_role', iss: 'feture' });
  return `${head}.${body}.${createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const f of ['.env', 'app.env']) if (existsSync(f)) { console.error(`${f} уже есть — не перезаписываю`); process.exit(1); }
  const jwtSecret = rnd(48);
  writeFileSync('.env', [
    '# FetUre — compose. Создано make-env.mjs. Не коммитить.',
    'FETURE_DOMAIN=app.example.com            # вставить: домен сайта и API',
    'ACME_EMAIL=admin@example.com             # вставить: почта для Let’s Encrypt',
    `POSTGRES_PASSWORD=${rnd()}`,
    `AUTHENTICATOR_PASSWORD=${rnd()}`,
    `FETURE_API_DB_PASSWORD=${rnd()}`,
    `PGRST_JWT_SECRET=${jwtSecret}`,
    `APPBASE_REST_KEY=${serviceKey(jwtSecret)}`,
    '# Бэкапы: отдельная Storage Zone Bunny без Pull Zone (вставить)',
    'BACKUP_STORAGE_ZONE=',
    'BACKUP_STORAGE_KEY=',
    'BACKUP_STORAGE_HOST=storage.bunnycdn.com',
    `BACKUP_PASSPHRASE=${rnd(48)}`,
    '# ↑ Скопировать BACKUP_PASSPHRASE в менеджер паролей: без неё бэкап не расшифровать.',
    '',
  ].join('\n'));
  writeFileSync('app.env', [
    '# FetUre — секреты приложения. Создано make-env.mjs. Не коммитить.',
    `FETURE_ID_PEPPER=${rnd(48)}`,
    `FETURE_JOBS_SECRET=${rnd(48)}`,
    `FETURE_UPLOAD_SECRET=${rnd(48)}`,
    `ADMIN_KEY=${rnd(48)}`,
    '# Bunny: медиа (вставить из панели Bunny)',
    'BUNNY_STORAGE_ZONE=',
    'BUNNY_STORAGE_KEY=',
    'BUNNY_STORAGE_HOST=storage.bunnycdn.com',
    'BUNNY_CDN_ORIGIN=https://media.example.com',
    'BUNNY_TOKEN_KEY=',
    '# Почта, push, web push (вставить; перенести из Vercel → feture-mvp → Environment Variables)',
    'RESEND_API_KEY=',
    'MAIL_FROM=FetUre <code@mail.example.com>',
    'FIREBASE_SERVICE_ACCOUNT_BASE64=',
    'FE_VAPID_PUBLIC_KEY=',
    'FE_VAPID_PRIVATE_KEY=',
    'FE_VAPID_SUBJECT=',
    '',
  ].join('\n'));
  console.log('Готово: .env и app.env. Заполни строки «вставить».');
}
