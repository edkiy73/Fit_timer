import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router';
import { useI18n } from '@appbase/ui-react/i18n.js';

function FallbackCard({error=false}: {error?: boolean}){
  const {t}=useI18n();
  const navigate=useNavigate();
  return (
    <section className="account route-fallback" role={error ? 'alert' : 'status'}>
      <h1>{t(error ? 'route.errorTitle' : 'route.notFoundTitle')}</h1>
      <p className="muted">{t(error ? 'route.errorText' : 'route.notFoundText')}</p>
      <button className="text-button" type="button" onClick={()=>navigate('/',{replace:true})}>{t('route.home')}</button>
    </section>
  );
}

export function NotFoundScreen(){
  return <main className="app"><FallbackCard /></main>;
}

export function RouteErrorScreen(){
  const error=useRouteError();
  if(isRouteErrorResponse(error) && error.status===404) return <main className="app"><FallbackCard /></main>;
  return <main className="app"><FallbackCard error /></main>;
}
