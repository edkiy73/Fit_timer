import {z} from 'zod';
const slug=z.string().regex(/^[a-z][a-z0-9-]{0,47}$/);
const plain=(max:number)=>z.string().min(1).max(max).refine(v=>v.trim().length>0&&!/[\x00-\x1f\x7f]/.test(v),'Заполни текст без управляющих символов.');
export const optionSchema=z.object({id:slug,label:plain(240),score:z.number().int().min(0).max(4)}).strict();
export const questionSchema=z.object({id:slug,prompt:plain(600),dimension:slug,kind:z.enum(['single','multi','scale']),options:z.array(optionSchema).min(2).max(6)}).strict();
export const dimensionSchema=z.object({id:slug,title:plain(120),low:plain(800),mid:plain(800),high:plain(800)}).strict();
export const definitionSchema=z.object({id:slug,title:plain(160),description:plain(1200),dimensions:z.array(dimensionSchema).min(1).max(4),questions:z.array(questionSchema).min(6).max(12)}).strict().superRefine((d,ctx)=>{
 const issue=(message:string)=>ctx.addIssue({code:'custom',message});
 if(new Set(d.dimensions.map(x=>x.id)).size!==d.dimensions.length||new Set(d.questions.map(x=>x.id)).size!==d.questions.length)issue('Идентификаторы не должны повторяться.');
 for(const q of d.questions){if(!d.dimensions.some(x=>x.id===q.dimension))issue('Выбери направление для каждого вопроса.');if(new Set(q.options.map(x=>x.id)).size!==q.options.length)issue('Варианты вопроса не должны повторяться.');if(q.kind==='scale'&&(q.options.length!==5||q.options.some((o,i)=>o.score!==i)))issue('Шкала содержит пять вариантов с весами от 0 до 4.');}
 for(const dim of d.dimensions)if(d.questions.filter(q=>q.dimension===dim.id).length<2)issue('В каждом направлении нужны хотя бы два вопроса.');
});
export type TestDefinition=z.infer<typeof definitionSchema>;
export type TestQuestion=z.infer<typeof questionSchema>;
export const answersSchema=z.record(slug,z.array(slug).min(1).max(6).nullable());
export type Answers=z.infer<typeof answersSchema>;
export const resultSchema=z.object({answered:z.number().int().min(0).max(12),total:z.number().int().min(6).max(12),dimensions:z.array(z.object({id:slug,answered:z.number().int().min(0).max(12),total:z.number().int().min(2).max(12),average:z.number().min(0).max(4).nullable(),level:z.enum(['low','mid','high','insufficient']),interpretation:plain(800),questionIds:z.array(slug).max(12)}).strict()).min(1).max(4)}).strict();
export const versionSchema=z.object({id:z.uuid(),testId:slug,revision:z.number().int().positive(),definition:definitionSchema,publishedAt:z.iso.datetime({offset:true})}).strict();
export const attemptSchema=z.object({id:z.uuid(),version:versionSchema,status:z.enum(['draft','completed']),answers:answersSchema,position:z.number().int().min(0).max(11),revision:z.number().int().positive(),result:resultSchema.nullable(),updatedAt:z.iso.datetime({offset:true})}).strict();
export type TestAttempt=z.infer<typeof attemptSchema>;
export const attemptResponse=z.object({ok:z.literal(true),attempt:attemptSchema,replayed:z.boolean().optional(),requestId:z.uuid()}).strict();
export const testsResponse=z.object({ok:z.literal(true),versions:z.array(versionSchema).max(30),attempts:z.array(z.object({id:z.uuid(),testId:slug,title:plain(160),status:z.enum(['draft','completed']),revision:z.number().int().positive(),updatedAt:z.iso.datetime({offset:true})}).strict()).max(100),requestId:z.uuid()}).strict();
