/* ================= RUNTIME COMPATIBILITY BOUNDARY =================
   Legacy browser/native globals live here while the frontend is still concatenated.
   Product/domain code should depend on this adapter instead of reading globals directly. */
const appRuntimeCompat = Object.freeze({
  externalStorage(){
    try{
      const candidate = window.storage;
      if(!candidate) return null;
      if(typeof candidate.get !== 'function') return null;
      if(typeof candidate.set !== 'function') return null;
      if(typeof candidate.delete !== 'function') return null;
      return candidate;
    }catch(_){
      return null;
    }
  }
});
