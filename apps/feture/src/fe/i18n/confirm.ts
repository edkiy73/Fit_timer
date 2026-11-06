// «Confirm it is you» (security audit 06.11.2026, B5): the sheet that asks for a code mailed to the signed-in address before an
// account is handed over — a new e-mail, a second factor, deleting the account.
export const ru = {
  'fe.cf.title': 'Подтверди, что это ты',
  'fe.cf.lead': 'Это важное действие. Мы отправили код на твою почту.',
  'fe.cf.code': 'Код из письма',
  'fe.cf.again': 'Отправить ещё раз',
  'fe.cf.sent': 'Код отправлен',
  'fe.cf.wrong': 'Не тот код. Осталось попыток: {n}',
  'fe.cf.expired': 'Код устарел. Отправь новый',
  'fe.cf.tries': 'Слишком много попыток. Отправь новый код',
  'fe.cf.missing': 'Сначала запроси код',
  'fe.cf.failed': 'Не получилось отправить письмо. Попробуй чуть позже',
} as const;
export const en = {
  'fe.cf.title': 'Confirm it’s you',
  'fe.cf.lead': 'This is an important action. We sent a code to your email.',
  'fe.cf.code': 'Code from the email',
  'fe.cf.again': 'Send again',
  'fe.cf.sent': 'Code sent',
  'fe.cf.wrong': 'Wrong code. Attempts left: {n}',
  'fe.cf.expired': 'The code expired. Send a new one',
  'fe.cf.tries': 'Too many attempts. Send a new code',
  'fe.cf.missing': 'Ask for a code first',
  'fe.cf.failed': 'Couldn’t send the email. Try again a bit later',
} as const;
