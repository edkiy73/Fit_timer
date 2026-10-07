import { describe, expect, it } from 'vitest';
import { ownAITalkPrompt } from './ai-own-prompt';

describe('own AI talk prompt',()=>{
  it('carries the topic, scenario, focus and the final verdict the learner waits for',()=>{
    const text=ownAITalkPrompt({topic:'В клинике',scenario:'Act as a receptionist.',focus:['appointments','I need…'],locale:'ru'});
    expect(text).toContain('Тема: В клинике.');
    expect(text).toContain('Сценарий: Act as a receptionist.');
    expect(text).toContain('appointments; I need…');
    expect(text).toContain('«Урок пройден»');
    expect(text).toContain('«Нужно повторить»');
  });

  it('skips a scenario that only repeats the topic and an empty focus',()=>{
    const text=ownAITalkPrompt({topic:'At the clinic',scenario:'at the clinic',focus:[],locale:'en'});
    expect(text).not.toContain('Scenario:');
    expect(text).not.toContain('Phrases I am practising');
    expect(text).toContain('"Lesson passed"');
  });
});
