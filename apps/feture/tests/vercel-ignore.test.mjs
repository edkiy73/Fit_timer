import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shouldDeployPath,shouldSkip} from '../scripts/vercel-ignore.mjs';

test('O03 FetUre deploy classifier excludes docs, tests and other apps',()=>{
  assert.equal(shouldSkip(['apps/feture/docs/agent-team/HANDOFF.md']),true);
  assert.equal(shouldSkip(['apps/unmute/src/app.tsx']),true);
  assert.equal(shouldSkip(['apps/feture/tests/post-security.test.ts']),true);
  assert.equal(shouldSkip(['apps/feture/src/feture/community.tsx']),false);
  assert.equal(shouldSkip(['packages/core/src/index.ts']),false);
  assert.equal(shouldDeployPath('apps/feture/scripts/vercel-ignore.mjs'),true);
});

test('O03 interim and final Vercel commit subject overrides',()=>{
  const runtime=['apps/feture/src/feture/community.tsx'];
  const docs=['apps/feture/docs/agent-team/HANDOFF.md'];
  assert.equal(shouldSkip(runtime,'feat: intermediate [skip vercel]'),true);
  assert.equal(shouldSkip(runtime,'feat: [SKIP VERCEL] intermediate'),true);
  assert.equal(shouldSkip(docs,'docs: release checkpoint [deploy]'),false);
  assert.equal(shouldSkip(runtime,'feat: [skip vercel] [deploy]'),false);
  assert.equal(shouldSkip(docs,'docs: [skip vercel]'),true);
  assert.equal(shouldSkip(runtime,'feat: final\n\n* earlier [skip vercel] commit'),false);
  assert.equal(shouldSkip(docs,'docs: note\n\n* earlier [deploy] commit'),true);
});

test('O03 missing Git history fails open even if a skip marker exists',()=>{
  assert.equal(shouldSkip(null,'[skip vercel]'),false);
  assert.equal(shouldSkip([],'[skip vercel]'),false);
  assert.equal(shouldSkip(undefined,'[skip vercel]'),false);
});
