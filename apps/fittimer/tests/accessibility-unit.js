import { readFile } from 'node:fs/promises';

const html = await readFile('src/html/00-shell-home.html', 'utf8');
const i18n = await readFile('src/i18n/index.js', 'utf8');
const css = await readFile('src/styles/00-foundation.css', 'utf8');
const android = await readFile('android/app/src/main/java/ru/fittimer/app/MainActivity.java', 'utf8');
const ru = await readFile('src/i18n/ru.js', 'utf8');
const en = await readFile('src/i18n/en.js', 'utf8');

const need = (ok, msg) => { if(!ok) throw new Error(msg); };

need(!html.includes('user-scalable=no'), 'viewport must not disable accessibility zoom');
need(html.includes('maximum-scale=5.0'), 'viewport must allow useful zoom');
need(i18n.includes('function syncAccessibility(root)'), 'accessibility sync helper is missing');
need(i18n.includes("root.querySelectorAll('.back-chip')"), 'back buttons need accessible names');
need(i18n.includes("el.setAttribute('role', 'switch')"), 'custom switches need switch semantics');
need(i18n.includes("el.setAttribute('aria-checked'"), 'custom switches need checked state');
need(i18n.includes("el.dataset.autoAria === '1'") && i18n.includes(".join('. ')"), 'switch names are title + hint and follow the app language');
need(i18n.includes("button[title]"), 'icon buttons with title need accessible names');
need(css.includes('min-width:44px;min-height:44px'), 'small icon controls need 44px touch targets');
need(!css.includes('}\\n  *{box-sizing:border-box'), 'CSS reset must contain a real newline, not a literal \\n selector');
need(/text-size-adjust:100%\}\s*\n\s*\*\{box-sizing:border-box/.test(css), 'global box-sizing/reset must remain active after text-size-adjust');
need(css.includes(':focus-visible'), 'keyboard/switch focus indication is missing');
need(android.includes('setTextZoom(zoom)'), 'Android WebView must respect system font scale');
need(android.includes('onConfigurationChanged(Configuration newConfig)'), 'font scale must refresh after configuration changes');
need(ru.includes("'common.back': 'Назад'"), 'RU back label is missing');
need(en.includes("'common.back': 'Back'"), 'EN back label is missing');

console.log('Accessibility rules are valid.');
