import { afterEach, describe, expect, it } from 'vitest';
import product from '../config/product.json';
import { apiUrl } from './api-url';

const globals=globalThis as unknown as {Capacitor?:unknown};

describe('API address',()=>{
  afterEach(()=>{ delete globals.Capacitor; });

  it('stays relative on the web, next to the page',()=>{
    expect(apiUrl('/api/sync')).toBe('/api/sync');
    globals.Capacitor={isNativePlatform:()=>false};
    expect(apiUrl('/api/sync')).toBe('/api/sync');
  });

  it('points the native app at the production API',()=>{
    globals.Capacitor={isNativePlatform:()=>true};
    expect(apiUrl('/api/content?action=catalog')).toBe(product.defaultApiUrl.replace(/\/$/,'')+'/api/content?action=catalog');
    expect(apiUrl('/api/auth')).toMatch(/^https:\/\//);
  });
});
