/* =============================================================
   ZoZo — Janela "O que há de novo no ZoZo"
   Aparece uma vez por versão (neste navegador), logo depois de entrar, quando a versão do app tem notas em
   config/novidades.ts. Conta nova não vê (não há o que comparar). "Ver notas completas" mostra todas as versões;
   Configurações › Sobre reabre a janela. Visto = localStorage (só a versão; nenhum dado da conta).
   TypeScript: tipos em src/globais.d.ts (ZoZoNovidades).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const { h, mount } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const CHAVE = "zozo.novidadesVistas";

  const N = {
    // cabeçalho roxo (gradiente da marca) com o logo, o título, a versão e as pílulas decorativas
    hero: "tw:relative tw:overflow-hidden tw:flex-none tw:pt-6 tw:px-6 tw:pb-7 tw:bg-(image:--botao-roxo) tw:text-white",
    bolha: "tw:absolute tw:rounded-[50%] tw:bg-white/8 tw:pointer-events-none",
    fechar: "tw:absolute tw:top-4 tw:right-4 tw:z-2 tw:grid tw:place-items-center tw:size-9 tw:rounded-[50%] tw:[border:0] tw:bg-white/18 "
      + "tw:text-white tw:hover:bg-white/28 tw:focus-visible:outline-white",
    pilulas: "tw:absolute tw:top-14 tw:right-6 tw:flex tw:flex-col tw:items-end tw:gap-2.5 tw:celular:hidden",
    pilula: "tw:inline-flex tw:items-center tw:gap-1.5 tw:h-8 tw:px-3.5 tw:rounded-(--radius-pill) tw:bg-white tw:text-zz-text "
      + "tw:text-[13px] tw:font-[620] tw:[box-shadow:0_6px_16px_rgba(22,33,58,0.18)]",
    logo: "tw:relative tw:block tw:size-11 tw:rounded-xl tw:[box-shadow:0_2px_8px_rgba(22,33,58,0.2)]",
    titulo: "tw:relative tw:mt-5 tw:text-[24px] tw:leading-tight tw:font-[650] tw:celular:text-[21px]",
    sub: "tw:relative tw:mt-1.5 tw:text-[14px] tw:font-[550] tw:text-white",          // branco cheio: ≥ 4,5:1 sobre o gradiente
    // lista das novidades
    lista: "tw:flex tw:flex-col",
    item: "tw:flex tw:gap-4 tw:py-4 tw:[&+&]:border-t tw:[&+&]:border-zz-border",
    icone: "tw:grid tw:place-items-center tw:flex-none tw:size-11 tw:rounded-xl tw:text-[22px]",
    iconeTipo: { novo: "tw:bg-zz-primary-softer", melhoria: "tw:bg-(--color-positive-soft)", correcao: "tw:bg-(--color-neutral-soft)" },
    itemTopo: "tw:flex tw:flex-wrap tw:items-center tw:gap-x-2 tw:gap-y-1",
    itemTitulo: "tw:text-[15px] tw:font-[620] tw:text-zz-text",
    selo: "tw:inline-flex tw:items-center tw:h-5.5 tw:px-2 tw:rounded-(--radius-pill) tw:text-[12px] tw:font-[620]",
    seloTipo: {
      novo: "tw:bg-zz-primary-soft tw:text-zz-primary",
      melhoria: "tw:bg-(--color-positive-soft) tw:text-(--color-positive)",
      correcao: "tw:bg-(--color-neutral-soft) tw:text-(--color-neutral)",
    },
    itemTexto: "tw:mt-1 tw:text-[14px] tw:leading-normal tw:text-zz-secondary tw:font-[450]",
    versao: "tw:pt-4 tw:text-[13px] tw:font-[620] tw:text-zz-secondary tw:uppercase tw:tracking-[0.04em] tw:[&:not(:first-child)]:mt-2",
    link: "tw:[border:0] tw:bg-transparent tw:p-0 tw:text-zz-primary tw:text-[15px] tw:font-[620] tw:hover:underline tw:underline-offset-2",
  };
  const ROTULO: Record<TipoNovidade, string> = { novo: "Novo", melhoria: "Melhoria", correcao: "Correção" };

  const ler = (): string | null => { try { return localStorage.getItem(CHAVE); } catch (e) { return null; } };
  const gravar = (v: string) => { try { localStorage.setItem(CHAVE, v); } catch (e) { /* sem armazenamento: aparece de novo na próxima vez */ } };
  const curta = (v: string) => v.split(".").slice(0, 2).join(".");                 // 3.18.0 → 3.18
  const notaAtual = () => ZoZo.notasVersao.find((n) => n.versao === ZoZo.sobre.versao) || null;

  function lista(itens: readonly ItemNovidade[]): HTMLElement {
    return h("ul", { class: N.lista }, itens.map((it) => h("li", { class: N.item },
      h("span", { class: [N.icone, N.iconeTipo[it.tipo]], "aria-hidden": "true" }, ZoZo.dom.emoji(it.icone)),
      h("div", { class: "tw:min-w-0" },
        h("p", { class: N.itemTopo }, h("strong", { class: N.itemTitulo }, it.titulo), h("span", { class: [N.selo, N.seloTipo[it.tipo]] }, ROTULO[it.tipo])),
        h("p", { class: N.itemTexto }, it.texto)))));
  }

  /** Abre a janela (a da versão atual; sem notas para ela, a mais recente) */
  function abrir(): void {
    const notas = ZoZo.notasVersao;
    const nota = notaAtual() || notas[0];
    if (!nota) return;
    let completas = false;
    const corpo = h("div");
    const alternar = h("button", { type: "button", class: N.link }) as HTMLButtonElement;
    const desenhar = () => {
      mount(corpo, completas
        ? notas.map((n) => [h("h3", { class: N.versao }, "Versão " + curta(n.versao) + " · " + n.quando), lista(n.itens)])
        : lista(nota.itens));
      alternar.textContent = completas ? "Ver só as desta versão" : "Ver notas completas";
    };
    alternar.addEventListener("click", () => { completas = !completas; desenhar(); });
    desenhar();
    ZoZo.feedback.modal({
      title: "O que há de novo no ZoZo",
      class: "modal--novidades",
      cabecalho: (tituloId, fechar) => h("div", { class: N.hero },
        h("span", { class: [N.bolha, "tw:size-64 tw:-top-24 tw:-right-16"], "aria-hidden": "true" }),
        h("span", { class: [N.bolha, "tw:size-40 tw:-bottom-24 tw:right-24"], "aria-hidden": "true" }),
        h("button", { type: "button", class: N.fechar, "aria-label": "Fechar", onClick: () => fechar(false) }, icon("fechar", { size: 16 })),
        h("div", { class: N.pilulas, "aria-hidden": "true" },
          h("span", { class: [N.pilula, "tw:-rotate-3"] }, ZoZo.dom.emoji("✨"), "Novidades"),
          h("span", { class: [N.pilula, "tw:rotate-2 tw:mr-6"] }, ZoZo.dom.emoji("🚀"), "Melhorias"),
          h("span", { class: [N.pilula, "tw:-rotate-2"] }, ZoZo.dom.emoji("🛠️"), "Correções")),
        h("img", { class: N.logo, src: "assets/img/zozo-logo.svg", alt: "", width: "44", height: "44", decoding: "async" }),
        h("h2", { class: N.titulo, id: tituloId }, "O que há de novo no ZoZo"),
        h("p", { class: N.sub }, "Versão " + curta(nota.versao) + " · " + nota.quando)),
      body: corpo,
      actions: (fechar) => {
        const entendi = ZoZo.ui.Button("Entendi", { variant: "primary", onClick: () => fechar(true) });
        entendi.dataset.autofocus = "";                  // o foco começa no "Entendi" (Enter fecha)
        return [alternar, entendi];
      },
      onClose: () => gravar(nota.versao),
    });
  }

  /**
   * Depois de entrar: abre se esta versão tem notas e ainda não foi vista neste navegador. Conta nova (sem nenhuma
   * transação e sem registro de versão vista) não vê a janela: só passa a contar a partir da próxima versão.
   */
  function conferir(ctx: ContextoApp): void {
    const nota = notaAtual();
    const vista = ler();
    if (!nota || vista === nota.versao) return;
    ctx.loadData("lancamentos", ZoZo.messages.ACTIONS.getLancamentos).then((d) => {
      if (!ZoZo.store.get().session.authenticated) return;
      if (vista === null && !(d.lancamentos || []).length) { gravar(nota.versao); return; }
      abrir();
    }).catch(() => null);
  }

  const api: ZoZoNovidades = { abrir, conferir };
  ZoZo.novidades = api;
})(window.ZoZo);
