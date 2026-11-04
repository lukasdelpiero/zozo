/* =============================================================
   ZoZo — Zo, o assistente: as ferramentas (rodam AQUI, no navegador)
   ------------------------------------------------------------
   O modelo (no Cloudflare Workers AI, pela API do ZoZo) só ESCOLHE uma ferramenta e preenche os argumentos. Quem lê e grava é o
   serviço de dados, com as mesmas regras da tela. Cada argumento é conferido aqui; nada que vem do modelo é
   executado sem passar por esta lista fechada.
     • leitura: devolve só o necessário (JSON curto) para o Zo responder;
     • gravação: devolve um RESUMO montado com os dados reais (nomes de conta, categoria…), nunca o texto do
       modelo, e só grava quando a pessoa toca em Confirmar (a tela chama confirmar());
     • opções: a tela mostra botões e a escolha volta como mensagem da pessoa;
     • arquivo: a tela mostra o botão para escolher o CSV/OFX do banco (lido no navegador; o Zo nunca vê o arquivo);
     • tela: abre uma tela do app (fatura, Transações filtradas, Configurações) pelas ações que a janela do Zo
       entrega (opcoes.tela). Senha, 2FA, proteção avançada, apagar dados, excluir conta e chave Pix só pela tela
       segura das Configurações: nada disso passa pelo chat.
   Os nomes das ferramentas são os de api/src/zo.py (teste em ui/tests/zo.test.mjs).
   TypeScript: tipos em src/globais.d.ts (ZoZoZoFerramentas).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const A = ZoZo.messages.ACTIONS;
  const F = ZoZo.format;

  const TIPOS: Record<string, { tipo: string; sentido?: Sentido; rotulo: string }> = {
    despesa: { tipo: "regular", rotulo: "Despesa" }, estorno: { tipo: "estorno", rotulo: "Estorno" },
    receita: { tipo: "receita", rotulo: "Receita" }, debito: { tipo: "debito", rotulo: "Débito" },
    transferencia_entrada: { tipo: "interno", sentido: "entrada", rotulo: "Transferência de entrada" },
    transferencia_saida: { tipo: "interno", sentido: "saida", rotulo: "Transferência de saída" },
  };
  const FREQ = ["semanal", "quinzenal", "mensal", "bimestral", "trimestral", "quadrimestral", "semestral", "anual"];
  const TIPOS_CONTA: Record<string, string> = { cartao: "Cartão de crédito", corrente: "Conta corrente", poupanca: "Poupança",
    investimento: "Investimento", emprestimo: "Empréstimo", outros: "Outros" };
  const COM_CATEGORIA = ["regular", "estorno", "debito", "recorrente"];
  const LIMITE_RESULTADO = 18000;

  /* ---------------- leitura dos argumentos (tudo é conferido; o resto é ignorado) ---------------- */
  type Args = Record<string, unknown>;
  const ler = (json: string): Args => { try { const v = JSON.parse(json || "{}"); return v && typeof v === "object" && !Array.isArray(v) ? v as Args : {}; } catch (e) { return {}; } };
  const txt = (v: unknown, max = 200): string | undefined => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const int = (v: unknown, min: number, max: number): number | undefined => (Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? v as number : undefined);
  const data = (v: unknown): string | undefined => { const s = txt(v, 10); return s && /^\d{4}-\d{2}-\d{2}$/.test(s) && F.parseData(s) && F.iso(F.parseData(s) as Date) === s ? s : undefined; };
  const mesVal = (v: unknown): string | undefined => { const s = txt(v, 7); return s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : undefined; };
  const cor = (v: unknown): string | undefined => { const s = txt(v, 7); return s && /^#[0-9a-fA-F]{6}$/.test(s) ? s : undefined; };
  const hoje = () => F.iso(new Date());
  const mesAtual = () => hoje().slice(0, 7);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  /** Resultado grande demais: as listas encolhem pela metade até caber, sempre em JSON válido e com o aviso (antes o
      texto era cortado no meio, e o modelo recebia um JSON quebrado) */
  const encolher = (v: unknown): unknown => (Array.isArray(v) ? v.slice(0, Math.max(1, Math.floor(v.length / 2))).map(encolher)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encolher(x)]))
      : typeof v === "string" && v.length > 300 ? v.slice(0, 300) + "…" : v);
  const json = (v: unknown): string => {
    const s = JSON.stringify(v);
    if (s.length <= LIMITE_RESULTADO) return s;
    let x = v;
    for (let i = 0; i < 12; i += 1) {
      x = encolher(x);
      const t = JSON.stringify({ cortado: true, dica: "Resultado grande demais, mostrei só uma parte. Peça um período ou um filtro menor.", dados: x });
      if (t.length <= LIMITE_RESULTADO) return t;
    }
    return JSON.stringify({ erro: "resultado_grande_demais", dica: "Peça um período ou um filtro menor." });
  };
  const norm = (t: unknown) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const dataBr = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4);

  /** Faltou algo obrigatório: o Zo recebe a lista e pergunta à pessoa (nada é gravado) */
  const faltam = (campos: string[]): ResultadoFerramentaZo => ({ tipo: "leitura", resultado: json({ erro: "faltam_dados", campos }) });
  /** Veio, mas não vale (data impossível, mês torto, parcelas fora da faixa, combinação que o ZoZo não faz): nada é
      gravado e nada é trocado por um padrão às escondidas. O Zo confere com a pessoa e chama de novo. */
  const invalidos = (campos: string[], dica = "Nada foi gravado. Confira com a pessoa e chame de novo."): ResultadoFerramentaZo =>
    ({ tipo: "leitura", resultado: json({ erro: "dados_invalidos", campos, dica }) });
  const veio = (v: unknown) => v !== undefined && v !== null;
  /** Campos de data e mês que vieram e não valem (os mesmos nomes em todas as ferramentas) */
  const datasRuins = (a: Args): string[] => [
    ...["data", "de", "ate"].filter((k) => veio(a[k]) && !data(a[k])),
    ...(veio(a.mes) && !mesVal(a.mes) ? ["mes"] : []),
  ];
  // só despesa e débito repetem ou parcelam (no serviço: TIPOS_RECORRIVEIS); recorrente = a origem de uma série
  const RECORRIVEIS = ["regular", "debito", "recorrente"];
  const SO_DESPESA = "Só despesas e débitos podem repetir ou ser parcelados. Receitas, estornos e transferências ainda não viram recorrência.";
  /** Marca do que a pessoa viu no cartão: mudou até a confirmação, nada é gravado (STALE_PROPOSAL) */
  const marca = (v: unknown) => JSON.stringify(v);
  const vencida = () => new ZoZo.messages.BridgeError("STALE_PROPOSAL", ZoZo.messages.FRIENDLY.STALE_PROPOSAL);
  const marcaLanc = (l: LancamentoTela) => marca([l.data, l.descricao, l.valor, l.tipo, l.contaId || null, l.categoriaId || null, l.perfilId || null,
    l.notas || "", l.recorrencia || null, l.parcelaAtual || null, l.parcelaTotal || null, l.sentido || null]);
  const marcaConta = (c: ContaTela) => marca([c.nome, c.ultimos4Digitos || "", c.fechamento || null, c.vencimento || null]);
  const marcaCat = (c: CategoriaTela) => marca([c.nome, c.icone, c.cor, c.grupo || null, c.reservadoFixo, c.status]);
  const erroDe = (e: unknown) => {
    const x = e as Partial<ErroPonte> | null;
    return json({ erro: (x && x.code) || "OPERATION_FAILED", mensagem: (x && x.friendly) || ZoZo.messages.FRIENDLY.OPERATION_FAILED });
  };

  function criar(req: PedidoZo, opcoes: OpcoesFerramentasZo): ZoZoZoFerramentasInstancia {
    const fatura = () => (opcoes.fatura ? opcoes.fatura() : false), cambio = () => (opcoes.cambio ? opcoes.cambio() : false);
    const lote: ZoZoServico["lote"] = opcoes.lote || ((passo) => ZoZo.servico.lote(passo));
    const vigente = () => (opcoes.vigente ? opcoes.vigente() : true);
    const moeda = () => req(A.getConfig).then((c) => c.moeda || "BRL");
    const indisponivel = () => ({ tipo: "leitura" as const, resultado: json({ erro: "FEATURE_UNAVAILABLE", mensagem: ZoZo.messages.FRIENDLY.FEATURE_UNAVAILABLE }) });
    const semTela = () => ({ tipo: "leitura" as const, resultado: json({ erro: "tela_indisponivel" }) });
    /** "AAAA-MM" → { mes, ano } do pedido da fatura (mês atual se vier vazio) */
    const doMes = (v: unknown) => { const m = mesVal(v) || mesAtual(); return { mes: Number(m.slice(5, 7)), ano: Number(m.slice(0, 4)), texto: m }; };
    const lerAjustes = (v: unknown): Array<{ descricao: string; valor: number }> | undefined => (Array.isArray(v)
      ? v.slice(0, 30).map((x) => (x && typeof x === "object" ? { descricao: txt((x as Args).descricao, 50) || "", valor: r2(num((x as Args).valor) || 0) } : null))
        .filter((x): x is { descricao: string; valor: number } => !!x && (!!x.descricao || !!x.valor)) : undefined);
    /** Listas atuais (lidas a cada uso: sempre o estado de agora) */
    const contas = () => req(A.getContas).then((r) => r.contas || []);
    const categorias = (mes?: string) => req(A.getCategorias, mes ? { mes } : undefined).then((r) => r.categorias || []);
    const perfis = () => (opcoes.perfis() ? req(A.getPerfis).then((r) => (r.perfis || []).filter((p) => !p.arquivado)) : Promise.resolve([] as PerfilTela[]));
    const lancamentos = () => req(A.getLancamentos).then((r) => r.lancamentos || []);
    const nomeConta = (c: ContaTela | undefined) => (c ? c.nome + (c.ultimos4Digitos ? " " + c.ultimos4Digitos : "") : "Sem conta");

    /* ---------------- leitura ---------------- */
    const LEITURA: Record<string, (a: Args) => Promise<unknown>> = {
      // moeda: o código ISO dos valores (BRL, USD ou EUR); com o multicâmbio, as leituras mostram só a moeda escolhida
      listar_contas: async () => ({ moeda: await moeda(), contas: (await contas()).map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo, saldo: c.valor,
        ultimos4: c.ultimos4Digitos || undefined, fechamento: c.fechamento || undefined, vencimento: c.vencimento || undefined, oculta: c.oculta || undefined })) }),
      listar_categorias: async () => ({ moeda: await moeda(), categorias: (await categorias()).filter((c) => c.status === "regular")
        .map((c) => ({ id: c.id, nome: c.nome, icone: c.icone, orcamento_mes: c.reservado, gasto_mes: c.gasto, grupo: c.grupo || undefined })) }),
      listar_perfis: async () => (await perfis()).map((p) => ({ id: p.id, nome: p.nome })),
      listar_recorrencias: async () => {
        const r = await req(A.getRecorrencias);
        return { moeda: await moeda(), recorrencias: r.recorrencias.concat(r.proximas || []).map((o) => ({ serie_id: o.serieId, descricao: o.descricao, valor: o.valor, data: o.data,
          frequencia: o.tipoRecorrencia, parcela: o.parcela ? o.parcela + "/" + o.parcelaTotal : undefined, pago: o.pago, categoria: o.categoria ? o.categoria.nome : undefined })) };
      },
      buscar_transacoes: async (a) => {
        const texto = norm(txt(a.texto)), de = data(a.de), ate = data(a.ate), limite = int(a.limite, 1, 50) || 20;
        const lista = (await lancamentos()).filter((l) => (!texto || norm(l.descricao).includes(texto) || norm(l.notas).includes(texto))
          && (!de || l.data >= de) && (!ate || l.data <= ate) && (!a.conta_id || l.contaId === a.conta_id) && (!a.categoria_id || l.categoriaId === a.categoria_id)
          && (!a.perfil_id || l.perfilId === a.perfil_id) && (!a.tipo || l.tipo === a.tipo));
        return { moeda: await moeda(), total_encontrado: lista.length, transacoes: lista.slice(0, limite).map((l) => ({ id: l.id, data: l.data, descricao: l.descricao, valor: l.valor,
          tipo: l.tipo, sentido: l.sentido || undefined, conta: l.nomeConta || undefined, categoria: l.categoria ? l.categoria.nome : undefined,
          perfil: l.perfil ? l.perfil.nome : undefined, parcela: l.parcelaTotal ? l.parcelaAtual + "/" + l.parcelaTotal : undefined,
          serie_id: l.serieId || undefined, notas: l.notas ? l.notas.slice(0, 120) : undefined })) };
      },
      resumo_do_mes: async (a) => {
        const mes = mesVal(a.mes) || mesAtual();
        const T = ZoZo.regras.totais, S = ZoZo.regras.categorias.sinalGastoPorTipo;
        const doMes = (await lancamentos()).filter((l) => l.data.startsWith(mes));
        const porCat = new Map<string, number>();
        doMes.forEach((l) => { if (l.categoria) porCat.set(l.categoria.nome, (porCat.get(l.categoria.nome) || 0) + (S[l.tipo] || 0) * l.valor); });
        const cats = await req(A.getCategorias, { mes });
        return { mes, moeda: await moeda(), gasto: r2(doMes.reduce((s, l) => s + (T.gasto[l.tipo] || 0) * l.valor, 0)),
          recebido: r2(doMes.reduce((s, l) => s + (T.recebido[l.tipo] || 0) * l.valor, 0)),
          orcamento_total: cats.resumo.reservado, transacoes: doMes.length,
          por_categoria: [...porCat].filter(([, v]) => r2(v) > 0).sort((x, y) => y[1] - x[1]).slice(0, 12).map(([categoria, v]) => ({ categoria, gasto: r2(v) })) };
      },
      sugerir_categoria: async (a) => {
        // pelo histórico da própria pessoa (regra no serviço: sugerirCategorias)
        const r = await req(A.sugerirCategorias, { descricoes: [txt(a.descricao) || ""] });
        return (r.sugestoes[0] ? r.sugestoes[0].alternativas : []).map((x) => ({ categoria_id: x.categoriaId, nome: x.nome, pontos: x.pontos }));
      },
      consultar_fatura: async (a) => {
        if (!fatura()) return { erro: "FEATURE_UNAVAILABLE" };
        const m = doMes(a.mes);
        const perfilId = txt(a.perfil_id, 64) || "todos", cartaoId = txt(a.cartao_id, 64) || "todos";
        const d = await req(A.getBoletoData, { perfilId, cartaoId, mes: m.mes, ano: m.ano, incluirAberto: a.incluir_aberto === true });
        const recebido = d.recebimentos.reduce((s, l) => s + l.valor, 0);
        const t = ZoZo.servico.calcularFatura(Object.assign({}, d.ajustes, { lancamentos: d.lancamentos, saldoAnterior: d.saldoAnterior, recebido }));
        return { mes: m.texto, moeda: await moeda(), perfil: d.todos ? "todos" : d.perfil ? d.perfil.nome : null, so_consulta: d.consulta,
          transacoes: d.lancamentos.slice(0, 50).map((l) => ({ data: l.data, descricao: l.descricao, valor: l.valor, tipo: l.tipo, cartao: l.nomeConta || undefined })),
          quantidade: d.lancamentos.length, total_transacoes: t.lancamentos, contribuicoes: t.contribuicoes, descontos: t.descontos,
          arredondamentos: t.arredondamentos, saldo_anterior: t.saldoAnterior, recebido: t.recebido, a_pagar: t.aPagar,
          ajustes: d.consulta ? undefined : d.ajustes, incluiu_aberto: d.incluirAberto,
          periodos: d.periodos.map((p) => ({ cartao: p.nome, de: p.inicio, ate: p.fim, em_aberto: p.aberta || undefined })) };
      },
      ler_configuracoes: async () => {
        const c = await req(A.getConfig);
        const seg = opcoes.tela ? await opcoes.tela.seguranca().catch(() => null) : null;
        return { multicambio: c.multicambio, moeda: c.moeda, orcamento_ligado: c.orcamentoAtivo, pix_cadastrado: !!c.pix,
          dois_fatores: seg ? seg.doisFatores : undefined, protecao_avancada: seg ? seg.protecaoAvancada : undefined };
      },
      sobre_o_zozo: async (a) => {
        const assunto = txt(a.assunto, 20);
        if (assunto === "versao") return { versao: ZoZo.sobre.versao };
        if (assunto === "novidades") {
          const n = (ZoZo.notasVersao || [])[0];
          return n ? { versao: n.versao, quando: n.quando, itens: n.itens.map((i) => i.titulo + ". " + i.texto) } : { itens: [] };
        }
        if (assunto === "termos") return { endereco: "/termos-uso", resumo: "Uso pessoal e gratuito. A senha é a chave dos dados. Você pode exportar, apagar os dados ou excluir a conta quando quiser." };
        if (assunto === "privacidade") return { endereco: "/politica-privacidade", resumo: "Os dados financeiros são cifrados no seu navegador. O ZoZo não vende dados nem usa publicidade. Com o Zo e o seu consentimento, as mensagens e trechos dos dados vão ao Workers AI, da Cloudflare, com os formatos comuns de CPF, CNPJ, cartão, telefone, e-mail, senha e código escondidos (não é uma detecção perfeita: não cole senhas nem documentos no chat). A Cloudflare informa que não usa esse conteúdo para treinar inteligência artificial e não guarda os pedidos depois de responder, salvo quando a lei ou a segurança exigirem." };
        if (assunto === "armazenamento") return { resumo: "Os dados financeiros ficam num documento cifrado com AES-256-GCM no seu navegador, com uma chave que nasce da sua senha. O servidor guarda só a versão cifrada e as 10 versões anteriores. Por padrão há uma cópia da chave para recuperar a senha pelo e-mail; com a Proteção avançada essa cópia não existe." };
        return { resumo: "O Zo cria, consulta, edita e exclui transações, contas, categorias, recorrências e perfis, cuida das faturas de perfis, importa arquivos CSV e OFX do banco, categoriza em lote, faz resumos e tira dúvidas sobre o ZoZo. Antes de gravar, ele sempre pede a sua confirmação." };
      },
    };

    /* ---------------- gravação: resumo com os dados reais + confirmar() ---------------- */
    type Escrita = (a: Args) => Promise<ResultadoFerramentaZo>;
    // Lixeira temporal: cópia antes e depois de cada gravação (no serviço, só nesta aba); a janela recebe o marco para "Desfazer"
    // A confirmação vale UMA vez: chamar de novo devolve o mesmo resultado, sem gravar outra vez (nada de lançamento em dobro).
    // Conversa que já não vale (nova conversa, sair, consentimento retirado) não grava.
    const escrita = (titulo: string, linhas: Array<[string, string]>, executar: () => Promise<unknown>, desfazivel = true): ResultadoFerramentaZo => {
      let feito: Promise<string> | null = null;
      const uma = async (): Promise<string> => {
        if (!vigente()) return json({ cancelado: true, motivo: "a conversa mudou antes da confirmação" });
        const marco = desfazivel ? await req(A.abrirMarco).then((m) => m.marco, () => null) : null;
        try {
          const r = await executar();
          if (marco) await req(A.fecharMarco, { marco }).then(() => { if (opcoes.aoGravar) opcoes.aoGravar(titulo, marco); }, () => null);
          return json(Object.assign({ ok: true }, r && typeof r === "object" ? r : {}));
        } catch (e) {
          if (marco) req(A.descartarMarcos, { marco }).catch(() => null);
          return erroDe(e);
        }
      };
      return { tipo: "escrita", titulo, linhas, confirmar: () => (feito = feito || uma()) };
    };

    /** Transação: monta o pedido do serviço e as linhas do resumo (atual: a transação sendo editada) */
    async function transacao(a: Args, atual: LancamentoTela | null) {
      const [cs, ks, ps] = await Promise.all([contas(), categorias(), perfis()]);
      const t = typeof a.tipo === "string" && Object.hasOwn(TIPOS, a.tipo) ? TIPOS[a.tipo] : null;
      const ruins = [...datasRuins(a), ...(veio(a.tipo) && !t ? ["tipo"] : []), ...(veio(a.valor) && num(a.valor) === undefined ? ["valor"] : [])];
      const tipo = t ? t.tipo : atual ? atual.tipo : "regular";
      const l = {
        data: data(a.data) || (atual ? atual.data : hoje()), descricao: txt(a.descricao) || (atual ? atual.descricao : ""),
        valor: num(a.valor) !== undefined ? r2(num(a.valor) as number) : atual ? atual.valor : 0, tipo,
        contaId: (txt(a.conta_id, 64) || (atual && atual.contaId) || null) as Id | null,
        categoriaId: (txt(a.categoria_id, 64) || (atual && atual.categoriaId) || null) as Id | null,
        perfilId: (txt(a.perfil_id, 64) || (atual && atual.perfilId) || null) as Id | null,
        notas: a.notas !== undefined ? String(a.notas || "").slice(0, 500) : atual ? atual.notas || "" : "",
        recorrencia: atual && atual.tipo === "recorrente" ? atual.recorrencia : null,
        parcelaAtual: atual ? atual.parcelaAtual || null : null, parcelaTotal: atual ? atual.parcelaTotal || null : null,
        sentido: tipo === "interno" ? (t && t.sentido) || (atual && atual.sentido) || "saida" : null,
        debito: atual && atual.tipo === "recorrente" && atual.debito ? true : undefined,
      };
      const conta = cs.find((c) => c.id === l.contaId), cat = ks.find((c) => c.id === l.categoriaId), perfil = ps.find((p) => p.id === l.perfilId);
      const precisa: string[] = [];
      if (!l.descricao) precisa.push("descricao");
      if (!(l.valor > 0)) precisa.push("valor");
      if (!conta) precisa.push("conta_id");
      if (COM_CATEGORIA.includes(tipo) && !cat) precisa.push("categoria_id");
      if (opcoes.perfis() && !perfil && tipo !== "fatura") precisa.push("perfil_id");
      const rotuloTipo = t ? t.rotulo : tipo === "fatura" ? "Pagamento de fatura" : tipo === "recorrente" ? "Recorrente" : (Object.values(TIPOS).find((x) => x.tipo === tipo && (!x.sentido || x.sentido === l.sentido)) || { rotulo: tipo }).rotulo;
      const linhas: Array<[string, string]> = [["Tipo", rotuloTipo], ["Nome", l.descricao], ["Valor", F.moeda(l.valor)], ["Data", dataBr(l.data)], ["Conta", nomeConta(conta)]];
      if (cat) linhas.push(["Categoria", cat.nome]);
      if (perfil) linhas.push(["Perfil", perfil.nome]);
      if (l.notas) linhas.push(["Observação", l.notas]);
      return { l, precisa, linhas, ruins };
    }

    const ESCRITA: Record<string, Escrita> = {
      criar_transacao: async (a) => {
        const { l, precisa, linhas, ruins } = await transacao(a, null);
        const parcelas = int(a.parcelas, 2, 999), freq = typeof a.recorrencia === "string" && FREQ.includes(a.recorrencia) ? a.recorrencia : undefined;
        if (veio(a.parcelas) && !parcelas) ruins.push("parcelas");
        if (veio(a.recorrencia) && !freq) ruins.push("recorrencia");
        if (ruins.length) return invalidos(ruins);
        if (parcelas && freq) return invalidos(["parcelas", "recorrencia"], "Ou parcelado ou recorrente, não os dois. Pergunte à pessoa qual dos dois.");
        if (!(typeof a.tipo === "string" && Object.hasOwn(TIPOS, a.tipo))) precisa.push("tipo");
        if (precisa.length) return faltam(precisa);
        if ((parcelas || freq) && !RECORRIVEIS.includes(l.tipo)) return invalidos(["tipo", parcelas ? "parcelas" : "recorrencia"], SO_DESPESA);
        if (parcelas) linhas.splice(2, 1, ["Valor", F.moeda(l.valor) + " em " + parcelas + "x"]);
        if (freq) linhas.push(["Repete", (ZoZo.servico.FREQUENCIAS[freq] || { rotulo: freq }).rotulo]);
        // criar e repetir (ou parcelar) numa gravação só: se uma parte falha, nada fica gravado
        return escrita("Criar transação", linhas, () => lote((x) => {
          const { lancamento } = x(A.createLancamento, { lancamento: l });
          if (parcelas) x(A.tornarRecorrente, { id: lancamento.id, recorrencia: "parcelada", parcelaAtual: 1, parcelaTotal: parcelas, valorTotal: l.valor });
          else if (freq) x(A.tornarRecorrente, { id: lancamento.id, recorrencia: freq });
          return { id: lancamento.id };
        }));
      },
      editar_transacao: async (a) => {
        const atual = (await lancamentos()).find((x) => x.id === a.id);
        if (!atual) return { tipo: "leitura", resultado: json({ erro: "transacao_nao_encontrada" }) };
        if (atual.tipo === "fatura" && a.tipo !== undefined) return { tipo: "leitura", resultado: json({ erro: "PAYMENT_TYPE_LOCKED", mensagem: ZoZo.messages.FRIENDLY.PAYMENT_TYPE_LOCKED }) };
        const { l, precisa, linhas, ruins } = await transacao(a, atual);
        const freq = typeof a.recorrencia === "string" && FREQ.includes(a.recorrencia) ? a.recorrencia : undefined;
        if (veio(a.recorrencia) && !freq) ruins.push("recorrencia");
        if (ruins.length) return invalidos(ruins);
        if (precisa.length) return faltam(precisa);
        if (freq && !RECORRIVEIS.includes(l.tipo)) return invalidos(["tipo", "recorrencia"], SO_DESPESA);
        if (freq) linhas.push(["Repete", (ZoZo.servico.FREQUENCIAS[freq] || { rotulo: freq }).rotulo]);
        // o cartão mostra a transação como estava: se ela mudou até a confirmação (outra tela, outra aba), nada é gravado
        const base = marcaLanc(atual);
        return escrita("Editar transação", linhas, () => lote((x) => {
          const agora = x(A.getLancamentos).lancamentos.find((y) => y.id === atual.id);
          if (!agora || marcaLanc(agora) !== base) throw vencida();
          x(A.updateLancamento, { id: atual.id, lancamento: l });
          if (freq) x(A.tornarRecorrente, { id: atual.id, recorrencia: freq });
          return { id: atual.id };
        }));
      },
      excluir_transacao: async (a) => {
        const atual = (await lancamentos()).find((x) => x.id === a.id);
        if (!atual) return { tipo: "leitura", resultado: json({ erro: "transacao_nao_encontrada" }) };
        const base = marcaLanc(atual);
        return escrita("Excluir transação", [["Nome", atual.descricao], ["Valor", F.moeda(atual.valor)], ["Data", dataBr(atual.data)], ["Conta", atual.nomeConta || "Sem conta"]],
          () => lote((x) => {
            const agora = x(A.getLancamentos).lancamentos.find((y) => y.id === atual.id);
            if (!agora || marcaLanc(agora) !== base) throw vencida();
            return x(A.deleteLancamento, { id: atual.id });
          }));
      },
      excluir_conta: async (a) => {
        const c = (await contas()).find((x) => x.id === a.id);
        if (!c) return { tipo: "leitura", resultado: json({ erro: "conta_nao_encontrada" }) };
        const n = (await lancamentos()).filter((l) => l.contaId === c.id).length;
        return escrita("Excluir conta", [["Nome", c.nome + (c.ultimos4Digitos ? " " + c.ultimos4Digitos : "")], ["Tipo", TIPOS_CONTA[c.tipo] || c.tipo],
          ["Transações", n ? n + " continuam, sem conta" : "nenhuma"]], () => req(A.deleteConta, { id: c.id }));
      },
      excluir_categoria: async (a) => {
        const k = (await categorias()).find((x) => x.id === a.id);
        if (!k) return { tipo: "leitura", resultado: json({ erro: "categoria_nao_encontrada" }) };
        const n = (await lancamentos()).filter((l) => l.categoriaId === k.id).length;
        return escrita("Excluir categoria", [["Nome", (k.icone ? k.icone + " " : "") + k.nome],
          ["Transações", n ? n + " vão para a categoria Outros" : "nenhuma"], ["Orçamentos", "O histórico de orçamentos dela é apagado"]],
          () => req(A.deleteCategoria, { id: k.id }));
      },
      excluir_perfil: async (a) => {
        if (!opcoes.perfis()) return { tipo: "leitura", resultado: json({ erro: "FEATURE_UNAVAILABLE", mensagem: ZoZo.messages.FRIENDLY.FEATURE_UNAVAILABLE }) };
        const p = (await req(A.getPerfis)).perfis.find((x) => x.id === a.id);
        if (!p) return { tipo: "leitura", resultado: json({ erro: "perfil_nao_encontrado" }) };
        const n = (await lancamentos()).filter((l) => l.perfilId === p.id).length;
        return escrita("Excluir perfil", [["Nome", p.nome], ["Transações", n ? n + " ficam sem perfil" : "nenhuma"], ["Faturas", "As faturas deste perfil são apagadas"]],
          () => req(A.deletePerfil, { id: p.id }));
      },
      criar_conta: async (a) => {
        const nome = txt(a.nome), tipo = typeof a.tipo === "string" && Object.hasOwn(TIPOS_CONTA, a.tipo) ? a.tipo : undefined;
        if (!nome || !tipo) return faltam([!nome ? "nome" : "", !tipo ? "tipo" : ""].filter(Boolean));
        const fech = int(a.fechamento, 1, 31), venc = int(a.vencimento, 1, 31), dig = txt(a.ultimos4, 4);
        if (tipo === "cartao" && !!fech !== !!venc) return faltam([fech ? "vencimento" : "fechamento"]);
        if (veio(a.saldo) && num(a.saldo) === undefined) return invalidos(["saldo"]);
        // saldo com sinal: -500 aparece como -R$ 500,00 (antes o cartão mostrava R$ 500,00 e gravava -500)
        const linhas: Array<[string, string]> = [["Nome", nome], ["Tipo", TIPOS_CONTA[tipo]], ["Saldo", F.moeda(num(a.saldo) || 0, { comSinal: true })]];
        if (dig) linhas.push(["4 últimos dígitos", dig]);
        if (fech && venc) linhas.push(["Fechamento e vencimento", "dia " + fech + " e dia " + venc]);
        return escrita("Criar conta", linhas, () => req(A.createConta, { conta: { nome, tipo, saldo: r2(num(a.saldo) || 0), ultimos4Digitos: dig || "",
          fechamento: tipo === "cartao" ? fech : undefined, vencimento: tipo === "cartao" ? venc : undefined } }).then((r) => ({ id: r.conta.id })));
      },
      editar_conta: async (a) => {
        const c = (await contas()).find((x) => x.id === a.id);
        if (!c) return { tipo: "leitura", resultado: json({ erro: "conta_nao_encontrada" }) };
        const nome = txt(a.nome), dig = a.ultimos4 === "" ? "" : txt(a.ultimos4, 4), fech = int(a.fechamento, 1, 31), venc = int(a.vencimento, 1, 31);
        if (!!fech !== !!venc) return faltam([fech ? "vencimento" : "fechamento"]);
        if ((fech || venc) && c.tipo !== "cartao") return { tipo: "leitura", resultado: json({ erro: "fechamento_so_em_cartao" }) };
        const linhas: Array<[string, string]> = [["Conta", nomeConta(c)]];
        if (nome) linhas.push(["Novo nome", nome]);
        if (dig !== undefined) linhas.push(["4 últimos dígitos", dig || "sem dígitos"]);
        if (fech && venc) linhas.push(["Fechamento e vencimento", "dia " + fech + " e dia " + venc + ", todos os meses"]);
        if (linhas.length === 1) return faltam(["nome", "ultimos4", "fechamento"]);
        const base = marcaConta(c);
        return escrita("Editar conta", linhas, () => lote((x) => {
          const agora = x(A.getContas).contas.find((y) => y.id === c.id);
          if (!agora || marcaConta(agora) !== base) throw vencida();
          if (nome) x(A.updateConta, { id: c.id, nome });
          if (dig !== undefined) x(A.updateConta, { id: c.id, ultimos4Digitos: dig });
          if (fech && venc) x(A.updateCicloCartao, { id: c.id, fechamento: String(fech), vencimento: String(venc), modo: "fixo" });
          return { id: c.id };
        }));
      },
      criar_categoria: async (a) => {
        const nome = txt(a.nome, 50);
        if (!nome) return faltam(["nome"]);
        const icone = txt(a.icone, 8), c = cor(a.cor), orc = num(a.orcamento);
        const linhas: Array<[string, string]> = [["Nome", (icone ? icone + " " : "") + nome]];
        if (orc && orc > 0) linhas.push(["Orçamento por mês", F.moeda(orc)]);
        return escrita("Criar categoria", linhas, () => req(A.createCategoria, { categoria: { nome, icone, cor: c, reservado: orc && orc > 0 ? r2(orc) : 0 } })
          .then((r) => ({ id: r.categoria.id })));
      },
      editar_categoria: async (a) => {
        const c = (await categorias()).find((x) => x.id === a.id);
        if (!c) return { tipo: "leitura", resultado: json({ erro: "categoria_nao_encontrada" }) };
        const nome = txt(a.nome, 50), icone = txt(a.icone, 8), nova = cor(a.cor), orc = num(a.orcamento);
        const mensal = a.tipo_orcamento === "mensal", mes = mesVal(a.mes) || mesAtual();
        const linhas: Array<[string, string]> = [["Categoria", c.nome]];
        if (nome) linhas.push(["Novo nome", nome]);
        if (icone) linhas.push(["Ícone", icone]);
        if (nova) linhas.push(["Cor", nova]);
        if (orc !== undefined && orc >= 0) linhas.push(["Orçamento", F.moeda(orc) + (mensal ? " só em " + mes.slice(5, 7) + "/" + mes.slice(0, 4) : " todos os meses")]);
        if (linhas.length === 1) return faltam(["nome", "icone", "cor", "orcamento"]);
        const base = marcaCat(c);
        return escrita("Editar categoria", linhas, () => lote((x) => {
          const agora = x(A.getCategorias).categorias.find((y) => y.id === c.id);
          if (!agora || marcaCat(agora) !== base) throw vencida();
          if (nome || icone || nova) x(A.updateCategoria, { id: c.id, categoria: { nome: nome || c.nome, icone: icone || c.icone, cor: nova || c.cor,
            grupo: c.grupo, reservado: c.reservadoFixo, status: c.status } });
          if (orc !== undefined && orc >= 0) x(A.updateCategoria, mensal ? { id: c.id, orcamentoMes: { mes, valor: r2(orc) } } : { id: c.id, reservado: r2(orc), modoOrcamento: "fixo" });
          return { id: c.id };
        }));
      },
      salvar_ajustes_fatura: async (a) => {
        if (!fatura()) return indisponivel();
        const p = (await perfis()).find((x) => x.id === a.perfil_id);
        if (!p) return faltam(["perfil_id"]);
        const m = doMes(a.mes);
        const atual = await req(A.getBoletoData, { perfilId: p.id, mes: m.mes, ano: m.ano });
        const novos = { contribuicoes: lerAjustes(a.contribuicoes), descontos: lerAjustes(a.descontos), arredondamentos: lerAjustes(a.arredondamentos) };
        if (!novos.contribuicoes && !novos.descontos && !novos.arredondamentos) return faltam(["contribuicoes", "descontos", "arredondamentos"]);
        const final = { contribuicoes: novos.contribuicoes || atual.ajustes.contribuicoes, descontos: novos.descontos || atual.ajustes.descontos,
          arredondamentos: novos.arredondamentos || atual.ajustes.arredondamentos };
        const lista = (l: Array<{ descricao: string; valor: number }>) => (l.length ? l.map((x) => (x.descricao || "Sem nome") + " " + F.moeda(x.valor, { comSinal: true })).join(", ") : "nenhum");
        const base = marca(atual.ajustes);
        return escrita("Ajustes da fatura", [["Perfil", p.nome], ["Fatura de", m.texto.slice(5, 7) + "/" + m.texto.slice(0, 4)],
          ["Contribuições", lista(final.contribuicoes)], ["Descontos", lista(final.descontos)], ["Arredondamentos", lista(final.arredondamentos)]],
        () => lote((x) => {
          if (marca(x(A.getBoletoData, { perfilId: p.id, mes: m.mes, ano: m.ano }).ajustes) !== base) throw vencida();
          return x(A.salvarFatura, Object.assign({ perfilId: p.id, mes: m.mes, ano: m.ano }, final));
        }));
      },
      registrar_pagamento_recebido: async (a) => {
        if (!fatura()) return indisponivel();
        const [ps, cs] = await Promise.all([perfis(), contas()]);
        const p = ps.find((x) => x.id === a.perfil_id), c = cs.find((x) => x.id === a.conta_id), valor = num(a.valor);
        const precisa = [!p ? "perfil_id" : "", !c ? "conta_id" : "", !(valor && valor > 0) ? "valor" : ""].filter(Boolean);
        if (precisa.length || !p || !c || !valor) return faltam(precisa);
        const m = doMes(a.mes), dia = data(a.data) || hoje();
        return escrita("Pagamento recebido", [["Perfil", p.nome], ["Fatura de", m.texto.slice(5, 7) + "/" + m.texto.slice(0, 4)], ["Valor", F.moeda(valor)],
          ["Entrou em", nomeConta(c)], ["Data", dataBr(dia)]],
        () => req(A.receberFatura, { perfilId: p.id, mes: m.mes, ano: m.ano, contaId: c.id, valor: r2(valor), data: dia }).then((r) => ({ id: r.lancamento.id })));
      },
      configurar: async (a) => {
        const multi = typeof a.multicambio === "boolean" ? a.multicambio : undefined, orc = typeof a.orcamento === "boolean" ? a.orcamento : undefined;
        if (multi === undefined && orc === undefined) return faltam(["multicambio", "orcamento"]);
        const linhas: Array<[string, string]> = [];
        if (multi !== undefined) linhas.push(["Multicâmbio", multi ? "Ligar" : "Desligar (tudo volta ao Real, nada é apagado)"]);
        if (orc !== undefined) linhas.push(["Orçamento", orc ? "Ligar" : "Desligar"]);
        const pedido: Record<string, boolean> = {};
        if (multi !== undefined) pedido.multicambio = multi;
        if (orc !== undefined) pedido.orcamentoAtivo = orc;
        return escrita("Configurações", linhas, () => req(A.updateConfig, pedido).then(() => ({})));
      },
      remover_pix: async () => {
        if (!(await req(A.getConfig)).pix) return { tipo: "leitura", resultado: json({ erro: "pix_nao_cadastrado" }) };
        return escrita("Remover chave Pix", [["Chave Pix", "A chave cadastrada sai das faturas"]], () => req(A.updateConfig, { pix: null }).then(() => ({})));
      },
      transferir_entre_moedas: async (a) => {
        if (!cambio()) return indisponivel();
        const destino = typeof a.destino === "string" && ["BRL", "EUR", "USD"].includes(a.destino) ? a.destino : undefined;
        const ids = Array.isArray(a.ids) ? a.ids.filter((x): x is string => typeof x === "string").slice(0, 200) : [];
        if (!destino || !ids.length) return faltam([!destino ? "destino" : "", !ids.length ? "ids" : ""].filter(Boolean));
        if (!(await req(A.getConfig)).multicambio) return { tipo: "leitura", resultado: json({ erro: "multicambio_desligado" }) };
        const achadas = (await lancamentos()).filter((l) => ids.includes(l.id));
        if (!achadas.length) return { tipo: "leitura", resultado: json({ erro: "transacoes_nao_encontradas" }) };
        const nomes = achadas.slice(0, 5).map((l) => l.descricao).join(", ") + (achadas.length > 5 ? " e mais " + (achadas.length - 5) : "");
        return escrita("Levar para outra moeda", [["Transações", nomes], ["Para", { BRL: "Real", EUR: "Euro", USD: "Dólar" }[destino] || destino],
          ["Atenção", "Parcelas, recorrências e divisões vão inteiras. O valor fica igual, sem conversão."]],
        () => req(A.transferirMoeda, { ids: achadas.map((l) => l.id), destino }));
      },
      categorizar_em_lote: async (a) => {
        // sem categoria e de um tipo que usa categoria (despesa, estorno, débito, recorrente); nunca pagamento de fatura
        const de = data(a.de), ate = data(a.ate);
        const sem = (await lancamentos()).filter((l) => !l.categoriaId && COM_CATEGORIA.includes(l.tipo) && (!de || l.data >= de) && (!ate || l.data <= ate)).slice(0, 500);
        if (!sem.length) return { tipo: "leitura", resultado: json({ sem_categoria: 0 }) };
        const r = await req(A.sugerirCategorias, { descricoes: sem.map((l) => l.descricao) });
        const grupos = new Map<Id, { nome: string; ids: Id[]; exemplos: string[] }>();
        let semSugestao = 0;
        sem.forEach((l, i) => {
          const s = r.sugestoes[i];
          if (!s || !s.categoriaId || !s.nome) { semSugestao += 1; return; }
          const g = grupos.get(s.categoriaId) || { nome: s.nome, ids: [], exemplos: [] };
          g.ids.push(l.id);
          if (g.exemplos.length < 3 && !g.exemplos.includes(l.descricao)) g.exemplos.push(l.descricao);
          grupos.set(s.categoriaId, g);
        });
        if (!grupos.size) return { tipo: "leitura", resultado: json({ sem_categoria: sem.length, com_sugestao: 0 }) };
        const linhas: Array<[string, string]> = [...grupos.values()].slice(0, 12).map((g) => [g.nome, g.exemplos.join(", ") + (g.ids.length > g.exemplos.length ? " e mais " + (g.ids.length - g.exemplos.length) : "")]);
        if (grupos.size > 12) linhas.push(["E mais", (grupos.size - 12) + " categorias"]);
        if (semSugestao) linhas.push(["Sem sugestão", semSugestao + " ficam como estão"]);
        const n = sem.length - semSugestao;
        // todos os grupos numa gravação só; o que ganhou categoria depois do cartão não é trocado (fica de fora)
        return escrita("Categorizar " + n + (n === 1 ? " transação" : " transações"), linhas, () => lote((x) => {
          const aindaSem = new Set(x(A.getLancamentos).lancamentos.filter((l) => !l.categoriaId).map((l) => l.id));
          let feitas = 0;
          for (const [categoriaId, g] of grupos) {
            const ids = g.ids.filter((id) => aindaSem.has(id));
            if (ids.length) { x(A.updateLancamentosEmLote, { ids, categoriaId }); feitas += ids.length; }
          }
          return { categorizadas: feitas, sem_sugestao: semSugestao, ja_tinham_categoria: n - feitas };
        }));
      },
      exportar_transacoes: async () => {
        const tela = opcoes.tela;
        if (!tela) return semTela();
        return escrita("Exportar transações", [["Arquivo", "CSV com todas as transações"], ["Atenção", "O arquivo não é cifrado. Guarde em local seguro."]],
          () => tela.exportar().then(() => ({})), false);
      },
      sair: async () => {
        const tela = opcoes.tela;
        if (!tela) return semTela();
        return escrita("Sair da conta", [["Neste aparelho", "A sessão termina e a senha será pedida de novo"]], () => { tela.sair(); return Promise.resolve({}); }, false);
      },
      criar_perfil: async (a) => {
        if (!opcoes.perfis()) return { tipo: "leitura", resultado: json({ erro: "FEATURE_UNAVAILABLE", mensagem: ZoZo.messages.FRIENDLY.FEATURE_UNAVAILABLE }) };
        const nome = txt(a.nome, 50);
        if (!nome) return faltam(["nome"]);
        return escrita("Criar perfil", [["Nome", nome]], () => req(A.createPerfil, { perfil: { nome, cor: cor(a.cor) } }).then((r) => ({ id: r.perfil.id })));
      },
      editar_perfil: async (a) => {
        if (!opcoes.perfis()) return { tipo: "leitura", resultado: json({ erro: "FEATURE_UNAVAILABLE", mensagem: ZoZo.messages.FRIENDLY.FEATURE_UNAVAILABLE }) };
        const p = (await perfis()).find((x) => x.id === a.id);
        if (!p) return { tipo: "leitura", resultado: json({ erro: "perfil_nao_encontrado" }) };
        const nome = txt(a.nome, 50), nova = cor(a.cor);
        if (!nome && !nova) return faltam(["nome", "cor"]);
        const linhas: Array<[string, string]> = [["Perfil", p.nome]];
        if (nome) linhas.push(["Novo nome", nome]);
        if (nova) linhas.push(["Cor", nova]);
        const base = marca([p.nome, p.cor || null]);
        return escrita("Editar perfil", linhas, () => lote((x) => {
          const agora = x(A.getPerfis).perfis.find((y) => y.id === p.id);
          if (!agora || marca([agora.nome, agora.cor || null]) !== base) throw vencida();
          if (nome) x(A.updatePerfil, { id: p.id, nome });
          if (nova) x(A.updatePerfil, { id: p.id, cor: nova });
          return { id: p.id };
        }));
      },
    };

    const SEM_VERIFICACAO = { erro: "VERIFICACAO_NECESSARIA", mensagem: "Sem a verificação em duas etapas, excluir, exportar, mudar de moeda e as ações de conta pelo Zo pedem a biometria. Cadastre em Configurações › Segurança ou ative o 2FA." };
    const VERIFICACAO_NEGADA = { erro: "VERIFICACAO_NEGADA", mensagem: "A biometria não foi confirmada. Nada foi feito." };
    /** Telas das Configurações que o Zo só abre depois de confirmar a identidade (conta sem 2FA) */
    const TELAS_PROTEGIDAS: ReadonlySet<string> = new Set(["senha", "apagar_dados", "excluir_conta", "pix"]);
    const ASSUNTOS: Record<string, { aba: "geral" | "conta" | "seguranca"; onde: string }> = {
      senha: { aba: "conta", onde: "Alterar senha" }, dois_fatores: { aba: "seguranca", onde: "Verificação em duas etapas" },
      protecao_avancada: { aba: "seguranca", onde: "Proteção avançada" }, apagar_dados: { aba: "conta", onde: "Apagar todos os dados" },
      excluir_conta: { aba: "conta", onde: "Excluir conta" }, pix: { aba: "geral", onde: "PIX" }, geral: { aba: "geral", onde: "Geral" },
    };
    const TELA: Record<string, (a: Args) => Promise<unknown>> = {
      abrir_fatura: async (a) => {
        if (!fatura()) return { erro: "FEATURE_UNAVAILABLE" };
        const m = doMes(a.mes);
        (opcoes.tela as TelaZo).abrirFatura({ perfilId: txt(a.perfil_id, 64) || null, cartaoId: txt(a.cartao_id, 64) || "todos", mes: m.mes, ano: m.ano });
        return { aberta: true, dica: "Para imprimir, toque em Imprimir na tela da fatura" };
      },
      filtrar_transacoes: async (a) => {
        const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 50) : []);
        const periodo = typeof a.periodo === "string" && ["semana", "semanaPassada", "mes", "mesPassado", "ultimos30", "ano", "anoPassado", "ultimos365"].includes(a.periodo) ? a.periodo : null;
        const tipos = ids(a.tipos).filter((x) => ["regular", "estorno", "receita", "debito", "interno", "recorrente", "fatura"].includes(x));
        (opcoes.tela as TelaZo).filtrar({ contas: ids(a.conta_ids), categorias: ids(a.categoria_ids), perfis: ids(a.perfil_ids), tipos, periodo }, txt(a.texto) || "");
        return { aberta: true };
      },
      abrir_configuracoes: async (a) => {
        const assunto = typeof a.assunto === "string" && Object.hasOwn(ASSUNTOS, a.assunto) ? ASSUNTOS[a.assunto] : ASSUNTOS.geral;
        // trocar a senha, apagar os dados, excluir a conta e mexer no Pix: sem 2FA, a biometria antes de abrir a tela
        // (lá dentro continuam a senha, a frase e o código de sempre)
        if (typeof a.assunto === "string" && TELAS_PROTEGIDAS.has(a.assunto)) {
          const v = await (opcoes.tela as TelaZo).verificarIdentidade().catch(() => "negado" as const);
          if (v !== "ok") return v === "sem_metodo" ? SEM_VERIFICACAO : VERIFICACAO_NEGADA;
        }
        (opcoes.tela as TelaZo).abrirConfiguracoes(assunto.aba);
        return { aberta: true, aba: assunto.aba === "conta" ? "Conta" : "Geral", item: assunto.onde };
      },
    };

    /**
     * Ações sem volta e relatórios: conta sem 2FA confirma com a biometria (o servidor confere a assinatura) antes de
     * gravar ou gerar o arquivo. Sem tela para pedir a confirmação, nada roda (falha fechada).
     */
    const PROTEGIDAS: ReadonlySet<string> = new Set(["excluir_transacao", "excluir_conta", "excluir_categoria", "excluir_perfil", "remover_pix",
      "transferir_entre_moedas", "exportar_transacoes"]);
    function protegida(r: ResultadoFerramentaZo): ResultadoFerramentaZo {
      if (r.tipo !== "escrita") return r;
      const tela = opcoes.tela, original = r.confirmar;
      return Object.assign({}, r, { confirmar: async () => {
        const v = tela ? await tela.verificarIdentidade().catch(() => "negado" as const) : "negado";
        // a biometria pode levar minutos: se a conversa acabou nesse meio tempo, nada é gravado
        if (v === "ok" && !vigente()) return json({ cancelado: true, motivo: "a conversa mudou antes da confirmação" });
        if (v === "ok") return original();
        return json(v === "sem_metodo" ? SEM_VERIFICACAO : VERIFICACAO_NEGADA);
      } });
    }

    /** Executa uma chamada do Zo. Ferramenta fora da lista ou argumentos ilegíveis viram erro (nada roda). */
    async function executar(nome: string, argumentos: string, problemas?: string[]): Promise<ResultadoFerramentaZo> {
      // fora do esquema (o servidor conferiu): não executa; o Zo corrige ou pergunta à pessoa
      if (problemas && problemas.length) return invalidos(problemas.slice(0, 10).map((p) => String(p).slice(0, 80)));
      const a = ler(argumentos);
      const datas = datasRuins(a);
      if (datas.length && nome !== "oferecer_opcoes") return invalidos(datas, "Data ou mês que não existe. Nada foi feito. Confira com a pessoa.");
      try {
        if (nome === "importar_arquivo") return { tipo: "arquivo" };
        if (nome === "oferecer_opcoes") {
          const opcoesLista = Array.isArray(a.opcoes) ? a.opcoes.map((o) => txt(o, 80)).filter((o): o is string => !!o).slice(0, 12) : [];
          return { tipo: "opcoes", pergunta: txt(a.pergunta) || "", opcoes: opcoesLista };
        }
        if (Object.hasOwn(LEITURA, nome)) return { tipo: "leitura", resultado: json(await LEITURA[nome](a)) };
        if (Object.hasOwn(TELA, nome)) return opcoes.tela ? { tipo: "leitura", resultado: json(await TELA[nome](a)) } : semTela();
        if (Object.hasOwn(ESCRITA, nome)) return PROTEGIDAS.has(nome) ? protegida(await ESCRITA[nome](a)) : await ESCRITA[nome](a);
        return { tipo: "leitura", resultado: json({ erro: "ferramenta_desconhecida" }) };
      } catch (e) { return { tipo: "leitura", resultado: erroDe(e) }; }
    }
    return { executar, nomes: Object.keys(LEITURA).concat(Object.keys(ESCRITA), Object.keys(TELA), ["oferecer_opcoes", "importar_arquivo"]) };
  }

  const api: ZoZoZoFerramentas = { criar };
  ZoZo.zoFerramentas = api;
})(window.ZoZo);
