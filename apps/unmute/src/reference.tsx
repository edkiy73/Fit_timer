import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { CourseSet } from './content/schema';
import type { Lexeme, LexiconSnapshot } from './lexicon/schema';
import { useLearnerCourseRuntime } from './course-runtime';
import { useLexiconRuntime } from './lexicon-ui';
import { localizedText } from './today-model';
import { speakText } from './speech-runtime';
import { ENGLISH_SPEECH_LOCALE } from './speech-locale';
import { Loader } from './loader';
import { Icon } from './icons';

/* «Справочник» (English Trainer's «Банк»): the course's phrase collection by topic and its
   irregular verb table. Both come from course resources; words resolve through the lexicon.
   «Скрыть перевод» turns either list into a self-check, as in the old app. */

type Tab = 'phrases' | 'verbs';

export interface PhraseRow { key: string; text: string; translation: string }
export interface PhraseGroup { id: string; title: string; rows: PhraseRow[] }
export interface VerbRow { key: string; base: string; past: string; participle: string; translation: string }

function senseTranslation(lexeme: Lexeme, senseId: string | undefined, locale: string): string {
  const sense = (senseId && lexeme.senses.find(item => item.id === senseId)) || lexeme.senses[0];
  if(!sense) return '';
  const list = sense.translations[locale] || sense.translations.ru || Object.values(sense.translations)[0] || [];
  return list.slice(0, 2).join(', ');
}

// Older course data has only the normalized lemma: «hi, i'm ivan. nice to meet you».
export function phraseDisplay(text: string): string {
  const fixed = text.replace(/\bi(?=\b|')/g, 'I').replace(/(^|[.!?]\s+)([a-z])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase());
  return fixed;
}

function formText(lexeme: Lexeme, ids: string[]): string {
  return ids.map(id => lexeme.forms.find(form => form.id === id)?.text).filter(Boolean).join(' / ');
}

export function buildReference(set: CourseSet, lexicon: LexiconSnapshot, locale: string){
  const byId = new Map(lexicon.entries.map(entry => [entry.id, entry]));
  const phrases: PhraseGroup[] = [];
  const verbs: VerbRow[] = [];
  for(const resource of set.resources || []){
    if(resource.type === 'phrase-collection'){
      for(const group of resource.groups){
        const rows = group.items.flatMap((item, index) => {
          const lexeme = byId.get(item.lexemeId);
          if(!lexeme) return [];
          const own = item.translation ? localizedText(item.translation, locale) : '';
          const sense = (item.senseId && lexeme.senses.find(entry => entry.id === item.senseId)) || lexeme.senses[0];
          const translation = own || (sense?.translations[locale] || sense?.translations.ru || [])[0] || '';
          return [{key:group.id + ':' + index, text:item.text || phraseDisplay(lexeme.lemma), translation}];
        });
        if(rows.length) phrases.push({id:group.id, title:localizedText(group.title, locale), rows});
      }
    }else{
      for(const item of resource.items){
        const lexeme = byId.get(item.lexemeId);
        if(!lexeme) continue;
        verbs.push({
          key:item.lexemeId,
          base:formText(lexeme, [item.baseFormId]) || lexeme.lemma,
          past:formText(lexeme, item.pastFormIds),
          participle:formText(lexeme, item.participleFormIds),
          translation:senseTranslation(lexeme, undefined, locale)
        });
      }
    }
  }
  return {phrases, verbs};
}

export function ReferenceView({phrases, verbs, onBack}: {phrases: PhraseGroup[]; verbs: VerbRow[]; onBack(): void}){
  const {t} = useI18n();
  const [tab, setTab] = useState<Tab>(phrases.length ? 'phrases' : 'verbs');
  const [hidden, setHidden] = useState(false);
  const say = (text: string) => { void speakText(text, ENGLISH_SPEECH_LOCALE); };
  const tabs: Array<[Tab, string, number]> = [['phrases', t('reference.phrases'), phrases.length], ['verbs', t('reference.verbs'), verbs.length]];
  return (
    <section className="review-shell reference" aria-labelledby="reference-title">
      <button className="learn-back" type="button" onClick={onBack}><Icon name="back" size={20} /><span>{t('nav.back')}</span></button>
      <header className="screen-head">
        <h2 id="reference-title">{t('reference.title')}</h2>
        <p className="tile-text">{t('reference.text')}</p>
      </header>

      {!phrases.length && !verbs.length ? <p className="tile-text">{t('reference.empty')}</p> : (
        <>
          <div className="segmented reference-tabs" role="tablist" aria-label={t('reference.title')}>
            {tabs.filter(([, , count]) => count > 0).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id}
                className={'segment pressable' + (tab === id ? ' is-on' : '')} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
          <button className="secondary-button pressable reference-toggle" type="button" aria-pressed={hidden} onClick={() => setHidden(value => !value)}>
            {hidden ? t(tab === 'verbs' ? 'reference.showForms' : 'reference.showTranslation') : t(tab === 'verbs' ? 'reference.hideForms' : 'reference.hideTranslation')}
          </button>

          {tab === 'phrases' ? phrases.map(group => (
            <section key={group.id} className="reference-group" aria-label={group.title}>
              <h3 className="section-title">{group.title}</h3>
              <ul className="word-list">
                {group.rows.map(row => (
                  <li key={row.key} className="word-row">
                    <span className="word-main reference-phrase">
                      <strong lang="en">{row.text}</strong>
                      {!hidden && <span>{row.translation}</span>}
                    </span>
                    <button className="word-remove pressable" type="button" aria-label={t('reference.listen', {text:row.text})} onClick={() => say(row.text)}>
                      <Icon name="speaker" size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )) : (
            <>
              <p className="tile-text">{t('reference.verbsHint')}</p>
              <ul className="word-list">
                {verbs.map(row => (
                  <li key={row.key} className="word-row reference-verb">
                    <span className="word-main">
                      <strong lang="en">{row.base}{hidden ? '' : ' — ' + row.past + ' — ' + row.participle}</strong>
                      <span>{row.translation}</span>
                    </span>
                    <button className="word-remove pressable" type="button" aria-label={t('reference.listen', {text:row.base})}
                      onClick={() => say(hidden ? row.base : [row.base, row.past, row.participle].join(', '))}>
                      <Icon name="speaker" size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

export function ReferenceScreen(){
  const {t, locale} = useI18n();
  const navigate = useNavigate();
  const runtime = useLearnerCourseRuntime();
  const lexicon = useLexiconRuntime();
  const data = useMemo(
    () => runtime.state && lexicon.lexicon ? buildReference(runtime.state.set, lexicon.lexicon, locale) : null,
    [runtime.state, lexicon.lexicon, locale]
  );
  if(!data){
    const failed = runtime.status === 'error' || lexicon.status === 'error';
    return (
      <section className="review-shell">
        {failed
          ? <div className="learn-state" role="alert"><strong>{t('reference.errorTitle')}</strong></div>
          : <Loader title={t('reference.loading')} />}
      </section>
    );
  }
  return <ReferenceView phrases={data.phrases} verbs={data.verbs} onBack={() => navigate(-1)} />;
}

/** The course has phrases or verbs to show: the map and «Я» offer «Справочник». */
export function hasReference(set: CourseSet | undefined | null): boolean {
  return Boolean(set?.resources?.length);
}
