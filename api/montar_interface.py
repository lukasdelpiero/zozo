"""
ZoZo — monta a pasta api/public (interface publicada no Cloudflare)

    python api/montar_interface.py

Copia a pasta ui, remove o modo de demonstração (mock) e cria o arquivo
_headers com os cabeçalhos de segurança que o Cloudflare envia junto com
cada arquivo. Depois: dentro de api, `uv run pywrangler deploy`.
"""
import pathlib
import re
import shutil

AQUI = pathlib.Path(__file__).resolve().parent
UI = AQUI.parent / "ui"
PUBLICO = AQUI / "public"

CSP = ("default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; "
       "connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")

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
    html, n = re.subn(r'\s*<!-- MOCK.*?-->\s*<script src="mock/mock-data\.js"></script>\s*<script src="mock/mock-host\.js"></script>',
                      "", html, flags=re.S)
    if n != 1 or "mock/" in html:
        raise SystemExit("index.html: não encontrei o bloco do modo de demonstração")
    index.write_text(html, encoding="utf-8")

    linhas = ["/*"] + [f"  {k}: {v}" for k, v in CABECALHOS_UI.items()]
    (PUBLICO / "_headers").write_text("\n".join(linhas) + "\n", encoding="utf-8")
    print(f"Pronto: {PUBLICO} montada.")


if __name__ == "__main__":
    montar()
