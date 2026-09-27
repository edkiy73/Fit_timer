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
