/* Temporary dependency capture for the legacy concatenated product runtime.
   main.ts exposes FitTimerModules only for startup; this file captures the modules
   into bundle-local bindings so the global bridge can be deleted immediately after load. */
const fitLegacyModules = globalThis.FitTimerModules;
if(!fitLegacyModules) throw new Error('fit_product_modules_missing');

const appInfrastructure = fitLegacyModules.infrastructure;
const appIdentity = fitLegacyModules.identity;
const appSync = fitLegacyModules.sync;
const appNotifications = fitLegacyModules.notifications;
const appUi = fitLegacyModules.ui;
