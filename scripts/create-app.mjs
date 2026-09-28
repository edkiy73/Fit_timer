import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const TEMPLATE = path.join(REPO, 'templates', 'react-app');

const TEXT = {
  ru: {
    logout:'Выйти',
    readyTitle:'Основа готова',
    readyText:'Авторизация, роутинг, тема, Core, Vercel и тестовый каркас уже подключены.'
  },
  en: {
    logout:'Sign out',
    readyTitle:'Foundation ready',
    readyText:'Auth, routing, theme, Core, Vercel and the test scaffold are already wired.'
  }
};

async function exists(target){
  try{ await access(target); return true; }catch{ return false; }
}

async function copyTree(source, target, replacements){
  await mkdir(target, {recursive:true});
  for(const entry of await readdir(source, {withFileTypes:true})){
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if(entry.isDirectory()){
      await copyTree(from, to, replacements);
      continue;
    }
    let content = await readFile(from, 'utf8');
    for(const [token, value] of Object.entries(replacements)) content = content.split(token).join(value);
    await writeFile(to, content, 'utf8');
  }
}

export async function createApp({slug, name, appId, locale='ru', destination}){
  if(!/^[a-z][a-z0-9-]{1,39}$/.test(slug || '')) throw new Error('slug must match [a-z][a-z0-9-]{1,39}');
  if(!String(name || '').trim()) throw new Error('name is required');
  if(!/^[a-z][a-z0-9]*(?:\.[a-z0-9][a-z0-9-]*){2,}$/i.test(appId || '')) throw new Error('appId must be a reverse-domain id, e.g. com.example.myapp');
  if(locale !== 'ru' && locale !== 'en') throw new Error('locale must be ru or en');

  const target = destination ? path.resolve(destination) : path.join(REPO, 'apps', slug);
  if(await exists(target)) throw new Error('destination already exists: ' + target);

  const copy = TEXT[locale];
  await copyTree(TEMPLATE, target, {
    '__APP_SLUG__': slug,
    '__APP_NAME__': String(name).trim(),
    '__APP_ID__': appId,
    '__APP_LOCALE__': locale,
    '__LOGOUT_TEXT__': copy.logout,
    '__READY_TITLE__': copy.readyTitle,
    '__READY_TEXT__': copy.readyText
  });
  return target;
}

async function cli(){
  const [slug, name, appId, locale='ru'] = process.argv.slice(2);
  if(!slug || !name || !appId){
    console.error('Usage: node scripts/create-app.mjs <slug> "<App Name>" <reverse.domain.id> [ru|en]');
    process.exit(2);
  }
  const target = await createApp({slug,name,appId,locale});
  console.log('Created ' + path.relative(REPO, target));
  console.log('Next: npm ci --prefix ' + path.relative(REPO, target) + ' && npm --prefix ' + path.relative(REPO, target) + ' run check');
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if(invoked) cli().catch(error => { console.error(error.message || error); process.exit(1); });
