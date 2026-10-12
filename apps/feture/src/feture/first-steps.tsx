import {useState} from 'react';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Link,useNavigate} from 'react-router';
import {Icon} from './components/Icon';
import {useCatalog} from './use-catalog';
import './first-steps.css';

type Goal='self'|'explore'|'people';
export function FirstStepsPage(){
 const {t}=useI18n();
 const goals:readonly {id:Goal;title:string;detail:string;icon:'world'|'compass'|'users'}[]=[
 {id:'self',title:t('first.goal.self.title'),detail:t('first.goal.self.detail'),icon:'world'},
 {id:'explore',title:t('first.goal.explore.title'),detail:t('first.goal.explore.detail'),icon:'compass'},
 {id:'people',title:t('first.goal.people.title'),detail:t('first.goal.people.detail'),icon:'users'}
];
 const navigate=useNavigate();
 const {data}=useCatalog();
 const [step,setStep]=useState(0);
 const [goal,setGoal]=useState<Goal|null>(null);
 const [selected,setSelected]=useState<string[]>([]);
 const categories=data.categories.slice(0,9);
 const finalTo=selected.length>0?'/explore/'+encodeURIComponent(selected[0]!):goal==='people'?'/community':goal==='self'?'/tests':'/explore';
 const next=()=>{if(step<2)setStep(current=>current+1);else navigate(finalTo);};
 const back=()=>setStep(current=>Math.max(0,current-1));
 return <main className="ft-first">
  <header className="ft-first-header">
   <Link to="/" className="ft-first-logo" aria-label={t('first.logoAria')}>Fet<span>Ure.</span></Link>
   <Link to="/" className="ft-first-exit">{t('first.skip')} <Icon name="arrow" size={17}/></Link>
  </header>
  <div className="ft-first-layout">
   <aside className="ft-first-aside" aria-label={t('first.introAria')}>
    <span className="ft-first-aside-kicker">{t('first.aside.kicker')}</span>
    <h1>{t('first.aside.title1')}<br/><em>{t('first.aside.title2')}</em></h1>
    <p>{t('first.aside.description')}</p>
    <div className="ft-first-orbit" aria-hidden="true"><span/><span/><span/><span className="ft-first-glow"><Icon name="spark" size={36}/></span></div>
    <span className="ft-first-aside-foot"><Icon name="lock" size={15}/> {t('first.aside.foot')}</span>
   </aside>
   <section className="ft-first-stage" aria-label={t('first.sectionAria')}>
    <div className="ft-first-progress"><span>{t('first.progress',{current:step+1,total:3})}</span><div aria-hidden="true"><span style={{width:((step+1)/3*100)+'%'}}/></div></div>
    <div className="ft-first-step" key={step}>
     {step===0&&<>
      <span className="ft-first-eyebrow">{t('first.step0.kicker')}</span><h2>{t('first.step0.title')}</h2><p className="ft-first-description">{t('first.step0.description')}</p>
      <div className="ft-first-goals">{goals.map(g=><button key={g.id} type="button" aria-pressed={goal===g.id} className={goal===g.id?'chosen':''} onClick={()=>setGoal(g.id)}><span className="ft-first-goal-icon"><Icon name={g.icon} size={23}/></span><span><strong>{g.title}</strong><small>{g.detail}</small></span><span className="ft-first-choice"><Icon name={goal===g.id?'check':'arrow'} size={17}/></span></button>)}</div>
     </>}
     {step===1&&<>
      <span className="ft-first-eyebrow">{t('first.step1.kicker')}</span><h2>{t('first.step1.title')}</h2><p className="ft-first-description">{t('first.step1.description')}</p>
      <div className="ft-first-topic-grid">{categories.map(category=>{
       const active=selected.includes(category.id);
       return <button key={category.id} type="button" aria-pressed={active} disabled={!active&&selected.length>=3} className={active?'chosen':''} onClick={()=>setSelected(old=>old.includes(category.id)?old.filter(id=>id!==category.id):[...old,category.id])}>
         <span className="ft-first-topic-dot" style={{background:category.color}}/><span>{category.title}</span><Icon name={active?'check':'plus'} size={16}/>
       </button>;
      })}</div>
      <span className="ft-first-hint">{t('first.selectedHint',{count:selected.length})}</span>
     </>}
     {step===2&&<>
      <span className="ft-first-eyebrow">{t('first.step2.kicker')}</span><h2>{t('first.step2.title1')}<em>{t('first.step2.title2')}</em></h2><p className="ft-first-description">{t('first.step2.description')}</p>
      <div className="ft-first-privacy">
       <div><span><Icon name="lock" size={21}/></span><strong>{t('first.privacy.map.title')}</strong><p>{t('first.privacy.map.detail')}</p></div>
       <div><span><Icon name="shield" size={21}/></span><strong>{t('first.privacy.boundaries.title')}</strong><p>{t('first.privacy.boundaries.detail')}</p></div>
       <div><span><Icon name="heart" size={21}/></span><strong>{t('first.privacy.dating.title')}</strong><p>{t('first.privacy.dating.detail')}</p></div>
      </div>
     </>}
    </div>
    <footer className="ft-first-actions">
      {step>0?<button type="button" className="ft-first-back" onClick={back}><Icon name="back" size={18}/> {t('first.back')}</button>:<Link to="/" className="ft-first-back">{t('first.home')}</Link>}
      <button type="button" className="ft-first-next" onClick={next}>{step===2?(selected.length?t('first.next.topic'):goal==='people'?t('first.next.community'):goal==='self'?t('first.next.questions'):t('first.next.catalog')):t('first.next.continue')} <Icon name="arrow" size={19}/></button>
    </footer>
   </section>
  </div>
 </main>;
}
