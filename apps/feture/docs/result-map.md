# Явный перенос результата в карту

W05.1: у завершённого опросника «Выбрать темы для карты» → «Посмотреть предложения». Ни одна тема не отмечена заранее. Чекбокс «Мне любопытна тема …» явно выбирает состояние curious. Перед применением показано: запись приватна, поиск выключен, сила/опыт/границы не вычисляются. Можно отменить выбор без изменения карты; иные отношения к теме выбираются в обычном редакторе.

Сервер `tests.mapPreview` возвращает только reviewed связанные темы для направлений mid/high. Low и insufficient не трактуются как отказ, разрешение или отсутствие границ. Отсутствие предложения не ограничивает ручное заполнение карты. Каждая reviewed rule закреплена за SHA-256 полного immutable definition, а не просто названием опросника. Изменение любого текста/веса/вопроса требует новой редакторской привязки. Старый результат сохраняет собственные правила.

`tests.mapApply` принимает только собственный completed attempt, operationId и 1–6 уникальных selected `{interestId, expectedRevision:0}`. Source/testVersion берутся из закреплённой версии на сервере. Нельзя передать owner, score, visibility, boundary, intensity или experience. Client и repository требуют настоящую Core session, adult и current consent. Private tables/function недоступны anon/authenticated; DTO whitelist не выдаёт лишних вложенных полей.

Порядок lock: tests owner → shared profile/map. Все выбранные темы проверяются до записи. Любая существующая запись, включая ручную границу, test source или удалённую tombstone, отклоняет весь batch. Это сознательно перенос только новых тем. Параллельная ручная правка не затирается. Локальные pending темы исключаются и на клиенте; новые серверные записи подтягиваются обычным owner-scoped sync без удаления outbox.

Operation receipt хранит hash/count/attempt ID, не ответы. Exact retry не добавляет записи/историю повторно и не меняет последующие ручные правки. Если результат уже удалён, retry возвращает resource_not_found и ничего не восстанавливает. Логическое удаление результата не удаляет отдельно выбранные записи карты. Profile cascade очищает receipts; полный Core erasure ещё O02. Сетевой сбой сохраняет выбранные темы и тот же operationId; неизвестный исход разрешается повтором либо явной проверкой карты заново.

## Проверка

Full check: unit 17, security 20, PostgreSQL 9, typecheck/build. Focused PostgreSQL contract: завершение без изменения карты, чужой attempt, точная привязка версии, whitelist input, batch conflict без частичной записи, manual hard boundary, private/off defaults, retry collision, последующая ручная правка/удаление, skip и изменённое definition, denied roles и profile cascade. Live service-role assertions в rollback проверяют preview, приватный перенос, retry и одну history запись. После rollback: 12 rules / 0 map receipts / 0 attempts / 0 states / 0 history.

Применённая миграция `feture_result_map` версии 20261011050615 была обнаружена во время работы; её исходный SQL восстановлен из metadata в CLI-created migration file. Собственная несовместимая попытка применения полностью откатилась. Итоговый код использует существующую схему и API; нет второго хранилища или compatibility shim.

Production account/adult/legal и private browser/native acceptance остаются открыты. Публичные гостевые входы дневника/опросников проверены в браузере; они не доказательство живого private переноса.
