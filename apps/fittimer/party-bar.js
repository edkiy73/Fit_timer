const ING = {
  bourbon:{label:"Бурбон", note:"Любой bourbon"},
  irish:{label:"Ирландский виски", note:"Мягкий blended / Irish whiskey"},
  gin:{label:"Джин", note:"London dry и похожие"},
  rum:{label:"Белый ром", note:"Лёгкий white rum"},
  sweetV:{label:"Сладкий красный вермут", note:"Rosso / sweet vermouth"},
  dryV:{label:"Сухой вермут", note:"Extra Dry / dry vermouth"},
  bitter:{label:"Красный биттер", note:"Горький красный аперитив типа Campari"},
  aperol:{label:"Aperol", note:"Мягкий апельсиновый аперитив"},
  triple:{label:"Triple Sec", note:"Апельсиновый ликёр"},
  jager:{label:"Jägermeister", note:"Травяной ликёр"},
  vodka:{label:"Водка", note:"Для Long Island и Colorado Bulldog"},
  tequila:{label:"Текила", note:"Для Long Island, Texas Tea и Batanga"},
  coffee:{label:"Кофейный ликёр", note:"Например Kahlúa"},
  cola:{label:"Кола", note:"Основной миксер для cola-коктейлей"}
};

const cocktails = [
  {
    name:"Boulevardier", premium:true, family:"Классика / бурбон", base:"Бурбон", abv:24,
    art:{shape:"rocks", c1:"#7c240f", c2:"#cf5d25", ice:3, garnish:"peel", bg1:"#2a120d", bg2:"#5a2614"},
    desc:"Плотный висковый коктейль с травяной горечью и карамельной сладостью. Один из главных вариантов вечера.",
    tags:["крепкое","горькое","виски","вечер"],
    main:{recipe:"Бурбон 50 мл + красный биттер 25 мл + сладкий красный вермут 25 мл", ingredients:["bourbon","bitter","sweetV"], taste:"Виски, карамель, горькие травы, апельсиновый профиль."},
    who:"Тем, кто любит виски, насыщенный вкус и заметную горечь.",
    extras:[
      {name:"Апельсиновая цедра", mode:"optional", effect:"Сильно поднимает апельсиновый аромат без дополнительной сладости."},
      {name:"Angostura", mode:"optional", effect:"1–2 дэша делают коктейль прянее, суше и глубже."}
    ],
    serve:"Стакан со льдом, мешать 20–25 секунд. Апельсиновая цедра.",
    variations:[
      {name:"Aperol Boulevardier", recipe:"Бурбон 50 + Aperol 25 + сладкий красный вермут 25", ingredients:["bourbon","aperol","sweetV"], abv:22, taste:"Мягче, слаще, апельсиновее, почти без жёсткой горечи. Отличный входной вариант."},
      {name:"Split", recipe:"Бурбон 50 + красный биттер 12.5 + Aperol 12.5 + сладкий красный вермут 25", ingredients:["bourbon","bitter","aperol","sweetV"], abv:23, taste:"Баланс между характером красного биттера и мягкостью Aperol."},
      {name:"Dry", recipe:"Бурбон 50 + красный биттер 25 + сладкий красный вермут 15 + сухой вермут 10", ingredients:["bourbon","bitter","sweetV","dryV"], abv:24, taste:"Суше, строже, меньше сладости, бурбон ощущается сильнее."}
    ]
  },
  {
    name:"Negroni", premium:true, family:"Классика / джин", base:"Джин", abv:22,
    art:{shape:"rocks", c1:"#a51f1a", c2:"#d14b27", ice:2, garnish:"twist", bg1:"#1b0f13", bg2:"#52222b"},
    desc:"Травяной, можжевеловый и горький. Классика для тех, кто любит выраженный характер.",
    tags:["горькое","джин","классика","крепкое"],
    main:{recipe:"Джин 35 мл + красный биттер 30 мл + сладкий красный вермут 30 мл", ingredients:["gin","bitter","sweetV"], taste:"Можжевельник, травы, сладкий вермут и чистая горечь."},
    who:"Тем, кто любит горечь, джин и строгие коктейли.",
    extras:[
      {name:"Апельсиновая цедра", mode:"optional", effect:"Классическая ароматика; делает цитрус ярче без изменения баланса."},
      {name:"Orange bitters", mode:"optional", effect:"1–2 дэша добавляют сухой апельсиновый аромат и чуть больше сложности."},
      {name:"Содовая 20–30 мл", mode:"optional", effect:"Если хочется легче: снизит крепость и раскроет аромат, не добавляя сахара."}
    ],
    serve:"На большом количестве льда, мешать 15–20 секунд. Апельсиновая цедра.",
    variations:[
      {name:"Aperol Negroni", recipe:"Джин 40 + Aperol 25 + сладкий красный вермут 25", ingredients:["gin","aperol","sweetV"], abv:21, taste:"Намного мягче, цитрусовее и проще для тех, кому классический Negroni слишком горький."},
      {name:"Split", recipe:"Джин 40 + красный биттер 15 + Aperol 15 + сладкий красный вермут 25", ingredients:["gin","bitter","aperol","sweetV"], abv:22, taste:"Универсальный вариант: горечь есть, но апельсиновая мягкость заметна."},
      {name:"Dry", recipe:"Джин 40 + красный биттер 25 + сладкий красный вермут 20 + сухой вермут 10", ingredients:["gin","bitter","sweetV","dryV"], abv:23, taste:"Суше, менее винный, джин выходит вперёд."}
    ]
  },
  {
    name:"Old Pal", premium:true, family:"Классика / бурбон", base:"Бурбон", abv:24,
    art:{shape:"rocks", c1:"#b34922", c2:"#ef9a3f", ice:2, garnish:"lemon", bg1:"#26140f", bg2:"#694021"},
    desc:"Более сухой и строгий родственник Boulevardier. Хорош, когда сладость красного вермута уже надоела.",
    tags:["сухое","крепкое","виски","горькое"],
    main:{recipe:"Бурбон 45 мл + красный биттер 25 мл + сухой вермут 25 мл", ingredients:["bourbon","bitter","dryV"], taste:"Сухой, крепкий, горьковатый, с заметным виски."},
    who:"Тем, кто любит крепкое и сухое, а Boulevardier кажется сладким.",
    extras:[
      {name:"Лимонная цедра", mode:"optional", effect:"Делает аромат суше и свежее; хорошо подчёркивает Dry vermouth."},
      {name:"Orange bitters", mode:"optional", effect:"1–2 дэша добавляют сухую цитрусовую пряность."}
    ],
    serve:"Мешать со льдом около 20 секунд. Лимонная или апельсиновая цедра.",
    variations:[
      {name:"Мягкий Old Pal", recipe:"Бурбон 45 + красный биттер 10 + Aperol 15 + сухой вермут 25", ingredients:["bourbon","bitter","aperol","dryV"], abv:23, taste:"Сохраняет сухость, но горечь становится заметно мягче."},
      {name:"Aperol Old Pal", recipe:"Бурбон 45 + Aperol 25 + сухой вермут 25", ingredients:["bourbon","aperol","dryV"], abv:22, taste:"Цитрусовый, слегка сладковатый, практически без жёсткой горечи."}
    ]
  },
  {
    name:"Lucien Gaudin", premium:true, family:"Классика / джин", base:"Джин", abv:26,
    art:{shape:"nick", c1:"#b24a27", c2:"#efb05b", ice:1, garnish:"orange", bg1:"#201013", bg2:"#5b2f1c"},
    desc:"Сухой цитрусово-горький коктейль. Более сложный и парфюмный, чем Negroni.",
    tags:["сухое","цитрус","крепкое","джин"],
    main:{recipe:"Джин 30 мл + красный биттер 15 мл + Triple Sec 15 мл + сухой вермут 15 мл", ingredients:["gin","bitter","triple","dryV"], taste:"Сухой апельсин, джин, лёгкая сладость ликёра и горчинка."},
    who:"Тем, кто хочет крепко, цитрусово и сложнее обычного Negroni.",
    extras:[
      {name:"Апельсиновая цедра", mode:"optional", effect:"Подчёркивает Triple Sec и делает аромат ярче."},
      {name:"Orange bitters", mode:"optional", effect:"1 дэш добавит сухой апельсин без лишней сладости."}
    ],
    serve:"Мешать 15–20 секунд. Лучше процедить в холодный бокал. Апельсиновая цедра.",
    variations:[
      {name:"Мягче", recipe:"Джин 30 + красный биттер 10 + Aperol 5 + Triple Sec 15 + сухой вермут 15", ingredients:["gin","bitter","aperol","triple","dryV"], abv:25, taste:"Круглее, мягче, меньше резкой горечи."},
      {name:"Суше", recipe:"Джин 35 + красный биттер 15 + Triple Sec 10 + сухой вермут 15", ingredients:["gin","bitter","triple","dryV"], abv:27, taste:"Меньше сладости, больше джина и сухости."}
    ]
  },
  {
    name:"Gin & It", premium:true, family:"Классика / джин", base:"Джин", abv:25,
    art:{shape:"rocks", c1:"#7f2331", c2:"#b44258", ice:3, garnish:"lemon", bg1:"#17131b", bg2:"#3f2936"},
    desc:"Минималистичный джин с красным вермутом. Почти без горечи, зато с хорошим травяным телом.",
    tags:["джин","травяное","простое","крепкое"],
    main:{recipe:"Джин 50 мл + сладкий красный вермут 25 мл", ingredients:["gin","sweetV"], taste:"Джин впереди, затем сладковато-травяной вермут."},
    who:"Тем, кто любит джин, но не хочет сильную горечь.",
    extras:[
      {name:"Лимонная цедра", mode:"optional", effect:"Освежает и делает профиль суше."},
      {name:"Orange bitters", mode:"optional", effect:"1–2 дэша добавят структуру и цитрусовую сухость."}
    ],
    serve:"Лёд, мешать 15–20 секунд. Лимонная или апельсиновая цедра.",
    variations:[
      {name:"Bitter", recipe:"Джин 50 + сладкий красный вермут 25 + красный биттер 5", ingredients:["gin","sweetV","bitter"], abv:24, taste:"Чуть суше и глубже, появляется лёгкая горчинка."},
      {name:"Aperol", recipe:"Джин 50 + сладкий красный вермут 25 + Aperol 10", ingredients:["gin","sweetV","aperol"], abv:23, taste:"Мягче, фруктовее и более апельсиновый профиль."},
      {name:"Dry", recipe:"Джин 50 + сладкий красный вермут 15 + сухой вермут 10", ingredients:["gin","sweetV","dryV"], abv:26, taste:"Суше, чище и менее винно-сладко."}
    ]
  },
  {
    name:"Irish Manhattan-ish", premium:true, family:"Твист / ирландский виски", base:"Ирландский виски", abv:25,
    art:{shape:"nick", c1:"#954e1a", c2:"#d7903a", ice:0, garnish:"cherry", bg1:"#23140f", bg2:"#4f2e20"},
    desc:"Мягкий виски, сладкий вермут и совсем немного горечи.",
    tags:["мягкое","виски","крепкое","не горькое"],
    main:{recipe:"Ирландский виски 50 мл + сладкий красный вермут 25 мл + красный биттер 5 мл", ingredients:["irish","sweetV","bitter"], taste:"Мягкий виски, винно-травяной фон и лёгкая горечь."},
    who:"Тем, кто любит мягкий виски, но не хочет тяжёлый бурбон или жёсткую горечь.",
    extras:[
      {name:"Angostura", mode:"recommended", effect:"2 дэша сильно приближают напиток к логике Manhattan: больше пряности и глубины."},
      {name:"Апельсиновая цедра", mode:"optional", effect:"Добавляет аромат и подчёркивает мягкость ирландского виски."},
      {name:"Коктейльная вишня", mode:"optional", effect:"Даст более классическую десертную подачу и немного фруктового аромата."}
    ],
    serve:"Мешать со льдом около 20 секунд. Апельсиновая цедра.",
    variations:[
      {name:"Aperol", recipe:"Ирландский виски 50 + сладкий красный вермут 20 + Aperol 10", ingredients:["irish","sweetV","aperol"], abv:23, taste:"Ещё мягче, апельсиновее, чуть слаще."},
      {name:"Dry", recipe:"Ирландский виски 50 + сладкий красный вермут 15 + сухой вермут 10 + красный биттер 5", ingredients:["irish","sweetV","dryV","bitter"], abv:25, taste:"Суше, меньше сладости, виски заметнее."}
    ]
  },
  {
    name:"Bourbon Orange Bitter", premium:true, family:"Авторский / бурбон", base:"Бурбон", abv:24,
    art:{shape:"rocks", c1:"#a73c11", c2:"#ff7c21", ice:2, garnish:"orange", bg1:"#24140d", bg2:"#5a2713"},
    desc:"Виски здесь главный, а Aperol и красный биттер только собирают апельсиново-горький фон.",
    tags:["виски","апельсин","крепкое","мягкая горечь"],
    main:{recipe:"Бурбон 50 мл + Aperol 15 мл + красный биттер 5 мл + сладкий красный вермут 15 мл", ingredients:["bourbon","aperol","bitter","sweetV"], taste:"Бурбон впереди, затем апельсин и умеренная горечь."},
    who:"Тем, кто хочет чувствовать виски сильнее, чем в Boulevardier.",
    extras:[
      {name:"Апельсиновая цедра", mode:"recommended", effect:"Связывает Aperol/Campari с бурбоном и усиливает цитрус без сладости."},
      {name:"Angostura", mode:"optional", effect:"1–2 дэша делают вкус прянее и взрослее."}
    ],
    serve:"Много льда, мешать 20–25 секунд. Апельсиновая цедра.",
    variations:[
      {name:"Мягче", recipe:"Бурбон 50 + Aperol 20 + сладкий красный вермут 15", ingredients:["bourbon","aperol","sweetV"], abv:23, taste:"Слаще, фруктовее, практически без горечи."},
      {name:"Суше", recipe:"Бурбон 50 + Aperol 15 + сладкий красный вермут 10 + сухой вермут 10 + красный биттер 5", ingredients:["bourbon","aperol","sweetV","dryV","bitter"], abv:24, taste:"Более строгий, менее сладкий, виски ярче."},
      {name:"Orange", recipe:"Основной + Triple Sec 5", ingredients:["bourbon","aperol","bitter","sweetV","triple"], abv:24, taste:"Ещё ярче апельсиновый аромат, но и сладость выше."}
    ]
  },
  {
    name:"Aperol Gin Highball", premium:true, family:"Авторский / лёгкий", base:"Джин", abv:18,
    art:{shape:"highball", c1:"#ff7e2b", c2:"#ffb35f", ice:4, garnish:"orange", bubbles:true, bg1:"#1a1111", bg2:"#5b3419"},
    desc:"Универсальный лёгкий вариант: немного газа, апельсин, джин и почти никакой кислоты.",
    tags:["лёгкое","мягкое","джин","вечеринка"],
    main:{recipe:"Джин 45 мл + Aperol 20 мл + сухой вермут 10 мл + содовая 30–40 мл", ingredients:["gin","aperol","dryV"], taste:"Свежий, апельсиновый, суховатый, с умеренной крепостью."},
    who:"Тем, кто хочет что-то легче крепких stirred-коктейлей, но без стакана колы.",
    extras:[
      {name:"Апельсиновая цедра", mode:"optional", effect:"Усиливает апельсиновый аромат Aperol."},
      {name:"Saline", mode:"optional", effect:"2–3 капли слегка усиливают вкус и делают горечь мягче."}
    ],
    serve:"Лёд → алкоголь → перемешать → содовая в конце.",
    variations:[
      {name:"Горче", recipe:"Основной + красный биттер 5", ingredients:["gin","aperol","dryV","bitter"], abv:19, taste:"Становится строже и чуть суше."},
      {name:"Плотнее", recipe:"Джин 45 + Aperol 20 + сухой вермут 10 + содовая 20", ingredients:["gin","aperol","dryV"], abv:21, taste:"Больше вкуса и алкоголя в каждом глотке."},
      {name:"Без сухого вермута", recipe:"Джин 45 + Aperol 20 + содовая 30", ingredients:["gin","aperol"], abv:19, taste:"Проще, мягче и чуть слаще."}
    ]
  },
  {
    name:"Rum Bitter", premium:true, family:"Авторский / белый ром", base:"Белый ром", abv:23,
    art:{shape:"highball", c1:"#d2732c", c2:"#f0c776", ice:4, garnish:"lime", bg1:"#131619", bg2:"#3e3321"},
    desc:"Способ использовать белый ром без колы и большого количества сока.",
    tags:["ром","цитрус","сухое","средне-крепкое"],
    main:{recipe:"Белый ром 50 мл + Aperol 20 мл + сухой вермут 15 мл + красный биттер 5 мл", ingredients:["rum","aperol","dryV","bitter"], taste:"Лёгкий ром, сухой апельсин и небольшая горечь."},
    who:"Тем, кто любит ром, но не хочет сладкие ром-колы и фруктовые лонги.",
    extras:[
      {name:"Лаймовая цедра", mode:"optional", effect:"Добавляет свежесть без заметной кислоты."},
      {name:"Saline", mode:"optional", effect:"2–3 капли подчёркивают ром и сглаживают горечь."}
    ],
    serve:"Мешать со льдом 15–20 секунд. Апельсиновая цедра.",
    variations:[
      {name:"Мягче", recipe:"Белый ром 50 + Aperol 20 + сухой вермут 15", ingredients:["rum","aperol","dryV"], abv:23, taste:"Фруктовее и спокойнее, без горечи красного биттера."},
      {name:"Темнее", recipe:"Белый ром 50 + Aperol 20 + сладкий красный вермут 10 + сухой вермут 10", ingredients:["rum","aperol","sweetV","dryV"], abv:22, taste:"Слаще, виннее и более округлый."},
      {name:"Горче", recipe:"Белый ром 50 + Aperol 15 + красный биттер 10 + сухой вермут 15", ingredients:["rum","aperol","bitter","dryV"], abv:23, taste:"Ярче, суше и горче."}
    ]
  },
  {
    name:"Jäger Aperol", premium:true, family:"Авторский / травяной", base:"Jägermeister", abv:17,
    art:{shape:"highball", c1:"#8f4018", c2:"#de7d2e", ice:4, garnish:"orange", bubbles:true, bg1:"#15100e", bg2:"#4e2817"},
    desc:"Травяной и апельсиновый, но легче чистого Jägermeister.",
    tags:["мягкое","травяное","лёгкое","ягер"],
    main:{recipe:"Jägermeister 35 мл + Aperol 20 мл + содовая 20–30 мл", ingredients:["jager","aperol"], taste:"Травы, сладкий апельсин, умеренная сладость."},
    who:"Тем, кто любит Jägermeister и хочет что-то мягче шота.",
    extras:[
      {name:"Апельсиновая цедра", mode:"optional", effect:"Подчёркивает цитрусовую сторону Aperol и смягчает аптечность Jägermeister."},
      {name:"Лимонная цедра", mode:"optional", effect:"Если хочется более сухого и свежего аромата."}
    ],
    serve:"Много льда, быстро перемешать, содовую добавить последней.",
    variations:[
      {name:"Суше", recipe:"Jägermeister 35 + Aperol 15 + сухой вермут 10", ingredients:["jager","aperol","dryV"], abv:24, taste:"Менее сладкий, более травяной и значительно крепче основной версии."},
      {name:"Крепче", recipe:"Jägermeister 35 + Aperol 15, без содовой", ingredients:["jager","aperol"], abv:28, taste:"Плотный, сладко-травяной и заметно крепче."},
      {name:"Горче", recipe:"Jägermeister 35 + Aperol 20 + красный биттер 5 + содовая 20–30", ingredients:["jager","aperol","bitter"], abv:18, taste:"Более жёсткий и сложный травяной профиль."}
    ]
  },
  {
    name:"Aperol Rosso Soda", family:"Бонус / очень лёгкий", base:"Aperol", abv:8,
    art:{shape:"wine", c1:"#d76033", c2:"#f5a15a", ice:3, garnish:"orange", bubbles:true, bg1:"#1d1010", bg2:"#4a1f18"},
    desc:"Очень мягкий вариант на случай, когда человек не хочет ни крепкого, ни горького.",
    tags:["очень лёгкое","мягкое","сладковатое","для новичка"],
    main:{recipe:"Aperol 30 мл + сладкий красный вермут 25 мл + содовая 40 мл", ingredients:["aperol","sweetV"], taste:"Сладковато-апельсиновый, винный, лёгкая травянистость."},
    who:"Тем, кто говорит: «только не крепкое и не горькое».",
    extras:[
      {name:"Апельсиновая долька / цедра", mode:"optional", effect:"Делает аромат ярче и визуально лучше подачу."},
      {name:"Saline", mode:"optional", effect:"1–2 капли убирают ощущение приторности."}
    ],
    serve:"Много льда, быстро перемешать, содовая в конце.",
    variations:[
      {name:"Суше", recipe:"Aperol 30 + сладкий красный вермут 15 + сухой вермут 10 + содовая 40", ingredients:["aperol","sweetV","dryV"], abv:8, taste:"Меньше сладости, чуть строже."},
      {name:"Плотнее", recipe:"Aperol 30 + сладкий красный вермут 25 + содовая 20", ingredients:["aperol","sweetV"], abv:10, taste:"Насыщеннее и чуть крепче по ощущению."}
    ]
  },
  {
    name:"Irish Aperol Cooler", family:"Бонус / мягкий виски", base:"Ирландский виски", abv:16,
    art:{shape:"highball", c1:"#ca6a2b", c2:"#f4aa67", ice:4, garnish:"orange", bubbles:true, bg1:"#1b120d", bg2:"#503321"},
    desc:"Мост между лёгким Aperol-коктейлем и полноценным крепким виски-коктейлем.",
    tags:["мягкое","виски","апельсин","вечеринка"],
    main:{recipe:"Ирландский виски 35 мл + Aperol 20 мл + сладкий красный вермут 10 мл + содовая 30–40 мл", ingredients:["irish","aperol","sweetV"], taste:"Мягкий виски, апельсин и немного сладкого вермута."},
    who:"Тем, кто не любит сильную горечь или джин, но хочет чувствовать алкоголь.",
    extras:[
      {name:"Апельсиновая цедра", mode:"optional", effect:"Подчёркивает Aperol и делает коктейль ароматнее."},
      {name:"Angostura", mode:"optional", effect:"1 дэш добавляет пряность, если напиток кажется слишком простым."}
    ],
    serve:"Лёд → алкоголь → перемешать → содовая.",
    variations:[
      {name:"Суше", recipe:"Ирландский виски 35 + Aperol 15 + сухой вермут 10 + содовая 30", ingredients:["irish","aperol","dryV"], abv:17, taste:"Меньше сладости, больше виски."},
      {name:"Плотнее", recipe:"Ирландский виски 40 + Aperol 20 + сладкий красный вермут 10 + содовая 20", ingredients:["irish","aperol","sweetV"], abv:19, taste:"Более насыщенный и крепкий."}
    ]
  }


  ,
  {
    name:"Whiskey Sour", family:"Классика / sour", base:"Бурбон", abv:17,
    art:{shape:"rocks", c1:"#d08924", c2:"#f2c35d", ice:3, garnish:"lemon", bg1:"#1d140d", bg2:"#5a3a16"},
    desc:"Один из главных sour-коктейлей: виски, лимон и сладость в балансе. Яркий, но не должен быть резко кислым.",
    tags:["кислое","виски","классика","цитрус"],
    main:{recipe:"Бурбон 50 мл + лимонный сок 25 мл + сахарный сироп 15 мл", ingredients:["bourbon"], taste:"Виски, свежий лимон, мягкая сладость и сухой финиш."},
    who:"Тем, кто любит виски, но хочет более свежий и лёгкий профиль.",
    extras:[
      {name:"Лимонный сок 25 мл", mode:"required", effect:"Даёт кислоту и свежесть."},
      {name:"Сахарный сироп 15 мл", mode:"required", effect:"Балансирует лимон и округляет виски."},
      {name:"Angostura", mode:"optional", effect:"2 дэша добавят пряность и глубину."},
      {name:"Белок", mode:"optional", effect:"Даёт плотную пену и более шелковую текстуру."}
    ],
    serve:"Встряхнуть со льдом и процедить на свежий лёд. С белком сначала можно сделать dry shake.",
    variations:[
      {name:"Boston Sour", recipe:"Whiskey Sour + яичный белок", ingredients:["bourbon"], abv:16, taste:"Та же база, но мягче и кремовее по текстуре."},
      {name:"New York Sour", recipe:"Whiskey Sour + 15 мл красного вина сверху", ingredients:["bourbon"], abv:17, taste:"Фруктовее, виннее и визуально эффектнее."}
    ]
  },
  {
    name:"Daiquiri", family:"Классика / sour", base:"Белый ром", abv:18,
    art:{shape:"nick", c1:"#d7c878", c2:"#f5efa9", ice:0, garnish:"lime", bg1:"#11150f", bg2:"#33452a"},
    desc:"Классический ромовый sour без колы и лишних добавок. Очень простой рецепт, где решает баланс.",
    tags:["кислое","ром","классика","цитрус"],
    main:{recipe:"Белый ром 60 мл + лаймовый сок 25 мл + сахарный сироп 15 мл", ingredients:["rum"], taste:"Чистый ром, яркий лайм и лёгкая сладость."},
    who:"Тем, кто любит свежие и сухие цитрусовые коктейли.",
    extras:[
      {name:"Лаймовый сок 25 мл", mode:"required", effect:"Главная кислота и свежесть."},
      {name:"Сахарный сироп 15 мл", mode:"required", effect:"Собирает лайм и ром в баланс."}
    ],
    serve:"Хорошо встряхнуть со льдом и процедить в охлаждённый бокал.",
    variations:[
      {name:"Суше", recipe:"Белый ром 60 + лайм 25 + сироп 10", ingredients:["rum"], abv:19, taste:"Ром заметнее, сладость ниже."},
      {name:"Мягче", recipe:"Белый ром 50 + лайм 20 + сироп 15", ingredients:["rum"], abv:17, taste:"Чуть мягче и проще для новичка."}
    ]
  },
  {
    name:"Margarita", family:"Классика / sour", base:"Текила", abv:20,
    art:{shape:"nick", c1:"#d9d26f", c2:"#f3eea8", ice:0, garnish:"lime", bg1:"#11130f", bg2:"#3a4323"},
    desc:"Текила, лайм и апельсиновый ликёр. Один из самых узнаваемых кислых коктейлей.",
    tags:["кислое","текила","классика","цитрус"],
    main:{recipe:"Текила 50 мл + Triple Sec 25 мл + лаймовый сок 25 мл", ingredients:["tequila","triple"], taste:"Агава, лайм, апельсин и сухая цитрусовая кислинка."},
    who:"Тем, кто любит яркий цитрус и текилу.",
    extras:[
      {name:"Лаймовый сок 25 мл", mode:"required", effect:"Формирует кислоту и свежесть."},
      {name:"Соль", mode:"optional", effect:"Подчёркивает агаву и смягчает ощущение кислоты."},
      {name:"Сироп агавы 5–10 мл", mode:"optional", effect:"Если хочется мягче и менее резко."}
    ],
    serve:"Встряхнуть со льдом. Можно сделать соляной край.",
    variations:[
      {name:"Tommy's Margarita", recipe:"Текила 50 + лайм 25 + сироп агавы 15", ingredients:["tequila"], abv:18, taste:"Мягче, агавнее и без апельсинового ликёра."},
      {name:"Aperol Margarita", recipe:"Текила 45 + Triple Sec 15 + Aperol 15 + лайм 25", ingredients:["tequila","triple","aperol"], abv:19, taste:"Апельсиновее, мягче и чуть горьковатая."}
    ]
  },
  {
    name:"White Lady", family:"Классика / sour", base:"Джин", abv:22,
    art:{shape:"nick", c1:"#e5d59a", c2:"#fff1c0", ice:0, garnish:"lemon", bg1:"#16140e", bg2:"#4a4024"},
    desc:"Джин, апельсиновый ликёр и лимон — сухой и очень чистый sour.",
    tags:["кислое","джин","классика","цитрус"],
    main:{recipe:"Джин 40 мл + Triple Sec 30 мл + лимонный сок 20 мл", ingredients:["gin","triple"], taste:"Джин, апельсин, лимон и сухой цитрусовый финиш."},
    who:"Тем, кто любит джин и чистые кислые коктейли.",
    extras:[
      {name:"Лимонный сок 20 мл", mode:"required", effect:"Даёт кислоту и делает коктейль собранным."},
      {name:"Яичный белок", mode:"optional", effect:"Смягчает кислоту и делает текстуру шелковой."}
    ],
    serve:"Встряхнуть со льдом и процедить. С белком — dry shake перед льдом.",
    variations:[
      {name:"Мягче", recipe:"Джин 40 + Triple Sec 25 + лимон 15", ingredients:["gin","triple"], abv:23, taste:"Меньше кислоты, больше апельсина."},
      {name:"Суше", recipe:"Джин 45 + Triple Sec 20 + лимон 20", ingredients:["gin","triple"], abv:24, taste:"Джин заметнее, сладости меньше."}
    ]
  },
  {
    name:"Sidecar", family:"Классика / sour", base:"Бренди", abv:22,
    art:{shape:"nick", c1:"#c98538", c2:"#efbd74", ice:0, garnish:"orange", bg1:"#1b120d", bg2:"#5a361c"},
    desc:"Бренди, апельсиновый ликёр и лимон. Богаче и теплее White Lady.",
    tags:["кислое","бренди","классика","цитрус"],
    main:{recipe:"Бренди 50 мл + Triple Sec 25 мл + лимонный сок 25 мл", ingredients:["triple"], taste:"Тёплый бренди, апельсин и яркий лимон."},
    who:"Тем, кто любит более округлые и ароматные sour-коктейли.",
    extras:[
      {name:"Лимонный сок 25 мл", mode:"required", effect:"Балансирует сладость ликёра."},
      {name:"Сахарный ободок", mode:"optional", effect:"Смягчает первый глоток и делает подачу десертнее."}
    ],
    serve:"Встряхнуть со льдом, процедить в охлаждённый бокал.",
    variations:[
      {name:"Суше", recipe:"Бренди 50 + Triple Sec 20 + лимон 25", ingredients:["triple"], abv:23, taste:"Бренди ярче, меньше сладости."},
      {name:"Мягче", recipe:"Бренди 45 + Triple Sec 25 + лимон 20", ingredients:["triple"], abv:21, taste:"Чуть мягче и фруктовее."}
    ]
  },
  {
    name:"Gimlet", family:"Классика / sour", base:"Джин", abv:24,
    art:{shape:"nick", c1:"#c9d67c", c2:"#ecf2b7", ice:0, garnish:"lime", bg1:"#10140d", bg2:"#344323"},
    desc:"Очень лаконичный кислый джиновый коктейль. Джин и лайм без лишнего шума.",
    tags:["кислое","джин","классика","цитрус"],
    main:{recipe:"Джин 60 мл + лаймовый сок 25 мл + сахарный сироп 15 мл", ingredients:["gin"], taste:"Сухой джин, яркий лайм и лёгкая сладость."},
    who:"Тем, кто любит джин и более резкий цитрусовый профиль.",
    extras:[
      {name:"Лаймовый сок 25 мл", mode:"required", effect:"Главный вкус и кислотность."},
      {name:"Сахарный сироп 15 мл", mode:"required", effect:"Балансирует лайм."},
      {name:"Лаймовая цедра", mode:"optional", effect:"Даёт больше аромата без дополнительной кислоты."}
    ],
    serve:"Встряхнуть со льдом и процедить.",
    variations:[
      {name:"Суше", recipe:"Джин 60 + лайм 25 + сироп 10", ingredients:["gin"], abv:25, taste:"Резче, суше, джин ярче."},
      {name:"Aperol Gimlet", recipe:"Джин 50 + Aperol 15 + лайм 20 + сироп 10", ingredients:["gin","aperol"], abv:20, taste:"Мягче, апельсиновее и чуть горьковатый."}
    ]
  },
  {
    name:"Tom Collins", family:"Классика / long sour", base:"Джин", abv:12,
    art:{shape:"highball", c1:"#d7c983", c2:"#f5efbd", ice:5, garnish:"lemon", bubbles:true, bg1:"#13150f", bg2:"#3b4025"},
    desc:"По сути длинный джиновый sour с содовой. Свежий, лёгкий и очень понятный.",
    tags:["кислое","джин","лонг","лёгкое"],
    main:{recipe:"Джин 45 мл + лимонный сок 30 мл + сахарный сироп 15 мл + содовая 60 мл", ingredients:["gin"], taste:"Свежий лимон, джин, лёгкая сладость и газ."},
    who:"Тем, кто хочет кислый коктейль, но не слишком крепкий.",
    extras:[
      {name:"Лимонный сок 30 мл", mode:"required", effect:"Даёт свежесть и кислоту."},
      {name:"Сахарный сироп 15 мл", mode:"required", effect:"Смягчает лимон."},
      {name:"Содовая 60 мл", mode:"required", effect:"Облегчает коктейль и делает его длинным."}
    ],
    serve:"Встряхнуть джин, лимон и сироп со льдом, перелить в высокий стакан и долить содовую.",
    variations:[
      {name:"Суше", recipe:"Джин 50 + лимон 30 + сироп 10 + сода 50", ingredients:["gin"], abv:14, taste:"Чуть крепче и суше."},
      {name:"Мягче", recipe:"Джин 40 + лимон 25 + сироп 15 + сода 70", ingredients:["gin"], abv:10, taste:"Легче и проще для долгого вечера."}
    ]
  },
  {
    name:"Mojito", family:"Классика / long sour", base:"Белый ром", abv:11,
    art:{shape:"highball", c1:"#b9d974", c2:"#e4f0aa", ice:5, garnish:"lime", bubbles:true, bg1:"#0f160f", bg2:"#28472a"},
    desc:"Ром, лайм, мята, сахар и сода. Один из самых популярных освежающих коктейлей.",
    tags:["кислое","ром","мята","лёгкое"],
    main:{recipe:"Белый ром 50 мл + лаймовый сок 25 мл + сахарный сироп 15 мл + мята + содовая 50 мл", ingredients:["rum"], taste:"Свежий лайм, мята, лёгкий ром и газ."},
    who:"Тем, кто хочет максимально свежий и понятный коктейль.",
    extras:[
      {name:"Лаймовый сок 25 мл", mode:"required", effect:"Даёт свежую кислоту."},
      {name:"Мята", mode:"required", effect:"Формирует аромат Mojito."},
      {name:"Сахарный сироп 15 мл", mode:"required", effect:"Балансирует лайм."},
      {name:"Содовая 50 мл", mode:"required", effect:"Делает коктейль лёгким и длинным."}
    ],
    serve:"Мяту не рвать в кашу. Слегка прижать, добавить остальное, лёд и содовую.",
    variations:[
      {name:"Dry Mojito", recipe:"Ром 50 + лайм 25 + сироп 10 + мята + сода 50", ingredients:["rum"], abv:12, taste:"Менее сладкий и более свежий."},
      {name:"Aperol Mojito", recipe:"Ром 40 + Aperol 15 + лайм 20 + сироп 10 + мята + сода 50", ingredients:["rum","aperol"], abv:11, taste:"Апельсиновее и чуть горьковатый."}
    ]
  },
  {
    name:"Cosmopolitan", family:"Современная классика / sour", base:"Водка", abv:17,
    art:{shape:"nick", c1:"#c43c5b", c2:"#ed8ca0", ice:0, garnish:"orange", bg1:"#1a0e13", bg2:"#5c2232"},
    desc:"Кисло-сладкий ягодно-цитрусовый коктейль на водке. Лёгкий по ощущению и очень узнаваемый.",
    tags:["кислое","водка","ягоды","цитрус"],
    main:{recipe:"Водка 40 мл + Triple Sec 20 мл + клюквенный сок 30 мл + лаймовый сок 15 мл", ingredients:["vodka","triple"], taste:"Клюква, лайм, апельсин и мягкая водочная база."},
    who:"Тем, кто любит фруктовые, яркие и не горькие коктейли.",
    extras:[
      {name:"Лаймовый сок 15 мл", mode:"required", effect:"Не даёт уйти в сладкий ягодный сок."},
      {name:"Клюквенный сок 30 мл", mode:"required", effect:"Даёт цвет, ягоду и лёгкую терпкость."},
      {name:"Апельсиновая цедра", mode:"optional", effect:"Подчёркивает Triple Sec."}
    ],
    serve:"Встряхнуть со льдом и процедить в охлаждённый бокал.",
    variations:[
      {name:"Суше", recipe:"Водка 45 + Triple Sec 15 + клюква 25 + лайм 15", ingredients:["vodka","triple"], abv:19, taste:"Меньше фруктовой сладости, больше водки."},
      {name:"Мягче", recipe:"Водка 35 + Triple Sec 20 + клюква 35 + лайм 10", ingredients:["vodka","triple"], abv:15, taste:"Мягче и фруктовее."}
    ]
  },
  {
    name:"Amaretto Sour", family:"Классика / sour", base:"Амаретто", abv:14,
    art:{shape:"rocks", c1:"#b46c24", c2:"#e1ac58", ice:3, garnish:"lemon", bg1:"#17100d", bg2:"#49301b"},
    desc:"Орехово-миндальный sour: сладкий ликёр, лимон и более сухая крепкая база для баланса.",
    tags:["кислое","сладкое","десертное","цитрус"],
    main:{recipe:"Амаретто 45 мл + бурбон 20 мл + лимонный сок 30 мл + сахарный сироп 5 мл", ingredients:["bourbon"], taste:"Миндаль, лимон, ваниль и мягкая висковая глубина."},
    who:"Тем, кто любит более сладкие и десертные коктейли, но с нормальным балансом.",
    extras:[
      {name:"Лимонный сок 30 мл", mode:"required", effect:"Режет сладость Amaretto."},
      {name:"Яичный белок", mode:"optional", effect:"Делает текстуру кремовой и мягкой."},
      {name:"Angostura", mode:"optional", effect:"2 дэша добавят пряность и уберут ощущение приторности."}
    ],
    serve:"Встряхнуть со льдом, процедить на свежий лёд. С белком — dry shake.",
    variations:[
      {name:"Без бурбона", recipe:"Амаретто 60 + лимон 30 + сироп 5", ingredients:[], abv:11, taste:"Слаще, мягче, но менее глубокий."},
      {name:"Суше", recipe:"Амаретто 40 + бурбон 25 + лимон 30", ingredients:["bourbon"], abv:16, taste:"Меньше сладости, виски заметнее."}
    ]
  }
  ,
  {
    name:"Long Island Iced Tea", family:"Кола / классика", base:"Мультибаза", abv:18,
    art:{shape:"highball", c1:"#8b4f22", c2:"#d2a064", ice:5, garnish:"lemon", bubbles:true, bg1:"#17110d", bg2:"#49331e"},
    desc:"Крепкий long drink, который маскируется под чай. Несколько баз, цитрус, сладость и немного колы.",
    tags:["кола","лонг","крепкое","цитрус"],
    main:{recipe:"Водка 15 + джин 15 + белый ром 15 + текила 15 + Triple Sec 15 + лимонный сок 25 + сахарный сироп 15 + кола 30–40", ingredients:["vodka","gin","rum","tequila","triple","cola"], taste:"Цитрусовый, сладко-кислый и очень питкий при высокой алкогольной нагрузке."},
    who:"Тем, кто хочет знакомый вечериночный коктейль и не любит горечь.",
    extras:[
      {name:"Лимонный сок 25 мл", mode:"required", effect:"Обязательная кислота: без неё Long Island становится просто сладкой смесью алкоголя и колы."},
      {name:"Сахарный сироп 10–15 мл", mode:"required", effect:"Балансирует лимон и связывает пять алкогольных компонентов."},
      {name:"Лимонная долька", mode:"optional", effect:"Только аромат и подача."}
    ],
    serve:"Высокий стакан, много льда. Всё кроме колы перемешать, сверху 30–40 мл колы.",
    variations:[
      {name:"Чуть суше", recipe:"Та же база, но сироп 10 и кола 25–30", ingredients:["vodka","gin","rum","tequila","triple","cola"], abv:20, taste:"Меньше сладости, алкогольные базы слышны сильнее."},
      {name:"Без сиропа", recipe:"Водка 15 + джин 15 + ром 15 + текила 15 + Triple Sec 20 + лимон 20 + кола 35", ingredients:["vodka","gin","rum","tequila","triple","cola"], abv:19, taste:"Чуть резче и кислее, зато проще по ингредиентам."}
    ]
  },
  {
    name:"Texas Tea", family:"Кола / Long Island twist", base:"Мультибаза", abv:20,
    art:{shape:"highball", c1:"#70401e", c2:"#bb7b3d", ice:5, garnish:"lemon", bubbles:true, bg1:"#160e0c", bg2:"#4b2c17"},
    desc:"Long Island с дополнительным бурбоном. Более насыщенный и висковый.",
    tags:["кола","лонг","крепкое","виски"],
    main:{recipe:"Водка 10 + джин 10 + белый ром 10 + текила 10 + бурбон 15 + Triple Sec 15 + лимон 25 + сироп 10 + кола 30", ingredients:["vodka","gin","rum","tequila","bourbon","triple","cola"], taste:"Плотнее Long Island: карамель бурбона, цитрус и немного колы."},
    who:"Тем, кто любит Long Island, но хочет более висковый профиль.",
    extras:[
      {name:"Лимонный сок 20–25 мл", mode:"required", effect:"Держит сладость колы и ликёра под контролем."},
      {name:"Сахарный сироп 5–10 мл", mode:"required", effect:"Скругляет кислоту и помогает бурбону не торчать отдельно."},
      {name:"Лимонная цедра", mode:"optional", effect:"Добавляет сухой свежий аромат."}
    ],
    serve:"В высокий стакан со льдом, смешать всё кроме колы, колу сверху.",
    variations:[
      {name:"Мягче", recipe:"Бурбон 10, лимон 20, сироп 15, кола 40", ingredients:["vodka","gin","rum","tequila","bourbon","triple","cola"], abv:18, taste:"Мягче и слаще, виски меньше давит."},
      {name:"Суше", recipe:"Сироп 5, кола 25–30", ingredients:["vodka","gin","rum","tequila","bourbon","triple","cola"], abv:21, taste:"Более крепкий и сухой профиль."}
    ]
  },
  {
    name:"Batanga", family:"Кола / классика", base:"Текила", abv:14,
    art:{shape:"highball", c1:"#3c2115", c2:"#775035", ice:5, garnish:"lime", bubbles:true, bg1:"#11100f", bg2:"#363026"},
    desc:"Текила, лайм, кола и соль. Очень простая структура, но уже с полноценным балансом.",
    tags:["кола","текила","цитрус","солёное"],
    main:{recipe:"Текила 50 мл + лаймовый сок 15 мл + кола 80 мл + щепотка соли", ingredients:["tequila","cola"], taste:"Карамель колы, агава, свежий лайм и лёгкий солёный акцент."},
    who:"Тем, кто любит колу, но хочет яркий и менее сладкий вкус.",
    extras:[
      {name:"Лаймовый сок 15 мл", mode:"required", effect:"Главный баланс Batanga: режет сладость колы и подчёркивает агаву."},
      {name:"Соль / saline", mode:"required", effect:"Даёт фирменный солёный акцент и делает вкус ярче."},
      {name:"Лаймовая долька", mode:"optional", effect:"Аромат и подача."}
    ],
    serve:"Край стакана можно слегка посолить. Лёд → текила → лайм → кола → щепотка соли.",
    variations:[
      {name:"Сухая Batanga", recipe:"Текила 50 + лайм 20 + кола 60 + соль", ingredients:["tequila","cola"], abv:16, taste:"Меньше сладости, ярче лайм и текила."},
      {name:"Aperol Batanga", recipe:"Текила 40 + Aperol 15 + лайм 15 + кола 70 + соль", ingredients:["tequila","aperol","cola"], abv:13, taste:"Мягче, апельсиновее, чуть сложнее обычной Batanga."}
    ]
  },
  {
    name:"Colorado Bulldog", family:"Кола / десертный", base:"Водка", abv:11,
    art:{shape:"highball", c1:"#66503f", c2:"#b99d81", ice:4, garnish:"none", bubbles:true, bg1:"#161312", bg2:"#493d34"},
    desc:"Десертный коктейль: водка, кофейный ликёр, сливки и немного колы.",
    tags:["кола","мягкое","десертное","кофе"],
    main:{recipe:"Водка 30 мл + кофейный ликёр 25 мл + сливки/молоко 30 мл + кола 30 мл", ingredients:["vodka","coffee","cola"], taste:"Сливочно-кофейный, сладкий, карамельный, почти без ощущения крепости."},
    who:"Тем, кто любит сладкие десертные коктейли и не любит горечь.",
    extras:[
      {name:"Сливки / молоко 30 мл", mode:"required", effect:"Формируют сливочное тело; без них это уже другой коктейль."},
      {name:"Щепотка соли / saline", mode:"optional", effect:"2 капли делают кофе и шоколадные ноты ярче, уменьшая приторность."}
    ],
    serve:"Лёд, водка + кофейный ликёр + сливки, аккуратно добавить колу и слегка перемешать.",
    variations:[
      {name:"Покрепче", recipe:"Водка 40 + кофейный ликёр 25 + сливки 25 + кола 25", ingredients:["vodka","coffee","cola"], abv:14, taste:"Меньше десертности, алкоголь заметнее."},
      {name:"Легче", recipe:"Водка 25 + кофейный ликёр 20 + сливки 35 + кола 35", ingredients:["vodka","coffee","cola"], abv:9, taste:"Очень мягкий и сладкий."}
    ]
  },
  {
    name:"Cuba Libre", family:"Кола / классика", base:"Белый ром", abv:13,
    art:{shape:"highball", c1:"#4a2816", c2:"#8f6337", ice:5, garnish:"lime", bubbles:true, bg1:"#111211", bg2:"#393426"},
    desc:"Да, он простой, но лайм реально меняет баланс и делает напиток заметно суше и свежее обычного ром-колы.",
    tags:["кола","ром","цитрус","классика"],
    main:{recipe:"Белый ром 50 мл + лаймовый сок 15 мл + кола 90 мл", ingredients:["rum","cola"], taste:"Ром, карамель и свежий лайм; живее и суше обычного ром-колы."},
    who:"Тем, кто любит привычные вкусы, но хочет нормальный коктейль.",
    extras:[
      {name:"Лаймовый сок 15 мл", mode:"required", effect:"Именно он превращает ром-колу в Cuba Libre: добавляет кислоту и свежесть."},
      {name:"Лаймовая долька / цедра", mode:"optional", effect:"Усиливает аромат свежего лайма."}
    ],
    serve:"Много льда, ром → лайм → кола. Аккуратно перемешать.",
    variations:[
      {name:"Суше", recipe:"Белый ром 50 + лайм 20 + кола 70", ingredients:["rum","cola"], abv:15, taste:"Ярче лайм, меньше сладости."},
      {name:"Aperol Cuba", recipe:"Белый ром 40 + Aperol 15 + лайм 15 + кола 70", ingredients:["rum","aperol","cola"], abv:13, taste:"Апельсиновее и мягче, при этом лайм не даёт уйти в сладость."}
    ]
  }

];

const baseOptions=["Все","Бурбон","Ирландский виски","Джин","Белый ром","Jägermeister","Aperol","Текила","Водка","Бренди","Амаретто","Мультибаза"];
const styleOptions=["Все вкусы","мягкое","лёгкое","крепкое","горькое","кислое","сухое","виски","джин","апельсин","кола"];

let selectedBase="Все", selectedStyle="Все вкусы", search="";
let pantryActive=false, pantry=new Set();
let pantryRecipeMode="main";

function chip(label, active, handler){
  const b=document.createElement("button"); b.className="chip"+(active?" active":""); b.textContent=label; b.onclick=handler; return b;
}
function renderFilters(){
  const bf=document.getElementById("baseFilters"), sf=document.getElementById("styleFilters");
  bf.innerHTML=""; sf.innerHTML="";
  baseOptions.forEach(x=>bf.appendChild(chip(x,selectedBase===x,()=>{selectedBase=x;render();})));
  styleOptions.forEach(x=>sf.appendChild(chip(x,selectedStyle===x,()=>{selectedStyle=x;render();})));
}
function canMake(recipe){
  if(!pantryActive) return true;
  return recipe.ingredients.every(i=>pantry.has(i));
}
function makeableNames(c){
  const arr=[];
  if(canMake(c.main)) arr.push("Основной");
  if(pantryRecipeMode==="variations"){
    c.variations.forEach(v=>{ if(canMake(v)) arr.push(v.name); });
  }
  return arr;
}
function searchable(c){
  return [
    c.name,c.family,c.desc,c.base,c.who,c.serve,...c.tags,
    c.main.recipe,c.main.taste,
    ...c.variations.flatMap(v=>[v.name,v.recipe,v.taste])
  ].join(" ").toLowerCase();
}
function matches(c){
  const txt=searchable(c), q=search.trim().toLowerCase();
  const baseOK=selectedBase==="Все"||c.base===selectedBase;
  const styleOK=selectedStyle==="Все вкусы"||c.tags.includes(selectedStyle)||txt.includes(selectedStyle.toLowerCase());
  const searchOK=!q||txt.includes(q);
  const pantryOK=!pantryActive||makeableNames(c).length>0;
  return baseOK&&styleOK&&searchOK&&pantryOK;
}
function variationHTML(v){
  const ok=canMake(v);
  return `<div class="variation ${pantryActive&&!ok?'unavailable':''}">
    <div class="variation-head"><div class="variation-name">${v.name}</div><div class="variation-abv">≈ ${v.abv}°</div></div>
    <div class="variation-recipe">${v.recipe}</div>
    <div class="variation-taste">${v.taste}</div>
    ${pantryActive && pantryRecipeMode==="variations"?`<div class="variation-state">${ok?'✓ Можно сделать':'Не хватает ингредиентов'}</div>`:""}
  </div>`;
}

// SVG illustrations
function svgArt(a){
  const bg = `
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${a.bg1}"/>
        <stop offset="100%" stop-color="${a.bg2}"/>
      </linearGradient>
      <linearGradient id="liquid" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${a.c2}"/>
        <stop offset="100%" stop-color="${a.c1}"/>
      </linearGradient>
      <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(255,255,255,.40)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,.12)"/>
      </linearGradient>
      <filter id="blurGlow"><feGaussianBlur stdDeviation="18" /></filter>
    </defs>`;
  const commonBg = `
    <rect width="800" height="450" fill="url(#bg)"/>
    <ellipse cx="600" cy="75" rx="120" ry="50" fill="rgba(255,180,90,.18)" filter="url(#blurGlow)"/>
    <rect x="0" y="340" width="800" height="110" fill="rgba(0,0,0,.18)"/>
    <rect x="0" y="335" width="800" height="6" fill="rgba(255,255,255,.05)"/>
    <ellipse cx="400" cy="352" rx="180" ry="26" fill="rgba(0,0,0,.22)"/>
  `;
  const iceCube=(x,y,w,h,r=8,rot=0,op=.38)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" transform="rotate(${rot} ${x+w/2} ${y+h/2})" fill="rgba(220,245,255,${op})" stroke="rgba(255,255,255,.28)" stroke-width="2"/>`;
  const bubbles=a.bubbles ? Array.from({length:10},(_,i)=>`<circle cx="${445 + (i*17)%70}" cy="${255 - i*18}" r="${3 + (i%3)}" fill="rgba(255,255,255,.35)"/>`).join('') : '';
  const garnish = {
    peel:`<path d="M518 152c18-12 40-11 55 3c-19 14-39 16-61 9c1-5 3-9 6-12z" fill="#ff9d30" stroke="#ffd18a" stroke-width="3"/>`,
    twist:`<path d="M520 150c30-18 55-15 65 5c-20 10-42 14-64 6c-6-3-6-7-1-11z" fill="#ff9524" stroke="#ffd08d" stroke-width="3"/>`,
    lemon:`<path d="M520 150c18-14 44-14 57 1c-14 13-37 18-57 12c-10-3-10-9 0-13z" fill="#f4cc5e" stroke="#fff1a4" stroke-width="3"/>`,
    orange:`<circle cx="548" cy="150" r="22" fill="#ff9530" stroke="#ffd08c" stroke-width="4"/><path d="M548 128v44M526 150h44M533 135l30 30M563 135l-30 30" stroke="rgba(255,255,255,.35)" stroke-width="2"/>`,
    cherry:`<circle cx="556" cy="142" r="12" fill="#b3202b"/><path d="M556 131c5-16 13-25 25-33" stroke="#679257" stroke-width="4" fill="none"/>`,
    lime:`<path d="M527 136a24 24 0 1 0 42 24z" fill="#9ed158" stroke="#dff3b2" stroke-width="3"/>`
  }[a.garnish] || '';

  if(a.shape==="rocks"){
    return `
    <svg viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      ${bg}${commonBg}
      <g transform="translate(0,5)">
        <path d="M290 120h220l-20 170c-3 26-21 40-46 40H356c-25 0-43-14-46-40z" fill="rgba(255,255,255,.09)" stroke="rgba(255,255,255,.44)" stroke-width="6"/>
        <path d="M316 188h168l-10 92c-2 20-15 29-34 29h-80c-19 0-32-9-34-29z" fill="url(#liquid)"/>
        ${iceCube(350,182,54,56,10,-14,.48)}
        ${iceCube(396,196,54,54,10,12,.42)}
        ${a.ice>2?iceCube(430,175,48,48,10,-8,.34):''}
        <path d="M308 128h184" stroke="rgba(255,255,255,.45)" stroke-width="7" stroke-linecap="round"/>
        <path d="M350 140c10-8 24-13 38-14" stroke="rgba(255,255,255,.18)" stroke-width="5" stroke-linecap="round"/>
        ${garnish}
      </g>
    </svg>`;
  }
  if(a.shape==="highball"){
    return `
    <svg viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      ${bg}${commonBg}
      <g transform="translate(0,0)">
        <path d="M340 88h120l-15 248c-2 24-16 34-35 34h-20c-19 0-33-10-35-34z" fill="rgba(255,255,255,.09)" stroke="rgba(255,255,255,.44)" stroke-width="6"/>
        <path d="M356 176h88l-10 152c-1 16-10 22-22 22h-24c-12 0-21-6-22-22z" fill="url(#liquid)"/>
        ${iceCube(370,165,35,44,8,-12,.52)}
        ${iceCube(403,196,35,42,8,9,.42)}
        ${iceCube(367,223,35,42,8,7,.37)}
        ${iceCube(404,245,34,40,8,-10,.35)}
        ${a.ice>4?iceCube(388,278,34,36,8,5,.32):''}
        ${bubbles}
        <path d="M350 96h100" stroke="rgba(255,255,255,.46)" stroke-width="6" stroke-linecap="round"/>
        <path d="M436 88l32 72" stroke="rgba(212,230,235,.52)" stroke-width="6"/>
        ${garnish}
      </g>
    </svg>`;
  }
  if(a.shape==="wine"){
    return `
    <svg viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      ${bg}${commonBg}
      <g transform="translate(0,-4)">
        <path d="M400 120c78 0 112 51 96 109c-15 55-62 86-96 86s-81-31-96-86c-16-58 18-109 96-109z" fill="rgba(255,255,255,.09)" stroke="rgba(255,255,255,.42)" stroke-width="6"/>
        <path d="M326 205c2 40 28 83 74 83s72-43 74-83z" fill="url(#liquid)"/>
        ${iceCube(356,194,34,36,8,-10,.38)}
        ${iceCube(390,205,36,38,8,12,.35)}
        ${iceCube(425,196,34,36,8,-7,.32)}
        ${bubbles}
        <rect x="394" y="312" width="12" height="62" rx="6" fill="rgba(255,255,255,.28)"/>
        <ellipse cx="400" cy="382" rx="58" ry="10" fill="rgba(255,255,255,.22)"/>
        ${garnish}
      </g>
    </svg>`;
  }
  // nick & nora / coupe-like
  return `
    <svg viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      ${bg}${commonBg}
      <g transform="translate(0,-6)">
        <path d="M300 132h200c-6 57-49 109-100 109s-94-52-100-109z" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.42)" stroke-width="6"/>
        <path d="M326 160h148c-10 36-38 60-74 60s-64-24-74-60z" fill="url(#liquid)"/>
        ${a.ice?iceCube(382,165,34,34,8,10,.22):''}
        <rect x="394" y="241" width="12" height="86" rx="6" fill="rgba(255,255,255,.28)"/>
        <ellipse cx="400" cy="335" rx="66" ry="10" fill="rgba(255,255,255,.22)"/>
        <path d="M298 132h204" stroke="rgba(255,255,255,.48)" stroke-width="6" stroke-linecap="round"/>
        ${garnish}
      </g>
    </svg>`;
}
function artHTML(a){ return svgArt(a); }

function card(c){
  const m=makeableNames(c);
  const el=document.createElement("article"); el.className="card";
  el.innerHTML=`
    <div class="photo">${artHTML(c.art)}</div>
    <div class="card-body">
      <div class="topline">
        <div><div class="title">${c.name}</div><div class="family">${c.family}</div></div>
        <div class="badges">
          ${c.premium?`<div class="premium-badge"><span class="icon">★</span> PREMIUM</div>`:""}
          <div class="abv">≈ ${c.abv}°</div>
        </div>
      </div>
      <div class="desc">${c.desc}</div>
      <div class="tags">${c.tags.map(t=>`<span class="tag">${t}</span>`).join("")}</div>
      <div class="makeable ${pantryActive?'show':''}"><b>${pantryRecipeMode==="main"?"Доступен основной рецепт":"Доступные рецепты"}:</b> ${m.join(", ")}</div>
      <div class="section-title">Основной рецепт</div>
      <div class="recipe"><b>${c.main.recipe}</b></div>
      <div class="section-title">Вкус</div><div class="taste">${c.main.taste}</div>
      <div class="who"><b>Кому дать:</b> ${c.who}</div>

      ${c.extras&&c.extras.length?`
        <div class="section-title">Добавки</div>
        <div class="extras-card-list">
          ${c.extras.map(x=>`
            <div class="extra-row">
              <div class="extra-top">
                <b>${x.name}</b>
                <span class="extra-badge ${x.mode}">${x.mode==="required"?"Нужно":x.mode==="recommended"?"Совет":"По желанию"}</span>
              </div>
              <div class="extra-effect">${x.effect}</div>
            </div>`).join("")}
        </div>
      `:""}

      <div class="section-title">Как делать</div><div class="serve">${c.serve}</div>
      <details ${pantryActive && pantryRecipeMode==="variations" && !canMake(c.main) ? "open" : ""}>
        <summary>Вариации (${c.variations.length})</summary>
        ${c.variations.map(v=>{
          const ok=canMake(v);
          return `<div class="variation ${pantryActive&&!ok?'unavailable':''}">
            <div class="variation-head"><div class="variation-name">${v.name}</div><div class="variation-abv">≈ ${v.abv}°</div></div>
            <div class="variation-recipe">${v.recipe}</div>
            <div class="variation-taste">${v.taste}</div>
            ${pantryActive && pantryRecipeMode==="variations"?`<div class="variation-state">${ok?'✓ Можно сделать':'Не хватает ингредиентов'}</div>`:""}
          </div>`;
        }).join("")}
      </details>
    </div>`;
  return el;
}

function renderPantrySummary(){
  const el=document.getElementById("pantrySummary");
  if(!pantryActive){el.className="pantry-summary"; el.textContent=""; return;}
  const labels=[...pantry].map(k=>ING[k].label);
  el.className="pantry-summary show";
  el.innerHTML=`<b>Подбор по бару:</b> ${labels.length?labels.join(", "):"ничего не выбрано"}<br><b>Режим:</b> ${pantryRecipeMode==="main"?"только основные рецепты":"с учётом вариаций"}`;
}
function render(){
  const bf=document.getElementById("baseFilters"), sf=document.getElementById("styleFilters");
  bf.innerHTML=""; sf.innerHTML="";
  baseOptions.forEach(x=>bf.appendChild(chip(x,selectedBase===x,()=>{selectedBase=x;render();})));
  styleOptions.forEach(x=>sf.appendChild(chip(x,selectedStyle===x,()=>{selectedStyle=x;render();})));
  renderPantrySummary();

  const list=cocktails.filter(c=>{
    const txt=[
      c.name,c.family,c.desc,c.base,c.who,c.serve,...c.tags,c.main.recipe,c.main.taste,
      ...c.variations.flatMap(v=>[v.name,v.recipe,v.taste])
    ].join(" ").toLowerCase();
    const q=search.trim().toLowerCase();
    const baseOK=selectedBase==="Все"||c.base===selectedBase;
    const styleOK=selectedStyle==="Все вкусы"||c.tags.includes(selectedStyle)||txt.includes(selectedStyle.toLowerCase());
    const searchOK=!q||txt.includes(q);
    const pantryOK=!pantryActive||makeableNames(c).length>0;
    return baseOK&&styleOK&&searchOK&&pantryOK;
  });

  document.getElementById("count").textContent=`Показано: ${list.length} из ${cocktails.length}`;
  const g=document.getElementById("grid");
  g.innerHTML="";
  if(!list.length){
    g.innerHTML='<div class="empty">Из выбранных ингредиентов ничего не нашлось. Добавь ещё бутылку или сбрось подбор.</div>';
    return;
  }
  list.forEach(c=>g.appendChild(card(c)));
}

function renderIngredientPicker(){
  const box=document.getElementById("ingredients"); box.innerHTML="";
  Object.entries(ING).forEach(([key,info])=>{
    const label=document.createElement("label"); label.className="ingredient";
    label.innerHTML=`<input type="checkbox" data-ing="${key}" ${pantry.has(key)?"checked":""}>
      <span><b>${info.label}</b><small>${info.note}</small></span>`;
    box.appendChild(label);
  });
}

const dlg=document.getElementById("pantryDialog");
document.getElementById("pantryBtn").onclick=()=>{
  renderIngredientPicker();
  const mode=dlg.querySelector('input[name="pantryRecipeMode"][value="'+pantryRecipeMode+'"]');
  if(mode) mode.checked=true;
  dlg.showModal();
};
document.getElementById("closePantry").onclick=()=>dlg.close();
document.getElementById("clearPantry").onclick=()=>{
  dlg.querySelectorAll('input[type="checkbox"]').forEach(x=>x.checked=false);
};
document.getElementById("applyPantry").onclick=()=>{
  pantry=new Set([...dlg.querySelectorAll('input[type="checkbox"]:checked')].map(x=>x.dataset.ing));
  const selectedMode=dlg.querySelector('input[name="pantryRecipeMode"]:checked');
  pantryRecipeMode=selectedMode?selectedMode.value:"main";
  pantryActive=pantry.size>0;
  dlg.close(); render();
};
document.getElementById("search").addEventListener("input",e=>{search=e.target.value;render();});
document.getElementById("resetBtn").onclick=()=>{
  selectedBase="Все"; selectedStyle="Все вкусы"; search=""; pantryActive=false; pantry.clear(); pantryRecipeMode="main";
  document.getElementById("search").value=""; render();
};



const BASIC_BASKET = [
  {
    name:"Ядро бара",
    level:"Ядро",
    cls:"core",
    items:["Бурбон","Джин","Сладкий красный вермут","Сухой вермут","Campari","Aperol","Triple Sec"],
    note:"Главная корзина под наш профиль: Boulevardier, Negroni, Old Pal, Lucien Gaudin, Gin & It и большинство Premium-вариаций."
  },
  {
    name:"Добавить следующим",
    level:"Очень желательно",
    cls:"recommended",
    items:["Ирландский виски","Белый ром","Angostura bitters"],
    note:"Сильно расширяет меню без лишних бутылок: Irish Manhattan-ish, Rum Bitter, Daiquiri/Mojito и нормальные виски-твисты."
  },
  {
    name:"Расширить бар",
    level:"Расширение",
    cls:"expand",
    items:["Текила","Jägermeister"],
    note:"Текила открывает Margarita и Batanga; Jägermeister — отдельную травяную ветку. Брать после ядра."
  },
  {
    name:"Только если реально любите",
    level:"На любителя",
    cls:"niche",
    items:["Водка","Бренди","Амаретто","Кофейный ликёр"],
    note:"Не плохие категории, просто они почти не нужны для нашего основного топа. Имеют смысл под конкретные любимые коктейли."
  }
];

const SHOPPING_GUIDE = [
  {category:"Бурбон",note:"Boulevardier, Old Pal, Whiskey Sour, Bourbon Orange Bitter",options:[
    {tier:"Бюджет",cls:"",name:"Jim Beam White 700 мл",price:"≈ Rp 380k",why:"Отличная рабочая бутылка для смешивания."},
    {tier:"Цена/качество",cls:"value",name:"Bulleit Bourbon 700 мл",price:"≈ Rp 680k",why:"Суше и прянее; лучше держится рядом с Campari и вермутом."},
    {tier:"Хороший",cls:"good",name:"Jim Beam Black 750 мл",price:"≈ Rp 725k",why:"Больше дуба и карамели без ухода за миллион."}]},
  {category:"Ирландский виски",note:"Irish Manhattan-ish, Irish Aperol Cooler",options:[
    {tier:"Бюджет",cls:"",name:"Emerald Glens Green 700 мл",price:"≈ Rp 380k",why:"Недорогая мягкая база для коктейлей."},
    {tier:"Цена/качество",cls:"value",name:"Jameson 700 мл",price:"≈ Rp 450k",why:"Самый универсальный и понятный выбор."},
    {tier:"Хороший",cls:"good",name:"Jameson Black Barrel 700 мл",price:"≈ Rp 790k",why:"Больше ванили, дерева и тела."}]},
  {category:"Джин",note:"Negroni, Gin & It, Gimlet, White Lady, Tom Collins",options:[
    {tier:"Бюджет",cls:"",name:"Seagram's Dry / Gordon's Dry",price:"≈ Rp 285k",why:"Оба нормальны для Negroni и sour."},
    {tier:"Цена/качество",cls:"value",name:"Tanqueray Dry 750 мл",price:"≈ Rp 450k",why:"Яркий можжевельник, хорошо пробивается через Campari и вермут."},
    {tier:"Хороший",cls:"good",name:"Roku Gin 700 мл",price:"≈ Rp 550k",why:"Тоньше и ароматнее; особенно хорош в более чистых джиновых коктейлях."}]},  {category:"Белый ром",note:"Daiquiri, Mojito, Cuba Libre, Rum Bitter, Long Island",options:[
    {tier:"Бюджет",cls:"",name:"Robinson Light Rum 680 мл",price:"≈ Rp 250k",why:"Рабочая недорогая база."},
    {tier:"Цена/качество",cls:"value",name:"Bacardi Carta Blanca 750 мл",price:"≈ Rp 300k",why:"Универсальный чистый профиль."},
    {tier:"Хороший",cls:"good",name:"Havana Club 3 Años 750 мл",price:"≈ Rp 450k",why:"Выразительнее; особенно хорош в Daiquiri и Cuba Libre."}]},
  {category:"Текила",note:"Margarita, Batanga, Long Island, Texas Tea",options:[
    {tier:"Бюджет",cls:"",name:"Jose Cuervo Especial Reposado 750 мл",price:"≈ Rp 375k",why:"Нормально для коктейлей при ограниченном бюджете."},
    {tier:"Цена/качество",cls:"value",name:"El Jimador Reposado 750 мл",price:"≈ Rp 560k",why:"Лучший разумный апгрейд для Margarita/Batanga."},
    {tier:"Хороший",cls:"good",name:"Espolòn Blanco 750 мл",price:"≈ Rp 830k",why:"Чистая агавовая база; хорош и в коктейлях, и отдельно."}]},
  {category:"Водка",note:"Cosmopolitan, Long Island, Colorado Bulldog",options:[
    {tier:"Бюджет",cls:"",name:"Smirnoff Red 700 мл",price:"≈ Rp 250k",why:"Для коктейлей практически всё, что нужно от водки."},
    {tier:"Цена/качество",cls:"value",name:"Stoli Premium 700 мл",price:"≈ Rp 490k",why:"Чище и мягче; универсальный выбор."},
    {tier:"Хороший",cls:"good",name:"Grey Goose 750 мл",price:"≈ Rp 650k",why:"Гладкая, но в Long Island переплата уже почти теряется."}]},
  {category:"Сладкий красный вермут",note:"Negroni, Boulevardier, Gin & It",options:[
    {tier:"Бюджет",cls:"",name:"Martini Rosso 1 л",price:"≈ Rp 410k",why:"Большая бутылка и узнаваемый профиль."},
    {tier:"Цена/качество",cls:"value",name:"Cinzano Rosso 750 мл",price:"≈ Rp 450k",why:"Чуть прянее и плотнее."},
    {tier:"Хороший",cls:"good",name:"Martini Rosso / Cinzano Rosso",price:"≈ Rp 410–450k",why:"Для этого меню важнее свежесть бутылки после открытия, чем премиум-бренд."}]},
  {category:"Сухой вермут",note:"Old Pal, Lucien Gaudin, dry-вариации",options:[
    {tier:"Бюджет",cls:"",name:"Martini Extra Dry 1 л",price:"≈ Rp 430k",why:"Лучший практический выбор по объёму и цене."},
    {tier:"Цена/качество",cls:"value",name:"Cinzano Extra Dry 750 мл",price:"≈ Rp 450k",why:"Чуть более травянистый профиль."},
    {tier:"Хороший",cls:"good",name:"Martini Extra Dry",price:"≈ Rp 430k",why:"Лучше свежая бутылка в холодильнике, чем дорогой редкий премиум."}]},
  {category:"Апельсиновый ликёр",note:"White Lady, Margarita, Cosmopolitan, Lucien Gaudin, Long Island",options:[
    {tier:"Бюджет",cls:"",name:"Balimoon Triple Sec 700 мл",price:"≈ Rp 230k",why:"Локальный недорогой вариант для больших миксов."},
    {tier:"Цена/качество",cls:"value",name:"Vibe / Robinson Triple Sec",price:"≈ Rp 245–250k",why:"Нормальные миксовые варианты без переплаты."},
    {tier:"Хороший",cls:"good",name:"Cointreau 700 мл",price:"≈ Rp 430k",why:"Суше, чище и ароматнее; в Margarita и White Lady разница слышна."}]},
  {category:"Aperol / Campari / Jägermeister",note:"Здесь бренд фактически и есть продукт",options:[
    {tier:"Мягкий",cls:"",name:"Aperol 700 мл",price:"≈ Rp 450k",why:"Мягкие Boulevardier/Negroni и лёгкие highball."},
    {tier:"Горький",cls:"value",name:"Campari 750 мл",price:"≈ Rp 690k",why:"Ключевая бутылка для классических Negroni/Boulevardier."},
    {tier:"Травяной",cls:"good",name:"Jägermeister 700 мл",price:"≈ Rp 370k",why:"Нужен, если нравятся именно травяные варианты."}]},
  {category:"Кофейный ликёр",note:"Colorado Bulldog и десертные коктейли",options:[
    {tier:"Бюджет",cls:"",name:"Balimoon Coffee 700 мл",price:"≈ Rp 230k",why:"Локальный недорогой вариант."},
    {tier:"Цена/качество",cls:"value",name:"Kahlúa 750 мл",price:"≈ Rp 430k",why:"Классический кофе-карамельный профиль."},
    {tier:"Хороший",cls:"good",name:"Kahlúa 750 мл",price:"≈ Rp 430k",why:"Для наших коктейлей уже нет большого смысла искать дороже."}]},
  {category:"Биттеры",note:"Расход — несколько капель, одной бутылки хватает надолго",options:[
    {tier:"Главный",cls:"value",name:"Angostura Aromatic Bitters 200 мл",price:"≈ Rp 350k",why:"Самая полезная маленькая бутылка для висковых и sour-твистов."},
    {tier:"Вторым",cls:"good",name:"Orange bitters",price:"зависит от бренда",why:"Полезен для Martini/Martinez-подобных и сухих джиновых коктейлей."}]}
];

function renderShopping(){
  const box=document.getElementById("shoppingList");
  const guide=document.getElementById("basicBasket");
  if(guide){
    guide.innerHTML=`
      <div class="basket-title">Базовая корзина под наш вкус</div>
      <div class="basket-sub">Сначала категории алкоголя, которые реально покрывают любимые коктейли. Ниже уже — конкретные бутылки по бюджету.</div>
      <div class="basket-groups">
        ${BASIC_BASKET.map(g=>`
          <div class="basket-group">
            <div class="basket-group-head">
              <div class="basket-group-name">${g.name}</div>
              <div class="basket-level ${g.cls}">${g.level}</div>
            </div>
            <div class="basket-items">${g.items.map(i=>`<span class="basket-item">${i}</span>`).join("")}</div>
            <div class="basket-note">${g.note}</div>
          </div>`).join("")}
      </div>`;
  }
  box.innerHTML=SHOPPING_GUIDE.map(cat=>`
    <section class="shop-cat">
      <div class="shop-cat-title">${cat.category}</div>
      <div class="shop-cat-note">${cat.note}</div>
      <div class="shop-options">${cat.options.map(o=>`
        <div class="shop-option">
          <div class="shop-option-top"><div><div class="shop-name">${o.name}</div><div class="shop-price">${o.price}</div></div><div class="shop-tier ${o.cls}">${o.tier}</div></div>
          <div class="shop-why">${o.why}</div>
        </div>`).join("")}</div>
    </section>`).join("");
}
const shoppingDlg=document.getElementById("shoppingDialog");
document.getElementById("shoppingBtn").onclick=()=>{renderShopping();shoppingDlg.showModal();};
document.getElementById("closeShopping").onclick=()=>shoppingDlg.close();

render();


let copyToastTimer=null;
async function copyTextValue(text){
  const value=String(text||"").replace(/\s+/g," ").trim();
  if(!value) return;
  let ok=false;
  try{
    if(navigator.clipboard && window.isSecureContext){
      await navigator.clipboard.writeText(value);
      ok=true;
    }
  }catch(_){}
  if(!ok){
    try{
      const ta=document.createElement("textarea");
      ta.value=value;
      ta.setAttribute("readonly","");
      ta.style.position="fixed";
      ta.style.opacity="0";
      ta.style.pointerEvents="none";
      document.body.appendChild(ta);
      ta.select();
      ok=document.execCommand("copy");
      ta.remove();
    }catch(_){}
  }
  const toast=document.getElementById("copyToast");
  if(toast){
    toast.textContent=(ok?"Скопировано: ":"Не удалось скопировать: ")+value;
    toast.classList.add("show");
    clearTimeout(copyToastTimer);
    copyToastTimer=setTimeout(()=>toast.classList.remove("show"),1800);
  }
}

function installCopyTargets(){
  const selectors=[
    ".title",
    ".variation-name",
    ".ingredient b",
    ".extra-top b",
    ".basket-item",
    ".shop-name",
    ".shop-cat-title"
  ];
  document.querySelectorAll(selectors.join(",")).forEach(el=>{
    el.classList.add("copyable");
    el.title="Нажмите, чтобы скопировать";
  });
}

document.addEventListener("click",e=>{
  const el=e.target.closest(".copyable");
  if(!el) return;
  const text=el.dataset.copyText || el.textContent;
  copyTextValue(text);
});

const copyObserver=new MutationObserver(()=>installCopyTargets());
copyObserver.observe(document.body,{childList:true,subtree:true});
installCopyTargets();
