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
  }

  /* ---------- dados de exemplo (da conta aberta) ---------- */
  async function lista(ctx: ContextoApp, chave: string, acao: string, campo: string): Promise<any[]> {
    const d = await ctx.loadData(chave, acao);
    return (d && d[campo]) || [];
  }
  const lancamentos = (ctx: ContextoApp) => lista(ctx, "lancamentos", A.getLancamentos, "lancamentos");
  const contas = (ctx: ContextoApp) => lista(ctx, "contas", A.getContas, "contas");
  const categorias = (ctx: ContextoApp) => lista(ctx, "categorias", A.getCategorias, "categorias");
  const perfis = (ctx: ContextoApp) => lista(ctx, "perfis", A.getPerfis, "perfis");
  const recorrencias = (ctx: ContextoApp) => lista(ctx, "recorrencias", A.getRecorrencias, "recorrencias");

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
      setTimeout(() => Promise.resolve().then(acao).catch((e: any) => avisar((e && (e.friendly || e.message)) || "Não deu para abrir.")), 220);
    });
    /** Painel lateral só aparece nas páginas que têm a coluna dele (no Dashboard não): vai à página antes */
    const naPagina = (rota: string, acao: () => unknown) => () => { ctx.router.navigate(rota); return new Promise((ok) => setTimeout(ok, 450)).then(acao); };
    const achar = <X>(itens: X[], teste: (x: X) => boolean, oque: string): X => {
      const x = itens.find(teste);
      if (!x) throw new Error("Não há " + oque + " nesta conta (carregue os dados de exemplo).");
      return x;
    };
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
      const tipoLanc = (tipo: string, rotulo: string, teste: (l: any) => boolean) =>
        ir(rotulo, naPagina("lancamentos", async () => ZoZo.lancamentosShared.abrirVisualizacao(achar(await lancamentos(ctx), teste, "transação do tipo " + tipo), ctx)));
      const tipoConta = (tipo: string, rotulo: string, opts?: any) =>
        ir(rotulo, naPagina(tipo === "investimento" ? "investimentos" : "contas", async () => ZoZo.contasShared.abrirDetalheConta(
          achar(await contas(ctx), (c: any) => c.tipo === tipo, "conta do tipo " + tipo), ctx, tipo === "investimento" ? "investimentos" : "contas", opts)));
      const primeira = async (fn: () => Promise<any[]>, oque: string) => achar(await fn(), () => true, oque);
      const regular = async () => achar(await lancamentos(ctx), (l: any) => l.tipo === "regular", "transação regular");
      const cartao = async () => achar(await contas(ctx), (c: any) => c.tipo === "cartao", "cartão de crédito");

      mount(area,
        h("dl", { class: C.estado }, ...linhas.flatMap(([r, v]) => [h("dt", { class: C.rotulo }, r), h("dd", { class: C.valor }, v)])),
        linha(
          logado() ? null : botaoCmd("Entrar com dados de exemplo", () => { fechar(); app.entrarSimulado().catch(() => avisar("Não deu para entrar.")); }),
          logado() ? ir("Recarregar dados", () => ctx.recarregarTudo()) : null,
          logado() && e.sessao.startsWith("simulada") ? botaoCmd("Carregar dados de exemplo", () => {
            if (!T!.carregarExemplo()) return;
            ZoZo.servico.reset(); ctx.recarregarTudo(); fechar();
          }) : null),

        secao("Telas", true,
          linha(...([["dashboard", "Dashboard"], ["lancamentos", "Transações"], ["contas", "Contas"], ["investimentos", "Investimentos"],
            ["categorias", "Categorias"], ["recorrencias", "Recorrências"], ["perfil", "Perfis"]] as Array<[string, string]>)
            .map(([rota, rotulo]) => ir(rotulo, () => ctx.router.navigate(rota))),
          ir("Fatura (boleto)", () => ZoZo.boleto.open(ctx, {})),
          ir("Sobre o ZoZo (página pública)", () => { window.open("/sobre", "_blank", "noopener"); }),
          ir("Termos de uso", () => { window.open("/termos-uso", "_blank", "noopener"); }),
          ir("Política de privacidade", () => { window.open("/politica-privacidade", "_blank", "noopener"); }))),

        secao("Etapas da entrada", false,
          logado() ? h("p", { class: C.nota }, "Abrir uma etapa da entrada encerra a sessão desta aba.") : null,
          sub("Entrar e cadastrar"),
          linha(...([["entrarInicio", "Início"], ["entrarEmail", "E-mail"], ["entrarSenha", "Senha"], ["cadastroNome", "Cadastro: nome e e-mail"],
            ["cadastroSenha", "Cadastro: senha"], ["doisFatores", "Código do 2FA (login)"], ["carregando", "Carregando"]] as Array<[string, string]>)
            .map(([nome, rotulo]) => ir(rotulo, () => app.tela(nome), false))),
          sub("Confirmação de e-mail e recuperação de senha"),
          linha(...([["verificar", "Verifique seu e-mail"], ["verificarRecuperacao", "Verifique (recuperação)"], ["linkInvalido", "Link inválido"],
            ["redefinir", "Redefinir senha"], ["codigo", "Código do 2FA (recuperação)"], ["novaSenha", "Nova senha"], ["novaSenhaRecomecar", "Nova senha (recomeçar)"]] as Array<[string, string]>)
            .map(([nome, rotulo]) => ir(rotulo, () => app.tela(nome), false)))),

        secao("Painéis laterais", false,
          sub("Transações"),
          linha(ir("Nova transação", naPagina("lancamentos", () => ZoZo.lancamentosShared.abrirFormulario(null, ctx))),
            tipoLanc("regular", "Despesa", (l) => l.tipo === "regular"),
            tipoLanc("receita", "Receita", (l) => l.tipo === "receita"),
            tipoLanc("estorno", "Estorno", (l) => l.tipo === "estorno"),
            tipoLanc("débito", "Débito", (l) => l.tipo === "debito"),
            tipoLanc("transferência", "Transferência", (l) => l.tipo === "interno"),
            tipoLanc("recorrente", "Recorrente", (l) => l.tipo === "recorrente" && l.recorrencia !== "parcelada"),
            tipoLanc("parcelada", "Parcelada", (l) => l.recorrencia === "parcelada"),
            tipoLanc("dividida", "Dividida", (l) => !!l.divisao)),
          sub("Contas"),
          linha(tipoConta("corrente", "Conta corrente"), tipoConta("poupanca", "Poupança"), tipoConta("cartao", "Cartão de crédito"),
            tipoConta("cartao", "Cartão: editar fechamento", { editandoCiclo: true }), tipoConta("investimento", "Investimento"),
            tipoConta("emprestimo", "Empréstimo"), tipoConta("outros", "Outros")),
          sub("Categorias, recorrências e perfis"),
          linha(
            ir("Categoria", naPagina("categorias", async () => ZoZo.categoriasShared.abrirDetalhe(await primeira(() => categorias(ctx), "categoria"), ctx))),
            ir("Categoria: editar orçamento", naPagina("categorias", async () => ZoZo.categoriasShared.abrirDetalhe(
              achar(await categorias(ctx), (c: any) => c.status === "regular", "categoria regular"), ctx, { editandoOrcamento: true }))),
            ir("Categoria: editar (formulário)", naPagina("categorias", async () => ZoZo.categoriasShared.abrirFormCategoria(ctx, await primeira(() => categorias(ctx), "categoria")))),
            ir("Grupo de categorias", naPagina("categorias", async () => ZoZo.categoriasShared.abrirGrupo(achar(await categorias(ctx), (c: any) => !!c.grupo, "grupo").grupo, ctx))),
            ir("Grupo: editar orçamento", naPagina("categorias", async () => ZoZo.categoriasShared.abrirGrupo(achar(await categorias(ctx), (c: any) => !!c.grupo, "grupo").grupo, ctx, { editando: true }))),
            ir("Recorrência", naPagina("recorrencias", async () => ZoZo.recorrenciasShared.abrirDetalhe(await primeira(() => recorrencias(ctx), "recorrência"), ctx))),
            ir("Perfil", naPagina("perfil", async () => ZoZo.perfilShared.abrirDetalhe(await primeira(() => perfis(ctx), "perfil"), ctx))),
            ir("Perfil: editar (formulário)", naPagina("perfil", async () => ZoZo.perfilShared.abrirFormPerfil(ctx, await primeira(() => perfis(ctx), "perfil"), null))))),

        secao("Janelas (todos os passos)", false,
          sub("Contas"),
          linha(...([["corrente", "Nova conta: banco"], ["cartao", "Nova conta: cartão"], ["investimento", "Nova conta: investimento"],
            ["emprestimo", "Nova conta: empréstimo"], ["outros", "Nova conta: outros"]] as Array<[string, string]>)
            .map(([tipo, rotulo]) => ir(rotulo, () => ZoZo.modais.novaConta(ctx, tipo, {}))),
            ir("Pagar fatura", async () => ZoZo.modais.pagarFatura(ctx, await cartao()))),
          sub("Categorias e perfis"),
          linha(ir("Nova categoria", () => ZoZo.modais.novaCategoria(ctx, {})),
            ir("Criar grupo", () => ZoZo.modais.criarGrupo(() => undefined)),
            ir("Novo perfil", () => ZoZo.modais.novoPerfil(ctx, {}))),
          sub("Transações e recorrências"),
          linha(ir("Nova recorrência: 1. escolher transação", () => ZoZo.modais.novaRecorrencia(ctx)),
            ir("Nova recorrência: 2. frequência", async () => ZoZo.modais.frequencia(ctx, (await regular()).id, {})),
            ir("Dividir transação", async () => ZoZo.dividir.abrir(await regular(), ctx)),
            ir("Transferir entre moedas", () => ZoZo.cambio.abrirTransferencia(ctx))),
          sub("Configurações e confirmações"),
          linha(ir("Configurações: Geral", () => ZoZo.configuracoes.abrir(ctx, "geral")),
            ir("Configurações: Conta", () => ZoZo.configuracoes.abrir(ctx, "conta")),
            ir("Configurações: Sobre", () => ZoZo.configuracoes.abrir(ctx, "sobre")),
            ir("2FA: ativar (passo a passo)", () => {
              ZoZo.configuracoes.abrir(ctx, "conta");
              setTimeout(() => { const b = Array.from(document.querySelectorAll<HTMLButtonElement>(".modal button")).find((x) => /Ativar 2FA|Desativar 2FA/.test(x.textContent || "")); if (b) b.click(); }, 400);
            }),
            ir("2FA: desativar (código)", () => ZoZo.configuracoes.desativar2FA(ctx))),
          sub("Confirmações de ação (os textos de cada uma; confirmar aqui não faz nada)"),
          linha(...CONFIRMACOES.map(([rotulo, titulo, mensagem, opts]) =>
            ir(rotulo, () => ZoZo.feedback.confirmarExclusao(titulo, mensagem, opts), false))),
          sub("Confirmações com senha"),
          linha(...CONFIRMACOES_SENHA.map(([rotulo, cfg]) => ir(rotulo, () => ZoZo.modais.confirmarComSenha(cfg), false)))),

        secao("Menus", false,
          h("p", { class: C.nota }, "Abrem no botão \"Modo teste\". Os menus próprios de cada tela abrem pelos botões dela (abra a tela ou o painel acima)."),
          linha(
            ir("Menu completo (ícone, marcado, seção, submenu, perigoso)", () => ancora && ZoZo.menu.abrir(ancora, [
              { icone: "mais", label: "Item com ícone", onClick: () => undefined },
              { label: "Item marcado", check: true, onClick: () => undefined },
              { label: "Item não marcado", check: false, onClick: () => undefined },
              { secao: "Seção" },
              { label: "Com submenu", submenu: [{ label: "Opção 1", onClick: () => undefined }, { label: "Opção 2", onClick: () => undefined }] },
              { label: "Desabilitado", desabilitado: true, onClick: () => undefined },
              { separador: true },
              { label: "Excluir", perigo: true, onClick: () => undefined },
            ], { posicao: "acima", checkEsquerda: true, largura: 260, label: "Menu de exemplo" }), false),
            ir("Contas", async () => ancora && ZoZo.menu.contas(ancora, { contas: await contas(ctx), atual: null, aoEscolher: () => undefined, posicao: "acima" })),
            ir("Perfis", async () => ancora && ZoZo.menu.perfis(ancora, ctx, { perfis: await perfis(ctx), atual: null, aoEscolher: () => undefined, posicao: "acima" })),
            ir("Calendário", () => ancora && ZoZo.calendario.abrir(ancora, F.iso(new Date()), () => undefined, { posicao: "acima" }), false),
            ir("Emojis", () => ancora && ZoZo.emojiPicker.abrir(ancora, { atual: "📦", aoEscolher: () => undefined, posicao: "acima" }), false))),

        secao("Gráficos", false,
          linha(ir("Galeria de gráficos", () => galeriaGraficos(), false),
            ir("Dashboard (gasto e patrimônio)", () => ctx.router.navigate("dashboard")),
            ir("Contas (ativos × passivos)", () => ctx.router.navigate("contas")),
            tipoConta("corrente", "Painel da conta (saldo)"),
            ir("Painel da categoria (barras)", naPagina("categorias", async () => ZoZo.categoriasShared.abrirDetalhe(await primeira(() => categorias(ctx), "categoria"), ctx))),
            ir("Categorias (rosca)", () => ctx.router.navigate("categorias")),
            ir("Investimentos", () => ctx.router.navigate("investimentos")))),

        secao("Componentes", false,
          linha(ir("Galeria de componentes (botões, pílulas, campos, estados)", () => galeriaComponentes(), false))),

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
    ["Apagar todos os dados", { titulo: "Apagar todos os dados?", botao: "Apagar dados", mensagem: "Transações, contas, categorias e perfis serão apagados. Seu login continua funcionando. Essa ação não pode ser desfeita." }],
    ["Excluir conta do ZoZo", { titulo: "Excluir conta?", botao: "Excluir conta", mensagem: "Sua conta, todos os seus dados e o histórico de versões serão excluídos do servidor. Essa ação não pode ser desfeita." }],
    ["Ativar proteção avançada", { titulo: "Ativar proteção avançada?", botao: "Ativar", mensagem: "Só você conseguirá abrir seus dados. Se esquecer a senha, eles não poderão ser recuperados: a conta recomeça vazia. Digite sua senha para confirmar." }],
    ["Desativar proteção avançada", { titulo: "Desativar proteção avançada?", botao: "Desativar", mensagem: "Se esquecer a senha, você poderá recuperar seus dados pelo link enviado ao seu e-mail. Digite sua senha para confirmar." }],
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
    const css = getComputedStyle(document.documentElement);
    const cor = (v: string) => css.getPropertyValue(v).trim();
    const bloco = (titulo: string) => { const g = h("div"); return { el: h("div", { class: C.blocoGrafico }, h("p", { class: C.subtitulo }, titulo), g), g }; };
    const sobe = bloco("Linha subindo (área degradê)"), desce = bloco("Linha descendo"), duas = bloco("Duas linhas (ativos × passivos, escalas próprias)");
    const tracejada = bloco("Gasto × orçamento (tracejada)"), filtro = bloco("Modo filtro (passe o mouse: data em cima e o resto esmaecido)");
    const declive = bloco("Cor pela inclinação (sobe verde, desce vermelho)"), rosca = bloco("Rosca"), barras = bloco("Barras (meses, com limite)");
    const corpo = h("div", { class: C.galeria }, sobe.el, desce.el, duas.el, tracejada.el, filtro.el, declive.el, rosca.el, barras.el);
    ZoZo.feedback.modal({ title: "Galeria de gráficos", body: corpo, class: C.janela });
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
  }

  /* ---------- galeria de componentes ---------- */
  function galeriaComponentes() {
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
    ZoZo.feedback.modal({ title: "Galeria de componentes", body: corpo, class: C.janela });
  }

  ZoZo.teste = { iniciar };
})(window.ZoZo);

export {};   // módulo: carregado sob demanda por app.ts (import dinâmico)
