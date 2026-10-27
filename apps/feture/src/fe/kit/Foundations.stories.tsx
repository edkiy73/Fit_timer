import type {Meta,StoryObj} from '@storybook/react-vite';
import {useEffect,useState,type ReactNode} from 'react';
import {H,Stack,Text} from './index';

/** Token pages read the live CSS variables, so they always show what the app really uses. */
function useVar(name:string){const [v,setV]=useState('');useEffect(()=>{const el=document.querySelector('.fe-v21')??document.documentElement;setV(getComputedStyle(el).getPropertyValue(name).trim());});return v;}
function Tok({name,children}:{name:string,children:ReactNode}){const v=useVar(name);return <div className="k-tok"><div className="k-tok-demo">{children}</div><Text size="cap" as="span"><b>{name}</b> · {v}</Text></div>;}

const meta={title:'Основа/Токены',tags:['autodocs'],parameters:{docs:{description:{component:'Значения, из которых собрано всё. Экраны не пишут своих цветов, размеров и отступов — только эти имена. Изменил токен — изменилось всё приложение.'}}}} satisfies Meta;
export default meta;
type S=StoryObj<typeof meta>;
const COLORS=['--bg','--bg2','--surf','--raise','--ink','--mute','--faint','--line','--line2','--accent','--accent-soft','--accent-ink','--ok','--ok-soft','--warn','--warn-soft','--danger','--danger-soft','--violet','--violet-soft','--mint','--lilac','--scrim'];
export const Цвета:S={render:()=><div className="k-colors">{COLORS.map(n=><Tok key={n} name={n}><span className="k-swatch" data-var={n}/></Tok>)}</div>,
 parameters:{docs:{description:{story:'Тёмная тема — переключатель «Тема» сверху: те же имена с другими значениями.'}}}};
export const Типографика:S={render:()=><Stack gap={3}>{([1,2,3,4,5] as const).map(l=><Tok key={l} name={'--t-h'+l}><H level={l}>Заголовок H{l}</H></Tok>)}
 {(['body','strong','sm','xs','cap','label','micro'] as const).map(k=><Tok key={k} name={'--t-'+(k==='strong'?'body-strong':k)}><Text size={k}>Текст {k}</Text></Tok>)}</Stack>};
export const Отступы:S={render:()=><Stack gap={2}>{[0,1,2,3,4,5,6,7,8,9].map(i=><Tok key={i} name={'--s-'+i}><span className="k-bar" data-s={i}/></Tok>)}</Stack>};
export const Скругления:S={name:'Скругления и тени',render:()=><Stack gap={2}>{['--r-2xs','--r-xs','--r-s','--r-m','--r','--r-l','--r-xl','--r-full'].map(n=><Tok key={n} name={n}><span className="k-rad" data-r={n}/></Tok>)}
 {['--shadow-s','--shadow'].map(n=><Tok key={n} name={n}><span className="k-shd" data-sh={n}/></Tok>)}</Stack>};
export const Высоты:S={name:'Высоты и иконки',render:()=><Stack gap={2}>{['--h-xl','--h-lg','--h-md','--h-sm','--h-xs'].map(n=><Tok key={n} name={n}><span className="k-hh" data-h={n}/></Tok>)}
 {['--i-lg','--i-md','--i-sm','--i-xs'].map(n=><Tok key={n} name={n}><span className="k-ii" data-i={n}/></Tok>)}</Stack>};
