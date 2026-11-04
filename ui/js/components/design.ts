/* =============================================================
   ZoZo — páginas de Design (SÓ no endereço local e na prévia, pelo painel do modo teste)
   ------------------------------------------------------------
   Guia nova em /#design/<seção>: um documento de referência gerado do PRÓPRIO app, para repassar ao Claude no
   novo design. Nada é escrito à mão onde dá para ler do app:
     • janelas: cada item do catálogo do painel (telas, painéis, janelas, menus) aberto na conta de exemplo e
       copiado como está na tela (clone do DOM num quadro do tamanho da tela), com o texto visível e PNG;
     • elementos: as galerias de componentes e gráficos do painel, com as medidas calculadas de cada peça;
     • tipografia, medidas e cores: os tokens de :root e TODAS as regras CSS carregadas (@media, @container,
       @keyframes, @font-face), com quantas vezes cada valor aparece e o valor resolvido;
     • ícones: a família inteira (ZoZo.icons), com o desenho de cada um;
     • regras gerais: as convenções do projeto (escritas aqui) e os pontos de quebra lidos do CSS.
   Cada página baixa em Markdown; as janelas também em PNG (ZoZo.captura). Nada sai do aparelho.
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  if (!ZoZo.testeHost) return;
  const { h, mount } = ZoZo.dom;
  const UI = ZoZo.ui;
  const icon = ZoZo.icons.icon;

  const SECOES: Array<[string, string]> = [["janelas", "Janelas"], ["elementos", "Elementos"], ["tipografia", "Tipografia"],
    ["medidas", "Medidas, espaços e movimento"], ["cores", "Cores"], ["regras", "Regras gerais"], ["icones", "Ícones"]];

  const C = {
    pagina: "tw:fixed tw:inset-0 tw:z-[9000] tw:overflow-auto tw:bg-zz-background tw:text-zz-text",
    topo: "tw:sticky tw:top-0 tw:z-10 tw:flex tw:flex-wrap tw:items-center tw:gap-3 tw:px-6 tw:py-3 tw:bg-zz-surface tw:border-b tw:border-zz-border",
    marca: "tw:m-0 tw:text-[15px] tw:font-[650]",
    nav: "tw:flex tw:flex-wrap tw:gap-1",
    navItem: "tw:px-2.5 tw:py-1 tw:rounded-full tw:text-[13px] tw:text-zz-secondary tw:no-underline tw:hover:bg-zz-surface-hover",
    navAtivo: "tw:px-2.5 tw:py-1 tw:rounded-full tw:text-[13px] tw:no-underline tw:bg-zz-primary-soft tw:text-zz-primary tw:font-[620]",
    acoes: "tw:ml-auto tw:flex tw:gap-2",
    corpo: "tw:max-w-[1240px] tw:mx-auto tw:px-6 tw:py-8 tw:flex tw:flex-col tw:gap-8",
    h1: "tw:m-0 tw:text-[26px] tw:font-[650]",
    h2: "tw:m-0 tw:mb-3 tw:text-[18px] tw:font-[650]",
    h3: "tw:m-0 tw:mb-2 tw:text-[14px] tw:font-[650] tw:text-zz-secondary",
    p: "tw:m-0 tw:text-[14px] tw:leading-[1.55] tw:text-zz-secondary tw:max-w-[860px]",
    cartao: "tw:bg-zz-surface tw:border tw:border-zz-border tw:rounded-xl tw:p-5",
    tabela: "tw:w-full tw:border-collapse tw:text-[13px] tw:[&_th]:text-left tw:[&_th]:font-[620] tw:[&_th]:text-zz-secondary tw:[&_th]:px-2 tw:[&_th]:py-1.5 "
      + "tw:[&_th]:border-b tw:[&_th]:border-zz-border tw:[&_td]:px-2 tw:[&_td]:py-1.5 tw:[&_td]:border-b tw:[&_td]:border-zz-border tw:[&_td]:align-top tw:[&_code]:text-[12px]",
    grade: "tw:grid tw:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] tw:gap-3",
    amostra: "tw:flex tw:flex-col tw:gap-1.5 tw:p-3 tw:bg-zz-surface tw:border tw:border-zz-border tw:rounded-lg tw:text-[12px]",
    cor: "tw:h-14 tw:rounded-md tw:border tw:border-zz-border",
    lista: "tw:m-0 tw:pl-5 tw:flex tw:flex-col tw:gap-1.5 tw:text-[14px] tw:leading-[1.5]",
    figura: "tw:m-0 tw:flex tw:flex-col tw:gap-2",
    legenda: "tw:flex tw:items-center tw:gap-3 tw:text-[13px]",
    // quadro do tamanho da tela: o transform faz dele o bloco de contenção dos elementos "fixed" copiados
    quadro: "tw:relative tw:overflow-hidden tw:transform-[translateZ(0)] tw:bg-zz-background tw:border tw:border-zz-border tw:rounded-lg tw:pointer-events-none",
    escala: "tw:[zoom:0.5] tw:w-fit",
    progresso: "tw:fixed tw:left-1/2 tw:top-4 tw:-translate-x-1/2 tw:z-[9100] tw:px-4 tw:py-2 tw:rounded-full tw:bg-zz-text tw:text-white tw:text-[13px] tw:shadow-lg",
  };

  type Pagina = { el: HTMLElement; md: () => string };
  const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
  const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
  const mdCelula = (v: unknown) => String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  const mdTabela = (cab: string[], linhas: unknown[][]) => "| " + cab.join(" | ") + " |\n|" + cab.map(() => "---").join("|") + "|\n"
    + linhas.map((l) => "| " + l.map(mdCelula).join(" | ") + " |").join("\n") + "\n";
  function tabela(cab: string[], linhas: Array<Array<string | Node>>) {
    return h("table", { class: C.tabela }, h("thead", null, h("tr", null, cab.map((c) => h("th", null, c)))),
      h("tbody", null, linhas.map((l) => h("tr", null, l.map((c) => h("td", null, typeof c === "string" ? h("code", null, c) : c))))));
  }
  const secao = (titulo: string, ...filhos: Array<Node | null>) => h("section", { class: C.cartao }, h("h2", { class: C.h2 }, titulo), ...filhos);

  /* ---------------- leitura do CSS carregado ---------------- */
  type Declaracao = { prop: string; valor: string; seletor: string };
  type Css = { declaracoes: Declaracao[]; medias: Map<string, number>; containers: Map<string, number>; keyframes: CSSKeyframesRule[]; fontes: CSSFontFaceRule[]; tokens: Map<string, string> };
  let cacheCss: Css | null = null;
  function lerCss(): Css {
    if (cacheCss) return cacheCss;
    const r: Css = { declaracoes: [], medias: new Map(), containers: new Map(), keyframes: [], fontes: [], tokens: new Map() };
    const somar = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) || 0) + 1);
    const visitar = (regras: CSSRuleList) => {
      for (const regra of Array.from(regras)) {
        if (regra instanceof CSSStyleRule) {
          const st = regra.style;
          for (let i = 0; i < st.length; i++) {
            const prop = st[i], valor = st.getPropertyValue(prop).trim();
            r.declaracoes.push({ prop, valor, seletor: regra.selectorText });
            if (prop.startsWith("--") && /(^|,)\s*:root\b/.test(regra.selectorText)) r.tokens.set(prop, valor);
          }
          if (regra.cssRules && regra.cssRules.length) visitar(regra.cssRules);
        } else if (regra instanceof CSSMediaRule) { somar(r.medias, regra.conditionText); visitar(regra.cssRules); }
        else if (typeof CSSContainerRule !== "undefined" && regra instanceof CSSContainerRule) { somar(r.containers, regra.containerName + " " + regra.containerQuery); visitar(regra.cssRules); }
        else if (regra instanceof CSSKeyframesRule) r.keyframes.push(regra);
        else if (regra instanceof CSSFontFaceRule) r.fontes.push(regra);
        else if ("cssRules" in regra) visitar((regra as CSSGroupingRule).cssRules);
      }
    };
    for (const folha of Array.from(document.styleSheets)) {
      let regras: CSSRuleList | null = null;
      try { regras = folha.cssRules; } catch { regras = null; }
      if (regras) visitar(regras);
    }
    cacheCss = r;
    return r;
  }
  /** Valor resolvido de uma propriedade (var(), calc(), rem → px) medido num elemento de prova (CSSOM: a CSP permite) */
  let prova: HTMLElement | null = null;
  function resolver(prop: string, valor: string): string {
    if (!prova) { prova = h("div", { "aria-hidden": "true" }); prova.style.position = "absolute"; prova.style.visibility = "hidden"; prova.style.width = "100px"; document.body.appendChild(prova); }
    prova.style.cssText = "position:absolute;visibility:hidden;width:100px;border-style:solid;";
    try { prova.style.setProperty(prop, valor); } catch { return valor; }
    const v = getComputedStyle(prova).getPropertyValue(prop).trim();
    return v || valor;
  }
  /** Quantas vezes cada valor aparece nas propriedades que casam com o filtro (mais usados primeiro) */
  function frequencia(filtro: RegExp, limite = 60) {
    const m = new Map<string, { n: number; props: Set<string> }>();
    lerCss().declaracoes.forEach((d) => {
      if (!filtro.test(d.prop) || !d.valor || /^(initial|inherit|unset|revert)$/.test(d.valor)) return;
      const k = d.valor, x = m.get(k) || { n: 0, props: new Set<string>() };
      x.n += 1; x.props.add(d.prop); m.set(k, x);
    });
    return Array.from(m, ([valor, x]) => ({ valor, n: x.n, props: Array.from(x.props).slice(0, 4).join(", "), prop: Array.from(x.props)[0] }))
      .sort((a, b) => b.n - a.n).slice(0, limite).map((x) => Object.assign(x, { resolvido: x.prop.startsWith("--") ? x.valor : resolver(x.prop, x.valor) }));
  }
  const tokens = (filtro: RegExp) => Array.from(lerCss().tokens).filter(([n]) => filtro.test(n))
    .map(([nome, bruto]) => ({ nome, bruto, valor: getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || bruto }));

  /* ---------------- Janelas ---------------- */
  async function janelas(ctx: ContextoApp): Promise<Pagina> {
    const itens = ZoZo.teste ? ZoZo.teste.catalogo(ctx).filter((i) => i.tipo !== "externo") : [];
    const fotos: Array<{ item: ItemCatalogoTeste; quadro: HTMLElement | null; texto: string; erro: string | null }> = [];
    const aviso = h("div", { class: C.progresso, role: "status" }, "Preparando…");
    document.body.appendChild(aviso);
    const pagina = document.querySelector<HTMLElement>("[data-design-pagina]");
    if (pagina) pagina.hidden = true;                         // as janelas abrem no app, por baixo; a página volta no fim
    for (let i = 0; i < itens.length; i++) {
      const item = itens[i];
      aviso.textContent = "Fotografando " + (i + 1) + " de " + itens.length + ": " + item.rotulo;
      await limpar(ctx);
      const antes = new Set(Array.from(document.body.children));
      const janelasAntes = new Set(Array.from(document.querySelectorAll(".modal-overlay")));
      let erro: string | null = null;
      // confirmações devolvem uma promessa que só termina quando a pessoa responde: espera no máximo 2,5 s
      try { await Promise.race([Promise.resolve(item.abrir()), espera(2500)]); } catch (e) { erro = String((e && (e as Error).message) || "não abriu"); }
      await espera(item.tipo === "tela" ? 1100 : 950);
      const novos = Array.from(document.body.children).filter((e) => !antes.has(e) && e !== aviso);
      const alvo = novos.find((e) => e.textContent && e.textContent.trim()) as HTMLElement | undefined
        || (item.tipo === "painel" ? document.querySelector<HTMLElement>(".detail") : null)
        || document.querySelector<HTMLElement>("main") || null;
      forcarAbertos(janelasAntes);
      fotos.push({ item, erro, quadro: erro ? null : quadroDaTela(aviso), texto: alvo ? (alvo.innerText || "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 1500) : "" });
    }
    await limpar(ctx);
    aviso.remove();
    if (pagina) pagina.hidden = false;

    const porSecao = Array.from(new Set(itens.map((i) => i.secao)));
    const el = h("div", { class: "tw:flex tw:flex-col tw:gap-8" },
      h("p", { class: C.p }, "Cada quadro é a tela inteira no momento em que a janela abriu (conta de exemplo, " + window.innerWidth + " × " + window.innerHeight
        + " px), em metade do tamanho. \"Baixar PNG\" gera a imagem no tamanho real. Para fotografar de novo, recarregue a guia e deixe-a na frente enquanto roda (leva uns dois minutos). As etapas de entrada (login, cadastro e recuperação) não entram porque encerram a sessão; veja-as pelo painel."),
      ...porSecao.map((s) => secao(s, h("div", { class: "tw:flex tw:flex-col tw:gap-6" },
        ...fotos.filter((f) => f.item.secao === s).map((f) => {
          const nome = slug([f.item.secao, f.item.sub || "", f.item.rotulo].join(" "));
          const baixar = f.quadro ? UI.Button("Baixar PNG", { size: "sm", icon: "baixar", onClick: (e) => {
            const b = e.currentTarget as HTMLButtonElement, q = f.quadro as HTMLElement, escala = q.parentElement as HTMLElement;
            b.disabled = true; escala.classList.remove("tw:[zoom:0.5]");      // a imagem sai no tamanho real
            ZoZo.captura.png(q, "zozo-" + nome + ".png").catch(() => ctx.toast("Não deu para gerar a imagem.", { tone: "error" }))
              .finally(() => { escala.classList.add("tw:[zoom:0.5]"); b.disabled = false; });
          } }) : null;
          return h("figure", { class: C.figura },
            h("figcaption", { class: C.legenda }, h("strong", null, (f.item.sub ? f.item.sub + " › " : "") + f.item.rotulo),
              h("span", { class: "tw:text-zz-secondary" }, f.item.tipo), baixar),
            f.erro ? h("p", { class: C.p }, "Não abriu: " + f.erro) : h("div", { class: C.escala }, f.quadro));
        })))));
    const md = () => "# ZoZo · Janelas\n\nTela de referência: " + window.innerWidth + " × " + window.innerHeight + " px, conta de exemplo. As imagens saem pelo botão \"Baixar PNG\" de cada quadro.\n\n"
      + porSecao.map((s) => "## " + s + "\n\n" + fotos.filter((f) => f.item.secao === s).map((f) =>
        "### " + (f.item.sub ? f.item.sub + " › " : "") + f.item.rotulo + " (" + f.item.tipo + ")\n\n"
        + (f.erro ? "Não abriu: " + f.erro + "\n" : "Imagem: `zozo-" + slug([f.item.secao, f.item.sub || "", f.item.rotulo].join(" ")) + ".png`\n\nTexto visível:\n\n```\n" + f.texto + "\n```\n")).join("\n")).join("\n");
    return { el, md };
  }
  /**
   * O estado "aberto" de janelas, fatura e painel do 2FA entra num quadro de animação (requestAnimationFrame), que o
   * navegador pausa com a guia em segundo plano: as que abriram agora ganham a classe na hora; as que já estavam
   * (fechando, à espera do timer, que também atrasa em segundo plano) saem antes da cópia.
   */
  function forcarAbertos(janelasAntes: Set<Element>) {
    document.querySelectorAll(".modal-overlay").forEach((o) => { if (janelasAntes.has(o)) o.remove(); else o.classList.add("is-visible"); });
    document.querySelectorAll<HTMLElement>("#boleto-root > *").forEach((b) => { if (!b.inert) b.classList.add("is-open"); });
    document.querySelectorAll(".p2fa").forEach((p) => p.classList.add("is-aberto"));
  }
  /** Cópia do que está na tela agora (o app e as camadas por cima), num quadro do tamanho da janela do navegador */
  function quadroDaTela(ignorar: Element): HTMLElement {
    const quadro = h("div", { class: C.quadro, "aria-hidden": "true" });
    quadro.style.width = window.innerWidth + "px"; quadro.style.height = window.innerHeight + "px";
    Array.from(document.body.children).forEach((e) => {
      if (e === ignorar || e.hasAttribute("data-design-pagina") || /^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/.test(e.tagName)) return;
      const c = e.cloneNode(true) as HTMLElement;
      [c, ...Array.from(c.querySelectorAll<HTMLElement>("[inert], [id]"))].forEach((x) => { x.removeAttribute("inert"); x.removeAttribute("id"); });
      quadro.appendChild(c);
    });
    return quadro;
  }
  /** Fecha o que o item anterior abriu (Esc, botões de fechar, painel lateral) */
  async function limpar(ctx: ContextoApp) {
    for (let i = 0; i < 3; i++) {
      const alvo = document.activeElement || document.body;
      alvo.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await espera(120);
    }
    const fechar = document.querySelector<HTMLButtonElement>("[aria-label='Fechar o Zo']");
    if (fechar) fechar.click();
    try { ctx.detail.close({ silencioso: true }); } catch { /* ok */ }
    await espera(320);
  }

  /* ---------------- Elementos ---------------- */
  function elementos(): Pagina {
    const comp = ZoZo.teste ? ZoZo.teste.componentes() : h("div");
    const graf = ZoZo.teste ? ZoZo.teste.graficos() : h("div");
    // na página não há janela: sem a altura máxima e a rolagem interna das galerias do painel
    [comp, graf].forEach((g) => { g.className = g.className.replace(/tw:max-h-\S+|tw:overflow-y-auto/g, ""); });
    const el = h("div", { class: "tw:flex tw:flex-col tw:gap-8" },
      h("p", { class: C.p }, "Os componentes de verdade do app (mesmas funções e classes das telas). No Markdown, cada peça leva as medidas calculadas."),
      secao("Componentes", comp), secao("Gráficos", graf));
    const PROPS = ["display", "height", "padding", "border", "border-radius", "background", "color", "font-size", "font-weight", "line-height", "gap", "box-shadow"];
    const md = () => "# ZoZo · Elementos\n\n" + Array.from(comp.querySelectorAll<HTMLElement>("section")).map((s) => {
      const titulo = (s.querySelector("p") || { textContent: "" }).textContent || "";
      const pecas = Array.from((s.lastElementChild || s).children) as HTMLElement[];
      return "## " + titulo + "\n\n" + pecas.map((p) => {
        const cs = getComputedStyle(p);
        const curta = PROPS.map((n) => [n, cs.getPropertyValue(n)] as const).filter(([, v]) => v && !/^(none|normal|0px|rgba\(0, 0, 0, 0\)|auto)$/.test(v) && !/^0px none/.test(v));
        return "- **" + ((p.innerText || p.getAttribute("aria-label") || p.tagName).trim().replace(/\s+/g, " ").slice(0, 60) || p.tagName.toLowerCase()) + "** (`<" + p.tagName.toLowerCase() + ">`)\n"
          + curta.map(([n, v]) => "  - " + n + ": `" + v + "`").join("\n");
      }).join("\n") + "\n";
    }).join("\n");
    return { el, md };
  }

  /* ---------------- Tipografia ---------------- */
  function tipografia(): Pagina {
    const css = lerCss();
    const familia = getComputedStyle(document.body).fontFamily;
    const fontes = css.fontes.map((f) => ({ familia: f.style.getPropertyValue("font-family").replace(/"/g, ""), peso: f.style.getPropertyValue("font-weight"),
      estilo: f.style.getPropertyValue("font-style") || "normal", arquivo: (/url\(["']?([^"')]+)/.exec(f.style.getPropertyValue("src")) || ["", ""])[1].split("/").pop() || "" }));
    // papéis de texto: as classes de título, rótulo, valor… das peças e da estrutura, medidas numa amostra
    const papeis: Array<{ nome: string; amostra: HTMLElement; medidas: string[] }> = [];
    const caixaAmostras = h("div", { class: "tw:flex tw:flex-col tw:gap-2" });
    const fontesDeClasses: Array<[string, Record<string, unknown>]> = [["pecas", ZoZo.pecas as unknown as Record<string, unknown>], ["estrutura", ZoZo.estrutura as unknown as Record<string, unknown>]];
    fontesDeClasses.forEach(([grupo, obj]) => Object.entries(obj).forEach(([k, v]) => {
      if (typeof v !== "string" || !/titulo|rotulo|sub|nota|texto|valor|nome|legenda|data/i.test(k)) return;
      const a = h("span", { class: v }, "Saldo de outubro R$ 1.234,56");
      papeis.push({ nome: grupo + "." + k, amostra: a, medidas: [] });
    }));
    const el = h("div", { class: "tw:flex tw:flex-col tw:gap-8" },
      secao("Família", h("p", { class: C.p }, "font-family do corpo: "), h("code", null, familia),
        tabela(["Família", "Peso", "Estilo", "Arquivo"], fontes.map((f) => [f.familia, f.peso, f.estilo, f.arquivo]))),
      secao("Tokens de texto", tabela(["Token", "Valor"], tokens(/font|line-height|letter/).map((t) => [t.nome, t.valor]))),
      secao("Papéis de texto (classes das peças e da estrutura)", h("p", { class: C.p }, "Cada linha mostra uma amostra com a classe aplicada e as medidas calculadas."), caixaAmostras),
      secao("Tamanhos usados no CSS", tabela(["Tamanho", "Em px", "Vezes"], frequencia(/^font-size$/).map((x) => [x.valor, x.resolvido, String(x.n)]))),
      secao("Pesos usados no CSS", tabela(["Peso", "Vezes"], frequencia(/^font-weight$/).map((x) => [x.valor, String(x.n)]))),
      secao("Altura de linha e espaçamento entre letras", tabela(["Propriedade", "Valor", "Resolvido", "Vezes"],
        frequencia(/^(line-height|letter-spacing)$/).map((x) => [x.props, x.valor, x.resolvido, String(x.n)]))));
    // as amostras precisam estar na página para medir
    setTimeout(() => {
      mount(caixaAmostras, papeis.map((p) => {
        const linha = h("div", { class: "tw:grid tw:grid-cols-[220px_1fr_340px] tw:items-center tw:gap-4 tw:py-1.5 tw:border-b tw:border-zz-border" },
          h("code", { class: "tw:text-[12px]" }, p.nome), p.amostra, h("span", { class: "tw:text-[12px] tw:text-zz-secondary" }));
        return linha;
      }));
      papeis.forEach((p) => {
        const cs = getComputedStyle(p.amostra);
        p.medidas = [cs.fontSize, cs.fontWeight, cs.lineHeight, cs.letterSpacing, cs.textTransform, cs.color];
        const alvo = p.amostra.nextElementSibling as HTMLElement | null;
        if (alvo) alvo.textContent = p.medidas.join(" · ");
      });
    }, 0);
    const md = () => "# ZoZo · Tipografia\n\nfont-family do corpo: `" + familia + "`\n\n## Arquivos de fonte\n\n" + mdTabela(["Família", "Peso", "Estilo", "Arquivo"], fontes.map((f) => [f.familia, f.peso, f.estilo, f.arquivo]))
      + "\n## Tokens\n\n" + mdTabela(["Token", "Valor"], tokens(/font|line-height|letter/).map((t) => [t.nome, t.valor]))
      + "\n## Papéis de texto\n\n" + mdTabela(["Classe", "Tamanho", "Peso", "Altura de linha", "Letras", "Caixa", "Cor"], papeis.map((p) => [p.nome, ...p.medidas]))
      + "\n## Tamanhos usados\n\n" + mdTabela(["Tamanho", "Em px", "Vezes"], frequencia(/^font-size$/).map((x) => [x.valor, x.resolvido, x.n]))
      + "\n## Pesos usados\n\n" + mdTabela(["Peso", "Vezes"], frequencia(/^font-weight$/).map((x) => [x.valor, x.n]))
      + "\n## Altura de linha e espaçamento entre letras\n\n" + mdTabela(["Propriedade", "Valor", "Resolvido", "Vezes"], frequencia(/^(line-height|letter-spacing)$/).map((x) => [x.props, x.valor, x.resolvido, x.n]));
    return { el, md };
  }

  /* ---------------- Medidas, espaços e movimento ---------------- */
  const GRUPOS_MEDIDAS: Array<[string, RegExp]> = [
    ["Gaps", /^(gap|row-gap|column-gap)$/], ["Paddings", /^padding/], ["Margins", /^margin/], ["Larguras e alturas", /^(width|height|min-width|max-width|min-height|max-height)$/],
    ["Bordas (espessura)", /^border(-(top|right|bottom|left|block|inline)(-start|-end)?)?-width$/], ["Raios (border-radius)", /radius$/],
    ["Sombras", /^(box-shadow|--tw-shadow)$/], ["Transições", /^transition/], ["Animações", /^animation/], ["Camadas (z-index)", /^z-index$/],
  ];
  function medidas(): Pagina {
    const css = lerCss();
    const tk = tokens(/radius|space|shadow|duration|easing|width|height|gutter|max|row/);
    const amostra = (t: { nome: string; valor: string }) => {
      const caixa = h("div", { class: "tw:h-12 tw:bg-zz-surface tw:border tw:border-zz-border" });
      if (/radius/.test(t.nome)) { caixa.style.borderRadius = t.valor; caixa.style.width = "72px"; }
      else if (/shadow/.test(t.nome)) { caixa.style.boxShadow = t.valor; caixa.style.width = "100%"; caixa.style.borderRadius = "12px"; }
      else if (/space|gutter/.test(t.nome)) { caixa.style.width = t.valor; caixa.style.background = "var(--color-primary)"; caixa.style.height = "12px"; }
      else return null;
      return caixa;
    };
    const el = h("div", { class: "tw:flex tw:flex-col tw:gap-8" },
      secao("Tokens de medida, sombra e movimento", h("div", { class: C.grade }, ...tk.map((t) => h("div", { class: C.amostra }, amostra(t), h("code", null, t.nome), h("span", null, t.valor))))),
      secao("Pontos de quebra (@media)", tabela(["Condição", "Regras"], Array.from(css.medias).sort((a, b) => b[1] - a[1]).map(([c, n]) => [c, String(n)]))),
      secao("Consultas de contêiner (@container)", tabela(["Contêiner e condição", "Regras"], Array.from(css.containers).sort((a, b) => b[1] - a[1]).map(([c, n]) => [c, String(n)]))),
      ...GRUPOS_MEDIDAS.map(([titulo, re]) => secao(titulo + " usados no CSS", tabela(["Valor", "Resolvido", "Propriedades", "Vezes"],
        frequencia(re, 50).map((x) => [x.valor, x.resolvido, x.props, String(x.n)])))),
      secao("Animações (@keyframes)", tabela(["Nome", "Quadros"], css.keyframes.map((k) => [k.name, Array.from(k.cssRules).map((q) => q.cssText).join(" ")]))));
    const md = () => "# ZoZo · Medidas, espaços e movimento\n\n## Tokens\n\n" + mdTabela(["Token", "Valor"], tk.map((t) => [t.nome, t.valor]))
      + "\n## Pontos de quebra (@media)\n\n" + mdTabela(["Condição", "Regras"], Array.from(css.medias).sort((a, b) => b[1] - a[1]))
      + "\n## Consultas de contêiner (@container)\n\n" + mdTabela(["Contêiner e condição", "Regras"], Array.from(css.containers).sort((a, b) => b[1] - a[1]))
      + GRUPOS_MEDIDAS.map(([titulo, re]) => "\n## " + titulo + "\n\n" + mdTabela(["Valor", "Resolvido", "Propriedades", "Vezes"], frequencia(re, 50).map((x) => [x.valor, x.resolvido, x.props, x.n]))).join("")
      + "\n## @keyframes\n\n" + css.keyframes.map((k) => "```css\n" + k.cssText + "\n```").join("\n\n") + "\n";
    return { el, md };
  }

  /* ---------------- Cores ---------------- */
  const EH_COR = /^(#|rgb|hsl|oklch|oklab|color-mix|linear-gradient|radial-gradient)/i;
  function cores(): Pagina {
    const tk = tokens(/.*/).filter((t) => EH_COR.test(t.valor));
    const grupos = Array.from(new Set(tk.map((t) => t.nome.replace(/^--/, "").split("-")[0])));
    const usadas = frequencia(/^(color|background-color|background-image|border(-(top|right|bottom|left))?-color|fill|stroke|outline-color|--tw-.*color)$/, 80)
      .filter((x) => !/^(transparent|currentcolor|inherit)$/i.test(x.valor));
    const quadrado = (valor: string) => { const q = h("div", { class: C.cor }); q.style.background = valor; return q; };
    const el = h("div", { class: "tw:flex tw:flex-col tw:gap-8" },
      h("p", { class: C.p }, "Tokens de cor de :root (não há tema escuro). Contraste: textos que informam ≥ 4,5:1 (WCAG 2.2 AA); exceções por escolha do produto: o cinza --color-text-cinza, as pílulas de variação, o vermelho dos menus e o botão vermelho."),
      ...grupos.map((g) => secao(g, h("div", { class: C.grade }, ...tk.filter((t) => t.nome.replace(/^--/, "").startsWith(g + "-") || t.nome === "--" + g)
        .map((t) => h("div", { class: C.amostra }, quadrado(t.valor), h("code", null, t.nome), h("span", null, t.valor)))))),
      secao("Cores mais usadas no CSS (inclusive fora dos tokens)", tabela(["Valor", "Resolvido", "Propriedades", "Vezes", ""],
        usadas.map((x) => [x.valor, x.resolvido, x.props, String(x.n), quadrado(x.resolvido)]))));
    const md = () => "# ZoZo · Cores\n\nSem tema escuro. Contraste: texto que informa ≥ 4,5:1 (WCAG 2.2 AA); exceções por escolha do produto: `--color-text-cinza`, pílulas de variação, vermelho dos menus e botão vermelho.\n\n"
      + grupos.map((g) => "## " + g + "\n\n" + mdTabela(["Token", "Valor"], tk.filter((t) => t.nome.replace(/^--/, "").startsWith(g + "-") || t.nome === "--" + g).map((t) => [t.nome, t.valor]))).join("\n")
      + "\n## Mais usadas no CSS\n\n" + mdTabela(["Valor", "Resolvido", "Propriedades", "Vezes"], usadas.map((x) => [x.valor, x.resolvido, x.props, x.n]));
    return { el, md };
  }

  /* ---------------- Regras gerais ---------------- */
  const REGRAS: Array<[string, string[]]> = [
    ["Identidade", [
      "Roxo da marca --color-primary (#6948D8); botões principais com o gradiente --botao-roxo (de #8063EE para #6948D8, de cima para baixo).",
      "Menu lateral roxo (--sidebar-bg) com texto branco; o mesmo roxo na barra da fatura e no câmbio.",
      "Fundo da página --color-background (#f8f8fa) e superfícies brancas (--color-surface) com borda clara --color-border.",
      "Logo: o \"Z\" (assets/img/zozo-logo.svg); na fatura, zozo-fatura.svg."]],
    ["Estrutura e grade", [
      "Menu lateral de 264 px (--sidebar-width); até 900 px de largura vira só ícones (64 px) e o respiro da página cai de 24 px para 16 px (--page-gutter).",
      "Barra superior de 56 px (--topbar-height). Painel lateral de detalhes com largura clamp(440px, 30vw, 580px) (--detail-width).",
      "Linhas de lista com 36 px (--row-height) ou 54 px (--row-height-tall).",
      "Colunas que mudam pela largura da área (container queries): variantes area620, area460, area420 e area340; nas Configurações, ate700, area560 e area480.",
      "Fatura impressa em folha A4: 794 × 1123 px, margens de 64 × 68 px."]],
    ["Tipografia", [
      "Família Matter (Regular 450, Medium 550, SemiBold e Bold), com Segoe UI, system-ui e Roboto de reserva.",
      "Texto base 15 px (--font-size-md) com altura de linha 1,45; os rótulos e textos secundários usam 12 a 14 px.",
      "Valores em dinheiro: o símbolo (R$, € ou US$) e o % aparecem menores e no alto do número (core/simbolos.ts)."]],
    ["Espaços, raios e sombras", [
      "Escala de espaço de 4 px: 4, 8, 12, 16, 20, 24, 32 e 48 (--space-1 a --space-8).",
      "Raios: 8 px (--radius-small), 12 px (--radius-medium) e pílula 999 px (--radius-pill). Cartões grandes e janelas usam 12 a 16 px.",
      "Sombras só para elevação: cartão quase plano (--shadow-card), menus (--shadow-popover), janelas (--shadow-modal) e o papel da fatura (--shadow-paper)."]],
    ["Movimento", [
      "Durações de 160 ms (--duration-fast) e 280 ms (--duration-medium) com a curva cubic-bezier(0.22, 0.61, 0.36, 1) (--easing); gráficos animam em 900 ms.",
      "Listas entram em sequência pela posição dos filhos (css/movimento.css). Janelas e painéis deslizam e esmaecem ao abrir e fechar.",
      "Respeita prefers-reduced-motion."]],
    ["Cores com significado", [
      "Entrada e alta em verde (--color-income, --color-pilula-sobe); saída e queda em vermelho (--color-pilula-desce); sem variação em cinza.",
      "Ativos em azul (--color-assets) e passivos em laranja (--color-liabilities) nos gráficos.",
      "Avisos: erro vermelho, alerta laranja, sucesso verde, sempre com fundo translúcido da mesma cor.",
      "16 cores de paleta (--palette-01 a --palette-16) para contas, categorias e perfis, escolhidas pela pessoa."]],
    ["Componentes", [
      "Botões: primário (gradiente roxo), secundário (borda), perigo (vermelho), perigo discreto e texto; tamanho normal e sm.",
      "Etiquetas de categoria e perfil em pílula com a cor da paleta; chips de situação (Pago, Pendente, Arquivado).",
      "Campos com rótulo em cima; listas (select) com a seta própria (--seta-select); interruptores e caixas de seleção próprios.",
      "Estados de tela sempre previstos: vazio (ícone + frase), erro (com tentar de novo) e carregando (skeleton).",
      "Janelas modais com título, corpo e botões no rodapé (Cancelar à esquerda do principal); confirmações de ação sem volta pedem frase, senha ou código."]],
    ["Ícones", [
      "Uma família só, de traço: 24 × 24, stroke 1,75, pontas e cantos arredondados, na cor do texto (currentColor). Tamanhos usuais 14 a 18 px."]],
    ["Acessibilidade", [
      "WCAG 2.2 AA conferida com axe-core em todas as telas (desktop e celular).",
      "Texto que informa com contraste ≥ 4,5:1, exceto as cores pedidas pelo produto (cinza --color-text-cinza, pílulas de variação, vermelho dos menus e botão vermelho).",
      "O nome acessível começa pelo texto visível; nada interativo dentro de botão; foco visível em roxo."]],
    ["Texto (tom de voz)", [
      "Português do Brasil, falando com \"você\", frases curtas, sem jargão.",
      "Nas mensagens e novidades: sem travessões e sem dois-pontos.",
      "Valores no formato R$ 1.234,56 e datas como 31 Out 2026 (abreviadas) ou 31/10/2026."]],
    ["Implementação", [
      "Tailwind CSS com prefixo tw: e sem preflight; o CSS legado (tokens, base, movimento, impressão) fica na camada legado.",
      "Cores, tamanhos e tipografia só pelos tokens de css/tokens.css.",
      "Nada de innerHTML nem estilos inline (CSP); o DOM é montado por ZoZo.dom (h, s)."]],
  ];
  function regras(): Pagina {
    const css = lerCss();
    const el = h("div", { class: "tw:flex tw:flex-col tw:gap-6" },
      ...REGRAS.map(([titulo, itens]) => secao(titulo, h("ul", { class: C.lista }, itens.map((i) => h("li", null, i))))),
      secao("Pontos de quebra lidos do CSS", tabela(["@media", "Regras"], Array.from(css.medias).sort((a, b) => b[1] - a[1]).map(([c, n]) => [c, String(n)]))));
    const md = () => "# ZoZo · Regras gerais de design\n\n" + REGRAS.map(([titulo, itens]) => "## " + titulo + "\n\n" + itens.map((i) => "- " + i).join("\n")).join("\n\n")
      + "\n\n## Pontos de quebra (@media)\n\n" + mdTabela(["Condição", "Regras"], Array.from(css.medias).sort((a, b) => b[1] - a[1]));
    return { el, md };
  }

  /* ---------------- Ícones ---------------- */
  function icones(): Pagina {
    const nomes = ZoZo.icons.names.slice().sort();
    const el = h("div", { class: "tw:flex tw:flex-col tw:gap-6" },
      h("p", { class: C.p }, nomes.length + " ícones. Traço 24 × 24, stroke 1,75, pontas e cantos arredondados, na cor do texto (currentColor)."),
      secao("Família", h("div", { class: "tw:grid tw:grid-cols-[repeat(auto-fill,minmax(120px,1fr))] tw:gap-3" },
        ...nomes.map((n) => h("div", { class: C.amostra + " tw:items-center tw:text-center" }, icon(n, { size: 24 }), h("code", null, n))))));
    const md = () => "# ZoZo · Ícones\n\n" + nomes.length + " ícones. Traço 24 × 24, `stroke-width` 1.75, `stroke-linecap` e `stroke-linejoin` round, `fill` none, `stroke` currentColor.\n\n"
      + nomes.map((n) => "## " + n + "\n\n```svg\n" + icon(n, { size: 24 }).outerHTML + "\n```").join("\n\n") + "\n";
    return { el, md };
  }

  /* ---------------- página ---------------- */
  async function mostrar(secaoId: string, ctx: ContextoApp) {
    const id = SECOES.some(([s]) => s === secaoId) ? secaoId : "regras";
    const titulo = (SECOES.find(([s]) => s === id) || ["", ""])[1];
    document.title = "ZoZo · Design · " + titulo;
    const anterior = document.querySelector("[data-design-pagina]");
    if (anterior) anterior.remove();
    const conteudo = h("div", { class: C.corpo }, h("h1", { class: C.h1 }, titulo), h("p", { class: C.p }, "Montando…"));
    let pagina: Pagina | null = null;
    const copiar = UI.Button("Copiar Markdown", { size: "sm", icon: "copiar", onClick: (e) => {
      const b = e.currentTarget as HTMLElement;
      if (pagina) navigator.clipboard.writeText(pagina.md()).then(() => UI.confirmarNoBotao(b, "Copiado"), () => ctx.toast("Não foi possível copiar.", { tone: "error" }));
    } });
    const baixar = UI.Button("Baixar .md", { size: "sm", icon: "baixar", onClick: () => {
      if (pagina) ZoZo.captura.baixar(new Blob([pagina.md()], { type: "text/markdown;charset=utf-8" }), "zozo-design-" + id + ".md");
    } });
    copiar.disabled = baixar.disabled = true;
    const raiz = h("div", { class: C.pagina, "data-design-pagina": "" },
      h("header", { class: C.topo },
        h("p", { class: C.marca }, "ZoZo · Design"),
        h("nav", { class: C.nav, "aria-label": "Seções de design" }, SECOES.map(([s, r]) => h("a", { href: "#design/" + s, class: s === id ? C.navAtivo : C.navItem }, r))),
        h("div", { class: C.acoes }, copiar, baixar)),
      conteudo);
    document.body.appendChild(raiz);
    const montar: Record<string, () => Pagina | Promise<Pagina>> = { janelas: () => janelas(ctx), elementos, tipografia, medidas, cores, regras, icones };
    try {
      pagina = await montar[id]();
      mount(conteudo, h("h1", { class: C.h1 }, titulo), pagina.el);
      copiar.disabled = baixar.disabled = false;
    } catch (e) {
      mount(conteudo, h("h1", { class: C.h1 }, titulo), h("p", { class: C.p }, "Não deu para montar esta página: " + ((e && (e as Error).message) || "erro")));
    }
  }

  ZoZo.design = { mostrar };
})(window.ZoZo);

export {};   // módulo: carregado sob demanda por app.ts (import dinâmico)
