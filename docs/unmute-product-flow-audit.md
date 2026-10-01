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
