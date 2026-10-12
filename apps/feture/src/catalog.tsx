import { Link } from 'react-router';
import { useCatalog } from './feture/use-catalog';

export function FetureCatalog(){
  // Use the same validated public release and bundled offline fallback as Explore.
  const {data,source,retry}=useCatalog();
  return <section className="feture-catalog">
    <p><Link to="/">← Мой мир</Link></p>
    <h2>Каталог интересов</h2>
    <p className="muted">Исследуй направления и узнай, что означает каждая тема. Личные ответы остаются в твоей карте.</p>
    {source!=='live'&&<div role="status">
      <p>{source==='loading'?'Обновляем каталог. Встроенные темы уже доступны.':'Не удалось обновить каталог с сервера. Можно продолжить со встроенными темами.'}</p>
      {source==='offline'&&<button type="button" onClick={retry}>Повторить</button>}
    </div>}
    <>
      <p className="muted">{data.categories.length} направлений · {data.categories.reduce((n,c)=>n+c.interests.length,0)} тем</p>
      <div className="feture-catalog-list">
        {data.categories.map(item=><details key={item.id} className="feture-catalog-category">
          <summary><span className="feture-dot" style={{background:item.color}}></span>
            <strong>{item.title}</strong> <span className="muted">{item.interests.length}</span></summary>
          <ul>{item.interests.map(x=><li key={x.id}><strong>{x.title}</strong><p className="muted">{x.definition}</p></li>)}</ul>
        </details>)}
      </div>
      <p><Link to="/tests">Опросники для знакомства с собой →</Link></p>
    </>}
  </section>;
}
