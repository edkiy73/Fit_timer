import type { ReactNode } from 'react';

export function ScreenHeader({
  kicker,
  title,
  titleId,
  action=null,
  children=null
}:{
  kicker?:ReactNode;
  title:ReactNode;
  titleId:string;
  action?:ReactNode;
  children?:ReactNode;
}){
  return (
    <header className="screen-head">
      {kicker!==undefined&&kicker!==null&&<div className="screen-kicker">{kicker}</div>}
      <div className={'screen-title-row'+(action?' has-action':'')}>
        <h2 id={titleId}>{title}</h2>
        {action&&<div className="screen-title-action">{action}</div>}
      </div>
      {children}
    </header>
  );
}
