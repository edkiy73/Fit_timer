import { Link } from 'react-router';
import { Icon } from './components/Icon';
import './welcome.css';

const pillars=[
 {number:'01',icon:'world' as const,title:'Лучше понять себя',detail:'Замечай свои интересы, желания и границы. Всё в твоём темпе.'},
 {number:'02',icon:'compass' as const,title:'Открывать новое',detail:'Изучай темы и вопросы, о которых раньше, возможно, не задумывался.'},
 {number:'03',icon:'users' as const,title:'Быть среди своих',detail:'Обсуждения, сообщества и события. Знакомства — только по желанию.'}
];
export function WelcomePage(){
 return <main className="ft-welcome">
  <a className="ft-welcome-skip" href="#ft-welcome-story">К содержимому</a>
  <header className="ft-welcome-header">
   <Link className="ft-welcome-brand" to="/" aria-label="FetUre — начало">Fet<span>Ure</span><i>.</i></Link>
   <nav className="ft-welcome-header-actions" aria-label="На старте">
    <Link className="ft-welcome-header-explore" to="/explore">Посмотреть темы</Link>
    <Link className="ft-welcome-login" to="/account">Войти <Icon name="arrow" size={17}/></Link>
   </nav>
  </header>
  <section className="ft-welcome-hero" id="ft-welcome-story" aria-labelledby="ft-welcome-title">
   <div className="ft-welcome-aura" aria-hidden="true"/>
   <div className="ft-welcome-copy">
    <span className="ft-welcome-kicker"><span className="ft-welcome-kicker-dot"/> Пространство, где можно быть собой</span>
    <h1 id="ft-welcome-title">Открывай <em>себя.</em><span>Исследуй мир.</span></h1>
    <p className="ft-welcome-lede">FetUre помогает лучше понять свои интересы, границы и то, что тебе важно. Найди новые темы, говори о них и двигайся в своём темпе.</p>
    <div className="ft-welcome-buttons">
     <Link className="ft-welcome-primary" to="/explore">Начать исследовать <Icon name="arrow" size={21}/></Link>
     <Link className="ft-welcome-secondary" to="/account">Войти или зарегистрироваться</Link>
    </div>
    <p className="ft-welcome-trust"><Icon name="lock" size={16}/> Твои личные отметки приватны по умолчанию. Знакомства включаются отдельно.</p>
   </div>
   <div className="ft-welcome-art" aria-hidden="true">
    <div className="ft-welcome-art-sheen"/>
    <svg viewBox="0 0 520 600" role="presentation" preserveAspectRatio="xMidYMid meet">
     <defs>
      <linearGradient id="ft-welcome-stroke" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#f7b3d2"/><stop offset="52%" stopColor="#cbb1ff"/><stop offset="100%" stopColor="#ff5579"/></linearGradient>
      <radialGradient id="ft-welcome-core"><stop offset="0%" stopColor="#fff3fa"/><stop offset="45%" stopColor="#f6aecb"/><stop offset="100%" stopColor="#bd6bce"/></radialGradient>
     </defs>
     <circle cx="255" cy="296" r="228" fill="none" stroke="url(#ft-welcome-stroke)" opacity=".26"/>
     <circle cx="255" cy="296" r="180" fill="none" stroke="url(#ft-welcome-stroke)" opacity=".45"/>
     <circle cx="255" cy="296" r="131" fill="none" stroke="url(#ft-welcome-stroke)" opacity=".58"/>
     <ellipse cx="255" cy="296" rx="96" ry="211" transform="rotate(35 255 296)" fill="none" stroke="url(#ft-welcome-stroke)" strokeWidth="1.5" opacity=".6"/>
     <ellipse cx="255" cy="296" rx="96" ry="211" transform="rotate(-35 255 296)" fill="none" stroke="url(#ft-welcome-stroke)" strokeWidth="1.5" opacity=".6"/>
     <circle cx="255" cy="296" r="74" fill="url(#ft-welcome-core)" opacity=".85"/>
     <circle cx="255" cy="296" r="39" fill="#fff5ff" opacity=".82"/>
     <circle cx="255" cy="68" r="13" fill="#ff90b2"/>
     <circle cx="437" cy="306" r="21" fill="#c7adff"/>
     <circle cx="148" cy="141" r="7" fill="#f9d5e6"/>
     <circle cx="125" cy="481" r="17" fill="#e690bd"/>
     <circle cx="367" cy="470" r="8" fill="#f8bfd8"/>
    </svg>
    <div className="ft-welcome-art-caption">Много граней.<span>Один настоящий ты.</span></div>
   </div>
  </section>
  <section className="ft-welcome-values" aria-labelledby="ft-welcome-values-title">
   <div className="ft-welcome-values-heading"><span>Начни с любопытства</span><h2 id="ft-welcome-values-title">Не нужно заранее знать, кого или что искать.</h2></div>
   <div className="ft-welcome-value-grid">
    {pillars.map(p=><article className="ft-welcome-value" key={p.number}><span className="ft-welcome-value-no">{p.number}</span><span className="ft-welcome-value-icon"><Icon name={p.icon} size={23}/></span><h3>{p.title}</h3><p>{p.detail}</p></article>)}
   </div>
  </section>
  <footer className="ft-welcome-footer"><span>FetUre — исследуй без спешки</span><Link to="/documents">Правила и согласия</Link><Link to="/account">Мой аккаунт</Link></footer>
 </main>;
}
