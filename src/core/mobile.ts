export interface ListenerHandle {
  remove(): Promise<void> | void;
}

export interface AppPlugin {
  addListener?(
    eventName: string,
    listener: (event: any) => void
  ): Promise<ListenerHandle> | ListenerHandle;
  getLaunchUrl?(): Promise<{url?: string | null} | null>;
  getInfo?(): Promise<{version?: string; build?: string | number} | null>;
}

export interface FilesystemPlugin {
  writeFile(input: {
    path: string;
    data: string;
    directory: string;
  }): Promise<{uri?: string | null}>;
}

export interface SharePlugin {
  share(input: {
    title?: string;
    text?: string;
    files?: string[];
    dialogTitle?: string;
  }): Promise<unknown>;
}

export interface HapticsPlugin {
  impact(input: {style: string}): Promise<unknown>;
}

export interface SystemAdapter {
  setTheme?(input: {light: boolean}): Promise<unknown>;
  openExternal?(input: {url: string}): Promise<unknown>;
  getDistribution?(): Promise<{channel?: string | null} | null>;
}

export interface BiometricAdapter {
  status?(): Promise<Record<string, unknown>>;
  authenticate?(options: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface BridgeOptions {
  native: boolean;
  app?: AppPlugin | null;
  filesystem?: FilesystemPlugin | null;
  share?: SharePlugin | null;
  haptics?: HapticsPlugin | null;
  system?: SystemAdapter | null;
  biometric?: BiometricAdapter | null;
  platform?: () => string;
  openWeb?: (url: string) => boolean;
}

export interface LifecycleEvent {
  active: boolean;
  awayMs: number;
}

export interface AppInfo {
  version: string;
  build: number;
  distribution: string;
}

export interface MobileBridge {
  isNative(): boolean;
  platform(): string;
  onLifecycle(listener: (event: LifecycleEvent) => void): Promise<ListenerHandle | null>;
  onUrl(listener: (url: string) => void): Promise<ListenerHandle | null>;
  launchUrl(): Promise<string>;
  appInfo(): Promise<AppInfo | null>;
  openExternal(url: string): Promise<boolean>;
  shareBlob(
    blob: Blob,
    fileName: string,
    options?: {title?: string; text?: string; dialogTitle?: string}
  ): Promise<boolean>;
  impact(style?: string): Promise<boolean>;
  setTheme(light: boolean): Promise<boolean>;
  biometricStatus(): Promise<Record<string, unknown>>;
  authenticateBiometric(options?: Record<string, unknown>): Promise<Record<string, unknown>>;
}

function blobBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('file_read_failed'));
    reader.readAsDataURL(blob);
  });
}

function safeFileName(value: string): string {
  return String(value || 'share-file')
    .replace(/[^\wа-яёА-ЯЁ.\-]+/g, '-')
    .slice(-100);
}

export function createBridge(options: BridgeOptions): MobileBridge {
  const app = options.app || null;
  const filesystem = options.filesystem || null;
  const share = options.share || null;
  const haptics = options.haptics || null;
  const system = options.system || null;
  const biometric = options.biometric || null;
  let inactiveAt = 0;

  return {
    isNative(){ return !!options.native; },

    platform(){
      try{ return String(options.platform?.() || 'web'); }
      catch(_){ return 'web'; }
    },

    async onLifecycle(listener){
      if(!options.native || !app?.addListener) return null;
      try{
        return await app.addListener('appStateChange', event => {
          const active = !!(event && event.isActive);
          if(!active){
            inactiveAt = Date.now();
            listener({active:false, awayMs:0});
            return;
          }
          const awayMs = inactiveAt ? Math.max(0, Date.now() - inactiveAt) : 0;
          inactiveAt = 0;
          listener({active:true, awayMs});
        });
      }catch(_){
        return null;
      }
    },

    async onUrl(listener){
      if(!options.native || !app?.addListener) return null;
      try{
        return await app.addListener('appUrlOpen', event => {
          const value = String((event && event.url) || '').trim();
          if(value) listener(value);
        });
      }catch(_){
        return null;
      }
    },

    async launchUrl(){
      if(!options.native || !app?.getLaunchUrl) return '';
      try{
        const result = await app.getLaunchUrl();
        return String((result && result.url) || '').trim();
      }catch(_){
        return '';
      }
    },

    async appInfo(){
      if(!options.native || !app?.getInfo) return null;
      try{
        const info = await app.getInfo();
        let distribution = '';
        if(system?.getDistribution){
          try{
            const result = await system.getDistribution();
            distribution = String((result && result.channel) || '');
          }catch(_){}
        }
        return {
          version:String((info && info.version) || ''),
          build:Number((info && info.build) || 0) || 0,
          distribution
        };
      }catch(_){
        return null;
      }
    },

    async openExternal(url){
      const value = String(url || '').trim();
      if(!value) return false;
      if(options.native && system?.openExternal){
        try{
          await system.openExternal({url:value});
          return true;
        }catch(_){}
      }
      try{
        return !!options.openWeb?.(value);
      }catch(_){
        return false;
      }
    },

    async shareBlob(blob, fileName, shareOptions = {}){
      if(!options.native || !filesystem || !share || !blob) return false;
      try{
        const result = await filesystem.writeFile({
          path:`appbase-share-${Date.now()}-${safeFileName(fileName)}`,
          data:await blobBase64(blob),
          directory:'CACHE'
        });
        const uri = String((result && result.uri) || '');
        if(!uri) return false;
        await share.share({
          title:String(shareOptions.title || ''),
          text:String(shareOptions.text || ''),
          files:[uri],
          dialogTitle:String(shareOptions.dialogTitle || '')
        });
        return true;
      }catch(_){
        return false;
      }
    },

    async impact(style = 'LIGHT'){
      if(!options.native || !haptics) return false;
      try{
        await haptics.impact({style:String(style || 'LIGHT')});
        return true;
      }catch(_){
        return false;
      }
    },

    async setTheme(light){
      if(!options.native || !system?.setTheme) return false;
      try{
        await system.setTheme({light:!!light});
        return true;
      }catch(_){
        return false;
      }
    },

    async biometricStatus(){
      if(!options.native || !biometric?.status) return {available:false, reason:'unsupported'};
      try{
        return await biometric.status();
      }catch(_){
        return {available:false, reason:'temporarily_unavailable'};
      }
    },

    async authenticateBiometric(authOptions = {}){
      if(!options.native || !biometric?.authenticate) return {ok:false, error:'unsupported'};
      try{
        return await biometric.authenticate(authOptions);
      }catch(_){
        return {ok:false, error:'temporarily_unavailable'};
      }
    }
  };
}
