"use strict";
var AppBaseNotifications = (() => {
    const module = { exports: {} };
    const exports = module.exports;
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.createPreferenceStore = createPreferenceStore;
    exports.limitCandidates = limitCandidates;
    function createPreferenceStore(options) {
        const defaults = Object.freeze({ ...options.defaults });
        return {
            get() {
                try {
                    const raw = JSON.parse(options.storage.getItem(options.key) || '{}');
                    return { ...defaults, ...(raw && typeof raw === 'object' ? raw : {}) };
                }
                catch (_) {
                    return { ...defaults };
                }
            },
            set(next) {
                options.storage.setItem(options.key, JSON.stringify({ ...defaults, ...(next || {}) }));
            }
        };
    }
    function limitCandidates(items, options) {
        const out = [];
        const engagementDay = new Set();
        const engagementWeek = new Map();
        const passiveDayCount = new Map();
        const reserved = options.reservedDayKeys || new Set();
        const sorted = [...items].sort((a, b) => (+new Date(a.at) - +new Date(b.at)) || ((b.priority || 0) - (a.priority || 0)));
        for (const item of sorted) {
            const at = new Date(item.at);
            if (Number.isNaN(at.getTime()))
                continue;
            const day = options.dayKey(at);
            if (item.engagement) {
                if (reserved.has(day) || options.blocksEngagementOn?.(at, item))
                    continue;
                if (engagementDay.has(day))
                    continue;
                const monday = new Date(at);
                monday.setHours(0, 0, 0, 0);
                monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
                const week = options.dayKey(monday);
                const count = engagementWeek.get(week) || 0;
                if (count >= options.engagementWeeklyLimit)
                    continue;
                engagementDay.add(day);
                engagementWeek.set(week, count + 1);
            }
            if (!item.budgetExempt) {
                const count = passiveDayCount.get(day) || 0;
                if (count >= options.passiveDailyLimit)
                    continue;
                passiveDayCount.set(day, count + 1);
            }
            out.push(item);
            if (out.length >= options.maxTotal)
                break;
        }
        return out;
    }
    
    return module.exports;
})();
