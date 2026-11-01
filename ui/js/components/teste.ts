/* =============================================================
   ZoZo — modo de teste (SÓ no endereço local e na prévia)
   ------------------------------------------------------------
   Botão "Modo teste" no canto e um painel que abre QUALQUER parte do app para conferir detalhes:
   telas, etapas da entrada, painéis laterais (e os modos de edição), janelas (todos os passos),
   menus, gráficos e uma galeria com todos os componentes (botões, pílulas, campos, estados).
   Em produção o host não cria ZoZo.testeHost e nada daqui aparece.
   Os comandos só agem nesta aba: a conta simulada não tem servidor e a conta demo não grava;
   numa conta de verdade da prévia valem as mesmas regras de sempre (o servidor confere tudo).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const T = ZoZo.testeHost;
  if (!T) return;
  const { h, mount } = ZoZo.dom;
  const UI = ZoZo.ui;
  const F = ZoZo.format;
  const A = ZoZo.messages.ACTIONS;

  const C = {
    botao: "tw:fixed tw:right-4 tw:bottom-4 tw:z-80 tw:inline-flex tw:items-center tw:gap-1.5 tw:h-8 tw:px-3 tw:rounded-full "
      + "tw:border tw:border-[#e8c48a] tw:bg-zz-warning-soft tw:text-zz-warning-text tw:text-[13px] tw:font-[620] tw:cursor-pointer "
      + "tw:shadow-[0_2px_8px_rgba(15,39,66,0.12)] tw:hover:brightness-97 tw:focus-visible:outline-2 tw:focus-visible:outline-zz-primary tw:focus-visible:outline-offset-2",
    // a janela do painel e das galerias é mais larga que as outras (muitos botões lado a lado)
    janela: "modal--testes tw:w-[min(720px,calc(100vw-32px))]! tw:max-w-none!",
    corpo: "tw:flex tw:flex-col tw:gap-3 tw:w-full tw:max-h-[min(72vh,680px)] tw:overflow-y-auto tw:pr-1",
    secao: "tw:border tw:border-zz-border tw:rounded-xl tw:px-3.5 tw:py-2.5 tw:[&[open]>summary]:mb-2.5",
    resumo: "tw:cursor-pointer tw:text-[12px] tw:font-[650] tw:uppercase tw:tracking-[0.04em] tw:text-zz-secondary tw:marker:text-zz-secondary",
    grupo: "tw:flex tw:flex-col tw:gap-2",
    subtitulo: "tw:m-0 tw:mt-1 tw:text-[12.5px] tw:font-[620] tw:text-zz-text",
    botoes: "tw:flex tw:flex-wrap tw:gap-2",
    estado: "tw:m-0 tw:grid tw:grid-cols-[auto_1fr] tw:gap-x-3 tw:gap-y-1 tw:text-[13px]",
    rotulo: "tw:text-zz-secondary",
    valor: "tw:m-0 tw:text-zz-text tw:[overflow-wrap:anywhere]",
    nota: "tw:m-0 tw:text-[12.5px] tw:leading-[1.45] tw:text-zz-secondary",
    // galerias
    galeria: "tw:flex tw:flex-col tw:gap-5 tw:w-full tw:max-h-[min(74vh,720px)] tw:overflow-y-auto tw:pr-1",
    linhaGaleria: "tw:flex tw:flex-wrap tw:items-center tw:gap-3",
    blocoGrafico: "tw:flex tw:flex-col tw:gap-1.5",
  };

  /** Telas e ações que só o app sabe montar (app.ts) */
  type AcoesApp = {
    tela: (nome: string) => void;
    entradaMudou: () => void;
    sessaoExpirada: () => void;
    entrarSimulado: () => Promise<unknown>;
  };

  let ancora: HTMLButtonElement | null = null;     // o botão "Modo teste": âncora dos menus abertos pelo painel

  function iniciar(ctx: ContextoApp, app: AcoesApp) {
    const botao = h("button", { type: "button", class: C.botao, "aria-haspopup": "dialog" }, "Modo teste") as HTMLButtonElement;
    botao.addEventListener("click", () => abrir(ctx, app));
    document.body.appendChild(botao);
    ancora = botao;
    ZoZo.demonstracao.aplicarPainel();          // a demo pode ter escondido o botão (Alt + Shift + D)
  }

  /* ---------- dados de exemplo (da conta aberta) ---------- */
  const lancamentos = async (ctx: ContextoApp) => (await ctx.loadData("lancamentos", A.getLancamentos)).lancamentos;
  const contas = async (ctx: ContextoApp) => (await ctx.loadData("contas", A.getContas)).contas;
  const categorias = async (ctx: ContextoApp) => (await ctx.loadData("categorias", A.getCategorias)).categorias;
  const perfis = async (ctx: ContextoApp) => (await ctx.loadData("perfis", A.getPerfis)).perfis;
  const recorrencias = async (ctx: ContextoApp) => (await ctx.loadData("recorrencias", A.getRecorrencias)).recorrencias;

  /* ---------- catálogo: tudo o que o painel abre (o Design fotografa a mesma lista) ----------
     Ao criar uma tela, painel, janela ou menu novo no app, acrescente-o aqui. */
  type TipoItem = "tela" | "painel" | "janela" | "menu" | "externo";
  type ItemCatalogo = { secao: string; sub?: string; rotulo: string; tipo: TipoItem; abrir: () => unknown; conta?: boolean };
  const achar = <X>(itens: X[], teste: (x: X) => boolean, oque: string): X => {
    const x = itens.find(teste);
    if (!x) throw new Error("Não há " + oque + " nesta conta (carregue os dados de exemplo).");
    return x;
  };
  function catalogo(ctx: ContextoApp): ItemCatalogo[] {
    /** Painel lateral só aparece nas páginas que têm a coluna dele (no Dashboard não): vai à página antes */
    const naPagina = (rota: string, acao: () => unknown) => () => { ctx.router.navigate(rota); return new Promise((ok) => setTimeout(ok, 450)).then(acao); };
    const primeira = async <X>(fn: () => Promise<X[]>, oque: string) => achar(await fn(), () => true, oque);
    const regular = async () => achar(await lancamentos(ctx), (l) => l.tipo === "regular", "transação regular");
    const cartao = async () => achar(await contas(ctx), (c) => c.tipo === "cartao", "cartão de crédito");
    const itens: ItemCatalogo[] = [];
    const add = (secao: string, sub: string | undefined, tipo: TipoItem, rotulo: string, abrir: () => unknown, conta = true) => { itens.push({ secao, sub, rotulo, tipo, abrir, conta }); };

    // Telas
    ([["dashboard", "Dashboard"], ["lancamentos", "Transações"], ["contas", "Contas"], ["investimentos", "Investimentos"],
      ["categorias", "Categorias"], ["recorrencias", "Recorrências"], ["perfil", "Perfis"]] as Array<[string, string]>)
      .forEach(([rota, rotulo]) => add("Telas", undefined, "tela", rotulo, () => ctx.router.navigate(rota)));
    add("Telas", undefined, "janela", "Fatura (boleto)", () => ZoZo.boleto.open(ctx, {}));
    add("Telas", undefined, "externo", "Sobre o ZoZo (página pública)", () => { window.open("/sobre", "_blank", "noopener"); });
    add("Telas", undefined, "externo", "Termos de uso", () => { window.open("/termos-uso", "_blank", "noopener"); });
    add("Telas", undefined, "externo", "Política de privacidade", () => { window.open("/politica-privacidade", "_blank", "noopener"); });

    // Painéis laterais
    const P = "Painéis laterais";
    add(P, "Transações", "painel", "Nova transação", naPagina("lancamentos", () => ZoZo.lancamentosShared.abrirFormulario(null, ctx)));
    ([["regular", "Despesa", (l: LancamentoTela) => l.tipo === "regular"], ["receita", "Receita", (l: LancamentoTela) => l.tipo === "receita"],
      ["estorno", "Estorno", (l: LancamentoTela) => l.tipo === "estorno"], ["débito", "Débito", (l: LancamentoTela) => l.tipo === "debito"],
      ["transferência", "Transferência", (l: LancamentoTela) => l.tipo === "interno"], ["pagamento de fatura", "Fatura", (l: LancamentoTela) => l.tipo === "fatura"],
      ["recorrente", "Recorrente", (l: LancamentoTela) => l.tipo === "recorrente" && l.recorrencia !== "parcelada"],
      ["parcelada", "Parcelada", (l: LancamentoTela) => l.recorrencia === "parcelada"], ["dividida", "Dividida", (l: LancamentoTela) => !!l.divisao],
    ] as Array<[string, string, (l: LancamentoTela) => boolean]>).forEach(([tipo, rotulo, teste]) =>
      add(P, "Transações", "painel", rotulo, naPagina("lancamentos", async () => ZoZo.lancamentosShared.abrirVisualizacao(achar(await lancamentos(ctx), teste, "transação do tipo " + tipo), ctx))));
    const tipoConta = (sec: string, sub: string | undefined, tipo: string, rotulo: string, opts?: OpcoesPainelConta) =>
      add(sec, sub, "painel", rotulo, naPagina(tipo === "investimento" ? "investimentos" : "contas", async () => ZoZo.contasShared.abrirDetalheConta(
        achar(await contas(ctx), (c) => c.tipo === tipo, "conta do tipo " + tipo), ctx, opts)));
    tipoConta(P, "Contas", "corrente", "Conta corrente"); tipoConta(P, "Contas", "poupanca", "Poupança"); tipoConta(P, "Contas", "cartao", "Cartão de crédito");
    tipoConta(P, "Contas", "cartao", "Cartão: editar fechamento", { editandoCiclo: true }); tipoConta(P, "Contas", "investimento", "Investimento");
    tipoConta(P, "Contas", "emprestimo", "Empréstimo"); tipoConta(P, "Contas", "outros", "Outros");
    const S = "Categorias, recorrências e perfis";
    add(P, S, "painel", "Categoria", naPagina("categorias", async () => ZoZo.categoriasShared.abrirDetalhe(await primeira(() => categorias(ctx), "categoria"), ctx)));
    add(P, S, "painel", "Categoria: editar orçamento", naPagina("categorias", async () => ZoZo.categoriasShared.abrirDetalhe(
      achar(await categorias(ctx), (c) => c.status === "regular", "categoria regular"), ctx, { editandoOrcamento: true })));
    add(P, S, "painel", "Categoria: editar (formulário)", naPagina("categorias", async () => ZoZo.categoriasShared.abrirFormCategoria(ctx, await primeira(() => categorias(ctx), "categoria"))));
    add(P, S, "painel", "Grupo de categorias", naPagina("categorias", async () => ZoZo.categoriasShared.abrirGrupo(achar(await categorias(ctx), (c) => !!c.grupo, "grupo").grupo!, ctx)));
    add(P, S, "painel", "Grupo: editar orçamento", naPagina("categorias", async () => ZoZo.categoriasShared.abrirGrupo(achar(await categorias(ctx), (c) => !!c.grupo, "grupo").grupo!, ctx, { editando: true })));
    add(P, S, "painel", "Recorrência", naPagina("recorrencias", async () => ZoZo.recorrenciasShared.abrirDetalhe(await primeira(() => recorrencias(ctx), "recorrência"), ctx)));
    add(P, S, "painel", "Perfil", naPagina("perfil", async () => ZoZo.perfilShared.abrirDetalhe(await primeira(() => perfis(ctx), "perfil"), ctx)));
    add(P, S, "painel", "Perfil: editar (formulário)", naPagina("perfil", async () => ZoZo.perfilShared.abrirFormPerfil(ctx, await primeira(() => perfis(ctx), "perfil"))));

    // Janelas
    const J = "Janelas (todos os passos)";
    ([["corrente", "Nova conta: banco"], ["cartao", "Nova conta: cartão"], ["investimento", "Nova conta: investimento"],
      ["emprestimo", "Nova conta: empréstimo"], ["outros", "Nova conta: outros"]] as Array<[string, string]>)
      .forEach(([tipo, rotulo]) => add(J, "Contas", "janela", rotulo, () => ZoZo.modais.novaConta(ctx, tipo, {})));
    add(J, "Contas", "janela", "Pagar fatura", async () => ZoZo.modais.pagarFatura(ctx, await cartao()));
    add(J, "Contas", "janela", "Zo (assistente)", () => ZoZo.zo.abrir());
    // abre a fatura do 1º perfil e, com os dados carregados, a janela do pagamento recebido
    add(J, "Contas", "janela", "Fatura: pagamento recebido", async () => ZoZo.boleto.open(ctx, { perfilId: (await primeira(() => perfis(ctx), "perfil")).id, receber: true }));
    add(J, "Categorias e perfis", "janela", "Nova categoria", () => ZoZo.modais.novaCategoria(ctx, {}));
    add(J, "Categorias e perfis", "janela", "Criar grupo", () => ZoZo.modais.criarGrupo(() => undefined));
    add(J, "Categorias e perfis", "janela", "Novo perfil", () => ZoZo.modais.novoPerfil(ctx, {}));
    const TR = "Transações e recorrências";
    add(J, TR, "janela", "Nova recorrência: 1. escolher transação", () => ZoZo.modais.novaRecorrencia(ctx));
    add(J, TR, "janela", "Nova recorrência: 2. frequência", async () => ZoZo.modais.frequencia(ctx, (await regular()).id, {}));
    add(J, TR, "janela", "Dividir transação", async () => ZoZo.dividir.abrir(await regular(), ctx));
    add(J, TR, "janela", "Transferir entre moedas", () => ZoZo.cambio.abrirTransferencia(ctx));
    const CC = "Configurações e confirmações";
    add(J, CC, "janela", "Configurações: Geral", () => ZoZo.configuracoes.abrir(ctx, "geral"));
    add(J, CC, "janela", "Configurações: Conta", () => ZoZo.configuracoes.abrir(ctx, "conta"));
    add(J, CC, "janela", "Configurações: Sobre", () => ZoZo.configuracoes.abrir(ctx, "sobre"));
    add(J, CC, "janela", "2FA: ativar (passo a passo)", () => {
      ZoZo.configuracoes.abrir(ctx, "conta");
      setTimeout(() => { const b = Array.from(document.querySelectorAll<HTMLButtonElement>(".modal button")).find((x) => /Ativar 2FA|Desativar 2FA/.test(x.textContent || "")); if (b) b.click(); }, 400);
    });
    add(J, CC, "janela", "2FA: desativar (código)", () => ZoZo.configuracoes.desativar2FA(ctx));
    add(J, CC, "janela", "Novidades da versão (O que há de novo)", () => ZoZo.novidades.abrir(), false);
    const CA = "Confirmações de ação (os textos de cada uma; confirmar aqui não faz nada)";
    CONFIRMACOES.forEach(([rotulo, titulo, mensagem, opts]) => add(J, CA, "janela", rotulo, () => ZoZo.feedback.confirmarExclusao(titulo, mensagem, opts), false));
    CONFIRMACOES_SENHA.forEach(([rotulo, cfg]) => add(J, "Confirmações com senha", "janela", rotulo, () => ZoZo.modais.confirmarComSenha(cfg), false));
    ACOES_SEM_VOLTA.forEach(([rotulo, cfg]) => add(J, "Ações sem volta (frase, senha e código do 2FA; confirmar aqui não faz nada)", "janela", rotulo,
      () => ZoZo.modais.confirmarSeguro(Object.assign({ executar: () => Promise.resolve() }, cfg)), false));

    // Menus (abrem no botão "Modo teste")
    const M = "Menus";
    add(M, undefined, "menu", "Menu completo (ícone, marcado, seção, submenu, perigoso)", () => ancora && ZoZo.menu.abrir(ancora, [
      { icone: "mais", label: "Item com ícone", onClick: () => undefined },
      { label: "Item marcado", check: true, onClick: () => undefined },
      { label: "Item não marcado", check: false, onClick: () => undefined },
      { secao: "Seção" },
      { label: "Com submenu", submenu: [{ label: "Opção 1", onClick: () => undefined }, { label: "Opção 2", onClick: () => undefined }] },
      { label: "Desabilitado", desabilitado: true, onClick: () => undefined },
      { separador: true },
      { label: "Excluir", perigo: true, onClick: () => undefined },
    ], { posicao: "acima", checkEsquerda: true, largura: 260, label: "Menu de exemplo" }), false);
    add(M, undefined, "menu", "Contas", async () => ancora && ZoZo.menu.contas(ancora, { contas: await contas(ctx), atual: null, aoEscolher: () => undefined, posicao: "acima" }));
    add(M, undefined, "menu", "Perfis", async () => ancora && ZoZo.menu.perfis(ancora, ctx, { perfis: await perfis(ctx), atual: null, aoEscolher: () => undefined, posicao: "acima" }));
    add(M, undefined, "menu", "Calendário", () => ancora && ZoZo.calendario.abrir(ancora, F.iso(new Date()), () => undefined, { posicao: "acima" }), false);
    add(M, undefined, "menu", "Emojis", () => ancora && ZoZo.emojiPicker.abrir(ancora, { atual: "📦", aoEscolher: () => undefined, posicao: "acima" }), false);

    // Gráficos
    const G = "Gráficos";
    add(G, undefined, "janela", "Galeria de gráficos", () => galeriaGraficos(), false);
    add(G, undefined, "tela", "Dashboard (gasto e patrimônio)", () => ctx.router.navigate("dashboard"));
    add(G, undefined, "tela", "Contas (ativos × passivos)", () => ctx.router.navigate("contas"));
    tipoConta(G, undefined, "corrente", "Painel da conta (saldo)");
    add(G, undefined, "painel", "Painel da categoria (barras)", naPagina("categorias", async () => ZoZo.categoriasShared.abrirDetalhe(await primeira(() => categorias(ctx), "categoria"), ctx)));
    add(G, undefined, "tela", "Categorias (rosca)", () => ctx.router.navigate("categorias"));
    add(G, undefined, "tela", "Investimentos", () => ctx.router.navigate("investimentos"));
    add("Componentes", undefined, "janela", "Galeria de componentes (botões, pílulas, campos, estados)", () => galeriaComponentes(), false);
    return itens;
  }

  /** Páginas de Design: abrem numa guia nova (#design/…), geradas do próprio app */
  const DESIGN: Array<[string, string]> = [["janelas", "Janelas"], ["elementos", "Elementos"], ["tipografia", "Tipografia"],
    ["medidas", "Medidas, espaços e movimento"], ["cores", "Cores"], ["regras", "Regras gerais"], ["icones", "Ícones"]];

  function abrir(ctx: ContextoApp, app: AcoesApp) {
    const area = h("div", { class: C.corpo });
    const janela = ZoZo.feedback.modal({ title: "Painel de testes", body: area, class: C.janela });
    const fechar = () => janela.fechar();
    const logado = () => !!ZoZo.store.get().session.authenticated;
    const avisar = (msg: string) => ctx.toast(msg, { tone: "aviso", duration: 5000 });
    const botaoCmd = (rotulo: string, acao: () => void, perigo?: boolean) =>
      UI.Button(rotulo, { size: "sm", variant: perigo ? "danger-ghost" : undefined, onClick: acao });
    /** Fecha o painel e abre o alvo (o que precisa de dados pede uma conta aberta) */
    const ir = (rotulo: string, acao: () => unknown, precisaConta = true) => botaoCmd(rotulo, () => {
      if (precisaConta && !logado()) { avisar("Entre primeiro: \"Entrar com dados de exemplo\", no topo do painel."); return; }
      fechar();
      setTimeout(() => Promise.resolve().then(acao).catch((e: Partial<ErroPonte>) => avisar((e && (e.friendly || e.message)) || "Não deu para abrir.")), 220);
    });
    const secao = (titulo: string, aberta: boolean, ...filhos: Array<HTMLElement | null>) =>
      h("details", { class: C.secao, open: aberta || undefined }, h("summary", { class: C.resumo }, titulo), h("div", { class: C.grupo }, ...filhos));
    const sub = (texto: string) => h("p", { class: C.subtitulo }, texto);
    const linha = (...b: Array<HTMLElement | null>) => h("div", { class: C.botoes }, ...b);

    function desenhar() {
      const e = T!.estado();
      const linhas: Array<[string, string]> = [["Endereço", e.endereco], ["Sessão", e.sessao], ["Versão", ZoZo.sobre.versao],
        ["Sem servidor", e.simulacao ? "ligado" : "desligado"], ["Falha simulada", e.falha || "nenhuma"]];
      const simular = ZoZo.modais.Interruptor("Simular cadastro e login sem servidor", e.simulacao, (v) => {
        T!.simular(v); app.entradaMudou(); desenhar();
      });
      const cat = catalogo(ctx);
      /** Seção do painel a partir do catálogo: um subtítulo por grupo e os botões de cada item */
      const doCatalogo = (titulo: string, aberta: boolean, ...antes: Array<HTMLElement | null>) => {
        const itens = cat.filter((i) => i.secao === titulo);
        const subs = Array.from(new Set(itens.map((i) => i.sub || "")));
        return secao(titulo, aberta, ...antes, ...subs.flatMap((s) => [s ? sub(s) : null,
          linha(...itens.filter((i) => (i.sub || "") === s).map((i) => ir(i.rotulo, i.abrir, i.conta !== false)))]));
      };

      mount(area,
        h("dl", { class: C.estado }, ...linhas.flatMap(([r, v]) => [h("dt", { class: C.rotulo }, r), h("dd", { class: C.valor }, v)])),
        linha(
          logado() ? null : botaoCmd("Entrar com dados de exemplo", () => { fechar(); app.entrarSimulado().catch(() => avisar("Não deu para entrar.")); }),
          logado() ? ir("Recarregar dados", () => ctx.recarregarTudo()) : null,
          logado() && e.sessao.startsWith("simulada") ? botaoCmd("Carregar dados de exemplo", () => {
            if (!T!.carregarExemplo()) return;
            ZoZo.servico.reset(); ctx.recarregarTudo(); fechar();
          }) : null),

        doCatalogo("Telas", true),

        secao("Etapas da entrada", false,
          logado() ? h("p", { class: C.nota }, "Abrir uma etapa da entrada encerra a sessão desta aba.") : null,
          sub("Entrar e cadastrar"),
          linha(...([["entrarInicio", "Início"], ["entrarEmail", "E-mail"], ["entrarSenha", "Senha"], ["cadastroNome", "Cadastro: nome e e-mail"],
            ["cadastroSenha", "Cadastro: senha"], ["doisFatores", "Código do 2FA (login)"], ["carregando", "Carregando"]] as Array<[string, string]>)
            .map(([nome, rotulo]) => ir(rotulo, () => app.tela(nome), false))),
          sub("Confirmação de e-mail e recuperação de senha"),
          linha(...([["verificar", "Verifique seu e-mail"], ["verificarRecuperacao", "Verifique (recuperação)"], ["linkInvalido", "Link inválido"],
            ["redefinir", "Redefinir senha"], ["codigo", "Código do 2FA (recuperação)"], ["novaSenha", "Nova senha"], ["novaSenhaRecomecar", "Nova senha (recomeçar)"],
            ["novaSenhaSemCopia", "Nova senha (sem cópia da chave)"], ["novaSenhaRestaurada", "Nova senha (cópia anterior)"]] as Array<[string, string]>)
            .map(([nome, rotulo]) => ir(rotulo, () => app.tela(nome), false)))),

        doCatalogo("Painéis laterais", false),
        doCatalogo("Janelas (todos os passos)", false),
        doCatalogo("Menus", false,
          h("p", { class: C.nota }, "Abrem no botão \"Modo teste\". Os menus próprios de cada tela abrem pelos botões dela (abra a tela ou o painel acima).")),
        doCatalogo("Gráficos", false),
        doCatalogo("Componentes", false),

        secao("Design", false,
          h("p", { class: C.nota }, "Cada página abre numa guia nova e é gerada do próprio app (tokens, componentes e ícones de verdade), para repassar ao Claude. "
            + "Todas baixam em Markdown; as janelas também em PNG."),
          linha(...DESIGN.map(([id, rotulo]) => botaoCmd(rotulo, () => { window.open("/#design/" + id, "_blank", "noopener"); })))),

        secao("Conta sem servidor", false, simular,
          h("p", { class: C.nota }, "Ligado: o cadastro cria uma conta vazia e o login entra com dados de exemplo, tudo só nesta aba (nada vai ao servidor). "
            + "A conta demo e a simulada têm todos os recursos e as ações de conta (nome, senha, 2FA, apagar, excluir) são simuladas.")),

        secao("Falhas e avisos", false,
          linha(
            botaoCmd(e.falha === "STORAGE_UNAVAILABLE" ? "Servidor de volta" : "Servidor fora do ar", () => {
              T!.falhar(e.falha === "STORAGE_UNAVAILABLE" ? null : "STORAGE_UNAVAILABLE"); desenhar();
            }),
            botaoCmd("Conflito na próxima gravação", () => { T!.conflitoNaProxima(); avisar("A próxima gravação vai falhar com conflito (DATA_CHANGED)."); }),
            logado() ? botaoCmd("Sessão expirada", () => { fechar(); app.sessaoExpirada(); }) : null),
          linha(
            botaoCmd("Aviso", () => ctx.toast("Exemplo de aviso do modo teste.", { tone: "aviso" })),
            botaoCmd("Erro", () => ctx.toast("Exemplo de erro do modo teste.", { tone: "error" })),
            botaoCmd("Sucesso", () => ctx.toast("Exemplo de confirmação do modo teste.", { tone: "success", importante: true }))),
          linha(botaoCmd("Limpar armazenamento deste navegador", () => {
            try { Object.keys(localStorage).filter((k) => k.startsWith("zozo.")).forEach((k) => localStorage.removeItem(k)); } catch (er) { /* ok */ }
            try { Object.keys(sessionStorage).filter((k) => k.startsWith("zozo.")).forEach((k) => sessionStorage.removeItem(k)); } catch (er) { /* ok */ }
            location.reload();
          }, true))));
    }
    desenhar();
  }

  /* ---------- janelas de confirmação do app (mesmos títulos, textos e botões; aqui só aparecem) ----------
     Ao criar uma confirmação nova no app, acrescente-a aqui também. */
  const CONFIRMACOES: Array<[string, string, string, OpcoesConfirmacao?]> = [
    ["Excluir transação", "Excluir transação?", "Tem certeza de que deseja excluir esta transação?"],
    ["Excluir transação parcelada", "Excluir transação?", "Tem certeza de que deseja excluir esta transação? As parcelas futuras desta compra também serão excluídas; as já pagas continuam."],
    ["Excluir várias transações", "Excluir transações?", "Tem certeza de que deseja excluir estas 3 transações?"],
    ["Remover recorrência (da transação)", "Remover recorrência?", "As parcelas e ocorrências futuras desta série serão excluídas. As transações já lançadas continuam, sem recorrência. Essa ação não pode ser desfeita.", { confirmar: "Remover" }],
    ["Excluir recorrência", "Excluir recorrência?", "Isso removerá a recorrência e o vínculo com as transações. Não é possível desfazer essa ação.", { cancelar: "Manter recorrência", confirmar: "Excluir recorrência" }],
    ["Excluir conta (bancária, cartão…)", "Excluir conta?", "Tem certeza de que deseja excluir esta conta?"],
    ["Excluir categoria", "Excluir categoria?", "A categoria “Restaurantes” e o histórico de orçamentos dela serão apagados. Essa ação não pode ser desfeita. As transações dessa categoria serão movidas para “Outros”."],
    ["Desagrupar categorias", "Desagrupar categorias?", "O valor não planejado do grupo será apagado. Os orçamentos das categorias individuais continuam valendo. Essa ação não pode ser desfeita.", { confirmar: "Desagrupar" }],
    ["Excluir perfil", "Excluir perfil?", "Tem certeza de que deseja excluir este perfil?"],
    ["Verificação de segurança (Cloudflare)", "Verificação de segurança", ZoZo.messages.FRIENDLY.CF_CHALLENGE + " O que não foi salvo precisará ser refeito.", { confirmar: "Recarregar página", cancelar: "Agora não", variante: "primary" }],
  ];
  const CONFIRMACOES_SENHA: Array<[string, { titulo: string; botao: string; mensagem: string }]> = [
    ["Alterar nome", { titulo: "Confirmar alteração", botao: "Salvar", mensagem: "Digite sua senha para alterar o nome." }],
    ["Ativar proteção avançada", { titulo: "Ativar proteção avançada?", botao: "Ativar", mensagem: "Só você conseguirá abrir seus dados. Se esquecer a senha, eles não poderão ser recuperados: a conta recomeça vazia. Digite sua senha para confirmar." }],
  ];
  const ACOES_SEM_VOLTA: Array<[string, Omit<ConfigConfirmarSeguro, "executar">]> = [
    ["Apagar todos os dados", { titulo: "Apagar todos os dados?", botao: "Apagar dados", senha: true,
      mensagem: "Transações, contas, categorias e perfis serão apagados. Seu login continua funcionando. Essa ação não pode ser desfeita. Digite sua senha para confirmar." }],
    ["Apagar todos os dados (com 2FA)", { titulo: "Apagar todos os dados?", botao: "Apagar dados", senha: true, codigo2FA: true,
      mensagem: "Transações, contas, categorias e perfis serão apagados. Seu login continua funcionando. Essa ação não pode ser desfeita. Digite sua senha e o código do seu aplicativo 2FA para confirmar." }],
    ["Excluir conta do ZoZo", { titulo: "Excluir conta?", botao: "Excluir conta", frase: "EXCLUIR CONTA",
      mensagem: "Sua conta, todos os seus dados e o histórico de versões serão excluídos do servidor. Essa ação não pode ser desfeita." }],
    ["Excluir conta (com 2FA)", { titulo: "Excluir conta?", botao: "Excluir conta", frase: "EXCLUIR CONTA", codigo2FA: true,
      mensagem: "Sua conta, todos os seus dados e o histórico de versões serão excluídos do servidor. Essa ação não pode ser desfeita." }],
    ["Trocar a senha (com 2FA)", { titulo: "Trocar a senha?", botao: "Trocar senha", codigo2FA: true,
      mensagem: "Para trocar a senha, digite o código atual do seu aplicativo 2FA." }],
    ["Desativar proteção avançada", { titulo: "Desativar proteção avançada?", botao: "Desativar", senha: true,
      mensagem: "Se esquecer a senha, você poderá recuperar seus dados pelo link enviado ao seu e-mail. Digite sua senha para confirmar." }],
    ["Desativar proteção avançada (com 2FA)", { titulo: "Desativar proteção avançada?", botao: "Desativar", senha: true, codigo2FA: true,
      mensagem: "Se esquecer a senha, você poderá recuperar seus dados pelo link enviado ao seu e-mail. Digite sua senha e o código do seu aplicativo 2FA para confirmar." }],
  ];

  /* ---------- galeria de gráficos (dados de exemplo, sem conta) ---------- */
  function serie(n: number, inicio: number, passo: number, onda: number): PontoGrafico[] {
    const hoje = new Date();
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - (n - 1 - i));
      return { data: F.iso(d), valor: Math.round((inicio + passo * i + Math.sin(i / 3) * onda) * 100) / 100 };
    });
  }
  function galeriaGraficos() {
    ZoZo.feedback.modal({ title: "Galeria de gráficos", body: graficos(), class: C.janela });
  }
  /** Os gráficos com dados de exemplo (desenhados logo depois de entrarem na página) */
  function graficos(): HTMLElement {
    const css = getComputedStyle(document.documentElement);
    const cor = (v: string) => css.getPropertyValue(v).trim();
    const bloco = (titulo: string) => { const g = h("div"); return { el: h("div", { class: C.blocoGrafico }, h("p", { class: C.subtitulo }, titulo), g), g }; };
    const sobe = bloco("Linha subindo (área degradê)"), desce = bloco("Linha descendo"), duas = bloco("Duas linhas (ativos × passivos, escalas próprias)");
    const tracejada = bloco("Gasto × orçamento (tracejada)"), filtro = bloco("Modo filtro (passe o mouse: data em cima e o resto esmaecido)");
    const declive = bloco("Cor pela inclinação (sobe verde, desce vermelho)"), rosca = bloco("Rosca"), barras = bloco("Barras (meses, com limite)");
    const corpo = h("div", { class: C.galeria }, sobe.el, desce.el, duas.el, tracejada.el, filtro.el, declive.el, rosca.el, barras.el);
    setTimeout(() => {
      ZoZo.charts.renderLineChart(sobe.g, [{ name: "Saldo", color: cor("--color-chart-up"), points: serie(30, 1000, 25, 60) }], { height: 150, ariaLabel: "Exemplo subindo" });
      ZoZo.charts.renderLineChart(desce.g, [{ name: "Saldo", color: cor("--color-chart-down"), points: serie(30, 2000, -20, 50) }], { height: 150, ariaLabel: "Exemplo descendo" });
      ZoZo.charts.renderLineChart(duas.g, [
        { name: "Ativos", color: cor("--color-assets"), points: serie(60, 40000, 120, 900) },
        { name: "Passivos", color: cor("--color-liabilities"), points: serie(60, 9000, -30, 300) },
      ], { height: 170, independentScale: true, ariaLabel: "Exemplo ativos e passivos" });
      const gasto = serie(24, 0, 140, 80).map((p, i) => ({ data: p.data, valor: Math.max(0, i * 140 + Math.sin(i) * 60) }));
      ZoZo.charts.renderLineChart(tracejada.g, [
        { name: "Gasto", color: cor("--color-primary"), points: gasto, area: true },
        { name: "Orçamento", color: cor("--color-text-muted"), tracejado: true, points: gasto.map((p, i) => ({ data: p.data, valor: i * 160 })) },
      ], { height: 150, ariaLabel: "Exemplo gasto e orçamento" });
      ZoZo.charts.renderLineChart(filtro.g, [{ name: "Saldo", color: cor("--color-chart-up"), points: serie(30, 1500, 18, 90) }], { height: 150, ariaLabel: "Exemplo modo filtro", aoPassar: () => undefined });
      ZoZo.charts.renderLineChart(declive.g, [{ name: "Saldo", colorBySlope: true, points: serie(40, 1200, 4, 160) }], { height: 150, ariaLabel: "Exemplo cor pela inclinação" });
      ZoZo.charts.renderDonutChart(rosca.g, [
        { label: "Moradia", cor: cor("--palette-10"), valor: 2500 }, { label: "Alimentação", cor: cor("--palette-03"), valor: 1200 },
        { label: "Transporte", cor: cor("--palette-08"), valor: 600 }, { label: "Lazer", cor: cor("--palette-12"), valor: 400 },
      ], { size: 140, ariaLabel: "Exemplo de rosca" });
      const hoje = new Date();
      ZoZo.charts.renderBarChart(barras.g, Array.from({ length: 12 }, (_, i) => {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - 11 + i, 1);
        return { valor: 300 + Math.round(Math.abs(Math.sin(i)) * 500), rotuloMes: F.mesAbrev(d.getMonth()), rotuloAno: String(d.getFullYear()), destaque: i === 11 };
      }), { height: 170, limite: 600, ariaLabel: "Exemplo de barras", nomeValor: "Gasto" });
    }, 60);
    return corpo;
  }

  /* ---------- galeria de componentes ---------- */
  function galeriaComponentes() {
    ZoZo.feedback.modal({ title: "Galeria de componentes", body: componentes(), class: C.janela });
  }
  /** Todos os componentes (botões, pílulas, etiquetas, valores, campos, barras, filtros e estados) */
  function componentes(): HTMLElement {
    const P = ZoZo.pecas;
    const bloco = (titulo: string, ...itens: Array<HTMLElement | null>) => h("section", { class: C.grupo }, h("p", { class: C.subtitulo }, titulo), h("div", { class: C.linhaGaleria }, ...itens));
    const variantes: Array<[string, OpcoesBotao["variant"]]> = [["Primário", "primary"], ["Secundário", "secondary"], ["Perigo", "danger"], ["Perigo discreto", "danger-ghost"], ["Texto", "text"]];
    const cat = { nome: "Restaurantes", icone: "🍝", cor: "#ff5d04" };
    const corpo = h("div", { class: C.galeria },
      bloco("Botões", ...variantes.map(([r, v]) => UI.Button(r, { variant: v }))),
      bloco("Botões pequenos", ...variantes.map(([r, v]) => UI.Button(r, { variant: v, size: "sm" }))),
      bloco("Botões desabilitados", ...variantes.map(([r, v]) => { const b = UI.Button(r, { variant: v }); b.disabled = true; return b; })),
      bloco("Botões com ícone", UI.IconButton("mais", "Adicionar"), UI.IconButton("pesquisar", "Pesquisar"), UI.IconButton("baixar", "Baixar"),
        UI.Button("Com ícone", { icon: "baixar" }), UI.Button("Pequeno com ícone", { icon: "mais", size: "sm" })),
      bloco("Pílulas de variação — ativo", UI.PercentageChange(3.42), UI.PercentageChange(-2.17), UI.PercentageChange(0)),
      bloco("Pílulas de variação — passivo", UI.PercentageChange(3.42, { passivo: true }), UI.PercentageChange(-2.17, { passivo: true }), UI.PercentageChange(0, { passivo: true })),
      bloco("Variação sem fundo", UI.PercentageChange(5.1, { plain: true }), UI.PercentageChange(-1.3, { plain: true }), UI.PercentageChange(0, { plain: true })),
      bloco("Etiquetas", UI.CategoryLabel(cat, { pill: true }), UI.Tag("Casa", "#00b2b2", { class: "tag--upper" }), UI.Tag("Viagem", "#2d8cff", { class: "tag--upper" }),
        h("span", { class: P.chipOk }, "Pago"), h("span", { class: P.chipPendente }, "Pendente"), h("span", { class: P.chipNeutro }, "Arquivado"),
        ...["R", "P", "T", "I", "D"].map((l) => h("span", { class: P.letra }, l))),
      bloco("Valores", UI.Dinheiro(1234.56), UI.Dinheiro(-89.9), UI.Dinheiro(5200, { class: "money--income" }), h("span", null, "Percentual: 12,5%")),
      bloco("Campos", UI.Field("Nome", UI.Input({ placeholder: "Digite um nome" })),
        UI.Field("Opções", UI.Select([{ value: "a", label: "Opção A" }, { value: "b", label: "Opção B" }])),
        UI.Checkbox(true, () => undefined, { label: "Marcado", texto: "Marcado" }), UI.Checkbox(false, () => undefined, { label: "Desmarcado", texto: "Desmarcado" }),
        ZoZo.modais.Interruptor("Interruptor", true, () => undefined), ZoZo.calendario.Campo({ valor: F.iso(new Date()), rotulo: "data de exemplo", aoMudar: () => undefined })),
      bloco("Barras de progresso",
        h("div", { class: "tw:w-[180px]" }, UI.ProgressBar(0.45, { tone: "ok", label: "Dentro do orçamento" })),
        h("div", { class: "tw:w-[180px]" }, UI.ProgressBar(0.92, { tone: "ok", label: "Perto do limite" })),
        h("div", { class: "tw:w-[180px]" }, UI.ProgressBar(1.2, { tone: "over", label: "Acima do orçamento" })),
        h("div", { class: "tw:w-[180px]" }, UI.ProgressBar(0.6, { tone: "allocation", label: "Alocação" }))),
      bloco("Filtros de período", UI.FilterTabs("3M", () => undefined, { label: "Exemplo de filtro" })),
      bloco("Estados", h("div", { class: "tw:w-[220px]" }, UI.EmptyState("Nada por aqui.", { icon: "categorias" })),
        h("div", { class: "tw:w-[220px]" }, UI.ErrorState("Algo deu errado.", () => undefined)),
        h("div", { class: "tw:w-[220px]" }, UI.Skeleton(3, { short: true }))));
    return corpo;
  }

  /** Botão "Modo teste" visível ou não (a demonstração pode escondê-lo: Alt + Shift + D) */
  function mostrarBotao(sim: boolean) { if (ancora) ancora.hidden = !sim; }

  ZoZo.teste = { iniciar, catalogo, mostrarBotao, componentes, graficos };
})(window.ZoZo);

export {};   // módulo: carregado sob demanda por app.ts (import dinâmico)
