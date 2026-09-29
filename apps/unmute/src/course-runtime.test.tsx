import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSet } from './content/client';
import type { CourseSet } from './content/schema';
import { emptyCourseProgress } from './progress';
import { readCourseProgress } from './sync';
import { LearnerCourseProvider, useLearnerCourseRuntime } from './course-runtime';

const mocked=vi.hoisted(()=>({
  listeners:[] as Array<(change:{keys:Array<{key:string;profileId:string}>;source:'local'|'remote'})=>void>
}));

vi.mock('./content/client',()=>({loadSet:vi.fn()}));
vi.mock('./sync',()=>({
  readCourseProgress:vi.fn(),
  appDocs:{
    subscribe:vi.fn((listener:(change:{keys:Array<{key:string;profileId:string}>;source:'local'|'remote'})=>void)=>{
      mocked.listeners.push(listener);
      return ()=>{
        const index=mocked.listeners.indexOf(listener);
        if(index>=0)mocked.listeners.splice(index,1);
      };
    })
  }
}));

const course:CourseSet={
  schemaVersion:1,
  id:'general-foundation',
  revision:7,
  slug:'general-foundation',
  title:{ru:'Основной курс'},
  level:{from:'a1',to:'b1',labels:[]},
  access:{mode:'free'},
  defaultRoadmapId:'main',
  roadmaps:[{
    id:'main',
    title:{ru:'Основной путь'},
    nodes:[
      {
        id:'day-1',kind:'lesson',title:{ru:'День 1'},dayIndex:1,order:0,
        prerequisites:[],activityIds:['card.one'],optional:false
      },
      {
        id:'day-2',kind:'lesson',title:{ru:'День 2'},dayIndex:2,order:1,
        prerequisites:['day-1'],activityIds:['card.two'],optional:false
      }
    ]
  }],
  activities:[
    {
      id:'card.one',revision:1,type:'text-input',tags:[],revisionProgress:'preserve',
      lexiconRefs:[],prompt:{ru:'Один'},answer:{accepted:['one'],nearMiss:true,caseSensitive:false}
    },
    {
      id:'card.two',revision:1,type:'text-input',tags:[],revisionProgress:'preserve',
      lexiconRefs:[],prompt:{ru:'Два'},answer:{accepted:['two'],nearMiss:true,caseSensitive:false}
    }
  ],
  resources:[]
};

function Probe(){
  const runtime=useLearnerCourseRuntime();
  return <div>{runtime.status+':'+(runtime.state?.currentNode?.id ?? '-')}</div>;
}

function renderRuntime(){
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  render(
    <QueryClientProvider client={client}>
      <LearnerCourseProvider setId="GENERAL-FOUNDATION">
        <Probe />
      </LearnerCourseProvider>
    </QueryClientProvider>
  );
  return client;
}

beforeEach(()=>{
  mocked.listeners.length=0;
  vi.clearAllMocks();
  vi.mocked(loadSet).mockResolvedValue({set:course,access:'full',fromCache:false});
  vi.mocked(readCourseProgress).mockResolvedValue(emptyCourseProgress());
});

describe('learner course React runtime',()=>{
  it('exposes one ready state for screens',async()=>{
    renderRuntime();

    expect(await screen.findByText('ready:day-1')).toBeTruthy();
    expect(loadSet).toHaveBeenCalledWith('general-foundation');
    expect(readCourseProgress).toHaveBeenCalledWith('general-foundation');
  });

  it('reacts to local-first progress changes without refetching course content',async()=>{
    renderRuntime();
    expect(await screen.findByText('ready:day-1')).toBeTruthy();

    const next=emptyCourseProgress();
    next.seen['card.one']={at:'2026-09-29T01:00:00.000Z'};
    vi.mocked(readCourseProgress).mockResolvedValue(next);

    await act(async()=>{
      for(const listener of [...mocked.listeners]){
        listener({
          keys:[{profileId:'__account__',key:'progress:course:general-foundation'}],
          source:'local'
        });
      }
    });

    expect(await screen.findByText('ready:day-2')).toBeTruthy();
    expect(loadSet).toHaveBeenCalledTimes(1);
    expect(readCourseProgress).toHaveBeenCalledTimes(2);
  });
});
