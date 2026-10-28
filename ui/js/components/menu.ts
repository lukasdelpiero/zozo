/* =============================================================
   ZoZo — Menu suspenso com submenus (filtros, "⋯" dos painéis,
   barra de seleção e botões "+")
   ------------------------------------------------------------
   ZoZo.menu.abrir(anchor, itens, opts)
     itens: [
       { label, icone, onClick, perigo, check, valor, desabilitado, manterAberto,
         submenu: [itens] | () => [itens] | { render(el, api), largura } },
       { separador: true },
       { secao: "Título" },
     ]
     opts: { posicao: "direita" | "esquerda" | "acima", largura, label }
   Submenus abrem ao passar o mouse (ou com seta → / Enter) ao lado do
   menu, do lado que couber na tela. Visual em Tailwind (components/estrutura.ts:
   classes menu*, também usadas pelas páginas que montam conteúdo próprio).
   TypeScript: tipos em src/globais.d.ts (ZoZoMenu, ItemMenu, OpcoesMenu).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const { h, mount } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const E = ZoZo.estrutura;

  type Painel = { el: HTMLElement; nivel: number; origem?: HTMLElement; desenhar?: () => void };
  type Ativo = { anchor: HTMLElement; niveis: Painel[]; fora?: (e: MouseEvent) => void; tecla?: (e: KeyboardEvent) => void; redimensionar?: () => void };
  let ativo: Ativo | null = null;

  function fechar(devolverFoco?: boolean) {
    if (!ativo) return;
    const a = ativo; ativo = null;
    a.niveis.forEach((p) => p.el.remove());
    a.anchor.setAttribute("aria-expanded", "false");
    a.anchor.classList.remove("is-open");
    if (a.fora) document.removeEventListener("mousedown", a.fora, true);
    if (a.tecla) document.removeEventListener("keydown", a.tecla, true);
    if (a.redimensionar) window.removeEventListener("resize", a.redimensionar);
    if (devolverFoco && a.anchor.isConnected) a.anchor.focus();
  }

  /** Fecha os níveis acima de "nivel" */
  function fecharAcima(nivel: number) {
    while (ativo && ativo.niveis.length > nivel + 1) {
      const p = ativo.niveis.pop();
      if (!p) break;
      p.el.remove();
      if (p.origem) p.origem.classList.remove("is-open");
    }
  }

  function posicionar(el: HTMLElement, ref: HTMLElement, modo: string) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = el.offsetWidth, hgt = el.offsetHeight;
    let left: number, top: number;
    if (modo === "lado") {                // submenu ao lado do item
      const pai = (ref.closest(".menu") || ref).getBoundingClientRect();
      const r = ref.getBoundingClientRect();
      left = pai.right + 4 + w <= vw - 8 ? pai.right + 4 : pai.left - w - 4;
      top = Math.min(Math.max(8, r.top - 6), vh - hgt - 8);
    } else {
      const r = ref.getBoundingClientRect();
      left = modo === "esquerda" ? r.left : r.right - w;
      top = modo === "acima" ? r.top - hgt - 6 : r.bottom + 6;
      if (modo === "acima" && top < 8) top = r.bottom + 6;
      if (modo !== "acima" && top + hgt > vh - 8) top = Math.max(8, r.top - hgt - 6);
    }
    el.style.left = Math.max(8, Math.min(vw - w - 8, left)) + "px";
    el.style.top = Math.max(8, top) + "px";
  }

  /** Menus flutuantes ficam numa região própria (landmark): leitor de tela e auditoria sabem onde estão */
  function camada(): HTMLElement {
    let c = document.getElementById("camada-menus");
    if (!c) { c = h("div", { id: "camada-menus", role: "region", "aria-label": "Menus" }); document.body.appendChild(c); }
    return c;
  }

  function resolver(sub: ItensMenu | undefined): ItemMenu[] | ConteudoMenu | undefined { return typeof sub === "function" ? sub() : sub; }

  function criarPainel(itens: ItensMenu, nivel: number, opts: OpcoesMenu): Painel {
    const el = h("div", { class: [E.menuFlutuante, opts.class], role: opts.papel || "menu", "aria-label": opts.label || "Menu" });
    if (opts.largura) el.style.width = opts.largura + "px";
    const painel: Painel = { el, nivel };
    const api: ApiMenu = {
      fechar: () => fechar(true),
      atualizar: () => desenhar(),
      voltar: () => { fecharAcima(nivel - 1); },
    };

    function desenhar() {
      const conteudo = resolver(itens);
      if (conteudo && !Array.isArray(conteudo)) {
        mount(el);
        conteudo.render(el, api);
        return;
      }
      mount(el, (conteudo || []).map((it) => {
        if (it.separador) return h("div", { class: E.menuSeparador, role: "separator" });
        if (it.secao) return h("div", { class: E.menuSecao }, it.secao);
        if (it.render) return it.render(api);
        const btn = h("button", {
          // item marcável = menuitemradio (aria-checked não vale em menuitem simples)
          type: "button", role: it.check === undefined ? "menuitem" : "menuitemradio", class: [it.perigo ? E.menuItemPerigo : E.menuItem, it.check && "is-checked"],
          disabled: it.desabilitado, "aria-haspopup": it.submenu ? "menu" : undefined,
          "aria-checked": it.check === undefined ? undefined : String(!!it.check),
        },
          it.check !== undefined && opts.checkEsquerda ? h("span", { class: E.menuMarcaEsquerda }, it.check ? icon("check", { size: 14, stroke: 2.25 }) : null) : null,
          it.icone ? icon(it.icone, { size: 16, class: E.menuIcone }) : null,
          it.descricao ? h("span", { class: E.menuRotuloDuplo }, h("span", null, it.label), h("small", { class: E.menuRotuloDetalhe }, it.descricao)) : h("span", { class: E.menuRotulo }, it.label),
          it.valor ? h("span", { class: E.menuContador }, it.valor) : null,
          it.check && !opts.checkEsquerda ? icon("check", { size: 14, stroke: 2.25, class: E.menuMarca }) : null,
          it.submenu ? icon("chevron-right", { size: 14, class: E.menuSeta }) : null);

        if (it.submenu) {
          const sub = it.submenu;
          let timer: ReturnType<typeof setTimeout> | undefined;
          const abrirSub = (foco: boolean) => {
            if (!ativo) return;
            if (ativo.niveis[nivel + 1] && ativo.niveis[nivel + 1].origem === btn) return;
            fecharAcima(nivel);
            const conteudoSub = resolver(sub);
            const largura = (conteudoSub && !Array.isArray(conteudoSub) ? conteudoSub.largura : undefined) || it.larguraSub || opts.larguraSub;
            const subOpts: OpcoesMenu = Object.assign({}, opts, { class: "menu--sub", largura, checkEsquerda: it.checkEsquerda });
            const filho = criarPainel(sub, nivel + 1, subOpts);
            filho.origem = btn;
            btn.classList.add("is-open");
            camada().appendChild(filho.el);
            ativo.niveis.push(filho);
            posicionar(filho.el, btn, "lado");
            if (foco) { const f = filho.el.querySelector<HTMLElement>("input, button"); if (f) f.focus(); }
          };
          btn.addEventListener("mouseenter", () => { clearTimeout(timer); timer = setTimeout(() => abrirSub(false), 90); });
          btn.addEventListener("mouseleave", () => clearTimeout(timer));
          btn.addEventListener("click", () => abrirSub(true));
          btn.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") { e.preventDefault(); abrirSub(true); } });
        } else {
          btn.addEventListener("mouseenter", () => fecharAcima(nivel));
          btn.addEventListener("click", () => {
            if (!it.manterAberto) fechar(false);
            if (it.onClick) it.onClick(api);
            if (it.manterAberto && ativo) desenhar();
          });
        }
        return btn;
      }));
    }
    desenhar();
    painel.desenhar = desenhar;
    return painel;
  }

  function abrir(anchor: HTMLElement, itens: ItensMenu, opts?: OpcoesMenu): void {
    const o = opts || {};
    if (ativo && ativo.anchor === anchor) { fechar(); return; }
    fechar();

    const estado: Ativo = { anchor, niveis: [] };
    ativo = estado;
    const raiz = criarPainel(itens, 0, o);
    camada().appendChild(raiz.el);
    estado.niveis.push(raiz);
    posicionar(raiz.el, anchor, o.posicao || "direita");
    anchor.setAttribute("aria-expanded", "true");
    anchor.classList.add("is-open");

    const fora = (e: MouseEvent) => {
      if (!ativo) return;
      const alvo = e.target as Node;
      if (ativo.niveis.some((p) => p.el.contains(alvo)) || anchor.contains(alvo)) return;
      fechar();
    };
    const tecla = (e: KeyboardEvent) => {
      if (!ativo) return;
      const focado = document.activeElement as HTMLElement | null;
      if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation();
        if (ativo.niveis.length > 1) {
          const origem = ativo.niveis[ativo.niveis.length - 1].origem;
          fecharAcima(ativo.niveis.length - 2);
          if (origem) origem.focus();
        } else fechar(true);
        return;
      }
      const painel = ativo.niveis.find((p) => p.el.contains(focado)) || ativo.niveis[ativo.niveis.length - 1];
      if (e.key === "ArrowLeft" && painel.nivel > 0 && (!focado || focado.tagName !== "INPUT")) {
        e.preventDefault();
        const origem = painel.origem;
        fecharAcima(painel.nivel - 1);
        if (origem) origem.focus();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const itensFoco = Array.from(painel.el.querySelectorAll<HTMLElement>("button:not([disabled]), input"));
      if (!itensFoco.length) return;
      e.preventDefault();
      const i = focado ? itensFoco.indexOf(focado) : -1;
      itensFoco[(i + (e.key === "ArrowDown" ? 1 : -1) + itensFoco.length) % itensFoco.length].focus();
    };
    const redimensionar = () => fechar();
    document.addEventListener("mousedown", fora, true);
    document.addEventListener("keydown", tecla, true);
    window.addEventListener("resize", redimensionar);
    Object.assign(estado, { fora, tecla, redimensionar });
    requestAnimationFrame(() => { const f = raiz.el.querySelector<HTMLElement>("button:not([disabled])"); if (f && o.focar !== false) f.focus(); });
  }

  /**
   * Lista pesquisável com marcação (submenus de filtro: Conta, Categoria, Perfil...)
   * cfg: { itens:[{ value, label, cor?, icone? }], marcados(): [values], alternar(value), topo?(api) → node, vazio }
   */
  function listaMarcavel(cfg: ConfigListaMarcavel): ConteudoMenu {
    return {
      largura: cfg.largura || 260,
      render(el, api) {
        let termo = "";
        const busca = h("input", { type: "search", class: E.menuPesquisaCampo, placeholder: "Pesquisar", "aria-label": "Pesquisar" }) as HTMLInputElement;
        const lista = h("div", { class: E.menuLista, role: "group" });
        const norm = (t: unknown) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const desenhar = () => {
          const marcados = cfg.marcados();
          const itens = cfg.itens.filter((it) => !termo || norm(it.label).includes(termo));
          // o item com o foco é recriado: guarda qual era para devolver o foco a ele (marcar por teclado sem perder o lugar)
          const ativo = document.activeElement;
          const valorFocado = ativo instanceof HTMLElement && lista.contains(ativo) ? ativo.dataset.valor : undefined;
          mount(lista, itens.length ? itens.map((it) => {
            const marcado = marcados.includes(it.value);
            return h("button", { type: "button", role: "menuitemcheckbox", "aria-checked": String(marcado), class: [E.menuItem, marcado && "is-checked"],
              "data-valor": it.value, onClick: () => { cfg.alternar(it.value); desenhar(); } },
              h("span", { class: marcado ? E.menuCaixaMarcada : E.menuCaixa, "aria-hidden": "true" }, marcado ? icon("check", { size: 11, stroke: 3 }) : null),
              it.cor ? h("span", { class: E.menuPonto, style: { background: ZoZo.format.cor(it.cor, "var(--palette-16)") } }) : null,
              it.icone ? h("span", { class: E.menuEmoji, "aria-hidden": "true" }, ZoZo.dom.emoji(it.icone)) : null,
              h("span", { class: E.menuRotulo }, it.label));
          }) : h("p", { class: E.menuVazio }, cfg.vazio || "Nada encontrado."));
          if (valorFocado !== undefined) {
            const volta = Array.from(lista.querySelectorAll<HTMLElement>("[data-valor]")).find((b) => b.dataset.valor === valorFocado)
              || lista.querySelector<HTMLElement>("[data-valor]");
            if (volta) volta.focus(); else busca.focus();
          }
        };
        busca.addEventListener("input", () => { termo = norm(busca.value.trim()); desenhar(); });
        mount(el,
          cfg.topo ? cfg.topo(() => desenhar()) : null,
          h("div", { class: E.menuPesquisa }, icon("pesquisar", { size: 14 }), busca),
          lista);
        desenhar();
        void api;
      },
    };
  }

  /* ---------- Menus de perfil e de conta: os MESMOS no painel da transação, na divisão e na fatura ---------- */
  /** Perfis em pílula (caixa alta) + "Novo perfil" (o novo já vem escolhido) */
  function perfis(anchor: HTMLElement, ctx: ContextoApp, o: OpcoesMenuPerfil): void {
    abrir(anchor, o.perfis.map((p): ItemMenu => ({
      // item de menu escolhível, como nas contas (um botão comum dentro de role="menu" não é anunciado como item)
      render: (api) => h("button", { type: "button", role: "menuitemradio", "aria-checked": String(p.id === o.atual), class: [E.menuItem, p.id === o.atual && "is-checked"],
        onClick: () => { api.fechar(); o.aoEscolher(p); } },
        ZoZo.ui.Tag(p.nome, p.cor, { class: "tag--upper" })),
    })).concat([
      { separador: true },
      { icone: "mais", label: "Novo perfil", onClick: () => ZoZo.modais.novoPerfil(ctx, { aoCriar: (np) => (o.aoCriar || o.aoEscolher)(np) }) },
    ]), { posicao: o.posicao || "esquerda", label: "Perfil", largura: 240 });
  }
  /** Contas pelo nome + 4 últimos dígitos (marcada a atual); rodapé opcional (ex.: "Nova conta") */
  function contas(anchor: HTMLElement, o: OpcoesMenuConta): void {
    const lista = o.contas;
    abrir(anchor, lista.map((c): ItemMenu => ({
      label: c.nome + (c.ultimos4Digitos ? " " + c.ultimos4Digitos : ""), check: c.id === o.atual, onClick: () => o.aoEscolher(c),
    })).concat(lista.length ? [] : [{ label: o.vazio || "Nenhuma conta cadastrada", desabilitado: true }],
      o.rodape && o.rodape.length ? [{ separador: true } as ItemMenu].concat(o.rodape) : []), { posicao: o.posicao || "esquerda", label: "Conta", largura: 260 });
  }

  const apiMenu: ZoZoMenu = { abrir, fechar, listaMarcavel, perfis, contas };
  ZoZo.menu = apiMenu;
})(window.ZoZo);
