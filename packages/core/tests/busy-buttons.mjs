/* Busy buttons: the pressed button spins while the requests it started are running. */
const {installBusyButtons, untrackedFetch} = await import('../dist/core/busy-buttons.js');

let bad = 0;
const ok = (name, cond) => { if(!cond) bad++; console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name); };

let clock = 0;
const timers = [];
const runTimers = () => { for(const t of timers.splice(0)) if(t.at <= clock) t.fn(); else timers.push(t); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
const flush = () => new Promise(r => setImmediate(r));

function button(attrs = {}){
  const node = {isConnected:true, attrs:{...attrs},
    setAttribute(k, v){ this.attrs[k] = v; }, removeAttribute(k){ delete this.attrs[k]; }, getAttribute(k){ return this.attrs[k] ?? null; },
    closest(){ return node; }};
  return node;
}

let listener = null;
const head = [];
const requests = [];
const host = {
  document:{
    addEventListener(type, fn){ listener = fn; }, removeEventListener(){ listener = null; },
    getElementById(id){ return head.find(n => n.id === id) || null; },
    createElement(){ return {id:'', textContent:''}; },
    head:{appendChild(n){ head.push(n); }}
  },
  fetch(){ const d = deferred(); requests.push(d); return d.promise; },
  setTimeout(fn, ms){ timers.push({fn, at:clock + ms}); }
};
const originalFetch = host.fetch;

const uninstall = installBusyButtons(host, () => clock);
ok('spinner style is added once', head.length === 1 && head[0].textContent.includes('aria-busy'));
installBusyButtons(host, () => clock)();
ok('a second install changes nothing', head.length === 1 && listener !== null);

// Slow request after a press → spinner, removed when the answer comes.
const save = button();
listener({target:save});
host.fetch('/api/x');
clock = 100; runTimers();
ok('no spinner for the first 150 ms', save.attrs['aria-busy'] === undefined);
clock = 200; runTimers();
ok('slow request: the pressed button spins', save.attrs['aria-busy'] === 'true');
// A follow-up request while waiting stays on the same button.
clock = 1500; host.fetch('/api/reload');
requests[0].resolve(); await flush();
ok('still spinning while the follow-up runs', save.attrs['aria-busy'] === 'true');
requests[1].resolve(); await flush();
ok('spinner removed when every request answered', save.attrs['aria-busy'] === undefined);

// Fast request → never spins.
const quick = button();
clock = 5000; listener({target:quick});
host.fetch('/api/fast'); requests[2].resolve(); await flush();
clock = 5200; runTimers();
ok('a fast answer shows no spinner', quick.attrs['aria-busy'] === undefined);

// Request long after the press is not tied to it.
clock = 9000; host.fetch('/api/later');
clock = 9200; runTimers();
ok('a request a while after the press does not spin the button', quick.attrs['aria-busy'] === undefined);

// Opt-out and untracked fetch.
const off = button({'data-busy':'off'});
clock = 10000; listener({target:off}); host.fetch('/api/y');
clock = 10200; runTimers();
ok('data-busy="off" opts a button out', off.attrs['aria-busy'] === undefined);
const bg = button();
clock = 11000; listener({target:bg});
globalThis.fetch = host.fetch;
untrackedFetch('/api/analytics');
clock = 11200; runTimers();
ok('untrackedFetch never spins a button', bg.attrs['aria-busy'] === undefined);

uninstall();
ok('uninstall restores fetch', host.fetch === originalFetch && listener === null);

if(bad){ console.error(bad + ' busy-buttons checks failed'); process.exit(1); }
console.log('Busy buttons tests passed');
