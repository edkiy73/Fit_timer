/** A06: retain only intentionally modified profile fields after a CAS conflict. */
export function mergeProfileDraft<T extends object>(previous:T,local:T,latest:T,keys:readonly (keyof T)[]):T {
 const merged={...latest};
 for(const key of keys)if(local[key]!==previous[key])merged[key]=local[key];
 return merged;
}
export function profileDraftChanged<T extends object>(base:T,draft:T,keys:readonly (keyof T)[]):boolean {
 return keys.some(key=>base[key]!==draft[key]);
}
