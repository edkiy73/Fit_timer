import type {Meta,StoryObj} from '@storybook/react-vite';
import {fn} from 'storybook/test';
import {Camera,Eye,Hand,Image as ImageIcon,Plus,Trash2,Users,X} from 'lucide-react';
import {AlbumCard,AlbumMeta,AlbumRow,Card,GalleryAdd,GalleryGrid,GalleryTile,KeyValues,Note,PhotoAdd,PhotoSlot,PhotoSlots,PhotoTrack,Pose,Quota,ReviewCard,ReviewMedia,ReviewPair,SelectionBar,VaultHead} from './index';

// A tiny inline picture so the stories need no network.
const PIC='data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 5"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="#7A1236"/><stop offset="1" stop-color="#FF9F7A"/></linearGradient></defs><rect width="4" height="5" fill="url(#g)"/></svg>');

const meta={title:'Домен/Фото и проверки',component:PhotoSlots,tags:['autodocs'],
 parameters:{docs:{description:{component:'Слоты фото профиля: первое большое («Главное»), остальные сеткой, «+» и пустые места. `priv` — ровная сетка приватных фото. `loading` — заглушка той же формы. Порядок меняется перетаскиванием (экран передаёт `onPointerDown`).'}}},
 args:{priv:false,loading:false},
} satisfies Meta<typeof PhotoSlots>;
export default meta;
type S=StoryObj<typeof meta>;
export const Слоты:S={render:a=><PhotoSlots {...a}>
 <PhotoSlot id="1" big src={PIC} main="Главное" openLabel="Фото 1 из 2" onOpen={fn()}/>
 <PhotoSlot id="2" src={PIC} review="На проверке" openLabel="Фото 2 из 2" onOpen={fn()}/>
 <PhotoAdd label="Добавить фото" onClick={fn()}/><PhotoAdd ghost/>
</PhotoSlots>};
export const ОдноФото:S={name:'Одно фото: «Ещё фото»',render:()=><PhotoSlots><PhotoSlot id="1" big src={PIC} main="Главное" openLabel="Фото 1" onOpen={fn()}/><PhotoAdd tall label="Добавить фото" hint="Ещё фото" onClick={fn()}/></PhotoSlots>};
export const Пусто:S={name:'Пусто: главный слот',render:()=><PhotoSlots><PhotoAdd big label="Добавить фото" hint="Главное фото" onClick={fn()}/><PhotoAdd ghost/><PhotoAdd ghost/></PhotoSlots>};
export const Приватные:S={args:{priv:true},render:a=><PhotoSlots {...a}><PhotoSlot id="1" src={PIC} openLabel="Фото 1" onOpen={fn()}/><PhotoSlot id="2" waiting openLabel="Фото 2" onOpen={fn()}/><PhotoAdd label="Добавить" busy/></PhotoSlots>};
export const Загрузка:S={args:{loading:true}};

export const Жест:StoryObj<typeof Pose>={name:'Жест для селфи',render:a=><Pose {...a}/>,args:{icon:Hand,label:'Покажи жест',value:'Ладонь у щеки'},argTypes:{icon:{control:false}}};
export const ЖестЗагрузка:StoryObj<typeof Pose>={name:'Жест: загрузка',render:a=><Pose {...a}/>,args:{icon:Camera,label:'Покажи жест'}};

export const Лента:StoryObj<typeof PhotoTrack>={name:'Лента полноэкранного просмотра',render:a=><div className="viewer on k-demo-viewer"><PhotoTrack {...a}/></div>,args:{srcs:[PIC,PIC,PIC],index:1}};

export const ЛентаСоЗнаком:StoryObj<typeof PhotoTrack>={name:'Чужое приватное фото: водяной знак с ником смотрящего',render:a=><div className="viewer on k-demo-viewer"><PhotoTrack {...a}/></div>,args:{srcs:[PIC],index:0,wm:'@mia_29'}};
export const Квота:StoryObj<typeof Quota>={name:'Запросы на сегодня (Quota)',render:a=><Quota {...a}/>,args:{left:7,max:10,label:'Осталось запросов сегодня: 7 из 10'}};
export const КвотаПусто:StoryObj<typeof Quota>={name:'Запросы на сегодня: закончились',render:a=><Quota {...a}/>,args:{left:0,max:10,label:'Осталось запросов сегодня: 0 из 10'}};

export const Приватное:StoryObj<typeof VaultHead>={name:'Шапка приватного слоя',render:a=><section className="vault"><VaultHead {...a}/></section>,args:{title:'Приватное',label:'Приватное',on:true,onToggle:fn()}};
export const ПриватноеВКарточке:StoryObj<typeof VaultHead>={name:'Шапка приватного слоя в карточке',render:a=><Card className="vault"><VaultHead {...a}/></Card>,args:{title:'Текст · 3 фото',inCard:true}};

export const Проверка:StoryObj<typeof ReviewCard>={name:'Карточка проверки (персонал)',render:a=><ReviewCard {...a}/>,
 args:{title:'Фото профиля',meta:'28 окт, 12:40',danger:false,children:<><ReviewMedia blur={PIC}/><KeyValues rows={[['Автор','@mia'],['Сканер','ok'],['Пусто','']]}/></>},argTypes:{children:{control:false}}};
export const ПроверкаПара:StoryObj<typeof ReviewCard>={name:'Проверка: селфи и фото рядом',render:a=><ReviewCard {...a}/>,
 args:{title:'@mia',meta:'вчера',danger:true,children:<ReviewPair><ReviewMedia icon={X} caption={<Note>Селфи</Note>}/><ReviewMedia icon={Eye} caption={<Note>Фото профиля</Note>}><img src={PIC} alt=""/></ReviewMedia></ReviewPair>}};

export const Альбомы:StoryObj<typeof AlbumCard>={name:'Галерея: альбомы',render:a=><><AlbumRow label="Альбомы">
 <AlbumCard title="Все" count={12} mosaic={[PIC,PIC,PIC,PIC]} on onClick={fn()}/><AlbumCard {...a}/>
 <AlbumCard title="Вечера" count={3} cover={PIC} locked="Видят только подписчики" onClick={fn()}/><AlbumCard title="Альбом" icon={Plus} label="Новый альбом" onClick={fn()}/>
</AlbumRow><AlbumMeta title="Мастерские" followers="видят только подписчики" order="сначала новые"/></>,
 args:{title:'Мастерские',count:5,cover:PIC,on:false,onClick:fn()},
 parameters:{docs:{description:{story:'`AlbumRow` листается вбок; `wrap` — по четыре в строку (в «Я»). `AlbumCard`: обложка, мозаика до 4 фото или иконка, `on` — открытый альбом, `locked` — только подписчики. `AlbumMeta` — строка об открытом альбоме.'}}}};
export const Сетка:StoryObj<typeof GalleryTile>={name:'Галерея: сетка и выбор',render:a=><GalleryGrid label="Публикации">
 <GalleryAdd label="Добавить" onClick={fn()}/><GalleryTile {...a}/><GalleryTile src={PIC} label="Пост 2" count={3} followers="Только подписчики" onClick={fn()}/>
 <GalleryTile src={PIC} label="Пост 3" review="На проверке" onClick={fn()}/><GalleryTile src={PIC} label="Выбрано" selected onClick={fn()}/><GalleryTile src={PIC} label="Не выбрано" selected={false} onClick={fn()}/>
 <GalleryTile src={PIC} label="Обложка" picked onClick={fn()}/></GalleryGrid>,
 args:{src:PIC,label:'Публикация',count:2,onClick:fn()},
 parameters:{docs:{description:{story:'Плитка — публикация: первое фото, «N фото», значок «только подписчики», «на проверке». `selected` true/false — режим выбора; `picked` — выбранная обложка.'}}}};
export const ПанельВыбора:StoryObj<typeof SelectionBar>={name:'Галерея: панель выбора',render:a=><SelectionBar {...a}/>,
 args:{status:'Выбрано: 2',actions:[{icon:ImageIcon,label:'В альбом',onClick:fn()},{icon:Users,label:'Кто видит',onClick:fn()},{icon:Eye,label:'В профиль',onClick:fn()},{icon:Trash2,label:'Удалить',danger:true,onClick:fn()}]},argTypes:{actions:{control:false}}};
