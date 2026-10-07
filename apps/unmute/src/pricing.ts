import product from '../config/product.json';
import type { CourseSet } from './content/schema';

/* Prices shown before checkout. Stores and payment providers show the final amount;
   these are the owner's list prices (config/product.json → pricing, or a course's own
   access.price). Russian speakers see rubles, everyone else dollars. */
export type Currency = 'RUB' | 'USD';
type Amounts = {[currency in Currency]?: number | undefined};

const pricing = (product as {pricing?: {course?: Amounts; plusMonthly?: Amounts; plusYearly?: Amounts; bundleDiscount?: number}}).pricing ?? {};

export function currencyForLocale(locale: string): Currency {
  return locale.toLowerCase().startsWith('ru') ? 'RUB' : 'USD';
}

export function formatPrice(amount: number, currency: Currency, locale: string): string {
  return new Intl.NumberFormat(locale, {style:'currency', currency, maximumFractionDigits:0}).format(amount);
}

function pick(amounts: Amounts | undefined, currency: Currency): number | null {
  const value = amounts?.[currency];
  return typeof value === 'number' && value > 0 ? value : null;
}

function courseAmount(access: CourseSet['access'], currency: Currency): number | null {
  const own = access.mode === 'entitlement' ? pick(access.price, currency) : null;
  return own ?? pick(pricing.course, currency);
}

/** The forever price of a course: its own price, else the product default. */
export function coursePrice(access: CourseSet['access'], locale: string): string | null {
  const currency = currencyForLocale(locale);
  const amount = courseAmount(access, currency);
  return amount === null ? null : formatPrice(amount, currency, locale);
}

/** «Курс + Plus на год»: the course's own bundle price, else course + a year of Plus minus
 *  pricing.bundleDiscount (%). `was` is what the two would cost separately. */
export function bundleDiscount(): number {
  const value = Math.round(Number(pricing.bundleDiscount) || 0);
  return value > 0 && value < 100 ? value : 0;
}

export function coursePlusYearPrice(access: CourseSet['access'], locale: string): {price: string; was: string | null} | null {
  const currency = currencyForLocale(locale);
  const course = courseAmount(access, currency);
  const year = pick(pricing.plusYearly, currency);
  if(course === null || year === null) return null;
  const separate = course + year;
  const own = access.mode === 'entitlement' ? pick(access.bundlePrice, currency) : null;
  const amount = own ?? Math.round(separate * (100 - bundleDiscount()) / 100);
  return {price:formatPrice(amount, currency, locale), was:amount < separate ? formatPrice(separate, currency, locale) : null};
}

export function plusPrices(locale: string): {monthly: string; yearly: string} | null {
  const currency = currencyForLocale(locale);
  const monthly = pick(pricing.plusMonthly, currency);
  const yearly = pick(pricing.plusYearly, currency);
  if(monthly === null || yearly === null) return null;
  return {monthly:formatPrice(monthly, currency, locale), yearly:formatPrice(yearly, currency, locale)};
}

/** How much cheaper a year of Plus is than twelve months, in whole percent (0 when unknown). */
export function plusYearSaving(locale: string): number {
  const currency = currencyForLocale(locale);
  const monthly = pick(pricing.plusMonthly, currency);
  const yearly = pick(pricing.plusYearly, currency);
  if(monthly === null || yearly === null || monthly * 12 <= yearly) return 0;
  return Math.round((1 - yearly / (monthly * 12)) * 100);
}
