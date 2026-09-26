/* Стартовое наполнение каталога.

   Раньше эти программы были вшиты в index.html и ехали в загрузке к каждому
   человеку, хотя нужны ровно один раз — чтобы каталогу было чем открыться. Теперь
   они лежат здесь и заливаются в базу одним действием из админки.

   Это ТЕСТОВЫЕ данные. Когда появятся настоящие программы, файл можно удалить
   целиком — на работу приложения он не влияет. */

const SEED_TRAINERS = {
  "@lena.doma": {
    "name": "Лена",
    "photo": "",
    "about": "Тренер по домашнему фитнесу, 8 лет практики. Веду группы для тех, у кого дома нет ничего, кроме коврика и стула. Люблю тихие тренировки: у самой соседи снизу."
  },
  "@katya.hiit": {
    "name": "Катя",
    "photo": "",
    "about": "Специализируюсь на коротких интервальных тренировках. Считаю, что пятнадцать честных минут работают лучше часа вполсилы."
  },
  "@marina.core": {
    "name": "Марина",
    "photo": "",
    "about": "Работаю с мышцами центра и осанкой. Пришла в фитнес после того, как сама вылезла из проблем со спиной за письменным столом."
  },
  "@nastya.glutes": {
    "name": "Настя",
    "photo": "",
    "about": "Ягодицы и ноги без штанги и абонемента. Половина моих учениц занимается в комнате два на три метра — и у них получается."
  },
  "@olga.pilates": {
    "name": "Оля",
    "photo": "",
    "about": "Пилатес и дыхание. Медленно, осознанно и без единого прыжка."
  }
};

const SEED_ITEMS = [
  {
    "id": "slim-tiho",
    "by": "@lena.doma",
    "cat": "cardio",
    "level": "Новичок",
    "min": 18,
    "name": "Кардио без прыжков",
    "gives": "Три круга без единого прыжка: приседания, скалолаз и ходьба с высоким коленом. Пульс высокий, соседи снизу ничего не слышат.",
    "text": "ПРОГРАММА: Кардио без прыжков\nДНИ: Пн, Ср, Пт\nКРУГИ: 3\nОТДЫХ МЕЖДУ КРУГАМИ: 60\nПРОГРЕССИЯ: 4\n\nУПРАЖНЕНИЕ: Приседания с подъёмом на носки\nОПИСАНИЕ: Встань, стопы на ширине таза, носки чуть в стороны. Уходи тазом назад и вниз, колени идут по направлению носков, спина прямая. Из нижней точки поднимись и в конце встань на носки, задержись на секунду. Опускайся медленно, вниз на два счёта, вверх на один.\nМЫШЦЫ: Ягодицы, Квадрицепс, Икры\nОШИБКИ: Колени заваливаются внутрь — разводи их в стороны усилием ягодиц.\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 15-18\nПОДХОДЫ: 3\nОТДЫХ: 40\nУСЛОЖНЯТЬ: да\nШАГ: 1\nПОТОЛОК: 25\nЗАМЕНА: Приседания с выпрыгиванием на носки\nОПИСАНИЕ ЗАМЕНЫ: То же приседание, но из нижней точки мягко выталкивайся вверх на носки, отрывая пятки. Приземляйся беззвучно, сначала на носок, потом опускай пятку.\n\nУПРАЖНЕНИЕ: Скалолаз\nОПИСАНИЕ: Прими упор лёжа, ладони под плечами, тело прямое от макушки до пят. Поочерёдно подтягивай колено к груди, таз держи низко и не подбрасывай его вверх. Дыши ровно, темп средний, а не на износ.\nМЫШЦЫ: Пресс, Плечи, Квадрицепс\nОШИБКИ: Таз уезжает вверх — упражнение превращается в отдых, следи за прямой линией тела.\nФОРМАТ: время\nЗНАЧЕНИЕ: 40\nПОДХОДЫ: 3\nОТДЫХ: 40\nУСЛОЖНЯТЬ: да\nШАГ: 5\nПОТОЛОК: 70\n\nУПРАЖНЕНИЕ: Ходьба с высоким коленом\nОПИСАНИЕ: Иди на месте, поднимая колено до уровня таза, и тянись противоположной рукой вперёд. Держи живот подтянутым, спину прямой. Чем выше колено, тем сильнее работает пресс.\nМЫШЦЫ: Пресс, Квадрицепс, Икры\nФОРМАТ: время\nЗНАЧЕНИЕ: 60\nПОДХОДЫ: 2\nОТДЫХ: 30\nУСЛОЖНЯТЬ: да\nШАГ: 10\nПОТОЛОК: 120\n",
    "exCount": 3
  },
  {
    "id": "slim-tabata",
    "by": "@katya.hiit",
    "cat": "slim",
    "level": "Средний",
    "min": 15,
    "name": "Экспресс 15 минут",
    "gives": "Короткая и честно тяжёлая: четыре круга подряд — «звезда», берпи и планка, с паузой в 45 секунд между кругами.",
    "text": "ПРОГРАММА: Экспресс 15 минут\nДНИ: Вт, Чт, Сб\nКРУГИ: 4\nОТДЫХ МЕЖДУ КРУГАМИ: 45\nПРОГРЕССИЯ: 4\n\nУПРАЖНЕНИЕ: Прыжки «звезда»\nОПИСАНИЕ: Стой прямо, руки вдоль тела. В прыжке разведи ноги шире плеч и подними руки над головой, вернись обратно. Приземляйся на носок с мягким коленом, а не на прямую ногу. Держи ровный темп, дыши через нос.\nМЫШЦЫ: Плечи, Икры, Квадрицепс\nОШИБКИ: Жёсткое приземление на пятки бьёт по коленям — приземляйся мягко, через носок.\nФОРМАТ: время\nЗНАЧЕНИЕ: 30\nПОДХОДЫ: 1\nОТДЫХ: 20\nУСЛОЖНЯТЬ: да\nШАГ: 5\nПОТОЛОК: 60\n\nУПРАЖНЕНИЕ: Берпи без отжимания\nОПИСАНИЕ: Из положения стоя присядь, поставь ладони на пол, отпрыгни ногами назад в планку. Собери ноги обратно и встань, вытянувшись вверх. Спину держи прямой, в планке не проваливай поясницу.\nМЫШЦЫ: Грудь, Пресс, Квадрицепс\nОШИБКИ: Провал поясницы в планке — подкрути таз и напряги пресс.\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 8-10\nПОДХОДЫ: 1\nОТДЫХ: 30\nУСЛОЖНЯТЬ: да\nШАГ: 1\nПОТОЛОК: 16\nЗАМЕНА: Берпи с отжиманием\nОПИСАНИЕ ЗАМЕНЫ: Тот же берпи, но в планке добавь одно отжимание: опустись грудью к полу, локти под 45 градусов, и выжми себя обратно.\n\nУПРАЖНЕНИЕ: Планка\nОПИСАНИЕ: Обопрись на предплечья, локти строго под плечами. Тело прямое от макушки до пят, ягодицы сжаты, живот подтянут. Дыши ровно и не задерживай дыхание.\nМЫШЦЫ: Пресс, Плечи, Спина\nОШИБКИ: Таз вверх или поясница вниз — обе ошибки снимают нагрузку с пресса.\nФОРМАТ: время\nЗНАЧЕНИЕ: 40\nПОДХОДЫ: 1\nОТДЫХ: 30\nУСЛОЖНЯТЬ: да\nШАГ: 5\nПОТОЛОК: 90\n",
    "exCount": 3
  },
  {
    "id": "core-flat",
    "by": "@marina.core",
    "cat": "core",
    "level": "Новичок",
    "min": 12,
    "name": "Мышцы центра за 12 минут",
    "gives": "Скручивания, планка на локтях и боковая планка: работа на глубокие мышцы живота, которые держат корпус.",
    "text": "ПРОГРАММА: Мышцы центра за 12 минут\nДНИ: Пн, Ср, Пт\nКРУГИ: 3\nОТДЫХ МЕЖДУ КРУГАМИ: 45\nПРОГРЕССИЯ: 4\n\nУПРАЖНЕНИЕ: Скручивания\nОПИСАНИЕ: Ляг на спину, колени согнуты, стопы на полу, ладони у висков без давления на шею. Отрывай лопатки от пола за счёт живота, поясница остаётся прижатой. Вверх на выдохе, вниз медленно на вдохе.\nМЫШЦЫ: Пресс\nОШИБКИ: Тянешь голову руками — шея заболит раньше, чем пресс устанет.\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 15-20\nПОДХОДЫ: 3\nОТДЫХ: 30\nУСЛОЖНЯТЬ: да\nШАГ: 2\nПОТОЛОК: 30\n\nУПРАЖНЕНИЕ: Планка на локтях\nОПИСАНИЕ: Локти под плечами, тело прямое от макушки до пят. Сожми ягодицы, подкрути таз, напряги живот. Смотри в пол чуть впереди ладоней, шея — продолжение позвоночника.\nМЫШЦЫ: Пресс, Плечи, Спина\nОШИБКИ: Задержка дыхания — дыши ровно, иначе не выстоишь и половины.\nФОРМАТ: время\nЗНАЧЕНИЕ: 35\nПОДХОДЫ: 3\nОТДЫХ: 40\nУСЛОЖНЯТЬ: да\nШАГ: 5\nПОТОЛОК: 90\nЗАМЕНА: Планка с подъёмом ноги\nОПИСАНИЕ ЗАМЕНЫ: В той же планке медленно подними прямую ногу на высоту таза, задержи на две секунды и опусти. Таз не разворачивай, он остаётся ровным.\n\nУПРАЖНЕНИЕ: Боковая планка\nОПИСАНИЕ: Ляг на бок, локоть под плечом, стопы одна на другой. Подними таз так, чтобы тело стало прямой линией. Свободную руку положи на пояс или вытяни вверх.\nМЫШЦЫ: Пресс, Плечи\nОШИБКИ: Таз проседает вниз — держи его на одной линии с плечами и стопами.\nФОРМАТ: время\nЗНАЧЕНИЕ: 25\nПОДХОДЫ: 2\nСТОРОНА: да\nОТДЫХ: 30\nУСЛОЖНЯТЬ: да\nШАГ: 5\nПОТОЛОК: 60\n",
    "exCount": 3
  },
  {
    "id": "core-waist",
    "by": "@olga.pilates",
    "cat": "core",
    "level": "Средний",
    "min": 16,
    "name": "Талия и косые мышцы",
    "gives": "Русский поворот, «велосипед» и боковая планка — нагрузка на косые мышцы живота, а не только на прямую.",
    "text": "ПРОГРАММА: Талия и косые мышцы\nДНИ: Вт, Чт\nКРУГИ: 3\nОТДЫХ МЕЖДУ КРУГАМИ: 60\nПРОГРЕССИЯ: 4\n\nУПРАЖНЕНИЕ: Русский поворот\nОПИСАНИЕ: Сядь, колени согнуты, стопы можно оторвать от пола. Отклонись назад до угла примерно 45 градусов, спина прямая. Поворачивай корпус вправо и влево, ведя за собой руки, — работает талия, а не только плечи.\nМЫШЦЫ: Пресс, Спина\nОШИБКИ: Круглая спина — держи грудь раскрытой, поворот идёт от рёбер.\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 20-24\nПОДХОДЫ: 3\nОТДЫХ: 40\nУСЛОЖНЯТЬ: да\nШАГ: 2\nПОТОЛОК: 36\n\nУПРАЖНЕНИЕ: Велосипед\nОПИСАНИЕ: Ляг на спину, руки у висков. Тяни правый локоть к левому колену, вторая нога вытянута над полом. Меняй стороны плавно, без рывков, поясница прижата к полу.\nМЫШЦЫ: Пресс\nОШИБКИ: Рывками дёргаешь шею — веди движение животом, локоть идёт следом.\nФОРМАТ: время\nЗНАЧЕНИЕ: 40\nПОДХОДЫ: 3\nОТДЫХ: 40\nУСЛОЖНЯТЬ: да\nШАГ: 5\nПОТОЛОК: 80\n\nУПРАЖНЕНИЕ: Боковая планка с опусканием таза\nОПИСАНИЕ: Встань в боковую планку на локте. Медленно опусти таз почти до пола и подними обратно вверх. Двигайся ровно, без раскачки корпуса вперёд-назад.\nМЫШЦЫ: Пресс, Плечи\nОШИБКИ: Корпус заваливается вперёд — держи плечи, таз и стопы в одной плоскости.\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 10-12\nПОДХОДЫ: 2\nСТОРОНА: да\nОТДЫХ: 40\nУСЛОЖНЯТЬ: да\nШАГ: 1\nПОТОЛОК: 18\n",
    "exCount": 3
  },
  {
    "id": "glut-round",
    "by": "@nastya.glutes",
    "cat": "glut",
    "level": "Новичок",
    "min": 20,
    "name": "Ягодицы без штанги",
    "gives": "Ягодичный мостик, отведение ноги назад и выпады — три базовых движения на ягодицы. Без штанги и без зала.",
    "text": "ПРОГРАММА: Ягодицы без штанги\nДНИ: Пн, Чт\nКРУГИ: 3\nОТДЫХ МЕЖДУ КРУГАМИ: 60\nПРОГРЕССИЯ: 4\n\nУПРАЖНЕНИЕ: Ягодичный мостик\nОПИСАНИЕ: Ляг на спину, колени согнуты, стопы на ширине таза близко к ягодицам. Отталкивайся пятками и поднимай таз вверх, сжимая ягодицы в верхней точке на две секунды. Опускайся медленно, не бросая таз на пол.\nМЫШЦЫ: Ягодицы, Задняя бедра\nОШИБКИ: Прогиб в пояснице вместо работы ягодиц — подкрути таз и толкайся именно пятками.\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 15-20\nПОДХОДЫ: 3\nОТДЫХ: 45\nУСЛОЖНЯТЬ: да\nШАГ: 2\nПОТОЛОК: 30\nЗАМЕНА: Ягодичный мостик на одной ноге\nОПИСАНИЕ ЗАМЕНЫ: Тот же мостик, но одна нога выпрямлена вверх. Поднимай таз силой опорной ноги, следи, чтобы таз не заваливался в сторону.\n\nУПРАЖНЕНИЕ: Отведение ноги назад стоя\nОПИСАНИЕ: Встань, придерживаясь за стену или спинку стула. Отводи прямую ногу назад, ведя движение ягодицей, а не поясницей. В верхней точке задержись на секунду и вернись, не касаясь пола.\nМЫШЦЫ: Ягодицы, Задняя бедра\nОШИБКИ: Прогиб в пояснице — амплитуда должна быть небольшой, зато честной.\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 15-18\nПОДХОДЫ: 3\nСТОРОНА: да\nОТДЫХ: 30\nУСЛОЖНЯТЬ: да\nШАГ: 1\nПОТОЛОК: 25\n\nУПРАЖНЕНИЕ: Выпады назад\nОПИСАНИЕ: Из положения стоя сделай широкий шаг назад и опустись, пока переднее бедро не станет параллельно полу. Вес держи на передней ноге, корпус ровный. Вернись, оттолкнувшись пяткой передней ноги.\nМЫШЦЫ: Ягодицы, Квадрицепс\nОШИБКИ: Колено передней ноги уходит далеко вперёд за носок — шагай назад шире.\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 10-12\nПОДХОДЫ: 3\nСТОРОНА: да\nОТДЫХ: 45\nУСЛОЖНЯТЬ: да\nШАГ: 1\nПОТОЛОК: 18\n",
    "exCount": 3
  }
];

/* English display text for the built-in test catalog. Workout mechanics stay in the shared protocol. */
const SEED_EN = {
  "slim-tiho": {
    "name": "No-jump cardio",
    "gives": "Three rounds without a single jump: squats, mountain climbers and high-knee marching. Your heart rate goes up, but the neighbors downstairs hear nothing.",
    "text": "ПРОГРАММА: No-jump cardio\nДНИ: Пн, Ср, Пт\nКРУГИ: 3\nОТДЫХ МЕЖДУ КРУГАМИ: 60\nПРОГРЕССИЯ: 4\n\nУПРАЖНЕНИЕ: Squat to calf raise\nОПИСАНИЕ: Stand with your feet hip-width apart and toes slightly turned out. Push your hips back and down, keep your knees tracking over your toes and your back neutral. Rise from the bottom position and finish by lifting onto your toes, holding for one second. Lower under control: two counts down, one count up.\nМЫШЦЫ: Ягодицы, Квадрицепс, Икры\nОШИБКИ: Knees cave inward — actively press them out using your glutes.\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 15-18\nПОДХОДЫ: 3\nОТДЫХ: 40\nУСЛОЖНЯТЬ: да\nШАГ: 1\nПОТОЛОК: 25\nЗАМЕНА: Squat with explosive calf raise\nОПИСАНИЕ ЗАМЕНЫ: Use the same squat, but drive up more explosively from the bottom and rise sharply onto your toes, letting your heels leave the floor. Land quietly on the balls of your feet and then lower your heels.\n\nУПРАЖНЕНИЕ: Mountain climber\nОПИСАНИЕ: Start in a high plank with hands under shoulders and your body in one straight line from head to heels. Alternate driving one knee toward your chest while keeping your hips low. Breathe steadily and use a controlled medium pace rather than racing.\nМЫШЦЫ: Пресс, Плечи, Квадрицепс\nОШИБКИ: Hips rise too high — keep your body in a straight line so the core stays loaded.\nФОРМАТ: время\nЗНАЧЕНИЕ: 40\nПОДХОДЫ: 3\nОТДЫХ: 40\nУСЛОЖНЯТЬ: да\nШАГ: 5\nПОТОЛОК: 70\n\nУПРАЖНЕНИЕ: High-knee march\nОПИСАНИЕ: March in place, raising each knee to about hip height while reaching the opposite arm forward. Keep your abs braced and your back tall. The higher the knee, the more your core has to work.\nМЫШЦЫ: Пресс, Квадрицепс, Икры\nФОРМАТ: время\nЗНАЧЕНИЕ: 60\nПОДХОДЫ: 2\nОТДЫХ: 30\nУСЛОЖНЯТЬ: да\nШАГ: 10\nПОТОЛОК: 120\n"
  },
  "slim-tabata": {
    "name": "Express 15 minutes",
    "gives": "Short and genuinely tough: four rounds in a row with jumping jacks, burpees and a plank, with 45 seconds of rest between rounds.",
    "text": "ПРОГРАММА: Express 15 minutes\nДНИ: Вт, Чт, Сб\nКРУГИ: 4\nОТДЫХ МЕЖДУ КРУГАМИ: 45\nПРОГРЕССИЯ: 4\n\nУПРАЖНЕНИЕ: Jumping jacks\nОПИСАНИЕ: Stand tall with your arms by your sides. Jump your feet wider than shoulder width as your arms travel overhead, then return to the start. Land softly through the balls of your feet with slightly bent knees, not on locked legs. Keep a steady pace and breathe rhythmically.\nМЫШЦЫ: Плечи, Икры, Квадрицепс\nОШИБКИ: Hard landings on your heels increase impact — land softly through the forefoot.\nФОРМАТ: время\nЗНАЧЕНИЕ: 30\nПОДХОДЫ: 1\nОТДЫХ: 20\nУСЛОЖНЯТЬ: да\nШАГ: 5\nПОТОЛОК: 60\n\nУПРАЖНЕНИЕ: Burpee without push-up\nОПИСАНИЕ: From standing, squat down and place your hands on the floor, then jump your feet back into a plank. Jump your feet in again and stand tall, reaching upward. Keep your back neutral and do not let your lower back sag in the plank.\nМЫШЦЫ: Грудь, Пресс, Квадрицепс\nОШИБКИ: Lower back sags in the plank — tuck your pelvis slightly and brace your abs.\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 8-10\nПОДХОДЫ: 1\nОТДЫХ: 30\nУСЛОЖНЯТЬ: да\nШАГ: 1\nПОТОЛОК: 16\nЗАМЕНА: Burpee with push-up\nОПИСАНИЕ ЗАМЕНЫ: Perform the same burpee, but add one push-up in the plank: lower your chest toward the floor with elbows at about 45 degrees, then press back up before bringing your feet in.\n\nУПРАЖНЕНИЕ: Plank\nОПИСАНИЕ: Support yourself on your forearms with elbows directly under your shoulders. Keep a straight line from head to heels, squeeze your glutes and brace your abs. Breathe steadily instead of holding your breath.\nМЫШЦЫ: Пресс, Плечи, Спина\nОШИБКИ: Hips too high or lower back sagging both reduce core tension — keep your body in one straight line.\nФОРМАТ: время\nЗНАЧЕНИЕ: 40\nПОДХОДЫ: 1\nОТДЫХ: 30\nУСЛОЖНЯТЬ: да\nШАГ: 5\nПОТОЛОК: 90\n"
  },
  "core-flat": {
    "name": "Core in 12 minutes",
    "gives": "Crunches, forearm plank and side plank to train the deep abdominal muscles that stabilize your torso.",
    "text": "ПРОГРАММА: Core in 12 minutes\nДНИ: Пн, Ср, Пт\nКРУГИ: 3\nОТДЫХ МЕЖДУ КРУГАМИ: 45\nПРОГРЕССИЯ: 4\n\nУПРАЖНЕНИЕ: Crunches\nОПИСАНИЕ: Lie on your back with knees bent and feet on the floor, fingertips near your temples without pulling on your neck. Lift your shoulder blades using your abs while keeping your lower back pressed down. Exhale as you come up and lower slowly as you inhale.\nМЫШЦЫ: Пресс\nОШИБКИ: Pulling your head with your hands makes your neck tire before your abs — let the torso lift from the core.\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 15-20\nПОДХОДЫ: 3\nОТДЫХ: 30\nУСЛОЖНЯТЬ: да\nШАГ: 2\nПОТОЛОК: 30\n\nУПРАЖНЕНИЕ: Forearm plank\nОПИСАНИЕ: Place your elbows under your shoulders and keep your body straight from head to heels. Squeeze your glutes, slightly tuck your pelvis and brace your abs. Look at the floor a little ahead of your hands so your neck stays neutral.\nМЫШЦЫ: Пресс, Плечи, Спина\nОШИБКИ: Holding your breath makes the set much harder — keep breathing steadily.\nФОРМАТ: время\nЗНАЧЕНИЕ: 35\nПОДХОДЫ: 3\nОТДЫХ: 40\nУСЛОЖНЯТЬ: да\nШАГ: 5\nПОТОЛОК: 90\nЗАМЕНА: Plank with leg lift\nОПИСАНИЕ ЗАМЕНЫ: From the same plank, slowly lift one straight leg to about hip height, hold for two seconds and lower it. Keep your hips square instead of rotating to the side.\n\nУПРАЖНЕНИЕ: Side plank\nОПИСАНИЕ: Lie on your side with your elbow under your shoulder and your feet stacked. Lift your hips until your body forms a straight line. Place your free hand on your hip or extend it upward.\nМЫШЦЫ: Пресс, Плечи\nОШИБКИ: Hips sag toward the floor — keep them aligned with your shoulders and feet.\nФОРМАТ: время\nЗНАЧЕНИЕ: 25\nПОДХОДЫ: 2\nСТОРОНА: да\nОТДЫХ: 30\nУСЛОЖНЯТЬ: да\nШАГ: 5\nПОТОЛОК: 60\n"
  },
  "core-waist": {
    "name": "Waist and obliques",
    "gives": "Russian twists, bicycle crunches and side-plank hip dips to train the obliques, not just the front of the abs.",
    "text": "ПРОГРАММА: Waist and obliques\nДНИ: Вт, Чт\nКРУГИ: 3\nОТДЫХ МЕЖДУ КРУГАМИ: 60\nПРОГРЕССИЯ: 4\n\nУПРАЖНЕНИЕ: Russian twist\nОПИСАНИЕ: Sit with knees bent and optionally lift your feet off the floor. Lean back to about 45 degrees while keeping your back long. Rotate your torso right and left, letting your arms follow the ribs so the movement comes from the waist rather than just the shoulders.\nМЫШЦЫ: Пресс, Спина\nОШИБКИ: Rounded back — keep your chest open and rotate from the rib cage.\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 20-24\nПОДХОДЫ: 3\nОТДЫХ: 40\nУСЛОЖНЯТЬ: да\nШАГ: 2\nПОТОЛОК: 36\n\nУПРАЖНЕНИЕ: Bicycle crunch\nОПИСАНИЕ: Lie on your back with your hands near your temples. Bring your right elbow toward your left knee while extending the other leg above the floor. Switch sides smoothly without jerking and keep your lower back pressed down.\nМЫШЦЫ: Пресс\nОШИБКИ: Pulling your neck with quick jerks — drive the movement from your abs and let the elbow follow.\nФОРМАТ: время\nЗНАЧЕНИЕ: 40\nПОДХОДЫ: 3\nОТДЫХ: 40\nУСЛОЖНЯТЬ: да\nШАГ: 5\nПОТОЛОК: 80\n\nУПРАЖНЕНИЕ: Side plank hip dip\nОПИСАНИЕ: Set up in a side plank on your elbow. Slowly lower your hips close to the floor, then lift them back up. Move with control and avoid rocking your torso forward and back.\nМЫШЦЫ: Пресс, Плечи\nОШИБКИ: Torso rolls forward — keep your shoulders, hips and feet in the same plane.\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 10-12\nПОДХОДЫ: 2\nСТОРОНА: да\nОТДЫХ: 40\nУСЛОЖНЯТЬ: да\nШАГ: 1\nПОТОЛОК: 18\n"
  },
  "glut-round": {
    "name": "Glutes without a barbell",
    "gives": "Glute bridges, standing leg extensions and reverse lunges — three basic glute movements without a barbell or gym membership.",
    "text": "ПРОГРАММА: Glutes without a barbell\nДНИ: Пн, Чт\nКРУГИ: 3\nОТДЫХ МЕЖДУ КРУГАМИ: 60\nПРОГРЕССИЯ: 4\n\nУПРАЖНЕНИЕ: Glute bridge\nОПИСАНИЕ: Lie on your back with knees bent and feet hip-width apart close to your glutes. Drive through your heels and lift your hips, squeezing your glutes for two seconds at the top. Lower slowly instead of dropping your hips to the floor.\nМЫШЦЫ: Ягодицы, Задняя бедра\nОШИБКИ: Overarching the lower back instead of using the glutes — tuck your pelvis slightly and push through your heels.\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 15-20\nПОДХОДЫ: 3\nОТДЫХ: 45\nУСЛОЖНЯТЬ: да\nШАГ: 2\nПОТОЛОК: 30\nЗАМЕНА: Single-leg glute bridge\nОПИСАНИЕ ЗАМЕНЫ: Use the same bridge, but extend one leg upward. Lift your hips using the working leg and keep your pelvis level instead of letting it drop to one side.\n\nУПРАЖНЕНИЕ: Standing leg extension\nОПИСАНИЕ: Stand tall and lightly hold a wall or chair for balance. Move one straight leg backward using the glute rather than arching your lower back. Pause for one second at the top, then return without resting the foot on the floor.\nМЫШЦЫ: Ягодицы, Задняя бедра\nОШИБКИ: Arching the lower back — use a smaller but controlled range led by the glute.\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 15-18\nПОДХОДЫ: 3\nСТОРОНА: да\nОТДЫХ: 30\nУСЛОЖНЯТЬ: да\nШАГ: 1\nПОТОЛОК: 25\n\nУПРАЖНЕНИЕ: Reverse lunge\nОПИСАНИЕ: From standing, take a long step back and lower until the front thigh is close to parallel with the floor. Keep most of your weight on the front leg and your torso upright. Return by driving through the heel of the front foot.\nМЫШЦЫ: Ягодицы, Квадрицепс\nОШИБКИ: Front knee travels too far forward past the toes — take a longer step back.\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 10-12\nПОДХОДЫ: 3\nСТОРОНА: да\nОТДЫХ: 45\nУСЛОЖНЯТЬ: да\nШАГ: 1\nПОТОЛОК: 18\n"
  }
};

for(const it of SEED_ITEMS){
  const en = SEED_EN[it.id];
  if(!en) continue;
  it.sourceLocale = 'ru';
  it.locales = {ru:{name:it.name,gives:it.gives,text:it.text}, en};
}

module.exports = { SEED_ITEMS, SEED_TRAINERS };
