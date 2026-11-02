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
      versao: "3.20.0", quando: "novembro de 2026",
      itens: [
        { icone: "🔑", tipo: "novo", titulo: "Códigos para entrar sem o celular",
          texto: "Ao ligar a verificação em duas etapas, você recebe dez códigos de reserva. Se perder o celular, cada um serve uma vez no lugar do código do aplicativo." },
        { icone: "👆", tipo: "novo", titulo: "Confirme com a digital ou o rosto",
          texto: "Cadastre a biometria do seu aparelho em Configurações › Conta e use para confirmar ações importantes, sem digitar nada." },
        { icone: "✨", tipo: "melhoria", titulo: "Zo de cara nova",
          texto: "A conversa com o Zo ganhou visual novo. Você pode aumentar a janela, pesquisar palavras na conversa, baixar a conversa e mandar emojis." },
        { icone: "🤖", tipo: "correcao", titulo: "Zo respondendo de verdade",
          texto: "O Zo mudou de serviço de inteligência artificial e agora consegue consultar, lançar e resumir sem parar no meio com o aviso de muitos pedidos." },
        { icone: "💬", tipo: "melhoria", titulo: "Zo mais cuidadoso",
          texto: "O Zo esconde dados como CPF e cartão antes de pensar na resposta, confirma com você antes de excluir algo e deixa desfazer o que ele fez na conversa." },
        { icone: "🧾", tipo: "novo", titulo: "Fatura do seu jeito",
          texto: "Escolha se a fatura mostra também o que ainda está em aberto, baixe a fatura como imagem e encontre os arquivos com nomes mais claros." },
        { icone: "🛠️", tipo: "correcao", titulo: "Empréstimos na fatura",
          texto: "As parcelas dos empréstimos agora entram na fatura gerada, junto com as compras do cartão." },
        { icone: "📈", tipo: "correcao", titulo: "Gráfico do gasto mensal",
          texto: "O gráfico do gasto no mês mostra o mês inteiro, do dia 1 ao último, e a linha do orçamento atravessa o mês todo. No começo do mês ele não fica mais espremido no canto." },
      ],
    },
    {
      versao: "3.19.0", quando: "outubro de 2026",
      itens: [
        { icone: "💬", tipo: "novo", titulo: "Conheça o Zo",
          texto: "Toque no Z no canto da tela e peça ao Zo para lançar uma compra, editar uma categoria ou resumir o seu mês." },
        { icone: "📥", tipo: "novo", titulo: "Importe o arquivo do seu banco",
          texto: "Mande o CSV ou o OFX da fatura ou do extrato pelo clipe do Zo, confira a lista e importe tudo de uma vez, sem repetir o que já existe." },
        { icone: "🏷️", tipo: "novo", titulo: "Categorias num toque",
          texto: "Peça ao Zo para categorizar as transações sem categoria. Ele usa o seu histórico e você confirma antes." },
        { icone: "🛠️", tipo: "correcao", titulo: "Pequenos ajustes",
          texto: "O pagamento de fatura lançado à mão no cartão não entra mais na cobrança dos perfis, e o menu lateral ficou mais limpo." },
      ],
    },
    {
      versao: "3.18.0", quando: "outubro de 2026",
      itens: [
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
