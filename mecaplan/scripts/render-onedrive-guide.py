"""Render the small trusted Markdown guide using only Python's standard library."""
from pathlib import Path
from html import escape
import re

root = Path(__file__).resolve().parent.parent
def inline(text):
    text = escape(text)
    text = re.sub(r'\[([^]]+)\]\((https?://[^)]+)\)', r'<a href="\2" target="_blank" rel="noreferrer">\1</a>', text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    return re.sub(r'`([^`]+)`', r'<code>\1</code>', text)

body, paragraph, code = [], [], None
def flush():
    if paragraph:
        body.append('<p>' + inline(' '.join(paragraph)) + '</p>')
        paragraph.clear()

for line in (root / 'docs/ONEDRIVE.md').read_text(encoding='utf-8').splitlines():
    if line.startswith('```'):
        flush()
        if code is None: code = []
        else:
            body.append('<pre><code>' + escape('\n'.join(code)) + '</code></pre>')
            code = None
    elif code is not None: code.append(line)
    elif line.startswith('# '):
        flush(); body.append('<h1>' + inline(line[2:]) + '</h1>')
    elif line.startswith('## '):
        flush(); body.append('<h2>' + inline(line[3:]) + '</h2>')
    elif line.startswith('- '):
        flush(); body.append('<p class="point">• ' + inline(line[2:]) + '</p>')
    elif not line.strip(): flush()
    else: paragraph.append(line)
flush()
style = '''body{margin:0;background:#f6f7fb;color:#17233d;font:16px/1.75 system-ui,sans-serif}main{max-width:850px;margin:45px auto;padding:40px;background:white;border-radius:24px;box-shadow:0 15px 45px #05065c0a}a{color:#0f49b6}h1,h2{color:#05065c;line-height:1.3}h1{font-size:34px}h2{margin-top:40px;font-size:23px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f0f4fc;padding:20px;border-radius:12px;font-size:13px}code{font-size:.9em}nav{display:flex;justify-content:space-between;gap:15px;font-weight:650;color:#0f49b6}.point{padding-left:12px}.eyebrow{color:#03aed2;font-weight:700;letter-spacing:2px;font-size:12px}@media(max-width:650px){main{margin:12px;padding:22px}h1{font-size:27px}}'''
html = '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Conectar OneDrive · MecaPlan</title><style>' + style + '</style><main><nav><span>MecaPlan · UNITEC</span><a href="/">Volver al proyecto</a></nav><p class="eyebrow">GUÍA DE CONFIGURACIÓN LOCAL</p>' + '\n'.join(body) + '</main></html>'
(root / 'public/guia-onedrive.html').write_text(html, encoding='utf-8')
print('Guía OneDrive generada sin datos privados.')
