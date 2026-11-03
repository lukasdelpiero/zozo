/* =============================================================
   ZoZo — portfólio: formulário de contato (POST /portfolio/contato)
   ------------------------------------------------------------
   Entrada do Worker: index.ts. O resto do portfólio são arquivos estáticos (api/portfolio/public); só este endereço passa pelo código
   (run_worker_first no wrangler.toml). A página nunca é confiável: tudo o que importa é conferido aqui,
   então mudar o HTML, o CSS ou o JS pelo DevTools não pula nenhuma etapa.

   Ordem das defesas (a mais barata primeiro):
   1. só POST, só da origem do próprio site (Origin exato + Sec-Fetch-Site), só JSON, até 16 KB;
   2. limite de envios por IP e limite geral (Rate Limiting do Workers);
   3. campos: exatamente nome, e-mail, título, mensagem, turnstile e a armadilha "site"; textos normalizados (NFC),
      sem caracteres de controle nem de direção do texto; nome só com letras; título e nome numa linha só;
      e-mail só em ASCII, num formato estrito (sem espaço, vírgula, aspas, < > nem quebra de linha);
   4. CAPTCHA (Turnstile) conferido no servidor: sucesso, ação "contato" e o mesmo domínio da página;
   5. e-mail só em texto puro (nada de HTML), para um destinatário fixo da configuração (CONTATO_PARA); o e-mail de
      quem escreveu vai só no "Responder para" (reply_to) e no corpo, nunca como remetente nem destinatário.

   Variáveis (wrangler.toml): ORIGENS (origens aceitas, separadas por vírgula), CONTATO_PARA, EMAIL_REMETENTE.
   Segredos (npx wrangler secret put … --config portfolio/wrangler.toml): TURNSTILE_SECRET, RESEND_API_KEY.
   Registros: só o resultado (nunca nome, e-mail, título, mensagem, IP ou token).
   ============================================================= */

export const CAMINHO = "/portfolio/contato";
export const LIMITE_CORPO = 16 * 1024;
const TURNSTILE_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const RESEND_URL = "https://api.resend.com/emails";
const ACAO_CAPTCHA = "contato";
const ESPERA_MS = 8000;

interface LimiteTaxa { limit(o: { key: string }): Promise<{ success: boolean }> }
export interface Ambiente {
  ASSETS?: { fetch(req: Request): Promise<Response> };
  LIMITE_IP?: LimiteTaxa;
  LIMITE_GERAL?: LimiteTaxa;
  ORIGENS?: string;
  CONTATO_PARA?: string;
  EMAIL_REMETENTE?: string;
  TURNSTILE_SECRET?: string;
  RESEND_API_KEY?: string;
}
export interface Contato { nome: string; email: string; titulo: string; mensagem: string; turnstile: string; armadilha: boolean }
export type Validacao = { ok: true; dados: Contato } | { ok: false; campos: string[] };

/* ---------------- Validação dos campos ---------------- */
const CAMPOS = new Set(["nome", "email", "titulo", "mensagem", "turnstile", "site"]);
// controles C0/C1 (fora \n e \t), marcas invisíveis e de direção do texto (Trojan Source), BOM
const PROIBIDOS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u00AD\u061C\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]/;
const NOME = /^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u;
const LINKS = /https?:\/\/|www\./gi;
// parte local: os caracteres "atom" da RFC 5322 (sem aspas), pontos só entre eles; domínio: rótulos de até 63, TLD de letras
const EMAIL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

const tamanho = (s: string) => [...s].length;              // em caracteres de verdade, não em unidades UTF-16

function texto(valor: unknown, min: number, max: number, umaLinha: boolean): string | null {
  if (typeof valor !== "string") return null;
  const t = valor.normalize("NFC").replace(/\r\n?/g, "\n").trim();
  if (PROIBIDOS.test(t)) return null;
  if (umaLinha && /[\n\t]/.test(t)) return null;
  const n = tamanho(t);
  return n >= min && n <= max ? t : null;
}

export function validar(corpo: unknown): Validacao {
  if (typeof corpo !== "object" || corpo === null || Array.isArray(corpo)) return { ok: false, campos: ["corpo"] };
  const o = corpo as Record<string, unknown>;
  if (Object.keys(o).some((k) => !CAMPOS.has(k))) return { ok: false, campos: ["corpo"] };
  const campos: string[] = [];
  const nome = texto(o.nome, 2, 80, true);
  if (nome === null || !NOME.test(nome)) campos.push("nome");
  const email = texto(o.email, 6, 254, true);
  if (email === null || !EMAIL.test(email) || email.indexOf("@") > 64) campos.push("email");
  const titulo = texto(o.titulo, 3, 120, true);
  if (titulo === null) campos.push("titulo");
  const mensagem = texto(o.mensagem, 10, 4000, false);
  if (mensagem === null || (mensagem.match(LINKS) || []).length > 3) campos.push("mensagem");
  // token do Turnstile: ASCII visível, sem espaços (o servidor do Turnstile é quem diz se vale)
  const turnstile = typeof o.turnstile === "string" && /^[\x21-\x7E]{1,2048}$/.test(o.turnstile) ? o.turnstile : null;
  if (turnstile === null) campos.push("turnstile");
  if (o.site !== undefined && typeof o.site !== "string") campos.push("corpo");
  if (campos.length) return { ok: false, campos };
  return { ok: true, dados: { nome: nome!, email: email!, titulo: titulo!, mensagem: mensagem!, turnstile: turnstile!, armadilha: typeof o.site === "string" && o.site !== "" } };
}

/* ---------------- E-mail ---------------- */
export function montarEmail(c: Contato, agora: Date): { subject: string; text: string } {
  const quando = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(agora);
  return {
    subject: "Portfólio · " + c.titulo,
    text: `Nome: ${c.nome}\nE-mail: ${c.email}\nTítulo: ${c.titulo}\nEnviado em: ${quando} (horário de Brasília)\n\n${c.mensagem}\n\n`
      + "—\nMensagem do formulário de contato do portfólio (usezozo.com.br/portfolio). O e-mail foi digitado por quem "
      + "escreveu e não foi confirmado; o Responder vai para ele.\n",
  };
}

/* ---------------- Respostas ---------------- */
function json(status: number, corpo: object, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'", "Referrer-Policy": "no-referrer", ...extra,
    },
  });
}
const registrar = (resultado: string) => console.log(JSON.stringify({ evento: "contato", resultado }));

function origens(env: Ambiente): string[] {
  return String(env.ORIGENS || "").split(",").map((s) => s.trim()).filter(Boolean);
}

// lê o corpo até o limite, sem confiar no Content-Length (null: grande demais)
async function lerCorpo(req: Request): Promise<Uint8Array | null> {
  if (Number(req.headers.get("Content-Length") || "0") > LIMITE_CORPO) return null;
  if (!req.body) return new Uint8Array(0);
  const leitor = req.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > LIMITE_CORPO) { await leitor.cancel(); return null; }
    partes.push(value);
  }
  const tudo = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) { tudo.set(p, pos); pos += p.byteLength; }
  return tudo;
}

async function captchaOk(env: Ambiente, token: string, ip: string, host: string): Promise<boolean> {
  const form = new URLSearchParams({ secret: String(env.TURNSTILE_SECRET), response: token });
  if (ip) form.set("remoteip", ip);
  try {
    const r = await fetch(TURNSTILE_URL, { method: "POST", body: form, signal: AbortSignal.timeout(ESPERA_MS) });
    if (!r.ok) return false;
    const d = (await r.json()) as { success?: unknown; action?: unknown; hostname?: unknown };
    return d.success === true && d.action === ACAO_CAPTCHA && d.hostname === host;
  } catch { return false; }
}

async function enviarEmail(env: Ambiente, c: Contato): Promise<boolean> {
  const corpo = { from: String(env.EMAIL_REMETENTE), to: [String(env.CONTATO_PARA)], reply_to: c.email, ...montarEmail(c, new Date()) };
  try {
    const r = await fetch(RESEND_URL, {
      method: "POST", body: JSON.stringify(corpo), signal: AbortSignal.timeout(ESPERA_MS),
      headers: { Authorization: "Bearer " + String(env.RESEND_API_KEY).trim(), "Content-Type": "application/json" },
    });
    return r.ok;
  } catch { return false; }
}

export async function contato(req: Request, env: Ambiente): Promise<Response> {
  if (req.method !== "POST") return json(405, { erro: "metodo" }, { Allow: "POST" });
  const origem = req.headers.get("Origin") || "";
  const site = req.headers.get("Sec-Fetch-Site");
  if (!origens(env).includes(origem) || (site !== null && site !== "same-origin")) { registrar("origem"); return json(403, { erro: "origem" }); }
  if (!/^application\/json(\s*;|$)/i.test(req.headers.get("Content-Type") || "")) return json(415, { erro: "formato" });
  if (!env.TURNSTILE_SECRET || !env.RESEND_API_KEY || !env.CONTATO_PARA || !env.EMAIL_REMETENTE || !env.LIMITE_IP || !env.LIMITE_GERAL) {
    registrar("sem_configuracao");
    return json(503, { erro: "indisponivel" });
  }

  const ip = req.headers.get("CF-Connecting-IP") || "";
  const [porIp, geral] = await Promise.all([env.LIMITE_IP.limit({ key: ip || "sem-ip" }), env.LIMITE_GERAL.limit({ key: "todos" })]);
  if (!porIp.success || !geral.success) { registrar("limite"); return json(429, { erro: "limite" }, { "Retry-After": "60" }); }

  const bruto = await lerCorpo(req);
  if (bruto === null) return json(413, { erro: "tamanho" });
  let corpo: unknown;
  // UTF-8 inválido ou JSON quebrado: o mesmo erro
  try { corpo = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bruto)); } catch { return json(400, { erro: "campos", campos: ["corpo"] }); }
  const v = validar(corpo);
  if (!v.ok) { registrar("campos"); return json(400, { erro: "campos", campos: v.campos }); }

  if (!(await captchaOk(env, v.dados.turnstile, ip, new URL(origem).hostname))) { registrar("captcha"); return json(400, { erro: "captcha" }); }
  // robô que preencheu o campo escondido: responde como sucesso (não ensina o que deu errado), mas não envia
  if (v.dados.armadilha) { registrar("armadilha"); return json(200, { ok: true }); }
  if (!(await enviarEmail(env, v.dados))) { registrar("falha_envio"); return json(502, { erro: "envio" }); }
  registrar("enviado");
  return json(200, { ok: true });
}

