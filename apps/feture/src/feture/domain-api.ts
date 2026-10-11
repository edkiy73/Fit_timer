import {z} from 'zod';
import type {AuthSession} from '@appbase/core/auth.js';
import {authClient} from '../auth';
import {apiUrl} from '../api-url';
import {sameSession} from './interest-api';
export class DomainClientError extends Error {constructor(public code:string){super(code);}}
export async function domainRequest<T>(session:AuthSession,body:Record<string,unknown>,schema:z.ZodType<T>,signal?:AbortSignal):Promise<T>{
 if(!sameSession(await authClient.getSession(),session))throw new DomainClientError('auth_required');
 const response=await fetch(apiUrl('/api/domain'),{method:'POST',cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000),headers:{'Content-Type':'application/json','x-fit-email':session.email,'x-fit-device':session.deviceId,'x-fit-token':session.syncToken},body:JSON.stringify(body)});
 if(!sameSession(await authClient.getSession(),session))throw new DomainClientError('auth_required');
 const input:unknown=await response.json();
 if(!sameSession(await authClient.getSession(),session))throw new DomainClientError('auth_required');
 if(!response.ok){const error=z.object({error:z.string()}).safeParse(input);throw new DomainClientError(error.success?error.data.error:'domain_unavailable');}
 const result=schema.safeParse(input);if(!result.success)throw new DomainClientError('domain_unavailable');return result.data;
}
export function domainErrorMessage(error:unknown){
 const code=error instanceof DomainClientError?error.code:'';
 return code==='auth_required'?'Войди снова, чтобы продолжить.':code==='verification_required'?'Сначала подтверди совершеннолетие.':code==='consent_required'?'Прочитай актуальные документы и подтверди согласие.':code==='map_changed'?'Карта изменилась. Проверь предложения заново; существующие отметки сохранены.':code==='revision_conflict'||code==='document_changed'?'Данные изменились. Обнови экран перед сохранением.':code==='scope_not_available'?'Выбранные сведения закрыты. Сначала разреши доступ по запросу в настройках видимости.':code==='report_pending'?'На эту публикацию уже отправлена твоя жалоба. Её статус есть в разделе обращений.':code==='appeal_pending'?'Апелляция по этому случаю уже рассматривается.':code==='moderation_unavailable'?'Обращения сейчас недоступны. Попробуй позже.':code==='request_pending'?'Запрос этому человеку уже отправлен.':code==='request_closed'?'Этот запрос уже закрыт.':code==='answers_incomplete'?'Ответь или выбери пропуск у каждого вопроса.':code==='attempt_completed'?'Это прохождение уже завершено. Начни новое, чтобы ответить иначе.':code==='test_limit'?'Сохранено много прохождений. Удали ненужные, чтобы начать новое.':code==='resource_not_found'?'Профиль или разрешение сейчас недоступны.':code==='operation_conflict'?'Этот повтор отличается от исходного действия. Обнови экран.':code==='rate_limited'?'Слишком много запросов. Попробуй чуть позже.':'Не удалось связаться с аккаунтом. Твои изменения остаются в форме.';
}
