// @ts-check
import { mediaDto } from '../media/assets.mjs';
import { hasPhotoCheck } from './verification.mjs';

/** What a list row shows of a person next to the name (V21 `nameBadges` + the round photo): the small avatar, the age,
 * the «Фото подтверждено» and Premium badges. One query for the whole list (no N+1), never more than `profile.get`
 * shows the same viewer: a profile that is not active (unless it is the viewer's own) or is blocked either way gets
 * nothing; the age only when the person shows it (`show_age`) or it is the viewer's own; couples have no age.
 * Premium is the public gold badge (V10 «Значки»; Q12: a couple has it when an active partner has it).
 * @typedef {import('../db.mjs').Q} Q @typedef {import('../media/assets.mjs').MediaConfig} MediaConfig
 * A couple without a photo of its own also carries `halves`: its two partners' small photo (or null) and name, for the
 * split avatar (owner 05.11.2026: a couple's avatar is never one letter).
 * @typedef {{avatar: string | null, age: number | null, photoVerified: boolean, premium: boolean, kind?: 'person' | 'couple', halves?: {name: string | null, avatar: string | null}[]}} Face
 */

/** Premium of profile `p` (a person's account, or any active partner of a couple — Q12), as a SQL expression. */
export const PREMIUM_SQL = `exists (select 1 from feture.account pa where pa.premium_until > now() and (pa.person_profile_id = p.id
  or (p.kind = 'couple' and pa.id in (select m.account_id from feture.profile_member m where m.profile_id = p.id and m.state = 'active'))))`;

/** @type {Face} */
export const NO_FACE = Object.freeze({ avatar: null, age: null, photoVerified: false, premium: false });

/** Full years on the server's UTC date — the one age rule for registration, profiles and lists.
 * @param {string} birthDate YYYY-MM-DD @param {Date} [now] */
export function ageOn(birthDate, now = new Date()) {
  const [y, m, d] = birthDate.split('-').map(Number);
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age--;
  return age;
}

/** @param {Q} q @param {MediaConfig | null | undefined} media @param {{profileId: string | null, accountId: string}} viewer
 * @param {(string | null | undefined)[]} ids @returns {Promise<Map<string, Face>>} */
export async function facesOf(q, media, viewer, ids) {
  const uniq = [...new Set(ids.filter(/** @returns {x is string} */ x => typeof x === 'string' && !!x))];
  /** @type {Map<string, Face>} */
  const out = new Map();
  if (!uniq.length) return out;
  const pv = await hasPhotoCheck(q);
  const rows = await q.query(
    `select p.id, p.kind, v.own,
       case when p.kind = 'person' and a.birth_date is not null and (v.own or coalesce(d.show_age, false)) then a.birth_date::text end birth_date,
       ${pv ? 'feture.photo_verified(p.id)' : 'false'} pv,
       ${PREMIUM_SQL} premium,
       case when m.id is null then null else to_jsonb(m) end asset
     from unnest($1::uuid[]) x(id)
     join feture.profile p on p.id = x.id
     cross join lateral (select exists (select 1 from feture.profile_member pm where pm.profile_id = p.id and pm.account_id = $3 and pm.state = 'active') own) v
     left join feture.profile_details d on d.profile_id = p.id
     left join feture.account a on a.person_profile_id = p.id
     left join feture.media_asset m on m.id = p.avatar_asset_id
     where v.own or (p.state = 'active' and ($2::uuid is null or not feture.blocked($2, p.id)))`,
    [uniq, viewer.profileId, viewer.accountId]);
  await Promise.all(rows.map(async r => {
    let avatar = null;
    if (r.asset && media?.delivery && viewer.profileId) {
      const asset = typeof r.asset === 'string' ? JSON.parse(r.asset) : r.asset;
      const d = await mediaDto(media, asset, { viewerProfileId: viewer.profileId, place: 'public', showExplicit: false }).catch(() => null);
      avatar = d && !d.blurred && d.src ? (d.src.thumb ?? d.src.card ?? null) : null;
    }
    out.set(r.id, { avatar, age: r.birth_date ? ageOn(String(r.birth_date).slice(0, 10)) : null, photoVerified: !!r.pv, premium: !!r.premium, kind: /** @type {'person' | 'couple'} */ (r.kind) });
  }));
  // A couple with no photo of its own: each partner's photo for the two halves, in the order of the couple's name.
  const bare = rows.filter(r => r.kind === 'couple' && !out.get(r.id)?.avatar).map(r => r.id);
  if (bare.length && media?.delivery && viewer.profileId) {
    const ms = await q.query(
      `select m.profile_id couple_id, pp.name, pp.handle, case when ma.id is null then null else to_jsonb(ma) end asset
       from feture.profile_member m join feture.account a on a.id = m.account_id join feture.profile pp on pp.id = a.person_profile_id
       left join feture.media_asset ma on ma.id = pp.avatar_asset_id
       where m.profile_id = any($1::uuid[]) and m.state = 'active' order by pp.created_at, pp.id`, [bare]);
    /** @type {Map<string, {name: string | null, avatar: string | null}[]>} */
    const halves = new Map();
    await Promise.all(ms.map(async (m, i) => {
      let avatar = null;
      if (m.asset && viewer.profileId) {
        const asset = typeof m.asset === 'string' ? JSON.parse(m.asset) : m.asset;
        const d = await mediaDto(media, asset, { viewerProfileId: viewer.profileId, place: 'public', showExplicit: false }).catch(() => null);
        avatar = d && !d.blurred && d.src ? (d.src.thumb ?? d.src.card ?? null) : null;
      }
      ms[i] = { ...m, avatar };
    }));
    for (const m of ms) halves.set(m.couple_id, [...(halves.get(m.couple_id) ?? []), { name: m.name || m.handle || null, avatar: m.avatar }]);
    for (const [id, h] of halves) { const f = out.get(id); if (f && h.length === 2) f.halves = h; }
  }
  return out;
}

/** Adds the face fields to each profile object found by `pick` (in place) and returns the list.
 * @template T @param {Q} q @param {MediaConfig | null | undefined} media @param {{profileId: string | null, accountId: string}} viewer
 * @param {T[]} items @param {(item: T) => any} pick the profile object ({id, …}) of the row, or null */
export async function withFaces(q, media, viewer, items, pick) {
  const map = await facesOf(q, media, viewer, items.map(i => pick(i)?.id));
  for (const i of items) {
    const p = pick(i);
    if (p?.id) Object.assign(p, map.get(p.id) ?? NO_FACE);
  }
  return items;
}
