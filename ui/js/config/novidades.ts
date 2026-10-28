/* =============================================================
   ZoZo — Novidades de cada versão (a janela "O que há de novo no ZoZo")
   A cada versão publicada: suba ZoZo.sobre.versao (config/regras.ts) e acrescente a nova versão no INÍCIO
   desta lista, com o que a pessoa nota (não detalhes técnicos). A janela aparece uma vez por versão, depois
   de entrar, quando a versão do app tem notas aqui. tipo: "novo" | "melhoria" | "correcao".
   TypeScript: tipos em src/globais.d.ts (NotaVersao).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";

  const NOTAS: readonly NotaVersao[] = [
    {
      versao: "3.18.0", quando: "outubro de 2026",
      itens: [
        { icone: "💳", tipo: "melhoria", titulo: "Fatura do cartão no painel",
          texto: "O cartão mostra a fatura aberta: a fatura anterior, o pagamento dela e as compras do ciclo, com o total." },
        { icone: "🧾", tipo: "novo", titulo: "Pagamentos recebidos na fatura dos perfis",
          texto: "Registre o que cada perfil pagou: a fatura mostra \"Paga\" ou quanto falta, com Pix pelo restante." },
        { icone: "🔐", tipo: "melhoria", titulo: "Mais proteção para a sua conta",
          texto: "Com o 2FA ligado, trocar a senha, desligar a proteção avançada e excluir a conta pedem o código do aplicativo." },
        { icone: "⚡", tipo: "melhoria", titulo: "Transações mais rápidas",
          texto: "Abrir, marcar e pesquisar ficaram muito mais rápidos mesmo com milhares de transações." },
        { icone: "🛠️", tipo: "correcao", titulo: "Ajustes e correções",
          texto: "O mês atual aparece nos painéis e na pesquisa, e há avisos ao apagar os dados e trocar a senha." },
      ],
    },
  ];

  ZoZo.notasVersao = NOTAS;
})(window.ZoZo);
