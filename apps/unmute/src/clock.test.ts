import { afterEach, describe, expect, it } from 'vitest';
import { appNow, applyServerTime, clockOffsetMs, resetClockForTests, syncServerClock } from './clock';

afterEach(()=>resetClockForTests());

describe('learning-day clock',()=>{
  it('follows the server when the phone date is moved forward',()=>{
    const phone=Date.parse('2026-10-10T12:00:00Z');
    applyServerTime('2026-10-08T12:00:00Z',phone,phone+200);
    expect(Math.round(clockOffsetMs()/3600000)).toBe(-48);
    expect(appNow().getTime()-Date.now()).toBeLessThan(-47*3600000);
  });

  it('ignores a few seconds of network delay',()=>{
    const now=Date.now();
    applyServerTime(new Date(now+3000).toISOString(),now,now+400);
    expect(clockOffsetMs()).toBe(0);
  });

  it('keeps the last offset when the server cannot be reached',async()=>{
    const phone=Date.parse('2026-10-10T12:00:00Z');
    applyServerTime('2026-10-08T12:00:00Z',phone,phone);
    const before=clockOffsetMs();
    expect(await syncServerClock((async()=>{ throw new Error('offline'); }) as unknown as typeof fetch)).toBe(false);
    expect(clockOffsetMs()).toBe(before);
  });

  it('reads the server time from the public health answer',async()=>{
    const server=new Date(Date.now()-3*86400000).toISOString();
    const fetcher=(async()=>new Response(JSON.stringify({ok:true,checkedAt:server}),{status:200})) as unknown as typeof fetch;
    expect(await syncServerClock(fetcher)).toBe(true);
    expect(Math.round(clockOffsetMs()/86400000)).toBe(-3);
  });
});
