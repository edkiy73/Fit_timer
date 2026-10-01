/* Owner and contact details on the legal pages (privacy policy, account deletion).
   The owner fills them in Admin → «Владелец и контакты»; /api/config returns them as `legal`.
   The pages mark the places with data-legal attributes and keep their own text as the fallback:
     <span data-legal="operator">…</span>   owner, plus «, country» when set
     <a data-legal="email" href="mailto:…">…</a>   contact address (text and link)
     <span data-legal="ageFrom">14</span>   minimum age */

export interface LegalDetails {
  owner?: string;
  country?: string;
  email?: string;
  ageFrom?: number;
}

export function applyLegalDetails(root: ParentNode, legal: LegalDetails | null | undefined): void {
  if(!legal) return;
  const owner = String(legal.owner || '').trim();
  const country = String(legal.country || '').trim();
  const email = String(legal.email || '').trim();
  if(owner){
    root.querySelectorAll('[data-legal="operator"]').forEach(node => { node.textContent = country ? owner + ', ' + country : owner; });
  }
  if(email){
    root.querySelectorAll('[data-legal="email"]').forEach(node => {
      node.textContent = email;
      const link = node as Element;
      if(link.tagName === 'A') link.setAttribute('href', 'mailto:' + email);
    });
  }
  if(typeof legal.ageFrom === 'number' && Number.isFinite(legal.ageFrom) && legal.ageFrom > 0){
    root.querySelectorAll('[data-legal="ageFrom"]').forEach(node => { node.textContent = String(Math.round(legal.ageFrom as number)); });
  }
}
