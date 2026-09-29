---
name: premium-mobile-ui
description: Премиальный мобильный UI для React-приложений AppBase (UnMute, Task Mini, новые приложения из шаблона) — bento-сетки, стекло и мягкий объём, живые нажатия, пружинная анимация, shimmer-загрузка в стиле Material 3 с кастомным характером. Использовать для любой доработки интерфейса, редизайна экрана, новых компонентов, анимаций и «сделать красиво / дорого / живо» в apps/unmute, apps/task-mini, packages/ui-react, templates/react-app. Не для FitTimer (у него свой стек и агент design-lead).
---

# Premium Mobile UI для AppBase React

Роль: эксперт по мобильному UI/UX и фронтенд-архитектор. Цель — интерфейсы, которые выглядят
дорого и ощущаются живыми на Android (и iOS), без «списка одинаковых плоских карточек».
Но красота никогда не покупается ценой понятности, скорости или доступности.

## Реальный стек (важно — это не React Native)

- React + TypeScript + Vite, React Router, TanStack Query, **React Aria Components**; работает
  в браузере и внутри **Capacitor WebView** (Android WebView / iOS WKWebView).
- Поэтому **React Native Reanimated / StyleSheet / Pressable здесь не существуют**. Их роль играют:
  CSS-переменные и `transform/opacity`-анимации, `linear()`-пружины, View Transitions API,
  Web Animations API, `usePress`/`data-pressed` из React Aria.
- Новая библиотека анимаций (например `motion`) — только если CSS/WAAPI реально не справляются,
  с обоснованием в PR; сначала CSS. Стек зафиксирован ADR `docs/appbase-stack-ci-strategy.md`.
- Где что лежит: общие компоненты — `packages/ui-react/src`, продуктовые экраны — `apps/<app>/src`,
  стили — `apps/<app>/src/styles.css`, бренд-токены — `apps/<app>/config/product.json → brand.ui`
  (применяет `src/theme.ts`). Правка `packages/ui-react` обязана держать зелёными все приложения.

## Принципы

### 1. Bento-композиция вместо ленты карточек
- Экран собирается из модулей разного веса: главное действие — 2×2 или 2×1, вторичное — 1×1.
  Размер тайла = важность содержимого, а не декор.
- Мобильная сетка: 2 колонки на 360–430 px, 4 на ≥ 600 px. `grid-template-columns: repeat(2, 1fr)`,
  `grid-auto-flow: dense`, `gap: 12px`, тайлы через `grid-column: span 2` / `grid-row: span 2`.
- Каждый тайл несёт своё содержание (цифра, действие, состояние). Пустые «декоративные» обёртки
  запрещены правилами репозитория — если тайлу нечего сказать, его нет.
- Длинные однотипные списки (40 дней курса) не превращаются в 40 тайлов: группировка, свёртка,
  «текущий + следующий + остальное свёрнуто», горизонтальные ленты.

### 2. Глубина и материалы — дозированно
- **Стекло** (`backdrop-filter: blur(16–24px) saturate(1.4)` + полупрозрачный фон + тонкая
  светлая граница) — только для 1–2 плавающих слоёв на экране: нижнее меню, шапка при скролле,
  bottom sheet, диалоги. Под стеклом должен быть цветной/градиентный фон, иначе эффекта нет.
  Обязателен fallback: `@supports not (backdrop-filter: blur(1px))` → непрозрачная поверхность.
  На слабых Android `backdrop-filter` дорог — никогда на элементах списка и не на весь экран.
- **Мягкий объём (neumorphism)** — двойная тень (светлая сверху-слева, тёмная снизу-справа)
  только для крупных тактильных целей и «физических» контролов (большая кнопка микрофона,
  переключатели, счётчики). Нельзя передавать состояние или смысл только тенью: у неоморфизма
  плохой контраст. Текст и границы интерактивных элементов — контраст ≥ 4.5:1 / ≥ 3:1 (WCAG).
- Глубина через систему высот (elevation 0–3) токенами, а не случайными тенями.
- Большие радиусы: тайлы и листы 24–32 px, кнопки 16–20 px (или pill), чипы — pill.
  Вложенные радиусы: внутренний = внешний − отступ.

### 3. Живое движение, 60 FPS
- Анимировать только `transform` и `opacity` (и `filter` умеренно). Никогда `width/height/top/left/box-shadow` в цикле.
- Нажатие: `scale(0.96)` за 120 мс на press, отпускание — пружина ~350 мс. Для кнопок и тайлов
  через `data-pressed` React Aria (работает и для touch, и для клавиатуры).
- Пружины — CSS `linear()` easing (поддерживается в современных WebView), без JS на каждый кадр.
- Переходы между экранами и «shared element» — **View Transitions API**
  (`document.startViewTransition` + `view-transition-name` на общем элементе); где API нет —
  просто мгновенная смена, без поломки.
- Появление списков — лёгкий stagger (translateY 8px + opacity, шаг 30–40 мс, максимум ~8 элементов).
- Загрузка — **shimmer-скелетоны** той же формы, что будущий контент, вместо спиннеров.
  Скелетон не дольше реальной загрузки; при данных из кэша — не показывать вовсе.
- `@media (prefers-reduced-motion: reduce)` — отключает пружины, stagger, shimmer-движение и
  view transitions (остаётся мгновенная смена и статичный скелетон). Это обязательное правило.

### 4. Android-native ощущение (Material 3 + свой характер)
- Цели касания ≥ 48×48 px; основная навигация — нижняя панель (3–5 пунктов) в зоне большого пальца;
  главное действие экрана — внизу, доступно одной рукой.
- Учитывать безопасные зоны: `env(safe-area-inset-*)` (вырезы, жестовая навигация).
- Системная кнопка «Назад» и история должны вести себя предсказуемо (модалки закрываются первыми).
- Без дефолтных системных рамок и синих ссылок: свои состояния hover/pressed/focus/disabled.
- Типографическая шкала M3 (display / headline / title / body / label) через токены;
  заголовки крупные и плотные, цифры прогресса — табличные (`font-variant-numeric: tabular-nums`).

## Жёсткие правила репозитория (важнее любого эффекта)

- Все цвета, радиусы, тени, длительности — **CSS-переменные** на `:root`; светлая и тёмная тема
  обе полноценные. Ни одного захардкоженного hex в компонентах. Бренд — из `config/product.json`.
- Весь текст — через `t(key)` и во всех словарях (`src/i18n/*.ts`); тест `missingKeys` должен быть пустым.
  Тексты простые и про пользу для ученика, без «синхронизации», «сервера», «веба», «рантайма».
- Иконки — только существующая система иконок проекта (или inline SVG в её стиле). Без эмодзи.
- Доступность: семантика и роли (React Aria), видимый `:focus-visible`, подписи у полей,
  не только цвет для передачи состояния. Имена кнопок/ссылок — стабильные: e2e и unit-тесты
  ищут элементы по роли и тексту; меняешь текст — обнови тесты в том же PR.
- Производительность: бандл ученика не растёт ради декора (картинки — SVG/CSS, шрифты — с
  системным fallback-стеком), админка остаётся ленивым чанком.

## Готовые кирпичи

```css
:root{
  --radius-tile:28px; --radius-btn:18px;
  --dur-press:120ms; --dur-spring:360ms;
  --spring:linear(0,0.5 7%,0.93 15%,1.06 23%,1.04 30%,0.99 40%,1.005 55%,1);
  --elev-1:0 1px 2px rgb(0 0 0/.06),0 4px 12px rgb(0 0 0/.06);
  --glass-bg:color-mix(in srgb,var(--card) 72%,transparent);
  --glass-line:color-mix(in srgb,white 18%,transparent);
}
.pressable{transition:transform var(--dur-spring) var(--spring);will-change:transform}
.pressable[data-pressed]{transform:scale(.96);transition-duration:var(--dur-press);transition-timing-function:ease-out}
.glass{background:var(--glass-bg);backdrop-filter:blur(20px) saturate(1.4);-webkit-backdrop-filter:blur(20px) saturate(1.4);border:1px solid var(--glass-line)}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.glass{background:var(--card)}}
.bento{display:grid;grid-template-columns:repeat(2,1fr);grid-auto-flow:dense;gap:12px}
.bento .wide{grid-column:span 2}.bento .tall{grid-row:span 2}
.skeleton{border-radius:inherit;background:linear-gradient(90deg,var(--surface) 25%,color-mix(in srgb,var(--surface) 60%,white) 37%,var(--surface) 63%) 0 0/400% 100%;animation:shimmer 1.4s ease infinite}
@keyframes shimmer{to{background-position:-135% 0}}
@media (prefers-reduced-motion:reduce){
  .pressable,.pressable[data-pressed]{transition:none;transform:none}
  .skeleton{animation:none}
  ::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation:none!important}
}
```

```tsx
// Навигация с view transition там, где браузер умеет; иначе обычная смена.
export function withViewTransition(update: () => void){
  const start=(document as Document & {startViewTransition?:(cb:()=>void)=>unknown}).startViewTransition;
  if(!start||matchMedia('(prefers-reduced-motion: reduce)').matches){ update(); return; }
  start.call(document,update);
}
// Кнопки — React Aria <Button className="pressable">: data-pressed ставится сам.
```

## Порядок работы

1. Прочитать `CLAUDE.md`, план приложения (`docs/unmute-english-plan.md` для UnMute) и
   текущий экран в коде. Снять скриншоты «до» (390×844, светлая и тёмная тема).
2. Решить иерархию экрана: одно главное действие, 2–3 вторичных показателя, остальное свернуть.
   Только потом раскладка bento и материалы.
3. Сначала токены и общие компоненты (`ui-react` или продуктовые), затем экраны.
4. Проверки: `npm run check` в приложении (typecheck, unit, сборка), `node tests/e2e.mjs`;
   при правке `packages/ui-react` — ещё Task Mini, `npm run starter:check`, Core.
5. Скриншоты «после» (390×844 и 412×915, обе темы, плюс `prefers-reduced-motion`) через
   Playwright с `executablePath: '/opt/pw-browsers/chromium'`; проверить CPU-throttle 4× — нажатия
   и переходы не должны дёргаться. Приложить скриншоты «до/после» в PR.
6. В PR — что изменилось для пользователя, какие экраны, и что именно проверено.

## Чего не делать

- Стекло и неоморфизм «везде» — дорого по производительности и нечитаемо.
- Анимация ради анимации: каждое движение объясняет причину и следствие (что нажато, куда ушло).
- Одинаковые тайлы в сетке — это та же лента карточек, только квадратная.
- Прятать главное действие в тайл того же веса, что и второстепенное.
- Менять поведение/данные продукта под видом редизайна — отдельным PR.
