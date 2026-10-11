import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { apiUrl } from './api-url';
import { catalogSchema, type Catalog } from './feture/model';

type LoadState = {status:'loading'} | {status:'error'} | {status:'ready', data:Catalog};

export function FetureCatalog(){
  const [state,setState] = useState<LoadState>({status:'loading'});
  const [refresh,setRefresh] = useState(0);
  useEffect(() => {
    const abort=new AbortController();
    setState({status:'loading'});
    fetch(apiUrl('/api/catalog'),{signal:abort.signal})
      .then(async response => {
        if(!response.ok) throw new Error('catalog_request_failed');
        return catalogSchema.parse(await response.json());
      })
      .then(data => setState({status:'ready',data}))
      .catch(() => { if(!abort.signal.aborted) setState({status:'error'}); });
    return () => abort.abort();
  },[refresh]);
  return <section className="feture-catalog">
    <p><Link to="/">← Мой мир</Link></p>
    <h2>Каталог интересов</h2>
    <p className="muted">Исследуй направления и узнай, что означает каждая тема. Личные ответы остаются в твоей карте.</p>
    {state.status==='loading' && <p role="status">Загружаем направления…</p>}
    {state.status==='error' && <div role="alert">
      <p>Не удалось получить каталог с сервера.</p>
      <button type="button" onClick={() => setRefresh(n=>n+1)}>Повторить</button>
    </div>}
    {state.status==='ready' && <>
      <p className="muted">{state.data.categories.length} направлений · {state.data.categories.reduce((n,c)=>n+c.interests.length,0)} интереса</p>
      <div className="feture-catalog-list">
        {state.data.categories.map(item=><details key={item.id} className="feture-catalog-category">
          <summary><span className="feture-dot" style={{background:item.color}}></span>
            <strong>{item.title}</strong> <span className="muted">{item.interests.length}</span></summary>
          <ul>{item.interests.map(x=><li key={x.id}><strong>{x.title}</strong><p className="muted">{x.definition}</p></li>)}</ul>
        </details>)}
      </div>
      <p><Link to="/tests">Опросники для знакомства с собой →</Link></p>
    </>}
  </section>;
}
