/* =============================================================
   ZoZo — Serviço de dados
   ------------------------------------------------------------
   Camada de dados separada da interface. Responde às mesmas
   ações do contrato (getLancamentos, createConta, ...) e guarda
   UM documento por usuário, que o host cifra no navegador e grava
   no banco SQL do Cloudflare (ações loadUserData/saveUserData).

   As regras configuráveis ficam em js/config/regras.ts.
   Nenhum componente visual acessa este módulo diretamente:
   tudo passa pelo bridge (ZoZo.bridge.request).

   Recursos por conta (o servidor informa no login — ZoZo.recursos):
   • Perfis, boletos e Pix só existem para as contas liberadas; nas
     demais, as ações recusam e os perfis já gravados ficam guardados
     sem aparecer (nada é apagado).
   • Conta de demonstração: o documento é gerado no navegador e nada
     é gravado; o visitante cria no máximo 1 item de cada tipo.
   Testes: ui/tests/servico.test.mjs e servico-acoes.test.mjs.
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const M = ZoZo.messages;
  const R = () => ZoZo.regras;

  /* Tipos do documento e das respostas: ui/src/dados.d.ts (as telas usam os mesmos) */
  /** Dados que a interface manda numa ação: não confiáveis, cada campo é conferido aqui */
  type Dados = Record<string, any>;
  interface Frequencia { dias?: number; meses?: number; rotulo: string; texto: string }
  /** Data de uma série dentro de um mês (parcela: só nas parceladas) */
  interface DataSerie { data: string; chave: string; k: number; parcela?: number }

  const VERSAO = 1;
  const TIPOS_LANCAMENTO: readonly string[] = ["regular", "recorrente", "interno", "receita", "estorno", "debito"];
  /* Multicâmbio: cada registro pertence a uma moeda (sem o campo = Real). Cada moeda é um "mundo"
     separado dentro do MESMO documento cifrado: nada é convertido nem apagado ao trocar ou desativar. */
  const MOEDAS: readonly Moeda[] = ["BRL", "EUR", "USD"];
  const ehMoeda = (v: unknown): v is Moeda => MOEDAS.includes(v as Moeda);
  const moedaDe = (x: { moeda?: unknown } | null | undefined): Moeda => (x && ehMoeda(x.moeda) ? x.moeda : "BRL");
  function moedaAtual(): Moeda {
    if (!temDoc || !doc.config || !doc.config.multicambio) return "BRL";
    return ehMoeda(doc.config.moeda) ? doc.config.moeda : "BRL";
  }
  const chaveGrupo = (nome: string, moeda?: Moeda) => (moeda || moedaAtual()) + "|" + nome;
  const TIPOS_CONTA: readonly string[] = ["cartao", "corrente", "poupanca", "investimento", "emprestimo", "outros"];
  const ATIVOS: readonly string[] = ["corrente", "poupanca", "investimento", "outros"];
  const PASSIVOS: readonly string[] = ["cartao", "emprestimo"];
  /** Contas de onde sai o pagamento da fatura (investimento, empréstimo e cartão não) */
  const CONTAS_PAGAMENTO: readonly string[] = ["corrente", "poupanca", "outros"];

  // Documento do usuário em memória. Antes de carregar (ou depois de descartado) fica vazio e temDoc = false:
  // toda ação passa por garantirCarregado antes de ler ou mudar o documento.
  let doc: Documento = vazio();
  let temDoc = false;
  /** Descarta a cópia em memória (a próxima leitura baixa de novo do servidor) */
  function esquecer() { doc = vazio(); temDoc = false; }
  let carregando: Promise<Documento> | null = null;   // Promise de carga
  let fila: Promise<unknown> = Promise.resolve(); // operações de escrita em série
  // Leituras esperam só a alteração ser APLICADA na memória (não a gravação no servidor terminar): a tela
  // atualiza na hora. Se a gravação falhar, o documento volta ao estado anterior e a tela é redesenhada.
  let aplicadas: Promise<unknown> = Promise.resolve();
  let pendentes = 0;            // gravações ainda não confirmadas pelo servidor
  let criadosDemo: Record<string, number> = {};         // demonstração: itens criados pelo visitante, por tipo
  let somenteLeitura = false;   // documento sumiu do servidor sem backup: nada é gravado até um recomeço deliberado
  let motivoBloqueio = "DOCUMENT_MISSING_LOCKED";   // ou DOCUMENT_INVALID_LOCKED (documento com dado financeiro ilegível)

  /* ---------------- recursos da conta ---------------- */
  const avancado = () => !!(ZoZo.recursos && ZoZo.recursos.perfis());     // Perfis (e boletos/Pix, que dependem deles)
  const pixLiberado = () => !!(ZoZo.recursos && ZoZo.recursos.pix());
  const boletoLiberado = () => !!(ZoZo.recursos && ZoZo.recursos.boleto());
  const ehDemo = () => !!(ZoZo.recursos && ZoZo.recursos.demo());
  const cambioLiberado = () => !!(ZoZo.recursos && ZoZo.recursos.cambio && ZoZo.recursos.cambio());
  function exigir(liberado: boolean) { if (!liberado) throw erro("FEATURE_UNAVAILABLE"); }
  /** Demonstração: além do que foi gerado, só 1 perfil, conta, cartão, categoria, lançamento e recorrência */
  const LIMITE_DEMO = 1;
  function conferirLimiteDemo(tipo: string) { if (ehDemo() && (criadosDemo[tipo] || 0) >= LIMITE_DEMO) throw erro("DEMO_LIMIT"); }
  function contarDemo(tipo: string) { if (ehDemo()) criadosDemo[tipo] = (criadosDemo[tipo] || 0) + 1; }

  /* ---------------- utilitários ---------------- */
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: Date) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const hojeIso = () => iso(new Date());
  const mesDe = (dataIso: unknown) => String(dataIso || "").slice(0, 7);
  const mesAtual = () => mesDe(hojeIso());
  const r2 = (n: number) => Math.round(n * 100) / 100;
  /** Identificador imprevisível (crypto) com prefixo do tipo: l…, c…, k…, p… */
  const novoId = (p: string) => p + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  const clone = <T>(o: T): T => structuredClone(o);

  function erro(code: string): ErroPonte { return new M.BridgeError(code, M.FRIENDLY[code] || M.FRIENDLY.OPERATION_FAILED); }

  // Sanitização dos dados recebidos da interface
  const texto = (v: unknown, max?: number) => String(v === undefined || v === null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max || 200);
  /** Número vindo da interface: número finito ou texto numérico COMPLETO ("123abc" → NaN) */
  const numero = (v: unknown): number => {
    if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
    const t = String(v === undefined || v === null ? "" : v).trim();
    return /^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(t) ? Number(t) : NaN;
  };
  /** "AAAA-MM-DD" de um dia que existe (2026-02-31 é recusada: o JavaScript a transformaria em março) */
  function dataValida(v: unknown): string | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ""));
    if (!m) return null;
    const a = Number(m[1]), me = Number(m[2]), d = Number(m[3]);
    const dt = new Date(a, me - 1, d);
    return a >= 1900 && a <= 2200 && dt.getFullYear() === a && dt.getMonth() === me - 1 && dt.getDate() === d ? String(v) : null;
  }
  const cor = (v: unknown, padrao?: string | null) => ZoZo.format.cor(v, padrao || "#6078a9");
  const inteiro = (v: unknown) => { const n = parseInt(String(v), 10); return Number.isFinite(n) ? n : NaN; };
  const NOME = () => R().limiteNome;          // máximo de caracteres de um nome (regras.js)
  const existe = (lista: Array<{ id: Id }>, id: unknown): Id | null => (typeof id === "string" && id && lista.some((x) => x.id === id) ? id : null);

  function diffMeses(de: string, ate: string) { // "AAAA-MM"
    const [a1, m1] = de.split("-").map(Number);
    const [a2, m2] = ate.split("-").map(Number);
    return (a2 - a1) * 12 + (m2 - m1);
  }
  function dataNoMes(mes: string, dia: number) { // mes "AAAA-MM"
    const [a, m] = mes.split("-").map(Number);
    const ultimo = new Date(a, m, 0).getDate();
    return mes + "-" + pad(Math.min(dia, ultimo));
  }
  function fimMesAnterior() {
    const d = new Date(); d.setDate(0);
    return iso(d);
  }

  /* ---------------- documento ---------------- */
  function vazio(): Documento {
    return { versao: VERSAO, perfis: [], contas: [], categorias: [], lancamentos: [], grupos: {}, config: {}, meta: {}, faturas: {} };
  }
  const objeto = (x: unknown): x is Record<string, any> => !!x && typeof x === "object" && !Array.isArray(x);
  /**
   * Põe o documento lido no formato atual. NUNCA "conserta" dinheiro: valor ilegível ou ID repetido
   * (referências ficariam ambíguas) viram PROBLEMAS — a tela abre, mas nada é gravado, e o original
   * continua intacto no servidor. Conversão conhecida e determinística: valor em texto "123.45" → 123.45.
   * → { doc, problemas: [códigos] }
   */
  // Dados brutos vindos do servidor (decifrados): ainda não conferidos, por isso "any" só aqui
  function normalizar(d: unknown): { doc: Documento; problemas: string[] } {
    const problemas = [];
    if (d !== null && d !== undefined && !objeto(d)) problemas.push("DOCUMENTO_INVALIDO");
    const out = Object.assign(vazio(), objeto(d) ? d : {});
    // Coleção ausente (documento de versão anterior) = vazia. Coleção com tipo errado ou item que não é registro
    // NÃO é descartada em silêncio: a tela mostra o que der, mas nada é gravado (o original fica no servidor).
    ["perfis", "contas", "categorias", "lancamentos"].forEach((k) => {
      const bruto = objeto(d) ? d[k] : undefined;
      if (bruto !== undefined && bruto !== null && !Array.isArray(bruto)) problemas.push("COLECAO_INVALIDA:" + k);
      const lista = Array.isArray(bruto) ? bruto : [];
      if (lista.some((x) => !objeto(x))) problemas.push("ITEM_INVALIDO:" + k);
      out[k] = lista.filter(objeto);
    });
    const prefixo = { perfis: "p", contas: "c", categorias: "k", lancamentos: "l" } as const;
    (Object.keys(prefixo) as Array<keyof typeof prefixo>).forEach((k) => {
      const vistos = new Set<string>();
      out[k].forEach((x: any) => {
        // ID ausente/vazio/não-texto: as referências do original não batem com um ID novo → só leitura (nada é regravado)
        if (typeof x.id !== "string" || !x.id) problemas.push("ID_INVALIDO:" + k);
        if (typeof x.id === "string" && x.id && vistos.has(x.id)) problemas.push("ID_DUPLICADO:" + k);
        if (typeof x.id !== "string" || !x.id || vistos.has(x.id)) x.id = novoId(prefixo[k]);    // só para a tela (não é gravado)
        vistos.add(x.id);
      });
    });
    out.contas.forEach((c: any) => {
      // Histórico de saldo: é a base do saldo da conta. Texto numérico "125.00" = migração conhecida; o resto é problema.
      if (c.historico !== undefined && !Array.isArray(c.historico)) problemas.push("HISTORICO_INVALIDO");
      const hist = Array.isArray(c.historico) ? c.historico : [];
      hist.forEach((p: any) => { if (objeto(p) && typeof p.saldo === "string" && /^\s*-?\d{1,13}(\.\d{1,2})?\s*$/.test(p.saldo)) p.saldo = Number(p.saldo); });
      const validos = hist.filter((p: any) => objeto(p) && typeof p.data === "string" && dataValida(p.data) !== null && Number.isFinite(p.saldo));
      if (validos.length !== hist.length) problemas.push("HISTORICO_INVALIDO");
      c.historico = validos;
      if (typeof c.nome !== "string") c.nome = String(c.nome || "Conta");
    });
    out.lancamentos.forEach((l: any) => {
      if (typeof l.data !== "string" || dataValida(l.data) === null) { problemas.push("DATA_INVALIDA"); l.data = typeof l.data === "string" ? l.data : ""; }
      if (typeof l.descricao !== "string") l.descricao = String(l.descricao || "");
      if (typeof l.valor === "string" && /^\s*\d{1,13}(\.\d{1,2})?\s*$/.test(l.valor)) l.valor = Number(l.valor);   // migração conhecida
      if (typeof l.valor !== "number" || !Number.isFinite(l.valor)) { problemas.push("VALOR_INVALIDO"); l.valorInvalido = true; l.valor = 0; }
    });
    if (!out.config || typeof out.config !== "object") out.config = {};
    if (!objeto(out.grupos)) out.grupos = {};
    if (!objeto(out.faturas)) out.faturas = {};             // ajustes das faturas de perfis (documento anterior: nenhum)
    if (!out.meta || typeof out.meta !== "object") out.meta = {};
    out.lancamentos.forEach((l: any) => {
      if (l.recorrencia === "fixa") l.recorrencia = "mensal";                         // versão anterior
      // Transferência: "sentido" é o campo que a tela mostra; "direcao" (antigo) passa a ser só uma cópia dele
      if (l.tipo === "interno") {
        l.sentido = l.sentido === "entrada" || l.sentido === "saida" ? l.sentido : (l.direcao === "entrada" ? "entrada" : "saida");
        l.direcao = l.sentido;
      }
    });
    out.versao = VERSAO;
    return { doc: out, problemas };
  }

  function garantirCarregado(): Promise<Documento> {
    if (temDoc) return Promise.resolve(doc);
    if (!carregando) {
      carregando = ZoZo.bridge.requestHost(M.ACTIONS.loadUserData, null)
        .then((r) => {
          const bruto = r && r.documento;
          // Gravado por uma versão MAIS NOVA do ZoZo (outra aba já atualizada): não abre nem regrava com o formato antigo
          if (objeto(bruto) && Number(bruto.versao) > VERSAO) throw erro("DOCUMENT_NEWER");
          const lido = normalizar(bruto);
          doc = lido.doc;
          temDoc = true;
          somenteLeitura = !!(r && r.somenteLeitura);
          motivoBloqueio = "DOCUMENT_MISSING_LOCKED";
          // Avisos do host: restaurado de backup / versão mais antiga do que a conhecida
          if (r && r.aviso) window.dispatchEvent(new CustomEvent("zozo:aviso-dados", { detail: { codigo: r.aviso } }));
          if (lido.problemas.length) {
            // Dado financeiro ilegível: abre só para leitura; o documento original fica intocado no servidor
            somenteLeitura = true;
            motivoBloqueio = "DOCUMENT_INVALID_LOCKED";
            ZoZo.log.error("serviço", { evento: "documento_invalido", problemas: Array.from(new Set(lido.problemas)) });
            window.dispatchEvent(new CustomEvent("zozo:aviso-dados", { detail: { codigo: "DOCUMENT_INVALID_LOCKED" } }));
          }
          if (!somenteLeitura && converterPagamentosAntigos() + sincronizarParcelas() + sincronizarSaldos() > 0) {
            doc.meta.ultimaGravacao = new Date().toISOString();
            // grava pela mesma fila das alterações (nunca em paralelo com elas) e conta como gravação pendente
            pendentes += 1;
            fila = fila.then(() => ZoZo.bridge.requestHost(M.ACTIONS.saveUserData, { documento: doc }))
              .catch((e) => {
                if (tratarConflito(e)) return;
                // Não gravou: descarta a cópia em memória (as parcelas são refeitas na próxima leitura) e avisa
                esquecer();
                window.dispatchEvent(new CustomEvent("zozo:aviso-dados", { detail: { codigo: "AUTOSAVE_FAILED" } }));
              })
              .finally(() => { pendentes -= 1; });
          }
          return doc;
        })
        .finally(() => { carregando = null; });
    }
    return carregando;
  }

  /** Depois de excluir/editar uma parte, o grupo da divisão é recalculado (total e quantidade) */
  function ajustarDivisao(grupo: Id) {
    const membros = doc.lancamentos.filter((l) => l.divisao && l.divisao.id === grupo);
    if (membros.length <= 1) { membros.forEach((l) => { delete l.divisao; }); return; }
    const total = r2(membros.reduce((s, l) => s + l.valor, 0));
    membros.forEach((l) => { l.divisao = { id: grupo, total, partes: membros.length }; });
  }

  /** Outro computador gravou os dados depois da nossa leitura: descarta a cópia em memória e avisa a interface */
  function tratarConflito(e: { code?: string } | null | undefined) {
    if (!e || e.code !== "DATA_CHANGED") return false;
    esquecer();
    window.dispatchEvent(new CustomEvent("zozo:dados-alterados"));
    return true;
  }

  /** Erro da gravação para a interface: com mensagem própria quando existe; senão o genérico com o código */
  function erroDaGravacao(e: { code?: string; friendly?: string } | null | undefined): ErroPonte {
    const code = e && e.code;
    if (code && code !== "OPERATION_FAILED" && M.FRIENDLY[code]) return erro(code);
    if (e && e.friendly) return e as ErroPonte;                                   // já tem texto amigável (com o código)
    return erro("OPERATION_FAILED");
  }

  /** Executa uma alteração e grava. Se a gravação falhar, desfaz. */
  function alterar<T>(fn: (d: Documento) => T): Promise<T> {
    pendentes += 1;
    let aplicada: () => void = () => {};
    aplicadas = new Promise<void>((r) => { aplicada = r; });
    const exec = fila.then(() => garantirCarregado()).then(() => {
      if (somenteLeitura) throw erro(motivoBloqueio);
      const antes = JSON.stringify(doc);
      let resultado: T;
      try { resultado = fn(doc); sincronizarSaldos(); } catch (e) { doc = JSON.parse(antes); throw e; }
      doc.meta.ultimaGravacao = new Date().toISOString();
      aplicada();
      return ZoZo.bridge.requestHost(M.ACTIONS.saveUserData, { documento: doc })
        .then(() => resultado)
        .catch((e) => {
          if (temDoc) doc = JSON.parse(antes);
          // quem leu enquanto gravava viu a alteração: a tela volta ao que está gravado
          window.dispatchEvent(new CustomEvent("zozo:dados-revertidos"));
          if (tratarConflito(e)) throw erro("DATA_CHANGED");
          if (e && (e.code === "TIMEOUT" || e.code === "SAVE_UNCONFIRMED")) {
            // Sem resposta (prazo ou conexão que caiu depois do envio): a gravação pode ter acontecido ou não.
            // Nada de "desfazer" às cegas: relê do servidor.
            esquecer();
            window.dispatchEvent(new CustomEvent("zozo:dados-alterados", { detail: { codigo: "SAVE_UNCONFIRMED" } }));
            throw erro("SAVE_UNCONFIRMED");
          }
          throw erroDaGravacao(e);
        });
    }).finally(() => { pendentes -= 1; aplicada(); });
    fila = exec.catch(() => null);
    return exec;
  }

  function reset() { esquecer(); carregando = null; fila = Promise.resolve(); aplicadas = Promise.resolve(); criadosDemo = {}; somenteLeitura = false; motivoBloqueio = "DOCUMENT_MISSING_LOCKED"; }
  const gravando = () => pendentes > 0;
  /** Outro dispositivo gravou: esquece o documento (a próxima leitura baixa a versão nova). Nunca com gravação pendente. */
  function recarregarDoServidor() {
    if (pendentes > 0) return false;
    esquecer(); carregando = null;
    return true;
  }

  /* ---------------- saldos e séries ---------------- */
  function saldoAtual(c: Conta): number {
    const h = c.historico;
    return h.length ? h[h.length - 1].saldo : 0;
  }
  function saldoEm(c: Conta, dataIso: string): number | null {
    let v: number | null = null;
    for (const p of c.historico) { if (p.data <= dataIso) v = p.saldo; else break; }
    return v;
  }
  function variacao(atual: number, anterior: number | null | undefined) {
    if (anterior === null || anterior === undefined || anterior === 0) return 0;
    return r2(((atual - anterior) / Math.abs(anterior)) * 100);
  }
  /** Fechamento e vencimento de um cartão num mês: o do mês (se definido só para ele) ou o de todos os meses */
  function cicloDoCartao(c: Conta, mes: string) {
    const m = c.ciclos && c.ciclos[mes];
    return m ? { fechamento: m.fechamento, vencimento: m.vencimento, soEsteMes: true }
      : { fechamento: c.fechamento || null, vencimento: c.vencimento || null, soEsteMes: false };
  }
  function contaPublica(c: Conta): ContaTela {
    return {
      id: c.id, nome: c.nome, ultimos4Digitos: c.ultimos4Digitos || "", tipo: c.tipo, tipoInvestimento: c.tipoInvestimento || "", oculta: !!c.oculta,
      cor: c.cor, instituicao: c.instituicao || "", limite: c.limite || null, fechamento: c.fechamento || null, vencimento: c.vencimento || null,
      ciclos: c.tipo === "cartao" && c.ciclos ? Object.assign({}, c.ciclos) : {}, cicloAtual: c.tipo === "cartao" ? cicloDoCartao(c, mesAtual()) : null,
      emprestimo: c.tipo === "emprestimo" && c.emprestimo ? Object.assign({}, c.emprestimo) : null,
      valor: saldoAtual(c), variacaoPercentual: variacao(saldoAtual(c), saldoEm(c, fimMesAnterior())),
    };
  }

  /** Série diária a partir dos registros de saldo (máx. ~13 meses) */
  function serieDiaria<T>(contas: Conta[], fnPonto: (data: string) => T): T[] {
    const datas = contas.flatMap((c) => c.historico.map((p) => p.data)).sort();
    const hoje = new Date();
    const limite = new Date(hoje); limite.setDate(limite.getDate() - 400);
    let ini = datas.length ? new Date(datas[0] + "T00:00:00") : new Date(hoje);
    if (ini < limite) ini = limite;
    if (ini > hoje) ini = new Date(hoje);
    // ao menos dois pontos para desenhar a linha
    if (iso(ini) === iso(hoje)) ini.setDate(ini.getDate() - 1);
    const serie = [];
    for (let d = new Date(ini); d <= hoje; d.setDate(d.getDate() + 1)) serie.push(fnPonto(iso(d)));
    return serie;
  }

  function getContas(): RespostaContas {
    const ativas = doc.contas.filter((c) => !c.oculta);   // conta oculta não entra nos totais
    const somar = (tipos: readonly string[], data?: string) => r2(ativas.filter((c) => tipos.includes(c.tipo)).reduce((s, c) => s + (data ? (saldoEm(c, data) || 0) : saldoAtual(c)), 0));
    const ativos = somar(ATIVOS), passivos = somar(PASSIVOS);
    const ant = fimMesAnterior();
    return {
      contas: doc.contas.map(contaPublica),
      resumo: {
        ativos: { valor: ativos, variacaoPercentual: variacao(ativos, somar(ATIVOS, ant)) },
        passivos: { valor: passivos, variacaoPercentual: variacao(passivos, somar(PASSIVOS, ant)) },
        serie: serieDiaria(ativas, (d) => ({ data: d, ativos: somar(ATIVOS, d), passivos: somar(PASSIVOS, d) })),
      },
    };
  }

  function getInvestimentos(d?: Dados): RespostaInvestimentos {
    const excluir = d && Array.isArray(d.excluir) ? d.excluir : [];
    const todas = doc.contas.filter((c) => c.tipo === "investimento");
    const inv = todas.filter((c) => !excluir.includes(c.id) && !c.oculta);
    const total = (data?: string) => r2(inv.reduce((s, c) => s + (data ? (saldoEm(c, data) || 0) : saldoAtual(c)), 0));
    const atual = total();
    const porTipo = new Map<string, number>();
    inv.forEach((c) => {
      const t = c.tipoInvestimento || "Outros";
      porTipo.set(t, (porTipo.get(t) || 0) + Math.max(saldoAtual(c), 0));
    });
    const soma = Array.from(porTipo.values()).reduce((s, v) => s + v, 0);
    const alocacoes = Array.from(porTipo.entries())
      .map(([t, v]) => ({ tipoInvestimento: t, icone: (R().iconesInvestimento || {})[t] || "💼", percentual: soma ? r2((v / soma) * 100) : 0 }))
      .sort((a, b) => b.percentual - a.percentual);
    return {
      contas: todas.map(contaPublica),
      incluidas: inv.map((c) => c.id),
      alocacoes,
      resumo: { valor: atual, variacaoPercentual: variacao(atual, total(fimMesAnterior())), serie: serieDiaria(inv, (d) => ({ data: d, valor: total(d) })) },
    };
  }

  /* ---------------- lançamentos ---------------- */
  function enriquecer(l: Lancamento): LancamentoTela {
    const conta = doc.contas.find((c) => c.id === l.contaId);
    const cat = doc.categorias.find((c) => c.id === l.categoriaId);
    const perfil = avancado() ? doc.perfis.find((p) => p.id === l.perfilId) : null;   // sem o recurso: o perfil não aparece
    const par = l.pagamento ? parDoPagamento(l) : null;
    return Object.assign({}, l, {
      nomeConta: conta ? conta.nome : "",
      ultimos4Digitos: conta ? conta.ultimos4Digitos || "" : "",
      categoria: cat ? { nome: cat.nome, icone: cat.icone, cor: cat.cor } : null,
      perfil: perfil ? { nome: perfil.nome, cor: perfil.cor } : null,
      parFatura: par ? par.id : null,
    });
  }
  /* Pagamento de fatura (tipo "fatura"): duas transações com o mesmo pagamento.grupo. A do pagante (conta e perfil
     escolhidos) aparece em Transações; a do cartão (abate a dívida) só no painel do cartão. Não se cria à mão. */
  const ladoDoCartao = (l: Lancamento) => !!l.pagamento && l.pagamento.lado === "cartao";
  function parDoPagamento(l: Lancamento): Lancamento | null {
    const g = l.pagamento && l.pagamento.grupo;
    return g ? doc.lancamentos.find((x) => x.id !== l.id && !!x.pagamento && x.pagamento.grupo === g) || null : null;
  }
  /** ids escolhidos + o outro lado de cada pagamento de fatura (excluir um lado exclui os dois) */
  function comOsPares(ids: Iterable<Id>): Set<Id> {
    const todos = new Set(ids);
    doc.lancamentos.forEach((l) => { if (todos.has(l.id) && l.pagamento) { const p = parDoPagamento(l); if (p) todos.add(p.id); } });
    return todos;
  }
  function getLancamentos(): RespostaLancamentos {
    return { lancamentos: doc.lancamentos.filter((l) => !ladoDoCartao(l)).map(enriquecer).sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id)) };
  }

  /** Perfil arquivado: continua nos lançamentos antigos, mas não pode ser escolhido em novos */
  function perfilPermitido(id: unknown, atual: Lancamento | null): Id | null {
    const p = doc.perfis.find((x) => x.id === id);
    if (!p) return null;
    if (p.arquivado && !(atual && atual.perfilId === id)) throw erro("PROFILE_ARCHIVED");
    return p.id;
  }

  function lerLancamento(entrada: Dados | null | undefined, atual: Lancamento | null): Omit<Lancamento, "id"> {
    const l = entrada || {};
    const data = dataValida(l.data);
    const valor = numero(l.valor);
    const descricao = texto(l.descricao, NOME());
    const tipo = TIPOS_LANCAMENTO.includes(l.tipo) ? l.tipo : "regular";
    // valor em centavos: 0,001 vira 0,00 e é recusado (nunca grava um lançamento de R$ 0,00)
    if (!data || !descricao || !(r2(valor) > 0) || valor > 1e12) throw erro("OPERATION_FAILED");
    const contaId = existe(doc.contas, l.contaId);
    // Débito: sai do saldo de uma CONTA (cartão não pode)
    const debito = tipo === "debito" || (tipo === "recorrente" && (l.debito === true || !!(atual && atual.debito)));
    if (debito) {
      const conta = doc.contas.find((c) => c.id === contaId);
      if (!conta || conta.tipo === "cartao") throw erro("DEBIT_ACCOUNT");
    }
    const out: Omit<Lancamento, "id"> = {
      data, descricao, valor: r2(valor), tipo,
      contaId,
      categoriaId: existe(doc.categorias, l.categoriaId),
      // Sem o recurso de Perfis: o perfil já gravado continua como estava (não é apagado nem alterado)
      perfilId: avancado() ? perfilPermitido(l.perfilId, atual) : (atual ? atual.perfilId || null : null),
      notas: texto(l.notas, 2000),
      recorrencia: null, parcelaAtual: null, parcelaTotal: null,
      sentido: tipo === "interno" ? (l.sentido === "entrada" ? "entrada" : "saida") : null,   // transferência: saída | entrada
      direcao: null,                                                                          // cópia de "sentido" (abaixo)
      serieId: atual ? atual.serieId || null : null,
      competencia: atual && atual.competencia ? atual.competencia : mesDe(data),
      encerradaEm: atual ? atual.encerradaEm || null : null,
    };
    if (tipo === "recorrente") {
      out.recorrencia = recorrenciaValida(l.recorrencia);
      if (out.recorrencia === "parcelada") {
        const pa = inteiro(l.parcelaAtual), pt = inteiro(l.parcelaTotal);
        if (!(pa >= 1 && pt >= 2 && pa <= pt && pt <= 999)) throw erro("OPERATION_FAILED");
        out.parcelaAtual = pa; out.parcelaTotal = pt;
      }
    }
    out.direcao = out.sentido;
    if (debito) out.debito = true;
    out.moeda = atual ? moedaDe(atual) : moedaAtual();
    // Parcelamento pelo total: mantém o valor das parcelas seguintes enquanto o valor desta não mudar
    if (atual && out.recorrencia === "parcelada" && atual.valorParcela && r2(atual.valor) === out.valor) {
      out.valorParcela = atual.valorParcela;
      if (atual.valorTotal) out.valorTotal = atual.valorTotal;
    }
    if (atual && atual.efeito) out.efeito = atual.efeito;                       // efeito no saldo (conciliado em sincronizarSaldos)
    // Marcas de pagamento: continuam ao editar (valor, data, notas…) enquanto o lançamento segue do mesmo tipo
    if (atual && atual.pagamentoCartao && tipo === atual.tipo) out.pagamentoCartao = true;
    if (atual && atual.faturaPerfil && tipo === "receita") out.faturaPerfil = atual.faturaPerfil;
    // A competência acompanha a data quando o lançamento não é ocorrência de série
    if (!out.serieId) out.competencia = mesDe(data);
    return out;
  }

  /* ---------------- recorrências ---------------- */
  /* Frequências de recorrência (rótulo curto na lista e texto do seletor) */
  const FREQUENCIAS: Readonly<Record<string, Frequencia>> = {
    semanal: { dias: 7, rotulo: "Semanal", texto: "A cada semana" },
    quinzenal: { dias: 14, rotulo: "Quinzenal", texto: "A cada 2 semanas" },
    mensal: { meses: 1, rotulo: "Mensal", texto: "A cada mês" },
    bimestral: { meses: 2, rotulo: "Bimestral", texto: "A cada 2 meses" },
    trimestral: { meses: 3, rotulo: "Trimestral", texto: "A cada 3 meses" },
    quadrimestral: { meses: 4, rotulo: "Quadrimestral", texto: "A cada 4 meses" },
    semestral: { meses: 6, rotulo: "Semestral", texto: "A cada 6 meses" },
    anual: { meses: 12, rotulo: "Anual", texto: "A cada ano" },
  };
  /** Frequência pelo nome (só as da tabela: nada de constructor, toString… herdados) */
  const freq = (r: unknown): Frequencia | undefined => (typeof r === "string" && Object.hasOwn(FREQUENCIAS, r) ? FREQUENCIAS[r] : undefined);
  const recorrenciaValida = (v: unknown): string => (v === "parcelada" || freq(v) ? (v as string) : "mensal");

  const ehOrigem = (l: Lancamento): boolean => l.tipo === "recorrente" && !!l.recorrencia && (!l.serieId || l.serieId === l.id);

  /* ---------------- Parcelas automáticas ----------------
     Ao registrar uma compra parcelada (ex.: parcela 3 de 10), as parcelas
     4…10 são criadas como lançamentos nos meses seguintes, no mesmo dia.
     Uma parcela com data futura conta como "Pendente" em Recorrências e
     passa a "Pago" quando a data chega.                                    */
  function mesSomado(mes: string, k: number) {
    const [a, m] = mes.split("-").map(Number);
    const d = new Date(a, m - 1 + k, 1);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1);
  }

  function sincronizarParcelas() {
    let criadas = 0;
    doc.lancamentos.filter((o) => ehOrigem(o) && o.recorrencia === "parcelada" && (o.parcelaTotal || 0) > (o.parcelaAtual || 0)).forEach((o) => {
      const inicio = o.competencia || mesDe(o.data);
      const dia = Number(o.data.slice(8, 10));
      for (let k = 1; (o.parcelaAtual || 0) + k <= (o.parcelaTotal || 0); k++) {
        const mes = mesSomado(inicio, k);
        if ((o.ignorados || []).includes(mes)) continue;      // parcela excluída pelo usuário
        if (doc.lancamentos.some((l) => l.serieId === o.id && l.id !== o.id && l.competencia === mes)) continue;
        doc.lancamentos.push({
          id: novoId("l"), data: dataNoMes(mes, dia), descricao: o.descricao, valor: o.valorParcela || o.valor, tipo: "recorrente",
          contaId: o.contaId, categoriaId: o.categoriaId, perfilId: o.perfilId, notas: "",
          recorrencia: "parcelada", parcelaAtual: (o.parcelaAtual || 0) + k, parcelaTotal: o.parcelaTotal,
          serieId: o.id, competencia: mes, encerradaEm: null, automatico: true, moeda: moedaDe(o),
          debito: o.debito ? true : undefined,
          divisao: undefined,
        });
        criadas += 1;
      }
    });
    return criadas;
  }

  /* ---------------- Saldo das contas e cartões acompanha as transações ----------------
     Cada transação com data até hoje muda o saldo da conta dela (regra em efeitoNoSaldo):
       • conta (corrente, poupança, investimento, outros): débito e transferência de saída tiram;
         receita e transferência de entrada somam; a "Regular" não mexe (para sair da conta, use Débito);
       • cartão: compra (Regular/Recorrente) aumenta a fatura; estorno, receita e transferência de
         entrada (pagamento da fatura) diminuem;
       • empréstimo: só transferências (entrada = pagamento, diminui a dívida);
       • Fatura (pagamento de fatura, as duas transações do par): tira da conta pagante e diminui a dívida do cartão.
     O efeito aplicado fica anotado na transação (efeito = { contaId, delta }) e é conciliado depois de
     toda gravação e ao abrir os dados: mudou valor, conta, tipo, sentido ou data → desfaz o efeito antigo
     e aplica o novo (nunca em dobro). Excluir devolve. Data futura só conta no dia.
     Na 1ª abertura com esta regra, as transações que já existiam são só ANOTADAS (o saldo informado à mão
     já as considera): nenhum saldo pula. A partir daí, cada transação nova ou editada atualiza o saldo. */
  const ehDebito = (l: Lancamento) => l.tipo === "debito" || (l.tipo === "recorrente" && l.debito === true);
  function efeitoNoSaldo(l: Lancamento, conta: Conta | null | undefined, hoje: string): number {
    if (!conta || !l.data || l.data > hoje || l.valorInvalido) return 0;
    const v = l.valor, entrada = l.tipo === "interno" && l.sentido === "entrada";
    if (l.tipo === "fatura") return -v;                    // pagamento de fatura: sai da conta pagante e abate a dívida do cartão
    if (conta.tipo === "cartao") {
      if (l.tipo === "interno") return entrada ? -v : v;
      return l.tipo === "receita" || l.tipo === "estorno" ? -v : v;
    }
    if (conta.tipo === "emprestimo") return l.tipo === "interno" ? (entrada ? -v : v) : 0;
    if (ehDebito(l)) return -v;
    if (l.tipo === "receita") return v;
    if (l.tipo === "interno") return entrada ? v : -v;
    return 0;
  }
  function reverterEfeito(l: Lancamento) {
    const ef = l.efeito;
    if (!ef) return false;
    const c = doc.contas.find((x) => x.id === ef.contaId);
    if (c && Number.isFinite(ef.delta)) registrarSaldo(c, r2(saldoAtual(c) - ef.delta));
    delete l.efeito;
    return true;
  }
  /**
   * Pagamentos de fatura gravados até a 3.18 (Débito na conta + Receita no cartão, com a marca pagamentoCartao ou o
   * texto que o "Pagar fatura" gerava) viram o par do tipo Fatura. Só pares completos (mesma data, valor, notas e moeda);
   * o que não tem par fica como estava. O efeito no saldo é o mesmo (−valor nos dois lados): nenhum saldo muda.
   */
  function converterPagamentosAntigos() {
    const marcado = (l: Lancamento) => !!l.pagamentoCartao || (l.descricao === "Pagamento fatura" && String(l.notas || "").startsWith(PAGAMENTO_ANTIGO));
    const tipoDaConta = (l: Lancamento) => { const c = doc.contas.find((x) => x.id === l.contaId); return c ? c.tipo : ""; };
    const livre = (l: Lancamento) => !l.pagamento && !l.divisao && !l.serieId && !l.valorInvalido && marcado(l);
    const doCartao = doc.lancamentos.filter((l) => l.tipo === "receita" && tipoDaConta(l) === "cartao" && livre(l));
    const usados = new Set<Id>();
    let n = 0;
    doc.lancamentos.filter((l) => l.tipo === "debito" && CONTAS_PAGAMENTO.includes(tipoDaConta(l)) && livre(l)).forEach((pag) => {
      const par = doCartao.find((r) => !usados.has(r.id) && r.data === pag.data && r2(r.valor) === r2(pag.valor)
        && String(r.notas || "") === String(pag.notas || "") && moedaDe(r) === moedaDe(pag));
      if (!par) return;
      usados.add(par.id);
      const grupo = novoId("f");
      Object.assign(pag, { tipo: "fatura", pagamento: { grupo, lado: "pagante" } });
      Object.assign(par, { tipo: "fatura", pagamento: { grupo, lado: "cartao" }, perfilId: null, categoriaId: null });
      [pag, par].forEach((l) => { delete l.debito; delete l.pagamentoCartao; delete l.faturaPerfil; });
      n += 2;
    });
    return n;
  }
  function sincronizarSaldos() {
    const hoje = hojeIso();
    const soAnotar = !doc.meta.saldoPorTransacao;          // 1ª vez: o que já existe já está no saldo informado
    let n = 0;
    doc.lancamentos.forEach((l) => {
      // formato anterior (2.8–3.1: só débito) → efeito equivalente, sem mexer no saldo
      if (l.debitado) { l.efeito = { contaId: l.debitado.contaId, delta: -r2(l.debitado.valor) }; delete l.debitado; n += 1; }
      const conta = l.contaId ? doc.contas.find((c) => c.id === l.contaId) : null;
      const delta = r2(efeitoNoSaldo(l, conta, hoje));
      if (l.efeito && (l.efeito.contaId !== (conta && conta.id) || l.efeito.delta !== delta)) { reverterEfeito(l); n += 1; }
      if (delta && !l.efeito && conta) {                         // delta ≠ 0 só existe com conta
        if (!soAnotar) registrarSaldo(conta, r2(saldoAtual(conta) + delta));
        l.efeito = { contaId: conta.id, delta };
        n += 1;
      }
    });
    if (soAnotar) { doc.meta.saldoPorTransacao = 1; n += 1; }
    return n;
  }

  /** Parcelas pelo valor TOTAL da compra (em centavos): a 1ª parcela leva a sobra da divisão; a partir da 2ª, todas iguais */
  function valoresParcelas(total: number, atual: number, qtd: number) {
    const c = Math.round(total * 100);
    const base = Math.floor(c / qtd);
    return { primeira: (atual === 1 ? c - base * (qtd - 1) : base) / 100, demais: base / 100 };
  }

  /** Remove as parcelas futuras geradas automaticamente (e não editadas à mão) de uma série */
  function removerParcelasFuturas(serieId: Id) {
    const hoje = hojeIso();
    doc.lancamentos = doc.lancamentos.filter((l) => !(l.serieId === serieId && l.id !== serieId && l.automatico && !l.editado && l.data > hoje));
  }

  /** Lançamentos de uma série cuja origem saiu continuam existindo, mas não geram novas ocorrências */
  function desligarSerie(serieId: Id) {
    doc.lancamentos.forEach((l) => { if (l.serieId === serieId && l.id !== serieId) l.serieId = "removida:" + serieId; });
  }

  /** Antes de excluir: origem → tira parcelas futuras e desliga a série; parcela → não é recriada */
  function encerrarSerieDe(l: Lancamento) {
    if (!ehOrigem(l)) {
      const o = l.serieId && doc.lancamentos.find((x) => x.id === l.serieId && ehOrigem(x));
      if (o && l.competencia) o.ignorados = Array.from(new Set((o.ignorados || []).concat(l.competencia)));
      return;
    }
    removerParcelasFuturas(l.id);
    desligarSerie(l.id);
  }

  /** Ocorrências do mês, a partir dos lançamentos de origem (regra em regras.js → recorrencias) */
  /** Datas de uma série dentro do mês (respeita a frequência) */
  function datasDaSerie(o: Lancamento, mes: string): DataSerie[] {
    const inicio = o.competencia || mesDe(o.data);
    const k = diffMeses(inicio, mes);
    if (k < 0) return [];
    const dia = Number(o.data.slice(8, 10));
    if (o.recorrencia === "parcelada") {
      const parcela = (o.parcelaAtual || 0) + k;
      return parcela > (o.parcelaTotal || 0) ? [] : [{ data: dataNoMes(mes, dia), chave: mes, k, parcela }];
    }
    const f = freq(o.recorrencia) || FREQUENCIAS.mensal;
    if (f.meses) return k % f.meses === 0 ? [{ data: dataNoMes(mes, dia), chave: mes, k }] : [];
    // semanal / quinzenal: datas a partir da origem, de "dias" em "dias"
    const [a, m] = mes.split("-").map(Number);
    const ini = new Date(a, m - 1, 1), fim = new Date(a, m, 0);
    const base = new Date(o.data + "T00:00:00");
    const out: DataSerie[] = [];
    const dias = f.dias as number;                                   // sem "meses": semanal ou quinzenal
    let n = Math.max(0, Math.ceil((ini.getTime() - base.getTime()) / 86400000 / dias));
    for (; n < 2000; n++) {
      const x = new Date(base); x.setDate(x.getDate() + n * dias);
      if (x > fim) break;
      if (x >= ini) out.push({ data: iso(x), chave: iso(x), k: n });
    }
    return out;
  }

  function ocorrencias(mes: string): ItemRecorrencia[] {
    const hoje = hojeIso();
    const out: ItemRecorrencia[] = [];
    doc.lancamentos.filter(ehOrigem).forEach((o) => {
      if (o.encerradaEm && diffMeses(o.encerradaEm, mes) >= 0) return;   // arquivada: sai de "Este mês" em diante
      const semanal = !!(freq(o.recorrencia) && freq(o.recorrencia)?.dias);
      const cat = doc.categorias.find((c) => c.id === o.categoriaId);
      datasDaSerie(o, mes).forEach((dt) => {
        if ((o.ignorados || []).includes(dt.chave)) return;
        const lanc = dt.k === 0 ? o : doc.lancamentos.find((l) => l.serieId === o.id && l.id !== o.id &&
          (semanal ? l.ocorrencia === dt.chave : l.competencia === mes));
        const data = lanc ? lanc.data : dt.data;
        const rotulo = o.recorrencia === "parcelada" ? "Parcela " + dt.parcela + "/" + o.parcelaTotal : (freq(o.recorrencia) || FREQUENCIAS.mensal).rotulo;
        out.push({
          id: o.id + "@" + dt.chave, serieId: o.id, mes, chave: dt.chave, data, descricao: o.descricao, tipoRecorrencia: rotulo,
          recorrencia: o.recorrencia, parcela: dt.parcela || null, parcelaTotal: o.parcelaTotal,
          categoriaId: o.categoriaId,
          categoria: cat ? { nome: cat.nome, icone: cat.icone, cor: cat.cor } : null,
          valor: lanc ? lanc.valor : (dt.k > 0 && o.valorParcela ? o.valorParcela : o.valor),
          // Um lançamento com data futura é agendamento, não pagamento
          pago: R().recorrencias.pagoSomenteComLancamento ? !!lanc && lanc.data <= hoje : (!!lanc || data <= hoje),
          lancamentoId: lanc ? lanc.id : null,
          encerrada: !!o.encerradaEm,
        });
      });
    });
    return out.sort((a, b) => a.data.localeCompare(b.data));
  }

  function getRecorrencias(d?: Dados): RespostaRecorrencias {
    const mes = d && /^\d{4}-\d{2}$/.test(d.mes || "") ? d.mes : mesAtual();
    const lista = ocorrencias(mes);
    return {
      mes,
      resumo: {
        restante: r2(lista.filter((o) => !o.pago).reduce((s, o) => s + o.valor, 0)),
        pago: r2(lista.filter((o) => o.pago).reduce((s, o) => s + o.valor, 0)),
      },
      recorrencias: lista,
      // Séries ativas sem ocorrência neste mês (ex.: trimestral) com a próxima data
      proximas: proximasSeries(mes, lista),
      // Séries arquivadas
      arquivadas: doc.lancamentos.filter((o) => ehOrigem(o) && o.encerradaEm).map((o) => itemSerie(o, o.data, mes, null, "arquivada")),
    };
  }

  function itemSerie(o: Lancamento, data: string, mes: string, parcela: number | null | undefined, sufixo: string): ItemRecorrencia {
    const cat = doc.categorias.find((c) => c.id === o.categoriaId);
    return {
      id: o.id + "@" + sufixo, serieId: o.id, mes, chave: sufixo, data, descricao: o.descricao,
      tipoRecorrencia: o.recorrencia === "parcelada" ? "Parcela " + (parcela || o.parcelaAtual) + "/" + o.parcelaTotal : (freq(o.recorrencia) || FREQUENCIAS.mensal).rotulo,
      recorrencia: o.recorrencia, parcela, parcelaTotal: o.parcelaTotal, categoriaId: o.categoriaId,
      categoria: cat ? { nome: cat.nome, icone: cat.icone, cor: cat.cor } : null,
      valor: parcela && parcela !== o.parcelaAtual && o.valorParcela ? o.valorParcela : o.valor,
      pago: false, lancamentoId: null, encerrada: !!o.encerradaEm, proxima: sufixo === "proxima",
    };
  }

  function proximasSeries(mes: string, doMes: ItemRecorrencia[]) {
    const comOcorrencia = new Set(doMes.map((x) => x.serieId));
    const out: ItemRecorrencia[] = [];
    doc.lancamentos.filter((o) => ehOrigem(o) && !o.encerradaEm && !comOcorrencia.has(o.id)).forEach((o) => {
      for (let k = 1; k <= 24; k++) {
        const m = mesSomado(mes, k);
        const dt = datasDaSerie(o, m).find((x) => !(o.ignorados || []).includes(x.chave));
        if (dt) { out.push(itemSerie(o, dt.data, m, dt.parcela, "proxima")); return; }
      }
    });
    return out.sort((a, b) => a.data.localeCompare(b.data));
  }

  /* ---------------- categorias ---------------- */
  function gastoNoMes(catId: Id, mes: string) {
    const sinais = R().categorias.sinalGastoPorTipo;
    return doc.lancamentos.reduce((s, l) => {
      if (l.categoriaId !== catId || mesDe(l.data) !== mes) return s;
      const sinal = sinais[l.tipo] === undefined ? 0 : sinais[l.tipo];
      return s + sinal * l.valor;
    }, 0);
  }
  /** Orçamento de uma categoria no mês: valor do mês (se definido) ou o orçamento fixo */
  function reservadoNoMes(c: Categoria, mes: string): number {
    return c.orcamentos && c.orcamentos[mes] !== undefined ? c.orcamentos[mes] : (c.reservado || 0);
  }

  /**
   * Orçamento do grupo no mês. O "não atribuído" (fixo ou só do mês) cobre, na leitura, o que falta para
   * cada categoria do grupo sair do vermelho (maior estouro primeiro); o que sobra continua sem atribuir.
   * Calculado na hora (nada é gravado nas categorias): salvar de novo não cobre o mesmo estouro duas vezes
   * e um gasto novo já é coberto. cats = categorias regulares do grupo com { id, gasto, reservado próprio }.
   */
  function infoGrupo(nome: string, mes: string, cats: Array<{ id: Id; gasto: number; reservado: number }>) {
    const g: Partial<GrupoOrcamento> = doc.grupos[chaveGrupo(nome)] || {};
    const porMes = !!(g.orcamentos && g.orcamentos[mes] !== undefined);
    const bruto = Number(porMes ? (g.orcamentos as Record<string, number>)[mes] : g.naoAtribuido);
    const base = Number.isFinite(bruto) && bruto > 0 ? Math.round(bruto * 100) : 0;
    let restante = Math.max(base, 0);
    const cobertura: Record<string, number> = {};
    cats.map((c) => ({ c, estouro: Math.round((c.gasto - c.reservado) * 100) }))
      .filter((x) => x.estouro > 0).sort((a, b) => b.estouro - a.estouro)
      .forEach((x) => { const t = Math.min(x.estouro, restante); if (t > 0) { cobertura[x.c.id] = t / 100; restante -= t; } });
    const subcategorias = r2(cats.reduce((s, c) => s + c.reservado + (cobertura[c.id] || 0), 0));
    return { nome, naoAtribuido: restante / 100, naoAtribuidoBase: base / 100, naoAtribuidoFixo: r2(g.naoAtribuido || 0), porMes,
      coberto: r2((base - restante) / 100), cobertura, subcategorias, total: r2(subcategorias + restante / 100) };
  }

  function getCategorias(d?: Dados): RespostaCategorias {
    const mes = d && /^\d{4}-\d{2}$/.test(d.mes || "") ? d.mes : mesAtual();
    const usadas = new Set(doc.lancamentos.map((l) => l.categoriaId).filter(Boolean));
    const categorias: CategoriaTela[] = doc.categorias.map((c) => Object.assign({}, c, {
      usada: usadas.has(c.id),                                                   // tem transação (não pode sair do orçamento)
      gasto: r2(Math.max(gastoNoMes(c.id, mes), 0)),
      reservado: reservadoNoMes(c, mes),
      reservadoFixo: c.reservado || 0,
      orcamentoPorMes: !!(c.orcamentos && Object.keys(c.orcamentos).length),
    }));
    const reg = categorias.filter((c) => c.status === "regular");
    // Grupos: "não atribuído" (orçamento do grupo além das subcategorias) do mês; a parte que cobre
    // o estouro de uma categoria passa a contar no "reservado" dela
    const grupos: Record<string, Omit<ReturnType<typeof infoGrupo>, "cobertura">> = {};
    reg.forEach((c) => {
      if (!c.grupo || grupos[c.grupo]) return;
      const { cobertura, ...info } = infoGrupo(c.grupo, mes, reg.filter((x) => x.grupo === c.grupo));
      Object.keys(cobertura).forEach((id) => {
        const cat = reg.find((x) => x.id === id);
        if (!cat) return;
        cat.reservado = r2(cat.reservado + cobertura[id]);
        cat.coberturaGrupo = cobertura[id];
      });
      grupos[c.grupo] = info;
    });
    const naoAtribuido = Object.keys(grupos).reduce((s, g) => s + grupos[g].naoAtribuido, 0);
    return {
      mes,
      resumo: { gasto: r2(reg.reduce((s, c) => s + c.gasto, 0)), reservado: r2(reg.reduce((s, c) => s + c.reservado, 0) + naoAtribuido) },
      categorias,
      grupos,
    };
  }
  function lerCategoria(entrada: Dados | null | undefined) {
    const e: Dados = entrada || {};
    const nome = texto(e && e.nome, NOME());
    if (!nome) throw erro("OPERATION_FAILED");
    const reservado = numero(e.reservado);
    return {
      nome, icone: texto(e.icone, 8) || "•", cor: cor(e.cor), grupo: texto(e.grupo, 60) || null,
      reservado: reservado > 0 ? r2(reservado) : 0, status: e.status === "excluida" ? "excluida" : "regular",
    };
  }

  /* ---------------- contas ---------------- */
  function lerConta(entrada: Dados | null | undefined) {
    const e: Dados = entrada || {};
    const nome = texto(e && e.nome, NOME());
    const tipo = TIPOS_CONTA.includes(e && e.tipo) ? e.tipo : null;
    const saldo = numero(e && e.saldo);
    const dig = texto(e && e.ultimos4Digitos, 4);
    if (!nome || !tipo || !Number.isFinite(saldo) || Math.abs(saldo) > 1e12 || (dig && !/^\d{4}$/.test(dig))) throw erro("OPERATION_FAILED");
    const dia = (v: unknown) => { const n = inteiro(v); return n >= 1 && n <= 31 ? n : null; };
    const limite = numero(e && e.limite);
    return {
      nome, tipo, saldo: r2(saldo), ultimos4Digitos: dig, cor: cor(e.cor), tipoInvestimento: tipo === "investimento" ? texto(e.tipoInvestimento, 40) || "Outros" : "",
      instituicao: texto(e.instituicao, NOME()), limite: limite > 0 ? r2(limite) : null, fechamento: dia(e.fechamento), vencimento: dia(e.vencimento),
      emprestimo: tipo === "emprestimo" ? lerEmprestimo(e.emprestimo) : null,
    };
  }
  /**
   * Dados do contrato de um empréstimo: valor contratado, 1º vencimento, parcelas (inteiro de 1 a 600) e valor da
   * parcela. O valor devido é o saldo da conta. Sem nada preenchido: null (empréstimo cadastrado só pelo saldo).
   */
  function lerEmprestimo(e: Dados | null | undefined): ContratoEmprestimo | null {
    if (!e || typeof e !== "object") return null;
    const valor = (v: unknown) => { if (v === undefined || v === null || v === "") return null; const n = numero(v); if (!Number.isFinite(n) || n < 0 || n > 1e12) throw erro("LOAN_INVALID"); return r2(n); };
    const contratado = valor(e.valorContratado), parcela = valor(e.valorParcela);
    let parcelas = null;
    if (e.parcelas !== undefined && e.parcelas !== null && e.parcelas !== "") {
      parcelas = /^\d{1,4}$/.test(String(e.parcelas).trim()) ? Number(e.parcelas) : NaN;
      if (!(parcelas >= 1 && parcelas <= 600)) throw erro("LOAN_INVALID");
    }
    let venc = null;
    if (e.primeiroVencimento) { venc = dataValida(e.primeiroVencimento); if (!venc) throw erro("LOAN_INVALID"); }
    if (contratado === null && parcela === null && parcelas === null && venc === null) return null;
    return { valorContratado: contratado, primeiroVencimento: venc, parcelas, valorParcela: parcela };
  }
  function registrarSaldo(c: Conta, saldo: number) {
    const hoje = hojeIso();
    const ultimo = c.historico[c.historico.length - 1];
    if (ultimo && ultimo.data === hoje) ultimo.saldo = saldo;
    else if (!ultimo || ultimo.saldo !== saldo) c.historico.push({ data: hoje, saldo });
  }

  /* ---------------- perfis ---------------- */
  function lerPerfil(entrada: Dados | null | undefined) {
    const e: Dados = entrada || {};
    const nome = texto(e && e.nome, NOME());
    if (!nome) throw erro("OPERATION_FAILED");
    const orc = numero(e && e.orcamento);
    return { nome, cor: cor(e.cor), orcamento: orc > 0 ? r2(orc) : 0 };
  }
  function gastoDoPerfil(perfilId: Id, mes: string) {
    const sinais = R().categorias.sinalGastoPorTipo;
    return r2(Math.max(doc.lancamentos.reduce((s, l) => (l.perfilId === perfilId && mesDe(l.data) === mes ? s + (sinais[l.tipo] || 0) * l.valor : s), 0), 0));
  }

  /* ---------------- ações ---------------- */
  const A = M.ACTIONS;
  // cada leitura devolve exatamente o tipo de ui/src/dados.d.ts (RespostasLeitura): o compilador confere
  const LEITURAS: { readonly [K in NomeLeitura]: (d: Dados) => RespostasLeitura[K] } = {
    [A.getLancamentos]: getLancamentos,
    /** Multicâmbio: transações das OUTRAS moedas, para trazer para a moeda escolhida (lê o documento inteiro) */
    [A.getLancamentosOutrasMoedas]: () => {
      exigir(cambioLiberado());
      const atual = moedaAtual();
      return { moeda: atual, lancamentos: doc.lancamentos.filter((l) => moedaDe(l) !== atual)
        .map((l) => ({ id: l.id, data: l.data, descricao: l.descricao, valor: l.valor, moeda: moedaDe(l), tipo: l.tipo, recorrencia: l.recorrencia || null }))
        .sort((a, b) => b.data.localeCompare(a.data)) };
    },
    [A.getContas]: getContas,
    [A.getInvestimentos]: (d) => getInvestimentos(d),
    [A.getCategorias]: getCategorias,
    [A.getRecorrencias]: getRecorrencias,
    [A.getPerfis]: () => {
      const mes = mesAtual();
      if (!avancado()) return { mes, perfis: [], resumo: { gasto: 0, lancamentosMes: 0 } };
      const perfis = doc.perfis.map((p) => Object.assign({ orcamento: 0, arquivado: false }, p, {
        gasto: gastoDoPerfil(p.id, mes),
        quantidade: doc.lancamentos.filter((l) => l.perfilId === p.id).length,
      }));
      const ativos = perfis.filter((p) => !p.arquivado);
      const lancamentosMes = doc.lancamentos.filter((l) => l.perfilId && mesDe(l.data) === mes && ativos.some((p) => p.id === l.perfilId)).length;
      return { mes, perfis, resumo: { gasto: r2(ativos.reduce((s, p) => s + p.gasto, 0)), lancamentosMes } };
    },
    [A.getConfig]: () => ({ foto: doc.config.foto || null, ultimaGravacao: doc.meta.ultimaGravacao || null, orcamentoAtivo: doc.config.orcamentoAtivo !== false,
      pix: pixLiberado() && doc.config.pix ? Object.assign({}, doc.config.pix) : null,
      multicambio: !!doc.config.multicambio, moeda: moedaAtual(), moedasIniciadas: (doc.config.moedasIniciadas || ["BRL"]).slice() }),
    [A.getContaHistorico]: (d) => {
      const c = doc.contas.find((x) => x.id === d.id);
      if (!c) throw erro("LOAD_FAILED");
      const ant = saldoEm(c, fimMesAnterior());
      return { conta: contaPublica(c), diferenca: r2(saldoAtual(c) - (ant === null ? saldoAtual(c) : ant)),
        serie: serieDiaria([c], (dt) => ({ data: dt, valor: saldoEm(c, dt) || 0 })) };
    },
    /**
     * O que o painel da conta mostra. Cartão: a fatura ABERTA — o ciclo que ainda recebe compras (do dia seguinte ao
     * fechamento anterior até o dia do próximo fechamento; sem fechamento, o mês) — com a "fatura anterior" (a dívida
     * de antes do ciclo, que o pagamento dela anula), as transações do ciclo até hoje com o valor de cada uma na fatura
     * (compra positiva; pagamento e estorno negativos) e a fatura atual (a dívida de agora).
     * Sempre: anterior + lançamentos = total. Outras contas: as transações do mês atual.
     * Lançamentos futuros (parcelas e recorrências) não entram.
     */
    [A.getExtratoConta]: (d) => {
      const c = doc.contas.find((x) => x.id === d.id);
      if (!c) throw erro("LOAD_FAILED");
      const hoje = hojeIso();
      const ordem = (a: LancamentoTela, b: LancamentoTela) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id);
      if (c.tipo !== "cartao") {
        const mes = mesAtual();
        return { tipo: "mes" as const, mes,
          lancamentos: doc.lancamentos.filter((l) => l.contaId === c.id && l.data.startsWith(mes) && l.data <= hoje).map(enriquecer).sort(ordem) };
      }
      let mes = mesAtual();
      let faixa = faixaDoCartao(c, mes);
      if (faixa && hoje >= faixa.fim) { mes = somarMes(mes, 1); faixa = faixaDoCartao(c, mes); }
      else if (faixa && hoje < faixa.inicio) { mes = somarMes(mes, -1); faixa = faixaDoCartao(c, mes); }
      const f = faixa;
      const doCiclo = doc.lancamentos.filter((l) => l.contaId === c.id && !l.valorInvalido && l.data <= hoje
        && (f ? l.data >= f.inicio && l.data < f.fim : l.data.startsWith(mes)));
      // efeito na dívida do cartão: compra soma; pagamento, estorno e receita subtraem (mesma regra do saldo)
      const efeitos = doCiclo.map((l) => r2(efeitoNoSaldo(l, c, hoje)));
      const total = r2(saldoAtual(c));
      return {
        tipo: "fatura" as const, mes, inicio: f ? f.inicio : null, fechamento: f ? diaAnterior(f.fim) : null,
        // a dívida aparece positiva (compra +, pagamento e estorno −): anterior + Σ naFatura = total
        anterior: r2(total - efeitos.reduce((s, e) => s + e, 0)), total,
        lancamentos: doCiclo.map((l, i) => Object.assign(enriquecer(l), { naFatura: efeitos[i] })).sort(ordem),
      };
    },
    [A.getCategoriaSerie]: (d) => {
      // Últimos 12 meses de gasto: de uma categoria ou de todas as regulares (id vazio)
      const alvo = d.categoriaId ? doc.categorias.filter((c) => c.id === d.categoriaId) : doc.categorias.filter((c) => c.status === "regular");
      const meses = [];
      const base = new Date(); base.setDate(1);
      for (let i = 11; i >= 0; i--) {
        const dt = new Date(base.getFullYear(), base.getMonth() - i, 1);
        const mes = dt.getFullYear() + "-" + pad(dt.getMonth() + 1);
        meses.push({ mes, gasto: r2(Math.max(alvo.reduce((s, c) => s + gastoNoMes(c.id, mes), 0), 0)) });
      }
      return { meses, reservado: r2(alvo.reduce((s, c) => s + (c.reservado || 0), 0)) };
    },
    [A.getSerieRecorrencia]: (d) => {
      const o = doc.lancamentos.find((l) => l.id === d.serieId);
      if (!o) throw erro("LOAD_FAILED");
      const pontos: Array<{ mes: string; data: string; valor: number; pago: boolean; futuro: boolean }> = [];
      const base = new Date(); base.setDate(1);
      for (let i = -9; i <= 2; i++) {
        const dt = new Date(base.getFullYear(), base.getMonth() + i, 1);
        const mes = dt.getFullYear() + "-" + pad(dt.getMonth() + 1);
        ocorrencias(mes).filter((x) => x.serieId === o.id).forEach((oc) => pontos.push({ mes, data: oc.data, valor: oc.valor, pago: oc.pago, futuro: i > 0 }));
      }
      const pagos = doc.lancamentos.filter((l) => l.id === o.id || l.serieId === o.id)
        .sort((a, b) => b.data.localeCompare(a.data)).map(enriquecer);
      return { pontos, lancamentos: pagos };
    },
    [A.getDashboard]: () => {
      const hoje = hojeIso();
      // Gasto mensal: acumulado dia a dia (regra em regras.totais.gasto) × orçamento total das categorias
      const mes = mesAtual();
      const T = R().totais.gasto;
      const ultimo = Number(dataNoMes(mes, 31).slice(8, 10));
      const porDia = new Array(ultimo + 1).fill(0);
      doc.lancamentos.forEach((l) => { if (mesDe(l.data) === mes) porDia[Number(l.data.slice(8, 10))] += (T[l.tipo] || 0) * l.valor; });
      const dias: Array<{ data: string; valor: number }> = []; let acc = 0;
      for (let dd = 1; dd <= ultimo; dd++) {
        acc += porDia[dd];
        const data = mes + "-" + pad(dd);
        if (data <= hoje) dias.push({ data, valor: r2(acc) });
      }
      const cats = getCategorias();
      return {
        gastoMensal: { mes, dias, total: r2(acc > 0 ? acc : 0), orcamento: cats.resumo.reservado, ultimoDia: ultimo },
        contas: getContas(), categorias: cats, recorrencias: getRecorrencias(),
        ultimosLancamentos: getLancamentos().lancamentos.filter((l) => l.data <= hoje).slice(0, 6),
      };
    },
    /**
     * Fatura (cobrança): transações de cartão de crédito de um perfil (ou de todos, "todos") num cartão (ou em todos),
     * o período de cada cartão e, só com UM perfil e todos os cartões, os ajustes guardados, os pagamentos recebidos,
     * o saldo anterior e o Pix (guardados por perfil e mês). Com Todos ou um cartão escolhido é só consulta
     * (regras em cobrancaDoMes / saldoAnterior).
     */
    [A.getBoletoData]: (d) => {
      exigir(boletoLiberado() && avancado());
      const mes = mesDoPedido(d);
      const todos = d.perfilId === TODOS;
      const perfil = todos ? null : doc.perfis.find((p) => p.id === d.perfilId) || null;
      let cartaoId: Id | null = null;
      if (d.cartaoId !== undefined && d.cartaoId !== null && d.cartaoId !== "" && d.cartaoId !== TODOS) {
        const c = doc.contas.find((x) => x.id === d.cartaoId && x.tipo === "cartao");
        if (!c) throw erro("OPERATION_FAILED");
        cartaoId = c.id;
      }
      const consulta = todos || !!cartaoId;
      const itens = perfil || todos ? cobrancaDoMes(perfil ? perfil.id : null, mes, cartaoId) : [];
      const guardada = perfil && !consulta ? doc.faturas[perfil.id + "|" + mes] : undefined;
      const ajustes = { contribuicoes: guardada ? guardada.contribuicoes : [], descontos: guardada ? guardada.descontos : [], arredondamentos: guardada ? guardada.arredondamentos : [] };
      // período de cada cartão que aparece na fatura (do dia seguinte ao fechamento anterior até o dia do fechamento)
      const periodos = doc.contas.filter((c) => c.tipo === "cartao" && (c.id === cartaoId || itens.some((l) => l.contaId === c.id))).map((c) => {
        const f = faixaDoCartao(c, mes);
        return { contaId: c.id, nome: c.nome, ultimos4Digitos: c.ultimos4Digitos || "", inicio: f ? f.inicio : mes + "-01", fim: f ? diaAnterior(f.fim) : dataNoMes(mes, 31), semFechamento: !f };
      });
      const cheia = !!perfil && !consulta;
      return {
        perfil, todos, cartaoId, consulta, mes, moeda: moedaAtual(),
        lancamentos: itens.map(enriquecer),
        ajustes, periodos,
        recebimentos: cheia && perfil ? recebimentosDoMes(perfil.id, mes).map(enriquecer) : [],
        saldoAnterior: cheia && perfil ? saldoAnterior(perfil.id, mes) : 0,
        // Pix da fatura: chave e nome do recebedor guardados no documento cifrado
        pix: cheia && pixLiberado() && moedaAtual() === "BRL" && doc.config.pix ? Object.assign({}, doc.config.pix) : null,
      };
    },
  };

  /* ---------------- Fatura de perfis (cobrança) ----------------
     • Entram as transações do perfil (ou de todos) em cartão de crédito (empréstimo não). Cartão com fechamento: as
       compras do dia seguinte ao fechamento anterior até o dia do fechamento do mês, inclusive; sem fechamento, o mês
       do calendário.
     • Pagar o CARTÃO (o par do tipo Fatura, o formato antigo e a transferência de entrada no cartão) é você pagando o
       banco: não aparece nem abate a cobrança do perfil. O que abate são os pagamentos RECEBIDOS do perfil (receberFatura).
     • Saldo anterior: a partir da 1ª fatura com pagamento registrado, o que ficou em aberto (ou pago a mais)
       em cada mês passa para o seguinte. Antes disso nada é cobrado de novo.
     • O total segue regras.boleto (sinal por tipo, contribuições, descontos e arredondamentos), em centavos. */
  const somarMes = (mes: string, n: number) => { const [a, m] = mes.split("-").map(Number); const d = new Date(a, m - 1 + n, 1); return d.getFullYear() + "-" + pad(d.getMonth() + 1); };
  const diaAnterior = (dataIso: string) => { const [a, m, d] = dataIso.split("-").map(Number); return iso(new Date(a, m - 1, d - 1)); };
  const diaSeguinte = (dataIso: string) => { const [a, m, d] = dataIso.split("-").map(Number); return iso(new Date(a, m - 1, d + 1)); };
  const MES_FATURA = /^(\d{4})-(\d{2})$/;
  const TODOS = "todos";                                      // perfil ou cartão "Todos" na fatura
  const mesFaturaValido = (v: unknown) => { const m = MES_FATURA.exec(String(v || "")); return !!m && Number(m[1]) >= 2000 && Number(m[1]) <= 2100 && Number(m[2]) >= 1 && Number(m[2]) <= 12; };
  /** Mês da fatura pedido pela interface ({ mes: 1–12, ano: 2000–2100 }, só inteiros) → "AAAA-MM" */
  function mesDoPedido(d: Dados): string {
    const ano = numero(d.ano), mes = numero(d.mes);                    // só número inteiro ("3x" é recusado)
    if (!(Number.isInteger(ano) && Number.isInteger(mes) && ano >= 2000 && ano <= 2100 && mes >= 1 && mes <= 12)) throw erro("OPERATION_FAILED");
    return ano + "-" + pad(mes);
  }
  /**
   * Compras de um cartão que entram na fatura do mês: do dia SEGUINTE ao fechamento anterior até o dia do fechamento
   * do mês, inclusive (fecha dia 5: compra no dia 5 entra; no dia 6, vai para a fatura seguinte). Devolve [inicio, fim)
   * com fim = dia seguinte ao fechamento, para comparar datas com >= e <. Sem fechamento: null (mês do calendário).
   */
  function faixaDoCartao(c: Conta, mes: string): { inicio: string; fim: string } | null {
    const f = Number(cicloDoCartao(c, mes).fechamento), fa = Number(cicloDoCartao(c, somarMes(mes, -1)).fechamento);
    if (!(f >= 1 && fa >= 1)) return null;
    return { inicio: diaSeguinte(dataNoMes(somarMes(mes, -1), fa)), fim: diaSeguinte(dataNoMes(mes, f)) };
  }
  // pagamento do cartão gravado antes da marca pagamentoCartao (3.17 e anteriores): o texto que o "Pagar fatura" gerava
  const PAGAMENTO_ANTIGO = "Pagamento da fatura do cartão de crédito ";
  function pagamentoDoCartao(l: Lancamento, conta: Conta): boolean {
    if (l.tipo === "fatura") return true;
    if (conta.tipo !== "cartao") return false;
    if (l.tipo === "interno") return l.sentido === "entrada";
    return l.tipo === "receita" && (!!l.pagamentoCartao || (l.descricao === "Pagamento fatura" && String(l.notas || "").startsWith(PAGAMENTO_ANTIGO)));
  }
  /**
   * Transações cobradas na fatura do mês, em ordem de data: só cartão de crédito. perfilId null = todos os perfis
   * (inclusive as compras sem perfil, nos cartões da moeda atual); cartaoId null = todos os cartões.
   */
  function cobrancaDoMes(perfilId: Id | null, mes: string, cartaoId: Id | null = null): Lancamento[] {
    const contas = new Map(doc.contas.filter((c) => c.tipo === "cartao" && (!cartaoId || c.id === cartaoId)
      && (perfilId || moedaDe(c) === moedaAtual())).map((c) => [c.id, c] as const));
    const faixas = new Map<Id, { inicio: string; fim: string } | null>();
    return doc.lancamentos.filter((l) => {
      const c = (perfilId === null || l.perfilId === perfilId) && !l.valorInvalido && l.contaId ? contas.get(l.contaId) : undefined;
      if (!c || pagamentoDoCartao(l, c)) return false;
      if (!faixas.has(c.id)) faixas.set(c.id, faixaDoCartao(c, mes));
      const f = faixas.get(c.id);
      return f ? l.data >= f.inicio && l.data < f.fim : l.data.startsWith(mes);
    }).sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
  }
  /** Pagamentos recebidos do perfil para a fatura do mês */
  const recebimentosDoMes = (perfilId: Id, mes: string) => doc.lancamentos
    .filter((l) => l.tipo === "receita" && l.perfilId === perfilId && l.faturaPerfil === mes && !l.valorInvalido)
    .sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
  const centavos = (v: unknown) => { const n = numero(v); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
  /**
   * Total de uma fatura pelas regras de regras.boleto, em centavos (cada linha arredondada antes de somar: o total
   * confere com as linhas exibidas). A tela usa a mesma conta (ZoZo.servico.calcularFatura) enquanto os ajustes são editados.
   */
  function calcularFatura(f: { lancamentos?: Array<{ valor: unknown; tipo: string }>; contribuicoes?: Array<{ valor: unknown }>; descontos?: Array<{ valor: unknown }>;
    arredondamentos?: Array<{ valor: unknown }>; saldoAnterior?: unknown; recebido?: unknown }) {
    const B = R().boleto;
    const sinal = (tipo: string) => (Object.hasOwn(B.sinalPorTipo, tipo) ? B.sinalPorTipo[tipo] : 1);
    const lanc = (f.lancamentos || []).reduce((s, l) => s + centavos(l.valor) * sinal(l.tipo), 0);
    const contrib = (f.contribuicoes || []).reduce((s, x) => s + Math.abs(centavos(x.valor)), 0) * B.sinalContribuicao;
    const desc = (f.descontos || []).reduce((s, x) => s + Math.abs(centavos(x.valor)), 0) * B.sinalDesconto;
    const arr = (f.arredondamentos || []).reduce((s, x) => s + centavos(x.valor), 0) * B.sinalArredondamento;
    const total = lanc + contrib + desc + arr, anterior = centavos(f.saldoAnterior || 0), recebido = centavos(f.recebido || 0);
    return { lancamentos: lanc / 100, contribuicoes: contrib / 100, descontos: desc / 100, arredondamentos: arr / 100, total: total / 100,
      saldoAnterior: anterior / 100, recebido: recebido / 100, aPagar: (total + anterior - recebido) / 100 };
  }
  const somaRecebida = (lista: Lancamento[]) => lista.reduce((s, l) => s + centavos(l.valor), 0) / 100;
  /** O que ficou em aberto (positivo) ou pago a mais (negativo) nas faturas anteriores, desde a 1ª com pagamento registrado */
  function saldoAnterior(perfilId: Id, mes: string): number {
    const meses = doc.lancamentos.filter((l) => l.tipo === "receita" && l.perfilId === perfilId && mesFaturaValido(l.faturaPerfil)).map((l) => l.faturaPerfil as string).sort();
    if (!meses.length || meses[0] >= mes) return 0;
    let saldo = 0;
    for (let k = meses[0], n = 0; k < mes && n < 1200; k = somarMes(k, 1), n++) {
      const g = doc.faturas[perfilId + "|" + k];
      const t = calcularFatura(Object.assign({ lancamentos: cobrancaDoMes(perfilId, k) }, g || {}));
      saldo += centavos(t.total) - centavos(somaRecebida(recebimentosDoMes(perfilId, k)));
    }
    return saldo / 100;
  }
  /** Ajustes enviados pela interface: até 30 por tipo, nome no limite, valor finito (negativo só onde a regra aceita) */
  function lerAjustes(v: unknown, aceitaNegativo: boolean): AjusteFatura[] {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v) || v.length > 30) throw erro("OPERATION_FAILED");
    return v.map((x) => {
      const valor = numero(objeto(x) ? x.valor : undefined);
      if (!Number.isFinite(valor) || Math.abs(valor) > 1e12) throw erro("OPERATION_FAILED");
      return { descricao: texto(objeto(x) ? x.descricao : "", NOME()), valor: r2(aceitaNegativo ? valor : Math.abs(valor)) };
    }).filter((x) => x.descricao || x.valor);
  }

  /**
   * Editar o pagamento de fatura (a transação do pagante): valor, data, conta pagante, perfil, categoria, nome e notas.
   * O tipo não muda. A transação do cartão acompanha valor, data, nome e notas. Valor maior ou outra conta: as mesmas
   * regras do "Pagar fatura" (até a dívida do cartão e até o saldo da conta, contando o que este pagamento já tirou).
   */
  function editarPagamentoFatura(antigo: Lancamento, e: Dados): Lancamento {
    if (!antigo.pagamento || antigo.pagamento.lado !== "pagante") throw erro("OPERATION_FAILED");
    if (e.tipo !== undefined && e.tipo !== "fatura") throw erro("PAYMENT_TYPE_LOCKED");
    const par = parDoPagamento(antigo);
    const cartao = par ? doc.contas.find((c) => c.id === par.contaId && c.tipo === "cartao") : undefined;
    const data = dataValida(e.data), valor = numero(e.valor), descricao = texto(e.descricao, NOME());
    if (!data || !descricao || !(r2(valor) > 0) || valor > 1e12) throw erro("OPERATION_FAILED");
    const conta = doc.contas.find((c) => c.id === e.contaId);
    if (!conta || !CONTAS_PAGAMENTO.includes(conta.tipo) || moedaDe(conta) !== moedaDe(antigo)) throw erro("PAYMENT_ACCOUNT");
    const comPerfis = avancado() && doc.perfis.some((p) => !p.arquivado && moedaDe(p) === moedaDe(antigo));
    const perfilId = avancado() ? perfilPermitido(e.perfilId, antigo) : antigo.perfilId || null;
    if (comPerfis && !perfilId) throw erro("PROFILE_REQUIRED");
    const c = (v: number) => Math.round(v * 100);
    const subiu = c(valor) > c(antigo.valor), outraConta = conta.id !== antigo.contaId;
    if (cartao && subiu) {
      // dívida antes deste pagamento = dívida de agora + o que ele já abateu
      const abatido = par && par.efeito ? -par.efeito.delta : 0;
      if (c(valor) > c(saldoAtual(cartao) + abatido)) throw erro("PAYMENT_ABOVE_INVOICE");
    }
    if (subiu || outraConta) {
      const devolvido = antigo.efeito && antigo.efeito.contaId === conta.id ? -antigo.efeito.delta : 0;
      if (c(valor) > c(saldoAtual(conta) + devolvido)) throw erro("INSUFFICIENT_FUNDS");
    }
    const notas = texto(e.notas, 2000);
    Object.assign(antigo, { data, valor: r2(valor), descricao, notas, contaId: conta.id, perfilId, categoriaId: existe(doc.categorias, e.categoriaId), competencia: mesDe(data) });
    if (par) Object.assign(par, { data, valor: r2(valor), descricao, notas, competencia: mesDe(data) });
    return antigo;
  }

  // cada gravação devolve exatamente RespostasEscrita[ação] (ui/src/dados.d.ts): o compilador confere
  const ESCRITAS: { readonly [K in NomeEscrita]: (d: Dados) => RespostasEscrita[K] } = {
    /* Lançamentos */
    [A.createLancamento]: (d) => {
      const tipo = d.lancamento && d.lancamento.tipo === "recorrente" ? "recorrencia" : "lancamento";
      conferirLimiteDemo(tipo);
      const l = Object.assign({ id: novoId("l") }, lerLancamento(d.lancamento, null));
      doc.lancamentos.push(l);
      sincronizarParcelas();
      contarDemo(tipo);
      return { lancamento: enriquecer(l) };
    },
    [A.updateLancamento]: (d) => {
      const i = doc.lancamentos.findIndex((l) => l.id === d.id);
      if (i < 0) throw erro("OPERATION_FAILED");
      const antigo = doc.lancamentos[i];
      if (antigo.tipo === "fatura") return { lancamento: enriquecer(editarPagamentoFatura(antigo, objeto(d.lancamento) ? d.lancamento : {})) };
      const novo = Object.assign({ id: d.id }, lerLancamento(d.lancamento, antigo));
      const divisaoAntiga = antigo.divisao;
      if (divisaoAntiga) {
        novo.divisao = divisaoAntiga;
        // Partes de uma divisão têm sempre a mesma data
        if (novo.data !== antigo.data) doc.lancamentos.forEach((l) => { if (l.divisao && l.divisao.id === divisaoAntiga.id) l.data = novo.data; });
      }
      const eraOrigem = ehOrigem(antigo);
      if (!eraOrigem && antigo.serieId) { novo.automatico = !!antigo.automatico; novo.editado = true; }   // parcela ajustada à mão
      if (eraOrigem && antigo.ignorados) novo.ignorados = antigo.ignorados;
      doc.lancamentos[i] = novo;
      if (eraOrigem) {
        // Origem alterada: parcelas futuras automáticas são refeitas com os novos dados
        removerParcelasFuturas(d.id);
        if (!ehOrigem(novo)) desligarSerie(d.id);
        sincronizarParcelas();
      }
      if (novo.divisao) ajustarDivisao(novo.divisao.id);
      return { lancamento: enriquecer(novo) };
    },
    [A.deleteLancamento]: (d) => {
      const alvo = doc.lancamentos.find((l) => l.id === d.id);
      if (!alvo) throw erro("OPERATION_FAILED");
      // Excluir a origem: parcelas futuras automáticas saem; pagamentos já registrados ficam
      encerrarSerieDe(alvo);
      // pagamento de fatura: as duas transações saem juntas (e cada uma devolve o efeito no saldo)
      const ids = comOsPares([alvo.id]);
      doc.lancamentos.filter((l) => ids.has(l.id)).forEach(reverterEfeito);   // transação excluída devolve o efeito no saldo
      doc.lancamentos = doc.lancamentos.filter((l) => !ids.has(l.id));
      if (alvo.divisao) ajustarDivisao(alvo.divisao.id);
      return { id: d.id };
    },

    /* Recorrências */
    [A.pagarRecorrencia]: (d) => {
      const o = doc.lancamentos.find((l) => l.id === d.serieId && ehOrigem(l));
      const mes = /^\d{4}-\d{2}$/.test(d.mes || "") ? d.mes : null;
      if (!o || !mes) throw erro("OPERATION_FAILED");
      const oc = ocorrencias(mes).find((x) => x.serieId === o.id && (!d.chave || x.chave === d.chave));
      if (!oc) throw erro("OPERATION_FAILED");
      const hoje = hojeIso();
      if (oc.lancamentoId) {
        // Já existe lançamento agendado para esta ocorrência: o pagamento passa a ser hoje
        const existente = doc.lancamentos.find((l) => l.id === oc.lancamentoId);
        if (existente && existente.data > hoje) existente.data = hoje;
        return { lancamentoId: oc.lancamentoId };
      }
      const valor = numero(d.valor) > 0 ? r2(numero(d.valor)) : o.valor;
      const l: Lancamento = {
        id: novoId("l"), data: dataValida(d.data) || hoje, descricao: o.descricao, valor, tipo: "recorrente",
        contaId: o.contaId, categoriaId: o.categoriaId, perfilId: o.perfilId, notas: "",
        recorrencia: o.recorrencia, parcelaAtual: oc.parcela, parcelaTotal: o.parcelaTotal || null,
        serieId: o.id, competencia: mes, ocorrencia: oc.chave, encerradaEm: null, moeda: moedaDe(o),
      };
      if (o.debito) l.debito = true;
      doc.lancamentos.push(l);
      return { lancamentoId: l.id };
    },
    /** Transforma um lançamento existente na origem de uma recorrência (modal "Nova recorrência") */
    [A.tornarRecorrente]: (d) => {
      conferirLimiteDemo("recorrencia");
      const l = doc.lancamentos.find((x) => x.id === d.id);
      if (!l || l.tipo === "fatura" || (l.serieId && l.serieId !== l.id && !String(l.serieId).startsWith("removida:"))) throw erro("OPERATION_FAILED");
      const rec = recorrenciaValida(d.recorrencia);
      let pa = null, pt = null;
      if (rec === "parcelada") {
        pa = inteiro(d.parcelaAtual); pt = inteiro(d.parcelaTotal);
        if (!(pa >= 1 && pt >= 2 && pa <= pt && pt <= 999)) throw erro("OPERATION_FAILED");
      }
      // Lançamento dividido: todas as partes viram recorrentes (cada parte é uma série, com o perfil dela)
      const grupoDivisao = l.divisao && l.divisao.id;
      const alvos = grupoDivisao ? doc.lancamentos.filter((x) => x.divisao && x.divisao.id === grupoDivisao) : [l];
      const total = numero(d.valorTotal);
      const eraDebito = l.tipo === "debito" || !!l.debito;                   // débito recorrente continua saindo da conta
      alvos.forEach((x) => {
        Object.assign(x, { parcelaAtual: pa, parcelaTotal: pt, tipo: "recorrente", recorrencia: rec, serieId: null, competencia: mesDe(x.data),
          encerradaEm: null, sentido: null, direcao: null });
        if (eraDebito) x.debito = true;
        delete x.valorParcela; delete x.valorTotal;
        // Parcelado pelo valor total da compra (só lançamento não dividido): 141,00 em 7x → 20,16 + 6 × 20,14
        if (rec === "parcelada" && !l.divisao && total > 0 && total < 1e12) {
          const v = valoresParcelas(total, pa as number, pt as number);            // parcelada: pa e pt já conferidos acima
          if (!(v.demais > 0)) throw erro("OPERATION_FAILED");
          x.valor = v.primeira; x.valorParcela = v.demais; x.valorTotal = r2(total);
        }
      });
      sincronizarParcelas();
      contarDemo("recorrencia");
      return { serieId: l.id };
    },
    /** Liga um lançamento a uma recorrência existente (vira um pagamento dela) */
    [A.vincularRecorrencia]: (d) => {
      const l = doc.lancamentos.find((x) => x.id === d.id);
      const o = doc.lancamentos.find((x) => x.id === d.serieId && ehOrigem(x));
      if (!l || !o || l.id === o.id || ehOrigem(l) || l.tipo === "fatura") throw erro("OPERATION_FAILED");
      if (l.divisao) throw erro("SPLIT_INVALID");                           // parte de divisão não entra em recorrência
      const mes = mesDe(l.data);
      Object.assign(l, { tipo: "recorrente", recorrencia: o.recorrencia, serieId: o.id, competencia: mes, ocorrencia: l.data, sentido: null,
        parcelaAtual: o.recorrencia === "parcelada" ? (o.parcelaAtual || 0) + diffMeses(o.competencia || mesDe(o.data), mes) : null,
        parcelaTotal: o.recorrencia === "parcelada" ? o.parcelaTotal : null });
      return { serieId: o.id };
    },
    [A.desvincularRecorrencia]: (d) => {
      const l = doc.lancamentos.find((x) => x.id === d.id);
      if (!l) throw erro("OPERATION_FAILED");
      if (ehOrigem(l)) { removerParcelasFuturas(l.id); desligarSerie(l.id); }
      Object.assign(l, { tipo: "regular", recorrencia: null, parcelaAtual: null, parcelaTotal: null, serieId: null });
      return { id: l.id };
    },

    /**
     * Dividir lançamento entre perfis (ex.: conta rachada paga com um único cartão).
     * Cada parte vira um lançamento com o mesmo grupo de divisão. Validações (repetidas aqui
     * mesmo que a interface já valide): mesma data, soma igual ao valor original (centavo a
     * centavo), categoria e perfil em todas, sem perfil repetido. Recorrentes não podem.
     * Uma única parte desfaz a divisão.
     */
    [A.dividirLancamento]: (d) => {
      exigir(avancado());                                                     // divisão é entre perfis
      const base = doc.lancamentos.find((l) => l.id === d.id);
      // Recorrente: a ORIGEM da série vira uma série por parte (cada uma com o seu perfil). Uma OCORRÊNCIA já
      // lançada (membro da série) divide só aquele mês: todas as partes continuam na mesma série e competência.
      if (!base || base.tipo === "fatura") throw erro("SPLIT_INVALID");     // pagamento de fatura não se divide
      const recorrente = base.tipo === "recorrente" && ehOrigem(base);
      const grupoBase = base.divisao && base.divisao.id;
      const membros = grupoBase ? doc.lancamentos.filter((l) => l.divisao && l.divisao.id === grupoBase) : [base];
      const total = base.divisao ? base.divisao.total : base.valor;
      const partes = Array.isArray(d.partes) ? d.partes : [];
      if (partes.length < 1 || partes.length > 30) throw erro("SPLIT_INVALID");
      const centavos: number[] = partes.map((p: Dados) => Math.round(numero(p.valor) * 100));
      if (centavos.some((c) => !(c > 0))) throw erro("SPLIT_INVALID");
      if (centavos.reduce((s, c) => s + c, 0) !== Math.round(total * 100)) throw erro("SPLIT_INVALID");
      if (partes.some((p: Dados) => p.data !== base.data)) throw erro("SPLIT_INVALID");
      const perfis: unknown[] = partes.map((p: Dados) => p.perfilId);
      if (perfis.some((id) => !id || !doc.perfis.some((x) => x.id === id)) || new Set(perfis).size !== perfis.length) throw erro("SPLIT_INVALID");
      if (partes.some((p: Dados) => !p.categoriaId || !doc.categorias.some((c) => c.id === p.categoriaId))) throw erro("SPLIT_INVALID");

      const grupo = (base.divisao && base.divisao.id) || novoId("d");
      if (recorrente) {
        // as parcelas futuras automáticas das séries atuais saem e são refeitas por parte, com o novo valor
        membros.forEach((m) => { if (ehOrigem(m)) { removerParcelasFuturas(m.id); if (m !== base) desligarSerie(m.id); } });
      }
      membros.forEach((m) => { if (m !== base) reverterEfeito(m); });
      doc.lancamentos = doc.lancamentos.filter((l) => l === base || !membros.includes(l));
      partes.forEach((p: Dados, i: number) => {
        const alvo = i === 0 ? base : Object.assign({}, base, { id: novoId("l") });
        if (i > 0) { delete alvo.efeito; if (recorrente) alvo.serieId = null; }
        delete alvo.valorParcela; delete alvo.valorTotal;
        Object.assign(alvo, {
          descricao: texto(p.descricao, NOME()) || base.descricao, valor: centavos[i] / 100, data: base.data,
          categoriaId: p.categoriaId, perfilId: p.perfilId,
          divisao: partes.length > 1 ? { id: grupo, total: r2(total), partes: partes.length } : null,
        });
        if (i > 0) doc.lancamentos.push(alvo);
      });
      if (partes.length === 1) delete base.divisao;
      if (recorrente) sincronizarParcelas();
      return { id: base.id, grupo };
    },

    [A.excluirRecorrencia]: (d) => {
      const o = doc.lancamentos.find((l) => l.id === d.serieId && ehOrigem(l));
      if (!o) throw erro("OPERATION_FAILED");
      removerParcelasFuturas(o.id);
      doc.lancamentos.forEach((l) => {
        if (l.id !== o.id && l.serieId !== o.id) return;
        Object.assign(l, { tipo: "regular", recorrencia: null, parcelaAtual: null, parcelaTotal: null, serieId: null, encerradaEm: null, ignorados: undefined });
      });
      return { serieId: o.id };
    },
    [A.encerrarRecorrencia]: (d) => {
      const o = doc.lancamentos.find((l) => l.id === d.serieId && ehOrigem(l));
      if (!o) throw erro("OPERATION_FAILED");
      o.encerradaEm = d.reabrir ? null : mesAtual();
      return { serieId: o.id };
    },

    /**
     * Pagar a fatura do cartão: Débito na conta escolhida + Receita no cartão, as duas na MESMA gravação
     * (ou entram as duas, ou nenhuma). Regras conferidas aqui, mesmo que a janela já confira: valor > 0 e até a
     * fatura em aberto; conta corrente, poupança ou outros, da mesma moeda, com saldo para o valor; perfil
     * obrigatório quando o recurso Perfis existe e há perfis ativos. Categoria do débito: "Fatura" (criada se faltar).
     */
    /** Ajustes da fatura de um perfil (contribuições, descontos, arredondamentos): ficam guardados para o mês */
    [A.salvarFatura]: (d) => {
      exigir(boletoLiberado() && avancado());
      const mes = mesDoPedido(d);
      const perfil = doc.perfis.find((p) => p.id === d.perfilId);
      if (!perfil) throw erro("OPERATION_FAILED");
      const f: FaturaGuardada = { contribuicoes: lerAjustes(d.contribuicoes, false), descontos: lerAjustes(d.descontos, false),
        arredondamentos: lerAjustes(d.arredondamentos, !!R().boleto.arredondamentoAceitaNegativo) };
      const chave = perfil.id + "|" + mes;
      if (f.contribuicoes.length + f.descontos.length + f.arredondamentos.length) doc.faturas[chave] = f; else delete doc.faturas[chave];
      return { ok: true };
    },
    /**
     * Pagamento recebido da fatura de um perfil: Receita na conta onde o dinheiro entrou (corrente, poupança ou
     * outros, da moeda do perfil), com o perfil, a categoria "Reembolso" (criada se faltar) e a marca do mês pago.
     */
    [A.receberFatura]: (d) => {
      exigir(boletoLiberado() && avancado());
      conferirLimiteDemo("pagamento");
      const mes = mesDoPedido(d);
      const perfil = doc.perfis.find((p) => p.id === d.perfilId);
      if (!perfil || moedaDe(perfil) !== moedaAtual()) throw erro("PROFILE_REQUIRED");
      if (perfil.arquivado) throw erro("PROFILE_ARCHIVED");
      const conta = doc.contas.find((c) => c.id === d.contaId);
      if (!conta || !CONTAS_PAGAMENTO.includes(conta.tipo) || moedaDe(conta) !== moedaDe(perfil)) throw erro("RECEIPT_ACCOUNT");
      const valor = numero(d.valor);
      if (!(r2(valor) > 0) || valor > 1e12) throw erro("PAYMENT_INVALID");
      const data = d.data === undefined || d.data === null || d.data === "" ? hojeIso() : dataValida(d.data);
      if (!data) throw erro("OPERATION_FAILED");
      const daMoeda = doc.categorias.filter((c) => moedaDe(c) === moedaDe(perfil) && c.nome.trim().toLowerCase() === "reembolso");
      let categoria = daMoeda.find((c) => c.status === "regular") || daMoeda[0];
      if (!categoria) {
        categoria = Object.assign({ id: novoId("k") }, lerCategoria({ nome: "Reembolso", icone: "💸" }), { moeda: moedaDe(perfil) });
        doc.categorias.push(categoria);
      }
      const nomeMes = ZoZo.format.mesAno(mes + "-01");
      const l = Object.assign({ id: novoId("l") }, lerLancamento({ tipo: "receita", data, valor, contaId: conta.id, categoriaId: categoria.id, perfilId: perfil.id,
        descricao: "Fatura " + perfil.nome, notas: "Pagamento recebido da fatura de " + perfil.nome + " (" + nomeMes + ")." }, null));
      l.faturaPerfil = mes;
      doc.lancamentos.push(l);
      contarDemo("pagamento");
      return { lancamento: enriquecer(l) };
    },
    [A.pagarFatura]: (d) => {
      conferirLimiteDemo("pagamento");
      const cartao = doc.contas.find((c) => c.id === d.cartaoId && c.tipo === "cartao");
      if (!cartao || moedaDe(cartao) !== moedaAtual()) throw erro("OPERATION_FAILED");
      const conta = doc.contas.find((c) => c.id === d.contaId);
      if (!conta || !CONTAS_PAGAMENTO.includes(conta.tipo) || moedaDe(conta) !== moedaDe(cartao)) throw erro("PAYMENT_ACCOUNT");
      const valor = numero(d.valor);
      if (!(r2(valor) > 0) || valor > 1e12) throw erro("PAYMENT_INVALID");
      const centavos = Math.round(valor * 100);
      if (!(saldoAtual(cartao) > 0)) throw erro("NO_INVOICE");
      if (centavos > Math.round(saldoAtual(cartao) * 100)) throw erro("PAYMENT_ABOVE_INVOICE");
      if (centavos > Math.round(saldoAtual(conta) * 100)) throw erro("INSUFFICIENT_FUNDS");
      const comPerfis = avancado() && doc.perfis.some((p) => !p.arquivado && moedaDe(p) === moedaDe(cartao));
      if (comPerfis && !d.perfilId) throw erro("PROFILE_REQUIRED");
      const perfilId = comPerfis ? perfilPermitido(d.perfilId, null) : null;
      if (comPerfis && !perfilId) throw erro("PROFILE_REQUIRED");
      // categoria "Fatura" da moeda (a regular primeiro); sem nenhuma, cria
      const daMoeda = doc.categorias.filter((c) => moedaDe(c) === moedaDe(cartao) && c.nome.trim().toLowerCase() === "fatura");
      let categoria = daMoeda.find((c) => c.status === "regular") || daMoeda[0];
      if (!categoria) {
        categoria = Object.assign({ id: novoId("k") }, lerCategoria({ nome: "Fatura", icone: "💳" }), { moeda: moedaDe(cartao) });
        doc.categorias.push(categoria);
      }
      const data = hojeIso();
      const notas = "Pagamento da fatura do cartão de crédito " + cartao.nome
        + (cartao.ultimos4Digitos ? " com 4 últimos dígitos " + cartao.ultimos4Digitos : "") + ".";
      // duas transações do tipo Fatura: a do pagante (conta e perfil escolhidos, aparece em Transações) e a do
      // cartão (abate a dívida, aparece só no painel do cartão). Nenhuma entra em gasto, orçamento ou cobrança de perfil.
      const grupo = novoId("f");
      const lado = (contaId: Id, extra: Partial<Lancamento>, ladoPag: "pagante" | "cartao"): Lancamento => Object.assign({
        id: novoId("l"), data, descricao: "Pagamento fatura", valor: centavos / 100, tipo: "fatura", contaId, categoriaId: null, perfilId: null, notas,
        recorrencia: null, parcelaAtual: null, parcelaTotal: null, sentido: null, direcao: null, serieId: null, competencia: mesDe(data),
        encerradaEm: null, moeda: moedaDe(cartao), pagamento: { grupo, lado: ladoPag },
      }, extra);
      const pagante = lado(conta.id, { categoriaId: categoria.id, perfilId }, "pagante");
      const doCartao = lado(cartao.id, {}, "cartao");
      doc.lancamentos.push(pagante, doCartao);
      contarDemo("pagamento");
      return { pagamento: enriquecer(pagante), cartao: enriquecer(doCartao) };
    },

    /* Contas */
    [A.createConta]: (d) => {
      const e = lerConta(d.conta);
      const tipoDemo = e.tipo === "cartao" ? "cartao" : "conta";
      conferirLimiteDemo(tipoDemo);
      const c: Conta = { id: novoId("c"), nome: e.nome, tipo: e.tipo, ultimos4Digitos: e.ultimos4Digitos, cor: e.cor, tipoInvestimento: e.tipoInvestimento,
        instituicao: e.instituicao, limite: e.limite, fechamento: e.fechamento, vencimento: e.vencimento, historico: [], moeda: moedaAtual() };
      if (e.emprestimo) c.emprestimo = e.emprestimo;
      registrarSaldo(c, e.saldo);
      doc.contas.push(c);
      contarDemo(tipoDemo);
      return { conta: contaPublica(c) };
    },
    /**
     * Cartão de crédito: fechamento E vencimento juntos (nunca só um), para todos os meses ("fixo") ou só para
     * um mês ("mes"). "Todos os meses" substitui também as exceções por mês.
     */
    [A.updateCicloCartao]: (d) => {
      const c = doc.contas.find((x) => x.id === d.id);
      if (!c || c.tipo !== "cartao") throw erro("OPERATION_FAILED");
      const dia = (v: unknown) => { const n = /^\d{1,2}$/.test(String(v).trim()) ? Number(v) : NaN; return n >= 1 && n <= 31 ? n : null; };
      const fechamento = dia(d.fechamento), vencimento = dia(d.vencimento);
      if (!fechamento || !vencimento) throw erro("CARD_CYCLE_INVALID");
      if (d.modo === "mes") {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(d.mes || "")) throw erro("CARD_CYCLE_INVALID");
        c.ciclos = Object.assign({}, c.ciclos || {}, { [d.mes]: { fechamento, vencimento } });
      } else {
        c.fechamento = fechamento; c.vencimento = vencimento;
        delete c.ciclos;
      }
      return { conta: contaPublica(c) };
    },
    [A.updateConta]: (d) => {
      const c = doc.contas.find((x) => x.id === d.id);
      if (!c) throw erro("OPERATION_FAILED");
      if (d.conta) {
        const e = lerConta(d.conta);
        Object.assign(c, { nome: e.nome, tipo: e.tipo, ultimos4Digitos: e.ultimos4Digitos, cor: e.cor, tipoInvestimento: e.tipoInvestimento,
          instituicao: e.instituicao, limite: e.limite, fechamento: e.fechamento, vencimento: e.vencimento });
        // contrato do empréstimo: troca só quando vem preenchido (edição sem esses campos não apaga); outro tipo de conta não guarda
        if (e.emprestimo) c.emprestimo = e.emprestimo; else if (e.tipo !== "emprestimo") delete c.emprestimo;
        registrarSaldo(c, e.saldo);
      } else if (d.cor) c.cor = cor(d.cor, c.cor);
      if (typeof d.oculta === "boolean") c.oculta = d.oculta;
      if (d.nome !== undefined) { const n = texto(d.nome, NOME()); if (!n) throw erro("OPERATION_FAILED"); c.nome = n; }
      if (d.saldo !== undefined) { const v = numero(d.saldo); if (!Number.isFinite(v) || Math.abs(v) > 1e12) throw erro("OPERATION_FAILED"); registrarSaldo(c, r2(v)); }
      // 4 últimos dígitos (editados no painel): exatamente 4 algarismos, ou vazio para tirar
      if (d.ultimos4Digitos !== undefined) {
        const dig = String(d.ultimos4Digitos === null ? "" : d.ultimos4Digitos).trim();
        if (dig && !/^\d{4}$/.test(dig)) throw erro("DIGITS_INVALID");
        c.ultimos4Digitos = dig;
      }
      return { conta: contaPublica(c), id: c.id, cor: c.cor };
    },
    [A.deleteConta]: (d) => {
      if (!doc.contas.some((c) => c.id === d.id)) throw erro("OPERATION_FAILED");
      doc.contas = doc.contas.filter((c) => c.id !== d.id);
      doc.lancamentos.forEach((l) => { if (l.contaId === d.id) l.contaId = null; });
      return { id: d.id };
    },

    /* Categorias */
    [A.createCategoria]: (d) => {
      conferirLimiteDemo("categoria");
      const c = Object.assign({ id: novoId("k") }, lerCategoria(d.categoria), { moeda: moedaAtual() });
      doc.categorias.push(c);
      contarDemo("categoria");
      return { categoria: c };
    },
    [A.updateCategoria]: (d) => {
      const c = doc.categorias.find((x) => x.id === d.id);
      if (!c) throw erro("OPERATION_FAILED");
      // Tirar do orçamento (Excluída) só categoria sem nenhuma transação: senão o histórico de gastos sumiria dos totais
      const pedeExcluida = (d.categoria && d.categoria.status === "excluida") || d.status === "excluida";
      if (pedeExcluida && c.status !== "excluida" && doc.lancamentos.some((l) => l.categoriaId === c.id)) throw erro("CATEGORY_IN_USE");
      if (d.categoria) Object.assign(c, lerCategoria(d.categoria));
      else if (d.cor) c.cor = cor(d.cor, c.cor);
      if (d.grupo !== undefined) c.grupo = texto(d.grupo, 60) || null;
      if (d.status !== undefined) c.status = d.status === "excluida" ? "excluida" : "regular";
      if (d.reservado !== undefined) { const v = numero(d.reservado); c.reservado = v > 0 ? r2(v) : 0; }
      if (d.modoOrcamento === "fixo") delete c.orcamentos;                       // mesmo orçamento para todos os meses
      if (d.orcamentoMes && /^\d{4}-\d{2}$/.test(d.orcamentoMes.mes || "")) {     // orçamento de um mês específico
        const v = numero(d.orcamentoMes.valor);
        c.orcamentos = Object.assign({}, c.orcamentos || {}, { [d.orcamentoMes.mes]: v > 0 ? r2(v) : 0 });
      }
      if (d.nome !== undefined) { const n = texto(d.nome, NOME()); if (!n) throw erro("OPERATION_FAILED"); c.nome = n; }
      if (d.icone !== undefined) c.icone = texto(d.icone, 8) || "•";
      return { categoria: c, id: c.id, cor: c.cor };
    },
    [A.deleteCategoria]: (d) => {
      const alvo = doc.categorias.find((c) => c.id === d.id);
      if (!alvo) throw erro("OPERATION_FAILED");
      doc.categorias = doc.categorias.filter((c) => c.id !== d.id);
      const temLancamentos = doc.lancamentos.some((l) => l.categoriaId === d.id);
      let outros = doc.categorias.find((c) => c.nome.toLowerCase() === "outros" && moedaDe(c) === moedaDe(alvo));
      if (temLancamentos && !outros && alvo.nome.toLowerCase() !== "outros") {
        outros = { id: novoId("k"), nome: "Outros", icone: "📦", cor: "#6078a9", grupo: null, reservado: 0, status: "regular", moeda: moedaDe(alvo) };
        doc.categorias.push(outros);
      }
      doc.lancamentos.forEach((l) => { if (l.categoriaId === d.id) l.categoriaId = outros ? outros.id : null; });
      return { id: d.id };
    },
    [A.createCategoriasSugeridas]: () => {
      if (ehDemo()) throw erro("DEMO_LIMIT");                                 // cria várias de uma vez
      (R().categoriasSugeridas || []).forEach((s) => {
        if (doc.categorias.some((c) => moedaDe(c) === moedaAtual() && c.nome.toLowerCase() === s.nome.toLowerCase())) return;
        doc.categorias.push(Object.assign({ id: novoId("k") }, lerCategoria(s), { moeda: moedaAtual() }));
      });
      return { total: doc.categorias.length };
    },

    /* Grupos de categorias */
    /**
     * Define o "não atribuído" do grupo. Se uma categoria do grupo já passou do orçamento no mês, o que
     * falta para ela sair do vermelho vem do não atribuído (maior estouro primeiro); o resto fica no grupo.
     * Ex.: A 2.000 (gastou 2.500), B 1.000 (gastou 2.000), não atribuído 4.000 → A +500, B +1.000, sobra 2.500.
     */
    [A.updateGrupo]: (d) => {
      const nome = texto(d.nome, 60);
      const cats = doc.categorias.filter((c) => moedaDe(c) === moedaAtual() && c.grupo === nome);
      if (!nome || !cats.length) throw erro("OPERATION_FAILED");
      const v = numero(d.naoAtribuido);
      if (!(v >= 0) || v > 1e12) throw erro("OPERATION_FAILED");
      const mes = /^\d{4}-\d{2}$/.test(d.mes || "") ? d.mes : mesAtual();
      // Grava só o valor do grupo; a cobertura dos estouros é calculada na leitura (infoGrupo)
      const chave = chaveGrupo(nome);
      const g = Object.assign({ naoAtribuido: 0, orcamentos: {} }, doc.grupos[chave]);
      g.orcamentos = Object.assign({}, g.orcamentos);
      if (d.modo === "mes") g.orcamentos[mes] = r2(v);
      else { g.naoAtribuido = r2(v); delete g.orcamentos[mes]; }
      doc.grupos[chave] = g;
      const info = infoGrupo(nome, mes, cats.filter((c) => c.status === "regular")
        .map((c) => ({ id: c.id, gasto: r2(Math.max(gastoNoMes(c.id, mes), 0)), reservado: reservadoNoMes(c, mes) })));
      return { coberto: info.coberto, restante: info.naoAtribuido };
    },
    [A.desagruparCategorias]: (d) => {
      const nome = texto(d.nome, 60);
      const cats = doc.categorias.filter((c) => moedaDe(c) === moedaAtual() && c.grupo === nome);
      if (!nome || !cats.length) throw erro("OPERATION_FAILED");
      cats.forEach((c) => { c.grupo = null; });
      delete doc.grupos[chaveGrupo(nome)];
      return { desagrupadas: cats.length };
    },

    /* Perfis */
    [A.createPerfil]: (d) => {
      exigir(avancado());
      conferirLimiteDemo("perfil");
      const e = lerPerfil(d.perfil);
      if (doc.perfis.some((p) => moedaDe(p) === moedaAtual() && p.nome.toLowerCase() === e.nome.toLowerCase())) throw erro("NAME_IN_USE");
      const p = Object.assign({ id: novoId("p") }, e, { moeda: moedaAtual() });
      doc.perfis.push(p);
      contarDemo("perfil");
      return { perfil: p };
    },
    [A.updatePerfil]: (d) => {
      exigir(avancado());
      const p = doc.perfis.find((x) => x.id === d.id);
      if (!p) throw erro("OPERATION_FAILED");
      if (d.perfil) {
        const e = lerPerfil(d.perfil);
        if (doc.perfis.some((x) => x.id !== p.id && x.nome.toLowerCase() === e.nome.toLowerCase())) throw erro("NAME_IN_USE");
        Object.assign(p, e);
      } else if (d.cor) p.cor = cor(d.cor, p.cor);
      if (d.nome !== undefined && !d.perfil) {
        const n = texto(d.nome, NOME());
        if (!n) throw erro("OPERATION_FAILED");
        if (doc.perfis.some((x) => x.id !== p.id && x.nome.toLowerCase() === n.toLowerCase())) throw erro("NAME_IN_USE");
        p.nome = n;
      }
      p.arquivado = !!p.arquivado;
      return { perfil: p, id: p.id, cor: p.cor };
    },
    [A.deletePerfil]: (d) => {
      exigir(avancado());
      if (!doc.perfis.some((p) => p.id === d.id)) throw erro("OPERATION_FAILED");
      doc.perfis = doc.perfis.filter((p) => p.id !== d.id);
      doc.lancamentos.forEach((l) => { if (l.perfilId === d.id) { l.perfilId = null; delete l.faturaPerfil; } });
      Object.keys(doc.faturas).forEach((k) => { if (k.startsWith(d.id + "|")) delete doc.faturas[k]; });
      return { id: d.id };
    },

    /* Ações em lote (barra de seleção em Lançamentos) */
    [A.updateLancamentosEmLote]: (d) => {
      const ids = Array.isArray(d.ids) ? d.ids : [];
      if (!ids.length) throw erro("OPERATION_FAILED");
      const tipo = d.tipo !== undefined ? (["regular", "interno", "receita", "estorno", "debito"].includes(d.tipo) ? d.tipo : null) : undefined;
      let categoriaId: Id | null | undefined;
      if (d.categoriaId !== undefined) categoriaId = existe(doc.categorias, d.categoriaId);
      if (d.tipo !== undefined && !tipo) throw erro("OPERATION_FAILED");
      let perfilId: Id | null | undefined;
      if (d.perfilId !== undefined) { exigir(avancado()); perfilId = d.perfilId ? perfilPermitido(d.perfilId, null) : null; }
      // Débito sai de uma conta: nenhuma das escolhidas pode estar num cartão (ou sem conta)
      if (tipo === "debito" && doc.lancamentos.some((l) => ids.includes(l.id) && !doc.contas.some((c) => c.id === l.contaId && c.tipo !== "cartao"))) throw erro("DEBIT_ACCOUNT");
      // pagamento de fatura não muda de tipo; o lado do cartão não recebe perfil nem categoria
      if (tipo && doc.lancamentos.some((l) => ids.includes(l.id) && l.tipo === "fatura")) throw erro("PAYMENT_TYPE_LOCKED");
      let n = 0;
      doc.lancamentos.forEach((l) => {
        if (!ids.includes(l.id) || ladoDoCartao(l)) return;
        if (tipo) { encerrarSerieDe(l); l.tipo = tipo; l.recorrencia = null; l.parcelaAtual = null; l.parcelaTotal = null; }
        if (perfilId !== undefined) l.perfilId = perfilId;
        if (categoriaId !== undefined) l.categoriaId = categoriaId;
        if (tipo === "interno") { l.sentido = l.sentido === "entrada" ? "entrada" : "saida"; l.direcao = l.sentido; }
        n += 1;
      });
      return { alterados: n };
    },
    [A.deleteLancamentos]: (d) => {
      const ids = comOsPares(Array.isArray(d.ids) ? d.ids : []);
      const antes = doc.lancamentos.length;
      const grupos = new Set<string>();
      doc.lancamentos.filter((l) => ids.has(l.id)).forEach((l) => { encerrarSerieDe(l); reverterEfeito(l); if (l.divisao) grupos.add(l.divisao.id); });
      doc.lancamentos = doc.lancamentos.filter((l) => !ids.has(l.id));
      grupos.forEach(ajustarDivisao);
      return { excluidos: antes - doc.lancamentos.length };
    },

    /* Perfis: arquivar */
    [A.arquivarPerfil]: (d) => {
      exigir(avancado());
      const p = doc.perfis.find((x) => x.id === d.id);
      if (!p) throw erro("OPERATION_FAILED");
      p.arquivado = !!d.arquivar;
      return { id: p.id, arquivado: p.arquivado };
    },

    /* Configurações do usuário (foto) — fica dentro do documento criptografado */
    [A.updateConfig]: (d) => {
      if (d.foto === null) delete doc.config.foto;
      else if (typeof d.foto === "string") {
        if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(d.foto) || d.foto.length > 300000) throw erro("OPERATION_FAILED");
        doc.config.foto = d.foto;
      }
      if (typeof d.orcamentoAtivo === "boolean") doc.config.orcamentoAtivo = d.orcamentoAtivo;
      let primeiraVez = false;
      if (typeof d.multicambio === "boolean") {
        doc.config.multicambio = d.multicambio;
        if (!d.multicambio) doc.config.moeda = "BRL";             // desativado: tudo volta ao Real (nada é apagado)
      }
      if (d.moeda !== undefined) {
        if (!MOEDAS.includes(d.moeda) || !doc.config.multicambio) throw erro("OPERATION_FAILED");
        const iniciadas = doc.config.moedasIniciadas || ["BRL"];
        primeiraVez = !iniciadas.includes(d.moeda);
        if (primeiraVez) doc.config.moedasIniciadas = iniciadas.concat(d.moeda);
        doc.config.moeda = d.moeda;
      }
      if (d.pix !== undefined) exigir(pixLiberado());
      if (d.pix === null) delete doc.config.pix;
      else if (d.pix && typeof d.pix === "object") {
        const chave = ZoZo.pix.normalizarChave(d.pix.chave);
        const nome = texto(d.pix.nome, 25), cidade = texto(d.pix.cidade, 15);
        if (!chave || !ZoZo.pix.nomeValido(nome) || !cidade) throw erro("PIX_INVALID");      // nome: só letras
        doc.config.pix = { chave, nome, cidade };
      }
      return { foto: doc.config.foto || null, orcamentoAtivo: doc.config.orcamentoAtivo !== false, pix: pixLiberado() ? doc.config.pix || null : null,
        multicambio: !!doc.config.multicambio, moeda: moedaAtual(), primeiraVez };
    },
    /** Leva transações do Real para a moeda atual (o número fica igual: 200,00 R$ → 200,00 €; sem conversão) */
    [A.transferirMoeda]: (d) => {
      exigir(cambioLiberado());
      // destino: a moeda informada (Enviar) ou a escolhida no menu (Importar / 1ª vez numa moeda)
      if (d.destino !== undefined && !MOEDAS.includes(d.destino)) throw erro("OPERATION_FAILED");
      const destino: Moeda = d.destino || moedaAtual();
      const ids = new Set(Array.isArray(d.ids) ? d.ids.slice(0, 5000) : []);
      if (!doc.config.multicambio || !ids.size) throw erro("OPERATION_FAILED");     // destino: a moeda escolhida (inclusive o Real)
      // Unidade indivisível: a série inteira (parcelas/recorrência) E a divisão inteira, de forma TRANSITIVA
      // (uma parte de divisão que é origem de outra série leva essa série, que pode ter outras divisões…).
      // O conjunto completo é calculado antes de mexer em qualquer registro.
      const chaveSerie = (l: Lancamento) => (l.tipo === "recorrente" ? (l.serieId && !String(l.serieId).startsWith("removida:") ? l.serieId : l.id) : null);
      const series = new Set<string | null>(), divisoes = new Set<string>(), mover = new Set<Lancamento>();
      const candidatos = doc.lancamentos.filter((l) => moedaDe(l) !== destino);
      const incluir = (l: Lancamento): boolean => {
        if (mover.has(l)) return false;
        mover.add(l);
        const s = chaveSerie(l); if (s) series.add(s);
        if (l.divisao) divisoes.add(l.divisao.id);
        return true;
      };
      candidatos.forEach((l) => { if (ids.has(l.id)) incluir(l); });
      for (let mudou = true; mudou;) {
        mudou = false;
        candidatos.forEach((l) => {
          if (mover.has(l)) return;
          if (series.has(l.id) || series.has(chaveSerie(l)) || (l.divisao && divisoes.has(l.divisao.id))) mudou = incluir(l) || mudou;
        });
      }
      // Conta, categoria e perfil passam a ser os da moeda de destino: o de mesmo nome, ou uma cópia
      // (conta copiada começa com saldo 0 — o saldo pertence à outra moeda). Débito sai da conta nova
      // (sincronizarSaldos desfaz o efeito na conta antiga e aplica na nova).
      const mapa: Record<string, Id> = {};
      const equivalente = <T extends { id: Id; nome: string; moeda?: Moeda; tipo?: string }>(lista: T[], prefixo: string, id: Id | null | undefined, copiar: (x: T) => object) => {
        if (!id) return id;
        const atual = lista.find((x) => x.id === id);
        if (!atual || moedaDe(atual) === destino) return id;
        if (mapa[id]) return mapa[id];
        const igual = lista.find((x) => moedaDe(x) === destino && x.nome === atual.nome && (prefixo !== "c" || x.tipo === atual.tipo));
        const alvo = igual || Object.assign({}, atual, copiar(atual), { id: novoId(prefixo), moeda: destino });
        if (!igual) lista.push(alvo);
        mapa[id] = alvo.id;
        return alvo.id;
      };
      mover.forEach((l) => {
        l.moeda = destino;
        l.contaId = equivalente(doc.contas, "c", l.contaId, () => ({ saldo: 0, historico: [] }));
        l.categoriaId = equivalente(doc.categorias, "k", l.categoriaId, () => ({ orcamentos: {} }));
        l.perfilId = equivalente(doc.perfis, "p", l.perfilId, () => ({}));
      });
      return { transferidos: mover.size };
    },
  };

  // Só as ações da própria tabela: "in" também acharia nomes herdados de Object (constructor, toString…)
  const ehLeitura = (action: string): action is NomeLeitura => Object.hasOwn(LEITURAS, action);
  const ehEscrita = (action: string): action is NomeEscrita => Object.hasOwn(ESCRITAS, action);
  function atende(action: string) { return ehLeitura(action) || ehEscrita(action); }

  /** Falha inesperada (ex.: dado antigo num formato que a regra não previa) vira erro amigável com o código */
  function amigavel(e: unknown): ErroPonte {
    if (e instanceof M.BridgeError) return e;
    ZoZo.log.error("serviço", e);
    return new M.BridgeError("INTERNAL_ERROR", M.FRIENDLY.OPERATION_FAILED.replace(/\.$/, "") + " (código INTERNAL_ERROR).");
  }

  /** Os dados de UMA moeda (as leituras só enxergam o "mundo" da moeda escolhida) */
  function visao(real: Documento): Documento {
    const m = moedaAtual();
    const daMoeda = <T extends { moeda?: Moeda }>(lista: T[]) => lista.filter((x) => moedaDe(x) === m);
    return Object.assign({}, real, {
      perfis: daMoeda(real.perfis), contas: daMoeda(real.contas), categorias: daMoeda(real.categorias), lancamentos: daMoeda(real.lancamentos),
    });
  }
  function lerNaMoeda(action: NomeLeitura, d: Dados) {
    const real = doc;
    doc = visao(real);
    try { return clone(LEITURAS[action](d)); } finally { doc = real; }
  }

  function handle(action: string, data?: unknown): Promise<unknown> {
    const d = (data && typeof data === "object" ? data : {}) as Dados;
    if (ehLeitura(action)) {
      // getConfig e a lista para transferir entre moedas enxergam o documento inteiro; o resto, só a moeda escolhida
      const inteiro = action === A.getConfig || action === A.getLancamentosOutrasMoedas;
      return aplicadas.then(() => garantirCarregado()).then(() => (inteiro ? clone(LEITURAS[action](d)) : lerNaMoeda(action, d))).catch((e) => { throw amigavel(e); });
    }
    if (ehEscrita(action)) {
      return alterar(() => clone(ESCRITAS[action](d))).catch((e) => { throw amigavel(e); });
    }
    return Promise.reject(erro("OPERATION_FAILED"));
  }

  /** Promessa que resolve quando todas as gravações pendentes terminarem (antes de sair, trocar senha ou apagar dados) */
  const aguardarGravacoes = () => fila.catch(() => null);

  ZoZo.servico = { handle, atende, reset, FREQUENCIAS, aguardarGravacoes, gravando, recarregarDoServidor, calcularFatura };
})(window.ZoZo);
