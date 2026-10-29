// @ts-check
import { ABOUT_FACTS, meCommands, NOTIFICATION_DEFAULTS, PROFILE_SETTINGS } from '../../contracts/me.mjs';
import { fail, isUniqueViolation } from '../errors.mjs';
import { hmac } from '../hash.mjs';
import { mediaDto } from '../media/assets.mjs';
import { photosFor } from './photos.mjs';
import { photoVerifiedOf } from './verification.mjs';
import { PREMIUM_SQL, ageOn } from './faces.mjs';
import { grantedScopes } from '../access.mjs';
import { enqueue } from '../outbox.mjs';
import { narrowCouple, needsPartner, registerApprovalKind, requestApproval } from '../approvals.mjs';

/** Slice C «Я»: registration, onboarding, profile, settings, interests (S1 §3–4, S2-CATALOG «C»).
 * Couple profiles are read here; their writes go through partner approvals in slice E and are refused for now.
 * @typedef {import('../handler.mjs').Command} Command @typedef {import('../db.mjs').Q} Q
 * @typedef {import('../profiles.mjs').Acting} Acting
 */

const DETAIL_KINDS = /** @type {const} */ ({ genders: 'gender', orients: 'orient', roles: 'role', formats: 'format', seeks: 'seek' });
const COUPLE_DETAILS = new Set(['roles', 'formats', 'seeks']);
const SETTING_COLUMN = /** @type {Record<keyof typeof PROFILE_SETTINGS, string>} */ ({
  discoverMode: 'discover_mode', acceptProfileLikes: 'accept_profile_likes', requestsFrom: 'requests_from',
  linksFrom: 'links_from', mentionsFrom: 'mentions_from', activityVis: 'activity_vis', showLikes: 'show_likes',
  messagesFrom: 'messages_from',
});

/** Most generous reading of a birth date: the person counts as 18 if it is their 18th birthday anywhere on Earth
 * (UTC+14), so nobody is locked out on the morning of their birthday. @param {string} birthDate */
const ageAnywhere = birthDate => ageOn(birthDate, new Date(Date.now() + 14 * 3600e3));
/** Documents that must be accepted to register (V21 A04, AUTH-015). Registration refuses if any is not published. */
const MANDATORY_DOCS = ['terms', 'privacy', 'community', 'adult-content'];
/** Stems nobody may use at the start of a nickname, also through 0/o, 1/l/i, 3/e, 5/s look-alikes and separators. */
const RESERVED_STEMS = ['admin', 'support', 'moder', 'feture', 'official', 'staff', 'helpdesk'];
/** @param {string} h */
const skeleton = h => h.toLowerCase().replace(/[._]/g, '').replace(/0/g, 'o').replace(/[1i]/g, 'l').replace(/3/g, 'e').replace(/5/g, 's');

/** @param {Acting | null} acting @returns {Acting} */
const need = acting => { if (!acting) throw new Error('acting profile missing'); return acting; };
/** Person-only actions (onboarding). @param {Acting} acting */
const personOnly = acting => { if (acting.kind !== 'person') fail(422, 'rule_violation', { rule: 'couple_changes_not_available' }); };

/** Option codes must exist in the catalog and not be hidden. @param {Q} q @param {Record<string, unknown>} input */
export async function checkOptions(q, input) {
  for (const [field, kind] of Object.entries(DETAIL_KINDS)) {
    const list = /** @type {string[] | undefined} */ (input[field]);
    if (!list?.length) continue;
    const [{ n }] = await q.query(
      'select count(*)::int n from feture.profile_option where kind = $1 and code = any($2) and not hidden', [kind, list]);
    if (n !== list.length) fail(400, 'invalid_input', { fields: [field] });
  }
  if (input.status) {
    const rows = await q.query(`select 1 from feture.profile_option where kind = 'status' and code = $1 and not hidden`, [input.status]);
    if (!rows[0]) fail(400, 'invalid_input', { fields: ['status'] });
  }
}

/** @param {Q} q @param {string} h @param {string | null} [self] the profile renaming itself (its own hold does not count)
 * @returns {Promise<'ok' | 'reserved' | 'taken'>} */
export async function handleState(q, h, self = null) {
  const sk = skeleton(h);
  // Service-like stems anywhere in the nickname (the_admin, real_feture), through look-alikes.
  if (RESERVED_STEMS.some(stem => sk.includes(skeleton(stem)))) return 'reserved';
  const reserved = await q.query('select handle from feture.reserved_handle');
  if (reserved.some(r => skeleton(r.handle) === sk)) return 'reserved';
  const [r] = await q.query(
    `select exists (select 1 from feture.profile where lower(handle) = lower($1) and id is distinct from $2::uuid) taken,
            exists (select 1 from feture.handle_hold where handle = lower($1) and until > now() and profile_id is distinct from $2::uuid) held`,
    [h, self]);
  return r.taken || r.held ? 'taken' : 'ok';
}

/** Nick and name change limits (owner 29.10.2026): a nick once per 6 months, the first change after sign-up (or after a
 * couple forms) free; a name once per 2 weeks, the first fill and one correction free. A letter-case change is free. */
const NICK_EVERY = "interval '6 months'", NAME_EVERY = "interval '14 days'", NAME_FREE = 2;
const LIMITS_SQL = (/** @type {string} */ p) => `case when ${p}.handle_changes > 0 then ${p}.handle_changed_at + ${NICK_EVERY} end nick_at,
  case when ${p}.name_changes >= ${NAME_FREE} then ${p}.name_changed_at + ${NAME_EVERY} end name_at, now() now_at`;
/** The moment as ISO when it is still ahead, else null (may change now). @param {any} at @param {any} now */
const ahead = (at, now) => at && new Date(at) > new Date(now) ? new Date(at).toISOString() : null;

/** The profile's nick, chosen name and limits. @param {Q} q @param {string} profileId @param {boolean} lock */
async function identityRow(q, profileId, lock) {
  const [p] = await q.query(`select p.handle, p.chosen_name, ${LIMITS_SQL('p')} from feture.profile p where p.id = $1 ${lock ? 'for update' : ''}`, [profileId]);
  return p;
}

/** Refuses a nick or name change the limits do not allow yet (with `until`), or a nick that is not free.
 * @param {Q} q @param {string} profileId @param {{handle?: string, name?: string}} input @param {any} p identityRow */
async function checkIdentity(q, profileId, input, p) {
  const nick = input.handle !== undefined && input.handle.toLowerCase() !== String(p.handle ?? '').toLowerCase();
  if (nick) {
    const until = ahead(p.nick_at, p.now_at);
    if (until) fail(422, 'rule_violation', { rule: 'handle_change_cooldown', until });
    if (await handleState(q, /** @type {string} */ (input.handle), profileId) !== 'ok') fail(409, 'conflict', { field: 'handle' });
  }
  const name = input.name !== undefined && input.name !== p.chosen_name;
  if (name) {
    const until = ahead(p.name_at, p.now_at);
    if (until) fail(422, 'rule_violation', { rule: 'name_change_cooldown', until });
  }
  return { nick, name };
}

/** Writes a new nick and / or chosen name within the limits; `name` (what everyone sees) follows by trigger.
 * Shared by profile.update (also an approved couple change) and couple.setup.
 * @param {Q} q @param {string} profileId @param {{handle?: string, name?: string}} input */
export async function writeIdentity(q, profileId, input) {
  const p = await identityRow(q, profileId, true);
  const { nick, name } = await checkIdentity(q, profileId, input, p);
  if (input.handle !== undefined && input.handle !== p.handle) {
    // The old nickname stays held for 30 days: nobody else can take it and pose as the previous owner.
    if (nick && p.handle) {
      await q.query(
        `insert into feture.handle_hold (handle, profile_id, until) values (lower($1), $2, now() + interval '30 days')
         on conflict (handle) do update set profile_id = excluded.profile_id, until = excluded.until`, [p.handle, profileId]);
    }
    try {
      await q.query(
        `update feture.profile set handle = $2, handle_changed_at = case when $3 then now() else handle_changed_at end,
           handle_changes = handle_changes + case when $3 then 1 else 0 end where id = $1`, [profileId, input.handle, nick]);
    } catch (error) {
      if (isUniqueViolation(error)) fail(409, 'conflict', { field: 'handle' });
      throw error;
    }
  }
  if (name) {
    await q.query(`update feture.profile set chosen_name = $2, name_changed_at = now(), name_changes = name_changes + 1 where id = $1`, [profileId, input.name]);
  }
}

/** Current documents that must be accepted. Fails closed: if any mandatory document is not published (or not
 * readable) in this locale, nobody registers. @param {Q} q @param {string} locale */
async function requiredDocuments(q, locale) {
  const [{ exists }] = await q.query(`select to_regclass('public.feture_document_current') is not null "exists"`);
  if (!exists) fail(503, 'unavailable');
  const rows = await q.query(
    `select id::text, document_key, content_hash from public.feture_document_current where locale = $1 and requires_accept`, [locale]);
  if (!MANDATORY_DOCS.every(k => rows.some(r => r.document_key === k))) fail(503, 'unavailable');
  return rows;
}

/** Viewer-dependent projection of a profile (S1 §4). Blocks join this check in slice F. @param {Q} q
 * @param {Acting} viewer @param {string} profileId @param {import('../media/assets.mjs').MediaConfig} media */
async function profileView(q, viewer, profileId, media) {
  const [p] = await q.query(
    `select p.id, p.kind, p.handle, p.name, p.state, p.rev, p.avatar_asset_id, p.chosen_name, p.handle_changes, ${LIMITS_SQL('p')},
       d.bio, d.show_age, d.details_vis, d.genders, d.orients, d.roles, d.formats, d.seeks, d.status,
       d.height, d.smoking, d.alcohol, d.kids, d.langs, d.zodiac,
       pl.id city_id, pl.name_ru city_ru, pl.name_en city_en, pl.state city_state,
       a.birth_date, ${PREMIUM_SQL} premium,
       exists (select 1 from feture.profile_member m where m.profile_id = p.id and m.account_id = $2 and m.state = 'active') own
     from feture.profile p
     left join feture.profile_details d on d.profile_id = p.id
     left join feture.place pl on pl.id = d.city_id
     left join feture.account a on a.person_profile_id = p.id
     where p.id = $1`,
    [profileId, viewer.accountId]);
  if (!p || (!p.own && p.state !== 'active')) fail(404, 'not_found');
  // Blocked either way: the profile does not exist for the viewer (S1 §0.6).
  if (!p.own && (await q.query('select feture.blocked($1, $2) b', [viewer.profileId, profileId]))[0].b) fail(404, 'not_found');
  const own = p.own;
  // Details: own view sees everything; others per details_vis (couples always show role/format/seek);
  // `granted` opens together with the private part's «Описание» (info) access.
  const detailsOpen = own || p.kind === 'couple' || p.details_vis === 'all'
    || (p.details_vis === 'granted' && (await grantedScopes(q, profileId, viewer)).includes('info'));
  const details = {};
  for (const field of Object.keys(DETAIL_KINDS)) {
    if (p.kind === 'couple' && !COUPLE_DETAILS.has(field)) continue;
    if (detailsOpen) /** @type {any} */ (details)[field] = p[field] ?? [];
  }
  if (p.kind === 'person' && detailsOpen) /** @type {any} */ (details).status = p.status ?? null;
  const about = p.kind === 'person' ? aboutOf(p) : {};
  const city = p.city_id && (own || p.city_state === 'approved') ? { id: p.city_id, ru: p.city_ru, en: p.city_en, pending: p.city_state !== 'approved' } : null;
  let avatar = null;
  if (p.avatar_asset_id) {
    const [asset] = await q.query('select * from feture.media_asset where id = $1', [p.avatar_asset_id]);
    if (asset) avatar = await mediaDto(media, asset, { viewerProfileId: viewer.profileId, place: 'public', showExplicit: false, staff: false }).catch(() => null);
  }
  return {
    id: p.id, kind: p.kind, handle: p.handle, name: p.name || p.handle, own,
    bio: p.bio ?? '',
    age: p.kind === 'person' && p.birth_date && (own || p.show_age) ? ageOn(String(p.birth_date instanceof Date ? p.birth_date.toISOString().slice(0, 10) : p.birth_date)) : null,
    city,
    details,
    about,
    avatar,
    photos: await photosFor(q, p.id, viewer.profileId, media),
    photoVerified: (await photoVerifiedOf(q, [p.id])).get(p.id) ?? false, // only the yes/no, never the check itself (V01)
    premium: !!p.premium, // the public gold badge (V10 «Значки»), never the end date

    ...(own ? {
      rev: p.rev, showAge: !!p.show_age, detailsVis: p.details_vis ?? null, state: p.state,
      // The edit screen: what the person typed (empty — the nick is shown) and when the nick / name may change next.
      chosenName: p.chosen_name, nickAt: ahead(p.nick_at, p.now_at), nameAt: ahead(p.name_at, p.now_at), nickFirst: p.handle_changes === 0,
    } : {}),
  };
}

/** «Обо мне» facts: always visible to everyone (owner 29.10.2026, no per-fact audience) — every filled one.
 * @param {Record<string, any>} p */
function aboutOf(p) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const k of ABOUT_FACTS) {
    const v = p[k];
    if (v === null || v === undefined || (Array.isArray(v) && !v.length)) continue;
    out[k] = v;
  }
  return out;
}

/** Fields only a person has (couples take theirs from the members' personal profiles). */
const PERSON_FIELDS = ['showAge', 'detailsVis', 'genders', 'orients', 'status', ...ABOUT_FACTS];

/** Profile edit, shared by the direct path and an approved couple change. Re-checks the revision.
 * @param {Q} q @param {string} profileId @param {string} accountId @param {Record<string, any>} input */
async function doProfileUpdate(q, profileId, accountId, input) {
  await checkOptions(q, input);
  const [p] = await q.query(`select rev from feture.profile where id = $1 for update`, [profileId]);
  if (p.rev !== input.rev) fail(409, 'conflict', { rev: p.rev });
  await writeIdentity(q, profileId, input);
  if (input.cityId) {
    // Own submitted cities may be used at once; others' pending or rejected ones may not.
    const [c] = await q.query(
      `select 1 from feture.place where id = $1 and (state = 'approved' or (state = 'pending' and submitted_by = $2))`, [input.cityId, accountId]);
    if (!c) fail(400, 'invalid_input', { fields: ['cityId'] });
  }
  /** @type {[string, unknown][]} */
  const sets = [];
  const map = { bio: 'bio', cityId: 'city_id', showAge: 'show_age', detailsVis: 'details_vis', genders: 'genders', orients: 'orients', roles: 'roles', formats: 'formats', seeks: 'seeks', status: 'status',
    height: 'height', smoking: 'smoking', alcohol: 'alcohol', kids: 'kids', langs: 'langs', zodiac: 'zodiac' };
  for (const [k, col] of Object.entries(map)) if (input[k] !== undefined) sets.push([col, input[k]]);
  if (sets.length) {
    await q.query(
      `update feture.profile_details set ${sets.map(([col], i) => `${col} = $${i + 2}, `).join('')}updated_at = now() where profile_id = $1`,
      [profileId, ...sets.map(([, v]) => v)]);
  }
  const [{ rev }] = await q.query('update feture.profile set rev = rev + 1, updated_at = now() where id = $1 returning rev', [profileId]);
  return { rev };
}

/** Setting values from most closed to most open: a move to the left narrows (immediate for a couple). */
const OPENNESS = /** @type {Record<string, unknown[]>} */ ({
  discoverMode: ['off', 'hidden', 'visible'], acceptProfileLikes: [false, true], requestsFrom: ['none', 'matches', 'all'],
  linksFrom: ['none', 'follow', 'all'], mentionsFrom: ['none', 'follow', 'all'], activityVis: ['off', 'followers', 'all'], showLikes: [false, true],
  messagesFrom: ['none', 'known', 'all'],
});

/** @param {Q} q @param {string} profileId @param {keyof typeof PROFILE_SETTINGS} setting @param {unknown} value */
async function doSetVisibility(q, profileId, setting, value) {
  if (setting === 'discoverMode' && value === 'visible') {
    // A couple shows up in Discover only when both partners confirmed they are adults (pairMode).
    const [x] = await q.query(
      `select p.kind, coalesce(bool_and(coalesce(a.age_verified_until > now(), false)), false) ok from feture.profile p
       join feture.profile_member m on m.profile_id = p.id and m.state = 'active' join feture.account a on a.id = m.account_id
       where p.id = $1 group by p.kind`, [profileId]);
    if (x?.kind === 'couple' && !x.ok) fail(422, 'rule_violation', { rule: 'age_not_verified' });
  }
  await q.query(`update feture.profile_settings set ${SETTING_COLUMN[setting]} = $2, updated_at = now() where profile_id = $1`, [profileId, value]);
  return { setting, value };
}

/** Interest upsert, shared by the direct path and an approved couple change.
 * @param {Q} q @param {string} profileId @param {string} _accountId @param {Record<string, any>} input */
async function doInterestSet(q, profileId, _accountId, input) {
  const [t] = await q.query('select category_id from feture.topic where id = $1 and not hidden', [input.topicId]);
  if (!t) fail(400, 'invalid_input', { fields: ['topicId'] });
  if (input.dir?.length && t.category_id === 'limits') fail(400, 'invalid_input', { fields: ['dir'] });
  const next = { value: input.value ?? null, mark: input.mark ?? null, dir: input.mark ? [] : (input.dir ?? []), vis: input.vis };
  await q.query(
    `insert into feture.interest (profile_id, topic_id, value, mark, dir, vis) values ($1, $2, $3, $4, $5, $6)
     on conflict (profile_id, topic_id) do update set value = excluded.value, mark = excluded.mark, dir = excluded.dir, vis = excluded.vis, updated_at = now()`,
    [profileId, input.topicId, next.value, next.mark, next.dir, next.vis]);
  return { topicId: input.topicId, ...next };
}

/** One visibility setting as the acting profile: a person's applies at once; a couple's narrowing applies at once (hiding
 * from Discover voids pending widenings), a widening waits for the partner when they ask to approve. Shared by
 * profile.setVisibility and couple.setup. @param {Q} q @param {Acting} acting @param {keyof typeof PROFILE_SETTINGS} setting @param {any} value */
export async function setVisibilityAs(q, acting, setting, value) {
  if (acting.kind === 'couple') {
    const [cur] = await q.query(`select ${SETTING_COLUMN[setting]} v from feture.profile_settings where profile_id = $1`, [acting.profileId]);
    const order = OPENNESS[setting];
    const widening = order.indexOf(value) > order.indexOf(cur.v);
    if (!widening) {
      if (setting === 'discoverMode') await narrowCouple(q, acting, 'discover_narrowed');
      const out = await doSetVisibility(q, acting.profileId, setting, value);
      await enqueue(q, 'couple.changed', acting.profileId, { for: acting.partnerAccountId, what: setting });
      return out;
    }
    if (needsPartner(acting, 'profile.setVisibility')) {
      return { pending: await requestApproval(q, acting, { kind: 'profile.setVisibility', targetType: 'setting:' + setting, targetId: null, change: { setting, value }, summary: [setting] }) };
    }
    const out = await doSetVisibility(q, acting.profileId, setting, value);
    await enqueue(q, 'couple.changed', acting.profileId, { for: acting.partnerAccountId, what: setting });
    return out;
  }
  return doSetVisibility(q, acting.profileId, setting, value);
}

// Couple changes waiting for the partner are applied by the same code, as the partner who asked.
registerApprovalKind('profile.update', { apply: async (q, row) => { await doProfileUpdate(q, row.profile_id, row.requested_by, row.change); } });
registerApprovalKind('profile.setVisibility', {
  apply: async (q, row) => { await doSetVisibility(q, row.profile_id, /** @type {any} */ (row.change.setting), row.change.value); },
});
registerApprovalKind('interests.set', { apply: async (q, row) => { await doInterestSet(q, row.profile_id, row.requested_by, row.change); } });

/** @type {Record<keyof typeof meCommands, Command['run']>} */
const run = {
  async 'catalog.get'(q) {
    const [categories, topics, options, places] = await Promise.all([
      q.query('select id, ru, en, plate from feture.topic_category where not hidden order by position'),
      q.query('select id, category_id "categoryId", ru, en, desc_ru "descRu", desc_en "descEn" from feture.topic where not hidden order by position'),
      q.query('select kind, code, ru, en from feture.profile_option where not hidden order by kind, position'),
      q.query(`select id, code, country, name_ru ru, name_en en from feture.place where state = 'approved' order by coalesce(name_en, name_ru)`),
    ]);
    return { categories, topics, options, places };
  },

  async 'nick.check'(q, { input }) {
    const parsed = meCommands['account.create'].input.shape.handle.safeParse(input.handle);
    if (!parsed.success) return { available: false, reason: 'format' };
    const state = await handleState(q, parsed.data);
    return state === 'ok' ? { available: true } : { available: false, reason: state };
  },

  async 'account.create'(q, { account, input, cfg, coreAccountHash, coreQa }) {
    const [acc] = await q.query(
      'select person_profile_id, coalesce(age_verified_until > now(), false) verified from feture.account where id = $1 for update', [account.id]);
    if (acc.person_profile_id) fail(409, 'conflict', { state: 'registered' });
    // A future date or an impossible age is a typo, not an age: refused without leaving any marker.
    // A date in the future, of a small child (a picker default) or of 110+ years is a typo: no marker.
    if (Date.parse(input.birthDate) > Date.now() + 14 * 3600e3 || ageOn(input.birthDate) < 5 || ageOn(input.birthDate) > 110) {
      fail(400, 'invalid_input', { fields: ['birthDate'] });
    }
    // Keyed on the Core login without its generation, so deleting and re-creating the login does not erase it.
    const u18Key = hmac(String(cfg.pepper), 'feture-u18:v1:' + coreAccountHash);
    if (ageAnywhere(input.birthDate) < 18) {
      // Nothing about the person is kept except that an under-18 attempt happened (AUTH-023).
      await q.query('insert into feture.u18_event (key_hmac) values ($1)', [u18Key]);
      return { ok: false, rule: 'under_18' };
    }
    // After an under-18 attempt a new date alone is not enough: the age must be verified (provider or staff).
    const [{ seen }] = await q.query('select exists (select 1 from feture.u18_event where key_hmac = $1) seen', [u18Key]);
    if (seen && !acc.verified) fail(422, 'rule_violation', { rule: 'age_check_required' });
    const docs = await requiredDocuments(q, input.locale);
    const given = new Map(input.documents.map((/** @type {any} */ d) => [d.id, d.contentHash]));
    const missing = docs.filter(d => given.get(d.id) !== d.content_hash).map(d => d.document_key);
    if (missing.length) fail(422, 'rule_violation', { rule: 'documents_required', documents: missing });
    if (await handleState(q, input.handle) !== 'ok') fail(409, 'conflict', { field: 'handle' });
    let profileId;
    try {
      [{ id: profileId }] = await q.query(
        `insert into feture.profile (kind, handle, chosen_name, name_changes, name_changed_at) values ('person', $1, $2, $3, case when $3 > 0 then now() end) returning id`,
        [input.handle, input.name ?? '', input.name ? 1 : 0]);
    } catch (error) {
      if (isUniqueViolation(error)) fail(409, 'conflict', { field: 'handle' });
      throw error;
    }
    await q.query(`insert into feture.profile_member (profile_id, profile_kind, account_id, joined_at) values ($1, 'person', $2, now())`, [profileId, account.id]);
    await q.query(`insert into feture.profile_details (profile_id, show_age, details_vis) values ($1, true, 'only')`, [profileId]);
    // Owner 28.10.2026: a new account starts outside Discover; it is switched on with a photo (onboarding or «Видимость»).
    await q.query(`insert into feture.profile_settings (profile_id, discover_mode) values ($1, 'off')`, [profileId]);
    await q.query(
      `update feture.account set person_profile_id = $2, birth_date = $3, news_opt_in = $4, qa = $5, updated_at = now() where id = $1`,
      [account.id, profileId, input.birthDate, input.newsOptIn, !!coreQa]);
    for (const d of docs) {
      await q.query(
        `insert into feture.consent (account_id, document_version_id, document_key, content_hash, locale) values ($1, $2, $3, $4, $5) on conflict do nothing`,
        [account.id, d.id, d.document_key, d.content_hash, input.locale]);
    }
    return { ok: true, profileId };
  },

  async 'onboarding.complete'(q, { acting: a, input, account }) {
    const acting = need(a);
    personOnly(acting);
    await checkOptions(q, input);
    await q.query(
      `update feture.profile_details set details_vis = $2, genders = $3, orients = $4, roles = $5, formats = $6, seeks = $7, status = $8, updated_at = now()
       where profile_id = $1`,
      [acting.profileId, input.detailsVis, input.genders, input.orients, input.roles, input.formats, input.seeks, input.status]);
    await q.query(`update feture.profile_settings set discover_mode = $2, updated_at = now() where profile_id = $1`, [acting.profileId, input.discover]);
    await q.query(`update feture.account set onboarded_at = coalesce(onboarded_at, now()), updated_at = now() where id = $1`, [account.id]);
    const [{ photo }] = await q.query(
      `select exists (select 1 from feture.profile p join feture.media_asset m on m.id = p.avatar_asset_id where p.id = $1 and m.state = 'approved') photo`,
      [acting.profileId]);
    // Off unless chosen (owner 28.10.2026); nobody sees a profile without an approved photo, so a pending one waits for review.
    return { discoverVisible: input.discover === 'visible' && photo, photoNeeded: input.discover === 'visible' && !photo };
  },

  async 'profile.get'(q, { acting, input, cfg }) {
    return { profile: await profileView(q, need(acting), input.profileId, cfg.media) };
  },

  async 'profile.update'(q, { acting: a, input }) {
    const acting = need(a);
    const { opId: _, ...change } = input;
    if (acting.kind === 'couple') {
      const personal = PERSON_FIELDS.filter(k => change[k] !== undefined);
      if (personal.length) fail(400, 'invalid_input', { fields: personal });
      await checkOptions(q, change);
      if (needsPartner(acting, 'profile.update')) {
        const [p] = await q.query('select rev from feture.profile where id = $1', [acting.profileId]);
        if (p.rev !== change.rev) fail(409, 'conflict', { rev: p.rev });
        // A nick or name the limits refuse is refused now, not after the partner said yes.
        await checkIdentity(q, acting.profileId, change, await identityRow(q, acting.profileId, false));
        return { pending: await requestApproval(q, acting, { kind: 'profile.update', targetType: 'profile', targetId: acting.profileId, change, summary: Object.keys(change).filter(k => k !== 'rev') }) };
      }
      const out = await doProfileUpdate(q, acting.profileId, acting.accountId, change);
      await enqueue(q, 'couple.changed', acting.profileId, { for: acting.partnerAccountId, what: 'profile' });
      return out;
    }
    return doProfileUpdate(q, acting.profileId, acting.accountId, change);
  },

  async 'profile.settings'(q, { acting }) {
    const [s] = await q.query('select * from feture.profile_settings where profile_id = $1', [need(acting).profileId]);
    if (!s) fail(404, 'not_found');
    return {
      settings: {
        discoverMode: s.discover_mode, acceptProfileLikes: s.accept_profile_likes, requestsFrom: s.requests_from,
        linksFrom: s.links_from, mentionsFrom: s.mentions_from, activityVis: s.activity_vis, showLikes: s.show_likes, privateOn: s.private_on,
        messagesFrom: s.messages_from,
      },
    };
  },

  async 'profile.setVisibility'(q, { acting: a, input }) {
    return setVisibilityAs(q, need(a), /** @type {keyof typeof PROFILE_SETTINGS} */ (input.setting), input.value);
  },

  async 'settings.get'(q, { account }) {
    const [a] = await q.query('select locale, chat_blur, news_opt_in, show_explicit from feture.account where id = $1', [account.id]);
    return { settings: { locale: a.locale, chatBlur: a.chat_blur, newsOptIn: a.news_opt_in, showExplicit: a.show_explicit } };
  },

  async 'settings.update'(q, { account, input }) {
    await q.query(
      `update feture.account set locale = coalesce($2, locale), chat_blur = coalesce($3, chat_blur), news_opt_in = coalesce($4, news_opt_in), updated_at = now()
       where id = $1`,
      [account.id, input.locale ?? null, input.chatBlur ?? null, input.newsOptIn ?? null]);
    return { ok: true };
  },

  async 'notifications.settings.get'(q, { account }) {
    const [r] = await q.query('select settings from feture.notification_settings where account_id = $1', [account.id]);
    return { settings: r?.settings ?? NOTIFICATION_DEFAULTS };
  },

  async 'notifications.settings.update'(q, { account, input }) {
    await q.query(
      `insert into feture.notification_settings (account_id, settings) values ($1, $2)
       on conflict (account_id) do update set settings = excluded.settings, updated_at = now()`,
      [account.id, JSON.stringify(input.settings)]);
    return { ok: true };
  },

  async 'place.submit'(q, { account, input }) {
    const [p] = await q.query(
      `insert into feture.place (country, name_ru, name_en, state, submitted_by) values ($1, $2, $2, 'pending', $3) returning id`,
      [input.country, input.name, account.id]);
    return { placeId: p.id, pending: true };
  },

  async 'interests.list'(q, { acting: a, input }) {
    const acting = need(a);
    const [{ own }] = await q.query(
      `select exists (select 1 from feture.profile_member where profile_id = $1 and account_id = $2 and state = 'active') own`,
      [input.profileId, acting.accountId]);
    if (!own) {
      const [p] = await q.query(`select feture.blocked($2, id) b from feture.profile where id = $1 and state = 'active'`, [input.profileId, acting.profileId]);
      if (!p || p.b) fail(404, 'not_found');
    }
    // Others see public interests, plus «По доступу» ones with the interests grant; a hard limit shows only that it
    // is a limit (V21: «нельзя» without details).
    const info = !own && (await grantedScopes(q, input.profileId, acting)).includes('interests');
    const rows = await q.query(
      `select i.topic_id, i.value, i.mark, i.dir, i.vis from feture.interest i join feture.topic t on t.id = i.topic_id
       where i.profile_id = $1 and ($2 or ((i.vis = 'public' or (i.vis = 'granted' and $3)) and not t.hidden)) order by t.position`,
      [input.profileId, own, info]);
    return {
      items: rows.map(r => own
        ? { topicId: r.topic_id, value: r.value, mark: r.mark, dir: r.dir, vis: r.vis }
        : r.mark === 'hard' ? { topicId: r.topic_id, mark: 'hard' } : { topicId: r.topic_id, value: r.value, mark: r.mark, dir: r.dir }),
    };
  },

  async 'interests.set'(q, { acting: a, input }) {
    const acting = need(a);
    const { opId: _, ...change } = input;
    // For a couple, a change that only closes (the interest becomes less visible) never waits for the partner.
    const VIS = ['only', 'granted', 'public'];
    const [prev] = acting.kind === 'couple'
      ? await q.query('select value, mark, dir, vis from feture.interest where profile_id = $1 and topic_id = $2', [acting.profileId, change.topicId]) : [];
    // Narrowing = the same content shown to fewer people, or the interest becomes private; new content always counts as a change.
    const sameContent = !!prev && prev.value === (change.value ?? null) && prev.mark === (change.mark ?? null)
      && JSON.stringify([...prev.dir].sort()) === JSON.stringify([...(change.mark ? [] : change.dir ?? [])].sort());
    const narrowing = !!prev && (change.vis === 'only' || (sameContent && VIS.indexOf(change.vis) < VIS.indexOf(prev.vis)));
    if (acting.kind === 'couple' && !narrowing && needsPartner(acting, 'interests.set')) {
      const [t] = await q.query('select 1 from feture.topic where id = $1 and not hidden', [change.topicId]);
      if (!t) fail(400, 'invalid_input', { fields: ['topicId'] });
      return { pending: await requestApproval(q, acting, { kind: 'interests.set', targetType: 'interest:' + change.topicId, targetId: null, change, summary: [change.topicId] }) };
    }
    const out = await doInterestSet(q, acting.profileId, acting.accountId, change);
    if (acting.kind === 'couple') await enqueue(q, 'couple.changed', acting.profileId, { for: acting.partnerAccountId, what: 'interests' });
    return out;
  },

  async 'interests.remove'(q, { acting: a, input }) {
    const acting = need(a);
    // Removing an interest only narrows what others may see: immediate for a couple too.
    const [prev] = await q.query(
      'delete from feture.interest where profile_id = $1 and topic_id = $2 returning value, mark, dir', [acting.profileId, input.topicId]);
    if (prev) {
      if (acting.kind === 'couple') await enqueue(q, 'couple.changed', acting.profileId, { for: acting.partnerAccountId, what: 'interests' });
    }
    return { removed: !!prev };
  },
};

/** @type {Record<string, Command>} */
export const me = Object.fromEntries(
  Object.entries(meCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
