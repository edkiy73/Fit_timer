import {describe,expect,it} from 'vitest';
import {dictionaries} from '../i18n';
import {statusText} from './note-status';

const tFor=(lang:'ru'|'en')=>(k:string,v?:Record<string,string>)=>((dictionaries[lang] as Record<string,string>)[k]??k).replace(/\{(\w+)\}/g,(_,x:string)=>v?.[x]??'');
const text=(lang:'ru'|'en',type:string,data:Record<string,unknown>)=>statusText({type,data},tFor(lang),lang);
const SOON=new Date(Date.UTC(2026,10,3,12)).toISOString();

describe('what staff decided, in plain words',()=>{
 it('photos: one file, a batch, a rejection with its reason, a cover',()=>{
  expect(text('ru','mediaDecided',{purpose:'avatar',state:'approved',kind:'image'})).toBe('Фото профиля одобрено');
  expect(text('ru','mediaDecided',{purpose:'post',state:'approved',kind:'video'})).toBe('Видео в публикации одобрено');
  expect(text('ru','mediaDecided',{purpose:'post',state:'approved',kind:'image',count:3})).toBe('Одобрено файлов: 3');
  expect(text('ru','mediaDecided',{purpose:'post',state:'rejected',kind:'image',reason:'violence'})).toBe('Фото в публикации не прошло проверку — сцены насилия');
  expect(text('ru','mediaDecided',{purpose:'community',state:'rejected',kind:'image',reason:'spam'})).toBe('Обложка сообщества не прошла проверку — реклама или спам');
  expect(text('en','mediaDecided',{purpose:'chat',state:'approved',kind:'image'})).toBe('Photo in a chat approved');
  expect(text('en','mediaDecided',{purpose:'event',state:'approved',kind:'image'})).toBe('Event cover approved');
 });
 it('a city, Premium and a role',()=>{
  expect(text('ru','placeDecided',{state:'approved'})).toBe('Предложенный тобой город добавлен — теперь его можно выбрать');
  expect(text('ru','placeDecided',{state:'rejected'})).toBe('Предложенный тобой город не добавлен');
  expect(text('ru','premiumGranted',{until:SOON})).toBe('Тебе открыт Premium до 3 ноября');
  expect(text('en','premiumGranted',{until:SOON})).toBe('Premium is on for you until 3 November');
  expect(text('ru','staffRole',{role:'moderator',grant:true})).toMatch(/^Тебе выдана роль: /);
  expect(text('ru','staffRole',{role:'moderator',grant:false})).toMatch(/^Роль снята: /);
 });
 it('disputes and appeals say which way they went',()=>{
  expect(text('ru','disputeResolved',{outcome:'removed'})).toContain('публикацию удалили');
  expect(text('ru','disputeResolved',{outcome:'restored'})).toContain('Публикацию оставили');
  expect(text('ru','appealDecided',{state:'granted'})).toBe('Апелляция принята — решение пересмотрено');
  expect(text('ru','appealDecided',{state:'denied'})).toBe('Апелляция отклонена — решение остаётся');
 });
 it('a removal names what was removed and why; a measure names its end',()=>{
  expect(text('ru','contentRemoved',{targetType:'community',rule:'spam'})).toBe('Модераторы скрыли твоё сообщество: спам');
  expect(text('ru','contentRemoved',{targetType:'reply'})).toBe('Модераторы удалили твой ответ');
  expect(text('ru','contentRemoved',{targetType:'post',rule:'consent'})).toBe('Модераторы удалили твою публикацию: нет согласия людей на фото');
  expect(text('ru','profileSuspended',{rule:'threats',until:SOON})).toBe('Профиль заблокирован до 3 ноября: угрозы и шантаж');
  expect(text('ru','profileSuspended',{rule:'spam'})).toBe('Профиль заблокирован, пока модераторы не снимут блокировку: спам');
  expect(text('ru','profileRestricted',{until:SOON})).toBe('Профиль ограничен до 3 ноября: нельзя писать, ставить лайки и просить доступ');
  expect(text('ru','profileRestored',{rule:'expired'})).toBe('Срок блокировки закончился — профиль снова доступен');
  expect(text('ru','profileUnrestricted',{rule:'expired'})).toBe('Срок ограничения закончился');
 });
 it('a change to a community or an event is not told as a new one',()=>{
  expect(text('ru','communityRejected',{what:'change'})).toBe('Правки сообщества не приняты');
  expect(text('ru','eventPublished',{what:'change'})).toBe('Правки события приняты');
 });
 it('tells staff what waits for them',()=>{
  expect(text('ru','staffAlert',{what:'report',reason:'minor'})).toBe('Срочно в модерации: жалоба — несовершеннолетний');
  expect(text('ru','staffAlert',{what:'report',reason:'threat'})).toBe('Срочно в модерации: жалоба — угрозы');
  expect(text('ru','staffAlert',{what:'report',reason:'threat',count:4})).toBe('Срочных жалоб в модерации: 4');
  expect(text('ru','staffAlert',{what:'support'})).toBe('Новое обращение в поддержку');
  expect(text('ru','staffAlert',{what:'support',count:3})).toBe('Новых обращений в поддержку: 3');
  expect(text('en','staffAlert',{what:'dispute'})).toContain('still visible');
  expect(text('ru','staffAlert',{what:'notice'})).toBe('Срочное юридическое обращение');
 });
 it('leaves every other row to the inbox',()=>{
  expect(text('ru','communityRejected',{})).toBeNull();
  expect(text('ru','profileRestored',{})).toBeNull();
  expect(text('ru','like',{})).toBeNull();
 });
});
