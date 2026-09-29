import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import type { LearnerCourseState } from './course-loader';
import type { LearnerCourseRuntimeValue } from './course-runtime';
import { emptyCourseProgress } from './progress';
import { CourseMapView, buildCourseMapItems } from './course-map';
import { dictionaries } from './i18n';

function previewState():LearnerCourseState{
  const progress=emptyCourseProgress();
  progress.seen['a1']={at:'2026-09-29T00:00:00Z'};
  const nodes=[
    {
      id:'day-1',kind:'lesson' as const,title:{ru:'День 1'},dayIndex:1,order:0,
      prerequisites:[],activityIds:['a1'],optional:false
    },
    {
      id:'day-2',kind:'lesson' as const,title:{ru:'День 2'},dayIndex:2,order:1,
      prerequisites:['day-1'],activityIds:['a2'],optional:false
    },
    {
      id:'day-3',kind:'lesson' as const,title:{ru:'День 3'},dayIndex:3,order:2,
      prerequisites:['day-2'],activityIds:[],optional:false
    }
  ];
  const activities=[
    {
      id:'a1',revision:1,type:'theory' as const,tags:[],revisionProgress:'preserve' as const,
      lexiconRefs:[],body:{ru:'one'},format:'text' as const
    },
    {
      id:'a2',revision:1,type:'theory' as const,tags:[],revisionProgress:'preserve' as const,
      lexiconRefs:[],body:{ru:'two'},format:'text' as const
    }
  ];
  return {
    set:{
      schemaVersion:1,
      id:'general-foundation',
      revision:1,
      slug:'general-foundation',
      title:{ru:'Курс'},
      level:{labels:[]},
      access:{
        mode:'entitlement',
        entitlement:'course.general-foundation',
        freePreview:{kind:'first-days',days:2,learnedContentStaysAvailable:true}
      },
      defaultRoadmapId:'main',
      roadmaps:[{id:'main',title:{ru:'Путь'},nodes}],
      activities,
      resources:[]
    },
    roadmap:{id:'main',title:{ru:'Путь'},nodes},
    progress,
    roadmapProgress:{
      nodes:[
        {node:nodes[0]!,complete:true,unlocked:true},
        {node:nodes[1]!,complete:false,unlocked:true},
        {node:nodes[2]!,complete:false,unlocked:false}
      ],
      currentNode:nodes[1]!,
      currentDayIndex:2,
      completedCount:1,
      requiredCount:3,
      courseComplete:false
    },
    currentNode:nodes[1]!,
    currentDayIndex:2,
    access:'preview',
    fromCache:false
  };
}

describe('course map',()=>{
  it('separates completed/current/purchase-locked roadmap states',()=>{
    const items=buildCourseMapItems(previewState());
    expect(items.map(item=>[item.node.id,item.status,item.canOpen])).toEqual([
      ['day-1','complete',true],
      ['day-2','current',true],
      ['day-3','purchase-locked',false]
    ]);
  });

  it('opens accessible days and keeps paid skeleton nodes non-interactive',async()=>{
    const user=userEvent.setup();
    const onOpen=vi.fn();
    const runtime:LearnerCourseRuntimeValue={
      state:previewState(),
      status:'ready',
      error:null,
      refresh:async()=>{}
    };

    render(
      <I18nProvider
        dictionaries={dictionaries}
        config={{locales:['ru'],default:'ru'}}
        storageKey="course-map-test.locale"
        systemLanguages={['ru']}
      >
        <CourseMapView runtime={runtime} onExit={()=>{}} onOpen={onOpen} onUnlock={()=>{}} />
      </I18nProvider>
    );

    expect(screen.getByText('Бесплатно: первые 2 дня')).toBeTruthy();
    expect(screen.getByText('Нужен полный курс')).toBeTruthy();
    expect(screen.getAllByRole('button',{name:'Открыть'})).toHaveLength(1);
    expect(screen.getAllByRole('button',{name:'Пройти ещё раз'})).toHaveLength(1);
    expect(screen.getAllByRole('button',{name:'Открыть доступ'})).toHaveLength(1);

    await user.click(screen.getByRole('button',{name:'Открыть'}));
    expect(onOpen).toHaveBeenCalledWith('day-2');
    expect(onOpen).not.toHaveBeenCalledWith('day-3');
  });

  it('opens the access offer from a paid roadmap node',async()=>{
    const user=userEvent.setup();
    const onUnlock=vi.fn();
    const runtime:LearnerCourseRuntimeValue={
      state:previewState(),
      status:'ready',
      error:null,
      refresh:async()=>{}
    };

    render(
      <I18nProvider
        dictionaries={dictionaries}
        config={{locales:['ru'],default:'ru'}}
        storageKey="course-map-access-test.locale"
        systemLanguages={['ru']}
      >
        <CourseMapView runtime={runtime} onExit={()=>{}} onOpen={()=>{}} onUnlock={onUnlock} />
      </I18nProvider>
    );

    await user.click(screen.getByRole('button',{name:'Открыть доступ'}));
    expect(onUnlock).toHaveBeenCalledWith('day-3');
  });

  it('shows the access CTA only at the first paid boundary',()=>{
    const base=previewState();
    const day4={
      id:'day-4',
      kind:'lesson' as const,
      title:{ru:'День 4'},
      dayIndex:4,
      order:3,
      prerequisites:['day-3'],
      activityIds:[],
      optional:false
    };
    const state={
      ...base,
      roadmap:{...base.roadmap,nodes:[...base.roadmap.nodes,day4]},
      set:{
        ...base.set,
        roadmaps:[{...base.set.roadmaps[0]!,nodes:[...base.set.roadmaps[0]!.nodes,day4]}]
      },
      roadmapProgress:{
        ...base.roadmapProgress,
        nodes:[
          ...base.roadmapProgress.nodes,
          {node:day4,complete:false,unlocked:false}
        ],
        requiredCount:4
      }
    };
    const runtime:LearnerCourseRuntimeValue={
      state,
      status:'ready',
      error:null,
      refresh:async()=>{}
    };

    render(
      <I18nProvider
        dictionaries={dictionaries}
        config={{locales:['ru'],default:'ru'}}
        storageKey="course-map-one-access-cta.locale"
        systemLanguages={['ru']}
      >
        <CourseMapView runtime={runtime} onExit={()=>{}} onOpen={()=>{}} onUnlock={()=>{}} />
      </I18nProvider>
    );

    expect(screen.getAllByRole('button',{name:'Открыть доступ'})).toHaveLength(1);
  });
});
