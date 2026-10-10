'use strict';
require('../lib/product');
const {cors}=require('../../../packages/core/server/util');

/** Public, read-only taxonomy endpoint. Does not access any FetUre user data.
 * Uses the Supabase publishable (anon) key and 3 explicitly allowlisted RLS tables.
 * Private FetUre tables never receive anon SELECT permission.
 */
const BASE = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const KEY = String(process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
const validConfig = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(BASE) && KEY.startsWith('sb_publishable_');

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
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('catalog_response_invalid');
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
    const [categories, interests, tests] = await Promise.all([
      list('feture_categories', 'id,title,short_title,icon,accent_color,position', 'position.asc', 100),
      list('feture_interests', 'id,category_id,title,position', 'position.asc', 500),
      list('feture_tests', 'id,title,description,category_id,question_count', 'id.asc', 100)
    ]);
    const data = {
      version: 1,
      source: 'supabase',
      categories: categories.map((category) => ({
        id: category.id,
        title: category.title,
        short: category.short_title,
        icon: category.icon,
        color: category.accent_color,
        interests: interests.filter(i => i.category_id === category.id)
          .sort((a, b) => a.position - b.position)
          .map(i => ({id: i.id, title: i.title}))
      })),
      tests: tests.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        category: categories.findIndex(c => c.id === t.category_id),
        questions: t.question_count
      }))
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
