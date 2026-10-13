import type {ScreenId} from './screen-registry';
export type Field = {ru:string;en:string;type?:'text'|'textarea'|'date'|'datetime-local'|'number'|'url';options?:readonly string[]};
const f=(ru:string,en:string,type:Field['type']='text',options?:readonly string[]):Field=>({ru,en,type,...(options?{options}:{})});
export const fields:Partial<Record<ScreenId,readonly Field[]>>={
 F02:[f('Язык контента','Content language','text',['RU / EN','RU','EN'])],
 F07:[f('Текст публикации','Post text','textarea'),f('Язык публикации','Post language','text',['RU','EN'])],
 F08:[f('Кто увидит','Audience','text',['Only me','Selected people','App members'])],
 D04:[f('Город','City'),f('Возраст от','Age from','number'),f('Возраст до','Age to','number')],
 P02:[f('Ник','Nickname'),f('Город','City'),f('О себе','About you','textarea'),f('Что ищу','What I am looking for','textarea')],
 P04:[f('Название раздела','Section title'),f('Информация','Information','textarea'),f('Видимость','Visibility','text',['Only me','By permission'])],
 P06:[f('Срок','Duration','text',['24 hours','7 days','No expiry'])],
 P09:[f('Срок','Duration','text',['24 hours','7 days','No expiry'])],
 X03:[f('Условия — только мне','Conditions — only me','textarea'),f('Видимость','Visibility','text',['Only me','By permission','Public'])],
 X11:[f('Аудитория','Audience','text',['Only me','Selected people','App members'])],
 X14:[f('Название записи','Entry title'),f('Мои мысли','My thoughts','textarea')],
 C05:[f('Почему хочешь присоединиться','Why would you like to join?','textarea')],
 C07:[f('Текст обсуждения','Discussion text','textarea')],
 C08:[f('Название сообщества','Community name'),f('Описание','Description','textarea'),f('Правила','Rules','textarea'),f('Вступление','Membership','text',['Open','By application'])],
 E02:[f('Город','City'),f('Дата','Date','date'),f('Язык контента','Content language','text',['RU / EN','RU','EN'])],
 E06:[f('Коротко о себе','A little about you','textarea'),f('Что важно организатору знать','Anything the organiser should know','textarea')],
 E11:[f('Название','Event title'),f('Описание','Description','textarea'),f('Язык встречи','Event language','text',['RU','EN','RU / EN'])],
 E12:[f('Формат','Format','text',['In person','Online']),f('Начало','Starts at','datetime-local'),f('Часовой пояс','Time zone','text',['Asia/Makassar','Europe/Berlin','UTC']),f('Город','City'),f('Закрытый адрес или ссылка','Private venue or joining link')],
 E13:[f('Условия участия','Admission requirements','textarea'),f('Количество мест','Capacity','number'),f('Внешняя регистрация','External booking link','url')],
 E17:[f('Новое время','New start time','datetime-local'),f('Что изменилось','What changed','textarea')],
 E18:[f('Объявление','Announcement','textarea')],
 Q01:[f('Ник партнёра','Partner nickname')],
 Q04:[f('Имя пары','Couple name'),f('О нас','About us','textarea')],
 Q05:[f('Срок','Duration','text',['24 hours','7 days','No expiry'])],
 M01:[f('Описание','Caption'),f('Видимость','Visibility','text',['Only me','By permission','Public'])],
 S02:[f('Причина','Reason','text',['Threats or blackmail','Unauthorised private media','Underage content','Spam or fraud','Other']),f('Что произошло','What happened','textarea')],
 S04:[f('Причина апелляции','Appeal reason','textarea')],
};
export const journeys:readonly (readonly ScreenId[])[]=[
 ['A04','A05','X07','X08','X09','X02'],['C04','C05','C03'],
 ['F06','F07','F08','F09','M01','M02','M03'],['C06','C07','F08','F09','M01','M03'],
 ['C08','C09'],['E11','E12','E13','E14','M01','M03'],['P02','P03','P04','M01','M03'],
 ['Q04','Q03','M01','M03'],['X13','X14','M01','M03'],['X08','X09','X10','X11'],
];
