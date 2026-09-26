/**
 * Production ES-module entry point (bundled by scripts/build-esm.mjs).
 *
 * Start order matters: the native bridge (mobile.js → window.FitNative) must exist
 * before the product runtime starts, so it is loaded first; the product runtime
 * (generated app.js, which imports AppBase Core and the typed product modules
 * itself) is then loaded as a lazily imported chunk of the same module graph.
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
  await import('../app.js');
}

try{
  await loadMobileRuntime();
  await loadProductRuntime();
}catch(error){
  console.error('Failed to start product runtime', error);
  document.body.classList.remove('booting');
}
