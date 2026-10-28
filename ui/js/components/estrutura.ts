/* =============================================================
   ZoZo — Estrutura em Tailwind CSS
   Classes do menu lateral, da barra superior, da área principal e
   do painel de informações (usadas por app.ts, sidebar.ts, list.ts,
   topbar.ts, detail-panel.ts e pages/comum.ts).
   Estados (no #shell de index.html, que é o group/shell):
     data-menu="recolhido"  menu lateral escondido (computador)
     data-gaveta="aberta"   menu aberto como gaveta (celular)
   No .workspace (group/ws): data-conteudo="sim" = painel com conteúdo
   (em telas ≤ 1180 px o painel vira gaveta sobreposta e só aparece assim).
   Larguras: painel-gaveta ≤ 1180 · estreito ≤ 900 (menu só com ícones)
   · gaveta ≤ 600 (celular) · ate520 · computador ≥ 601 · largo ≥ 901.
   Classes sem tw: que sobraram são ganchos para o JS ou para peças
   ainda no CSS antigo (main, detail, detail__body, side-group__header).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";

  // Botões de ícone (componente antigo .icon-btn) dentro do cabeçalho do painel: cinza, fundo claro ao passar
  const ICONES_CABECALHO = "tw:[&_.icon-btn]:text-zz-secondary tw:[&_.icon-btn:hover:not(:disabled)]:bg-zz-surface-hover "
    + "tw:[&_.icon-btn:hover:not(:disabled)]:text-zz-text";

  // Item de menu: base e realce (passar o mouse, foco pelo teclado, submenu aberto)
  const ITEM_BASE = "tw:flex tw:items-center tw:gap-2.5 tw:w-full tw:min-h-[34px] tw:px-2.5 tw:py-0 tw:[border:0] tw:rounded-lg tw:bg-transparent tw:text-left "
    + "tw:text-[15px] tw:font-[450]";
  const ITEM = ITEM_BASE + " tw:text-inherit";
  const ITEM_REALCE = "tw:hover:bg-zz-surface-hover tw:focus-visible:bg-zz-surface-hover tw:focus-visible:outline-none tw:[&.is-open]:bg-zz-surface-hover";

  // Janelas modais: caixa (larguras por tipo vêm junto) e rodapé no celular (botões centralizados e da mesma largura)
  const CAIXA = "modal tw:bg-zz-surface tw:rounded-2xl tw:[box-shadow:var(--shadow-modal)] tw:[transform:translateY(8px)_scale(0.98)] "
    + "tw:[transition:transform_var(--duration-medium)_var(--easing)] tw:in-[.is-visible]:[transform:none] tw:gaveta:max-w-full "
    // peças dentro das janelas: rótulos, dicas e botões maiores; "Excluir" vermelho vivo (texto branco ≥ 4,5:1)
    + "tw:[&_.field-label]:text-[15px] tw:[&_.field-label]:font-[620] tw:[&_.field-hint]:text-[13px] tw:[&_.field-hint]:font-[620] "
    + "tw:[&_.input::placeholder]:text-[15px] tw:[&_.input::placeholder]:font-[450] tw:[&_.btn]:text-[15px] tw:[&_.btn]:font-[620] tw:[&_.btn--danger]:bg-(--color-danger) tw:[&_.btn--danger]:border-(--color-danger) "
    + "tw:[&_.btn--danger]:text-white tw:[&_.btn--danger:hover:not(:disabled)]:bg-(--color-danger-hover) tw:[&_.btn--danger:hover:not(:disabled)]:border-(--color-danger-hover)";
  const RODAPE_CELULAR = "tw:gaveta:justify-center tw:gaveta:flex-wrap tw:gaveta:[&>.btn]:flex-[1_1_0] tw:gaveta:[&>.btn]:min-w-0 tw:gaveta:[&>.btn]:max-w-[220px]";
  const LANC = "tw:grid tw:gap-3 tw:items-center tw:min-h-9 tw:[border:0] tw:rounded-none tw:bg-transparent tw:text-left "
    + "tw:hover:bg-zz-surface-hover tw:focus-visible:bg-zz-surface-hover";

  const E = {
    /* ---------- Menu lateral (roxo) ---------- */
    menuLateral: "tw:flex tw:flex-col tw:min-h-0 tw:overflow-hidden tw:bg-(--sidebar-bg) tw:text-(--sidebar-fg) "
      + "tw:[scrollbar-color:rgba(255,255,255,0.45)_var(--sidebar-bg)] tw:**:[scrollbar-color:rgba(255,255,255,0.45)_var(--sidebar-bg)] "
      + "tw:**:focus-visible:outline-[color:#fff] tw:group-data-[menu=recolhido]/shell:invisible "
      // computador: o menu desliza junto com a coluna ao recolher/mostrar
      + "tw:computador:w-(--sidebar-width) tw:computador:[transition:transform_var(--duration-medium)_var(--easing),visibility_0s_linear_0s] "
      + "tw:computador:group-data-[menu=recolhido]/shell:[transform:translateX(-100%)] "
      + "tw:computador:group-data-[menu=recolhido]/shell:[transition:transform_var(--duration-medium)_var(--easing),visibility_0s_linear_var(--duration-medium)] "
      + "tw:estreito:justify-start "
      // celular: gaveta fixa que entra da esquerda
      // fechada, fica invisível (fora do Tab e do leitor de tela) só depois de terminar de sair; aberta, aparece na hora
      + "tw:gaveta:fixed tw:gaveta:top-0 tw:gaveta:bottom-0 tw:gaveta:left-0 tw:gaveta:z-60 tw:gaveta:w-[min(280px,84vw)] tw:gaveta:invisible "
      + "tw:gaveta:group-data-[gaveta=aberta]/shell:visible tw:gaveta:[transform:translateX(-100%)] "
      + "tw:gaveta:[transition:transform_280ms_var(--easing,ease),box-shadow_280ms,visibility_0s_linear_280ms] "
      + "tw:gaveta:group-data-[gaveta=aberta]/shell:[transition:transform_280ms_var(--easing,ease),box-shadow_280ms,visibility_0s_linear_0s] "
      + "tw:gaveta:group-data-[gaveta=aberta]/shell:[transform:none] "
      + "tw:gaveta:group-data-[gaveta=aberta]/shell:[box-shadow:8px_0_32px_rgba(15,39,66,0.28)] tw:motion-reduce:transition-none!",
    menuTopo: "tw:h-(--topbar-height) tw:flex-none tw:flex tw:items-center tw:justify-start tw:pt-0 tw:pr-3 tw:pb-0 tw:pl-[14px]",
    logo: "tw:size-7 tw:rounded-[5px] tw:flex-none tw:[box-shadow:0_1px_3px_rgba(15,39,66,0.25)] tw:estreito:hidden tw:gaveta:block",
    nav: "tw:flex-none tw:flex tw:flex-col tw:gap-0.5 tw:p-3 tw:border-b tw:border-b-(--sidebar-divider) tw:estreito:p-2 tw:estreito:flex-1 "
      + "tw:gaveta:flex-none tw:gaveta:p-3",
    navItem: "tw:group/nav tw:relative tw:flex tw:items-center tw:gap-2.5 tw:h-[34px] tw:px-2.5 tw:py-0 tw:[border:0] tw:rounded-lg tw:text-[15px] tw:font-[550] "
      + "tw:text-left tw:[transition:background_var(--duration-fast)_var(--easing),color_var(--duration-fast)_var(--easing)] "
      + "tw:estreito:justify-center tw:estreito:p-0 tw:gaveta:justify-start tw:gaveta:px-2.5 tw:gaveta:py-0",
    navItemNormal: "tw:bg-transparent tw:text-(--sidebar-fg) tw:hover:bg-(--sidebar-hover) tw:hover:text-white",
    navItemAtivo: "tw:bg-(--sidebar-active) tw:text-white",
    navIcone: "tw:size-[18px] tw:[shape-rendering:geometricPrecision] tw:text-(--sidebar-fg-muted) tw:group-hover/nav:text-white",
    navIconeAtivo: "tw:size-[18px] tw:[shape-rendering:geometricPrecision] tw:text-white",
    // menu só com ícones (≤ 900 px): o nome some da tela mas continua para leitores de tela
    navRotulo: "tw:estreito:absolute tw:estreito:w-px tw:estreito:h-px tw:estreito:overflow-hidden tw:estreito:[clip:rect(0_0_0_0)] "
      + "tw:gaveta:static tw:gaveta:w-auto tw:gaveta:h-auto tw:gaveta:overflow-visible tw:gaveta:[clip:auto]",
    contas: "tw:flex-auto tw:min-h-0 tw:overflow-y-auto tw:pt-3 tw:px-3 tw:pb-4 tw:estreito:hidden tw:gaveta:block",
    nota: "tw:text-(--sidebar-fg-muted) tw:text-[13px] tw:py-2 tw:px-2.5",
    // texto do aviso com o token de texto de aviso (o laranja #e8730c dava 2,7:1); o ícone continua laranja
    demo: "tw:flex tw:gap-1.5 tw:items-start tw:mt-0 tw:mx-3 tw:mb-3 tw:py-2 tw:px-3 tw:rounded-lg tw:bg-(--color-alerta-soft) tw:text-(--color-warning-text) "
      + "tw:text-[11.5px] tw:font-[550] tw:leading-[1.4] tw:estreito:hidden tw:gaveta:flex",
    demoIcone: "tw:mt-px tw:text-(--color-alerta)",
    cambio: "tw:empty:hidden tw:py-2 tw:px-3 tw:border-t tw:border-t-(--sidebar-divider) tw:estreito:p-2",
    rodape: "tw:flex-none tw:flex tw:items-center tw:justify-between tw:gap-1.5 tw:p-3 tw:border-t tw:border-t-(--sidebar-divider) "
      + "tw:estreito:p-2 tw:estreito:flex-col tw:estreito:gap-1 tw:gaveta:flex-row tw:gaveta:p-3",
    usuario: "tw:flex tw:items-center tw:gap-2.5 tw:min-w-0 tw:flex-auto tw:h-10 tw:px-2 tw:py-0 tw:[border:0] tw:rounded-lg tw:bg-transparent "
      + "tw:cursor-pointer tw:text-(--sidebar-fg) tw:text-[15px] tw:font-[550] tw:text-left tw:hover:bg-(--sidebar-hover) tw:hover:text-white "
      + "tw:focus-visible:outline-2 tw:focus-visible:outline-[color:#fff] tw:focus-visible:-outline-offset-2 "
      + "tw:estreito:justify-center tw:estreito:p-0 tw:estreito:flex-none tw:estreito:w-10 "
      + "tw:gaveta:justify-start tw:gaveta:w-auto tw:gaveta:flex-auto tw:gaveta:px-2 tw:gaveta:py-0",
    usuarioNome: "tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:estreito:hidden tw:gaveta:block",
    config: "tw:flex-none tw:size-9 tw:grid tw:place-items-center tw:[border:0] tw:rounded-lg tw:bg-transparent tw:text-(--sidebar-fg) tw:cursor-pointer "
      + "tw:hover:bg-(--sidebar-hover) tw:hover:text-white tw:focus-visible:outline-2 tw:focus-visible:outline-[color:#fff] tw:focus-visible:-outline-offset-2",
    // grupos de contas (components/list.ts: SidebarAccountGroup)
    grupo: "tw:not-first:mt-3",
    grupoTopo: "side-group__header tw:flex tw:items-center tw:gap-1.5 tw:w-full tw:h-7 tw:px-1.5 tw:py-0 tw:[border:0] tw:bg-transparent "
      + "tw:text-(--sidebar-fg-muted) tw:text-[15px] tw:font-[620] tw:rounded-[6px] tw:hover:text-white",
    grupoSeta: "tw:[transition:transform_var(--duration-fast)_var(--easing)]",
    grupoSetaFechado: "tw:[transition:transform_var(--duration-fast)_var(--easing)] tw:[transform:rotate(-90deg)]",
    conta: "tw:grid tw:grid-cols-[8px_minmax(0,1fr)_auto] tw:items-center tw:gap-2.5 tw:w-full tw:h-[30px] tw:pr-2 tw:pl-3 tw:py-0 tw:[border:0] "
      + "tw:rounded-[6px] tw:bg-transparent tw:text-left tw:text-[15px] tw:text-(--sidebar-fg) tw:hover:bg-(--sidebar-hover) tw:hover:text-white",
    contaPonto: "tw:size-2 tw:rounded-[50%] tw:[box-shadow:0_0_0_2px_rgba(255,255,255,0.25)]",
    contaNome: "tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:font-[450]",
    contaValor: "tw:text-(--sidebar-fg-muted) tw:text-[15px] tw:font-[450] tw:[font-variant-numeric:lining-nums_proportional-nums]",

    /* ---------- Botão de recolher/mostrar o menu e fundo da gaveta (celular) ---------- */
    alternar: "tw:absolute tw:top-3 tw:left-[calc(var(--sidebar-width)-44px)] tw:z-40 tw:size-8 tw:grid tw:place-items-center tw:[border:0] tw:rounded-lg "
      + "tw:bg-(--sidebar-hover) tw:text-white tw:[box-shadow:none] tw:hover:bg-(--sidebar-active) tw:hover:text-white "
      + "tw:[transition:left_var(--duration-medium)_var(--easing),background_var(--duration-fast),color_var(--duration-fast)] "
      + "tw:group-data-[menu=recolhido]/shell:left-3 tw:group-data-[menu=recolhido]/shell:bg-zz-surface tw:group-data-[menu=recolhido]/shell:text-zz-secondary "
      + "tw:group-data-[menu=recolhido]/shell:[box-shadow:inset_0_0_0_1px_var(--color-border)] tw:group-data-[menu=recolhido]/shell:hover:bg-zz-surface-hover "
      + "tw:group-data-[menu=recolhido]/shell:hover:text-zz-text tw:estreito:left-4 "
      + "tw:gaveta:fixed tw:gaveta:top-3 tw:gaveta:left-3 tw:gaveta:z-65 tw:gaveta:bg-zz-surface tw:gaveta:text-zz-secondary "
      + "tw:gaveta:[box-shadow:inset_0_0_0_1px_var(--color-border)] tw:gaveta:hover:bg-zz-surface tw:gaveta:hover:text-zz-secondary "
      + "tw:gaveta:group-data-[gaveta=aberta]/shell:left-[calc(min(280px,84vw)-44px)] tw:gaveta:group-data-[gaveta=aberta]/shell:bg-(--sidebar-hover) "
      + "tw:gaveta:group-data-[gaveta=aberta]/shell:text-white tw:gaveta:group-data-[gaveta=aberta]/shell:[box-shadow:none] "
      + "tw:gaveta:in-[.has-boleto]:hidden tw:motion-reduce:transition-none!",
    fundoGaveta: "tw:hidden tw:gaveta:block tw:gaveta:fixed tw:gaveta:inset-0 tw:gaveta:z-55 tw:gaveta:bg-(--color-overlay) tw:gaveta:opacity-0 "
      + "tw:gaveta:pointer-events-none tw:gaveta:[transition:opacity_280ms] tw:gaveta:group-data-[gaveta=aberta]/shell:opacity-100 "
      + "tw:gaveta:group-data-[gaveta=aberta]/shell:pointer-events-auto tw:motion-reduce:transition-none!",

    /* ---------- Área de trabalho: [barra superior + principal] | painel ---------- */
    trabalho: "tw:group/ws tw:relative tw:grid tw:grid-cols-[minmax(0,1fr)_var(--detail-width)] tw:min-w-0 tw:min-h-0 tw:overflow-x-clip "
      + "tw:in-data-[pagina=dashboard]:grid-cols-[minmax(0,1fr)] tw:painel-gaveta:grid-cols-[minmax(0,1fr)]",
    trabalhoPrincipal: "tw:grid tw:grid-rows-[var(--topbar-height)_minmax(0,1fr)] tw:min-w-0 tw:min-h-0",
    barra: "tw:flex tw:items-center tw:justify-between tw:gap-4 tw:min-w-0 tw:pt-0 tw:pr-4 tw:pb-0 tw:pl-(--page-gutter) tw:bg-zz-surface tw:text-zz-text "
      + "tw:border-b tw:border-b-zz-border tw:[transition:padding_var(--duration-medium)_var(--easing)] tw:group-data-[menu=recolhido]/shell:pl-[60px] "
      + "tw:gaveta:pl-14 tw:gaveta:group-data-[menu=recolhido]/shell:pl-14 tw:motion-reduce:transition-none! "
      + "tw:**:focus-visible:outline-[color:var(--color-focus)] "
      // botões de ícone das páginas (UI.IconButton com onPrimary): cinza sobre a barra branca
      + "tw:[&_.icon-btn--on-primary]:text-zz-secondary tw:[&_.icon-btn--on-primary:hover:not(:disabled)]:bg-zz-surface-hover "
      + "tw:[&_.icon-btn--on-primary:hover:not(:disabled)]:text-zz-text",
    barraInicio: "tw:flex tw:items-center tw:gap-3 tw:min-w-0",
    barraPrefixo: "tw:empty:hidden",
    barraTitulo: "tw:text-[15px] tw:font-[620] tw:tracking-[-0.01em] tw:whitespace-nowrap tw:overflow-hidden tw:text-ellipsis",
    barraAcoes: "tw:flex tw:items-center tw:gap-2 tw:flex-[0_1_auto] tw:min-w-0 tw:ate520:flex-auto",
    principal: "main tw:min-w-0 tw:min-h-0 tw:overflow-y-auto tw:overflow-x-hidden tw:@container tw:focus:outline-none tw:focus-visible:outline-none "
      + "tw:has-[>.dash--na-tela]:overflow-y-hidden",
    // página: respiro do menu e do painel (base: a classe de cada página vence); com o menu recolhido,
    // o conteúdo recua junto com o título da barra (mesma curva: nada desalinha durante a animação)
    pagina: "tw:base:max-w-(--content-max) tw:base:m-0 tw:base:pt-5 tw:base:px-(--page-gutter) tw:base:pb-12 "
      + "tw:largo:[transition:padding-left_var(--duration-medium)_var(--easing)] tw:largo:group-data-[menu=recolhido]/shell:pl-[60px] "
      + "tw:motion-reduce:transition-none!",

    /* ---------- Painel de informações ---------- */
    painel: "detail tw:grid tw:grid-rows-[var(--topbar-height)_minmax(0,1fr)] tw:min-w-0 tw:min-h-0 tw:bg-zz-surface tw:border-l tw:border-l-zz-border "
      + "tw:in-data-[pagina=dashboard]:hidden "
      // ≤ 1180 px: gaveta sobreposta à direita, visível só com conteúdo
      + "tw:painel-gaveta:absolute tw:painel-gaveta:top-0 tw:painel-gaveta:right-0 tw:painel-gaveta:bottom-0 tw:painel-gaveta:w-[min(var(--detail-width),100%)] "
      + "tw:painel-gaveta:z-30 tw:painel-gaveta:[box-shadow:var(--shadow-modal)] tw:painel-gaveta:[transform:translateX(100%)] tw:painel-gaveta:invisible "
      + "tw:painel-gaveta:[transition:transform_var(--duration-medium)_var(--easing),visibility_0s_linear_var(--duration-medium)] "
      + "tw:painel-gaveta:group-data-[conteudo=sim]/ws:[transform:none] tw:painel-gaveta:group-data-[conteudo=sim]/ws:visible "
      + "tw:painel-gaveta:group-data-[conteudo=sim]/ws:[transition:transform_var(--duration-medium)_var(--easing),visibility_0s] "
      // celular: tela cheia
      + "tw:gaveta:fixed tw:gaveta:inset-0 tw:gaveta:w-full tw:gaveta:z-45 tw:gaveta:border-l-0",
    painelTopo: "tw:flex tw:items-center tw:justify-between tw:gap-2 tw:min-w-0 tw:pt-0 tw:pr-3 tw:pb-0 tw:pl-(--page-gutter) tw:bg-zz-surface tw:text-zz-text "
      + "tw:border-b tw:border-b-zz-border tw:**:focus-visible:outline-[color:var(--color-focus)] tw:gaveta:pl-14",
    painelInicio: "tw:flex tw:items-center tw:gap-1 tw:min-w-0 tw:overflow-visible",
    painelVoltar: "tw:flex tw:items-center tw:empty:hidden tw:[&_.icon-btn]:-ml-2 " + ICONES_CABECALHO,
    painelTitulo: "tw:text-[15px] tw:font-[620] tw:whitespace-nowrap tw:overflow-hidden tw:text-ellipsis tw:has-[.tipo-select]:overflow-visible",
    painelAcoes: "tw:flex tw:items-center tw:gap-0.5 tw:flex-none " + ICONES_CABECALHO + " "
      + "tw:[&_.icon-btn.is-open]:bg-zz-surface-hover tw:[&_.icon-btn.is-open]:text-zz-text "
      + "tw:[&_.icon-btn.icon-btn--danger:hover:not(:disabled)]:bg-(--color-danger-soft) tw:[&_.icon-btn.icon-btn--danger:hover:not(:disabled)]:text-(--color-danger)",
    divisor: "tw:w-px tw:h-5 tw:my-0 tw:mx-1.5 tw:bg-zz-border",
    divisorVoltar: "tw:w-px tw:h-5 tw:my-0 tw:mr-2 tw:ml-1 tw:bg-zz-border",
    botaoTexto: "tw:inline-flex tw:items-center tw:gap-1.5 tw:h-[30px] tw:px-3 tw:py-0 tw:mr-1 tw:border tw:rounded-lg tw:text-[13px] tw:whitespace-nowrap "
      + "tw:disabled:opacity-50 tw:disabled:cursor-not-allowed tw:border-zz-border-strong tw:bg-transparent tw:text-zz-text tw:font-medium "
      + "tw:hover:bg-zz-surface-hover",
    botaoTextoPrimario: "tw:inline-flex tw:items-center tw:gap-1.5 tw:h-[30px] tw:px-3 tw:py-0 tw:mr-1 tw:border tw:rounded-lg tw:text-[13px] tw:whitespace-nowrap "
      + "tw:disabled:opacity-50 tw:disabled:cursor-not-allowed tw:border-transparent tw:[background:var(--botao-roxo)_#6948D8] tw:text-white tw:font-semibold "
      + "tw:hover:[background:var(--botao-roxo-hover)] tw:hover:[filter:none]",
    painelConteudo: "tw:min-h-0 tw:overflow-hidden",
    painelCorpo: "detail__body tw:h-full tw:overflow-y-auto tw:pt-5 tw:px-(--page-gutter) tw:pb-0 tw:@container tw:animate-zz-painel",
    painelCorpoEstatico: "detail__body tw:h-full tw:overflow-y-auto tw:pt-5 tw:px-(--page-gutter) tw:pb-0 tw:@container",
    painelVazio: "tw:h-full tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-3 tw:text-zz-muted tw:text-[15px] tw:animate-zz-surge",
    painelVazioIcone: "tw:text-zz-border-strong",

    /* ---------- Menus flutuantes (components/menu.ts e o conteúdo montado pelas páginas) ----------
       "menu" é gancho: menu.ts posiciona submenus com closest(".menu") e a impressão esconde os menus.
       Variações que mudam medidas do menu usam "!" (vencem as classes base, que também são Tailwind). */
    menuFlutuante: "menu tw:fixed tw:z-97 tw:min-w-[200px] tw:max-w-[320px] tw:max-h-[min(460px,calc(100vh_-_24px))] tw:overflow-y-auto tw:p-1.5 "
      + "tw:bg-zz-surface tw:border tw:border-zz-border tw:rounded-xl tw:[box-shadow:var(--shadow-popover)] tw:text-zz-text tw:animate-zz-menu",
    menuCompacto: "tw:min-w-[168px]!",
    menuCalendario: "tw:p-2.5!",
    menuItem: ITEM + " " + ITEM_REALCE,
    menuItemPerigo: ITEM_BASE + " tw:text-(--color-menu-perigo) tw:hover:bg-(--color-menu-perigo-fundo) tw:focus-visible:bg-(--color-menu-perigo-fundo) tw:focus-visible:outline-none",
    menuItemEstatico: ITEM + " tw:cursor-default",
    // linha com o botão principal e uma seta à direita (categoria/recorrência no painel da transação)
    menuItemDividido: "tw:flex tw:items-center tw:gap-0.5 tw:w-full tw:min-h-[34px] tw:pr-1 tw:pl-0 tw:py-0 tw:[border:0] tw:rounded-lg tw:bg-transparent "
      + "tw:text-left tw:text-[15px] tw:font-[450] tw:text-inherit " + ITEM_REALCE,
    menuDivididoPrincipal: "tw:flex-1 tw:min-w-0 tw:flex tw:items-center tw:gap-2 tw:h-[34px] tw:px-2.5 tw:py-0 tw:[border:0] tw:bg-transparent tw:rounded-lg "
      + "tw:text-left tw:text-[15px] tw:font-[450]",
    menuIcone: "tw:text-zz-secondary",
    menuRotulo: "tw:flex-1 tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap",
    menuRotuloDuplo: "tw:flex-1 tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:flex tw:flex-col tw:gap-px tw:py-1.5 tw:px-0 tw:whitespace-normal",
    menuRotuloDetalhe: "tw:text-zz-secondary tw:text-[13px]",
    menuDica: "tw:text-zz-muted tw:text-[13px] tw:ml-auto tw:whitespace-nowrap",
    menuSeta: "tw:text-zz-muted",
    menuMarca: "tw:text-zz-primary",
    menuMarcaEsquerda: "tw:w-3.5 tw:grid tw:place-items-center tw:text-zz-text tw:flex-none",
    menuContador: "tw:min-w-[18px] tw:h-[18px] tw:px-[5px] tw:py-0 tw:inline-grid tw:place-items-center tw:rounded-(--radius-pill) tw:bg-zz-primary tw:text-white "
      + "tw:text-[10.5px] tw:font-semibold",
    menuSeparador: "tw:h-px tw:my-1.5 tw:-mx-1.5 tw:bg-zz-border",
    menuSecao: "tw:pt-2 tw:px-2.5 tw:pb-1 tw:text-[13px] tw:font-semibold tw:text-zz-muted",
    menuPesquisa: "tw:flex tw:items-center tw:gap-1.5 tw:pt-1 tw:px-4 tw:pb-2 tw:mt-0 tw:-mx-1.5 tw:mb-1 tw:border-b tw:border-b-zz-border tw:text-zz-muted",
    menuPesquisaCampo: "tw:flex-1 tw:min-w-0 tw:h-[30px] tw:[border:0] tw:outline-none tw:bg-transparent tw:text-[15px] tw:text-zz-text",
    menuLista: "tw:flex tw:flex-col",
    menuListaRolagem: "tw:flex tw:flex-col tw:max-h-[290px] tw:overflow-y-auto",
    menuVazio: "tw:p-2.5 tw:text-zz-muted tw:text-[13px]",
    menuCaixa: "tw:size-4 tw:flex-none tw:grid tw:place-items-center tw:border-[1.5px] tw:border-zz-border-strong tw:rounded tw:text-white",
    menuCaixaMarcada: "tw:size-4 tw:flex-none tw:grid tw:place-items-center tw:border-[1.5px] tw:border-zz-primary tw:rounded tw:text-white tw:bg-zz-primary",
    menuPonto: "tw:size-2 tw:rounded-[50%] tw:flex-none",
    menuEmoji: "tw:w-[18px] tw:text-center tw:flex-none",
    menuAmostra: "tw:size-[9px] tw:rounded-[50%] tw:flex-none",
    // Regulares / Excluídas / Ambos (filtro de categoria): o JS troca a classe is-active ao clicar
    menuSegmento: "tw:grid tw:grid-cols-[repeat(3,1fr)] tw:gap-1 tw:pt-0.5 tw:px-1 tw:pb-2",
    menuSegmentoItem: "tw:h-[30px] tw:border tw:border-zz-border tw:rounded-lg tw:bg-zz-surface tw:text-[13px] tw:text-zz-secondary "
      + "tw:[&.is-active]:border-zz-primary tw:[&.is-active]:bg-zz-primary-softer tw:[&.is-active]:text-zz-primary tw:[&.is-active]:font-semibold",
    // linha com interruptor (Investimentos › contas incluídas); o interruptor (.toggle) ainda está no CSS antigo
    menuInterruptor: "menu__toggle tw:flex tw:items-center tw:gap-2 tw:min-h-9 tw:py-1 tw:px-2.5 tw:[&_.toggle]:flex-none tw:[&_.toggle]:ml-auto tw:[&_.toggle]:gap-0 "
      + "tw:[&_.toggle-label:empty]:hidden",
    menuInterruptorRotulo: "tw:flex-auto tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap",

    /* ---------- Janelas modais (components/feedback.ts: modal; components/modais.ts: janela) ----------
       "modal", "modal-overlay" e "modal--x" continuam como ganchos: o JS procura a janela aberta e as peças
       ainda no CSS antigo (campos, botões, paleta de cores, Configurações) se ajustam dentro delas.
       is-visible (no fundo) é posta pelo JS logo depois de a janela entrar: fundo e caixa surgem juntos. */
    modalFundo: "modal-overlay tw:fixed tw:inset-0 tw:grid tw:place-items-center tw:p-6 tw:bg-(--color-overlay) tw:z-90 tw:opacity-0 "
      + "tw:[transition:opacity_var(--duration-medium)_var(--easing)] tw:[&.is-visible]:opacity-100 tw:gaveta:p-4",
    modalPadrao: CAIXA + " tw:w-[min(440px,100%)] tw:gaveta:w-full",
    modalConfirmacao: CAIXA + " tw:w-[min(500px,calc(100vw_-_32px))]",
    modalConfig: CAIXA + " tw:w-[min(980px,calc(100vw_-_32px))] tw:h-[min(760px,calc(100vh_-_32px))] tw:max-h-[calc(100vh_-_48px)] tw:flex tw:flex-col "
      + "tw:relative tw:overflow-hidden",
    modalJanela: CAIXA + " tw:w-[min(560px,calc(100vw_-_32px))] tw:gaveta:w-full",
    modalDividir: CAIXA + " tw:w-[min(820px,calc(100vw_-_32px))] tw:gaveta:w-full",
    // novidades da versão: cabeçalho roxo próprio (components/novidades.ts); a lista rola, o topo e o rodapé ficam
    modalNovidades: CAIXA + " tw:w-[min(560px,calc(100vw_-_32px))] tw:max-h-[calc(100vh_-_48px)] tw:flex tw:flex-col tw:overflow-hidden tw:rounded-[20px]",
    modalTopo: "tw:flex tw:items-center tw:justify-between tw:pt-5 tw:pr-5 tw:pb-0 tw:pl-6",
    modalTopoConfirmacao: "tw:flex tw:items-center tw:justify-between tw:pt-5 tw:px-6 tw:pb-0 tw:[&_.icon-btn]:hidden",   // confirmação: sem o X
    modalTopoConfig: "tw:flex tw:items-center tw:justify-between tw:absolute tw:top-2.5 tw:right-2.5 tw:p-0 tw:z-2",       // só o X, sobre o conteúdo
    modalTopoDividir: "tw:flex tw:items-center tw:justify-center tw:relative tw:pt-5 tw:pr-5 tw:pb-0 tw:pl-6 tw:[&_.icon-btn]:absolute tw:[&_.icon-btn]:right-4",
    modalTitulo: "tw:text-[15px] tw:font-[620]",
    modalTituloConfirmacao: "tw:text-[15px] tw:font-[550] tw:text-left",
    modalTituloConfig: "tw:hidden",
    modalTituloDividir: "tw:w-full tw:text-center tw:text-[13px] tw:font-[620] tw:uppercase tw:tracking-[0.06em]",
    modalCorpo: "tw:pt-3 tw:px-6 tw:pb-5",
    modalCorpoConfirmacao: "tw:pt-2 tw:px-6 tw:pb-5 tw:text-left",
    modalCorpoConfig: "tw:p-0 tw:h-full tw:overflow-hidden tw:bg-zz-surface tw:rounded-[20px]",
    modalCorpoJanela: "tw:pt-4 tw:px-6 tw:pb-0",
    modalCorpoNovidades: "tw:min-h-0 tw:overflow-y-auto tw:px-6 tw:py-1",
    modalRodape: "tw:flex tw:justify-end tw:gap-2 tw:py-4 tw:px-6 tw:border-t tw:border-t-zz-border " + RODAPE_CELULAR,
    modalRodapeConfirmacao: "tw:flex tw:justify-end tw:gap-2 tw:pt-0 tw:px-6 tw:pb-5 " + RODAPE_CELULAR,
    modalRodapeNovidades: "tw:flex tw:flex-none tw:items-center tw:justify-between tw:gap-4 tw:py-4 tw:px-6 tw:border-t tw:border-t-zz-border",
    modalTexto: "tw:text-zz-secondary tw:text-[15px] tw:font-[450]",
    modalTextoConfirmacao: "tw:text-zz-secondary tw:text-[13px] tw:font-[450] tw:max-w-none tw:[text-wrap:pretty]",
    // conteúdo das janelas de criação (modais.janela) e de transferência (cambio.ts)
    janelaRodape: "tw:flex tw:items-center tw:justify-end tw:gap-2 tw:pt-0 tw:px-6 tw:pb-4 tw:mt-4 tw:-mx-6 tw:mb-0 tw:empty:hidden " + RODAPE_CELULAR,
    // ex.: "Restante a pagar": centrado com os botões; no celular, linha própria acima deles
    janelaRodapeEsquerda: "tw:mr-auto tw:flex tw:items-center tw:gaveta:basis-full tw:gaveta:mr-0 tw:gaveta:justify-center tw:gaveta:pb-1",
    janelaForm: "tw:flex tw:flex-col tw:gap-4 tw:[&>.segmented--pilulas]:grid",
    janelaLinha: "tw:grid tw:grid-cols-[44px_minmax(0,1fr)] tw:gap-3 tw:items-center",
    janelaNome: "tw:h-11 tw:text-[17px]",   // campo de nome grande (ícone + nome, nome do perfil)
    janelaEscolha: "tw:flex tw:flex-col tw:gap-3 tw:pb-4",
    janelaPesquisa: "tw:flex tw:items-center tw:gap-2 tw:h-[38px] tw:px-3 tw:py-0 tw:rounded-lg tw:bg-(--color-background) tw:text-zz-muted",
    janelaPesquisaCampo: "tw:flex-1 tw:min-w-0 tw:[border:0] tw:outline-none tw:bg-transparent tw:text-[15px] tw:text-zz-text",
    // a lista vai de borda a borda da janela (-mx-6) e as linhas devolvem o respiro por dentro: com a margem
    // negativa nas linhas, elas passavam da área de rolagem e apareciam uma barra de rolagem horizontal
    janelaLista: "tw:max-h-[360px] tw:overflow-y-auto tw:overflow-x-hidden tw:-mx-6 tw:flex tw:flex-col",
    janelaListaSemRolagemLateral: "tw:max-h-[360px] tw:overflow-y-auto tw:overflow-x-hidden tw:flex tw:flex-col",
    // transação na lista (de borda a borda da janela)
    // valor numa coluna de largura fixa: os ícones de categoria ficam alinhados (à esquerda da coluna deles)
    janelaLanc: LANC + " tw:grid-cols-[56px_minmax(0,1fr)_30px_112px] tw:py-0 tw:px-6 tw:m-0",
    janelaLancMarcavel: LANC + " tw:grid-cols-[18px_52px_minmax(0,1fr)_auto] tw:py-0 tw:px-2 tw:m-0 tw:cursor-pointer",
    janelaLancData: "tw:text-zz-secondary tw:text-[15px] tw:font-[450]",
    janelaLancNome: "tw:flex tw:items-center tw:gap-2 tw:min-w-0 tw:whitespace-nowrap tw:overflow-hidden tw:text-[15px] tw:font-[450] "
      + "tw:[&>span:last-child]:overflow-hidden tw:[&>span:last-child]:text-ellipsis",
    janelaLancCat: "tw:w-[26px] tw:h-[22px] tw:grid tw:place-items-center tw:rounded-(--radius-pill) tw:bg-[color-mix(in_srgb,var(--tag-color)_16%,white)] tw:text-[12px]",
    janelaLancValor: "money tw:justify-self-end tw:text-[15px] tw:font-[620]",
  } as const;

  ZoZo.estrutura = E;
})(window.ZoZo);
