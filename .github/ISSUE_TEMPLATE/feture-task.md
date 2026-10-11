---
name: FetUre — рабочая задача
about: Маленькая независимая задача из существующего плана MVP
title: "[FetUre Task][P1] "
labels: ""
assignees: ""
---

**MVP ID:** A01 / P02 / W03 / C02 / R01 / D02 / O01 / etc.  
**Parent Epic:** #...  
**Priority:** P0 / P1 / P2  
**State:** planned / working / review / blocked (validated from latest main).

### Цель и реальный сценарий
Что должен суметь пользователь, а не просто какие кнопки нарисовать.

### Исходный контракт
Ссылка на одну карточку `apps/feture/docs/mvp-plan/cards/*.md`, 2–5 важных файлов и существующий PR, если он уже есть. Не копировать 97KB план.

### Зависимости
Что должно быть реализовано/подтверждено до этого среза; внешние API/юридические решения — честно как блокер.

### Готово, когда
- [ ] Реальная функциональность + обработка ошибок, empty/loading/offline и server permission
- [ ] Для существенного UI: визуальное сравнение с `docs/design-reference/README.md`; реальные screenshots phone/tablet/desktop и обе темы или явный pending
- [ ] Релевантные typecheck/build/tests, independent review если sensitive
- [ ] PR + короткий `docs/agent-team/HANDOFF.md`, ничего не замержено без согласования
- [ ] Live/native/provider испытания либо указаны фактами, либо остаются pending

**Ограничения:** один небольшой PR. Только действующие подписки Claude/ChatGPT; никаких платных model API, автодеплоев и фоновых task runners.
