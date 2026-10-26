// @ts-check
import { meCommands, NOTIFICATION_DEFAULTS, PROFILE_SETTINGS } from '../../contracts/me.mjs';
import { fail, isUniqueViolation } from '../errors.mjs';
import { hmac } from '../hash.mjs';
import { mediaDto } from '../media/assets.mjs';
import { grantedScopes } from '../access.mjs';

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
});

/** Full years on the server's UTC date. @param {string} birthDate YYYY-MM-DD @param {Date} [now] */
export function ageOn(birthDate, now = new Date()) {
  const [y, m, d] = birthDate.split('-').map(Number);
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age--;
  return age;
}

/** Most generous reading of a birth date: the person counts as 18 if it is their 18th birthday anywhere on Earth
 * (UTC+14), so nobody is locked out on the morning of their birthday. @param {string} birthDate */
const ageAnywhere = birthDate => ageOn(birthDate, new Date(Date.now() + 14 * 3600e3));
/** Documents that must be accepted to register (V21 A04, AUTH-015). Registration refuses if any is not published. */
const MANDATORY_DOCS = ['terms', 'privacy', 'community', 'adult-content'];
/** Stems nobody may use at the start of a nickname, also through 0/o, 1/l/i, 3/e, 5/s look-alikes and separators. */
const RESERVED_STEMS = ['admin', 'support', 'moder', 'feture', 'official', 'staff', 'security', 'helpdesk', 'system', 'root', 'team'];
/** @param {string} h */
const skeleton = h => h.toLowerCase().replace(/[._]/g, '').replace(/0/g, 'o').replace(/[1i]/g, 'l').replace(/3/g, 'e').replace(/5/g, 's');

/** Per-account sliding window for lookups that reveal existence. @param {Q} q @param {string} accountId @param {string} kind
 * @param {number} max @param {string} window postgres interval */
async function limit(q, accountId, kind, max, window) {
  await q.query(`select pg_advisory_xact_lock(hashtext('feture-rate:' || $1 || ':' || $2))`, [accountId, kind]);
  const [{ n }] = await q.query(
    `select count(*)::int n from feture.rate_event where account_id = $1 and kind = $2 and created_at > now() - $3::interval`, [accountId, kind, window]);
  if (n >= max) fail(429, 'rate_limited');
  await q.query('insert into feture.rate_event (account_id, kind) values ($1, $2)', [accountId, kind]);
}

/** @param {Acting | null} acting @returns {Acting} */
const need = acting => { if (!acting) throw new Error('acting profile missing'); return acting; };
/** Writes of couple profiles need partner approvals (slice E). @param {Acting} acting */
const personOnly = acting => { if (acting.kind !== 'person') fail(422, 'rule_violation', { rule: 'couple_changes_not_available' }); };

/** Option codes must exist in the catalog and not be hidden. @param {Q} q @param {Record<string, unknown>} input */
async function checkOptions(q, input) {
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
async function handleState(q, h, self = null) {
  const sk = skeleton(h);
  if (RESERVED_STEMS.some(stem => sk.startsWith(skeleton(stem)))) return 'reserved';
  const [r] = await q.query(
    `select exists (select 1 from feture.reserved_handle where handle = lower($1) or handle = $2) reserved,
            exists (select 1 from feture.profile where lower(handle) = lower($1) and id is distinct from $3) taken,
            exists (select 1 from feture.handle_hold where handle = lower($1) and until > now() and profile_id is distinct from $3) held`,
    [h, sk, self]);
  return r.reserved ? 'reserved' : r.taken || r.held ? 'taken' : 'ok';
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
    `select p.id, p.kind, p.handle, p.name, p.state, p.rev, p.avatar_asset_id,
       d.bio, d.show_age, d.details_vis, d.genders, d.orients, d.roles, d.formats, d.seeks, d.status,
       pl.id city_id, pl.name_ru city_ru, pl.name_en city_en, pl.state city_state,
       a.birth_date,
       exists (select 1 from feture.profile_member m where m.profile_id = p.id and m.account_id = $2 and m.state = 'active') own
     from feture.profile p
     left join feture.profile_details d on d.profile_id = p.id
     left join feture.place pl on pl.id = d.city_id
     left join feture.account a on a.person_profile_id = p.id
     where p.id = $1`,
    [profileId, viewer.accountId]);
  if (!p || (!p.own && p.state !== 'active')) fail(404, 'not_found');
  const own = p.own;
  // Details: own view sees everything; others per details_vis (couples always show role/format/seek);
  // `granted` opens together with the private part's «Описание и интересы» (info) access.
  const detailsOpen = own || p.kind === 'couple' || p.details_vis === 'all'
    || (p.details_vis === 'granted' && (await grantedScopes(q, profileId, viewer)).includes('info'));
  const details = {};
  for (const field of Object.keys(DETAIL_KINDS)) {
    if (p.kind === 'couple' && !COUPLE_DETAILS.has(field)) continue;
    if (detailsOpen) /** @type {any} */ (details)[field] = p[field] ?? [];
  }
  if (p.kind === 'person' && detailsOpen) /** @type {any} */ (details).status = p.status ?? null;
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
    avatar,
    ...(own ? { rev: p.rev, showAge: !!p.show_age, detailsVis: p.details_vis ?? null, state: p.state } : {}),
  };
}

/** @type {Record<keyof typeof meCommands, Command['run']>} */
const run = {
  async 'catalog.get'(q) {
    const [categories, topics, options, places] = await Promise.all([
      q.query('select id, ru, en, plate from feture.topic_category where not hidden order by position'),
      q.query('select id, category_id "categoryId", ru, en, desc_ru "descRu", desc_en "descEn" from feture.topic where not hidden order by position'),
      q.query('select kind, code, ru, en from feture.profile_option where not hidden order by kind, position'),
      q.query(`select id, country, name_ru ru, name_en en from feture.place where state = 'approved' order by coalesce(name_en, name_ru)`),
    ]);
    return { categories, topics, options, places };
  },

  async 'nick.check'(q, { input, account }) {
    await limit(q, account.id, 'nick.check', 30, '10 minutes');
    const parsed = meCommands['account.create'].input.shape.handle.safeParse(input.handle);
    if (!parsed.success) return { available: false, reason: 'format' };
    const state = await handleState(q, parsed.data);
    return state === 'ok' ? { available: true } : { available: false, reason: state };
  },

  async 'account.create'(q, { account, input, cfg, coreAccountHash }) {
    const [acc] = await q.query(
      'select person_profile_id, coalesce(age_verified_until > now(), false) verified from feture.account where id = $1 for update', [account.id]);
    if (acc.person_profile_id) fail(409, 'conflict', { state: 'registered' });
    // A future date or an impossible age is a typo, not an age: refused without leaving any marker.
    if (Date.parse(input.birthDate) > Date.now() + 14 * 3600e3 || ageOn(input.birthDate) > 110) fail(400, 'invalid_input', { fields: ['birthDate'] });
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
        `insert into feture.profile (kind, handle, name) values ('person', $1, $1) returning id`, [input.handle]);
    } catch (error) {
      if (isUniqueViolation(error)) fail(409, 'conflict', { field: 'handle' });
      throw error;
    }
    await q.query(`insert into feture.profile_member (profile_id, profile_kind, account_id, joined_at) values ($1, 'person', $2, now())`, [profileId, account.id]);
    await q.query(`insert into feture.profile_details (profile_id, show_age, details_vis) values ($1, true, 'only')`, [profileId]);
    await q.query('insert into feture.profile_settings (profile_id) values ($1)', [profileId]);
    await q.query(
      `update feture.account set person_profile_id = $2, birth_date = $3, news_opt_in = $4, updated_at = now() where id = $1`,
      [account.id, profileId, input.birthDate, input.newsOptIn]);
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
    // AUTH-019: in Discover by default, but nobody sees a profile without an approved photo.
    return { discoverVisible: input.discover === 'visible' && photo, photoNeeded: input.discover === 'visible' && !photo };
  },

  async 'profile.get'(q, { acting, input, cfg }) {
    return { profile: await profileView(q, need(acting), input.profileId, cfg.media) };
  },

  async 'profile.update'(q, { acting: a, input }) {
    const acting = need(a);
    personOnly(acting);
    await checkOptions(q, input);
    const [p] = await q.query(
      `select rev, handle, handle_changed_at > now() - interval '30 days' recently from feture.profile where id = $1 for update`, [acting.profileId]);
    if (p.rev !== input.rev) fail(409, 'conflict', { rev: p.rev });
    if (input.handle !== undefined && input.handle !== p.handle) {
      if (input.handle.toLowerCase() !== String(p.handle).toLowerCase()) {
        if (p.recently) fail(422, 'rule_violation', { rule: 'handle_change_cooldown' });
        if (await handleState(q, input.handle, acting.profileId) !== 'ok') fail(409, 'conflict', { field: 'handle' });
        // The old nickname stays held for 30 days: nobody else can take it and pose as the previous owner.
        await q.query(
          `insert into feture.handle_hold (handle, profile_id, until) values (lower($1), $2, now() + interval '30 days')
           on conflict (handle) do update set profile_id = excluded.profile_id, until = excluded.until`, [p.handle, acting.profileId]);
      }
      try {
        // Only a new nickname starts the 30-day cooldown; changing letter case does not.
        await q.query(
          `update feture.profile set handle = $2, handle_changed_at = case when lower(handle) = lower($2) then handle_changed_at else now() end where id = $1`,
          [acting.profileId, input.handle]);
      } catch (error) {
        if (isUniqueViolation(error)) fail(409, 'conflict', { field: 'handle' });
        throw error;
      }
    }
    if (input.cityId) {
      // Own submitted cities may be used at once; others' pending or rejected ones may not.
      const [c] = await q.query(
        `select 1 from feture.place where id = $1 and (state = 'approved' or (state = 'pending' and submitted_by = $2))`,
        [input.cityId, acting.accountId]);
      if (!c) fail(400, 'invalid_input', { fields: ['cityId'] });
    }
    if (input.name !== undefined) await q.query('update feture.profile set name = $2 where id = $1', [acting.profileId, input.name]);
    /** @type {[string, unknown][]} */
    const sets = [];
    const map = { bio: 'bio', cityId: 'city_id', showAge: 'show_age', detailsVis: 'details_vis', genders: 'genders', orients: 'orients', roles: 'roles', formats: 'formats', seeks: 'seeks', status: 'status' };
    for (const [k, col] of Object.entries(map)) if (input[k] !== undefined) sets.push([col, input[k]]);
    if (sets.length) {
      await q.query(
        `update feture.profile_details set ${sets.map(([col], i) => `${col} = $${i + 2}`).join(', ')}, updated_at = now() where profile_id = $1`,
        [acting.profileId, ...sets.map(([, v]) => v)]);
    }
    const [{ rev }] = await q.query('update feture.profile set rev = rev + 1, updated_at = now() where id = $1 returning rev', [acting.profileId]);
    return { rev };
  },

  async 'profile.settings'(q, { acting }) {
    const [s] = await q.query('select * from feture.profile_settings where profile_id = $1', [need(acting).profileId]);
    if (!s) fail(404, 'not_found');
    return {
      settings: {
        discoverMode: s.discover_mode, acceptProfileLikes: s.accept_profile_likes, requestsFrom: s.requests_from,
        linksFrom: s.links_from, mentionsFrom: s.mentions_from, activityVis: s.activity_vis, showLikes: s.show_likes, privateOn: s.private_on,
      },
    };
  },

  async 'profile.setVisibility'(q, { acting: a, input }) {
    const acting = need(a);
    personOnly(acting);
    const col = SETTING_COLUMN[/** @type {keyof typeof PROFILE_SETTINGS} */ (input.setting)];
    await q.query(`update feture.profile_settings set ${col} = $2, updated_at = now() where profile_id = $1`, [acting.profileId, input.value]);
    return { setting: input.setting, value: input.value };
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
    await limit(q, account.id, 'place.submit', 5, '1 day');
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
      const [p] = await q.query(`select 1 from feture.profile where id = $1 and state = 'active'`, [input.profileId]);
      if (!p) fail(404, 'not_found');
    }
    // Others see public interests, plus «По доступу» ones with the info grant (ME-025: they open with the
    // description); a hard limit shows only that it is a limit (V21: «нельзя» without details).
    const info = !own && (await grantedScopes(q, input.profileId, acting)).includes('info');
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
    personOnly(acting);
    const [t] = await q.query('select category_id from feture.topic where id = $1 and not hidden', [input.topicId]);
    if (!t) fail(400, 'invalid_input', { fields: ['topicId'] });
    if (input.dir?.length && t.category_id === 'limits') fail(400, 'invalid_input', { fields: ['dir'] });
    const [prev] = await q.query(
      'select value, mark, dir, vis from feture.interest where profile_id = $1 and topic_id = $2 for update', [acting.profileId, input.topicId]);
    const next = { value: input.value ?? null, mark: input.mark ?? null, dir: input.mark ? [] : (input.dir ?? []), vis: input.vis };
    await q.query(
      `insert into feture.interest (profile_id, topic_id, value, mark, dir, vis) values ($1, $2, $3, $4, $5, $6)
       on conflict (profile_id, topic_id) do update set value = excluded.value, mark = excluded.mark, dir = excluded.dir, vis = excluded.vis, updated_at = now()`,
      [acting.profileId, input.topicId, next.value, next.mark, next.dir, next.vis]);
    const level = (/** @type {any} */ s) => s ? { value: s.value, mark: s.mark, dir: s.dir } : null;
    if (JSON.stringify(level(prev)) !== JSON.stringify(level(next))) {
      await q.query(
        `insert into feture.interest_history (profile_id, topic_id, kind, from_state, to_state, acted_by) values ($1, $2, 'value', $3, $4, $5)`,
        [acting.profileId, input.topicId, JSON.stringify(level(prev)), JSON.stringify(level(next)), acting.accountId]);
    }
    if (prev && prev.vis !== next.vis) {
      await q.query(
        `insert into feture.interest_history (profile_id, topic_id, kind, from_state, to_state, acted_by) values ($1, $2, 'vis', $3, $4, $5)`,
        [acting.profileId, input.topicId, JSON.stringify({ vis: prev.vis }), JSON.stringify({ vis: next.vis }), acting.accountId]);
    }
    return { topicId: input.topicId, ...next };
  },

  async 'interests.remove'(q, { acting: a, input }) {
    const acting = need(a);
    personOnly(acting);
    const [prev] = await q.query(
      'delete from feture.interest where profile_id = $1 and topic_id = $2 returning value, mark, dir', [acting.profileId, input.topicId]);
    if (prev) {
      await q.query(
        `insert into feture.interest_history (profile_id, topic_id, kind, from_state, to_state, acted_by) values ($1, $2, 'value', $3, null, $4)`,
        [acting.profileId, input.topicId, JSON.stringify(prev), acting.accountId]);
    }
    return { removed: !!prev };
  },

  async 'interests.history'(q, { acting, input }) {
    // Opaque keyset cursor over (created_at, id) at full precision: rows written in one statement are never skipped.
    let after = null;
    if (input.cursor) {
      try { after = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')); } catch { /* invalid below */ }
      if (!Array.isArray(after) || after.length !== 2 || typeof after[0] !== 'string' || typeof after[1] !== 'string') fail(400, 'invalid_input', { fields: ['cursor'] });
    }
    const rows = await q.query(
      `select id, topic_id, kind, from_state, to_state, source, created_at, created_at::text at_text from feture.interest_history
       where profile_id = $1 and ($2::text is null or (created_at, id) < ($2::timestamptz, $3::uuid))
       order by created_at desc, id desc limit $4`,
      [need(acting).profileId, after?.[0] ?? null, after?.[1] ?? null, input.limit + 1]);
    const page = rows.slice(0, input.limit);
    const last = page[page.length - 1];
    return {
      items: page.map(r => ({ id: r.id, topicId: r.topic_id, kind: r.kind, from: r.from_state, to: r.to_state, archived: r.source === 'test_archived', at: r.created_at })),
      next: rows.length > input.limit ? Buffer.from(JSON.stringify([last.at_text, last.id])).toString('base64url') : null,
    };
  },
};

/** @type {Record<string, Command>} */
export const me = Object.fromEntries(
  Object.entries(meCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
