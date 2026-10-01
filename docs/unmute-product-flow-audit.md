# UnMute — Product Flow Audit

Дата: 2026-10-01  
Репозиторий: `edkiy73/Fit_timer`  
Область: `apps/unmute`

## 1. Цель аудита

Этот документ — рабочий аудит сквозных пользовательских сценариев UnMute.

Проверяем не только экраны и тексты, а полную цепочку:

```
UI → навигация → состояние урока → сохранение прогресса → SRS →
аналитика → повторный вход → синхронизация → повторное прохождение
```

Главная задача — убрать ситуации, когда интерфейс выглядит правдоподобно, но фактическое состояние пользователя другое.

---

## Текущий статус после live QA — 2026-10-01

| Область | Статус | Комментарий |
|---|---:|---|
| Resume незавершённого урока | 🟡 частично закрыто | Есть persisted LessonRunSnapshot и remap по activity id; нужен полный process-kill / sync / Plus-return regression |
| Plus → возврат в текущий урок | ✅ исправлено по коду | Explicit return URL + `resume=1`; integration test ещё нужен |
| Choice accidental tap | ✅ исправлено по коду | Первый tap выбирает, второй подтверждает; Learn/Review/listening |
| Shuffle ответов / chips | 🟡 частично закрыто | Lesson seed persisted; Review seed пока только session-local |
| Wrong-answer feedback layout/copy | ✅ исправлено по коду | `Ответ неверный`, retry notice меньше и ближе, Why/Next state layout разделён |
| Speed drill timing / threshold copy | ✅ исправлено | Dynamic speaking window; real `needed/count`; code-course release прошёл |
| Route entry / current-day jump | ✅ исправлено по коду | Вход сверху; отдельная тихая кнопка «Текущий день» |
| Profile/Route fullscreen loading | ✅ исправлено по коду | Skeleton states вместо full-screen loader |
| Profile statistics course | ✅ исправлено по коду | Default active course; manual override только на app session |
| Dock blur | ✅ подтверждено live QA | Старый override `backdrop-filter:none` удалён |
| Sheets над dock | ✅ исправлено по коду | Overlay z-index выше dock |
| Formal first/resume/replay model | ❌ открыто | Snapshot есть, но write semantics ещё не привязаны к явному run mode |
| Replay vs SRS | ❌ открыто | Нужен явный контракт + test |
| Partial write / double grading | ❌ открыто P0/P1 | Самый рискованный data-integrity кейс |
| «Выйти без сохранения» semantics | ❌ открыто P1 | Сейчас очищает run snapshot, но не откатывает уже persisted answers/SRS |
| Review partial-source completeness | ❌ открыто | Нельзя молча считать очередь полной при failed source |
| Removed/unpublished learned courses | ❌ открыто | Review/Reset discovery требует отдельного решения |
| Analytics exactly-once / run mode | ❌ открыто | Durable completion и replay/resume events не закрыты |
| CI gate | 🔴 не green | Typecheck-регрессии исправлены; текущий общий check дошёл до unit suite: 11 failed / 257 passed. Нужна синхронизация тестов и проверка возможных настоящих регрессий |

> Если исторический раздел ниже противоречит этой таблице или разделу 35, актуальным считается этот статус и раздел 35.

---

## 2. Уже подтверждённые проблемы

### P0/P1. Итог урока всегда говорит «С первого раза»

В `src/learn.tsx` результат текущего запуска хранится только локально:

```
score = { correct, total }
```

При каждом новом открытии урока он начинается заново.

Текст при этом всегда:

```
С первого раза верно: X из Y
```

Из-за этого второй и последующие проходы семантически неправильные.

Проблемные сценарии:

- первый проход;
- повтор уже завершённого урока;
- выход после части заданий;
- возврат и продолжение;
- повтор только оставшихся заданий;
- повтор после уже исправленных ошибок.

Нужно различать как минимум:

```
firstRun
resume
replay
review
```

---

### P0/P1. Повтор старого урока может менять SRS

Обычный ответ идёт через:

```
saveGradedActivity()
→ gradeCourseCard()
```

Практика идёт через:

```
savePracticeActivity()
→ gradeCoursePractice()
```

То есть повтор уже завершённого урока может восприниматься как новая SRS-оценка.

Нужно явно решить правило:

> replay старого урока ≠ interval review

и разделить поведение по режимам.

---

### P1. Экран «Прогресс» смешивает разные статистические единицы

Обычное задание:

- ошибка = одна попытка;
- исправление в конце = ещё одна попытка.

Practice-блок:

- весь drill/listening/speaking сохраняется как одна статистическая запись.

В итоге общий показатель «% верно» складывает сущности разного масштаба.

Нужно разделить:

- учебные задания;
- drill;
- listening;
- speaking;
- dialogue;
- review.

---

### P1. Нет полноценной сущности «попытка урока»

Сейчас есть:

- накопленный persisted progress;
- локальный React-state текущего экрана.

Нет модели, которая отвечает:

- это первый запуск?
- это продолжение?
- это replay?
- сколько заданий было отвечено именно в этом запуске?
- сколько было правильных с первой попытки?
- был ли урок уже завершён раньше?
- нужно ли сейчас менять SRS?
- нужно ли отправлять analytics event?

Нужен отдельный `LessonRun` / `LessonSession`.

---

### P1. Аналитика не различает first completion и replay

Сейчас есть события уровня:

```
lesson_completed
day_completed
talk_started
paywall_shown.*
purchase_started.*
purchase_completed.*
```

Но почти нет контекста:

- first run / resume / replay;
- course;
- day;
- completion reason;
- current run result;
- exit before completion.

Нужен отдельный контракт событий.

---

### P1. «Серия» означает любую учебную активность, а не завершённый день курса

`learningDays` обновляется при:

- graded activity;
- seen activity;
- practice;
- dialogue;
- manual completion.

Текущий streak считается именно по `learningDays`.

Это может быть правильным продуктовым решением, но его нужно зафиксировать:

> серия = был любой учебный прогресс в этот календарный день

и не смешивать это с:

> завершён день курса.

---

### P1. Онбординг может локально завершиться после ошибки сохранения

В `onboarding.tsx` есть сценарий, где ошибка сохранения проглатывается, после чего локально выставляется завершение онбординга.

Это может породить невозможное состояние:

- UI считает онбординг завершённым;
- настройки/курс не сохранились полностью.

Нужно разделить:

- optimistic UI;
- confirmed persisted state;
- recoverable error.

---

## 3. Новая модель состояний

Для учебного узла предлагается формально определить режим запуска.

### firstRun

Пользователь впервые проходит ещё не завершённый узел.

Разрешено:

- создавать normal progress;
- менять SRS;
- записывать first-attempt stats;
- завершать node/day;
- отправлять first-completion analytics.

### resume

Пользователь продолжает незавершённый узел.

Разрешено:

- продолжать progress;
- сохранять ответы;
- завершить node/day;
- не считать уже сделанные задания новой попыткой.

### replay

Пользователь повторно открывает уже завершённый узел.

По умолчанию:

- не меняет completion;
- не создаёт повторный day_completed;
- не притворяется первым прохождением;
- SRS-поведение должно быть отдельным решением.

### review

Интервальное повторение из очереди Review.

Разрешено:

- менять SRS;
- менять due/box;
- писать review stats;
- не менять course completion.

---

## 4. Матрица пользовательских сценариев

Для каждого сценария проверяем:

```
UI text
navigation
persisted state
SRS
analytics
reload/sync
```

### 4.1 Новый пользователь

- установка;
- первый запуск;
- выбор курса;
- онбординг;
- переход в День 1;
- закрытие приложения до начала урока;
- повторный запуск.

### 4.2 Первый урок без ошибок

- открыть;
- пройти теорию;
- ответить все задания;
- завершить;
- проверить summary;
- проверить current day;
- проверить SRS;
- проверить stats;
- проверить analytics.

### 4.3 Первый урок с ошибками

- ошибка;
- исправление;
- возврат задания в конец;
- успешное исправление;
- итог;
- first-attempt score;
- accumulated stats;
- SRS.

### 4.4 Частично пройденный урок

- пройти 1/3;
- выйти;
- открыть снова;
- корректно продолжить;
- не потерять первые ответы;
- summary описывает весь нужный контекст, а не только текущий кусок.

### 4.5 Закрытие приложения посреди урока

- Android process kill;
- обычное закрытие;
- возврат;
- восстановление состояния.

### 4.6 Второй проход завершённого урока

Проверить:

- правильный CTA;
- правильный текст summary;
- отсутствие повторного completion;
- отсутствие ложного `day_completed`;
- корректное SRS-поведение;
- отдельная analytics-семантика.

### 4.7 Третий и последующие проходы

Проверить, что ничего не накапливается бесконтрольно:

- due;
- boxes;
- attempts;
- metrics;
- completion;
- events.

### 4.8 Drill повторно

- первый drill;
- failed;
- retry;
- passed;
- replay из урока;
- review из очереди;
- влияние на due/box.

### 4.9 Listening повторно

Те же проверки.

### 4.10 Speaking повторно

Те же проверки плюс:

- microphone fallback;
- manual accept;
- recognition failure.

### 4.11 Dialogue повторно

Проверить:

- current score;
- historical score;
- latest vs best;
- completed state;
- repeated run.

### 4.12 AI conversation

- first trial;
- repeat;
- Plus;
- limit;
- interrupted session;
- finish without review;
- retry review;
- analytics.

### 4.13 Review

- открыть;
- ошибиться;
- item уходит в конец;
- выйти;
- вернуться;
- пройти второй раз в тот же день;
- waiting items;
- due update.

### 4.14 Смена курса

- сменить курс;
- сохранить старый прогресс;
- новый current day;
- вернуться назад;
- общие learning days;
- review items из другого курса.

### 4.15 Смена курса посреди незавершённого урока

Проверить:

- сохранение;
- навигацию;
- current node;
- восстановление после возврата.

### 4.16 Guest → Login

- локальный прогресс;
- вход;
- merge;
- отсутствие отката;
- отсутствие duplicate completion;
- сохранение текущего курса.

### 4.17 Login → Logout

- локальный прогресс после выхода;
- состояние активного курса;
- что остаётся на устройстве.

### 4.18 Два устройства

- пройти часть на A;
- пройти часть на B;
- войти;
- merge;
- convergence;
- конфликт SRS;
- конфликт current day.

### 4.19 Offline → Online

- пройти урок offline;
- reconnect;
- sync;
- отсутствие rollback;
- отсутствие duplicate events.

### 4.20 Reset progress

- current course;
- stats;
- SRS;
- learning days;
- words;
- metrics;
- server tombstones;
- second device after reset.

### 4.21 Delete account

- server data;
- local progress;
- onboarding;
- sign-in again.

### 4.22 Paywall

- открыть из Today;
- открыть из Course Map;
- открыть из AI;
- Back;
- restore;
- account required;
- purchase success;
- refresh entitlement.

### 4.23 Истёк Plus

- AI blocked;
- already learned course content remains;
- review remains accessible;
- paid course entitlement unaffected.

### 4.24 Android Back

Порядок:

```
sheet
→ nested screen
→ lesson
→ tab Today
→ minimize app
```

Проверить на всех modal/sheet состояниях.

### 4.25 RU/EN switch

- текущий экран;
- lesson;
- result sheet;
- review;
- paywall;
- dynamic strings;
- persisted locale.

### 4.26 Полночь

- active lesson до 00:00;
- save после 00:00;
- streak;
- learningDay;
- due queue;
- current day.

### 4.27 Content update

- пользователь на старой revision;
- опубликована новая;
- activity ids сохранены;
- deleted activities;
- reordered activities;
- новый completion contract.

---

## 5. Контракт LessonRun

Предлагаемая структура:

```ts
type LessonRunMode =
  | 'first'
  | 'resume'
  | 'replay';

interface LessonRun {
  runId: string;
  nodeId: string;
  mode: LessonRunMode;

  startedAt: string;
  completedAt?: string;

  firstPass: {
    attempted: number;
    correct: number;
    wrong: number;
  };

  retries: {
    attempted: number;
    corrected: number;
  };
}
```

Не обязательно сразу сохранять всю сущность на сервер.

Но интерфейс и бизнес-логика должны опираться на явный режим, а не угадывать его по локальному `score`.

---

## 6. Правила summary

### firstRun

Пример:

> С первой попытки: 2 из 3

### resume

Если first-pass статистика достоверно восстановлена:

> С первой попытки: 2 из 3

Если нет:

> День завершён

Без ложной точности.

### replay

Пример:

> Результат этого прохождения: 3 из 3

или просто:

> Повтор завершён

Нельзя показывать:

> С первого раза

---

## 7. SRS contract

Нужно создать отдельную таблицу поведения.

| Action | first | resume | replay | review |
|---|---:|---:|---:|---:|
| mark seen | yes | yes | optional | no |
| answer stats | yes | yes | separate | yes |
| card SRS | yes | yes | decide explicitly | yes |
| practice SRS | yes | yes | decide explicitly | yes |
| learning day | yes | yes | yes | yes |
| node completion | yes | yes | no | no |
| day_completed | once | once | no | no |

Главное правило:

> replay не должен случайно работать как review.

---

## 8. Новая статистика

### Учебные задания

Показывать:

- всего заданий;
- first-attempt correct;
- first-attempt wrong;
- first-attempt accuracy.

### Practice

Отдельно:

- drill sessions;
- listening sessions;
- speaking sessions;
- last score;
- best score.

### Dialogue

- last result;
- best result;
- sessions.

### Review

- reviewed items;
- remembered;
- forgotten;
- due now.

Не складывать всё это в один общий `answers.accuracy`.

---

## 9. Analytics contract

Разделить business events и behavioral events.

### Business

```
lesson_first_completed
day_first_completed
purchase_started
purchase_completed
```

### Behavioral

```
lesson_started
lesson_resumed
lesson_replayed
lesson_exited
lesson_run_completed

review_started
review_completed

course_switched
```

Параметры:

```
courseId
nodeId
dayIndex
mode
runId
completed
firstPassCorrect
firstPassTotal
```

Не обязательно отправлять всё сразу, но контракт должен быть зафиксирован.

---

## 10. Text/state audit

После фикса state model пройти весь RU/EN интерфейс.

Особенно тексты:

- Начать;
- Продолжить;
- Пройти ещё раз;
- С первого раза;
- День пройден;
- День ещё не засчитан;
- Повтор завершён;
- Осталось;
- Вернуться;
- Начать заново.

Правило:

> текст должен описывать реальное состояние, а не просто текущий экран.

---

## 11. Edge/chaos тесты

Специально ломать сценарии:

- двойной tap;
- network loss после ответа;
- network loss во время save;
- app kill во время save;
- sign-in в середине урока;
- switch course во время урока;
- progress sync во время открытого runner;
- content revision change;
- locale change;
- deep link в completed day;
- back во время sheet;
- reopen after process death.

---

## 12. План исправления

### 2A. State model

- определить `first/resume/replay/review`;
- определить правила transition;
- добавить unit tests.

### 2B. Lesson runner

- убрать смысловую зависимость от локального `score`;
- ввести LessonRun;
- исправить summary;
- корректно восстанавливать resume.

### 2C. SRS integrity

Проверить все writes:

```
saveSeen
saveGraded
savePractice
saveDialogue
saveManual
```

и привязать поведение к run mode.

### 2D. Stats semantics

- разделить assignment/practice/review/dialogue;
- убрать математически некорректную общую accuracy;
- добавить first-attempt статистику.

### 2E. Analytics

- зафиксировать event contract;
- first completion != replay;
- тесты на duplicate events;
- тесты на resume.

### 2F. Text/state audit

- пройти `ru.ts`;
- пройти `en.ts`;
- проверить CTA и result strings во всех состояниях.

### 2G. Account / sync / offline / switching

- guest → login;
- two-device merge;
- offline;
- reset;
- course switch.

### 2H. Navigation

- Android Back;
- sheets;
- nested screens;
- deep links;
- app minimize behavior.

### 2I. Chaos / interruption

- app kill;
- lost network;
- duplicate taps;
- simultaneous sync;
- content update.

### 2J. Full regression matrix

Добавить автоматизированные E2E сценарии:

- first run;
- resume;
- replay;
- review;
- switch course;
- sign-in merge;
- two devices;
- offline recovery.

---

## 13. Приоритет работ

### P0

1. Неверный first-run/replay смысл.
2. Replay ↔ SRS.
3. Resume integrity.
4. Impossible state после save errors.

### P1

5. Stats semantics.
6. Analytics contract.
7. Text/state audit.
8. Course switching / sync.

### P2

9. Chaos cases.
10. Полный regression suite.

---

## 14. Definition of Done

Аудит считается закрытым, когда:

- каждый основной user flow есть в test matrix;
- для каждого flow определены allowed state mutations;
- first/resume/replay различаются явно;
- replay не меняет SRS случайно;
- тексты зависят от состояния;
- статистика математически корректна;
- analytics не дублируется;
- guest/login/two-device/offline сценарии покрыты;
- Android Back детерминирован;
- edge cases имеют automated regression tests.

---

## 15. Следующий шаг

Начать с **2A — State model**.

Первый технический PR должен:

1. ввести определение run mode;
2. покрыть его unit-тестами;
3. не менять UI больше необходимого;
4. подготовить `learn.tsx` к 2B;
5. обновить этот документ по найденным дополнительным кейсам.


---

## 16. Второй независимый проход по коду — дополнительные находки

Дата повторного прохода: 2026-10-01.

Ниже — проблемы, найденные отдельным повторным просмотром, без опоры на исходный список.

### P0/P1. Частичный save может повторно изменить SRS

`saveGradedActivity()` делает две записи последовательно:

```
writeCourseProgress(...)
writeStatsProgress(...)
```

Course progress/SRS пишется первым.

Если первая запись прошла, а `writeStatsProgress` упал:

1. SRS уже изменён;
2. `saveGradedActivity` отклоняет Promise;
3. `learn.tsx` не выставляет `result`;
4. пользователь остаётся на том же задании;
5. повторное нажатие «Проверить» снова вызывает grading.

В результате один физический ответ может дважды изменить:

- card box;
- due;
- seen;
- learning day;
- затем statistics.

Та же архитектурная проблема есть у `savePracticeActivity()`, где course progress также записывается до stats.

Нужно одно из решений:

- атомарная/идемпотентная операция;
- стабильный answer/run id;
- UI считает critical course write успешным отдельно от secondary stats;
- повтор сохранения не должен повторно grade-ить уже принятый answer event.

Обязательно добавить fault-injection тест:

```
course write succeeds
stats write fails
user retries
SRS changes exactly once
```

---

### P1. Near-miss реализован, но не подключён к learner runtime

В коде есть:

`src/engine/answer-near-miss.ts`

и в content schema есть:

```
answer.nearMiss
```

В старом плане фаза 3.4c отмечена как завершённая.

Но реальные пользовательские потоки:

- `learn.tsx`;
- `review.tsx`;
- dialogue checking

используют обычный `checkAnswer()` и не вызывают `nearMiss()`.

То есть алгоритм существует и тестируется изолированно, но пользователь его фактически не получает.

Нужно решить контракт near-miss:

- что считается опечаткой;
- считается ли ответ правильным для SRS;
- показывается ли «почти правильно»;
- создаётся ли retry;
- как это влияет на first-attempt accuracy.

После этого подключить одинаково в Learn / Review / Dialogue там, где это применимо.

---

### P1. «Начать заново» не гарантирует сброс действительно всех курсов

Экран Reset собирает ids так:

```
DEFAULT_COURSE_ID
+ catalog.data.sets
```

`resetAllProgress()` умеет сбрасывать только явно переданные set ids.

Проблемные случаи:

- каталог загрузился с ошибкой;
- ранее изученный курс больше не опубликован;
- курс убрали из текущего каталога;
- на устройстве остался progress старого set id.

Текст интерфейса обещает:

> «Сотрёт всё пройденное»

но такие документы могут остаться.

Нужно получать ids не только из опубликованного каталога, а из фактически существующих локальных/synced progress documents.

---

### P1. Повторения старого/снятого с публикации курса могут тихо исчезнуть

`useOtherCourseReviews()` ищет курсы только среди:

```
DEFAULT_COURSE_ID
+ текущий published catalog
```

Если пользователь раньше учил курс, который больше не находится в каталоге, его progress document не обнаруживается.

Кроме того, при ошибке `loadSet(id)` код делает пустой `catch{}` и просто пропускает курс.

Следствия:

- badge «к повтору» уменьшается без объяснения;
- часть due items исчезает из Review;
- пользователь не знает, что кусок повторения не загрузился.

Это особенно важно с обещанием, что уже изученный материал остаётся доступным.

Нужно:

- discover studied set ids из progress storage/sync;
- различать `ready`, `partial`, `error`;
- не превращать load failure в «у тебя просто ничего нет к повтору».

---

### P1. Review day может быть засчитан при неполностью загруженной очереди

Review session допускает частичную деградацию:

- ошибка personal words превращается в `wordUnavailable`;
- ошибки других курсов вообще пропускаются;
- итоговый `total` считается только по успешно загруженным источникам.

Для course review day условие завершения:

```
total === 0
OR
started && queue finished
```

Риск:

> источник review не загрузился → items не попали в total → день выглядит пустым → review day засчитывается.

Нужно явно определить, входят ли personal words / other-course due items в completion review-day.

Если входят — при partial/error нельзя засчитывать день как «всё выполнено».

Если не входят — это надо формально зафиксировать, а course-day completion должен считать только свою обязательную очередь.

---

### P1/P2. Ошибка смены курса не показывается пользователю

`CoursePicker.pick()`:

- ставит busy;
- вызывает `chooseCourse()`;
- в `finally` снимает busy;
- error state отсутствует.

При ошибке сохранения:

- выбранный курс не меняется;
- sheet остаётся открыт;
- пользователю не объясняется, что произошло;
- rejection уходит наружу.

Нужно:

- явное состояние ошибки;
- «Не удалось сменить курс. Попробовать ещё раз»;
- сохранить текущий курс без визуальной неоднозначности.

---

### P1/P2. Настройки уведомлений оптимистично меняются даже если save упал

`NotificationSettingsPanel.save()` сначала:

```
setSettings(next)
```

а потом:

```
await patchSettings(...)
```

Если write падает:

- UI уже показывает новое значение;
- rollback нет;
- error message нет;
- обработчики вызываются через `void save(...)`, поэтому пользователь не получает понятной ошибки.

В результате человек может быть уверен, что включил напоминания или изменил время, хотя persisted settings остались прежними.

Нужно:

- либо rollback на previous settings;
- либо confirmed/pending state;
- обязательный visible save error.

То же проверить для language/theme/settings в целом.

---

### P2 / продуктовый контракт. Required update сейчас fail-open при ошибке проверки

`useAppUpdate()` получает конфиг обновления через сеть.

Вся ошибка initial check проглатывается:

```
catch {}
```

Если сервер пометил версию как обязательную, но:

- config request упал;
- plugin state упал;
- JSON не прочитан,

то `offer` остаётся null и приложение продолжает работать.

Это может быть правильной offline-политикой, но тогда «обязательное обновление» фактически означает:

> обязательно только если удалось проверить конфиг.

Нужно зафиксировать решение:

- fail-open для offline usability;
- либо cached minimum version;
- либо last-known update policy.

---

### P2. Account destructive actions не имеют полного busy/idempotency UX

`signOut()` и `deleteAccount()` не имеют отдельного busy guard.

При повторных быстрых нажатиях возможны:

- повторные запросы;
- гонка detach/navigation;
- неоднозначный error state.

Нужно унифицировать destructive actions:

```
idle → confirming → submitting → success/error
```

и блокировать повторный submit.

---

## 17. Дополнительные сценарии для regression matrix

Добавить к 2J:

### Partial-write integrity

- course write success + stats failure;
- retry того же ответа;
- SRS изменяется один раз;
- UI не заставляет повторно grade-ить сохранённый ответ.

### Removed/unpublished course

- изучить Course B;
- получить due items;
- убрать B из catalog;
- due items не должны молча исчезнуть;
- Reset All действительно удаляет B progress.

### Partial Review data

- active course loads;
- personal words fail;
- other course fails;
- review day не получает ложное «всё выполнено».

### Settings persistence failure

- notification toggle;
- reminder time;
- course switch;
- settings write rejects;
- UI показывает реальное persisted state и понятную ошибку.

### Near miss

- typo;
- grammar error;
- exact answer;
- near miss disabled;
- Learn и Review дают одинаковую классификацию.

### Required update offline

- cached known mandatory version;
- config unavailable;
- явно проверить выбранную продуктовую политику.

---

## 18. Обновлённый порядок P0/P1

После второго прохода порядок предлагается такой:

1. **Partial writes / double grading / SRS idempotency.**
2. **First / resume / replay state model.**
3. **Replay vs Review SRS contract.**
4. **Resume integrity и summary.**
5. **Review completeness при partial data.**
6. **Discovery старых/неопубликованных курсов для Review и Reset.**
7. **Stats semantics.**
8. **Near-miss runtime integration.**
9. **Analytics contract.**
10. **Text/state audit.**
11. **Settings/save error UX.**
12. **Course switching / account / offline / navigation.**


---

## 19. Visual & Copy Audit — отдельный проход

Дата: 2026-10-01.

Проверено отдельно от функционального аудита:

- `Today`;
- `Course Map`;
- lesson runner;
- result feedback;
- generic bottom sheets;
- dictionary sheet;
- Review;
- My Words;
- Me / Progress / Settings;
- onboarding;
- Access / Plus;
- RU/EN i18n;
- мобильные CSS-правила, safe areas, fixed/sticky элементы и touch targets.

Этот раздел специально отделён от state/SRS-проблем выше.

### 19.1. Что уже хорошо

В текущей базе уже есть несколько правильных системных решений:

- основные touch targets в learner UI в основном 44–56 px;
- safe-area учтён сверху и снизу;
- нижняя навигация ограничена шириной приложения;
- есть `prefers-reduced-motion`;
- длинные email/course names местами защищены `min-width:0` + ellipsis;
- RU и EN имеют одинаковый набор i18n-ключей;
- основные learner strings вынесены в i18n, явных пользовательских RU/EN-строк прямо в JSX почти нет.

Но визуальная система и copy пока не полностью единообразны.

---

# 19A. Тексты

### P1. Plus обещает «без ограничений», хотя лимиты существуют

Сейчас несколько текстов говорят:

> «Разбор ошибок и разговор с ИИ без ограничений»

или:

> «ИИ без ограничений»

Такие формулировки есть в:

- `access.plusLead`;
- `access.plusMonthNote`;
- `access.benefitAi`;
- `access.donePlusUntil`;
- `access.donePlusText`.

При этом в продукте существуют:

- AI quota;
- `aiTalk.limit`;
- `answerExplain.limit`;
- настраиваемые лимиты в админке.

Это прямое расхождение продукта и обещания пользователю.

Нужно либо:

- действительно сделать Plus без пользовательского лимита;
- либо убрать «без ограничений» и писать что-то вроде «Расширенный доступ к ИИ» / «ИИ входит в Plus».

Copy должен строиться из реального entitlement/quota contract.

---

### P1. «3 бесплатных разбора» захардкожено в тексте, хотя лимит настраиваемый

Сейчас:

```
answerExplain.freeUsed:
«Три бесплатных разбора использованы»

answerExplain.freeLeft:
«Бесплатных разборов осталось: {count} из 3»
```

Но free AI limit настраивается.

Если в админке будет 1, 5 или 10:

- UI продолжит говорить «3»;
- пользователь увидит противоречие.

Нужно передавать `limit` динамически:

```
{count} из {limit}
```

и использовать plural helper.

---

### P1. Карточка Review на «Сегодня» неправильно описывает содержимое

На плитке сейчас:

```
N
карточек ждут
```

Но `review.actionableCount` включает не только cards:

- card;
- drill;
- listening;
- speaking;
- personal words;
- due items других курсов.

То есть пользователь может видеть:

> 8 карточек ждут

хотя среди них, например, две карточки, speaking, listening и три слова.

Плюс «1 карточек ждут» грамматически неверно.

Лучше:

- `8 к повтору`;
- `8 заданий к повтору`;
- либо динамический breakdown.

Самый компактный вариант для Today:

> **8**  
> **к повтору**

---

### P1/P2. Несколько числовых строк не имеют нормального pluralization

Примеры:

```
courses.previewDays = «Бесплатных дней: {days}»
progress.samples = «упражнений: {count}»
learn.introLabel = «Сначала теория, потом заданий: {count}»
```

В результате возможны конструкции:

> Бесплатных дней: 1

> упражнений: 1

> потом заданий: 1

Первая и вторая ещё читаемы как labels, третья уже явно плохая.

Нужно использовать plural helper там, где строка является предложением или естественной речью.

Например:

> Сначала теория, потом 1 задание

> Сначала теория, потом 3 задания

---

### P1. `review.moreDue` приписывает все оставшиеся items ошибкам пользователя

Текст:

> «Не получилось: {count}. Лучше пройти их ещё раз сейчас…»

Но `left` после завершения pinned review session вычисляется заново из актуального due state.

Туда потенциально попадает не только то, что пользователь «не смог»:

- requeued mistakes;
- items, появившиеся после refresh;
- другой курс;
- другой источник review.

Текст должен описывать состояние, а не придумывать причину.

Лучше:

> «Ещё к повтору: {count}»

и отдельно, если мы точно знаем количество ошибок:

> «Ошиблись: N»

---

### P2. `learn.introLabel` написан неестественно

Сейчас:

> «Сначала теория, потом заданий: {count}»

Нужно:

> «Сначала теория, потом {count} заданий»

с pluralization.

---

### P2. «Диалог» местами выбивается из общего тона

Сейчас:

> «Так и есть»

для корректного ответа.

Это звучит как подтверждение факта, а не проверка реплики.

Лучше:

> «Подходит»

или:

> «Хороший ответ»

Ещё сильнее выбивается:

> «Диалог держишь. Такой разговор уже можно вытянуть в жизни.»

Это намного более разговорная/сленговая формулировка, чем остальной интерфейс.

Лучше сохранить живой тон, но привести к общей манере:

> «Отлично. С таким диалогом уже справишься в реальной ситуации.»

---

### P2. Статусы слов грамматически из разных систем

Сейчас:

- новое;
- повторяю;
- выучено.

`повторяю` — глагол от первого лица, остальные — состояния объекта.

Лучше одна система:

- новое;
- на повторе;
- выучено.

или:

- новое;
- учу;
- выучено.

---

### P2. «Всё уже повторено вовремя» звучит как результат действия, которого могло не быть

`learn.reviewDayClear`:

> «Всё уже повторено вовремя. Можно засчитать день.»

Если review queue просто пустая, пользователь мог ничего сегодня не повторять.

Лучше:

> «На сегодня повторений нет. День можно засчитать.»

Но это всё равно зависит от решения из functional audit: должен ли пустой review day вообще автоматически считаться выполненным.

---

### P2. Текст notification permission описывает не совсем тот момент

Сейчас:

> «Спросим разрешение, только когда ты нажмёшь кнопку ниже.»

Но при включении toggle код уже вызывает request flow.

То есть к моменту появления этого состояния system prompt мог уже быть показан.

Нужно синхронизировать copy с фактическим permission state:

- `not-determined` → «Нужно разрешить уведомления»;
- `denied` → «Разрешение выключено в системе»;
- `granted` → ready.

---

### P2. «День / урок / занятие / шаг» используются вперемешку

Сейчас одновременно есть:

- день;
- урок;
- занятие;
- шаг;
- activity;
- повтор дня.

Технически это разные сущности, но пользователь не должен разбираться в внутренней модели.

Нужно зафиксировать словарь продукта:

- **День** — единица маршрута;
- **Урок** — основное обучение внутри дня;
- **Задание** — один learner task;
- **Повтор** — SRS;
- **Практика** — drill/listening/speaking;
- **Шаг** использовать только там, где это реально универсальная сущность, иначе убрать.

Особенно проверить:

```
«Этот шаг сейчас недоступен»
«Следующий шаг»
«обязательный шаг»
```

На learner UI понятнее конкретное:

> «Этот день пока недоступен»

или:

> «Это задание пока недоступно»

---

# 19B. Визуальная система

### P1/P2. Сейчас существуют три разные реализации bottom sheet

Есть минимум три визуально и технически разные системы:

1. generic `.sheet`;
2. `.dictionary-sheet`;
3. `.learn-feedback.is-sheet`.

Они отличаются:

- max height: 70 / 78 / 82 vh;
- padding;
- radius;
- border;
- shadow;
- animation;
- z-index;
- close behavior;
- внутренней шапкой.

Из-за этого одинаковый паттерн «нижнее окно» ощущается как разные компоненты.

Нужно оставить один базовый Sheet primitive и варианты:

```
Sheet
SheetFeedback
SheetDictionary
```

но геометрия, safe area, motion и close affordance должны идти из одного компонента.

---

### P1/P2. Close button generic Sheet может уехать вместе со scroll

`.sheet` сам является `overflow:auto`.

При этом:

```
.sheet-close {
  position:absolute;
  top:12px;
}
```

Кнопка привязана к scroll-container, а не к sticky header.

В длинном sheet пользователь может прокрутить контент и потерять видимую кнопку закрытия.

Лучше:

- sticky sheet header;
- close всегда остаётся сверху;
- grab + title + close входят в один header primitive.

---

### P1/P2. Не все Sheet-контейнеры резервируют место под крестик одинаково

Сейчас padding справа вручную добавляется отдельными селекторами:

```
.station-sheet > ...
.sheet > :is(.speak-sheet,.theory-sheet,.courses-sheet) > :first-child
.confirm-sheet h3
```

Но появляются другие sheet bodies, например `access-signin`.

Это хрупко: новый sheet легко добавить и забыть оставить 44–52 px под close button.

Нужно решить это на уровне самого `SheetHeader`, а не специальными CSS-исключениями.

---

### P2. Горизонтальные ошибки сейчас могут маскироваться `overflow-x:clip`

Корневая оболочка:

```
.app {
  overflow-x: clip;
}
```

Это предотвращает горизонтальный scroll, но одновременно может скрыть настоящий layout bug:

- длинный текст;
- слишком широкий child;
- translate animation;
- таблица;
- chips.

В автоматическом visual QA нельзя использовать отсутствие horizontal scrollbar как доказательство отсутствия overflow.

Нужно дополнительно проверять:

```
element.scrollWidth <= element.clientWidth
```

для основных screen containers и sheets.

---

### P2. Карта курса местами скрывает содержимое через ellipsis

`.stage-sub`:

```
white-space:nowrap;
overflow:hidden;
text-overflow:ellipsis;
```

На маленьком экране длинная тема этапа просто исчезает за троеточием.

Если эта строка вторична — нормально.

Но нужно:

- доступное полное значение через aria/title;
- убедиться, что важная тема дня не живёт только в этой строке.

---

### P2. Крупные заголовки + вспомогательные controls надо regression-тестировать на 320–360 px

Сейчас часто используются:

- 34 px screen titles;
- 30 px access headings;
- 26 px lesson title;
- рядом кнопка «Теория»;
- course picker/chips.

CSS в целом адаптивный, но нужны реальные visual regression размеры:

- 320 × 568;
- 360 × 800;
- 390 × 844;
- 412 × 915.

Особенно:

- `runner-heading`: title + «Теория»;
- access plan: длинное название + nowrap price;
- course picker;
- progress metric cards;
- Russian strings в dark/light.

---

### P2. Review hero может визуально переоценивать одно число

На Review главный круг показывает общий `total`, а ниже breakdown повторяет категории.

Это хорошо при 5–20 items, но при большой очереди UI фактически дважды акцентирует размер долга.

Продукт обещает лёгкий подход и caps queue.

Нужно убедиться, что главный number означает именно **этот подход**, а не всю накопленную очередь.

Если есть waiting:

> 7 сейчас  
> ещё 18 позже

визуально лучше, чем огромная цифра 25 и текст о caps ниже.

---

### P2. Dictionary визуально живёт отдельно от остальных sheets

Dictionary использует:

- собственный scrim;
- z-index 1000;
- свою геометрию;
- отдельный close;
- отдельные radius;
- отдельный mobile override.

Это усиливает проблему трёх sheet systems.

При унификации важно не потерять высокий z-index, потому что словарь может открываться поверх feedback.

---

# 19C. Copy consistency matrix

Перед релизом сделать отдельный lint/manual matrix:

| Состояние | Today | Course Map | Lesson | Review | Progress |
|---|---|---|---|---|---|
| not started | Начать | Открыть | — | Начать повтор | — |
| partially done | Продолжить | Продолжить | progress | продолжить session | — |
| completed | Пройден | Пройти ещё раз | День пройден | — | completed |
| replay | Пройти ещё раз | Пройти ещё раз | Повторное прохождение | — | history |
| locked | Открыть доступ | Нужен доступ | unavailable | learned review allowed | — |
| offline | cached state | cached state | save local | save local | cached stats |
| save error | visible retry | visible retry | answer preserved | item preserved | stale label |

Главное правило:

> один и тот же state должен называться одинаково во всех местах.

---

# 19D. Visual regression plan

Добавить к 2J автоматический visual pass.

Минимальный набор экранов:

1. Onboarding.
2. Today — fresh.
3. Today — partial day.
4. Today — due review.
5. Course Map — current stage.
6. Course Map — purchase lock.
7. Lesson — theory.
8. Lesson — choice.
9. Lesson — wrong feedback.
10. Lesson — retry phase.
11. Lesson — summary.
12. Review — intro.
13. Review — card.
14. Review — done.
15. My Words — empty / populated.
16. Progress — empty / populated.
17. Settings.
18. Access course.
19. Access Plus.
20. Sign-in sheet.
21. Dictionary short entry.
22. Dictionary long/multiple senses.
23. Generic confirmation sheet.
24. Required update.

Каждый:

- RU + EN;
- light + dark;
- 320 / 360 / 390 / 412 px;
- long strings;
- font scaling 100% и увеличенный системный font where possible.

Автоматические assertions:

- no horizontal overflow;
- no clipped fixed CTA;
- no text under close icon;
- touch target >= 44 px;
- bottom action above safe area;
- tab bar does not overlap content;
- sheet can scroll to final action;
- focus order remains logical.

---

# 19E. Приоритет визуала и текста

### До релиза

1. Убрать ложное «ИИ без ограничений».
2. Убрать hardcoded «3 бесплатных».
3. Исправить Today Review «карточек ждут».
4. Исправить copy, зависящее от неправильной причины: `review.moreDue`.
5. Унифицировать Sheet geometry/header/close.
6. Visual regression на 320–412 px.
7. Зафиксировать learner terminology: день / урок / задание / повтор / практика.

### Полировка

8. Pluralization.
9. Tone cleanup Dialogue.
10. Word status terminology.
11. Stage subtitle accessibility.
12. Остальные RU/EN copy consistency cases.


---

## 20. UI/UX implementation pass — 2026-10-01

Этот блок фиксирует не только аудит, но и фактические изменения, внесённые после визуального прохода.

### Сделано

#### Android status bar

Нативная тема уже использовала прозрачный status bar:

```
android:statusBarColor = transparent
WindowCompat.setDecorFitsSystemWindows(window, false)
```

Проблема была в web-слое: `body::before` рисовал отдельную цветную полосу под status bar.

Исправлено:

- отдельная web-плашка убрана;
- safe-area padding сохранён;
- Android остаётся edge-to-edge с прозрачным status bar.

#### Маршрут

Исправлена геометрия rail:

- обычная линия — одинаковые круглые точки;
- пройденная зелёная часть использует ту же точечную геометрию;
- переход к текущей станции тоже использует те же точки;
- больше нет ситуации, где серый rail пунктирный, а зелёный выглядит длинными цельными полосами.

#### Dock / нижняя навигация

- фон сделан более прозрачным;
- blur усилен;
- активный tab теперь стилизуется не только через внутренний CSS class Router, но и через стандартный `aria-current="page"`.

#### Стабильная геометрия utility-карточек

На Today:

- «Скажи вслух»;
- ближайший «Разговор / Повтор»

получили одинаковую минимальную высоту, одинаковую 56 px icon area и более стабильные text rows.

На Route:

- «Твой курс» и «Справочник» визуально отделены от станций дней;
- «Справочник» сокращён до короткого названия вместо длинного описания;
- обе utility-карточки приведены к схожему размеру.

#### «Я» → «Профиль»

Переименовано:

- tab bar;
- заголовок экрана;
- RU/EN.

Аватар удалён.

Шапка теперь:

```
email / guest state
Профиль
                          settings
```

то есть используется та же иерархия subtitle → large title, что и на других основных экранах.

#### Статистика: общая и по курсу

Разделена на два смысловых блока.

**Общее:**

- дни занятий;
- серия;
- календарь активности.

«Мои слова» из общего блока убраны: это не независимая общая метрика для текущей компоновки Profile.

**По курсу:**

- selector курса;
- дни курса;
- карточки;
- due now;
- drill;
- listening;
- speaking;
- ответы и performance конкретного курса.

Выбор курса в статистике **не переключает активный курс приложения**.

#### Progress bar внутри урока

Возвращён segmented progress.

Каждая палочка теперь имеет отдельное состояние:

- green — правильный ответ;
- red — ошибка;
- accent — текущее задание;
- neutral — ещё не пройдено.

Retry в конце не создаёт новые ложные сегменты первого прохода.

#### Choice переведён на осознанное подтверждение двумя tap

В Lesson и Review:

```
первый tap
→ выбрать вариант

второй tap по уже выбранному варианту
→ подтвердить
→ feedback
```

Причина: защита от ложного случайного нажатия.

Отдельной кнопки «Проверить» для multiple choice нет. Выбранный вариант показывает подсказку «Нажми ещё раз».

Listening-choice приведён к тому же принципу.

Для typed/chips ответов явная отправка остаётся, потому что пользователь должен закончить ввод.

#### Feedback / «Почему?» переработан после device QA

Текущий контракт:

- корректный ответ: `Верно`, затем `Далее` на всю ширину;
- ошибочный ответ: `Ответ неверный`;
- если задание будет возвращено, короткая строка `Это задание вернётся в конце урока` находится сразу под заголовком;
- закрытый `Почему?` + `Далее` стоят в одной строке;
- раскрытый AI-разбор идёт обычным контентом, а `Далее` переносится ниже на всю ширину;
- Plus/error-state разбора также занимает полную строку;
- старые конфликтующие sticky/shadow overrides удалены.

Это заменяет прежнюю реализацию со sticky CTA, которая давала большие пустоты и наложение тени на текст.

#### Выход из урока

Крестик больше не закрывает runner мгновенно.

Показывается confirmation:

> Выйти из урока?  
> Уже пройденные задания сохранены.

Действия:

- продолжить урок;
- выйти и сохранить;
- выйти без сохранения локального незавершённого run.

Важно: graded/progress writes происходят по ходу урока. Поэтому «выйти без сохранения» сейчас удаляет локальный `LessonRunSnapshot`, но не откатывает уже записанные ответы/SRS. Семантика этой кнопки отмечена ниже как открытый P1.

---

## 21. Найденная причина потери незавершённого урока

Первоначально проблема выглядела как UX:

> пользователь нажал крестик, приложение ничего не спросило.

Но повторная проверка показала более серьёзную state-проблему.

### Что происходило

Неправильный graded answer сразу вызывал:

```
gradeCourseCard(...)
→ seen[activityId]
```

Одновременно его повтор в конце урока существовал только в локальном React-state:

```
order = [...order, wrongStep]
```

Если пользователь закрывал приложение до «Работы над ошибками»:

1. activity уже была `seen`;
2. retry queue исчезала вместе с компонентом;
3. при следующем входе `firstPendingActivityIndex()` видел activity как пройденную;
4. ошибка и незавершённый retry фактически терялись.

### Исправление

Добавлен локальный persisted `LessonRunSnapshot`:

```
unmute.lesson-run:<setId>:<nodeId>
```

Сохраняются:

- текущая позиция;
- исходная длина first pass;
- order, включая возвращённые ошибки;
- correct/wrong states progress bar;
- текущий selected answer;
- typed answer;
- word chips;
- текущий feedback result;
- score текущего run;
- practice mode.

При повторном открытии незавершённый run восстанавливается.

Snapshot удаляется после нормального `finish()`.

Дополнительная защита:

> если день тем временем уже завершён через sync / другое устройство, старый local run не восстанавливается.

Добавлен regression test:

```
wrong answer
→ X
→ «Выйти и сохранить»
→ remount
→ same wrong feedback + retry queue still present
```

---

## 22. Дополнительные UI/copy проблемы, закрытые в этом проходе

### Dynamic AI free allowance

Backend уже возвращал:

```
access.remaining
access.maxCalls
```

Но client сохранял только `remaining`, а UI был захардкожен:

> 2 из 3

Исправлено:

- client теперь сохраняет `freeLimit`;
- copy использует `{count} из {limit}`;
- exhausted state больше не говорит «три», если лимит изменится.

### Plus и «без ограничений»

Удалены утверждения:

> ИИ без ограничений

из Plus copy.

Теперь используется:

> расширенный доступ к ИИ / разборам / разговорам.

Причина: в продукте существуют quota/limit состояния, поэтому старое обещание было фактически ложным.

### Review tile на Today

Вместо:

> N карточек ждут

используется:

> N  
> к повтору

потому что очередь включает не только карточки, но и:

- words;
- drill;
- listening;
- speaking;
- other-course review.

### Review done copy

Вместо причинного:

> Не получилось: N

используется состояние:

> Ещё к повтору: N

потому что пересчитанная очередь не обязательно состоит только из ошибок текущего run.

### Word status

`повторяю` → `на повторе`.

Так statuses остаются одной грамматической системой:

- новое;
- на повторе;
- выучено.

---

## 23. Что ещё обязательно проверить визуально на реальном Android

После этих изменений остаётся device-level QA, который нельзя доказать одним code review:

1. status bar icons в light/dark mode на Samsung/Pixel;
2. IME/keyboard + sticky feedback action;
3. 320–360 px экран с длинным «Почему?»;
4. segmented progress при 10+ заданиях;
5. dock blur поверх:
   - белой карточки;
   - цветной карточки;
   - scroll content;
6. route rail при:
   - 0 completed;
   - partial stage;
   - all completed;
   - review/dialogue/AI stations;
7. restore run после:
   - X;
   - Android Back;
   - process kill;
   - force-close;
8. course selector в статистике с длинными названиями RU/EN;
9. Profile email overflow;
10. utility cards Today/Route на 320/360/390/412 px.

---

## 24. Следующие технические проверки после UI-пачки

UI-пачка не отменяет P0 из функционального аудита.

После визуальной стабилизации следующими должны идти:

1. partial write → double SRS grading;
2. formal first/resume/replay model;
3. replay не должен случайно работать как review;
4. review completion при partial data;
5. unpublished/removed course review discovery;
6. reset all progress для старых set ids;
7. nearMiss runtime integration;
8. analytics contract и idempotency.


---

## 25. Clarification: what was changed before the audit-only boundary

Important: during the previous UI pass implementation work was performed before the task boundary was clarified.

Those changes are already documented in sections 20–22 and included:

- Android status-bar web strip removal;
- route rail visual changes;
- dock blur;
- Profile rename/header changes;
- per-course statistics selector/layout;
- segmented lesson progress;
- two-tap choice confirmation;
- sticky feedback action;
- lesson exit confirmation;
- local unfinished LessonRun snapshot;
- several copy changes and matching test edits.

На момент написания этого раздела была установлена граница **audit-only**:

> inspect existing behavior/tests → record evidence/gaps here → do not change product code or tests.

Позже владелец отдельно вернул задачу в implementation mode и последовали UI/state fixes. Поэтому разделы 26–34 отражают тот audit-only снимок, а актуальное состояние после последующих изменений зафиксировано в разделе 35.

---

## 26. Existing automated test coverage — verified by source review

The current UnMute test suite is substantial. It includes:

- Vitest unit/component tests;
- Node smoke/integration scripts;
- Chromium E2E over the production Vite build;
- Android shell/build/emulator smoke;
- iOS shell/build/simulator smoke;
- legacy-parity tests.

Current scripts:

```
test:smoke
test:unit
test:browser
check
check:android
check:ios
```

The dedicated `.github/workflows/unmute.yml` is designed to run:

- legacy import dry-run;
- legacy parity;
- production build + Chromium E2E;
- Android debug builds + emulator launch smoke for native changes;
- iOS simulator build + launch smoke for native changes.

### Execution evidence update

Изначально в audit-only проходе workflow results были недоступны, поэтому coverage ниже оценивался по исходникам.

Позже execution evidence был получен из GitHub Actions. Важный вывод подтвердился:

- Vercel `READY` не равен green test gate;
- `UnMute — production readiness` может быть green, когда общий `AppBase — all apps consistency` красный;
- после последних UI/state изменений typecheck-регрессии были найдены и исправлены;
- следующий общий check дошёл до unit suite и показал 11 failures / 257 passes.

Поэтому ниже статус `✅ coverage exists` не означает, что текущий suite целиком green.

---

## 27. Scenario coverage matrix: what is already tested

Legend:

- ✅ — good automated coverage exists;
- 🟡 — partial / lower-level coverage only;
- ❌ — no meaningful automated coverage found;
- ⚠️ — a test exists but is currently stale/inconsistent with current UI.

| Scenario | Status | Existing evidence |
|---|---:|---|
| Minimal onboarding | ✅ | `onboarding.test.tsx` |
| Course picker in onboarding | ✅ | single/multiple published course cases |
| Existing progress skips onboarding | ✅ | tombstone-aware recognition test |
| First lesson basic flow | ✅ | `learn.test.tsx` |
| Wrong answer returns at lesson end | ✅ | `learn.test.tsx` |
| Resume at first unseen activity | ✅ | `learn.test.tsx` |
| Close and restore unfinished run | ✅/⚠️ | dedicated test exists from previous pass; see stale-suite section below |
| Replay completed node does not re-fire node completion | ✅ | `learn.test.tsx` |
| Replay does not mutate SRS | ❌ | completion analytics only; SRS side effect not covered |
| first/resume/replay summary semantics | ❌ | no persistent first-attempt contract test |
| Partial write: course save succeeds, stats save fails | ❌ | no fault-injection test |
| Duplicate tap / duplicate answer idempotency | ❌ | not found |
| Card SRS intervals | ✅ | `card-srs.test.ts`, legacy parity |
| Practice SRS parity | ✅ | legacy parity |
| Review wrong card requeue | ✅ | `review.test.tsx` |
| Review across another studied course | ✅ | `review.test.tsx`, `other-course-review.test.ts` |
| Review waits for other-course loading | ✅ | `review.test.tsx` |
| Personal word review | ✅ | `review.test.tsx`, word SRS tests |
| Mixed drill | ✅ | session construction/cap + UI entry |
| Review partial-data failure | ❌ | no test proving failure cannot become false “all done” |
| Removed/unpublished course review | ❌ | only deleted-progress records are tested, not catalog removal |
| Due course load failure | ❌ | no user-visible partial/error contract test |
| Stats merge across devices | ✅ | `progress.test.ts` |
| Stats semantic consistency across task types | ❌ | counters tested, comparability is not |
| Learning streak across course switch | ✅ | `learning-days.test.ts` |
| Meaning of learning day vs completed day | 🟡 | implementation helpers tested, product semantics not |
| Two-device progress merge | ✅ | unit merge + Chromium E2E |
| Guest → login keeps local progress | ✅ | Chromium E2E |
| Two devices converge after sign-in | ✅ | Chromium E2E |
| Offline badge/cached Today | ✅ | component-level |
| Full offline lesson → reconnect → sync | ❌ | no end-to-end offline mutation/recovery test found |
| Course switching saved choice | ✅ | `active-course.test.tsx`, settings merge |
| Switch course mid-lesson | ❌ | not found |
| Course switch write failure | ❌ | not found |
| Reset tombstone beats old account copy | ✅ | `progress-reset.test.ts` |
| Reset answer stats | ✅ | `progress-reset.test.ts` |
| Reset includes unpublished/unknown old course | ❌ | not covered |
| Delete account server records | ✅ | `tests/account-delete.js` |
| Delete account UI confirmation | ✅ | `app.test.tsx` |
| Double-submit delete/sign-out | ❌ | not found |
| Permanent course entitlement | ✅ | `entitlements.test.ts` |
| Plus expiry | ✅ | stale premium flag test |
| Paid cached lesson blocked after access ends | ✅ | `learn.test.tsx` |
| Purchase offer/pricing/restore | ✅ | `access.test.tsx` |
| Purchase entitlement refresh race/failure | 🟡 | UI states tested, full external billing round-trip not |
| AI conversation trial/auth/Plus gates | ✅ | AI conversation + AI trial tests |
| AI whole-conversation review failure | ✅ | completion remains possible |
| AI answer explanation opt-in | ✅ | request only after explicit “Почему?” |
| Free explanation allowance | ✅/⚠️ | backend allowance tested; current UI expectation drift exists |
| Near-miss algorithm | ✅ | strong unit + legacy parity |
| Near-miss used by Learn/Review runtime | ❌ | no runtime integration; algorithm remains isolated |
| Speech fallback | ✅ | dialogue + speech runtime |
| Android Back state machine | ✅ | sheet/tab/lesson/minimize/double-back |
| Notification prioritization | ✅ | review > streak > lesson |
| Notification scheduling | ✅ | local-time plan and disabled state |
| Notification deep link whitelist | ✅ | supported vs arbitrary routes |
| Notification permission/settings save failure UX | ❌ | not found |
| Optional/required app update decision | ✅ | unit |
| APK/store update banner behavior | ✅ | component |
| Required update when config unavailable/offline | ❌ | no cached-policy/fail-open contract test |
| Android native shell config | ✅ | transparent status bar, permissions, direct/play channels |
| Android emulator launches | 🟡 | workflow exists; current run result not available here |
| iOS simulator launches | 🟡 | workflow exists; current run result not available here |
| 360 px main-screen overflow, light/dark | ✅/⚠️ | Chromium E2E contains screen walk, but suite currently has stale copy selectors |
| 320 px | ❌ | not in current E2E |
| 390 px main flows | 🟡 | main E2E device uses 390×800, but not systematic visual matrix |
| 412 px | ❌ | not in current E2E |
| Large system font scaling | ❌ | not found |
| Keyboard/IME + long feedback sheet | ❌ | not found |
| Status-bar icon contrast on real Android | ❌ | shell config only, no screenshot/device assertion |
| Dock blur visual correctness | ❌ | no pixel/screenshot assertion |
| Segmented progress visual states | 🟡 | behavior can be inferred; no visual-state assertion found |
| Route rail visual consistency | 🟡 | E2E checks rail geometry, not green/gray dot visual parity |
| RU/EN complete visual regression | ❌ | E2E is primarily RU |
| Copy parity RU/EN | 🟡 | dictionary key structure exists; semantic parity not automatically asserted |

---

## 28. Current test-suite drift discovered during audit

This is important because existing tests cannot currently be treated as a fully trustworthy green gate without first checking their expectations against the current UI.

### ⚠️ Chromium E2E still searches for «Я»

Current `tests/e2e.mjs` contains:

```
me: 'Я'
```

and uses it to open the account/profile tab.

Current UI dictionary says:

```
nav.me = 'Профиль'
```

Therefore the current E2E sign-in path is stale and would fail at that locator if executed unchanged.

This is a **test maintenance issue**, not a new product defect.

---

### ⚠️ Today component tests still expect old Review copy

Current `today.test.tsx` contains expectations for:

> «карточек ждут»

while the current UI copy was changed to a generic review label.

This is another stale expectation.

---

### ⚠️ Access test still expects old unlimited-AI copy

Current `access.test.tsx` still contains:

> «Разбор ошибок и разговор с ИИ без ограничений»

while RU product copy now uses a more limited/expanded-access formulation.

At the same time the **current English dictionary still contains** an old unlimited-AI claim in `access.plusLead`.

So this audit found two separate issues:

1. stale automated test expectation;
2. RU/EN copy semantic drift remains possible.

Do not infer copy correctness only from one locale.

---

### ⚠️ Lesson/Review tests need synchronization with two-tap choice

Current product contract is:

```
first tap → select
second tap on selected option → confirm
```

There is no separate «Проверить» button for multiple choice.

Older tests still contain assumptions from previous interaction contracts, so choice-path expectations must be synchronized.

Typed/chips answers still legitimately require explicit submit.

---

### ⚠️ App-level tests still name the tab «Я»

`app.test.tsx` test descriptions and expectations still include the old product term «Я».

Even if some assertions use dictionary keys dynamically, these tests need a deliberate review for semantic/copy drift.

---

### Consequence

Before treating `npm run test:unit` / `npm run test:browser` as a release gate, perform a **test expectation synchronization pass**.

That pass should update tests only after deciding the final UI/copy contract.

For this audit, the important finding is:

> current test coverage is broad, but some top-level tests are stale after the recent UI changes.

---

## 29. New tests still required by the audit

These are the highest-value missing tests; they should be added before release or before fixing the corresponding P0/P1 logic.

### P0 — state/data integrity

#### 1. Partial write / double grading

Inject:

```
writeCourseProgress → success
writeStatsProgress → failure
same UI answer retried
```

Assert:

- card/practice SRS changes once;
- answer does not duplicate;
- stats eventually converge exactly once.

#### 2. Replay must not silently behave as Review

Complete a lesson, record its SRS state, replay it.

Assert the explicitly chosen contract:

- SRS unchanged, **or**
- replay has a deliberately separate grading rule.

It must never happen by accident.

#### 3. Resume with previous wrong answer

Test not just UI restoration but persisted semantics:

- wrong answer;
- close/process recreation;
- resume;
- retry queue preserved;
- first-pass score preserved;
- final summary still describes the original run correctly.

#### 4. Synced completion beats stale local LessonRun

Device A has unfinished local snapshot.

Device B completes the node and syncs.

Device A reloads.

Assert:

- stale run is ignored/cleared;
- completed node opens as completed/replay state.

---

### P1 — Review integrity

#### 5. Other-course load fails

Simulate one studied course loading successfully and another failing.

Assert:

- failure is represented explicitly;
- due count does not silently pretend to be complete;
- completing Review does not falsely claim all work is done.

#### 6. Personal words fail to load

Same requirement for word review source.

#### 7. Unpublished previously studied course

Study course B → create due state → remove B from published catalog.

Assert product contract:

- old learned material remains discoverable if promised;
- due items do not silently disappear;
- Reset All can still discover/delete that progress.

---

### P1 — Sync/offline

#### 8. Offline lesson mutation → reconnect

- start from cached content;
- answer tasks offline;
- close/reopen;
- reconnect;
- sync account.

Assert no rollback, no duplicate SRS and no duplicate analytics completion.

#### 9. Course switch during unfinished lesson

Define expected policy:

- old run persists;
- switching course does not attach it to the new course;
- returning restores it correctly.

#### 10. Course switch persistence failure

Inject settings/document write failure.

Assert visible error and active course consistency.

---

### P1 — analytics

#### 11. Durable completion event

Complete the last required activity, then terminate UI before summary.

Assert whether `lesson_completed` / `day_completed` must still be emitted exactly once.

Current completion tracking is UI-transition based and needs a contract test.

#### 12. first / resume / replay event contract

Assert exact event count and mode for:

- first start;
- resume;
- first completion;
- replay;
- exit without completion.

#### 13. Analytics failure

If analytics delivery fails:

- learning state remains valid;
- retry does not duplicate business events.

---

### P1/P2 — visual/device

#### 14. Width matrix

Run learner screens at:

- 320;
- 360;
- 390;
- 412 px.

Current systematic screen walk covers only 360 px.

#### 15. Long feedback + keyboard

Test:

- long course explanation;
- long AI “Почему?” result;
- keyboard open;
- bottom CTA remains reachable;
- no content is permanently hidden.

#### 16. Android status bar

On emulator/device in light and dark:

- transparent background;
- readable icons;
- no artificial web strip;
- content respects safe inset.

A static shell test already verifies transparent native configuration, but not rendered result.

#### 17. Segmented lesson progress

Assert states after:

- correct;
- wrong;
- current;
- pending;
- retry phase.

Ideally visual/screenshot, not only class names.

#### 18. Route rail

Visual regression for:

- all pending;
- first days complete;
- current station;
- stage boundaries;
- dialogue/review/AI landmarks.

The existing E2E checks rail start/arrival geometry but not visual dot consistency.

#### 19. RU/EN screenshot matrix

At least critical screens:

- Today;
- Route;
- Lesson;
- Review;
- Profile;
- Access.

Current visual walk is effectively RU-centric.

#### 20. Large font

Use browser/mobile font scaling if feasible.

Assert:

- no clipped CTA;
- no hidden close icon;
- no overlapping cards;
- dock labels remain usable.

---

## 30. Tests already stronger than initially assumed

The audit also confirmed several areas that do **not** need duplicate test plans:

### Sync merge

Already covered at two levels:

- document-level merge tests;
- real Chromium two-device E2E.

### Reset tombstones

An older account copy losing to newer reset tombstones is already covered.

The remaining reset problem is **discovery of unknown/unpublished course ids**, not basic tombstone precedence.

### Android Back

Core order is already tested:

```
sheet → history
inner/lesson → history
other tab → Today
Today → minimize / second-back exit
```

The missing part is interaction with an unfinished lesson snapshot/exit confirmation, not the basic Back state machine.

### Near-miss

The algorithm itself has strong tests and legacy parity.

The missing part is **runtime wiring into Learn/Review**, not algorithm quality.

### Notifications

Priority and scheduling are already well covered.

The missing area is **settings persistence/permission failure UX** and actual device delivery behavior.

### Account deletion

Server cleanup and UI confirmation already have tests.

The remaining audit concern is duplicate submit/race/error UX, not basic deletion.

---

## 31. Audit status after this test-coverage pass

The remaining unknowns are now concentrated rather than broad.

Highest-risk unverified areas:

1. partial writes / double SRS mutation;
2. first-resume-replay semantics;
3. replay vs Review;
4. Review with partial/missing data sources;
5. unpublished/removed studied courses;
6. offline mutation + reconnect;
7. analytics idempotency/durable completion;
8. test-suite drift after recent UI copy/interaction changes;
9. real-device visual behavior at status bar / IME / multiple widths.

The existing suite already gives good confidence in:

- base SRS algorithms;
- legacy parity;
- two-device merge;
- onboarding;
- entitlements;
- Android Back;
- notification policy;
- account deletion;
- speech fallbacks;
- AI gates;
- update flow;
- basic route/screen overflow at 360 px.



---

## 32. Coverage of the latest UI changes

A separate audit pass checked whether the UI changes from sections 20–22 are themselves protected by automated assertions.

### Profile rename/header

**Partial coverage only.**

There are app-level navigation tests that resolve the tab label through:

```
t['nav.me']
```

so they follow the dictionary value.

But there is no direct assertion for:

- visible title `Профиль`;
- email above title;
- avatar absence;
- long email overflow;
- visual hierarchy matching other screen headers.

Status: 🟡.

---

### Per-course Progress selector

No test references were found for:

- `progress.courseTitle`;
- `progress.courseLabel`;
- `.progress-course-picker`.

Missing cases:

- selecting Course B changes course-dependent statistics;
- global metrics remain unchanged;
- active application course does not switch;
- long course names fit;
- selected course survives only for the intended lifetime.

Status: ❌.

---

### Segmented lesson progress

No direct automated assertions were found for:

- `.runner-progress-step`;
- correct/wrong/current/pending classes;
- number of segments;
- segment state after entering retry phase.

The lesson flow tests cover the underlying answering behavior, but not the new visual state machine.

Status: ❌ for visual/state rendering, 🟡 for underlying logic.

---

### Lesson exit confirmation / unfinished run restore

This area **does have direct component coverage**.

The test checks:

- wrong answer schedules a return;
- close button opens `Выйти из урока?`;
- `Выйти и сохранить` calls exit;
- remount restores `Пока не так`;
- retry notice remains;
- lesson position remains.

What is still missing:

- Android system Back using the same unfinished-run semantics;
- process death rather than React remount;
- force-stop/relaunch;
- typed/chips input restoration;
- practice activity restoration;
- sync completion overriding stale local run in an automated integration test.

Status: ✅ basic restore, 🟡 real-device/process cases.

---

### Sticky «Далее» in long feedback

No direct test references `.learn-feedback-next`.

Missing:

- long course explanation;
- expanded AI explanation;
- feedback sheet scroll;
- keyboard open;
- CTA still visible/reachable.

Status: ❌.

---

### Route utility cards

No direct test references `.course-map-reference`.

Existing E2E checks:

- route opens;
- station sheet opens;
- rail reaches current day;
- rail starts at first day.

It does **not** check:

- “Твой курс” and “Справочник” height parity;
- utility-card visual distinction from days;
- long copy wrapping;
- alignment at 320/360/390/412.

Status: 🟡.

---

### Dock blur

No test checks `backdrop-filter` or rendered blur.

Current screen-walk only checks layout overflow/runtime errors.

Missing visual snapshots over:

- white background;
- colored content;
- scrolled content;
- dark mode.

Status: ❌.

---

### Android status bar

Static native-shell coverage exists:

- edge-to-edge enabled;
- native status bar color is transparent;
- `viewport-fit=cover`.

This proves configuration, **not visual rendering**.

Missing:

- status-bar icon contrast;
- light/dark mode;
- Samsung/Pixel differences;
- no accidental web strip after actual WebView paint.

Status: ✅ configuration, ❌ rendered visual result.

---

### Two-tap choice confirmation

Current product behavior is:

```
first tap → select
second tap on selected option → confirm
```

The same principle is used in Lesson, Review and listening choices.

Older tests were written around previous interaction contracts and must be rechecked deliberately. Required regression assertions:

- first tap never grades or mutates SRS;
- second tap on the selected option grades exactly once;
- tapping another option changes selection instead of grading the previous one;
- restored unfinished Lesson preserves option order and selected state.

Status: 🟡 — implementation exists, dedicated contract coverage is incomplete.

---

## 33. Additional test-maintenance risk

The test suite currently mixes two styles:

1. semantic/dictionary-driven selectors:
   ```
   t['nav.me']
   ```
2. duplicated hardcoded product copy:
   ```
   'Я'
   'карточек ждут'
   '...без ограничений'
   ```

The second style causes false failures whenever copy changes without changing behavior.

Recommended audit rule for future tests:

- use role/state/semantic ids for behavior;
- use dictionary keys for localized navigation labels;
- hardcode literal copy only in tests whose purpose is explicitly copy verification.

This is especially important for:

- tab names;
- paywall copy;
- Review captions;
- result feedback;
- button labels whose interaction model may change.

---

## 34. Final audit-only test checklist

The following checks can be treated as the remaining audit backlog without touching product code:

### Can be automated in current browser/unit infrastructure

- [ ] partial-write fault injection;
- [ ] replay vs SRS;
- [ ] first/resume/replay summary contract;
- [ ] stale local run vs synced completion;
- [ ] partial Review source failure;
- [ ] unpublished-course Review discovery;
- [ ] Reset All with unknown old course id;
- [ ] offline write → reconnect → sync;
- [ ] course switch mid-run;
- [ ] course-switch save failure;
- [ ] analytics exactly-once completion;
- [ ] analytics first/resume/replay modes;
- [ ] notification settings write failure;
- [ ] required-update config unavailable;
- [ ] per-course statistics selector;
- [ ] segmented progress state classes;
- [ ] long feedback sticky CTA;
- [ ] 320/390/412 screen walk;
- [ ] RU/EN critical-route walk.

### Requires emulator/device-level validation

- [ ] Android status-bar icon contrast;
- [ ] actual dock blur;
- [ ] keyboard/IME with feedback sheet;
- [ ] process kill / force-stop lesson recovery;
- [ ] notification permission system dialog;
- [ ] actual local notification delivery/deep link;
- [ ] large OS font scaling;
- [ ] Android Back while exit confirmation is open.

### Requires explicit product contract before a useful test can be written

- [ ] whether replay changes SRS;
- [ ] exact meaning of “learning day” / streak;
- [ ] whether missing optional Review sources can block a review day;
- [ ] whether learned content from an unpublished course must remain reviewable;
- [ ] required-update behavior when update policy cannot be fetched;
- [ ] which statistics are global vs per-course;
- [ ] first-attempt metric across resume/replay.



---

## 35. Live QA reconciliation after implementation changes — 2026-10-01

Этот раздел актуализирует аудит после серии проверок на реальном Android/browser UI и последних правок. Он имеет приоритет над историческими формулировками выше, если они расходятся.

### 35.1. Исправлено и подтверждено по коду / production build

#### Feedback ошибочного ответа

Текущий RU copy:

- `Ответ неверный` вместо неоднозначного `Пока не так`;
- `Это задание вернётся в конце урока` расположено непосредственно под заголовком;
- retry notice теперь намеренно слабее заголовка: `11px`, line-height `1.2`, внутренний gap `1px`.

Layout больше не использует накопленный набор conflicting sticky overrides: состояния correct / wrong / expanded Why / Why error разделены явно.

#### Dock

Нижний dock — именно `Сегодня / Маршрут / Повтор / Профиль`.

После live QA найден старый CSS override с `backdrop-filter:none`, который отменял новые правила.

Он удалён. В production используется один canonical dock rule:

- fixed;
- semi-transparent background;
- `backdrop-filter`;
- `-webkit-backdrop-filter`;
- высокий z-index.

На реальном устройстве blur после этого появился и подтверждён live QA. Этот пункт считается закрытым по текущей реализации, но screenshot regression всё ещё полезен.

#### Sheets поверх dock

После повышения dock z-index generic sheets оказывались под ним.

Исправлено: sheet/dictionary overlay поднимаются выше dock.

Нужно сохранить regression test на stacking order.

#### Основные screen headers / spacing

Today и Profile переведены на общий `ScreenHeader`.

Выявлена отдельная ошибка: одинаковый header ещё не гарантировал одинаковый gap до первого блока. После этого введён единый screen-level gap и убраны конкурирующие page-specific header margins.

Route также отделяет:

- общий gap: title → первый utility block;
- 12 px: `Твой курс → Справочник → Темы курса`;
- существующий меньший gap между самими темами/stages.

#### Route entry / current day

Удалён автоматический `scrollIntoView` при обычном входе на Route: вкладка теперь должна открываться сверху.

Добавлена отдельная вторичная команда:

> Темы курса         Текущий день

По нажатию current stage раскрывается и выполняется explicit scroll к текущей station.

Автотест этого scroll contract пока отсутствует.

#### Skeleton loading

Fullscreen loaders заменены на skeleton layouts как минимум для:

- Route;
- Profile / Progress.

Нужно visual regression на loading → ready, чтобы layout shift не возвращался.

#### Profile statistics course

Контракт после правки:

- default = active course приложения;
- ручной выбор статистики не меняет active course;
- ручной override живёт только в текущей app session;
- после нового запуска снова подхватывается active course.

Dedicated regression coverage пока нужна.

#### LessonRun → Plus → return

Найден реальный баг:

```
урок
→ Почему?
→ free allowance exhausted
→ Plus
→ покупка
→ возврат
→ урок начинался с первого задания
```

Причины:

1. возврат зависел от browser history;
2. local snapshot валидировался слишком строго по старому step signature;
3. refresh entitlement/content мог изменить runtime state во время remount.

Исправлено:

- Plus получает explicit lesson return URL;
- возврат идёт с `resume=1`;
- snapshot remap выполняется по activity ids;
- изменение/reorder content больше не обязано уничтожать run.

Нужен отдельный automated integration test именно на этот полный сценарий.

#### Choice safety + shuffle

Lesson и Review choice:

- первый tap только выбирает;
- второй tap подтверждает;
- случайное одиночное нажатие не должно grade-ить ответ.

Listening choice также приведён к double-tap подтверждению.

Порядок вариантов перемешивается.

Lesson хранит `shuffleSeed` в persisted LessonRunSnapshot, поэтому незавершённый урок не должен менять расположение после восстановления.

Sentence-builder chips также строятся с run-specific seed.

Открытый вопрос: Review seed пока живёт в component session и не сохраняется как часть persistent review session. После полного выхода/возврата расположение choice может измениться.

#### Speed drill

Найдены два hardcoded UI/engine расхождения:

- UI говорил «5 секунд», а speaking window действительно был фиксирован на 5000 ms;
- UI говорил «7 из 10», хотя activity может содержать другое количество фраз.

Исправлено локально в practice engine — переработка курса не потребовалась.

Теперь:

- speaking time зависит от длины английского ответа;
- диапазон ограничен разумным min/max;
- pass rule остаётся 70%;
- required count вычисляется как `ceil(total * 0.7)`;
- intro получает фактические `needed` и `count`;
- то же hardcoded `7 из 10` убрано из listening copy.

Для 3 фраз 70% означает минимум 3/3; для 6 — 5/6; для 10 — 7/10.

Добавлен unit test на dynamic drill timing.

#### Speed compare UI

`Совпало` и `Не совпало` теперь являются одной бинарной развилкой и находятся в одной строке двумя равными кнопками.

Смешанный RU/EN explanation в A1 исправлен.

Первый content release после изменения был заблокирован lexical coverage новым английским словом. Copy переписан на уже покрытую лексику, после чего workflow выпуска курса завершился успешно.

---

### 35.2. Новые / оставшиеся P0–P1 после повторного прохода

#### P1. «Выйти без сохранения» не откатывает уже persisted progress

Текущая реализация:

```
clear LessonRunSnapshot
→ exit
```

Но graded answers, seen/SRS и часть stats пишутся сразу по ходу урока.

Следовательно пользовательское ожидание:

> выйти без сохранения = отменить текущий прогресс

не соответствует реальности.

Нужно принять один контракт:

1. **Discard run only** — переименовать действие так, чтобы не обещать rollback;
2. **True discard** — отложить writes / иметь reversible run transaction;
3. **Hybrid** — уже засчитанное остаётся, но незавершённая позиция не восстанавливается; это нужно явно объяснить.

До решения статус: **P1 semantic/data contract**.

#### P1. Partial-write / double grading остаётся главным data-risk

Исправления UI и LessonRun не устранили базовую проблему:

```
course/SRS write succeeds
stats write fails
→ UI sees failure
→ retry can grade same physical answer again
```

Это всё ещё один из первых P0/P1 технических тестов.

#### P1. Replay vs Review SRS contract всё ещё не закрыт

Persisted LessonRun улучшает resume, но не вводит полноценный first/resume/replay mode во всех writes.

Повтор завершённого урока всё ещё требует явного contract test на:

- card SRS;
- practice SRS;
- stats;
- completion analytics.

#### P1. Summary semantics всё ещё требуют formal run mode

Resume persistence стала сильнее, но исходная проблема «что именно означает first attempt после resume/replay» не считается закрытой до явной модели и тестов.

#### P1. Review shuffle persistence

Lesson shuffle устойчив к resume благодаря `shuffleSeed`.

Review использует session seed в React state. Полный remount/reopen может дать новый порядок вариантов.

Нужно решить:

- новый порядок при каждой review session допустим;
- или pinned review session должен сохранять order/seed.

#### P1. Test-suite drift остаётся release risk

Во время повторной проверки общий AppBase check сначала падал на двух новых TypeScript-регрессиях:

- dynamic drill timing test использовал `drillSayMs` без импорта;
- Review choice shuffle потерял TypeScript narrowing внутри callback.

Обе compile-регрессии уже исправлены.

После этого typecheck проходит дальше, но общий AppBase consistency на актуальном проходе всё ещё красный: **11 unit-тестов в 5 файлах** не соответствуют текущему продукту.

Среди фактических failures:

- старый hardcoded copy «Три бесплатных разбора использованы»;
- старый dialogue copy «Так и есть»;
- старые Lesson expectations вокруг двухкликового choice и retry notice;
- replay test всё ещё ожидает старую последовательность кнопок;
- listening test не учитывает новое подтверждение выбора;
- Progress tests ожидают старую структуру/заголовки статистики.

При этом `UnMute — production readiness` на текущих коммитах зелёный. Это важный сигнал:

> Vercel/production build READY не означает, что весь продуктовый test gate зелёный.

Release gate должен включать как минимум typecheck + unit + smoke + build + критичный browser flow.

#### P1. Content release — отдельный обязательный gate

Изменение code-owned курса может успешно попасть в Vercel, но не попасть в live content DB.

Фактический пример из этого прохода:

```
Vercel READY
content release → 409 lexical_coverage_incomplete
```

Поэтому для изменений в code-owned course copy/content Definition of Done должен включать:

- app build;
- lexical coverage;
- content release workflow success;
- опубликованную revision.

---

### 35.3. Новые regression tests после live QA

Добавить к 2J:

- [ ] wrong feedback: correct и wrong header alignment отдельно;
- [ ] retry notice visual hierarchy: smaller + directly under wrong title;
- [ ] Why collapsed: two buttons in one row;
- [ ] Why expanded: explanation immediately follows body, Next has 12 px gap and full width;
- [ ] Why exhausted/error/Plus: no horizontal overflow, Next stays inside sheet;
- [ ] correct feedback: Next is full width;
- [ ] lesson choice: first tap selects only, second grades exactly once;
- [ ] review choice: same double-tap contract;
- [ ] listening choice: same double-tap contract;
- [ ] shuffled options differ between new runs but remain stable during restored Lesson run;
- [ ] sentence chips are shuffled and stable for restored Lesson run;
- [ ] exit: save vs discard-run semantics;
- [ ] Plus purchase from Answer Explain returns to exact activity/feedback state;
- [ ] dynamic drill timing short / medium / long phrase;
- [ ] pass copy uses actual item count;
- [ ] speed compare buttons remain two columns at 320–412 px;
- [ ] Route opens at top;
- [ ] Route «Текущий день» scrolls to current station;
- [ ] Sheet always stacks over dock;
- [ ] Profile statistics default/temporary override lifecycle;
- [ ] Route/Profile skeleton → ready without large layout shift;
- [ ] code-course change cannot be considered shipped until content release is green.

---

### 35.4. Текущий короткий приоритет после актуализации

1. Partial-write idempotency / double SRS.
2. Explicit first / resume / replay mode.
3. Replay vs Review write contract.
4. «Выйти без сохранения» semantics.
5. Plus-return full integration regression.
6. Review partial-source completeness.
7. Removed/unpublished learned course discovery.
8. Analytics exactly-once + mode.
9. Synchronize stale automated tests with current UI contracts.
10. Device/visual matrix: 320/360/390/412, keyboard, sheets, dock, status bar.


### 35.5. Фактический CI после последних правок

Последний проверенный общий AppBase run после исправления двух typecheck-регрессий дошёл до unit tests.

Результат:

```
Test Files: 5 failed | 59 passed
Tests:      11 failed | 257 passed
```

То есть typecheck-блокирующие ошибки `drillSayMs` import и Review choice narrowing уже устранены, но suite всё ещё **не green**.

Текущие failures:

1. `answer-explanation.test.tsx` — ждёт старый hardcoded copy «Три бесплатных разбора использованы».
2. `dialogue.test.tsx` ×2 — ждёт старый текст «Так и есть».
3. `learn.test.tsx` basic flow — старые ожидания interaction/save после изменения choice/chips contract.
4. `learn.test.tsx` wrong-return — literal matcher не совпадает с текущей retry notice.
5. `learn.test.tsx` restore unfinished run — та же copy/structure drift.
6. `learn.test.tsx` completed-node replay — старый сценарий не учитывает текущий two-tap flow и не находит `Далее`.
7. `pattern-listening.test.tsx` — старый one-tap сценарий больше не доходит до target result.
8. `progress-screen.test.tsx` summary — expected summary shape устарела после переработки статистики.
9. `progress-screen.test.tsx` empty state — ждёт старый heading `Прогресс`.
10. `progress-screen.test.tsx` populated state — ждёт старый текст `ответов`.

Итого 11 test cases.

Предварительная классификация:

- **явно stale expectations:** AI free copy, Dialogue copy, Progress title/copy, часть choice/listening flows;
- **нужно перепроверить как behavior regression, а не автоматически переписывать test:** basic Learn save assertion, restore/replay flows, Progress summary semantics.

Правило для следующего test-sync pass:

> сначала подтвердить текущий продуктовый контракт, потом менять expectation; не делать suite green удалением полезных assertions.

### 35.6. Что после повторного прохода считается забытым

Кроме крупных P0/P1 выше, не потерять следующие меньшие, но реальные хвосты:

- dedicated test для `Route → Текущий день`;
- skeleton loading visual/state tests;
- Profile temporary statistics-course selection lifecycle;
- Sheet-over-dock stacking regression;
- Review shuffle order across full remount;
- process-kill recovery LessonRun;
- full Plus purchase → exact feedback/activity resume test;
- 320/360/390/412 feedback layout, особенно expanded Why / Plus error;
- RU/EN semantic copy pass после большого числа RU правок;
- code-owned content release как отдельный release gate, а не только Vercel build.




---

## 36. Re-audit current main after live fixes — 2026-10-01

Этот проход сделан уже после последних live-правок Route / Profile / feedback / Plus return / practice.

Статусы ниже имеют приоритет над более ранними историческими описаниями.

### 36.1. Закрыто или существенно улучшено

| Область | Статус | Что подтверждено |
|---|---:|---|
| Wrong feedback copy | ✅ | RU: `Ответ неверный`; retry notice под заголовком, визуально вторичный |
| Feedback layout | ✅/🟡 | correct/wrong/Why/Why-error разделены; device QA ещё нужен на 320 px + keyboard |
| Dock blur | ✅ | live QA подтвердил реальный backdrop blur |
| Sheet vs dock stacking | ✅ | sheet/dictionary layer выше dock |
| Route entry scroll | ✅ | обычный вход больше не auto-scroll к current |
| Route current-day action | ✅/🟡 | отдельная кнопка есть; regression test отсутствует |
| Route/Profile loading | ✅/🟡 | fullscreen loader заменён skeleton; visual layout-shift test отсутствует |
| Profile stats default course | ✅/🟡 | default = active course; manual override только app session |
| Lesson unfinished run | ✅/🟡 | LessonRunSnapshot сохраняет позицию/feedback/shuffle; process-kill test ещё нужен |
| Plus purchase return | ✅/🟡 | explicit return + `resume=1` + activity-id remap; полного integration test пока нет |
| Choice accidental tap protection | ✅/🟡 | two-tap в Lesson/Review/listening; dedicated contract tests не синхронизированы |
| Choice/chips random order | ✅/🟡 | Lesson seed сохраняется при resume; Review seed не persisted |
| Speed drill timing | ✅ | speaking window зависит от длины английского ответа |
| Speed drill threshold copy | ✅ | `needed = ceil(total * 0.7)`, больше нет ложного `7 из 10` |
| Speed compare actions | ✅ | `Совпало / Не совпало` одной строкой |
| A1 mixed-language explanation | ✅ | code copy исправлен; content-release после lexical fix прошёл |

### 36.2. Главные функциональные проблемы всё ещё открыты

#### P0/P1 — first / resume / replay по-прежнему не являются полноценной state model

`LessonRunSnapshot` сильно улучшил resume, но это всё ещё snapshot UI-run, а не формальный бизнес-режим.

В коде нет единого persisted/derived:

```
first
resume
replay
review
```

Следствия остаются:

- summary продолжает использовать `learn.summaryScore = "С первого раза верно..."`;
- replay завершённого урока не имеет отдельного текста результата;
- writes не знают, что это replay;
- analytics не получает run mode.

Статус: **P1, не закрыто**.

#### P0/P1 — replay всё ещё может менять SRS и stats

`saveGradedActivity` и `savePracticeActivity` не получают run mode.

Они по-прежнему вызывают:

```
gradeCourseCard(...)
gradeCoursePractice(...)
recordAnswer(...)
```

независимо от того, это первое прохождение, resume или replay.

Статус: **P0/P1 data semantics, не закрыто**.

#### P0/P1 — partial write остаётся неатомарным

Для graded/practice:

```
writeCourseProgress(...)
→ writeStatsProgress(...)
```

Если первый write прошёл, а второй упал, повтор пользовательского действия способен повторно изменить SRS.

Комментарий в коде правильно приоритизирует learner-critical course progress, но idempotency операции не решает.

Нужен operation/run key либо транзакционный/idempotent слой.

Статус: **P0/P1**.

#### P1 — firstPendingActivityIndex всё ещё смотрит только на seen

Функция ищет первый activity без `progress.seen`.

Она не использует полный completion contract practice requirements.

`missingForNode()` знает о недостающих practice modes, но применяется позднее, после finish.

Следствие: в некоторых incomplete-node сценариях resume способен стартовать не с фактически недостающего requirement.

Статус: **P1**.

#### P1 — onboarding persistence failure всё ещё проглатывается

В `OnboardingGate.finish()`:

```
try {
  chooseCourse(...)
  patchSettings(...)
  ...
} catch {}
setLocalDone(true)
```

UI способен закончить onboarding, даже если course/settings persistence не подтвердились.

Отдельный background sync-path также проглатывает `patchSettings` error.

Статус: **P1**.

#### P1 — Review может молча потерять другой изученный курс

`useOtherCourseReviews()` оборачивает каждый course load в:

```
try { ... } catch {}
```

Если studied course не загрузился / удалён из catalog / временно недоступен, он просто исчезает из агрегированной review queue.

Это всё ещё позволяет ложный UX:

> всё повторено

при неполных источниках.

Статус: **P1**.

#### P1 — analytics completion остаётся UI-transition based

`lesson_completed` / `day_completed` вызываются через `onNodeCompleted` после `finished && nodeComplete`.

Нет durable outbox / transition event, который гарантирует exactly-once при:

- app kill после последнего save;
- refresh failure;
- remount;
- offline completion.

События также не имеют first/resume/replay context.

Статус: **P1**.

#### P1 — общая answer accuracy всё ещё смешивает разные единицы

`buildProgressSummary()` продолжает брать единый `summarizeAnswerStats(stats)`.

При этом graded activity и whole practice session имеют разную гранулярность записи.

UI Profile стал понятнее визуально, но data semantics общей accuracy этим не исправлены.

Статус: **P1**.

#### P1 — «Выйти без сохранения» остаётся семантически опасным

Действие удаляет только локальный `LessonRunSnapshot`.

Уже выполненные:

- graded writes;
- seen;
- SRS;
- stats;

не откатываются.

Следовательно это не настоящий transaction rollback.

До product decision текст/контракт требует особого внимания.

Статус: **P1**.

### 36.3. Новые риски, найденные после последних UI-правок

#### CI сейчас не зелёный

Последний просмотр workflow показал:

- `UnMute — production readiness`: success;
- `AppBase — all apps consistency`: failure;
- 59 test files passed / 5 failed;
- 257 tests passed / 11 failed.

То есть приложение собирается, но test suite сейчас не является зелёным release gate.

Текущие failures в основном соответствуют UI/copy drift, однако один только факт «это старый тест» нельзя принимать без разбора каждого assertion.

До release каждый из 11 failures должен быть классифицирован:

```
stale expectation
или
real product regression
```

и закрыт.

#### Review two-tap пока был источником compile-регрессии

Недавний shuffle/two-tap change уже породил TypeScript narrowing regression, который был найден CI и исправлен отдельным коммитом.

Это аргумент в пользу отдельного test contract для choice, а не дальнейших локальных DOM-правок.

#### Practice timer visual animation может не отражать dynamic sayMs

Engine speaking window теперь динамический.

Нужно отдельно проверить CSS animation `.drill-timer[data-stage="speaking"]`: если её duration остаётся фиксированной, визуальная полоска и реальный deadline могут расходиться.

Это новый **P1 UX/behavior consistency check**.

#### Content code ≠ live content

A1 copy change показал, что app deploy и course publish — независимые gates.

Любое изменение `lib/*course*.mjs` должно проверяться не только Vercel, но и workflow выпуска контента.

### 36.4. Что проверить следующим аудитом в первую очередь

1. **Dynamic drill timer UI** — совпадает ли animation duration с реальным `drillSayMs(answer)`.
2. **Все 11 failing unit tests** — классифицировать stale vs real regression.
3. **Replay SRS test** — фактически доказать, меняет ли replay due/box сейчас.
4. **Partial-write fault injection** — course write success + stats write fail + retry.
5. **firstPending vs missing requirements** — practice incomplete, seen already true.
6. **Onboarding save failure** — UI не должен ложно завершаться.
7. **Other-course Review load failure** — нельзя показывать false all-clear.
8. **Plus return full flow** — exhausted Why → purchase → exact feedback/activity restored.
9. **Exit discard semantics** — принять продуктовый контракт.
10. **Analytics durability/mode** — exactly-once completion + first/resume/replay.

### 36.5. Обновлённый release gate

До того как считать текущую ветку готовой к оплате/stores:

- [ ] AppBase consistency green;
- [ ] UnMute production readiness green;
- [ ] UnMute E2E green;
- [ ] content-release green для code-owned content changes;
- [ ] 0 unexplained unit failures;
- [ ] replay/SRS contract тест;
- [ ] partial-write test;
- [ ] Plus-return regression;
- [ ] 320/360/390/412 critical screen walk;
- [ ] keyboard + long feedback;
- [ ] process kill restore;
- [x] dock blur live-device check;
- [x] sheet above dock live QA;
- [x] Route entry stays at top;
- [x] explicit current-day jump exists.


---

## 37. Review load / daily budget audit — 2026-10-01

Этот проход проверяет не качество отдельных SRS-интервалов, а сколько работы реально может попасть пользователю в «Повтор» за день и за одну сессию.

### 37.1. Что ограничено сейчас

Текущие локальные caps:

```
cards:      30 на курс
drill:       3 на курс
listening:   2 на курс
speaking:    2 на курс
words:      20 глобально
```

То есть один курс способен дать:

```
30 cards + 7 practice = 37
```

и вместе с личными словами уже до:

```
57 элементов
```

за один сформированный review batch.

### 37.2. Главная проблема: caps применяются по курсам, а очередь потом склеивается

Для active course строится отдельный `buildCourseReviewSession()`.

Для каждого другого изученного курса строится ещё один отдельный `buildCourseReviewSession()`.

После этого:

```
active items
+ other course 1 items
+ other course 2 items
+ ...
+ words
```

просто объединяются в одну queue.

Следовательно общий cap отсутствует.

Пример:

```
3 изученных курса
→ до 37 × 3 + 20 words
→ до 131 actionable item
```

Это уже противоречит цели «Повтор» как короткой ежедневной привычки.

Статус: **P1 product/load contract**.

### 37.3. Неправильная карточка может бесконечно расти внутри одной сессии

Текущий card flow:

```
wrong
→ setQueue([...queue, sameItem])
→ item появляется снова в конце
```

Если пользователь снова ошибается:

```
wrong
→ тот же item снова append
```

Отдельного max-return counter у Review cards нет.

В Lesson такой limiter уже есть:

```
MAX_RETURNS = 1
```

а в Review аналогичной защиты нет.

Следовательно одна трудная карточка теоретически может сделать текущую review session бесконечной.

Статус: **P0/P1 UX loop**.

### 37.4. Practice / Words могут возвращаться снова в тот же день через новый запуск Review

Для failed SRS:

- card box сбрасывается в `0`, interval = `0`;
- practice box сбрасывается в `0`, interval = `0`;
- word box сбрасывается в `0`, interval = `0`.

Следовательно:

```
due = today
```

Текущая pinned session может считать item завершённым, но новый запуск Review в тот же календарный день снова увидит его due.

Это означает, что session cap не является daily cap.

### 37.5. Рекомендуемый контракт

Нужны два разных ограничения.

#### A. Global daily budget

Один бюджет на пользователя, а не отдельный cap на каждый курс.

Безопасная продуктовая модель:

```
REVIEW_DAILY_NEW_ITEM_BUDGET = 30
```

Под «item» понимается уникальная единица первого показа сегодня:

- card;
- word;
- drill session;
- listening session;
- speaking session.

Ошибочный возврат того же item внутри текущей сессии не расходует новый слот бюджета.

Оставшийся backlog не исчезает:

```
actionable today: 30
waiting/backlog: N
```

На следующий день старые overdue элементы имеют приоритет.

Число 30 — предлагаемая стартовая величина, его можно вынести в product config.

#### B. Same-session retry cap

Для обычной card:

```
first miss
→ вернуть один раз в конец текущей сессии

second miss
→ закончить item на сегодня
→ SRS остаётся due/weak
→ не зацикливать текущую сессию
```

То есть аналогично Lesson:

```
MAX_RETURNS_PER_REVIEW_ITEM = 1
```

Для practice внутренние retry уже ограничиваются самим activity flow; поверх него повторно добавлять activity в текущую review queue не нужно.

Для personal word:

- одна self-grade попытка в текущей pinned session;
- `forgot` сохраняет weak/due state;
- слово не должно автоматически появляться второй раз в той же сессии.

### 37.6. Как формировать общий batch

Не делать:

```
30 cards course A
+ 30 cards course B
+ ...
```

Вместо этого сначала собрать все due candidates с metadata:

```
{
  key,
  kind,
  courseId?,
  due,
  sourceOrder
}
```

Затем сформировать **один** pinned daily batch.

Приоритет:

1. самое overdue;
2. затем due today;
3. не давать одному курсу полностью вытеснить остальные;
4. mixed types interleave, чтобы 30 одинаковых карточек подряд не превращали Review в монотонный тест.

Минимальная справедливая стратегия:

- round-robin между courses;
- внутри course — oldest due first;
- practice/words периодически вставлять между cards.

### 37.7. Daily budget должен быть persisted

Обычного React state недостаточно.

Иначе:

```
закрыл приложение
→ открыл снова
→ получил ещё 30
```

Нужен persisted daily review record, например:

```
review-day:YYYY-MM-DD
{
  selectedItemKeys: [...],
  completedItemKeys: [...],
  retryCounts: {...}
}
```

или эквивалентная структура в learner progress.

Это одновременно решит:

- стабильную очередь после process kill;
- дневной budget;
- retry cap;
- стабильный order;
- корректный счётчик Today/таббара;
- возможность продолжить незавершённый Review.

### 37.8. Что должны показывать Today / badge

Нельзя показывать весь backlog как обязательную работу сегодня.

Нужно различать:

```
Сегодня: 30
Ещё в очереди: 84
```

или более мягко:

```
К повтору сегодня: 30
Остальное распределим дальше
```

Badge в dock должен отражать **сегодняшний actionable batch**, а не весь accumulated debt.

### 37.9. Обязательные regression tests

- [ ] один курс с 100 due cards → today batch не превышает global budget;
- [ ] три курса с 100 due каждый → всё равно один global budget;
- [ ] words + cards + practice вместе не превышают budget;
- [ ] oldest overdue получает приоритет;
- [ ] второй курс не starvation;
- [ ] wrong card возвращается максимум один раз в текущей session;
- [ ] повторная ошибка не увеличивает queue бесконечно;
- [ ] app restart в тот же день восстанавливает тот же daily batch;
- [ ] новый запуск Review не выдаёт ещё один полный daily budget;
- [ ] tomorrow создаёт новый budget;
- [ ] waiting/backlog считается отдельно от today's batch;
- [ ] badge/Today показывают today batch, а не весь debt.

### 37.10. Вывод

Текущие caps полезны как локальная защита, но не решают проблему нагрузки.

Нужна модель:

```
global daily budget
+ persisted pinned daily batch
+ one same-session retry
+ backlog carried forward
```

Это следует реализовать до активного масштабирования количества курсов и пользовательского словаря.
