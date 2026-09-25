"use strict";
var AppBaseTelemetry;
(function (AppBaseTelemetry) {
    function createTelemetry(transport) {
        let diagnosticBusy = false;
        return {
            async track(event, properties) {
                const name = String(event || '').trim();
                if (!name)
                    return false;
                try {
                    return !!(await transport.sendAnalytics({ event: name, properties }));
                }
                catch (_) {
                    return false;
                }
            },
            async capture(kind, error, fallbackMessage, context) {
                if (diagnosticBusy)
                    return false;
                diagnosticBusy = true;
                try {
                    const source = error && typeof error === 'object'
                        ? error
                        : null;
                    const input = {
                        kind: kind === 'rejection' ? 'rejection' : 'error',
                        name: String(source?.name || 'Error').slice(0, 80),
                        message: String(source?.message || fallbackMessage || 'unknown').slice(0, 700),
                        stack: String(source?.stack || '').slice(0, 4000),
                        context
                    };
                    return !!(await transport.sendDiagnostic(input));
                }
                catch (_) {
                    return false;
                }
                finally {
                    diagnosticBusy = false;
                }
            }
        };
    }
    AppBaseTelemetry.createTelemetry = createTelemetry;
})(AppBaseTelemetry || (AppBaseTelemetry = {}));
