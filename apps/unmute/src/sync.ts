import { createSyncClient } from '@appbase/core/sync-client.js';
import { createDocumentSync, startAutoSync, type AutoSync, type DocumentSync } from '@appbase/core/document-sync.js';
import { createStorage } from '@appbase/core/storage.js';
import { authClient } from './auth';
import {
  courseProgressDoc,
  mergeCourseProgress,
  mergeStatsProgress,
  mergeUnMuteDocument,
  mergeWordsProgress,
  parseCourseProgress,
  parseStatsProgress,
  parseWordsProgress,
  statsProgressDoc,
  WORD_PROGRESS_DOC,
  type CourseProgressDocument,
  type StatsProgressDocument,
  type WordsProgressDocument
} from './progress';
import type { LegacyProgressImportResult } from './legacy-progress-import';

/* Local-first data: documents are written on the device first and sync to the account
   after sign-in. Every synced key must be registered in lib/app-sync-schema.js; data that
   must sync without a subscription is an account document with free:true. */

export const SETTINGS_DOC = 'settings';

export const syncClient = createSyncClient({endpoint:'/api/sync', auth:authClient});

export const appDocs: DocumentSync = createDocumentSync({
  client: syncClient,
  owner: async () => (await authClient.getSession())?.email || null,
  storage: createStorage({dbName:'unmute/kv', storeName:'kv'}),
  storageKey: 'sync.mirror',
  merge: ({key,local,remote}) => mergeUnMuteDocument(key,local,remote)
});

let auto: AutoSync | null = null;

/** Called once by main.tsx: sync after changes, on reconnect and when the app is shown again. */
export function startAppSync(): void {
  if(auto) return;
  auto = startAutoSync(appDocs);
  void auto.now();
}

/** After sign-in: merge local data into the account right away. */
export function syncNow(): void {
  void auto?.now();
}


export async function readCourseProgress(setId:string):Promise<CourseProgressDocument>{
  return parseCourseProgress(await appDocs.read(courseProgressDoc(setId)));
}

export async function writeCourseProgress(setId:string,doc:CourseProgressDocument):Promise<void>{
  await appDocs.write(courseProgressDoc(setId),JSON.stringify(doc));
}

export async function readStatsProgress(setId:string):Promise<StatsProgressDocument>{
  return parseStatsProgress(await appDocs.read(statsProgressDoc(setId)));
}

export async function writeStatsProgress(setId:string,doc:StatsProgressDocument):Promise<void>{
  await appDocs.write(statsProgressDoc(setId),JSON.stringify(doc));
}

export async function readWordsProgress():Promise<WordsProgressDocument>{
  return parseWordsProgress(await appDocs.read(WORD_PROGRESS_DOC));
}

export async function writeWordsProgress(doc:WordsProgressDocument):Promise<void>{
  await appDocs.write(WORD_PROGRESS_DOC,JSON.stringify(doc));
}


/** Merge an old English Trainer import into whatever the learner already has locally.
 * Legacy records use old timestamps, so newer UnMute activity always wins per record. */
export async function applyLegacyProgressImport(
  setId:string,
  imported:LegacyProgressImportResult
):Promise<void>{
  const [currentCourse,currentStats,currentWords]=await Promise.all([
    readCourseProgress(setId),
    readStatsProgress(setId),
    readWordsProgress()
  ]);
  await writeCourseProgress(setId,mergeCourseProgress(currentCourse,imported.course));
  await writeStatsProgress(setId,mergeStatsProgress(currentStats,imported.stats));
  await writeWordsProgress(mergeWordsProgress(currentWords,imported.words));
}
