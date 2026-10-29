/* =============================================================
   ZoZo — Novidades de cada versão (a janela "O que há de novo no ZoZo")
   A cada versão publicada: suba ZoZo.sobre.versao (config/regras.ts) e acrescente a nova versão no INÍCIO
   desta lista, com o que a pessoa nota (não detalhes técnicos). Tom de conversa, frases curtas, falando com
   "você"; sem travessões nem dois-pontos e sem jargão (2FA, ciclo, sincronizar). A janela aparece uma vez por versão, depois
   de entrar, quando a versão do app tem notas aqui. tipo: "novo" | "melhoria" | "correcao".
   TypeScript: tipos em src/globais.d.ts (NotaVersao).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";

  const NOTAS: readonly NotaVersao[] = [
    {
      versao: "3.18.0", quando: "outubro de 2026",
      itens: [
        { icone: "💬", tipo: "novo", titulo: "Conheça o Zo",
          texto: "Toque no Z no canto da tela e peça ao Zo para lançar uma compra, importar o arquivo do seu banco ou resumir o seu mês." },
        { icone: "💳", tipo: "melhoria", titulo: "Fatura do cartão mais clara",
          texto: "Agora você vê a fatura anterior, as compras do mês e a fatura atual, e o pagamento da fatura aparece como uma transação só." },
        { icone: "🗂️", tipo: "novo", titulo: "Fatura de todos os perfis",
          texto: "Na hora de gerar a fatura, escolha Todos para ver o gasto de todos os perfis, ou fique com um cartão só." },
        { icone: "🧾", tipo: "novo", titulo: "Quem já pagou a fatura",
          texto: "Anote quanto cada perfil já te pagou e veja na hora se a fatura está quitada ou quanto ainda falta." },
        { icone: "🔐", tipo: "melhoria", titulo: "Sua conta ainda mais protegida",
          texto: "Se você usa a verificação em duas etapas, vamos pedir o código antes de trocar a senha ou excluir a conta." },
        { icone: "⚡", tipo: "melhoria", titulo: "Transações mais rápidas",
          texto: "Mesmo com muitas transações, abrir, marcar e pesquisar ficou bem mais ágil." },
        { icone: "🛠️", tipo: "correcao", titulo: "Pequenos ajustes",
          texto: "A compra feita no dia do fechamento agora entra na fatura certa, e o mês atual voltou a aparecer nos painéis e na pesquisa." },
      ],
    },
  ];

  ZoZo.notasVersao = NOTAS;
})(window.ZoZo);
