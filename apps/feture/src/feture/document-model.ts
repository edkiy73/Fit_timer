import {z} from 'zod';
export const DOCUMENT_LABELS={terms:'Условия использования',privacy:'Конфиденциальность',community:'Правила сообщества','adult-content':'Совершеннолетие и согласие',complaints:'Жалобы и апелляции',age:'Проверка возраста',retention:'Хранение и удаление',cookies:'Файлы cookie',copyright:'Авторские права'} as const;
export type DocumentKey=keyof typeof DOCUMENT_LABELS;
const keySchema=z.enum(['terms','privacy','community','adult-content','complaints','age','retention','cookies','copyright']);
export const blockSchema=z.discriminatedUnion('type',[z.object({type:z.literal('heading'),text:z.string().min(1).max(4000)}).strict(),z.object({type:z.literal('paragraph'),text:z.string().min(1).max(4000)}).strict(),z.object({type:z.literal('list'),items:z.array(z.string().min(1).max(1200)).min(1).max(30)}).strict()]);
const summaryFields={id:z.string().uuid(),key:keySchema,locale:z.enum(['ru','en']),version:z.number().int().positive(),title:z.string().min(1).max(160),hash:z.string().regex(/^[a-f0-9]{64}$/),requiresAccept:z.boolean(),effectiveAt:z.string().datetime({offset:true})};
export const documentSchema=z.object({...summaryFields,blocks:z.array(blockSchema).min(1).max(80),publishedAt:z.string().datetime({offset:true})}).strict();
export const documentsResponse=z.object({ok:z.literal(true),documents:z.array(documentSchema).max(9)}).strict();
export const consentResponse=z.object({ok:z.literal(true),consents:z.object({ready:z.boolean(),accepted:z.boolean(),documents:z.array(z.object({...summaryFields,accepted:z.boolean()}).strict()).max(9)}).strict(),requestId:z.string().uuid()}).strict();
export type PublishedDocument=z.infer<typeof documentSchema>;
export type DocumentBlock=z.infer<typeof blockSchema>;
export function textToBlocks(text:string):DocumentBlock[]{return text.split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean).map(s=>s.startsWith('# ')?{type:'heading',text:s.slice(2)}:s.split('\n').every(line=>line.startsWith('- '))?{type:'list',items:s.split('\n').map(line=>line.slice(2))}:{type:'paragraph',text:s});}
export function blocksToText(blocks:DocumentBlock[]){return blocks.map(b=>b.type==='list'?b.items.map(i=>'- '+i).join('\n'):b.type==='heading'?'# '+b.text:b.text).join('\n\n');}
