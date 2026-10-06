import { describe, expect, it } from 'vitest';
import { promptForResponse } from './prompt-mode';

describe('promptForResponse',()=>{
  it('keeps «Собери» while words are assembled and says «Напиши» when typing',()=>{
    expect(promptForResponse('Собери: «Меня зовут Анна».',true)).toBe('Собери: «Меня зовут Анна».');
    expect(promptForResponse('Собери: «Меня зовут Анна».',false)).toBe('Напиши: «Меня зовут Анна».');
    expect(promptForResponse('Собери предложение',false)).toBe('Напиши предложение');
    expect(promptForResponse('Build: “My name is Anna.”',false)).toBe('Write: “My name is Anna.”');
    expect(promptForResponse('Сделай вопрос',false)).toBe('Сделай вопрос');
  });
});
