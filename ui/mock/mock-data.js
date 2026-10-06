/* =============================================================
   ZoZo — DADOS FICTÍCIOS PARA DESENVOLVIMENTO (seção 72)
   ------------------------------------------------------------
   Isolados em /mock. Só são usados no modo demonstração (index.html
   aberto direto do disco ou com ?mock=1). Não são publicados.
   ============================================================= */
(function (ZoZo) {
  "use strict";

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());

  /** Documento de demonstração no mesmo formato gravado pelo serviço de dados */
  function buildDocumento(today) {
    const hoje = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const r = rng(20261002);
    const ym = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1);

    const perfis = [
      { id: "p1", nome: "Pessoal", cor: "#5a4cfc" },
      { id: "p2", nome: "Casa", cor: "#00b2b2" },
      { id: "p3", nome: "Mãe", cor: "#ff1ad9" },
      { id: "p4", nome: "Trabalho", cor: "#f58000" },
    ];

    const contasBase = [
      ["c1", "Nubank", "1234", "cartao", 2384.17, "#aa33ff", ""],
      ["c2", "Itaú Visa", "5521", "cartao", 912.4, "#ff5d04", ""],
      ["c3", "Itaú", "4821", "corrente", 8421.55, "#f58000", ""],
      ["c4", "Caixa", "0912", "poupanca", 15230, "#2d8cff", ""],
      ["c5", "XP Investimentos", "2221", "investimento", 48210.33, "#069713", "Renda fixa"],
      ["c6", "Tesouro Direto", "1212", "investimento", 22480.9, "#00b2b2", "Tesouro Direto"],
      ["c9", "Clear Ações", "7788", "investimento", 13920.5, "#5a4cfc", "Ações"],
      ["c7", "Empréstimo BB", "3344", "emprestimo", 18400, "#edbf00", ""],
      ["c8", "Carteira", "", "outros", 320, "#6078a9", ""],
    ];
    const contas = contasBase.map(([id, nome, dig, tipo, saldo, cor, ti]) => {
      const historico = [];
      let v = saldo;
      const tendencia = tipo === "cartao" || tipo === "emprestimo" ? -0.0012 : 0.0016;
      for (let i = 0; i <= 390; i += 3) {
        const d = new Date(hoje); d.setDate(d.getDate() - i);
        historico.unshift({ data: iso(d), saldo: Math.round(v * 100) / 100 });
        if (r() < 0.6) v = Math.max(0, v * (1 - tendencia * 3) + (r() - 0.5) * saldo * 0.012);
      }
      return { id, nome, ultimos4Digitos: dig, tipo, cor, tipoInvestimento: ti, historico };
    });

    const categorias = [
      { id: "k1", icone: "🏠", nome: "Aluguel", cor: "#5a4cfc", grupo: "Moradia", reservado: 2200, status: "regular" },
      { id: "k2", icone: "🏢", nome: "Condomínio", cor: "#2d8cff", grupo: "Moradia", reservado: 650, status: "regular" },
      { id: "k3", icone: "⚡", nome: "Energia", cor: "#edbf00", grupo: "Moradia", reservado: 250, status: "regular" },
      { id: "k5", icone: "🛒", nome: "Mercado", cor: "#069713", grupo: "Alimentação", reservado: 1300, status: "regular" },
      { id: "k6", icone: "🍝", nome: "Restaurantes", cor: "#ff5d04", grupo: "Alimentação", reservado: 450, status: "regular" },
      { id: "k7", icone: "🚗", nome: "Transporte", cor: "#6078a9", grupo: null, reservado: 400, status: "regular" },
      { id: "k8", icone: "💊", nome: "Saúde", cor: "#ff0f5f", grupo: null, reservado: 350, status: "regular" },
      { id: "k9", icone: "🎬", nome: "Lazer", cor: "#aa33ff", grupo: null, reservado: 250, status: "regular" },
      { id: "k10", icone: "📺", nome: "Assinaturas", cor: "#d81aff", grupo: null, reservado: 120, status: "regular" },
      { id: "k11", icone: "💻", nome: "Eletrônicos", cor: "#b27700", grupo: null, reservado: 400, status: "regular" },
      { id: "k12", icone: "🔁", nome: "Transferências", cor: "#9aa5b5", grupo: "Movimentações", reservado: 0, status: "excluida" },
      { id: "k13", icone: "💳", nome: "Fatura do cartão", cor: "#6078a9", grupo: "Movimentações", reservado: 0, status: "excluida" },
      { id: "k14", icone: "💰", nome: "Salário", cor: "#069713", grupo: null, reservado: 0, status: "excluida" },
    ];

    // [dia, descrição, conta, categoria, perfil, valor, tipo, recorrência]
    const modelos = [
      [1, "Aluguel", "c3", "k1", "p2", 2200, "recorrente", "fixa"],
      [2, "Salário", "c3", "k14", "p1", 9850, "receita"],
      [3, "Pão de Açúcar", "c1", "k5", "p2", 412.37, "regular"],
      [5, "Condomínio", "c3", "k2", "p2", 640, "recorrente", "fixa"],
      [6, "Uber", "c1", "k7", "p1", 38.9, "regular"],
      [7, "Netflix", "c1", "k10", "p2", 59.9, "recorrente", "fixa"],
      [8, "Sacolão São Jorge", "c1", "k5", "p3", 96.4, "regular"],
      [9, "Drogasil", "c1", "k8", "p3", 156.8, "regular"],
      [10, "Enel", "c3", "k3", "p2", 287.4, "recorrente", "fixa"],
      [11, "Fogo de Chão", "c2", "k6", "p1", 384, "regular"],
      [12, "Atacadão", "c1", "k5", "p2", 675.55, "regular"],
      [13, "Transferência para poupança", "c3", "k12", "p1", 1500, "interno"],
      [14, "Posto Shell", "c2", "k7", "p1", 279.1, "regular"],
      [16, "iFood", "c1", "k6", "p1", 72.9, "regular"],
      [17, "Consulta Dra. Helena", "c3", "k8", "p3", 320, "regular"],
      [20, "Cinemark", "c1", "k9", "p1", 89.9, "regular"],
      [21, "Estorno Amazon", "c1", "k9", "p1", 129.9, "estorno"],
      [22, "Feira livre", "c8", "k5", "p3", 64, "regular"],
      [25, "Pagamento fatura Nubank", "c3", "k13", "p1", 2384.17, "interno"],
    ];

    const lancamentos = [];
    const origens = {};
    let n = 0;
    for (let off = 2; off >= 0; off--) {
      const base = new Date(hoje.getFullYear(), hoje.getMonth() - off, 1);
      const ultimoDia = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
      modelos.forEach((m, i) => {
        const d = new Date(base.getFullYear(), base.getMonth(), Math.min(m[0], ultimoDia));
        if (d > hoje) return;                         // só o que já aconteceu
        const recorrente = m[6] === "recorrente";
        const fator = recorrente || m[6] === "interno" ? 1 : 0.85 + ((i * 37 + off * 11) % 30) / 100;
        n += 1;
        const l = {
          id: "l" + n, data: iso(d), descricao: m[1], contaId: m[2], categoriaId: m[3], perfilId: m[4],
          valor: Math.round(m[5] * fator * 100) / 100, tipo: m[6],
          notas: m[1] === "Consulta Dra. Helena" ? "Retorno marcado para daqui a 3 meses." : "",
          recorrencia: recorrente ? m[7] : null, parcelaAtual: null, parcelaTotal: null,
          serieId: null, competencia: ym(d), encerradaEm: null,
        };
        if (recorrente) {
          if (!origens[m[1]]) { origens[m[1]] = l.id; l.serieId = l.id; }
          else l.serieId = origens[m[1]];
        }
        lancamentos.push(l);
      });
    }
    // Compra parcelada: Notebook 12x, primeira parcela há 2 meses (parcela 1/12)
    const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 18);
    lancamentos.push({ id: "lnb", data: iso(ini), descricao: "Notebook Dell", contaId: "c1", categoriaId: "k11", perfilId: "p4",
      valor: 389.9, tipo: "recorrente", notas: "", recorrencia: "parcelada", parcelaAtual: 1, parcelaTotal: 12,
      serieId: "lnb", competencia: ym(ini), encerradaEm: null });
    const p2 = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 18);
    lancamentos.push({ id: "lnb2", data: iso(p2), descricao: "Notebook Dell", contaId: "c1", categoriaId: "k11", perfilId: "p4",
      valor: 389.9, tipo: "recorrente", notas: "", recorrencia: "parcelada", parcelaAtual: 2, parcelaTotal: 12,
      serieId: "lnb", competencia: ym(p2), encerradaEm: null });

    return { versao: 1, perfis, contas, categorias, lancamentos };
  }

  ZoZo.mock = ZoZo.mock || {};
  ZoZo.mock.buildDocumento = buildDocumento;
})(window.ZoZo = window.ZoZo || {});
