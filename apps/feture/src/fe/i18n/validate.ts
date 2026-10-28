// Kit validation layer (src/fe/kit/validate.tsx): why a typed value is refused — the same codes the server returns
// (contracts/_text.mjs). {n} is the field's limit.
export const ru = {
  'fe.val.bad_characters': 'Убери невидимые и служебные символы',
  'fe.val.line_break': 'Здесь нужна одна строка — без переносов',
  'fe.val.markup': 'Без символов < и >',
  'fe.val.empty': 'Заполни это поле',
  'fe.val.too_short': 'Минимум {n} {chars}',
  'fe.val.too_long': 'Максимум {n} {chars}',
  'fe.val.too_many_lines': 'Слишком много строк — не больше {n}',
  'fe.val.long_word': 'Слишком длинное слово без пробелов — максимум {n} {chars}',
  'fe.val.invalid': 'Проверь это поле',
  // Plural forms of «символ» for {chars} (Intl.PluralRules of fe.val.locale).
  'fe.val.locale': 'ru',
  'fe.val.chars.one': 'символ',
  'fe.val.chars.few': 'символа',
  'fe.val.chars.many': 'символов',
  'fe.val.chars.other': 'символа',
};
export const en = {
  'fe.val.bad_characters': 'Remove invisible and control characters',
  'fe.val.line_break': 'One line here — no line breaks',
  'fe.val.markup': 'No < or > characters',
  'fe.val.empty': 'Fill in this field',
  'fe.val.too_short': 'At least {n} {chars}',
  'fe.val.too_long': '{n} {chars} max',
  'fe.val.too_many_lines': 'Too many lines — {n} at most',
  'fe.val.long_word': 'A word without spaces is too long — {n} {chars} max',
  'fe.val.invalid': 'Check this field',
  'fe.val.locale': 'en',
  'fe.val.chars.one': 'character',
  'fe.val.chars.few': 'characters',
  'fe.val.chars.many': 'characters',
  'fe.val.chars.other': 'characters',
};
