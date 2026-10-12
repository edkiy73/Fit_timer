import {useState} from 'react';
import {Link,useNavigate} from 'react-router';
import {Icon} from './components/Icon';
import {useCatalog} from './use-catalog';
import './first-steps.css';

type Goal='self'|'explore'|'people';
const goals:readonly {id:Goal;title:string;detail:string;icon:'world'|'compass'|'users'}[]=[
 {id:'self',title:'Узнать себя лучше',detail:'Разобраться в интересах, желаниях и личных границах.',icon:'world'},
 {id:'explore',title:'Открыть новые темы',detail:'Посмотреть на разные взгляды и найти то, что откликается.',icon:'compass'},
 {id:'people',title:'Найти общение',detail:'Читать истории, задавать вопросы и быть среди своих.',icon:'users'}
];
export function FirstStepsPage(){
 const navigate=useNavigate();
 const {data}=useCatalog();
 const [step,setStep]=useState(0);
 const [goal,setGoal]=useState<Goal|null>(null);
 const [selected,setSelected]=useState<string[]>([]);
 const categories=data.categories.slice(0,9);
 const finalTo=selected.length>0?'/explore/'+encodeURIComponent(selected[0]!):'/explore';
 const next=()=>{if(step<2)setStep(current=>current+1);else navigate(finalTo);};
 const back=()=>setStep(current=>Math.max(0,current-1));
 return <main className="ft-first">
  <header className="ft-first-header">
   <Link to="/" className="ft-first-logo" aria-label="FetUre — главная">Fet<span>Ure.</span></Link>
   <Link to="/" className="ft-first-exit">Пропустить <Icon name="arrow" size={17}/></Link>
  </header>
  <div className="ft-first-layout">
   <aside className="ft-first-aside" aria-label="Знакомство с FetUre">
    <span className="ft-first-aside-kicker">ТВОЁ ПРОСТРАНСТВО</span>
    <h1>Исследуй.<br/><em>Не спеши.</em></h1>
    <p>Здесь не нужно сразу рассказывать всё о себе. Мы поможем выбрать отправную точку.</p>
    <div className="ft-first-orbit" aria-hidden="true"><span/><span/><span/><span className="ft-first-glow"><Icon name="spark" size={36}/></span></div>
    <span className="ft-first-aside-foot"><Icon name="lock" size={15}/> Твой темп. Твои решения.</span>
   </aside>
   <section className="ft-first-stage" aria-label="Первые шаги">
    <div className="ft-first-progress"><span>ШАГ {step+1} ИЗ 3</span><div aria-hidden="true"><span style={{width:((step+1)/3*100)+'%'}}/></div></div>
    <div className="ft-first-step" key={step}>
     {step===0&&<>
      <span className="ft-first-eyebrow">НАЧНЁМ С ТЕБЯ</span><h2>Что хочется открыть первым?</h2><p className="ft-first-description">Выбери то, что ближе сейчас. Можно передумать позже или ничего не выбирать.</p>
      <div className="ft-first-goals">{goals.map(g=><button key={g.id} type="button" aria-pressed={goal===g.id} className={goal===g.id?'chosen':''} onClick={()=>setGoal(g.id)}><span className="ft-first-goal-icon"><Icon name={g.icon} size={23}/></span><span><strong>{g.title}</strong><small>{g.detail}</small></span><span className="ft-first-choice"><Icon name={goal===g.id?'check':'arrow'} size={17}/></span></button>)}</div>
     </>}
     {step===1&&<>
      <span className="ft-first-eyebrow">НЕМНОГО ЛЮБОПЫТСТВА</span><h2>Какие темы тебе интересны?</h2><p className="ft-first-description">Выбери до трёх направлений из каталога. Это только выбор, с чего начать: отметки в личной карте появятся позже, когда ты сам их сохранишь.</p>
      <div className="ft-first-topic-grid">{categories.map(category=>{
       const active=selected.includes(category.id);
       return <button key={category.id} type="button" aria-pressed={active} disabled={!active&&selected.length>=3} className={active?'chosen':''} onClick={()=>setSelected(old=>old.includes(category.id)?old.filter(id=>id!==category.id):[...old,category.id])}>
         <span className="ft-first-topic-dot" style={{background:category.color}}/><span>{category.title}</span><Icon name={active?'check':'plus'} size={16}/>
       </button>;
      })}</div>
      <span className="ft-first-hint">{selected.length} из 3 выбрано · Можно пропустить</span>
     </>}
     {step===2&&<>
      <span className="ft-first-eyebrow">ВАЖНО ЗНАТЬ</span><h2>Твой мир — <em>в твоих руках.</em></h2><p className="ft-first-description">Изучать и выбирать темы можно в своём темпе. Личные отметки по умолчанию приватны: что показать другим, решаешь ты.</p>
      <div className="ft-first-privacy">
       <div><span><Icon name="lock" size={21}/></span><strong>Личная карта</strong><p>Сохраняй то, что тебе интересно. Необязательно делать это публичным.</p></div>
       <div><span><Icon name="shield" size={21}/></span><strong>Твои границы</strong><p>Границы важнее совпадений. Их не нужно никому объяснять.</p></div>
       <div><span><Icon name="heart" size={21}/></span><strong>Знакомства — по желанию</strong><p>Можно пользоваться FetUre для себя и сообщества, не включая знакомства.</p></div>
      </div>
     </>}
    </div>
    <footer className="ft-first-actions">
      {step>0?<button type="button" className="ft-first-back" onClick={back}><Icon name="back" size={18}/> Назад</button>:<Link to="/" className="ft-first-back">На главную</Link>}
      <button type="button" className="ft-first-next" onClick={next}>{step===2?(selected.length?'Перейти к выбранной теме':'Открыть каталог'):'Продолжить'} <Icon name="arrow" size={19}/></button>
    </footer>
   </section>
  </div>
 </main>;
}
