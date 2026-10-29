/* =============================================================
   ZoZo — Zo, o assistente: as ferramentas (rodam AQUI, no navegador)
   ------------------------------------------------------------
   O modelo (Gemini, pela API do ZoZo) só ESCOLHE uma ferramenta e preenche os argumentos. Quem lê e grava é o
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
  const json = (v: unknown) => { const s = JSON.stringify(v); return s.length > LIMITE_RESULTADO ? s.slice(0, LIMITE_RESULTADO) + "…(cortado)" : s; };
  const norm = (t: unknown) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const dataBr = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4);

  /** Faltou algo obrigatório: o Zo recebe a lista e pergunta à pessoa (nada é gravado) */
  const faltam = (campos: string[]): ResultadoFerramentaZo => ({ tipo: "leitura", resultado: json({ erro: "faltam_dados", campos }) });
  const erroDe = (e: unknown) => {
    const x = e as Partial<ErroPonte> | null;
    return json({ erro: (x && x.code) || "OPERATION_FAILED", mensagem: (x && x.friendly) || ZoZo.messages.FRIENDLY.OPERATION_FAILED });
  };

  function criar(req: PedidoZo, opcoes: OpcoesFerramentasZo): ZoZoZoFerramentasInstancia {
    const fatura = () => (opcoes.fatura ? opcoes.fatura() : false), cambio = () => (opcoes.cambio ? opcoes.cambio() : false);
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
      listar_contas: async () => (await contas()).map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo, saldo: c.valor, ultimos4: c.ultimos4Digitos || undefined,
        fechamento: c.fechamento || undefined, vencimento: c.vencimento || undefined, oculta: c.oculta || undefined })),
      listar_categorias: async () => (await categorias()).filter((c) => c.status === "regular")
        .map((c) => ({ id: c.id, nome: c.nome, icone: c.icone, orcamento_mes: c.reservado, gasto_mes: c.gasto, grupo: c.grupo || undefined })),
      listar_perfis: async () => (await perfis()).map((p) => ({ id: p.id, nome: p.nome })),
      listar_recorrencias: async () => {
        const r = await req(A.getRecorrencias);
        return r.recorrencias.concat(r.proximas || []).map((o) => ({ serie_id: o.serieId, descricao: o.descricao, valor: o.valor, data: o.data,
          frequencia: o.tipoRecorrencia, parcela: o.parcela ? o.parcela + "/" + o.parcelaTotal : undefined, pago: o.pago, categoria: o.categoria ? o.categoria.nome : undefined }));
      },
      buscar_transacoes: async (a) => {
        const texto = norm(txt(a.texto)), de = data(a.de), ate = data(a.ate), limite = int(a.limite, 1, 50) || 20;
        const lista = (await lancamentos()).filter((l) => (!texto || norm(l.descricao).includes(texto) || norm(l.notas).includes(texto))
          && (!de || l.data >= de) && (!ate || l.data <= ate) && (!a.conta_id || l.contaId === a.conta_id) && (!a.categoria_id || l.categoriaId === a.categoria_id)
          && (!a.perfil_id || l.perfilId === a.perfil_id) && (!a.tipo || l.tipo === a.tipo));
        return { total_encontrado: lista.length, transacoes: lista.slice(0, limite).map((l) => ({ id: l.id, data: l.data, descricao: l.descricao, valor: l.valor,
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
        return { mes, gasto: r2(doMes.reduce((s, l) => s + (T.gasto[l.tipo] || 0) * l.valor, 0)),
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
        const d = await req(A.getBoletoData, { perfilId, cartaoId, mes: m.mes, ano: m.ano });
        const recebido = d.recebimentos.reduce((s, l) => s + l.valor, 0);
        const t = ZoZo.servico.calcularFatura(Object.assign({}, d.ajustes, { lancamentos: d.lancamentos, saldoAnterior: d.saldoAnterior, recebido }));
        return { mes: m.texto, perfil: d.todos ? "todos" : d.perfil ? d.perfil.nome : null, so_consulta: d.consulta,
          transacoes: d.lancamentos.slice(0, 50).map((l) => ({ data: l.data, descricao: l.descricao, valor: l.valor, tipo: l.tipo, cartao: l.nomeConta || undefined })),
          quantidade: d.lancamentos.length, total_transacoes: t.lancamentos, contribuicoes: t.contribuicoes, descontos: t.descontos,
          arredondamentos: t.arredondamentos, saldo_anterior: t.saldoAnterior, recebido: t.recebido, a_pagar: t.aPagar,
          ajustes: d.consulta ? undefined : d.ajustes, periodos: d.periodos.map((p) => ({ cartao: p.nome, de: p.inicio, ate: p.fim })) };
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
        if (assunto === "privacidade") return { endereco: "/politica-privacidade", resumo: "Os dados financeiros são cifrados no seu navegador. O ZoZo não vende dados nem usa publicidade. Com o Zo, que está em fase de testes, as mensagens e trechos dos dados vão ao Gemini, do Google, com o seu consentimento, e nesta fase o Google pode usar esse conteúdo para melhorar os produtos dele." };
        if (assunto === "armazenamento") return { resumo: "Os dados financeiros ficam num documento cifrado com AES-256-GCM no seu navegador, com uma chave que nasce da sua senha. O servidor guarda só a versão cifrada e as 10 versões anteriores. Por padrão há uma cópia da chave para recuperar a senha pelo e-mail; com a Proteção avançada essa cópia não existe." };
        return { resumo: "O Zo cria, consulta, edita e exclui transações, contas, categorias, recorrências e perfis, cuida das faturas de perfis, importa arquivos CSV e OFX do banco, categoriza em lote, faz resumos e tira dúvidas sobre o ZoZo. Antes de gravar, ele sempre pede a sua confirmação." };
      },
    };

    /* ---------------- gravação: resumo com os dados reais + confirmar() ---------------- */
    type Escrita = (a: Args) => Promise<ResultadoFerramentaZo>;
    const escrita = (titulo: string, linhas: Array<[string, string]>, executar: () => Promise<unknown>): ResultadoFerramentaZo =>
      ({ tipo: "escrita", titulo, linhas, confirmar: () => executar().then((r) => json(Object.assign({ ok: true }, r && typeof r === "object" ? r : {})), (e) => erroDe(e)) });

    /** Transação: monta o pedido do serviço e as linhas do resumo (atual: a transação sendo editada) */
    async function transacao(a: Args, atual: LancamentoTela | null) {
      const [cs, ks, ps] = await Promise.all([contas(), categorias(), perfis()]);
      const t = typeof a.tipo === "string" && Object.hasOwn(TIPOS, a.tipo) ? TIPOS[a.tipo] : null;
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
      return { l, precisa, linhas };
    }

    const ESCRITA: Record<string, Escrita> = {
      criar_transacao: async (a) => {
        const { l, precisa, linhas } = await transacao(a, null);
        if (!(typeof a.tipo === "string" && Object.hasOwn(TIPOS, a.tipo))) precisa.push("tipo");
        if (precisa.length) return faltam(precisa);
        const parcelas = int(a.parcelas, 2, 999), freq = typeof a.recorrencia === "string" && FREQ.includes(a.recorrencia) ? a.recorrencia : undefined;
        if (parcelas) linhas.splice(2, 1, ["Valor", F.moeda(l.valor) + " em " + parcelas + "x"]);
        if (freq) linhas.push(["Repete", (ZoZo.servico.FREQUENCIAS[freq] || { rotulo: freq }).rotulo]);
        return escrita("Criar transação", linhas, async () => {
          const { lancamento } = await req(A.createLancamento, { lancamento: l });
          if (parcelas || freq) {
            // parcelado pelo valor TOTAL (o ZoZo divide) ou recorrente; se falhar, a transação criada sai (nada pela metade)
            try { await req(A.tornarRecorrente, parcelas ? { id: lancamento.id, recorrencia: "parcelada", parcelaAtual: 1, parcelaTotal: parcelas, valorTotal: l.valor } : { id: lancamento.id, recorrencia: freq }); }
            catch (e) { await req(A.deleteLancamento, { id: lancamento.id }).catch(() => null); throw e; }
          }
          return { id: lancamento.id };
        });
      },
      editar_transacao: async (a) => {
        const atual = (await lancamentos()).find((x) => x.id === a.id);
        if (!atual) return { tipo: "leitura", resultado: json({ erro: "transacao_nao_encontrada" }) };
        if (atual.tipo === "fatura" && a.tipo !== undefined) return { tipo: "leitura", resultado: json({ erro: "PAYMENT_TYPE_LOCKED", mensagem: ZoZo.messages.FRIENDLY.PAYMENT_TYPE_LOCKED }) };
        const { l, precisa, linhas } = await transacao(a, atual);
        if (precisa.length) return faltam(precisa);
        const freq = typeof a.recorrencia === "string" && FREQ.includes(a.recorrencia) ? a.recorrencia : undefined;
        if (freq) linhas.push(["Repete", (ZoZo.servico.FREQUENCIAS[freq] || { rotulo: freq }).rotulo]);
        return escrita("Editar transação", linhas, async () => {
          await req(A.updateLancamento, { id: atual.id, lancamento: l });
          if (freq) await req(A.tornarRecorrente, { id: atual.id, recorrencia: freq });
          return { id: atual.id };
        });
      },
      excluir_transacao: async (a) => {
        const atual = (await lancamentos()).find((x) => x.id === a.id);
        if (!atual) return { tipo: "leitura", resultado: json({ erro: "transacao_nao_encontrada" }) };
        return escrita("Excluir transação", [["Nome", atual.descricao], ["Valor", F.moeda(atual.valor)], ["Data", dataBr(atual.data)], ["Conta", atual.nomeConta || "Sem conta"]],
          () => req(A.deleteLancamento, { id: atual.id }));
      },
      criar_conta: async (a) => {
        const nome = txt(a.nome), tipo = typeof a.tipo === "string" && Object.hasOwn(TIPOS_CONTA, a.tipo) ? a.tipo : undefined;
        if (!nome || !tipo) return faltam([!nome ? "nome" : "", !tipo ? "tipo" : ""].filter(Boolean));
        const fech = int(a.fechamento, 1, 31), venc = int(a.vencimento, 1, 31), dig = txt(a.ultimos4, 4);
        if (tipo === "cartao" && !!fech !== !!venc) return faltam([fech ? "vencimento" : "fechamento"]);
        const linhas: Array<[string, string]> = [["Nome", nome], ["Tipo", TIPOS_CONTA[tipo]], ["Saldo", F.moeda(num(a.saldo) || 0)]];
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
        return escrita("Editar conta", linhas, async () => {
          if (nome) await req(A.updateConta, { id: c.id, nome });
          if (dig !== undefined) await req(A.updateConta, { id: c.id, ultimos4Digitos: dig });
          if (fech && venc) await req(A.updateCicloCartao, { id: c.id, fechamento: String(fech), vencimento: String(venc), modo: "fixo" });
          return { id: c.id };
        });
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
        return escrita("Editar categoria", linhas, async () => {
          if (nome || icone || nova) await req(A.updateCategoria, { id: c.id, categoria: { nome: nome || c.nome, icone: icone || c.icone, cor: nova || c.cor,
            grupo: c.grupo, reservado: c.reservadoFixo, status: c.status } });
          if (orc !== undefined && orc >= 0) await req(A.updateCategoria, mensal ? { id: c.id, orcamentoMes: { mes, valor: r2(orc) } } : { id: c.id, reservado: r2(orc), modoOrcamento: "fixo" });
          return { id: c.id };
        });
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
        const lista = (l: Array<{ descricao: string; valor: number }>) => (l.length ? l.map((x) => (x.descricao || "Sem nome") + " " + F.moeda(x.valor)).join(", ") : "nenhum");
        return escrita("Ajustes da fatura", [["Perfil", p.nome], ["Fatura de", m.texto.slice(5, 7) + "/" + m.texto.slice(0, 4)],
          ["Contribuições", lista(final.contribuicoes)], ["Descontos", lista(final.descontos)], ["Arredondamentos", lista(final.arredondamentos)]],
        () => req(A.salvarFatura, Object.assign({ perfilId: p.id, mes: m.mes, ano: m.ano }, final)));
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
        return escrita("Categorizar " + n + (n === 1 ? " transação" : " transações"), linhas, async () => {
          for (const [categoriaId, g] of grupos) await req(A.updateLancamentosEmLote, { ids: g.ids, categoriaId });
          return { categorizadas: sem.length - semSugestao, sem_sugestao: semSugestao };
        });
      },
      exportar_transacoes: async () => {
        const tela = opcoes.tela;
        if (!tela) return semTela();
        return escrita("Exportar transações", [["Arquivo", "CSV com todas as transações"], ["Atenção", "O arquivo não é cifrado. Guarde em local seguro."]],
          () => tela.exportar().then(() => ({})));
      },
      sair: async () => {
        const tela = opcoes.tela;
        if (!tela) return semTela();
        return escrita("Sair da conta", [["Neste aparelho", "A sessão termina e a senha será pedida de novo"]], () => { tela.sair(); return Promise.resolve({}); });
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
        return escrita("Editar perfil", linhas, async () => {
          if (nome) await req(A.updatePerfil, { id: p.id, nome });
          if (nova) await req(A.updatePerfil, { id: p.id, cor: nova });
          return { id: p.id };
        });
      },
    };

    const ASSUNTOS: Record<string, { aba: "geral" | "conta"; onde: string }> = {
      senha: { aba: "conta", onde: "Alterar senha" }, dois_fatores: { aba: "conta", onde: "Autenticação de Dois Fatores" },
      protecao_avancada: { aba: "conta", onde: "Proteção avançada" }, apagar_dados: { aba: "conta", onde: "Apagar todos os dados" },
      excluir_conta: { aba: "conta", onde: "Excluir conta" }, pix: { aba: "geral", onde: "Pix" }, geral: { aba: "geral", onde: "Geral" },
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
        (opcoes.tela as TelaZo).abrirConfiguracoes(assunto.aba);
        return { aberta: true, aba: assunto.aba === "conta" ? "Conta" : "Geral", item: assunto.onde };
      },
    };

    /** Executa uma chamada do Zo. Ferramenta fora da lista ou argumentos ilegíveis viram erro (nada roda). */
    async function executar(nome: string, argumentos: string): Promise<ResultadoFerramentaZo> {
      const a = ler(argumentos);
      try {
        if (nome === "importar_arquivo") return { tipo: "arquivo" };
        if (nome === "oferecer_opcoes") {
          const opcoesLista = Array.isArray(a.opcoes) ? a.opcoes.map((o) => txt(o, 80)).filter((o): o is string => !!o).slice(0, 12) : [];
          return { tipo: "opcoes", pergunta: txt(a.pergunta) || "", opcoes: opcoesLista };
        }
        if (Object.hasOwn(LEITURA, nome)) return { tipo: "leitura", resultado: json(await LEITURA[nome](a)) };
        if (Object.hasOwn(TELA, nome)) return opcoes.tela ? { tipo: "leitura", resultado: json(await TELA[nome](a)) } : semTela();
        if (Object.hasOwn(ESCRITA, nome)) return await ESCRITA[nome](a);
        return { tipo: "leitura", resultado: json({ erro: "ferramenta_desconhecida" }) };
      } catch (e) { return { tipo: "leitura", resultado: erroDe(e) }; }
    }
    return { executar, nomes: Object.keys(LEITURA).concat(Object.keys(ESCRITA), Object.keys(TELA), ["oferecer_opcoes", "importar_arquivo"]) };
  }

  const api: ZoZoZoFerramentas = { criar };
  ZoZo.zoFerramentas = api;
})(window.ZoZo);
