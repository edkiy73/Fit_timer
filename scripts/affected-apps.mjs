/* Какие части монорепозитория проверять для набора изменённых файлов.

   Правила (ADR docs/appbase-stack-ci-strategy.md, D6):
   - Markdown и apps/<name>/docs/** ничего не запускают;
   - apps/<name>/** — только это приложение;
   - всё остальное (packages/core, корневые package.json/scripts, workflow и любой
     незнакомый путь) — Core и все приложения. Незнакомое всегда проверяется целиком:
     ошибка фильтра должна приводить к лишней проверке, а не к пропущенной. */

export function affectedApps(files, appNames){
  const apps = new Set();
  let everything = false;
  for(const file of files){
    if(file.endsWith('.md') || /^apps\/[^/]+\/docs\//.test(file)) continue;
    const m = /^apps\/([^/]+)\//.exec(file);
    if(m && appNames.includes(m[1])) apps.add(m[1]);
    else everything = true;
  }
  return everything
    ? {core: true, apps: [...appNames]}
    : {core: false, apps: appNames.filter(n => apps.has(n))};
}

/* Облегчённая проверка: если в приложении изменено ТОЛЬКО то, что описано в LIGHT_SCOPES
   (автономные HTML-прототипы FetUre и пати-бар FitTimer), вместо полного `check` запускается его скрипт
   `check:prototype`. Любой другой файл приложения, Core или корень возвращают полную проверку. */
export const LIGHT_SCOPES = {
  /* Пати-бар /bar — автономная статическая страница без сборки и без кода FitTimer. */
  fittimer: {
    script: 'check:bar',
    paths: [/^apps\/fittimer\/bar\//]
  },
  feture: {
    script: 'check:prototype',
    paths: [
      /^apps\/feture\/prototype\//,
      /^apps\/feture\/public\/prototype-v\d+(?:-notes)?\.html$/,
      /^apps\/feture\/tools\/(?:build|qa)-prototype-v\d+\.mjs$/,
      /^apps\/feture\/tests\/prototype-v\d+-[\w-]+\.mjs$/
    ]
  }
};

export function lightChecks(files, appNames){
  const target = affectedApps(files, appNames);
  if(target.core) return {};
  const out = {};
  for(const name of target.apps){
    const scope = LIGHT_SCOPES[name];
    if(!scope) continue;
    const own = files.filter(f => f.startsWith(`apps/${name}/`) && !f.endsWith('.md') && !f.startsWith(`apps/${name}/docs/`));
    if(own.length && own.every(f => scope.paths.some(re => re.test(f)))) out[name] = scope.script;
  }
  return out;
}

/* Нужны ли браузерные тесты FitTimer: нет, если в FitTimer изменён только пати-бар. */
export function fittimerBrowserNeeded(files, appNames){
  const target = affectedApps(files, appNames);
  if(target.core) return true;
  if(!target.apps.includes('fittimer')) return false;
  return !lightChecks(files, appNames).fittimer;
}
