// @ts-check
/** Slice G1: conversations and messages (S2-CATALOG «G», extract/people-discover-chats.md §2.5). */
import * as z from 'zod';
import { id, opId } from './platform.mjs';
import { text } from './me.mjs';

const seq = z.int().min(0);
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
    profile: true, write: true, rate: { kind: 'chat.send', max: 2000, window: '1 day' },
    input: z.strictObject({ opId, conversationId: id, body: text(2000).refine(v => v.length > 0, { message: 'empty' }), replyTo: id.optional() }),
  },
  'chat.sendMedia': {
    profile: true, write: true, rate: { kind: 'chat.media', max: 300, window: '1 day' },
    input: z.strictObject({
      opId, conversationId: id, assetId: id, mode: z.enum(['normal', 'once', 't15', 't120', 't1440']).default('normal'),
      body: text(2000).default(''), replyTo: id.optional(),
    }),
  },
  // The view row makes opening idempotent; a replay must never hand out a link again.
  'chat.openMedia': { profile: true, write: true, ledger: false, input: z.strictObject({ opId, messageId: id }) },
  'chat.read': { profile: true, write: true, ledger: false, input: z.strictObject({ conversationId: id, upToSeq: seq }) },
  'chat.mute': { profile: true, write: true, ledger: false, input: z.strictObject({ conversationId: id, on: z.boolean() }) },
  'chat.archive': { profile: true, write: true, ledger: false, input: z.strictObject({ conversationId: id, on: z.boolean() }) },
};
