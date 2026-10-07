"""
ZoZo — monta a pasta api/public (interface publicada no Cloudflare)

    python api/montar_interface.py

Copia a pasta ui, remove o modo de demonstração (mock), junta os scripts e
as folhas de estilo em um arquivo de cada (com impressão digital no nome) e
cria o arquivo _headers com os cabeçalhos de segurança e de cache que o
Cloudflare envia junto com cada arquivo. Depois: dentro de api, `uv run pywrangler deploy`.
"""
import hashlib
import pathlib
import re
import shutil

AQUI = pathlib.Path(__file__).resolve().parent
UI = AQUI.parent / "ui"
PUBLICO = AQUI / "public"

# challenges.cloudflare.com: CAPTCHA Turnstile (script + iframe), carregado só quando é exigido
CSP = ("default-src 'none'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; img-src 'self' data:; "
       "font-src 'self'; connect-src 'self'; frame-src https://challenges.cloudflare.com; object-src 'none'; "
       "base-uri 'none'; form-action 'none'; frame-ancestors 'none'")

CABECALHOS_UI = {
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
}


def montar():
    if PUBLICO.exists():
        if PUBLICO.parent != AQUI or PUBLICO.name != "public":     # trava contra apagar a pasta errada
            raise SystemExit("caminho inesperado")
        shutil.rmtree(PUBLICO)
    shutil.copytree(UI, PUBLICO, ignore=shutil.ignore_patterns("mock", "*.map", ".DS_Store", "Thumbs.db"))

    index = PUBLICO / "index.html"
    html = index.read_text(encoding="utf-8")
    html, n = re.subn(r'\s*<!-- MOCK.*?-->\s*<script src="mock/credenciais\.local\.js"></script>\s*'
                      r'<script src="mock/mock-data\.js"></script>\s*<script src="mock/mock-host\.js"></script>',
                      "", html, flags=re.S)
    if n != 1 or "mock/" in html:
        raise SystemExit("index.html: não encontrei o bloco do modo de demonstração")
    html = empacotar(html)
    index.write_text(html, encoding="utf-8")

    linhas = ["/*"] + [f"  {k}: {v}" for k, v in CABECALHOS_UI.items()]
    # Cache: pacotes com impressão digital no nome nunca mudam (1 ano); a página sempre revalida
    linhas += ["/js/*", "  Cache-Control: public, max-age=31536000, immutable",
               "/css/*", "  Cache-Control: public, max-age=31536000, immutable",
               "/assets/*", "  Cache-Control: public, max-age=604800",
               "/", "  Cache-Control: no-cache",
               "/index.html", "  Cache-Control: no-cache"]
    (PUBLICO / "_headers").write_text("\n".join(linhas) + "\n", encoding="utf-8")
    print(f"Pronto: {PUBLICO} montada.")


def _marca(texto):
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()[:10]


def empacotar(html):
    """
    Junta os ~40 scripts e as 7 folhas de estilo em 1 + 1 arquivo (menos idas ao servidor),
    com impressão digital do conteúdo no nome (cache longo; nova versão = novo nome).
    A ordem é a mesma do index.html. Os arquivos soltos saem da pasta publicada.
    """
    scripts = re.findall(r'<script src="(js/[^"]+)"></script>', html)
    estilos = re.findall(r'<link rel="stylesheet" href="(css/[^"]+)">', html)
    if not scripts or not estilos:
        raise SystemExit("index.html: scripts/estilos não encontrados")
    js = "\n;\n".join((PUBLICO / s).read_text(encoding="utf-8") for s in scripts)
    css = "\n".join((PUBLICO / e).read_text(encoding="utf-8") for e in estilos)
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)                  # comentários de CSS
    css = re.sub(r"\n\s*\n+", "\n", css)
    nome_js, nome_css = f"js/app.{_marca(js)}.js", f"css/app.{_marca(css)}.css"
    for pasta in ("js", "css"):
        shutil.rmtree(PUBLICO / pasta)
        (PUBLICO / pasta).mkdir()
    (PUBLICO / nome_js).write_text(js, encoding="utf-8")
    (PUBLICO / nome_css).write_text(css, encoding="utf-8")

    # Várias tags viram uma só (no lugar da primeira); comentários do HTML saem
    html = re.sub(r"[ \t]*<!--.*?-->[ \t]*\n?", "", html, flags=re.S)
    html = re.sub(r'[ \t]*<script src="js/[^"]+"></script>\n?', "", html, count=len(scripts) - 1)
    html = re.sub(r'<script src="js/[^"]+"></script>', f'<script src="{nome_js}"></script>', html)
    primeira = f'<link rel="stylesheet" href="{estilos[0]}">'
    html = re.sub(r'[ \t]*<link rel="stylesheet" href="css/[^"]+">\n?',
                  lambda m: m.group(0) if primeira in m.group(0) else "", html)
    html = html.replace(primeira,
                        '<link rel="preload" href="assets/fonts/Matter-Regular.woff" as="font" type="font/woff" crossorigin>\n'
                        '  <link rel="preload" href="assets/fonts/Matter-Medium.woff" as="font" type="font/woff" crossorigin>\n'
                        f'  <link rel="stylesheet" href="{nome_css}">')
    html = re.sub(r"\n[ \t]*\n(?:[ \t]*\n)+", "\n\n", html)          # linhas em branco que sobraram
    if html.count("<script src=") != 1 or html.count('rel="stylesheet"') != 1:
        raise SystemExit("index.html: falha ao empacotar")
    return html


if __name__ == "__main__":
    montar()
