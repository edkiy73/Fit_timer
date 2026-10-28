// @ts-check
/** Slice F2: people search, links, «Что у вас общего» (S2-CATALOG «F», extract/people-discover-chats.md §2.3, §3.2). */
import * as z from 'zod';
import { id, opId } from './platform.mjs';

const kind = z.enum(['partner', 'play', 'ds', 'mentor', 'meta', 'friend']);
const side = z.enum(['dom', 'sub', 'mentor', 'mentee']);
const vis = z.enum(['all', 'followers', 'us']);
/** ds and mentor links need the proposer's side, and it must fit the kind. */
const sideFits = (/** @type {any} */ v) => (v.kind === 'ds' ? ['dom', 'sub'].includes(v.mySide) : v.kind === 'mentor' ? ['mentor', 'mentee'].includes(v.mySide) : v.mySide === undefined);

export const peopleCommands = {
  'people.search': {
    profile: true, write: false, rate: { kind: 'people.search', max: 10000, window: '1 day' },
    input: z.strictObject({ q: z.string().trim().min(2).max(40) }),
  },
  'people.byNick': {
    profile: true, write: false, rate: { kind: 'people.nick', max: 1000, window: '1 day' },
    input: z.strictObject({ handle: z.string().trim().min(3).max(20) }),
  },
  'profile.compat': { profile: true, write: false, input: z.strictObject({ profileId: id }) },
  'link.propose': {
    profile: true, write: true, rate: { kind: 'link.propose', max: 60, window: '1 day' },
    input: z.strictObject({ opId, profileId: id, kind, mySide: side.optional(), vis: vis.default('all') }).refine(sideFits, { message: 'side_rules', path: ['mySide'] }),
  },
  'link.answer': { profile: true, write: true, input: z.strictObject({ opId, linkId: id, accept: z.boolean(), vis: vis.default('all') }) },
  'link.proposeChange': {
    profile: true, write: true,
    input: z.strictObject({ opId, linkId: id, kind, mySide: side.optional() }).refine(sideFits, { message: 'side_rules', path: ['mySide'] }),
  },
  'link.answerChange': { profile: true, write: true, input: z.strictObject({ opId, linkId: id, accept: z.boolean() }) },
  'link.setVisibility': { profile: true, write: true, input: z.strictObject({ opId, linkId: id, vis }) },
  'link.remove': { profile: true, write: true, input: z.strictObject({ opId, linkId: id }) },
  'links.ofProfile': { profile: true, write: false, input: z.strictObject({ profileId: id }) },
  'links.mine': { profile: true, write: false, input: z.strictObject({}) },
};
