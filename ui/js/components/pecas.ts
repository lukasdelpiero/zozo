/* =============================================================
   ZoZo — Peças compartilhadas em Tailwind CSS
   Classes dos componentes de components/ui.ts (e de quem monta as
   mesmas peças): etiquetas, pílulas, percentuais, chips de status,
   barra de progresso, abas de período, ícone de conta, nome com
   dígitos, carregando, esqueletos, estado vazio, avisos, card e seção.
   Classes sem tw: que continuam no HTML (tag, cat-pill, card, section,
   empty…) são ganchos: as telas ainda no CSS antigo e alguns ajustes
   por contexto ([&_.cat-pill]:… nas linhas) se apoiam nelas.
   Classes sempre escritas por inteiro (o Tailwind só gera o que lê).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";

  // Etiqueta de perfil e pílula de categoria: fundo na cor (14%/12%), texto no mesmo tom mais escuro
  const TAG = "tag tw:inline-flex tw:items-center tw:gap-1.5 tw:max-w-full tw:h-[22px] tw:pr-[9px] tw:pl-2 tw:py-0 tw:[border:0] tw:rounded-(--radius-pill) "
    + "tw:bg-[color-mix(in_srgb,var(--tag-color)_12%,white)] tw:text-[color-mix(in_srgb,var(--tag-color)_55%,black)] tw:leading-none tw:whitespace-nowrap";
  const PCT = "pct tw:inline-flex tw:items-center tw:gap-[3px] tw:h-[22px] tw:px-[7px] tw:py-0 tw:rounded-(--radius-pill) tw:text-[13px] tw:font-[550] "
    + "tw:[font-variant-numeric:lining-nums_proportional-nums] tw:whitespace-nowrap";
  const CHIP = "status-chip tw:inline-flex tw:items-center tw:h-[22px] tw:px-[9px] tw:py-0 tw:rounded-(--radius-pill) tw:text-[12px] tw:font-semibold";
  const ABA = "tw:h-7 tw:min-w-10 tw:px-2.5 tw:py-0 tw:[border:0] tw:rounded-lg tw:text-[13px] tw:font-[620] tw:tracking-[0.02em]";
  const BLOCO_ESQ = "tw:bg-[linear-gradient(90deg,var(--color-skeleton)_0%,var(--color-skeleton-shine)_50%,var(--color-skeleton)_100%)] tw:bg-size-[200%_100%] "
    + "tw:animate-zz-brilho";

  /* ---------- Controles de formulário: base com especificidade zero (variante "base" = :where(&)) ----------
     Assim qualquer classe passada por quem usa o componente (ex.: campo de orçamento maior, campo do login)
     vence a base sem "!", e os ajustes por contexto ([&_.btn]:… no contêiner) também. */
  const BTN = "btn tw:base:inline-flex tw:base:items-center tw:base:justify-center tw:base:gap-1.5 tw:base:py-0 tw:base:border tw:base:rounded-lg "
    + "tw:base:font-medium tw:base:whitespace-nowrap tw:base:disabled:opacity-55 tw:base:[&.is-busy]:opacity-70 tw:base:[&.is-busy]:cursor-progress "
    + "tw:base:[transition:background_var(--duration-fast)_var(--easing),border-color_var(--duration-fast)_var(--easing),color_var(--duration-fast)_var(--easing)]";
  const BTN_COR: Record<string, string> = {
    primary: "btn--primary tw:base:[background:var(--botao-roxo)_#6948D8] tw:base:border-transparent tw:base:text-white "
      + "tw:base:hover:not-disabled:[background:var(--botao-roxo-hover)] tw:base:hover:not-disabled:[filter:none] "
      + "tw:base:active:not-disabled:[background:linear-gradient(180deg,#6948D8_0%,#5A3BC4_100%)]",
    secondary: "btn--secondary tw:base:bg-zz-surface tw:base:border-zz-border-strong tw:base:text-zz-text tw:base:hover:not-disabled:bg-zz-surface-hover",
    danger: "btn--danger tw:base:bg-(--color-danger) tw:base:border-transparent tw:base:text-white tw:base:hover:not-disabled:bg-(--color-danger-hover)",
    "danger-ghost": "btn--danger-ghost tw:base:bg-transparent tw:base:border-transparent tw:base:text-(--color-danger) tw:base:hover:not-disabled:bg-(--color-danger-soft)",
    text: "btn--text tw:base:bg-transparent tw:base:border-transparent tw:base:text-zz-primary tw:base:hover:not-disabled:bg-zz-primary-softer",
  };
  /** Classes do botão: variante (cor), tamanho (sm), largura cheia (block) */
  function botao(variante?: string, pequeno?: boolean, cheio?: boolean): string {
    const v = variante && BTN_COR[variante] ? variante : "secondary";
    const px = v === "text" ? "tw:base:px-2" : v === "danger-ghost" || pequeno ? "tw:base:px-2.5" : "tw:base:px-3.5";
    const altura = cheio ? "btn--block tw:base:w-full tw:base:h-[38px]" : pequeno ? "btn--sm tw:base:h-7" : "tw:base:h-[34px]";
    return [BTN, BTN_COR[v], px, altura, pequeno ? "tw:base:text-[13px]" : "tw:base:text-[13.5px]"].join(" ");
  }
  const ICONE = "icon-btn tw:base:inline-grid tw:base:place-items-center tw:base:p-0 tw:base:[border:0] tw:base:rounded-lg tw:base:bg-transparent "
    + "tw:base:[transition:background_var(--duration-fast)_var(--easing),color_var(--duration-fast)_var(--easing)]";
  const ICONE_COR = "tw:base:text-zz-secondary tw:base:hover:not-disabled:bg-zz-surface-hover tw:base:hover:not-disabled:text-zz-text";
  const ICONE_PERIGO = "icon-btn--danger tw:base:text-zz-secondary tw:base:hover:not-disabled:bg-(--color-danger-soft) tw:base:hover:not-disabled:text-(--color-danger)";
  const ICONE_CLARO = "icon-btn--on-primary tw:base:text-(--color-on-primary) tw:base:hover:not-disabled:bg-(--color-on-primary-hover) "
    + "tw:base:hover:not-disabled:text-(--color-on-primary)";
  /** Classes do botão de ícone: tom (normal | perigo | claro sobre cor) e tamanho */
  function botaoIcone(tom?: string, pequeno?: boolean): string {
    return [ICONE, tom === "perigo" ? ICONE_PERIGO : tom === "claro" ? ICONE_CLARO : ICONE_COR, pequeno ? "icon-btn--sm tw:base:size-[26px]" : "tw:base:size-8"].join(" ");
  }
  const CAMPO = "tw:base:w-full tw:base:min-w-0 tw:base:px-3 tw:base:border tw:base:border-zz-border-strong tw:base:rounded-lg tw:base:bg-zz-surface "
    + "tw:base:text-zz-text tw:base:text-[15px] tw:base:focus:outline-none tw:base:focus:border-zz-primary tw:base:focus:[box-shadow:0_0_0_3px_var(--color-primary-soft)] "
    + "tw:base:[transition:border-color_var(--duration-fast)_var(--easing),box-shadow_var(--duration-fast)_var(--easing)]";
  const SEG_ITEM = "segmented-item tw:base:flex tw:base:items-center tw:base:gap-2 tw:base:rounded-lg tw:base:text-left tw:base:leading-[1.25] "
    + "tw:base:[transition:border-color_var(--duration-fast),background_var(--duration-fast),color_var(--duration-fast)]";
  const SWATCH = "swatch tw:relative tw:z-0 tw:grid tw:place-items-center tw:p-0 tw:[border:0] tw:bg-(--swatch) tw:text-white tw:outline-none tw:[box-shadow:none] "
    + "tw:[transition:transform_var(--duration-fast)_var(--easing),border-radius_var(--duration-fast)_var(--easing),box-shadow_var(--duration-fast)] "
    + "tw:hover:[transform:scale(1.14)] tw:hover:rounded-lg tw:hover:z-2 tw:hover:[box-shadow:0_4px_12px_rgba(22,33,58,0.25)] "
    + "tw:focus-visible:[transform:scale(1.14)] tw:focus-visible:rounded-lg tw:focus-visible:z-2 tw:focus-visible:[box-shadow:0_4px_12px_rgba(22,33,58,0.25)] "
    + "tw:focus-visible:outline-2 tw:focus-visible:outline-zz-text tw:focus-visible:outline-offset-2";

  // Painel da transação: botões de texto pequenos (data, conta, "Despesa ▾") e os campos grandes de nome e valor
  const LP_BOTAO = "tw:inline-flex tw:items-center tw:gap-1.5 tw:px-1.5 tw:py-0 tw:[border:0] tw:rounded-lg tw:bg-transparent tw:text-zz-secondary "
    + "tw:text-[13px] tw:font-[550] tw:hover:bg-zz-surface-hover tw:hover:text-zz-text";
  // data e conta no topo do painel da transação: mesmo botão, em cinza
  const LP_BOTAO_CINZA = "tw:inline-flex tw:items-center tw:gap-1.5 tw:px-1.5 tw:py-0 tw:[border:0] tw:rounded-lg tw:bg-transparent tw:text-zz-cinza "
    + "tw:text-[.8125rem] tw:font-[550] tw:hover:bg-zz-surface-hover tw:hover:text-zz-text";
  const LP_CAMPO = "tw:border tw:border-transparent tw:rounded-lg tw:bg-transparent tw:text-[20px] tw:font-[550] tw:tracking-[-0.01em] tw:text-zz-text tw:py-0.5 tw:px-1.5 "
    + "tw:min-w-0 tw:outline-none tw:focus:[box-shadow:none]";

  const P = {
    /* Etiqueta de perfil (UI.Tag) — tag--upper: maiúsculas (listas e painéis) */
    tag: TAG + " tw:text-[12px] tw:font-medium",
    tagUpper: TAG + " tag--upper tw:uppercase tw:text-[11px] tw:font-semibold tw:tracking-[0.03em]",
    tagInterativa: "tag--interactive tw:hover:bg-[color-mix(in_srgb,var(--tag-color)_20%,white)]",
    tagVazia: "tag tag--empty tw:inline-flex tw:items-center tw:gap-1.5 tw:max-w-full tw:h-[22px] tw:pr-[9px] tw:pl-2 tw:py-0 tw:[border:0] "
      + "tw:rounded-(--radius-pill) tw:bg-transparent tw:text-zz-muted tw:text-[12px] tw:font-medium tw:leading-none tw:whitespace-nowrap",
    tagPonto: "tw:size-1.5 tw:rounded-[50%] tw:bg-(--tag-color) tw:flex-none",
    tagTexto: "tw:overflow-hidden tw:text-ellipsis",
    tagTextoUpper: "tw:overflow-hidden tw:text-ellipsis tw:leading-[22px]",

    /* Pílula de categoria (UI.CategoryLabel pill) e rótulo simples */
    pilula: "cat-pill tw:inline-flex tw:items-center tw:gap-[5px] tw:max-w-full tw:h-[22px] tw:pr-[9px] tw:pl-[7px] tw:py-0 tw:rounded-(--radius-pill) "
      + "tw:bg-[color-mix(in_srgb,var(--tag-color)_14%,white)] tw:text-[color-mix(in_srgb,var(--tag-color)_55%,black)] tw:text-[11px] tw:font-semibold "
      + "tw:tracking-[0.03em] tw:uppercase tw:whitespace-nowrap tw:leading-none",
    pilulaIcone: "tw:text-[12px] tw:tracking-normal tw:relative tw:-top-px",   // a tinta do emoji fica ~1 px abaixo do centro
    pilulaNome: "tw:overflow-hidden tw:text-ellipsis tw:leading-[22px]",       // 22 px: acentos em maiúsculas não cortam
    rotulo: "tw:inline-flex tw:items-center tw:gap-[7px] tw:min-w-0 tw:text-zz-text",
    rotuloVazio: "tw:inline-flex tw:items-center tw:gap-[7px] tw:min-w-0 tw:text-zz-muted",
    rotuloIcone: "tw:text-[14px] tw:leading-none tw:w-[18px] tw:text-center tw:flex-none",
    rotuloNome: "tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[15px] tw:font-[450]",

    /* Variação percentual (UI.PercentageChange) */
    pctSobe: PCT + " tw:text-(--color-pilula-sobe) tw:bg-(--color-pilula-sobe-fundo)",
    pctDesce: PCT + " tw:text-(--color-pilula-desce) tw:bg-(--color-pilula-desce-fundo)",
    pctIgual: PCT + " tw:text-(--color-pilula-igual) tw:bg-(--color-pilula-igual-fundo)",
    pctSimplesSobe: PCT + " tw:text-(--color-pilula-sobe) tw:bg-transparent tw:p-0",
    pctSimplesDesce: PCT + " tw:text-(--color-pilula-desce) tw:bg-transparent tw:p-0",
    pctSimplesIgual: PCT + " tw:text-(--color-pilula-igual) tw:bg-transparent tw:p-0",
    pctValor: "tw:text-[13px] tw:font-[550]",

    /* Letra do tipo (R/P/T/I/D) */
    letra: "kind-badge tw:size-4 tw:grid tw:place-items-center tw:border tw:border-zz-border-strong tw:rounded tw:text-zz-secondary tw:text-[9.5px] "
      + "tw:font-semibold tw:leading-none",
    // na pílula de recorrência do painel da transação
    letraPequena: "kind-badge tw:size-3.5 tw:grid tw:place-items-center tw:border tw:border-zz-border-strong tw:rounded tw:text-zz-secondary tw:text-[8.5px] "
      + "tw:font-semibold tw:leading-none",

    /* Chip de situação (pago / pendente / neutro) */
    chipOk: CHIP + " tw:bg-(--color-positive-soft) tw:text-zz-positive",
    chipPendente: CHIP + " tw:bg-zz-warning-soft tw:text-zz-warning-text",
    chipNeutro: CHIP + " tw:bg-(--color-neutral-soft) tw:text-(--color-neutral)",

    /* Barra de progresso (UI.ProgressBar) */
    barra: "progress tw:block tw:w-full tw:h-1.5 tw:rounded-(--radius-pill) tw:bg-(--color-progress-track) tw:overflow-hidden",
    barraGrande: "progress tw:block tw:w-full tw:h-2 tw:mt-2 tw:rounded-(--radius-pill) tw:bg-(--color-progress-track) tw:overflow-hidden",
    barraOk: "tw:block tw:h-full tw:rounded-[inherit] tw:bg-(--color-progress-ok) tw:[transition:width_var(--duration-medium)_var(--easing)]",
    barraAcima: "tw:block tw:h-full tw:rounded-[inherit] tw:bg-(--color-progress-over) tw:[transition:width_var(--duration-medium)_var(--easing)]",
    barraPerto: "tw:block tw:h-full tw:rounded-[inherit] tw:bg-(--color-progress-near) tw:[transition:width_var(--duration-medium)_var(--easing)]",
    barraAlocacao: "tw:block tw:h-full tw:rounded-[inherit] tw:bg-(--color-allocation) tw:[transition:width_var(--duration-medium)_var(--easing)]",

    /* Abas de período 1S · 1M · 3M · AA · 1A · TOTAL */
    abas: "filter-tabs tw:inline-flex tw:items-center tw:gap-1",
    aba: ABA + " tw:bg-transparent tw:text-zz-cinza tw:hover:text-zz-text tw:hover:bg-zz-surface-hover",
    abaAtiva: ABA + " tw:bg-zz-primary-soft tw:text-zz-primary",

    /* Ícone redondo da conta (UI.AccountIcon) e nome com os 4 últimos dígitos */
    iconeConta: "account-icon tw:size-9 tw:grid tw:place-items-center tw:rounded-[50%] tw:flex-none "
      + "tw:bg-[color-mix(in_srgb,var(--account-color)_14%,white)] tw:text-[color-mix(in_srgb,var(--account-color)_65%,black)]",
    nomeDigitos: "name-digits tw:inline-flex tw:items-baseline tw:gap-1.5 tw:min-w-0",
    nomeDigitosNome: "name-digits__name tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap",
    nomeDigitosDigitos: "name-digits__digits tw:text-zz-muted tw:[font-variant-numeric:lining-nums_proportional-nums] tw:flex-none",

    /* Carregando */
    girando: "spinner tw:size-[18px] tw:rounded-[50%] tw:border-2 tw:border-zz-primary-soft tw:border-t-zz-primary tw:animate-zz-gira",
    girandoBotao: "spinner tw:size-3.5 tw:rounded-[50%] tw:border-2 tw:border-zz-primary-soft tw:border-t-zz-primary tw:flex-none tw:animate-zz-gira "
      + "tw:in-[.btn--primary]:border-[rgba(255,255,255,0.35)] tw:in-[.btn--primary]:border-t-white",
    esqueleto: "skeleton tw:flex tw:flex-col tw:gap-1.5 tw:py-2 tw:px-0",
    esqueletoLinha: "tw:flex tw:justify-between tw:items-center tw:h-[34px] tw:px-4 tw:py-0 tw:in-[.skeleton--sidebar]:px-2.5 tw:in-[.skeleton--sidebar]:h-[26px]",
    esqueletoBloco: "tw:block tw:h-3 tw:rounded-md " + BLOCO_ESQ
      + " tw:in-[.skeleton--sidebar]:bg-[rgba(255,255,255,0.14)] tw:in-[.skeleton--sidebar]:animate-none",
    esqueletoCard: "card tw:block tw:h-[300px] tw:rounded-[20px] tw:[border:0] tw:mb-5 tw:[box-shadow:var(--shadow-card)] " + BLOCO_ESQ,
    esqueletoCardBaixo: "card tw:block tw:h-[150px] tw:rounded-[20px] tw:[border:0] tw:mb-5 tw:[box-shadow:var(--shadow-card)] " + BLOCO_ESQ,

    /* Estado vazio e erro (UI.EmptyState / UI.ErrorState) */
    vazio: "empty tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:min-h-[140px] tw:p-6 tw:text-zz-secondary tw:text-center",
    vazioIcone: "tw:text-zz-muted",
    vazioIconeErro: "tw:text-(--color-negative)",
    vazioTexto: "tw:text-[15px]",

    /* Avisos (toasts): só erros e avisos aparecem */
    aviso: "toast tw:flex tw:items-start tw:gap-2.5 tw:w-max tw:max-w-full tw:py-[11px] tw:px-4 tw:rounded-xl tw:bg-zz-text tw:text-white tw:text-[14px] "
      + "tw:font-[450] tw:leading-[1.45] tw:text-left tw:[box-shadow:var(--shadow-popover)] tw:opacity-0 tw:[transform:translateY(8px)] "
      + "tw:[transition:opacity_var(--duration-medium)_var(--easing),transform_var(--duration-medium)_var(--easing)] tw:[&.is-visible]:opacity-100 "
      + "tw:[&.is-visible]:[transform:none]",
    avisoErro: "toast tw:flex tw:items-start tw:gap-2.5 tw:w-max tw:max-w-full tw:py-[11px] tw:px-4 tw:rounded-xl tw:bg-(--color-negative) tw:text-white tw:text-[14px] "
      + "tw:font-[450] tw:leading-[1.45] tw:text-left tw:[box-shadow:var(--shadow-popover)] tw:opacity-0 tw:[transform:translateY(8px)] "
      + "tw:[transition:opacity_var(--duration-medium)_var(--easing),transform_var(--duration-medium)_var(--easing)] tw:[&.is-visible]:opacity-100 "
      + "tw:[&.is-visible]:[transform:none]",
    avisoIcone: "tw:flex-none tw:mt-0.5",
    avisoIconeAviso: "tw:flex-none tw:mt-0.5 tw:text-[#ffb36b]",
    avisoIconeOk: "tw:flex-none tw:mt-0.5 tw:text-[#6fdca4]",
    avisoTexto: "tw:min-w-0 tw:[overflow-wrap:anywhere]",

    /* Card (UI.Card) */
    card: "card tw:bg-zz-surface tw:border tw:border-zz-border tw:rounded-[20px] tw:[box-shadow:var(--shadow-card)]",
    cardTopo: "tw:flex tw:items-center tw:justify-between tw:mb-3",
    cardTitulo: "tw:text-[15px] tw:font-[550]",
    // a ponta da seta fica na mesma linha dos valores do card (-6 px do respiro do botão, -4 px do respiro do desenho da seta)
    cardLink: "card__link tw:inline-flex tw:items-center tw:gap-0.5 tw:[border:0] tw:bg-transparent tw:py-1 tw:px-1.5 tw:-mr-1.5 tw:rounded-md tw:text-zz-secondary "
      + "tw:text-[15px] tw:font-[550] tw:hover:text-zz-primary tw:hover:bg-zz-primary-softer tw:[&>svg]:-mr-1",

    /* Seção recolhível (UI.Section) */
    secao: "section tw:mt-6",
    secaoTopo: "tw:relative tw:items-center tw:justify-between tw:min-h-9 tw:mb-1",
    secaoTopoPadrao: "tw:flex",
    secaoInicio: "tw:flex tw:items-center tw:gap-0.5 tw:min-w-0",
    secaoBotao: "tw:relative tw:z-1 tw:inline-flex tw:items-center tw:gap-2 tw:pt-1 tw:pr-1.5 tw:pb-1 tw:pl-0.5 tw:[border:0] tw:bg-transparent tw:rounded-md",
    secaoSeta: "tw:text-zz-muted tw:[transition:transform_var(--duration-fast)_var(--easing)]",
    secaoSetaFechada: "tw:text-zz-muted tw:[transition:transform_var(--duration-fast)_var(--easing)] tw:[transform:rotate(-90deg)]",
    secaoTitulo: "tw:text-[15px] tw:font-[620]",
    secaoLado: "tw:contents",

    /* ---------- Botões ---------- */
    rotuloBotao: "btn__label",
    // botão "Salvar" dos formulários (forms.ts) e o do login (auth.ts, com as próprias medidas por cima)
    botaoPrimario: botao("primary"),
    botaoPrimarioCheio: botao("primary", false, true),

    /* ---------- Campos ---------- */
    campo: "field tw:base:flex tw:base:flex-col tw:base:gap-1.5 tw:base:min-w-0",
    campoRotulo: "field-label tw:base:text-[13px] tw:base:font-medium tw:base:text-zz-secondary",
    campoDica: "field-hint tw:base:text-[11.5px] tw:base:text-zz-muted",
    entrada: "input " + CAMPO + " tw:base:h-9 tw:base:py-0 tw:base:placeholder:text-zz-muted tw:base:aria-invalid:border-(--color-danger) "
      + "tw:base:aria-invalid:[box-shadow:0_0_0_3px_var(--color-danger-soft)] tw:base:disabled:bg-(--color-background) tw:base:disabled:text-zz-muted "
      + "tw:base:[&[type=date]]:[font-variant-numeric:lining-nums_proportional-nums] tw:base:[&[type=number]]:[font-variant-numeric:lining-nums_proportional-nums]",
    entradaPequena: "input--sm tw:h-8 tw:w-[130px] tw:text-[13px] tw:font-[550] tw:placeholder:text-[13px] tw:placeholder:font-[550]",   // Configurações
    entradaLeitura: "input--leitura tw:bg-(--color-background) tw:text-zz-secondary tw:cursor-default tw:hover:bg-(--color-background) "
      + "tw:focus:bg-(--color-background) tw:focus:[box-shadow:none]",
    // lista (select): seta própria no fundo; com "base-select" a lista aberta continua o campo (o resto em css/base.css)
    lista: "select " + CAMPO + " tw:base:h-9 tw:base:py-0 tw:base:appearance-none tw:base:pr-[34px] tw:base:[background-image:var(--seta-select)] "
      + "tw:base:[background-repeat:no-repeat] tw:base:[background-position:right_10px_center] tw:base:disabled:bg-(--color-background) tw:base:disabled:text-zz-muted "
      + "tw:base:supports-[appearance:base-select]:[appearance:base-select] tw:base:supports-[appearance:base-select]:flex tw:base:supports-[appearance:base-select]:items-center "
      + "tw:base:supports-[appearance:base-select]:open:border-zz-primary tw:base:supports-[appearance:base-select]:open:rounded-b-none "
      + "tw:base:supports-[appearance:base-select]:open:[box-shadow:none]",
    areaTexto: "textarea " + CAMPO + " tw:base:h-auto tw:base:py-2.5 tw:base:resize-y tw:base:leading-normal tw:base:placeholder:text-zz-muted",
    // valor com símbolo da moeda à esquerda (R$ ...): o número fica à direita
    afixo: "field__affix tw:relative tw:block tw:min-w-0 tw:[&_.input]:pl-[38px] tw:[&_.input]:text-right "
      + "tw:[&_.input]:[font-variant-numeric:lining-nums_proportional-nums]",
    afixoPequeno: "field__affix tw:relative tw:block tw:min-w-0 tw:[&_.input]:pl-[46px] tw:[&_.input]:text-right "
      + "tw:[&_.input]:[font-variant-numeric:lining-nums_proportional-nums]",
    prefixo: "field__prefix tw:absolute tw:left-3 tw:top-1/2 tw:[transform:translateY(-50%)] tw:text-zz-muted tw:text-[13px] tw:pointer-events-none",
    // senha com o botão de mostrar (verificacao.ComRevelar)
    comRevelar: "input-with-action tw:relative tw:[&_.input]:pr-10",
    comRevelarPequeno: "input-with-action input-with-action--sm tw:relative tw:flex-[1_1_0] tw:min-w-0 tw:[&_.input]:w-full tw:[&_.input]:pr-[34px]",
    revelar: "input-reveal tw:absolute tw:right-1 tw:top-1/2 tw:[transform:translateY(-50%)] tw:w-[30px] tw:h-7 tw:grid tw:place-items-center tw:[border:0] "
      + "tw:rounded-md tw:bg-transparent tw:text-zz-secondary tw:hover:bg-zz-surface-hover tw:in-[.input-with-action--sm]:w-7",
    erroForm: "form-error tw:text-(--color-negative) tw:text-[13px] tw:min-h-0 tw:empty:hidden",

    /* ---------- Caixa de seleção (UI.Checkbox) ---------- */
    caixa: "check tw:group/check tw:base:relative tw:base:inline-flex tw:base:items-center tw:base:gap-2 tw:base:cursor-pointer",
    caixaEntrada: "check__input tw:peer tw:absolute tw:opacity-0 tw:size-4 tw:m-0 tw:cursor-pointer",
    caixaQuadro: "check-box tw:size-4 tw:grid tw:place-items-center tw:border-[1.5px] tw:border-zz-border-strong tw:rounded tw:bg-zz-surface tw:text-transparent "
      + "tw:[transition:background_var(--duration-fast),border-color_var(--duration-fast),color_var(--duration-fast)] tw:group-hover/check:border-zz-secondary "
      + "tw:peer-checked:bg-zz-primary tw:peer-checked:border-zz-primary tw:peer-checked:text-white "
      // "algumas marcadas" (selecionar todas, na barra de Transações): traço branco no lugar do check
      + "tw:peer-indeterminate:bg-zz-primary tw:peer-indeterminate:border-zz-primary tw:peer-indeterminate:text-white tw:peer-indeterminate:after:content-[''] "
      + "tw:peer-indeterminate:after:w-2 tw:peer-indeterminate:after:h-0.5 tw:peer-indeterminate:after:bg-white tw:peer-indeterminate:after:rounded-[1px] "
      + "tw:peer-indeterminate:[&_.icon]:hidden tw:peer-focus-visible:outline-2 tw:peer-focus-visible:outline-[color:var(--color-focus)] tw:peer-focus-visible:outline-offset-2",

    /* ---------- Interruptor (UI.Toggle e modais.Interruptor) ---------- */
    interruptor: "toggle tw:group/tg tw:base:inline-flex tw:base:items-center tw:base:gap-2 tw:base:cursor-pointer",
    interruptorLinha: "toggle toggle-linha tw:group/tg tw:base:flex tw:base:justify-between tw:base:w-full tw:base:items-center tw:base:gap-2 tw:base:cursor-pointer",
    interruptorEntrada: "toggle__input tw:absolute tw:opacity-0 tw:pointer-events-none",
    interruptorTrilho: "toggle__track tw:w-[34px] tw:h-5 tw:rounded-(--radius-pill) tw:bg-zz-border-strong tw:relative tw:[transition:background_var(--duration-fast)] "
      + "tw:group-has-checked/tg:bg-zz-primary tw:group-has-focus-visible/tg:outline-2 tw:group-has-focus-visible/tg:outline-[color:var(--color-focus)] "
      + "tw:group-has-focus-visible/tg:outline-offset-2",
    interruptorBolinha: "toggle__thumb tw:absolute tw:top-0.5 tw:left-0.5 tw:size-4 tw:rounded-[50%] tw:bg-white tw:[box-shadow:0_1px_2px_rgba(0,0,0,.2)] "
      + "tw:[transition:transform_var(--duration-fast)_var(--easing)] tw:group-has-checked/tg:[transform:translateX(14px)]",
    interruptorRotulo: "toggle-label",
    interruptorRotuloLinha: "toggle-label tw:font-medium",

    /* ---------- Escolha segmentada (UI.Segmented) — segmented--pilulas: pílulas sobre fundo cinza ---------- */
    segmentado: "segmented tw:base:flex tw:base:gap-2",
    segmentadoPilulas: "segmented segmented--pilulas tw:base:inline-grid tw:base:[grid-auto-flow:column] tw:base:auto-cols-[minmax(104px,max-content)] "
      + "tw:base:w-max tw:base:max-w-full tw:base:self-center tw:base:justify-self-center tw:base:mx-auto tw:base:gap-1 tw:base:p-1 tw:base:rounded-xl "
      + "tw:base:bg-(--color-background)",
    segmento: SEG_ITEM + " tw:base:min-h-10 tw:base:py-2 tw:base:px-2.5 tw:base:border tw:base:border-zz-border tw:base:bg-zz-surface tw:base:text-zz-secondary "
      + "tw:base:text-[13px] tw:base:font-medium tw:base:[&>span]:flex-1 tw:base:hover:border-zz-border-strong tw:base:hover:text-zz-text "
      + "tw:base:[&.is-active]:border-zz-primary tw:base:[&.is-active]:bg-zz-primary-softer tw:base:[&.is-active]:text-zz-primary "
      + "tw:base:[&.is-active]:[box-shadow:inset_0_0_0_1px_var(--color-primary)]",
    segmentoPilula: SEG_ITEM + " tw:base:justify-center tw:base:min-h-8 tw:base:py-0 tw:base:px-2.5 tw:base:[border:0] tw:base:bg-transparent tw:base:text-zz-secondary "
      + "tw:base:text-[15px] tw:base:font-[550] tw:base:whitespace-nowrap tw:base:[&>span]:flex-[0_1_auto] tw:base:[&>span]:whitespace-nowrap "
      + "tw:base:[&>span]:overflow-hidden tw:base:[&>span]:text-ellipsis tw:base:hover:text-zz-text tw:base:[&.is-active]:bg-zz-surface tw:base:[&.is-active]:text-zz-text "
      + "tw:base:[&.is-active]:[box-shadow:0_1px_3px_rgba(22,33,58,0.12)]",
    segmentoMarca: "tw:text-zz-primary",

    /* ---------- Paleta de cores (UI.ColorPicker) ---------- */
    paleta: "color-picker tw:grid tw:grid-cols-[repeat(8,1fr)] tw:w-max tw:rounded-lg tw:p-0 tw:gap-0 tw:overflow-visible",
    paleta4: "color-picker tw:grid tw:grid-cols-[repeat(4,1fr)] tw:w-max tw:rounded-lg tw:p-0 tw:gap-0 tw:overflow-visible",
    paletaCheia: "tw:w-full!",
    quadrado: SWATCH + " tw:size-[38px]",
    quadradoCheio36: SWATCH + " tw:w-full tw:h-9",
    quadradoCheio40: SWATCH + " tw:w-full tw:h-10",
    quadradoAtivo: "is-active tw:[transform:scale(1.14)] tw:rounded-lg! tw:z-1 tw:[box-shadow:0_4px_12px_rgba(22,33,58,0.25)]",
    quadradoMarca: "tw:size-4 tw:[filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.35))]",

    /* ---------- Card de resumo [valor | rosca | valor] (pagesComum.cardResumoDonut) ---------- */
    resumo: "summary tw:grid tw:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] tw:items-center tw:gap-8 tw:py-5 tw:px-6 tw:area620:gap-4 tw:area620:p-4 "
      + "tw:area460:grid-cols-[minmax(0,1fr)] tw:area460:justify-items-center tw:area460:text-center",
    resumoAntes: "tw:flex tw:flex-col tw:gap-0.5 tw:items-end tw:text-right",
    // lado do orçamento: com o orçamento desligado (Categorias) some, mas guarda o espaço
    resumoDepois: "tw:flex tw:flex-col tw:gap-0.5 tw:items-start tw:text-left tw:[&>.money]:text-left tw:sem-orcamento:in-[.page--categorias]:invisible",
    resumoValor: "money tw:text-[24px] tw:font-semibold tw:tracking-[-0.02em] tw:area460:text-[17px]",
    resumoRotulo: "tw:text-zz-secondary tw:text-[15px]",
    resumoRosca: "tw:grid tw:place-items-center",

    /* ---------- Gráficos (components/charts.ts) — line-chart, line-chart__svg e donut ficam como ganchos ---------- */
    graficoLinha: "line-chart tw:relative",
    graficoSuporte: "tw:w-full",
    graficoSvg: "line-chart__svg tw:block tw:overflow-visible",
    graficoRotulo: "tw:fill-zz-cinza tw:text-[11.5px] tw:[font-family:var(--font-family)]",
    graficoCursor: "tw:stroke-zz-border-strong tw:[stroke-width:1]",
    // modo filtro (passar o mouse): véu sobre o trecho depois do ponto e a data em cima dele
    graficoVeu: "tw:fill-zz-surface tw:[fill-opacity:0.78] tw:pointer-events-none",
    graficoDataTopo: "tw:fill-zz-cinza tw:text-[11.5px] tw:font-[550] tw:tracking-[0.02em] tw:[font-family:var(--font-family)]",
    graficoVazio: "tw:grid tw:place-items-center tw:text-zz-muted tw:text-[13px]",
    dica: "tw:absolute tw:-top-1.5 tw:pointer-events-none tw:min-w-40 tw:py-2 tw:px-2.5 tw:rounded-lg tw:bg-zz-text tw:text-white tw:text-[12px] tw:opacity-0 "
      + "tw:[transform:translateY(-100%)] tw:[transition:opacity_var(--duration-fast)] tw:z-2 tw:[&.is-visible]:opacity-100",
    dicaData: "tw:text-[rgba(255,255,255,0.7)] tw:mb-1",
    dicaLinha: "tw:grid tw:grid-cols-[8px_1fr_auto] tw:gap-2 tw:items-center tw:[&_strong]:font-semibold tw:[&_strong]:[font-variant-numeric:lining-nums_proportional-nums]",
    dicaLinha2: "tw:grid tw:grid-cols-[1fr_auto] tw:gap-2 tw:items-center tw:[&_strong]:font-semibold tw:[&_strong]:[font-variant-numeric:lining-nums_proportional-nums]",
    dicaPonto: "tw:size-2 tw:rounded-[50%]",
    rosca: "donut tw:block",
    roscaClicavel: "donut tw:block tw:cursor-pointer tw:rounded-[50%] tw:[transition:transform_var(--duration-fast)_var(--easing)] tw:hover:[transform:scale(1.03)]",
    roscaArco: "tw:[transition:opacity_var(--duration-fast)] tw:hover:opacity-80",
    barras: "tw:w-full",
    barrasLinha: "tw:stroke-zz-text tw:[stroke-width:1.5]",
    etiquetaGrafico: "tw:fill-zz-text",
    etiquetaGraficoTexto: "tw:fill-white tw:text-[11px] tw:font-semibold tw:[font-family:var(--font-family)]",

    /* ---------- Painéis de informações (conteúdo) ----------
       Base com especificidade zero: a tela ajusta por cima (ex.: a pilha de pílulas no painel do grupo).
       De borda a borda: as seções esticam até as bordas do painel e devolvem o respiro por dentro. */
    painelSecao: "tw:base:py-4 tw:base:border-t tw:base:border-t-zz-border tw:base:-mx-(--page-gutter) tw:base:px-(--page-gutter)",
    painelSecaoTitulo: "tw:base:text-[15px] tw:base:font-semibold tw:base:mb-3",
    painelLinha: "tw:base:flex tw:base:justify-between tw:base:items-center tw:base:gap-4 tw:base:min-h-8",
    painelLinhaRotulo: "tw:base:text-zz-secondary",
    painelLinhaValor: "tw:base:font-medium tw:base:text-right tw:base:[font-variant-numeric:lining-nums_proportional-nums] tw:base:min-w-0",
    painelLista: "tw:base:-mx-2 tw:base:has-[>.pl]:mx-0",
    painelAcoes: "tw:base:flex tw:base:gap-2 tw:base:flex-wrap",
    painelAcoesFim: "tw:base:flex tw:base:gap-2 tw:base:flex-wrap tw:base:justify-end tw:base:mt-2",
    painelGrafico: "tw:base:mt-2 tw:base:mb-3 tw:base:min-h-10 tw:base:relative",
    painelGrade: "tw:flex tw:flex-col tw:gap-3",
    painelRodape: "tw:sticky tw:bottom-0 tw:flex tw:items-center tw:justify-between tw:gap-2 tw:mt-auto tw:pt-3 tw:pb-4 tw:bg-zz-surface tw:border-t tw:border-t-zz-border",
    painelRodapeFim: "tw:flex tw:gap-2",
    // topo com o nome à esquerda e o número à direita (Categorias, Perfis)
    painelTopo: "tw:base:grid tw:base:grid-cols-[minmax(0,1fr)_auto] tw:base:gap-4 tw:base:items-start tw:base:pb-5 tw:base:-mx-(--page-gutter) tw:base:px-(--page-gutter)",
    painelTopoInicio: "tw:base:flex tw:base:gap-3 tw:base:items-center tw:base:min-w-0 tw:base:[&>div]:flex tw:base:[&>div]:flex-col tw:base:[&>div]:min-w-0",
    painelTopoNome: "tw:base:text-[17px] tw:base:font-semibold tw:base:overflow-hidden tw:base:text-ellipsis tw:base:whitespace-nowrap",
    painelTopoNumero: "tw:base:flex tw:base:flex-col tw:base:items-end tw:base:gap-0.5 tw:base:text-right",
    painelTopoRotulo: "tw:base:text-zz-secondary tw:base:text-[15px] tw:base:font-[620]",
    painelTopoValor: "tw:base:text-[20px] tw:base:font-[550] tw:base:tracking-[-0.01em]",
    painelTopoDica: "tw:text-zz-muted tw:text-[11.5px]",
    painelTopoDicaAcima: "tw:text-(--color-negative) tw:text-[11.5px] tw:font-medium",
    // nome editável com a cor e o ícone ao lado (Categorias, Perfis)
    edicaoTopo: "tw:base:flex tw:base:flex-col tw:base:gap-1.5 tw:base:min-w-0 tw:[&_.icon-pick]:inline-grid tw:[&_.icon-pick]:place-items-center tw:[&_.icon-pick]:size-[30px] "
      + "tw:[&_.icon-pick]:text-[18px] tw:[&_.icon-pick]:[border:0] tw:[&_.icon-pick]:bg-transparent tw:[&_.icon-pick]:rounded-[50%] tw:[&_.icon-pick:hover]:bg-zz-surface-hover "
      + "tw:[&_.inline-input]:text-[20px] tw:[&_.inline-input]:font-[550]",
    edicaoTopoLinha: "tw:flex tw:items-center tw:gap-2.5 tw:min-w-0",
    pilulaBotao: "tw:[border:0] tw:bg-transparent tw:p-0 tw:self-start tw:rounded-(--radius-pill) tw:hover:[box-shadow:0_0_0_2px_var(--color-primary-soft)]",
    // topo em duas linhas (Contas, Investimentos, Recorrências): [tipo ...... chips] / [nome ...... valor]
    ph: "tw:flex tw:flex-col tw:gap-1 tw:pb-4 tw:-mx-(--page-gutter) tw:px-(--page-gutter)",
    phTopo: "tw:flex tw:items-center tw:justify-between tw:gap-3 tw:min-h-7 tw:[&>:first-child]:min-w-0 tw:[&>:first-child]:max-w-full "
      + "tw:[&_.cat-pill]:min-w-0 tw:[&_.lp-chip-btn]:min-w-0",
    phMeta: "tw:flex tw:items-center tw:gap-2 tw:min-w-0",
    phTipo: "tw:text-[15px] tw:font-[450] tw:text-zz-secondary",
    phChips: "tw:flex tw:items-center tw:gap-1.5 tw:flex-none",
    phLinha: "tw:flex tw:items-center tw:justify-between tw:gap-3",
    phNome: "tw:text-[20px] tw:font-[550] tw:flex-1 tw:min-w-0",
    phValor: "tw:text-[20px] tw:font-[550] tw:w-auto tw:max-w-[220px] tw:[field-sizing:content] tw:min-w-[90px]",
    phExtra: "tw:text-right tw:text-[13px] tw:text-zz-secondary",

    /* ---------- Edição no lugar (components/inline.ts) e ícone escolhível ----------
       Edição "invisível": sem borda, fundo ou destaque, nem com foco — só o cursor de texto indica */
    noLugar: "inline-input tw:base:min-w-0 tw:base:w-full tw:base:py-0.5 tw:base:px-1.5 tw:base:-ml-[7px] tw:base:border tw:base:border-transparent tw:base:rounded-lg "
      + "tw:base:bg-transparent tw:base:[font:inherit] tw:base:text-inherit tw:base:text-ellipsis tw:base:outline-none tw:base:focus:[box-shadow:none]",
    noLugarValor: "tw:base:text-right tw:base:ml-0 tw:base:-mr-[7px]",
    // nome do usuário nas Configurações: 220 px alinhado à direita; até 700 px ocupa a linha toda
    cfgNoLugar: "tw:w-[220px] tw:text-right tw:ml-0 tw:-mr-[7px] tw:text-[13px] tw:font-[550] tw:ate700:w-full tw:ate700:text-left tw:ate700:m-0",
    // "Restante para dividir" (divisão) e "Restante a pagar" (fatura): rótulo e valor (verde; vermelho se passar do total)
    restante: "tw:flex tw:items-center tw:gap-2.5 tw:text-[15px] tw:font-[550]",
    restanteValor: "money tw:text-(--color-income) tw:font-[550] tw:[&.is-negative]:text-(--color-negative)",
    // campo que abre um menu (perfil, conta): mesma cara de um input, seta à direita
    campoMenu: "tw:inline-flex tw:items-center tw:justify-between tw:gap-2 tw:cursor-pointer tw:text-left tw:min-w-0 "
      + "tw:[&>.icon]:text-zz-secondary tw:[&>.icon]:flex-none",
    campoMenuVazio: "tw:text-zz-muted tw:truncate",
    // divisão entre perfis: nome, valor e percentual de cada parte
    dvNome: "tw:text-[15px] tw:font-[450]",
    dvValor: "tw:text-[15px] tw:font-[550] tw:text-right tw:m-0",
    dvPct: "tw:text-[15px] tw:font-[550] tw:text-left tw:w-[72px] tw:m-0",
    pontoCor: "ponto-cor tw:size-3.5 tw:rounded-[50%] tw:[border:0] tw:p-0 tw:bg-(--dot) tw:[box-shadow:0_0_0_3px_#fff,0_0_0_4px_var(--color-border)] tw:flex-none tw:cursor-pointer "
      + "tw:hover:[box-shadow:0_0_0_3px_#fff,0_0_0_4px_var(--color-primary)]",
    pontoCorMenu: "tw:p-1",
    iconeEscolha: "icon-pick tw:base:size-11 tw:base:grid tw:base:place-items-center tw:base:border tw:base:border-zz-border tw:base:rounded-lg tw:base:bg-(--color-background) "
      + "tw:base:text-[22px] tw:base:p-0 tw:base:leading-none tw:base:[font-family:'Segoe_UI_Emoji','Apple_Color_Emoji','Noto_Color_Emoji',var(--font-family)] "
      + "tw:base:hover:border-zz-border-strong",

    /* ---------- Painel da transação (pages/lancamento-painel.ts); lp-props e lp-notes-wrap: ganchos da animação de entrada ---------- */
    lp: "tw:flex tw:flex-col",
    lpTopo: "tw:grid tw:grid-cols-[minmax(0,1fr)_auto] tw:gap-4 tw:pb-4 tw:border-b tw:border-b-zz-border tw:-mx-(--page-gutter) tw:px-(--page-gutter) "
      + "tw:gaveta:grid-cols-[minmax(0,1fr)] tw:gaveta:gap-2",
    lpTopoEsquerda: "tw:flex tw:flex-col tw:gap-0.5 tw:min-w-0",
    lpTopoDireita: "tw:flex tw:flex-col tw:items-end tw:gap-1 tw:gaveta:flex-row-reverse tw:gaveta:items-center tw:gaveta:justify-between",
    lpData: LP_BOTAO_CINZA + " tw:self-start tw:h-6 tw:-ml-1.5 tw:whitespace-nowrap",
    lpConta: LP_BOTAO_CINZA + " tw:self-start tw:h-[26px] tw:-ml-1.5 tw:max-w-full tw:min-w-0 tw:[&>span:not(.lp-account-dot)]:min-w-0 tw:[&>span:not(.lp-account-dot)]:overflow-hidden "
      + "tw:[&>span:not(.lp-account-dot)]:text-ellipsis tw:[&>span:not(.lp-account-dot)]:whitespace-nowrap tw:[&>svg]:flex-none",
    lpContaPonto: "lp-account-dot tw:size-[9px] tw:rounded-[50%] tw:flex-none",
    lpContaLinha: "tw:inline-flex tw:items-center tw:gap-0.5 tw:min-w-0 tw:max-w-full",
    lpSub: LP_BOTAO + " tw:self-end tw:h-6 tw:-mr-1.5",
    lpNome: LP_CAMPO + " tw:-ml-[7px] tw:text-ellipsis tw:placeholder:text-zz-cinza",
    lpValor: LP_CAMPO + " tw:w-[170px] tw:text-right tw:-mr-[7px] tw:[&.money--income]:text-(--color-income) tw:gaveta:text-left",
    lpProps: "lp-props tw:flex tw:flex-col tw:gap-1 tw:py-3 tw:border-b tw:border-b-zz-border tw:-mx-(--page-gutter) tw:px-(--page-gutter)",
    lpProp: "tw:grid tw:grid-cols-[110px_minmax(0,1fr)] tw:items-center tw:min-h-[34px] tw:[&>:last-child]:justify-self-start",
    lpPropRotulo: "tw:text-zz-cinza tw:text-[15px] tw:font-[550]",
    lpMais: "tw:size-[26px] tw:inline-grid tw:place-items-center tw:p-0 tw:leading-0 tw:border tw:border-zz-border-strong tw:rounded-[50%] tw:bg-zz-surface "
      + "tw:text-zz-secondary tw:hover:border-zz-primary tw:hover:text-zz-primary tw:[&_.icon]:block tw:[&_.icon]:m-0",
    lpPilulaBotao: "lp-chip-btn tw:inline-flex tw:items-center tw:gap-1.5 tw:[border:0] tw:bg-transparent tw:p-0.5 tw:-ml-0.5 tw:rounded-(--radius-pill) tw:max-w-full "
      + "tw:min-w-0 tw:hover:[box-shadow:0_0_0_2px_var(--color-primary-soft)] tw:[&>.cat-pill]:min-w-0 tw:[&>.tag]:min-w-0",
    // Recorrência e Divisão: a própria pílula é o botão (24 px, maiúsculas, borda do "+"); começa na linha dos valores
    lpRec: "lp-chip-btn tw:inline-flex tw:items-center tw:max-w-full tw:min-w-0 tw:h-6 tw:pr-[9px] tw:pl-[5px] tw:py-0 tw:gap-[5px] tw:bg-zz-surface tw:text-zz-text "
      + "tw:border tw:border-zz-border-strong tw:rounded-(--radius-pill) tw:text-[11px] tw:font-[620] tw:tracking-[0.03em] tw:uppercase tw:whitespace-nowrap "
      + "tw:hover:border-zz-primary tw:[&_.icon]:text-zz-secondary",
    lpPilula: "tw:inline-flex tw:items-center tw:gap-0.5 tw:min-w-0 tw:max-w-full",
    lpNotasArea: "lp-notes-wrap tw:py-3 tw:border-b tw:border-b-zz-border tw:-mx-(--page-gutter) tw:px-(--page-gutter)",
    lpNotas: "tw:w-full tw:[border:0] tw:resize-none tw:bg-transparent tw:text-[15px] tw:font-[550] tw:leading-normal tw:py-1 tw:px-1.5 tw:-ml-1.5 tw:rounded-lg "
      + "tw:overflow-hidden tw:text-zz-text tw:placeholder:text-zz-cinza tw:outline-none tw:focus:[box-shadow:none]",
    lpSituacao: "tw:min-h-[18px] tw:pt-1.5 tw:text-[11.5px] tw:text-zz-muted",
    lpSituacaoOk: "tw:min-h-[18px] tw:pt-1.5 tw:text-[11.5px] tw:text-zz-positive",
    lpSituacaoErro: "tw:min-h-[18px] tw:pt-1.5 tw:text-[11.5px] tw:text-(--color-negative)",
    lpHistorico: "tw:pt-2",

    /* ---------- Lista de transações nos painéis (components/list.ts: ListaPainel) — "pl" fica como gancho ----------
       Uma grade só para a lista inteira (meses, dias e linhas em subgrid): título, letra (P/R/T…), ícone da categoria
       e valor ficam na mesma coluna em todas as linhas. Colunas: respiro | caixa | letra | título | categoria | valor | respiro */
    pl: "pl tw:grid tw:grid-cols-[var(--page-gutter)_18px_auto_minmax(0,1fr)_auto_auto_var(--page-gutter)] tw:-mx-(--page-gutter)",
    plMes: "tw:grid tw:grid-cols-subgrid tw:col-span-full tw:[&+&]:mt-4",
    plMesTopo: "tw:col-[2/-2] tw:flex tw:items-baseline tw:justify-between tw:gap-3 tw:pt-2",
    plMesTitulo: "tw:text-[.9375rem] tw:font-[620]",
    plMesTotal: "tw:inline-flex tw:items-baseline tw:gap-1.5 tw:text-[.9375rem] tw:font-[620] tw:[&_.money]:font-[620]",
    plMesParenteses: "money tw:text-zz-muted",
    plDia: "tw:col-[2/-2] tw:pt-3 tw:mt-0 tw:mb-4 tw:leading-[1.2] tw:text-zz-cinza tw:text-[.8125rem] tw:font-[620]",
    plLista: "tw:grid tw:grid-cols-subgrid tw:col-span-full",
    plLinha: "tw:group/pl tw:grid tw:grid-cols-subgrid tw:col-span-full tw:items-center tw:min-h-(--row-height) "
      + "tw:cursor-pointer tw:[transition:background_var(--duration-fast)_var(--easing)] tw:hover:bg-zz-surface-hover "
      + "tw:[&.is-checked]:bg-zz-primary-soft tw:focus-visible:outline-2 tw:focus-visible:outline-[var(--color-focus)] tw:focus-visible:-outline-offset-2",
    plCaixa: "tw:col-start-2 tw:mr-2.5 tw:opacity-55 tw:group-hover/pl:opacity-100 tw:group-[.is-checked]/pl:opacity-100",
    plLetra: "tw:col-start-3 tw:mr-2",
    plNome: "tw:col-start-4 tw:flex tw:items-center tw:gap-2 tw:min-w-0 tw:whitespace-nowrap tw:overflow-hidden",
    plTitulo: "tw:overflow-hidden tw:text-ellipsis tw:text-[.9375rem] tw:font-[450]",
    // o nome é o botão da linha (teclado e leitor de tela): sem aparência de botão
    plTituloBotao: "tw:min-w-0 tw:p-0 tw:[border:0] tw:bg-transparent tw:text-left tw:text-inherit tw:whitespace-nowrap tw:cursor-pointer tw:rounded-sm tw:focus-visible:outline-2 tw:focus-visible:outline-zz-primary tw:focus-visible:outline-offset-2",
    plCategoria: "tw:col-start-5 tw:ml-2.5 tw:min-w-7 tw:h-[22px] tw:px-1.5 tw:grid tw:place-items-center tw:rounded-(--radius-pill) "
      + "tw:bg-[color-mix(in_srgb,var(--tag-color)_18%,white)] tw:text-[12px] tw:leading-none tw:mr-0.5",
    plValor: "money tw:col-start-6 tw:ml-2.5 tw:justify-self-end tw:min-w-[72px] tw:text-right tw:text-[.9375rem] tw:font-[620] tw:whitespace-nowrap",

    /* ---------- Configurações (pages/perfil.ts e a seção do câmbio em components/cambio.ts) ----------
       [título / explicação ........ controle]; até 700 px o controle desce para a linha de baixo */
    cfgSecao: "tw:text-[15px] tw:font-[550] tw:pt-4 tw:pb-2 tw:mx-0 tw:mb-2 tw:border-b tw:border-zz-border tw:first:pt-0",
    cfgLinha: "tw:flex tw:items-center tw:justify-between tw:gap-5 tw:py-2.5 tw:ate700:flex-wrap",
    cfgLinhaBloco: "tw:flex tw:flex-col tw:items-stretch tw:justify-between tw:gap-2 tw:py-2.5 tw:ate700:flex-wrap",     // título em cima e os campos embaixo (Pix, senha)
    cfgTexto: "tw:flex tw:flex-col tw:gap-0.5 tw:min-w-0",
    cfgTitulo: "tw:text-[15px] tw:font-[450]",
    cfgSub: "tw:text-zz-secondary tw:text-[13px] tw:font-[450]",
    cfgDireita: "tw:flex tw:items-center tw:justify-end tw:gap-2 tw:flex-none tw:ate700:flex-[1_1_100%] tw:ate700:justify-start",

    /* ---------- Listas, título com menu e formulários das janelas ---------- */
    listaLinhas: "tw:flex tw:flex-col",
    // título do painel com o menu do tipo (transação, recorrência); "tipo-select" fica como gancho
    tipoSelecao: "tipo-select tw:inline-flex tw:items-center tw:gap-1.5 tw:h-8 tw:px-2.5 tw:py-0 tw:-ml-2.5 tw:[border:0] tw:rounded-lg tw:bg-transparent "
      + "tw:text-zz-text tw:text-[15px] tw:font-[620] tw:cursor-pointer tw:hover:bg-zz-surface-hover tw:[&.is-open]:bg-zz-surface-hover",
    tipoSelecaoFixo: "tipo-select tw:inline-flex tw:items-center tw:gap-1.5 tw:h-8 tw:px-2.5 tw:py-0 tw:-ml-2.5 tw:[border:0] tw:rounded-lg tw:bg-transparent "
      + "tw:text-zz-text tw:text-[15px] tw:font-[620] tw:cursor-default",
    linhaForm2: "tw:grid tw:gap-3 tw:grid-cols-[1fr_1fr]",
    linhaForm3: "tw:grid tw:gap-3 tw:grid-cols-[repeat(3,minmax(0,1fr))]",
    // Nova recorrência › frequência: opções de borda a borda da janela; freq-list__item fica como gancho (marcar a escolhida)
    freqLista: "tw:flex tw:flex-col tw:gap-0.5 tw:pb-2",
    freqItem: "freq-list__item tw:flex tw:items-center tw:gap-2.5 tw:min-h-9 tw:px-6 tw:-mx-6 tw:rounded-none tw:cursor-pointer tw:text-[15px] "
      + "tw:hover:bg-zz-surface-hover tw:[&.is-active]:bg-zz-primary-soft tw:[&.is-active]:text-zz-primary tw:[&.is-active]:font-medium",
    freqRadio: "tw:[accent-color:var(--color-primary)] tw:size-4 tw:m-0",
    parcelasPrevia: "tw:mt-1.5 tw:[font-variant-numeric:tabular-nums]",

    /* ---------- Bolinha, seta e contador da categoria (Categorias e Dashboard › Top categorias) ----------
       Base com especificidade zero: o tamanho de cada tela vence. category-row__caret fica como gancho (clique na linha do grupo) */
    catPonto: "tw:base:size-1.5 tw:base:rounded-[50%] tw:base:flex-none",
    catSeta: "category-row__caret tw:base:size-[22px] tw:base:grid tw:base:place-items-center tw:base:-ml-1.5 tw:base:p-0 tw:base:[border:0] tw:base:rounded-md "
      + "tw:base:bg-transparent tw:base:text-zz-secondary tw:base:hover:bg-zz-surface-hover tw:base:hover:text-zz-text",
    catContador: "tw:base:min-w-5 tw:base:h-5 tw:base:py-0 tw:base:px-1.5 tw:base:inline-grid tw:base:place-items-center tw:base:rounded-md "
      + "tw:base:bg-(--color-positive-soft) tw:base:text-(--color-positive) tw:base:text-[11.5px] tw:base:font-[600]",
    // categorias dentro de um grupo aberto (a animação de abrir/fechar fica em ui.ts: corpoArvore)
    arvoreGrupo: "tw:flex tw:flex-col",

    /* Ajustes das pílulas por contexto (telas e painéis que ainda montam as linhas com classes próprias) */
    ctxPilulasPainel: "tw:[&_.cat-pill]:font-[620] tw:[&_.cat-pill]:h-6 tw:[&_.tag]:text-[11px] tw:[&_.tag]:font-[620] tw:[&_.tag]:h-6",
    ctxPilulasDivisao: "tw:[&_.cat-pill]:font-[620] tw:[&_.tag]:text-[11px] tw:[&_.tag]:font-[620]",
    ctxPilulaLinha: "tw:[&_.cat-pill]:font-[620]",
    // Configurações: botões menores; "Apagar" com contorno (texto vermelho)
    ctxConfig: "tw:[&_.btn.btn]:text-[13px] tw:[&_.btn.btn]:font-[550] tw:[&_.input.input::placeholder]:text-[13px] tw:[&_.input.input::placeholder]:font-[550] tw:[&_.btn--danger-ghost]:bg-zz-surface tw:[&_.btn--danger-ghost]:border-zz-border-strong "
      + "tw:[&_.btn--danger-ghost]:text-(--color-danger) tw:[&_.btn--danger-ghost:hover]:bg-(--color-danger-soft)",
    ctxListaPix: "tw:[&_.select]:h-8 tw:[&_.input]:w-full",
    ctxInterruptorAjustado: "tw:[&_.toggle-linha]:w-auto",        // interruptor no canto direito da linha (Configurações)
    // fatura: cabeçalho roxo com o botão Fechar branco
    ctxCabecalhoFatura: "tw:[&_.icon-btn]:text-white tw:[&_.icon-btn:hover:not(:disabled)]:bg-(--sidebar-hover) tw:[&_.icon-btn:hover:not(:disabled)]:text-white "
      + "tw:[&_.icon-btn:active:not(:disabled)]:bg-(--sidebar-active) tw:[&_.icon-btn:focus-visible]:outline-2 tw:[&_.icon-btn:focus-visible]:outline-white "
      + "tw:[&_.icon-btn:focus-visible]:outline-offset-1",
    // seta → ao lado das pílulas no painel da transação
    setaVer: "tw:flex-none tw:size-6 tw:text-[var(--color-text-tertiary,var(--color-text-secondary))] tw:opacity-80 tw:hover:opacity-100 tw:hover:text-zz-text "
      + "tw:focus-visible:opacity-100 tw:focus-visible:text-zz-text",
    ctxIconeContaPequeno: "tw:[&_.account-icon]:size-6 tw:[&_.account-icon]:rounded-[50%] tw:[&_.account-icon_.icon]:size-[14px]",
  } as const;

  ZoZo.pecas = P;
  ZoZo.pecasFn = { botao, botaoIcone };
})(window.ZoZo);
