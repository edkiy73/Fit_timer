# FetUre — инфраструктура и решения перед запуском

Проверено 29.10.2026. Цены и правила меняются: перед оплатой открой ссылку из «Источников». «Проверить» — первоисточник
факт не подтвердил.

## Файлы

| Файл | О чём |
|---|---|
| [legal-docs.md](legal-docs.md) | Главная развилка «Россия или зарубежный сервис», документы, DSA, юрлицо |
| [payments.md](payments.md) | Оплата Premium: российские карты и Visa/MC |
| [age-and-verification.md](age-and-verification.md) | Законы 18+ по странам, наша проверка возраста, что не хранить |
| [moderation-illegal-content.md](moderation-illegal-content.md) | CSAM, автопроверка фото, модераторы; тестовые модераторы — [../moderators.md](../moderators.md) |
| [app-stores.md](app-stores.md) | Google Play, верификация Android-разработчиков, Apple, RuStore |
| [servers-and-costs.md](servers-and-costs.md) | Vercel, Supabase, где хранить медиа, регион, цены |
| [email-domain.md](email-domain.md) | Домен, письма с кодом входа, доставляемость |
| [personal-data-law.md](personal-data-law.md) | 152-ФЗ и GDPR: интимные данные, локализация |
| [security.md](security.md) | От чего защищаемся: сценарии атак и меры |
| [security-keys.md](security-keys.md) | Ключи, 2FA, ключ подписи Android, что делать при утечке |

**Самое важное:** откровенный контент плюс оператор-гражданин РФ — личный уголовный риск по ст. 242 УК РФ. **До
запуска нужна одна платная консультация юриста** ([legal-docs.md](legal-docs.md)). От её итога зависят платежи,
домен, регион и документы.

## Чек-лист

### До первых реальных пользователей

| Что | Стоимость | Что делает владелец | Файл |
|---|---|---|---|
| Сменить админ-ключ на длинный случайный | 0 | Создать и вставить в Vercel (10 мин) | [security-keys](security-keys.md) |
| Выключить «код входа за любого» из админки в `live` | 0 | Согласие; делает агент | [security](security.md) |
| 2FA везде: GitHub, Vercel, Supabase, Google, почта | 0 | 30 мин | [security-keys](security-keys.md) |
| **2FA (TOTP/passkeys) для сотрудников** | 0 | Согласие; делает агент | [security](security.md) |
| Две копии ключа подписи Android и пароля | 0 | Флешка + облако | [security-keys](security-keys.md) |
| Консультация юриста: ст. 242 УК, 152-ФЗ, юрлицо | ~30–80 тыс. ₽ (проверить) | Найти юриста по IT/медиа | [legal-docs](legal-docs.md) |
| Свой домен .com на Porkbun | ~$11/год | Купить, дать агенту доступ к DNS | [email-domain](email-domain.md) |
| Письма с кодом входа со своего домена (Resend) | 0 до 3000 писем/мес | Добавить домен в Resend | [email-domain](email-domain.md) |
| Проверка CSAM: Arachnid Shield | 0 | Зарегистрироваться | [moderation](moderation-illegal-content.md) |
| 2–3 модератора с личными аккаунтами вместо `@feture.test` | 0 (или зарплата) | Назвать людей, NDA | [moderation](moderation-illegal-content.md), [../moderators.md](../moderators.md) |
| Закрыть доступ из Великобритании | 0 | Согласие; делает агент | [age-and-verification](age-and-verification.md) |
| CSAE-стандарты и контакт по детской безопасности | 0 | Утвердить текст | [moderation](moderation-illegal-content.md) |

### До публичного запуска

| Что | Стоимость | Что делает владелец | Файл |
|---|---|---|---|
| Перенести сервер и базу во Франкфурт, отдельный проект | +$10/мес | Создать проект Supabase | [servers-and-costs](servers-and-costs.md) |
| Медиа на Bunny (прямо разрешает 18+) | ~$10–15/мес | Аккаунт, карта не РФ | [servers-and-costs](servers-and-costs.md) |
| «Вход с нового устройства» + экран «Мои устройства» | 0 | — | [security](security.md) |
| Автопроверка фото (Sightengine) | $29/мес | Завести аккаунт | [moderation](moderation-illegal-content.md) |
| Закрыть весь US на старте | 0 | Согласие | [age-and-verification](age-and-verification.md) |
| Юрлицо и платёжный провайдер | от ~10 тыс. ₽ (ИП) | По итогам юриста | [payments](payments.md) |
| Представитель в ЕС по DSA + GDPR | ~€420–800/год | Договор онлайн | [legal-docs](legal-docs.md) |
| Финальные документы RU + EN, согласие на интимные данные | в счёт юриста | Утвердить | [legal-docs](legal-docs.md) |
| Регистрация Android-разработчика, пакет ru.feture.app | $25 | Паспорт, карта не РФ | [app-stores](app-stores.md) |
| Vercel Pro с первым платежом | $20/мес | Оплатить | [servers-and-costs](servers-and-costs.md) |

### Потом

| Что | Стоимость | Файл |
|---|---|---|
| Внешняя проверка возраста (Didit) для строгих стран ЕС | ~$0,10 за проверку, 500/мес бесплатно | [age-and-verification](age-and-verification.md) |
| PhotoDNA, Google CSAI, NCMEC — после юрлица | 0 | [moderation](moderation-illegal-content.md) |
| Passkey/TOTP по желанию для пользователей | 0 | [security](security.md) |
| «Чистая» сборка для Google Play; iOS + APNs | $25 / $99 в год | [app-stores](app-stores.md) |
| PITR-бэкапы Supabase | $100/мес | [servers-and-costs](servers-and-costs.md) |
| Иностранная компания + CCBill/Segpay | от $1000/год + 6–15% | [payments](payments.md) |
