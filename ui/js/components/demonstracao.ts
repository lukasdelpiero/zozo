/* =============================================================
   ZoZo — atalho da conta de demonstração (Alt + Shift + D)
   Só na conta demo: janela "Demonstração" para ligar e desligar os avisos de demonstração (faixa do menu lateral e
   notas das Configurações; só em produção, porque no modo teste a demo aparece como conta completa e não tem avisos)
   e, no modo teste (local e prévia), o botão do painel de testes. É só aparência para quem está olhando (gravar
   continua proibido no servidor); a escolha fica neste navegador.
   TypeScript: tipos em src/globais.d.ts (ZoZoDemonstracao).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const { h } = ZoZo.dom;
  const CHAVE_AVISOS = "zozo.demo.avisos", CHAVE_PAINEL = "zozo.demo.painel";

  const ler = (k: string) => { try { return localStorage.getItem(k) !== "0"; } catch { return true; } };
  const gravar = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch { /* sem armazenamento: vale só agora */ } };
  const demo = () => !!(ZoZo.recursos && ZoZo.recursos.demo());          // demo com avisos (produção)
  const contaDemo = () => demo() || (ZoZo.store.get().session.user || {}).contaDemo === true;   // inclusive no modo teste

  /** Os avisos de demonstração aparecem? (fora da demo, a pergunta não se aplica) */
  function avisos(): boolean { return !demo() || ZoZo.store.get().ui.avisosDemo !== false; }

  /** Botão do painel de testes: na demo segue a escolha; nas outras contas, sempre visível */
  function aplicarPainel() { if (ZoZo.teste) ZoZo.teste.mostrarBotao(!contaDemo() || ler(CHAVE_PAINEL)); }

  let aberta = false;
  function abrir() {
    if (aberta || !contaDemo()) return;
    aberta = true;
    const linhas: HTMLElement[] = [];
    if (demo()) linhas.push(ZoZo.modais.Interruptor("Avisos de demonstração", avisos(), (v) => { gravar(CHAVE_AVISOS, v); ZoZo.store.set({ ui: { avisosDemo: v } }); }));
    if (ZoZo.teste) linhas.push(ZoZo.modais.Interruptor("Painel de testes (botão Modo teste)", ler(CHAVE_PAINEL), (v) => { gravar(CHAVE_PAINEL, v); aplicarPainel(); }));
    ZoZo.feedback.modal({
      title: "Demonstração",
      body: h("div", { class: "tw:flex tw:flex-col tw:gap-3 tw:min-w-[280px]" },
        h("p", { class: "tw:m-0 tw:text-[13px] tw:text-zz-secondary" }, "Só nesta conta de demonstração e neste navegador. Atalho Alt + Shift + D."), ...linhas),
      onClose: () => { aberta = false; },
    });
  }

  document.addEventListener("keydown", (e) => {
    // e.code: com Alt + Shift, e.key muda conforme o teclado (ex.: "Î" no Mac)
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === "KeyD" && contaDemo()) { e.preventDefault(); abrir(); }
  });
  // ao entrar ou sair da demo: preferência dos avisos e o botão do painel
  let eraDemo: boolean | null = null;
  ZoZo.store.subscribe(() => {
    const agora = contaDemo();
    if (agora === eraDemo) return;
    eraDemo = agora;
    if (demo() && ZoZo.store.get().ui.avisosDemo === undefined) ZoZo.store.set({ ui: { avisosDemo: ler(CHAVE_AVISOS) } });
    aplicarPainel();
  });

  ZoZo.demonstracao = { avisos, abrir, aplicarPainel };
})(window.ZoZo);
