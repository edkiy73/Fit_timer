import { Fragment, createElement, type ReactNode } from 'react';
import type { Activity } from './content/schema';
import { LexiconText, type LexiconClickRef } from './lexicon-ui';

/* Theory as a real page: headings, tables (English | Russian), bold, warnings, lists and pictures.
   Course HTML is rebuilt from an allowlist — never injected — and every English word stays
   tappable. Markdown and plain text become the same blocks. */

type TheoryActivity = Extract<Activity, {type:'theory'}>;

const BLOCK = new Set(['p','h1','h2','h3','h4','h5','h6','ul','ol','li','table','thead','tbody','tr','td','th','blockquote','div','hr','br','figure','figcaption']);
const CLASS_MAP: Record<string, string> = {ex:'theory-example', formula:'theory-formula', small:'is-small', ru:'is-ru', en:'is-en'};
const INLINE = new Set(['b','strong','i','em','s','u','span','code','small','sup','sub','mark']);

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineMarkdown(line: string): string {
  return escapeHtml(line)
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img alt="$1" src="$2">')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

/** Small Markdown subset used by course authors: #, lists, tables, > notes, images, bold/italic. */
export function markdownToHtml(source: string): string {
  const lines = source.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  let i = 0;
  while(i < lines.length){
    const line = lines[i]!;
    if(!line.trim()){ i++; continue; }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if(heading){ out.push(`<h${heading[1]!.length + 2}>${inlineMarkdown(heading[2]!)}</h${heading[1]!.length + 2}>`); i++; continue; }
    if(/^\s*\|/.test(line)){
      const rows: string[] = [];
      while(i < lines.length && /^\s*\|/.test(lines[i]!)){
        const cells = lines[i]!.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
        if(!cells.every(cell => /^:?-{2,}:?$/.test(cell))) rows.push('<tr>' + cells.map(cell => `<td>${inlineMarkdown(cell)}</td>`).join('') + '</tr>');
        i++;
      }
      out.push(`<table>${rows.join('')}</table>`);
      continue;
    }
    if(/^\s*([-*•]|\d+[.)])\s+/.test(line)){
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      while(i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i]!)){
        items.push(`<li>${inlineMarkdown(lines[i]!.replace(/^\s*([-*•]|\d+[.)])\s+/, ''))}</li>`);
        i++;
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }
    if(/^>\s?/.test(line)){
      const quote: string[] = [];
      while(i < lines.length && /^>\s?/.test(lines[i]!)){ quote.push(inlineMarkdown(lines[i]!.replace(/^>\s?/, ''))); i++; }
      out.push(`<div class="warn">${quote.join('<br>')}</div>`);
      continue;
    }
    const paragraph: string[] = [];
    while(i < lines.length && lines[i]!.trim() && !/^(#{1,4}\s|\s*\||\s*([-*•]|\d+[.)])\s|>)/.test(lines[i]!)){
      paragraph.push(inlineMarkdown(lines[i]!));
      i++;
    }
    out.push(`<p>${paragraph.join('<br>')}</p>`);
  }
  return out.join('\n');
}

/** Plain text: blank lines split paragraphs, «• » lines become a list. */
export function textToHtml(source: string): string {
  return markdownToHtml(source.replace(/^\s*•\s+/gm, '- '));
}

function safeUrl(value: string | null, images = false): string | null {
  if(!value) return null;
  const url = value.trim();
  if(/^https:\/\//i.test(url)) return url;
  if(images && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(url)) return url;
  return null;
}

function renderNodes(nodes: NodeListOf<ChildNode> | ChildNode[], refs: readonly LexiconClickRef[] | undefined, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  Array.from(nodes).forEach((node, index) => {
    const key = keyPrefix + index;
    if(node.nodeType === 3){
      const text = node.textContent ?? '';
      if(text.trim()) out.push(<LexiconText key={key} text={text} {...(refs ? {refs} : {})} />);
      else if(text) out.push(<Fragment key={key}>{' '}</Fragment>);
      return;
    }
    if(node.nodeType !== 1) return;
    const element = node as Element;
    const tag = element.tagName.toLowerCase();
    const children = () => renderNodes(element.childNodes, refs, key + '.');
    if(tag === 'img'){
      const src = safeUrl(element.getAttribute('src'), true);
      if(src) out.push(<img key={key} className="theory-image" src={src} alt={element.getAttribute('alt') ?? ''} loading="lazy" />);
      return;
    }
    if(tag === 'a'){
      const href = safeUrl(element.getAttribute('href'));
      out.push(href ? <a key={key} href={href} target="_blank" rel="noreferrer">{children()}</a> : <Fragment key={key}>{children()}</Fragment>);
      return;
    }
    if(tag === 'table'){
      // Rows may sit directly in <table>; React wants a <tbody>.
      const rows = Array.from(element.querySelectorAll(':scope > tr, :scope > tbody > tr, :scope > thead > tr'));
      out.push(
        <div key={key} className="theory-table-wrap">
          <table className="theory-table"><tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {Array.from(row.children).map((cell, cellIndex) => {
                  const Cell = cell.tagName.toLowerCase() === 'th' ? 'th' : 'td';
                  return <Cell key={cellIndex} className={cell.classList.contains('ru') ? 'is-ru' : undefined}>{renderNodes(cell.childNodes, refs, key + '.' + rowIndex + '.' + cellIndex + '.')}</Cell>;
                })}
              </tr>
            ))}
          </tbody></table>
        </div>
      );
      return;
    }
    if(tag === 'br'){ out.push(<br key={key} />); return; }
    if(tag === 'hr'){ out.push(<hr key={key} />); return; }
    if(tag === 'div' && (element.classList.contains('warn') || element.classList.contains('note') || element.classList.contains('tip'))){
      out.push(<div key={key} className={'theory-callout' + (element.classList.contains('warn') ? ' is-warn' : '')}>{children()}</div>);
      return;
    }
    if(/^h[1-6]$/.test(tag)){
      out.push(<h4 key={key} className="theory-heading">{children()}</h4>);
      return;
    }
    if(BLOCK.has(tag) || INLINE.has(tag)){
      // Course classes become our own: examples with their translation under them, formulas, notes.
      const classes = [...element.classList].map(name => CLASS_MAP[name]).filter(Boolean).join(' ');
      out.push(createElement(tag === 'figure' || tag === 'figcaption' ? 'div' : tag, classes ? {key, className:classes} : {key}, ...children()));
      return;
    }
    // Unknown tag (script, style, iframe…): keep only its text.
    if(tag !== 'script' && tag !== 'style') out.push(<Fragment key={key}>{children()}</Fragment>);
  });
  return out;
}

export function theoryHtml(activity: TheoryActivity, locale: string): string {
  const body = activity.body[locale] || activity.body.ru || activity.body.en || Object.values(activity.body)[0] || '';
  if(activity.format === 'markdown') return markdownToHtml(body);
  if(activity.format === 'text') return textToHtml(body);
  return body;
}

export function TheoryContent({activity, locale}: {activity: TheoryActivity; locale: string}){
  const html = theoryHtml(activity, locale);
  if(typeof DOMParser === 'undefined') return <div className="theory"><p>{html.replace(/<[^>]+>/g, ' ')}</p></div>;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return <div className="theory">{renderNodes(doc.body.childNodes, activity.lexiconRefs, 't')}</div>;
}
