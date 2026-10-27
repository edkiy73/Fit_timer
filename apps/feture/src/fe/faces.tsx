import * as z from 'zod';
import {Crown} from 'lucide-react';
import {PhotoBadge} from './photo-check';

/** What the server adds to a person in a list (server/commands/faces.mjs): the small photo URL, the age when the person
 * shows it, and the two name badges. All optional: older answers and couples simply leave them out. */
export const faceFields={
 avatar:z.string().nullable().optional(),
 age:z.number().nullable().optional(),
 photoVerified:z.boolean().optional(),
 premium:z.boolean().optional(),
};
export type Face={avatar?:string|null|undefined,age?:number|null|undefined,photoVerified?:boolean|undefined,premium?:boolean|undefined};

/** V21 `nameBadges()`: blue «Фото подтверждено», gold Premium. */
export function NameBadges({p}:{p:{photoVerified?:boolean|undefined,premium?:boolean|undefined}|null|undefined}){
 if(!p)return null;
 return <>{p.photoVerified&&<PhotoBadge/>}{p.premium&&<span className="nbadge p" title="Premium" role="img" aria-label="Premium"><Crown aria-hidden="true"/></span>}</>;
}

/** «Kai, 27» — the name with the age when it is shown. */
export const withAge=(name:string,p:Face|null|undefined)=>p?.age!=null?`${name}, ${p.age}`:name;
