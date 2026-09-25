"use strict";
var AppBaseObservability = (() => {
    const module = { exports: {} };
    const exports = module.exports;
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.createClient = createClient;
    function createClient(options) {
        let reporting = false;
        const diagnosticPayload = (kind, error, fallbackMessage) => {
            const e = error && typeof error === 'object'
                ? error
                : null;
            const ctx = options.context();
            return {
                action: 'client_error',
                kind: kind === 'rejection' ? 'rejection' : 'error',
                name: String((e && e.name) || 'Error').slice(0, 80),
                message: String((e && e.message) || fallbackMessage || 'unknown').slice(0, 700),
                stack: String((e && e.stack) || '').slice(0, 4000),
                build: String(ctx.build || '').slice(0, 80),
                platform: ctx.platform,
                locale: String(ctx.locale || '').slice(0, 20)
            };
        };
        return {
            async track(event) {
                const name = String(event || '').trim();
                if (!name)
                    return false;
                try {
                    const ctx = options.context();
                    return await options.post({
                        action: 'analytics',
                        event: name,
                        deviceId: await options.deviceId(),
                        platform: ctx.platform,
                        locale: String(ctx.locale || '').slice(0, 20),
                        premium: !!ctx.premium
                    });
                }
                catch (_) {
                    return false;
                }
            },
            diagnosticPayload,
            async capture(kind, error, fallbackMessage) {
                if (reporting)
                    return false;
                reporting = true;
                try {
                    return await options.post(diagnosticPayload(kind, error, fallbackMessage));
                }
                catch (_) {
                    return false;
                }
                finally {
                    reporting = false;
                }
            }
        };
    }
    
    return module.exports;
})();
