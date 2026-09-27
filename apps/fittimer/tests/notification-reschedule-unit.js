const fs = require('fs');
const source = fs.readFileSync('mobile.js','utf8');
const need = (ok, msg) => { if(!ok) throw new Error(msg); };

const fn = source.slice(
  source.indexOf('async function syncWorkoutNotifications(items)'),
  source.indexOf('async function updateWorkoutState', source.indexOf('async function syncWorkoutNotifications(items)'))
);
need(fn.includes('Array.from({length:60}'), 'notification reschedule must enumerate every FitTimer plan id');
need(fn.includes('await nativeNotificationTransport.cancel(staleIds)'),
  'old pending FitTimer notifications must be cancelled explicitly');
need(fn.includes('await nativeNotificationTransport.removeDelivered(staleIds)'),
  'old delivered FitTimer notifications must be removed explicitly');
need(fn.indexOf('cancel(staleIds)') < fn.indexOf('schedule(list)'),
  'stale notifications must be cleared before new ones are scheduled');

console.log('notification reschedule contract: ok');
