import { describe, expect, it } from 'vitest';
import { pronunciationForSurface, validateLexicon } from './schema';
import { resolveLexiconClick } from './resolve';

const snapshot=validateLexicon({
  schemaVersion:1,
  revision:1,
  entries:[{
    id:'lex.read',
    revision:1,
    language:'en',
    lemma:'read',
    forms:[
      {id:'base',text:'read',kind:'lemma',pronunciation:{ipa:'/riːd/'}},
      {id:'past',text:'read',kind:'inflection',pronunciation:{ipa:'/rɛd/'}},
      {id:'participle',text:'read',kind:'inflection',pronunciation:{ipa:'/rɛd/'}}
    ],
    senses:[{id:'verb',partOfSpeech:'verb',translations:{ru:['читать']},tags:[]}],
    examples:[],
    deprecated:false
  }]
});

describe('lexicon form identity',()=>{
  it('does not guess pronunciation when one spelling maps to several grammatical forms',()=>{
    const [resolved]=resolveLexiconClick(snapshot,'read');
    expect(resolved?.form).toBeNull();
    expect(resolved?.pronunciation).toBeNull();
    expect(resolved?.exactContext).toBe(false);
  });

  it('resolves exact grammatical form when context pins formId',()=>{
    const [resolved]=resolveLexiconClick(snapshot,'read',{lexemeId:'lex.read',formId:'past'});
    expect(resolved?.form?.id).toBe('past');
    expect(resolved?.pronunciation?.ipa).toBe('/rɛd/');
    expect(resolved?.exactContext).toBe(true);
  });
});

describe('form pronunciation',()=>{
  it('uses lemma pronunciation only for the lemma surface',()=>{
    const work=validateLexicon({schemaVersion:1,revision:1,entries:[{
      id:'lex.work',revision:1,language:'en',lemma:'work',
      forms:[{text:'work',kind:'lemma'},{text:'working',kind:'inflection'},{text:'worked',kind:'inflection',pronunciation:{ipa:'wɜːkt'}}],
      pronunciation:{ipa:'wɜːk'},
      senses:[{id:'verb',translations:{ru:['работать']}}]
    }]}).entries[0];
    if(!work) throw new Error('fixture');
    expect(pronunciationForSurface(work,'work')?.ipa).toBe('wɜːk');
    expect(pronunciationForSurface(work,'worked')?.ipa).toBe('wɜːkt');
    expect(pronunciationForSurface(work,'working')).toBeNull();
  });
});
