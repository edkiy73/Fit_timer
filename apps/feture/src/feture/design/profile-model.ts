import type {DesignPerson} from './fixtures';
export type Copy=readonly [string,string];
export const interestTopics=[
 {id:'bondage',label:['Связывание','Bondage'],note:['Фантазия, желание попробовать и опыт — разные вещи.','Fantasy, curiosity and experience are different things.'],color:'rose'},
 {id:'roles',label:['Ролевые игры','Role play'],note:['Обсуди роли, сценарий и возможность остановиться.','Discuss roles, the scenario and how to stop.'],color:'violet'},
 {id:'closeness',label:['Близость','Closeness'],note:['Какой темп и внимание помогают чувствовать себя спокойно?','What pace and attention help you feel at ease?'],color:'skin'},
 {id:'discovery',label:['Эксперименты','Exploration'],note:['Новое не обязательно пробовать: можно просто исследовать интерес.','You do not have to try something new to explore your interest.'],color:'rose'},
 {id:'senses',label:['Ощущения','Sensory play'],note:['Ощущения и интенсивность обсуждаются отдельно.','Discuss sensations and intensity separately.'],color:'violet'},
 {id:'care',label:['Забота после','Aftercare'],note:['Какое внимание важно до, во время и после встречи?','What care matters before, during and after a gathering?'],color:'skin'},
 {id:'service',label:['Сервис','Service'],note:['Роли и ожидания не определяют обязанностей.','Roles and expectations never create obligations.'],color:'rose'},
 {id:'rituals',label:['Ритуалы','Rituals'],note:['Повторяющиеся действия могут быть способом выражать заботу.','Recurring actions can be a way to express care.'],color:'violet'},
] as const;
export type InterestId=typeof interestTopics[number]['id'];
export type PublicProfile={pronouns:Copy;identity:Copy[];relationship:Copy;role:Copy;seeking:Copy;pace:Copy;languages:string[];interests:Partial<Record<InterestId,number>>};
export const viewerPerson:DesignPerson={id:'me',name:'Alex',age:31,city:'Bali',photo:4,ru:'Люблю море, живые разговоры и знакомства без спешки. Ценю честность и уважение к личным границам.',en:'I love the ocean, real conversations and unhurried connections. Honesty and personal boundaries matter to me.',tags:['Trust','Travel','Music']};
export const personalInterestLevels:Record<InterestId,number>={bondage:67,roles:77,closeness:88,discovery:91,senses:73,care:94,service:42,rituals:55};
export const publicProfiles:Record<string,PublicProfile>={
 me:{pronouns:['он/его','he/him'],identity:[['мужчина','man'],['би','bi']],relationship:['открытые отношения','open relationship'],role:['свитч','switch'],seeking:['общение и свидания','conversation and dating'],pace:['без спешки','unhurried'],languages:['RU','EN'],interests:{bondage:67,roles:77,closeness:88,discovery:91}},
 maya:{pronouns:['она/её','she/her'],identity:[['женщина','woman'],['квир','queer']],relationship:['открытые отношения','open relationship'],role:['свитч','switch'],seeking:['общение и свидания','conversation and dating'],pace:['без спешки','unhurried'],languages:['RU','EN'],interests:{bondage:62,roles:74,closeness:86,care:92}},
 alex:{pronouns:['она/её','she/her'],identity:[['женщина','woman'],['би','bi']],relationship:['полиамория','polyamory'],role:['принимающая роль','receiving role'],seeking:['дружба и общение','friendship and conversation'],pace:['постепенно','gradual'],languages:['EN','DE'],interests:{roles:78,discovery:81,senses:75,service:58}},
 nika:{pronouns:['она/её','she/her'],identity:[['женщина','woman'],['пан','pan']],relationship:['открытые отношения','open relationship'],role:['свитч','switch'],seeking:['общение и свидания','conversation and dating'],pace:['без спешки','unhurried'],languages:['EN','NL'],interests:{closeness:84,discovery:76,senses:64,care:89}},
 lina:{pronouns:['он/его','he/him'],identity:[['мужчина','man'],['квир','queer']],relationship:['полиамория','polyamory'],role:['ведущая роль','leading role'],seeking:['общение и свидания','conversation and dating'],pace:['спонтанно','spontaneous'],languages:['RU','EN'],interests:{bondage:55,roles:81,discovery:88,rituals:69}},
 leo:{pronouns:['он/его','he/him'],identity:[['мужчина','man'],['би','bi']],relationship:['открытые отношения','open relationship'],role:['ведущая роль','leading role'],seeking:['дружба и общение','friendship and conversation'],pace:['постепенно','gradual'],languages:['EN','DE'],interests:{bondage:74,closeness:71,service:83,care:88}},
 sam:{pronouns:['они/их','they/them'],identity:[['небинарная персона','nonbinary'],['пан','pan']],relationship:['полиамория','polyamory'],role:['свитч','switch'],seeking:['дружба и общение','friendship and conversation'],pace:['без спешки','unhurried'],languages:['EN','NL'],interests:{roles:72,discovery:79,senses:83,rituals:66}},
};
export const profileFor=(id:string)=>publicProfiles[id]??publicProfiles.me!;
// Compare only explicitly public interests, never private answers or boundaries.
export const sharedInterests=(id:string,viewerInterests:Partial<Record<InterestId,number>>=profileFor('me').interests)=>interestTopics.filter(t=>(viewerInterests[t.id]??0)>0&&(profileFor(id).interests[t.id]??0)>0);
