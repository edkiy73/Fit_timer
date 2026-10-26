// @ts-check
import { meCommands, NOTIFICATION_DEFAULTS, PROFILE_SETTINGS } from '../../contracts/me.mjs';
import { fail, isUniqueViolation } from '../errors.mjs';
import { hmac } from '../hash.mjs';
import { mediaDto } from '../media/assets.mjs';

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

/** @param {Q} q @param {string} h @returns {Promise<'ok' | 'reserved' | 'taken'>} */
async function handleState(q, h) {
  const [r] = await q.query(
    `select exists (select 1 from feture.reserved_handle where handle = lower($1)) reserved,
            exists (select 1 from feture.profile where lower(handle) = lower($1)) taken`, [h]);
  return r.reserved ? 'reserved' : r.taken ? 'taken' : 'ok';
}

/** @param {Q} q @param {string} locale */
async function requiredDocuments(q, locale) {
  const [{ exists }] = await q.query(`select to_regclass('public.feture_document_current') is not null "exists"`);
  if (!exists) return [];
  return q.query(
    `select id::text, document_key, content_hash from public.feture_document_current where locale = $1 and requires_accept`, [locale]);
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
  // Details: own view sees everything; others per details_vis (couples always show role/format/seek).
  // `granted` opens with the private-part grant (slice C2); until then it counts as hidden.
  const detailsOpen = own || p.kind === 'couple' || p.details_vis === 'all';
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

  async 'nick.check'(q, { input }) {
    const parsed = meCommands['account.create'].input.shape.handle.safeParse(input.handle);
    if (!parsed.success) return { available: false, reason: 'format' };
    const state = await handleState(q, parsed.data);
    return state === 'ok' ? { available: true } : { available: false, reason: state };
  },

  async 'account.create'(q, { account, input, cfg }) {
    const [acc] = await q.query('select person_profile_id from feture.account where id = $1 for update', [account.id]);
    if (acc.person_profile_id) fail(409, 'conflict', { state: 'registered' });
    const u18Key = hmac(String(cfg.pepper), 'feture-u18:v1:' + account.id);
    if (ageOn(input.birthDate) < 18) {
      // Nothing about the person is kept except that an under-18 attempt happened (AUTH-023).
      await q.query('insert into feture.u18_event (key_hmac) values ($1)', [u18Key]);
      return { ok: false, rule: 'under_18' };
    }
    // After an under-18 attempt a new date alone is not enough: the age must be verified by the provider.
    const [{ seen }] = await q.query('select exists (select 1 from feture.u18_event where key_hmac = $1) seen', [u18Key]);
    if (seen) fail(422, 'rule_violation', { rule: 'age_check_required' });
    if (ageOn(input.birthDate) > 110) fail(400, 'invalid_input', { fields: ['birthDate'] });
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
        `insert into feture.consent (account_id, document_version_id, document_key, content_hash) values ($1, $2, $3, $4) on conflict do nothing`,
        [account.id, d.id, d.document_key, d.content_hash]);
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
        if (await handleState(q, input.handle) !== 'ok') fail(409, 'conflict', { field: 'handle' });
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
    const [{ n }] = await q.query(
      `select count(*)::int n from feture.place where submitted_by = $1 and created_at > now() - interval '1 day'`, [account.id]);
    if (n >= 5) fail(429, 'rate_limited');
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
    // Others see public interests only (granted ones open with the private-part grant in slice C2);
    // a public hard limit shows only that it is a limit (V21: «нельзя» without details).
    const rows = await q.query(
      `select i.topic_id, i.value, i.mark, i.dir, i.vis from feture.interest i join feture.topic t on t.id = i.topic_id
       where i.profile_id = $1 and ($2 or (i.vis = 'public' and not t.hidden)) order by t.position`,
      [input.profileId, own]);
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
    const rows = await q.query(
      `select id, topic_id, kind, from_state, to_state, source, created_at from feture.interest_history
       where profile_id = $1 and ($2::timestamptz is null or created_at < $2) order by created_at desc, id desc limit $3`,
      [need(acting).profileId, input.before ?? null, input.limit + 1]);
    const items = rows.slice(0, input.limit).map(r => ({
      id: r.id, topicId: r.topic_id, kind: r.kind, from: r.from_state, to: r.to_state, archived: r.source === 'test_archived', at: r.created_at,
    }));
    return { items, next: rows.length > input.limit ? items[items.length - 1].at : null };
  },
};

/** @type {Record<string, Command>} */
export const me = Object.fromEntries(
  Object.entries(meCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
