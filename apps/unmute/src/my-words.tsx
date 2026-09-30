import { useMemo, useState } from 'react';
import { useI18n } from '@appbase/ui-react/i18n.js';
import type { WordReviewRuntimeValue } from './word-review-runtime';
import { listSavedWords, removeSavedWord, type SavedWordStatus } from './saved-words';
import { Icon } from './icons';
import { useNavigate } from 'react-router';
import { useWordReviewRuntime } from './word-review-runtime';

const STATUS_KEY: Record<SavedWordStatus, string> = {
  new:'words.statusNew',
  learning:'words.statusLearning',
  learned:'words.statusLearned'
};

/** «Мои слова»: words saved from the dictionary, with their review stage, search and removal. */
export function MyWordsView({
  wordRuntime,
  remove=lexemeId=>removeSavedWord(lexemeId)
}:{
  wordRuntime:WordReviewRuntimeValue|null;
  remove?:(lexemeId:string,senseId:string)=>Promise<void>;
}){
  const {t,locale}=useI18n();
  const [query,setQuery]=useState('');
  const [error,setError]=useState(false);
  const words=useMemo(
    ()=>wordRuntime?.words&&wordRuntime.lexicon?listSavedWords(wordRuntime.words,wordRuntime.lexicon,locale):[],
    [wordRuntime?.words,wordRuntime?.lexicon,locale]
  );
  const needle=query.trim().toLowerCase();
  const shown=needle
    ? words.filter(word=>word.lemma.toLowerCase().includes(needle)||word.translation.toLowerCase().includes(needle))
    : words;

  const drop=async(lexemeId:string,senseId:string)=>{
    setError(false);
    try{
      await remove(lexemeId,senseId);
      await wordRuntime?.refresh();
    }catch{
      setError(true);
    }
  };

  return (
    <section className="my-words" aria-labelledby="my-words-title">
      <div className="section-head">
        <h3 id="my-words-title">{t('words.title')}</h3>
        {words.length>0&&<span className="section-count">{words.length}</span>}
      </div>

      {words.length===0 ? (
        <div className="tile my-words-empty">
          <span className="landmark-icon" aria-hidden="true"><Icon name="plus" size={20} /></span>
          <p className="tile-text">{t('words.empty')}</p>
        </div>
      ) : (
        <>
          {words.length>5&&(
            <label className="search-field">
              <Icon name="search" size={18} />
              <span className="sr-only">{t('words.search')}</span>
              <input type="search" value={query} placeholder={t('words.search')} onChange={event=>setQuery(event.target.value)} />
            </label>
          )}
          {error&&<p className="tile-text" role="alert">{t('words.removeError')}</p>}
          <ul className="word-list">
            {shown.map(word=>(
              <li key={word.key} className="word-row">
                <span className="word-main">
                  <strong lang="en">{word.lemma}</strong>
                  <span>{word.translation}</span>
                </span>
                <span className={'word-status is-'+word.status}>{t(STATUS_KEY[word.status])}</span>
                <button
                  className="word-remove pressable"
                  type="button"
                  aria-label={t('words.remove',{word:word.lemma})}
                  onClick={()=>void drop(word.record.lexemeId,word.record.senseId)}
                >
                  <Icon name="trash" size={18} />
                </button>
              </li>
            ))}
          </ul>
          {shown.length===0&&<p className="tile-text">{t('words.notFound')}</p>}
        </>
      )}
    </section>
  );
}

/** «Я» → «Мои слова»: the same list as in «Повтор», reachable without starting a review. */
export function MyWordsScreen(){
  const {t}=useI18n();
  const navigate=useNavigate();
  return (
    <section className="review-shell" aria-label={t('words.title')}>
      <button className="learn-back" type="button" onClick={()=>navigate('/account')}>{t('nav.back')}</button>
      <MyWordsView wordRuntime={useWordReviewRuntime()} />
    </section>
  );
}
