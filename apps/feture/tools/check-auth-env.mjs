// Offline configuration check. Never prints values or sends mail/writes data.
const env = process.env;
const present = key => Boolean(env[key]?.trim());
const developmentMail = process.argv.includes('--development-mail');
const testSender = /@resend\.dev>?\s*$/i.test(env.MAIL_FROM?.trim() || '');
const checks = [
  { key: 'APPBASE_STORE', ok: env.APPBASE_STORE === 'supabase', reason: 'Use the shared FitT Core store adapter: supabase.' },
  { key: 'SUPABASE_URL', ok: env.SUPABASE_URL?.replace(/\/$/, '') === 'https://anrhayozrhrmiwexmbhw.supabase.co', reason: 'Must point to the existing FitT project.' },
  { key: 'SUPABASE_SECRET_KEY', ok: present('SUPABASE_SECRET_KEY') || present('SUPABASE_SERVICE_ROLE_KEY'), reason: 'Server-only secret required; the public catalog key is insufficient.' },
  { key: 'RESEND_API_KEY', ok: present('RESEND_API_KEY'), reason: 'Server-only sending key required.' },
  { key: 'MAIL_FROM', ok: present('MAIL_FROM') && (!testSender || developmentMail), reason: 'Use a verified sending domain for launch; --development-mail permits the Resend owner-only sender for development.' },
  { key: 'ALLOW_MEMORY_STORE', ok: !present('ALLOW_MEMORY_STORE'), reason: 'Do not configure the local OTP/memory-store bypass on a public deployment.' }
];
console.log(JSON.stringify({
  configurationReady: checks.every(check => check.ok),
  mailMode: testSender ? 'resend-owner-only' : 'custom-domain-unverified',
  launchMailReady: present('MAIL_FROM') && !testSender,
  domainVerificationChecked: false,
  liveSignInVerified: false,
  writes: 0,
  mailSent: false,
  checks
}, null, 2));
process.exitCode = checks.every(check => check.ok) ? 0 : 1;
