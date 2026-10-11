> Историческая версия детальных требований от 11.10.2026. Для фактического состояния и очереди задач сначала смотреть [STATUS.md](../STATUS.md). Здесь не вести журнал исполнения. Полный исходник сохранён в архиве.

### C — сообщество

- [ ] **C01. Публикации end-to-end.** После P02/P03/A04/A05. Text/story/question/photo/selected test result, drafts, audience, moderation, edit/delete, cursor feed. Готово: запись действительно хранится, видна второму допустимому аккаунту и не видна третьему; copy test result только через whitelist; повтор submit не удваивает пост.
  - **C01.1 реализован GPT-6 High, отдельная проверка:** draft/save/submit/edit/delete/cursor feed, SQL `20261011133134`; moderation-first, pending только автору. Не закрывает C01: reports, selected audience, photo и test result остаются; Sol 6.1 ACL/privacy, real accounts/native нужны.
  - **C01.2a реализован GPT-6 High, отдельная проверка:** личная manager queue/approve/reject/hide/reopen, актуальный adult/consent, запрет own approval, generation/role checks, metadata-only auditor, SQL `20261011134257`; post reports и независимая проверка остаются.
- [ ] **C02. Ответы, реакции, подписки, сохранённое.** После C01. Комментарии с одним уровнем ответов, edit/delete, уникальные reactions, follow/mute/bookmark. Готово: counts серверные, повтор toggle не дублирует, скрытый/удалённый родитель не раскрывается в комментариях/закладках; чужой профиль открывается из автора.
  - **GPT-6 High, отдельная проверка:** Ожидает: GPT-6 High; только после C01, независимая проверка ACL.
- [ ] **C03. Группы и поиск.** После C02. Каталог/правила/join/leave, public-member group и closed-by-approval, roles owner/mod/member; search topics/groups/permitted profiles/posts, пагинация. Готово: выход/ban из закрытой группы блокирует контент прямым URL; membership не выдаёт private profile grants. Не строить событийный marketplace.
- [ ] **C04. Наполнение и уведомления.** После C03. 30–60 взрослых профилей, 80–150 разноплановых постов, 8–12 групп как ориентир; partial/full профили, разные аудитории, длинные тексты, lifecycle cases. In-app inbox/read cursors, настройки; no external email/push к seed. Готово: нет UI демо-плашек и hardcoded counters/online, данные из API; карточки распределены естественно, происхождение в admin. Seed-наборы пополняются при готовности доменов, не одной гигантской миграцией.
  - **GPT-6 High, отдельная проверка:** Ожидает: GPT-6 High; после C03 и редакционной проверки.

