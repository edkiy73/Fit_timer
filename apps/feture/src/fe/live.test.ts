import {describe,expect,it} from 'vitest';
import {COUNT_WRITES,legacyKind,readDependsOn,signalEntities} from './live';

describe('live data registry',()=>{
 it('maps signals to what they changed',()=>{
  expect(signalEntities(null)).toBe('all');
  expect(signalEntities('changed','boot')).toBe('all');
  expect(signalEntities('changed','couple')).toEqual(['couple']);
  expect(signalEntities('changed','check')).toEqual(['check']);
  expect(signalEntities('changed','nonsense')).toEqual([]);
  expect(signalEntities('changed')).toEqual([]);
  expect(signalEntities('typing','tag')).toEqual([]);
  expect(signalEntities('chat')).toEqual(['chat','counts']);
  expect(signalEntities('notify')).toEqual(['notify','counts']);
 });

 it('a signal forgets only the reads of its entity',()=>{
  expect(readDependsOn('couple.get',['couple'])).toBe(true);
  expect(readDependsOn('verification.ageStatus',['check'])).toBe(true);
  expect(readDependsOn('verification.photoStatus',['check'])).toBe(true);
  expect(readDependsOn('inbox.counts',['counts'])).toBe(true);
  expect(readDependsOn('me.posts',['post'])).toBe(true);
  expect(readDependsOn('profile.get',['media'])).toBe(true);
  // A couple change does not touch the feed or the chats; a chat signal does not touch the profile.
  expect(readDependsOn('feed.list',['couple'])).toBe(false);
  expect(readDependsOn('chats.list',['couple'])).toBe(false);
  expect(readDependsOn('profile.get',['chat','counts'])).toBe(false);
  expect(readDependsOn('catalog.get',['profile','couple','check','media','post','counts','chat','decide','notify'])).toBe(false);
  expect(readDependsOn('catalog.get','all')).toBe(true);
  expect(readDependsOn('inbox.countsX',['counts'])).toBe(false);
 });

 it('screens that still listen by kind hear the matching `changed` signals',()=>{
  expect(legacyKind('changed','chat')).toBe('chat');
  expect(legacyKind('changed','decide')).toBe('decide');
  expect(legacyKind('changed','counts')).toBe('notify');
  expect(legacyKind('changed','boot')).toBe(null);
  expect(legacyKind('changed','post')).toBe(undefined);
  expect(legacyKind('notify')).toBe('notify');
  expect(legacyKind(null)).toBe(null);
 });

 it('own writes that move the counters',()=>{
  for(const a of ['chat.read','decide.approval','couple.inviteAnswer','notifications.readAll','access.grant','link.answer'])expect(COUNT_WRITES.test(a)).toBe(true);
  for(const a of ['chat.send','profile.update','post.publish'])expect(COUNT_WRITES.test(a)).toBe(false);
 });
});
