"""
ZoZo (web) — e-mails transacionais pelo Resend (https://resend.com)

Configuração (todas obrigatórias; sem qualquer uma, o e-mail fica DESLIGADO e o ZoZo
funciona como antes — sem confirmação obrigatória no cadastro):
  RESEND_API_KEY   segredo  (npx wrangler secret put RESEND_API_KEY)
  EMAIL_REMETENTE  variável (wrangler.toml), ex.: ZoZo <nao-responda@usezozo.com.br>
  URL_PUBLICA      variável (wrangler.toml), ex.: https://usezozo.com.br

Regras de segurança:
  • os links usam SEMPRE URL_PUBLICA — nunca o Host do pedido (um Host forjado faria o
    e-mail apontar para um site de phishing);
  • o token vai no FRAGMENTO da URL (#confirmar=…): não aparece em logs de servidor,
    proxies nem no cabeçalho Referer;
  • conteúdo só com texto fixo e o nome da pessoa ESCAPADO; nenhum dado financeiro. O e-mail de
    confirmação vai para um endereço ainda NÃO comprovado: não leva o nome digitado no cadastro
    (quem cadastra o e-mail de outra pessoa não escolhe o texto que ela recebe);
  • a chave da API só vai no cabeçalho Authorization para o endereço fixo do Resend.
"""
import html
import json
import time
from collections.abc import Mapping
from typing import Any, Protocol, TypedDict

RESEND_URL = "https://api.resend.com/emails"
_CHAVES = ("RESEND_API_KEY", "EMAIL_REMETENTE", "URL_PUBLICA")


class Mensagem(TypedDict):
    """E-mail montado: assunto, texto simples e HTML."""
    subject: str
    text: str
    html: str


class _Servicos(Protocol):
    async def http_post_json(self, url: str, cabecalhos: Mapping[str, str], corpo: str) -> tuple[int, str]: ...


def _url_base(config: Mapping[str, Any]) -> str:
    u = str(config.get("URL_PUBLICA") or "").strip().rstrip("/")
    seguro = u.startswith("https://") or u.startswith("http://127.0.0.1") or u.startswith("http://localhost")
    return u if seguro and len(u) <= 200 and not any(c in u for c in "\"'<> \r\n") else ""


def ativo(config: Mapping[str, Any]) -> bool:
    """E-mail ligado = os três itens configurados e a URL pública válida."""
    return all(str(config.get(k) or "").strip() for k in _CHAVES) and bool(_url_base(config))


def _quando(agora: float) -> str:
    """Data e hora de Brasília (UTC-3, sem horário de verão desde 2019)."""
    t = time.gmtime(int(agora) - 3 * 3600)
    return f"{t.tm_mday:02d}/{t.tm_mon:02d}/{t.tm_year} às {t.tm_hour:02d}:{t.tm_min:02d}"


def _montar(assunto: str, saudacao: str, paragrafos: list[str], botao: tuple[str, str] | None = None, rodape: str | None = None) -> Mensagem:
    """Texto simples + HTML mínimo (sem imagens remotas, sem rastreamento)."""
    texto = [saudacao, ""] + paragrafos
    if botao:
        texto += ["", botao[0] + ": " + botao[1]]
    texto += ["", rodape or "Se não foi você, ignore este e-mail.", "", "— ZoZo"]
    corpo = "".join(f'<p style="margin:0 0 14px">{html.escape(p)}</p>' for p in paragrafos)
    if botao:
        corpo += (f'<p style="margin:22px 0"><a href="{html.escape(botao[1], quote=True)}" '
                  'style="background:#6948D8;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;'
                  f'font-weight:600;display:inline-block">{html.escape(botao[0])}</a></p>'
                  f'<p style="margin:0 0 14px;color:#71809a;font-size:13px">Se o botão não funcionar, copie este endereço no navegador:<br>'
                  f'{html.escape(botao[1])}</p>')
    pagina = ('<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f6f7fb;'
              'font-family:Segoe UI,Arial,sans-serif;color:#16213a;font-size:15px;line-height:1.5">'
              '<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;padding:28px">'
              f'<p style="margin:0 0 18px;font-weight:600">{html.escape(saudacao)}</p>{corpo}'
              f'<p style="margin:22px 0 0;color:#71809a;font-size:13px">{html.escape(rodape or "Se não foi você, ignore este e-mail.")}</p>'
              '<p style="margin:14px 0 0;color:#6948D8;font-weight:600">ZoZo</p></div></body></html>')
    return {"subject": assunto, "text": "\n".join(texto), "html": pagina}


def _ola(nome: str | None) -> str:
    nome = str(nome or "").strip()
    return f"Olá, {nome}!" if nome else "Olá!"


def confirmacao(config: Mapping[str, Any], token: str) -> Mensagem:
    link = f"{_url_base(config)}/#confirmar={token}"
    return _montar("Confirme seu e-mail no ZoZo", "Olá!",
                   ["Para terminar de criar sua conta no ZoZo, toque no botão abaixo e entre com a senha que você criou.",
                    "O link vale por 24 horas e só pode ser usado uma vez."],
                   botao=("Confirmar e-mail", link),
                   rodape="Se você não criou uma conta no ZoZo, ignore este e-mail: nada será criado sem a confirmação.")


def ja_tem_conta(config: Mapping[str, Any]) -> Mensagem:
    return _montar("Tentativa de cadastro no ZoZo", "Olá!",
                   ["Alguém tentou criar uma conta no ZoZo com este e-mail, mas ele já tem uma conta.",
                    "Se foi você, é só entrar com a sua senha."],
                   botao=("Entrar no ZoZo", _url_base(config) + "/"),
                   rodape="Se não foi você, sua conta continua protegida: nada foi alterado.")


def recuperacao(config: Mapping[str, Any], token: str, nome: str | None) -> Mensagem:
    """Link de "Esqueci minha senha" (a conta já é confirmada: o nome vai escapado)."""
    link = f"{_url_base(config)}/#recuperar={token}"
    return _montar("Redefina sua senha do ZoZo", _ola(nome),
                   ["Recebemos um pedido para redefinir a senha da sua conta no ZoZo.",
                    "Toque no botão abaixo para criar uma senha nova. O link vale por 1 hora e só pode ser usado uma vez."],
                   botao=("Redefinir senha", link),
                   rodape="Não pediu? Ignore este e-mail: sua senha continua a mesma e ninguém entra sem este link.")


def senha_redefinida(nome: str | None, agora: float, recomecou: bool) -> Mensagem:
    paragrafos = [f"A senha da sua conta no ZoZo foi redefinida pelo link do e-mail em {_quando(agora)} (horário de Brasília).",
                  "Todos os dispositivos foram desconectados: entre de novo com a senha nova."]
    if recomecou:
        paragrafos.append("Como a sua conta usava a proteção avançada, os dados anteriores não puderam ser recuperados e a conta recomeçou vazia.")
    return _montar("Sua senha do ZoZo foi redefinida", _ola(nome), paragrafos,
                   rodape="Não foi você? Redefina a senha agora pelo \"Esqueci minha senha\" e ative a verificação em duas etapas.")


def senha_alterada(nome: str | None, agora: float) -> Mensagem:
    return _montar("Sua senha do ZoZo foi alterada", _ola(nome),
                   [f"A senha da sua conta no ZoZo foi alterada em {_quando(agora)} (horário de Brasília).",
                    "Os outros dispositivos conectados foram desconectados."],
                   rodape="Não foi você? Entre em contato com o suporte do ZoZo imediatamente e ative a verificação em duas etapas.")


def dois_fatores_desativado(nome: str | None, agora: float) -> Mensagem:
    return _montar("Verificação em duas etapas desativada", _ola(nome),
                   [f"A verificação em duas etapas (2FA) da sua conta no ZoZo foi desativada em {_quando(agora)} (horário de Brasília)."],
                   rodape="Não foi você? Troque sua senha e ative o 2FA de novo.")


async def enviar(servicos: _Servicos, config: Mapping[str, Any], para: str, mensagem: Mensagem) -> bool:
    """Envia pelo Resend. Nunca lança: devolve True/False (quem chama registra o evento)."""
    if not ativo(config):
        return False
    corpo: dict[str, object] = {"from": str(config.get("EMAIL_REMETENTE")).strip(), "to": [para]}
    corpo.update(mensagem)
    try:
        status, _ = await servicos.http_post_json(
            RESEND_URL, {"Authorization": "Bearer " + str(config.get("RESEND_API_KEY")).strip(), "Content-Type": "application/json"},
            json.dumps(corpo, ensure_ascii=False))
    except Exception:  # noqa: BLE001 — falha de rede/serviço não pode derrubar a operação principal
        return False
    return 200 <= int(status) < 300
