/* =============================================================
   ZoZo — Dividir transação entre perfis
   (ex.: conta rachada paga com um único cartão)
   ZoZo.dividir.abrir(lancamento, ctx, aoTerminar)
   Regras: mesma data do original · soma = valor original (100%) — no modo personalizado, editar o valor ou o
   percentual de uma parte reajusta as outras na mesma proporção, então a soma fecha sempre ·
   categoria e perfil em todas as partes · perfis sem repetição ·
   nomes e categorias podem repetir · recorrente: origem → uma série por parte; ocorrência → só aquele mês.
   TypeScript: tipos em src/globais.d.ts (ZoZoDividir).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const { h, mount } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const UI = ZoZo.ui;
  const F = ZoZo.format;
  const A = ZoZo.messages.ACTIONS;
  const store = ZoZo.store;

  /** Uma parte da divisão; valores em centavos (c), e cP = o valor que o usuário definiu no modo personalizado */
  type Parte = { descricao: string; data: string; categoriaId: string | null; perfilId: string | null; c: number; cP?: number };
  type Modo = "igual" | "personalizado";

  const dataCurta = (iso: string) => { const d = F.parseData(iso); return d ? d.getDate() + " " + F.mesAbrev(d.getMonth()) + ", " + d.getFullYear() : ""; };
  const pct = (c: number, total: number) => (total ? (c / total) * 100 : 0);
  const fmtPct = (v: number) => (Math.round(v * 100) / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";

  function abrir(original: any, ctx: ContextoApp, aoTerminar?: (id: string) => void): void {
    const st = store.get();
    const todos = (st.data.lancamentos && st.data.lancamentos.lancamentos) || [];
    const cats = ((st.data.categorias && st.data.categorias.categorias) || []);
    const perfis: any[] = ((st.data.perfis && st.data.perfis.perfis) || []).filter((p: any) => !p.arquivado);
    const membros: any[] = original.divisao ? todos.filter((l: any) => l.divisao && l.divisao.id === original.divisao.id) : [original];
    const base = membros.find((l) => l.id === original.id) || original;
    const total = Math.round((original.divisao ? original.divisao.total : original.valor) * 100);   // em centavos
    const data = base.data;

    // Estado: partes e modo (igual | personalizado)
    let partes: Parte[] = membros.map((l) => ({ descricao: l.descricao, data: l.data, categoriaId: l.categoriaId, perfilId: l.perfilId, c: Math.round(l.valor * 100), cP: Math.round(l.valor * 100) }));
    if (partes.length < 2) partes.push(Object.assign({}, partes[0]));          // começa com duas partes (perfil repetido)
    let modo: Modo = membros.length > 1 && !partes.every((p) => Math.abs(p.c - partes[0].c) <= 1) ? "personalizado" : "igual";
    const igualar = () => {
      const n = partes.length, b = Math.floor(total / n), r = total - b * n;
      partes.forEach((p, i) => { p.c = b + (i < r ? 1 : 0); });
    };
    if (modo === "igual") igualar();

    const corpo = h("div", { class: "dv" });
    const lista = h("div", { class: "dv__list" });
    const erroEl = h("div", { class: "dv__errors", role: "alert" });
    const restanteEl = h("span", { class: "dv__rest-value money" });
    let alternar: HTMLElement | undefined;

    const pillCategoria = (id: string | null) => { const c = cats.find((x: any) => x.id === id); return c ? UI.CategoryLabel(c, { pill: true }) : h("span", { class: "dv__missing" }, "Categoria"); };
    const pillPerfil = (id: string | null) => { const p = perfis.find((x) => x.id === id) || ((st.data.perfis && st.data.perfis.perfis) || []).find((x: any) => x.id === id); return p ? UI.Tag(p.nome, p.cor, { class: "tag--upper" }) : h("span", { class: "dv__missing" }, "Perfil"); };

    /* Menus iguais aos do painel do lançamento: pesquisa, lista com altura limitada e "+ Nova…" */
    const norm = (t: unknown) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    function menuCategoria(btn: HTMLElement, parte: Parte) {
      ZoZo.menu.abrir(btn, { largura: 280, render(el: HTMLElement, api: { fechar(): void }) {
        let termo = "";
        const lista = (): any[] => ((store.get().data.categorias || {}).categorias || []);
        const busca = h("input", { type: "search", class: ZoZo.estrutura.menuPesquisaCampo, placeholder: "Pesquisar", "aria-label": "Pesquisar categoria" }) as HTMLInputElement;
        const caixa = h("div", { class: ZoZo.estrutura.menuListaRolagem });
        const escolher = (id: string) => { api.fechar(); parte.categoriaId = id; desenhar(); };
        const pintar = () => mount(caixa, lista().filter((c) => !termo || norm(c.nome).includes(termo)).map((c) =>
          h("button", { type: "button", class: [ZoZo.estrutura.menuItem, c.id === parte.categoriaId && "is-checked"], onClick: () => escolher(c.id) }, UI.CategoryLabel(c, { pill: true }))));
        busca.addEventListener("input", () => { termo = norm(busca.value.trim()); pintar(); });
        mount(el, h("div", { class: ZoZo.estrutura.menuPesquisa }, icon("pesquisar", { size: 14 }), busca), caixa, h("div", { class: ZoZo.estrutura.menuSeparador }),
          h("button", { type: "button", class: ZoZo.estrutura.menuItem, onClick: () => { api.fechar(); ZoZo.modais.novaCategoria(ctx, { nome: termo ? busca.value.trim() : "", aoCriar: (c: any) => { cats.push(c); escolher(c.id); } }); } },
            icon("mais", { size: 16, class: ZoZo.estrutura.menuIcone }), h("span", { class: ZoZo.estrutura.menuRotulo }, "Nova categoria")));
        pintar();
        requestAnimationFrame(() => busca.focus());
      } }, { posicao: "direita", largura: 280, label: "Categoria", focar: false });
    }
    function menuPerfil(btn: HTMLElement, parte: Parte) {
      ZoZo.menu.abrir(btn, { largura: 240, render(el: HTMLElement, api: { fechar(): void }) {
        const atuais = (): any[] => ((store.get().data.perfis || {}).perfis || []).filter((p: any) => !p.arquivado);
        mount(el, h("div", { class: ZoZo.estrutura.menuListaRolagem }, atuais().map((p) =>
          h("button", { type: "button", class: [ZoZo.estrutura.menuItem, p.id === parte.perfilId && "is-checked"], onClick: () => { api.fechar(); parte.perfilId = p.id; desenhar(); } },
            UI.Tag(p.nome, p.cor, { class: "tag--upper" })))),
          h("div", { class: ZoZo.estrutura.menuSeparador }),
          h("button", { type: "button", class: ZoZo.estrutura.menuItem, onClick: () => { api.fechar(); ZoZo.modais.novoPerfil(ctx, { aoCriar: (np: any) => { perfis.push(np); parte.perfilId = np.id; desenhar(); } }); } },
            icon("mais", { size: 16, class: ZoZo.estrutura.menuIcone }), h("span", { class: ZoZo.estrutura.menuRotulo }, "Novo perfil")));
      } }, { posicao: "direita", largura: 240, label: "Perfil" });
    }

    function linha(parte: Parte, i: number) {
      const nome = ZoZo.inline.texto({ valor: parte.descricao, rotulo: "Nome da parte " + (i + 1), max: ZoZo.regras.limiteNome, classe: "dv__name " + ZoZo.pecas.dvNome,
        aoSalvar: (v) => { parte.descricao = v; } });
      const dataBtn = h("button", { type: "button", class: "dv__date" }, dataCurta(parte.data));
      dataBtn.addEventListener("click", () => ZoZo.calendario.abrir(dataBtn, parte.data, (v) => { parte.data = v; desenhar(); }, { rotulo: "Data da parte " + (i + 1) }));
      const catBtn = h("button", { type: "button", class: "dv__pill", "aria-haspopup": "menu", "aria-label": "Categoria" }, pillCategoria(parte.categoriaId));
      catBtn.addEventListener("click", () => menuCategoria(catBtn, parte));
      const perfBtn = h("button", { type: "button", class: "dv__pill", "aria-haspopup": "menu", "aria-label": "Perfil" }, pillPerfil(parte.perfilId));
      perfBtn.addEventListener("click", () => menuPerfil(perfBtn, parte));
      const valor = ZoZo.inline.dinheiro({ valor: parte.c / 100, rotulo: "Valor da parte " + (i + 1), classe: "dv__value " + ZoZo.pecas.dvValor,
        aoSalvar: (v) => { mudarParaPersonalizado(); fixar(i, Math.round(v * 100)); desenhar(); } });
      const pctInput = h("input", { type: "text", inputmode: "decimal", class: [ZoZo.pecas.noLugar, "dv__pct", ZoZo.pecas.dvPct], value: fmtPct(pct(parte.c, total)), "aria-label": "Percentual da parte " + (i + 1), "data-sem-mascara": "1" }) as HTMLInputElement;
      pctInput.addEventListener("focus", () => { pctInput.value = String(Math.round(pct(parte.c, total) * 100) / 100).replace(".", ","); pctInput.select(); });
      pctInput.addEventListener("keydown", (e) => { if (e.key === "Enter") pctInput.blur(); });
      pctInput.addEventListener("blur", () => {
        const v = parseFloat(pctInput.value.replace("%", "").replace(",", "."));
        if (Number.isFinite(v) && v >= 0 && v <= 100 && Math.abs(v - pct(parte.c, total)) > 0.004) {
          mudarParaPersonalizado();
          fixar(i, Math.round((total * v) / 100));
        }
        desenhar();
      });
      const remover = h("button", { type: "button", class: [ZoZo.pecasFn.botaoIcone("", true), "dv__remove"], "aria-label": "Remover parte " + (i + 1), disabled: partes.length <= 1,
        onClick: () => { partes.splice(i, 1); if (modo === "igual") igualar(); else repartir(partes.map((_, k) => k), total); desenhar(); } }, icon("fechar", { size: 14 }));
      return h("div", { class: ["dv__row", ZoZo.pecas.ctxPilulasDivisao] }, nome, dataBtn, catBtn, perfBtn, valor, pctInput, remover);
    }

    /** Personalizado usa os valores que o usuário definiu (guardados em cP); partes novas ficam como estão */
    function mudarParaPersonalizado(restaurar?: boolean) {
      if (modo === "personalizado") return;
      modo = "personalizado";
      // pelo botão: volta aos valores que o usuário tinha definido (se ainda fecham o total, com as mesmas partes);
      // senão — ou editando um valor — parte dos valores atuais
      const definidos = restaurar && partes.every((p) => Number.isFinite(p.cP)) && partes.reduce((s, p) => s + (p.cP || 0), 0) === total;
      partes.forEach((p) => { if (definidos) p.c = p.cP as number; else p.cP = p.c; });
    }

    /**
     * Reparte `valor` (centavos) entre as partes `indices`, na proporção do que cada uma já tem (todas zeradas:
     * em partes iguais). Maiores restos: a soma dos centavos fica exata; cada parte fica com pelo menos 1 centavo.
     */
    function repartir(indices: number[], valor: number) {
      if (!indices.length) return;
      const pesos = indices.map((k) => Math.max(0, partes[k].c));
      const soma = pesos.reduce((s, w) => s + w, 0);
      const brutos = pesos.map((w) => (soma > 0 ? (valor * w) / soma : valor / indices.length));
      indices.forEach((k, j) => { partes[k].c = Math.floor(brutos[j]); });
      let falta = valor - indices.reduce((s, k) => s + partes[k].c, 0);
      brutos.map((b, j) => [b - Math.floor(b), j]).sort((a, b) => b[0] - a[0]).forEach(([, j]) => { if (falta > 0) { partes[indices[j]].c += 1; falta -= 1; } });
      // nenhuma parte zerada: o centavo sai da maior
      indices.forEach((k) => {
        if (partes[k].c > 0) return;
        const maior = indices.reduce((m, x) => (partes[x].c > partes[m].c ? x : m), indices[0]);
        if (partes[maior].c > 1) { partes[maior].c -= 1; partes[k].c += 1; }
      });
      partes.forEach((p) => { p.cP = p.c; });
    }
    /** A parte i fica com `c` centavos (deixando ao menos 1 centavo para cada outra) e as outras dividem o resto */
    function fixar(i: number, c: number) {
      const outras = partes.map((_, k) => k).filter((k) => k !== i);
      if (!outras.length) { partes[i].c = partes[i].cP = total; return; }
      partes[i].c = Math.max(1, Math.min(total - outras.length, c));
      repartir(outras, total - partes[i].c);
    }

    function desenhar() {
      if (modo === "igual") igualar();
      mount(lista, partes.map(linha),
        UI.Button("Add divisão", { size: "sm", icon: "mais", class: "dv__add tw:self-start tw:mt-2.5", onClick: () => {
          const nova = Object.assign({}, partes[partes.length - 1]);          // repete a última parte (inclusive o perfil)
          partes.push(nova);
          if (modo === "igual") { igualar(); nova.cP = undefined; }
          else { nova.c = 0; fixar(partes.length - 1, Math.floor(total / partes.length)); }
          desenhar();
        } }));
      const resto = total - partes.reduce((s, p) => s + p.c, 0);
      restanteEl.textContent = (resto < 0 ? "−" : "") + F.moeda(Math.abs(resto) / 100);
      restanteEl.classList.toggle("is-negative", resto < 0);
      if (alternar) alternar.querySelectorAll<HTMLElement>(".segmented-item").forEach((b) => b.classList.toggle("is-active", b.dataset.v === modo));
      mount(erroEl);
    }

    function validar(): string[] {
      const erros: string[] = [];
      const soma = partes.reduce((s, p) => s + p.c, 0);
      if (partes.length < 2 && !original.divisao) erros.push("Adicione pelo menos duas partes.");
      if (soma !== total) erros.push("A soma das partes precisa ser 100% (" + F.moeda(total / 100) + "). Agora está em " + fmtPct(pct(soma, total)) + ".");
      if (partes.some((p) => p.c <= 0)) erros.push("Nenhuma parte pode ficar com valor zero.");
      if (partes.some((p) => p.data !== data)) erros.push("Todas as partes precisam ter a data da transação original (" + dataCurta(data) + ").");
      if (partes.some((p) => !p.categoriaId)) erros.push("Escolha uma categoria para todas as partes.");
      if (partes.some((p) => !p.perfilId)) erros.push("Escolha um perfil para todas as partes.");
      else if (new Set(partes.map((p) => p.perfilId)).size !== partes.length) erros.push("Cada parte precisa de um perfil diferente.");
      return erros;
    }

    const card = h("div", { class: "dv__card" },
      h("div", { class: "dv__card-left" },
        h("div", { class: ["dv__card-pills", ZoZo.pecas.ctxPilulasDivisao] }, pillCategoria(base.categoriaId), pillPerfil(base.perfilId)),
        h("span", { class: "dv__card-name" }, base.descricao)),
      h("div", { class: "dv__card-right" },
        h("span", { class: "dv__card-date" }, dataCurta(data)),
        h("span", { class: "dv__card-value" }, h("span", { class: "money" }, F.moeda(total / 100)))));

    ZoZo.modais.janela({
      titulo: "Dividir transação",
      classe: "modal--dividir",
      passo: (api: { fechar(): void }) => {
        const seletor: HTMLElement = UI.Segmented([{ value: "igual", label: "Igualmente" }, { value: "personalizado", label: "Personalizado" }], modo,
          (v: string) => { if (v === "personalizado") mudarParaPersonalizado(true); else modo = "igual"; desenhar(); }, { label: "Forma de divisão", class: "segmented--pilulas dv__toggle tw:mb-3 tw:[&_.segmented-item]:px-4" });
        seletor.querySelectorAll<HTMLElement>(".segmented-item").forEach((b, i) => { b.dataset.v = i === 0 ? "igual" : "personalizado"; });
        alternar = seletor;
        const salvar = (btn: HTMLButtonElement) => {
          const ativo = document.activeElement as HTMLElement | null; if (ativo && corpo.contains(ativo)) ativo.blur();    // conclui a edição em andamento
          const erros = validar();
          if (erros.length) { mount(erroEl, h("ul", null, erros.map((e) => h("li", null, e)))); return; }
          btn.disabled = true;
          ctx.bridge.request(A.dividirLancamento, { id: base.id, partes: partes.map((p) => ({ descricao: p.descricao, data: p.data, categoriaId: p.categoriaId, perfilId: p.perfilId, valor: p.c / 100 })) })
            .then(() => { api.fechar(); ctx.toast(partes.length > 1 ? "Transação dividida." : "Divisão desfeita."); return ctx.recarregarTudo().then(() => aoTerminar && aoTerminar(base.id)); })
            .catch((e: ErroPonte) => { btn.disabled = false; mount(erroEl, h("p", null, e.friendly)); });
        };
        mount(corpo, card, h("div", { class: "dv__connector", "aria-hidden": "true" }), h("div", { class: "dv__grid-line" }),
          alternar, lista, erroEl,
          h("div", { class: "dv__footer" },
            h("div", { class: "dv__rest" }, h("span", { class: "dv__rest-label" }, "Restante para dividir"), restanteEl),
            h("div", { class: "dv__actions" },
              UI.Button("Cancelar", { onClick: () => api.fechar() }),
              UI.Button("Salvar", { variant: "primary", onClick: (e: MouseEvent) => salvar(e.currentTarget as HTMLButtonElement) }))));
        desenhar();
        return { corpo, botoes: [] };
      },
    });
  }

  const api: ZoZoDividir = { abrir };
  ZoZo.dividir = api;
})(window.ZoZo);
