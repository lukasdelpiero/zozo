/* =============================================================
   ZoZo — Dados da conta de demonstração (demo@usezozo.com.br)
   ------------------------------------------------------------
   A cada acesso, sorteia quantidades e valores de perfis, contas,
   cartões, categorias, lançamentos e recorrências dos últimos meses.
   Tudo é fictício, gerado no navegador e mantido só na memória da
   aba: nada vai para o servidor (que recusa gravações dessa conta).
   Mesmo formato do documento gravado pelo serviço de dados.
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";

  /* Sorteio: semente do crypto (cada acesso é diferente), sequência rápida (mulberry32) */
  function sorteador() {
    let a = crypto.getRandomValues(new Uint32Array(1))[0];
    const r = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const entre = (min: any, max: any) => min + Math.floor(r() * (max - min + 1));
    const valor = (min: any, max: any) => Math.round((min + r() * (max - min)) * 100) / 100;
    const um = (lista: any) => lista[Math.floor(r() * lista.length)];
    const alguns = (lista: any, n: any) => { const c = lista.slice(); for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c.slice(0, n); };
    return { r, entre, valor, um, alguns };
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: Date) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const ym = (d: Date) => d.getFullYear() + "-" + pad(d.getMonth() + 1);

  const PERFIS: any[][] = [["Pessoal", "#5a4cfc"], ["Casa", "#00b2b2"], ["Mãe", "#ff1ad9"], ["Trabalho", "#f58000"], ["Filhos", "#069713"], ["Viagem", "#2d8cff"]];

  // [nome, últimos 4, tipo, saldo mín, saldo máx, cor, tipo de investimento]
  const CARTOES: any[][] = [["Nubank", "1234", "cartao", 900, 3800, "#aa33ff"], ["Itaú Visa", "5521", "cartao", 400, 2200, "#ff5d04"],
    ["Inter Mastercard", "7310", "cartao", 300, 1900, "#f58000"], ["C6 Carbon", "0042", "cartao", 500, 2600, "#6078a9"]];
  const BANCOS: any[][] = [["Itaú", "4821", "corrente", 2500, 12000, "#f58000"], ["Bradesco", "3307", "corrente", 1500, 9000, "#ff1a1a"],
    ["Caixa", "0912", "poupanca", 4000, 22000, "#2d8cff"], ["Banco do Brasil", "6650", "corrente", 1800, 8000, "#edbf00"]];
  const INVESTIMENTOS: any[][] = [["XP Investimentos", "2221", "investimento", 15000, 60000, "#069713", "Renda fixa"],
    ["Tesouro Direto", "1212", "investimento", 8000, 30000, "#00b2b2", "Tesouro Direto"],
    ["Clear Ações", "7788", "investimento", 5000, 25000, "#5a4cfc", "Ações"],
    ["Nu Reserva", "9001", "investimento", 2000, 12000, "#aa33ff", "Fundos"]];
  const OUTRAS: any[][] = [["Empréstimo BB", "3344", "emprestimo", 8000, 25000, "#edbf00"], ["Carteira", "", "outros", 80, 600, "#6078a9"]];

  // [ícone, nome, cor, grupo, orçamento, compras típicas [descrição, mín, máx]]
  const CATEGORIAS: any[][] = [
    ["🛒", "Mercado", "#069713", "Alimentação", 1300, [["Pão de Açúcar", 120, 480], ["Atacadão", 250, 700], ["Sacolão São Jorge", 40, 130], ["Feira livre", 30, 90]]],
    ["🍝", "Restaurantes", "#ff5d04", "Alimentação", 450, [["iFood", 35, 95], ["Fogo de Chão", 180, 420], ["Padaria Real", 15, 45]]],
    ["🚗", "Transporte", "#6078a9", null, 400, [["Uber", 18, 60], ["Posto Shell", 150, 320], ["Estacionamento", 15, 40]]],
    ["💊", "Saúde", "#ff0f5f", null, 350, [["Drogasil", 40, 190], ["Consulta Dra. Helena", 250, 380]]],
    ["🎬", "Lazer", "#aa33ff", null, 250, [["Cinemark", 40, 110], ["Ingresso Rápido", 80, 260]]],
    ["💻", "Eletrônicos", "#b27700", null, 400, [["Kabum", 90, 900], ["Amazon", 50, 450]]],
    ["👕", "Roupas", "#5a4cfc", null, 300, [["Renner", 80, 350], ["Zara", 120, 480]]],
    ["☕", "Padaria e café", "#bc6d09", "Alimentação", 150, [["Starbucks", 18, 42], ["Café do Ponto", 9, 25]]],
    ["🐶", "Pets", "#f58000", null, 200, [["Petz", 60, 260]]],
    ["📚", "Educação", "#b27700", null, 300, [["Livraria Cultura", 45, 160], ["Curso Alura", 90, 120]]],
    ["🎁", "Presentes", "#ff1ad9", null, 150, [["Presente aniversário", 60, 250]]],
    ["✈️", "Viagens", "#00b2b2", null, 600, [["Latam", 350, 1400], ["Booking", 280, 900]]],
  ];
  // Contas da casa (recorrências): [ícone, categoria, cor, grupo, orçamento, descrição, mín, máx, dia, frequência]
  const FIXAS: any[][] = [
    ["🏠", "Aluguel", "#5a4cfc", "Moradia", 2200, "Aluguel", 1800, 2600, 1, "mensal"],
    ["🏢", "Condomínio", "#2d8cff", "Moradia", 650, "Condomínio", 450, 800, 5, "mensal"],
    ["⚡", "Energia", "#edbf00", "Moradia", 250, "Enel", 160, 320, 10, "mensal"],
    ["📺", "Assinaturas", "#d81aff", null, 120, "Netflix", 44.9, 59.9, 7, "mensal"],
    ["📶", "Internet e telefone", "#2d8cff", null, 150, "Vivo Fibra", 99.9, 149.9, 12, "mensal"],
    ["🏋️", "Academia", "#ff5d04", null, 130, "Smart Fit", 99.9, 129.9, 3, "mensal"],
    ["🛡️", "Seguros", "#6078a9", null, 250, "Seguro do carro", 180, 260, 15, "mensal"],
  ];

  /** completo = modo teste: TODOS os tipos (contas, débito, estorno, parcelada, divisão), para conferir cada tela */
  function documento(hoje0: Date, completo = false): Documento {
    const s = sorteador();
    const hoje = new Date(hoje0.getFullYear(), hoje0.getMonth(), hoje0.getDate());
    let seq = 0;
    const id = (p: any) => p + "demo" + (++seq).toString(36);

    /* Perfis (3 a 5) */
    const perfis = s.alguns(PERFIS, s.entre(3, 5)).map(([nome, cor]: any[]) => ({ id: id("p"), nome, cor, orcamento: 0 }));

    /* Contas: 1–3 cartões, 1–2 bancos, 1–3 investimentos, às vezes empréstimo e carteira */
    const escolhidas = completo
      ? ([] as any[][]).concat(CARTOES.slice(0, 2), BANCOS, INVESTIMENTOS.slice(0, 2), OUTRAS)
      : ([] as any[][]).concat(s.alguns(CARTOES, s.entre(1, 3)), s.alguns(BANCOS, s.entre(1, 2)), s.alguns(INVESTIMENTOS, s.entre(1, 3)),
        OUTRAS.filter(() => s.r() < 0.5));
    const contas = escolhidas.map(([nome, dig, tipo, min, max, cor, ti]) => {
      const saldo = s.valor(min, max);
      const historico: Array<{ data: string; saldo: number }> = [];
      let v = saldo;
      const tendencia = tipo === "cartao" || tipo === "emprestimo" ? -0.0012 : 0.0016;
      for (let i = 0; i <= 390; i += 3) {
        const d = new Date(hoje); d.setDate(d.getDate() - i);
        historico.unshift({ data: iso(d), saldo: Math.round(v * 100) / 100 });
        if (s.r() < 0.6) v = Math.max(0, v * (1 - tendencia * 3) + (s.r() - 0.5) * saldo * 0.012);
      }
      return { id: id("c"), nome, ultimos4Digitos: dig, tipo, cor, tipoInvestimento: ti || "", historico };
    });
    const cartoes = contas.filter((c) => c.tipo === "cartao");
    const bancos = contas.filter((c) => c.tipo === "corrente" || c.tipo === "poupanca");
    const pagadoras = cartoes.concat(bancos);
    const principal = bancos[0];

    /* Categorias: 5 a 9 de consumo + as das recorrências sorteadas + movimentações (fora do orçamento) */
    const consumo = s.alguns(CATEGORIAS, s.entre(5, 9));
    const fixas = s.alguns(FIXAS, s.entre(3, 6));
    const categorias: any[] = [];
    const nova = (icone: any, nome: any, cor: any, grupo: any, reservado: any, status: any) => { const c = { id: id("k"), icone, nome, cor, grupo, reservado, status }; categorias.push(c); return c; };
    const catConsumo = consumo.map(([icone, nome, cor, grupo, orc, compras]: any[]) => ({ cat: nova(icone, nome, cor, grupo, s.r() < 0.8 ? orc : 0, "regular"), compras }));
    const catFixas = fixas.map((f: any) => ({ cat: categorias.find((c) => c.nome === f[1]) || nova(f[0], f[1], f[2], f[3], f[4], "regular"), f }));
    const transf = nova("🔁", "Transferências", "#9aa5b5", "Movimentações", 0, "excluida");
    const fatura = nova("💳", "Fatura do cartão", "#6078a9", "Movimentações", 0, "excluida");
    const salario = nova("💰", "Salário", "#069713", null, 0, "excluida");

    /* Lançamentos dos últimos 3 meses (só o que já aconteceu) */
    const lancamentos: any[] = [];
    const perfil = () => (s.r() < 0.85 ? s.um(perfis).id : null);
    const base = (data: any, descricao: any, contaId: any, categoriaId: any, valor: any, tipo: any, extra?: any) => Object.assign({
      id: id("l"), data: iso(data), descricao, contaId, categoriaId, perfilId: perfil(), valor, tipo, notas: "",
      recorrencia: null, parcelaAtual: null, parcelaTotal: null, sentido: null, direcao: null, serieId: null, competencia: ym(data), encerradaEm: null,
    }, extra || {});
    const salarioBase = s.valor(5200, 14800);
    const origens: Record<string, any> = {};
    for (let off = 2; off >= 0; off--) {
      const mes = new Date(hoje.getFullYear(), hoje.getMonth() - off, 1);
      const ultimo = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
      const dia = (n: any) => new Date(mes.getFullYear(), mes.getMonth(), Math.min(n, ultimo));
      const passou = (d: any) => d <= hoje;

      const dSal = dia(5);
      if (principal && passou(dSal)) lancamentos.push(base(dSal, "Salário", principal.id, salario.id, salarioBase, "receita"));

      // Recorrências (mesma série nos três meses)
      catFixas.forEach(({ cat, f }: any) => {
        const d = dia(f[8]);
        if (!passou(d)) return;
        const l = base(d, f[5], s.um(pagadoras).id, cat.id, s.valor(f[6], f[7]), "recorrente", { recorrencia: f[9] });
        if (!origens[f[5]]) { origens[f[5]] = l; l.serieId = l.id; } else l.serieId = origens[f[5]].id;
        lancamentos.push(l);
      });

      // Compras do dia a dia: 8 a 22 por mês
      for (let i = s.entre(8, 22); i > 0; i--) {
        const d = dia(s.entre(1, ultimo));
        if (!passou(d)) continue;
        const { cat, compras } = s.um(catConsumo);
        const [descricao, min, max] = s.um(compras);
        lancamentos.push(base(d, descricao, s.um(pagadoras).id, cat.id, s.valor(min, max), "regular"));
      }

      // Um estorno de vez em quando, transferência para a poupança e pagamento da fatura
      if (completo || s.r() < 0.5) {
        const d = dia(s.entre(1, ultimo));
        const { cat, compras } = s.um(catConsumo);
        const [descricao, min, max] = s.um(compras);
        if (passou(d) && cartoes.length) lancamentos.push(base(d, "Estorno " + descricao, cartoes[0].id, cat.id, s.valor(min, Math.max(min, max / 2)), "estorno"));
      }
      const dTr = dia(s.entre(8, 20));
      if (principal && passou(dTr) && s.r() < 0.7) lancamentos.push(base(dTr, "Transferência para poupança", principal.id, transf.id, s.valor(300, 2000), "interno", { sentido: "saida", direcao: "saida" }));
      const dFat = dia(25);
      if (principal && cartoes.length && passou(dFat)) lancamentos.push(base(dFat, "Pagamento fatura " + cartoes[0].nome, principal.id, fatura.id, s.valor(800, 3800), "interno", { sentido: "saida", direcao: "saida" }));
    }

    // Compra parcelada (às vezes): a parcela atual fica no mês de hoje e o serviço gera as próximas
    if (cartoes.length && (completo || s.r() < 0.7)) {
      const total = s.um([6, 10, 12]);
      const atual = s.entre(1, 3);
      const d = new Date(hoje.getFullYear(), hoje.getMonth(), Math.min(s.entre(1, 28), hoje.getDate()));
      const eletronicos = catConsumo.find((c: any) => c.cat.nome === "Eletrônicos");
      const cat = eletronicos ? eletronicos.cat : nova("💻", "Eletrônicos", "#b27700", null, 400, "regular");
      const l = base(d, s.um(["Notebook Dell", "Geladeira Brastemp", "iPhone", "Sofá Tok&Stok"]), cartoes[0].id, cat.id, s.valor(180, 650), "recorrente",
        { recorrencia: "parcelada", parcelaAtual: atual, parcelaTotal: total });
      l.serieId = l.id;
      lancamentos.push(l);
    }

    if (completo && principal && catConsumo.length) {
      // débito em conta (sai direto do banco) e uma compra dividida em duas partes
      const { cat } = catConsumo[0];
      const dDeb = new Date(hoje.getFullYear(), hoje.getMonth(), Math.max(1, hoje.getDate() - 2));
      lancamentos.push(base(dDeb, "Conta de água", principal.id, cat.id, s.valor(60, 140), "debito"));
      const dDiv = new Date(hoje.getFullYear(), hoje.getMonth(), Math.max(1, hoje.getDate() - 1));
      const partes = [s.valor(80, 160), s.valor(40, 120)];
      const total = Math.round((partes[0] + partes[1]) * 100) / 100;
      const grupo = id("dv");
      partes.forEach((v, i) => lancamentos.push(base(dDiv, "Jantar dividido", (cartoes[0] || principal).id, catConsumo[i % catConsumo.length].cat.id, v, "regular",
        { divisao: { id: grupo, total, partes: 2 } })));
    }

    return { versao: 1, perfis, contas, categorias, lancamentos, grupos: {}, config: {}, meta: {}, faturas: {} };
  }

  ZoZo.demo = { documento };
})(window.ZoZo = window.ZoZo || {});
