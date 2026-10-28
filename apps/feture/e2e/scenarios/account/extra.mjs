// B01 Premium, S01 Help, A07 age check, V01 photo check.
const noDialog = async t => { await t.wait(400); if (await t.page.locator('.sheet.on, .dialog.on').count()) throw new Error('layer still open'); };
export default [
 { name: 'B01 Premium: plans switch, buy button is pinned and answers, status matches the API', persona: 'full', route: '/n/premium', run: async t => {
   const st = await t.api('premium.status', {});
   await t.see('FetUre Premium');
   if (st.premium) { await t.see('.alert.ok'); return; }
   await t.see('.ctabar .btn'); const buy = t.page.locator('.ctabar .btn');
   const y = await buy.innerText();
   await t.page.locator('.pw-plan').nth(1).click(); await t.wait(200);
   if (await t.page.locator('.pw-plan').nth(1).getAttribute('aria-pressed') !== 'true') throw new Error('month not chosen');
   const m = await buy.innerText(); if (m === y) throw new Error('buy button price did not follow the plan');
   await buy.click(); await t.see('.toast');
   await t.page.mouse.wheel(0, 3000); await t.wait(300); if (!(await buy.isVisible())) throw new Error('buy button not pinned');
 } },
 { name: 'B01 Premium ?for=undo highlights the feature', persona: 'full', route: '/n/premium?for=undo', run: async t => {
   await t.see('.pw-f.on');
 } },
 { name: 'S01 Help: each row opens its sheet, ✕/Esc/scrim close, Premium link', persona: 'full', route: '/n/help', run: async t => {
   await t.see('Частые вопросы');
   const rows = t.page.locator('.card.list button.li'); const n = await rows.count(); if (n < 7) throw new Error('help rows: ' + n);
   for (let i = 0; i < n; i++) { await rows.nth(i).click(); await t.see('.sheet.on'); const how = i % 3;
     if (how === 0) await t.tap('.sheet button[aria-label="Закрыть"]'); else if (how === 1) await t.page.keyboard.press('Escape'); else await t.page.locator('.scrim.on').click({ position: { x: 10, y: 10 } });
     await noDialog(t); }
   await rows.last().click(); await t.tap('.sheet .sh-f .btn'); await t.see('FetUre Premium');
 } },
 { name: 'A07 age check shows the state the API has', persona: 'full', route: '/n/settings/age', run: async t => {
   const s = await t.api('verification.ageStatus', {});
   if (s.verified) { await t.see('18+ подтверждено'); await t.see('.btn >> text=Продолжить'); }
   else if (s.check?.state === 'submitted') await t.see('.empty');
   else await t.see('.btn >> text=Начать проверку');
 } },
 { name: 'V01 photo check: gesture shown, pinned CTA, a selfie can be picked and retaken (not sent)', persona: 'full', route: '/n/settings/photo-check', run: async t => {
   const s = await t.api('verification.photoStatus', {});
   if (s.state === 'approved' || s.state === 'pending') { await t.see('.pv-state'); return; }
   await t.see('.pv-pose b:not([aria-busy])', 15000);
   await t.see('.ctabar .btn');
   const jpg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
   await t.page.locator('input[type=file]').setInputFiles({ name: 'me.jpg', mimeType: 'image/jpeg', buffer: jpg });
   await t.see('.pv-preview img'); await t.see('.ctabar .btn');
   await t.page.locator('input[type=file]').setInputFiles({ name: 'me2.jpg', mimeType: 'image/jpeg', buffer: jpg });
   await t.see('.pv-preview img');
   await t.tap('header.bar button[aria-label="Назад"]'); await t.see('Размывать');
 } },
];
