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
  ZOZO_DEV_BANCO        outro arquivo SQLite (ex.: um banco descartável para testes)
  ZOZO_DEV_RECURSOS     e-mails com Perfis, boletos e Pix (separados por vírgula; a conta demo sempre tem)
  ZOZO_DEV_TURNSTILE=0  desliga o CAPTCHA (padrão: chaves de TESTE da Cloudflare, que sempre aprovam)
  ZOZO_DEV_GOOGLE_ID / ZOZO_DEV_GOOGLE_SECRET   ativa o "Continuar com Google" local
  ZOZO_DEV_EMAIL=console   liga a confirmação de e-mail e mostra os e-mails no terminal (nada é enviado)
  ZOZO_DEV_ZO=simulado     Zo sem a OpenAI: respostas fixas para testar a tela ("contas" lê, "teste" grava, o resto ecoa)
  ZOZO_DEV_OPENAI_KEY / ZOZO_DEV_ZO_MODELO   Zo com a OpenAI de verdade (gasta créditos; use dados de teste)
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
import zo  # noqa: E402
from banco_sqlite import BancoSqlite, conectar  # noqa: E402

# Interface montada pelo Vite (npm run build): exatamente o que vai para o Cloudflare
UI = (AQUI.parent / "public").resolve()
BANCO = pathlib.Path(os.environ.get("ZOZO_DEV_BANCO") or AQUI / "zozo-local.db")
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
}
# E-mail local: ZOZO_DEV_EMAIL=console liga a confirmação de e-mail e IMPRIME os e-mails aqui no terminal
# (nada é enviado); ZOZO_DEV_RESEND_KEY=… envia de verdade pelo Resend (use só com o seu próprio e-mail).
if os.environ.get("ZOZO_DEV_EMAIL") == "console" or os.environ.get("ZOZO_DEV_RESEND_KEY"):
    CONFIG.update({"RESEND_API_KEY": os.environ.get("ZOZO_DEV_RESEND_KEY") or "console",
                   "EMAIL_REMETENTE": os.environ.get("ZOZO_DEV_EMAIL_REMETENTE", "ZoZo <nao-responda@usezozo.com.br>"),
                   "URL_PUBLICA": os.environ.get("ZOZO_DEV_URL", "http://127.0.0.1:5173")})
CONFIG.update({
    "COOKIE_SEGURO": "0",                         # http://127.0.0.1 não tem HTTPS
})
if os.environ.get("ZOZO_DEV_ZO") == "simulado":
    CONFIG.update({"OPENAI_API_KEY": "simulado", "ZO_MODELO": "simulado"})
elif os.environ.get("ZOZO_DEV_OPENAI_KEY"):
    CONFIG.update({"OPENAI_API_KEY": os.environ["ZOZO_DEV_OPENAI_KEY"], "ZO_MODELO": os.environ.get("ZOZO_DEV_ZO_MODELO", "")})


def _zo_simulado(corpo):
    """Resposta fixa no formato da OpenAI: o bastante para testar a janela, a leitura e a confirmação de gravação."""
    ultima = json.loads(corpo)["messages"][-1]
    texto = str(ultima.get("content") or "").lower()
    if ultima["role"] == "tool":
        msg = {"role": "assistant", "content": "Pronto. Modo simulado do Zo. Posso ajudar em mais alguma coisa?"}
    elif "conta" in texto:
        msg = {"role": "assistant", "content": None, "tool_calls": [{"id": "sim1", "type": "function", "function": {"name": "listar_contas", "arguments": "{}"}}]}
    elif "teste" in texto:
        msg = {"role": "assistant", "content": None, "tool_calls": [{"id": "sim2", "type": "function",
               "function": {"name": "criar_categoria", "arguments": json.dumps({"nome": "Teste do Zo", "icone": "🧪"})}}]}
    elif "opç" in texto or "opc" in texto:
        msg = {"role": "assistant", "content": None, "tool_calls": [{"id": "sim3", "type": "function",
               "function": {"name": "oferecer_opcoes", "arguments": json.dumps({"pergunta": "Qual opção?", "opcoes": ["Primeira", "Segunda"]})}}]}
    else:
        msg = {"role": "assistant", "content": "Modo simulado do Zo. Recebi a sua mensagem."}
    return 200, json.dumps({"choices": [{"message": msg}]})
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

    async def http_post_json(self, url, cabecalhos, corpo, limite=2000):
        if url == zo.OPENAI_URL:
            if CONFIG.get("OPENAI_API_KEY") == "simulado":
                return _zo_simulado(corpo)
            status, texto = await asyncio.to_thread(self._baixar, urllib.request.Request(url, data=corpo.encode("utf-8"), headers=cabecalhos, method="POST"))
            return status, texto[:limite]
        if CONFIG.get("RESEND_API_KEY") == "console":
            # modo console: mostra o e-mail aqui (assunto e texto, com o link) e não envia nada
            m = json.loads(corpo)
            sys.stderr.write("\n===== E-MAIL (não enviado) para " + ", ".join(m.get("to", [])) + " =====\n"
                             + m.get("subject", "") + "\n\n" + m.get("text", "") + "\n================================\n")
            return 200, "{}"
        return await asyncio.to_thread(self._baixar, urllib.request.Request(url, data=corpo.encode("utf-8"), headers=cabecalhos, method="POST"))


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
        if not alvo.suffix and alvo.with_suffix(".html").is_file():   # como o Cloudflare: /politica-privacidade → .html
            alvo = alvo.with_suffix(".html")
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
    try:                                          # acentos legíveis também quando a saída vai para um arquivo/pipe
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORTA), Manipulador)
    print(f"ZoZo (desenvolvimento): API e interface montada em http://127.0.0.1:{PORTA}  ·  "
          "com recarga instantânea: npm run dev (http://127.0.0.1:5173)  ·  Ctrl+C para parar")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
