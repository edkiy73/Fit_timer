// @ts-check
/** Text from people — the one place for its rules (docs/input-safety-backend-checklist.md §1). The server applies them
 * through `text()` / `line()` in every contract; the app imports the same `checkText` and `FIELD` rules for its inline
 * errors (src/fe/kit/validate.ts), so a form never accepts what the server refuses or refuses what it accepts.
 *
 * What a value goes through (`checkText`):
 *  - NFC; CRLF → LF; trimmed. Multi-line: spaces at line ends dropped, more than one empty line in a row becomes one.
 *    Single-line: runs of spaces become one.
 *  - `bad_characters`: control characters (tab only in multi-line text), bidi overrides and isolates, zero-width and
 *    other invisible or blank-looking characters, lone surrogates, noncharacters, combining-mark stacks of 5+ («Zalgo»).
 *    ZWJ / ZWNJ stay where they mean something (inside emoji sequences and between letters), variation selectors after
 *    a character, tag characters inside a subdivision flag.
 *  - `line_break`: a line break in a single-line field. `markup`: `<` or `>` in a name or title.
 *  - `empty` (required and nothing typed), `too_short`, `too_long` — lengths in code points, not UTF-16 units.
 *  - `too_many_lines`: more lines than the field shows sensibly. `long_word`: a run without spaces longer than `run`
 *    (40 in a single-line field, 80 in text); web addresses inside text do not count.
 */
import * as z from 'zod';

/** Longest run without whitespace in a single-line field (names, titles) and in multi-line text. */
export const RUN_LINE = 40;
export const RUN_TEXT = 80;

/** @typedef {{max:number,min:number,multiline:boolean,run:number,urls:boolean,lines:number,markup:boolean}} TextRule */
/** @typedef {'bad_characters'|'line_break'|'markup'|'empty'|'too_short'|'too_long'|'too_many_lines'|'long_word'} TextError */

/** Multi-line text: `min` 0 = optional; `lines` defaults to max/25 (at least 10). @returns {TextRule} */
export const textRule = (/** @type {number} */ max, /** @type {{min?:number,run?:number,lines?:number}} */ o = {}) =>
  ({ max, min: o.min ?? 0, multiline: true, run: o.run ?? RUN_TEXT, urls: true, lines: o.lines ?? Math.max(10, Math.ceil(max / 25)), markup: true });
/** One line (names, titles, places): never blank; no `<` `>` unless `markup` (a post title may say «<3»). @returns {TextRule} */
export const lineRule = (/** @type {number} */ max, /** @type {{min?:number,run?:number,markup?:boolean}} */ o = {}) =>
  ({ max, min: Math.max(1, o.min ?? 1), multiline: false, run: o.run ?? RUN_LINE, urls: false, lines: 1, markup: o.markup ?? false });

// Characters that never belong in stored text. Tab, LF are handled per field; ZWJ/ZWNJ, variation selectors and tags
// are removed from the checked copy first where they are meaningful.
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/u;
const INVISIBLE = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B-\u200F\u2028-\u202E\u2060-\u2064\u2066-\u206F\u2800\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF9-\uFFFB\uFDD0-\uFDEF\uFFFE\uFFFF\u{E0000}-\u{E007F}]|[\uD800-\uDFFF]/u;
const MEANINGFUL = [
  /(?<=[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F])\u200D(?=\p{Extended_Pictographic})/gu,   // 👩💻
  /(?<=[\p{L}\p{M}])[\u200C\u200D](?=[\p{L}\p{M}])/gu,                                                // Persian, Indic
  /(?<=[^\s\uFE00-\uFE0F])[\uFE00-\uFE0F]/gu,                                                        // ❤
  /\u{1F3F4}[\u{E0020}-\u{E007E}]+\u{E007F}/gu,                                                       // 🏴 subdivision flags
];
const URL_IN_WORD = /(?:https?:\/\/|www\.)\S+/giu;

/** Length as the server counts it (code points). */
export const textLength = (/** @type {string} */ v) => [...v].length;

/**
 * Normalise a value and say what is wrong with it, if anything.
 * @param {unknown} raw @param {TextRule} rule @returns {{value:string, error:TextError|null}}
 */
export function checkText(raw, rule) {
  if (typeof raw !== 'string') return { value: '', error: 'empty' };
  // Far over the limit: no need to look closer (and no work for a huge payload).
  if (raw.length > rule.max * 4 + 100) return { value: raw, error: 'too_long' };
  let v = raw.normalize('NFC').replace(/\r\n?/g, '\n');
  v = rule.multiline
    ? v.split('\n').map(l => l.replace(/[ \t\u00A0\u3000]+$/u, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim()
    : v.trim().replace(/[ \u00A0\u3000]{2,}/gu, ' ');
  let probe = v;
  for (const re of MEANINGFUL) probe = probe.replace(re, '');
  if (CONTROL.test(rule.multiline ? probe.replace(/[\t\n]/g, '') : probe.replace(/[\t\n]/g, ' ')) || INVISIBLE.test(probe) || /\p{M}{5,}/u.test(probe)) {
    return { value: v, error: 'bad_characters' };
  }
  if (!rule.multiline && /[\t\n]/.test(v)) return { value: v, error: 'line_break' };
  if (!rule.markup && /[<>]/.test(v)) return { value: v, error: 'markup' };
  const n = textLength(v);
  if (n === 0) return { value: v, error: rule.min > 0 ? 'empty' : null };
  if (n < rule.min) return { value: v, error: 'too_short' };
  if (n > rule.max) return { value: v, error: 'too_long' };
  if (rule.multiline && v.split('\n').length > rule.lines) return { value: v, error: 'too_many_lines' };
  for (const word of v.split(/\s+/u)) {
    const w = rule.urls ? word.replace(URL_IN_WORD, '') : word;
    if (textLength(w) > rule.run) return { value: v, error: 'long_word' };
  }
  return { value: v, error: null };
}

/** The zod schema of a rule: parses to the normalised value; the issue message is the TextError code. */
export function textSchema(/** @type {TextRule} */ rule) {
  return z.string().max(rule.max * 4 + 100, { message: 'too_long' }).transform((v, ctx) => {
    const r = checkText(v, rule);
    if (r.error) { ctx.addIssue({ code: 'custom', message: r.error }); return z.NEVER; }
    return r.value;
  });
}
/** Multi-line text from people (bios, descriptions, messages). */
export const text = (/** @type {number} */ max, /** @type {{min?:number,run?:number,lines?:number}} */ o = {}) => textSchema(textRule(max, o));
/** A single line (names, titles, places). */
export const line = (/** @type {number} */ max, /** @type {{min?:number,run?:number,markup?:boolean}} */ o = {}) => textSchema(lineRule(max, o));

/** Every field people type into, by name: the contracts build their schemas from these and the forms check the same. */
export const FIELD = Object.freeze({
  // Profile
  profileName: lineRule(60),
  bio: textRule(500),
  privateText: textRule(1000),
  placeName: lineRule(80, { min: 2 }),
  // Communities
  communityName: lineRule(50, { min: 3 }),
  communityDescription: textRule(500, { min: 20 }),
  joinQuestion: textRule(120, { lines: 3 }),
  communityRule: textRule(300, { min: 1, lines: 5 }),
  joinAnswer: textRule(300),
  // Events
  eventTitle: lineRule(80, { min: 5 }),
  eventDescription: textRule(1500, { min: 20 }),
  eventArea: lineRule(120),
  eventAddress: textRule(300, { lines: 5 }),
  eventQuestion: textRule(200, { min: 1, lines: 4 }),
  eventRequirements: textRule(500),
  eventAnswer: textRule(300, { min: 3 }),
  applyNote: textRule(300),
  announcement: textRule(500, { min: 5 }),
  reason: textRule(300),
  returnNote: textRule(300),
  // Posts (the composer validates through these too)
  postTitle: lineRule(120, { markup: true }),
  postBody: textRule(10000, { lines: 400 }),
  pollQuestion: textRule(200, { min: 1, lines: 4 }),
  pollOption: lineRule(80, { markup: true }),
  reply: textRule(1000, { min: 1 }),
  // Talking
  chatMessage: textRule(2000, { min: 1 }),
  caption: textRule(2000),
  support: textRule(2000, { min: 5 }),
  reportDetails: textRule(500),
  appeal: textRule(1000, { min: 10 }),
  staffNote: textRule(500),
  staffReason: textRule(300, { min: 3 }),
  maintenance: textRule(300),
  // Gallery
  albumTitle: lineRule(40),
  // Legal notices
  dsaExplanation: textRule(2000, { min: 20 }),
  dsaName: lineRule(120),
});
/** @typedef {keyof typeof FIELD} FieldName */
/** The zod schema of a named field. */
export const field = (/** @type {FieldName} */ name) => textSchema(FIELD[name]);
