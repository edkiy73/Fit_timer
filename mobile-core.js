"use strict";
var AppBaseMobile;
(function (AppBaseMobile) {
    function blobBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
            reader.onerror = () => reject(reader.error || new Error('file_read_failed'));
            reader.readAsDataURL(blob);
        });
    }
    function safeFileName(value) {
        return String(value || 'share-file')
            .replace(/[^\wа-яёА-ЯЁ.\-]+/g, '-')
            .slice(-100);
    }
    function createBridge(options) {
        const app = options.app || null;
        const filesystem = options.filesystem || null;
        const share = options.share || null;
        const haptics = options.haptics || null;
        const system = options.system || null;
        const biometric = options.biometric || null;
        let inactiveAt = 0;
        return {
            isNative() { return !!options.native; },
            platform() {
                try {
                    return String(options.platform?.() || 'web');
                }
                catch (_) {
                    return 'web';
                }
            },
            async onLifecycle(listener) {
                if (!options.native || !app?.addListener)
                    return null;
                try {
                    return await app.addListener('appStateChange', event => {
                        const active = !!(event && event.isActive);
                        if (!active) {
                            inactiveAt = Date.now();
                            listener({ active: false, awayMs: 0 });
                            return;
                        }
                        const awayMs = inactiveAt ? Math.max(0, Date.now() - inactiveAt) : 0;
                        inactiveAt = 0;
                        listener({ active: true, awayMs });
                    });
                }
                catch (_) {
                    return null;
                }
            },
            async onUrl(listener) {
                if (!options.native || !app?.addListener)
                    return null;
                try {
                    return await app.addListener('appUrlOpen', event => {
                        const value = String((event && event.url) || '').trim();
                        if (value)
                            listener(value);
                    });
                }
                catch (_) {
                    return null;
                }
            },
            async launchUrl() {
                if (!options.native || !app?.getLaunchUrl)
                    return '';
                try {
                    const result = await app.getLaunchUrl();
                    return String((result && result.url) || '').trim();
                }
                catch (_) {
                    return '';
                }
            },
            async appInfo() {
                if (!options.native || !app?.getInfo)
                    return null;
                try {
                    const info = await app.getInfo();
                    let distribution = '';
                    if (system?.getDistribution) {
                        try {
                            const result = await system.getDistribution();
                            distribution = String((result && result.channel) || '');
                        }
                        catch (_) { }
                    }
                    return {
                        version: String((info && info.version) || ''),
                        build: Number((info && info.build) || 0) || 0,
                        distribution
                    };
                }
                catch (_) {
                    return null;
                }
            },
            async openExternal(url) {
                const value = String(url || '').trim();
                if (!value)
                    return false;
                if (options.native && system?.openExternal) {
                    try {
                        await system.openExternal({ url: value });
                        return true;
                    }
                    catch (_) { }
                }
                try {
                    return !!options.openWeb?.(value);
                }
                catch (_) {
                    return false;
                }
            },
            async shareBlob(blob, fileName, shareOptions = {}) {
                if (!options.native || !filesystem || !share || !blob)
                    return false;
                try {
                    const result = await filesystem.writeFile({
                        path: `appbase-share-${Date.now()}-${safeFileName(fileName)}`,
                        data: await blobBase64(blob),
                        directory: 'CACHE'
                    });
                    const uri = String((result && result.uri) || '');
                    if (!uri)
                        return false;
                    await share.share({
                        title: String(shareOptions.title || ''),
                        text: String(shareOptions.text || ''),
                        files: [uri],
                        dialogTitle: String(shareOptions.dialogTitle || '')
                    });
                    return true;
                }
                catch (_) {
                    return false;
                }
            },
            async impact(style = 'LIGHT') {
                if (!options.native || !haptics)
                    return false;
                try {
                    await haptics.impact({ style: String(style || 'LIGHT') });
                    return true;
                }
                catch (_) {
                    return false;
                }
            },
            async setTheme(light) {
                if (!options.native || !system?.setTheme)
                    return false;
                try {
                    await system.setTheme({ light: !!light });
                    return true;
                }
                catch (_) {
                    return false;
                }
            },
            async biometricStatus() {
                if (!options.native || !biometric?.status)
                    return { available: false, reason: 'unsupported' };
                try {
                    return await biometric.status();
                }
                catch (_) {
                    return { available: false, reason: 'temporarily_unavailable' };
                }
            },
            async authenticateBiometric(authOptions = {}) {
                if (!options.native || !biometric?.authenticate)
                    return { ok: false, error: 'unsupported' };
                try {
                    return await biometric.authenticate(authOptions);
                }
                catch (_) {
                    return { ok: false, error: 'temporarily_unavailable' };
                }
            }
        };
    }
    AppBaseMobile.createBridge = createBridge;
})(AppBaseMobile || (AppBaseMobile = {}));
