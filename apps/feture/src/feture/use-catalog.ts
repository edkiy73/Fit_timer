import {useEffect,useState} from 'react';
import {apiUrl} from '../api-url';
import fallbackCatalog from '../../data/concept-catalog.json';
import {catalogSchema,type Catalog} from './model';

// The bundled catalogue is the canonical offline source. A failed refresh must
// never keep an older server release while claiming its entries are bundled.
const bundledCatalog:Catalog=catalogSchema.parse(fallbackCatalog);

export function useCatalog(){
 const [data,setData]=useState<Catalog>(bundledCatalog);
 const [source,setSource]=useState<'live'|'offline'|'loading'>('loading');
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{
   const controller=new AbortController();
   fetch(apiUrl('/api/catalog'),{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])})
    .then(async response=>{if(!response.ok)throw new Error('catalog_unavailable');return catalogSchema.parse(await response.json());})
    .then(json=>{if(!controller.signal.aborted){setData(json);setSource('live');}})
    .catch(()=>{if(!controller.signal.aborted){setData(bundledCatalog);setSource('offline');}});
   return ()=>controller.abort();
 },[refresh]);
 return {data,source,retry:()=>{setSource('loading');setRefresh(n=>n+1);}};
}
