#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Проверка index.html одной командой:  python3 check.py

Ошибки в этом проекте тихие: HTML не падает, браузер не ругается, приложение просто
рисует не то или не запускается вовсе. Здесь собрано ровно то, что ловится
механически и что уже ломалось на практике.

Сборки у проекта нет и зависимостей тоже — скрипту нужен только python3.
Для проверки синтаксиса скрипта дополнительно вызывается node, если он есть.

Код возврата: 0 — чисто, 1 — есть ошибки. Предупреждения код возврата не меняют:
это кандидаты на уборку, а не поломки.
"""

import html.parser
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'index.html')

ERRORS = []
WARNINGS = []


def err(section, msg):
    ERRORS.append((section, msg))


def warn(section, msg):
    WARNINGS.append((section, msg))


# ---------------------------------------------------------------- исходники
def load():
    with open(SRC, encoding='utf-8') as f:
        s = f.read()
    scripts = re.findall(r'<script>(.*?)</script>', s, re.S)
    styles = re.findall(r'<style>(.*?)</style>', s, re.S)

    # Раньше production index.html содержал JS/CSS inline. После разбиения исходников
    # сборка подключает ES-модули и style.css отдельными файлами; проверка не должна
    # объявлять весь проект пустым только из-за смены способа подключения ресурсов.
    if not scripts:
        # продуктовый runtime — ES-модули src/app/*.js (точка входа src/app/index.js)
        app_dir = os.path.join(ROOT, 'src', 'app')
        for name in sorted(os.listdir(app_dir)):
            if name.endswith('.js'):
                with open(os.path.join(app_dir, name), encoding='utf-8') as f:
                    scripts.append(f.read())
        # mobile.js тоже вешает классы (native-app на <html>)
        with open(os.path.join(ROOT, 'mobile.js'), encoding='utf-8') as f:
            scripts.append(f.read())
    if not styles:
        style_css = os.path.join(ROOT, 'style.css')
        if os.path.exists(style_css):
            with open(style_css, encoding='utf-8') as f:
                styles = [f.read()]

    # разметка = файл без inline-скриптов и стилей: иначе строки внутри кода
    # попадают в проверку тегов и всё ломается
    markup = re.sub(r'<script>.*?</script>', '', s, flags=re.S)
    markup = re.sub(r'<style>.*?</style>', '', markup, flags=re.S)
    return s, '\n'.join(scripts), '\n'.join(styles), markup


VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
        'link', 'meta', 'param', 'source', 'track', 'wbr'}


class TagCheck(html.parser.HTMLParser):
    """Баланс тегов. Ровно на этом однажды снесло закрывающие теги карточки
    аккаунта, и следующий экран схлопнулся в нулевую высоту — молча."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.bad = []

    def handle_starttag(self, tag, attrs):
        if tag not in VOID:
            self.stack.append((tag, self.getpos()[0]))

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack:
            self.bad.append('строка %d: лишний </%s>' % (self.getpos()[0], tag))
            return
        if self.stack[-1][0] != tag:
            open_tag, open_line = self.stack[-1]
            self.bad.append('строка %d: закрыли </%s>, а открыт <%s> со строки %d'
                            % (self.getpos()[0], tag, open_tag, open_line))
        else:
            self.stack.pop()


def check_tags(markup):
    p = TagCheck()
    p.feed(markup)
    for b in p.bad:
        err('разметка', b)
    for tag, line in p.stack:
        err('разметка', 'не закрыт <%s>, открыт на строке %d' % (tag, line))


def check_js_syntax(js):
    try:
        subprocess.run(['node', '--version'], capture_output=True, check=True)
    except Exception:
        warn('скрипт', 'node не найден — синтаксис не проверен')
        return
    fd, path = tempfile.mkstemp(suffix='.js')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(js)
        r = subprocess.run(['node', '--check', path], capture_output=True, text=True)
        if r.returncode != 0:
            tail = (r.stderr or '').strip().splitlines()
            err('скрипт', 'синтаксическая ошибка: ' + (tail[0] if tail else 'см. node --check'))
    finally:
        os.unlink(path)


# ------------------------------------------------------- имена элементов (id)
def strip_js_comments(js):
    """Убирает блочные комментарии и строки-комментарии целиком.

    Нужно, потому что в комментариях встречаются примеры кода вида $('btnX'), и
    проверка объявляла такое имя отсутствующим в разметке — то есть ругалась на
    объяснение, а не на код. Строчные комментарии убираем только целиком
    (строка начинается с //): хвостовой // после кода трогать опасно — он же
    встречается внутри адресов 'https://...'.
    """
    js = re.sub(r'/\*.*?\*/', '', js, flags=re.S)
    js = re.sub(r'(?m)^\s*//.*$', '', js)
    return js


def check_ids(whole, js, css, markup):
    js = strip_js_comments(js)
    in_markup = {}
    for m in re.finditer(r'\sid="([^"]+)"', markup):
        in_markup.setdefault(m.group(1), markup[:m.start()].count('\n') + 1)

    # Имена, к которым обращается код. Хвост (?!\s*\+) обязателен: $('legalHead' + key)
    # собирает имя из кусков, и «legalHead» сам по себе элементом не является —
    # без этого проверка ругалась бы на живой код.
    used = set(re.findall(r"\$\(\s*'([A-Za-z_][\w-]*)'\s*\)", js))
    used |= set(re.findall(r"getElementById\(\s*'([A-Za-z_][\w-]*)'\s*\)", js))
    used |= set(re.findall(r"setShown\(\s*'([A-Za-z_][\w-]*)'\s*,", js))
    used |= set(re.findall(r"#([A-Za-z_][\w-]*)", css))
    used |= set(re.findall(r"querySelector(?:All)?\(\s*'#([A-Za-z_][\w-]*)", js))

    # Некоторые блоки настроек клонируются в модалки, а их новые id задаются
    # объектом mapping в cloneSettingsBlock(..., {...}). Эти элементы отсутствуют
    # в исходной HTML-разметке намеренно и появляются только во время выполнения.
    dynamic_ids = set()
    for block in re.findall(r"cloneSettingsBlock\([^;]+?\{(.*?)\}\s*\)", js, re.S):
        dynamic_ids |= set(re.findall(r":\s*'([A-Za-z_][\w-]*)'", block))

    # обращение к несуществующему элементу роняет запуск приложения целиком:
    # $('btnX').onclick = ... по пустоте — «Cannot set properties of null»
    for name in sorted(used):
        if name not in in_markup and ('#' + name) not in css:
            if name in dynamic_ids:
                continue
            if re.search(r"createElement|\.id\s*=\s*'%s'" % re.escape(name), js) and \
               ("'" + name + "'") in js:
                # элемент может создаваться из кода — проверяем явно
                if re.search(r"\.id\s*=\s*'%s'" % re.escape(name), js):
                    continue
            err('имена', 'код обращается к «%s», но такого id в разметке нет' % name)

    # имена могут собираться склейкой с обеих сторон:
    #   $(p + 'SoundOn')                       — хвост литералом
    #   $('legalHead' + key[0].toUpperCase())  — начало литералом, хвост вычисляется
    suffixes = set(re.findall(r"\+\s*'([A-Za-z_][\w-]{2,})'", js))
    prefixes = set(re.findall(r"'([A-Za-z_][\w-]{2,})'\s*\+", js))
    all_literals = set(re.findall(r"'([A-Za-z_][\w-]*)'", js))

    dead = []
    for name, line in sorted(in_markup.items()):
        if '$' in name or '{' in name:
            continue  # id собирается шаблоном при отрисовке
        if name in used or name in all_literals:
            continue
        if any(name.endswith(sfx) for sfx in suffixes):
            continue
        if any(name.startswith(pre) and name != pre for pre in prefixes):
            continue
        dead.append((name, line))
    for name, line in dead:
        warn('имена', 'id «%s» (строка %d) нигде не используется' % (name, line))


# ----------------------------------------------------------------- иконки
def check_icons(whole, js, markup):
    m = re.search(r'const ICONS\s*=\s*\{(.*?)\n\};', js, re.S)
    if not m:
        err('иконки', 'не нашёл объект ICONS')
        return
    body = m.group(1)
    declared = set(re.findall(r"^\s{2}([A-Za-z_][\w]*)\s*:", body, re.M))
    if not declared:
        err('иконки', 'ICONS найден, но ни одного имени не разобрано')
        return

    used = set(re.findall(r"icon\(\s*'([A-Za-z_][\w-]*)'", whole))
    used |= set(re.findall(r'data-icon="([A-Za-z_][\w-]*)"', whole))
    # имя иконки часто лежит в данных: BADGES, каталог мышц, карточки «Сегодня»
    used |= set(re.findall(r"\bico\s*:\s*'([A-Za-z_][\w-]*)'", whole))
    # ...и выбирается тернарником прямо в вызове: icon(anyAudio ? 'vol' : 'volX')
    used |= set(re.findall(r"icon\(\s*[^)]*?\?\s*'([A-Za-z_][\w-]*)'\s*:\s*'([A-Za-z_][\w-]*)'", whole)
                and [x for pair in re.findall(r"icon\(\s*[^)]*?\?\s*'([A-Za-z_][\w-]*)'\s*:\s*'([A-Za-z_][\w-]*)'", whole) for x in pair] or [])

    for name in sorted(used - declared):
        err('иконки', 'используется иконка «%s», которой нет в ICONS' % name)
    for name in sorted(declared - used):
        warn('иконки', 'иконка «%s» объявлена в ICONS, но нигде не рисуется' % name)


# ------------------------------------------------------- ключи хранилища
def check_storage(js):
    """Требование 152-ФЗ и сторов: «удалённый» аккаунт не должен воскресать
    частично. Ключ, которого нет в PROFILE_KEYS или GLOBAL_KEYS, переживёт
    wipeAccount() и останется на телефоне."""
    lists = {}
    for name in ('PROFILE_KEYS', 'GLOBAL_KEYS'):
        m = re.search(r'const %s\s*=\s*\[(.*?)\]' % name, js, re.S)
        if not m:
            err('хранилище', 'не нашёл список %s' % name)
            return
        lists[name] = set(re.findall(r"'([^']+)'", m.group(1)))
    known = lists['PROFILE_KEYS'] | lists['GLOBAL_KEYS']

    found = set()
    # прямые обращения; хвост _ / _f / _m — те же ключи с суффиксом профиля
    for k in re.findall(r"kv(?:Get|Set|Del)\(\s*'([A-Za-z_][\w-]*)'", js):
        found.add(re.sub(r'_(?:[fm])?$', '', k))
    # ключи профиля идут через pk()
    for k in re.findall(r"pk\(\s*'([A-Za-z_][\w-]*)'", js):
        found.add(k)

    for k in sorted(found - known):
        err('хранилище', 'ключ «%s» не перечислен ни в PROFILE_KEYS, ни в GLOBAL_KEYS — '
                         'после удаления аккаунта он останется на телефоне' % k)
    # Обратную сторону не проверяем: ключ, оставленный в списках удаления после
    # того, как перестал писаться, — не ошибка, а забота о старых установках.


# ------------------------------------------------------------------ экраны
def check_screens(js, markup):
    m = re.search(r"const screens\s*=\s*\[(.*?)\];", js, re.S)
    if not m:
        err('экраны', 'не нашёл массив screens')
        return
    listed = set(re.findall(r"'([^']+)'", m.group(1)))
    in_markup = set(re.findall(r'<section class="screen[^"]*" id="([^"]+)"', markup))

    for name in sorted(listed - in_markup):
        err('экраны', 'в массиве screens есть «%s», а секции с таким id нет' % name)
    for name in sorted(in_markup - listed):
        err('экраны', 'секция «%s» есть в разметке, но не перечислена в screens — '
                      'показать её через show() не получится' % name)
    for name in sorted(set(re.findall(r"show\(\s*'([A-Za-z_][\w-]*)'", js))):
        if name.startswith('scr') and name not in listed:
            err('экраны', 'show(«%s») — такого экрана в screens нет' % name)


# -------------------------------------------------------------- оформление
def check_css_structure(css):
    """Осколок правила без селектора съедает СЛЕДУЮЩЕЕ правило целиком.

    Стоит после правки остаться болтающимся объявлению и лишней скобке — браузер
    не останавливается: он ищет `{` дальше по тексту, и заголовок следующего
    правила вместе с телом становится телом мусорного. Внешне это выглядит как
    «стиль просто не применился», и искать причину приходится там, где её нет,
    — именно так у кнопки автора программы не снимался серый системный фон.

    Ловим по преамбуле: то, что стоит ПЕРЕД `{` на верхнем уровне, — это селектор,
    и ни `;`, ни `}` в нём быть не может.
    """
    clean = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    clean = re.sub(r'url\([^)]*\)', 'url()', clean)
    depth, start, seen = 0, 0, 0
    for i, ch in enumerate(clean):
        if ch == '{':
            if depth == 0:
                # Преамбула — это селектор. Точке с запятой в нём взяться неоткуда:
                # значит, выше осталось объявление, у которого нет своего правила.
                pre = clean[start:i]
                if ';' in pre:
                    err('оформление', 'объявление без селектора перед «%s{…»'
                        % ' '.join(pre.split())[-50:])
            depth += 1
        elif ch == '}':
            if depth == 0:
                # Лишняя закрывающая скобка. Отдельная проверка, а не «}» в
                # преамбуле: сама по себе она преамбулу и обнуляет, и без неё
                # осколок проходил бы незамеченным.
                near = ' '.join(clean[max(0, i - 60):i].split())[-50:]
                err('оформление', 'лишняя «}» в стилях после «%s»' % near)
                start = i + 1
                continue
            depth -= 1
            if depth == 0:
                start = i + 1
                seen += 1
    if depth:
        err('оформление', 'в стилях не закрыто %d фигурных скобок' % depth)
    if not seen:
        err('оформление', 'в стилях не нашлось ни одного правила — разбор сломан')


def check_css(css, markup, js):
    declared = set()
    # Вырезаем комментарии И содержимое url(...): внутри лежат svg-данные с адресом
    # www.w3.org, и «.org» с «.w3» попадали в список классов как мёртвые.
    clean_css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    clean_css = re.sub(r'url\([^)]*\)', 'url()', clean_css)
    for m in re.finditer(r'\.([a-zA-Z][\w-]*)', clean_css):
        declared.add(m.group(1))
    # Класс считается живым, если слово встречается где угодно: в разметке, в
    # шаблонной строке, в classList.toggle или просто отдельным литералом. Более
    # строгая проверка даёт десятки ложных срабатываний (составные селекторы вроде
    # .ex-row.warm, классы из тернарников, `class="badge${...}"`), а проверка, на
    # которую ругаются зря, перестаёт работать вообще.
    used = set()
    for m in re.finditer(r'class="([^"]*)"', markup):
        used |= set(m.group(1).split())
    cleaned = re.sub(r'\$\{[^}]*\}', ' ', js)
    for m in re.finditer(r'class(?:Name)?\s*=\s*[\'"`]([^\'"`]*)', cleaned):
        used |= set(m.group(1).split())
    for m in re.finditer(r'class="([^"]*)"', cleaned):
        used |= set(m.group(1).split())
    for lit in re.findall(r"'([^'\n]{0,80})'", js) + re.findall(r'"([^"\n]{0,80})"', js):
        used |= set(lit.split())
    for name in sorted(declared - used):
        warn('оформление', 'класс «.%s» описан, но в разметке не встречается' % name)


# Бесплатный план Vercel: не больше двенадцати функций на деплой. Тринадцатая
# роняет СБОРКУ целиком — не эндпоинт, а весь выкат, — и узнаётся это только из
# журнала Vercel, уже после того как человек не увидел своих изменений. Запас в
# две штуки оставлен нарочно: упереться в предел ровно на границе значит узнать
# о нём в момент, когда добавляешь нужное.
API_LIMIT = 12
API_WARN = 10


def check_api():
    root = os.path.join(os.path.dirname(os.path.abspath(SRC)), 'api')
    if not os.path.isdir(root):
        return
    funcs = []
    for base, dirs, files in os.walk(root):
        for name in files:
            if name.endswith('.js'):
                funcs.append(os.path.relpath(os.path.join(base, name), root))
    n = len(funcs)
    if n > API_LIMIT:
        err('сервер', 'функций в api/ — %d, а Vercel на бесплатном плане собирает '
                      'не больше %d: сборка упадёт целиком' % (n, API_LIMIT))
    elif n >= API_WARN:
        warn('сервер', 'функций в api/ — %d из %d; дальше сборка упадёт' % (n, API_LIMIT))
    # Вспомогательным файлам в api/ не место: Vercel считает функцией каждый .js,
    # и один общий модуль съедает место наравне с настоящим эндпоинтом.
    for f in funcs:
        if os.path.basename(f).startswith('_'):
            err('сервер', 'вспомогательный файл api/%s занимает место функции — '
                          'такому место в lib/' % f)


def main():
    if not os.path.exists(SRC):
        print('не нашёл index.html рядом со скриптом')
        return 2
    whole, js, css, markup = load()

    check_tags(markup)
    check_js_syntax(js)
    check_ids(whole, js, css, markup)
    # JS давно лежит отдельно от index.html: иконки ищем и в разметке, и в коде
    check_icons(whole + '\n' + js, js, markup)
    check_storage(js)
    check_screens(js, markup)
    check_api()
    check_css_structure(css)
    check_css(css, markup, js)

    width = 64
    if ERRORS:
        print('\nОШИБКИ (%d)' % len(ERRORS))
        print('-' * width)
        for sec, msg in ERRORS:
            print('  [%s] %s' % (sec, msg))
    if WARNINGS:
        print('\nПРЕДУПРЕЖДЕНИЯ (%d) — кандидаты на уборку, не поломки' % len(WARNINGS))
        print('-' * width)
        for sec, msg in WARNINGS:
            print('  [%s] %s' % (sec, msg))
    if not ERRORS and not WARNINGS:
        print('чисто')
    elif not ERRORS:
        print('\nОшибок нет.')
    return 1 if ERRORS else 0


if __name__ == '__main__':
    sys.exit(main())
