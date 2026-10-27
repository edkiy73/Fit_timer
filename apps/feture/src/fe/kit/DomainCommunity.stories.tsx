import type {Meta,StoryObj} from '@storybook/react-vite';
import {useState} from 'react';
import {fn} from 'storybook/test';
import {Ellipsis,Globe,MapPin,MessageCircle,Users} from 'lucide-react';
import {Av,Btn,Card,CommunityHead,Discussion,IconBtn,Swatches,Veil,plate} from './index';

const meta={title:'Домен/Сообщества',component:CommunityHead,tags:['autodocs'],
 parameters:{docs:{description:{component:'Шапка сообщества: широкая обложка, квадратная картинка, название и строка фактов. Без `name` — заглушка той же формы, пока страница грузится.'}}},
 args:{cover:<div className="plate" style={plate('comm-cover')}/>,pic:<div className="plate" style={plate('comm-pic')}/>,name:'Шибари Берлин',
  meta:<><span><Users/><b>128 участников</b></span><span><Globe/>Открытое</span><span><MapPin/>Берлин</span></>},
 argTypes:{cover:{control:false},pic:{control:false},meta:{control:false}},
} satisfies Meta<typeof CommunityHead>;
export default meta;
type S=StoryObj<typeof meta>;
export const Шапка:S={};
export const Загрузка:S={render:()=><CommunityHead/>};

export const Обсуждение:StoryObj<typeof Discussion>={name:'Обсуждение',render:a=><Card list><Discussion {...a}/></Card>,
 args:{pinned:'Закреплено',title:'Правила безопасности на встречах',excerpt:'Собрали всё, что важно знать до первой встречи: стоп-слова, согласие, кого звать на помощь.',
  meta:<><Av name="Mia" seed="mia" size="xs"/><span>Mia</span><span>·</span><span>вчера</span><span><MessageCircle/>12</span></>,onClick:fn()},argTypes:{meta:{control:false},tools:{control:false}}};
export const ОбсуждениеВедущему:StoryObj<typeof Discussion>={name:'Обсуждение с инструментами ведущего',render:a=><Card list><Discussion {...a}/></Card>,
 args:{title:'Кто едет на фестиваль?',excerpt:'Собираем компанию на выходные.',meta:<span>3 дня назад</span>,onClick:fn(),tools:<IconBtn icon={Ellipsis} kind="ghost" size="sm" label="Инструменты ведущего"/>}};

export const Вуаль:StoryObj<typeof Veil>={name:'Закрыто вуалью',render:a=><Veil {...a}/>,
 args:{title:'Обсуждения — для участников',text:'Вступи, чтобы читать и писать.',lock:true,tall:true,toggles:false},argTypes:{action:{control:false},error:{control:false}}};
export const ВуальСДействием:StoryObj<typeof Veil>={name:'Вуаль с действием и ошибкой',render:a=><Veil {...a}/>,
 args:{title:'Mia решает, кому открыть',text:'Попроси доступ — она увидит запрос.',lock:false,toggles:true,action:<Btn kind="dark">Попросить доступ</Btn>,error:'Не получилось — попробуй ещё раз'}};

const PLATES=[['lilac','Сирень'],['rose','Роза'],['sea','Море'],['amber','Янтарь'],['moss','Мох'],['coal','Уголь']] as const;
export const Цвета:StoryObj<typeof Swatches<string>>={name:'Цвет обложки',render:a=>{const [v,setV]=useState<string|null>(a.value);return <Swatches {...a} value={v} onChange={setV}/>;},
 args:{label:'Или цвет',value:'sea',onChange:()=>{},options:PLATES.map(([k,l])=>[k,l,plate(k)] as const)},argTypes:{value:{control:'inline-radio',options:[null,...PLATES.map(p=>p[0])]},options:{control:false}}};
