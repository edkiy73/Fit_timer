// Types of contracts/_text.mjs for the app (src/ imports the same rules the server applies).
import type * as z from 'zod';

export declare const RUN_LINE: number;
export declare const RUN_TEXT: number;
export type TextRule = { max: number, min: number, multiline: boolean, run: number, urls: boolean, lines: number, markup: boolean };
export type TextError = 'bad_characters' | 'line_break' | 'markup' | 'empty' | 'too_short' | 'too_long' | 'too_many_lines' | 'long_word';
export declare function textRule(max: number, o?: { min?: number, run?: number, lines?: number }): TextRule;
export declare function lineRule(max: number, o?: { min?: number, run?: number, markup?: boolean }): TextRule;
export declare function textLength(v: string): number;
export declare function checkText(raw: unknown, rule: TextRule): { value: string, error: TextError | null };
export declare function textSchema(rule: TextRule): z.ZodType<string, string>;
export declare function text(max: number, o?: { min?: number, run?: number, lines?: number }): z.ZodType<string, string>;
export declare function line(max: number, o?: { min?: number, run?: number, markup?: boolean }): z.ZodType<string, string>;
export type FieldName =
  | 'profileName' | 'bio' | 'privateText' | 'placeName'
  | 'communityName' | 'communityDescription' | 'joinQuestion' | 'communityRule' | 'joinAnswer'
  | 'eventTitle' | 'eventDescription' | 'eventArea' | 'eventAddress' | 'eventQuestion' | 'eventRequirements' | 'eventAnswer'
  | 'applyNote' | 'announcement' | 'reason' | 'returnNote'
  | 'postTitle' | 'postBody' | 'pollQuestion' | 'pollOption' | 'reply'
  | 'chatMessage' | 'caption' | 'support' | 'reportDetails' | 'appeal' | 'staffNote' | 'staffReason' | 'maintenance'
  | 'albumTitle' | 'dsaExplanation' | 'dsaName';
export declare const FIELD: Readonly<Record<FieldName, TextRule>>;
export declare function field(name: FieldName): z.ZodType<string, string>;
