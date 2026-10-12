/* =============================================================
   ZoZo — Painel do lançamento (criar e editar no lugar)
   ------------------------------------------------------------
   • Tipo no título com menu (regras de troca abaixo)
   • Data, nome, valor e observação: clique e edite; salva ao sair do campo
   • Despesa/Estorno · Saída/Entrada acima do valor
   • Conta, categoria e recorrência abrem no próprio painel com "voltar"
   • Histórico do mesmo nome no mesmo formato da lista principal
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h, mount } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const UI = ZoZo.ui;
  const L = ZoZo.list;
  const F = ZoZo.format;
  const A = ZoZo.messages.ACTIONS;
  const store = ZoZo.store;

  const NOMES = { regular: "Regular", estorno: "Regular", interno: "Transferência", receita: "Receita", debito: "Débito", recorrente: "Recorrente" };

  /** Tipos para os quais uma transação pode mudar */
  function tiposPermitidos(l, novo) {
    if (novo) return ["regular", "interno", "receita", "debito"];
    if (l.tipo === "recorrente") return [];                           // permanece "Recorrente"
    if (l.tipo === "regular" || l.tipo === "estorno") return ["regular", "interno", "receita", "debito"];
    if (l.tipo === "interno") return ["interno", "regular", "receita", "debito"];
    if (l.tipo === "receita") return ["receita", "interno", "regular", "debito"];
    if (l.tipo === "debito") return ["debito", "regular", "interno", "receita"];
    return [];
  }
  const ehVerde = (d) => d.tipo === "receita" || d.tipo === "estorno" || (d.tipo === "interno" && d.sentido === "entrada");
  // Débito: como Receita, mas é saída (sem verde) e tem Categoria e Recorrência
  const temCategoria = (d) => d.tipo === "regular" || d.tipo === "estorno" || d.tipo === "recorrente" || d.tipo === "debito";
  const ehDebito = (d) => d.tipo === "debito" || (d.tipo === "recorrente" && d.debito === true);
  const norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  function dataLonga(iso) {
    const d = F.parseData(iso);
    return d ? F.diaSemana(d) + ", " + d.getDate() + " " + F.mesAbrev(d.getMonth()) + " " + d.getFullYear() : "";
  }

  function carregarBase(ctx) {
    return Promise.all([
      ["perfis", A.getPerfis], ["categorias", A.getCategorias], ["contas", A.getContas], ["lancamentos", A.getLancamentos], ["recorrencias", A.getRecorrencias],
    ].map(([k, a]) => ctx.loadData(k, a).catch(() => null)));
  }

  /** Recorrências existentes (origens), para o menu de vínculo */
  function origens() {
    const ls = (store.get().data.lancamentos && store.get().data.lancamentos.lancamentos) || [];
    return ls.filter((l) => l.tipo === "recorrente" && l.recorrencia && (!l.serieId || l.serieId === l.id));
  }
  function rotuloRecorrencia(r) {
    if (!r) return "";
    if (r.recorrencia === "parcelada") return "Parcelado" + (r.parcelaTotal ? " · " + r.parcelaAtual + "/" + r.parcelaTotal : "");
    const f = ZoZo.servico.FREQUENCIAS[r.recorrencia];
    return f ? f.rotulo : "Mensal";
  }

  function abrir(l, ctx, opts) {
    return carregarBase(ctx).then(() => {
      const atual = l ? ((store.get().data.lancamentos || {}).lancamentos || []).find((x) => x.id === l.id) || l : null;
      renderizar(atual, ctx, opts || {});
    });
  }

  function renderizar(original, ctx, opts) {
    const novo = !original;
    const st = store.get();
    // Listas lidas de novo a cada desenho: uma categoria/perfil criado no meio da transação aparece na hora
    const listas = () => { const s = store.get().data; return { contas: (s.contas && s.contas.contas) || [], cats: (s.categorias && s.categorias.categorias) || [], perfis: (s.perfis && s.perfis.perfis) || [] }; };
    let { contas, cats, perfis } = listas();
    const filtroPerfil = ((st.ui.filtros && st.ui.filtros.perfis) || []);
    // Perfil (campo, regra de perfil obrigatório e divisão entre perfis): só contas com o recurso de Perfis
    const comPerfis = ZoZo.recursos.perfis();
    const d = novo
      ? Object.assign({
        tipo: "regular", data: F.iso(new Date()), descricao: "", valor: 0,
        contaId: (contas.find((c) => !c.oculta) || {}).id || null,
        categoriaId: (cats.find((c) => c.status === "regular") || {}).id || null,
        perfilId: comPerfis && filtroPerfil.length === 1 ? filtroPerfil[0] : null, notas: "", sentido: "saida",
      }, opts.preset || {})
      : Object.assign({}, original);
    d.sentido = d.sentido || "saida";
    let pendenteRec = null;      // recorrência escolhida antes de criar o lançamento
    const semEntrada = Object.assign({}, opts, { recemCriada: false });
    const reabrir = () => abrir(novo ? null : { id: original.id }, ctx, semEntrada);
    const voltarParaCa = () => abrir(novo ? null : { id: original.id }, ctx, semEntrada);

    /* ---------- gravação ---------- */
    const statusEl = h("span", { class: "lp-status", "aria-live": "polite" });
    function payload() {
      return {
        data: d.data, descricao: d.descricao, valor: d.valor, tipo: d.tipo, contaId: d.contaId || null,
        categoriaId: temCategoria(d) ? d.categoriaId || null : null, perfilId: d.perfilId || null, notas: d.notas || "",
        recorrencia: d.tipo === "recorrente" ? d.recorrencia : null, parcelaAtual: d.parcelaAtual || null, parcelaTotal: d.parcelaTotal || null,
        sentido: d.tipo === "interno" ? d.sentido : null, debito: d.tipo === "recorrente" && d.debito === true ? true : undefined,
      };
    }
    let fila = Promise.resolve();
    function salvar(desfazer) {
      if (novo) return Promise.resolve();
      if (!d.descricao.trim() || !(d.valor > 0)) { if (desfazer) desfazer(); statusEl.textContent = "Nome e valor são obrigatórios."; statusEl.className = "lp-status lp-status--erro"; return Promise.resolve(); }
      statusEl.textContent = "Salvando…"; statusEl.className = "lp-status";
      fila = fila.then(() => ctx.bridge.request(A.updateLancamento, { id: original.id, lancamento: payload() })
        .then(() => { statusEl.textContent = "Salvo"; statusEl.className = "lp-status lp-status--ok"; return ctx.recarregarTudo(); })
        .catch((e) => { if (desfazer) desfazer(); statusEl.textContent = e.friendly; statusEl.className = "lp-status lp-status--erro"; }));
      return fila;
    }

    /* ---------- título: tipo com menu ---------- */
    const permitidos = tiposPermitidos(original || d, novo);
    const tituloTxt = h("span", null, NOMES[d.tipo] || "Transação");
    const tituloBtn = h("button", { type: "button", class: ["tipo-select", !permitidos.length && "tipo-select--fixo"], "aria-haspopup": permitidos.length ? "menu" : undefined },
      tituloTxt, permitidos.length ? icon("chevron-down", { size: 14, stroke: 2.25 }) : null);
    if (permitidos.length) {
      tituloBtn.addEventListener("click", () => ZoZo.menu.abrir(tituloBtn, permitidos.map((t) => ({
        label: NOMES[t], check: NOMES[t] === NOMES[d.tipo],
        onClick: () => {
          if (NOMES[t] === NOMES[d.tipo]) return;
          const antes = { tipo: d.tipo, contaId: d.contaId };
          d.tipo = t;
          if (t !== "interno") d.sentido = "saida";
          // Débito sai de uma CONTA (cartão não vale): com um cartão escolhido — ao criar ou ao editar —
          // troca para a primeira conta disponível; sem nenhuma, avisa em vez de falhar calado
          if (t === "debito") {
            const c = contas.find((x) => x.id === d.contaId);
            if (!c || c.tipo === "cartao") {
              const conta = contas.find((x) => !x.oculta && x.tipo !== "cartao");
              if (!conta) { Object.assign(d, antes); ctx.toast(ZoZo.messages.FRIENDLY.DEBIT_ACCOUNT, { tone: "error" }); return; }
              d.contaId = conta.id;
              if (!novo) ctx.toast("Débito sai de uma conta: a transação passou para " + conta.nome + ".");
            }
          }
          if (novo) desenhar(); else salvar(() => Object.assign(d, antes)).then(() => reabrir());
        },
      })), { posicao: "esquerda", label: "Tipo de transação", checkEsquerda: true }));
    }

    /* ---------- campos ---------- */
    // Entrada suave ao começar uma transação nova e logo depois de criá-la (não a cada campo salvo)
    const corpo = h("div", { class: ["lp", (novo || opts.recemCriada) && "lp--entrar"] });

    function campoData() {
      const rotulo = h("button", { type: "button", class: "lp-date", title: "Alterar data" }, dataLonga(d.data));
      rotulo.addEventListener("click", () => ZoZo.calendario.abrir(rotulo, d.data, (v) => {
        const antes = d.data; d.data = v;
        rotulo.textContent = dataLonga(d.data);
        salvar(() => { d.data = antes; rotulo.textContent = dataLonga(antes); });
      }, { rotulo: "Data da transação" }));
      return rotulo;
    }

    function campoNome() {
      const input = h("input", { type: "text", class: "lp-name", placeholder: "Nome", value: d.descricao, maxlength: String(ZoZo.regras.limiteNome), "aria-label": "Nome" });
      if (novo) input.dataset.autofocus = "";
      input.addEventListener("input", () => { if (novo) d.descricao = input.value; });
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); input.blur(); } });
      input.addEventListener("blur", () => {
        const v = input.value.trim();
        if (novo) { d.descricao = v; return; }
        if (v === d.descricao) return;
        const antes = d.descricao; d.descricao = v;
        salvar(() => { d.descricao = antes; input.value = antes; });
      });
      return input;
    }

    function campoValor() {
      // editando, o símbolo da moeda continua na frente do valor (data-com-simbolo)
      const input = h("input", { type: "text", inputmode: "decimal", class: ["lp-value", "money", ehVerde(d) && "money--income"], "aria-label": "Valor",
        value: F.moeda(d.valor || 0), "data-com-simbolo": "" });
      input.addEventListener("focus", () => { input.value = d.valor ? F.valorParaEditar(input, d.valor) : ""; F.cursorNoFim(input); });   // sem selecionar tudo
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); input.blur(); } });
      input.addEventListener("blur", () => {
        const v = F.parseMoeda(input.value);
        const valido = v > 0 && v < 1e12;
        if (!valido && input.value.trim()) { statusEl.textContent = "Valor inválido: use só números, como 1.234,56."; statusEl.className = "lp-status lp-status--erro"; }
        if (valido && Math.round(v * 100) !== Math.round((d.valor || 0) * 100)) {
          const antes = d.valor; d.valor = Math.round(v * 100) / 100;
          salvar(() => { d.valor = antes; input.value = F.moeda(antes); });
        }
        input.value = F.moeda(d.valor || 0);
      });
      return input;
    }

    /** "Despesa ▾" / "Saída ▾" acima do valor */
    function subtipo() {
      if (d.tipo === "debito" || d.tipo === "receita" || d.tipo === "recorrente") return null;    // débito é sempre saída: sem rótulo
      const regular = d.tipo === "regular" || d.tipo === "estorno";
      const opcoes = regular ? [["regular", "Despesa"], ["estorno", "Estorno"]] : [["saida", "Saída"], ["entrada", "Entrada"]];
      const atual = regular ? d.tipo : d.sentido;
      const rotulo = (opcoes.find(([v]) => v === atual) || opcoes[0])[1];
      const btn = h("button", { type: "button", class: "lp-sub", "aria-haspopup": "menu" }, rotulo, icon("chevron-down", { size: 13, stroke: 2.25 }));
      btn.addEventListener("click", () => ZoZo.menu.abrir(btn, opcoes.map(([v, t]) => ({
        label: t, check: v === atual,
        onClick: () => {
          if (v === atual) return;
          const antes = { tipo: d.tipo, sentido: d.sentido };
          if (regular) d.tipo = v; else d.sentido = v;
          if (novo) desenhar(); else salvar(() => Object.assign(d, antes)).then(() => reabrir());
        },
      })), { posicao: "direita", label: regular ? "Despesa ou estorno" : "Saída ou entrada", checkEsquerda: true, class: ZoZo.estrutura.menuCompacto }));
      return btn;
    }

    /** Seta ao lado de uma pílula: mostra no painel de informações a conta, categoria, perfil ou recorrência
        (com "voltar" para esta transação). Não mexe nos filtros da lista de Transações. */
    function seta(rotulo, abrirPainel) {
      if (novo) return null;
      return h("button", { type: "button", class: "icon-btn icon-btn--sm lp-ver", "aria-label": "Ver " + rotulo, title: "Ver " + rotulo,
        onClick: abrirPainel }, icon("chevron-right", { size: 14 }));
    }

    /** Conta: escolhida no menu (ao criar e depois, em qualquer tipo); a seta ao lado lista as transações dela */
    function campoConta() {
      const conta = contas.find((c) => c.id === d.contaId);
      const conteudo = [h("span", { class: "lp-account__dot", style: { background: F.cor(conta && conta.cor, "var(--palette-16)") } }),
        h("span", null, conta ? conta.nome + (conta.ultimos4Digitos ? " " + conta.ultimos4Digitos : "") : "Sem conta")];
      const btn = h("button", { type: "button", class: "lp-account", "aria-haspopup": "menu", title: "Trocar conta" }, conteudo);   // clicar na conta abre a lista
      const escolhiveis = contas.filter((c) => (!c.oculta || c.id === d.contaId) && (!ehDebito(d) || c.tipo !== "cartao"));   // débito: cartão não
      btn.addEventListener("click", () => ZoZo.menu.abrir(btn, escolhiveis.map((c) => ({
        label: c.nome + (c.ultimos4Digitos ? " " + c.ultimos4Digitos : ""), check: c.id === d.contaId,
        onClick: () => {
          if (c.id === d.contaId) return;
          const antes = d.contaId; d.contaId = c.id;
          if (novo) desenhar(); else salvar(() => { d.contaId = antes; }).then(reabrir);
        },
      })).concat(escolhiveis.length ? [] : [{ label: ehDebito(d) ? "Nenhuma conta (cartão não vale para débito)" : "Nenhuma conta cadastrada", desabilitado: true }],
        [{ separador: true }, ehDebito(d)
          ? { icone: "mais", label: "Nova conta", onClick: () => novaConta("corrente") }
          : { icone: "mais", label: "Nova conta", submenu: [
            { icone: "banco", label: "Conta corrente ou poupança", onClick: () => novaConta("corrente") },
            { icone: "cartao", label: "Cartão de crédito", onClick: () => novaConta("cartao") }] }]),
      { posicao: "esquerda", label: "Conta", largura: 260 }));
      const origem = conta && conta.tipo === "investimento" ? "investimentos" : "contas";
      return h("div", { class: "lp-account-linha" }, btn,
        conta ? seta(conta.nome, () => ZoZo.contasShared.abrirDetalheConta(conta, ctx, origem, { voltar: voltarParaCa })) : null);
    }
    /** Cria a conta e já a escolhe nesta transação */
    function novaConta(tipo) {
      ZoZo.modais.novaConta(ctx, tipo, { aoCriar: (c) => {
        const antes = d.contaId; d.contaId = c.id;
        ctx.loadData("contas", A.getContas, null, { force: true }).catch(() => null).then(() => {
          if (novo) desenhar(); else salvar(() => { d.contaId = antes; }).then(reabrir);
        });
      } });
    }

    /** Menu de categorias (pesquisa, seta → painel da categoria, + Nova categoria) */
    function menuCategorias(anchor) {
      ZoZo.menu.abrir(anchor, { largura: 280, render(el, api) {
        let termo = "";
        const busca = h("input", { type: "search", class: ZoZo.estrutura.menuPesquisaCampo, placeholder: "Pesquisar", "aria-label": "Pesquisar categoria" });
        const lista = h("div", { class: ZoZo.estrutura.menuListaRolagem });
        const escolher = (id) => { api.fechar(); const antes = d.categoriaId; d.categoriaId = id; if (novo) desenhar(); else salvar(() => { d.categoriaId = antes; }).then(() => reabrir()); };
        const desenharLista = () => mount(lista, cats.filter((c) => !termo || norm(c.nome).includes(termo)).map((c) => h("div", { class: [ZoZo.estrutura.menuItemDividido, c.id === d.categoriaId && "is-checked"] },
          h("button", { type: "button", class: ZoZo.estrutura.menuDivididoPrincipal, onClick: () => escolher(c.id) }, UI.CategoryLabel(c, { pill: true })),
          novo ? null : h("button", { type: "button", class: "icon-btn icon-btn--sm", "aria-label": "Ver categoria " + c.nome, title: "Ver categoria",
            onClick: () => { api.fechar(); ZoZo.categoriasShared.abrirDetalhe(c, ctx, { voltar: voltarParaCa }); } }, icon("chevron-right", { size: 14 })))));
        busca.addEventListener("input", () => { termo = norm(busca.value.trim()); desenharLista(); });
        mount(el, h("div", { class: ZoZo.estrutura.menuPesquisa }, icon("pesquisar", { size: 14 }), busca), lista, h("div", { class: ZoZo.estrutura.menuSeparador }),
          d.categoriaId ? h("button", { type: "button", class: ZoZo.estrutura.menuItem, onClick: () => escolher(null) }, h("span", { class: ZoZo.estrutura.menuRotulo }, "Sem categoria")) : null,
          h("button", { type: "button", class: ZoZo.estrutura.menuItem, onClick: () => { api.fechar(); ZoZo.modais.novaCategoria(ctx, { nome: termo ? busca.value.trim() : "",
            // recarrega as categorias antes de escolher: a nova já aparece selecionada no painel
            aoCriar: (c) => ctx.loadData("categorias", A.getCategorias, null, { force: true }).catch(() => null).then(() => escolher(c.id)) }); } },
            icon("mais", { size: 16, class: ZoZo.estrutura.menuIcone }), h("span", { class: ZoZo.estrutura.menuRotulo }, "Nova categoria")));
        desenharLista();
        requestAnimationFrame(() => busca.focus());
      } }, { posicao: "esquerda", largura: 280, label: "Categoria", focar: false });
    }

    /** Menu de recorrências — o mesmo ao criar e ao editar: as recorrências (a atual marcada, seta → painel
        dela), "Sem recorrência" logo abaixo da última quando há uma, e "+ Nova recorrência". */
    function menuRecorrencia(anchor) {
      const recorrente = !novo && d.tipo === "recorrente";
      const ehOrig = recorrente && (!d.serieId || d.serieId === original.id);
      const atualId = recorrente ? (ehOrig ? original.id : d.serieId) : (pendenteRec && pendenteRec.vincular ? pendenteRec.vincular.id : null);
      const temRecorrencia = recorrente || !!pendenteRec;
      // a origem de uma série não pode entrar em outra série (os membros dela ficariam órfãos)
      const lista = origens().filter((o) => !ehOrig || o.id === original.id);
      const itens = lista.map((o) => ({ render: (api) => h("div", { class: [ZoZo.estrutura.menuItemDividido, o.id === atualId && "is-checked"] },
        h("button", { type: "button", class: ZoZo.estrutura.menuDivididoPrincipal, onClick: () => { api.fechar(); if (o.id !== atualId) vincular(o); } },
          h("span", { class: "kind-badge" }, o.recorrencia === "parcelada" ? "P" : "R"), h("span", { class: ZoZo.estrutura.menuRotulo }, o.descricao), h("small", { class: ZoZo.estrutura.menuDica }, rotuloRecorrencia(o))),
        novo ? null : h("button", { type: "button", class: "icon-btn icon-btn--sm", "aria-label": "Ver recorrência " + o.descricao, onClick: () => { api.fechar(); abrirRecorrencia(o.id); } }, icon("chevron-right", { size: 14 }))) }));
      if (temRecorrencia) itens.push({ label: "Sem recorrência", onClick: semRecorrencia });
      // membro de uma série: "Nova recorrência" só depois de sair dela (Sem recorrência)
      if (!recorrente || ehOrig) {
        if (itens.length) itens.push({ separador: true });
        // parcelado: o valor da transação é o TOTAL da compra (o ZoZo divide pelas parcelas)
        itens.push({ icone: "mais", label: "Nova recorrência", onClick: () => ZoZo.modais.frequencia(ctx, novo ? null : original.id,
          novo ? { valor: d.valor, aoEscolher: (dados) => { pendenteRec = { nova: dados }; desenhar(); } } : { valor: d.valor, aoTerminar: reabrir }) });
      }
      ZoZo.menu.abrir(anchor, itens, { posicao: "esquerda", largura: 290, label: "Recorrência" });

      function semRecorrencia() {
        if (novo) { pendenteRec = null; desenhar(); return; }
        const desfazer = () => ctx.bridge.request(A.desvincularRecorrencia, { id: original.id })
          .then(() => { ctx.toast("Recorrência removida desta transação."); return ctx.recarregarTudo().then(reabrir); })
          .catch((e) => ctx.toast(e.friendly, { tone: "error" }));
        if (!ehOrig) return desfazer();
        // origem: as parcelas futuras somem e as já lançadas deixam de fazer parte da série
        ZoZo.feedback.confirmarExclusao("Remover recorrência?", "As parcelas e ocorrências futuras desta série serão excluídas. As transações já lançadas continuam, sem recorrência. Essa ação não pode ser desfeita.",
          { confirmar: "Remover" }).then((ok) => ok && desfazer());
      }
    }
    function vincular(o) {
      if (novo) { pendenteRec = { vincular: o }; desenhar(); return; }
      ctx.bridge.request(A.vincularRecorrencia, { id: original.id, serieId: o.id })
        .then(() => { ctx.toast("Transação ligada à recorrência."); return ctx.recarregarTudo().then(reabrir); })
        .catch((e) => ctx.toast(e.friendly, { tone: "error" }));
    }
    function abrirRecorrencia(serieId) {
      ctx.loadData("recorrencias", A.getRecorrencias, null, { force: true }).then((r) => {
        const oc = (r.recorrencias || []).concat(r.proximas || [], r.arquivadas || []).find((x) => x.serieId === serieId);
        if (oc) ZoZo.recorrenciasShared.abrirDetalhe(oc, ctx, { voltar: voltarParaCa });
        else ctx.toast("Esta recorrência não tem ocorrência neste mês.", { tone: "aviso" });
      });
    }

    const perfilAtual = () => perfis.find((x) => x.id === d.perfilId) || null;
    function campoPerfil() {
      const p = perfilAtual();
      const btn = p ? h("button", { type: "button", class: "lp-chip-btn", "aria-haspopup": "menu" }, UI.Tag(p.nome, p.cor, { class: "tag--upper" }))
        : h("button", { type: "button", class: "lp-add", "aria-label": "Adicionar perfil", "aria-haspopup": "menu" }, icon("mais", { size: 14 }));
      btn.addEventListener("click", () => ZoZo.menu.abrir(btn, perfis.filter((x) => !x.arquivado || x.id === d.perfilId).map((x) => ({
        render: (api) => h("button", { type: "button", class: [ZoZo.estrutura.menuItem, x.id === d.perfilId && "is-checked"], onClick: () => {
          api.fechar(); const antes = d.perfilId; d.perfilId = x.id; if (novo) desenhar(); else salvar(() => { d.perfilId = antes; }).then(reabrir);
        } }, UI.Tag(x.nome, x.cor, { class: "tag--upper" })),
      })).concat([
        // sem "Sem perfil": nas contas com Perfis toda transação tem perfil (regra do serviço)
        { separador: true }, { icone: "mais", label: "Novo perfil", onClick: () => ZoZo.modais.novoPerfil(ctx, { aoCriar: (np) => {
          const antes = d.perfilId; d.perfilId = np.id;
          ctx.loadData("perfis", A.getPerfis, null, { force: true }).catch(() => null).then(() => {
            if (novo) desenhar(); else salvar(() => { d.perfilId = antes; }).then(reabrir);
          });
        } }) },
      ].filter(Boolean)), { posicao: "esquerda", label: "Perfil", largura: 240 }));
      return btn;
    }

    function campoNotas() {
      const t = h("textarea", { class: "lp-notes", rows: "1", placeholder: "Adicionar uma observação...", "aria-label": "Observação", maxlength: "2000" });
      t.value = d.notas || "";
      const ajustar = () => { t.style.height = "auto"; t.style.height = Math.max(24, t.scrollHeight) + "px"; };
      t.addEventListener("input", () => { ajustar(); if (novo) d.notas = t.value; });
      t.addEventListener("blur", () => {
        if (novo) { d.notas = t.value; return; }
        if (t.value === (d.notas || "")) return;
        const antes = d.notas; d.notas = t.value;
        salvar(() => { d.notas = antes; t.value = antes || ""; });
      });
      requestAnimationFrame(ajustar);
      return t;
    }

    /** Histórico: lançamentos com o mesmo nome (lista agrupada por mês e dia) */
    function historico() {
      if (novo) return null;
      const todos = (store.get().data.lancamentos && store.get().data.lancamentos.lancamentos) || [];
      const itens = todos.filter((x) => x.id !== original.id && norm(x.descricao) === norm(original.descricao)).slice(0, 40);
      if (!itens.length) return null;
      return h("section", { class: "lp-history" }, L.ListaPainel(itens, { onClick: (x) => abrir(x, ctx, { voltar: voltarParaCa }) }));
    }

    /* ---------- montagem ---------- */
    function desenhar() {
      ({ contas, cats, perfis } = listas());
      tituloTxt.textContent = NOMES[d.tipo] || "Transação";               // o título acompanha o tipo escolhido
      const recAtual = !novo && d.tipo === "recorrente" ? origens().find((o) => o.id === (d.serieId && !String(d.serieId).startsWith("removida:") ? d.serieId : original.id)) || d : null;
      const chipRec = recAtual
        ? h("button", { type: "button", class: "lp-chip-btn lp-rec", "aria-haspopup": "menu" }, h("span", { class: "kind-badge" }, recAtual.recorrencia === "parcelada" ? "P" : "R"), rotuloRecorrencia(recAtual))
        : pendenteRec
          ? h("button", { type: "button", class: "lp-chip-btn lp-rec", "aria-haspopup": "menu" }, h("span", { class: "kind-badge" }, "R"),
            pendenteRec.vincular ? pendenteRec.vincular.descricao : rotuloRecorrencia(Object.assign({}, pendenteRec.nova)))
          : h("button", { type: "button", class: "lp-add", "aria-label": "Adicionar recorrência", "aria-haspopup": "menu" }, icon("mais", { size: 14 }));
      chipRec.addEventListener("click", () => menuRecorrencia(chipRec));

      const cat = cats.find((c) => c.id === d.categoriaId);
      const chipCat = cat ? h("button", { type: "button", class: "lp-chip-btn", "aria-haspopup": "menu" }, UI.CategoryLabel(cat, { pill: true }))
        : h("button", { type: "button", class: "lp-add", "aria-label": "Adicionar categoria", "aria-haspopup": "menu" }, icon("mais", { size: 14 }));
      chipCat.addEventListener("click", () => menuCategorias(chipCat));

      mount(corpo,
        h("section", { class: "lp-top" },
          h("div", { class: "lp-top__left" }, campoData(), campoNome(), campoConta()),
          h("div", { class: "lp-top__right" }, subtipo(), campoValor())),
        h("section", { class: "lp-props" },
          temCategoria(d) ? h("div", { class: "lp-prop" }, h("span", { class: "lp-prop__label" }, "Categoria"),
            h("div", { class: "lp-pilula" }, chipCat, cat ? seta(cat.nome, () => ZoZo.categoriasShared.abrirDetalhe(cat, ctx, { voltar: voltarParaCa })) : null)) : null,
          comPerfis ? h("div", { class: "lp-prop" }, h("span", { class: "lp-prop__label" }, "Perfil"),
            h("div", { class: "lp-pilula" }, campoPerfil(), perfilAtual() ? seta(perfilAtual().nome, () => ZoZo.perfilShared.abrirDetalhe(perfilAtual(), ctx, { voltar: voltarParaCa })) : null)) : null,
          temCategoria(d) ? h("div", { class: "lp-prop" }, h("span", { class: "lp-prop__label" }, "Recorrência"),
            h("div", { class: "lp-pilula" }, chipRec, recAtual ? seta(recAtual.descricao || "recorrência", () => abrirRecorrencia(recAtual.id || d.serieId)) : null)) : null,
          // Divisão entre perfis: rachada → resumo; senão o "+" (igual ao da recorrência; também em recorrentes já criadas)
          podeDividir ? h("div", { class: "lp-prop" }, h("span", { class: "lp-prop__label" }, "Divisão"),
            d.divisao
              ? h("button", { type: "button", class: "lp-chip-btn lp-rec lp-split", onClick: abrirDivisao },
                icon("dividir", { size: 12 }), F.moeda(d.divisao.total) + " dividido em " + d.divisao.partes + " partes")
              : h("button", { type: "button", class: "lp-add", "aria-label": "Adicionar divisão", title: "Adicionar divisão", onClick: abrirDivisao }, icon("mais", { size: 14 }))) : null),
        h("section", { class: "lp-notes-wrap" }, campoNotas()),
        statusEl,
        historico());
    }

    /* ---------- criar ---------- */
    function criar(btn) {
      const nomeAtual = corpo.querySelector(".lp-name");
      if (nomeAtual) d.descricao = nomeAtual.value.trim();
      const valorEl = corpo.querySelector(".lp-value");
      if (valorEl && document.activeElement === valorEl) valorEl.blur();
      if (!d.descricao) { statusEl.textContent = "Informe o nome."; statusEl.className = "lp-status lp-status--erro"; if (nomeAtual) nomeAtual.focus(); return; }
      if (!(d.valor > 0)) { statusEl.textContent = "Informe um valor maior que zero."; statusEl.className = "lp-status lp-status--erro"; corpo.querySelector(".lp-value").focus(); return; }
      if (temCategoria(d) && !d.categoriaId) { statusEl.textContent = "Escolha uma categoria."; statusEl.className = "lp-status lp-status--erro"; return; }
      if (comPerfis && !d.perfilId) { statusEl.textContent = "Escolha um perfil."; statusEl.className = "lp-status lp-status--erro"; return; }
      if (d.tipo === "debito" && !contas.some((c) => c.id === d.contaId && c.tipo !== "cartao")) { statusEl.textContent = ZoZo.messages.FRIENDLY.DEBIT_ACCOUNT; statusEl.className = "lp-status lp-status--erro"; return; }
      btn.disabled = true;
      ctx.bridge.request(A.createLancamento, { lancamento: payload() }).then((r) => {
        const id = r.lancamento.id;
        if (pendenteRec && pendenteRec.vincular) return ctx.bridge.request(A.vincularRecorrencia, { id, serieId: pendenteRec.vincular.id }).then(() => id);
        if (pendenteRec && pendenteRec.nova) return ctx.bridge.request(A.tornarRecorrente, Object.assign({ id }, pendenteRec.nova)).then(() => id);
        return id;
      }).then((id) => {
        ctx.toast("Transação criada.");
        return ctx.recarregarTudo().then(() => abrir({ id }, ctx, { recemCriada: true }));
      }).catch((e) => { btn.disabled = false; statusEl.textContent = e.friendly; statusEl.className = "lp-status lp-status--erro"; });
    }

    const excluir = () => {
      const origemParcelada = original.recorrencia === "parcelada" && (!original.serieId || original.serieId === original.id);
      ZoZo.feedback.confirmarExclusao("Excluir transação?", "Tem certeza de que deseja excluir esta transação?" +
        (origemParcelada ? " As parcelas futuras desta compra também serão excluídas; as já pagas continuam." : ""))
        .then((ok) => ok && ctx.bridge.request(A.deleteLancamento, { id: original.id }).then(() => {
          ctx.detail.close({ silencioso: true }); ctx.toast("Transação excluída."); return ctx.recarregarTudo();
        }).catch((e) => ctx.toast(e.friendly, { tone: "error" })));
    };

    const abrirDivisao = () => ZoZo.dividir.abrir(original, ctx, (id) => abrir({ id }, ctx, opts));
    // Dividir: qualquer transação já criada — inclusive recorrente (origem: uma série por parte;
    // ocorrência já lançada: divide só aquele mês, as partes continuam na série)
    const podeDividir = comPerfis && !novo;

    ctx.detail.open({
      tituloNode: tituloBtn,
      title: NOMES[d.tipo],
      selected: novo ? null : { tipo: "lancamento", id: original.id },
      voltar: opts.voltar || null,
      botoes: novo ? [{ label: "Criar", icone: "check", primario: true, onClick: (e) => criar(e.currentTarget) }]
        : podeDividir && d.divisao ? [{ label: "Editar divisão", icone: "dividir", onClick: abrirDivisao }] : [],
      menu: novo ? null : [{ label: "Excluir transação", perigo: true, onClick: excluir }],
      render(body) { desenhar(); mount(body, corpo); },
    });
  }

  ZoZo.lancamentoPainel = { abrir };
})(window.ZoZo);
