import type {Meta,StoryObj} from '@storybook/react-vite';
import {useState} from 'react';
import {Card} from './index';
import {PhotoTiles,type Tile} from './PhotoTiles';

/** A thumbnail drawn on a canvas; `tall` makes a phone screenshot (1:2.2) that must still be cover-cropped. */
function thumb(w:number,h:number,hue:number):string{
 const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d')!;
 const gr=g.createLinearGradient(0,0,w,h);gr.addColorStop(0,`hsl(${hue} 70% 45%)`);gr.addColorStop(1,`hsl(${hue+60} 70% 35%)`);g.fillStyle=gr;g.fillRect(0,0,w,h);
 return c.toDataURL();
}
const SAMPLE:Tile[]=[{id:'a',src:thumb(600,900,0)},{id:'b',src:thumb(400,880,200)},{id:'c',src:thumb(900,600,120),video:true,durationMs:12000}];

const meta={title:'Медиа/Плитки фото',component:PhotoTiles,tags:['autodocs'],
 parameters:{docs:{description:{component:'Сетка фото редактора: три колонки одинаковых ячеек (4:5 или квадрат), превью обрезаются по ячейке (cover), «+» — такая же ячейка.'}}},
 args:{tiles:SAMPLE,ratio:'4:5',removeLabel:'Убрать',viewLabel:'Открыть',onRemove:()=>{}},
} satisfies Meta<typeof PhotoTiles>;
export default meta;
type S=StoryObj<typeof meta>;
const Live=(a:S['args'])=>{const [tiles,setTiles]=useState<Tile[]>(a?.tiles??SAMPLE);
 return <Card><PhotoTiles removeLabel="Убрать" viewLabel="Открыть" {...a!} tiles={tiles} onRemove={id=>setTiles(l=>l.filter(x=>x.id!==id))} add={tiles.length<6?{label:'Добавить',onClick:()=>setTiles(l=>[...l,{id:'n'+l.length,src:thumb(500,1100,l.length*50)}])}:undefined}/></Card>;};
export const Три:S={name:'Три фото и «+»',render:a=><Live {...a}/>};
export const Квадраты:S={name:'Квадраты',render:a=><Live {...a} ratio="1:1"/>};
export const Одно:S={name:'Одно фото',render:a=><Live {...a} tiles={[SAMPLE[0]!]}/>};
