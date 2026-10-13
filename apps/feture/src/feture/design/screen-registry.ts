// IDs and navigation references from MASTER-PRODUCT-SPEC-V4.
export const designScreens = [
 {
  "id": "A01",
  "ru": "Приветствие",
  "en": "Welcome",
  "links": [
   "A02"
  ]
 },
 {
  "id": "A02",
  "ru": "Вход или регистрация",
  "en": "Sign in or sign up",
  "links": [
   "A01",
   "A03"
  ]
 },
 {
  "id": "A03",
  "ru": "Подтверждение входа",
  "en": "Verify sign in",
  "links": [
   "A02",
   "A04",
   "F01"
  ]
 },
 {
  "id": "A04",
  "ru": "Минимальный профиль",
  "en": "Set up your profile",
  "links": [
   "A03",
   "A05"
  ]
 },
 {
  "id": "A05",
  "ru": "Необязательное начало",
  "en": "Optional first steps",
  "links": [
   "A04",
   "X06",
   "X07",
   "F01",
   "P02",
   "A06"
  ]
 },
 {
  "id": "A06",
  "ru": "Зачем нужна проверка возраста",
  "en": "Age check required",
  "links": [
   "A07"
  ]
 },
 {
  "id": "A07",
  "ru": "Проверка возраста",
  "en": "Verify your age",
  "links": [
   "A06",
   "A08"
  ]
 },
 {
  "id": "A08",
  "ru": "Статус проверки",
  "en": "Verification status",
  "links": [
   "A07",
   "A06"
  ]
 },
 {
  "id": "A09",
  "ru": "Согласия и условия",
  "en": "Consent and terms",
  "links": []
 },
 {
  "id": "A10",
  "ru": "Возврат после входа",
  "en": "Continue after sign in",
  "links": [
   "X07",
   "E03",
   "P01"
  ]
 },
 {
  "id": "F01",
  "ru": "Основная лента",
  "en": "For you",
  "links": [
   "F05",
   "P01",
   "F02",
   "F06",
   "E01"
  ]
 },
 {
  "id": "F02",
  "ru": "Фильтры ленты",
  "en": "Feed filters",
  "links": [
   "F01",
   "F03"
  ]
 },
 {
  "id": "F03",
  "ru": "Подписки",
  "en": "Following",
  "links": [
   "F05",
   "P01",
   "G01"
  ]
 },
 {
  "id": "F04",
  "ru": "Публикации по теме",
  "en": "Topic feed",
  "links": [
   "F02",
   "X06",
   "F05",
   "C03"
  ]
 },
 {
  "id": "F05",
  "ru": "Публикация и обсуждение",
  "en": "Post and replies",
  "links": [
   "F01",
   "F03",
   "C06",
   "G01",
   "P01",
   "S02"
  ]
 },
 {
  "id": "F06",
  "ru": "Тип новой публикации",
  "en": "Create",
  "links": [
   "F07",
   "X11",
   "E11"
  ]
 },
 {
  "id": "F07",
  "ru": "Редактор публикации",
  "en": "Post editor",
  "links": [
   "F06",
   "F08",
   "F09",
   "M01",
   "F10"
  ]
 },
 {
  "id": "F08",
  "ru": "Аудитория публикации",
  "en": "Post audience",
  "links": [
   "F07"
  ]
 },
 {
  "id": "F09",
  "ru": "Предпросмотр публикации",
  "en": "Post preview",
  "links": [
   "F07",
   "F10"
  ]
 },
 {
  "id": "F10",
  "ru": "Мои публикации и черновики",
  "en": "My posts and drafts",
  "links": [
   "F09",
   "F07",
   "F05",
   "S04"
  ]
 },
 {
  "id": "G01",
  "ru": "Общий поиск",
  "en": "Search",
  "links": [
   "P01",
   "F05",
   "C03",
   "E03",
   "X06"
  ]
 },
 {
  "id": "G02",
  "ru": "Социальный поиск людей",
  "en": "Find people",
  "links": [
   "G01",
   "P01",
   "Q03"
  ]
 },
 {
  "id": "G03",
  "ru": "Поиск публикаций и тем",
  "en": "Find posts and topics",
  "links": [
   "F05",
   "X06",
   "G01",
   "F04"
  ]
 },
 {
  "id": "G04",
  "ru": "Сохранённое",
  "en": "Saved",
  "links": []
 },
 {
  "id": "D01",
  "ru": "Знакомства выключены",
  "en": "Dating is off",
  "links": [
   "D02",
   "D06",
   "D07"
  ]
 },
 {
  "id": "D02",
  "ru": "Открыть анкету для знакомств",
  "en": "Enable dating",
  "links": [
   "D01",
   "P02",
   "P03",
   "A06",
   "D03"
  ]
 },
 {
  "id": "D03",
  "ru": "Подборка со свайпами",
  "en": "Discover",
  "links": [
   "D02",
   "D04",
   "P01",
   "P05",
   "D05",
   "D08",
   "D10"
  ]
 },
 {
  "id": "D04",
  "ru": "Фильтры знакомств",
  "en": "Dating preferences",
  "links": [
   "D03"
  ]
 },
 {
  "id": "D05",
  "ru": "Отправленная симпатия",
  "en": "Like sent",
  "links": [
   "D03",
   "P01",
   "D08"
  ]
 },
 {
  "id": "D06",
  "ru": "Симпатии",
  "en": "Likes",
  "links": [
   "N01",
   "P01",
   "D08"
  ]
 },
 {
  "id": "D07",
  "ru": "Взаимные симпатии",
  "en": "Matches",
  "links": [
   "H02",
   "P01",
   "H04"
  ]
 },
 {
  "id": "D08",
  "ru": "Взаимная симпатия",
  "en": "It is mutual",
  "links": [
   "D03",
   "D06",
   "P01",
   "H02"
  ]
 },
 {
  "id": "D09",
  "ru": "История подборки",
  "en": "Recently viewed",
  "links": [
   "P01",
   "D03",
   "B02"
  ]
 },
 {
  "id": "D10",
  "ru": "Нет подходящих анкет",
  "en": "No profiles found",
  "links": [
   "E01",
   "C01",
   "D03",
   "D04"
  ]
 },
 {
  "id": "D11",
  "ru": "Настройки участия",
  "en": "Dating visibility",
  "links": [
   "K04",
   "D01",
   "P02",
   "P03"
  ]
 },
 {
  "id": "P01",
  "ru": "Профиль человека",
  "en": "Member profile",
  "links": [
   "F05",
   "G02",
   "D03",
   "H02",
   "P05",
   "P06",
   "D05",
   "S02"
  ]
 },
 {
  "id": "P02",
  "ru": "Редактор своего профиля",
  "en": "Edit profile",
  "links": [
   "D02",
   "P03",
   "M01",
   "P04",
   "X01"
  ]
 },
 {
  "id": "P03",
  "ru": "Что видят другие",
  "en": "Profile preview",
  "links": [
   "P02",
   "P04",
   "D02",
   "D03"
  ]
 },
 {
  "id": "P04",
  "ru": "Редактор приватных разделов",
  "en": "Private profile editor",
  "links": [
   "P03",
   "P10",
   "M01"
  ]
 },
 {
  "id": "P05",
  "ru": "Карта совпадений",
  "en": "Shared interests",
  "links": [
   "P01",
   "P08",
   "H02",
   "Q03",
   "X06",
   "P06"
  ]
 },
 {
  "id": "P06",
  "ru": "Запрос приватного доступа",
  "en": "Request access",
  "links": [
   "B02",
   "P01",
   "H02",
   "P07"
  ]
 },
 {
  "id": "P07",
  "ru": "Центр запросов",
  "en": "Access requests",
  "links": [
   "N01",
   "P06",
   "P09",
   "P10",
   "P01"
  ]
 },
 {
  "id": "P08",
  "ru": "Открытый приватный профиль",
  "en": "Private profile shared with you",
  "links": [
   "P01",
   "P10",
   "H02",
   "M02",
   "P05"
  ]
 },
 {
  "id": "P09",
  "ru": "Решение по запросу",
  "en": "Review access request",
  "links": [
   "P07",
   "P10",
   "Q05"
  ]
 },
 {
  "id": "P10",
  "ru": "Действующие разрешения",
  "en": "Active sharing",
  "links": [
   "P07",
   "P08",
   "P11",
   "P09"
  ]
 },
 {
  "id": "P11",
  "ru": "Отзыв доступа",
  "en": "Revoke sharing",
  "links": [
   "P10",
   "H03"
  ]
 },
 {
  "id": "P12",
  "ru": "Заблокированные контакты",
  "en": "Blocked members",
  "links": [
   "K04"
  ]
 },
 {
  "id": "X01",
  "ru": "Я",
  "en": "Me",
  "links": [
   "X02",
   "X05",
   "X12",
   "P02",
   "P07",
   "Q01",
   "G04",
   "E10",
   "K01",
   "N01"
  ]
 },
 {
  "id": "X02",
  "ru": "Моя карта",
  "en": "My map",
  "links": [
   "X01",
   "X03",
   "X05",
   "X08",
   "X04"
  ]
 },
 {
  "id": "X03",
  "ru": "Моя отметка по теме",
  "en": "My topic entry",
  "links": [
   "X02",
   "X06"
  ]
 },
 {
  "id": "X04",
  "ru": "Изменения моей карты",
  "en": "Map history",
  "links": [
   "X02",
   "X03",
   "X09",
   "X12"
  ]
 },
 {
  "id": "X05",
  "ru": "Изучить",
  "en": "Explore",
  "links": [
   "X01",
   "X06",
   "X07",
   "G03"
  ]
 },
 {
  "id": "X06",
  "ru": "Тема и знания",
  "en": "Topic guide",
  "links": [
   "X05",
   "G03",
   "F04",
   "X03",
   "X07",
   "C03"
  ]
 },
 {
  "id": "X07",
  "ru": "Описание теста",
  "en": "About this questionnaire",
  "links": [
   "X05",
   "A05",
   "X08",
   "B02"
  ]
 },
 {
  "id": "X08",
  "ru": "Вопросы теста",
  "en": "Questionnaire",
  "links": [
   "X07",
   "X09"
  ]
 },
 {
  "id": "X09",
  "ru": "Результат теста",
  "en": "Questionnaire result",
  "links": [
   "X08",
   "X04",
   "X10",
   "X11",
   "X02"
  ]
 },
 {
  "id": "X10",
  "ru": "Добавить результат в карту",
  "en": "Review map updates",
  "links": [
   "X09",
   "X02"
  ]
 },
 {
  "id": "X11",
  "ru": "Поделиться результатом",
  "en": "Share selected results",
  "links": [
   "X09",
   "F09",
   "F10",
   "K08"
  ]
 },
 {
  "id": "X12",
  "ru": "Дневник",
  "en": "Journal",
  "links": [
   "X01",
   "X13",
   "X14"
  ]
 },
 {
  "id": "X13",
  "ru": "Запись дневника",
  "en": "Journal entry",
  "links": [
   "X12",
   "X14",
   "F07",
   "O11"
  ]
 },
 {
  "id": "X14",
  "ru": "Редактор дневника",
  "en": "Journal editor",
  "links": [
   "X12",
   "X13",
   "M01"
  ]
 },
 {
  "id": "C01",
  "ru": "Каталог сообществ",
  "en": "Discover communities",
  "links": [
   "C03",
   "C08",
   "G01",
   "C02"
  ]
 },
 {
  "id": "C02",
  "ru": "Мои сообщества",
  "en": "Joined communities",
  "links": [
   "C01",
   "C03",
   "C05",
   "C10"
  ]
 },
 {
  "id": "C03",
  "ru": "Страница сообщества",
  "en": "Community",
  "links": [
   "C01",
   "C02",
   "F04",
   "C04",
   "C05",
   "C06",
   "E03"
  ]
 },
 {
  "id": "C04",
  "ru": "Правила и вступление",
  "en": "Join community",
  "links": [
   "C03",
   "C05"
  ]
 },
 {
  "id": "C05",
  "ru": "Заявка в сообщество",
  "en": "Membership request",
  "links": [
   "C04",
   "N01",
   "C03"
  ]
 },
 {
  "id": "C06",
  "ru": "Обсуждения сообщества",
  "en": "Discussions",
  "links": [
   "C03",
   "F05",
   "C07",
   "P01"
  ]
 },
 {
  "id": "C07",
  "ru": "Новое обсуждение",
  "en": "New discussion",
  "links": [
   "C06",
   "F09",
   "F10"
  ]
 },
 {
  "id": "C08",
  "ru": "Создание сообщества",
  "en": "Create community",
  "links": [
   "C01",
   "C09"
  ]
 },
 {
  "id": "C09",
  "ru": "Предпросмотр и статус группы",
  "en": "Community preview",
  "links": [
   "C08",
   "C10"
  ]
 },
 {
  "id": "C10",
  "ru": "Управление сообществом",
  "en": "Manage community",
  "links": [
   "C02",
   "C03",
   "C11",
   "C12",
   "E11"
  ]
 },
 {
  "id": "C11",
  "ru": "Решения по участникам",
  "en": "Member requests",
  "links": [
   "C10",
   "N01",
   "C05"
  ]
 },
 {
  "id": "C12",
  "ru": "Модерация сообщества",
  "en": "Community moderation",
  "links": [
   "C10",
   "S03",
   "S04",
   "F05"
  ]
 },
 {
  "id": "E01",
  "ru": "Каталог событий",
  "en": "Events",
  "links": [
   "F01",
   "G01",
   "E02",
   "E03",
   "E11"
  ]
 },
 {
  "id": "E02",
  "ru": "Фильтры событий",
  "en": "Event filters",
  "links": [
   "E01"
  ]
 },
 {
  "id": "E03",
  "ru": "Страница события",
  "en": "Event details",
  "links": [
   "E01",
   "G01",
   "C03",
   "N01",
   "E04",
   "E05",
   "E06",
   "E08",
   "E09",
   "P01"
  ]
 },
 {
  "id": "E04",
  "ru": "Правила участия",
  "en": "Event requirements",
  "links": [
   "E03",
   "E05",
   "E06"
  ]
 },
 {
  "id": "E05",
  "ru": "Ответ и видимость участия",
  "en": "RSVP and privacy",
  "links": [
   "E03",
   "E06"
  ]
 },
 {
  "id": "E06",
  "ru": "Заявка на событие",
  "en": "Apply to attend",
  "links": [
   "E04",
   "E05",
   "E07"
  ]
 },
 {
  "id": "E07",
  "ru": "Статус заявки на событие",
  "en": "Application status",
  "links": [
   "E06",
   "N01",
   "E10",
   "E03",
   "E08",
   "E09"
  ]
 },
 {
  "id": "E08",
  "ru": "Адрес или онлайн вход",
  "en": "Venue or joining link",
  "links": [
   "E03",
   "E07"
  ]
 },
 {
  "id": "E09",
  "ru": "Внешняя регистрация или билет",
  "en": "External booking",
  "links": [
   "E03",
   "E07"
  ]
 },
 {
  "id": "E10",
  "ru": "Мои события",
  "en": "My events",
  "links": [
   "E03",
   "E07",
   "E11",
   "E15"
  ]
 },
 {
  "id": "E11",
  "ru": "Создать событие",
  "en": "Create event",
  "links": [
   "F06",
   "E01",
   "E10",
   "C10",
   "E12",
   "E13",
   "E14"
  ]
 },
 {
  "id": "E12",
  "ru": "Время место и формат",
  "en": "Time and location",
  "links": [
   "E11",
   "E13",
   "E14"
  ]
 },
 {
  "id": "E13",
  "ru": "Условия и заявки",
  "en": "Admission settings",
  "links": [
   "E11",
   "E12",
   "E14"
  ]
 },
 {
  "id": "E14",
  "ru": "Предпросмотр события",
  "en": "Event preview",
  "links": [
   "E11",
   "E13",
   "E15"
  ]
 },
 {
  "id": "E15",
  "ru": "Панель организатора",
  "en": "Manage event",
  "links": [
   "E10",
   "E14",
   "E16",
   "E17",
   "E18"
  ]
 },
 {
  "id": "E16",
  "ru": "Заявки и допуски",
  "en": "Attendee applications",
  "links": [
   "E15",
   "N01",
   "E07"
  ]
 },
 {
  "id": "E17",
  "ru": "Изменить или отменить событие",
  "en": "Change or cancel event",
  "links": [
   "E15",
   "E03",
   "N01"
  ]
 },
 {
  "id": "E18",
  "ru": "Объявления события",
  "en": "Event updates",
  "links": [
   "E03",
   "E15",
   "H06"
  ]
 },
 {
  "id": "H01",
  "ru": "Список чатов",
  "en": "Conversations",
  "links": [
   "H02",
   "H05",
   "H06",
   "D08"
  ]
 },
 {
  "id": "H02",
  "ru": "Личный диалог",
  "en": "Conversation",
  "links": [
   "H01",
   "D08",
   "P01",
   "H03",
   "P06",
   "M01"
  ]
 },
 {
  "id": "H03",
  "ru": "Информация диалога",
  "en": "Conversation details",
  "links": [
   "H02",
   "P10",
   "P11",
   "S02",
   "H04"
  ]
 },
 {
  "id": "H04",
  "ru": "Прекратить контакт",
  "en": "End connection",
  "links": [
   "H03",
   "D07",
   "H01",
   "P12"
  ]
 },
 {
  "id": "H05",
  "ru": "Архив диалогов",
  "en": "Archived conversations",
  "links": [
   "H01",
   "H02"
  ]
 },
 {
  "id": "H06",
  "ru": "Организационные обновления",
  "en": "Updates",
  "links": [
   "H01",
   "E18",
   "C03",
   "N01"
  ]
 },
 {
  "id": "H07",
  "ru": "Общий диалог пары",
  "en": "Shared conversation",
  "links": [
   "Q07",
   "D08",
   "Q03",
   "H03"
  ]
 },
 {
  "id": "Q01",
  "ru": "Создать связь",
  "en": "Create a partner link",
  "links": [
   "Q02"
  ]
 },
 {
  "id": "Q02",
  "ru": "Принять связь",
  "en": "Accept partner link",
  "links": [
   "N01",
   "Q03"
  ]
 },
 {
  "id": "Q03",
  "ru": "Профиль пары",
  "en": "Couple profile",
  "links": [
   "P01",
   "G02",
   "D03",
   "Q04",
   "Q05",
   "Q07",
   "P05"
  ]
 },
 {
  "id": "Q04",
  "ru": "Общий редактор и согласия",
  "en": "Edit couple profile",
  "links": [
   "Q03",
   "D02"
  ]
 },
 {
  "id": "Q05",
  "ru": "Совместное раскрытие",
  "en": "Joint sharing approval",
  "links": [
   "P07",
   "Q03",
   "P10"
  ]
 },
 {
  "id": "Q06",
  "ru": "Разъединение пары",
  "en": "Unlink partners",
  "links": [
   "Q04",
   "X01",
   "Q03"
  ]
 },
 {
  "id": "Q07",
  "ru": "Согласовать общий контакт",
  "en": "Approve a shared connection",
  "links": [
   "D03",
   "Q03",
   "D08",
   "H07"
  ]
 },
 {
  "id": "M01",
  "ru": "Добавить фото или видео",
  "en": "Add media",
  "links": [
   "P02",
   "P04",
   "F07",
   "X14",
   "M03"
  ]
 },
 {
  "id": "M02",
  "ru": "Просмотр материала",
  "en": "Media viewer",
  "links": [
   "P08",
   "F05",
   "H02",
   "S02"
  ]
 },
 {
  "id": "M03",
  "ru": "Статус материала",
  "en": "Media status",
  "links": [
   "M01",
   "F10",
   "E14"
  ]
 },
 {
  "id": "N01",
  "ru": "Центр уведомлений",
  "en": "Notifications",
  "links": [
   "P07",
   "D06",
   "H02",
   "E07",
   "E03",
   "K05"
  ]
 },
 {
  "id": "N02",
  "ru": "Разрешить напоминания",
  "en": "Enable notifications",
  "links": []
 },
 {
  "id": "K01",
  "ru": "Настройки аккаунта",
  "en": "Account settings",
  "links": [
   "K02",
   "K03",
   "K04",
   "K05",
   "K06",
   "K07",
   "K08",
   "B04",
   "S01"
  ]
 },
 {
  "id": "K02",
  "ru": "Язык",
  "en": "Language",
  "links": [
   "K01"
  ]
 },
 {
  "id": "K03",
  "ru": "Тема",
  "en": "Appearance",
  "links": [
   "K01"
  ]
 },
 {
  "id": "K04",
  "ru": "Приватность",
  "en": "Privacy",
  "links": [
   "K01",
   "P03",
   "P10",
   "P12",
   "D11"
  ]
 },
 {
  "id": "K05",
  "ru": "Уведомления",
  "en": "Notification preferences",
  "links": [
   "K01",
   "N01",
   "N02"
  ]
 },
 {
  "id": "K06",
  "ru": "Безопасность и сессии",
  "en": "Security and sessions",
  "links": [
   "K01",
   "A01"
  ]
 },
 {
  "id": "K07",
  "ru": "Мои данные и удаление",
  "en": "Your data",
  "links": [
   "K01",
   "A01"
  ]
 },
 {
  "id": "K08",
  "ru": "Ссылки и сравнения",
  "en": "Shared links",
  "links": [
   "X11",
   "P04"
  ]
 },
 {
  "id": "B01",
  "ru": "Возможности Premium",
  "en": "Premium membership",
  "links": [
   "K01",
   "B03",
   "B04"
  ]
 },
 {
  "id": "B02",
  "ru": "Ограничение конкретного действия",
  "en": "Membership limit",
  "links": [
   "B03",
   "P06",
   "D09"
  ]
 },
 {
  "id": "B03",
  "ru": "Оплата и результат",
  "en": "Purchase and status",
  "links": [
   "B01",
   "B02",
   "B04"
  ]
 },
 {
  "id": "B04",
  "ru": "Управлять и восстановить подписку",
  "en": "Manage membership",
  "links": [
   "K01",
   "B03"
  ]
 },
 {
  "id": "S01",
  "ru": "Помощь",
  "en": "Help",
  "links": [
   "K01",
   "S03"
  ]
 },
 {
  "id": "S02",
  "ru": "Жалоба",
  "en": "Report",
  "links": [
   "S03"
  ]
 },
 {
  "id": "S03",
  "ru": "Статус обращения",
  "en": "Report status",
  "links": [
   "S02",
   "S01",
   "N01",
   "S04"
  ]
 },
 {
  "id": "S04",
  "ru": "Решение и апелляция",
  "en": "Decision and appeal",
  "links": [
   "F10",
   "C12",
   "M03",
   "N01",
   "S03"
  ]
 },
 {
  "id": "S05",
  "ru": "Ресурс недоступен",
  "en": "Content unavailable",
  "links": []
 }
] as const;
export type ScreenId = typeof designScreens[number]["id"];
