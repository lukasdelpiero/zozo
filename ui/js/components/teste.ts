/* =============================================================
   ZoZo — modo de teste (SÓ no endereço local e na prévia)
   ------------------------------------------------------------
   Botão "Modo teste" no canto e painel com comandos para testar telas, falhas e dados.
   Em produção o host não cria ZoZo.testeHost e nada daqui aparece.
   Os comandos só agem nesta aba: a conta simulada não tem servidor e a conta demo não grava;
   numa conta de verdade da prévia valem as mesmas regras de sempre (o servidor confere tudo).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const T = ZoZo.testeHost;
  if (!T) return;
  const { h, mount } = ZoZo.dom;
  const UI = ZoZo.ui;

  const C = {
    botao: "tw:fixed tw:right-4 tw:bottom-4 tw:z-80 tw:inline-flex tw:items-center tw:gap-1.5 tw:h-8 tw:px-3 tw:rounded-full "
      + "tw:border tw:border-[#e8c48a] tw:bg-zz-warning-soft tw:text-zz-warning-text tw:text-[13px] tw:font-[620] tw:cursor-pointer "
      + "tw:shadow-[0_2px_8px_rgba(15,39,66,0.12)] tw:hover:brightness-97 tw:focus-visible:outline-2 tw:focus-visible:outline-zz-primary tw:focus-visible:outline-offset-2",
    corpo: "tw:flex tw:flex-col tw:gap-4 tw:max-h-[min(70vh,620px)] tw:overflow-y-auto tw:pr-1",
    secao: "tw:m-0 tw:text-[12px] tw:font-[650] tw:uppercase tw:tracking-[0.04em] tw:text-zz-secondary",
    grupo: "tw:flex tw:flex-col tw:gap-2",
    botoes: "tw:flex tw:flex-wrap tw:gap-2",
    estado: "tw:m-0 tw:grid tw:grid-cols-[auto_1fr] tw:gap-x-3 tw:gap-y-1 tw:text-[13px]",
    rotulo: "tw:text-zz-secondary",
    valor: "tw:m-0 tw:text-zz-text tw:[overflow-wrap:anywhere]",
    nota: "tw:m-0 tw:text-[12.5px] tw:leading-[1.45] tw:text-zz-secondary",
  };

  /** Telas e ações que só o app sabe montar (app.ts) */
  type AcoesApp = {
    tela: (nome: string) => void;
    entradaMudou: () => void;
    sessaoExpirada: () => void;
  };

  function iniciar(ctx: ContextoApp, app: AcoesApp) {
    const botao = h("button", { type: "button", class: C.botao, "aria-haspopup": "dialog" }, "Modo teste") as HTMLButtonElement;
    botao.addEventListener("click", () => abrir(ctx, app));
    document.body.appendChild(botao);
  }

  function abrir(ctx: ContextoApp, app: AcoesApp) {
    const area = h("div", { class: C.corpo });
    const janela = ZoZo.feedback.modal({ title: "Painel de testes", body: area, class: "modal--testes" });
    const fechar = () => janela.fechar();
    const logado = () => !!ZoZo.store.get().session.authenticated;
    const botaoCmd = (rotulo: string, acao: () => void, perigo?: boolean) =>
      UI.Button(rotulo, { size: "sm", variant: perigo ? "danger-ghost" : undefined, onClick: acao });
    const secao = (titulo: string, ...filhos: Array<HTMLElement | null>) => h("section", { class: C.grupo }, h("h3", { class: C.secao }, titulo), ...filhos);

    function desenhar() {
      const e = T!.estado();
      const linhas: Array<[string, string]> = [["Endereço", e.endereco], ["Sessão", e.sessao], ["Versão", ZoZo.sobre.versao],
        ["Sem servidor", e.simulacao ? "ligado" : "desligado"], ["Falha simulada", e.falha || "nenhuma"]];
      const simular = ZoZo.modais.Interruptor("Simular cadastro e login sem servidor", e.simulacao, (v) => {
        T!.simular(v); app.entradaMudou(); desenhar();
      });
      mount(area,
        h("dl", { class: C.estado }, ...linhas.flatMap(([r, v]) => [h("dt", { class: C.rotulo }, r), h("dd", { class: C.valor }, v)])),
        secao("Conta sem servidor", simular,
          h("p", { class: C.nota }, "Ligado: o cadastro cria uma conta vazia e o login entra com dados de exemplo, tudo só nesta aba (nada vai ao servidor). "
            + "A conta demo e a simulada têm todos os recursos e as ações de conta (nome, senha, 2FA, apagar, excluir) são simuladas.")),
        secao("Dados",
          h("div", { class: C.botoes },
            botaoCmd("Carregar dados de exemplo", () => {
              if (!T!.carregarExemplo()) { ctx.toast("Só na conta simulada (a demo já gera dados de exemplo).", { tone: "aviso" }); return; }
              ZoZo.servico.reset(); ctx.recarregarTudo(); fechar();
            }),
            logado() ? botaoCmd("Recarregar dados", () => { ctx.recarregarTudo(); fechar(); }) : null,
            botaoCmd("Limpar armazenamento deste navegador", () => {
              try { Object.keys(localStorage).filter((k) => k.startsWith("zozo.")).forEach((k) => localStorage.removeItem(k)); } catch (er) { /* ok */ }
              try { Object.keys(sessionStorage).filter((k) => k.startsWith("zozo.")).forEach((k) => sessionStorage.removeItem(k)); } catch (er) { /* ok */ }
              location.reload();
            }, true))),
        secao("Falhas",
          h("div", { class: C.botoes },
            botaoCmd(e.falha === "STORAGE_UNAVAILABLE" ? "Servidor de volta" : "Servidor fora do ar", () => {
              T!.falhar(e.falha === "STORAGE_UNAVAILABLE" ? null : "STORAGE_UNAVAILABLE"); desenhar();
            }),
            botaoCmd("Conflito na próxima gravação", () => { T!.conflitoNaProxima(); ctx.toast("A próxima gravação vai falhar com conflito (DATA_CHANGED).", { tone: "aviso" }); }),
            logado() ? botaoCmd("Sessão expirada", () => { fechar(); app.sessaoExpirada(); }) : null)),
        secao("Avisos",
          h("div", { class: C.botoes },
            botaoCmd("Aviso", () => ctx.toast("Exemplo de aviso do modo teste.", { tone: "aviso" })),
            botaoCmd("Erro", () => ctx.toast("Exemplo de erro do modo teste.", { tone: "error" })),
            botaoCmd("Sucesso", () => ctx.toast("Exemplo de confirmação do modo teste.", { tone: "success", importante: true })))),
        secao("Telas de entrada",
          logado() ? h("p", { class: C.nota }, "Abrir uma tela de entrada encerra a sessão desta aba.") : null,
          h("div", { class: C.botoes },
            ...([["verificar", "Verifique seu e-mail"], ["verificarRecuperacao", "Verifique (recuperação)"], ["linkInvalido", "Link inválido"],
              ["redefinir", "Redefinir senha"], ["codigo", "Código do 2FA"], ["novaSenha", "Nova senha"], ["novaSenhaRecomecar", "Nova senha (recomeçar)"],
              ["carregando", "Carregando"]] as Array<[string, string]>).map(([nome, rotulo]) => botaoCmd(rotulo, () => { fechar(); app.tela(nome); })))));
    }
    desenhar();
  }

  ZoZo.teste = { iniciar };
})(window.ZoZo);
