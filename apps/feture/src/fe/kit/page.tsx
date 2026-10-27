import {useState} from 'react';
import {Bell,Camera,Heart,KeyRound,Plus,Settings,Trash2,Users} from 'lucide-react';
import {useToast} from '../toast';
import {Alert,Ask,Av,Badge,Bar,Btn,Card,Check,ChoiceChips,Chip,Chips,Counter,Divider,Empty,Field,Group,H,IconBtn,Input,Note,Pill,Progress,RadioList,Range,Row,SearchInput,SectionLabel,Steps,Switch,Seg,Select,SelectRow,Sheet,Skel,Stack,Text,TextArea,ToggleRow,View} from './index';

/** /n/kit — the design system on one page: every token step and every kit component in every state. The reference
 * for the owner and for agents; a screen that needs something not shown here adds it to the kit first (README). */
export function KitPage(){
 const toast=useToast();
 const [tab,setTab]=useState<'a'|'b'|'c'>('a');const [many,setMany]=useState('1');const [on,setOn]=useState(true);const [sel,setSel]=useState<'all'|'fol'|'only'>('all');
 const [chips,setChips]=useState<string[]>(['rope']);const [sheet,setSheet]=useState(false);const [ask,setAsk]=useState(false);const [busy,setBusy]=useState(false);
 const [why,setWhy]=useState<'spam'|'threat'|'other'>('spam');const [one,setOne]=useState<'all'|'fol'>('all');const [ok,setOk]=useState(false);const [age,setAge]=useState(30);const [txt,setTxt]=useState('Привет');
 const toggle=(id:string)=>setChips(c=>c.includes(id)?c.filter(x=>x!==id):[...c,id]);
 return <>
  <Bar title="Дизайн-система" back><IconBtn icon={Settings} label="Настройки"/></Bar>
  <View>
   <Stack gap={6}>
    <Group title="Типографика">
     <Stack gap={2}>
      <H level={1}>H1 · 28 Geologica — заголовок экрана</H>
      <H level={2}>H2 · 22 — шапка, лист, диалог</H>
      <H level={3}>H3 · 19 — заголовок карточки</H>
      <H level={4}>H4 · 17 — заголовок в списке, поста</H>
      <H level={5}>H5 · 15 — малый заголовок</H>
      <Text>Body · 15/1.5 — основной текст, поля ввода.</Text>
      <Text size="strong">Strong · 15 — выделенный текст.</Text>
      <Text size="sm">Sm · 14 — вторая строка, кнопки md.</Text>
      <Text size="xs" tone="mute">Xs · 13 — подсказки, чипы.</Text>
      <Text size="cap" tone="mute">Cap · 12 — время, счётчики.</Text>
      <Text size="label" tone="mute">Label · 12 — заголовки групп</Text>
      <Text size="micro">Micro · 11 — бейджи</Text>
     </Stack>
    </Group>

    <Group title="Кнопки" foot="Одна главная кнопка на группу. Загрузка — мягкое мигание на месте, без спиннера и без изменения ширины.">
     <Stack gap={2}>
      <Btn>Главная</Btn><Btn kind="soft">Вторая</Btn><Btn kind="danger">Опасная</Btn><Btn kind="text" auto>Текстовая</Btn>
      <Stack row gap={2}><Btn size="md" auto>md 44</Btn><Btn size="sm" auto>sm 36</Btn><Btn icon={Plus} size="sm" kind="soft" auto>С иконкой</Btn></Stack>
      <Btn disabled>Выключена</Btn>
      <Btn busy={busy} onClick={()=>{setBusy(true);setTimeout(()=>setBusy(false),2000);}}>Загрузка (нажми)</Btn>
      <Stack row gap={2}><IconBtn icon={Bell} label="Уведомления"/><IconBtn icon={Heart} kind="ghost" label="Нравится"/><IconBtn icon={Plus} kind="add" label="Создать"/><IconBtn icon={Trash2} size="sm" label="Удалить"/></Stack>
     </Stack>
    </Group>

    <Group title="Вкладки">
     <Stack gap={2}>
      <Seg value={tab} onChange={setTab} options={[{id:'a',label:'Для тебя'},{id:'b',label:'Подписки',n:3},{id:'c',label:'Популярное',dot:'новое'}]}/>
      <Seg value={many} onChange={setMany} options={['Всё','Люди','Сообщества','События','Темы','Публикации'].map((l,i)=>({id:String(i+1),label:l}))}/>
     </Stack>
    </Group>

    <Group title="Списки">
     <div className="card list">
      <Row icon={KeyRound} title="Строка со значком" sub="Вторая строка" onClick={()=>toast('Нажато')}/>
      <Row av={<Av name="Mia" seed="mia" size="sm"/>} title="С аватаром" val="значение" onClick={()=>{}}/>
      <Row icon={Users} title="С бейджем" badge={3} onClick={()=>{}}/>
      <ToggleRow title="Переключатель" sub={on?'Включено':'Выключено'} on={on} onClick={()=>setOn(v=>!v)}/>
      <SelectRow label="Выбор" value={sel} onChange={setSel} options={[['all','Все'],['fol','Подписчики'],['only','Только я']]}/>
      <Row icon={Trash2} title="Опасное действие" danger onClick={()=>setAsk(true)}/>
      <Row icon={Camera} title="Выключено" disabled onClick={()=>{}}/>
     </div>
    </Group>

    <Group title="Чипы">
     <Chips>{[['rope','Связывание'],['care','Забота после'],['role','Ролевые игры']].map(([id,l])=><Chip key={id} on={chips.includes(id!)} onClick={()=>toggle(id!)}>{l}</Chip>)}
      <Chip more onClick={()=>{}}>Все · 75</Chip><Chip disabled onClick={()=>{}}>Выключен</Chip></Chips>
    </Group>

    <Group title="Поля">
     <div className="card"><Stack gap={3}>
      <Field id="k1" label="Поле"><Input id="k1" placeholder="Подсказка"/></Field>
      <Field id="k2" label="С ошибкой" error="Ник занят — попробуй другой"><Input id="k2" defaultValue="mia" invalid/></Field>
      <Field id="k3" label="Многострочное" hint="До 1000 знаков"><TextArea id="k3" rows={3} placeholder="О чём хочется рассказать?"/></Field>
      <Field id="k4" label="Выбор"><Select id="k4" label="Выбор" value={sel} onChange={setSel} options={[['all','Все'],['fol','Подписчики'],['only','Только я']]}/></Field>
      <SearchInput label="Поиск"/>
      <Field id="k5" label="Выключено"><Input id="k5" disabled value="нельзя менять" readOnly/></Field>
     </Stack></div>
    </Group>

    <Group title="Сообщения и состояния">
     <Stack gap={2}>
      <Alert kind="ok">Сохранено</Alert><Alert kind="info">Подсказка по экрану</Alert><Alert kind="warn">Нужно внимание</Alert><Alert kind="err">Не получилось — попробуй ещё раз</Alert>
      <Btn kind="soft" onClick={()=>toast('Уведомление',{type:'ok',action:{label:'Отменить',fn:()=>{}}})}>Показать уведомление</Btn>
      <Skel kind="list" rows={2}/>
      <Empty icon={Heart} title="Пусто" text="Здесь появится то, что ты сохранишь."><Btn size="sm" auto>Действие</Btn></Empty>
     </Stack>
    </Group>


    <Group title="Выбор">
     <Stack gap={3}>
      <RadioList label="Причина" value={why} onChange={setWhy} options={[['spam','Спам'],['threat','Угрозы','С подробностями'],['other','Другое']]}/>
      <ChoiceChips label="Кто видит" value={one} onChange={setOne} options={[['all','Все'],['fol','Подписчики']]}/>
      <Check on={ok} onChange={setOk}>Принимаю условия и политику</Check>
      <Check on={false} onChange={()=>{}} error>С ошибкой — нужно отметить</Check>
      <Stack row gap={3}><Switch label="Вкл" on={on} onChange={setOn}/><Switch label="Выкл" on={false} onChange={()=>{}} disabled/></Stack>
      <Field id="k6" label={`Возраст до ${age}`}><Range label="Возраст" min={18} max={99} value={age} onChange={setAge}/></Field>
      <Field id="k7" label="Со счётчиком"><TextArea id="k7" rows={2} value={txt} onChange={e=>setTxt(e.target.value)}/><Counter n={txt.length} max={20}/></Field>
     </Stack>
    </Group>

    <Group title="Прогресс, бейджи, метки">
     <Stack gap={3}>
      <Steps step={2} total={4} name="Где и когда"/>
      <Progress value={.7} label="Загрузка"/>
      <Stack row gap={2}><Pill tone="ok">одобрено</Pill><Pill tone="wait">ждёт</Pill><Pill tone="v">по доступу</Pill><Pill tone="bad">отклонено</Pill><Pill tone="hot">3</Pill><Pill>просто</Pill></Stack>
      <Stack row gap={4}><span className="ibtn" style={{position:'relative'}}><Bell/><Badge n={4}/></span><span className="ibtn" style={{position:'relative'}}><Bell/><Badge n={120}/></span></Stack>
      <SectionLabel action={<Btn kind="text" size="sm" auto>Все</Btn>}>Подпись раздела</SectionLabel>
      <Note>Тихая подсказка под блоком.</Note>
     </Stack>
    </Group>

    <Group title="Карточки, разделитель, аватары">
     <Stack gap={3}>
      <Card><Stack gap={2}><H level={4}>Карточка</H><Text size="sm" tone="mute">Обычная поверхность блока.</Text></Stack></Card>
      <Card form><Field id="k8" label="Карточка формы"><Input id="k8"/></Field></Card>
      <Divider/>
      <Stack row gap={3}><Av name="Mia" seed="m" size="xs"/><Av name="Mia" seed="m" size="sm"/><Av name="Mia" seed="m"/><Av name="Mia" seed="m" size="lg"/><Av name="Mia" seed="m" size="xl"/><Av name="Eva Tom" seed="c" couple={['Eva','Tom']}/></Stack>
     </Stack>
    </Group>
    <Group title="Окна">
     <Stack row gap={2}><Btn kind="soft" auto onClick={()=>setSheet(true)}>Лист</Btn><Btn kind="soft" auto onClick={()=>setAsk(true)}>Подтверждение</Btn></Stack>
    </Group>
   </Stack>
  </View>
  {sheet&&<Sheet title="Лист" sub="Строка под заголовком" onClose={()=>setSheet(false)} foot={<Btn onClick={()=>setSheet(false)}>Готово</Btn>}>
   <div className="card list"><Row icon={Users} title="Пункт" onClick={()=>setSheet(false)}/></div></Sheet>}
  {ask&&<Ask danger title="Удалить?" text="Это нельзя будет вернуть." ok="Удалить" onOk={()=>setAsk(false)} onCancel={()=>setAsk(false)}/>}
 </>;
}

