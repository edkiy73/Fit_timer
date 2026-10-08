// Structured Output: portable schema subset, provider request shapes, local validation,
// refusal (no fallback) vs incomplete/mismatch (fallback), admin route probe.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.ALLOW_MEMORY_STORE = '1';
process.env.GEMINI_API_KEY = 'test-gemini';
process.env.OPENAI_API_KEY = 'test-openai';
process.env.OPENROUTER_API_KEY = 'test-openrouter';
delete process.env.AI_TEST_MODE;
const require = createRequire(import.meta.url);
const SchemaLite = require('../server/json-schema-lite');
const { generate, sanitizeSettings } = require('../server/ai');

const SCHEMA = {type:'object', additionalProperties:false, required:['name','sets','tags','note'], properties:{
  name:{type:'string', minLength:1, maxLength:20},
  sets:{type:'integer', minimum:1, maximum:10},
  tags:{type:'array', maxItems:2, items:{type:'string', enum:['a','b']}},
  note:{type:['string','null']}
}};

// ---- portable subset ----
assert.equal(SchemaLite.assertPortable(SCHEMA), true);
assert.throws(() => SchemaLite.assertPortable({type:'object', properties:{a:{type:'string'}}, required:['a']}), /additional_properties/);
assert.throws(() => SchemaLite.assertPortable({type:'object', additionalProperties:false, properties:{a:{type:'string'}}, required:[]}), /required_all/);
assert.throws(() => SchemaLite.assertPortable({type:'string', pattern:'x'}), /keyword_unsupported/);
assert.throws(() => SchemaLite.assertPortable({anyOf:[{type:'string'}]}), /keyword_unsupported/);

// ---- local validation ----
const good = {name:'Присед', sets:3, tags:['a'], note:null};
assert.deepEqual(SchemaLite.validate(SCHEMA, good), []);
const badErrors = SchemaLite.validate(SCHEMA, {name:'', sets:11, tags:['c','a','b'], extra:1});
for(const e of ['$.name:minLength','$.sets:maximum','$.tags:maxItems','$.tags[0]:enum','$.note:required','$.extra:unexpected']){
  assert.ok(badErrors.includes(e), 'expected ' + e + ' in ' + badErrors.join(','));
}
assert.deepEqual(SchemaLite.validate(SCHEMA, {...good, sets:2.5}), ['$.sets:type']);
assert.deepEqual(SchemaLite.parseJsonAnswer('```json\n{"x":1}\n```'), {x:1});
assert.throws(() => SchemaLite.parseJsonAnswer('Вот ответ: {"x":1}'));

// ---- provider request shapes + responses ----
const settings = sanitizeSettings({text:{primary:{provider:'gemini', model:'g-1'}, backup:{provider:'openai', model:'o-1'}}});
let calls = [];
let replies = [];
globalThis.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body);
  calls.push({url:String(url), body});
  const next = replies.shift();
  return {ok:true, status:200, json:async () => next(body)};
};
const gemini = text => () => ({candidates:[{finishReason:'STOP', content:{parts:[{text}]}}]});
const openai = text => () => ({status:'completed', output:[{content:[{type:'output_text', text}]}]});
const opts = {schema:{name:'exercise card', schema:SCHEMA}, maxOutputTokens:900};

calls = []; replies = [gemini(JSON.stringify(good))];
let out = await generate('text', settings, 'prompt', opts);
assert.deepEqual(out.json, good);
assert.equal(out.provider, 'gemini');
assert.equal(calls[0].body.generationConfig.responseMimeType, 'application/json');
assert.deepEqual(calls[0].body.generationConfig.responseJsonSchema, SCHEMA);
assert.equal(calls[0].body.generationConfig.maxOutputTokens, 900, 'action-specific output budget');

// schema mismatch on primary → backup (OpenAI strict json_schema)
calls = []; replies = [gemini(JSON.stringify({...good, sets:'3'})), openai(JSON.stringify(good))];
out = await generate('text', settings, 'prompt', opts);
assert.equal(out.provider, 'openai');
assert.equal(out.fallback, true);
const fmt = calls[1].body.text.format;
assert.equal(fmt.type, 'json_schema');
assert.equal(fmt.strict, true);
assert.equal(fmt.name, 'exercise_card', 'schema name sanitized for providers');
assert.equal(calls[1].body.max_output_tokens, 900);

// both invalid → validation error with paths
calls = []; replies = [gemini('не JSON'), openai(JSON.stringify({name:'x'}))];
await assert.rejects(generate('text', settings, 'prompt', opts), e => {
  assert.equal(e.validation.reason, 'schema_mismatch');
  assert.ok(e.validation.missing.includes('$.sets:required'));
  return true;
});

// refusal → no fallback
calls = []; replies = [() => ({promptFeedback:{blockReason:'SAFETY'}})];
await assert.rejects(generate('text', settings, 'prompt', opts), e => e.code === 'ai_refused' && e.status === 422);
assert.equal(calls.length, 1, 'refusal is not retried on backup');

// truncated by token limit → incomplete → backup
calls = []; replies = [() => ({candidates:[{finishReason:'MAX_TOKENS', content:{parts:[{text:'{"name":'}]}}]}), openai(JSON.stringify(good))];
out = await generate('text', settings, 'prompt', opts);
assert.equal(out.provider, 'openai');

// OpenAI refusal item
const oaFirst = sanitizeSettings({text:{primary:{provider:'openai', model:'o-1'}, backup:{provider:'gemini', model:'g-1'}}});
calls = []; replies = [() => ({status:'completed', output:[{content:[{type:'refusal', refusal:'no'}]}]})];
await assert.rejects(generate('text', oaFirst, 'prompt', opts), e => e.code === 'ai_refused');
assert.equal(calls.length, 1);

// OpenRouter: response_format json_schema strict
const orFirst = sanitizeSettings({text:{primary:{provider:'openrouter', model:'v/m'}, backup:{provider:'openrouter', model:'v/m'}}});
calls = []; replies = [() => ({choices:[{finish_reason:'stop', message:{content:JSON.stringify(good)}}]})];
out = await generate('text', orFirst, 'prompt', opts);
assert.deepEqual(out.json, good);
assert.equal(calls[0].body.response_format.type, 'json_schema');
assert.equal(calls[0].body.response_format.json_schema.strict, true);
assert.equal(calls[0].body.max_tokens, 900);

// a non-portable schema is a programming error, not a provider call
calls = [];
await assert.rejects(generate('text', settings, 'prompt', {schema:{name:'x', schema:{type:'string', format:'date'}}}), /keyword_unsupported/);
assert.equal(calls.length, 0);

// plain text calls are unchanged
calls = []; replies = [gemini('работает')];
out = await generate('text', settings, 'prompt');
assert.equal(out.text, 'работает');
assert.equal(calls[0].body.generationConfig.responseJsonSchema, undefined);

// ---- admin route probe reports structured support ----
const { handleAdminAISettings } = require('../server/admin/ai-settings');
const res = {statusCode:0, body:'', setHeader(){}, end(value){ this.body = String(value || ''); }};
calls = []; replies = [gemini('работает'), gemini(JSON.stringify({status:'ok', days:7}))];
await handleAdminAISettings('test_ai', {type:'text', settings}, res);
const probe = JSON.parse(res.body);
assert.equal(probe.structured.ok, true, res.body);
const res2 = {statusCode:0, body:'', setHeader(){}, end(value){ this.body = String(value || ''); }};
const same = sanitizeSettings({text:{primary:{provider:'gemini', model:'g-1'}, backup:{provider:'gemini', model:'g-1'}}});
calls = []; replies = [gemini('работает'), gemini('просто текст')];
await handleAdminAISettings('test_ai', {type:'text', settings:same}, res2);
assert.equal(JSON.parse(res2.body).structured.ok, false, 'route without JSON support is reported');

console.log('ai-structured ok');
