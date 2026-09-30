import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useI18n } from '@appbase/ui-react/i18n.js';
import { Icon } from './icons';

/* Privacy policy and account deletion inside the app. They stay public pages
   (public/*.html, linked from the stores), but opening them as a separate page left no
   way back in the Android app. Here they get the app's own Back and the system Back. */

const PAGES: Record<string, string> = {privacy:'./privacy.html', 'delete-account':'./delete-account.html'};

export function extractLegalBody(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // Only the page's own article; scripts never come along.
  doc.querySelectorAll('script').forEach(node => node.remove());
  // Links between the two pages stay inside the app.
  doc.querySelectorAll('a[href]').forEach(link => {
    const target = Object.entries(PAGES).find(([, file]) => link.getAttribute('href') === file);
    if(target) link.setAttribute('href', '#/legal/' + target[0]);
  });
  const body = doc.querySelector('main article') || doc.querySelector('main') || doc.body;
  return body ? body.innerHTML : '';
}

export function LegalScreen(){
  const {t} = useI18n();
  const navigate = useNavigate();
  const {page = ''} = useParams();
  const url = PAGES[page];
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if(!url) return;
    let live = true;
    fetch(url).then(response => response.ok ? response.text() : Promise.reject(new Error('http')))
      .then(text => { if(live) setHtml(extractLegalBody(text)); })
      .catch(() => { if(live) setFailed(true); });
    return () => { live = false; };
  }, [url]);

  return (
    <section className="review-shell legal-page">
      <button className="learn-back" type="button" onClick={() => navigate(-1)}><Icon name="back" size={20} /><span>{t('nav.back')}</span></button>
      {!url || failed
        ? <p className="tile-text" role="alert">{t('legal.error')}</p>
        : html === null
          ? <p className="tile-text" role="status">{t('legal.loading')}</p>
          : <article className="tile legal-body" dangerouslySetInnerHTML={{__html:html}} />}
    </section>
  );
}
