export type PreferenceMap = Record<string, boolean>;

export interface PreferenceStore {
  get(): PreferenceMap;
  set(next: PreferenceMap): void;
}

export interface PreferenceStoreOptions {
  key: string;
  defaults: Readonly<PreferenceMap>;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
}

export interface NotificationCandidate {
  at: string;
  priority?: number;
  engagement?: boolean;
  budgetExempt?: boolean;
}

export interface DeliveryBudgetOptions<T extends NotificationCandidate> {
  maxTotal: number;
  passiveDailyLimit: number;
  engagementWeeklyLimit: number;
  dayKey(date: Date): string;
  reservedDayKeys?: ReadonlySet<string>;
  blocksEngagementOn?: (date: Date, item: T) => boolean;
}

export function createPreferenceStore(options: PreferenceStoreOptions): PreferenceStore {
  const defaults = Object.freeze({...options.defaults});
  return {
    get(){
      try{
        const raw = JSON.parse(options.storage.getItem(options.key) || '{}');
        return {...defaults, ...(raw && typeof raw === 'object' ? raw : {})};
      }catch(_){
        return {...defaults};
      }
    },
    set(next){
      options.storage.setItem(options.key, JSON.stringify({...defaults, ...(next || {})}));
    }
  };
}

export function limitCandidates<T extends NotificationCandidate>(
  items: readonly T[],
  options: DeliveryBudgetOptions<T>
): T[] {
  const out: T[] = [];
  const engagementDay = new Set<string>();
  const engagementWeek = new Map<string, number>();
  const passiveDayCount = new Map<string, number>();
  const reserved = options.reservedDayKeys || new Set<string>();

  const sorted = [...items].sort((a,b) =>
    (+new Date(a.at) - +new Date(b.at)) || ((b.priority || 0) - (a.priority || 0))
  );

  for(const item of sorted){
    const at = new Date(item.at);
    if(Number.isNaN(at.getTime())) continue;
    const day = options.dayKey(at);

    if(item.engagement){
      if(reserved.has(day) || options.blocksEngagementOn?.(at, item)) continue;
      if(engagementDay.has(day)) continue;

      const monday = new Date(at);
      monday.setHours(0,0,0,0);
      monday.setDate(monday.getDate() - ((monday.getDay()+6)%7));
      const week = options.dayKey(monday);
      const count = engagementWeek.get(week) || 0;
      if(count >= options.engagementWeeklyLimit) continue;
      engagementDay.add(day);
      engagementWeek.set(week, count + 1);
    }

    if(!item.budgetExempt){
      const count = passiveDayCount.get(day) || 0;
      if(count >= options.passiveDailyLimit) continue;
      passiveDayCount.set(day, count + 1);
    }

    out.push(item);
    if(out.length >= options.maxTotal) break;
  }

  return out;
}
