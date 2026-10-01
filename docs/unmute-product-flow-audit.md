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
