import { z } from 'zod';

const idSchema=z.string().min(1).regex(/^[a-z0-9][a-z0-9._-]*$/);
const textMap=z.record(z.string().min(2),z.string());

const pronunciationSchema=z.object({
  ipa:z.string().optional(),
  ruReading:z.string().optional(),
  audioKey:z.string().optional(),
});

export const lexiconFormSchema=z.object({
  id:idSchema.optional(),
  text:z.string().min(1),
  kind:z.enum(['lemma','inflection','contraction','variant','phrase']),
  /** Surface pronunciation wins over lemma pronunciation for clicks on inflected/contraction forms. */
  pronunciation:pronunciationSchema.optional(),
});

export const lexiconSenseSchema=z.object({
  id:idSchema,
  partOfSpeech:z.enum(['noun','verb','adjective','adverb','pronoun','preposition','conjunction','determiner','modal','interjection','phrase','other']).optional(),
  translations:z.record(z.string().min(2),z.array(z.string().min(1)).min(1)),
  note:textMap.optional(),
  tags:z.array(idSchema).default([]),
});

export const lexiconExampleSchema=z.object({
  id:idSchema,
  senseId:idSchema,
  text:z.string().min(1),
  translations:z.record(z.string().min(2),z.string().min(1)),
  source:z.object({
    setId:idSchema.optional(),
    activityId:idSchema.optional(),
    sourceKind:z.enum(['course','manual','legacy']).default('course'),
  }).optional(),
});

export const lexemeSchema=z.object({
  id:idSchema,
  revision:z.number().int().positive(),
  language:z.literal('en'),
  lemma:z.string().min(1),
  forms:z.array(lexiconFormSchema).min(1),
  pronunciation:pronunciationSchema.optional(),
  senses:z.array(lexiconSenseSchema).min(1),
  examples:z.array(lexiconExampleSchema).default([]),
  deprecated:z.boolean().default(false),
});

export const lexiconSnapshotSchema=z.object({
  schemaVersion:z.literal(1),
  revision:z.number().int().positive(),
  publishedAt:z.string().optional(),
  entries:z.array(lexemeSchema),
});

export type Lexeme=z.infer<typeof lexemeSchema>;
export type LexiconSnapshot=z.infer<typeof lexiconSnapshotSchema>;

function normalizeSurface(value:string):string{
  return value.toLowerCase().replace(/[\u2019\u02bc]/g,"'").replace(/\s+/g,' ').trim();
}

export function validateLexicon(input:unknown):LexiconSnapshot{
  const parsed=lexiconSnapshotSchema.parse(input);
  const entryIds=new Set<string>();
  for(const entry of parsed.entries){
    if(entryIds.has(entry.id)) throw new Error(`duplicate_lexeme:${entry.id}`);
    entryIds.add(entry.id);

    const senseIds=new Set(entry.senses.map(s=>s.id));
    if(senseIds.size!==entry.senses.length) throw new Error(`duplicate_sense:${entry.id}`);

    const exampleIds=new Set<string>();
    for(const example of entry.examples){
      if(exampleIds.has(example.id)) throw new Error(`duplicate_example:${entry.id}:${example.id}`);
      exampleIds.add(example.id);
      if(!senseIds.has(example.senseId)) throw new Error(`unknown_example_sense:${entry.id}:${example.senseId}`);
    }

    const formIds=new Set<string>();
    const surfaces=new Map<string,number>();
    for(const form of entry.forms){
      const normalized=normalizeSurface(form.text);
      surfaces.set(normalized,(surfaces.get(normalized)||0)+1);
      if(form.id){
        if(formIds.has(form.id)) throw new Error(`duplicate_form_id:${entry.id}:${form.id}`);
        formIds.add(form.id);
      }
    }
    for(const [surface,count] of surfaces){
      if(count>1){
        const duplicates=entry.forms.filter(form=>normalizeSurface(form.text)===surface);
        if(duplicates.some(form=>!form.id)) throw new Error(`duplicate_form_requires_id:${entry.id}:${surface}`);
      }
    }
    if(!surfaces.has(normalizeSurface(entry.lemma))) throw new Error(`lemma_form_missing:${entry.id}`);
  }
  return parsed;
}

export function buildLexiconIndex(snapshot:LexiconSnapshot):Map<string,string[]>{
  const index=new Map<string,string[]>();
  for(const entry of snapshot.entries){
    if(entry.deprecated) continue;
    for(const form of entry.forms){
      const key=normalizeSurface(form.text);
      const list=index.get(key) || [];
      if(!list.includes(entry.id)) list.push(entry.id);
      index.set(key,list);
    }
  }
  return index;
}

export function lookupLexemes(snapshot:LexiconSnapshot,surface:string):Lexeme[]{
  const ids=buildLexiconIndex(snapshot).get(normalizeSurface(surface)) || [];
  const byId=new Map(snapshot.entries.map(entry=>[entry.id,entry]));
  return ids.map(id=>byId.get(id)).filter((entry):entry is Lexeme=>Boolean(entry));
}


export function findLexiconForms(entry:Lexeme,surface:string){
  const key=normalizeSurface(surface);
  return entry.forms.filter(form=>normalizeSurface(form.text)===key);
}

export function findLexiconForm(entry:Lexeme,surface:string,formId?:string){
  const matches=findLexiconForms(entry,surface);
  if(formId) return matches.find(form=>form.id===formId) || null;
  return matches.length===1 ? (matches[0] ?? null) : null;
}

export function pronunciationForSurface(entry:Lexeme,surface:string,formId?:string){
  const matches=findLexiconForms(entry,surface);
  if(formId){
    const form=matches.find(item=>item.id===formId);
    return form?.pronunciation || null;
  }
  if(matches.length!==1) return null;
  return matches[0]?.pronunciation || entry.pronunciation || null;
}
