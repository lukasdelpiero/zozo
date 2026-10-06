"""
ZoZo — servidor LOCAL de desenvolvimento (não é usado no Cloudflare)

    python api/dev/servidor_local.py            → http://127.0.0.1:8787

Serve a interface (pasta ui) e a mesma API Python do Cloudflare, com um
banco SQLite em api/dev/zozo-local.db. Não existe Cloudflare Access aqui:
o usuário é fixo (variável ZOZO_DEV_EMAIL, padrão dev@zozo.local) e o
servidor só aceita conexões do próprio computador (127.0.0.1).
"""
import asyncio
import http.server
import mimetypes
import os
import pathlib
import sys
import threading
import urllib.error
import urllib.request

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "src"))
sys.path.insert(0, str(AQUI))
sys.path.insert(0, str(AQUI.parent))

import montar_interface  # noqa: E402
import nucleo  # noqa: E402
from banco_sqlite import BancoSqlite, conectar  # noqa: E402

UI = (AQUI.parent.parent / "ui").resolve()
BANCO = AQUI / "zozo-local.db"
EMAIL = os.environ.get("ZOZO_DEV_EMAIL", "dev@zozo.local").strip().lower()
PORTA = int(os.environ.get("ZOZO_DEV_PORTA", "8787"))

# Mesmos cabeçalhos que o Cloudflare envia com a interface (arquivo _headers)
CABECALHOS_UI = dict(montar_interface.CABECALHOS_UI, **{"Cache-Control": "no-store"})
TIPOS = {".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
         ".html": "text/html; charset=utf-8", ".woff": "font/woff", ".png": "image/png"}

_con = conectar(str(BANCO))
_trava = threading.Lock()


async def http_get(url, cabecalhos):
    def baixar():
        try:
            req = urllib.request.Request(url, headers=cabecalhos)
            with urllib.request.urlopen(req, timeout=5) as r:      # noqa: S310 — URL fixa da API
                return r.status, r.read(2_000_001).decode("utf-8", "replace")
        except (urllib.error.URLError, TimeoutError, OSError):
            return 0, ""
    return await asyncio.to_thread(baixar)


async def identificar(_pedido):
    return EMAIL


class Manipulador(http.server.BaseHTTPRequestHandler):
    server_version = "ZoZo-dev"
    sys_version = ""

    def _api(self):
        tamanho = int(self.headers.get("Content-Length") or 0)
        if tamanho > nucleo.LIMITE_CORPO:
            return self._enviar(413, nucleo.CABECALHOS, b'{"erro":"DOCUMENT_TOO_LARGE"}')
        corpo = self.rfile.read(tamanho).decode("utf-8", "replace") if tamanho else ""
        pedido = nucleo.Pedido(self.command, f"http://{self.headers.get('Host', '')}{self.path}", dict(self.headers.items()), corpo)
        with _trava:                                   # uma conexão SQLite: um pedido por vez
            r = asyncio.run(nucleo.atender(pedido, BancoSqlite(_con), http_get, identificar))
        self._enviar(r.status, nucleo.CABECALHOS, (r.corpo or "").encode("utf-8"))

    def _arquivo(self):
        caminho = self.path.split("?", 1)[0].split("#", 1)[0]
        if caminho == "/":
            caminho = "/index.html"
        alvo = (UI / caminho.lstrip("/")).resolve()
        if UI not in alvo.parents or not alvo.is_file():          # impede sair da pasta ui
            return self._enviar(404, {"Content-Type": "text/plain; charset=utf-8"}, b"nao encontrado")
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
        self._api() if self.path.startswith("/api/") else self._arquivo()

    def do_POST(self):
        self._api()

    do_PUT = do_DELETE = do_POST

    def log_message(self, fmt, *args):              # sem corpo nem cabeçalhos no log
        sys.stderr.write(f"{self.command} {self.path.split('?')[0]} → {args[1] if len(args) > 1 else ''}\n")


if __name__ == "__main__":
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORTA), Manipulador)
    print(f"ZoZo (desenvolvimento): http://127.0.0.1:{PORTA}  ·  usuário: {EMAIL}  ·  Ctrl+C para parar")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
