// @ts-check
/** «Обо мне» facts (owner 29.10.2026): all optional, person profiles only, each with its own audience
 * (`all` / `granted` — opens with the private part's «Описание» access, like «Данные» / `only`). Shared with the app. */
export const ABOUT = Object.freeze({
  height: { min: 120, max: 230 },
  smoking: /** @type {const} */ (['no', 'sometimes', 'yes']),
  alcohol: /** @type {const} */ (['no', 'rarely', 'sometimes']),
  kids: /** @type {const} */ (['have', 'want', 'dont_want']),
  zodiac: /** @type {const} */ (['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces']),
  langs: /** @type {const} */ (['ru', 'en', 'de', 'fr', 'es', 'it', 'pt', 'uk', 'be', 'kk', 'pl', 'cs', 'nl', 'sv', 'fi', 'el', 'tr', 'he', 'ar', 'ka', 'hy', 'zh', 'ja', 'ko']),
  langsMax: 6,
});
/** The facts in display order (always visible to everyone, owner 29.10.2026). */
export const ABOUT_FACTS = /** @type {const} */ (['height', 'smoking', 'alcohol', 'kids', 'langs', 'zodiac']);
