export const TIERS = Object.freeze({
  REQUIRED: 'required',
  OPTIONAL: 'optional',
  PRODUCT: 'product-specific'
});

export const BASELINE = Object.freeze([
  {id:'reactTsVite', tier:TIERS.REQUIRED, description:'React + TypeScript + Vite application shell'},
  {id:'routing', tier:TIERS.REQUIRED, description:'Hash/router composition owned by the app'},
  {id:'coreAliases', tier:TIERS.REQUIRED, description:'AppBase Core and shared UI aliases'},
  {id:'auth', tier:TIERS.REQUIRED, description:'Shared auth provider/client and account lifecycle'},
  {id:'i18n', tier:TIERS.REQUIRED, description:'Shared i18n provider with product dictionaries'},
  {id:'theme', tier:TIERS.REQUIRED, description:'Product theme applied before app render'},
  {id:'localFirstSync', tier:TIERS.REQUIRED, description:'Local-first document sync through Core'},
  {id:'billingClient', tier:TIERS.REQUIRED, description:'Provider-neutral billing client and API composition'},
  {id:'installAnalytics', tier:TIERS.REQUIRED, description:'Install analytics bootstrap'},
  {id:'clientDiagnostics', tier:TIERS.REQUIRED, description:'Global client diagnostics capture'},
  {id:'fatalErrorBoundary', tier:TIERS.REQUIRED, description:'Production-safe fatal React error boundary'},
  {id:'genericFallbackUx', tier:TIERS.REQUIRED, description:'Production-safe route/not-found fallback UX'},
  {id:'adminUi', tier:TIERS.REQUIRED, description:'Shared Admin route and client'},
  {id:'adminApi', tier:TIERS.REQUIRED, description:'Shared Admin API composition'},
  {id:'healthApi', tier:TIERS.REQUIRED, description:'Shared health/readiness endpoint'},
  {id:'legalConfig', tier:TIERS.REQUIRED, description:'Shared legal/config surface through Core Admin/config'},
  {id:'checks', tier:TIERS.REQUIRED, description:'Typecheck, unit/smoke tests and production build in npm run check'},

  {id:'ai', tier:TIERS.OPTIONAL, description:'AI provider/runtime capability'},
  {id:'remotePush', tier:TIERS.OPTIONAL, description:'Remote push capability'},
  {id:'biometrics', tier:TIERS.OPTIONAL, description:'Native biometric capability'},
  {id:'voice', tier:TIERS.OPTIONAL, description:'Native voice/speech capability'},
  {id:'sharing', tier:TIERS.OPTIONAL, description:'Product sharing capability'},
  {id:'profiles', tier:TIERS.OPTIONAL, description:'Public/profile capability'},

  {id:'domainSchemas', tier:TIERS.PRODUCT, description:'Product domain schemas and validation'},
  {id:'domainRepositories', tier:TIERS.PRODUCT, description:'Product repositories and merge semantics'},
  {id:'productUx', tier:TIERS.PRODUCT, description:'Product-specific screens and workflows'},
  {id:'productAnalytics', tier:TIERS.PRODUCT, description:'Product analytics taxonomy'},
  {id:'productAdmin', tier:TIERS.PRODUCT, description:'Product-specific Admin extensions'}
]);

export const CURRENT_GAPS = Object.freeze({
  starter: Object.freeze([]),
  taskMini: Object.freeze(['installAnalytics','clientDiagnostics','fatalErrorBoundary','genericFallbackUx'])
});
