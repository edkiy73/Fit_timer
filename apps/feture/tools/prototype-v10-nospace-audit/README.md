# V10 «Тексты без пробелов» — аудит переполнения (QA-инструменты)

Не часть продукта и не входит в сборку. Отчёт: `docs/design-reference/V10-NOSPACE-AUDIT-2026-10-16.md`.
Режим данных живёт в `prototype/v10/qa.js` (`?nospace=1`, `FT_QA.nospace(true|false)`, панель V10 → «Тексты без пробелов»).

Запуск (нужен `playwright` и Chromium; сначала `node tools/build-prototype-v10.mjs`):

```bash
cd apps/feture/public && python3 -m http.server 8123 &      # или V10_URL=… для preview
cd apps/feture/tools/prototype-v10-nospace-audit
node static.mjs ru,en light all full out/p1        # все экраны меню V10 × 6 размеров × RU/EN
node discover.mjs                                   # собирает дополнительные экраны по ссылкам
node crawl.mjs ru 320 0/4                           # клики по всем кнопкам + второй уровень в Bottom Sheet
node flows.mjs ru 320 light full                    # формы с максимальной длиной, публикации, диалоги
node verify.mjs 320 ru light                        # скриншоты и CSS-цепочка по списку comps.json
```

Результаты (`out/`, `shots/`) в репозиторий не кладутся. Необязательно: `fonts/onest.css` + woff2, чтобы не зависеть от Google Fonts.

## Опасный ввод (теги, спецсимволы)

Режим данных: `?hostile=1`, `FT_QA.hostile(true)`, панель V10 → «Опасные символы». `window.__x(id)` вызывается каждым script-/handler-пейлоадом; `FT_QA.hits()` и `FT_QA.hostileIds()` показывают, какое поле выполнилось.

```bash
node sec.mjs ru 390 0/4 20      # обход кликами + проверка DOM: выполнение, внедрённые теги, on*-атрибуты, javascript:-URL
node flowsec.mjs ru 390 light full   # те же проверки на сценариях с набором опасных строк руками
node poc.mjs                     # сквозные PoC: введённое руками имя сообщества → заголовок Bottom Sheet
node urlt.mjs                    # hash, query, localStorage
```

`SAN=off node sec.mjs …` выключает защитный слой `safeInline()` и проверяет, что вызовы экранируют сами (должно быть 0 находок). `typed.mjs` — очистка ввода (bidi/управляющие/Zalgo).
