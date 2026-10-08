import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { createNodeHostHandler } = require('../server/node-host');
const { hostingInfo } = require('../server/hosting');

let bad = 0;
const ok = (name, cond) => {
  if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' FAIL ') + ' ' + name);
};

const previousHost = process.env.APPBASE_HOST_ADAPTER;
process.env.APPBASE_HOST_ADAPTER = 'reference_node';
ok('hosting identity can be selected by deployment config',
  hostingInfo().adapter === 'reference_node' && hostingInfo().source === 'configured');

const dir = await mkdtemp(join(tmpdir(), 'appbase-node-host-'));
await writeFile(join(dir, 'index.html'), '<!doctype html><title>portable</title>', 'utf8');

let seen = null;
const host = createNodeHostHandler({
  staticDir:dir,
  maxBodyBytes:64,
  api:{
    echo:async(req,res)=>{
      seen={query:req.query,body:req.body};
      res.statusCode=200;
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({ok:true}));
    }
  }
});
const server=createServer(host);
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address();
const base='http://127.0.0.1:'+address.port;

try{
  const home=await fetch(base+'/');
  ok('Node host serves the production static entry',
    home.status===200 && (await home.text()).includes('<title>portable</title>'));

  const echo=await fetch(base+'/api/echo?mode=portable',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({hello:'world'})
  });
  ok('Node host composes the same AppBase API handlers',
    echo.status===200 && (await echo.json()).ok===true
    && seen?.query?.mode==='portable'
    && seen?.body?.hello==='world');

  const badJson=await fetch(base+'/api/echo',{method:'POST',body:'not-json'});
  ok('Node host rejects malformed JSON without exposing handler internals',
    badJson.status===400 && (await badJson.json()).error==='bad_json');

  const tooLarge=await fetch(base+'/api/echo',{method:'POST',body:JSON.stringify({value:'x'.repeat(200)})});
  ok('Node host enforces its adapter body limit',
    tooLarge.status===413 && (await tooLarge.json()).error==='too_large');

  const missing=await fetch(base+'/api/missing',{method:'POST',body:'{}'});
  ok('Node host returns a portable 404 for an unknown API route', missing.status===404);

  const staticMissing=await fetch(base+'/missing-file.js');
  ok('Node host returns 404 for a missing static asset', staticMissing.status===404);
}finally{
  await new Promise(resolve=>server.close(resolve));
  await rm(dir,{recursive:true,force:true});
  if(previousHost===undefined) delete process.env.APPBASE_HOST_ADAPTER;
  else process.env.APPBASE_HOST_ADAPTER=previousHost;
}

console.log(bad ? '\nHosting adapter failures: '+bad : '\nHosting adapters behave correctly');
process.exit(bad ? 1 : 0);
