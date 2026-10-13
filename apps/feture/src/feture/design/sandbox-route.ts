/** Route previews to the one shared ephemeral workspace.
 * Do not spoof operator/admin privileges or make protected API requests.
 * Public legal pages and the account exit screen remain genuine.
 */
export function sandboxTarget(pathname:string):string|null{
 if(pathname==='/'||pathname==='/design')return '/design/F01';
 if(pathname==='/start')return '/design/A04';
 if(pathname==='/world')return '/design/X01';
 if(pathname==='/explore'||pathname.startsWith('/explore/'))return '/design/X05';
 if(pathname==='/catalog')return '/design/X05';
 if(pathname==='/community')return '/design/C01';
 if(pathname==='/dating')return '/design/D03';
 if(pathname==='/profile')return '/design/P03';
 if(pathname==='/journal')return '/design/X12';
 if(pathname==='/share-links')return '/design/K08';
 if(pathname==='/comparisons'||pathname.startsWith('/compare/'))return '/design/P05';
 if(pathname==='/share'||pathname.startsWith('/share/'))return '/design/X11';
 if(pathname==='/access')return '/design/P07';
 if(pathname==='/verification')return '/design/A06';
 if(pathname==='/tests'||pathname.startsWith('/tests/'))return '/design/X05';
 if(pathname==='/safety')return '/design/S01';
 if(pathname.startsWith('/report/'))return '/design/S02';
 if(pathname.startsWith('/people/'))return '/design/G02';
 return null;
}
