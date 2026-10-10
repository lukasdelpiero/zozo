"""
ZoZo — servidor LOCAL de desenvolvimento (não é usado no Cloudflare)

    python api/dev/servidor_local.py            → http://127.0.0.1:8787

Serve a mesma API Python do Cloudflare, com um banco SQLite em
api/dev/zozo-local.db, e a interface JÁ MONTADA (api/public, gerada por
`npm run build`). Login de verdade (cadastre uma conta); o servidor só
aceita conexões do próprio computador (127.0.0.1).

Para mexer na interface com recarga instantânea: `npm run dev`
(http://127.0.0.1:5173) com este servidor ligado — o Vite repassa /api/* para cá.

Configuração local (variáveis de ambiente opcionais):
  ZOZO_DEV_PORTA        porta (padrão 8787)
  ZOZO_DEV_RECURSOS     e-mails com Perfis, boletos e Pix (separados por vírgula; a conta demo sempre tem)
  ZOZO_DEV_TURNSTILE=0  desliga o CAPTCHA (padrão: chaves de TESTE da Cloudflare, que sempre aprovam)
  ZOZO_DEV_GOOGLE_ID / ZOZO_DEV_GOOGLE_SECRET   ativa o "Continuar com Google" local
"""
import asyncio
import http.server
import mimetypes
import os
import pathlib
import secrets
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "src"))
sys.path.insert(0, str(AQUI))

import json  # noqa: E402

import nucleo  # noqa: E402
from banco_sqlite import BancoSqlite, conectar  # noqa: E402

# Interface montada pelo Vite (npm run build): exatamente o que vai para o Cloudflare
UI = (AQUI.parent / "public").resolve()
BANCO = AQUI / "zozo-local.db"
ARQ_SEGREDO = AQUI / ".segredo-local"            # gerado na 1ª execução (fora do git)
PORTA = int(os.environ.get("ZOZO_DEV_PORTA", "8787"))
# 5173: servidor do Vite (npm run dev), que repassa /api/* para cá mantendo o Host
HOSTS_LOCAIS = {f"{h}:{p}" for h in ("127.0.0.1", "localhost") for p in (PORTA, 5173)}

# Chaves de TESTE públicas da Cloudflare (sempre aprovam): https://developers.cloudflare.com/turnstile/troubleshooting/testing/
TURNSTILE_TESTE = ("1x00000000000000000000AA", "1x0000000000000000000000000000000AA")


def _segredo_local():
    if not ARQ_SEGREDO.exists():
        ARQ_SEGREDO.write_text(secrets.token_urlsafe(48), encoding="utf-8")
    return ARQ_SEGREDO.read_text(encoding="utf-8").strip()


CONFIG = {
    "SEGREDO": _segredo_local(),
    "RECURSOS_AVANCADOS": os.environ.get("ZOZO_DEV_RECURSOS", ""),
    "RECURSOS_CAMBIO": os.environ.get("ZOZO_DEV_RECURSOS_CAMBIO", ""),
    "COOKIE_SEGURO": "0",                         # http://127.0.0.1 não tem HTTPS
}
# "Continuar com Google" local: crie um cliente OAuth com o endereço http://127.0.0.1:8787/api/google/retorno
if os.environ.get("ZOZO_DEV_GOOGLE_ID") and os.environ.get("ZOZO_DEV_GOOGLE_SECRET"):
    CONFIG["GOOGLE_CLIENT_ID"], CONFIG["GOOGLE_CLIENT_SECRET"] = os.environ["ZOZO_DEV_GOOGLE_ID"], os.environ["ZOZO_DEV_GOOGLE_SECRET"]
if os.environ.get("ZOZO_DEV_TURNSTILE", "1") != "0":
    CONFIG["TURNSTILE_SITE_KEY"], CONFIG["TURNSTILE_SECRET"] = TURNSTILE_TESTE

# Mesmos cabeçalhos que o Cloudflare envia com a interface (fonte única: api/cabecalhos_ui.json)
_JSON = json.loads((AQUI.parent / "cabecalhos_ui.json").read_text(encoding="utf-8"))
CABECALHOS_UI = dict({k: v for k, v in _JSON.items() if not k.startswith("_")}, **{"Cache-Control": "no-store"})
TIPOS = {".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
         ".html": "text/html; charset=utf-8", ".woff": "font/woff", ".png": "image/png"}

_con = conectar(str(BANCO))
_trava = threading.Lock()


class Servicos:
    @staticmethod
    def _baixar(req):
        try:
            with urllib.request.urlopen(req, timeout=8) as r:      # noqa: S310 — URLs fixas da API
                return r.status, r.read(2_000_001).decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            return e.code, ""
        except (urllib.error.URLError, TimeoutError, OSError):
            return 0, ""

    async def http_get(self, url, cabecalhos):
        return await asyncio.to_thread(self._baixar, urllib.request.Request(url, headers=cabecalhos))

    async def http_post(self, url, campos):
        dados = urllib.parse.urlencode(campos).encode("utf-8")
        return await asyncio.to_thread(self._baixar, urllib.request.Request(url, data=dados, method="POST"))


class Manipulador(http.server.BaseHTTPRequestHandler):
    server_version = "ZoZo-dev"
    sys_version = ""

    def _host_local(self):
        """Só aceita Host local: impede que um site malicioso use DNS rebinding para falar com este servidor."""
        host = (self.headers.get("Host") or "").lower()
        return host in HOSTS_LOCAIS

    def _api(self):
        try:
            tamanho = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            tamanho = -1
        if tamanho < 0:
            return self._enviar(400, nucleo.CABECALHOS, b'{"erro":"INVALID_REQUEST"}')
        if tamanho > nucleo.LIMITE_CORPO:
            return self._enviar(413, nucleo.CABECALHOS, b'{"erro":"DOCUMENT_TOO_LARGE"}')
        corpo = self.rfile.read(tamanho).decode("utf-8", "replace") if tamanho else ""
        cab = {k: v for k, v in self.headers.items() if k.lower() != "cf-connecting-ip"}
        cab["CF-Connecting-IP"] = self.client_address[0]         # como o Cloudflare faz
        pedido = nucleo.Pedido(self.command, f"http://{self.headers.get('Host', '')}{self.path}", cab, corpo)
        with _trava:                                   # uma conexão SQLite: um pedido por vez
            r = asyncio.run(nucleo.atender(pedido, BancoSqlite(_con), Servicos(), CONFIG))
        self._enviar(r.status, dict(nucleo.CABECALHOS, **r.cabecalhos), (r.corpo or "").encode("utf-8"))

    def _arquivo(self):
        caminho = self.path.split("?", 1)[0].split("#", 1)[0]
        if caminho == "/":
            caminho = "/index.html"
        alvo = (UI / caminho.lstrip("/")).resolve()
        if UI not in alvo.parents or not alvo.is_file():          # impede sair da pasta public
            aviso = b"nao encontrado" if (UI / "index.html").is_file() else b"interface nao montada: rode  npm run build  (ou use  npm run dev)"
            return self._enviar(404, {"Content-Type": "text/plain; charset=utf-8"}, aviso)
        tipo = TIPOS.get(alvo.suffix) or mimetypes.guess_type(alvo.name)[0] or "application/octet-stream"
        self._enviar(200, dict(CABECALHOS_UI, **{"Content-Type": tipo}), alvo.read_bytes())

    def _enviar(self, status, cabecalhos, corpo):
        self.send_response(status)
        for k, v in cabecalhos.items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(corpo)

    def do_GET(self):
        if not self._host_local():
            return self._enviar(421, {"Content-Type": "text/plain; charset=utf-8"}, b"host invalido")
        self._api() if self.path.startswith("/api/") else self._arquivo()

    def do_POST(self):
        if not self._host_local():
            return self._enviar(421, {"Content-Type": "text/plain; charset=utf-8"}, b"host invalido")
        self._api()

    do_PUT = do_DELETE = do_POST

    def log_message(self, fmt, *args):              # sem corpo nem cabeçalhos no log
        sys.stderr.write(f"{self.command} {self.path.split('?')[0]} → {args[1] if len(args) > 1 else ''}\n")


if __name__ == "__main__":
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORTA), Manipulador)
    print(f"ZoZo (desenvolvimento): API e interface montada em http://127.0.0.1:{PORTA}  ·  "
          "com recarga instantânea: npm run dev (http://127.0.0.1:5173 ; demonstração: /?mock=1)  ·  Ctrl+C para parar")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
