/* Стартовое наполнение каталога.

   Каталог начинается с чистого листа (модель упражнения V2): старые тестовые программы
   были записаны текстовым протоколом и не переносятся. Форма экспорта сохранена —
   действие `seed` в админке заливает то, что здесь лежит, а лежит здесь пока ничего.
   Стартовая программа — обычная запись каталога: {id, by, cat, level, min, sourceLocale,
   program, locales:{ru:{name, gives, texts}, en:{…}}} (см. lib/fit-catalog-program.js). */

const SEED_TRAINERS = {};
const SEED_ITEMS = [];

module.exports = { SEED_ITEMS, SEED_TRAINERS };
