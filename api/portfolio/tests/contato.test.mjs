// Formulário de contato do portfólio (api/portfolio/src/contato.ts): cada defesa tem um teste negativo.
// O Node roda o TypeScript direto (só remove os tipos); fetch é simulado: nada sai para a rede.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { contato, validar, montarEmail, LIMITE_CORPO } from "../src/contato.ts";

const ORIGEM = "https://usezozo.com.br";
const VALIDO = { nome: "Ana Souza", email: "ana.souza@exemplo.com.br", titulo: "Vaga de estágio", mensagem: "Olá, gostei muito do case do ZoZo.", turnstile: "tok", site: "" };

let chamadas, captcha, resend, logs, logOriginal, fetchOriginal;
beforeEach(() => {
  chamadas = [];
  captcha = { success: true, action: "contato", hostname: "usezozo.com.br" };
  resend = 200;
  logs = [];
  fetchOriginal = globalThis.fetch;
  logOriginal = console.log;
  console.log = (...a) => logs.push(a.join(" "));
  globalThis.fetch = async (url, init) => {
    chamadas.push({ url: String(url), init });
    if (String(url).includes("siteverify")) return new Response(JSON.stringify(captcha), { status: 200 });
    if (String(url).includes("resend")) return new Response("{}", { status: resend });
    throw new Error("rede inesperada " + url);
  };
});
afterEach(() => { globalThis.fetch = fetchOriginal; console.log = logOriginal; });

const limite = (ok = true) => ({ limit: async () => ({ success: ok }) });
const ambiente = (extra = {}) => ({
  ORIGENS: ORIGEM, CONTATO_PARA: "lukas.delpiero@outlook.com.br", EMAIL_REMETENTE: "ZoZo <nao-responda@usezozo.com.br>",
  TURNSTILE_SECRET: "segredo", RESEND_API_KEY: "re_teste", LIMITE_IP: limite(), LIMITE_GERAL: limite(), ...extra,
});
function pedido(corpo = VALIDO, { metodo = "POST", origem = ORIGEM, tipo = "application/json", site = "same-origin", bruto } = {}) {
  const headers = { "Content-Type": tipo, "CF-Connecting-IP": "203.0.113.9" };
  if (origem !== null) headers.Origin = origem;
  if (site !== null) headers["Sec-Fetch-Site"] = site;
  return new Request(ORIGEM + "/portfolio/contato", {
    method: metodo, headers, body: metodo === "GET" ? undefined : (bruto ?? JSON.stringify(corpo)),
  });
}
const enviou = () => chamadas.some((c) => c.url.includes("resend"));
const resposta = async (r) => ({ status: r.status, corpo: await r.json() });

/* ---------------- caminho feliz ---------------- */
test("envia o e-mail em texto puro para o destino fixo", async () => {
  const r = await resposta(await contato(pedido(), ambiente()));
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo, { ok: true });
  const email = JSON.parse(chamadas.find((c) => c.url.includes("resend")).init.body);
  assert.deepEqual(email.to, ["lukas.delpiero@outlook.com.br"]);
  assert.equal(email.subject, "Portfólio · Vaga de estágio");
  assert.equal(email.html, undefined, "nunca HTML");
  assert.match(email.text, /Nome: Ana Souza/);
  assert.match(email.text, /E-mail: ana\.souza@exemplo\.com\.br/);
  // quem escreveu só entra no "Responder para": nunca remetente nem destinatário
  assert.equal(email.reply_to, "ana.souza@exemplo.com.br");
  assert.equal(email.from, "ZoZo <nao-responda@usezozo.com.br>");
  // o CAPTCHA é conferido com o segredo e o IP do visitante
  const verif = chamadas.find((c) => c.url.includes("siteverify")).init.body;
  assert.equal(verif.get("secret"), "segredo");
  assert.equal(verif.get("remoteip"), "203.0.113.9");
});

test("registros não levam nome, e-mail, título, mensagem, IP nem token", async () => {
  await contato(pedido(), ambiente());
  const tudo = logs.join("\n");
  for (const s of ["Ana", "exemplo.com.br", "estágio", "case", "203.0.113.9", "tok"]) assert.ok(!tudo.includes(s), s);
  assert.match(tudo, /"resultado":"enviado"/);
});

/* ---------------- método, origem, formato, tamanho ---------------- */
test("só aceita POST", async () => {
  const r = await contato(pedido(VALIDO, { metodo: "GET" }), ambiente());
  assert.equal(r.status, 405);
  assert.equal(r.headers.get("Allow"), "POST");
});

test("recusa outra origem, origem ausente e pedido entre sites", async () => {
  for (const o of [{ origem: "https://evil.example" }, { origem: null }, { origem: "https://usezozo.com.br.evil.example" },
    { origem: "http://usezozo.com.br" }, { site: "cross-site" }, { site: "same-site" }]) {
    const r = await contato(pedido(VALIDO, o), ambiente());
    assert.equal(r.status, 403, JSON.stringify(o));
  }
  assert.equal(chamadas.length, 0);
});

test("recusa corpo que não é JSON (formulário HTML, texto)", async () => {
  for (const tipo of ["application/x-www-form-urlencoded", "text/plain", "multipart/form-data; boundary=x", ""]) {
    assert.equal((await contato(pedido(VALIDO, { tipo }), ambiente())).status, 415, tipo);
  }
});

test("recusa corpo grande demais, JSON quebrado e UTF-8 inválido", async () => {
  const grande = JSON.stringify({ ...VALIDO, mensagem: "a".repeat(LIMITE_CORPO) });
  assert.equal((await contato(pedido(null, { bruto: grande }), ambiente())).status, 413);
  assert.equal((await contato(pedido(null, { bruto: "{nome:" }), ambiente())).status, 400);
  assert.equal((await contato(pedido(null, { bruto: new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]) }), ambiente())).status, 400);
  assert.ok(!enviou());
});

test("sem segredos ou limites configurados: indisponível, sem chamar nada", async () => {
  for (const falta of ["TURNSTILE_SECRET", "RESEND_API_KEY", "CONTATO_PARA", "LIMITE_IP"]) {
    const r = await contato(pedido(), ambiente({ [falta]: undefined }));
    assert.equal(r.status, 503, falta);
  }
  assert.equal(chamadas.length, 0);
});

test("limite por IP e limite geral", async () => {
  for (const extra of [{ LIMITE_IP: limite(false) }, { LIMITE_GERAL: limite(false) }]) {
    const r = await contato(pedido(), ambiente(extra));
    assert.equal(r.status, 429);
    assert.equal(r.headers.get("Retry-After"), "60");
  }
  assert.equal(chamadas.length, 0);
});

/* ---------------- campos ---------------- */
test("campos obrigatórios: vazio, só espaços ou ausente", async () => {
  for (const campo of ["nome", "email", "titulo", "mensagem", "turnstile"]) {
    for (const valor of [undefined, "", "   \n  "]) {
      const corpo = { ...VALIDO, [campo]: valor };
      const r = await resposta(await contato(pedido(corpo), ambiente()));
      assert.equal(r.status, 400, campo + JSON.stringify(valor));
      assert.ok(r.corpo.campos.includes(campo), campo);
    }
  }
  assert.ok(!enviou());
});

test("o destino não pode vir do pedido (nenhum campo extra é aceito)", async () => {
  for (const extra of [{ para: "x@evil.example" }, { to: ["x@evil.example"] }, { html: "<b>oi</b>" }, { cc: "a@b.c" }]) {
    const r = await contato(pedido({ ...VALIDO, ...extra }), ambiente());
    assert.equal(r.status, 400, Object.keys(extra)[0]);
  }
  // __proto__ vira chave própria no JSON.parse e também é recusada
  assert.equal((await contato(pedido(null, { bruto: '{"__proto__":{"x":1},"nome":"Ana"}' }), ambiente())).status, 400);
  assert.ok(!enviou());
});

test("tipos errados: número, lista, objeto, null", () => {
  for (const valor of [42, ["Ana"], { a: 1 }, null, true]) {
    assert.equal(validar({ ...VALIDO, nome: valor }).ok, false);
    assert.equal(validar({ ...VALIDO, mensagem: valor }).ok, false);
    assert.equal(validar({ ...VALIDO, email: valor }).ok, false);
  }
  for (const corpo of [null, [], "texto", 1]) assert.equal(validar(corpo).ok, false);
  assert.equal(validar({ ...VALIDO, site: 1 }).ok, false);
});

test("nome só com letras: sem HTML, código, números ou quebra de linha", () => {
  for (const nome of ["<script>alert(1)</script>", "Ana\nBcc: x@evil.example", "Robert'); DROP TABLE--", "{{7*7}}", "a", "1234", "Ana@site", "Ana\tSouza"]) {
    assert.equal(validar({ ...VALIDO, nome }).ok, false, nome);
  }
  for (const nome of ["Ana", "José D'Ávila", "María-José", "Zoë O. Brien", "李小龙"]) assert.equal(validar({ ...VALIDO, nome }).ok, true, nome);
});

test("e-mail num formato estrito: sem injeção de cabeçalho, lista, nome exibido nem domínio estranho", () => {
  for (const email of ["ana@exemplo.com\r\nBcc: x@evil.example", "ana@exemplo.com\nX", "ana@exemplo.com,x@evil.example",
    "ana@exemplo.com;x@evil.example", "Ana <ana@exemplo.com>", '"ana"@exemplo.com', "ana exemplo@site.com", "ana@", "@exemplo.com",
    "ana@exemplo", "ana@exemplo.c", "ana..souza@exemplo.com", ".ana@exemplo.com", "ana.@exemplo.com", "ana@-exemplo.com",
    "ana@exemplo-.com", "ana@exemplo..com", "ana@exemplo.123", "ana@[127.0.0.1]", "ana@exаmplo.com", "josé@exemplo.com",
    "a".repeat(65) + "@exemplo.com", "ana@" + "a".repeat(64) + ".com", "ana@" + "b".repeat(250) + ".com"]) {
    assert.equal(validar({ ...VALIDO, email }).ok, false, JSON.stringify(email));
  }
  for (const email of ["ana@exemplo.com", "Ana.Souza+portfolio@sub.exemplo.com.br", "a_b-c@x-y.io", "  ana@exemplo.com  "]) {
    assert.equal(validar({ ...VALIDO, email }).ok, true, email);
  }
  assert.equal(validar({ ...VALIDO, email: "  ana@exemplo.com " }).dados.email, "ana@exemplo.com");
});

test("título numa linha só (sem injeção de cabeçalho no assunto)", () => {
  for (const titulo of ["Oi\r\nBcc: x@evil.example", "Oi\nX", "ab", "x".repeat(121)]) {
    assert.equal(validar({ ...VALIDO, titulo }).ok, false, JSON.stringify(titulo));
  }
});

test("caracteres de controle, invisíveis e de direção do texto são recusados", () => {
  for (const c of ["\u0000", "\u0007", "\u001b[31m", "\u007f", "\u200B", "\u202E", "\u2066", "\uFEFF", "\u00AD"]) {
    assert.equal(validar({ ...VALIDO, mensagem: "Mensagem normal " + c + " fim" }).ok, false, JSON.stringify(c));
    assert.equal(validar({ ...VALIDO, titulo: "Tí" + c + "tulo" }).ok, false, JSON.stringify(c));
  }
  // quebra de linha e tabulação continuam valendo na mensagem; \r\n vira \n
  const v = validar({ ...VALIDO, mensagem: "Linha 1\r\nLinha 2\n\tLinha 3" });
  assert.equal(v.ok, true);
  assert.equal(v.dados.mensagem, "Linha 1\nLinha 2\n\tLinha 3");
});

test("tamanhos contados em caracteres (emoji conta 1) e limites", () => {
  assert.equal(validar({ ...VALIDO, mensagem: "curta" }).ok, false);
  assert.equal(validar({ ...VALIDO, mensagem: "a".repeat(4001) }).ok, false);
  assert.equal(validar({ ...VALIDO, mensagem: "😀".repeat(4000) }).ok, true);
  assert.equal(validar({ ...VALIDO, nome: "A".repeat(81) }).ok, false);
  assert.equal(validar({ ...VALIDO, turnstile: "t".repeat(2049) }).ok, false);
  assert.equal(validar({ ...VALIDO, turnstile: "0.abc def" }).ok, false);
  assert.equal(validar({ ...VALIDO, turnstile: "0.AbC-d_e.F9" }).ok, true);
});

test("mais de 3 links na mensagem é tratado como spam", () => {
  const m = "Veja http://a.example https://b.example www.c.example https://d.example";
  assert.equal(validar({ ...VALIDO, mensagem: m }).ok, false);
  assert.equal(validar({ ...VALIDO, mensagem: "Meu LinkedIn: https://linkedin.com/in/ana" }).ok, true);
});

test("HTML na mensagem vai como texto puro (o e-mail não tem HTML)", () => {
  const v = validar({ ...VALIDO, mensagem: '<img src=x onerror="alert(1)"> olá' });
  assert.equal(v.ok, true);
  const e = montarEmail(v.dados, new Date("2026-11-03T15:00:00Z"));
  assert.ok(e.text.includes('<img src=x onerror="alert(1)">'));
  assert.deepEqual(Object.keys(e).sort(), ["subject", "text"]);
  assert.match(e.text, /03\/11\/2026, 12:00/);
});

/* ---------------- CAPTCHA ---------------- */
test("CAPTCHA recusado, de outra ação ou de outro domínio: não envia", async () => {
  for (const c of [{ success: false }, { success: true, action: "login", hostname: "usezozo.com.br" },
    { success: true, action: "contato", hostname: "evil.example" }, { success: "true", action: "contato", hostname: "usezozo.com.br" }]) {
    captcha = c;
    chamadas = [];
    const r = await resposta(await contato(pedido(), ambiente()));
    assert.equal(r.status, 400, JSON.stringify(c));
    assert.equal(r.corpo.erro, "captcha");
    assert.ok(!enviou());
  }
});

test("Chave secreta recusada pela Cloudflare: não envia e registra só o status", async () => {
  globalThis.fetch = async (url, init) => {
    chamadas.push({ url: String(url), init });
    return new Response('{"success":false,"error-codes":["invalid-input-secret"]}', { status: 400 });
  };
  const r = await resposta(await contato(pedido(), ambiente({ TURNSTILE_SECRET: " segredo\n" })));
  assert.equal(r.status, 400);
  assert.ok(!enviou());
  assert.equal(new URLSearchParams(String(chamadas[0].init.body)).get("secret"), "segredo");   // sem o espaço e o Enter
  const eventos = logs.map((l) => JSON.parse(l)).filter((e) => e.evento === "captcha_indisponivel");
  assert.deepEqual(eventos, [{ evento: "captcha_indisponivel", status: 400 }]);
  assert.ok(!logs.join("").includes("segredo"));
});

test("Turnstile fora do ar: recusa (falha fechada)", async () => {
  globalThis.fetch = async () => { throw new Error("rede"); };
  assert.equal((await contato(pedido(), ambiente())).status, 400);
});

test("campo armadilha preenchido: responde sucesso, mas não envia", async () => {
  const r = await resposta(await contato(pedido({ ...VALIDO, site: "https://spam.example" }), ambiente()));
  assert.equal(r.status, 200);
  assert.ok(!enviou());
});

test("falha no Resend vira erro de envio", async () => {
  resend = 500;
  assert.equal((await contato(pedido(), ambiente())).status, 502);
});

test("respostas sem cache e sem CORS", async () => {
  const r = await contato(pedido(), ambiente());
  assert.equal(r.headers.get("Cache-Control"), "no-store");
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), null);
  assert.equal(r.headers.get("X-Content-Type-Options"), "nosniff");
});
