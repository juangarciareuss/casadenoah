"""Arma maqueta.html: la página completa en un solo archivo, con reservas simuladas y fotos
incrustadas, para mostrar el sistema con un enlace (sin instalar nada).
Uso: python3 herramientas/maqueta.py [salida.html] [--en-blanco]
--en-blanco: versión web vacía, sin reservas de ejemplo, para empezar a llenarla."""
import base64, io, re, sys, pathlib
from PIL import Image

raiz = pathlib.Path(__file__).resolve().parent.parent
args = [a for a in sys.argv[1:] if not a.startswith('--')]
en_blanco = '--en-blanco' in sys.argv
salida = pathlib.Path(args[0]) if args else raiz / 'maqueta.html'
fotos = {'Cabaña': 'cabana', 'Roble': 'roble', 'Raulí': 'rauli', 'Arrayán': 'arrayan', 'Lingue': 'lingue', 'Ciprés': 'cipres'}

def data_uri(nombre):
    im = Image.open(raiz / 'img' / f'{nombre}.jpg').convert('RGB').resize((480, 360), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'JPEG', quality=70, optimize=True, progressive=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()

html = (raiz / 'index.html').read_text(encoding='utf-8')
cuerpo = re.search(r'<body>(.*?)<script src=', html, re.S).group(1)
css = (raiz / 'style.css').read_text(encoding='utf-8')
engine = (raiz / 'js' / 'engine.js').read_text(encoding='utf-8')
app = (raiz / 'js' / 'app.js').read_text(encoding='utf-8')
fotos_js = '{' + ','.join(f'"{k}":"{data_uri(v)}"' for k, v in fotos.items()) + '}'

pre = f'''window.MAQUETA = true;
window.EN_BLANCO = {'true' if en_blanco else 'false'};
window.FOTOS_CASA = {fotos_js};
// En la maqueta el navegador no muestra ventanas de alerta: por si alguna queda, se ve como aviso abajo.
window.alert = function (msg) {{
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 4000);
}};
window.confirm = function () {{ return true; }};
'''

titulo = 'Casa de Noah' if en_blanco else 'Casa de Noah · Maqueta'
out = f'''<title>{titulo}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Young+Serif&display=swap">
<style>
{css}
</style>
{cuerpo}
<script>
{pre}
</script>
<script>
{engine}
</script>
<script>
{app}
</script>
'''
salida.write_text(out, encoding='utf-8')
print(salida, round(len(out) / 1024), 'KB')
