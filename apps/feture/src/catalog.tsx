import {useMemo,useState} from 'react';
import {Link} from 'react-router';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {matchesCategoryName,matchesInterest} from './feture/model';
import {useCatalog} from './feture/use-catalog';

export function FetureCatalog(){
  const {t}=useI18n();
  // Use the same validated public release and bundled offline fallback as Explore.
  const {data,source,retry}=useCatalog();
  const [query,setQuery]=useState('');
  const term=query.trim();
  const categories=useMemo(()=>data.categories.map(category=>({
    ...category,
    interests:!term||matchesCategoryName(category,term)?category.interests:category.interests.filter(item=>matchesInterest(item,term))
  })).filter(category=>category.interests.length>0),[data,term]);
  const visibleCount=categories.reduce((sum,category)=>sum+category.interests.length,0);
  return <section className="feture-catalog">
    <p><Link to="/">{t('catalog.back')}</Link></p>
    <h2>{t('catalog.heading')}</h2>
    <p className="muted">{t('catalog.intro')}</p>
    {source!=='live'&&<div role="status">
      <p>{source==='loading'?t('catalog.loading'):t('catalog.offline')}</p>
      {source==='offline'&&<button type="button" onClick={retry}>{t('catalog.retry')}</button>}
    </div>}
    <div className="feture-catalog-search">
      <label htmlFor="ft-catalog-search">{t('catalog.searchLabel')}</label>
      <div className="feture-catalog-search-row">
        <input id="ft-catalog-search" type="search" autoComplete="off" value={query}
          onChange={event=>setQuery(event.target.value)} placeholder={t('catalog.placeholder')}/>
        {query&&<button type="button" onClick={()=>setQuery('')}>{t('catalog.reset')}</button>}
      </div>
    </div>
    <p className="muted" role={term?'status':undefined}>{term?t('catalog.found',{count:visibleCount,categories:categories.length}):t('catalog.count',{count:visibleCount,categories:categories.length})}</p>
    {term&&visibleCount===0?<div className="feture-catalog-empty">
      <p>{t('catalog.noResults')}</p>
      <button type="button" onClick={()=>setQuery('')}>{t('catalog.showAll')}</button>
    </div>:<div className="feture-catalog-list">
        {categories.map(item=><details key={item.id} className="feture-catalog-category" open={Boolean(term)}>
          <summary><span className="feture-dot" style={{background:item.color}}></span>
            <strong>{item.title}</strong> <span className="muted">{item.interests.length}</span></summary>
          <ul>{item.interests.map(x=><li key={x.id}><strong>{x.title}</strong><p className="muted">{x.definition}</p></li>)}</ul>
        </details>)}
      </div>}
      <p><Link to="/tests">{t('catalog.questionnaires')}</Link></p>
  </section>;
}
