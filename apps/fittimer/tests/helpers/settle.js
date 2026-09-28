/* Ожидание по условию вместо фиксированной паузы.

   settle(page) ждёт, пока в документе не останется конечных CSS-анимаций и переходов
   (бесконечные — спиннеры, скелетоны — не считаются), затем два кадра, чтобы успели
   отработать обработчики popstate/rAF. Возвращается сразу, как только UI успокоился,
   поэтому быстрее и надёжнее, чем waitForTimeout «с запасом». */

async function settle(page, timeout = 5000){
  await page.waitForFunction(() => document.getAnimations().every(a => {
    if(a.playState !== 'running' && a.playState !== 'pending') return true;
    const end = a.effect && a.effect.getComputedTiming().endTime;
    return end === Infinity;
  }), null, {timeout, polling: 'raf'});
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}

module.exports = { settle };
