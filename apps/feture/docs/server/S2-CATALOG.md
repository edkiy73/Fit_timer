# S2. Каталог команд и запросов по разделам

27.10.2026. Общие правила транспорта, ошибок, идемпотентности и действующего профиля — [S2-API](S2-API.md). Модель — [S1](S1-DOMAIN-MODEL.md). Подробные поля и ссылки на прототип — [extract/](extract/).

Обозначения:
- **W** — запись, принимает `opId`; **R** — чтение (курсор `{limit, cursor}` для списков).
- **Пара:** «согласие» — расширение, ждёт партнёра, если он включил согласие; «всегда» — нужны оба; «сразу» — применяется сразу, партнёр получает уведомление; «—» — без особенностей.
- **Уведомления:** кому уходит событие через outbox (`→ цель`, `→ партнёр`, «НР» — пункт «Нужно решить»).
- Срез — из порядка работ (руководство V21, §4): 0 — платформа, A — оболочка, B — лента, C — «Я» и доступы, D — сообщества и события, E — пары, F — знакомства, G — чаты и уведомления, H — Premium и проверка возраста.

## 0. Платформа (готово в этапе 0)

| Действие | Вид | Вход | Примечание |
|---|---|---|---|
| `session.bootstrap` | R | — | аккаунт и список профилей; без `X-Fe-Profile` |
| `profile.mine` | R | — | для «Действовать как» |
| `media.uploadIntent` / `media.commit` / `media.remove` | W | S3 §5 | |
| `decide.approvals` | R | — | ожидающие согласия пары (свои и партнёра) |
| `decide.approval` | W | `approvalId, choice approve|return` | только другой участник |
| `decide.cancel` | W | `approvalId` | только автор |

## C. Аккаунт, онбординг, профиль

| Действие | Вид | Вход | Пара | Уведомления / эффекты |
|---|---|---|---|---|
| `account.create` | W | ник, дата рождения, принятые документы, рассылка | — | создаёт аккаунт + профиль-человек с настройками по умолчанию; младше 18 → `under_18`, ничего не хранится, кроме счётчика |
| `onboarding.complete` | W | видимость данных, роли/формат, знакомства вкл/выкл, темы, сообщества | — | вступления/заявки в сообщества отправляются сразу |
| `nick.check` | R | ник | — | свободен / причина |
| `profile.get` | R | `profileId` | — | проекция по зрителю (S1 §4, extract/people §3.1); заблокирован/удалён → «недоступно» |
| `profile.preview` | R | `as: all|granted|card` | — | «Как видят»: та же проекция с **синтетическим** зрителем (не реальным человеком) |
| `profile.update` | W | поля профиля, `rev` | согласие | ник проверяется только при изменении; → партнёр |
| `profile.setPhotos` | W | упорядоченные `assetId`, `rev` | согласие | ≤6, ≤1 видео; убрать последнее фото при «Показываюсь» → нужен `confirmHide`, режим → «Незаметно» |
| `profile.setVisibility` | W | одна настройка из S1 §4 | сужение сразу, расширение — согласие | → партнёр |
| `profile.setDetailsVisibility` | W | `only|granted|all` | — (только человек) | |
| `place.submit` | W | страна, название | — | используется сразу, → очередь сотрудника |
| `interests.list` | R | `profileId` | — | свои — все; чужие — публичные (+ `granted`, если есть доступ «Описание и интересы») |
| `interests.set` / `interests.setMany` / `interests.remove` | W | тема, значение, направление, видимость | согласие | пишет историю |
| `settings.get` / `settings.update` | R/W | язык, размытие, рассылка | — (аккаунт) | |
| `notifications.settings.update` | W | режим, каналы, дайджест, тихие часы, категории | — (аккаунт) | |
| `push.register` / `push.unregister` | W | токен, платформа | — | |
| `account.export` / `account.delete` | W | — / ник для подтверждения | — | задача; удаление — S1 §16 |

## C. Приватная часть и доступы

| Действие | Вид | Вход | Пара | Уведомления / эффекты |
|---|---|---|---|---|
| `private.get` | R | `profileId` | — | своё — всё; чужое — только выданные области, медиа с водяным знаком; до доступа — ничего, кроме «есть приватная часть» |
| `private.setOn` | W | `on`, `confirm` | выкл — сразу (+ эпоха); вкл — согласие | выкл: отозвать все доступы, закрыть запросы, вернуть числа |
| `private.setText` | W | текст, `rev` | согласие | |
| `private.setMedia` | W | `assetId[]` | согласие | ≤12 фото, ≤6 видео |
| `access.request` | W | `profileId, scopes[]` | — | лимит 10/сутки на аккаунт; → цель (НР); пара-запросчик → партнёр |
| `access.cancel` | W | `requestId` | — | лимит не возвращается |
| `access.grant` | W | `requestId, scopes[], term` | **всегда** для приватной части пары | → запросивший; новый доступ заменяет прежний |
| `access.decline` | W | `requestId` | — | → запросивший без push; повтор через 30 дней |
| `access.narrow` / `access.revoke` / `access.revokeAll` | W | зритель, области | сразу (+ эпоха для revokeAll) | → партнёр |
| `access.lists` | R | `tab out|withme|byme`, фильтр | — | только метаданные, остаток лимита |
| `access.incoming` | R | — | — | |

## E. Пары

| Действие | Вид | Вход | Уведомления / эффекты |
|---|---|---|---|
| `couple.invite` | W | ник партнёра | → приглашённый (НР); отказы: формат, не найден, себе, уже в паре, есть исходящее, блок |
| `couple.inviteLink` | W | — | одноразовая ссылка с сроком |
| `couple.inviteWithdraw` | W | `inviteId` | |
| `couple.inviteAnswer` | W | `inviteId, accept|decline` | принять → профиль пары (пустой, знакомства вкл), → оба; отказ сохраняется, → пригласивший |
| `couple.setApproval` | W | `approvesPartner` | своя настройка; → партнёр |
| `couple.hideFromDiscover` / `couple.closePrivate` | W | — | сразу, эпоха +1, ожидающие согласия отменены, → партнёр |
| `couple.stop` | W | `confirm` | S1 §5; → партнёр |
| `couple.restore` | W | — | второе согласие в 30 дней → пара активна (знакомства выкл) |
| `couple.startNew` | W | `confirm` | при остановленной паре: старая удаляется без восстановления, → бывший партнёр |
| `couple.archive` | R | — | пока остановлена — совместное только для чтения; после удаления — текстовый архив |

## B. Лента и публикации

| Действие | Вид | Вход | Пара | Уведомления / эффекты |
|---|---|---|---|---|
| `feed.forYou` | R | фильтры тем и видов | — | + карточки событий (1 на 6 постов, ≤3 в день) |
| `feed.following` | R | фильтры, виды активности | — | посты подписок + свои + статьи по подпискам + активность (схлопывание за 6 ч) |
| `feed.popular` | R | тема? | — | 7 дней, только `all`, по интересам зрителя, без табу; формула S1/extract |
| `topic.posts` | R | `topicId` | — | |
| `post.get` / `post.replies` / `post.likers` | R | `postId`, сортировка | — | |
| `post.saveDraft` | W | черновик | — | черновик пары видит только автор-участник |
| `post.publish` | W | черновик или поля | согласие | без медиа — сразу, с медиа — проверка; отметки на фото → отмеченные (НР) после одобрения медиа; упоминания → упомянутые; статья → подписчики статей |
| `post.edit` | W | поля, `rev` | согласие | мелкая — сразу, крупная — ревизия на проверку |
| `post.saveEdits` / `post.discardEdits` | W | | — | |
| `post.delete` | W | `postId` | сразу (пара — в архив) | |
| `post.setAudience` (массово из галереи) | W | `postIds[], audience` | сужение сразу, расширение — согласие + проверка медиа | |
| `post.setAlbum` | W | `postId, albumId` | — | альбом для подписчиков сужает аудиторию |
| `reaction.set` | W | цель, `on` | — | → автор (группировка по посту); пара → партнёр |
| `poll.vote` / `poll.unvote` | W | `postId, option` | — | |
| `poll.voters` | R | `postId, option` | — | только если зритель голосовал |
| `reply.create` / `reply.edit` / `reply.delete` | W | | — | → автор поста и автор родителя; пара → партнёр |
| `mention.removeSelf` | W | источник | — | → автор |
| `tag.answer` / `tag.removeSelf` / `tag.object` | W | `postId` | — | → автор; «это я на фото» → пост скрыт, очередь сотрудника |
| `saved.set` / `saved.list` | W/R | вид, цель | — | |
| `feedHide.set` / `feedHide.list` | W/R | вид, цель | — | автор не узнаёт |
| `follow.set` | W | `profileId, on` | — | → цель; пара → партнёр |
| `noteSub.set` | W | `profileId, on` | — | без уведомления |
| `profile.posts` / `profile.gallery` / `profile.albums` / `profile.followers` / `profile.following` | R | `profileId` | — | |
| `me.posts` | R | — | — | черновики, правки, на проверке, опубликованные, согласия |
| `album.create` / `album.update` / `album.delete` / `album.setVisibility` | W | | расширение — согласие | |
| `search.posts` | R | `q ≥ 2` | — | |
| `mention.suggest` / `tag.candidates` | R | префикс ника ≥ 2 | — | только люди, без заблокированных, с лимитом |

## D. Сообщества

| Действие | Вид | Вход | Пара | Уведомления / эффекты |
|---|---|---|---|---|
| `community.catalog` / `community.mine` / `community.get` | R | фильтры | — | скрытые — только по токену-приглашению |
| `community.discussions` / `community.events` / `community.members` | R | | — | закрытые — только участникам |
| `community.create` | W | поля | согласие | → очередь сотрудника |
| `community.update` / `community.setPrivacy` | W | поля, `rev` | расширение — согласие | крупная правка → проверка (Q15) |
| `community.invite` / `community.inviteRevoke` | W | | — | токен |
| `community.join` | W | правила приняты, ответ? | согласие (пара вступает) | открытое — сразу; закрытое — заявка → ведущие (НР) |
| `community.requestWithdraw` | W | `requestId` | — | |
| `community.requestDecide` | W | `requestId, approve|decline, rev` | — | → заявитель |
| `community.leave` | W | | — | |
| `community.setHost` / `community.restrict` / `community.removeMember` | W | `profileId` | — | → участник; удаление — бан (Q14) |
| `community.mute` | W | `on` | — | |
| `community.requests` | R | `tab pending|history` | — | только ведущие |
| `discussion.create` | W | как пост + `communityId` | согласие | |
| `discussion.pin` / `discussion.excludeFromPopular` / `discussion.removeByHost` | W | | — | → автор при удалении |

## D. События

| Действие | Вид | Вход | Пара | Уведомления / эффекты |
|---|---|---|---|---|
| `event.catalog` / `event.get` / `event.mine` / `event.attendees` | R | фильтры | — | адрес и ссылка — только допущенным |
| `event.draftSave` / `event.draftDelete` | W | частичная форма, шаг | — | черновик принадлежит профилю |
| `event.submit` | W | форма | согласие → затем проверка | → очередь сотрудника; пара → партнёр (НР) |
| `event.update` | W | форма, `rev` | согласие | время/место → объявление участникам; крупная — проверка |
| `event.withdrawPending` | W | `eventId` | — | событие пары ещё на согласии → снова черновик |
| `event.cancel` | W | причина | сразу | заявки закрыты, → идущие, интересующиеся, заявители |
| `event.announce` | W | текст 5–500 | — | → идущие и заявители |
| `event.rsvp` | W | `interested|going|not_going|none` | `going/interested` — согласие | |
| `event.rsvpVisibility` / `event.ticketMark` | W | | — | |
| `event.apply` / `event.applyWithdraw` | W | ответы, заметка, требования | согласие (пара раскрывает обоих) | → организатор (НР) |
| `event.applicationDecide` | W | `approve|decline, rev` | — | → заявитель; отзыв одобрения убирает адрес |
| `event.applications` / `event.organizer` | R | | — | только организатор |

## F. Знакомства и люди

| Действие | Вид | Вход | Пара | Уведомления / эффекты |
|---|---|---|---|---|
| `discover.deck` | R | — | — | порции; S1 §11 |
| `discover.count` | R | черновик фильтра | — | «Показать · N» |
| `discover.setFilter` | W | фильтр | — | |
| `discover.setMode` | W | `visible|hidden|off` | `off`/скрыться — сразу (+эпоха); `visible` — согласие + оба 18+ | без фото — принимается, но не показывается |
| `discover.decide` | W | `profileId, like|pass` | — | like → `like` / совпадение |
| `discover.undo` / `discover.restore` / `discover.history` | W/R | | — | лимит Q6 |
| `like.send` | W | `profileId, source` | — | → цель (оба участника пары); встречная → совпадение → обе стороны |
| `like.withdraw` / `like.dismiss` | W | | — | уведомление цели отзывается / отправитель не узнаёт |
| `likes.incoming` / `likes.outgoing` / `matches.list` | R | | — | |
| `match.end` | W | `profileId, revokeMyGrant?` | — | другая сторона не уведомляется |
| `profile.compat` | R | `profileId` | — | только публичные интересы (S1 §11) |
| `people.search` / `people.byNick` | R | `q` / точный ник | — | Q8 |
| `link.propose` / `link.answer` / `link.proposeChange` / `link.answerChange` / `link.setVisibility` / `link.remove` | W | | создание от пары — согласие (Q16) | → вторая сторона (НР) |
| `links.ofProfile` / `links.mine` | R | | — | |
| `block.set` | W | `profileId, on, alsoFor?` | сразу | партнёр уведомляется, если были связи; заблокированный — никогда |
| `blocks.list` | R | | — | блоки действующего профиля |

## G. Чаты, уведомления, «Нужно решить»

| Действие | Вид | Вход | Пара | Уведомления / эффекты |
|---|---|---|---|---|
| `chats.list` / `chats.archive` | R | фильтр `all|me|couple` | — | непрочитанные — по аккаунту |
| `chat.messages` | R | `conversationId, before/after seq` | — | |
| `chat.send` | W | `conversationId, text, replyTo?` | — | `seq` следующий; → другая сторона (push), сигнал Realtime |
| `chat.sendMedia` | W | `+ assetId, mode` | — | эфемерные — обе стороны 18+ |
| `chat.openMedia` | W | `messageId` | — | первый просмотр запускает таймер |
| `chat.read` | W | `conversationId, upToSeq` | — | только вперёд |
| `chat.typing` | W | `conversationId` | — | только сигнал, лимит |
| `chat.mute` / `chat.archive` | W | `on` | — | по аккаунту (Q19) |
| `notifications.list` / `notifications.read` / `notifications.readAll` | R/W | | — | метка «Тебе / Паре» |
| `decide.list` | R | фильтр | — | все пункты «Нужно решить» (S1 §13) |
| `inbox.counts` | R | — | — | одно число «Нужно решить» везде |
| `report.create` | W | цель, причина, текст, `alsoBlock`, сообщения? | — | → очередь; жалобщику — итог |

## H. Premium, подарки, проверка возраста

| Действие | Вид | Вход | Примечание |
|---|---|---|---|
| `premium.status` | R | — | |
| `premium.verifyPurchase` / `premium.restore` | W | чек магазина / процессора | права выдаёт сервер после проверки |
| `gift.create` | W | точный ник, план, анонимно | паре — обоим; если Premium уже есть — в очередь |
| `verification.ageStart` / `verification.ageStatus` | W/R | способ | провайдер возвращает ссылку; результат — вебхуком |
| `verification.photoStart` / `verification.photoSubmit` / `verification.photoStatus` | W/W/R | — / `checkId`, `assetId` (purpose `verification`) / — | **готово (срез H2)**: жест выбирает сервер (30 минут), только с одобренным главным фото; селфи не публикуется, удаляется через 30 дней после решения; статус `none/pending/approved/rejected` + причина; в профиле и карточках — только `photoVerified: boolean` |

## Сотрудники (S4)

`staff.queue`, `staff.decide` (медиа, публикации, ревизии, сообщества, события, споры, жалобы), `staff.restrict`, `staff.appeal.decide`, `staff.place.decide`, `staff.photoCheck.decide` (сделано как `staff.photoCheckQueue` / `staff.photoCheckDecide`, срез H2). Отдельный вход с ролями и 2FA, все решения — в журнал только на добавление.
