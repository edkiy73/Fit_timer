/** The restriction notice on «Лента» and «Я» (src/fe/restriction.tsx) and the refusal while restricted. */
const PT_RU = { search: 'поиск', discover: 'знакомства', likes: 'лайки', follows: 'подписки', access: 'запросы доступа', messages: 'сообщения',
  links: 'связи и пары', communities: 'сообщества', events: 'события', posts: 'посты', comments: 'комментарии', reactions: 'реакции и голоса', uploads: 'загрузка файлов' };
const PT_EN = { search: 'search', discover: 'dating', likes: 'likes', follows: 'follows', access: 'access requests', messages: 'messages',
  links: 'links and couples', communities: 'communities', events: 'events', posts: 'posts', comments: 'comments', reactions: 'reactions and votes', uploads: 'uploads' };
const pts = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).map(([k, v]) => ['fe.rst.pt.' + k, v]));
export const ru = {
  'fe.rst.title': 'Профиль ограничен',
  'fe.rst.until': 'до {date}.',
  'fe.rst.untilLifted': 'пока модераторы не снимут.',
  'fe.rst.limits': 'Сейчас нельзя: {list}.',
  'fe.rst.more': 'Подробнее',
  ...pts(PT_RU),
};
export const en = {
  'fe.rst.title': 'Your profile is restricted',
  'fe.rst.until': 'until {date}.',
  'fe.rst.untilLifted': 'until moderators lift it.',
  'fe.rst.limits': 'Not allowed now: {list}.',
  'fe.rst.more': 'Details',
  ...pts(PT_EN),
};
