import type {Actor} from './contracts';
export type TestOption={id:string;label:string;score:number};
export type TestQuestion={id:string;prompt:string;dimension:string;kind:'single'|'multi'|'scale';options:TestOption[]};
export type TestDimension={id:string;title:string;low:string;mid:string;high:string};
export type TestDefinition={id:string;title:string;description:string;dimensions:TestDimension[];questions:TestQuestion[]};
export type Answers=Record<string,string[]|null>;
export type TestResult={answered:number;total:number;dimensions:{id:string;answered:number;total:number;average:number|null;level:'low'|'mid'|'high'|'insufficient';interpretation:string;questionIds:string[]}[]};
export type TestVersion={id:string;testId:string;revision:number;definition:TestDefinition;publishedAt:string};
export type TestAttempt={id:string;version:TestVersion;status:'draft'|'completed';answers:Answers;position:number;revision:number;result:TestResult|null;updatedAt:string};
export type TestsCommand={action:'tests.list'}|{action:'tests.start';testId:string;operationId:string}|{action:'tests.read';attemptId:string}|{action:'tests.save'|'tests.complete';attemptId:string;operationId:string;expectedRevision:number;answers:Answers;position:number}|{action:'tests.delete';attemptId:string;operationId:string;expectedRevision:number}|{action:'tests.map.apply';attemptId:string;operationId:string;interestIds:string[]};
export interface TestsRepository{execute(actor:Actor,input:TestsCommand):Promise<Record<string,unknown>>}
export function definition(input:unknown):TestDefinition;
export function answers(input:unknown):Answers;
export function testsCommand(input:unknown):TestsCommand;
export function isTestsCommand(input:import('./contracts').Command):input is TestsCommand;
export function createTestsRepository(transport:import('./contracts').Transport,documents:import('./documents').DocumentsRepository):TestsRepository;
export function testRPC(transport:import('./contracts').Transport,name:string,body:Record<string,unknown>):Promise<Record<string,unknown>>;
