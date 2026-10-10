import type { ReactNode } from 'react';
export type IconName = 'world'|'compass'|'users'|'heart'|'arrow'|'back'|'check'|'lock'|'close'|'plus'|'search'|'shield'|'book'|'message'|'spark'|'eye'|'clock'|'settings';
export function Icon({name,size=20}:{name:IconName,size?:number}){
  const paths:Record<IconName,ReactNode> = {
    world:<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 4 3 14 0 18M12 3c-3 4-3 14 0 18"/></>,
    compass:<><circle cx="12" cy="12" r="9"/><path d="m16 8-2.8 5.2L8 16l2.8-5.2L16 8Z"/></>,
    users:<><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5"/></>,
    heart:<path d="M20.5 9.2c0 4.7-8.5 10.3-8.5 10.3S3.5 13.9 3.5 9.2a4.7 4.7 0 0 1 8.5-2.7 4.7 4.7 0 0 1 8.5 2.7Z"/>,
    arrow:<path d="M5 12h14m-6-6 6 6-6 6"/>,back:<path d="M19 12H5m6-6-6 6 6 6"/>,
    check:<path d="m4 12 5 5L20 6"/>,lock:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    close:<path d="M5 5 19 19M19 5 5 19"/>,plus:<path d="M12 5v14M5 12h14"/>,
    search:<><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></>,
    shield:<><path d="m12 2 8 4v6c0 5-3 8-8 10-5-2-8-5-8-10V6l8-4Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></>,
    book:<><path d="M12 5C8 3 5 3 2 4v15c3-1 6-1 10 1 4-2 7-2 10-1V4c-3-1-6-1-10 1Z"/><path d="M12 5v15"/></>,
    message:<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.6-5a8.5 8.5 0 1 1 16.4-4.5Z"/>,
    spark:<path d="m12 2 1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2ZM19 17v5m-2.5-2.5h5"/>,
    eye:<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    settings:<><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9 7 7m10 10 2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></>
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>{paths[name]}</svg>;
}
