import { afterEach, describe, expect, it, vi } from 'vitest';
import { maybeAskStoreReview } from './store-review';

afterEach(() => localStorage.clear());

describe('store rating after day 3 (decision 17)', () => {
  it('asks once, only from the third finished day', async () => {
    const plugin = {requestReview: vi.fn(async () => ({requested: true}))};
    expect(await maybeAskStoreReview(2, plugin)).toBe(false);
    expect(plugin.requestReview).not.toHaveBeenCalled();
    expect(await maybeAskStoreReview(3, plugin)).toBe(true);
    expect(await maybeAskStoreReview(4, plugin)).toBe(false);
    expect(plugin.requestReview).toHaveBeenCalledTimes(1);
  });

  it('does nothing without the store sheet (web, direct APK)', async () => {
    expect(await maybeAskStoreReview(5, null)).toBe(false);
    expect(await maybeAskStoreReview(5, {requestReview: async () => ({requested: false})})).toBe(false);
  });
});
