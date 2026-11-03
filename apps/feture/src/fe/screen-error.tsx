import {useEffect} from 'react';
import {useNavigate,useRouteError} from 'react-router';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {RefreshCw} from 'lucide-react';
import {Btn,Empty,View} from './kit';
import {captureFatal} from '../observability';

/** A /n screen that failed to open, in place of the screen (the tabs stay). Also the end of a chunk error that a
 * reload did not fix (chunk-reload.ts): «Обновить» loads the page again. */
export function ScreenError(){
 const {t}=useI18n();const navigate=useNavigate();const error=useRouteError();
 useEffect(()=>{captureFatal(error instanceof Error?error:new Error('screen_error'));},[error]);
 return <View><Empty icon={RefreshCw} role="alert" title={t('fe.screenError.title')} text={t('fe.screenError.text')}>
  <Btn onClick={()=>window.location.reload()}>{t('fe.screenError.reload')}</Btn>
  <Btn kind="ghost" onClick={()=>navigate('/n/feed',{replace:true})}>{t('fe.screenError.home')}</Btn>
 </Empty></View>;
}
