const ING = {
  bourbon:{label:"Бурбон", note:"Любой bourbon", c:"#b8662a"},
  irish:{label:"Ирландский виски", note:"Мягкий Irish", c:"#d0923f"},
  gin:{label:"Джин", note:"London dry", c:"#bfe0db"},
  rum:{label:"Белый ром", note:"Лёгкий white rum", c:"#e9e2cf"},
  tequila:{label:"Текила", note:"Blanco / reposado", c:"#e6d27e"},
  vodka:{label:"Водка", note:"Любая чистая", c:"#dfe9ef"},
  brandy:{label:"Бренди", note:"Коньяк / brandy", c:"#9b4c22"},
  sweetV:{label:"Красный вермут", note:"Rosso, сладкий", c:"#7c1b29"},
  dryV:{label:"Сухой вермут", note:"Extra Dry", c:"#d6cf9e"},
  bitter:{label:"Campari", note:"Горький красный", c:"#cf1d24"},
  aperol:{label:"Aperol", note:"Мягкий апельсин", c:"#f2691b"},
  triple:{label:"Triple Sec", note:"Апельсиновый ликёр", c:"#f2a73a"},
  jager:{label:"Jägermeister", note:"Травяной ликёр", c:"#35502e"},
  amaretto:{label:"Амаретто", note:"Миндальный ликёр", c:"#a35e24"},
  coffee:{label:"Кофейный ликёр", note:"Kahlúa и т.п.", c:"#3e2618"},
  cola:{label:"Кола", note:"Миксер", c:"#3a1a12"}
};

const cocktails = [
  {name:"Godfather", premium:true, family:"Семья Корлеоне", base:"Бурбон", abv:27,
    art:{shape:"rocks", c1:"#7a3d12", c2:"#c97a2e", ice:2, garnish:"none", bg1:"#1b0f0a", bg2:"#4e2a12"},
    desc:"Виски и миндаль. Предложение, от которого невозможно отказаться.",
    tags:["Корлеоне","крепкое","виски","мягкое","вечер"],
    main:{recipe:"Бурбон 45 мл + амаретто 25 мл", ingredients:["bourbon","amaretto"], taste:"Бурбон, марципан, тёплая карамель."},
    who:"Тем, кто любит виски, но без горечи.",
    extras:[{name:"Большой кубик льда", mode:"recommended", effect:"Тает медленно — вкус не разбавляется."},{name:"Апельсиновая цедра", mode:"optional", effect:"Свежее и ярче."}],
    serve:"Стакан с большим кубиком льда. Налить и мешать 15 секунд.",
    variations:[
      {name:"Мягче", recipe:"Бурбон 40 + амаретто 30", ingredients:["bourbon","amaretto"], abv:25, taste:"Слаще, миндаль впереди."},
      {name:"Irish Godfather", recipe:"Ирландский виски 45 + амаретто 25", ingredients:["irish","amaretto"], abv:26, taste:"Мягче и фруктовее."}]},
  {name:"Godmother", family:"Семья Корлеоне", base:"Водка", abv:25,
    art:{shape:"rocks", c1:"#b9853e", c2:"#ead09a", ice:3, garnish:"none", bg1:"#19120b", bg2:"#4d3a1d"},
    desc:"Младшая сестра Godfather: водка и амаретто. Чисто и мягко.",
    tags:["Корлеоне","мягкое","сладкое"],
    main:{recipe:"Водка 45 мл + амаретто 25 мл", ingredients:["vodka","amaretto"], taste:"Миндаль, ваниль, чистый спирт без резкости."},
    who:"Любителям сладкого и мягкого.",
    extras:[{name:"Лимонная цедра", mode:"optional", effect:"Убирает приторность."}],
    serve:"Стакан со льдом. Налить и мешать 15 секунд.",
    variations:[
      {name:"Godchild", recipe:"Водка 30 + амаретто 30 + сливки 30", ingredients:["vodka","amaretto"], abv:18, taste:"Десерт в стакане."},
      {name:"Суше", recipe:"Водка 50 + амаретто 15", ingredients:["vodka","amaretto"], abv:28, taste:"Крепче, миндаль тише."}]},
  {name:"French Connection", family:"Семья Корлеоне", base:"Бренди", abv:27,
    art:{shape:"rocks", c1:"#6e2c10", c2:"#b8642a", ice:2, garnish:"none", bg1:"#180c08", bg2:"#4a2112"},
    desc:"Коньяк и амаретто. Французский родственник семьи.",
    tags:["Корлеоне","крепкое","мягкое","вечер"],
    main:{recipe:"Бренди 45 мл + амаретто 25 мл", ingredients:["brandy","amaretto"], taste:"Сухофрукты, дуб, миндаль."},
    who:"Тем, кто любит коньяк после ужина.",
    extras:[{name:"Апельсиновая цедра", mode:"optional", effect:"Освежает плотный вкус."}],
    serve:"Стакан со льдом. Налить и мешать 15 секунд.",
    variations:[
      {name:"Мягче", recipe:"Бренди 40 + амаретто 30", ingredients:["brandy","amaretto"], abv:25, taste:"Слаще и круглее."},
      {name:"French Kiss", recipe:"Бренди 40 + амаретто 20 + Triple Sec 10", ingredients:["brandy","amaretto","triple"], abv:26, taste:"Появляется апельсин."}]},
  {name:"Espresso Martini", premium:true, family:"Современная классика", base:"Водка", abv:16,
    art:{shape:"nick", c1:"#2a1710", c2:"#6b4630", ice:0, garnish:"none", bg1:"#120b08", bg2:"#3b2418"},
    desc:"Кофе, водка и плотная пенка. Будит и веселит одновременно.",
    tags:["кофе","мягкое","десертное","вечер"],
    main:{recipe:"Водка 45 мл + кофейный ликёр 25 мл + эспрессо 30 мл + сахарный сироп 5 мл", ingredients:["vodka","coffee"], taste:"Крепкий кофе, лёгкая сладость, бархатная пенка."},
    who:"Всем, кто не хочет, чтобы вечер заканчивался.",
    extras:[{name:"Свежий эспрессо 30 мл", mode:"required", effect:"Без него не будет ни вкуса, ни пенки."},{name:"Щепотка соли", mode:"optional", effect:"Кофе ярче, горечь мягче."},{name:"Три кофейных зерна", mode:"optional", effect:"Классическое украшение."}],
    serve:"Сварить эспрессо и чуть остудить. Встряхнуть со льдом очень сильно 15 секунд. Процедить в охлаждённый бокал — сверху плотная пенка.",
    variations:[
      {name:"Покрепче", recipe:"Водка 50 + кофейный ликёр 20 + эспрессо 30", ingredients:["vodka","coffee"], abv:18, taste:"Суше, кофе строже."},
      {name:"Amaretto Espresso", recipe:"Водка 30 + амаретто 15 + кофейный ликёр 20 + эспрессо 30", ingredients:["vodka","amaretto","coffee"], abv:15, taste:"Миндаль и кофе."},
      {name:"Tequila Espresso", recipe:"Текила 45 + кофейный ликёр 25 + эспрессо 30", ingredients:["tequila","coffee"], abv:16, taste:"Агава даёт землистость."}]},
  {name:"Americano", family:"Классика · лёгкий", base:"Campari", abv:9,
    art:{shape:"highball", c1:"#8c1a1d", c2:"#e0443a", ice:5, garnish:"orange", bubbles:true, bg1:"#170b0b", bg2:"#4f1715"},
    desc:"Campari, вермут и содовая. Negroni, который можно пить весь вечер.",
    tags:["горькое","лёгкое","апельсин","классика"],
    main:{recipe:"Campari 40 мл + сладкий красный вермут 40 мл + содовая 80 мл", ingredients:["bitter","sweetV"], taste:"Горький апельсин, травы, пузырьки."},
    who:"Для начала вечера и тем, кому Negroni крепковат.",
    extras:[{name:"Содовая 80 мл", mode:"required", effect:"Лёгкость и пузырьки."},{name:"Долька апельсина", mode:"recommended", effect:"Аромат и цвет."}],
    serve:"Высокий стакан со льдом. Campari и вермут, сверху содовая, мягко перемешать. Долька апельсина.",
    variations:[
      {name:"Aperol Americano", recipe:"Aperol 40 + сладкий красный вермут 40 + содовая 80", ingredients:["aperol","sweetV"], abv:8, taste:"Мягче и слаще."},
      {name:"Сухой", recipe:"Campari 40 + сладкий красный вермут 20 + сухой вермут 20 + содовая 80", ingredients:["bitter","sweetV","dryV"], abv:9, taste:"Меньше сладости."}]},
  {name:"Cardinale", family:"Классика · джин", base:"Джин", abv:26,
    art:{shape:"nick", c1:"#9e1521", c2:"#e2414a", ice:0, garnish:"lemon", bg1:"#160a0b", bg2:"#521418"},
    desc:"Negroni на сухом вермуте. Строже, светлее, элегантнее.",
    tags:["горькое","сухое","крепкое","джин"],
    main:{recipe:"Джин 40 мл + Campari 25 мл + сухой вермут 25 мл", ingredients:["gin","bitter","dryV"], taste:"Можжевельник, сухая горечь, цитрус."},
    who:"Тем, кому Negroni сладковат.",
    extras:[{name:"Лимонная цедра", mode:"recommended", effect:"Свежесть и аромат."}],
    serve:"Мешать со льдом 25 секунд. Процедить в охлаждённый бокал. Лимонная цедра.",
    variations:[
      {name:"Мягче", recipe:"Джин 40 + Campari 15 + Aperol 10 + сухой вермут 25", ingredients:["gin","bitter","aperol","dryV"], abv:25, taste:"Горечь мягче."},
      {name:"На льду", recipe:"Джин 40 + Campari 25 + сухой вермут 25, в стакане со льдом", ingredients:["gin","bitter","dryV"], abv:22, taste:"Проще и легче пить."}]},
  {name:"Manhattan", premium:true, family:"Классика · бурбон", base:"Бурбон", abv:28,
    art:{shape:"nick", c1:"#6a1e14", c2:"#b6522c", ice:0, garnish:"cherry", bg1:"#160a08", bg2:"#4a1d12"},
    desc:"Король виски-коктейлей. Бурбон, вермут и пряность.",
    tags:["крепкое","виски","классика","вечер"],
    main:{recipe:"Бурбон 60 мл + сладкий красный вермут 30 мл", ingredients:["bourbon","sweetV"], taste:"Карамель, вишня, пряности."},
    who:"Ценителям виски.",
    extras:[{name:"Angostura", mode:"recommended", effect:"2 дэша — без них это просто виски с вермутом."},{name:"Коктейльная вишня", mode:"optional", effect:"Классика."},{name:"Апельсиновая цедра", mode:"optional", effect:"Свежее."}],
    serve:"Мешать со льдом 30 секунд. Процедить в охлаждённый бокал. Вишня или цедра.",
    variations:[
      {name:"Perfect Manhattan", recipe:"Бурбон 60 + сладкий красный вермут 15 + сухой вермут 15", ingredients:["bourbon","sweetV","dryV"], abv:28, taste:"Суше и сложнее."},
      {name:"Brandy Manhattan", recipe:"Бренди 60 + сладкий красный вермут 30", ingredients:["brandy","sweetV"], abv:27, taste:"Мягче, фруктовее."}]},
  {name:"Dry Martini", premium:true, family:"Классика · джин", base:"Джин", abv:30,
    art:{shape:"nick", c1:"#cfd7c8", c2:"#f1f4e6", ice:0, garnish:"lemon", bg1:"#0f1210", bg2:"#2f3a33"},
    desc:"Самый строгий коктейль в мире. Только джин, вермут и холод.",
    tags:["крепкое","сухое","джин","классика"],
    main:{recipe:"Джин 60 мл + сухой вермут 15 мл", ingredients:["gin","dryV"], taste:"Ледяной можжевельник, сухие травы."},
    who:"Тем, кто любит крепкое и чистое.",
    extras:[{name:"Лимонная цедра или оливка", mode:"recommended", effect:"Цедра — свежесть, оливка — солоноватость."},{name:"Orange bitters", mode:"optional", effect:"1 дэш — объём."}],
    serve:"Всё должно быть ледяным. Мешать со льдом 30 секунд. Процедить в замороженный бокал.",
    variations:[
      {name:"Vodka Martini", recipe:"Водка 60 + сухой вермут 10", ingredients:["vodka","dryV"], abv:30, taste:"Чище и нейтральнее."},
      {name:"Wet Martini", recipe:"Джин 50 + сухой вермут 25", ingredients:["gin","dryV"], abv:26, taste:"Мягче, больше трав."},
      {name:"Dirty", recipe:"Джин 60 + сухой вермут 10 + рассол оливок 10", ingredients:["gin","dryV"], abv:28, taste:"Солёный и пикантный."}]},
  {name:"Black Russian", family:"Классика · кофе", base:"Водка", abv:26,
    art:{shape:"rocks", c1:"#1c0f0a", c2:"#4a2a1a", ice:3, garnish:"none", bg1:"#0e0907", bg2:"#2d1a10"},
    desc:"Водка и кофейный ликёр. Два ингредиента — и уже вечер.",
    tags:["крепкое","кофе","десертное"],
    main:{recipe:"Водка 50 мл + кофейный ликёр 25 мл", ingredients:["vodka","coffee"], taste:"Кофе, карамель, крепость."},
    who:"Кофеманам.",
    extras:[{name:"Лимонная цедра", mode:"optional", effect:"Неожиданно освежает."}],
    serve:"Стакан со льдом. Налить и мешать 10 секунд.",
    variations:[
      {name:"С колой", recipe:"Водка 40 + кофейный ликёр 20 + кола 60", ingredients:["vodka","coffee","cola"], abv:15, taste:"Легче и веселее."},
      {name:"Мягче", recipe:"Водка 40 + кофейный ликёр 30", ingredients:["vodka","coffee"], abv:24, taste:"Слаще."}]},
  {name:"White Russian", family:"Классика · кофе", base:"Водка", abv:17,
    art:{shape:"rocks", c1:"#8a6a52", c2:"#e8d9c4", ice:3, garnish:"none", bg1:"#15100c", bg2:"#43352a"},
    desc:"Кофе со сливками и характером. Любимый напиток Чувака.",
    tags:["мягкое","кофе","десертное"],
    main:{recipe:"Водка 40 мл + кофейный ликёр 20 мл + сливки 30 мл", ingredients:["vodka","coffee"], taste:"Сливки, кофе, ваниль."},
    who:"Тем, кто не любит вкус алкоголя.",
    extras:[{name:"Сливки 30 мл", mode:"required", effect:"Без них это Black Russian."}],
    serve:"Стакан со льдом. Водка и ликёр, сверху аккуратно сливки. Размешать перед глотком.",
    variations:[
      {name:"Amaretto Russian", recipe:"Водка 30 + кофейный ликёр 15 + амаретто 15 + сливки 30", ingredients:["vodka","coffee","amaretto"], abv:17, taste:"С миндалём."},
      {name:"Лёгкий", recipe:"Водка 30 + кофейный ликёр 20 + молоко 60", ingredients:["vodka","coffee"], abv:12, taste:"Почти кофе с молоком."}]},
  {name:"El Presidente", family:"Классика · ром", base:"Белый ром", abv:24,
    art:{shape:"nick", c1:"#b8442a", c2:"#f08a55", ice:0, garnish:"peel", bg1:"#170c08", bg2:"#552315"},
    desc:"Кубинская классика 1920-х. Ром, сухой вермут и апельсин.",
    tags:["сухое","крепкое","ром","апельсин"],
    main:{recipe:"Белый ром 45 мл + сухой вермут 25 мл + Triple Sec 10 мл + гренадин 5 мл", ingredients:["rum","dryV","triple"], taste:"Лёгкий ром, апельсин, сухая сладость."},
    who:"Тем, кто любит Manhattan, но хочет полегче.",
    extras:[{name:"Гренадин 5 мл", mode:"recommended", effect:"Цвет и мягкая сладость. Можно заменить сиропом."},{name:"Апельсиновая цедра", mode:"optional", effect:"Аромат."}],
    serve:"Мешать со льдом 25 секунд. Процедить в охлаждённый бокал. Апельсиновая цедра.",
    variations:[
      {name:"Без гренадина", recipe:"Белый ром 45 + сухой вермут 25 + Triple Sec 10", ingredients:["rum","dryV","triple"], abv:25, taste:"Суше."},
      {name:"Rosso", recipe:"Белый ром 45 + сладкий красный вермут 20 + Triple Sec 10", ingredients:["rum","sweetV","triple"], abv:23, taste:"Слаще и темнее."}]},
  {name:"Kamikaze", family:"Шоты · компания", base:"Водка", abv:22,
    art:{shape:"nick", c1:"#cfe08a", c2:"#f2f7c8", ice:0, garnish:"lime", bg1:"#10130c", bg2:"#34401f"},
    desc:"Водка, апельсин, лайм. Разливается по шотам на всю компанию.",
    tags:["кислое","цитрус","крепкое","шоты"],
    main:{recipe:"Водка 30 мл + Triple Sec 15 мл + лаймовый сок 15 мл", ingredients:["vodka","triple"], taste:"Кислый лайм, апельсин, лёгкий удар."},
    who:"Компании, когда пора тост.",
    extras:[{name:"Лаймовый сок 15 мл", mode:"required", effect:"Основа вкуса."}],
    serve:"Встряхнуть со льдом 10 секунд. Разлить по шотам.",
    variations:[
      {name:"Long Kamikaze", recipe:"Водка 40 + Triple Sec 20 + лайм 20 + содовая 60", ingredients:["vodka","triple"], abv:12, taste:"Высокий и освежающий."},
      {name:"Lemon Drop", recipe:"Водка 40 + Triple Sec 15 + лимон 20 + сироп 10", ingredients:["vodka","triple"], abv:20, taste:"Лимонный и сладковатый."}]},
  {name:"Boulevardier", premium:true, family:"Классика · бурбон", base:"Бурбон", abv:24,
    art:{shape:"rocks", c1:"#7c240f", c2:"#cf5d25", ice:3, garnish:"peel", bg1:"#2a120d", bg2:"#5a2614"},
    desc:"Плотный виски с травяной горечью и карамелью. Главный коктейль вечера.",
    tags:["крепкое","горькое","виски","вечер"],
    main:{recipe:"Бурбон 50 мл + Campari 25 мл + сладкий красный вермут 25 мл", ingredients:["bourbon","bitter","sweetV"], taste:"Виски, карамель, горькие травы, апельсин."},
    who:"Любителям виски и заметной горечи.",
    extras:[{name:"Апельсиновая цедра", mode:"optional", effect:"Ярче апельсиновый аромат без сладости."},{name:"Angostura", mode:"optional", effect:"1–2 дэша — прянее, суше и глубже."}],
    serve:"Стакан со льдом, мешать 20–25 секунд. Апельсиновая цедра.",
    variations:[
      {name:"Aperol Boulevardier", recipe:"Бурбон 50 + Aperol 25 + сладкий красный вермут 25", ingredients:["bourbon","aperol","sweetV"], abv:22, taste:"Мягче, слаще, апельсиновее. Отличный входной вариант."},
      {name:"Split", recipe:"Бурбон 50 + Campari 12.5 + Aperol 12.5 + сладкий красный вермут 25", ingredients:["bourbon","bitter","aperol","sweetV"], abv:23, taste:"Баланс между характером Campari и мягкостью Aperol."},
      {name:"Dry", recipe:"Бурбон 50 + Campari 25 + сладкий красный вермут 15 + сухой вермут 10", ingredients:["bourbon","bitter","sweetV","dryV"], abv:24, taste:"Суше, строже, бурбон сильнее."}]},
  {name:"Negroni", premium:true, family:"Классика · джин", base:"Джин", abv:22,
    art:{shape:"rocks", c1:"#a51f1a", c2:"#d14b27", ice:2, garnish:"twist", bg1:"#1b0f13", bg2:"#52222b"},
    desc:"Травяной, можжевеловый и горький. Классика с характером.",
    tags:["горькое","джин","классика","крепкое"],
    main:{recipe:"Джин 35 мл + Campari 30 мл + сладкий красный вермут 30 мл", ingredients:["gin","bitter","sweetV"], taste:"Можжевельник, травы, вермут и чистая горечь."},
    who:"Тем, кто любит горечь и джин.",
    extras:[{name:"Апельсиновая цедра", mode:"optional", effect:"Классический аромат, цитрус ярче."},{name:"Orange bitters", mode:"optional", effect:"1–2 дэша — суше и сложнее."},{name:"Содовая 20–30 мл", mode:"optional", effect:"Легче и ниже крепость, без сахара."}],
    serve:"Много льда, мешать 15–20 секунд. Апельсиновая цедра.",
    variations:[
      {name:"Aperol Negroni", recipe:"Джин 40 + Aperol 25 + сладкий красный вермут 25", ingredients:["gin","aperol","sweetV"], abv:21, taste:"Мягче и цитрусовее — для тех, кому классика горька."},
      {name:"Split", recipe:"Джин 40 + Campari 15 + Aperol 15 + сладкий красный вермут 25", ingredients:["gin","bitter","aperol","sweetV"], abv:22, taste:"Горечь есть, но апельсин заметен."},
      {name:"Dry", recipe:"Джин 40 + Campari 25 + сладкий красный вермут 20 + сухой вермут 10", ingredients:["gin","bitter","sweetV","dryV"], abv:23, taste:"Суше, джин выходит вперёд."}]},
  {name:"Old Pal", premium:true, family:"Классика · бурбон", base:"Бурбон", abv:24,
    art:{shape:"rocks", c1:"#b34922", c2:"#ef9a3f", ice:2, garnish:"lemon", bg1:"#26140f", bg2:"#694021"},
    desc:"Сухой и строгий брат Boulevardier. Когда сладкий вермут надоел.",
    tags:["сухое","крепкое","виски","горькое"],
    main:{recipe:"Бурбон 45 мл + Campari 25 мл + сухой вермут 25 мл", ingredients:["bourbon","bitter","dryV"], taste:"Сухой, крепкий, горьковатый, с виски."},
    who:"Если Boulevardier кажется сладким.",
    extras:[{name:"Лимонная цедра", mode:"optional", effect:"Суше и свежее аромат."},{name:"Orange bitters", mode:"optional", effect:"1–2 дэша — сухая цитрусовая пряность."}],
    serve:"Мешать со льдом ~20 секунд. Лимонная или апельсиновая цедра.",
    variations:[
      {name:"Мягкий Old Pal", recipe:"Бурбон 45 + Campari 10 + Aperol 15 + сухой вермут 25", ingredients:["bourbon","bitter","aperol","dryV"], abv:23, taste:"Сухой, но горечь мягче."},
      {name:"Aperol Old Pal", recipe:"Бурбон 45 + Aperol 25 + сухой вермут 25", ingredients:["bourbon","aperol","dryV"], abv:22, taste:"Цитрусовый, почти без горечи."}]},
  {name:"Lucien Gaudin", premium:true, family:"Классика · джин", base:"Джин", abv:26,
    art:{shape:"nick", c1:"#b24a27", c2:"#efb05b", ice:1, garnish:"orange", bg1:"#201013", bg2:"#5b2f1c"},
    desc:"Сухой цитрусово-горький. Сложнее и парфюмнее Negroni.",
    tags:["сухое","цитрус","крепкое","джин"],
    main:{recipe:"Джин 30 мл + Campari 15 мл + Triple Sec 15 мл + сухой вермут 15 мл", ingredients:["gin","bitter","triple","dryV"], taste:"Сухой апельсин, джин, лёгкая сладость и горчинка."},
    who:"Хочется крепко, цитрусово и не банально.",
    extras:[{name:"Апельсиновая цедра", mode:"optional", effect:"Подчёркивает Triple Sec."},{name:"Orange bitters", mode:"optional", effect:"1 дэш — сухой апельсин."}],
    serve:"Мешать 15–20 секунд, процедить в холодный бокал. Цедра.",
    variations:[
      {name:"Мягче", recipe:"Джин 30 + Campari 10 + Aperol 5 + Triple Sec 15 + сухой вермут 15", ingredients:["gin","bitter","aperol","triple","dryV"], abv:25, taste:"Круглее, меньше горечи."},
      {name:"Суше", recipe:"Джин 35 + Campari 15 + Triple Sec 10 + сухой вермут 15", ingredients:["gin","bitter","triple","dryV"], abv:27, taste:"Меньше сладости, больше джина."}]},
  {name:"Gin & It", premium:true, family:"Классика · джин", base:"Джин", abv:25,
    art:{shape:"rocks", c1:"#7f2331", c2:"#b44258", ice:3, garnish:"lemon", bg1:"#17131b", bg2:"#3f2936"},
    desc:"Джин и красный вермут. Минимализм почти без горечи.",
    tags:["джин","травяное","простое","крепкое"],
    main:{recipe:"Джин 50 мл + сладкий красный вермут 25 мл", ingredients:["gin","sweetV"], taste:"Джин впереди, затем сладкие травы."},
    who:"Любят джин, но не горечь.",
    extras:[{name:"Лимонная цедра", mode:"optional", effect:"Свежее и суше."},{name:"Orange bitters", mode:"optional", effect:"1–2 дэша — структура и цитрус."}],
    serve:"Лёд, мешать 15–20 секунд. Цедра лимона или апельсина.",
    variations:[
      {name:"Bitter", recipe:"Джин 50 + сладкий красный вермут 25 + Campari 5", ingredients:["gin","sweetV","bitter"], abv:24, taste:"Глубже, лёгкая горчинка."},
      {name:"Aperol", recipe:"Джин 50 + сладкий красный вермут 25 + Aperol 10", ingredients:["gin","sweetV","aperol"], abv:23, taste:"Мягче и фруктовее."},
      {name:"Dry", recipe:"Джин 50 + сладкий красный вермут 15 + сухой вермут 10", ingredients:["gin","sweetV","dryV"], abv:26, taste:"Суше и чище."}]},
  {name:"Irish Manhattan-ish", premium:true, family:"Твист · ирландский виски", base:"Ирландский виски", abv:25,
    art:{shape:"nick", c1:"#954e1a", c2:"#d7903a", ice:0, garnish:"cherry", bg1:"#23140f", bg2:"#4f2e20"},
    desc:"Мягкий виски, сладкий вермут и капля горечи.",
    tags:["мягкое","виски","крепкое","не горькое"],
    main:{recipe:"Ирландский виски 50 мл + сладкий красный вермут 25 мл + Campari 5 мл", ingredients:["irish","sweetV","bitter"], taste:"Мягкий виски, винные травы, лёгкая горечь."},
    who:"Любят виски, но не тяжёлый бурбон.",
    extras:[{name:"Angostura", mode:"recommended", effect:"2 дэша — почти настоящий Manhattan."},{name:"Апельсиновая цедра", mode:"optional", effect:"Аромат и мягкость."},{name:"Коктейльная вишня", mode:"optional", effect:"Классическая подача, фруктовая нота."}],
    serve:"Мешать со льдом ~20 секунд. Апельсиновая цедра.",
    variations:[
      {name:"Aperol", recipe:"Ирландский виски 50 + сладкий красный вермут 20 + Aperol 10", ingredients:["irish","sweetV","aperol"], abv:23, taste:"Ещё мягче и апельсиновее."},
      {name:"Dry", recipe:"Ирландский виски 50 + сладкий красный вермут 15 + сухой вермут 10 + Campari 5", ingredients:["irish","sweetV","dryV","bitter"], abv:25, taste:"Суше, виски заметнее."}]},
  {name:"Bourbon Orange Bitter", premium:true, family:"Авторский · бурбон", base:"Бурбон", abv:24,
    art:{shape:"rocks", c1:"#a73c11", c2:"#ff7c21", ice:2, garnish:"orange", bg1:"#24140d", bg2:"#5a2713"},
    desc:"Виски в главной роли, Aperol и Campari — апельсиново-горький фон.",
    tags:["виски","апельсин","крепкое","мягкая горечь"],
    main:{recipe:"Бурбон 50 мл + Aperol 15 мл + Campari 5 мл + сладкий красный вермут 15 мл", ingredients:["bourbon","aperol","bitter","sweetV"], taste:"Бурбон, затем апельсин и умеренная горечь."},
    who:"Хочется больше виски, чем в Boulevardier.",
    extras:[{name:"Апельсиновая цедра", mode:"recommended", effect:"Связывает Aperol и бурбон."},{name:"Angostura", mode:"optional", effect:"1–2 дэша — прянее и взрослее."}],
    serve:"Много льда, мешать 20–25 секунд. Апельсиновая цедра.",
    variations:[
      {name:"Мягче", recipe:"Бурбон 50 + Aperol 20 + сладкий красный вермут 15", ingredients:["bourbon","aperol","sweetV"], abv:23, taste:"Слаще, почти без горечи."},
      {name:"Суше", recipe:"Бурбон 50 + Aperol 15 + сладкий красный вермут 10 + сухой вермут 10 + Campari 5", ingredients:["bourbon","aperol","sweetV","dryV","bitter"], abv:24, taste:"Строже, виски ярче."},
      {name:"Orange", recipe:"Основной + Triple Sec 5", ingredients:["bourbon","aperol","bitter","sweetV","triple"], abv:24, taste:"Ярче апельсин, но слаще."}]},
  {name:"Aperol Gin Highball", premium:true, family:"Авторский · лёгкий", base:"Джин", abv:18,
    art:{shape:"highball", c1:"#ff7e2b", c2:"#ffb35f", ice:4, garnish:"orange", bubbles:true, bg1:"#1a1111", bg2:"#5b3419"},
    desc:"Лёгкий и универсальный: газ, апельсин, джин, почти без кислоты.",
    tags:["лёгкое","мягкое","джин","вечеринка"],
    main:{recipe:"Джин 45 мл + Aperol 20 мл + сухой вермут 10 мл + содовая 30–40 мл", ingredients:["gin","aperol","dryV"], taste:"Свежий, апельсиновый, суховатый."},
    who:"Легче крепких, но без стакана колы.",
    extras:[{name:"Апельсиновая цедра", mode:"optional", effect:"Усиливает аромат Aperol."},{name:"Saline", mode:"optional", effect:"2–3 капли — вкус ярче, горечь мягче."}],
    serve:"Лёд → алкоголь → перемешать → содовая в конце.",
    variations:[
      {name:"Горче", recipe:"Основной + Campari 5", ingredients:["gin","aperol","dryV","bitter"], abv:19, taste:"Строже и суше."},
      {name:"Плотнее", recipe:"Джин 45 + Aperol 20 + сухой вермут 10 + содовая 20", ingredients:["gin","aperol","dryV"], abv:21, taste:"Больше вкуса в глотке."},
      {name:"Без сухого вермута", recipe:"Джин 45 + Aperol 20 + содовая 30", ingredients:["gin","aperol"], abv:19, taste:"Проще и мягче."}]},
  {name:"Rum Bitter", premium:true, family:"Авторский · белый ром", base:"Белый ром", abv:23,
    art:{shape:"highball", c1:"#d2732c", c2:"#f0c776", ice:4, garnish:"lime", bg1:"#131619", bg2:"#3e3321"},
    desc:"Белый ром без колы и литра сока.",
    tags:["ром","цитрус","сухое","средне-крепкое"],
    main:{recipe:"Белый ром 50 мл + Aperol 20 мл + сухой вермут 15 мл + Campari 5 мл", ingredients:["rum","aperol","dryV","bitter"], taste:"Лёгкий ром, сухой апельсин, немного горечи."},
    who:"Любят ром, но не сладкие лонги.",
    extras:[{name:"Лаймовая цедра", mode:"optional", effect:"Свежесть без кислоты."},{name:"Saline", mode:"optional", effect:"2–3 капли — ром ярче, горечь мягче."}],
    serve:"Мешать со льдом 15–20 секунд. Апельсиновая цедра.",
    variations:[
      {name:"Мягче", recipe:"Белый ром 50 + Aperol 20 + сухой вермут 15", ingredients:["rum","aperol","dryV"], abv:23, taste:"Фруктовее, без горечи."},
      {name:"Темнее", recipe:"Белый ром 50 + Aperol 20 + сладкий красный вермут 10 + сухой вермут 10", ingredients:["rum","aperol","sweetV","dryV"], abv:22, taste:"Слаще и округлее."},
      {name:"Горче", recipe:"Белый ром 50 + Aperol 15 + Campari 10 + сухой вермут 15", ingredients:["rum","aperol","bitter","dryV"], abv:23, taste:"Ярче, суше, горче."}]},
  {name:"Jäger Aperol", premium:true, family:"Авторский · травяной", base:"Jägermeister", abv:17,
    art:{shape:"highball", c1:"#8f4018", c2:"#de7d2e", ice:4, garnish:"orange", bubbles:true, bg1:"#15100e", bg2:"#4e2817"},
    desc:"Травы и апельсин, легче чистого Jäger.",
    tags:["мягкое","травяное","лёгкое","ягер"],
    main:{recipe:"Jägermeister 35 мл + Aperol 20 мл + содовая 20–30 мл", ingredients:["jager","aperol"], taste:"Травы, сладкий апельсин."},
    who:"Любят Jäger, но мягче шота.",
    extras:[{name:"Апельсиновая цедра", mode:"optional", effect:"Смягчает аптечность Jäger."},{name:"Лимонная цедра", mode:"optional", effect:"Суше и свежее."}],
    serve:"Много льда, быстро перемешать, содовая последней.",
    variations:[
      {name:"Суше", recipe:"Jägermeister 35 + Aperol 15 + сухой вермут 10", ingredients:["jager","aperol","dryV"], abv:24, taste:"Менее сладкий, заметно крепче."},
      {name:"Крепче", recipe:"Jägermeister 35 + Aperol 15, без содовой", ingredients:["jager","aperol"], abv:28, taste:"Плотный и крепкий."},
      {name:"Горче", recipe:"Jägermeister 35 + Aperol 20 + Campari 5 + содовая 20–30", ingredients:["jager","aperol","bitter"], abv:18, taste:"Жёстче и сложнее."}]},
  {name:"Aperol Rosso Soda", family:"Бонус · очень лёгкий", base:"Aperol", abv:8,
    art:{shape:"wine", c1:"#d76033", c2:"#f5a15a", ice:3, garnish:"orange", bubbles:true, bg1:"#1d1010", bg2:"#4a1f18"},
    desc:"Для тех, кто «только не крепкое и не горькое».",
    tags:["очень лёгкое","мягкое","сладковатое","для новичка"],
    main:{recipe:"Aperol 30 мл + сладкий красный вермут 25 мл + содовая 40 мл", ingredients:["aperol","sweetV"], taste:"Сладкий апельсин, вино, лёгкие травы."},
    who:"Не хотят ни крепкого, ни горького.",
    extras:[{name:"Апельсиновая долька / цедра", mode:"optional", effect:"Аромат и красивая подача."},{name:"Saline", mode:"optional", effect:"1–2 капли убирают приторность."}],
    serve:"Много льда, быстро перемешать, содовая в конце.",
    variations:[
      {name:"Суше", recipe:"Aperol 30 + сладкий красный вермут 15 + сухой вермут 10 + содовая 40", ingredients:["aperol","sweetV","dryV"], abv:8, taste:"Меньше сладости."},
      {name:"Плотнее", recipe:"Aperol 30 + сладкий красный вермут 25 + содовая 20", ingredients:["aperol","sweetV"], abv:10, taste:"Насыщеннее."}]},
  {name:"Irish Aperol Cooler", family:"Бонус · мягкий виски", base:"Ирландский виски", abv:16,
    art:{shape:"highball", c1:"#ca6a2b", c2:"#f4aa67", ice:4, garnish:"orange", bubbles:true, bg1:"#1b120d", bg2:"#503321"},
    desc:"Мост между лёгким Aperol и настоящим виски-коктейлем.",
    tags:["мягкое","виски","апельсин","вечеринка"],
    main:{recipe:"Ирландский виски 35 мл + Aperol 20 мл + сладкий красный вермут 10 мл + содовая 30–40 мл", ingredients:["irish","aperol","sweetV"], taste:"Мягкий виски, апельсин, немного вермута."},
    who:"Без горечи и джина, но чтобы чувствовался алкоголь.",
    extras:[{name:"Апельсиновая цедра", mode:"optional", effect:"Ароматнее."},{name:"Angostura", mode:"optional", effect:"1 дэш — если слишком просто."}],
    serve:"Лёд → алкоголь → перемешать → содовая.",
    variations:[
      {name:"Суше", recipe:"Ирландский виски 35 + Aperol 15 + сухой вермут 10 + содовая 30", ingredients:["irish","aperol","dryV"], abv:17, taste:"Меньше сладости, больше виски."},
      {name:"Плотнее", recipe:"Ирландский виски 40 + Aperol 20 + сладкий красный вермут 10 + содовая 20", ingredients:["irish","aperol","sweetV"], abv:19, taste:"Насыщеннее и крепче."}]},
  {name:"Whiskey Sour", family:"Классика · sour", base:"Бурбон", abv:17,
    art:{shape:"rocks", c1:"#d08924", c2:"#f2c35d", ice:3, garnish:"lemon", bg1:"#1d140d", bg2:"#5a3a16"},
    desc:"Виски, лимон и сладость в балансе. Ярко, но не кисло.",
    tags:["кислое","виски","классика","цитрус"],
    main:{recipe:"Бурбон 50 мл + лимонный сок 25 мл + сахарный сироп 15 мл", ingredients:["bourbon"], taste:"Виски, лимон, мягкая сладость."},
    who:"Виски, но свежее и легче.",
    extras:[{name:"Лимонный сок 25 мл", mode:"required", effect:"Кислота и свежесть."},{name:"Сахарный сироп 15 мл", mode:"required", effect:"Баланс лимона."},{name:"Angostura", mode:"optional", effect:"2 дэша — пряность."},{name:"Белок", mode:"optional", effect:"Плотная пена, шёлковая текстура."}],
    serve:"Встряхнуть со льдом, процедить на свежий лёд. С белком — сначала без льда.",
    variations:[
      {name:"Boston Sour", recipe:"Whiskey Sour + яичный белок", ingredients:["bourbon"], abv:16, taste:"Мягче и кремовее."},
      {name:"New York Sour", recipe:"Whiskey Sour + 15 мл красного вина сверху", ingredients:["bourbon"], abv:17, taste:"Фруктовее и эффектнее."}]},
  {name:"Daiquiri", family:"Классика · sour", base:"Белый ром", abv:18,
    art:{shape:"nick", c1:"#d7c878", c2:"#f5efa9", ice:0, garnish:"lime", bg1:"#11150f", bg2:"#33452a"},
    desc:"Ром, лайм, сахар. Решает только баланс.",
    tags:["кислое","ром","классика","цитрус"],
    main:{recipe:"Белый ром 60 мл + лаймовый сок 25 мл + сахарный сироп 15 мл", ingredients:["rum"], taste:"Чистый ром, яркий лайм."},
    who:"Любят свежее и сухое.",
    extras:[{name:"Лаймовый сок 25 мл", mode:"required", effect:"Кислота и свежесть."},{name:"Сахарный сироп 15 мл", mode:"required", effect:"Собирает баланс."}],
    serve:"Хорошо встряхнуть со льдом, процедить в холодный бокал.",
    variations:[
      {name:"Суше", recipe:"Белый ром 60 + лайм 25 + сироп 10", ingredients:["rum"], abv:19, taste:"Ром заметнее."},
      {name:"Мягче", recipe:"Белый ром 50 + лайм 20 + сироп 15", ingredients:["rum"], abv:17, taste:"Проще для новичка."}]},
  {name:"Margarita", family:"Классика · sour", base:"Текила", abv:20,
    art:{shape:"nick", c1:"#d9d26f", c2:"#f3eea8", ice:0, garnish:"lime", bg1:"#11130f", bg2:"#3a4323"},
    desc:"Текила, лайм и апельсиновый ликёр.",
    tags:["кислое","текила","классика","цитрус"],
    main:{recipe:"Текила 50 мл + Triple Sec 25 мл + лаймовый сок 25 мл", ingredients:["tequila","triple"], taste:"Агава, лайм, апельсин."},
    who:"Яркий цитрус и текила.",
    extras:[{name:"Лаймовый сок 25 мл", mode:"required", effect:"Кислота и свежесть."},{name:"Соль", mode:"optional", effect:"Подчёркивает агаву, смягчает кислоту."},{name:"Сироп агавы 5–10 мл", mode:"optional", effect:"Мягче."}],
    serve:"Встряхнуть со льдом. По желанию — соляной край.",
    variations:[
      {name:"Tommy's Margarita", recipe:"Текила 50 + лайм 25 + сироп агавы 15", ingredients:["tequila"], abv:18, taste:"Мягче, без ликёра."},
      {name:"Aperol Margarita", recipe:"Текила 45 + Triple Sec 15 + Aperol 15 + лайм 25", ingredients:["tequila","triple","aperol"], abv:19, taste:"Апельсиновее, с горчинкой."}]},
  {name:"White Lady", family:"Классика · sour", base:"Джин", abv:22,
    art:{shape:"nick", c1:"#e5d59a", c2:"#fff1c0", ice:0, garnish:"lemon", bg1:"#16140e", bg2:"#4a4024"},
    desc:"Джин, апельсиновый ликёр, лимон. Сухо и чисто.",
    tags:["кислое","джин","классика","цитрус"],
    main:{recipe:"Джин 40 мл + Triple Sec 30 мл + лимонный сок 20 мл", ingredients:["gin","triple"], taste:"Джин, апельсин, лимон."},
    who:"Джин и чистые sour.",
    extras:[{name:"Лимонный сок 20 мл", mode:"required", effect:"Кислота и собранность."},{name:"Яичный белок", mode:"optional", effect:"Мягче, шёлковая текстура."}],
    serve:"Встряхнуть со льдом, процедить. С белком — сначала без льда.",
    variations:[
      {name:"Мягче", recipe:"Джин 40 + Triple Sec 25 + лимон 15", ingredients:["gin","triple"], abv:23, taste:"Меньше кислоты."},
      {name:"Суше", recipe:"Джин 45 + Triple Sec 20 + лимон 20", ingredients:["gin","triple"], abv:24, taste:"Джин заметнее."}]},
  {name:"Sidecar", family:"Классика · sour", base:"Бренди", abv:22,
    art:{shape:"nick", c1:"#c98538", c2:"#efbd74", ice:0, garnish:"orange", bg1:"#1b120d", bg2:"#5a361c"},
    desc:"Бренди, апельсин, лимон. Теплее и богаче White Lady.",
    tags:["кислое","бренди","классика","цитрус"],
    main:{recipe:"Бренди 50 мл + Triple Sec 25 мл + лимонный сок 25 мл", ingredients:["brandy","triple"], taste:"Тёплый бренди, апельсин, лимон."},
    who:"Округлые ароматные sour.",
    extras:[{name:"Лимонный сок 25 мл", mode:"required", effect:"Баланс сладости."},{name:"Сахарный ободок", mode:"optional", effect:"Мягкий первый глоток."}],
    serve:"Встряхнуть со льдом, процедить в холодный бокал.",
    variations:[
      {name:"Суше", recipe:"Бренди 50 + Triple Sec 20 + лимон 25", ingredients:["brandy","triple"], abv:23, taste:"Бренди ярче."},
      {name:"Мягче", recipe:"Бренди 45 + Triple Sec 25 + лимон 20", ingredients:["brandy","triple"], abv:21, taste:"Фруктовее."}]},
  {name:"Gimlet", family:"Классика · sour", base:"Джин", abv:24,
    art:{shape:"nick", c1:"#c9d67c", c2:"#ecf2b7", ice:0, garnish:"lime", bg1:"#10140d", bg2:"#344323"},
    desc:"Джин и лайм без лишнего шума.",
    tags:["кислое","джин","классика","цитрус"],
    main:{recipe:"Джин 60 мл + лаймовый сок 25 мл + сахарный сироп 15 мл", ingredients:["gin"], taste:"Сухой джин, яркий лайм."},
    who:"Джин и резкий цитрус.",
    extras:[{name:"Лаймовый сок 25 мл", mode:"required", effect:"Главный вкус."},{name:"Сахарный сироп 15 мл", mode:"required", effect:"Баланс лайма."},{name:"Лаймовая цедра", mode:"optional", effect:"Аромат без кислоты."}],
    serve:"Встряхнуть со льдом и процедить.",
    variations:[
      {name:"Суше", recipe:"Джин 60 + лайм 25 + сироп 10", ingredients:["gin"], abv:25, taste:"Резче и суше."},
      {name:"Aperol Gimlet", recipe:"Джин 50 + Aperol 15 + лайм 20 + сироп 10", ingredients:["gin","aperol"], abv:20, taste:"Мягче, апельсиновее."}]},
  {name:"Tom Collins", family:"Классика · long sour", base:"Джин", abv:12,
    art:{shape:"highball", c1:"#d7c983", c2:"#f5efbd", ice:5, garnish:"lemon", bubbles:true, bg1:"#13150f", bg2:"#3b4025"},
    desc:"Длинный джиновый sour с содовой. Свежо и легко.",
    tags:["кислое","джин","лонг","лёгкое"],
    main:{recipe:"Джин 45 мл + лимонный сок 30 мл + сахарный сироп 15 мл + содовая 60 мл", ingredients:["gin"], taste:"Лимон, джин, газ."},
    who:"Кисленькое, но не крепкое.",
    extras:[{name:"Лимонный сок 30 мл", mode:"required", effect:"Свежесть."},{name:"Сахарный сироп 15 мл", mode:"required", effect:"Смягчает лимон."},{name:"Содовая 60 мл", mode:"required", effect:"Делает длинным."}],
    serve:"Встряхнуть джин, лимон и сироп со льдом, в высокий стакан, долить содовую.",
    variations:[
      {name:"Суше", recipe:"Джин 50 + лимон 30 + сироп 10 + сода 50", ingredients:["gin"], abv:14, taste:"Крепче и суше."},
      {name:"Мягче", recipe:"Джин 40 + лимон 25 + сироп 15 + сода 70", ingredients:["gin"], abv:10, taste:"Легче на весь вечер."}]},
  {name:"Mojito", family:"Классика · long sour", base:"Белый ром", abv:11,
    art:{shape:"highball", c1:"#b9d974", c2:"#e4f0aa", ice:5, garnish:"lime", bubbles:true, bg1:"#0f160f", bg2:"#28472a"},
    desc:"Ром, лайм, мята, сахар, сода. Освежает.",
    tags:["кислое","ром","мята","лёгкое"],
    main:{recipe:"Белый ром 50 мл + лаймовый сок 25 мл + сахарный сироп 15 мл + мята + содовая 50 мл", ingredients:["rum"], taste:"Лайм, мята, лёгкий ром, газ."},
    who:"Максимально свежо и понятно.",
    extras:[{name:"Лаймовый сок 25 мл", mode:"required", effect:"Кислота."},{name:"Мята", mode:"required", effect:"Аромат Mojito."},{name:"Сахарный сироп 15 мл", mode:"required", effect:"Баланс."},{name:"Содовая 50 мл", mode:"required", effect:"Лёгкость."}],
    serve:"Мяту не рвать — слегка прижать. Потом остальное, лёд и содовая.",
    variations:[
      {name:"Dry Mojito", recipe:"Ром 50 + лайм 25 + сироп 10 + мята + сода 50", ingredients:["rum"], abv:12, taste:"Менее сладкий."},
      {name:"Aperol Mojito", recipe:"Ром 40 + Aperol 15 + лайм 20 + сироп 10 + мята + сода 50", ingredients:["rum","aperol"], abv:11, taste:"Апельсиновее."}]},
  {name:"Cosmopolitan", family:"Современная классика", base:"Водка", abv:17,
    art:{shape:"nick", c1:"#c43c5b", c2:"#ed8ca0", ice:0, garnish:"orange", bg1:"#1a0e13", bg2:"#5c2232"},
    desc:"Ягоды и цитрус на водке. Лёгкий и узнаваемый.",
    tags:["кислое","водка","ягоды","цитрус"],
    main:{recipe:"Водка 40 мл + Triple Sec 20 мл + клюквенный сок 30 мл + лаймовый сок 15 мл", ingredients:["vodka","triple"], taste:"Клюква, лайм, апельсин."},
    who:"Фруктовое, яркое, не горькое.",
    extras:[{name:"Лаймовый сок 15 мл", mode:"required", effect:"Не даёт стать соком."},{name:"Клюквенный сок 30 мл", mode:"required", effect:"Цвет и ягода."},{name:"Апельсиновая цедра", mode:"optional", effect:"Подчёркивает ликёр."}],
    serve:"Встряхнуть со льдом, процедить в холодный бокал.",
    variations:[
      {name:"Суше", recipe:"Водка 45 + Triple Sec 15 + клюква 25 + лайм 15", ingredients:["vodka","triple"], abv:19, taste:"Меньше сладости."},
      {name:"Мягче", recipe:"Водка 35 + Triple Sec 20 + клюква 35 + лайм 10", ingredients:["vodka","triple"], abv:15, taste:"Фруктовее."}]},
  {name:"Amaretto Sour", family:"Классика · sour", base:"Амаретто", abv:14,
    art:{shape:"rocks", c1:"#b46c24", c2:"#e1ac58", ice:3, garnish:"lemon", bg1:"#17100d", bg2:"#49301b"},
    desc:"Миндаль и лимон, бурбон держит баланс.",
    tags:["кислое","сладкое","десертное","цитрус"],
    main:{recipe:"Амаретто 45 мл + бурбон 20 мл + лимонный сок 30 мл + сахарный сироп 5 мл", ingredients:["amaretto","bourbon"], taste:"Миндаль, лимон, ваниль."},
    who:"Сладкое и десертное, но в балансе.",
    extras:[{name:"Лимонный сок 30 мл", mode:"required", effect:"Режет сладость."},{name:"Яичный белок", mode:"optional", effect:"Кремовая текстура."},{name:"Angostura", mode:"optional", effect:"2 дэша — убирают приторность."}],
    serve:"Встряхнуть со льдом, процедить на свежий лёд.",
    variations:[
      {name:"Без бурбона", recipe:"Амаретто 60 + лимон 30 + сироп 5", ingredients:["amaretto"], abv:11, taste:"Слаще, проще."},
      {name:"Суше", recipe:"Амаретто 40 + бурбон 25 + лимон 30", ingredients:["amaretto","bourbon"], abv:16, taste:"Виски заметнее."}]},
  {name:"Long Island Iced Tea", family:"Кола · классика", base:"Мультибаза", abv:18,
    art:{shape:"highball", c1:"#8b4f22", c2:"#d2a064", ice:5, garnish:"lemon", bubbles:true, bg1:"#17110d", bg2:"#49331e"},
    desc:"Крепкий лонг, который притворяется чаем.",
    tags:["кола","лонг","крепкое","цитрус"],
    main:{recipe:"Водка 15 + джин 15 + белый ром 15 + текила 15 + Triple Sec 15 + лимонный сок 25 + сахарный сироп 15 + кола 30–40", ingredients:["vodka","gin","rum","tequila","triple","cola"], taste:"Сладко-кислый, очень питкий. Осторожно."},
    who:"Знакомая классика вечеринок, без горечи.",
    extras:[{name:"Лимонный сок 25 мл", mode:"required", effect:"Без него — просто спирт с колой."},{name:"Сахарный сироп 10–15 мл", mode:"required", effect:"Связывает пять баз."},{name:"Лимонная долька", mode:"optional", effect:"Аромат и подача."}],
    serve:"Высокий стакан, много льда. Всё кроме колы перемешать, колу сверху.",
    variations:[
      {name:"Чуть суше", recipe:"Та же база, но сироп 10 и кола 25–30", ingredients:["vodka","gin","rum","tequila","triple","cola"], abv:20, taste:"Меньше сладости."},
      {name:"Без сиропа", recipe:"Водка 15 + джин 15 + ром 15 + текила 15 + Triple Sec 20 + лимон 20 + кола 35", ingredients:["vodka","gin","rum","tequila","triple","cola"], abv:19, taste:"Резче, проще по составу."}]},
  {name:"Texas Tea", family:"Кола · твист", base:"Мультибаза", abv:20,
    art:{shape:"highball", c1:"#70401e", c2:"#bb7b3d", ice:5, garnish:"lemon", bubbles:true, bg1:"#160e0c", bg2:"#4b2c17"},
    desc:"Long Island плюс бурбон. Плотнее и висковее.",
    tags:["кола","лонг","крепкое","виски"],
    main:{recipe:"Водка 10 + джин 10 + белый ром 10 + текила 10 + бурбон 15 + Triple Sec 15 + лимон 25 + сироп 10 + кола 30", ingredients:["vodka","gin","rum","tequila","bourbon","triple","cola"], taste:"Карамель бурбона, цитрус, кола."},
    who:"Как Long Island, но с виски.",
    extras:[{name:"Лимонный сок 20–25 мл", mode:"required", effect:"Держит сладость."},{name:"Сахарный сироп 5–10 мл", mode:"required", effect:"Скругляет кислоту."},{name:"Лимонная цедра", mode:"optional", effect:"Свежий аромат."}],
    serve:"Высокий стакан со льдом, всё кроме колы, колу сверху.",
    variations:[
      {name:"Мягче", recipe:"Бурбон 10, лимон 20, сироп 15, кола 40", ingredients:["vodka","gin","rum","tequila","bourbon","triple","cola"], abv:18, taste:"Слаще, виски тише."},
      {name:"Суше", recipe:"Сироп 5, кола 25–30", ingredients:["vodka","gin","rum","tequila","bourbon","triple","cola"], abv:21, taste:"Крепче и суше."}]},
  {name:"Batanga", family:"Кола · классика", base:"Текила", abv:14,
    art:{shape:"highball", c1:"#3c2115", c2:"#775035", ice:5, garnish:"lime", bubbles:true, bg1:"#11100f", bg2:"#363026"},
    desc:"Текила, лайм, кола, соль. Просто и в балансе.",
    tags:["кола","текила","цитрус","солёное"],
    main:{recipe:"Текила 50 мл + лаймовый сок 15 мл + кола 80 мл + щепотка соли", ingredients:["tequila","cola"], taste:"Кола, агава, лайм, солёный акцент."},
    who:"Кола, но ярче и менее сладко.",
    extras:[{name:"Лаймовый сок 15 мл", mode:"required", effect:"Режет сладость колы."},{name:"Соль / saline", mode:"required", effect:"Фирменный солёный акцент."},{name:"Лаймовая долька", mode:"optional", effect:"Аромат."}],
    serve:"Можно посолить край. Лёд → текила → лайм → кола → щепотка соли.",
    variations:[
      {name:"Сухая Batanga", recipe:"Текила 50 + лайм 20 + кола 60 + соль", ingredients:["tequila","cola"], abv:16, taste:"Меньше сладости."},
      {name:"Aperol Batanga", recipe:"Текила 40 + Aperol 15 + лайм 15 + кола 70 + соль", ingredients:["tequila","aperol","cola"], abv:13, taste:"Мягче и сложнее."}]},
  {name:"Colorado Bulldog", family:"Кола · десертный", base:"Водка", abv:11,
    art:{shape:"highball", c1:"#66503f", c2:"#b99d81", ice:4, garnish:"none", bubbles:true, bg1:"#161312", bg2:"#493d34"},
    desc:"Водка, кофейный ликёр, сливки и капля колы.",
    tags:["кола","мягкое","десертное","кофе"],
    main:{recipe:"Водка 30 мл + кофейный ликёр 25 мл + сливки/молоко 30 мл + кола 30 мл", ingredients:["vodka","coffee","cola"], taste:"Сливки, кофе, карамель. Крепость не чувствуется."},
    who:"Сладкое, десертное, без горечи.",
    extras:[{name:"Сливки / молоко 30 мл", mode:"required", effect:"Без них это другой коктейль."},{name:"Щепотка соли / saline", mode:"optional", effect:"Кофе ярче, меньше приторности."}],
    serve:"Лёд, водка + ликёр + сливки, аккуратно колу, слегка перемешать.",
    variations:[
      {name:"Покрепче", recipe:"Водка 40 + кофейный ликёр 25 + сливки 25 + кола 25", ingredients:["vodka","coffee","cola"], abv:14, taste:"Меньше десерта."},
      {name:"Легче", recipe:"Водка 25 + кофейный ликёр 20 + сливки 35 + кола 35", ingredients:["vodka","coffee","cola"], abv:9, taste:"Очень мягкий."}]},
  {name:"Cuba Libre", family:"Кола · классика", base:"Белый ром", abv:13,
    art:{shape:"highball", c1:"#4a2816", c2:"#8f6337", ice:5, garnish:"lime", bubbles:true, bg1:"#111211", bg2:"#393426"},
    desc:"Простой, но лайм делает его суше и живее ром-колы.",
    tags:["кола","ром","цитрус","классика"],
    main:{recipe:"Белый ром 50 мл + лаймовый сок 15 мл + кола 90 мл", ingredients:["rum","cola"], taste:"Ром, карамель, свежий лайм."},
    who:"Привычный вкус, но нормальный коктейль.",
    extras:[{name:"Лаймовый сок 15 мл", mode:"required", effect:"Превращает ром-колу в Cuba Libre."},{name:"Лаймовая долька / цедра", mode:"optional", effect:"Аромат лайма."}],
    serve:"Много льда, ром → лайм → кола. Аккуратно перемешать.",
    variations:[
      {name:"Суше", recipe:"Белый ром 50 + лайм 20 + кола 70", ingredients:["rum","cola"], abv:15, taste:"Ярче лайм."},
      {name:"Aperol Cuba", recipe:"Белый ром 40 + Aperol 15 + лайм 15 + кола 70", ingredients:["rum","aperol","cola"], abv:13, taste:"Апельсиновее и мягче."}]}
];

const BASES = ["Все","Бурбон","Ирландский виски","Джин","Белый ром","Текила","Водка","Aperol","Campari","Jägermeister","Бренди","Амаретто","Мультибаза"];
const STYLES = ["Любой вкус","Корлеоне","мягкое","лёгкое","крепкое","горькое","кислое","сухое","виски","джин","апельсин","кофе","кола","шоты"];

const BASKET = [
  {name:"Ядро бара", level:"Сначала это", cls:"core", items:["Бурбон","Джин","Красный вермут","Сухой вермут","Campari","Aperol","Triple Sec"], note:"Закрывает Boulevardier, Negroni, Old Pal, Gin & It и почти всё «Выбор Дона»."},
  {name:"Следом", level:"Очень желательно", cls:"", items:["Ирландский виски","Белый ром","Angostura"], note:"Плюс Irish Manhattan, Rum Bitter, Daiquiri и Mojito."},
  {name:"Расширение", level:"Потом", cls:"", items:["Текила","Jägermeister"], note:"Margarita, Batanga и травяная ветка."},
  {name:"Под любимый коктейль", level:"По желанию", cls:"", items:["Водка","Бренди","Амаретто","Кофейный ликёр"], note:"Для основного меню почти не нужны."}
];
const BASKET_KEY = {"Бурбон":"bourbon","Джин":"gin","Красный вермут":"sweetV","Сухой вермут":"dryV","Campari":"bitter","Aperol":"aperol","Triple Sec":"triple","Ирландский виски":"irish","Белый ром":"rum","Текила":"tequila","Jägermeister":"jager","Водка":"vodka","Бренди":"brandy","Амаретто":"amaretto","Кофейный ликёр":"coffee"};
const BASKET_CAT = {"Бурбон":"Бурбон","Джин":"Джин","Красный вермут":"Сладкий красный вермут","Сухой вермут":"Сухой вермут","Campari":"Aperol / Campari / Jägermeister","Aperol":"Aperol / Campari / Jägermeister","Triple Sec":"Апельсиновый ликёр","Ирландский виски":"Ирландский виски","Белый ром":"Белый ром","Angostura":"Биттеры","Текила":"Текила","Jägermeister":"Aperol / Campari / Jägermeister","Водка":"Водка","Кофейный ликёр":"Кофейный ликёр"};

const SHOP = [
  {category:"Бурбон",note:"Boulevardier, Old Pal, Whiskey Sour",options:[
    {tier:"Бюджет",cls:"",name:"Jim Beam White 700 мл",price:"≈ Rp 380k",why:"Рабочая бутылка для миксов."},
    {tier:"Цена/качество",cls:"value",name:"Bulleit Bourbon 700 мл",price:"≈ Rp 680k",why:"Суше и прянее, дружит с Campari."},
    {tier:"Получше",cls:"good",name:"Jim Beam Black 750 мл",price:"≈ Rp 725k",why:"Больше дуба и карамели."}]},
  {category:"Ирландский виски",note:"Irish Manhattan-ish, Irish Aperol Cooler",options:[
    {tier:"Бюджет",cls:"",name:"Emerald Glens Green 700 мл",price:"≈ Rp 380k",why:"Мягкая недорогая база."},
    {tier:"Цена/качество",cls:"value",name:"Jameson 700 мл",price:"≈ Rp 450k",why:"Самый универсальный."},
    {tier:"Получше",cls:"good",name:"Jameson Black Barrel 700 мл",price:"≈ Rp 790k",why:"Ваниль, дерево, тело."}]},
  {category:"Джин",note:"Negroni, Gin & It, Gimlet, Tom Collins",options:[
    {tier:"Бюджет",cls:"",name:"Seagram's Dry / Gordon's Dry",price:"≈ Rp 285k",why:"Нормально для Negroni и sour."},
    {tier:"Цена/качество",cls:"value",name:"Tanqueray Dry 750 мл",price:"≈ Rp 450k",why:"Яркий можжевельник пробивает Campari."},
    {tier:"Получше",cls:"good",name:"Roku Gin 700 мл",price:"≈ Rp 550k",why:"Тоньше и ароматнее."}]},
  {category:"Белый ром",note:"Daiquiri, Mojito, Cuba Libre, Rum Bitter",options:[
    {tier:"Бюджет",cls:"",name:"Robinson Light Rum 680 мл",price:"≈ Rp 250k",why:"Недорогая база."},
    {tier:"Цена/качество",cls:"value",name:"Bacardi Carta Blanca 750 мл",price:"≈ Rp 300k",why:"Чистый универсальный."},
    {tier:"Получше",cls:"good",name:"Havana Club 3 Años 750 мл",price:"≈ Rp 450k",why:"Хорош в Daiquiri и Cuba Libre."}]},
  {category:"Текила",note:"Margarita, Batanga, Long Island",options:[
    {tier:"Бюджет",cls:"",name:"Jose Cuervo Especial Reposado 750 мл",price:"≈ Rp 375k",why:"Сойдёт для коктейлей."},
    {tier:"Цена/качество",cls:"value",name:"El Jimador Reposado 750 мл",price:"≈ Rp 560k",why:"Лучший апгрейд для Margarita."},
    {tier:"Получше",cls:"good",name:"Espolòn Blanco 750 мл",price:"≈ Rp 830k",why:"Чистая агава, можно и так."}]},
  {category:"Водка",note:"Cosmopolitan, Long Island, Colorado Bulldog",options:[
    {tier:"Бюджет",cls:"",name:"Smirnoff Red 700 мл",price:"≈ Rp 250k",why:"Для коктейлей хватает."},
    {tier:"Цена/качество",cls:"value",name:"Stoli Premium 700 мл",price:"≈ Rp 490k",why:"Чище и мягче."},
    {tier:"Получше",cls:"good",name:"Grey Goose 750 мл",price:"≈ Rp 650k",why:"В Long Island переплата теряется."}]},
  {category:"Сладкий красный вермут",note:"Negroni, Boulevardier, Gin & It",options:[
    {tier:"Бюджет",cls:"",name:"Martini Rosso 1 л",price:"≈ Rp 410k",why:"Большой объём, понятный вкус."},
    {tier:"Цена/качество",cls:"value",name:"Cinzano Rosso 750 мл",price:"≈ Rp 450k",why:"Прянее и плотнее."},
    {tier:"Совет",cls:"good",name:"Любой из двух, но свежий",price:"≈ Rp 410–450k",why:"Свежесть после открытия важнее бренда. Хранить в холодильнике."}]},
  {category:"Сухой вермут",note:"Old Pal, Lucien Gaudin, dry-вариации",options:[
    {tier:"Бюджет",cls:"",name:"Martini Extra Dry 1 л",price:"≈ Rp 430k",why:"Лучший по объёму и цене."},
    {tier:"Цена/качество",cls:"value",name:"Cinzano Extra Dry 750 мл",price:"≈ Rp 450k",why:"Чуть травянистее."},
    {tier:"Совет",cls:"good",name:"Martini Extra Dry",price:"≈ Rp 430k",why:"Свежая бутылка в холодильнике важнее премиума."}]},
  {category:"Апельсиновый ликёр",note:"Margarita, White Lady, Cosmopolitan",options:[
    {tier:"Бюджет",cls:"",name:"Balimoon Triple Sec 700 мл",price:"≈ Rp 230k",why:"Локальный, для больших миксов."},
    {tier:"Цена/качество",cls:"value",name:"Vibe / Robinson Triple Sec",price:"≈ Rp 245–250k",why:"Без переплаты."},
    {tier:"Получше",cls:"good",name:"Cointreau 700 мл",price:"≈ Rp 430k",why:"Суше и чище — разница слышна."}]},
  {category:"Aperol / Campari / Jägermeister",note:"Тут бренд и есть продукт",options:[
    {tier:"Мягкий",cls:"",name:"Aperol 700 мл",price:"≈ Rp 450k",why:"Мягкие твисты и хайболы."},
    {tier:"Горький",cls:"value",name:"Campari 750 мл",price:"≈ Rp 690k",why:"Ключ к Negroni и Boulevardier."},
    {tier:"Травяной",cls:"good",name:"Jägermeister 700 мл",price:"≈ Rp 370k",why:"Если любите травяное."}]},
  {category:"Кофейный ликёр",note:"Colorado Bulldog и десерты",options:[
    {tier:"Бюджет",cls:"",name:"Balimoon Coffee 700 мл",price:"≈ Rp 230k",why:"Локальный недорогой."},
    {tier:"Лучший выбор",cls:"value",name:"Kahlúa 750 мл",price:"≈ Rp 430k",why:"Классика; дороже искать незачем."}]},
  {category:"Биттеры",note:"Капли — одной бутылки хватит надолго",options:[
    {tier:"Главный",cls:"value",name:"Angostura Aromatic 200 мл",price:"≈ Rp 350k",why:"Самая полезная маленькая бутылка."},
    {tier:"Вторым",cls:"good",name:"Orange bitters",price:"по бренду",why:"Для сухих джиновых коктейлей."}]}
];

/* ================= app ================= */
(function(){
"use strict";
const $=s=>document.querySelector(s);
const RM=matchMedia("(prefers-reduced-motion: reduce)").matches;
const store={
  get(k,d){try{const v=localStorage.getItem("lf:"+k);return v==null?d:JSON.parse(v)}catch(_){return d}},
  set(k,v){try{localStorage.setItem("lf:"+k,JSON.stringify(v))}catch(_){}}
};
const S={
  tab:"menu", base:"Все", style:"Любой вкус", q:"",
  pantry:new Set(store.get("pantry",[])), mode:store.get("mode","main"),
  pantryOn:store.get("pantryOn",false), favs:new Set(store.get("favs",[])), notes:store.get("notes",{}), rates:store.get("rates",{})
};
if(!S.pantry.size) S.pantryOn=false;
cocktails.forEach((c,i)=>{c.i=i;c.txt=[c.name,c.family,c.desc,c.base,c.who,c.serve,...c.tags,c.main.recipe,c.main.taste,...c.variations.flatMap(v=>[v.name,v.recipe,v.taste])].join(" ").toLowerCase();});
const save=()=>{store.set("pantry",[...S.pantry]);store.set("mode",S.mode);store.set("pantryOn",S.pantryOn);store.set("favs",[...S.favs]);};

/* ---------- logic ---------- */
const has=r=>r.ingredients.every(k=>S.pantry.has(k));
function makeable(c,mode=S.mode){
  const a=[]; if(has(c.main)) a.push("Основной");
  if(mode==="variations") c.variations.forEach(v=>{if(has(v))a.push(v.name)});
  return a;
}
function visible(){
  const q=S.q.trim().toLowerCase();
  return cocktails.filter(c=>
    (S.base==="Все"||c.base===S.base)&&
    (S.style==="Любой вкус"||c.tags.includes(S.style)||c.txt.includes(S.style))&&
    (!q||c.txt.includes(q)||(S.notes[c.name]||"").toLowerCase().includes(q))&&
    (!S.pantryOn||makeable(c).length>0));
}
const plural=(n,a,b,c)=>{n=Math.abs(n)%100;const m=n%10;return n>10&&n<20?c:m>1&&m<5?b:m===1?a:c};

/* ---------- art ---------- */
let uidN=0;
function glass(a,{thumb=false,pour=false}={}){
  const u="g"+(++uidN);
  const vb=thumb?"220 50 360 360":"0 0 800 450";
  const ice=(x,y,w,h,rot,op)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" transform="rotate(${rot} ${x+w/2} ${y+h/2})" fill="rgba(225,245,255,${op})" stroke="rgba(255,255,255,.3)" stroke-width="2"/>`;
  const anim=pour&&!RM;
  const bub=a.bubbles?Array.from({length:9},(_,i)=>{const cx=375+(i*13)%50,cy=320-i*16,r=2.5+(i%3);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(255,255,255,.4)">${anim?`<animate attributeName="cy" values="${cy+40};${cy-60}" dur="${2+i%3*.6}s" begin="${1.1+i*.15}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;0" dur="${2+i%3*.6}s" begin="${1.1+i*.15}s" repeatCount="indefinite"/>`:""}</circle>`}).join(""):"";
  const gar={
    peel:`<path d="M518 152c18-12 40-11 55 3c-19 14-39 16-61 9c1-5 3-9 6-12z" fill="#ff9d30" stroke="#ffd18a" stroke-width="3"/>`,
    twist:`<path d="M520 150c30-18 55-15 65 5c-20 10-42 14-64 6c-6-3-6-7-1-11z" fill="#ff9524" stroke="#ffd08d" stroke-width="3"/>`,
    lemon:`<path d="M520 150c18-14 44-14 57 1c-14 13-37 18-57 12c-10-3-10-9 0-13z" fill="#f4cc5e" stroke="#fff1a4" stroke-width="3"/>`,
    orange:`<circle cx="548" cy="150" r="22" fill="#ff9530" stroke="#ffd08c" stroke-width="4"/><path d="M548 128v44M526 150h44M533 135l30 30M563 135l-30 30" stroke="rgba(255,255,255,.35)" stroke-width="2"/>`,
    cherry:`<circle cx="556" cy="142" r="12" fill="#b3202b"/><path d="M556 131c5-16 13-25 25-33" stroke="#679257" stroke-width="4" fill="none"/>`,
    lime:`<path d="M527 136a24 24 0 1 0 42 24z" fill="#9ed158" stroke="#dff3b2" stroke-width="3"/>`
  }[a.garnish]||"";
  let g,top;
  if(a.shape==="rocks"){top=180;g=`<path d="M290 120h220l-20 170c-3 26-21 40-46 40H356c-25 0-43-14-46-40z" fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.42)" stroke-width="6"/>
    <path clip-path="url(#c${u})" d="M316 188h168l-10 92c-2 20-15 29-34 29h-80c-19 0-32-9-34-29z" fill="url(#l${u})"/>
    ${ice(350,182,54,56,-14,.45)}${ice(396,196,54,54,12,.4)}${a.ice>2?ice(430,175,48,48,-8,.32):""}
    <path d="M308 128h184" stroke="rgba(255,255,255,.45)" stroke-width="7" stroke-linecap="round"/>`;}
  else if(a.shape==="highball"){top=170;g=`<path d="M340 88h120l-15 248c-2 24-16 34-35 34h-20c-19 0-33-10-35-34z" fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.42)" stroke-width="6"/>
    <path clip-path="url(#c${u})" d="M356 176h88l-10 152c-1 16-10 22-22 22h-24c-12 0-21-6-22-22z" fill="url(#l${u})"/>
    ${ice(370,165,35,44,-12,.5)}${ice(403,196,35,42,9,.4)}${ice(367,223,35,42,7,.35)}${ice(404,245,34,40,-10,.33)}${bub}
    <path d="M350 96h100" stroke="rgba(255,255,255,.46)" stroke-width="6" stroke-linecap="round"/><path d="M436 88l32 72" stroke="rgba(212,230,235,.5)" stroke-width="6"/>`;}
  else if(a.shape==="wine"){top=200;g=`<path d="M400 120c78 0 112 51 96 109c-15 55-62 86-96 86s-81-31-96-86c-16-58 18-109 96-109z" fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.42)" stroke-width="6"/>
    <path clip-path="url(#c${u})" d="M326 205c2 40 28 83 74 83s72-43 74-83z" fill="url(#l${u})"/>
    ${ice(356,194,34,36,-10,.36)}${ice(390,205,36,38,12,.33)}${bub}
    <rect x="394" y="312" width="12" height="62" rx="6" fill="rgba(255,255,255,.28)"/><ellipse cx="400" cy="382" rx="58" ry="10" fill="rgba(255,255,255,.22)"/>`;}
  else {top=156;g=`<path d="M300 132h200c-6 57-49 109-100 109s-94-52-100-109z" fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.42)" stroke-width="6"/>
    <path clip-path="url(#c${u})" d="M326 160h148c-10 36-38 60-74 60s-64-24-74-60z" fill="url(#l${u})"/>
    <rect x="394" y="241" width="12" height="86" rx="6" fill="rgba(255,255,255,.28)"/><ellipse cx="400" cy="335" rx="66" ry="10" fill="rgba(255,255,255,.22)"/>
    <path d="M298 132h204" stroke="rgba(255,255,255,.48)" stroke-width="6" stroke-linecap="round"/>`;}
  return `<svg viewBox="${vb}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
   <radialGradient id="b${u}" cx="50%" cy="20%" r="85%"><stop offset="0" stop-color="${a.bg2}"/><stop offset=".65" stop-color="${a.bg1}"/><stop offset="1" stop-color="#050303"/></radialGradient>
   <linearGradient id="l${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a.c2}"/><stop offset="1" stop-color="${a.c1}"/></linearGradient>
   <radialGradient id="s${u}" cx="50%" cy="0%" r="70%"><stop offset="0" stop-color="rgba(255,220,160,.28)"/><stop offset="1" stop-color="rgba(255,220,160,0)"/></radialGradient>
   <clipPath id="c${u}"><rect x="0" y="${anim?400:0}" width="800" height="450">${anim?`<animate attributeName="y" from="400" to="${top-40}" dur="1.2s" begin=".25s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".2 .8 .2 1"/>`:""}</rect></clipPath>
  </defs>
  <rect width="800" height="450" fill="url(#b${u})"/>
  <path d="M400 -20 L250 450 L550 450 Z" fill="url(#s${u})"/>
  <rect x="0" y="342" width="800" height="110" fill="rgba(0,0,0,.35)"/><rect x="0" y="338" width="800" height="4" fill="rgba(234,209,147,.10)"/>
  <ellipse cx="400" cy="352" rx="170" ry="22" fill="rgba(0,0,0,.4)"/>
  <g>${g}${gar}</g></svg>`;
}
function bottle(c){
  return `<svg viewBox="0 0 34 58" aria-hidden="true"><path d="M13 1.5h8v8.5c0 2 5.5 4 5.5 10V54a2.5 2.5 0 0 1-2.5 2.5H10A2.5 2.5 0 0 1 7.5 54V20c0-6 5.5-8 5.5-10z" fill="${c}" stroke="rgba(255,255,255,.35)" stroke-width="1"/><rect x="7.5" y="28" width="19" height="15" fill="rgba(239,229,211,.88)"/><path d="M11 33h12M13 37h8" stroke="rgba(0,0,0,.35)" stroke-width="1.2"/><rect x="12" y="1" width="10" height="5" rx="1" fill="#2a1c12"/><path d="M10 22c0-4 2-6 4-7" stroke="rgba(255,255,255,.35)" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`;
}
const meter=abv=>`<span class="meter">${[6,12,18,24,30].map(t=>`<i class="${abv>=t-3?"f":""}"></i>`).join("")}</span>`;
const ROSE=`<svg class="rose" viewBox="0 0 24 24" stroke-width="1.6" stroke-linecap="round"><path d="M12 5.5c3 0 5 2.4 5 5.2S14.8 16 12 16s-5-2.5-5-5.3 2-5.2 5-5.2z"/><path d="M12 9c-1.7 0-2.6 1.1-2.6 2.3S10.6 13.5 12 13.5s2.5-1 2.5-2.3" fill="none"/></svg>`;

/* ---------- cards ---------- */
function card(c,k){
  const m=S.pantryOn?makeable(c):[];
  return `<button class="cc" type="button" data-i="${c.i}" style="--d:${Math.min(k,14)}">
    <span class="cc-art">${glass(c.art,{thumb:true})}</span>
    <span class="cc-body">
      <span class="cc-name">${c.name}</span>
      <span class="cc-fam">${c.family}</span>
      <span class="cc-desc">${c.desc}</span>
      <span class="cc-row"><span class="abv">${c.abv}° ${meter(c.abv)}</span>${c.premium?`<span class="don-mark">Выбор Дона</span>`:""}${m.length?`<span class="can">✓ ${m.length>1?m.length+" "+plural(m.length,"рецепт","рецепта","рецептов"):"можно"}</span>`:""}${S.rates[c.name]?`<span class="rate-mark">★ ${S.rates[c.name]}</span>`:""}${S.notes[c.name]?`<span class="note-mark" title="Есть заметка"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>заметка</span>`:""}</span>
    </span>${S.favs.has(c.i)?ROSE:""}</button>`;
}

/* ---------- menu ---------- */
function renderRails(){
  $("#bases").innerHTML=BASES.map(b=>`<button class="tab ${S.base===b?"on":""}" data-base="${b}" type="button">${b}</button>`).join("");
  $("#styles").innerHTML=`<button class="pill mybar ${S.pantryOn?"on":""}" data-mybar type="button" aria-pressed="${S.pantryOn}">Мой бар (${S.pantry.size})</button>`+STYLES.map(s=>`<button class="pill ${S.style===s?"on":""}" data-style="${s}" type="button">${s}</button>`).join("");
}
function renderMenu(){
  const list=visible();
  $("#count").textContent=`${list.length} из ${cocktails.length}`;
  $("#searchBox").classList.toggle("has",!!S.q);
  $("#list").innerHTML=list.length?list.map(card).join(""):
    `<div class="empty" style="grid-column:1/-1"><h3>Ничего не нашлось</h3><p>${S.pantryOn?"Из этих бутылок не собрать. Добавь бутылку или выключи чип «Мой бар».":"Попробуй другой запрос или сбрось фильтры."}</p><button class="btn btn-ghost" data-act="reset" type="button">Сбросить фильтры</button></div>`;
}

/* ---------- bar ---------- */
function renderBar(){
  $("#shelf").innerHTML=Object.entries(ING).map(([k,v])=>`<button class="bt ${S.pantry.has(k)?"on":""}" data-ing="${k}" type="button" aria-pressed="${S.pantry.has(k)}">
    <span class="ck"><svg viewBox="0 0 12 12" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.2 5 8.5l4.5-5"/></svg></span>
    ${bottle(v.c)}<b>${v.label}</b></button>`).join("");
  barCount();
}
function barCount(){
  renderRails();
  const seg=$("#seg");seg.dataset.v=S.mode;
  seg.querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.v===S.mode));
  const n=S.pantry.size?cocktails.filter(c=>makeable(c).length).length:0;
  const go=$("#barGo");
  go.disabled=!n;
  go.textContent=S.pantry.size?(n?`Показать ${n} ${plural(n,"коктейль","коктейля","коктейлей")}`:"Пока ничего не собрать"):"Отметь бутылки";
  const bb=$("#barBadge");bb.textContent=S.pantry.size;bb.classList.toggle("on",S.pantry.size>0);
}

/* ---------- fav ---------- */
function renderFav(){
  const list=cocktails.filter(c=>S.favs.has(c.i)).sort((a,b)=>(S.rates[b.name]||0)-(S.rates[a.name]||0));
  $("#favList").innerHTML=list.length?list.map(card).join(""):
    `<div class="empty" style="grid-column:1/-1"><svg viewBox="0 0 24 24" width="44" height="44" style="margin:0 auto;stroke:var(--wine2);fill:none" stroke-width="1.2"><path d="M12 5.5c3 0 5 2.4 5 5.2S14.8 16 12 16s-5-2.5-5-5.3 2-5.2 5-5.2z"/><path d="M12 9c-1.7 0-2.6 1.1-2.6 2.3S10.6 13.5 12 13.5s2.5-1 2.5-2.3"/><path d="M12 16v6M12 19.2c-2.2-.4-3.4-1.8-3.6-3.4"/></svg><h3>Пока никого</h3><p>Открой коктейль и нажми «В семью» — он появится здесь.</p><button class="btn btn-brass" data-go="menu" type="button">В меню</button></div>`;
  const fb=$("#favBadge");fb.textContent=S.favs.size;fb.classList.toggle("on",S.favs.size>0);
}

/* ---------- shop ---------- */
const catId=n=>"cat-"+n.toLowerCase().replace(/[^a-zа-я0-9]+/gi,"-");
function renderShop(){
  $("#tiers").innerHTML=BASKET.map(t=>`<div class="tier ${t.cls}"><div class="tier-h"><h3>${t.name}</h3><span>${t.level}</span></div><p>${t.note}</p>
    <div class="chips">${t.items.map(i=>`<button class="chipb ${S.pantry.has(BASKET_KEY[i])?"have":""}" data-jump="${BASKET_CAT[i]||""}" type="button">${S.pantry.has(BASKET_KEY[i])?"✓ ":""}${i}</button>`).join("")}</div></div>`).join("");
  $("#cats").innerHTML=SHOP.map(c=>`<details class="cat" id="${catId(c.category)}"><summary><b>${c.category}<small>${c.note}</small></b><svg class="chev" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg></summary>
    <div class="opts">${c.options.map(o=>`<div class="opt"><span class="t ${o.cls}">${o.tier}</span><span class="n">${o.name}</span><span class="p">${o.price}</span><span class="w">${o.why}</span></div>`).join("")}</div></details>`).join("");
}

/* ---------- tabs ---------- */
const TABS=["menu","bar","don","fav","shop"];
function go(tab){
  if(tab===S.tab){window.scrollTo({top:0,behavior:RM?"auto":"smooth"});return}
  S.tab=tab;
  document.querySelectorAll(".screen").forEach(s=>s.classList.toggle("on",s.id==="s-"+tab));
  document.querySelectorAll(".dk").forEach(d=>d.classList.toggle("on",d.dataset.tab===tab));
  $("#ind").style.transform=`translateX(${TABS.indexOf(tab)*100}%)`;
  if(tab==="bar")renderBar(); if(tab==="fav")renderFav(); if(tab==="shop")renderShop(); if(tab==="menu"){renderRails();renderMenu();}
  window.scrollTo(0,0);
}

/* ---------- sheet ---------- */
const sheet=$("#sheet"),veil=$("#veil"),body=$("#sheetBody");
let cur=null;
function rows(r){
  return r.split(/\s\+\s/).map(p=>{const m=p.match(/^(.+?)\s+(\d[\d.,–\-]*)\s*(мл)?$/);
    return m?`<div class="mr"><span>${m[1][0].toUpperCase()+m[1].slice(1)}</span><i></i><b>${m[2]} мл</b></div>`:`<div class="mr"><span class="wrap">${p[0].toUpperCase()+p.slice(1)}</span><i></i><b>по вкусу</b></div>`}).join("");
}
function detail(c){
  const pantry=S.pantryOn||S.pantry.size;
  const okMain=has(c.main);
  const missing=c.main.ingredients.filter(k=>!S.pantry.has(k)).map(k=>ING[k].label);
  const modeName={required:"Нужно",recommended:"Советую",optional:"По желанию"};
  return `<div class="d-hero">${glass(c.art,{pour:true})}</div>
  <div class="d-in">
    <div class="d-fam">${c.family}${c.premium?" · Выбор Дона":""}</div>
    <h2 class="d-name">${c.name}</h2>
    <div class="d-actions">
      <span class="abv">${c.abv}° ${meter(c.abv)}</span>
      <button class="ib fav ${S.favs.has(c.i)?"on":""}" data-fav="${c.i}" type="button"><svg viewBox="0 0 24 24"><path d="M12 5.5c3 0 5 2.4 5 5.2S14.8 16 12 16s-5-2.5-5-5.3 2-5.2 5-5.2z"/><path d="M12 16v5"/></svg><span>${S.favs.has(c.i)?"В семье":"В семью"}</span></button>
      <button class="ib" data-copy="${c.i}" type="button"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>Рецепт</button>
    </div>
    <div class="stars" role="group" aria-label="Моя оценка">${[1,2,3,4,5].map(n=>`<button type="button" class="${(S.rates[c.name]||0)>=n?"on":""}" data-rate="${n}" data-rn="${esc(c.name)}" aria-label="${n} из 5">★</button>`).join("")}<span>${S.rates[c.name]?"Моя оценка":"Оцени коктейль"}</span></div>
    <button class="btn btn-brass cook" data-cook="${c.i}" type="button"><svg viewBox="0 0 24 24"><path d="M7 3h10l-1.5 7h-7z"/><path d="M8.5 10 9 21h6l.5-11"/></svg>Готовить по шагам</button>
    <p class="d-desc">${c.desc}</p>
    ${pantry?`<div class="d-status ${okMain?"":"no"}">${okMain?"✓ Всё есть в баре":"Не хватает: "+missing.join(", ")}</div>`:""}
    <div class="d-sec"><h4>Состав</h4><div class="menu-rows">${rows(c.main.recipe)}</div></div>
    <div class="d-sec duo"><div class="note"><b>Вкус</b>${c.main.taste}</div><div class="note"><b>Кому налить</b>${c.who}</div></div>
    <div class="d-sec"><h4>Как делать</h4><p class="steps">${c.serve}</p></div>
    <div class="d-sec"><h4>Моя заметка</h4><textarea class="note-ta" id="noteTa" data-name="${esc(c.name)}" rows="3" maxlength="600" placeholder="Например: сиропа меньше, Ане зашло, взять Bulleit…">${esc(S.notes[c.name]||"")}</textarea><div class="note-st" id="noteSt">${S.notes[c.name]?"Сохранено на этом телефоне":"Видно только тебе, хранится на этом телефоне"}</div></div>
    ${c.extras&&c.extras.length?`<div class="d-sec"><h4>Добавки</h4><div class="ex">${c.extras.map(x=>`<div class="exr"><div class="exr-h"><span>${x.name}</span><span class="mode ${x.mode}">${modeName[x.mode]}</span></div><p>${x.effect}</p></div>`).join("")}</div></div>`:""}
    <div class="d-sec"><h4>Вариации</h4><div class="vars">${c.variations.map(v=>{const ok=has(v);return `<div class="var ${pantry&&!ok?"off":""}"><div class="var-h"><b>${v.name}</b><span>${v.abv}°</span></div><div class="r">${v.recipe}</div><div class="tt">${v.taste}</div>${pantry?`<div class="st">${ok?"✓ Можно сделать":"Не хватает бутылок"}</div>`:""}</div>`}).join("")}</div></div>
    <p class="fine">° — примерная крепость в бокале, уже со льдом.</p>
  </div>`;
}
function openSheet(i,push=true){
  const c=cocktails[i]; if(!c)return;
  if(!push&&cur===c&&sheet.classList.contains("on"))return; cur=c;
  body.innerHTML=detail(c); body.scrollTop=0;
  sheet.classList.add("on"); veil.classList.add("on");
  document.documentElement.style.overflow="hidden";
  if(push) history.pushState({sheet:i},"","#"+encodeURIComponent(c.name.toLowerCase().replace(/\s+/g,"-")));
}
function closeSheet(fromPop){
  if(!sheet.classList.contains("on"))return;
  sheet.classList.remove("on"); veil.classList.remove("on"); sheet.style.transform="";
  document.documentElement.style.overflow="";
  if(!fromPop&&history.state&&history.state.sheet!=null) history.back();
}
window.addEventListener("popstate",e=>{
  const s=e.state||{};
  if(!s.panel) closePanel(true);
  if(s.sheet!=null) openSheet(s.sheet,false); else closeSheet(true);
  if(!s.don) closeDon(true);
});
veil.addEventListener("click",()=>closeSheet());
$("#sheetX").addEventListener("click",()=>closeSheet());
document.addEventListener("keydown",e=>{if(e.key==="Escape"){if(panel.classList.contains("on"))return closePanel();closeSheet();closeDon()}});
/* drag to close (touch) */
(function(){
  let y0=null,dy=0,active=false;
  sheet.addEventListener("touchstart",e=>{
    if(e.touches.length!==1||e.target.closest(".vars"))return;
    y0=e.touches[0].clientY;dy=0;active=false;
  },{passive:true});
  sheet.addEventListener("touchmove",e=>{
    if(y0==null)return; dy=e.touches[0].clientY-y0;
    if(!active){ if(dy>6&&body.scrollTop<=0){active=true;sheet.classList.add("drag")} else if(dy<0||body.scrollTop>0){y0=null;return} }
    if(active){e.preventDefault();sheet.style.transform=`translateY(${Math.max(0,dy)}px)`}
  },{passive:false});
  const end=()=>{ if(y0==null&&!active)return; sheet.classList.remove("drag");
    if(active&&dy>110)closeSheet(); else sheet.style.transform="";
    y0=null;active=false;};
  sheet.addEventListener("touchend",end);sheet.addEventListener("touchcancel",end);
})();

/* ---------- don ---------- */
const don=$("#don");let donPick=null,donTimer=null;
const SAYS=["Дон думает…","Дон выбирает…","Тишина. Дон решает…"];
const LAND=["Это предложение, а не просьба.","Дон сказал — значит, наливаем.","За семью.","Не спорь с Доном."];
function openDon(){
  const pool=S.pantryOn?cocktails.filter(c=>makeable(c).length):cocktails;
  if(!pool.length){toast("Из твоего бара не собрать ни одного");return}
  don.classList.add("on");don.classList.remove("done");
  if(!(history.state&&history.state.don)) history.pushState({don:1},"","#don");
  spin(pool);
}
function spin(pool){
  clearTimeout(donTimer);don.classList.remove("done");
  $("#donSay").textContent=SAYS[Math.floor(Math.random()*SAYS.length)];
  donPick=pool[Math.floor(Math.random()*pool.length)];
  const slot=$("#slot");const steps=RM?1:22;let k=0;
  const tickF=()=>{
    k++;const last=k>=steps;
    const c=last?donPick:pool[Math.floor(Math.random()*pool.length)];
    slot.textContent=c.name;slot.classList.remove("tick");void slot.offsetWidth;slot.classList.add("tick");
    if(last){
      $("#donArt").innerHTML=glass(donPick.art,{thumb:true,pour:true});
      $("#donSay").textContent="Дон рекомендует";
      $("#donSub").textContent=`${donPick.abv}° · ${LAND[Math.floor(Math.random()*LAND.length)]}`;
      don.classList.add("done");
      if(navigator.vibrate)try{navigator.vibrate([10,40,18])}catch(_){}
      return;
    }
    donTimer=setTimeout(tickF,45+Math.pow(k/steps,3)*320);
  };
  tickF();
}
function closeDon(fromPop){
  if(!don.classList.contains("on"))return;
  clearTimeout(donTimer);don.classList.remove("on");
  if(!fromPop&&history.state&&history.state.don)history.back();
}
$("#donBtn").addEventListener("click",openDon);
$("#donX").addEventListener("click",()=>closeDon());
$("#donAgain").addEventListener("click",()=>spin(S.pantryOn?cocktails.filter(c=>makeable(c).length):cocktails));
$("#donOpen").addEventListener("click",()=>{const i=donPick.i;closeDon(true);history.replaceState({sheet:i},"","#"+i);openSheet(i,false)});

/* ---------- toast & copy ---------- */
let tt=null;
function toast(t){const el=$("#toast");el.textContent=t;el.classList.add("on");clearTimeout(tt);tt=setTimeout(()=>el.classList.remove("on"),1800)}
async function copy(text,msg="Рецепт скопирован"){
  let ok=false;
  try{if(navigator.clipboard&&isSecureContext){await navigator.clipboard.writeText(text);ok=true}}catch(_){}
  if(!ok){try{const ta=document.createElement("textarea");ta.value=text;ta.style.cssText="position:fixed;opacity:0";document.body.appendChild(ta);ta.select();ok=document.execCommand("copy");ta.remove()}catch(_){}}
  toast(ok?msg:"Не получилось скопировать");
}

/* ---------- events ---------- */
document.addEventListener("click",e=>{
  const t=e.target;
  let el;
  if(el=t.closest(".cc")){openSheet(+el.dataset.i);return}
  if(el=t.closest("[data-base]")){S.base=el.dataset.base;renderRails();renderMenu();el.scrollIntoView({inline:"center",block:"nearest",behavior:RM?"auto":"smooth"});return}
  if(el=t.closest("[data-style]")){S.style=el.dataset.style;renderRails();renderMenu();return}
  if(el=t.closest("[data-act=reset]")||t.closest("#reset")){resetAll();return}
  if(el=t.closest(".dk")){go(el.dataset.tab);return}
  if(el=t.closest("[data-go]")){go(el.dataset.go);return}
  if(el=t.closest("[data-ing]")){const k=el.dataset.ing;S.pantry.has(k)?S.pantry.delete(k):S.pantry.add(k);
    el.classList.toggle("on");el.setAttribute("aria-pressed",S.pantry.has(k));if(!S.pantry.size)S.pantryOn=false;save();barCount();return}
  if(el=t.closest("#seg button")){S.mode=el.dataset.v;save();barCount();return}
  if(t.closest("#barClear")){S.pantry.clear();S.pantryOn=false;save();renderBar();toast("Бар очищен");return}
  if(t.closest("#barGo")){S.pantryOn=true;save();go("menu");return}
  if(t.closest("[data-mybar]")){
    if(!S.pantry.size){toast("Сначала отметь бутылки в «Моём баре»");go("bar");return}
    S.pantryOn=!S.pantryOn;save();renderRails();renderMenu();return}
  if(el=t.closest("[data-fav]")){const i=+el.dataset.fav;const on=!S.favs.has(i);on?S.favs.add(i):S.favs.delete(i);save();
    el.classList.toggle("on",on);el.querySelector("span").textContent=on?"В семье":"В семью";
    toast(on?`${cocktails[i].name} — теперь в семье`:"Убрано из семьи");
    const fb=$("#favBadge");fb.textContent=S.favs.size;fb.classList.toggle("on",S.favs.size>0);
    if(S.tab==="menu")renderMenu(); if(S.tab==="fav")renderFav(); return}
  if(el=t.closest("[data-rate]")){const nm=el.dataset.rn,v=+el.dataset.rate;
    if(S.rates[nm]===v)delete S.rates[nm];else S.rates[nm]=v;store.set("rates",S.rates);
    const box=el.parentElement;box.querySelectorAll("button").forEach((b,i)=>b.classList.toggle("on",(S.rates[nm]||0)>i));box.querySelector("span").textContent=S.rates[nm]?"Моя оценка":"Оцени коктейль";
    buzz(8);if(S.tab==="menu")renderMenu();if(S.tab==="fav")renderFav();return}
  if(el=t.closest("[data-cook]")){openBartender(+el.dataset.cook);return}
  if(el=t.closest("[data-mode]")){el.dataset.mode==="party"?openParty():openCards();return}
  if(el=t.closest("[data-copy]")){const c=cocktails[+el.dataset.copy];copy(`${c.name}: ${c.main.recipe}. ${c.serve}`);return}
  if(el=t.closest(".opt")){const n=el.querySelector(".n").textContent;copy(n,`Скопировано: ${n}`);return}
  if(el=t.closest("[data-jump]")){const n=el.dataset.jump;if(!n){toast("Под это нет отдельной подборки");return}
    const d=document.getElementById(catId(n));if(!d)return;d.open=true;d.classList.add("flash");
    d.scrollIntoView({behavior:RM?"auto":"smooth",block:"center"});setTimeout(()=>d.classList.remove("flash"),1400);return}
});
function resetAll(){S.base="Все";S.style="Любой вкус";S.q="";S.pantryOn=false;$("#q").value="";save();renderRails();renderMenu()}
let qt=null;
let nt=null;
document.addEventListener("input",e=>{
  if(e.target.id!=="noteTa")return;
  const name=e.target.dataset.name,v=e.target.value.trim();clearTimeout(nt);$("#noteSt").textContent="Сохраняю…";
  nt=setTimeout(()=>{if(v)S.notes[name]=v;else delete S.notes[name];store.set("notes",S.notes);$("#noteSt").textContent=v?"Сохранено на этом телефоне":"Заметка удалена";
    if(S.tab==="menu")renderMenu();if(S.tab==="fav")renderFav();},400);
});
$("#q").addEventListener("input",e=>{S.q=e.target.value;clearTimeout(qt);qt=setTimeout(renderMenu,120)});
$("#qx").addEventListener("click",e=>{e.preventDefault();S.q="";$("#q").value="";renderMenu();$("#q").focus()});

/* ---------- panels (bartender, party, cards) ---------- */
const panel=$("#panel"),pBody=$("#pBody"),pTitle=$("#pTitle"),pNav=$("#pNav");
let pKind=null,wake=null;
function openPanel(kind,title){
  pKind=kind;pTitle.textContent=title;pNav.innerHTML="";pNav.hidden=true;
  panel.classList.add("on");document.documentElement.style.overflow="hidden";
  if(!(history.state&&history.state.panel)) history.pushState({...(history.state||{}),panel:kind},"","#"+kind);
}
function closePanel(fromPop){
  if(!panel.classList.contains("on"))return;
  panel.classList.remove("on");pKind=null;stopTimer();
  if(wake){try{wake.release()}catch(_){}wake=null}
  if(!sheet.classList.contains("on"))document.documentElement.style.overflow="";
  if(!fromPop&&history.state&&history.state.panel)history.back();
}
$("#pX").addEventListener("click",()=>closePanel());
const buzz=p=>{if(navigator.vibrate)try{navigator.vibrate(p)}catch(_){}};
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const pick=a=>a[Math.floor(Math.random()*a.length)];
const cap=s=>s[0].toUpperCase()+s.slice(1);

/* recipe parsing: "Бурбон 50 мл + Campari 25 мл" -> [{name, ml, key}] */
const PMAP=[[/бурбон/,"bourbon"],[/ирланд/,"irish"],[/джин/,"gin"],[/(^|\s)ром/,"rum"],[/текил/,"tequila"],[/водк/,"vodka"],[/бренди|коньяк/,"brandy"],[/красн\S* вермут/,"sweetV"],[/сух\S* вермут/,"dryV"],[/campari/,"bitter"],[/aperol/,"aperol"],[/triple/,"triple"],[/j[äa]ger/,"jager"],[/амаретто/,"amaretto"],[/кофейн/,"coffee"],[/кола/,"cola"],[/лайм/,"lime"],[/лимон/,"lemon"],[/гренадин/,"grenadine"],[/сироп/,"syrup"],[/содов|сода/,"soda"],[/сливк|молок/,"cream"],[/эспрессо/,"espresso"]];
function parts(recipe){
  return recipe.split(/\s\+\s/).map(p=>{
    const m=p.trim().match(/^(.+?)\s+(\d+(?:[.,]\d+)?)(?:\s*[–-]\s*(\d+))?\s*(?:мл)?$/);
    if(!m)return {name:p.trim(),ml:null,key:null};
    const name=m[1].trim(),a=parseFloat(m[2].replace(",",".")),b=m[3]?parseFloat(m[3]):null;
    const low=name.toLowerCase();const hit=PMAP.find(([r])=>r.test(low));
    return {name,ml:b?(a+b)/2:a,range:b?[a,b]:null,key:hit?hit[1]:null};
  });
}

/* ===== bartender mode ===== */
const GLASS={rocks:"Низкий стакан со льдом",highball:"Высокий стакан, доверху льда",wine:"Бокал для вина со льдом",nick:"Коктейльный бокал — охлади его льдом или в морозилке"};
const VOLS=[250,500,750,1000,1250,1500,2000,2500,3000,4000,5000];
let bt={c:null,k:0,mode:store.get("btMode","port"),n:store.get("btN",1),vol:store.get("btVol",1000),steps:[]};
const fmtMl=v=>String(v).replace(".",",");
const fmtL=v=>v>=1000?fmtMl(v/1000)+" л":v+" мл";
/* Количества для текущего режима. Порции: рецепт × N. Литры: всё с мл масштабируется так,
   чтобы смесь (без льда) была ровно выбранного объёма — округляем до 5 мл и добиваем крупнейший ингредиент. */
function btAmounts(c){
  const ps=parts(c.main.recipe),base=ps.reduce((s,p)=>s+(p.ml||0),0);
  if(bt.mode==="vol"&&base){
    const f=bt.vol/base;
    const rows=ps.map(p=>({...p,amt:p.ml!=null?Math.max(5,Math.round(p.ml*f/5)*5):null}));
    const withMl=rows.filter(r=>r.amt!=null);
    const diff=bt.vol-withMl.reduce((s,r)=>s+r.amt,0);
    if(diff&&withMl.length){const big=withMl.reduce((a,b)=>b.amt>a.amt?b:a);big.amt+=diff}
    return {rows:rows.map(r=>({name:r.name,txt:r.amt!=null?fmtMl(r.amt)+" мл":"по вкусу",ml:r.amt})),total:bt.vol,serv:bt.vol/base};
  }
  const n=bt.n,r1=v=>{const x=v*n;return x>=20?Math.round(x):Math.round(x*2)/2};
  const rows=ps.map(p=>({name:p.name,ml:p.ml!=null?r1(p.ml):null,
    txt:p.ml==null?"по вкусу":(p.range?fmtMl(r1(p.range[0]))+"–"+fmtMl(r1(p.range[1])):fmtMl(r1(p.ml)))+" мл"}));
  return {rows,total:Math.round(base*n),serv:n};
}
function btSteps(c){
  const a=btAmounts(c);
  const servTxt=bt.mode==="vol"?`≈ ${fmtMl(Math.round(a.serv*10)/10)} ${plural(Math.round(a.serv),"порция","порции","порций")}`:`${bt.n} ${plural(bt.n,"порция","порции","порций")}`;
  const s=[{kind:"Рецепт целиком",big:"",overview:true,rows:a.rows,
    txt:`${bt.mode==="vol"?"Смесь без льда":"Итого жидкости"}: <b>${fmtL(a.total)}</b> · ${servTxt}`,
    glass:(bt.mode==="vol"?"Большой кувшин или шейкер по частям. Подача: ":"")+(GLASS[c.art.shape]||"Бокал и лёд")}];
  a.rows.forEach(r=>s.push(r.ml!=null?{kind:"Налей",big:r.txt,txt:cap(r.name)}:{kind:"Добавь",big:"",txt:cap(r.name)}));
  const low0=c.main.recipe.toLowerCase();
  (c.extras||[]).filter(x=>x.mode!=="optional"&&!low0.includes(x.name.toLowerCase().split(/[\s/]/)[0])).forEach(x=>s.push({kind:"Совет",big:"",txt:x.name+". "+x.effect.replace(/\.$/,"")}));
  c.serve.split(/(?<=[.!])\s+/).filter(Boolean).forEach(t=>{
    const low=t.toLowerCase();let sec=0;const m=low.match(/(\d+)(?:\s*[–-]\s*(\d+))?\s*сек/);
    if(m)sec=+(m[2]||m[1]); else if(/встрях/.test(low))sec=12; else if(/^мешать|мешать со льдом/.test(low))sec=20;
    s.push({kind:sec?"Время":"Дальше",big:"",txt:t.replace(/\.$/,""),sec});
  });
  s.push({kind:"Готово",big:"За семью",txt:c.name+" · "+c.abv+"°",art:true,end:true});
  return s;
}
async function openBartender(i){
  const c=cocktails[i];bt.c=c;bt.k=0;bt.steps=btSteps(c);
  openPanel("bartender","Режим бармена");pNav.hidden=false;
  try{if("wakeLock"in navigator)wake=await navigator.wakeLock.request("screen")}catch(_){}
  renderBt();
}
function renderBt(){
  const {c,k,steps}=bt,st=steps[k];stopTimer();
  const sel=bt.mode==="vol"
    ?`<select id="btVol" class="bt-sel" aria-label="Объём смеси">${VOLS.map(v=>`<option value="${v}" ${v===bt.vol?"selected":""}>${fmtL(v)} смеси</option>`).join("")}</select>`
    :`<select id="btN" class="bt-sel" aria-label="Порции">${Array.from({length:20},(_,i)=>i+1).map(n=>`<option value="${n}" ${n===bt.n?"selected":""}>${n} ${plural(n,"порция","порции","порций")}</option>`).join("")}</select>`;
  pBody.innerHTML=`<div class="bt-top"><div class="bt-ctl"><div class="bt-seg"><button type="button" class="${bt.mode==="port"?"on":""}" data-pa="btmode" data-m="port">Порции</button><button type="button" class="${bt.mode==="vol"?"on":""}" data-pa="btmode" data-m="vol">Литры</button></div>${sel}</div>
    <div class="bt-prog">${steps.map((_,j)=>`<i class="${j<=k?"f":""}"></i>`).join("")}</div></div>
  ${st.overview?`<div class="bt-step bt-ov">
    <div class="bt-art sm">${glass(c.art,{thumb:true})}</div>
    <div class="bt-k">${st.kind} · ${k+1} из ${steps.length}</div>
    <div class="bt-name">${c.name}</div>
    <div class="menu-rows bt-rows">${st.rows.map(r=>`<div class="mr"><span>${cap(r.name)}</span><i></i><b>${r.txt}</b></div>`).join("")}</div>
    <div class="bt-sum">${st.txt}</div>
    <div class="bt-glass">${st.glass}</div></div>`
  :`<div class="bt-step" data-pa="next">
    ${st.art?`<div class="bt-art">${glass(c.art,{thumb:true,pour:st.end})}</div>`:""}
    <div class="bt-k">${st.kind} · ${k+1} из ${steps.length}</div>
    ${st.big?`<div class="bt-big">${st.big}</div>`:""}
    <div class="bt-txt">${st.txt}</div>
    ${st.sec?`<button type="button" class="timer" data-pa="timer" data-s="${st.sec}"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="tr-bg"/><circle cx="60" cy="60" r="52" class="tr" id="tRing"/></svg><span id="tTxt">${st.sec} с</span><small id="tSub">Нажми — старт</small></button>`:""}
  </div>`}`;
  pNav.innerHTML=`<button class="btn btn-ghost" type="button" data-pa="prev" ${k?"":"disabled"}>Назад</button><button class="btn btn-brass" type="button" data-pa="${st.end?"done":"next"}">${st.end?"Закрыть":k===0?"Начать":"Дальше"}</button>`;
  if(st.end)buzz([20,60,20]);
}
function btRebuild(){store.set("btMode",bt.mode);store.set("btN",bt.n);store.set("btVol",bt.vol);bt.steps=btSteps(bt.c);if(bt.k>=bt.steps.length)bt.k=0;renderBt()}
let tmr=null;
function stopTimer(){clearInterval(tmr);tmr=null}
function startTimer(btn,sec){
  if(tmr){stopTimer();btn.classList.remove("run");$("#tTxt").textContent=sec+" с";$("#tSub").textContent="Нажми — старт";$("#tRing").style.strokeDashoffset=0;return}
  const t0=Date.now(),ring=$("#tRing"),L=2*Math.PI*52;ring.style.strokeDasharray=L;btn.classList.add("run");$("#tSub").textContent="Нажми — стоп";buzz(15);
  tmr=setInterval(()=>{const left=Math.max(0,sec-(Date.now()-t0)/1000);
    $("#tTxt").textContent=Math.ceil(left)+" с";ring.style.strokeDashoffset=L*(1-left/sec);
    if(left<=0){stopTimer();btn.classList.remove("run");btn.classList.add("fin");$("#tTxt").textContent="Готово";$("#tSub").textContent="Дальше →";buzz([200,80,200]);}
  },100);
}

/* ===== party calculator ===== */
const BOT={bourbon:700,irish:700,gin:700,rum:700,tequila:700,vodka:700,brandy:700,sweetV:1000,dryV:1000,bitter:750,aperol:700,triple:700,jager:700,amaretto:700,coffee:700};
const PT={guests:store.get("ptGuests",6),per:store.get("ptPer",3),sel:new Set(store.get("ptSel",[]))};
function openParty(){
  if(!PT.sel.size)(S.favs.size?[...S.favs]:cocktails.filter(c=>c.premium).slice(0,4).map(c=>c.i)).forEach(i=>PT.sel.add(i));
  openPanel("party","Вечеринка");renderParty();
}
function partyCalc(){
  const list=[...PT.sel].map(i=>cocktails[i]).filter(Boolean);
  const total=PT.guests*PT.per;const each=list.length?Math.ceil(total/list.length):0;
  const sum={},misc={};
  list.forEach(c=>parts(c.main.recipe).forEach(p=>{if(p.ml==null)return;
    if(p.key)sum[p.key]=(sum[p.key]||0)+p.ml*each; else misc[p.name.toLowerCase()]=(misc[p.name.toLowerCase()]||0)+p.ml*each;}));
  const rowsOut=[];
  Object.keys(BOT).forEach(k=>{if(!sum[k])return;const ml=sum[k],n=Math.ceil(ml/BOT[k]);
    rowsOut.push({grp:"Бутылки",name:ING[k].label,val:`${n} × ${BOT[k]/1000>=1?BOT[k]/1000+" л":BOT[k]+" мл"}`,sub:`≈ ${Math.round(ml/10)*10} мл`});});
  const L=v=>(Math.ceil(v/500)*0.5).toString().replace(".",",")+" л";
  if(sum.lime)rowsOut.push({grp:"Фрукты и миксеры",name:"Лаймы",val:Math.ceil(sum.lime/25)+" шт",sub:`сок ≈ ${Math.round(sum.lime)} мл`});
  if(sum.lemon)rowsOut.push({grp:"Фрукты и миксеры",name:"Лимоны",val:Math.ceil(sum.lemon/35)+" шт",sub:`сок ≈ ${Math.round(sum.lemon)} мл`});
  if(sum.cola)rowsOut.push({grp:"Фрукты и миксеры",name:"Кола",val:L(sum.cola),sub:""});
  if(sum.soda)rowsOut.push({grp:"Фрукты и миксеры",name:"Содовая",val:L(sum.soda),sub:""});
  if(sum.cream)rowsOut.push({grp:"Фрукты и миксеры",name:"Сливки",val:L(sum.cream),sub:""});
  if(sum.syrup)rowsOut.push({grp:"Фрукты и миксеры",name:"Сахарный сироп",val:Math.ceil(sum.syrup/50)*50+" мл",sub:"сахар и вода 1:1"});
  if(sum.espresso)rowsOut.push({grp:"Фрукты и миксеры",name:"Эспрессо",val:Math.ceil(sum.espresso/30)+" шотов",sub:""});
  if(sum.grenadine)rowsOut.push({grp:"Фрукты и миксеры",name:"Гренадин",val:Math.ceil(sum.grenadine/10)*10+" мл",sub:""});
  rowsOut.push({grp:"Лёд",name:"Лёд",val:Math.ceil(total*0.3)+" кг",sub:"с запасом на шейкер и стаканы"});
  return {list,total,each,rows:rowsOut};
}
function renderParty(){
  const r=partyCalc();
  const stp=(id,v,lbl)=>`<div class="stp"><span>${lbl}</span><div><button type="button" class="ib" data-pa="${id}" data-d="-1" aria-label="Меньше">−</button><b>${v}</b><button type="button" class="ib" data-pa="${id}" data-d="1" aria-label="Больше">+</button></div></div>`;
  let grp="";
  pBody.innerHTML=`<p class="p-lead">Скажи, сколько вас и что наливаем, — Дон посчитает, что купить.</p>
  ${stp("guests",PT.guests,"Гостей")}${stp("per",PT.per,"Коктейлей на человека")}
  <div class="p-sec"><h4>Что наливаем <small>${PT.sel.size} выбрано</small></h4><div class="pick">${cocktails.map(c=>`<button type="button" class="pill ${PT.sel.has(c.i)?"on":""}" data-pa="sel" data-i="${c.i}">${c.name}</button>`).join("")}</div></div>
  ${r.list.length?`<div class="p-sec"><h4>Список покупок <small>${r.total} ${plural(r.total,"коктейль","коктейля","коктейлей")} · по ${r.each} каждого</small></h4><div class="res">${r.rows.map(x=>{const h=x.grp!==grp?`<div class="res-g">${grp=x.grp}</div>`:"";return h+`<div class="mr"><span>${x.name}${x.sub?`<small>${x.sub}</small>`:""}</span><i></i><b>${x.val}</b></div>`}).join("")}</div>
  <p class="fine">Бутылки считаются по основным рецептам. Лучше взять с запасом — гости любят повторять.</p></div>`:`<div class="empty"><p>Выбери хотя бы один коктейль.</p></div>`}`;
  pNav.hidden=!r.list.length;
  pNav.innerHTML=`<button class="btn btn-brass" type="button" data-pa="pcopy">Скопировать список</button>`;
  store.set("ptGuests",PT.guests);store.set("ptPer",PT.per);store.set("ptSel",[...PT.sel]);
}

/* ===== Don's cards (game) ===== */
let G={tab:"decks",view:"decks",back:"decks",deck:null,pending:null,hard:store.get("gHard",false),turns:Math.min(99,Math.max(20,+store.get("gTurns",33)||33)),cards:[],k:0,turn:0,
  players:store.get("gPlayers",[]),q:null,score:0,streak:0,n:0};
let agreed=false;
const deckById=id=>DECKS.find(d=>d.id===id);
const esc=s=>String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const HAT=`<svg class="g-corner" viewBox="0 0 24 24"><path d="M2.5 15.5c4 2.6 15 2.6 19 0"/><path d="M5.5 15c0-4.5 1.6-9 4-9 1.1 0 1.6 1.2 2.5 1.2S13.4 6 14.5 6c2.4 0 4 4.5 4 9"/></svg>`;
const WATER=["Дон бережёт семью","Пауза: все пьют воду. Потом продолжаем."];
function openCards(){openPanel("cards","Карты Дона");G.tab="decks";G.view="decks";renderCards()}
/* «Разгоняемся»: игра делится на этапы по уровням колод; верхний этап — самый длинный,
   чтобы взрослые карты были и в короткой игре. На каждом ходу карта берётся из колоды этапа,
   иногда — на уровень ниже (передышка) или выше (анонс). Карты не повторяются. */
const RAMP_STAGES={5:[.08,.16,.20,.22,.34],6:[.06,.11,.15,.18,.23,.27]};
function buildRamp(){
  const top=G.hard?6:5,ranks=G.hard?RAMP_RANKS.concat(RAMP_TOP):RAMP_RANKS,W=RAMP_STAGES[top];
  const pools={};for(let l=1;l<=top;l++)pools[l]=shuffle(DECKS.find(d=>d.lvl===l).cards.filter(c=>c[0]!=="Двойная карта"&&c[0]!=="Дон бережёт семью"));
  const take=l=>{for(let d=0;d<6;d++)for(const x of [l-d,l+d])if(x>=1&&x<=top&&pools[x].length)return {lvl:x,card:pools[x].pop()};return {lvl:l,card:WATER}};
  const N=G.turns,stage=p=>{let acc=0;for(let i=0;i<W.length;i++){acc+=W[i];if(p<acc)return i+1}return top};
  return Array.from({length:N},(_,k)=>{
    const s=stage((k+.5)/N),r=Math.random();
    let l=s;if(k<N-2){if(r<.1&&s>1)l=s-1;else if(r<.2&&s<top)l=s+1}
    const c=(k%11===10&&k<N-3)?{lvl:s,card:WATER}:take(l);c.stage=s;
    c.rank=ranks[Math.min(ranks.length-1,Math.floor(k*ranks.length/N))];
    return c;
  });
}
function startDeck(id){
  const adult=id==="ramp"||deckById(id).adult;
  if(adult&&!agreed){G.pending=id;G.view="rules";return renderCards()}
  G.deck=id;G.k=0;G.turn=0;G.view="play";
  G.cards=id==="ramp"?buildRamp():shuffle(deckById(id).cards).map(card=>({lvl:deckById(id).lvl,card}));
  renderCards();pBody.scrollTop=0;
}
function drawNext(){
  if(G.k>=G.cards.length)return;G.showLvl=false;G.showAlt=false;
  const prev=G.cards[G.k];G.k++;G.turn++;buzz(8);
  const nx=G.cards[G.k];
  if(G.deck==="ramp"&&nx&&nx.rank!==prev.rank){toast(`Повышение в семье: ${nx.rank}`);buzz([20,50,20,50,40])}
  renderCards();
}
const who=off=>{const n=G.players.length;return n?G.players[((G.turn+off)%n+n)%n]:null};
const heat=l=>`<span class="heat lv${l}" aria-label="Уровень ${l} из 6">${[1,2,3,4,5,6].map(i=>`<i class="${i<=l?"f":""}"></i>`).join("")}</span>`;
function tabs(){return `<div class="g-tabs"><button type="button" class="pill ${G.tab==="decks"?"on":""}" data-pa="gtab" data-m="decks">Колоды</button><button type="button" class="pill ${G.tab==="quiz"?"on":""}" data-pa="gtab" data-m="quiz">Угадай коктейль</button></div>`}
function roster(){
  const p=G.players;
  return `<div class="roster"><div class="r-h"><b>Очередь игроков</b><small>${p.length?p.length+" "+plural(p.length,"игрок","игрока","игроков"):"необязательно — карта сама скажет, чей ход"}</small></div>
  ${p.length?`<div class="r-list">${p.map((n,i)=>`<span class="r-chip"><i>${i+1}</i>${esc(n)}<button type="button" data-pa="rdel" data-i="${i}" aria-label="Убрать ${esc(n)}">×</button></span>`).join("")}</div>`:""}
  <form class="r-add" id="rAdd"><input id="rName" maxlength="20" placeholder="Имя игрока" autocomplete="off" enterkeyhint="done"><button type="submit" class="ib">Добавить</button></form>
  ${p.length>1?`<div class="r-acts"><button type="button" class="g-back" data-pa="rshuf">Перемешать очередь</button><button type="button" class="g-back" data-pa="rclear">Очистить</button></div>`:""}</div>`;
}
function renderCards(){
  if(G.tab==="quiz")return renderQuiz();
  if(G.view==="play")return renderPlay();
  if(G.view==="rampset"){
    const top=G.hard?6:5,T=G.turns,mins=Math.round(T*1.5);
    pBody.innerHTML=`<div class="g-bar lv${top}"><button type="button" class="g-back" data-pa="decks">← Колоды</button><span><b>Разгоняемся</b> · настройка</span></div>
    <div class="gcard lv${top} rset">${HAT}<div class="g-kind">Сколько ходов играем?</div>
      <div class="rs-num"><button type="button" class="ib" data-pa="turns" data-d="-5" aria-label="Минус 5">−5</button><b>${T}</b><button type="button" class="ib" data-pa="turns" data-d="5" aria-label="Плюс 5">+5</button></div>
      <input type="range" id="rsRange" min="20" max="99" step="1" value="${T}" aria-label="Количество ходов">
      <div class="rs-presets">${[20,33,50,75,99].map(n=>`<button type="button" class="pill ${n===T?"on":""}" data-pa="turnsset" data-n="${n}">${n}</button>`).join("")}</div>
      <p class="rs-hint">Примерно ${mins<60?mins+" минут":Math.floor(mins/60)+" ч "+(mins%60?mins%60+" мин":"")}. Разгон растянется на все ${T} ${plural(T,"ход","хода","ходов")} — от лёгких карт до ${G.hard?"красной комнаты":"«Кровных уз»"}.</p>
      <button type="button" class="pill hard ${G.hard?"on":""}" data-pa="hard" aria-pressed="${G.hard}">${G.hard?"Без тормозов: включено":"Без тормозов — до красного уровня"}</button></div>`;
    pNav.hidden=false;pNav.innerHTML=`<button class="btn btn-brass" type="button" data-pa="rampgo">Начать</button>`;
    return;
  }
  if(G.view==="roster"){
    pBody.innerHTML=`<div class="g-bar"><button type="button" class="g-back" data-pa="rdone">← К игре</button><span>Состав можно менять прямо по ходу игры</span></div>${roster()}`;
    pNav.hidden=false;pNav.innerHTML=`<button class="btn btn-brass" type="button" data-pa="rdone">Вернуться к игре</button>`;return;
  }
  if(G.view==="rules"){
    pBody.innerHTML=`<div class="gcard lv5 rules"><div class="g-kind">Закон семьи · 18+</div>
      <p class="g-txt">Дальше будет жарче.</p>
      <ul class="g-rules"><li>Только для взрослых и только для своих.</li><li>Любой может сказать «пас» — без объяснений и без штрафа.</li><li>Касания и поцелуи — только если второй человек согласен.</li><li>Стоп-фраза <b>«Дон не одобряет»</b> останавливает любое задание.</li><li>Что было за столом — остаётся за столом.</li></ul></div>`;
    pNav.hidden=false;
    pNav.innerHTML=`<button class="btn btn-ghost" type="button" data-pa="decks">Назад</button><button class="btn btn-brass" type="button" data-pa="agree">Мы в деле</button>`;
    return;
  }
  const top=G.hard?6:5;
  pBody.innerHTML=`${tabs()}${roster()}
  <button type="button" class="deck ramp lv${top}" data-pa="deck" data-id="ramp"><span class="d-lv">${HAT}</span><span class="d-t"><b>Разгоняемся</b><small>Карьера в Семье: карты из всех колод вперемешку, ${G.turns} ${plural(G.turns,"ход","хода","ходов")} от лёгких до ${G.hard?"красной комнаты":"«Кровных уз»"}</small></span>${heat(top)}</button>
  <button type="button" class="pill hard ${G.hard?"on":""}" data-pa="hard" aria-pressed="${G.hard}">${G.hard?"Без тормозов: включено":"Без тормозов — до красного уровня"}</button>
  <div class="decks">${DECKS.map(d=>`<button type="button" class="deck lv${d.lvl}" data-pa="deck" data-id="${d.id}"><span class="d-lv">${d.lvl}</span><span class="d-t"><b>${d.name}${d.adult?` <em>18+</em>`:""}</b><small>${d.sub}</small></span>${heat(d.lvl)}</button>`).join("")}</div>`;
  pNav.hidden=true;
}
function renderPlay(){
  const n=G.cards.length,done=G.k>=n,ramp=G.deck==="ramp",d=ramp?null:deckById(G.deck);
  const cur=done?null:G.cards[G.k];
  const lvl=ramp?(cur?cur.stage:(G.hard?6:5)):(cur?cur.lvl:d.lvl);
  const lvlInfo=cur&&ramp?(G.showLvl?`<button type="button" class="g-lvl on" data-pa="lvl">${heat(cur.lvl)} ${DECKS.find(x=>x.lvl===cur.lvl).name}</button>`:`<button type="button" class="g-lvl" data-pa="lvl">А что за уровень?</button>`):"";
  const [kind,txt]=done?["Конец колоды","Дон доволен вечером. Перемешать и сыграть ещё раз?"]:cur.card;
  const noPen=["Дон бережёт семью","Клятва","Финал","Двойная карта"];
  if(cur&&cur.lvl>=5&&!noPen.includes(kind)&&!cur.pen)cur.pen=PENALTIES[Math.floor(Math.random()*PENALTIES.length)];
  const alt=cur&&cur.pen?(G.showAlt?`<div class="g-alt" data-pa="alt"><b>Не хочешь — штраф:</b>${cur.pen}<small>«Дон не одобряет» отменяет задание без всякого штрафа.</small></div>`:`<button type="button" class="g-lvl" data-pa="alt">А есть ещё варианты?</button>`):"";
  const me=who(0),next=who(1);
  pBody.innerHTML=`<div class="g-bar lv${lvl}"><button type="button" class="g-back" data-pa="decks">← Колоды</button><span>${ramp?`<b>${(cur||G.cards[n-1]).rank}</b> · Разгоняемся`:d.name}</span><button type="button" class="g-pl" data-pa="roster" aria-label="Игроки"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.3 3-5 6-5s5.4 1.7 6 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.2c2.6.2 4.4 1.8 5 4.8"/></svg>${G.players.length||"+"}</button></div>
  ${ramp?`<div class="bt-prog ramp-prog" style="gap:${n>45?1:n>30?2:4}px">${G.cards.map((c,j)=>`<i class="lv${lvl} ${j<=G.k?"f":""}"></i>`).join("")}</div>`:""}
  <div class="gcard lv${lvl}" data-pa="${done?"reshuffle":"draw"}">${HAT}
    ${me&&!done?`<div class="g-who">Ход: <b>${esc(me)}</b></div>`:""}
    <div class="g-kind">${kind}</div><p class="g-txt">${txt}</p>${lvlInfo||alt?`<div class="g-opts">${lvlInfo}${alt}</div>`:""}
    <div class="g-foot">${done?"":`${G.k+1} / ${n}${next&&G.players.length>1?` · дальше: ${esc(next)}`:" · нажми — следующая"}`}</div></div>`;
  pNav.hidden=false;
  pNav.innerHTML=`<button class="btn btn-ghost" type="button" data-pa="gprev" ${G.k?"":"disabled"}>Назад</button><button class="btn btn-brass" type="button" data-pa="${done?"reshuffle":"draw"}">${done?"Ещё раз":"Следующая карта"}</button>`;
}
panel.addEventListener("input",e=>{
  if(e.target.id!=="rsRange")return;G.turns=+e.target.value;store.set("gTurns",G.turns);
  const b=pBody.querySelector(".rs-num b");if(b)b.textContent=G.turns;
});
panel.addEventListener("change",e=>{
  if(e.target.id==="rsRange")renderCards();
  if(e.target.id==="btN"){bt.n=+e.target.value;btRebuild()}
  if(e.target.id==="btVol"){bt.vol=+e.target.value;btRebuild()}
});
panel.addEventListener("submit",e=>{
  if(e.target.id!=="rAdd")return;e.preventDefault();
  const inp=$("#rName"),v=inp.value.trim().replace(/\s+/g," ").slice(0,20);
  if(!v)return;G.players.push(v);store.set("gPlayers",G.players);renderCards();const i2=$("#rName");if(i2)i2.focus();
});
function newQuiz(){
  const all=cocktails,c=pick(all);
  const opts=shuffle([c,...shuffle(all.filter(x=>x!==c&&x.base===c.base)).slice(0,1),...shuffle(all.filter(x=>x!==c)).slice(0,6)].filter((x,i,a)=>a.indexOf(x)===i).slice(0,4));
  G.q={c,opts:shuffle(opts),ans:null};
}
function renderQuiz(){
  pNav.hidden=false;
  if(!G.q)newQuiz();
  const {c,opts,ans}=G.q;
  const ings=parts(c.main.recipe).map(p=>cap(p.name)+(p.ml!=null?` · ${p.range?p.range.join("–"):p.ml} мл`:"")).map(x=>`<span class="chipb">${x}</span>`).join("");
  pBody.innerHTML=`${tabs()}<div class="q-score"><span>Счёт <b>${G.score}</b> из ${G.n}</span><span>Серия <b>${G.streak}</b></span></div>
  <div class="q-card"><div class="q-art">${glass(c.art,{thumb:true})}</div><div class="chips q-ings">${ings}</div>${ans?`<p class="q-fam">${c.family} · ${c.abv}°</p>`:`<p class="q-fam">Что это за коктейль?</p>`}</div>
  <div class="q-opts">${opts.map(o=>`<button type="button" class="qo ${ans?(o===c?"ok":o===ans?"bad":"dim"):""}" data-pa="ans" data-i="${o.i}" ${ans?"disabled":""}>${o.name}</button>`).join("")}</div>`;
  pNav.innerHTML=ans?`<button class="btn btn-ghost" type="button" data-pa="qopen">Рецепт</button><button class="btn btn-brass" type="button" data-pa="qnext">Дальше</button>`:`<button class="btn btn-ghost" type="button" data-pa="qnext">Пропустить</button>`;
}

panel.addEventListener("click",e=>{
  const el=e.target.closest("[data-pa]");if(!el)return;const a=el.dataset.pa;
  if(a==="next"||a==="prev"){bt.k=Math.max(0,Math.min(bt.steps.length-1,bt.k+(a==="next"?1:-1)));renderBt();pBody.scrollTop=0;return}
  if(a==="timer"){e.stopPropagation();startTimer(el,+el.dataset.s);return}
  if(a==="btmode"){bt.mode=el.dataset.m;btRebuild();return}
  if(a==="done"){closePanel();return}
  if(a==="guests"){PT.guests=Math.max(1,Math.min(60,PT.guests+ +el.dataset.d));renderParty();return}
  if(a==="per"){PT.per=Math.max(1,Math.min(10,PT.per+ +el.dataset.d));renderParty();return}
  if(a==="sel"){const i=+el.dataset.i;PT.sel.has(i)?PT.sel.delete(i):PT.sel.add(i);const y=pBody.scrollTop;renderParty();pBody.scrollTop=y;return}
  if(a==="pcopy"){const r=partyCalc();copy(`La Famiglia — вечеринка на ${PT.guests} (${r.total} ${plural(r.total,"коктейль","коктейля","коктейлей")})\nМеню: ${r.list.map(c=>c.name).join(", ")}\n\n`+r.rows.map(x=>`• ${x.name} — ${x.val}${x.sub?` (${x.sub})`:""}`).join("\n"),"Список скопирован");return}
  if(a==="gtab"){G.tab=el.dataset.m;G.view="decks";if(G.tab==="quiz")G.q=null;pNav.hidden=G.tab!=="quiz";renderCards();return}
  if(a==="deck"){if(el.dataset.id==="ramp"){G.view="rampset";renderCards();pBody.scrollTop=0}else startDeck(el.dataset.id);return}
  if(a==="turns"||a==="turnsset"){G.turns=Math.min(99,Math.max(20,a==="turns"?G.turns+ +el.dataset.d:+el.dataset.n));store.set("gTurns",G.turns);renderCards();return}
  if(a==="rampgo"){startDeck("ramp");return}
  if(a==="hard"){G.hard=!G.hard;store.set("gHard",G.hard);renderCards();return}
  if(a==="agree"){agreed=true;startDeck(G.pending);return}
  if(a==="decks"){G.view="decks";renderCards();pBody.scrollTop=0;return}
  if(a==="draw"){drawNext();return}
  if(a==="gprev"){if(G.k>0){G.k--;G.turn--;G.showLvl=G.showAlt=false;renderCards()}return}
  if(a==="lvl"){G.showLvl=!G.showLvl;renderCards();return}
  if(a==="alt"){G.showAlt=!G.showAlt;renderCards();return}
  if(a==="roster"){G.curName=who(0);G.view="roster";renderCards();return}
  if(a==="rdone"){const i=G.players.indexOf(G.curName);if(i>=0)G.turn=i;G.view="play";renderCards();return}
  if(a==="rdel"){G.players.splice(+el.dataset.i,1);store.set("gPlayers",G.players);renderCards();return}
  if(a==="rshuf"){G.players=shuffle(G.players);G.turn=0;store.set("gPlayers",G.players);renderCards();return}
  if(a==="rclear"){G.players=[];store.set("gPlayers",G.players);renderCards();return}
  if(a==="reshuffle"){startDeck(G.deck);buzz(12);return}
  if(a==="ans"){const o=cocktails[+el.dataset.i];G.q.ans=o;G.n++;if(o===G.q.c){G.score++;G.streak++;buzz([15,40,15])}else{G.streak=0;buzz(120)}renderQuiz();return}
  if(a==="qnext"){G.q=null;renderQuiz();return}
  if(a==="qopen"){const i=G.q.c.i;closePanel(true);history.replaceState({sheet:i},"","#"+i);openSheet(i,false);return}
});
/* swipe between bartender steps / cards */
(function(){let x0=null,y0=0;
  pBody.addEventListener("touchstart",e=>{if(e.touches.length===1){x0=e.touches[0].clientX;y0=e.touches[0].clientY}},{passive:true});
  pBody.addEventListener("touchend",e=>{if(x0==null)return;const dx=e.changedTouches[0].clientX-x0,dy=e.changedTouches[0].clientY-y0;x0=null;
    if(Math.abs(dx)<60||Math.abs(dy)>Math.abs(dx))return;
    if(pKind==="bartender"){bt.k=Math.max(0,Math.min(bt.steps.length-1,bt.k+(dx<0?1:-1)));renderBt()}
    else if(pKind==="cards"&&G.tab==="decks"&&G.view==="play"){if(dx<0)drawNext();else if(G.k>0){G.k--;G.turn--;G.showLvl=G.showAlt=false;renderCards()}}
  });
})();

/* ---------- init ---------- */
history.replaceState({},"",location.pathname+location.search);
renderRails();renderMenu();barCount();renderFav();
})();

if("serviceWorker"in navigator)addEventListener("load",()=>navigator.serviceWorker.register("./sw.js",{scope:"./"}).catch(()=>{}));
