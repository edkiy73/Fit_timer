// @ts-check
/** «Run the worker now» (owner 03.11.2026: notifications and counters in seconds, not up to a minute). On our own
 * server (server/host.mjs) the host registers a debounced quick tick here; elsewhere (tests, Vercel) it does nothing
 * and the minute tick stays the only one. The host never runs two ticks at once, so the outbox claims (lock_token,
 * `for update skip locked`) see the same single worker as before. */

/** @type {(() => void) | null} */
let runner = null;

/** @param {(() => void) | null} fn */
export function setJobKick(fn) { runner = fn; }

export function kickJobs() {
  try { runner?.(); } catch { /* a kick is a hint: never fails a command */ }
}
