import type { ReactNode } from 'react';
export type IconName = 'world'|'compass'|'users'|'heart'|'arrow'|'back'|'check'|'lock'|'close'|'plus'|'search'|'shield'|'book'|'message'|'spark'|'eye'|'clock'|'settings'|'user'|'bell'|'more'|'feed'|'bookmark'|'calendar'|'filter'|'send'|'image'|'archive'|'chevron';
export function Icon({name,size=20}:{name:IconName,size?:number}){
  const paths:Record<IconName,ReactNode> = {
    feed:<><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 7h8M8 11h8M8 15h5"/></>,
    bookmark:<path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4V4Z"/>,
    calendar:<><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18M8 15h2M14 15h2"/></>,
    filter:<><path d="M3 6h6M13 6h8M3 12h11M18 12h3M3 18h2M9 18h12"/><circle cx="11" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="7" cy="18" r="2"/></>,
    send:<><path d="m21 3-6 18-4-8-8-4L21 3ZM11 13 21 3"/></>,
    image:<><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.5"/><path d="m3 16 5-5 4 4 4-5 5 6"/></>,
    archive:<><rect x="3" y="3" width="18" height="4" rx="1"/><path d="M5 7v13h14V7M10 11h4"/></>,
    chevron:<path d="m9 5 7 7-7 7"/>,
    more:<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    bell:<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/></>,
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
    settings:<><path d="m9 3-.6 2.1-1.8 1L4.5 6 3 8.6l1.5 1.6v2.1L3 14l1.5 2.6 2.1-.4 1.8 1L9 20h3l.6-2.8 1.8-1 2.1.4L18 14l-1.5-1.7v-2.1L18 8.6 16.5 6l-2.1.2-1.8-1L12 3H9Z" transform="translate(1.5 .5)"/><circle cx="12" cy="12" r="3"/></>,
    user:<><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>{paths[name]}</svg>;
}
