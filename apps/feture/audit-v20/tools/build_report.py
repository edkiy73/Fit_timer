# -*- coding: utf-8 -*-
"""Builds the FetUre V20 audit deliverables from the working files.

Inputs  (audit-v20/work):  findings-*.json, coverage-*.json, overlays.json (crawler), crawl-triage.json, inventory-390-*.json
Curated (audit-v20/tools): plan.json (fix phases and order), overview.md (hand-written overview)
Outputs (audit-v20):       data/issues.json, data/coverage.json, data/popups.json,
                           02-coverage-map.md, 03-issues-catalog.md, 04-visual-report.md, 05-popups-and-states.md, 06-fix-plan.md,
                           report.html, img-list.json (screenshots to convert)
Run: python3 tools/build_report.py   (then: node tools/convert-shots.mjs img-list.json)
"""
import json, glob, os, re, html, collections
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W = os.path.join(ROOT, 'work'); T = os.path.join(ROOT, 'tools')
PRI = ['P0', 'P1', 'P2', 'P3']
CAT = {'functional': 'Функциональная', 'ux': 'UX', 'ui': 'UI', 'product': 'Продуктовая'}
CAT_ALIAS = {'функциональная': 'functional', 'func': 'functional', 'ux/ui': 'ux', 'visual': 'ui', 'продуктовая': 'product'}
SECTION_ORDER = ['auth', 'feed', 'evcomm', 'people', 'me', 'couple', 'lead']
SRC_LABEL = {'auth': 'Вход, настройки, Premium', 'feed': 'Лента и публикации', 'evcomm': 'События и сообщества', 'people': 'Люди, профили, доступы',
             'me': '«Я», редактор, галерея', 'couple': 'Пара, чаты, уведомления', 'lead': 'Сквозные: визуал, адаптивность, навигация'}

def load(p, default):
    try: return json.load(open(p, encoding='utf-8'))
    except Exception as e: print('WARN cannot read', p, e); return default

def first_sentence(t, n=120):
    t = re.sub(r'\s+', ' ', str(t or '')).strip()
    m = re.match(r'(.+?[.!?])(\s|$)', t)
    s = m.group(1) if m else t
    return s if len(s) <= n else s[:n - 1].rsplit(' ', 1)[0] + '…'

def norm_shot(s):
    s = str(s).replace('\\', '/')
    s = re.sub(r'^.*?audit-v20/screens/', '', s); s = re.sub(r'^/?screens/', '', s)
    return s if s.lower().endswith('.png') else s + '.png'

# ---------- issues ----------
issues = []
for f in sorted(glob.glob(os.path.join(W, 'findings-*.json'))):
    src = os.path.basename(f)[9:-5]
    data = load(f, [])
    if isinstance(data, dict): data = data.get('findings') or data.get('issues') or []
    for x in data:
        x = dict(x); x['source'] = src
        x['priority'] = str(x.get('priority', 'P2')).upper().strip()[:2]
        if x['priority'] not in PRI: x['priority'] = 'P2'
        c = str(x.get('category', 'ux')).lower().strip(); c = CAT_ALIAS.get(c, c)
        x['category'] = c if c in CAT else 'ux'
        for k in ('steps', 'places', 'related', 'screens'):
            v = x.get(k) or []
            x[k] = v if isinstance(v, list) else [v]
        x['screens'] = [norm_shot(s) for s in x['screens'] if s]
        x.setdefault('section', SRC_LABEL[src] if src in SRC_LABEL else src)
        x['title'] = x.get('title') or first_sentence(x.get('actual'), 110)
        issues.append(x)

# de-duplicate ids
seen = collections.Counter()
for x in issues:
    seen[x['id']] += 1
    if seen[x['id']] > 1: x['id'] = f"{x['id']}-{seen[x['id']]}"
ids = {x['id'] for x in issues}

# ---------- plan ----------
plan = load(os.path.join(T, 'plan.json'), {'phases': []})
assigned = {}
for i, ph in enumerate(plan['phases']):
    for id_ in ph.get('ids', []):
        if id_ in ids and id_ not in assigned: assigned[id_] = i
# merged duplicates: plan may list ids that are dropped as duplicates
dupes = plan.get('duplicates', {})  # id -> canonical id
for x in issues:
    if x['id'] in dupes:
        x['duplicate_of'] = dupes[x['id']]
issues = [x for x in issues if not x.get('duplicate_of')]
ids = {x['id'] for x in issues}
# fallback phase by rules
rules = plan.get('fallback', [])
def fallback(x):
    for r in rules:
        if (not r.get('priority') or x['priority'] in r['priority']) and (not r.get('category') or x['category'] in r['category']) and (not r.get('source') or x['source'] in r['source']):
            return r['phase']
    return len(plan['phases']) - 1 if plan['phases'] else 0
for x in issues:
    ph = assigned.get(x['id'], fallback(x))
    x['phase_n'] = ph
    x['phase'] = plan['phases'][ph]['title'] if plan['phases'] else ''
issues.sort(key=lambda x: (x['phase_n'], PRI.index(x['priority']), SECTION_ORDER.index(x['source']) if x['source'] in SECTION_ORDER else 99, x['id']))
for n, x in enumerate(issues): x['order'] = n + 1
# overrides (title tweaks, priority corrections after verification)
for id_, o in plan.get('overrides', {}).items():
    for x in issues:
        if x['id'] == id_: x.update(o)
for x in issues: x.setdefault('status', 'open')

# ---------- coverage ----------
coverage = []
for f in sorted(glob.glob(os.path.join(W, 'coverage-*.json'))):
    src = os.path.basename(f)[9:-5]
    d = load(f, [])
    if isinstance(d, dict): d = d.get('items') or d.get('coverage') or []
    for c in d:
        c = dict(c); c['source'] = src
        c['status'] = str(c.get('status', 'checked')).lower()
        if c['status'] not in ('checked', 'partial', 'unreachable', 'not-checked'): c['status'] = 'partial' if 'part' in c['status'] else 'checked'
        c['issues'] = [i for i in (c.get('issues') or []) if i in ids]
        coverage.append(c)
# automatic coverage from inventory (every QA screen × persona)
inv_cov = {}
for f in sorted(glob.glob(os.path.join(W, 'inventory-390-*.json'))):
    for pk, items in load(f, {}).items():
        for it in items:
            k = it['id'] + (json.dumps(it.get('pr') or {}, ensure_ascii=False) if it.get('pr') else '')
            e = inv_cov.setdefault(k, {'type': 'screen', 'id': it['id'], 'name': it['l'], 'opened_by': 'QA-панель экранов / FT_QA.go', 'personas': [], 'status': 'checked', 'notes': 'Автопроход: скриншот, проверка вёрстки, список элементов, JS-ошибки.', 'issues': [], 'source': 'auto'})
            e['personas'].append(pk)

# ---------- popups ----------
ovl = load(os.path.join(W, 'overlays.json'), {})
popups = {}
for k, o in ovl.items():
    kind, name = k.split(':', 1)
    popups[name.lower()] = {'name': name, 'kind': {'sheet': 'Bottom sheet', 'dialog': 'Диалог подтверждения', 'menu': 'Меню/поповер'}.get(kind, kind),
                            'from': o['from'], 'via': o['via'], 'controls': o['controls'], 'personas': o['personas'], 'status': 'checked', 'statusLabel': 'краулер: все кнопки нажаты', 'issues': [], 'shot': o.get('shot')}
for c in coverage:
    if c.get('type') == 'popup':
        key = str(c.get('name', '')).lower()
        e = popups.get(key)
        if e:
            e['issues'] = sorted(set(e['issues']) | set(c['issues'])); e['statusLabel'] = 'вручную + краулер'; e['status'] = c['status']
            if c.get('notes'): e['notes'] = c['notes']
        else:
            popups[key] = {'name': c.get('name'), 'kind': c.get('kind') or 'Попап', 'from': [c.get('id')] if c.get('id') else [], 'via': [c.get('opened_by')] if c.get('opened_by') else [],
                           'controls': None, 'personas': c.get('personas') or [], 'status': c['status'], 'statusLabel': 'вручную', 'issues': c['issues'], 'notes': c.get('notes')}
popups = sorted(popups.values(), key=lambda p: (p['kind'], str(p['name']).lower()))
# link issues to popups by name mention
for p in popups:
    nm = str(p['name'])
    if len(nm) < 4: continue
    for x in issues:
        if nm in (x.get('component') or '') and x['id'] not in p['issues']: p['issues'].append(x['id'])

all_cov = coverage + [v for v in inv_cov.values()]
os.makedirs(os.path.join(ROOT, 'data'), exist_ok=True)
json.dump(issues, open(os.path.join(ROOT, 'data/issues.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(all_cov, open(os.path.join(ROOT, 'data/coverage.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(popups, open(os.path.join(ROOT, 'data/popups.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ---------- screenshots ----------
shots = sorted({s for x in issues for s in x['screens']} | {p['shot'] + '.png' for p in popups if p.get('shot')})
json.dump(shots, open(os.path.join(ROOT, 'img-list.json'), 'w'), indent=0)
def webp(s): return 'img/' + re.sub(r'\.png$', '.webp', s, flags=re.I)

# ---------- markdown ----------
def md_issue(x, full=True):
    L = [f"### {x['id']} · {x['priority']} · {CAT[x['category']]} — {x['title']}", '',
         f"- **Раздел / компонент:** {x['section']} → {x.get('component','')}",
         f"- **Состояние:** {x.get('state','')}"]
    if x['steps']: L.append('- **Шаги:**\n' + '\n'.join(f'  {n+1}. {s}' for n, s in enumerate(x['steps'])))
    L += [f"- **Сейчас:** {x.get('actual','')}", f"- **Почему это плохо:** {x.get('why','')}", f"- **Как должно быть:** {x.get('expected','')}",
          f"- **Исправление:** {x.get('fix','')}"]
    if x['places']: L.append('- **Где ещё:** ' + '; '.join(x['places']))
    if x['related']: L.append('- **Связано:** ' + ', '.join(x['related']))
    L.append(f"- **Проверка после исправления:** {x.get('verify','')}")
    if x.get('code'): L.append(f"- **Код:** `{x['code']}`")
    L.append(f"- **Этап плана:** {x['phase']}")
    if x['screens']: L.append('- **Скриншоты:** ' + ' '.join(f'[{os.path.basename(s)}]({webp(s)})' for s in x['screens']))
    return '\n'.join(L) + '\n'

cnt = collections.Counter(x['priority'] for x in issues); cc = collections.Counter(x['category'] for x in issues)
by_src = collections.defaultdict(list)
for x in issues: by_src[x['source']].append(x)
summary_tbl = '| Раздел | P0 | P1 | P2 | P3 | Всего |\n|---|---|---|---|---|---|\n' + '\n'.join(
    f"| {SRC_LABEL.get(s, s)} | " + ' | '.join(str(sum(1 for x in by_src[s] if x['priority'] == p)) for p in PRI) + f" | {len(by_src[s])} |" for s in SECTION_ORDER if s in by_src) + \
    f"\n| **Итого** | " + ' | '.join(f"**{cnt[p]}**" for p in PRI) + f" | **{len(issues)}** |"

hdr = lambda t: f"# {t}\n\n[← Оглавление](README.md) · [Интерактивный отчёт](report.html)\n\n"
# 03 catalog
out = [hdr('03 · Каталог недостатков'), f"Всего **{len(issues)}** проблем: " + ', '.join(f"{p} — {cnt[p]}" for p in PRI) + '. По типам: ' + ', '.join(f"{CAT[k]} — {cc[k]}" for k in CAT) + '.\n',
       summary_tbl + '\n', 'Порядок внутри раздела — по приоритету. ID стабильны: на них ссылаются план и интерактивный отчёт.\n']
for s in SECTION_ORDER:
    if s not in by_src: continue
    out.append(f"\n## {SRC_LABEL.get(s, s)}\n")
    for x in sorted(by_src[s], key=lambda x: (PRI.index(x['priority']), x['id'])): out.append(md_issue(x))
open(os.path.join(ROOT, '03-issues-catalog.md'), 'w', encoding='utf-8').write('\n'.join(out))

# 04 visual
vis = [x for x in issues if x['category'] in ('ui',) or (x['screens'] and x['category'] == 'ux')]
out = [hdr('04 · Визуальный отчёт'), 'Проблемы интерфейса со скриншотами. Полные описания — в [каталоге](03-issues-catalog.md).\n',
       'Скриншоты сделаны в Chrome через Playwright на `prototype-v20.html` (тот же файл, что на feture-mvp.vercel.app). Кнопка «V20» в левом нижнем углу — инструмент прототипа, не продукт.\n']
vs = collections.defaultdict(list)
for x in vis: vs[x['section']].append(x)
for sec in sorted(vs, key=lambda s: s.lower()):
    out.append(f"\n## {sec}\n")
    for x in sorted(vs[sec], key=lambda x: (PRI.index(x['priority']), x['id'])):
        out.append(f"### {x['id']} · {x['priority']} — {x['title']}\n\n{x.get('actual','')}\n\n**Исправление:** {x.get('fix','')}\n")
        for s in x['screens']: out.append(f"![{x['id']}]({webp(s)})\n")
open(os.path.join(ROOT, '04-visual-report.md'), 'w', encoding='utf-8').write('\n'.join(out))

# 05 popups & states
pop_issues = [x for x in issues if re.search(r'попап|лист|sheet|меню|диалог|окно|поповер|подтвержд|состояни|тост|пуст', (x.get('component','') + ' ' + x.get('state','')).lower())]
st_cov = [c for c in coverage if c.get('type') in ('state', 'scenario')]
out = [hdr('05 · Аудит попапов и состояний'),
       f"Реестр собран двумя способами: краулер нажимал каждый элемент на каждом экране для 4 персон и для каждого найденного листа/диалога/меню нажимал все его кнопки; агенты-аудиторы открывали попапы вручную и проверяли появление, вид, взаимодействие и логику. Найдено **{len(popups)}** уникальных попапов, меню и диалогов.\n",
       '## Реестр попапов, меню и диалогов\n', '| Попап | Тип | Где | Чем открывается | Кнопок | Персоны | Проверка | Проблемы |', '|---|---|---|---|---|---|---|---|']
for p in popups:
    out.append(f"| {p['name']} | {p['kind']} | {', '.join(p['from'] or [])} | {'; '.join(p['via'] or [])} | {p['controls'] if p['controls'] is not None else ''} | {', '.join(p['personas'] or [])} | {p.get('statusLabel') or p['status']} | {', '.join(p['issues'])} |")
out.append('\n## Проблемы попапов, меню, диалогов и состояний\n')
for x in sorted(pop_issues, key=lambda x: (PRI.index(x['priority']), x['id'])): out.append(md_issue(x))
if st_cov:
    out.append('\n## Проверенные состояния и цепочки действий\n')
    out.append('| ID | Состояние / сценарий | Персоны | Статус | Заметки | Проблемы |\n|---|---|---|---|---|---|')
    for c in st_cov: out.append(f"| {c.get('id','')} | {c.get('name','')} | {', '.join(c.get('personas') or [])} | {c['status']} | {str(c.get('notes','')).replace('|','/')} | {', '.join(c['issues'])} |")
open(os.path.join(ROOT, '05-popups-and-states.md'), 'w', encoding='utf-8').write('\n'.join(out))

# 02 coverage
sc = collections.Counter(c['status'] for c in coverage)
out = [hdr('02 · Карта покрытия'), plan.get('coverage_intro', ''), '',
       f"Ручная проверка агентами: {len(coverage)} пунктов (" + ', '.join(f"{k}: {v}" for k, v in sc.items()) + ').',
       f"Автопроход по QA-списку: {len(inv_cov)} экранов × до 4 персон (full, pair-me, pair-couple, new).", '']
for t in ['screen', 'popup', 'state', 'scenario', 'control']:
    items = [c for c in coverage if c.get('type') == t]
    if not items: continue
    out.append(f"\n## {({'screen':'Экраны','popup':'Попапы','state':'Состояния','scenario':'Сценарии','control':'Элементы управления'})[t]} ({len(items)})\n")
    out.append('| ID | Название | Как открыть | Персоны | Статус | Заметки | Проблемы | Аудитор |\n|---|---|---|---|---|---|---|---|')
    for c in sorted(items, key=lambda c: str(c.get('id'))):
        out.append(f"| {c.get('id','')} | {c.get('name','')} | {str(c.get('opened_by','')).replace('|','/')} | {', '.join(c.get('personas') or [])} | {c['status']} | {str(c.get('notes','')).replace('|','/')} | {', '.join(c['issues'])} | {c['source']} |")
out.append('\n## Автопроход (все экраны QA-панели)\n')
out.append('| Экран | Параметры | Название | Персоны |\n|---|---|---|---|')
for k, v in inv_cov.items(): out.append(f"| {v['id']} | {k[len(v['id']):]} | {v['name']} | {', '.join(v['personas'])} |")
if plan.get('coverage_gaps'):
    out.append('\n## Что не проверено или проверено частично\n'); out += [f"- {g}" for g in plan['coverage_gaps']]
open(os.path.join(ROOT, '02-coverage-map.md'), 'w', encoding='utf-8').write('\n'.join(out))

# 06 plan
out = [hdr('06 · План исправлений'), plan.get('intro', ''), '']
for i, ph in enumerate(plan['phases']):
    xs = [x for x in issues if x['phase_n'] == i]
    out.append(f"\n## {ph['title']}\n\n{ph.get('text','')}\n")
    if ph.get('depends'): out.append(f"**Зависит от:** {ph['depends']}\n")
    out.append('| # | ID | Приоритет | Тип | Раздел | Проблема |\n|---|---|---|---|---|---|')
    for x in xs: out.append(f"| {x['order']} | {x['id']} | {x['priority']} | {CAT[x['category']]} | {x['section']} | {x['title']} |")
open(os.path.join(ROOT, '06-fix-plan.md'), 'w', encoding='utf-8').write('\n'.join(out))

# ---------- overview (hand-written md) -> html ----------
def md2html(md):
    h = []; lst = None
    def inline(t):
        t = html.escape(t)
        t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t); t = re.sub(r'`(.+?)`', r'<code class="mono">\1</code>', t)
        t = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', lambda m: f'<a href="{m.group(2)}" data-jump="{m.group(2)[1:]}">{m.group(1)}</a>' if m.group(2).startswith('#') else f'<a href="{m.group(2)}">{m.group(1)}</a>', t)
        return t
    for line in md.splitlines():
        if re.match(r'^\s*[-*] ', line):
            if lst != 'ul':
                if lst: h.append(f'</{lst}>')
                h.append('<ul>'); lst = 'ul'
            h.append('<li>' + inline(re.sub(r'^\s*[-*] ', '', line)) + '</li>'); continue
        if re.match(r'^\s*\d+\. ', line):
            if lst != 'ol':
                if lst: h.append(f'</{lst}>')
                h.append('<ol>'); lst = 'ol'
            h.append('<li>' + inline(re.sub(r'^\s*\d+\. ', '', line)) + '</li>'); continue
        if lst: h.append(f'</{lst}>'); lst = None
        if line.startswith('### '): h.append('<h3>' + inline(line[4:]) + '</h3>')
        elif line.startswith('## '): h.append('<h2>' + inline(line[3:]) + '</h2>')
        elif line.startswith('# '): continue
        elif line.startswith('|'): continue
        elif line.strip(): h.append('<p>' + inline(line) + '</p>')
    if lst: h.append(f'</{lst}>')
    return '\n'.join(h)
ov_md = open(os.path.join(T, 'overview.md'), encoding='utf-8').read() if os.path.exists(os.path.join(T, 'overview.md')) else '# Обзор\n\n(будет дописан)'
ov_md = ov_md.replace('{{SUMMARY_TABLE}}', summary_tbl).replace('{{TOTAL}}', str(len(issues)))
open(os.path.join(ROOT, '01-overview.md'), 'w', encoding='utf-8').write(hdr('01 · Обзор качества') + re.sub(r'^# .*\n', '', ov_md))

# ---------- html ----------
rep_issues = [{**x, 'screens': [re.sub(r'\.png$', '.webp', s, flags=re.I) for s in x['screens']]} for x in issues]
rep_pop = [{**p, 'shot': None} for p in popups]
data = {'meta': {'lead': plan.get('lead', ''), 'shotBase': 'img/', 'coverageCount': len(inv_cov) + len([c for c in coverage if c.get('type') in ('screen', 'popup')]),
                 'popupLead': f"{len(popups)} уникальных листов, меню и диалогов. Краулер открыл каждый и нажал все кнопки; агенты проверили их вручную.",
                 'coverageLead': plan.get('coverage_intro', '')},
        'issues': rep_issues, 'plan': [{'title': ph['title'], 'text': ph.get('text', ''), 'ids': [x['id'] for x in issues if x['phase_n'] == i]} for i, ph in enumerate(plan['phases'])],
        'popups': rep_pop, 'coverage': [c for c in all_cov], 'overviewHTML': md2html(ov_md.replace(summary_tbl, ''))}
tpl = open(os.path.join(T, 'report-template.html'), encoding='utf-8').read()
js = json.dumps(data, ensure_ascii=False).replace('</', '<\\/')
open(os.path.join(ROOT, 'report.html'), 'w', encoding='utf-8').write(tpl.replace('/*__DATA__*/', js))
print('issues', len(issues), dict(cnt), 'coverage', len(coverage), 'auto', len(inv_cov), 'popups', len(popups), 'shots', len(shots))
