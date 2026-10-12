import {useMemo,useState} from 'react';
import {Link} from 'react-router';
import {matchesCategoryName,matchesInterest} from './feture/model';
import {useCatalog} from './feture/use-catalog';

export function FetureCatalog(){
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
    <p><Link to="/">← Мой мир</Link></p>
    <h2>Каталог интересов</h2>
    <p className="muted">Исследуй направления и узнай, что означает каждая тема. Личные ответы остаются в твоей карте.</p>
    {source!=='live'&&<div role="status">
      <p>{source==='loading'?'Обновляем каталог. Встроенные темы уже доступны.':'Не удалось обновить каталог с сервера. Можно продолжить со встроенными темами.'}</p>
      {source==='offline'&&<button type="button" onClick={retry}>Повторить</button>}
    </div>}
    <div className="feture-catalog-search">
      <label htmlFor="ft-catalog-search">Найти тему</label>
      <div className="feture-catalog-search-row">
        <input id="ft-catalog-search" type="search" autoComplete="off" value={query}
          onChange={event=>setQuery(event.target.value)} placeholder="Название, описание или синоним"/>
        {query&&<button type="button" onClick={()=>setQuery('')}>Сбросить</button>}
      </div>
    </div>
    <p className="muted" role={term?'status':undefined}>{term? `Найдено: ${visibleCount} тем в ${categories.length} направлениях`:`${visibleCount} тем в ${categories.length} направлениях`}</p>
    {term&&visibleCount===0?<div className="feture-catalog-empty">
      <p>Ничего не найдено. Попробуй другое слово или сбрось поиск.</p>
      <button type="button" onClick={()=>setQuery('')}>Показать все темы</button>
    </div>:<div className="feture-catalog-list">
        {categories.map(item=><details key={item.id} className="feture-catalog-category" open={Boolean(term)}>
          <summary><span className="feture-dot" style={{background:item.color}}></span>
            <strong>{item.title}</strong> <span className="muted">{item.interests.length}</span></summary>
          <ul>{item.interests.map(x=><li key={x.id}><strong>{x.title}</strong><p className="muted">{x.definition}</p></li>)}</ul>
        </details>)}
      </div>}
      <p><Link to="/tests">Опросники для знакомства с собой →</Link></p>
  </section>;
}
