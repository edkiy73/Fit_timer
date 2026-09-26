# Fit Timer

Веб-приложение и нативные оболочки Android/iOS на Capacitor 8.

- Мобильная архитектура и релиз: [`docs/mobile-release.md`](docs/mobile-release.md)
- Настройка Vercel/backend: [`docs/setup-vercel.md`](docs/setup-vercel.md)
- Контекст для ИИ: [`CLAUDE.md`](CLAUDE.md)

Исходники интерфейса разбиты на компактные части в `src/app`, `src/styles` и `src/html`. Корневые `app.js`, `style.css` и `index.html` генерируются для совместимости.

```bash
npm ci
npm run build:sources
npm run mobile:sync
npm run check:mobile
```
