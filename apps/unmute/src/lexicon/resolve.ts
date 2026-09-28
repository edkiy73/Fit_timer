import type { Lexeme, LexiconSnapshot } from './schema';
import { findLexiconForm, lookupLexemes, pronunciationForSurface } from './schema';

export interface LexiconContextRef {
  lexemeId?: string;
  senseId?: string;
}

export interface ResolvedLexiconEntry {
  lexeme:Lexeme;
  form:Lexeme['forms'][number] | null;
  pronunciation:Lexeme['pronunciation'] | null;
  senses:Lexeme['senses'];
  examples:Lexeme['examples'];
  exactContext:boolean;
}

export function resolveLexiconClick(snapshot:LexiconSnapshot,surface:string,context:LexiconContextRef={}):ResolvedLexiconEntry[]{
  const candidates=context.lexemeId
    ? snapshot.entries.filter(entry=>entry.id===context.lexemeId)
    : lookupLexemes(snapshot,surface);

  return candidates.map(lexeme=>{
    if(context.senseId){
      const sense=lexeme.senses.find(item=>item.id===context.senseId);
      if(sense){
        return {
          lexeme,
          form:findLexiconForm(lexeme,surface),
          pronunciation:pronunciationForSurface(lexeme,surface),
          senses:[sense],
          examples:lexeme.examples.filter(example=>example.senseId===sense.id),
          exactContext:true
        };
      }
    }

    return {
      lexeme,
      form:findLexiconForm(lexeme,surface),
      pronunciation:pronunciationForSurface(lexeme,surface),
      senses:lexeme.senses,
      examples:lexeme.examples,
      exactContext:false
    };
  });
}
