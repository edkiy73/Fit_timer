// Types of contracts/_about.mjs for the app (the «Обо мне» editor offers exactly what the server accepts).
export declare const ABOUT: Readonly<{
  height: { min: number, max: number },
  smoking: readonly ['no', 'sometimes', 'yes'],
  alcohol: readonly ['no', 'rarely', 'sometimes'],
  kids: readonly ['have', 'want', 'dont_want'],
  zodiac: readonly ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'],
  langs: readonly ['ru', 'en', 'de', 'fr', 'es', 'it', 'pt', 'uk', 'be', 'kk', 'pl', 'cs', 'nl', 'sv', 'fi', 'el', 'tr', 'he', 'ar', 'ka', 'hy', 'zh', 'ja', 'ko'],
  langsMax: number,
}>;
export declare const ABOUT_FACTS: readonly ['height', 'smoking', 'alcohol', 'kids', 'langs', 'zodiac'];
