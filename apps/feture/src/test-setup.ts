import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(() => cleanup());

// jsdom has no layout scroll API; browser verification exercises real scrolling.
HTMLElement.prototype.scrollTo = function(options?: ScrollToOptions | number, y?: number) {
  this.scrollTop = typeof options === 'number' ? y || 0 : options?.top || 0;
};
