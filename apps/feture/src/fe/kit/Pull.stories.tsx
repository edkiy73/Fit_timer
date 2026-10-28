import type {Meta,StoryObj} from '@storybook/react-vite';
import {useState} from 'react';
import {Bar,Card,NewPill,Row,Stack,View} from './index';

/** A screen-sized frame (`.main` with a header and a scrolling `View`), as in the app. */
function Screen({refresh,pill}:{refresh?:boolean,pill?:boolean}){
 const [n,setN]=useState(0);const [shown,setShown]=useState(!!pill);
 const wait=()=>new Promise(r=>setTimeout(r,1200)).then(()=>setN(x=>x+1));
 return <div className="main hasbar" style={{height:520,border:'1px solid var(--line)'}}>
  <Bar title="Лента"/>
  <View refresh={refresh?wait:undefined}>
   {shown&&<NewPill label="Новые публикации" onClick={()=>setShown(false)}/>}
   <Stack gap={3}>{Array.from({length:12},(_,i)=><Card key={i} list><Row title={'Публикация '+(i+1)} sub={'обновлено '+n+' раз'} noChev/></Card>)}</Stack>
  </View>
 </div>;
}

const meta={title:'Сообщения/Обновление',component:Screen,tags:['autodocs'],
 parameters:{docs:{description:{component:'**Потянуть, чтобы обновить** (`View refresh`, только касание): в самом верху экрана тянешь вниз — из-под шапки выезжает круглая метка, кольцо заполняется; дальше ~70 px стрелка разворачивается, отпустишь — экран читается заново мимо кеша, метка мигает (не крутится). Контент не сдвигается. Блоки со своим чтением внутри экрана подключаются `useRefreshable(load)`. Браузерное «потянуть = перезагрузить» в приложении выключено.\n\n**«Новые публикации ↑»** (`NewPill`): ставится в поток перед списком, места не занимает и держится под шапкой; нажатие прокручивает вверх и показывает новое. Новые записи никогда не вставляются над читающим без этого нажатия.\n\nОткрой в режиме телефона (касания) — в окне браузера мышью не тянется.'}}},
 args:{refresh:true,pill:false},
} satisfies Meta<typeof Screen>;
export default meta;
type S=StoryObj<typeof meta>;
export const Потянуть:S={name:'Потянуть, чтобы обновить'};
export const НовыеПубликации:S={name:'«Новые публикации ↑»',args:{pill:true}};
