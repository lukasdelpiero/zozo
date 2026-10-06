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
   menu, do lado que couber na tela.
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h, mount } = ZoZo.dom;
  const { icon } = ZoZo.icons;

  let ativo = null;   // { anchor, niveis: [painel], fora, tecla }

  function fechar(devolverFoco) {
    if (!ativo) return;
    const a = ativo; ativo = null;
    a.niveis.forEach((p) => p.el.remove());
    a.anchor.setAttribute("aria-expanded", "false");
    a.anchor.classList.remove("is-open");
    document.removeEventListener("mousedown", a.fora, true);
    document.removeEventListener("keydown", a.tecla, true);
    window.removeEventListener("resize", a.redimensionar);
    if (devolverFoco && a.anchor.isConnected) a.anchor.focus();
  }

  /** Fecha os níveis acima de "nivel" */
  function fecharAcima(nivel) {
    while (ativo && ativo.niveis.length > nivel + 1) {
      const p = ativo.niveis.pop();
      p.el.remove();
      if (p.origem) p.origem.classList.remove("is-open");
    }
  }

  function posicionar(el, ref, modo) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = el.offsetWidth, hgt = el.offsetHeight;
    let left, top;
    if (modo === "lado") {                // submenu ao lado do item
      const pai = ref.closest(".menu").getBoundingClientRect();
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

  function resolver(sub) { return typeof sub === "function" ? sub() : sub; }

  function criarPainel(itens, nivel, opts) {
    const el = h("div", { class: ["menu", opts.class], role: "menu", "aria-label": opts.label || "Menu" });
    if (opts.largura) el.style.width = opts.largura + "px";
    const painel = { el, nivel };
    const api = {
      fechar: () => fechar(true),
      atualizar: () => desenhar(),
      voltar: () => { fecharAcima(nivel - 1); },
    };

    function desenhar() {
      const conteudo = resolver(itens);
      if (conteudo && typeof conteudo.render === "function") {
        mount(el);
        conteudo.render(el, api);
        return;
      }
      mount(el, (conteudo || []).map((it) => {
        if (it.separador) return h("div", { class: "menu__sep", role: "separator" });
        if (it.secao) return h("div", { class: "menu__section" }, it.secao);
        if (it.render) return it.render(api);
        const btn = h("button", {
          type: "button", role: "menuitem", class: ["menu__item", it.perigo && "menu__item--danger", it.check && "is-checked"],
          disabled: it.desabilitado, "aria-haspopup": it.submenu ? "menu" : undefined,
          "aria-checked": it.check === undefined ? undefined : String(!!it.check),
        },
          it.check !== undefined && opts.checkEsquerda ? h("span", { class: "menu__checkslot" }, it.check ? icon("check", { size: 14, stroke: 2.25 }) : null) : null,
          it.icone ? icon(it.icone, { size: 16, class: "menu__icon" }) : null,
          it.descricao ? h("span", { class: "menu__label menu__label--2" }, h("span", null, it.label), h("small", null, it.descricao)) : h("span", { class: "menu__label" }, it.label),
          it.valor ? h("span", { class: "menu__badge" }, it.valor) : null,
          it.check && !opts.checkEsquerda ? icon("check", { size: 14, stroke: 2.25, class: "menu__check" }) : null,
          it.submenu ? icon("chevron-right", { size: 14, class: "menu__chev" }) : null);

        if (it.submenu) {
          let timer = null;
          const abrirSub = (foco) => {
            if (ativo && ativo.niveis[nivel + 1] && ativo.niveis[nivel + 1].origem === btn) return;
            fecharAcima(nivel);
            const subOpts = Object.assign({}, opts, { class: "menu--sub", largura: (resolver(it.submenu) || {}).largura || it.larguraSub || opts.larguraSub, checkEsquerda: it.checkEsquerda });
            const filho = criarPainel(it.submenu, nivel + 1, subOpts);
            filho.origem = btn;
            btn.classList.add("is-open");
            document.body.appendChild(filho.el);
            ativo.niveis.push(filho);
            posicionar(filho.el, btn, "lado");
            if (foco) { const f = filho.el.querySelector("input, button"); if (f) f.focus(); }
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

  function abrir(anchor, itens, opts) {
    const o = opts || {};
    if (ativo && ativo.anchor === anchor) { fechar(); return; }
    fechar();

    ativo = { anchor, niveis: [] };
    const raiz = criarPainel(itens, 0, o);
    document.body.appendChild(raiz.el);
    ativo.niveis.push(raiz);
    posicionar(raiz.el, anchor, o.posicao || "direita");
    anchor.setAttribute("aria-expanded", "true");
    anchor.classList.add("is-open");

    const fora = (e) => {
      if (!ativo) return;
      if (ativo.niveis.some((p) => p.el.contains(e.target)) || anchor.contains(e.target)) return;
      fechar();
    };
    const tecla = (e) => {
      if (!ativo) return;
      if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation();
        if (ativo.niveis.length > 1) {
          const origem = ativo.niveis[ativo.niveis.length - 1].origem;
          fecharAcima(ativo.niveis.length - 2);
          if (origem) origem.focus();
        } else fechar(true);
        return;
      }
      const painel = ativo.niveis.find((p) => p.el.contains(document.activeElement)) || ativo.niveis[ativo.niveis.length - 1];
      if (e.key === "ArrowLeft" && painel.nivel > 0 && document.activeElement.tagName !== "INPUT") {
        e.preventDefault();
        const origem = painel.origem;
        fecharAcima(painel.nivel - 1);
        if (origem) origem.focus();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const itensFoco = Array.from(painel.el.querySelectorAll("button:not([disabled]), input"));
      if (!itensFoco.length) return;
      e.preventDefault();
      const i = itensFoco.indexOf(document.activeElement);
      itensFoco[(i + (e.key === "ArrowDown" ? 1 : -1) + itensFoco.length) % itensFoco.length].focus();
    };
    const redimensionar = () => fechar();
    document.addEventListener("mousedown", fora, true);
    document.addEventListener("keydown", tecla, true);
    window.addEventListener("resize", redimensionar);
    Object.assign(ativo, { fora, tecla, redimensionar });
    requestAnimationFrame(() => { const f = raiz.el.querySelector("button:not([disabled])"); if (f && o.focar !== false) f.focus(); });
  }

  /**
   * Lista pesquisável com marcação (submenus de filtro: Conta, Categoria, Perfil...)
   * cfg: { itens:[{ value, label, cor?, icone? }], marcados(): [values], alternar(value), topo?(api) → node, vazio }
   */
  function listaMarcavel(cfg) {
    return {
      largura: cfg.largura || 260,
      render(el, api) {
        let termo = "";
        const busca = h("input", { type: "search", class: "menu__search-input", placeholder: "Pesquisar", "aria-label": "Pesquisar" });
        const lista = h("div", { class: "menu__list", role: "group" });
        const norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const desenhar = () => {
          const marcados = cfg.marcados();
          const itens = cfg.itens.filter((it) => !termo || norm(it.label).includes(termo));
          mount(lista, itens.length ? itens.map((it) => {
            const marcado = marcados.includes(it.value);
            return h("button", { type: "button", role: "menuitemcheckbox", "aria-checked": String(marcado), class: ["menu__item", "menu__item--check", marcado && "is-checked"],
              onClick: () => { cfg.alternar(it.value); desenhar(); } },
              h("span", { class: ["menu__box", marcado && "is-on"], "aria-hidden": "true" }, marcado ? icon("check", { size: 11, stroke: 3 }) : null),
              it.cor ? h("span", { class: "menu__dot", style: { background: ZoZo.format.cor(it.cor, "var(--palette-16)") } }) : null,
              it.icone ? h("span", { class: "menu__emoji", "aria-hidden": "true" }, it.icone) : null,
              h("span", { class: "menu__label" }, it.label));
          }) : h("p", { class: "menu__empty" }, cfg.vazio || "Nada encontrado."));
        };
        busca.addEventListener("input", () => { termo = norm(busca.value.trim()); desenhar(); });
        mount(el,
          cfg.topo ? cfg.topo(() => desenhar()) : null,
          h("div", { class: "menu__search" }, icon("pesquisar", { size: 14 }), busca),
          lista);
        desenhar();
        void api;
      },
    };
  }

  ZoZo.menu = { abrir, fechar, listaMarcavel };
})(window.ZoZo);
