/**
 * Production ES-module entry point (bundled by scripts/build-esm.mjs).
 *
 * Start order matters: the native bridge (mobile.js → window.FitNative) must exist
 * before the product runtime starts, so it is loaded first; the product runtime
 * (src/app/index.js and the product modules it imports, together with AppBase Core)
 * is then loaded as a lazily imported chunk of the same module graph.
 */
export const APPBASE_ESM_FOUNDATION = true;

function loadModuleScript(src: string, marker: string, failureCode: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if(document.querySelector(`script[${marker}]`)){
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.type = 'module';
    script.setAttribute(marker, 'true');
    script.addEventListener('load', () => resolve(), {once:true});
    script.addEventListener('error', () => reject(new Error(failureCode)), {once:true});
    document.body.appendChild(script);
  });
}

export function loadMobileRuntime(): Promise<void> {
  return loadModuleScript('esm/mobile.js', 'data-mobile-runtime', 'mobile_runtime_failed');
}

export async function loadProductRuntime(): Promise<void> {
  await import('./app/index.js');
}

/* Web only: esm/main.js has a fixed name, the chunks it imports are content-hashed.
   A page (or a restored browser tab) that still holds main.js from a previous
   deployment asks for chunk names that the new deployment no longer has, and the
   runtime never starts: the person sees bare markup without the app. One reload
   fetches the matching main.js; the marker prevents a reload loop when the failure
   is real (offline, broken build), in which case the old fallback below applies. */
const RELOAD_MARK = 'fitRuntimeReloadAt';
function reloadOnceAfterFailedStart(): boolean {
  if(!/^https?:$/.test(location.protocol)) return false;   // native shell: files are local
  try{
    const last = Number(sessionStorage.getItem(RELOAD_MARK) || 0);
    if(Date.now() - last < 60000) return false;
    sessionStorage.setItem(RELOAD_MARK, String(Date.now()));
  }catch(_){
    return false;
  }
  location.reload();
  return true;
}

try{
  await loadMobileRuntime();
  await loadProductRuntime();
}catch(error){
  console.error('Failed to start product runtime', error);
  if(!reloadOnceAfterFailedStart()) document.body.classList.remove('booting');
}
