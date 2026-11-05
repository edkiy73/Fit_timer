// @ts-check
/** The smallest city the picker offers (`feture.platform_setting`, set in the staff area). The seeded cities (a code) are
 * always offered; a city already chosen is read by id and never hidden. @param {import('./db.mjs').Q} q */
export async function placesMinPop(q) {
  const [r] = await q.query(`select num from feture.platform_setting where key = 'places_min_pop'`);
  return Number(r?.num ?? 100000);
}
