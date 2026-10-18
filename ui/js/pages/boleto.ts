/* =============================================================
   ZoZo — Criação de fatura (antigo "boleto", seção 49)
   Editor · lista de transações · contribuições, descontos e
   arredondamentos · resumo · pré-visualização A4 · impressão
   (os nomes internos ZoZo.boleto / getBoletoData continuam)
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const LOGO_FATURA = "assets/img/zozo-fatura.svg";
  const { h, mount, clear } = ZoZo.dom;
  const UI = ZoZo.ui;
  const F = ZoZo.format;
  const A = ZoZo.messages.ACTIONS;
  const R = () => ZoZo.regras.boleto;

  let atual: { close(): void; carregar(): void } | null = null; // instância aberta

  /* ---------------- Classes (Tailwind) ----------------
     Ficam como ganchos da impressão (css/print.css): boleto, boleto__header, boleto__editor, boleto__body,
     boleto__preview, paper-scaler, paper, doc, doc__table, doc__block-title, doc__rodape, doc__pix, boleto-summary--doc */
  const SECAO = "tw:py-4 tw:px-0 tw:flex tw:flex-col tw:[&+&]:border-t tw:[&+&]:border-t-zz-border";
  const TD = "tw:[&_tr]:break-inside-avoid tw:[&_td]:border-b tw:[&_td]:border-b-zz-border tw:[&_td]:align-top";
  const NUM = "tw:text-right! tw:[font-variant-numeric:lining-nums_proportional-nums] tw:whitespace-nowrap";
  const LINHA_DOC = "tw:m-0 tw:text-[15px] tw:leading-[1.3] tw:text-zz-text tw:tracking-[0.02em]";
  const TOTAL = "tw:flex tw:justify-between tw:items-baseline tw:mt-2 tw:pt-3 tw:font-[600] "
    + "tw:[&_strong]:text-[24px] tw:[&_strong]:text-[#6948D8] tw:[&_strong]:tracking-[-0.02em]";
  const T = {
    // janela em tela cheia: entra subindo um pouco (sem movimento com "reduzir movimento")
    janela: "boleto tw:fixed tw:inset-0 tw:z-60 tw:grid tw:grid-rows-[var(--topbar-height)_minmax(0,1fr)] tw:bg-(--color-background) tw:opacity-0 "
      + "tw:[transform:translateY(16px)_scale(0.99)] tw:[transition:opacity_var(--duration-medium)_var(--easing),transform_var(--duration-medium)_var(--easing)] "
      + "tw:[&.is-open]:opacity-100 tw:[&.is-open]:[transform:none] tw:motion-reduce:[transform:none] tw:motion-reduce:[transition:opacity_120ms_linear]",
    cabecalho: "boleto__header tw:flex tw:items-center tw:justify-between tw:py-0 tw:pr-4 tw:pl-6 tw:bg-[#6948D8] tw:text-(--color-on-primary) "
      + "tw:border-b tw:border-b-zz-border tw:[box-shadow:none] tw:[&_:focus-visible]:outline-white",
    // editor à esquerda e a folha A4 à direita; até 900 px um embaixo do outro, com uma rolagem só
    corpo: "boleto__body tw:grid tw:grid-cols-[var(--boleto-editor-width)_minmax(0,1fr)] tw:min-h-0 "
      + "tw:estreito:grid-cols-[minmax(0,1fr)] tw:estreito:auto-rows-max tw:estreito:overflow-y-auto",
    editor: "boleto__editor tw:overflow-y-auto tw:bg-zz-surface tw:border-r tw:border-r-zz-border tw:pt-2 tw:px-6 tw:pb-6 "
      + "tw:estreito:overflow-visible tw:estreito:max-h-none tw:estreito:border-r-0",
    secao: SECAO + " tw:gap-3",
    secaoResumo: SECAO + " tw:gap-4 tw:[&>[hidden]]:hidden",
    secaoTitulo: "tw:flex tw:items-center tw:gap-2 tw:text-[15px] tw:font-[600]",
    contador: "tw:not-empty:min-w-[22px] tw:not-empty:h-5 tw:not-empty:px-1.5 tw:not-empty:inline-grid tw:not-empty:place-items-center tw:not-empty:rounded-(--radius-pill) "
      + "tw:not-empty:bg-zz-primary-soft tw:not-empty:text-zz-primary tw:not-empty:text-[11.5px]",
    periodo: "tw:grid tw:gap-3 tw:grid-cols-[1.4fr_1fr]",
    avisoPix: "tw:mt-2 tw:mx-0 tw:mb-0 tw:text-[13px] tw:text-zz-secondary tw:empty:hidden",
    // lista de transações do editor
    lista: "tw:max-h-[260px] tw:overflow-y-auto tw:-mx-2 tw:my-0",
    item: "tw:grid tw:grid-cols-[46px_minmax(0,1fr)_auto_auto] tw:gap-3 tw:items-center tw:min-h-8 tw:py-0 tw:px-2 tw:text-[13px] "
      + "tw:odd:bg-(--color-background) tw:odd:rounded-md",
    itemData: "tw:text-zz-secondary tw:[font-variant-numeric:lining-nums_proportional-nums] tw:uppercase",
    itemDesc: "tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:flex tw:items-baseline tw:gap-1.5 tw:min-w-0",
    itemDigitos: "tw:flex-none tw:text-zz-secondary tw:[font-variant-numeric:lining-nums_tabular-nums]",
    itemNome: "tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap",
    itemParcela: "tw:text-zz-secondary tw:[font-variant-numeric:lining-nums_tabular-nums]",
    // contribuições, descontos e arredondamentos
    ajustes: "tw:flex tw:flex-col tw:gap-2 tw:items-start",
    ajustesLista: "tw:flex tw:flex-col tw:gap-2 tw:w-full",
    ajustesLinha: "tw:grid tw:grid-cols-[minmax(0,1fr)_132px_32px] tw:gap-2 tw:items-center tw:w-full",
    // resumo (editor) e o do documento
    resumo: "tw:flex tw:flex-col tw:gap-1",
    resumoDoc: "boleto-summary--doc tw:flex tw:flex-col tw:gap-1 tw:w-[320px] tw:ml-auto tw:text-[13px] tw:break-inside-avoid",
    resumoLinha: "tw:flex tw:justify-between tw:text-zz-secondary tw:min-h-[26px] tw:items-center tw:[&_.money]:text-zz-text",
    resumoTotal: TOTAL + " tw:border-t tw:border-t-zz-border-strong",
    resumoTotalDoc: TOTAL + " tw:border-t-2 tw:border-t-zz-text",
    // pré-visualização: folha A4 (794 × 1123 px) sobre fundo cinza
    previa: "boleto__preview tw:overflow-auto tw:p-8 tw:bg-[#e9eaef] tw:estreito:overflow-visible tw:estreito:p-4",
    escala: "paper-scaler tw:w-[794px] tw:mx-auto tw:my-0",
    papel: "paper tw:w-[794px] tw:min-h-[1123px] tw:py-16 tw:px-[68px] tw:bg-white tw:[box-shadow:var(--shadow-paper)] tw:text-zz-text",
    // documento
    doc: "doc tw:flex tw:flex-col tw:gap-7 tw:text-[13px]",
    docTopo: "tw:flex tw:justify-between tw:items-center tw:pb-5 tw:border-b-[3px] tw:border-b-[#6948D8]",
    docMarca: "tw:flex tw:items-center tw:gap-2 tw:font-[600] tw:text-[15px]",
    docLogo: "tw:size-11 tw:block tw:rounded-[10px] tw:[box-shadow:none]",
    docTitulo: "tw:text-right tw:flex tw:flex-col tw:gap-1",
    docPerfil: LINHA_DOC + " tw:font-[620]",
    docFatura: LINHA_DOC,
    docFaturaRotulo: "tw:font-[620]",
    docFaturaData: "tw:font-[400]",
    docBlocoTitulo: "doc__block-title tw:text-[13px] tw:font-[600] tw:mb-2",
    docTabelaAjuste: "doc__table tw:w-full tw:border-collapse " + TD + " tw:[&_td]:py-[7px] tw:[&_td]:px-2 tw:[&_td:first-child]:text-zz-text",
    docTabelaTransacoes: "doc__table tw:w-full tw:border-collapse " + TD + " tw:[&_td]:py-2 tw:[&_td]:px-1.5",
    docNum: NUM,
    docNumTransacao: NUM + " tw:w-[120px]",
    docData: "tw:whitespace-nowrap tw:text-zz-secondary tw:[font-variant-numeric:lining-nums_proportional-nums] tw:w-16 tw:uppercase tw:font-[400]",
    docDesc: "tw:w-auto",
    docDigitos: "tw:mr-1.5 tw:font-[400] tw:text-zz-secondary tw:[font-variant-numeric:lining-nums_tabular-nums]",
    docNome: "tw:text-zz-text",
    docParcela: "tw:w-14 tw:text-right tw:whitespace-nowrap tw:text-zz-secondary tw:[font-variant-numeric:lining-nums_tabular-nums]",
    docVazio: "tw:text-zz-muted tw:py-2 tw:px-0",
    // rodapé: Pix à esquerda e o resumo à direita
    docRodape: "doc__rodape tw:flex tw:justify-between tw:items-end tw:gap-6 tw:break-inside-avoid",
    docPix: "doc__pix tw:flex tw:justify-start tw:items-start tw:gap-3 tw:m-0 tw:break-inside-avoid tw:[&>.qr]:flex-none",
    docPixTexto: "tw:mt-0.5 tw:mx-0 tw:mb-0 tw:max-w-[150px] tw:text-left tw:text-[12px] tw:font-[620] tw:leading-[1.35] tw:text-[#6948D8]",
  };

  /* ---------------- Cálculo (regras configuráveis em js/config/regras.ts) ---------------- */
  function sinalDoTipo(tipo: any) {
    const s = R().sinalPorTipo[tipo];
    return s === undefined ? 1 : s;
  }
  const r2 = (n: any) => Math.round(n * 100) / 100;
  function calcular(st: any) {
    // Soma em CENTAVOS inteiros: cada linha é arredondada antes de somar (o total confere com as linhas exibidas)
    const c = (v: any) => Math.round(F.numero(v) * 100);
    const lanc = (st.lancamentos || []).reduce((s: any, l: any) => s + c(l.valor) * sinalDoTipo(l.tipo), 0);
    const contrib = (st.contribuicoes || []).reduce((s: any, d: any) => s + Math.abs(c(d.valor)), 0) * R().sinalContribuicao;
    const desc = st.descontos.reduce((s: any, d: any) => s + Math.abs(c(d.valor)), 0) * R().sinalDesconto;
    const arr = st.arredondamentos.reduce((s: any, d: any) => s + c(d.valor), 0) * R().sinalArredondamento;
    return { lancamentos: lanc / 100, contribuicoes: contrib / 100, descontos: desc / 100, arredondamentos: arr / 100, total: (lanc + contrib + desc + arr) / 100 };
  }

  /** Valor com sinal explícito para o resumo e o documento */
  function comSinal(n: any) {
    const v = F.numero(n);
    return (v < 0 ? "− " : "") + F.moeda(v);
  }

  /* ---------------- Formatos da fatura ---------------- */
  const maiusculas = (t: any) => String(t || "").toLocaleUpperCase("pt-BR");
  /** 13 OUT */
  const diaMes = (iso: any) => maiusculas(F.dataCurta(iso));
  /** 13 OUT 2026 */
  function diaMesAno(iso: any) {
    const d = F.parseData(iso);
    return d ? maiusculas(F.dataCurta(iso) + " " + d.getFullYear()) : "";
  }
  const parcela = (l: any) => (l.parcelaTotal ? l.parcelaAtual + "/" + l.parcelaTotal : "");

  /** Os dados na tela correspondem exatamente ao perfil e ao período escolhidos? (pode imprimir/copiar Pix) */
  const invalido = (st: any) => [st.contribuicoes, st.descontos, st.arredondamentos].some((l) => (l || []).some((x: any) => x.invalido));
  const pronto = (st: any) => !!(st.perfilId && st.lancamentos && !st.carregando && !st.erro && st.carregadoPara === chaveFiltro(st) && !invalido(st));
  const chaveFiltro = (st: any) => st.perfilId + "|" + st.ano + "-" + st.mes;

  /* ---------------- Lista de transações (editor) ---------------- */
  function ListaTransacoes(st: any) {
    if (st.carregando) return UI.Skeleton(4, { short: true });
    if (st.erro) return UI.ErrorState(st.erro, () => { if (atual) atual.carregar(); });
    if (!st.perfilId) return UI.EmptyState("Selecione um perfil.", { icon: "perfil", class: "tw:min-h-[90px]! tw:p-4!" });
    if (!st.lancamentos || !st.lancamentos.length) return UI.EmptyState("Nenhuma transação de cartão de crédito ou empréstimo deste perfil no período.", { icon: "lancamentos", class: "tw:min-h-[90px]! tw:p-4!" });
    return h("ul", null, st.lancamentos.map((l: any) => h("li", { class: T.item },
      h("span", { class: T.itemData }, diaMes(l.data)),
      h("span", { class: T.itemDesc },
        l.ultimos4Digitos ? h("span", { class: T.itemDigitos }, l.ultimos4Digitos) : null,
        h("span", { class: T.itemNome }, l.descricao)),
      h("span", { class: T.itemParcela }, parcela(l)),
      h("span", { class: ["money", sinalDoTipo(l.tipo) < 0 && "money--income"] }, comSinal(F.numero(l.valor) * sinalDoTipo(l.tipo))))));
  }

  /* ---------------- Contribuições / descontos / arredondamentos ---------------- */
  function Ajustes(lista: any, cfg: any) {
    const wrap = h("div", { class: T.ajustes });
    const desenhar = () => {
      mount(wrap,
        lista.length ? h("div", { class: T.ajustesLista }, lista.map((item: any, i: any) => {
          const desc = UI.Input({ value: item.descricao, placeholder: "Nome", maxlength: String(ZoZo.regras.limiteNome) });
          desc.setAttribute("aria-label", cfg.rotulo + " " + (i + 1) + ": nome");
          desc.dataset.fk = cfg.chave + ":d:" + item.id;
          const valor = UI.Input({ value: item.valorTexto || "", placeholder: "0,00", inputmode: "decimal" });
          valor.setAttribute("aria-label", cfg.rotulo + " " + (i + 1) + ": valor");
          desc.addEventListener("input", () => { item.descricao = desc.value; cfg.onChange(); });
          valor.addEventListener("input", () => {
            item.valorTexto = valor.value;
            const n = F.parseMoeda(valor.value);
            const ok = Number.isFinite(n) && Math.abs(n) < 1e12;
            // em centavos: o que aparece em cada linha é exatamente o que entra no total
            item.valor = ok ? r2(cfg.aceitaNegativo ? n : Math.abs(n)) : 0;
            item.invalido = valor.value.trim() !== "" && !ok;            // valor inválido bloqueia imprimir e o Pix
            if (item.invalido) valor.setAttribute("aria-invalid", "true"); else valor.removeAttribute("aria-invalid");
            cfg.onChange();
          });
          return h("div", { class: T.ajustesLinha },
            desc,
            h("div", { class: ZoZo.pecas.afixoPequeno }, h("span", { class: ZoZo.pecas.prefixo, "aria-hidden": "true" }, cfg.prefixo), valor),
            UI.IconButton("excluir", "Excluir " + cfg.rotulo.toLowerCase(), { class: "icon-btn--danger", onClick: () => { lista.splice(i, 1); desenhar(); cfg.onChange(); } }));
        })) : null,
        UI.Button(cfg.adicionar, { variant: "text", size: "sm", icon: "mais", onClick: () => {
          const novo = { id: crypto.randomUUID(), descricao: "", valor: 0, valorTexto: "" };
          lista.push(novo); desenhar(); cfg.onChange();
          requestAnimationFrame(() => { const el = wrap.querySelector<HTMLElement>('[data-fk="' + cfg.chave + ":d:" + novo.id + '"]'); if (el) el.focus(); });
        } }));
    };
    desenhar();
    return wrap;
  }

  /* ---------------- Resumo (editor e documento) ---------------- */
  function Resumo(st: any, opts?: any) {
    const t = calcular(st);
    const o = opts || {};
    const linha = (rotulo: any, valor: any) => h("div", { class: T.resumoLinha }, h("span", null, rotulo), h("span", { class: "money" }, comSinal(valor)));
    return h("div", { class: o.doc ? T.resumoDoc : T.resumo },
      linha("Total das transações", t.lancamentos),
      linha("Contribuições", t.contribuicoes),
      linha("Descontos", t.descontos),
      linha("Arredondamentos", t.arredondamentos),
      h("div", { class: o.doc ? T.resumoTotalDoc : T.resumoTotal }, h("span", null, "Total a pagar"), h("strong", { class: "money" }, comSinal(t.total))));
  }

  /* ---------------- Pix (QR code no canto inferior esquerdo, ao lado do resumo) ----------------
     Cada desenho gera um código NOVO (TxID aleatório): muda ao trocar perfil, mês, ano,
     valor, ou ao fechar e abrir de novo. O texto do QR fica em st.pixCodigo (botão "copiar").
     Só existe com os dados prontos: nunca há Pix de um total antigo com um perfil/período novo. */
  function FaturaPix(st: any) {
    st.pixCodigo = null;
    const t = calcular(st);
    if (!pronto(st) || !st.pix || !(t.total > 0)) return null;
    const codigo = ZoZo.pix.payload({ chave: st.pix.chave, nome: st.pix.nome, cidade: st.pix.cidade, valor: t.total });
    if (!codigo) return null;
    st.pixCodigo = codigo;
    return h("section", { class: T.docPix, "aria-label": "Pagamento por Pix" },
      ZoZo.verificacao.QR(codigo, 132, "Código QR do Pix para pagar " + F.moeda(t.total)),
      h("p", { class: T.docPixTexto }, "Leia o QR no celular e pague por Pix"));
  }

  /* ---------------- Pré-visualização (documento A4) ---------------- */
  function Documento(st: any) {
    const ok = pronto(st);
    // valor(x): como o item entra no total (contribuição/desconto sempre pelo valor absoluto)
    const ajustes = (titulo: any, lista: any, valor: any) => {
      const validos = lista.filter((x: any) => x.descricao.trim() || F.numero(x.valor));
      if (!validos.length) return null;
      return h("section", null,
        h("h3", { class: T.docBlocoTitulo }, titulo),
        h("table", { class: T.docTabelaAjuste }, h("tbody", null, validos.map((x: any) => h("tr", null,
          h("td", null, x.descricao.trim() || titulo.replace(/ões$/, "ão").replace(/s$/, "")),
          h("td", { class: T.docNum }, comSinal(valor(x))))))));
    };
    const transacoes = ok && st.lancamentos.length
      ? h("table", { class: T.docTabelaTransacoes },
        h("tbody", null, st.lancamentos.map((l: any) => h("tr", null,
          h("td", { class: T.docData }, diaMes(l.data)),
          h("td", { class: T.docDesc },
            l.ultimos4Digitos ? h("span", { class: T.docDigitos }, l.ultimos4Digitos) : null,
            h("span", { class: T.docNome }, l.descricao)),
          h("td", { class: T.docParcela }, parcela(l)),
          h("td", { class: T.docNumTransacao }, comSinal(F.numero(l.valor) * sinalDoTipo(l.tipo)))))))
      : h("p", { class: T.docVazio }, !st.perfilId ? "Selecione um perfil." : ok ? "Nenhuma transação no período." : "Carregando as transações…");

    return h("article", { class: T.doc, "aria-label": "Pré-visualização da fatura", "aria-busy": ok ? "false" : "true" },
      h("header", { class: T.docTopo },
        h("div", { class: T.docMarca }, h("img", { class: T.docLogo, src: LOGO_FATURA, alt: "ZoZo", width: "44", height: "44", decoding: "sync" })),
        h("div", { class: T.docTitulo },
          h("p", { class: T.docPerfil }, maiusculas(st.perfil ? st.perfil.nome : "—")),
          h("p", { class: T.docFatura }, h("span", { class: T.docFaturaRotulo }, "FATURA"), " ", h("span", { class: T.docFaturaData }, diaMesAno(st.dataFatura))))),
      h("section", null, h("h3", { class: T.docBlocoTitulo }, "Transações"), transacoes),
      ajustes("Contribuições", st.contribuicoes, (x: any) => Math.abs(F.numero(x.valor)) * R().sinalContribuicao),
      ajustes("Descontos", st.descontos, (x: any) => Math.abs(F.numero(x.valor)) * R().sinalDesconto),
      ajustes("Arredondamentos", st.arredondamentos, (x: any) => F.numero(x.valor) * R().sinalArredondamento),
      h("div", { class: T.docRodape }, FaturaPix(st), Resumo(st, { doc: true })));
  }

  /* ---------------- Impressão ----------------
     Impressão do navegador ("Salvar como PDF"). O documento é montado só com
     nós de texto (sem HTML vindo dos dados) e a página não carrega nada externo,
     então o PDF contém apenas o que aparece na pré-visualização. Enquanto os dados
     não correspondem ao perfil/período escolhidos, o documento não é impresso
     (nem pelo Ctrl+P: veja print.css, .doc[aria-busy="true"]).
     O título da página vira o nome sugerido do arquivo (sem caracteres inválidos). */
  function imprimirDocumento(st: any) {
    const titulo = ("Fatura " + (st.perfil ? st.perfil.nome : "") + " " + F.mesNome(st.mes - 1) + " " + st.ano)
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim().slice(0, 120);
    const tituloAnterior = document.title;
    const fim = () => {
      document.body.classList.remove("is-printing-boleto");
      document.title = tituloAnterior;
      window.removeEventListener("afterprint", fim);
    };
    document.title = titulo;
    document.body.classList.add("is-printing-boleto");
    window.addEventListener("afterprint", fim);
    window.print();
  }

  /* ---------------- Editor (janela em tela cheia) ---------------- */
  function open(ctx: ContextoApp, opts: any) {
    if (atual) return;
    // Fatura: só contas com o recurso (o serviço de dados também recusa os dados da fatura)
    if (!ZoZo.recursos.boleto() || !ZoZo.recursos.perfis()) { ctx.toast(ZoZo.messages.FRIENDLY.FEATURE_UNAVAILABLE, { tone: "error" }); return; }
    const o = opts || {};
    const hoje = new Date();
    const st: any = {
      perfilId: o.perfilId || "", perfil: null, mes: hoje.getMonth() + 1, ano: hoje.getFullYear(), dataFatura: F.iso(hoje),
      lancamentos: null, carregadoPara: null, carregando: false, erro: null,
      contribuicoes: [], descontos: [], arredondamentos: [], pix: null, pixCodigo: null,
    };
    const root = document.getElementById("boleto-root") || document.body;
    const shell = document.getElementById("shell");
    const anterior = document.activeElement as HTMLElement | null;
    let token = 0;

    const listaEl = h("div", { class: T.lista });
    const resumoEl = h("div");
    const docEl = h("div", { class: T.papel });
    const contadorEl = h("span", { class: T.contador });

    const avisoPix = h("p", { class: T.avisoPix });
    const copiarPix = UI.Button("Copiar Pix copia e cola", { size: "sm", variant: "secondary", icon: "copiar", class: "btn--block",
      onClick: (e) => { const b = e.currentTarget as HTMLElement; if (pronto(st) && st.pixCodigo) navigator.clipboard.writeText(st.pixCodigo).then(() => UI.confirmarNoBotao(b, "Código Pix copiado"), () => ctx.toast("Não foi possível copiar.", { tone: "error" })); } });
    const imprimirBtn = UI.Button("Imprimir", { variant: "primary", icon: "imprimir", class: "btn--block", onClick: () => imprimir() });

    function atualizarResumo() {
      mount(resumoEl, Resumo(st));
      mount(docEl, Documento(st));
      copiarPix.hidden = !st.pixCodigo;
      imprimirBtn.disabled = !pronto(st);
      avisoPix.textContent = invalido(st) ? "Corrija o valor marcado em vermelho para imprimir a fatura."
        : pronto(st) && !st.pix ? "Para incluir o QR code Pix, cadastre sua chave em Configurações › Geral › Pix." : "";
    }
    function atualizarLista() {
      contadorEl.textContent = st.lancamentos && !st.carregando ? String(st.lancamentos.length) : "";
      mount(listaEl, ListaTransacoes(st));
      atualizarResumo();
    }
    function carregar() {
      const meu = ++token;
      // Trocou perfil ou período: a fatura anterior sai na hora (nada de dados antigos com filtros novos)
      st.lancamentos = null; st.carregadoPara = null; st.pixCodigo = null;
      if (!st.perfilId) { st.perfil = null; st.erro = null; st.carregando = false; atualizarLista(); return; }
      const chave = chaveFiltro(st);
      st.carregando = true; st.erro = null; atualizarLista();
      ctx.bridge.request(A.getBoletoData, { perfilId: st.perfilId, mes: st.mes, ano: st.ano }).then((d: any) => {
        if (meu !== token || chave !== chaveFiltro(st)) return;
        st.carregando = false; st.lancamentos = d.lancamentos || []; st.perfil = d.perfil || st.perfil; st.pix = d.pix || null;
        st.carregadoPara = chave;
        atualizarLista();
      }).catch((e: any) => {
        if (meu !== token) return;
        st.carregando = false; st.erro = e.friendly; st.lancamentos = null; atualizarLista();
      });
    }

    // Campos Perfil, Período e Data da fatura
    const perfisData = ZoZo.store.get().data.perfis;
    const perfilSel = UI.Select([], { name: "perfil" });
    const preencherPerfis = (lista: any) => {
      clear(perfilSel);
      perfilSel.appendChild(h("option", { value: "" }, "Selecione o perfil"));
      lista.forEach((p: any) => perfilSel.appendChild(h("option", { value: p.id }, p.nome)));
      perfilSel.value = st.perfilId;
      st.perfil = lista.find((p: any) => p.id === st.perfilId) || null;
    };
    let perfis = (perfisData && perfisData.perfis) || [];
    preencherPerfis(perfis);
    if (!perfisData) ctx.loadData("perfis", A.getPerfis).then((d: any) => { perfis = d.perfis || []; preencherPerfis(perfis); carregar(); }).catch(() => null);
    perfilSel.addEventListener("change", () => { st.perfilId = perfilSel.value; st.perfil = perfis.find((p: any) => p.id === st.perfilId) || null; carregar(); });

    const mesSel = UI.Select(F.MESES.map((m, i) => ({ value: String(i + 1), label: m })), { value: String(st.mes), ariaLabel: "Mês" });
    const anos = [];
    for (let a = hoje.getFullYear() - 4; a <= hoje.getFullYear() + 1; a++) anos.push({ value: String(a), label: String(a) });
    const anoSel = UI.Select(anos, { value: String(st.ano), ariaLabel: "Ano" });
    mesSel.addEventListener("change", () => { st.mes = Number(mesSel.value); carregar(); });
    anoSel.addEventListener("change", () => { st.ano = Number(anoSel.value); carregar(); });
    const periodoId = ZoZo.dom.id("periodo");
    mesSel.id = periodoId;
    const dataInput = ZoZo.calendario.Campo({ valor: st.dataFatura, rotulo: "Data da fatura",
      aoMudar: (v) => { if (F.parseData(v)) { st.dataFatura = v; atualizarResumo(); } } });

    function imprimir() {
      if (!st.perfilId) { ctx.toast("Selecione um perfil para imprimir.", { tone: "error" }); perfilSel.focus(); return; }
      if (invalido(st)) { ctx.toast("Há um valor inválido nos ajustes da fatura.", { tone: "error" }); return; }
      if (!pronto(st)) { ctx.toast("Espere as transações carregarem para imprimir.", { tone: "error" }); return; }
      imprimirDocumento(st);
    }

    const secaoAjuste = (titulo: any, lista: any, cfg: any) => h("section", { class: T.secao },
      h("h3", { class: T.secaoTitulo }, titulo), Ajustes(lista, Object.assign({ onChange: atualizarResumo }, cfg)));

    const editor = h("div", { class: T.editor },
      h("section", { class: T.secao },
        UI.Field("Perfil", perfilSel),
        h("div", { class: ZoZo.pecas.campo }, h("label", { class: ZoZo.pecas.campoRotulo, for: periodoId }, "Período"), h("div", { class: T.periodo }, mesSel, anoSel)),
        UI.Field("Data da fatura", dataInput)),
      h("section", { class: T.secao },
        h("h3", { class: T.secaoTitulo }, "Transações", contadorEl),
        listaEl),
      secaoAjuste("Contribuições", st.contribuicoes, { chave: "contrib", rotulo: "Contribuição", adicionar: "Adicionar contribuição", prefixo: F.simbolo(), aceitaNegativo: false }),
      secaoAjuste("Descontos", st.descontos, { chave: "desc", rotulo: "Desconto", adicionar: "Adicionar desconto", prefixo: "− " + F.simbolo(), aceitaNegativo: false }),
      secaoAjuste("Arredondamentos", st.arredondamentos, { chave: "arr", rotulo: "Arredondamento", adicionar: "Adicionar arredondamento", prefixo: F.simbolo(), aceitaNegativo: R().arredondamentoAceitaNegativo }),
      h("section", { class: T.secaoResumo }, resumoEl, avisoPix, copiarPix, imprimirBtn));

    const preview = h("div", { class: T.previa }, h("div", { class: T.escala }, docEl));

    const el = h("div", { class: T.janela, role: "dialog", "aria-modal": "true", "aria-labelledby": "boleto-titulo" },
      h("header", { class: [T.cabecalho, ZoZo.pecas.ctxCabecalhoFatura] },
        h("h1", { class: ZoZo.estrutura.barraTitulo, id: "boleto-titulo" }, "Criar fatura"),
        h("div", { class: ZoZo.estrutura.barraAcoes },
          UI.IconButton("fechar", "Fechar", { onPrimary: true, onClick: () => close() }))),
      h("div", { class: T.corpo }, editor, preview));

    mount(root, el);
    document.body.classList.add("has-boleto");
    if (shell) shell.inert = true;               // o fundo não recebe foco nem cliques enquanto a fatura está aberta
    void el.offsetWidth;                         // garante o estado inicial antes da transição de entrada
    requestAnimationFrame(() => { el.classList.add("is-open"); perfilSel.focus(); });

    // Ajuste de escala do papel A4 à área disponível
    const scaler = preview.firstElementChild as HTMLElement | null;
    const ro = new ResizeObserver(() => {
      // a folha A4 inteira sempre cabe na área (telas pequenas: até 25%)
      const largura = preview.clientWidth - (preview.clientWidth < 600 ? 32 : 64);
      if (scaler) scaler.style.zoom = String(Math.min(1, Math.max(0.25, largura / 794)));
    });
    ro.observe(preview);

    const tecla = (e: any) => {
      if (e.key === "Escape" && !document.querySelector(".modal-overlay, .menu, .emoji-pop.is-aberto")) { e.preventDefault(); close(); }
    };
    document.addEventListener("keydown", tecla);

    atual = {
      carregar,
      close() {
        ro.disconnect();
        document.removeEventListener("keydown", tecla);
        document.body.classList.remove("has-boleto", "is-printing-boleto");
        if (shell) shell.inert = false;
        // saída suave: a fatura some e desce um pouco; só esta folha é removida (outra pode ter sido aberta)
        el.classList.remove("is-open");
        el.inert = true;
        setTimeout(() => el.remove(), 280);
        atual = null;
        if (anterior && anterior.isConnected) anterior.focus();
      },
    };
    carregar();
  }

  function close() { if (atual) atual.close(); }

  /* O logo da fatura é baixado assim que a sessão de uma conta com faturas abre (fica no cache):
     ao gerar a fatura ele já aparece na hora, em vez de surgir depois do resto. */
  let logoPronto: HTMLImageElement | null = null;
  ZoZo.store.subscribe((st) => {
    if (logoPronto || !st.session.authenticated || !ZoZo.recursos.boleto()) return;
    logoPronto = new Image();
    logoPronto.decoding = "async";
    logoPronto.src = LOGO_FATURA;
  });

  ZoZo.boleto = { open, close, calcular };
})(window.ZoZo);
