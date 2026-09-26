# Fit Timer — подготовка платежей

Актуально: 21.09.2026.

## Архитектура
Один серверный Premium entitlement. APK никогда не выдаёт Premium сам.
Google Play, RuStore и ЮKassa только подтверждают оплату; backend обновляет account.sub.

## Каналы
- Google Play Billing — основной Android-канал вне РФ.
- RuStore Pay SDK — российский store-канал.
- ЮKassa — российский direct/fallback-канал там, где правила площадки это разрешают.

## Уже подготовлено
- admin.html: отдельные настройки Google Play / RuStore / ЮKassa;
- /api/health: readiness каждого провайдера без вывода секретов;
- Premium server-authoritative для AI, sync и Premium-каталога;
- legacy androidMonth/androidYear сохранены для старых клиентов.

## Google Play
1. Создать подписку и базовые планы месяц/год в Play Console.
2. Product IDs вписать в админке.
3. Создать service account с доступом к Google Play Developer API.
4. Vercel Production: GOOGLE_PLAY_SERVICE_ACCOUNT_JSON или GOOGLE_PLAY_SERVICE_ACCOUNT_BASE64.
5. Следующий кодовый этап: Play Billing Library 9.1.x + server verification subscriptionsv2.get.
6. Затем RTDN через Google Cloud Pub/Sub.

Официально:
https://developer.android.com/google/play/billing/backend
https://developer.android.com/google/play/billing/release-notes

## RuStore
Использовать Pay SDK. Старый BillingClient больше не использовать.

1. Подключить монетизацию в RuStore Console.
2. Создать подписки месяц/год.
3. Product codes вписать в админке.
4. Подключить Pay SDK и серверную валидацию.
5. Включить Монетизация → Уведомления на сервер.
6. Секреты только на backend.

Официально:
https://www.rustore.ru/help/sdk/pay
https://www.rustore.ru/help/developers/monetization/payment-callback/enable-notifications

## ЮKassa
1. Создать магазин и пройти onboarding.
2. Подключить API и автоплатежи у ЮKassa.
3. Vercel Production: YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY.
4. Первый платёж через SDK/API; backend хранит payment_method_id, но не данные карты.
5. Webhook-и обновляют единый Premium entitlement.
6. Показывать ЮKassa только в разрешённом distribution channel / регионе.

Официально:
https://yookassa.ru/developers/payment-acceptance/integration-scenarios/mobile-sdks/android-sdk
https://yookassa.ru/developers/payment-acceptance/scenario-extensions/recurring-payments/basics

## Следующий кодовый этап
1. Google Play Billing native bridge.
2. Google server verification + RTDN.
3. RuStore Pay native bridge + server notifications.
4. ЮKassa create/confirm/webhook/autopay.
5. Server-side routing + restore purchases.
6. Play Integrity для high-value запросов.

Никакие secret keys не помещать в APK, mobile.js, admin.html или git.
