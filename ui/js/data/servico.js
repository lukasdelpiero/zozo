/* =============================================================
   ZoZo — Serviço de dados
   ------------------------------------------------------------
   Camada de dados separada da interface. Responde às mesmas
   ações do contrato (getLancamentos, createConta, ...) e guarda
   UM documento por usuário, que o host cifra no navegador e grava
   no banco SQL do Cloudflare (ações loadUserData/saveUserData).

   As regras configuráveis ficam em js/config/regras.js.
   Nenhum componente visual acessa este módulo diretamente:
   tudo passa pelo bridge (ZoZo.bridge.request).
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const M = ZoZo.messages;
  const R = () => ZoZo.regras;

  const VERSAO = 1;
  const TIPOS_LANCAMENTO = ["regular", "recorrente", "interno", "receita", "estorno"];
  const TIPOS_CONTA = ["cartao", "corrente", "poupanca", "investimento", "emprestimo", "outros"];
  const ATIVOS = ["corrente", "poupanca", "investimento", "outros"];
  const PASSIVOS = ["cartao", "emprestimo"];

  let doc = null;          // documento do usuário em memória
  let carregando = null;   // Promise de carga
  let fila = Promise.resolve(); // operações de escrita em série
  let pendentes = 0;            // gravações ainda não confirmadas pelo servidor

  /* ---------------- utilitários ---------------- */
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const hojeIso = () => iso(new Date());
  const mesDe = (dataIso) => String(dataIso || "").slice(0, 7);
  const mesAtual = () => mesDe(hojeIso());
  const r2 = (n) => Math.round(n * 100) / 100;
  /** Identificador imprevisível (crypto) com prefixo do tipo: l…, c…, k…, p… */
  const novoId = (p) => p + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  const clone = (o) => structuredClone(o);

  function erro(code) { return new M.BridgeError(code, M.FRIENDLY[code] || M.FRIENDLY.OPERATION_FAILED); }

  // Sanitização dos dados recebidos da interface
  const texto = (v, max) => String(v === undefined || v === null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max || 200);
  const numero = (v) => { const n = typeof v === "number" ? v : parseFloat(v); return Number.isFinite(n) ? n : NaN; };
  const dataValida = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) && !isNaN(new Date(v + "T00:00:00")) ? String(v) : null);
  const cor = (v, padrao) => ZoZo.format.cor(v, padrao || "#6078a9");
  const inteiro = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : NaN; };
  const existe = (lista, id) => (id && lista.some((x) => x.id === id) ? id : null);

  function diffMeses(de, ate) { // "AAAA-MM"
    const [a1, m1] = de.split("-").map(Number);
    const [a2, m2] = ate.split("-").map(Number);
    return (a2 - a1) * 12 + (m2 - m1);
  }
  function dataNoMes(mes, dia) { // mes "AAAA-MM"
    const [a, m] = mes.split("-").map(Number);
    const ultimo = new Date(a, m, 0).getDate();
    return mes + "-" + pad(Math.min(dia, ultimo));
  }
  function fimMesAnterior() {
    const d = new Date(); d.setDate(0);
    return iso(d);
  }

  /* ---------------- documento ---------------- */
  function vazio() {
    return { versao: VERSAO, perfis: [], contas: [], categorias: [], lancamentos: [], config: {}, meta: {} };
  }
  function normalizar(d) {
    const out = Object.assign(vazio(), d && typeof d === "object" ? d : {});
    ["perfis", "contas", "categorias", "lancamentos"].forEach((k) => { if (!Array.isArray(out[k])) out[k] = []; });
    out.contas.forEach((c) => { if (!Array.isArray(c.historico)) c.historico = []; });
    if (!out.config || typeof out.config !== "object") out.config = {};
    if (!out.meta || typeof out.meta !== "object") out.meta = {};
    out.lancamentos.forEach((l) => { if (l.recorrencia === "fixa") l.recorrencia = "mensal"; });   // versão anterior
    out.versao = VERSAO;
    return out;
  }

  function garantirCarregado() {
    if (doc) return Promise.resolve(doc);
    if (!carregando) {
      carregando = ZoZo.bridge.requestHost(M.ACTIONS.loadUserData, null)
        .then((r) => {
          doc = normalizar(r && r.documento);
          // Avisos do host: restaurado de backup / versão mais antiga do que a conhecida
          if (r && r.aviso) window.dispatchEvent(new CustomEvent("zozo:aviso-dados", { detail: { codigo: r.aviso } }));
          if (sincronizarParcelas() > 0) {
            doc.meta.ultimaGravacao = new Date().toISOString();
            // grava pela mesma fila das alterações (nunca em paralelo com elas)
            fila = fila.then(() => ZoZo.bridge.requestHost(M.ACTIONS.saveUserData, { documento: doc })).catch((e) => tratarConflito(e));
          }
          return doc;
        })
        .finally(() => { carregando = null; });
    }
    return carregando;
  }

  /** Depois de excluir/editar uma parte, o grupo da divisão é recalculado (total e quantidade) */
  function ajustarDivisao(grupo) {
    const membros = doc.lancamentos.filter((l) => l.divisao && l.divisao.id === grupo);
    if (membros.length <= 1) { membros.forEach((l) => { delete l.divisao; }); return; }
    const total = r2(membros.reduce((s, l) => s + l.valor, 0));
    membros.forEach((l) => { l.divisao = { id: grupo, total, partes: membros.length }; });
  }

  /** Outro computador gravou os dados depois da nossa leitura: descarta a cópia em memória e avisa a interface */
  function tratarConflito(e) {
    if (!e || e.code !== "DATA_CHANGED") return false;
    doc = null;
    window.dispatchEvent(new CustomEvent("zozo:dados-alterados"));
    return true;
  }

  /** Erros que a interface precisa conhecer pelo nome; os demais viram "não foi possível concluir" */
  const ERROS_REPASSADOS = ["SESSION_EXPIRED", "DOCUMENT_TOO_LARGE", "STORAGE_UNAVAILABLE", "TIMEOUT"];

  /** Executa uma alteração e grava. Se a gravação falhar, desfaz. */
  function alterar(fn) {
    pendentes += 1;
    const exec = fila.then(() => garantirCarregado()).then(() => {
      const antes = JSON.stringify(doc);
      let resultado;
      try { resultado = fn(doc); } catch (e) { doc = JSON.parse(antes); throw e; }
      doc.meta.ultimaGravacao = new Date().toISOString();
      return ZoZo.bridge.requestHost(M.ACTIONS.saveUserData, { documento: doc })
        .then(() => resultado)
        .catch((e) => {
          if (doc) doc = JSON.parse(antes);
          if (tratarConflito(e)) throw erro("DATA_CHANGED");
          throw erro(e && ERROS_REPASSADOS.includes(e.code) ? e.code : "OPERATION_FAILED");
        });
    }).finally(() => { pendentes -= 1; });
    fila = exec.catch(() => null);
    return exec;
  }

  function reset() { doc = null; carregando = null; fila = Promise.resolve(); }
  const gravando = () => pendentes > 0;

  /* ---------------- saldos e séries ---------------- */
  function saldoAtual(c) {
    const h = c.historico;
    return h.length ? h[h.length - 1].saldo : 0;
  }
  function saldoEm(c, dataIso) {
    let v = null;
    for (const p of c.historico) { if (p.data <= dataIso) v = p.saldo; else break; }
    return v;
  }
  function variacao(atual, anterior) {
    if (anterior === null || anterior === undefined || anterior === 0) return 0;
    return r2(((atual - anterior) / Math.abs(anterior)) * 100);
  }
  function contaPublica(c) {
    return {
      id: c.id, nome: c.nome, ultimos4Digitos: c.ultimos4Digitos || "", tipo: c.tipo, tipoInvestimento: c.tipoInvestimento || "", oculta: !!c.oculta,
      cor: c.cor, instituicao: c.instituicao || "", limite: c.limite || null, fechamento: c.fechamento || null, vencimento: c.vencimento || null,
      valor: saldoAtual(c), variacaoPercentual: variacao(saldoAtual(c), saldoEm(c, fimMesAnterior())),
    };
  }

  /** Série diária a partir dos registros de saldo (máx. ~13 meses) */
  function serieDiaria(contas, fnPonto) {
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

  function getContas() {
    const ativas = doc.contas.filter((c) => !c.oculta);   // conta oculta não entra nos totais
    const somar = (tipos, data) => r2(ativas.filter((c) => tipos.includes(c.tipo)).reduce((s, c) => s + (data ? (saldoEm(c, data) || 0) : saldoAtual(c)), 0));
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

  function getInvestimentos(d) {
    const excluir = d && Array.isArray(d.excluir) ? d.excluir : [];
    const todas = doc.contas.filter((c) => c.tipo === "investimento");
    const inv = todas.filter((c) => !excluir.includes(c.id) && !c.oculta);
    const total = (data) => r2(inv.reduce((s, c) => s + (data ? (saldoEm(c, data) || 0) : saldoAtual(c)), 0));
    const atual = total();
    const porTipo = new Map();
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
  function enriquecer(l) {
    const conta = doc.contas.find((c) => c.id === l.contaId);
    const cat = doc.categorias.find((c) => c.id === l.categoriaId);
    const perfil = doc.perfis.find((p) => p.id === l.perfilId);
    return Object.assign({}, l, {
      nomeConta: conta ? conta.nome : "",
      ultimos4Digitos: conta ? conta.ultimos4Digitos || "" : "",
      categoria: cat ? { nome: cat.nome, icone: cat.icone, cor: cat.cor } : null,
      perfil: perfil ? { nome: perfil.nome, cor: perfil.cor } : null,
    });
  }
  function getLancamentos() {
    return { lancamentos: doc.lancamentos.map(enriquecer).sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id)) };
  }

  /** Perfil arquivado: continua nos lançamentos antigos, mas não pode ser escolhido em novos */
  function perfilPermitido(id, atual) {
    const p = doc.perfis.find((x) => x.id === id);
    if (!p) return null;
    if (p.arquivado && !(atual && atual.perfilId === id)) throw erro("PROFILE_ARCHIVED");
    return id;
  }

  function lerLancamento(entrada, atual) {
    const l = entrada || {};
    const data = dataValida(l.data);
    const valor = numero(l.valor);
    const descricao = texto(l.descricao, 140);
    const tipo = TIPOS_LANCAMENTO.includes(l.tipo) ? l.tipo : "regular";
    if (!data || !descricao || !(valor > 0) || valor > 1e12) throw erro("OPERATION_FAILED");
    const out = {
      data, descricao, valor: r2(valor), tipo,
      contaId: existe(doc.contas, l.contaId),
      categoriaId: existe(doc.categorias, l.categoriaId),
      perfilId: perfilPermitido(l.perfilId, atual),
      notas: texto(l.notas, 2000),
      recorrencia: null, parcelaAtual: null, parcelaTotal: null,
      sentido: tipo === "interno" ? (l.sentido === "entrada" ? "entrada" : "saida") : null,   // transferência: saída | entrada
      direcao: tipo === "interno" ? (l.direcao === "entrada" ? "entrada" : "saida") : null,
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
    // A competência acompanha a data quando o lançamento não é ocorrência de série
    if (!out.serieId) out.competencia = mesDe(data);
    return out;
  }

  /* ---------------- recorrências ---------------- */
  /* Frequências de recorrência (rótulo curto na lista e texto do seletor) */
  const FREQUENCIAS = {
    semanal: { dias: 7, rotulo: "Semanal", texto: "A cada semana" },
    quinzenal: { dias: 14, rotulo: "Quinzenal", texto: "A cada 2 semanas" },
    mensal: { meses: 1, rotulo: "Mensal", texto: "A cada mês" },
    bimestral: { meses: 2, rotulo: "Bimestral", texto: "A cada 2 meses" },
    trimestral: { meses: 3, rotulo: "Trimestral", texto: "A cada 3 meses" },
    quadrimestral: { meses: 4, rotulo: "Quadrimestral", texto: "A cada 4 meses" },
    semestral: { meses: 6, rotulo: "Semestral", texto: "A cada 6 meses" },
    anual: { meses: 12, rotulo: "Anual", texto: "A cada ano" },
  };
  const recorrenciaValida = (v) => (v === "parcelada" || FREQUENCIAS[v] ? v : "mensal");

  const ehOrigem = (l) => l.tipo === "recorrente" && l.recorrencia && (!l.serieId || l.serieId === l.id);

  /* ---------------- Parcelas automáticas ----------------
     Ao registrar uma compra parcelada (ex.: parcela 3 de 10), as parcelas
     4…10 são criadas como lançamentos nos meses seguintes, no mesmo dia.
     Uma parcela com data futura conta como "Pendente" em Recorrências e
     passa a "Pago" quando a data chega.                                    */
  function mesSomado(mes, k) {
    const [a, m] = mes.split("-").map(Number);
    const d = new Date(a, m - 1 + k, 1);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1);
  }

  function sincronizarParcelas() {
    let criadas = 0;
    doc.lancamentos.filter((o) => ehOrigem(o) && o.recorrencia === "parcelada" && o.parcelaTotal > o.parcelaAtual).forEach((o) => {
      const inicio = o.competencia || mesDe(o.data);
      const dia = Number(o.data.slice(8, 10));
      for (let k = 1; o.parcelaAtual + k <= o.parcelaTotal; k++) {
        const mes = mesSomado(inicio, k);
        if ((o.ignorados || []).includes(mes)) continue;      // parcela excluída pelo usuário
        if (doc.lancamentos.some((l) => l.serieId === o.id && l.id !== o.id && l.competencia === mes)) continue;
        doc.lancamentos.push({
          id: novoId("l"), data: dataNoMes(mes, dia), descricao: o.descricao, valor: o.valor, tipo: "recorrente",
          contaId: o.contaId, categoriaId: o.categoriaId, perfilId: o.perfilId, notas: "",
          recorrencia: "parcelada", parcelaAtual: o.parcelaAtual + k, parcelaTotal: o.parcelaTotal,
          serieId: o.id, competencia: mes, encerradaEm: null, automatico: true,
        });
        criadas += 1;
      }
    });
    return criadas;
  }

  /** Remove as parcelas futuras geradas automaticamente (e não editadas à mão) de uma série */
  function removerParcelasFuturas(serieId) {
    const hoje = hojeIso();
    doc.lancamentos = doc.lancamentos.filter((l) => !(l.serieId === serieId && l.id !== serieId && l.automatico && !l.editado && l.data > hoje));
  }

  /** Lançamentos de uma série cuja origem saiu continuam existindo, mas não geram novas ocorrências */
  function desligarSerie(serieId) {
    doc.lancamentos.forEach((l) => { if (l.serieId === serieId && l.id !== serieId) l.serieId = "removida:" + serieId; });
  }

  /** Antes de excluir: origem → tira parcelas futuras e desliga a série; parcela → não é recriada */
  function encerrarSerieDe(l) {
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
  function datasDaSerie(o, mes) {
    const inicio = o.competencia || mesDe(o.data);
    const k = diffMeses(inicio, mes);
    if (k < 0) return [];
    const dia = Number(o.data.slice(8, 10));
    if (o.recorrencia === "parcelada") {
      const parcela = o.parcelaAtual + k;
      return parcela > o.parcelaTotal ? [] : [{ data: dataNoMes(mes, dia), chave: mes, k, parcela }];
    }
    const f = FREQUENCIAS[o.recorrencia] || FREQUENCIAS.mensal;
    if (f.meses) return k % f.meses === 0 ? [{ data: dataNoMes(mes, dia), chave: mes, k }] : [];
    // semanal / quinzenal: datas a partir da origem, de "dias" em "dias"
    const [a, m] = mes.split("-").map(Number);
    const ini = new Date(a, m - 1, 1), fim = new Date(a, m, 0);
    const base = new Date(o.data + "T00:00:00");
    const out = [];
    let n = Math.max(0, Math.ceil((ini - base) / 86400000 / f.dias));
    for (; n < 2000; n++) {
      const x = new Date(base); x.setDate(x.getDate() + n * f.dias);
      if (x > fim) break;
      if (x >= ini) out.push({ data: iso(x), chave: iso(x), k: n });
    }
    return out;
  }

  function ocorrencias(mes) {
    const hoje = hojeIso();
    const out = [];
    doc.lancamentos.filter(ehOrigem).forEach((o) => {
      if (o.encerradaEm && diffMeses(o.encerradaEm, mes) >= 0) return;   // arquivada: sai de "Este mês" em diante
      const semanal = !!(FREQUENCIAS[o.recorrencia] && FREQUENCIAS[o.recorrencia].dias);
      const cat = doc.categorias.find((c) => c.id === o.categoriaId);
      datasDaSerie(o, mes).forEach((dt) => {
        if ((o.ignorados || []).includes(dt.chave)) return;
        const lanc = dt.k === 0 ? o : doc.lancamentos.find((l) => l.serieId === o.id && l.id !== o.id &&
          (semanal ? l.ocorrencia === dt.chave : l.competencia === mes));
        const data = lanc ? lanc.data : dt.data;
        const rotulo = o.recorrencia === "parcelada" ? "Parcela " + dt.parcela + "/" + o.parcelaTotal : (FREQUENCIAS[o.recorrencia] || FREQUENCIAS.mensal).rotulo;
        out.push({
          id: o.id + "@" + dt.chave, serieId: o.id, mes, chave: dt.chave, data, descricao: o.descricao, tipoRecorrencia: rotulo,
          recorrencia: o.recorrencia, parcela: dt.parcela || null, parcelaTotal: o.parcelaTotal,
          categoriaId: o.categoriaId,
          categoria: cat ? { nome: cat.nome, icone: cat.icone, cor: cat.cor } : null,
          valor: lanc ? lanc.valor : o.valor,
          // Um lançamento com data futura é agendamento, não pagamento
          pago: R().recorrencias.pagoSomenteComLancamento ? !!lanc && lanc.data <= hoje : (!!lanc || data <= hoje),
          lancamentoId: lanc ? lanc.id : null,
          encerrada: !!o.encerradaEm,
        });
      });
    });
    return out.sort((a, b) => a.data.localeCompare(b.data));
  }

  function getRecorrencias(d) {
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

  function itemSerie(o, data, mes, parcela, sufixo) {
    const cat = doc.categorias.find((c) => c.id === o.categoriaId);
    return {
      id: o.id + "@" + sufixo, serieId: o.id, mes, chave: sufixo, data, descricao: o.descricao,
      tipoRecorrencia: o.recorrencia === "parcelada" ? "Parcela " + (parcela || o.parcelaAtual) + "/" + o.parcelaTotal : (FREQUENCIAS[o.recorrencia] || FREQUENCIAS.mensal).rotulo,
      recorrencia: o.recorrencia, parcela, parcelaTotal: o.parcelaTotal, categoriaId: o.categoriaId,
      categoria: cat ? { nome: cat.nome, icone: cat.icone, cor: cat.cor } : null,
      valor: o.valor, pago: false, lancamentoId: null, encerrada: !!o.encerradaEm, proxima: sufixo === "proxima",
    };
  }

  function proximasSeries(mes, doMes) {
    const comOcorrencia = new Set(doMes.map((x) => x.serieId));
    const out = [];
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
  function gastoNoMes(catId, mes) {
    const sinais = R().categorias.sinalGastoPorTipo;
    return doc.lancamentos.reduce((s, l) => {
      if (l.categoriaId !== catId || mesDe(l.data) !== mes) return s;
      const sinal = sinais[l.tipo] === undefined ? 0 : sinais[l.tipo];
      return s + sinal * l.valor;
    }, 0);
  }
  /** Orçamento de uma categoria no mês: valor do mês (se definido) ou o orçamento fixo */
  function reservadoNoMes(c, mes) {
    return c.orcamentos && c.orcamentos[mes] !== undefined ? c.orcamentos[mes] : (c.reservado || 0);
  }

  function getCategorias(d) {
    const mes = d && /^\d{4}-\d{2}$/.test(d.mes || "") ? d.mes : mesAtual();
    const categorias = doc.categorias.map((c) => Object.assign({}, c, {
      gasto: r2(Math.max(gastoNoMes(c.id, mes), 0)),
      reservado: reservadoNoMes(c, mes),
      reservadoFixo: c.reservado || 0,
      orcamentoPorMes: !!(c.orcamentos && Object.keys(c.orcamentos).length),
    }));
    const reg = categorias.filter((c) => c.status === "regular");
    return {
      mes,
      resumo: { gasto: r2(reg.reduce((s, c) => s + c.gasto, 0)), reservado: r2(reg.reduce((s, c) => s + c.reservado, 0)) },
      categorias,
    };
  }
  function lerCategoria(e) {
    const nome = texto(e && e.nome, 60);
    if (!nome) throw erro("OPERATION_FAILED");
    const reservado = numero(e.reservado);
    return {
      nome, icone: texto(e.icone, 8) || "•", cor: cor(e.cor), grupo: texto(e.grupo, 60) || null,
      reservado: reservado > 0 ? r2(reservado) : 0, status: e.status === "excluida" ? "excluida" : "regular",
    };
  }

  /* ---------------- contas ---------------- */
  function lerConta(e) {
    const nome = texto(e && e.nome, 60);
    const tipo = TIPOS_CONTA.includes(e && e.tipo) ? e.tipo : null;
    const saldo = numero(e && e.saldo);
    const dig = texto(e && e.ultimos4Digitos, 4);
    if (!nome || !tipo || !Number.isFinite(saldo) || Math.abs(saldo) > 1e12 || (dig && !/^\d{4}$/.test(dig))) throw erro("OPERATION_FAILED");
    const dia = (v) => { const n = inteiro(v); return n >= 1 && n <= 31 ? n : null; };
    const limite = numero(e.limite);
    return {
      nome, tipo, saldo: r2(saldo), ultimos4Digitos: dig, cor: cor(e.cor), tipoInvestimento: tipo === "investimento" ? texto(e.tipoInvestimento, 40) || "Outros" : "",
      instituicao: texto(e.instituicao, 60), limite: limite > 0 ? r2(limite) : null, fechamento: dia(e.fechamento), vencimento: dia(e.vencimento),
    };
  }
  function registrarSaldo(c, saldo) {
    const hoje = hojeIso();
    const ultimo = c.historico[c.historico.length - 1];
    if (ultimo && ultimo.data === hoje) ultimo.saldo = saldo;
    else if (!ultimo || ultimo.saldo !== saldo) c.historico.push({ data: hoje, saldo });
  }

  /* ---------------- perfis ---------------- */
  function lerPerfil(e) {
    const nome = texto(e && e.nome, 40);
    if (!nome) throw erro("OPERATION_FAILED");
    const orc = numero(e.orcamento);
    return { nome, cor: cor(e.cor), orcamento: orc > 0 ? r2(orc) : 0 };
  }
  function gastoDoPerfil(perfilId, mes) {
    const sinais = R().categorias.sinalGastoPorTipo;
    return r2(Math.max(doc.lancamentos.reduce((s, l) => (l.perfilId === perfilId && mesDe(l.data) === mes ? s + (sinais[l.tipo] || 0) * l.valor : s), 0), 0));
  }

  /* ---------------- ações ---------------- */
  const A = M.ACTIONS;
  const LEITURAS = {
    [A.getLancamentos]: getLancamentos,
    [A.getContas]: getContas,
    [A.getInvestimentos]: (d) => getInvestimentos(d),
    [A.getCategorias]: getCategorias,
    [A.getRecorrencias]: getRecorrencias,
    [A.getPerfis]: () => {
      const mes = mesAtual();
      const perfis = doc.perfis.map((p) => Object.assign({ orcamento: 0, arquivado: false }, p, {
        gasto: gastoDoPerfil(p.id, mes),
        quantidade: doc.lancamentos.filter((l) => l.perfilId === p.id).length,
      }));
      const ativos = perfis.filter((p) => !p.arquivado);
      const lancamentosMes = doc.lancamentos.filter((l) => l.perfilId && mesDe(l.data) === mes && ativos.some((p) => p.id === l.perfilId)).length;
      return { mes, perfis, resumo: { gasto: r2(ativos.reduce((s, p) => s + p.gasto, 0)), lancamentosMes } };
    },
    [A.getConfig]: () => ({ foto: doc.config.foto || null, ultimaGravacao: doc.meta.ultimaGravacao || null, orcamentoAtivo: doc.config.orcamentoAtivo !== false }),
    [A.getContaHistorico]: (d) => {
      const c = doc.contas.find((x) => x.id === d.id);
      if (!c) throw erro("LOAD_FAILED");
      const ant = saldoEm(c, fimMesAnterior());
      return { conta: contaPublica(c), diferenca: r2(saldoAtual(c) - (ant === null ? saldoAtual(c) : ant)),
        serie: serieDiaria([c], (dt) => ({ data: dt, valor: saldoEm(c, dt) || 0 })) };
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
      const pontos = [];
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
      const dias = []; let acc = 0;
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
    [A.getBoletoData]: (d) => {
      const prefixo = d.ano + "-" + pad(d.mes);
      const perfil = doc.perfis.find((p) => p.id === d.perfilId) || null;
      const lancamentos = getLancamentos().lancamentos.filter((l) => l.perfilId === d.perfilId && l.data.startsWith(prefixo)).sort((a, b) => a.data.localeCompare(b.data));
      return { perfil, lancamentos };
    },
  };

  const ESCRITAS = {
    /* Lançamentos */
    [A.createLancamento]: (d) => {
      const l = Object.assign({ id: novoId("l") }, lerLancamento(d.lancamento, null));
      doc.lancamentos.push(l);
      sincronizarParcelas();
      return { lancamento: enriquecer(l) };
    },
    [A.updateLancamento]: (d) => {
      const i = doc.lancamentos.findIndex((l) => l.id === d.id);
      if (i < 0) throw erro("OPERATION_FAILED");
      const antigo = doc.lancamentos[i];
      const novo = Object.assign({ id: d.id }, lerLancamento(d.lancamento, antigo));
      if (antigo.divisao) {
        if (novo.tipo === "recorrente") throw erro("SPLIT_INVALID");     // parte de divisão não vira recorrente
        novo.divisao = antigo.divisao;
        // Partes de uma divisão têm sempre a mesma data
        if (novo.data !== antigo.data) doc.lancamentos.forEach((l) => { if (l.divisao && l.divisao.id === antigo.divisao.id) l.data = novo.data; });
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
      doc.lancamentos = doc.lancamentos.filter((l) => l.id !== d.id);
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
      const l = {
        id: novoId("l"), data: dataValida(d.data) || hoje, descricao: o.descricao, valor, tipo: "recorrente",
        contaId: o.contaId, categoriaId: o.categoriaId, perfilId: o.perfilId, notas: "",
        recorrencia: o.recorrencia, parcelaAtual: oc.parcela, parcelaTotal: o.parcelaTotal || null,
        serieId: o.id, competencia: mes, ocorrencia: oc.chave, encerradaEm: null,
      };
      doc.lancamentos.push(l);
      return { lancamentoId: l.id };
    },
    /** Transforma um lançamento existente na origem de uma recorrência (modal "Nova recorrência") */
    [A.tornarRecorrente]: (d) => {
      const l = doc.lancamentos.find((x) => x.id === d.id);
      if (l && l.divisao) throw erro("SPLIT_INVALID");                      // lançamento dividido não vira recorrente
      if (!l || (l.serieId && l.serieId !== l.id && !String(l.serieId).startsWith("removida:"))) throw erro("OPERATION_FAILED");
      const rec = recorrenciaValida(d.recorrencia);
      if (rec === "parcelada") {
        const pa = inteiro(d.parcelaAtual), pt = inteiro(d.parcelaTotal);
        if (!(pa >= 1 && pt >= 2 && pa <= pt && pt <= 999)) throw erro("OPERATION_FAILED");
        Object.assign(l, { parcelaAtual: pa, parcelaTotal: pt });
      } else Object.assign(l, { parcelaAtual: null, parcelaTotal: null });
      Object.assign(l, { tipo: "recorrente", recorrencia: rec, serieId: null, competencia: mesDe(l.data), encerradaEm: null, sentido: null });
      sincronizarParcelas();
      return { serieId: l.id };
    },
    /** Liga um lançamento a uma recorrência existente (vira um pagamento dela) */
    [A.vincularRecorrencia]: (d) => {
      const l = doc.lancamentos.find((x) => x.id === d.id);
      const o = doc.lancamentos.find((x) => x.id === d.serieId && ehOrigem(x));
      if (!l || !o || l.id === o.id || ehOrigem(l)) throw erro("OPERATION_FAILED");
      if (l.divisao) throw erro("SPLIT_INVALID");                           // parte de divisão não entra em recorrência
      const mes = mesDe(l.data);
      Object.assign(l, { tipo: "recorrente", recorrencia: o.recorrencia, serieId: o.id, competencia: mes, ocorrencia: l.data, sentido: null,
        parcelaAtual: o.recorrencia === "parcelada" ? o.parcelaAtual + diffMeses(o.competencia || mesDe(o.data), mes) : null,
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
      const base = doc.lancamentos.find((l) => l.id === d.id);
      if (!base || base.tipo === "recorrente") throw erro("SPLIT_INVALID");
      const membros = base.divisao ? doc.lancamentos.filter((l) => l.divisao && l.divisao.id === base.divisao.id) : [base];
      const total = base.divisao ? base.divisao.total : base.valor;
      const partes = Array.isArray(d.partes) ? d.partes : [];
      if (partes.length < 1 || partes.length > 30) throw erro("SPLIT_INVALID");
      const centavos = partes.map((p) => Math.round(numero(p.valor) * 100));
      if (centavos.some((c) => !(c > 0))) throw erro("SPLIT_INVALID");
      if (centavos.reduce((s, c) => s + c, 0) !== Math.round(total * 100)) throw erro("SPLIT_INVALID");
      if (partes.some((p) => p.data !== base.data)) throw erro("SPLIT_INVALID");
      const perfis = partes.map((p) => p.perfilId);
      if (perfis.some((id) => !id || !doc.perfis.some((x) => x.id === id)) || new Set(perfis).size !== perfis.length) throw erro("SPLIT_INVALID");
      if (partes.some((p) => !p.categoriaId || !doc.categorias.some((c) => c.id === p.categoriaId))) throw erro("SPLIT_INVALID");

      const grupo = (base.divisao && base.divisao.id) || novoId("d");
      doc.lancamentos = doc.lancamentos.filter((l) => l === base || !membros.includes(l));
      partes.forEach((p, i) => {
        const alvo = i === 0 ? base : Object.assign({}, base, { id: novoId("l") });
        Object.assign(alvo, {
          descricao: texto(p.descricao, 140) || base.descricao, valor: centavos[i] / 100, data: base.data,
          categoriaId: p.categoriaId, perfilId: p.perfilId,
          divisao: partes.length > 1 ? { id: grupo, total: r2(total), partes: partes.length } : null,
        });
        if (i > 0) doc.lancamentos.push(alvo);
      });
      if (partes.length === 1) delete base.divisao;
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

    /* Contas */
    [A.createConta]: (d) => {
      const e = lerConta(d.conta);
      const c = { id: novoId("c"), nome: e.nome, tipo: e.tipo, ultimos4Digitos: e.ultimos4Digitos, cor: e.cor, tipoInvestimento: e.tipoInvestimento,
        instituicao: e.instituicao, limite: e.limite, fechamento: e.fechamento, vencimento: e.vencimento, historico: [] };
      registrarSaldo(c, e.saldo);
      doc.contas.push(c);
      return { conta: contaPublica(c) };
    },
    [A.updateConta]: (d) => {
      const c = doc.contas.find((x) => x.id === d.id);
      if (!c) throw erro("OPERATION_FAILED");
      if (d.conta) {
        const e = lerConta(d.conta);
        Object.assign(c, { nome: e.nome, tipo: e.tipo, ultimos4Digitos: e.ultimos4Digitos, cor: e.cor, tipoInvestimento: e.tipoInvestimento });
        registrarSaldo(c, e.saldo);
      } else if (d.cor) c.cor = cor(d.cor, c.cor);
      if (typeof d.oculta === "boolean") c.oculta = d.oculta;
      if (d.nome !== undefined) { const n = texto(d.nome, 60); if (!n) throw erro("OPERATION_FAILED"); c.nome = n; }
      if (d.saldo !== undefined) { const v = numero(d.saldo); if (!Number.isFinite(v) || Math.abs(v) > 1e12) throw erro("OPERATION_FAILED"); registrarSaldo(c, r2(v)); }
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
      const c = Object.assign({ id: novoId("k") }, lerCategoria(d.categoria));
      doc.categorias.push(c);
      return { categoria: c };
    },
    [A.updateCategoria]: (d) => {
      const c = doc.categorias.find((x) => x.id === d.id);
      if (!c) throw erro("OPERATION_FAILED");
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
      if (d.nome !== undefined) { const n = texto(d.nome, 60); if (!n) throw erro("OPERATION_FAILED"); c.nome = n; }
      if (d.icone !== undefined) c.icone = texto(d.icone, 8) || "•";
      return { categoria: c, id: c.id, cor: c.cor };
    },
    [A.deleteCategoria]: (d) => {
      const alvo = doc.categorias.find((c) => c.id === d.id);
      if (!alvo) throw erro("OPERATION_FAILED");
      doc.categorias = doc.categorias.filter((c) => c.id !== d.id);
      const temLancamentos = doc.lancamentos.some((l) => l.categoriaId === d.id);
      let outros = doc.categorias.find((c) => c.nome.toLowerCase() === "outros");
      if (temLancamentos && !outros && alvo.nome.toLowerCase() !== "outros") {
        outros = { id: novoId("k"), nome: "Outros", icone: "📦", cor: "#6078a9", grupo: null, reservado: 0, status: "regular" };
        doc.categorias.push(outros);
      }
      doc.lancamentos.forEach((l) => { if (l.categoriaId === d.id) l.categoriaId = outros ? outros.id : null; });
      return { id: d.id };
    },
    [A.createCategoriasSugeridas]: () => {
      (R().categoriasSugeridas || []).forEach((s) => {
        if (doc.categorias.some((c) => c.nome.toLowerCase() === s.nome.toLowerCase())) return;
        doc.categorias.push(Object.assign({ id: novoId("k") }, lerCategoria(s)));
      });
      return { total: doc.categorias.length };
    },

    /* Perfis */
    [A.createPerfil]: (d) => {
      const e = lerPerfil(d.perfil);
      if (doc.perfis.some((p) => p.nome.toLowerCase() === e.nome.toLowerCase())) throw erro("NAME_IN_USE");
      const p = Object.assign({ id: novoId("p") }, e);
      doc.perfis.push(p);
      return { perfil: p };
    },
    [A.updatePerfil]: (d) => {
      const p = doc.perfis.find((x) => x.id === d.id);
      if (!p) throw erro("OPERATION_FAILED");
      if (d.perfil) {
        const e = lerPerfil(d.perfil);
        if (doc.perfis.some((x) => x.id !== p.id && x.nome.toLowerCase() === e.nome.toLowerCase())) throw erro("NAME_IN_USE");
        Object.assign(p, e);
      } else if (d.cor) p.cor = cor(d.cor, p.cor);
      if (d.nome !== undefined && !d.perfil) {
        const n = texto(d.nome, 40);
        if (!n) throw erro("OPERATION_FAILED");
        if (doc.perfis.some((x) => x.id !== p.id && x.nome.toLowerCase() === n.toLowerCase())) throw erro("NAME_IN_USE");
        p.nome = n;
      }
      p.arquivado = !!p.arquivado;
      return { perfil: p, id: p.id, cor: p.cor };
    },
    [A.deletePerfil]: (d) => {
      if (!doc.perfis.some((p) => p.id === d.id)) throw erro("OPERATION_FAILED");
      doc.perfis = doc.perfis.filter((p) => p.id !== d.id);
      doc.lancamentos.forEach((l) => { if (l.perfilId === d.id) l.perfilId = null; });
      return { id: d.id };
    },

    /* Ações em lote (barra de seleção em Lançamentos) */
    [A.updateLancamentosEmLote]: (d) => {
      const ids = Array.isArray(d.ids) ? d.ids : [];
      if (!ids.length) throw erro("OPERATION_FAILED");
      const tipo = d.tipo !== undefined ? (["regular", "interno", "receita", "estorno"].includes(d.tipo) ? d.tipo : null) : undefined;
      let categoriaId;
      if (d.categoriaId !== undefined) categoriaId = existe(doc.categorias, d.categoriaId);
      if (d.tipo !== undefined && !tipo) throw erro("OPERATION_FAILED");
      let perfilId;
      if (d.perfilId !== undefined) perfilId = d.perfilId ? perfilPermitido(d.perfilId, null) : null;
      let n = 0;
      doc.lancamentos.forEach((l) => {
        if (!ids.includes(l.id)) return;
        if (tipo) { encerrarSerieDe(l); l.tipo = tipo; l.recorrencia = null; l.parcelaAtual = null; l.parcelaTotal = null; }
        if (perfilId !== undefined) l.perfilId = perfilId;
        if (categoriaId !== undefined) l.categoriaId = categoriaId;
        if (tipo === "interno" && !l.direcao) l.direcao = "saida";
        n += 1;
      });
      return { alterados: n };
    },
    [A.deleteLancamentos]: (d) => {
      const ids = new Set(Array.isArray(d.ids) ? d.ids : []);
      const antes = doc.lancamentos.length;
      const grupos = new Set();
      doc.lancamentos.filter((l) => ids.has(l.id)).forEach((l) => { encerrarSerieDe(l); if (l.divisao) grupos.add(l.divisao.id); });
      doc.lancamentos = doc.lancamentos.filter((l) => !ids.has(l.id));
      grupos.forEach(ajustarDivisao);
      return { excluidos: antes - doc.lancamentos.length };
    },

    /* Perfis: arquivar */
    [A.arquivarPerfil]: (d) => {
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
      return { foto: doc.config.foto || null, orcamentoAtivo: doc.config.orcamentoAtivo !== false };
    },
  };

  function atende(action) { return action in LEITURAS || action in ESCRITAS; }

  function handle(action, data) {
    const d = data || {};
    if (action in LEITURAS) {
      return fila.then(() => garantirCarregado()).then(() => clone(LEITURAS[action](d)));
    }
    if (action in ESCRITAS) {
      return alterar(() => clone(ESCRITAS[action](d)));
    }
    return Promise.reject(erro("OPERATION_FAILED"));
  }

  /** Promessa que resolve quando todas as gravações pendentes terminarem (usado ao fechar o programa) */
  const aguardarGravacoes = () => fila.catch(() => null);

  ZoZo.servico = { handle, atende, reset, FREQUENCIAS, aguardarGravacoes, gravando };
})(window.ZoZo);
