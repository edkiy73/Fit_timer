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
  expect(text('ru','premiumGranted',{until:SOON})).toBe('Тебе открыт Premium до 3 ноября');
  expect(text('en','premiumGranted',{until:SOON})).toBe('Premium is on for you until 3 November');
  expect(text('ru','premiumGranted',{until:SOON,why:'invited'})).toBe('Бонус за приглашение: Premium до 3 ноября');
  expect(text('ru','premiumGrantedBulk',{until:SOON})).toBe('Тебе открыт Premium до 3 ноября');
  expect(text('ru','premiumEnding',{kind:'week',until:SOON})).toBe('Premium закончится 3 ноября');
  expect(text('ru','premiumEnding',{kind:'day',until:SOON})).toBe('Premium закончится завтра');
  expect(text('ru','premiumPair',{kind:'started',until:SOON})).toBe('Партнёр открыл вашей паре Premium до 3 ноября');
  expect(text('en','premiumPair',{kind:'ended'})).toBe('Your couple’s Premium has ended');
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
  expect(text('ru','staffAlert',{what:'csam'})).toBe('Срочно: аккаунт заблокирован автоматически — нужно подтверждение');
  expect(text('en','staffAlert',{what:'csam',count:2})).toBe('Automatic blocks waiting for confirmation: 2');
 });
 it('names nobody: rows with a name or a couple are left to the inbox, unknown types too',()=>{
  expect(text('ru','communityRejected',{})).toBe('Сообщество не прошло проверку');
  expect(text('ru','profileRestored',{})).toBe('Блокировку сняли — профиль снова доступен');
  expect(text('ru','communityMember',{change:'host'})).toBe('Тебя сделали ведущим сообщества');
  expect(text('ru','eventCancelled',{})).toBe('Событие отменено');
  expect(text('ru','like',{})).toBeNull();
  expect(text('ru','pair.acted',{what:'post'})).toBeNull();
  expect(text('ru','notePublished',{})).toBeNull();
 });
});
