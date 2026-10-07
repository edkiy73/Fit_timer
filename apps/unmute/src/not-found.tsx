import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router';
import { useI18n } from '@appbase/ui-react/i18n.js';

/* A broken or old link (a reminder, a typo, a removed screen) lands here instead of the
   router's developer error page: a plain message and a way home. */
export function NotFoundScreen(){
  const {t}=useI18n();
  const navigate=useNavigate();
  return (
    <section className="review-shell">
      <div className="learn-state" role="status">
        <strong>{t('notFound.title')}</strong>
        <span>{t('notFound.text')}</span>
        <button className="primary-button" type="button" onClick={()=>navigate('/',{replace:true})}>{t('notFound.home')}</button>
      </div>
    </section>
  );
}

/** Any error while opening or drawing a screen: same calm screen, never a stack trace. */
export function RouteErrorScreen(){
  const error=useRouteError();
  const {t}=useI18n();
  if(isRouteErrorResponse(error)&&error.status===404)return <main className="app"><div className="app-screen"><NotFoundScreen /></div></main>;
  return (
    <main className="app">
      <div className="app-screen">
        <section className="review-shell">
          <div className="learn-state" role="alert">
            <strong>{t('notFound.errorTitle')}</strong>
            <span>{t('notFound.errorText')}</span>
            <button className="primary-button" type="button" onClick={()=>{window.location.hash='#/';window.location.reload();}}>{t('notFound.home')}</button>
          </div>
        </section>
      </div>
    </main>
  );
}
