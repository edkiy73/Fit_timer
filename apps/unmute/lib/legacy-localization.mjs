// Owner decision 7: the course must not be about Bali. The pinned English Trainer source stays
// untouched; the importer rewrites its Bali-specific text into several ordinary expat places
// (Tbilisi, Lisbon, Dubai, Bangkok, Batumi, Belgrade) before parsing. Each pair is an exact
// substring of the pinned source, so prompts, accepted answers and explanations stay in sync.
export const LEGACY_LOCALIZATION = [
  // Present Simple / Continuous theory and cards
  ['q:"___ you live in Bali?",ru:"Ты живёшь на Бали?"', 'q:"___ you live in Dubai?",ru:"Ты живёшь в Дубае?"'],
  ['I live in Bali. I work in IT.', 'I live in Tbilisi. I work in IT.'],
  ['Живу на Бали. Работаю в IT.', 'Живу в Тбилиси. Работаю в IT.'],
  ["I'm staying in Canggu this month.", "I'm staying in Bangkok this month."],
  ['В этом месяце живу в Чангу.', 'В этом месяце живу в Бангкоке.'],
  ['<td>I live in Bali.</td>', '<td>I live in Lisbon.</td>'],
  ["I'm living in Bali at the moment.", "I'm living in Lisbon at the moment."],
  ['ru:"Мы живём на Бали.",a:["we live in bali"]', 'ru:"Мы живём в Лиссабоне.",a:["we live in lisbon"]'],
  ['Предлог для страны и острова — in: in Bali, in Russia.', 'Предлог для страны и города — in: in Portugal, in Russia.'],
  ['"pres-simple#10":["we\'re living in bali"]', '"pres-simple#10":["we\'re living in lisbon"]'],
  ['["Мы живём на Бали.","We live in Bali."],["Он живёт в Убуде.","He lives in Ubud."]',
    '["Мы живём в Лиссабоне.","We live in Lisbon."],["Он живёт в Батуми.","He lives in Batumi."]'],
  ['She lives in Ubud. (Where?)', 'She lives in Batumi. (Where?)'],
  // Prepositions and articles
  ['in my bag, in Bali, in Russia', 'in my bag, in Georgia, in Russia'],
  ['q:"We arrived ___ Bali on Sunday.",ru:"Мы прилетели на Бали в воскресенье."',
    'q:"We arrived ___ Dubai on Sunday.",ru:"Мы прилетели в Дубай в воскресенье."'],
  ['I live on Jalan Raya.', 'I live on Rustaveli Avenue.'],
  ['<span class="en">in Bali, from Russia</span>', '<span class="en">in Lisbon, from Russia</span>'],
  // Conversation phrases, linkers, story
  ['["How long have you been in Bali?","Давно ты на Бали?"]', '["How long have you been here?","Давно ты здесь?"]'],
  ["That's why I use Grab.", "That's why I use taxi apps."],
  ['Do you like living in Bali?', 'Do you like living in Lisbon?'],
  ['so I stopped at a warung. It turned out the owner was from Java', 'so I stopped at a small café. It turned out the owner was from Porto'],
  ['поэтому я остановился у варунга. Оказалось, хозяин с Явы', 'поэтому я зашёл в маленькое кафе. Оказалось, хозяин из Порту'],
  // Comparisons
  ["It's cheaper than Ubud.", "It's cheaper than Batumi."],
  ['Это дешевле, чем Убуд.', 'Это дешевле, чем Батуми.'],
  ['ru:"Это дешевле, чем в Убуде.",a:["it\'s cheaper than in ubud","it\'s cheaper than ubud","this is cheaper than in ubud"',
    'ru:"Это дешевле, чем в Батуми.",a:["it\'s cheaper than in batumi","it\'s cheaper than batumi","this is cheaper than in batumi"'],
  ['["Здесь дешевле, чем в Убуде.","It\'s cheaper than in Ubud."]', '["Здесь дешевле, чем в Батуми.","It\'s cheaper than in Batumi."]'],
  // About me
  ["I'm from Russia, but I've been living in Bali for a while.", "I'm from Russia, but I've been living in Tbilisi for a while."],
  ['<h3>3. Почему Бали</h3>', '<h3>3. Почему Тбилиси</h3>'],
  ['Here I can work and still go to the beach in the evening.', 'Here I can work and still walk around the old town in the evening.'],
  ['And the rainy season is tough.', 'And the summer heat is tough.'],
  ['ru:"Я из России, но живу на Бали.",a:["i\'m from russia, but i live in bali","i\'m from russia but i live in bali","i am from russia but i live in bali"]',
    'ru:"Я из России, но живу в Тбилиси.",a:["i\'m from russia, but i live in tbilisi","i\'m from russia but i live in tbilisi","i am from russia but i live in tbilisi"]'],
  ['["Я из России, но живу на Бали.","I\'m from Russia, but I live in Bali."]', '["Я из России, но живу в Тбилиси.","I\'m from Russia, but I live in Tbilisi."]'],
  // Dialogues and AI talk
  ['q:"Oh nice. How long have you been in Bali?",ru:"Классно. Давно ты на Бали?"', 'q:"Oh nice. How long have you been in Belgrade?",ru:"Классно. Давно ты в Белграде?"'],
  ['q:"That\'ll be sixty thousand rupiah.",ru:"С вас шестьдесят тысяч."', 'q:"That\'ll be twelve euros.",ru:"С вас двенадцать евро."'],
  ['q:"Are you going to stay in Bali?",ru:"Собираешься остаться на Бали?"', 'q:"Are you going to stay in Bangkok?",ru:"Собираешься остаться в Бангкоке?"'],
  ["why you live in Bali", "why you moved abroad"],
  // 40-day plan
  ['"I live in Bali and I work in IT."', '"I live in Tbilisi and I work in IT."'],
  ['который впервые приехал на Бали.', 'который впервые приехал в Бангкок.'],
  ['"You should try the warung near the beach."', '"You should try the street food near the market."'],
  ['сколько времени живёшь на Бали.', 'сколько времени живёшь в Белграде.'],
  ['"I\'ve lived in Bali for two years."', '"I\'ve lived in Belgrade for two years."'],
  ['Сравни вслух Бали и Россию', 'Сравни вслух Тбилиси и Россию'],
  ['"Bali is cheaper than Moscow."', '"Tbilisi is cheaper than Moscow."']
];

/** Must not survive in the imported course or lexicon (Latin words and Cyrillic stems). */
export const BANNED_PLACE = /\b(bali|ubud|canggu|warung|rupiah|java|jalan raya)\b|бали|убуд|чангу|варунг|рупи[йя]|с явы/i;

export function localizeLegacySource(source){
  let out=String(source);
  const missing=[];
  for(const [from,to] of LEGACY_LOCALIZATION){
    if(!out.includes(from)){ missing.push(from.slice(0,60)); continue; }
    out=out.split(from).join(to);
  }
  return {source:out,missing};
}
