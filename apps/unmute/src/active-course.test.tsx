import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@appbase/ui-react/i18n.js';
import { dictionaries } from './i18n';
import { CoursePicker, useActiveCourseId } from './active-course';
import { patchSettings, readSettings } from './settings';

const mocked=vi.hoisted(()=>({
  session:null as null|{email:string;owned:string[];premium:boolean}
}));

vi.mock('@appbase/ui-react/auth.js',()=>({useOptionalAuth:()=>({session:mocked.session,loading:false})}));
vi.mock('./sync',()=>({SETTINGS_DOC:'settings',appDocs:{subscribe:()=>()=>{}}}));
vi.mock('./settings',()=>({readSettings:vi.fn(async()=>({})),patchSettings:vi.fn(async()=>{})}));
vi.mock('./content/client',()=>({loadCatalog:vi.fn(async()=>({schemaVersion:1,revision:2,updatedAt:'',sets:[
  {id:'a1-starter',slug:'a1-starter',revision:1,title:{ru:'A1: первые шаги'},description:{ru:'Три коротких дня'},
    level:{from:'a1',to:'a1'},access:{mode:'entitlement',entitlement:'course.a1-starter',freePreview:{kind:'first-days',days:1,learnedContentStaysAvailable:true}},defaultRoadmapId:'main',publishedAt:''},
  {id:'general-foundation',slug:'general-foundation',revision:3,title:{ru:'Общий английский'},description:null,
    level:{from:'a1',to:'b2'},access:{mode:'entitlement',entitlement:'course.general-foundation',freePreview:{kind:'first-days',days:7,learnedContentStaysAvailable:true}},defaultRoadmapId:'main',publishedAt:''}
]}))}));

function wrap(children:ReactNode){
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  return (
    <QueryClientProvider client={client}>
      <I18nProvider dictionaries={dictionaries} config={{locales:['ru'],default:'ru'}} storageKey="active-course-test.locale" systemLanguages={['ru']}>
        {children}
      </I18nProvider>
    </QueryClientProvider>
  );
}

function ActiveId(){
  return <output>{useActiveCourseId()||'pending'}</output>;
}

describe('course switcher',()=>{
  beforeEach(()=>{
    mocked.session=null;
    vi.mocked(readSettings).mockResolvedValue({});
    vi.mocked(patchSettings).mockClear();
  });

  it('defaults to the main course and follows the saved choice',async()=>{
    const {unmount}=render(wrap(<ActiveId />));
    await waitFor(()=>expect(screen.getByRole('status').textContent).toBe('general-foundation'));
    unmount();
    vi.mocked(readSettings).mockResolvedValue({activeCourse:{id:'a1-starter',changedAt:'2026-09-30T00:00:00Z'}});
    render(wrap(<ActiveId />));
    await waitFor(()=>expect(screen.getByRole('status').textContent).toBe('a1-starter'));
  });

  it('lists published courses with their access and saves the pick',async()=>{
    mocked.session={email:'a@b.c',owned:['course.a1-starter'],premium:false};
    render(wrap(<CoursePicker currentId="general-foundation" />));
    await userEvent.click(await screen.findByRole('button',{name:/Общий английский/}));
    const dialog=await screen.findByRole('dialog');
    const a1=within(dialog).getByRole('button',{name:/A1: первые шаги/});
    expect(a1.textContent).toContain(dictionaries.ru['courses.open']);
    expect(within(dialog).getByRole('button',{name:/Общий английский/}).getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(a1);
    expect(patchSettings).toHaveBeenCalledWith({activeCourse:{id:'a1-starter',changedAt:expect.any(String)}});
  });
});
