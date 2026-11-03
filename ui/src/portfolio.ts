/* =============================================================
   ZoZo — portfólio: formulário de contato (#contato)
   ------------------------------------------------------------
   Campos nome, e-mail, título e mensagem + CAPTCHA (Turnstile, ação "contato") → POST /portfolio/contato
   (api/portfolio/src/contato.ts). As regras daqui só ajudam quem preenche: o servidor confere tudo de
   novo e é a única barreira que vale. Textos sempre com textContent (sem innerHTML).
   ============================================================= */
export {};

const TURNSTILE_JS = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
// chave pública de teste do Cloudflare (sempre passa): só no computador, onde o widget de verdade não abre
const CHAVE_TESTE = "1x00000000000000000000AA";
const LOCAL = ["127.0.0.1", "localhost"].includes(location.hostname);

const MENSAGENS: Record<string, string> = {
  campos: "Confira os campos destacados.",
  captcha: "A verificação anti-robô não passou. Faça de novo e envie.",
  limite: "Muitos envios em pouco tempo. Espere um minuto e tente de novo.",
  indisponivel: "O formulário está fora do ar agora. Tente mais tarde ou fale comigo pelo LinkedIn.",
  envio: "Não consegui enviar agora. Tente de novo em instantes.",
  rede: "Sem conexão com o servidor. Confira a internet e tente de novo.",
};
const ERROS_CAMPO: Record<string, string> = {
  nome: "Escreva seu nome (2 a 80 letras).",
  email: "Escreva um e-mail válido, como nome@exemplo.com.",
  titulo: "Escreva um título (3 a 120 caracteres, numa linha só).",
  mensagem: "Escreva a mensagem (10 a 4.000 caracteres, até 3 links).",
};

function iniciar(form: HTMLFormElement): void {
  const botao = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
  const aviso = form.querySelector<HTMLElement>("[data-aviso]")!;
  const caixaCaptcha = form.querySelector<HTMLElement>("[data-captcha]")!;
  const campo = (n: string) => form.elements.namedItem(n) as HTMLInputElement | HTMLTextAreaElement;
  let token = "", widget: string | null = null;

  function mostrar(texto: string, tipo: "erro" | "ok" | "") {
    aviso.textContent = texto;
    aviso.dataset.tipo = tipo;
  }
  function marcar(nomes: string[]) {
    for (const n of ["nome", "email", "titulo", "mensagem"]) {
      const el = campo(n), erro = form.querySelector<HTMLElement>(`[data-erro="${n}"]`)!;
      const ruim = nomes.includes(n);
      el.setAttribute("aria-invalid", String(ruim));
      erro.textContent = ruim ? ERROS_CAMPO[n] : "";
    }
  }
  function recomecarCaptcha() {
    token = "";
    if (widget !== null && window.turnstile) { try { window.turnstile.reset(widget); } catch { /* ok */ } }
  }

  // o script do Turnstile só é baixado quando o formulário chega perto da tela
  let carregado = false;
  function carregarCaptcha() {
    if (carregado) return;
    carregado = true;
    const sc = document.createElement("script");
    sc.src = TURNSTILE_JS; sc.async = true;
    sc.onload = () => {
      if (!window.turnstile) return;
      widget = window.turnstile.render(caixaCaptcha, {
        sitekey: LOCAL ? CHAVE_TESTE : form.dataset.sitekey, action: "contato", language: "pt-br",
        appearance: "always", theme: "light", "refresh-expired": "auto",
        callback: (t: string) => { token = t; },
        "expired-callback": () => { token = ""; },
        "error-callback": () => { token = ""; },
      });
    };
    sc.onerror = () => { carregado = false; sc.remove(); mostrar("Não foi possível carregar a verificação anti-robô. Recarregue a página.", "erro"); };
    document.head.appendChild(sc);
  }
  new IntersectionObserver((itens, obs) => {
    if (itens.some((i) => i.isIntersecting)) { carregarCaptcha(); obs.disconnect(); }
  }, { rootMargin: "400px" }).observe(form);

  // ajuda imediata (o servidor repete tudo): obrigatórios, tamanhos e uma linha só no nome e no título
  function conferir(): string[] {
    const ruins: string[] = [];
    const nome = campo("nome").value.trim(), email = campo("email").value.trim();
    const titulo = campo("titulo").value.trim(), msg = campo("mensagem").value.trim();
    if ([...nome].length < 2 || [...nome].length > 80 || !/^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u.test(nome)) ruins.push("nome");
    if (email.length > 254 || !/^[^\s@,;<>"()]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,63}$/.test(email)) ruins.push("email");
    if ([...titulo].length < 3 || [...titulo].length > 120) ruins.push("titulo");
    if ([...msg].length < 10 || [...msg].length > 4000 || (msg.match(/https?:\/\/|www\./gi) || []).length > 3) ruins.push("mensagem");
    return ruins;
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const ruins = conferir();
    marcar(ruins);
    if (ruins.length) { mostrar(MENSAGENS.campos, "erro"); campo(ruins[0]).focus(); return; }
    if (!token) { mostrar("Faça a verificação anti-robô antes de enviar.", "erro"); carregarCaptcha(); return; }

    botao.disabled = true;
    form.setAttribute("aria-busy", "true");
    mostrar("Enviando…", "");
    try {
      const r = await fetch(form.action, {
        method: "POST", credentials: "omit", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: campo("nome").value, email: campo("email").value, titulo: campo("titulo").value, mensagem: campo("mensagem").value,
          turnstile: token, site: campo("site").value,
        }),
      });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; erro?: string; campos?: string[] };
      if (r.ok && d.ok) {
        form.reset();
        marcar([]);
        mostrar("Mensagem enviada. Obrigado! Respondo assim que puder.", "ok");
      } else {
        if (d.erro === "campos" && d.campos) marcar(d.campos);
        mostrar(MENSAGENS[d.erro || ""] || MENSAGENS.envio, "erro");
      }
    } catch {
      mostrar(MENSAGENS.rede, "erro");
    } finally {
      recomecarCaptcha();                           // cada token do Turnstile vale uma vez só
      botao.disabled = false;
      form.removeAttribute("aria-busy");
    }
  });
}

const form = document.querySelector<HTMLFormElement>("#form-contato");
if (form) iniciar(form);
