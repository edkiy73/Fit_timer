// Text from people (contracts/_text.mjs): the shared rules themselves, then a sample of commands on PGlite as
// feture_api refusing hostile values with the field and the reason, and storing the normalised value.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkText, FIELD, lineRule, textRule, textLength } from '../contracts/_text.mjs';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { posts } from '../server/commands/posts.mjs';
import { communities } from '../server/commands/communities.mjs';
import { gallery } from '../server/commands/gallery.mjs';
import { support } from '../server/commands/support.mjs';
import { setup, op } from './fe-helpers.mjs';

const U = (/** @type {number[]} */ ...c) => String.fromCodePoint(...c);
const err = (/** @type {string} */ v, /** @type {any} */ rule) => checkText(v, rule).error;

test('rules: characters, lines, lengths, runs without spaces', () => {
  const name = FIELD.profileName, bio = FIELD.bio;
  // Normalised: NFC, trimmed, spaces collapsed in a line, at most one empty line in text.
  assert.equal(checkText('  Анна   Ли ', name).value, 'Анна Ли');
  assert.equal(checkText('e' + U(0x301), name).value, U(0xE9));
  assert.equal(checkText('a  \r\n\r\n\r\n\r\nb ', bio).value, 'a\n\nb');
  // Control, bidi, zero-width, blank-looking, lone surrogates, Zalgo.
  for (const c of [0x0, 0x7, 0x1B, 0x7F, 0x85, 0x202E, 0x2066, 0x200B, 0x200E, 0xFEFF, 0x2060, 0x3164, 0x2800, 0xAD, 0x2028]) {
    assert.equal(err('a' + U(c) + 'b', bio), 'bad_characters', c.toString(16));
  }
  assert.equal(err('a\uD800b', bio), 'bad_characters');
  assert.equal(err('x' + U(0x336, 0x336, 0x336, 0x336, 0x336) + 'b', bio), 'bad_characters');
  // …but emoji sequences, variation selectors, flags and joiners inside words stay.
  for (const ok of [U(0x1F469, 0x200D, 0x1F4BB), U(0x2764, 0xFE0F), U(0x1F3F4, 0xE0067, 0xE0062, 0xE0065, 0xE006E, 0xE0067, 0xE007F), 'می' + U(0x200C) + 'خواهم']) {
    assert.equal(err(ok + ' hi', name), null, ok);
  }
  assert.equal(err(U(0x200D) + 'x', name), 'bad_characters');
  // Tabs and line breaks: fine in text, not in a line.
  assert.equal(err('a\tb\nc', bio), null);
  assert.equal(err('a\nb', name), 'line_break');
  assert.equal(err('a\tb', name), 'line_break');
  // Names refuse markup; text keeps it (escaped on output).
  assert.equal(err('<b>Ann</b>', name), 'markup');
  assert.equal(err('<3 <b>', bio), null);
  assert.equal(err('<3 me', FIELD.postTitle), null);
  // Required, minimum, maximum in code points.
  assert.equal(err('   ', name), 'empty');
  assert.equal(err(U(0x3000, 0xA0), name), 'empty');
  assert.equal(err('', bio), null);
  assert.equal(err('ab', FIELD.communityName), 'too_short');
  assert.equal(err('ы'.repeat(61), name), 'too_long');
  assert.equal(err('ы '.repeat(30).trim(), name), null);
  assert.equal(err('😀 '.repeat(250).trim(), bio), null, 'emoji count once');
  assert.equal(textLength('😀'), 1);
  assert.equal(err('x'.repeat(5000), bio), 'too_long');
  // Lines and long runs.
  assert.equal(err(Array(21).fill('a').join('\n'), bio), 'too_many_lines');
  assert.equal(err(Array(20).fill('a').join('\n'), bio), null);
  assert.equal(err('x'.repeat(41), name), 'long_word');
  assert.equal(err('x'.repeat(40), name), null);
  assert.equal(err('a ' + 'x'.repeat(81), bio), 'long_word');
  assert.equal(err('see https://example.com/' + 'p'.repeat(200) + ' ok', FIELD.eventDescription), null, 'addresses do not count');
  assert.equal(err('[site](https://example.com/' + 'p'.repeat(200) + ')', FIELD.eventDescription), null);
  assert.equal(err('Donaudampfschifffahrtsgesellschaft', name), null);
  // Idempotent: what comes out passes again unchanged.
  for (const [v, r] of [['  a  b ', lineRule(20)], ['x\r\n\n\n\ny  ', textRule(50)], ['e' + U(0x301) + '  f', textRule(50)]]) {
    const once = checkText(v, r).value;
    assert.deepEqual(checkText(once, r), { value: once, error: null });
  }
});

test('commands refuse hostile text with the field and the reason, and store the normalised value', async () => {
  const { pg, call, person } = await setup({ commands: { ...platform, ...me, ...posts, ...communities, ...gallery, ...support } });
  try {
    const a = await person('ua', 'Alex');
    const own = (await call('ua', a, { action: 'profile.get', profileId: a })).profile;
    const upd = (/** @type {object} */ x) => call('ua', a, { action: 'profile.update', opId: op(), rev: own.rev, ...x });

    let r = await upd({ name: 'Al' + U(0x202E) + 'ex' });
    assert.deepEqual([r.status, r.error, r.fields, r.reasons], [400, 'invalid_input', ['name'], { name: 'bad_characters' }]);
    r = await upd({ name: 'x'.repeat(50) });
    assert.deepEqual(r.reasons, { name: 'long_word' });
    r = await upd({ name: ' \t ' });
    assert.deepEqual(r.reasons, { name: 'empty' });
    r = await upd({ bio: Array(30).fill('a').join('\n') });
    assert.deepEqual(r.reasons, { bio: 'too_many_lines' });
    r = await upd({ name: '  Алекс   Б ', bio: 'Привет\r\n\r\n\r\nмир  ' });
    assert.equal(r.status, 200, JSON.stringify(r));
    const saved = (await call('ua', a, { action: 'profile.get', profileId: a })).profile;
    assert.deepEqual([saved.name, saved.bio], ['Алекс Б', 'Привет\n\nмир']);

    const base = { description: 'Встречи и разговоры о верёвке для новичков', topics: ['shibari'], rules: ['Уважать границы'], plate: 'rose', privacy: 'open' };
    r = await call('ua', a, { action: 'community.create', opId: op(), ...base, name: '<script>x</script>', rules: ['ok', '   '] });
    assert.deepEqual([r.status, r.reasons], [400, { name: 'markup', 'rules.1': 'empty' }]);
    r = await call('ua', a, { action: 'community.create', opId: op(), ...base, name: 'Узлы', description: 'а'.repeat(90) });
    assert.deepEqual(r.reasons, { description: 'long_word' });

    r = await call('ua', a, { action: 'album.create', opId: op(), title: 'a\nb' });
    assert.deepEqual(r.reasons, { title: 'line_break' });
    r = await call('ua', null, { action: 'support.create', opId: op(), body: '      ' });
    assert.deepEqual(r.reasons, { body: 'empty' });
    r = await call('ua', null, { action: 'support.create', opId: op(), body: 'Не приходит код ' + U(0x1F469, 0x200D, 0x1F4BB) });
    assert.equal(r.status, 200, JSON.stringify(r));
  } finally { await pg.close(); }
});
