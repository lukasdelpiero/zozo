/* =============================================================
   ZoZo — Perfil (seções 5.3, 32, 33) e Configurações
   Visual em Tailwind (tabelas PR e CF abaixo; linhas das Configurações
   em components/pecas.ts). Ganchos sem CSS: profile-row, p2fa (o painel
   do 2FA aberto), codigo6.
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const { h, mount } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const UI = ZoZo.ui;
  const L = ZoZo.list;
  const C = ZoZo.pagesComum;
  const F = ZoZo.format;
  const A = ZoZo.messages.ACTIONS;
  const FR = ZoZo.messages.FRIENDLY;
  const store = ZoZo.store;

  /* Linha de perfil (como a de Contas): [ícone] nome / quantidade ........ gasto no mês */
  const PR = {
    linha: "profile-row tw:grid tw:items-center tw:gap-x-3 tw:gap-y-4 tw:w-full tw:min-h-(--row-height-tall) tw:px-4 tw:py-0 tw:[border:0] tw:rounded-lg "
      + "tw:text-inherit tw:text-left tw:text-[15px] tw:grid-cols-[36px_minmax(0,1fr)_auto] tw:focus-visible:outline-offset-[-2px] "
      + "tw:[transition:background_var(--duration-fast)_var(--easing),box-shadow_var(--duration-fast)_var(--easing)]",
    normal: "tw:bg-transparent tw:hover:bg-zz-surface-hover",
    selecionada: "tw:bg-zz-primary-soft",
    inicial: "tw:text-[15px] tw:font-[620] tw:leading-none tw:uppercase tw:select-none",
    texto: "tw:flex tw:flex-col tw:gap-px tw:min-w-0",
    nome: "tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[15px] tw:font-[450]",
    quantidade: "tw:[justify-self:start] tw:whitespace-nowrap tw:text-zz-secondary tw:text-[13px] tw:font-[450]",
    valor: "money tw:[justify-self:end] tw:whitespace-nowrap",
  };

  /* Configurações: abas à esquerda (em cima até 700 px), conteúdo rolando e Sair/Excluir conta fixos no rodapé */
  const NAV_ITEM = "tw:flex tw:items-center tw:justify-start tw:gap-2.5 tw:h-[34px] tw:w-full tw:px-2.5 tw:py-0 tw:[border:0] tw:rounded-lg tw:text-[15px] tw:text-left "
    + "tw:relative tw:[transition:background_var(--duration-fast)_var(--easing),color_var(--duration-fast)_var(--easing)] tw:ate700:w-auto tw:ate700:flex-none";
  const CF = {
    raiz: "tw:grid tw:grid-cols-[220px_minmax(0,1fr)] tw:h-full tw:gap-0 tw:ate700:grid-cols-[minmax(0,1fr)] tw:ate700:grid-rows-[auto_minmax(0,1fr)]",
    nav: "tw:flex tw:flex-col tw:gap-0.5 tw:py-4 tw:px-3 tw:border-r tw:border-zz-border tw:bg-zz-surface tw:rounded-l-[20px] "
      + "tw:ate700:flex-row tw:ate700:items-center tw:ate700:gap-1 tw:ate700:pt-2.5 tw:ate700:pr-12 tw:ate700:pb-2.5 tw:ate700:pl-3 tw:ate700:border-r-0 "
      + "tw:ate700:border-b tw:ate700:overflow-x-auto",
    navTitulo: "tw:pt-1 tw:px-2.5 tw:pb-2 tw:text-[11.5px] tw:font-semibold tw:tracking-[0.06em] tw:uppercase tw:text-zz-muted tw:ate700:hidden",
    navItem: NAV_ITEM + " tw:bg-transparent tw:text-[#3b465e] tw:hover:bg-zz-surface-hover tw:[&_.icon]:text-zz-secondary",
    navItemAtivo: NAV_ITEM + " tw:bg-zz-primary-soft tw:text-zz-primary tw:font-semibold tw:[&_.icon]:text-zz-primary",
    principal: "tw:flex tw:flex-col tw:min-h-0 tw:h-full",
    // cada bloco do conteúdo traz o próprio respiro lateral (as linhas e títulos vão de ponta a ponta)
    conteudo: "tw:flex-1 tw:min-h-0 tw:overflow-y-auto tw:pt-5 tw:pb-6 tw:px-0 tw:[container-type:inline-size] tw:*:pl-6 tw:*:pr-8 tw:ate700:*:px-4",
    rodape: "tw:flex tw:justify-between tw:items-center tw:flex-none tw:m-0 tw:py-4 tw:pl-6 tw:pr-8 tw:border-t tw:border-zz-border tw:bg-zz-surface "
      + "tw:rounded-br-[20px] tw:ate700:px-4",
    excluirConta: "tw:h-[34px] tw:py-0 tw:px-3.5 tw:border tw:border-zz-border-strong tw:rounded-lg tw:bg-zz-surface tw:text-(--color-danger) tw:text-[13px] "
      + "tw:font-[550] tw:hover:bg-(--color-danger-soft) tw:hover:border-[color-mix(in_srgb,var(--color-danger)_40%,var(--color-border))]",
    leitura: "tw:text-zz-secondary tw:text-[13px] tw:font-[550]",
    nota: "tw:mt-1 tw:mx-0 tw:mb-2 tw:text-[13px] tw:text-zz-secondary",
    ok: "tw:text-zz-positive",
    alerta: "tw:text-zz-warning-text",
    // foto: clique para trocar (a câmera aparece ao passar o mouse ou com o foco)
    foto: "tw:flex tw:flex-col tw:items-center tw:gap-2.5 tw:pt-2 tw:pb-3 tw:px-0! tw:ate700:px-4!",      // centralizada (sem o respiro lateral maior)
    fotoBotao: "tw:group/foto tw:relative tw:[border:0] tw:p-0 tw:bg-transparent tw:rounded-[50%] tw:cursor-pointer tw:focus-visible:outline-2 "
      + "tw:focus-visible:outline-(--color-focus) tw:focus-visible:outline-offset-2",
    fotoCamera: "tw:absolute tw:inset-0 tw:grid tw:place-items-center tw:rounded-[50%] tw:bg-[rgba(22,33,58,0.45)] tw:text-white tw:opacity-0 "
      + "tw:[transition:opacity_var(--duration-fast)_var(--easing)] tw:group-hover/foto:opacity-100 tw:group-focus-visible/foto:opacity-100",
    // senha atual · nova senha · Alterar (área estreita: um embaixo do outro)
    senha: "tw:flex tw:flex-row tw:items-center tw:gap-2 tw:w-full tw:[&>.btn]:flex-none tw:area480:flex-col tw:area480:items-stretch tw:area480:[&>.btn]:self-end",
    // tipo · chave · nome · cidade · [Remover] Salvar — tudo numa linha (área estreita: um embaixo do outro)
    pix: "tw:grid tw:grid-cols-[104px_minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,0.7fr)_auto] tw:gap-2 tw:w-full tw:items-center tw:area560:grid-cols-[minmax(0,1fr)]",
    pixAcoes: "tw:flex tw:gap-2 tw:justify-end",
    pixErro: "tw:mt-1.5 tw:mx-0 tw:mb-0 tw:text-[13px] tw:text-(--color-danger) tw:empty:hidden",
  };
  /* Painel do 2FA: desliza por cima do conteúdo da janela, da direita */
  const P2 = {
    painel: "p2fa tw:absolute tw:inset-y-0 tw:right-0 tw:z-5 tw:w-[min(372px,100%)] tw:overflow-y-auto tw:bg-zz-surface tw:border-l tw:border-zz-border "
      + "tw:[box-shadow:-12px_0_32px_rgba(15,39,66,0.12)] tw:[transform:translateX(100%)] tw:[transition:transform_240ms_var(--easing,ease)] "
      + "tw:[&.is-aberto]:[transform:translateX(0)] tw:motion-reduce:[transition:none]",
    topo: "tw:flex tw:items-center tw:justify-between tw:gap-2 tw:pt-[18px] tw:pr-4 tw:pb-3.5 tw:pl-5 tw:border-b tw:border-zz-border",
    titulo: "tw:m-0 tw:text-[15px] tw:font-[550] tw:text-zz-text",
    passos: "tw:list-none tw:m-0 tw:pt-[18px] tw:px-5 tw:pb-6 tw:flex tw:flex-col tw:gap-[18px]",
    passo: "tw:grid tw:grid-cols-[22px_minmax(0,1fr)] tw:gap-2.5 tw:items-start",
    numero: "tw:size-[22px] tw:grid tw:place-items-center tw:rounded-md tw:bg-(--color-surface-hover,#f1f3f6) tw:text-[13px] tw:font-[550] tw:text-zz-secondary",
    passoTitulo: "tw:mt-px tw:mx-0 tw:mb-0 tw:flex tw:items-center tw:gap-2 tw:text-[15px] tw:font-[450] tw:text-zz-text",
    dica: "tw:mt-1 tw:mx-0 tw:mb-0 tw:text-[13px] tw:text-zz-muted",
    ok: "tw:size-[18px] tw:inline-grid tw:place-items-center tw:rounded-[50%] tw:bg-zz-positive tw:text-white tw:flex-none tw:[&[hidden]]:hidden",
    qr: "tw:w-[176px] tw:min-h-[176px] tw:mt-3 tw:mx-0 tw:mb-2 tw:grid tw:place-items-center tw:[&_.qr]:block tw:[&_.qr]:rounded-lg",
    chaveLinha: "tw:flex tw:items-center tw:gap-1.5",
    chave: "tw:text-[13px] tw:tracking-[0.04em] tw:text-zz-secondary tw:break-all",
    erro: "tw:mt-2.5 tw:mx-0 tw:mb-0 tw:text-[13px] tw:font-[450] tw:text-zz-text tw:empty:hidden",
    codigo: "tw:justify-start tw:mt-3 tw:gap-1.5",
    caixa: "tw:w-[38px] tw:h-[44px] tw:text-[18px]",
  };

  const mesAbrev = (mesIso: any) => F.mesAbrev((F.parseData((mesIso || F.iso(new Date()).slice(0, 7)) + "-01") || new Date()).getMonth());
  const mesInteiro = (mesIso?: any) => F.mesNome((F.parseData((mesIso || F.iso(new Date()).slice(0, 7)) + "-01") || new Date()).getMonth());

  function verLancamentos(p: any, ctx: ContextoApp) {
    ZoZo.lancamentosShared.setFiltros(Object.assign(ZoZo.lancamentosShared.FILTROS_VAZIOS(), { perfis: [p.id] }), ctx);
    store.set({ ui: { busca: "" } });
    ctx.navigate("lancamentos");
  }

  /* ---------------- Cadastro / edição ---------------- */
  function abrirFormPerfil(ctx: ContextoApp, p: any, voltar: any) {
    const novo = !p;
    return ctx.loadData("perfis", A.getPerfis).catch(() => null).then(() => ZoZo.forms.abrir(ctx, {
      titulo: novo ? "Novo perfil" : "Editar perfil",
      voltar,
      selected: p ? { tipo: "perfil", id: p.id } : null,
      valores: p ? { nome: p.nome, orcamento: p.orcamento || "", cor: p.cor } : { cor: ZoZo.regras.corSugerida() },
      campos: [
        { nome: "nome", rotulo: "Nome do perfil", obrigatorio: true, placeholder: "Ex.: Casa, Mãe, Trabalho", max: ZoZo.regras.limiteNome },
        { nome: "cor", rotulo: "Cor da tag", tipo: "cor" },
      ],
      aoCancelar: p ? () => abrirDetalhe(p, ctx) : undefined,
      salvar: (d) => {
        d.orcamento = (p && p.orcamento) || 0;
        const req = novo ? ctx.bridge.request(A.createPerfil, { perfil: d }) : ctx.bridge.request(A.updatePerfil, { id: p.id, perfil: d });
        return req.then((r: any) => {
          ctx.toast(novo ? "Perfil criado." : "Perfil salvo.");
          return ctx.recarregarTudo().then(() => {
            const atual = ((store.get().data.perfis || {}).perfis || []).find((x: any) => x.id === (novo ? r.perfil.id : p.id));
            if (atual && store.get().currentPage === "perfil") abrirDetalhe(atual, ctx);
          });
        });
      },
    }));
  }

  function excluirPerfil(p: any, ctx: ContextoApp) {
    ZoZo.feedback.confirmarExclusao("Excluir perfil?", "Tem certeza de que deseja excluir este perfil?")
      .then((ok) => ok && ctx.bridge.request(A.deletePerfil, { id: p.id }).then(() => {
        ctx.detail.close({ silencioso: true }); ctx.toast("Perfil excluído."); return ctx.recarregarTudo();
      }).catch((e: any) => ctx.toast(e.friendly, { tone: "error" })));
  }

  function arquivar(p: any, ctx: ContextoApp) {
    ctx.bridge.request(A.arquivarPerfil, { id: p.id, arquivar: !p.arquivado }).then(() => {
      ctx.toast(p.arquivado ? "Perfil desarquivado." : "Perfil arquivado.");
      return ctx.recarregarTudo().then(() => {
        const atual = ((store.get().data.perfis || {}).perfis || []).find((x: any) => x.id === p.id);
        if (atual) abrirDetalhe(atual, ctx);
      });
    }).catch((e: any) => ctx.toast(e.friendly, { tone: "error" }));
  }

  /* ---------------- Painel do perfil ---------------- */
  function abrirDetalhe(p: any, ctx: ContextoApp, opts?: any) {
    const o = opts || {};
    ctx.detail.open({
      title: "Perfil",
      selected: { tipo: "perfil", id: p.id },
      voltar: o.voltar,
      menu: [
        { label: p.arquivado ? "Desarquivar" : "Arquivar", onClick: () => arquivar(p, ctx) },
        ZoZo.recursos.boleto() ? { label: "Gerar fatura", onClick: () => ZoZo.boleto.open(ctx, { perfilId: p.id }) } : null,
        // Cancelar/salvar voltam para este painel (com os dados atualizados)
        { label: "Editar perfil", onClick: () => abrirFormPerfil(ctx, p, () => {
          const atual = ((store.get().data.perfis || {}).perfis || []).find((x: any) => x.id === p.id);
          if (atual) abrirDetalhe(atual, ctx, opts); else ctx.detail.close({ silencioso: true });
        }) },
        { separador: true },
        { label: "Excluir perfil", perigo: true, onClick: () => excluirPerfil(p, ctx) },
      ].filter(Boolean),
      render(body: any) {
        const listaEl = h("div", { class: ZoZo.pecas.painelLista }, UI.Skeleton(3, { short: true }));
        mount(body,
          h("div", { class: ZoZo.pecas.painelTopo },
            h("div", { class: ZoZo.pecas.edicaoTopo },
              h("div", { class: ZoZo.pecas.edicaoTopoLinha },
                ZoZo.inline.corDot(p.cor, (c) => ctx.bridge.request(A.updatePerfil, { id: p.id, cor: c }).then(() => { ctx.toast("Cor alterada."); return ctx.recarregarTudo(); })),
                ZoZo.inline.texto({ valor: p.nome, rotulo: "Nome do perfil", max: ZoZo.regras.limiteNome,
                  aoSalvar: (v) => ctx.bridge.request(A.updatePerfil, { id: p.id, nome: v }).then(() => { ctx.toast("Nome alterado."); return ctx.recarregarTudo(); }) })),
              p.arquivado ? h("span", { class: ZoZo.pecas.chipPendente }, "Arquivado") : null),
            h("div", { class: ZoZo.pecas.painelTopoNumero },
              h("span", { class: ZoZo.pecas.painelTopoRotulo }, "Transações"),
              h("span", { class: ZoZo.pecas.painelTopoValor }, String(p.quantidade || 0)))),
          C.detalheSecao(null,
            C.detalheLinha("Gasto em " + mesInteiro(), F.moeda(p.gasto || 0)),
            p.arquivado ? h("p", { class: ZoZo.pecas.campoDica }, "Perfil arquivado: continua nas transações e nos totais, mas não pode ser usado em novas transações.") : null),
          C.detalheSecao("Últimas transações", listaEl,
            h("div", { class: ZoZo.pecas.painelAcoesFim }, UI.Button("Ver todos", { variant: "text", size: "sm", onClick: () => verLancamentos(p, ctx) }))));
        ctx.loadData("lancamentos", A.getLancamentos).then((d: any) => {
          const itens = d.lancamentos.filter((l: any) => l.perfilId === p.id).slice(0, 10);
          mount(listaEl, itens.length
            // a transação abre aqui mesmo, com a seta para voltar a este perfil
            ? L.ListaPainel(itens, { onClick: (l) => ZoZo.lancamentoPainel.abrir(l, ctx, { voltar: () => abrirDetalhe((((ZoZo.store.get().data.perfis || {}).perfis) || []).find((x: any) => x.id === p.id) || p, ctx, opts) }) })
            : UI.EmptyState("Nenhuma transação com este perfil."));
        }).catch((e: any) => mount(listaEl, UI.ErrorState(e.friendly)));
      },
    });
  }

  /** Ícone redondo do perfil: fundo na cor do perfil e a inicial do nome (mesmo formato do ícone das contas) */
  function AvatarPerfil(p: any) {
    const inicial = (Array.from(String(p.nome || "").trim())[0] || "?").toLocaleUpperCase("pt-BR");
    return h("span", { class: [ZoZo.pecas.iconeConta, PR.inicial], style: { "--account-color": F.cor(p.cor, "var(--palette-16)") }, "aria-hidden": "true" }, inicial);
  }

  /** Linha como a de Contas: [ícone] nome / quantidade de lançamentos ........ gasto no mês */
  function linhaPerfil(p: any, sel: any, ctx: ContextoApp) {
    return h("button", { type: "button", class: [PR.linha, p.id === sel ? PR.selecionada : PR.normal], "aria-current": p.id === sel ? "true" : undefined, onClick: () => abrirDetalhe(p, ctx) },
      AvatarPerfil(p),
      h("span", { class: PR.texto },
        h("span", { class: PR.nome }, p.nome),
        h("span", { class: PR.quantidade }, p.quantidade === 1 ? "1 transação" : (p.quantidade || 0) + " transações")),
      h("span", { class: PR.valor }, F.moeda(p.gasto || 0)));
  }

  ZoZo.pages.perfil = {
    titulo: "Perfis",
    recurso: "perfis",                 // a página só existe para contas com o recurso (router.ts)
    topbar: (ctx) => [UI.IconButton("mais", "Novo perfil", { onPrimary: true, onClick: () => ZoZo.modais.novoPerfil(ctx, { aoCriar: (p: any) => abrirDetalhe(Object.assign({ gasto: 0, quantidade: 0 }, p), ctx) }) })],
    carregar: (ctx, force) => ctx.loadData("perfis", A.getPerfis, null, { force }),
    deps: (s) => [s.data.perfis, s.errors.perfis, s.selectedItem, s.ui.gruposFechados],
    render(state, ctx) {
      const espera = C.estadoCarregamento(state, ["perfis"], () => this.carregar(ctx, true), { skeleton: UI.Skeleton(4) });
      if (espera) return C.pagina("page--perfil", espera);
      const d = state.data.perfis;
      const perfis = d.perfis || [];
      const ativos = perfis.filter((p: any) => !p.arquivado);
      const arquivados = perfis.filter((p: any) => p.arquivado);
      const sel = state.selectedItem && state.selectedItem.tipo === "perfil" ? state.selectedItem.id : null;

      if (!perfis.length) {
        return C.pagina("page--perfil", UI.EmptyState("Nenhum perfil cadastrado.",
          { icon: "perfil", action: { label: "Novo perfil", icon: "mais", onClick: () => ZoZo.modais.novoPerfil(ctx, {}) } }));
      }

      return C.pagina("page--perfil",
        C.cardResumoDonut({
          ariaLabel: "Gastos do mês por perfil",
          esquerda: { valor: d.resumo ? d.resumo.gasto : 0, label: "gasto em " + mesAbrev(d.mes) },
          direita: { texto: String(d.resumo ? d.resumo.lancamentosMes : 0), label: "transações em " + mesAbrev(d.mes) },
          segmentos: ativos.map((p: any) => ({ label: p.nome, cor: p.cor, valor: p.gasto })),
        }),
        UI.Section({ key: "perfil:lista", title: "Perfis" },
          ativos.length ? h("div", { class: ZoZo.pecas.listaLinhas }, ativos.map((p: any) => linhaPerfil(p, sel, ctx))) : UI.EmptyState("Todos os perfis estão arquivados.", { icon: "perfil" })),
        arquivados.length ? UI.Section({ key: "perfil:arquivados", title: "Perfis arquivados" },
          h("div", { class: ZoZo.pecas.listaLinhas }, arquivados.map((p: any) => linhaPerfil(p, sel, ctx)))) : null);
    },
  };

  ZoZo.perfilShared = { abrirFormPerfil, AvatarPerfil, abrirDetalhe: (p: any, ctx: ContextoApp, opts?: any) => abrirDetalhe(p, ctx, opts) };

  /* =============================================================
     Configurações (região inferior do painel lateral — seção 8)
     ============================================================= */

  /** Reduz a foto a 256×256 (JPEG) no próprio aplicativo: remove metadados e qualquer conteúdo embutido */
  function processarFoto(arquivo: any) {
    return new Promise((resolve, reject) => {
      if (!arquivo || !/^image\/(png|jpeg|webp|gif|bmp)$/.test(arquivo.type) || arquivo.size > 15 * 1024 * 1024) { reject(new Error("formato")); return; }
      const leitor = new FileReader();
      leitor.onerror = () => reject(new Error("leitura"));
      leitor.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("imagem"));
        img.onload = () => {
          const lado = Math.min(img.naturalWidth, img.naturalHeight);
          const cv = document.createElement("canvas");
          cv.width = cv.height = 256;
          const g = cv.getContext("2d");
          if (!g) { reject(new Error("canvas")); return; }
          g.fillStyle = "#fff"; g.fillRect(0, 0, 256, 256);
          g.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, 256, 256);
          resolve(cv.toDataURL("image/jpeg", 0.86));
        };
        img.src = String(leitor.result);
      };
      leitor.readAsDataURL(arquivo);
    });
  }

  /** Avatar redondo: foto do usuário ou iniciais */
  function Avatar(foto: any, nome: any, tamanho: any) {
    const iniciais = String(nome || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0] || "").join("").toUpperCase();
    // base com especificidade zero: o menu lateral troca fundo e cor (inicial clara sobre o roxo)
    return h("span", { class: "tw:base:flex-none tw:base:grid tw:base:place-items-center tw:base:overflow-hidden tw:base:rounded-[50%] tw:base:bg-zz-primary-soft "
      + "tw:base:text-zz-primary tw:base:font-semibold tw:base:[box-shadow:0_0_0_2px_#fff,0_0_0_3px_var(--color-border)] tw:[&>img]:size-full tw:[&>img]:object-cover tw:[&>img]:block", style: { width: (tamanho || 40) + "px", height: (tamanho || 40) + "px", fontSize: Math.round((tamanho || 40) * 0.38) + "px" }, "aria-hidden": "true" },
      foto && /^data:image\/jpeg;base64,/.test(foto) ? h("img", { src: foto, alt: "" }) : iniciais);
  }

  /** CSV das transações (separador ";" para o Excel em português). Multicâmbio: coluna Moeda (só a moeda escolhida) */
  function gerarCsv(lancamentos: any, moeda: any) {
    // Texto: aspas duplicadas e proteção contra fórmulas (=, +, -, @, tab, CR — inclusive após espaços)
    const texto = (v: any) => {
      let t = String(v === null || v === undefined ? "" : v);
      if (/^\s*[=+\-@\t\r]/.test(t)) t = "'" + t;
      return /[;"\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    };
    // Número: sempre gerado aqui (nunca vem do usuário), fica numérico no Excel
    const numero = (v: any) => v.toFixed(2).replace(".", ",");
    const entra = (l: any) => ZoZo.regras.tiposValorVerde.includes(l.tipo) || (l.tipo === "interno" && l.sentido === "entrada");
    const tipos: Record<string, string> = { regular: "Regular", recorrente: "Recorrente", interno: "Transferência", receita: "Receita", debito: "Débito", estorno: "Estorno" };
    const freq = ZoZo.servico.FREQUENCIAS;
    const comPerfil = ZoZo.recursos.perfis();             // coluna Perfil só para contas com o recurso
    const linhas = [["Data", "Nome", "Valor"].concat(moeda ? ["Moeda"] : [], ["Tipo", "Conta", "Categoria"], comPerfil ? ["Perfil"] : [], ["Recorrência", "Parcela", "Notas"]).join(";")];
    lancamentos.slice().sort((a: any, b: any) => a.data.localeCompare(b.data)).forEach((l: any) => {
      const data = F.parseData(l.data);
      if (!data || F.iso(data) !== l.data) throw Object.assign(new Error("INVALID_DATE"), { friendly: "Há uma data inválida nos lançamentos. O CSV não foi gerado." });
      const recorrencia = l.tipo !== "recorrente" ? "" : l.recorrencia === "parcelada" ? "Parcelada" : (freq[l.recorrencia] || freq.mensal).rotulo;
      linhas.push([
        texto(data.toLocaleDateString("pt-BR")), texto(l.descricao), numero((entra(l) ? 1 : -1) * F.numero(l.valor)),
      ].concat(moeda ? [moeda] : [], [texto(tipos[l.tipo] || l.tipo), texto(l.nomeConta), texto(l.categoria ? l.categoria.nome : "")], comPerfil ? [texto(l.perfil ? l.perfil.nome : "")] : [], [
        texto(recorrencia), texto(l.parcelaTotal ? l.parcelaAtual + "/" + l.parcelaTotal : ""), texto(l.notas),
      ]).join(";"));
    });
    return "\ufeff" + linhas.join("\r\n");
  }

  /** Gera o CSV no próprio navegador e baixa (nada passa pelo servidor). Atenção: o arquivo baixado NÃO é cifrado. */
  function exportarCsv(ctx: ContextoApp, botao: any) {
    if (botao.disabled) return;
    // Carregando: ícone animado no lugar do ícone do botão (pelo menos 600 ms, para dar para ver)
    const iconeOriginal = botao.querySelector("svg");
    const giro = h("span", { class: ZoZo.pecas.girandoBotao, "aria-hidden": "true" });
    if (iconeOriginal) iconeOriginal.replaceWith(giro); else botao.prepend(giro);
    botao.disabled = true;
    botao.setAttribute("aria-busy", "true");
    const minimo = new Promise((r) => setTimeout(r, 600));
    ctx.loadData("lancamentos", A.getLancamentos, null, { force: true }).then((d: any) => {
      const cfg = store.get().data.config || {};
      const moeda = cfg.multicambio ? (["BRL", "EUR", "USD"].includes(cfg.moeda) ? cfg.moeda : "BRL") : null;
      const conteudo = gerarCsv(d.lancamentos || [], moeda);
      const nome = "ZoZo-transacoes-" + (moeda ? moeda + "-" : "") + F.iso(new Date()) + ".csv";
      const url = URL.createObjectURL(new Blob([conteudo], { type: "text/csv;charset=utf-8" }));
      const a = h("a", { href: url, download: nome, rel: "noopener" });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      // fora do ZoZo os dados ficam legíveis: avisa toda vez (inclusive pelo botão de Transações)
      ctx.toast("Arquivo baixado. Ele não é cifrado: guarde-o em local seguro.", { tone: "aviso" });
    }).catch((e: any) => ctx.toast(e.friendly || ZoZo.messages.FRIENDLY.OPERATION_FAILED, { tone: "error" }))
      .then(() => minimo)
      .finally(() => { if (iconeOriginal) giro.replaceWith(iconeOriginal); else giro.remove(); botao.disabled = false; botao.removeAttribute("aria-busy"); });
  }

  /** Ações de conta esperam as gravações em andamento (evita conflito de versão com elas) */
  const depoisDasGravacoes = (fn: any) => ZoZo.servico.aguardarGravacoes().then(fn);

  function quando(isoDataHora: any) {
    if (!isoDataHora) return "ainda não houve gravação";
    const d = new Date(isoDataHora);
    if (isNaN(d.getTime())) return "—";
    const hoje = new Date(); const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
    const hora = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    if (d.toDateString() === hoje.toDateString()) return "hoje às " + hora;
    if (d.toDateString() === ontem.toDateString()) return "ontem às " + hora;
    return F.dataExtenso(F.iso(d)) + " às " + hora;
  }

  /* ---------------- 2FA: painel lateral dentro da janela de Configurações ---------------- */
  const PASSOS_2FA = ["Abra seu aplicativo 2FA", "Clique em + ou Adicionar", "Escaneie o QR code ou insira a chave de configuração", "Insira o código de seis dígitos."];

  function abrirPainel2FA(ctx: ContextoApp, janelaEl: any, aoAtivar?: any) {
    if (!janelaEl || janelaEl.querySelector(".p2fa")) return;
    const V = ZoZo.verificacao;
    let erros = 0, fechado = false;
    const fechar = () => {
      if (fechado) return;
      fechado = true;
      painel.classList.remove("is-aberto");                       // desliza da esquerda para a direita
      setTimeout(() => painel.remove(), 260);
      document.removeEventListener("keydown", tecla, true);
    };
    const tecla = (e: any) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fechar(); } };

    const check = h("span", { class: P2.ok, "aria-hidden": "true", hidden: true }, icon("check", { size: 12 }));
    const erro = h("p", { class: P2.erro, role: "alert" });
    const qrArea = h("div", { class: P2.qr, "aria-busy": "true" }, h("span", { class: ZoZo.pecas.girando, "aria-hidden": "true" }));
    const chaveTexto = h("code", { class: P2.chave }, "");
    let chave = "";
    const copiar = h("button", { type: "button", class: ZoZo.pecasFn.botaoIcone("", true), "aria-label": "Copiar chave de configuração", title: "Copiar",
      onClick: (e: any) => { const b = e.currentTarget; navigator.clipboard.writeText(chave).then(() => UI.confirmarNoBotao(b, "Chave copiada"), () => ctx.toast("Não foi possível copiar.", { tone: "error" })); } },
      icon("copiar", { size: 15 }));
    const campo = V.CampoCodigo({
      rotulo: "Código de 6 dígitos do aplicativo 2FA", classe: P2.codigo, classeCaixa: P2.caixa,
      onDigitar: () => { campo.marcarErro(false); },
      onCompleto: (codigo) => {
        campo.desabilitar(true);
        ctx.bridge.request(A.confirmar2FA, { codigo }).then((r: any) => {
          erro.textContent = "";
          check.hidden = false;                                     // ✓ ao lado de "Insira o código de seis dígitos."
          store.set({ session: { user: r.user } });
          if (aoAtivar) aoAtivar();
          setTimeout(() => { fechar(); ctx.toast("Autenticação de dois fatores ativada."); }, 700);
        }).catch((e: any) => {
          erros += 1;
          erro.textContent = e.code === "TOO_MANY_ATTEMPTS" || e.espera ? FR.TOO_MANY_ATTEMPTS : e.code === "CODE_INVALID" ? (erros === 1 ? FR.CODE_INVALID : FR.CODE_INVALID_AGAIN) : e.friendly;
          campo.desabilitar(false); campo.marcarErro(true); campo.limpar();
        });
      },
    });

    const passo = (n: any, titulo: any, extra?: any) => h("li", { class: P2.passo },
      h("span", { class: P2.numero, "aria-hidden": "true" }, String(n)),
      h("div", null, h("p", { class: P2.passoTitulo }, titulo, n === 4 ? check : null), extra || null));

    const painel = h("div", { class: P2.painel, role: "dialog", "aria-modal": "false", "aria-label": "Autenticação de Dois Fatores" },
      h("header", { class: P2.topo },
        h("h3", { class: P2.titulo }, "Autenticação de Dois Fatores"),
        h("button", { type: "button", class: ZoZo.pecasFn.botaoIcone(), "aria-label": "Fechar", onClick: fechar }, icon("fechar"))),
      h("ol", { class: P2.passos },
        passo(1, PASSOS_2FA[0], h("p", { class: P2.dica }, "Não tem um? Use o Google Authenticator, Microsoft Authenticator, Authy ou o do seu gerenciador de senhas.")),
        passo(2, PASSOS_2FA[1]),
        passo(3, PASSOS_2FA[2], h("div", null, qrArea, h("div", { class: P2.chaveLinha }, chaveTexto, copiar))),
        passo(4, PASSOS_2FA[3], h("div", null, campo.el, erro))));

    janelaEl.appendChild(painel);
    document.addEventListener("keydown", tecla, true);
    requestAnimationFrame(() => requestAnimationFrame(() => painel.classList.add("is-aberto")));   // desliza da direita para a esquerda

    // QR code e chave gerados no servidor a cada abertura (o anterior, se não confirmado, é descartado)
    ctx.bridge.request(A.iniciar2FA).then((r: any) => {
      chave = r.chave;
      chaveTexto.textContent = r.chave.replace(/(.{4})/g, "$1 ").trim();
      mount(qrArea, V.QR(r.uri, 176));
      qrArea.removeAttribute("aria-busy");
      campo.foco();
    }).catch((e: any) => { mount(qrArea, h("p", { class: P2.erro }, e.friendly)); qrArea.removeAttribute("aria-busy"); });
  }

  /** Desativar o 2FA pede um código ATUAL do aplicativo (o servidor confere): sessão aberta não basta */
  function desativar2FA(ctx: ContextoApp) {
    const erro = h("p", { class: [P2.erro, "tw:text-center"], role: "alert" });
    let erros = 0;
    const campo = ZoZo.verificacao.CampoCodigo({
      rotulo: "Código de 6 dígitos do aplicativo 2FA", classe: "tw:mt-4",
      onDigitar: () => campo.marcarErro(false),
      onCompleto: (codigo) => {
        campo.desabilitar(true);
        ctx.bridge.request(A.desativar2FA, { codigo }).then((r: any) => {
          janela.fechar(true);
          store.set({ session: { user: r.user } });
          ctx.toast("Autenticação de dois fatores desativada.");
        }).catch((e: any) => {
          erros += 1;
          erro.textContent = e.code === "TOO_MANY_ATTEMPTS" || e.espera ? FR.TOO_MANY_ATTEMPTS : e.code === "CODE_INVALID" ? (erros === 1 ? FR.CODE_INVALID : FR.CODE_INVALID_AGAIN) : e.friendly;
          campo.desabilitar(false); campo.marcarErro(true); campo.limpar();
        });
      },
    });
    const janela = ZoZo.feedback.modal({
      title: "Desativar 2FA?", class: "modal--confirm",
      body: h("div", null,
        h("p", { class: ZoZo.estrutura.modalTextoConfirmacao }, "Você não precisará mais de um código para entrar, mas a conta perde a camada extra de segurança. Para confirmar, digite o código atual do seu aplicativo 2FA."),
        campo.el, erro),
    });
    requestAnimationFrame(() => campo.foco());
  }

  /* ---------------- Pix das faturas (fica no documento cifrado) ---------------- */
  const mascarar = (c: any) => (/^\d{11}$/.test(c) ? "***." + c.slice(3, 6) + "." + c.slice(6, 9) + "-**"
    : /^\+55\d{11}$/.test(c) ? "+55 (" + c.slice(3, 5) + ") *****-" + c.slice(10) : c.replace(/^(.{3}).*(@.*)$/, "$1***$2"));

  /* Chave Pix: tipo escolhido (CPF · Celular · E-mail), máscara enquanto digita e validação antes de salvar.
     A mesma regra vale no serviço de dados (ZoZo.pix.normalizarChave / nomeValido). */
  type TipoChave = { rotulo: string; ph: string; modo: string; formatar: (v: string) => string; ler: (v: string) => string };
  const TIPOS_CHAVE: Record<string, TipoChave> = {
    cpf: { rotulo: "CPF", ph: "000.000.000-00", modo: "numeric",
      formatar: (v: any) => { const d = v.replace(/\D/g, "").slice(0, 11); return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2"); },
      ler: (v: any) => v.replace(/\D/g, "") },
    celular: { rotulo: "Celular", ph: "+55 (00) 90000-0000", modo: "numeric",
      formatar: (v: any) => {
        const d = v.replace(/^\+55\s*/, "").replace(/\D/g, "").slice(0, 11);
        if (!d) return "";
        return "+55 (" + d.slice(0, 2) + (d.length > 2 ? ") " + d.slice(2, 7) : "") + (d.length > 7 ? "-" + d.slice(7) : "");
      },
      ler: (v: any) => "+55" + v.replace(/^\+55\s*/, "").replace(/\D/g, "") },
    email: { rotulo: "E-mail", ph: "nome@exemplo.com", modo: "email", formatar: (v: any) => v.replace(/\s/g, "").toLowerCase(), ler: (v: any) => v.trim().toLowerCase() },
  };
  const tipoDaChave = (c: any) => (!c ? "cpf" : c.includes("@") ? "email" : c.startsWith("+") ? "celular" : "cpf");

  function SecaoPix(ctx: ContextoApp, cfg: any, u: any) {
    const pix = cfg.pix || null;
    let tipo = tipoDaChave(pix && pix.chave);
    const entrada = (ph: any, valor: any, max: any, rotulo: any) => h("input", { class: [ZoZo.pecas.entrada, ZoZo.pecas.entradaPequena], placeholder: ph, value: valor || "", maxlength: String(max), autocomplete: "off", "aria-label": rotulo });
    const chave = entrada("", "", 77, "Chave Pix");
    const nome = entrada("Nome do recebedor", pix ? pix.nome : String(u.nomeUsuario || "").replace(/[^\p{L} ]/gu, "").slice(0, 25), 25, "Nome do recebedor");
    const cidade = entrada("Cidade", pix ? pix.cidade : "", 15, "Cidade do recebedor");
    const erro = h("p", { class: CF.pixErro, role: "alert" });
    const tipoSel = UI.Select(Object.keys(TIPOS_CHAVE).map((k) => ({ value: k, label: TIPOS_CHAVE[k].rotulo })), { value: tipo, ariaLabel: "Tipo de chave Pix", class: "select--sm" });
    const aplicarTipo = () => { const t = TIPOS_CHAVE[tipo]; chave.placeholder = t.ph; chave.inputMode = t.modo; chave.value = t.formatar(chave.value); };
    tipoSel.addEventListener("change", () => { tipo = tipoSel.value; chave.value = ""; erro.textContent = ""; aplicarTipo(); atualizarBotao(); });
    // só números no CPF/celular (letras e símbolos somem ao digitar); nome só com letras e espaços
    chave.addEventListener("input", () => { chave.value = TIPOS_CHAVE[tipo].formatar(chave.value); erro.textContent = ""; atualizarBotao(); });
    nome.addEventListener("input", () => { nome.value = nome.value.replace(/[^\p{L} ]/gu, "").replace(/^ +/, "").replace(/ {2,}/g, " "); erro.textContent = ""; atualizarBotao(); });
    cidade.addEventListener("input", () => { erro.textContent = ""; atualizarBotao(); });
    // Ao sair de um campo, mostra o motivo (o botão já fica inativo enquanto algo estiver inválido)
    [chave, nome, cidade].forEach((c) => c.addEventListener("blur", () => { const r = validar(); erro.textContent = typeof r === "string" && c.value.trim() ? r : ""; }));
    aplicarTipo();

    const validar = () => {
      const P = ZoZo.pix;
      let valor = pix && pix.chave;
      if (chave.value.trim()) {
        valor = TIPOS_CHAVE[tipo].ler(chave.value);
        if (tipo === "cpf" && !(valor.length === 11 && P.cpfValido(valor))) return "CPF inválido: confira os 11 números (os dois últimos são de verificação).";
        if (tipo === "celular" && !P.celularValido(valor.slice(3))) return "Celular inválido: use um DDD do Brasil e um número que comece com 9.";
        if (tipo === "email" && !P.normalizarChave(valor)) return "E-mail inválido.";
      }
      if (!valor) return "Informe a chave Pix.";
      if (!P.nomeValido(nome.value)) return "Nome do recebedor: use só letras.";
      if (!cidade.value.trim()) return "Informe a cidade.";
      return { chave: valor };
    };
    // Salvar só fica ativo com TODOS os campos válidos (sem precisar enviar para descobrir o erro)
    const salvarBtn = UI.Button(pix ? "Atualizar" : "Salvar", { size: "sm", variant: "primary", onClick: (e) => salvar(e.currentTarget) });
    function atualizarBotao() { salvarBtn.disabled = typeof validar() === "string"; }
    const salvar = (btn: any) => {
      const r = validar();
      if (typeof r === "string") { erro.textContent = r; return; }
      btn.disabled = true;
      ctx.bridge.request(A.updateConfig, { pix: { chave: r.chave, nome: nome.value.trim(), cidade: cidade.value } })
        .then(() => { chave.value = ""; return ctx.loadData("config", A.getConfig, null, { force: true }); })
        .catch((e: any) => { erro.textContent = e.friendly; })
        .finally(() => { atualizarBotao(); });
    };
    atualizarBotao();
    const P = ZoZo.pecas;
    return h("div", { class: P.cfgLinhaBloco },
      h("div", { class: P.cfgTexto },
        h("span", { class: P.cfgTitulo }, pix ? "Chave cadastrada: " + mascarar(pix.chave) : "Nenhuma chave cadastrada"),
        h("span", { class: P.cfgSub }, "Definir chave Pix para o QRCode.")),
      // tipo · chave · nome · cidade · [Remover] Salvar — tudo numa linha
      h("div", { class: [CF.pix, P.ctxListaPix] }, tipoSel, chave, nome, cidade,
        h("div", { class: CF.pixAcoes },
          pix ? UI.Button("Remover", { size: "sm", variant: "danger-ghost", onClick: () => ctx.bridge.request(A.updateConfig, { pix: null })
            .then(() => ctx.loadData("config", A.getConfig, null, { force: true })).catch((e: any) => { erro.textContent = e.friendly; }) }) : null,
          salvarBtn)),
      erro);
  }

  /* ---------------- Configurações: Geral | Conta ---------------- */
  let abaConfig = "geral";

  /**
   * Proteção avançada: sem cópia da chave no servidor — só você abre os dados, mas esqueceu a senha, a conta
   * recomeça vazia. Desligada (padrão): "Esqueci minha senha" recupera os dados pelo link do e-mail.
   */
  function linhaProtecao(ctx: ContextoApp) {
    const interruptor = ZoZo.modais.Interruptor("", false, (ligar) => {
      ZoZo.modais.confirmarComSenha(ligar
        ? { titulo: "Ativar proteção avançada?", botao: "Ativar", mensagem: "Só você conseguirá abrir seus dados. Se esquecer a senha, eles não poderão ser recuperados: a conta recomeça vazia. Digite sua senha para confirmar." }
        : { titulo: "Desativar proteção avançada?", botao: "Desativar", mensagem: "Se esquecer a senha, você poderá recuperar seus dados pelo link enviado ao seu e-mail. Digite sua senha para confirmar." })
        .then((senha: any) => {
          if (!senha) { entrada.checked = !ligar; return; }
          entrada.disabled = true;
          return ctx.bridge.request(A.setProtecao, { avancada: ligar, senha }, { timeout: 120000 })
            .then((r: any) => { entrada.checked = !!r.avancada; })
            .catch((e: any) => { entrada.checked = !ligar; ctx.toast(e.friendly, { tone: "error" }); })
            .finally(() => { entrada.disabled = false; });
        });
    }, "Proteção avançada");
    const entrada = interruptor.querySelector("input") as HTMLInputElement;
    entrada.disabled = true;                            // até saber o estado atual
    ctx.bridge.request(A.getProtecao).then((r: any) => { entrada.checked = !!r.avancada; entrada.disabled = false; }).catch(() => null);
    return linhaConfig("Proteção avançada", "Só você abre seus dados. Se esquecer a senha, a conta recomeça vazia (sem recuperação pelo e-mail).", interruptor);
  }

  function linhaConfig(titulo: any, sub: any, direita: any) {
    const P = ZoZo.pecas;
    return h("div", { class: P.cfgLinha },
      h("div", { class: P.cfgTexto }, h("span", { class: P.cfgTitulo }, titulo), sub ? h("span", { class: P.cfgSub }, sub) : null),
      h("div", { class: [P.cfgDireita, P.ctxInterruptorAjustado] }, direita));
  }

  ZoZo.pages.configuracoes = {
    titulo: "Configurações",
    carregar: (ctx, force) => ctx.loadData("config", A.getConfig, null, { force: true }),
    deps: (s) => [s.session.user, s.session.storageAvailable, s.data.config],
    render(state, ctx) {
      const u = state.session.user || {};
      const cfg = state.data.config || {};
      const disponivel = state.session.storageAvailable !== false;
      const demo = ZoZo.recursos.demo();       // conta de demonstração: nome, senha, 2FA, apagar e excluir não existem
      const redesenhar = ctx.redesenharConfig || (() => {});

      const P = ZoZo.pecas;
      const nav = h("nav", { class: CF.nav, "aria-label": "Seções das configurações" },
        h("p", { class: CF.navTitulo }, "Configurações"),
        [["geral", "configuracoes", "Geral"], ["conta", "perfil", "Conta"], ["sobre", "info", "Sobre"]].map(([id, ic, rot]) => h("button", {
          type: "button", class: abaConfig === id ? CF.navItemAtivo : CF.navItem, "aria-current": abaConfig === id ? "page" : undefined,
          onClick: () => { abaConfig = id; redesenhar(); },
        }, icon(ic, { size: 16 }), h("span", null, rot))));

      let conteudo;
      if (abaConfig === "sobre") {
        const linha = (titulo: any, valor: any) => h("div", { class: "tw:flex tw:items-center tw:justify-between tw:gap-(--space-5) tw:py-2.5" },
          h("span", { class: "tw:text-(length:--t-15) tw:font-[450] tw:text-zz-text" }, titulo),
          h("span", { class: "tw:text-(length:--t-13) tw:font-[550] tw:text-zz-secondary" }, valor));
        conteudo = [
          h("h3", { class: "tw:m-0 tw:mb-(--space-2) tw:pb-(--space-2) tw:border-b tw:border-zz-border tw:text-(length:--t-15) tw:font-[550]" }, "Sobre"),
          linha("Versão", "ZoZo v" + ZoZo.sobre.versao),
          linha("Autor", ZoZo.sobre.autor),
        ];
      } else if (abaConfig === "geral") {
        conteudo = [
          h("h3", { class: P.cfgSecao }, "Orçamento"),
          linhaConfig("Ativar orçamento", "Definir orçamentos mensais para as categorias",
            ZoZo.modais.Interruptor("", cfg.orcamentoAtivo !== false, (v) => ctx.bridge.request(A.updateConfig, { orcamentoAtivo: v })
              .then(() => { ctx.toast(v ? "Orçamento ativado." : "Orçamento desativado."); return ctx.loadData("config", A.getConfig, null, { force: true }); }).then(() => ctx.recarregarTudo()).catch((e: any) => ctx.toast(e.friendly, { tone: "error" })), "Ativar orçamento")),
          // Pix das faturas: só contas com o recurso
          ZoZo.recursos.pix() ? h("h3", { class: P.cfgSecao }, "Pix das faturas") : null,
          ZoZo.recursos.pix() ? SecaoPix(ctx, cfg, u) : null,
          h("h3", { class: P.cfgSecao }, "Multicâmbio"),
          ZoZo.cambio.SecaoConfig(ctx, cfg),
          h("h3", { class: P.cfgSecao }, "Armazenamento"),
          linhaConfig(
            ZoZo.bridge.isDemo ? "Modo de demonstração: os dados ficam só neste navegador."
              : demo ? "Conta de demonstração: os dados são fictícios, gerados neste navegador a cada acesso, e nada é salvo."
              : disponivel ? "Seus dados são criptografados." : ZoZo.messages.FRIENDLY.STORAGE_UNAVAILABLE,
            demo ? "Ao sair ou recarregar a página, novos dados são sorteados." : "Última gravação: " + quando(cfg.ultimaGravacao) + ".",
            icon(disponivel ? "nuvem" : "alerta", { size: 18, class: disponivel ? CF.ok : CF.alerta })),
        ];
      } else {
        // Foto
        const arquivo = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif,image/bmp", class: "tw:sr-only", "aria-label": "Escolher foto" });
        arquivo.addEventListener("change", () => {
          const f = arquivo.files && arquivo.files[0];
          arquivo.value = "";
          if (!f) return;
          processarFoto(f).then((foto) => ctx.bridge.request(A.updateConfig, { foto }))
            .then(() => { ctx.toast("Foto atualizada."); return ctx.loadData("config", A.getConfig, null, { force: true }); })
            .catch((e) => ctx.toast(e && e.friendly ? e.friendly : "Não foi possível usar essa imagem. Escolha um arquivo PNG ou JPG.", { tone: "error" }));
        });
        // Alterar senha (senha atual + nova)
        const senhaAtual = h("input", { type: "password", class: [ZoZo.pecas.entrada, ZoZo.pecas.entradaPequena], name: "current-password", placeholder: "Senha atual", autocomplete: "current-password", "aria-label": "Senha atual" });
        const novaSenha = h("input", { type: "password", class: [ZoZo.pecas.entrada, ZoZo.pecas.entradaPequena], name: "new-password", placeholder: "Nova senha", autocomplete: "new-password", "aria-label": "Nova senha", minlength: "8" });
        const senhaAtualCampo = ZoZo.verificacao.ComRevelar(senhaAtual, "input-with-action--sm");   // ocultas, com "mostrar" e sem copiar
        const novaSenhaCampo = ZoZo.verificacao.ComRevelar(novaSenha, "input-with-action--sm");
        const alterarSenha = (btn: any) => {
          if (!senhaAtual.value) { senhaAtual.focus(); return; }
          if (novaSenha.value.length < 8) { ctx.toast("Use uma nova senha com pelo menos 8 caracteres.", { tone: "error" }); novaSenha.focus(); return; }
          btn.disabled = true;
          const dados = { senhaAtual: senhaAtual.value, novaSenha: novaSenha.value };
          depoisDasGravacoes(() => ctx.bridge.request(A.changePassword, dados, { timeout: 120000 }))
            .then(() => { senhaAtual.value = ""; novaSenha.value = ""; ctx.toast("Senha alterada."); })
            .catch((e: any) => ctx.toast(e.friendly, { tone: "error" }))
            .finally(() => { btn.disabled = false; });
        };
        const apagarDados = () => ZoZo.modais.confirmarComSenha({ titulo: "Apagar todos os dados?", botao: "Apagar dados",
          mensagem: "Transações, contas, categorias" + (ZoZo.recursos.perfis() ? " e perfis" : "") + " serão apagados. Seu login continua funcionando. Essa ação não pode ser desfeita." })
          .then((senha: any) => senha && depoisDasGravacoes(() => ctx.bridge.request(A.wipeUserData, { senha })).then(() => {
            ZoZo.servico.reset();
            // Filtros, seleção e preferências apontavam para itens que não existem mais
            store.set({ ui: { filtros: null, selecionados: [], busca: "", invExcluidas: [], mostrarOcultas: {}, gruposFechados: {} }, selectedItem: null });
            ctx.detail.close({ silencioso: true });
            ctx.toast("Dados apagados.");
            return ctx.recarregarTudo();
          })
            .catch((e: any) => ctx.toast(e.friendly, { tone: "error" })));

        conteudo = [
          h("h3", { class: P.cfgSecao }, "Informação"),
          // Foto centralizada (clique para trocar) e "Remover" logo abaixo
          h("div", { class: CF.foto },
            h("button", { type: "button", class: CF.fotoBotao, title: cfg.foto ? "Trocar foto" : "Escolher foto", "aria-label": cfg.foto ? "Trocar foto" : "Escolher foto", onClick: () => arquivo.click() },
              Avatar(cfg.foto, u.nomeUsuario, 72), h("span", { class: CF.fotoCamera, "aria-hidden": "true" }, icon("camera", { size: 20 }))),
            cfg.foto ? UI.Button("Remover", { size: "sm", onClick: () => ctx.bridge.request(A.updateConfig, { foto: null })
              .then(() => ctx.loadData("config", A.getConfig, null, { force: true })) }) : null,
            arquivo),
          demo ? linhaConfig("Nome", null, h("span", { class: CF.leitura }, u.nomeUsuario || "")) : linhaConfig("Nome", null, ZoZo.inline.texto({ valor: u.nomeUsuario, rotulo: "Nome do usuário", max: 80, classe: ZoZo.pecas.cfgNoLugar,
            aoSalvar: (v) => ZoZo.modais.confirmarComSenha({ titulo: "Confirmar alteração", botao: "Salvar", mensagem: "Digite sua senha para alterar o nome." })
              .then((senha: any) => {
                if (!senha) throw new ZoZo.messages.BridgeError("CANCELADO", "Alteração cancelada.");
                return ctx.bridge.request(A.updateUser, { nomeUsuario: v, email: u.email, senhaAtual: senha });
              }).then((sessao: any) => { store.set({ session: { user: sessao.user } }); ctx.toast("Nome alterado."); }) })),
          linhaConfig("E-mail", null, h("span", { class: CF.leitura }, u.email || "")),
          demo ? h("p", { class: CF.nota }, "Conta de demonstração: nome, senha, 2FA e exclusão ficam disponíveis na sua própria conta.") : null,
          // Senha: título em cima e, abaixo, senha atual · nova senha · Alterar (sem espremer o título ao lado)
          demo ? null : h("div", { class: P.cfgLinhaBloco },
            h("div", { class: P.cfgTexto }, h("span", { class: P.cfgTitulo }, "Alterar senha")),
            h("div", { class: CF.senha }, senhaAtualCampo, novaSenhaCampo, UI.Button("Alterar", { size: "sm", onClick: (e) => alterarSenha(e.currentTarget) }))),
          demo ? null : linhaConfig("Autenticação de Dois Fatores", null, u.doisFatores
            ? UI.Button("Desativar 2FA", { size: "sm", onClick: () => desativar2FA(ctx) })
            : UI.Button("Ativar 2FA", { size: "sm", variant: "primary", onClick: (e) => abrirPainel2FA(ctx, (e.currentTarget as HTMLElement).closest(".modal")) })),
          demo ? null : linhaProtecao(ctx),
          h("h3", { class: P.cfgSecao }, "Ações"),
          linhaConfig(cfg.multicambio ? "Exportar as transações em " + (({ BRL: "Real", EUR: "Euro", USD: "Dólar" } as Record<string, string>)[cfg.moeda] || "Real") : "Exportar todas as transações",
            "Baixe seus dados em um arquivo CSV" + (cfg.multicambio ? " (só a moeda escolhida no menu)" : "") + ". O arquivo não é cifrado: guarde-o em local seguro.", UI.Button("Baixar", { size: "sm", icon: "baixar", onClick: (e) => exportarCsv(ctx, e.currentTarget) })),
          demo ? null : linhaConfig("Apagar todos os dados", "Mantém o login e remove transações, contas, categorias" + (ZoZo.recursos.perfis() ? " e perfis" : ""),
            UI.Button("Apagar", { size: "sm", variant: "danger-ghost", onClick: apagarDados })),
        ];
      }
      // Sair e Excluir conta ficam fixos no rodapé da janela (aba Conta)
      const rodape = abaConfig === "conta" ? h("div", { class: CF.rodape },
        UI.Button("Sair", { onClick: () => ctx.logout() }),
        demo ? null : h("button", { type: "button", class: CF.excluirConta, onClick: () => ZoZo.modais.confirmarComSenha({ titulo: "Excluir conta?", botao: "Excluir conta",
          mensagem: "Sua conta, todos os seus dados e o histórico de versões serão excluídos do servidor. Essa ação não pode ser desfeita." })
          .then((senha: any) => senha && depoisDasGravacoes(() => ctx.bridge.request(A.deleteUser, { senha })).then(() => { ctx.toast("Conta excluída."); ctx.encerrarSessao(); })
            .catch((e: any) => ctx.toast(e.friendly, { tone: "error" }))) }, "Excluir conta")) : null;
      return h("div", { class: [CF.raiz, P.ctxConfig] }, nav, h("div", { class: CF.principal }, h("div", { class: CF.conteudo }, conteudo), rodape));
    },
  };

  ZoZo.usuario = { Avatar };
  ZoZo.exportarCsv = exportarCsv;

  /* =============================================================
     Configurações em janela modal
     Os formulários (nome, senha, apagar dados…) abrem dentro da
     própria janela, com "Voltar" para a tela principal.
     ============================================================= */
  function abrirConfiguracoes(ctx: ContextoApp, aba: any) {
    const area = h("div", { class: "tw:h-full" });
    let cancelar: (() => unknown) | null = null;
    const ctxModal = Object.assign({}, ctx);
    function principal() {
      const st = store.get();
      if (!st.session.authenticated) { janela.fechar(); return; }
      mount(area, ZoZo.pages.configuracoes.render(st, ctxModal));
    }
    ctxModal.redesenharConfig = principal;
    const janela = ZoZo.feedback.modal({ title: "Configurações", class: "modal--settings", body: area, onClose: () => { if (cancelar) cancelar(); } });
    ctxModal.logout = (msg: any) => { janela.fechar(); ctx.logout(msg); };
    ctxModal.encerrarSessao = () => { janela.fechar(); ctx.encerrarSessao(); };
    let ultimo: unknown[] | null = null;
    cancelar = store.subscribe((st) => {
      const chave = [st.session.user, st.data.config, st.session.authenticated];
      const antes = ultimo;
      if (antes && chave.every((v, k) => v === antes[k])) return;
      ultimo = chave;
      if (!st.session.authenticated) { janela.fechar(); return; }
      // não redesenha enquanto o usuário digita (ex.: senha)
      const ativo = document.activeElement;
      if (!ativo || !area.contains(ativo) || ativo.tagName !== "INPUT") principal();
    });
    abaConfig = aba === "conta" || aba === "sobre" ? aba : "geral";
    principal();
    ctx.loadData("config", A.getConfig, null, { force: true }).catch(() => null);
  }

  ZoZo.configuracoes = { abrir: abrirConfiguracoes };
})(window.ZoZo);
