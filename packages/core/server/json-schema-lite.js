'use strict';

/* Portable JSON Schema subset for AI Structured Output.

   One schema object is sent to every provider (Gemini responseJsonSchema, OpenAI
   json_schema strict, OpenRouter response_format) AND checked locally against the
   answer: a provider may ignore or partially honour the schema, so the server never
   trusts "structured" output without this check.

   The subset is the intersection that all strict modes accept:
   - type: string | number | integer | boolean | object | array | null, or an array of
     those (nullable = ['string','null']);
   - object: properties, required (= every property: OpenAI strict demands it),
     additionalProperties:false (mandatory);
   - array: items, minItems, maxItems;
   - string: enum, minLength, maxLength;
   - number/integer: enum, minimum, maximum;
   - description (ignored by validation).
   Anything else (anyOf, $ref, pattern, format, oneOf, defaults…) is rejected by
   assertPortable() so a product cannot ship a schema one provider silently drops. */

const TYPES = new Set(['string','number','integer','boolean','object','array','null']);
const KEYWORDS = new Set(['type','description','properties','required','additionalProperties','items',
  'minItems','maxItems','enum','minLength','maxLength','minimum','maximum']);

function typesOf(schema){
  const t = schema && schema.type;
  return Array.isArray(t) ? t : [t];
}

function assertPortable(schema, path){
  const at = path || '$';
  if(!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new Error(`schema_invalid:${at}`);
  Object.keys(schema).forEach(k => { if(!KEYWORDS.has(k)) throw new Error(`schema_keyword_unsupported:${at}.${k}`); });
  const types = typesOf(schema);
  if(!types.length || types.some(t => !TYPES.has(t))) throw new Error(`schema_type_invalid:${at}`);
  if(types.includes('object')){
    const props = schema.properties;
    if(!props || typeof props !== 'object') throw new Error(`schema_properties_required:${at}`);
    if(schema.additionalProperties !== false) throw new Error(`schema_additional_properties:${at}`);
    const req = Array.isArray(schema.required) ? schema.required : [];
    const keys = Object.keys(props);
    if(req.length !== keys.length || keys.some(k => !req.includes(k))) throw new Error(`schema_required_all:${at}`);
    keys.forEach(k => assertPortable(props[k], `${at}.${k}`));
  }
  if(types.includes('array')){
    if(!schema.items) throw new Error(`schema_items_required:${at}`);
    assertPortable(schema.items, `${at}[]`);
  }
  if(schema.enum != null && (!Array.isArray(schema.enum) || !schema.enum.length)) throw new Error(`schema_enum_invalid:${at}`);
  return true;
}

function typeMatches(t, v){
  if(t === 'null') return v === null;
  if(t === 'array') return Array.isArray(v);
  if(t === 'object') return !!v && typeof v === 'object' && !Array.isArray(v);
  if(t === 'integer') return typeof v === 'number' && Number.isInteger(v);
  if(t === 'number') return typeof v === 'number' && Number.isFinite(v);
  return typeof v === t;
}

// Returns a list of problems ('$.plans[0].name:type'); empty = valid. Stops after `limit`.
function validate(schema, value, limit){
  const max = Math.max(1, limit || 20);
  const errors = [];
  const walk = (s, v, at) => {
    if(errors.length >= max) return;
    const types = typesOf(s);
    const t = types.find(x => typeMatches(x, v));
    if(!t){ errors.push(`${at}:type`); return; }
    if(s.enum && !s.enum.includes(v)){ errors.push(`${at}:enum`); return; }
    if(t === 'string'){
      if(s.minLength != null && v.length < s.minLength) errors.push(`${at}:minLength`);
      if(s.maxLength != null && v.length > s.maxLength) errors.push(`${at}:maxLength`);
    }
    if(t === 'number' || t === 'integer'){
      if(s.minimum != null && v < s.minimum) errors.push(`${at}:minimum`);
      if(s.maximum != null && v > s.maximum) errors.push(`${at}:maximum`);
    }
    if(t === 'array'){
      if(s.minItems != null && v.length < s.minItems) errors.push(`${at}:minItems`);
      if(s.maxItems != null && v.length > s.maxItems) errors.push(`${at}:maxItems`);
      v.forEach((item, i) => walk(s.items, item, `${at}[${i}]`));
    }
    if(t === 'object'){
      const props = s.properties || {};
      (s.required || []).forEach(k => { if(!(k in v)) errors.push(`${at}.${k}:required`); });
      Object.keys(v).forEach(k => {
        if(!(k in props)){ errors.push(`${at}.${k}:unexpected`); return; }
        walk(props[k], v[k], `${at}.${k}`);
      });
    }
  };
  walk(schema, value, '$');
  return errors;
}

// Model text → JSON value. Tolerates a ```json fence around the object (some models add
// it even in JSON mode) but nothing else: prose around the object is a malformed answer.
function parseJsonAnswer(text){
  let s = String(text == null ? '' : text).trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if(fence) s = fence[1].trim();
  return JSON.parse(s);
}

module.exports = { assertPortable, validate, parseJsonAnswer };
