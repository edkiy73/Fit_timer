/* «1 день», «3 дня», «12 дней»: the counted word follows the language's plural rules.
   Dictionaries hold `unit.days.<category>` for every Intl.PluralRules category of the locale. */
type Translate = (key: string, values?: Record<string, string | number>) => string;

export function countDays(t: Translate, locale: string, count: number): string {
  let category = 'other';
  try { category = new Intl.PluralRules(locale).select(count); } catch { /* unknown locale → other */ }
  return t(`unit.days.${category === 'zero' || category === 'two' ? 'other' : category}`, {count});
}
