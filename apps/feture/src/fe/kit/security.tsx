import {useMemo,type ReactNode} from 'react';
import {Copy} from 'lucide-react';
import {Btn} from '../ui';
import {qrMatrix} from './qr';
import './security.css';

/** Security pieces (Storybook «Домен/Безопасность», owner 29.10.2026): the authenticator QR, the key typed by hand and
 * the one-time recovery codes. Copying is the screen's (`onCopy`, the app's copy helper). */

/** A QR code drawn here (kit/qr.ts), dark on paper in both themes, with a quiet zone. `value` is never sent anywhere. */
export function QrCode({value,label,size=200}:{value:string,label:string,size?:number}){
 const path=useMemo(()=>{const g=qrMatrix(value);let d='';g.forEach((row,y)=>row.forEach((on,x)=>{if(on)d+=`M${x+4} ${y+4}h1v1h-1z`;}));return {d,n:g.length+8};},[value]);
 return <div className="k-qr" style={{'--qr-size':size+'px'} as React.CSSProperties}>
  <svg role="img" aria-label={label} viewBox={`0 0 ${path.n} ${path.n}`} shapeRendering="crispEdges"><rect width={path.n} height={path.n} className="k-qr-paper"/><path d={path.d} className="k-qr-ink"/></svg>
 </div>;
}

/** A key to type by hand: groups of four in a monospace face, selectable as a whole, with «Скопировать». */
export function SecretKey({value,label,copyLabel,onCopy}:{value:string,label:string,copyLabel:string,onCopy:()=>void}){
 return <div className="k-key">
  <span className="k-key-l">{label}</span>
  <code className="k-key-v">{value.match(/.{1,4}/g)?.join(' ')}</code>
  <Btn kind="soft" size="sm" auto icon={Copy} onClick={onCopy}>{copyLabel}</Btn>
 </div>;
}

/** One-time recovery codes: a numbered two-column grid in monospace, a line about keeping them, «Скопировать все». */
export function RecoveryCodes({codes,label,copyLabel,onCopy,children}:{codes:readonly string[],label:string,copyLabel:string,onCopy:()=>void,children?:ReactNode}){
 return <div className="k-codes">
  <ol className="k-codes-l" aria-label={label}>{codes.map(c=><li key={c}><code>{c}</code></li>)}</ol>
  {children}
  <Btn kind="soft" size="sm" icon={Copy} onClick={onCopy}>{copyLabel}</Btn>
 </div>;
}
