import { afterEach, describe, expect, it, vi } from 'vitest';
import { authClient } from './auth';
import {
  AnswerAIError,
  answerExplainProtocol,
  requestAnswerExplanation
} from './ai-answer';

afterEach(()=>{
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AI answer explanation client',()=>{
  it('parses the strict explanation protocol',()=>{
    expect(answerExplainProtocol.parseAnswerExplanation(JSON.stringify({
      why:'Use live as the verb.',
      tip:'After I, check that you have an action verb.'
    }))).toEqual({
      why:'Use live as the verb.',
      tip:'After I, check that you have an action verb.'
    });
  });

  it('requires sign-in before spending AI quota',async()=>{
    vi.spyOn(authClient,'authFields').mockResolvedValue(null);
    await expect(requestAnswerExplanation({
      question:'Translate: Я живу здесь',
      learnerAnswer:'I life here',
      acceptedAnswers:['I live here'],
      locale:'ru'
    })).rejects.toMatchObject({
      name:'AnswerAIError',
      code:'auth_required',
      status:401
    });
  });

  it('sends only structured answer context and returns usage',async()=>{
    vi.spyOn(authClient,'authFields').mockResolvedValue({
      email:'user@example.com',
      deviceId:'device',
      syncToken:'token'
    });
    const fetchMock=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{
      const body=JSON.parse(String(init?.body||'{}'));
      expect(body).toMatchObject({
        kind:'answer.explain',
        prompt:'unmute:answer.explain',
        question:'Translate: Я живу здесь',
        learnerAnswer:'I life here',
        acceptedAnswers:['I live here'],
        locale:'ru'
      });
      return new Response(JSON.stringify({
        ok:true,
        text:JSON.stringify({
          why:'Здесь нужен глагол live.',
          tip:'Проверь часть речи.'
        }),
        usage:{bucket:'light',used:4,limit:100}
      }),{
        status:200,
        headers:{'Content-Type':'application/json'}
      });
    });
    vi.stubGlobal('fetch',fetchMock);

    await expect(requestAnswerExplanation({
      question:'Translate: Я живу здесь',
      learnerAnswer:'I life here',
      acceptedAnswers:['I live here'],
      courseExplanation:'live is a verb',
      locale:'ru'
    })).resolves.toEqual({
      why:'Здесь нужен глагол live.',
      tip:'Проверь часть речи.',
      usage:{bucket:'light',used:4,limit:100}
    });
  });

  it('keeps Plus errors machine-readable',async()=>{
    vi.spyOn(authClient,'authFields').mockResolvedValue({
      email:'user@example.com',
      deviceId:'device',
      syncToken:'token'
    });
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({
      ok:false,
      error:'premium_required'
    }),{
      status:402,
      headers:{'Content-Type':'application/json'}
    })));

    let thrown:unknown;
    try{
      await requestAnswerExplanation({
        question:'Question',
        learnerAnswer:'Wrong',
        acceptedAnswers:['Right'],
        locale:'en'
      });
    }catch(error){thrown=error;}

    expect(thrown).toBeInstanceOf(AnswerAIError);
    expect(thrown).toMatchObject({code:'premium_required',status:402});
  });
});
