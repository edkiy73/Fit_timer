# V4 — цельный визуальный контракт

13.10.2026: приложенный HTML Claude повторно изучен по запросу владельца; сохраняем IA MASTER-PRODUCT-SPEC-V4.

1. Общая панель: один заголовок, 52 px на телефоне / 60 px desktop; без повторного h1 в контенте. На discovery, questionnaire, conversation — собственные инструменты без общей панели.
2. Шаг сетки: 4/8/12/16/24/32. Читаемый текст 14–16 px; заголовки 22–32 px, не маркетинговые 40–60 px внутри рабочих экранов.
3. Phone: 16 px боковые поля, card radius 24, glass dock, sticky primary footer только где нужен. Tablet/fold: rail + содержательные две колонки; desktop: sidebar и max 1120 px, reading/forms 720 px.
4. Surface: тёплая тема + полупрозрачная навигация/плавающие инструменты. Glass — только над контентом, читаемый текст на плотном слое; border/shadow различают уровни.
5. Primary rose действие одно в группе; secondary surface, tertiary text. Группы действий имеют gap и wrap; никакого случайного inline склеивания. Glow умеренный, только actionable primary.
6. Иконки одного stroke/24px grid с корректной семантикой: feed, bookmark, calendar, filter sliders, settings gear, send, media, more.
7. Feed: краткий composer, compact section tools, 16px post body, отдельный footer реакции/обсуждение/save. Communities/events: короткий intro и содержательные карточки, без hero на полэкрана.
8. Profile: фото+имя+город, About, interest tags как данные, follow/like в одной группе; private sections отдельный заблокированный слой без настоящих скрытых данных.
9. Me: компактная identity, карта/изучить/дневник; различимые topic cards, быстрые действия как строки, не поле огромных кнопок.
10. Questionnaire: собственный progress/close, вопрос и выбор, сохранение выбора при Back, glass footer с Next; результат отдельно. Нет ложного server save.
11. Dating: edge card, прозрачные инструменты, решения не перекрывают текст; вертикальный scroll и горизонтальный swipe различаются, undo/like-back сохраняются в памяти.
12. Chat: 15px bubbles, compact header, floating glass composer/send glow; inbox остаётся distinct от likes.
13. Dialogs: фиксированная шапка, scroll body, адаптивный bottom sheet, blur scrim, явный close/escape/focus restore, действия с gap.
14. Motion: 120–240 ms opacity/transform; pressed state, hover, selected, reduced-motion; без постоянного мерцания.
15. Проверка: реальные React captures всех 127 экранов/24 окон, phone/desktop + representative 320/768/1024, RU/EN/light/dark/zoom, критические взаимодействия, независимый read-only review. Fixture identity не подтверждает live ACL/native.
