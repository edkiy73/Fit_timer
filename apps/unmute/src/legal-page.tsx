import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useI18n } from '@appbase/ui-react/i18n.js';
import { applyLegalDetails, type LegalDetails } from '@appbase/core/legal.js';
import { Icon } from './icons';
import { Loader } from './loader';
import { apiUrl } from './api-url';
import { markdownToHtml } from './theory-content';
import { DEFAULT_TERMS, fillTerms } from './legal-terms';

/* Privacy policy and account deletion inside the app. They stay public pages
   (public/*.html, linked from the stores), but opening them as a separate page left no
   way back in the Android app. Here they get the app's own Back and the system Back. */

const PAGES: Record<string, string> = {privacy:'./privacy.html', 'delete-account':'./delete-account.html'};

export function extractLegalBody(html: string, legal?: LegalDetails | null): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // Owner and contacts typed in Admin replace the page's own text (the bundled copy can be older).
  applyLegalDetails(doc, legal);
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

/** Terms of use: the owner's text from Admin, else the app's default; owner details filled in.
 *  Without a connection the default text still shows, so the page never stays empty. */
export function TermsContent(){
  const {t} = useI18n();
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(apiUrl('/api/config?terms=1'))
      .then(response => response.ok ? response.json() as Promise<{terms?: string; legal?: LegalDetails}> : null)
      .catch(() => null)
      .then(config => {
        if(!live) return;
        const text = String(config?.terms || '').trim() || DEFAULT_TERMS;
        setHtml(markdownToHtml(fillTerms(text, config?.legal)));
      });
    return () => { live = false; };
  }, []);
  return html === null
    ? <Loader title={t('legal.loading')} />
    : <article className="tile legal-body" dangerouslySetInnerHTML={{__html:html}} />;
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
    const legal = fetch(apiUrl('/api/config'))
      .then(response => response.ok ? response.json() as Promise<{legal?: LegalDetails}> : null)
      .then(config => config?.legal ?? null)
      .catch(() => null);
    fetch(url).then(response => response.ok ? response.text() : Promise.reject(new Error('http')))
      .then(async text => { const details = await legal; if(live) setHtml(extractLegalBody(text, details)); })
      .catch(() => { if(live) setFailed(true); });
    return () => { live = false; };
  }, [url]);

  if(page === 'terms'){
    return (
      <section className="review-shell legal-page">
        <button className="learn-back" type="button" onClick={() => navigate(-1)}><Icon name="back" size={20} /><span>{t('nav.back')}</span></button>
        <TermsContent />
      </section>
    );
  }

  return (
    <section className="review-shell legal-page">
      <button className="learn-back" type="button" onClick={() => navigate(-1)}><Icon name="back" size={20} /><span>{t('nav.back')}</span></button>
      {!url || failed
        ? <p className="tile-text" role="alert">{t('legal.error')}</p>
        : html === null
          ? <Loader title={t('legal.loading')} />
          : <article className="tile legal-body" dangerouslySetInnerHTML={{__html:html}} />}
    </section>
  );
}
