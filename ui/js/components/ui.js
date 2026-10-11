/* =============================================================
   ZoZo — Componentes reutilizáveis (design system)
   Button · IconButton · Input · Select · Textarea · Toggle
   Tag · CategoryLabel · PercentageChange · ProgressBar
   FilterTabs · Segmented · Card · Section · Skeleton · EmptyState
   ColorPicker · Checkbox · AccountIcon
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h, id: uid } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const F = ZoZo.format;

  /** Após re-render, devolve o foco ao elemento com a mesma chave */
  function refocus(key) {
    requestAnimationFrame(() => {
      const el = document.querySelector('[data-fk="' + CSS.escape(key) + '"]');
      if (el) el.focus();
    });
  }

  /* ---------- Botões ---------- */
  function Button(label, opts) {
    const o = opts || {};
    const variant = o.variant || "secondary"; // primary | secondary | danger | text | on-primary
    return h("button", {
      type: o.type || "button",
      class: ["btn", "btn--" + variant, o.size === "sm" && "btn--sm", o.class],
      onClick: o.onClick,
      disabled: o.disabled,
      "aria-pressed": o.pressed === undefined ? undefined : String(!!o.pressed),
      title: o.title,
    }, o.icon && icon(o.icon), label ? h("span", { class: "btn__label" }, label) : null);
  }

  function IconButton(iconName, label, opts) {
    const o = opts || {};
    return h("button", {
      type: "button",
      class: ["icon-btn", o.onPrimary && "icon-btn--on-primary", o.active && "is-active", o.class],
      "aria-label": label,
      title: label,
      onClick: o.onClick,
      disabled: o.disabled,
      "aria-pressed": o.pressed === undefined ? undefined : String(!!o.pressed),
      "aria-expanded": o.expanded === undefined ? undefined : String(!!o.expanded),
    }, icon(iconName, { size: o.size || 16 }));
  }

  /* ---------- Campos ---------- */
  function Field(label, control, opts) {
    const o = opts || {};
    const controlId = control.id || uid("campo");
    control.id = controlId;
    return h("div", { class: ["field", o.class] },
      h("label", { class: "field__label", for: controlId }, label),
      o.prefix ? h("div", { class: "field__affix" }, h("span", { class: "field__prefix", "aria-hidden": "true" }, o.prefix), control) : control,
      o.hint ? h("p", { class: "field__hint" }, o.hint) : null);
  }

  function Input(opts) {
    const o = opts || {};
    return h("input", {
      class: ["input", o.class],
      type: o.type || "text",
      name: o.name,
      id: o.id,                                   // ajuda gerenciadores de senha a reconhecer o campo
      value: o.value === undefined || o.value === null ? "" : o.value,
      placeholder: o.placeholder,
      autocomplete: o.autocomplete || "off",
      inputmode: o.inputmode,
      required: o.required,
      disabled: o.disabled,
      "aria-invalid": o.invalid ? "true" : undefined,
      onInput: o.onInput,
      onChange: o.onChange,
      onKeydown: o.onKeydown,
    });
  }

  /** options: [{ value, label }] ou [{ group, options:[...] }] */
  function Select(options, opts) {
    const o = opts || {};
    const sel = h("select", { class: ["select", o.class], name: o.name, disabled: o.disabled, onChange: o.onChange, "aria-label": o.ariaLabel });
    const addOpt = (parent, op) => parent.appendChild(h("option", { value: op.value }, op.label));
    (options || []).forEach((op) => {
      if (op.group) {
        const g = h("optgroup", { label: op.group });
        op.options.forEach((x) => addOpt(g, x));
        sel.appendChild(g);
      } else addOpt(sel, op);
    });
    if (o.value !== undefined && o.value !== null) sel.value = o.value;
    return sel;
  }

  function Textarea(opts) {
    const o = opts || {};
    const t = h("textarea", { class: ["textarea", o.class], name: o.name, rows: o.rows || 4, placeholder: o.placeholder, "aria-label": o.ariaLabel });
    t.value = o.value || "";
    return t;
  }

  function Toggle(label, opts) {
    const o = opts || {};
    const input = h("input", { type: "checkbox", class: "toggle__input", role: "switch", onChange: (e) => o.onChange && o.onChange(e.target.checked) });
    input.checked = !!o.checked;
    return h("label", { class: "toggle" }, input, h("span", { class: "toggle__track", "aria-hidden": "true" }, h("span", { class: "toggle__thumb" })), h("span", { class: "toggle__label" }, label));
  }

  /* ---------- Tag de Perfil (seção 14.4 / 33) ---------- */
  function Tag(nome, cor, opts) {
    const o = opts || {};
    if (!nome) return o.placeholder ? h("span", { class: "tag tag--empty" }, o.placeholder) : null;
    return h(o.onClick ? "button" : "span", {
      type: o.onClick ? "button" : undefined,
      class: ["tag", o.onClick && "tag--interactive", o.class],
      style: { "--tag-color": F.cor(cor, "var(--palette-16)") },
      onClick: o.onClick,
      title: o.title,
    }, h("span", { class: "tag__dot", "aria-hidden": "true" }), h("span", { class: "tag__text" }, nome));
  }

  /* ---------- Categoria: [Ícone] [Nome] ---------- */
  function CategoryLabel(cat, opts) {
    const o = opts || {};
    if (!cat) return o.pill ? null : h("span", { class: "cat-label cat-label--empty" }, o.vazio || "Sem categoria");
    if (o.pill) {
      // Fundo na cor da categoria e texto mais escuro do mesmo tom, em CAIXA ALTA
      return h("span", { class: ["cat-pill", o.class], style: { "--tag-color": F.cor(cat.cor, "var(--palette-16)") }, title: cat.nome },
        h("span", { class: "cat-pill__icon", "aria-hidden": "true" }, cat.icone || "•"),
        h("span", { class: "cat-pill__name" }, cat.nome));
    }
    return h("span", { class: ["cat-label", o.class] },
      h("span", { class: "cat-label__icon", "aria-hidden": "true" }, cat.icone || "•"),
      h("span", { class: "cat-label__name" }, cat.nome));
  }

  /* ---------- Variação percentual (seções 19, 63) ---------- */
  function PercentageChange(valor, opts) {
    const o = opts || {};
    const n = F.numero(valor);
    const dir = n > 0 ? "up" : n < 0 ? "down" : "flat";
    const nomeIcone = dir === "up" ? "seta-sobe" : dir === "down" ? "seta-desce" : "igual";
    const descr = dir === "up" ? "Aumento de " : dir === "down" ? "Redução de " : "Sem variação, ";
    return h("span", { class: ["pct", "pct--" + dir, o.plain && "pct--plain", o.class], title: o.title, "aria-label": descr + F.percentual(n) + (o.contexto ? " " + o.contexto : "") },
      icon(nomeIcone, { size: 12, stroke: 2.25 }),
      h("span", { class: "pct__value" }, F.percentual(n)));
  }

  /* ---------- Barra de progresso ---------- */
  function ProgressBar(ratio, opts) {
    const o = opts || {};
    const pct = Math.max(0, Math.min(1, F.numero(ratio))) * 100;
    return h("div", {
      class: ["progress", o.tone && "progress--" + o.tone, o.class],
      role: "progressbar",
      "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(pct)),
      "aria-label": o.label,
    }, h("div", { class: "progress__fill", style: { width: pct + "%" } }));
  }

  /* ---------- Filtros 1S | 1M | 3M | ONT | 1A | TOTAL ---------- */
  const INTERVALOS = ["1S", "1M", "3M", "AA", "1A", "TOTAL"];   // AA = Acumulado no Ano
  const INTERVALO_DESCR = { "1S": "1 semana", "1M": "1 mês", "3M": "3 meses", AA: "Acumulado no ano", "1A": "1 ano", TOTAL: "Todo o período" };
  function FilterTabs(valor, onChange, opts) {
    const o = opts || {};
    const itens = o.itens || INTERVALOS;
    const wrap = h("div", { class: "filter-tabs", role: "radiogroup", "aria-label": o.label || "Período do gráfico" });
    itens.forEach((it) => {
      const ativo = it === valor;
      wrap.appendChild(h("button", {
        type: "button", role: "radio", class: ["filter-tabs__item", ativo && "is-active"],
        "aria-checked": String(ativo), tabindex: ativo ? "0" : "-1", title: INTERVALO_DESCR[it], "data-fk": (o.label || "tabs") + ":" + it,
        onClick: () => onChange(it),
        onKeydown: (e) => {
          const i = itens.indexOf(it);
          const next = e.key === "ArrowRight" ? itens[(i + 1) % itens.length] : e.key === "ArrowLeft" ? itens[(i - 1 + itens.length) % itens.length] : null;
          if (next) { e.preventDefault(); onChange(next, true); refocus((o.label || "tabs") + ":" + next); }
        },
      }, it));
    });
    return wrap;
  }

  /** Recorta uma série [{data,...}] conforme o intervalo (apenas visualização) */
  function recortarSerie(serie, intervalo) {
    if (!Array.isArray(serie) || !serie.length) return [];
    const ultima = F.parseData(serie[serie.length - 1].data);
    const ini = new Date(ultima);
    if (intervalo === "1S") ini.setDate(ini.getDate() - 7);
    else if (intervalo === "1M") ini.setMonth(ini.getMonth() - 1);
    else if (intervalo === "3M") ini.setMonth(ini.getMonth() - 3);
    else if (intervalo === "AA") ini.setMonth(0, 1);
    else if (intervalo === "1A") ini.setFullYear(ini.getFullYear() - 1);
    else return serie.slice();
    const lim = F.iso(ini);
    return serie.filter((p) => p.data >= lim);
  }

  /* ---------- Segmented (Grid Superior do lançamento) ---------- */
  function Segmented(itens, valor, onChange, opts) {
    const o = opts || {};
    const wrap = h("div", { class: ["segmented", o.class], role: "radiogroup", "aria-label": o.label });
    const botoes = [];
    itens.forEach((it, i) => {
      const ativo = it.value === valor;
      const b = h("button", {
        type: "button", role: "radio", class: ["segmented__item", ativo && "is-active"],
        "aria-checked": String(ativo), tabindex: ativo || (!valor && i === 0) ? "0" : "-1", "data-fk": "seg:" + it.value,
        onClick: () => onChange(it.value),
        onKeydown: (e) => {
          const map = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
          if (!map[e.key]) return;
          e.preventDefault();
          const n = itens[(i + map[e.key] + itens.length) % itens.length];
          onChange(n.value, true);
          refocus("seg:" + n.value);
        },
      }, it.icon ? icon(it.icon, { size: 15 }) : null, h("span", null, it.label), ativo ? icon("check", { size: 14, class: "segmented__check", stroke: 2.25 }) : null);
      botoes.push(b);
      wrap.appendChild(b);
    });
    return wrap;
  }

  /* ---------- Card / Section ---------- */
  function Card(opts, ...children) {
    const o = opts || {};
    return h("section", { class: ["card", o.class], "aria-label": o.label },
      o.title || o.link ? h("header", { class: "card__header" },
        o.title ? h("h2", { class: "card__title" }, o.title) : h("span"),
        o.link ? h("button", { type: "button", class: "card__link", onClick: o.link.onClick }, o.link.label, icon("chevron-right", { size: 14 })) : null) : null,
      ...children);
  }

  /** Seção recolhível com título (ex.: "Cartões de crédito", "Esse mês") */
  /* ---------- Árvores (grupos que abrem e fecham) ----------
     Fechar: a altura do conteúdo encolhe até zero e só então o estado muda.
     Abrir: o estado muda, a lista é redesenhada e o novo conteúdo cresce de zero
     até a altura dele. corpoArvore(chave, el) marca o conteúdo de cada grupo. */
  const abrindo = new Set();
  const semMovimento = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const DURACAO_ARVORE = 200;
  function alternarArvore(chave, aplicar) {
    const corpo = document.querySelector('[data-arvore="' + CSS.escape(chave) + '"]');
    // "Reduzir movimento": nada de animação (nem a de abrir, que só aconteceria no próximo desenho)
    if (!corpo || corpo.hidden || semMovimento() || !corpo.animate) { if ((!corpo || corpo.hidden) && !semMovimento()) abrindo.add(chave); aplicar(); return; }
    let feito = false;
    const fim = () => { if (!feito) { feito = true; aplicar(); } };
    corpo.style.overflow = "hidden";
    corpo.animate([{ height: corpo.scrollHeight + "px", opacity: 1 }, { height: "0px", opacity: 0 }],
      { duration: DURACAO_ARVORE, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" }).onfinish = fim;
    setTimeout(fim, DURACAO_ARVORE + 80);              // se a animação for interrompida, o grupo fecha assim mesmo
  }
  function corpoArvore(chave, el) {
    el.dataset.arvore = chave;
    if (abrindo.has(chave)) {
      abrindo.delete(chave);
      requestAnimationFrame(() => {
        if (!el.isConnected || el.hidden || !el.animate || semMovimento()) return;      // preferência conferida na hora de animar
        el.style.overflow = "hidden";
        const anim = el.animate([{ height: "0px", opacity: 0 }, { height: el.scrollHeight + "px", opacity: 1 }],
          { duration: DURACAO_ARVORE + 20, easing: "cubic-bezier(.2,.7,.3,1)" });
        const limpar = () => { el.style.overflow = ""; };
        anim.onfinish = limpar; anim.oncancel = limpar;
      });
    }
    return el;
  }
  /** Alterna um grupo guardado em ui.gruposFechados, com animação */
  function alternarGrupo(chave) {
    alternarArvore(chave, () => {
      const g = Object.assign({}, ZoZo.store.get().ui.gruposFechados);
      if (g[chave]) delete g[chave]; else g[chave] = true;
      ZoZo.store.set({ ui: { gruposFechados: g } });
    });
  }

  function Section(opts, ...children) {
    const o = opts || {};
    const st = ZoZo.store.get();
    const fechado = !!(o.key && st.ui.gruposFechados[o.key]);
    const corpoId = uid("secao");
    const toggle = () => { if (o.key) alternarGrupo(o.key); };
    return h("section", { class: ["section", fechado && "is-collapsed", o.class] },
      h("header", { class: "section__header" },
        h("div", { class: "section__lead" },
          h("button", { type: "button", class: "section__toggle", "aria-expanded": String(!fechado), "aria-controls": corpoId, onClick: toggle },
            icon("chevron-down", { size: 14, class: "section__caret", stroke: 2.25 }),
            h("h2", { class: "section__title" }, o.title)),
          o.adorno || null),
        o.aside ? h("div", { class: "section__aside" }, o.aside) : null),
      o.key ? corpoArvore(o.key, h("div", { class: "section__body", id: corpoId, hidden: fechado }, ...children))
        : h("div", { class: "section__body", id: corpoId, hidden: fechado }, ...children));
  }

  /* ---------- Loading / Vazio ---------- */
  function Skeleton(linhas, opts) {
    const o = opts || {};
    const wrap = h("div", { class: ["skeleton", o.class], "aria-busy": "true", "aria-label": "Carregando" });
    for (let i = 0; i < (linhas || 4); i++) {
      wrap.appendChild(h("div", { class: "skeleton__row" },
        h("span", { class: "skeleton__block", style: { width: (o.short ? 18 : 30 + ((i * 17) % 40)) + "%" } }),
        h("span", { class: "skeleton__block skeleton__block--end", style: { width: "14%" } })));
    }
    return wrap;
  }

  function EmptyState(mensagem, opts) {
    const o = opts || {};
    return h("div", { class: ["empty", o.class] },
      icon(o.icon || "lancamentos", { size: 20, class: "empty__icon" }),
      h("p", { class: "empty__text" }, mensagem),
      o.action ? Button(o.action.label, { variant: "secondary", size: "sm", onClick: o.action.onClick, icon: o.action.icon }) : null);
  }

  function ErrorState(mensagem, onRetry) {
    return h("div", { class: "empty empty--error", role: "alert" },
      icon("alerta", { size: 20, class: "empty__icon" }),
      h("p", { class: "empty__text" }, mensagem),
      onRetry ? Button("Tentar novamente", { size: "sm", onClick: onRetry, icon: "atualizar" }) : null);
  }

  /* ---------- Seletor de cor (paleta) ---------- */
  function ColorPicker(valor, onChange, opts) {
    const o = opts || {};
    const cores = ZoZo.regras.paleta;
    const wrap = h("div", { class: ["color-picker", o.colunas === 4 && "color-picker--4"], role: "radiogroup", "aria-label": o.label || "Cor" });
    const atual = (valor || "").toLowerCase();
    cores.forEach((cor, i) => {
      const ativo = cor.toLowerCase() === atual;
      wrap.appendChild(h("button", {
        type: "button", role: "radio", class: ["color-picker__swatch", ativo && "is-active"],
        style: { "--swatch": F.cor(cor, "#000") }, "aria-checked": String(ativo), "aria-label": "Cor " + (i + 1),
        tabindex: ativo || (!atual && i === 0) ? "0" : "-1",
        onClick: () => onChange(cor),
        onKeydown: (e) => {
          const col = o.colunas || 8;
          const map = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: col, ArrowUp: -col };
          if (!map[e.key]) return;
          e.preventDefault();
          const btns = wrap.querySelectorAll("button");
          btns[(i + map[e.key] + cores.length) % cores.length].focus();
        },
      }, ativo ? icon("check", { size: 14, stroke: 2.5 }) : null));
    });
    return wrap;
  }

  /* ---------- Checkbox ---------- */
  function Checkbox(checked, onChange, opts) {
    const o = opts || {};
    const input = h("input", { type: "checkbox", class: "check__input", "aria-label": o.label });
    input.checked = !!checked;
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("change", () => onChange(input.checked));
    return h("label", { class: ["check", o.class], onClick: (e) => e.stopPropagation() }, input,
      h("span", { class: "check__box", "aria-hidden": "true" }, icon("check", { size: 12, stroke: 3 })),
      o.texto ? h("span", { class: "check__text" }, o.texto) : null);
  }

  /* ---------- Ícone de conta ---------- */
  const ICONE_TIPO_CONTA = { cartao: "cartao", corrente: "banco", poupanca: "banco", investimento: "investimentos", emprestimo: "emprestimo", outros: "carteira" };
  function AccountIcon(conta) {
    return h("span", { class: "account-icon", style: { "--account-color": F.cor(conta.cor, "var(--palette-16)") }, "aria-hidden": "true" },
      icon(ICONE_TIPO_CONTA[conta.tipo] || "carteira", { size: 16 }));
  }

  /**
   * Confirmação no próprio botão (os avisos de sucesso no canto da tela não aparecem mais):
   * ícone vira ✓ e o texto/rótulo muda por ~1,6 s; leitores de tela ouvem pela região viva.
   */
  function confirmarNoBotao(btn, texto) {
    const rotulo = btn.querySelector(".btn__label");
    const iconeAntes = btn.querySelector("svg");
    const textoAntes = rotulo ? rotulo.textContent : null, ariaAntes = btn.getAttribute("aria-label");
    const ok = icon("check", { size: iconeAntes ? Number(iconeAntes.getAttribute("width")) || 15 : 15 });
    if (iconeAntes) iconeAntes.replaceWith(ok);
    if (rotulo) rotulo.textContent = texto; else btn.setAttribute("aria-label", texto);
    btn.classList.add("is-confirmado");
    const vivo = document.getElementById("toast-root");
    if (vivo) { const aviso = h("span", { class: "sr-only" }, texto); vivo.appendChild(aviso); setTimeout(() => aviso.remove(), 1600); }
    clearTimeout(btn._confirmar);
    btn._confirmar = setTimeout(() => {
      if (iconeAntes) ok.replaceWith(iconeAntes);
      if (rotulo) rotulo.textContent = textoAntes; else if (ariaAntes) btn.setAttribute("aria-label", ariaAntes);
      btn.classList.remove("is-confirmado");
    }, 1600);
  }

  ZoZo.ui = {
    confirmarNoBotao,
    Button, IconButton, Field, Input, Select, Textarea, Toggle, Tag, CategoryLabel, PercentageChange, ProgressBar,
    FilterTabs, recortarSerie, Segmented, Card, Section, Skeleton, EmptyState, ErrorState, ColorPicker,
    AccountIcon, INTERVALOS, refocus, Checkbox, alternarArvore, corpoArvore, alternarGrupo,
  };
})(window.ZoZo);
