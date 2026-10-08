'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_TYPES = Object.freeze({
  '.html':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.webp':'image/webp',
  '.ico':'image/x-icon'
});

function sendHostError(res, status, error){
  if(res.headersSent) return res.end();
  res.statusCode = status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify({error}));
}

async function readJsonBody(req, maxBodyBytes){
  if(req.body !== undefined) return req.body;
  const chunks = [];
  let size = 0;
  for await(const chunk of req){
    size += chunk.length;
    if(size > maxBodyBytes) throw Object.assign(new Error('too_large'), {status:413});
    chunks.push(chunk);
  }
  if(!chunks.length) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  if(!text.trim()) return {};
  try{ return JSON.parse(text); }
  catch(_){ throw Object.assign(new Error('bad_json'), {status:400}); }
}

function safeStaticFile(staticDir, pathname, indexFile){
  if(!staticDir) return null;
  let decoded;
  try{ decoded = decodeURIComponent(pathname || '/'); }
  catch(_){ return null; }
  const relativeUrl = decoded === '/' ? indexFile : decoded.replace(/^\/+/, '');
  const candidate = path.resolve(staticDir, relativeUrl);
  const rel = path.relative(path.resolve(staticDir), candidate);
  if(rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return candidate;
}

/** Alternate/local Node host adapter for AppBase product handlers.
 * Product API modules remain unchanged: the adapter maps /api/<name> to the same
 * (req,res) handlers used by serverless deployment wrappers. */
function createNodeHostHandler({
  api = {},
  staticDir = '',
  indexFile = 'index.html',
  contentTypes = {},
  maxBodyBytes = 2 * 1024 * 1024
} = {}){
  const types = {...DEFAULT_TYPES, ...contentTypes};
  const handlers = api && typeof api === 'object' ? api : {};

  return async function nodeHost(req, res){
    const base = 'http://' + String(req.headers && req.headers.host || '127.0.0.1');
    let url;
    try{ url = new URL(req.url || '/', base); }
    catch(_){ return sendHostError(res, 400, 'bad_url'); }

    const match = /^\/api\/([a-z0-9_-]+)$/.exec(url.pathname);
    if(match){
      const handler = handlers[match[1]];
      if(typeof handler !== 'function') return sendHostError(res, 404, 'not_found');
      try{
        req.query = Object.fromEntries(url.searchParams.entries());
        req.body = await readJsonBody(req, maxBodyBytes);
        await handler(req,res);
      }catch(error){
        if(!res.writableEnded){
          sendHostError(res, Number(error && error.status) || 500,
            Number(error && error.status) === 413 ? 'too_large'
              : Number(error && error.status) === 400 ? 'bad_json'
              : 'host_handler_failed');
        }
      }
      return;
    }

    const file = safeStaticFile(staticDir, url.pathname, indexFile);
    if(!file) return sendHostError(res, 404, 'not_found');
    let stat;
    try{ stat = fs.statSync(file); }catch(_){}
    if(!stat || !stat.isFile()) return sendHostError(res, 404, 'not_found');
    res.statusCode = 200;
    res.setHeader('Content-Type', types[path.extname(file).toLowerCase()] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  };
}

module.exports = { DEFAULT_TYPES, createNodeHostHandler };
