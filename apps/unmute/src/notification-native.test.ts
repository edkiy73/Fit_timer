import { describe, expect, it } from 'vitest';
import { notificationRouteFromAction } from './notification-native';

describe('native notification deep links',()=>{
  it('opens only supported learner routes from local notification extras',()=>{
    expect(notificationRouteFromAction({
      notification:{extra:{route:'/review'}}
    })).toBe('/review');

    expect(notificationRouteFromAction({
      notification:{data:{route:'/'}}
    })).toBe('/');
  });

  it('rejects arbitrary routes from notification payloads',()=>{
    expect(notificationRouteFromAction({
      notification:{extra:{route:'/admin'}}
    })).toBeNull();
    expect(notificationRouteFromAction({
      notification:{extra:{route:'https://example.com'}}
    })).toBeNull();
  });
});
