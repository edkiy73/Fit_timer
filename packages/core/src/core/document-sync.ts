import type { SyncClient, SyncDocument } from './sync-client.js';

/* Local-first document sync on top of the sync transport.

   Every document the app writes is kept in a local mirror first, so the app works
   without an account and without network. When a session exists, sync():
     1. pulls the server copies;
     2. takes a server copy as is when the local one has no unsent changes, otherwise
        asks the product's merge() to combine both;
     3. pushes changed documents with `base` = the server revision they were built on.
   The server applies such a push only if its revision still equals `base` and reports
   the key as stale otherwise; sync() then repeats pull → merge → push. Nothing written
   on another device is overwritten without passing through merge().

   Data written while signed out stays on the device and is merged into the account at
   the first sync after sign-in. When a different account signs in on the same device,
   or after detach(), the local data is treated the same way (it belongs to the device,
   not to an account); apps that must not carry data between accounts call clear() on
   sign-out. */

export const ACCOUNT_PROFILE = '__account__';

export interface MirrorStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<boolean | void>;
}

export interface DocumentRef {
  key: string;
  /** Defaults to the account scope. */
  profileId?: string;
}

export type MergeDocument = (input: {
  key: string;
  profileId: string;
  local: string | null;
  remote: string | null;
}) => string | null;

export interface DocumentSyncOptions {
  client: Pick<SyncClient, 'pull' | 'push'>;
  /** Who is signed in now; null = signed out (sync() then does nothing). */
  owner: () => Promise<string | null>;
  storage: MirrorStorage;
  /** Storage key of the mirror. One key per app. */
  storageKey?: string;
  /** Combine unsent local changes with a newer server copy. Default: local wins. */
  merge?: MergeDocument;
  /** Documents this mirror syncs; other server documents are ignored. Default: all. */
  accepts?: (ref: Required<DocumentRef>) => boolean;
  /** Schema number sent with every document. */
  schema?: number;
  maxRounds?: number;
}

export type SyncOutcome =
  | {status: 'signed_out'}
  | {status: 'synced'; pulled: number; pushed: number; rounds: number}
  | {status: 'offline' | 'failed'; error: unknown}
  | {status: 'stale'; rounds: number};

export interface DocumentChange {
  keys: Array<Required<DocumentRef>>;
  /** 'remote' when the change came from another device. */
  source: 'local' | 'remote';
}

export interface DocumentSync {
  read(ref: DocumentRef | string): Promise<string | null>;
  write(ref: DocumentRef | string, value: string): Promise<void>;
  remove(ref: DocumentRef | string): Promise<void>;
  /** Has unsent changes. */
  pending(): Promise<boolean>;
  sync(): Promise<SyncOutcome>;
  /** Keeps local documents but forgets which account they were synced with: the next
   *  sign-in merges them as new data. Call on sign-out and after account deletion. */
  detach(): Promise<void>;
  /** Drops the whole mirror (all local documents). */
  clear(): Promise<void>;
  subscribe(listener: (change: DocumentChange) => void): () => void;
}

interface MirrorDoc {
  value: string | null;
  deleted: boolean;
  /** Server revision this value is based on (0 = never synced). */
  rev: number;
  dirty: boolean;
  /** Local write counter, so a write during push is not marked as sent. */
  version: number;
  at: string;
}

interface Mirror {
  v: 1;
  owner: string | null;
  docs: Record<string, MirrorDoc>;
}

const SEP = '\n';
const idOf = (profileId: string, key: string) => profileId + SEP + key;
const refOf = (id: string): Required<DocumentRef> => {
  const i = id.indexOf(SEP);
  return {profileId: id.slice(0, i), key: id.slice(i + 1)};
};
const normRef = (ref: DocumentRef | string): Required<DocumentRef> =>
  typeof ref === 'string' ? {key: ref, profileId: ACCOUNT_PROFILE} : {key: ref.key, profileId: ref.profileId || ACCOUNT_PROFILE};

function emptyMirror(): Mirror {
  return {v: 1, owner: null, docs: {}};
}

function parseMirror(raw: string | null): Mirror {
  if(!raw) return emptyMirror();
  try{
    const parsed = JSON.parse(raw) as Partial<Mirror>;
    if(!parsed || parsed.v !== 1 || typeof parsed.docs !== 'object' || !parsed.docs) return emptyMirror();
    const docs: Record<string, MirrorDoc> = {};
    for(const [id, d] of Object.entries(parsed.docs)){
      if(!d || typeof d !== 'object' || !id.includes(SEP)) continue;
      docs[id] = {
        value: typeof d.value === 'string' ? d.value : null,
        deleted: !!d.deleted,
        rev: Math.max(0, Math.floor(+d.rev || 0)),
        dirty: !!d.dirty,
        version: Math.max(0, Math.floor(+d.version || 0)),
        at: typeof d.at === 'string' ? d.at : ''
      };
    }
    return {v: 1, owner: typeof parsed.owner === 'string' ? parsed.owner : null, docs};
  }catch{
    return emptyMirror();
  }
}

const isNetworkError = (error: unknown) => {
  const status = (error as {status?: number} | null)?.status;
  return status === undefined && !(error instanceof Error && error.message === 'not_authenticated');
};

export function createDocumentSync(options: DocumentSyncOptions): DocumentSync {
  const storageKey = options.storageKey || 'appbase.sync.mirror';
  const merge: MergeDocument = options.merge || (({local}) => local);
  const accepts = options.accepts || (() => true);
  const schema = Math.max(1, Math.floor(options.schema || 1));
  const maxRounds = Math.max(1, Math.floor(options.maxRounds || 3));
  const listeners = new Set<(change: DocumentChange) => void>();

  let mirror: Mirror | null = null;
  // All mirror changes run one after another: a write never interleaves with a sync step.
  let queue: Promise<unknown> = Promise.resolve();
  let running: Promise<SyncOutcome> | null = null;

  function serial<T>(task: () => Promise<T>): Promise<T> {
    const next = queue.then(task, task);
    queue = next.catch(() => undefined);
    return next;
  }

  async function load(): Promise<Mirror> {
    if(!mirror) mirror = parseMirror(await options.storage.get(storageKey));
    return mirror;
  }

  async function persist(): Promise<void> {
    if(!mirror) return;
    const saved = await options.storage.set(storageKey, JSON.stringify(mirror));
    if(saved === false) throw new Error('sync_mirror_save_failed');
  }

  function emit(change: DocumentChange){
    if(!change.keys.length) return;
    listeners.forEach(listener => {
      try{ listener(change); }catch{}
    });
  }

  function localWrite(ref: DocumentRef | string, value: string | null){
    const r = normRef(ref);
    return serial(async () => {
      const m = await load();
      const id = idOf(r.profileId, r.key);
      const prev = m.docs[id];
      m.docs[id] = {
        value,
        deleted: value === null,
        rev: prev ? prev.rev : 0,
        dirty: true,
        version: (prev ? prev.version : 0) + 1,
        at: new Date().toISOString()
      };
      await persist();
      emit({keys: [r], source: 'local'});
    });
  }

  /** Applies server copies to the mirror; returns how many documents changed locally. */
  async function applyPull(remote: Array<SyncDocument & {profileId: string}>): Promise<number> {
    return serial(async () => {
      const m = await load();
      const changed: Array<Required<DocumentRef>> = [];
      for(const doc of remote){
        const ref = {profileId: doc.profileId, key: String(doc.key || '')};
        if(!ref.key || !accepts(ref)) continue;
        const id = idOf(ref.profileId, ref.key);
        const rev = Math.max(0, Math.floor(+(doc.rev || 0)));
        const value = doc.deleted ? null : (typeof doc.value === 'string' ? doc.value : null);
        const local = m.docs[id];
        if(local && rev <= local.rev) continue;
        if(!local || !local.dirty){
          m.docs[id] = {value, deleted: value === null, rev, dirty: false, version: local ? local.version : 0, at: doc.at || ''};
          if(!local || local.value !== value) changed.push(ref);
          continue;
        }
        const merged = merge({key: ref.key, profileId: ref.profileId, local: local.value, remote: value});
        const differsFromRemote = merged !== value;
        m.docs[id] = {
          value: merged,
          deleted: merged === null,
          rev,
          dirty: differsFromRemote,
          version: local.version + (merged !== local.value ? 1 : 0),
          at: differsFromRemote ? new Date().toISOString() : (doc.at || '')
        };
        if(merged !== local.value) changed.push(ref);
      }
      await persist();
      emit({keys: changed, source: 'remote'});
      return changed.length;
    });
  }

  async function runSync(): Promise<SyncOutcome> {
    const owner = await options.owner();
    if(!owner) return {status: 'signed_out'};

    // Local data from signed-out use or another account becomes new data for this account.
    await serial(async () => {
      const m = await load();
      if(m.owner === owner) return;
      for(const doc of Object.values(m.docs)){
        doc.rev = 0;
        doc.dirty = doc.value !== null || doc.dirty;
      }
      m.owner = owner;
      await persist();
    });

    let pulled = 0, pushed = 0;
    try{
      for(let round = 1; round <= maxRounds; round++){
        const result = await options.client.pull();
        const remote: Array<SyncDocument & {profileId: string}> = [
          ...result.accountDocs.map(d => ({...d, profileId: ACCOUNT_PROFILE})),
          ...result.profiles.flatMap(p => (p.docs || []).map(d => ({...d, profileId: String(p.user && p.user.id || '')})))
        ];
        pulled += await applyPull(remote);

        const outgoing = await serial(async () => {
          const m = await load();
          // Removed before it ever reached the server: nothing to send.
          for(const [id, d] of Object.entries(m.docs)) if(d.deleted && d.rev === 0) delete m.docs[id];
          return Object.entries(m.docs)
            .filter(([, d]) => d.dirty)
            .map(([id, d]) => ({id, ref: refOf(id), doc: {...d}}));
        });
        if(!outgoing.length) return {status: 'synced', pulled, pushed, rounds: round};

        const response = await options.client.push({
          docs: outgoing.map(({ref, doc}) => {
            const out: {profileId: string; key: string; value: string | null; rev: number; base: number; at: string; schema: number; deleted?: boolean} = {
              profileId: ref.profileId,
              key: ref.key,
              value: doc.value,
              rev: doc.rev + 1,
              base: doc.rev,
              at: doc.at || new Date().toISOString(),
              schema
            };
            if(doc.deleted) out.deleted = true;
            return out;
          })
        });
        const stale = new Set((response && Array.isArray(response.stale) ? response.stale : [])
          .map(s => idOf(String(s.profileId || ACCOUNT_PROFILE), String(s.key || ''))));

        await serial(async () => {
          const m = await load();
          for(const {id, doc} of outgoing){
            if(stale.has(id)) continue;
            const current = m.docs[id];
            if(!current) continue;
            current.rev = doc.rev + 1;
            // A write that happened during the push stays dirty and goes out next time.
            if(current.version === doc.version) current.dirty = false;
            pushed++;
          }
          await persist();
        });
        if(!stale.size) return {status: 'synced', pulled, pushed, rounds: round};
      }
      return {status: 'stale', rounds: maxRounds};
    }catch(error){
      return {status: isNetworkError(error) ? 'offline' : 'failed', error};
    }
  }

  return {
    async read(ref){
      const r = normRef(ref);
      const m = await serial(load);
      const doc = m.docs[idOf(r.profileId, r.key)];
      return doc && !doc.deleted ? doc.value : null;
    },
    write: (ref, value) => localWrite(ref, String(value)),
    remove: ref => localWrite(ref, null),
    async pending(){
      const m = await serial(load);
      return Object.values(m.docs).some(d => d.dirty);
    },
    sync(){
      // One sync at a time; callers during a run share its result.
      if(!running) running = runSync().finally(() => { running = null; });
      return running;
    },
    detach: () => serial(async () => {
      const m = await load();
      m.owner = null;
      await persist();
    }),
    clear: () => serial(async () => {
      const keys = Object.keys((await load()).docs).map(refOf);
      mirror = emptyMirror();
      await persist();
      emit({keys, source: 'local'});
    }),
    subscribe(listener){
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    }
  };
}

/* ---------- When to sync ---------- */

export interface AutoSyncOptions {
  /** Wait after the last local change before syncing. */
  debounceMs?: number;
  /** Source of 'online' events; defaults to the browser window. */
  network?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null;
  /** Source of 'visibilitychange' events; defaults to the browser document. */
  visibility?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null;
  isVisible?: () => boolean;
  onResult?: (outcome: SyncOutcome) => void;
}

export interface AutoSync {
  /** Sync now (after sign-in, on app start). */
  now(): Promise<SyncOutcome>;
  stop(): void;
}

/** Syncs after local changes (debounced), when the network comes back and when the app
 *  becomes visible again. Framework-neutral; products call now() after sign-in. */
export function startAutoSync(docs: DocumentSync, options: AutoSyncOptions = {}): AutoSync {
  const debounceMs = Math.max(0, options.debounceMs ?? 1500);
  const network = options.network === undefined
    ? (typeof window !== 'undefined' ? window : null)
    : options.network;
  const visibility = options.visibility === undefined
    ? (typeof document !== 'undefined' ? document : null)
    : options.visibility;
  const isVisible = options.isVisible
    || (() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const run = async () => {
    const outcome = await docs.sync();
    options.onResult?.(outcome);
    return outcome;
  };
  const later = () => {
    if(stopped) return;
    if(timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void run(); }, debounceMs);
  };
  const unsubscribe = docs.subscribe(change => { if(change.source === 'local') later(); });
  const onOnline = () => { void run(); };
  const onVisible = () => { if(isVisible()) void run(); };
  network?.addEventListener('online', onOnline);
  visibility?.addEventListener('visibilitychange', onVisible);

  return {
    now: run,
    stop(){
      stopped = true;
      if(timer) clearTimeout(timer);
      unsubscribe();
      network?.removeEventListener('online', onOnline);
      visibility?.removeEventListener('visibilitychange', onVisible);
    }
  };
}

/* ---------- Per-item merge for documents that hold a set of records ---------- */

export interface RecordMeta {
  /** ISO time of the last change on the device that made it. */
  at: string;
  deleted?: boolean | undefined;
}

/** Record map where removal is kept as a tombstone, so merge can tell "deleted" from "never seen". */
export type RecordMap<T extends RecordMeta> = Record<string, T>;

/** Newer change of each record wins; on equal time a deletion wins, so a removed record
 *  does not come back. Used by products whose document is a collection of items. */
export function mergeRecordMaps<T extends RecordMeta>(local: RecordMap<T>, remote: RecordMap<T>): RecordMap<T> {
  const out: RecordMap<T> = {...remote};
  for(const [id, mine] of Object.entries(local)){
    const theirs = out[id];
    if(!theirs){ out[id] = mine; continue; }
    const a = Date.parse(mine.at) || 0, b = Date.parse(theirs.at) || 0;
    if(a > b || (a === b && !!mine.deleted && !theirs.deleted)) out[id] = mine;
  }
  return out;
}
