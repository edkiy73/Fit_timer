// V21 Q01: live lookup of the partner's nickname.
export const ru = {
  'fe.pq.found': 'найден',
  'fe.pq.issue.own': 'Это твой ник',
  'fe.pq.issue.format': 'Ник — от 3 до 20 символов: латиница, цифры, точка и _',
  'fe.pq.issue.none': 'Такого ника нет. Проверь написание — нужен точный ник',
} as const;

export const en: Record<keyof typeof ru, string> = {
  'fe.pq.found': 'found',
  'fe.pq.issue.own': 'That’s your own nickname',
  'fe.pq.issue.format': 'A nickname is 3–20 characters: Latin letters, digits, dot and _',
  'fe.pq.issue.none': 'No such nickname. Check the spelling — it has to be exact',
};
