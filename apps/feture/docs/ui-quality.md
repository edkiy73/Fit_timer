# FetUre — обязательная приёмка интерфейса (2026-10-12)

Применяется к пользовательскому приложению и общей AppBase-админке, **без создания второй админки**. Функциональные требования задают `apps/feture/AGENTS.md` и карточка MVP; этот файл — критерии качества, а не повод для масштабного редизайна.

## Как строим интерфейс
- React + TypeScript + React Aria Components и действующая тема продукта. Использовать имеющиеся `@appbase/ui-react` компоненты и `AdminWorkspace`; изменения общих компонентов согласовывать отдельно и проверять на других приложениях.
- На экране должен быть понятен **главный сценарий**, а не только набор полей. Большие разделы: компактный список/фильтр → отдельное рабочее окно/диалог → подтверждение → возврат фокуса и позиции.
- Не создавать длинные мобильные страницы из развернутых редакторов. Сложные формы открывать в подходящем dialog/drawer/sheet, с разумной высотой, прокруткой **внутри** окна, доступным закрытием, блокировкой потери несохранённых данных.
- Единая визуальная иерархия: типографика, spacing, кнопки, состояния, отступы, контраст обеих тем. Не копировать визуальные элементы, тексты, ссылки и бренд UnMute/FitTimer. Удалять технические названия с пользовательских экранов.
- Все действия имеют loading/empty/error/success состояния; ошибки понятны и не очищают введённое; долгие действия не дублируются; опасные требуют подтверждения.
- Motion: аккуратные быстрые анимации на действия, `prefers-reduced-motion`, без лагов на Android и бесконечных тяжёлых эффектов. Не добавлять зависимости без реальной необходимости.

## Обязательные размеры
- Телефон: 320, 390 px (safe area, Android клавиатура, нижний док, thumb reach).
- Планшет и fold: 768, 1024 px; используем дополнительную площадь, а не растягиваем телефон.
- Desktop: 1440 px, полноценная боковая навигация и читаемая ширина текста.
- 200% zoom, portrait/landscape, длинные названия, большие формы, обе темы. Без горизонтального переполнения и недоступных кнопок.

## Чек-лист каждой заметной UI-правки
1. Пройти главные действия, `Tab`, `Escape`, системную кнопку Back, сохранение/отмену/ошибки, фокус диалога.
2. Проверить 320/390/768/1024/1440; использовать существующие browser fixtures или скриншоты **реально запущенной** страницы, если доступен браузер.
3. Проверить тексты, которые пользователь видит без авторизации, и защиту приватной информации в админке.
4. В PR перечислить реальные выполненные проверки и отдельно непроверенные (например, физический телефон, живые staff-сессии, iOS).
5. Сторонний независимый reviewer проверяет diff и критические сценарии; приёмка дизайна владельцем остаётся самостоятельным этапом.

Для задачи, затрагивающей `packages/ui-react`, автономный агент не меняет общий пакет: остановить такую задачу и создать отдельный PR с проверкой всех приложений. Не подменять реальный UX-тест утверждением «сборка прошла».
## FetUre visual north star (owner-approved reference)
Use [Claude mobile prototype reference](design-reference/README.md) for Geologica, warm dual theme, red/lilac accents, meaningful spatial rhythm, active chips, blur navigation, bottom-sheet and card motion. The original HTML is a **reference**, not production code, privacy implementation or proof of desktop responsiveness. Desktop: real responsive page/sidebar/multi-column reading at ≥1100px, **not a 390px phone framed on a desktop**. A generic stack of default cards/plain links (as on the initial Account page) fails UI acceptance even if the React build passes.

Before a large UI implementation: a short UX hierarchy + states + form-factor plan; after: actual **React** browser screenshots at phone and desktop, inspect motion/drawer/focus/overflow, resolve defects. Browser/device evidence is always distinguished from proposal or source-only review. Do not load the 220KB HTML in every coding prompt; use the concise guide by default.
