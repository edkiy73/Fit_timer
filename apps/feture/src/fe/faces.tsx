import * as z from 'zod';
import type {ReactNode} from 'react';
import {useNavigate} from 'react-router';
import {Crown} from 'lucide-react';
import {PhotoBadge} from './photo-check';
import {ProfileAv,Row,nickShown} from './kit';
import {useFe} from './session';

/** What the server adds to a person in a list (server/commands/faces.mjs): the small photo URL, the age when the person
 * shows it, and the two name badges. All optional: older answers and couples simply leave them out. */
export const faceFields={
 avatar:z.string().nullable().optional(),
 age:z.number().nullable().optional(),
 photoVerified:z.boolean().optional(),
 premium:z.boolean().optional(),
 /** A couple (its avatar is two halves) and, when it has no photo of its own, its partners' photos. */
 kind:z.enum(['person','couple']).optional(),
 halves:z.array(z.object({name:z.string().nullable(),avatar:z.string().nullable()})).optional(),
};
export type Face={avatar?:string|null|undefined,age?:number|null|undefined,photoVerified?:boolean|undefined,premium?:boolean|undefined,kind?:string|undefined,halves?:{name:string|null,avatar:string|null}[]|undefined};

/** V21 `nameBadges()`: blue «Фото подтверждено», gold Premium. */
export function NameBadges({p}:{p:{photoVerified?:boolean|undefined,premium?:boolean|undefined}|null|undefined}){
 if(!p)return null;
 return <>{p.photoVerified&&<PhotoBadge/>}{p.premium&&<span className="nbadge p" title="Premium" role="img" aria-label="Premium"><Crown aria-hidden="true"/></span>}</>;
}

/** «Kai, 27» — the name with the age when it is shown. */
export const withAge=(name:string,p:Face|null|undefined)=>p?.age!=null?`${name}, ${p.age}`:name;

/** The one person row of lists (members, attendees, followers): avatar; «Имя, 29» with the badges; the grey @nick (or
 * `sub`) under it; an optional control at the end (a small `FollowButton`, ⋯). A tap opens the profile («Я» for the
 * acting one). */
export function PersonRow({p,sub,end,onClick}:{p:{id:string,name?:string|null,handle?:string|null}&Face,sub?:string|null|undefined,end?:ReactNode,onClick?:()=>void}){
 const navigate=useNavigate();const {acting}=useFe();const name=p.name||(p.handle?'@'+p.handle:'?');
 return <Row av={<ProfileAv p={p}/>} title={<>{withAge(name,p)}<NameBadges p={p}/></>} sub={sub||nickShown(p.handle,p.name)||undefined}
  end={end} onClick={onClick??(()=>navigate(p.id===acting?.id?'/n/me':'/n/people/'+p.id))}/>;
}
