'use strict';

// Read a bounded upstream body before JSON parsing, even when Content-Length is absent.
// A single published release is JSONB and can otherwise exceed the row LIMIT.
const MAX_UPSTREAM_BYTES = 1024 * 1024;
async function boundedJson(response) {
  const claimed = response.headers?.get?.('content-length');
  if (claimed !== null && claimed !== undefined && Number(claimed) > MAX_UPSTREAM_BYTES) {
    throw new Error('catalog_response_too_large');
  }
  if (!response.body || typeof response.body.getReader !== 'function') {
    throw new Error('catalog_response_invalid');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', {fatal: true});
  let text = '';
  let bytes = 0;
  let finished = false;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) { finished = true; break; }
      bytes += value.byteLength;
      if (bytes > MAX_UPSTREAM_BYTES) throw new Error('catalog_response_too_large');
      text += decoder.decode(value, {stream: true});
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally {
    if (!finished) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

module.exports={boundedJson};
