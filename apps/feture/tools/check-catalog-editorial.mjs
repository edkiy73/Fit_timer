import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';

// Build gate for the public editorial release. Drafts belong outside this file
// because the same release ships in the offline client bundle.
export function validateEditorial(catalog, release) {
  assert.equal(release.editorialStatus, 'published', 'only a published release may enter the public bundle');
  assert.equal(release.locale, 'ru', 'unsupported editorial locale');
  assert(Number.isSafeInteger(release.version) && release.version > 0, 'invalid editorial version');
  const ids = catalog.categories.flatMap(category => category.interests.map(item => item.id));
  assert.equal(new Set(ids).size, ids.length, 'duplicate reference IDs');
  assert.deepEqual(Object.keys(release.interests).sort(), [...ids].sort(), 'editorial IDs must cover the reference catalog exactly');
  const plain = value => typeof value === 'string' && value === value.trim() && value.length > 0 && !/[<>\u0000-\u001f]/.test(value);
  for (const [id, entry] of Object.entries(release.interests)) {
    assert.deepEqual(Object.keys(entry).sort(), ['definition', 'relatedIds', 'synonyms'], `${id}: unexpected fields`);
    assert(plain(entry.definition) && entry.definition.length <= 400, `${id}: invalid plain-text definition`);
    assert(Array.isArray(entry.synonyms) && entry.synonyms.length > 0 && entry.synonyms.length <= 8, `${id}: invalid synonyms`);
    assert(entry.synonyms.every(value => plain(value) && value.length <= 80), `${id}: invalid synonym`);
    assert.equal(new Set(entry.synonyms).size, entry.synonyms.length, `${id}: duplicate synonyms`);
    assert(Array.isArray(entry.relatedIds) && entry.relatedIds.length <= 8, `${id}: invalid related IDs`);
    assert.equal(new Set(entry.relatedIds).size, entry.relatedIds.length, `${id}: duplicate related IDs`);
    assert(entry.relatedIds.every(related => related !== id && ids.includes(related)), `${id}: unknown or self-related ID`);
  }
  return ids.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const read = name => JSON.parse(readFileSync(new URL('../data/' + name, import.meta.url), 'utf8'));
    const count = validateEditorial(read('concept-catalog.json'), read('catalog-editorial.json'));
    console.log(`Catalog editorial: ${count} definitions, synonyms and related IDs valid.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'catalog_editorial_invalid');
    process.exitCode = 1;
  }
}
