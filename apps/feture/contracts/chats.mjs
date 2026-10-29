// @ts-check
/** Slice G1: conversations and messages (S2-CATALOG «G», extract/people-discover-chats.md §2.5). */
import * as z from 'zod';
import { id, opId } from './platform.mjs';
import { field } from './_text.mjs';

const seq = z.int().min(0);
/** Message requests (owner 29.10.2026): new requests a profile may send a day — fewer after several of its requests were
 * hidden or reported lately; a hidden (or unanswered) request may be sent again after `reaskDays`. */
export const REQUEST_LIMITS = Object.freeze({ perDay: 10, perDayLow: 3, lowAfter: 3, lowWindowDays: 14, reaskDays: 30 });
export const chatsCommands = {
  'chats.list': {
    profile: false, write: false,
    input: z.strictObject({ filter: z.enum(['all', 'me', 'couple']).default('all'), archived: z.boolean().default(false) }),
  },
  'chat.messages': {
    profile: true, write: false,
    input: z.strictObject({ conversationId: id, beforeSeq: seq.optional(), afterSeq: seq.optional(), limit: z.int().min(1).max(100).default(50) }),
  },
  'chat.send': {
    profile: true, write: true, rate: { kind: 'chat.send', max: 10000, window: '1 day' },
    input: z.strictObject({ opId, conversationId: id, body: field('chatMessage'), replyTo: id.optional() }),
  },
  'chat.sendMedia': {
    profile: true, write: true, rate: { kind: 'chat.media', max: 1500, window: '1 day' },
    input: z.strictObject({
      opId, conversationId: id, assetId: id, mode: z.enum(['normal', 'once', 't15', 't120', 't1440']).default('normal'),
      body: field('caption').default(''), replyTo: id.optional(),
    }),
  },
  // The view row makes opening idempotent; a replay must never hand out a link again.
  'chat.openMedia': { profile: true, write: true, ledger: false, input: z.strictObject({ opId, messageId: id }) },
  // A disappearing clip: openMedia only grants it (2 minutes); the first real `playing` reports here and spends the view.
  'chat.mediaStarted': { profile: true, write: true, ledger: false, input: z.strictObject({ opId, messageId: id }) },
  // «Прослушано» (voice messages, owner 28.10): the first play by a recipient; idempotent by the stored row.
  'chat.listened': { profile: true, write: true, ledger: false, input: z.strictObject({ messageId: id }) },
  // «С чего начать» (V21 ice): topics both sides show publicly.
  'chat.starters': { profile: true, write: false, input: z.strictObject({ conversationId: id }) },
  // «печатает…» (owner, 28.10): a short-lived realtime signal to the other side, nothing stored; the client sends it at
  // most every few seconds while typing.
  'chat.typing': { profile: true, write: false, rate: { kind: 'chat.typing', max: 30000, window: '1 day' }, input: z.strictObject({ conversationId: id }) },
  'chat.read': { profile: true, write: true, ledger: false, input: z.strictObject({ conversationId: id, upToSeq: seq }) },
  'chat.mute': { profile: true, write: true, ledger: false, input: z.strictObject({ conversationId: id, on: z.boolean() }) },
  'chat.archive': { profile: true, write: true, ledger: false, input: z.strictObject({ conversationId: id, on: z.boolean() }) },
  // Message requests (owner 29.10.2026). «Написать» on someone's profile, in member and attendee lists: the open
  // conversation with them, or whether a request may go out (it names their «Кто может мне писать» only as a rule).
  'chat.with': { profile: true, write: false, rate: { kind: 'chat.with', max: 3000, window: '1 day' }, input: z.strictObject({ profileId: id }) },
  // The first message of a request: text and/or one photo uploaded for chats. The daily limit (10, or 3 after many
  // hidden or reported requests) is the handler's own; this outer limit only stops probing.
  'chat.request': {
    profile: true, write: true, rate: { kind: 'chat.request.calls', max: 300, window: '1 day' },
    input: z.strictObject({ opId, profileId: id, body: field('caption').default(''), assetId: id.optional() })
      .refine(v => v.body.trim() !== '' || !!v.assetId, { message: 'empty', path: ['body'] }),
  },
  // The recipient answers («Ответить»: it becomes a normal chat) or hides it (the sender is not told). «Пожаловаться и
  // заблокировать» is report.create on the conversation with alsoBlock.
  'chat.requestAnswer': { profile: true, write: true, input: z.strictObject({ opId, conversationId: id, answer: z.enum(['accept', 'hide']) }) },
};
