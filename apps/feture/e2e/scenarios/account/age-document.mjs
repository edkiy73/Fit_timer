// A07 by document (persona new → account made by API): choose «Документ» → «Загрузить файл документа» → send; staff
// sees the check as a document and approves; the account is 18+ and the document image is gone (staff can't open it).
import { expect, until, pngOf, dropsNew } from '../helpers.mjs';
import { PROD, uuid7 } from '../../lib.mjs';
import { staff, STAFF } from '../../personas.mjs';

async function documents() {
  const r = await fetch(`${PROD}/api/catalog?resource=documents&locale=ru`, { cache: 'no-store' }).then(x => x.json());
  return r.documents.filter(d => d.requiresAccept).map(d => ({ id: d.id, contentHash: d.hash }));
}

export default dropsNew([{ name: 'age check by document: send, staff approves, image deleted', persona: 'new', allow4xx: true, run: async t => {
  const handle = ('qa_' + t.me.email.split('@')[0].replace(/[^a-z0-9]/g, '')).slice(0, 20);
  const made = await t.api('account.create', { opId: uuid7(), handle, birthDate: '1990-01-01', locale: 'ru', documents: await documents(), newsOptIn: false });
  expect(made.ok, 'account');
  await t.api('onboarding.complete', { opId: uuid7(), detailsVis: 'all', genders: [], orients: [], roles: [], formats: [], seeks: [], status: null, discover: 'off' }, undefined, made.profileId);
  await t.go('/n/settings/age');
  await t.tap('Документ'); await t.wait(500);
  const [ch] = await Promise.all([t.page.waitForEvent('filechooser'), t.tap('Загрузить файл документа')]);
  await ch.setFiles([{ name: 'doc.png', mimeType: 'image/png', buffer: await pngOf(t) }]);
  await t.see('Отправить на проверку'); await t.tap('button:has-text("Отправить на проверку")');
  await t.see('Проверяем', 60000); await t.shot('age-doc-wait');
  const st = await t.api('verification.ageStatus', {});
  expect(st.check?.method === 'document' && st.check?.state === 'submitted', 'submitted as a document: ' + JSON.stringify(st).slice(0, 200));
  const checkId = st.check.id;
  await staff();
  const q = await until(async () => ((await t.api('staff.ageCheckQueue', { limit: 50 }, STAFF)).items || []).find(i => i.id === checkId), 'in the staff queue', 60000);
  expect(q.method === 'document' && !q.photo, 'staff sees a document card without the profile photo');
  const assetId = q.document?.id ?? q.assetId ?? q.shot?.id;
  let d; for (let i = 0; i < 20; i++) { d = await t.api('staff.ageCheckDecide', { opId: uuid7(), checkId, approve: true }, STAFF); if (d.rule !== 'selfie_missing' && d.rule !== 'document_missing') break; await t.wait(6000); }
  expect(d.status === 200 || d.ok, 'approved: ' + JSON.stringify(d).slice(0, 200));
  const after = await t.api('verification.ageStatus', {});
  expect(after.verified || after.ageVerified || after.check?.state === 'approved', 'verified: ' + JSON.stringify(after).slice(0, 200));
  if (assetId) { const v = await t.api('staff.mediaView', { assetId }, STAFF); expect(v.status === 404, 'document not viewable after decision: ' + v.status); }
  await t.tap('Обновить статус'); await t.see('18+ подтверждено');
}}]);
