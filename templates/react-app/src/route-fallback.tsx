import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router';
import { useI18n } from '@appbase/ui-react/i18n.js';

function FallbackCard({error=false}: {error?: boolean}){
  const {t}=useI18n();
  const navigate=useNavigate();
  return (
    <section className="card route-fallback" role={error ? 'alert' : 'status'}>
      <h2>{t(error ? 'route.errorTitle' : 'route.notFoundTitle')}</h2>
      <p>{t(error ? 'route.errorText' : 'route.notFoundText')}</p>
      <button className="link-button" type="button" onClick={()=>navigate('/',{replace:true})}>{t('route.home')}</button>
    </section>
  );
}

export function NotFoundScreen(){
  return <FallbackCard />;
}

export function RouteErrorScreen(){
  const error=useRouteError();
  if(isRouteErrorResponse(error) && error.status===404) return <main className="app"><FallbackCard /></main>;
  return <main className="app"><FallbackCard error /></main>;
}
