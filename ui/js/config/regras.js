/* =============================================================
   ZoZo — Pontos de configuração de regras
   ------------------------------------------------------------
   A especificação deixa algumas regras em aberto. Elas ficam
   isoladas aqui para serem definidas pela camada de negócio
   sem alterar componentes visuais.
   ============================================================= */
(function (ZoZo) {
  "use strict";

  /** Identificação do programa */
  ZoZo.sobre = Object.freeze({ versao: "2.6.0", autor: "Lukas Del Piero Barros" });

  ZoZo.regras = {
    /** Máximo de caracteres do nome de lançamentos, contas, categorias e perfis (nomes longos aparecem cortados com "…") */
    limiteNome: 50,

    /** Cor sugerida para um item novo (sorteada da paleta) */
    corSugerida() {
      const n = new Uint8Array(1); crypto.getRandomValues(n);
      return this.paleta[n[0] % this.paleta.length];
    },

    /** Tipos de lançamento cujo valor é exibido em verde (seção 14.5) */
    tiposValorVerde: ["receita", "estorno"],

    /** Fatura (antigo "boleto"; a chave continua "boleto") */
    boleto: {
      /**
       * Como cada tipo de lançamento entra no "Total das transações".
       * +1 soma, -1 subtrai, 0 ignora. AJUSTAR conforme a regra definida.
       */
      sinalPorTipo: { regular: 1, recorrente: 1, interno: 1, receita: -1, estorno: -1, debito: 1 },
      /** Contribuições (nome + valor) somam ao total. Use -1 se devem abater. */
      sinalContribuicao: 1,
      /** Descontos sempre reduzem o total (seção 46.6) */
      sinalDesconto: -1,
      /**
       * Seção 46.7: sinal/aplicação do arredondamento ainda não definido.
       * Com +1 o valor digitado é aplicado como está (o usuário pode
       * digitar valores negativos). AJUSTAR quando a regra existir.
       */
      sinalArredondamento: 1,
      /** Permite valores negativos no campo de arredondamento */
      arredondamentoAceitaNegativo: true,
    },

    categorias: {
      /**
       * Como cada tipo de lançamento entra no "Gasto" da categoria no mês.
       * +1 soma, -1 subtrai, 0 ignora. AJUSTAR conforme a sua regra.
       */
      sinalGastoPorTipo: { regular: 1, recorrente: 1, interno: 1, estorno: -1, receita: 0, debito: 1 },
    },

    /** Barra de informações de Lançamentos (com filtros ativos) */
    totais: {
      gasto: { regular: 1, recorrente: 1, estorno: -1, debito: 1 },   // "Total gasto"
      recebido: { receita: 1 },                           // "Total recebido"
    },

    recorrencias: {
      /**
       * true  → uma ocorrência só conta como "paga" quando há lançamento registrado
       *         (botão "Registrar pagamento" no painel da recorrência).
       * false → ocorrências com data até hoje contam como pagas automaticamente.
       */
      pagoSomenteComLancamento: true,
    },

    /** Tipos de investimento oferecidos no cadastro de conta (Alocações) */
    tiposInvestimento: ["Renda fixa", "Tesouro Direto", "Ações", "Fundos imobiliários", "Fundos", "Previdência", "Criptomoedas", "Outros"],
    iconesInvestimento: { "Renda fixa": "🏦", "Tesouro Direto": "🛡️", "Ações": "📈", "Fundos imobiliários": "🏢", "Fundos": "📊", "Previdência": "🧓", "Criptomoedas": "🪙", "Outros": "💼" },

    /** Modelos oferecidos no botão "+" de Categorias */
    modelosCategoria: [
      { nome: "Academia", icone: "🏋️", cor: "#ff5d04" }, { nome: "Aluguel", icone: "🏠", cor: "#5a4cfc" },
      { nome: "Assinaturas", icone: "📺", cor: "#d81aff" }, { nome: "Bares e baladas", icone: "🍻", cor: "#b27700" },
      { nome: "Beleza", icone: "💄", cor: "#ff1ad9" }, { nome: "Carro", icone: "🚗", cor: "#6078a9" },
      { nome: "Combustível", icone: "⛽", cor: "#bc6d09" }, { nome: "Condomínio", icone: "🏢", cor: "#2d8cff" },
      { nome: "Delivery", icone: "🛵", cor: "#ff0f5f" }, { nome: "Doações", icone: "🤝", cor: "#edbf00" },
      { nome: "Educação", icone: "📚", cor: "#b27700" }, { nome: "Eletrônicos", icone: "💻", cor: "#6078a9" },
      { nome: "Energia", icone: "⚡", cor: "#edbf00" }, { nome: "Farmácia", icone: "💊", cor: "#ff0f5f" },
      { nome: "Filhos", icone: "🧒", cor: "#00b2b2" }, { nome: "Impostos", icone: "🧾", cor: "#899201" },
      { nome: "Internet e telefone", icone: "📶", cor: "#2d8cff" }, { nome: "Lazer", icone: "🎬", cor: "#aa33ff" },
      { nome: "Mercado", icone: "🛒", cor: "#069713" }, { nome: "Padaria e café", icone: "☕", cor: "#bc6d09" },
      { nome: "Pets", icone: "🐶", cor: "#f58000" }, { nome: "Presentes", icone: "🎁", cor: "#ff1ad9" },
      { nome: "Restaurantes", icone: "🍝", cor: "#ff5d04" }, { nome: "Roupas", icone: "👕", cor: "#5a4cfc" },
      { nome: "Saúde", icone: "🏥", cor: "#ff0f5f" }, { nome: "Seguros", icone: "🛡️", cor: "#6078a9" },
      { nome: "Transporte", icone: "🚌", cor: "#6078a9" }, { nome: "Viagens", icone: "✈️", cor: "#00b2b2" },
      { nome: "Água", icone: "💧", cor: "#2d8cff" },
    ],

    /** Sugestões oferecidas quando a lista de categorias está vazia (o usuário escolhe criar) */
    categoriasSugeridas: [
      { nome: "Aluguel", icone: "🏠", cor: "#5a4cfc", grupo: "Moradia", reservado: 0, status: "regular" },
      { nome: "Condomínio", icone: "🏢", cor: "#2d8cff", grupo: "Moradia", reservado: 0, status: "regular" },
      { nome: "Energia", icone: "⚡", cor: "#edbf00", grupo: "Moradia", reservado: 0, status: "regular" },
      { nome: "Mercado", icone: "🛒", cor: "#069713", grupo: "Alimentação", reservado: 0, status: "regular" },
      { nome: "Restaurantes", icone: "🍝", cor: "#ff5d04", grupo: "Alimentação", reservado: 0, status: "regular" },
      { nome: "Transporte", icone: "🚗", cor: "#6078a9", grupo: null, reservado: 0, status: "regular" },
      { nome: "Saúde", icone: "💊", cor: "#ff0f5f", grupo: null, reservado: 0, status: "regular" },
      { nome: "Lazer", icone: "🎬", cor: "#aa33ff", grupo: null, reservado: 0, status: "regular" },
      { nome: "Assinaturas", icone: "📺", cor: "#d81aff", grupo: null, reservado: 0, status: "regular" },
      { nome: "Educação", icone: "📚", cor: "#b27700", grupo: null, reservado: 0, status: "regular" },
      { nome: "Salário", icone: "💰", cor: "#069713", grupo: null, reservado: 0, status: "excluida" },
      { nome: "Transferências", icone: "🔁", cor: "#9aa5b5", grupo: null, reservado: 0, status: "excluida" },
    ],

    /** Paleta oferecida para cor de contas, categorias e perfis */
    paleta: [
      "#ff1a1a", "#ff5d04", "#f58000", "#bc6d09", "#b27700", "#edbf00", "#899201", "#069713",
      "#00b2b2", "#2d8cff", "#5a4cfc", "#aa33ff", "#d81aff", "#ff1ad9", "#ff0f5f", "#6078a9",
    ],
  };
})(window.ZoZo);
