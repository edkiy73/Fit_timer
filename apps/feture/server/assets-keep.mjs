// @ts-check
/** Old builds' script chunks stay reachable after a deploy (bug 03.11.2026: a tab opened before a deploy asked for
 * `assets/me-<old hash>.js`, the new image no longer had it, and «Я» showed «Экран не открылся»).
 * Every deploy builds a new image whose `dist/assets/` holds only that build's hashed files. At start, host.mjs copies
 * them into a directory on a persistent volume (`ASSETS_KEEP_DIR`, compose volume `assets`) and remembers which files
 * the build had (`.builds/<id>.json`). `/assets/*` missing from the image is then served from there.
 * Kept: the files of the last KEEP_BUILDS builds and of every build first started within KEEP_DAYS; older files go.
 * Hashed names never change content, so a file is copied once and never overwritten. */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const KEEP_BUILDS = 3;
export const KEEP_DAYS = 7;
const DAY = 24 * 3600e3;
const MANIFESTS = '.builds';

/** @param {string} dir */
const listFiles = dir => readdirSync(dir, { withFileTypes: true }).filter(d => d.isFile() && !d.name.startsWith('.')).map(d => d.name).sort();

/**
 * Copies the current build's assets into `keepDir`, records the build and prunes old ones.
 * @param {{ assetsDir: string, keepDir: string, now?: number, keepBuilds?: number, keepDays?: number }} o
 * @returns {{ build: string, copied: number, kept: number, removed: number }}
 */
export function keepAssets({ assetsDir, keepDir, now = Date.now(), keepBuilds = KEEP_BUILDS, keepDays = KEEP_DAYS }) {
  const files = listFiles(assetsDir);
  const build = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 16);
  const manifests = path.join(keepDir, MANIFESTS);
  mkdirSync(manifests, { recursive: true });

  let copied = 0;
  for (const name of files) {
    const target = path.join(keepDir, name);
    if (existsSync(target)) continue;
    const tmp = path.join(keepDir, `.tmp-${process.pid}-${name}`);
    copyFileSync(path.join(assetsDir, name), tmp);
    renameSync(tmp, target); // a half-copied file is never served
    copied++;
  }

  // The first start of a build is its date: a restart of the same image does not make it younger.
  const own = path.join(manifests, `${build}.json`);
  if (!existsSync(own)) writeFileSync(own, JSON.stringify({ at: now, files }));

  /** @type {{ id: string, at: number, files: string[] }[]} */
  const builds = [];
  for (const name of listFiles(manifests)) {
    if (!name.endsWith('.json')) continue;
    try {
      const m = JSON.parse(readFileSync(path.join(manifests, name), 'utf8'));
      if (typeof m.at === 'number' && Array.isArray(m.files)) builds.push({ id: name.slice(0, -5), at: m.at, files: m.files.map(String) });
    } catch { /* unreadable: dropped below like an old one */ }
  }
  builds.sort((a, b) => b.at - a.at);
  const keep = builds.filter((b, i) => b.id === build || i < keepBuilds || now - b.at < keepDays * DAY);
  const keepIds = new Set(keep.map(b => b.id));
  const keepFiles = new Set(keep.flatMap(b => b.files));

  let removed = 0;
  for (const name of listFiles(manifests)) if (!keepIds.has(name.replace(/\.json$/, ''))) rmSync(path.join(manifests, name), { force: true });
  for (const name of readdirSync(keepDir)) {
    if (name === MANIFESTS || keepFiles.has(name)) continue;
    const p = path.join(keepDir, name);
    if (!statSync(p).isFile()) continue;
    rmSync(p, { force: true });
    if (!name.startsWith('.')) removed++;
  }
  return { build, copied, kept: keepFiles.size, removed };
}
