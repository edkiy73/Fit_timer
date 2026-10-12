'use strict';
require('../lib/product');
const {cors}=require('../../../packages/core/server/util');
const editorial=require('../data/catalog-editorial.json');
const {publicDocuments}=require('../lib/feture/public-documents');
const {publishedRelease}=require('../lib/feture/catalog-public');

/** Public, read-only taxonomy endpoint. Does not access any FetUre user data.
 * Uses the Supabase publishable (anon) key and 3 explicitly allowlisted RLS tables.
 * Private FetUre tables never receive anon SELECT permission.
 */
const BASE = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const KEY = String(process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
const validConfig = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(BASE) && KEY.startsWith('sb_publishable_');

// Read a bounded upstream body before JSON parsing, even when Content-Length is absent.
// A single published release is JSONB and can otherwise exceed the row LIMIT.
const MAX_UPSTREAM_BYTES = 1024 * 1024;
async function boundedJson(response) {
  const claimed = response.headers?.get?.('content-length');
  if (claimed !== null && claimed !== undefined && Number(claimed) > MAX_UPSTREAM_BYTES) {
    throw new Error('catalog_response_too_large');
  }
  if (!response.body || typeof response.body.getReader !== 'function') {
    throw new Error('catalog_response_invalid');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', {fatal: true});
  let text = '';
  let bytes = 0;
  let finished = false;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) { finished = true; break; }
      bytes += value.byteLength;
      if (bytes > MAX_UPSTREAM_BYTES) throw new Error('catalog_response_too_large');
      text += decoder.decode(value, {stream: true});
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally {
    if (!finished) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function list(table, fields, order, limit) {
  const path = '/rest/v1/' + table + '?select=' + fields + '&order=' + order + '&limit=' + limit;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(BASE + path, {
      method: 'GET',
      headers: {apikey: KEY, Accept: 'application/json'},
      signal: controller.signal
    });
    if (!response.ok) throw new Error('catalog_http_' + response.status);
    const rows = await boundedJson(response);
    if (!Array.isArray(rows) || rows.length > limit) throw new Error('catalog_response_invalid');
    return rows;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async function catalog(req, res) {
  if(cors(req, res)) return;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.statusCode = 405;
    return res.end(JSON.stringify({error: 'method_not_allowed'}));
  }
  if (!validConfig) {
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 503;
    return res.end(JSON.stringify({error: 'catalog_not_configured'}));
  }
  try {
    const query=new URL(req.url||'/api/catalog','https://feture.invalid').searchParams;
    if(query.get('resource')==='documents'){
      const result=await publicDocuments(BASE,KEY,query);res.setHeader('Cache-Control','no-store');res.statusCode=result.status;return res.end(JSON.stringify(result.body));
    }
    const [categories, interests, publications] = await Promise.all([
      list('feture_categories', 'id,title,short_title,icon,accent_color,position', 'position.asc', 100),
      list('feture_interests', 'id,category_id,title,position', 'position.asc', 500),
      list('feture_catalog_publications', 'version,entries', 'version.desc', 1)
    ]);
    if(publications.length>1)throw Error('catalog_publication_invalid');
    const ids=new Set(interests.map(item=>item.id));
    const release=publishedRelease(publications[0]??null,ids);
    const data = {
      version: 1,
      editorialVersion: release.version,
      source: 'supabase',
      categories: categories.map((category) => ({
        id: category.id,
        title: category.title,
        short: category.short_title,
        icon: category.icon,
        color: category.accent_color,
        interests: interests.filter(i => i.category_id === category.id && editorial.editorialStatus === 'published' && Object.hasOwn(editorial.interests,i.id))
          .sort((a, b) => a.position - b.position)
          .map(i => ({id: i.id, title: i.title, ...editorial.interests[i.id], ...(release.entries[i.id]??{}), editorialVersion:release.version}))
      })),
      tests: [] // Old taxonomy descriptors are not published questionnaires.

    };
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
    res.statusCode = 200;
    return res.end(JSON.stringify(data));
  } catch (err) {
    // Only known internal error names; never leak database URL, headers, keys or rows.
    console.warn('feture_catalog_unavailable', err instanceof Error ? err.name : 'Error');
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 503;
    return res.end(JSON.stringify({error: 'catalog_unavailable'}));
  }
};
