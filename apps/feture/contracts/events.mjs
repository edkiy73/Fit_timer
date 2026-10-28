// @ts-check
/** Slice D2: events (S2-CATALOG «D. События», extract/communities-events.md §1.8–1.12). */
import * as z from 'zod';
import { id, opId } from './platform.mjs';
import { line, text } from './me.mjs';

const CURRENCY = z.enum(['EUR', 'USD', 'GBP', 'RUB', 'CHF']);
const https = z.string().max(500).regex(/^https:\/\/[^\s]+$/);
const amount = z.number().positive().max(100000);
const price = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('free') }),
  z.strictObject({ kind: z.literal('door'), amount, currency: CURRENCY }),
  z.strictObject({ kind: z.literal('external'), amount, currency: CURRENCY, ticketUrl: https }),
]);
const plate = z.enum(['lilac', 'rose', 'sea', 'amber', 'moss', 'coal']);
// IANA region names only: offsets like «+01:00» mean something else to Postgres (the server checks pg_timezone_names too).
const ZONES = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']);
const tz = z.string().max(64).refine(v => ZONES.has(v), { message: 'unknown_zone' });

/** What an event is made of (V21 evfValidate); the same shape for submit and the base of edits. */
const base = {
  title: line(80).refine(v => v.length >= 5, { message: 'too_short' }),
  kind: z.enum(['meetup', 'workshop', 'talk', 'party']),
  description: text(1500).refine(v => v.length >= 20, { message: 'too_short' }),
  format: z.enum(['offline', 'online']),
  placeId: id.nullable().default(null),
  area: line(120).nullable().default(null),
  exactAddress: text(300).nullable().default(null),
  joinUrl: https.nullable().default(null),
  tz,
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  price: price.default({ kind: 'free' }),
  requiresApplication: z.boolean().default(false),
  questions: z.array(text(200).refine(v => v.length > 0, { message: 'empty' })).max(3).default([]),
  requirements: text(500).nullable().default(null),
  coverAssetId: id.nullable().default(null),
  plate: plate.default('lilac'),
  communityId: id.nullable().default(null),
};
/** @param {any} v */
const shapeRules = v => (v.format === 'online' ? !!v.joinUrl : !!(v.placeId && v.area && v.exactAddress))
  && Date.parse(v.endsAt) > Date.parse(v.startsAt) && Date.parse(v.endsAt) - Date.parse(v.startsAt) <= 14 * 864e5
  && (!v.requiresApplication || v.questions.length >= 1);
export const eventFields = z.strictObject(base).refine(shapeRules, { message: 'event_rules', path: ['format'] });

export const eventsCommands = {
  'event.draftSave': {
    profile: true, write: true, rate: { kind: 'event.draft', max: 200, window: '1 day' },
    // A draft keeps whatever is filled in; only a title is needed to save it.
    input: z.strictObject({
      opId, draftId: id.optional(), step: z.int().min(1).max(4).default(1),
      form: z.record(z.string().max(40), z.unknown()).refine(f => typeof f.title === 'string' && f.title.trim().length > 0, { message: 'title_required' })
        .refine(f => JSON.stringify(f).length <= 8000, { message: 'too_long' }),
    }),
  },
  'event.draftDelete': { profile: true, write: true, input: z.strictObject({ opId, draftId: id }) },
  // «Продолжить» a draft: the form as saved, the step it was left on, the cover (own drafts only; a couple's drafts
  // are the couple's — either partner continues them).
  'event.draftGet': { profile: true, write: false, input: z.strictObject({ draftId: id }) },
  'event.submit': {
    profile: true, write: true, rate: { kind: 'event.submit', max: 10, window: '1 day' },
    input: z.strictObject({ opId, draftId: id.optional(), event: eventFields }),
  },
  'event.withdraw': { profile: true, write: true, input: z.strictObject({ opId, eventId: id }) },
  'event.update': {
    profile: true, write: true,
    input: z.strictObject({ opId, eventId: id, rev: z.int().positive(), event: eventFields }),
  },
  'event.cancel': { profile: true, write: true, input: z.strictObject({ opId, eventId: id, reason: text(300).default('') }) },
  'event.get': { profile: true, write: false, input: z.strictObject({ eventId: id }) },
  'event.catalog': {
    profile: true, write: false,
    input: z.strictObject({
      format: z.enum(['all', 'offline', 'online']).default('all'),
      when: z.enum(['any', 'week', 'weekend', 'month']).default('any'),
      kinds: z.array(z.enum(['meetup', 'workshop', 'talk', 'party'])).max(4).optional(),
      price: z.enum(['any', 'free', 'paid']).default('any'),
      openOnly: z.boolean().default(false),
      placeId: id.optional(),
      communityId: id.optional(),
      // Search (V21 gFilters): words in the title or description, and a date range of the start.
      q: z.string().trim().min(2).max(80).optional(),
      from: z.iso.datetime({ offset: true }).optional(),
      to: z.iso.datetime({ offset: true }).optional(),
      cursor: z.string().max(200).optional(),
    }).refine(v => !v.from || !v.to || Date.parse(v.from) < Date.parse(v.to), { message: 'from_after_to', path: ['to'] }),
  },
  'event.mine': { profile: true, write: false, input: z.strictObject({}) },
  // «Скоро» in the feed (V21 feedEventPicks, FEED-014): up to three upcoming events (two weeks ahead) that concern the
  // acting profile — answered, organised by someone it follows, of a joined community, of a community on its
  // interests, online or in its city. Events it hid with «Скрыть» (feed_hide kind 'event') never come back here.
  'event.soon': { profile: true, write: false, input: z.strictObject({}) },
  'event.rsvp': {
    profile: true, write: true, rate: { kind: 'event.rsvp', max: 200, window: '1 day' },
    input: z.strictObject({
      opId, eventId: id, status: z.enum(['interested', 'going', 'not_going']).nullable(),
      showInList: z.boolean().optional(), ticketMarked: z.boolean().optional(),
    }),
  },
  'event.apply': {
    profile: true, write: true, rate: { kind: 'event.apply', max: 30, window: '1 day' },
    input: z.strictObject({
      opId, eventId: id, answers: z.array(text(300).refine(v => v.length >= 3, { message: 'too_short' })).min(1).max(3),
      note: text(300).default(''), requirementsAccepted: z.literal(true),
    }),
  },
  'event.applicationWithdraw': { profile: true, write: true, input: z.strictObject({ opId, applicationId: id }) },
  'event.applications': {
    profile: true, write: false,
    input: z.strictObject({ eventId: id, state: z.enum(['pending', 'approved', 'declined']).default('pending') }),
  },
  'event.applicationDecide': {
    profile: true, write: true,
    input: z.strictObject({ opId, applicationId: id, rev: z.int().positive(), approve: z.boolean() }),
  },
  'event.announce': {
    profile: true, write: true, rate: { kind: 'event.announce', max: 10, window: '1 day' },
    input: z.strictObject({ opId, eventId: id, body: text(500).refine(v => v.length >= 5, { message: 'too_short' }) }),
  },
  'event.attendees': {
    profile: true, write: false,
    input: z.strictObject({ eventId: id, kind: z.enum(['going', 'interested']).default('going') }),
  },
  'staff.eventQueue': { profile: false, write: false, input: z.strictObject({ limit: z.int().min(1).max(50).default(20) }) },
  'staff.eventDecide': {
    profile: false, write: true,
    input: z.strictObject({ opId, eventId: id, rev: z.int().positive(), decision: z.enum(['approve', 'reject', 'hide']), reason: text(300).default('') }),
  },
};
