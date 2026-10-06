/* =============================================================
   ZoZo — Peças compartilhadas entre páginas
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h } = ZoZo.dom;
  const UI = ZoZo.ui;
  const F = ZoZo.format;

  /**
   * Retorna um nó de loading/erro enquanto as chaves não estão prontas,
   * ou null quando todas estão carregadas.
   */
  function estadoCarregamento(state, keys, onRetry, opts) {
    const erro = keys.map((k) => state.errors[k]).find(Boolean);
    const faltando = keys.some((k) => !state.data[k]);
    if (!faltando) return null;
    if (erro) return UI.ErrorState(erro, onRetry);
    return (opts && opts.skeleton) || UI.Skeleton(6);
  }

  function pagina(cls, ...children) {
    return h("div", { class: ["page", cls] }, ...children);
  }

  /** Bloco "valor / subtítulo" usado nos cards de resumo */
  function valorResumo(valor, subtitulo, align) {
    return h("div", { class: ["summary__figure", "summary__figure--" + align] },
      h("span", { class: "summary__value money" }, typeof valor === "string" ? valor : F.moeda(valor)),
      h("span", { class: "summary__label" }, subtitulo));
  }

  /** Card Esquerda | Donut | Direita (Categorias e Recorrências) */
  function cardResumoDonut(cfg) {
    const donut = h("div", { class: "summary__donut" });
    ZoZo.charts.renderDonutChart(donut, cfg.segmentos, { ariaLabel: cfg.ariaLabel, size: 108, thickness: 15, onClick: cfg.onClick, progresso: cfg.progresso, corProgresso: cfg.corProgresso, tituloProgresso: cfg.tituloProgresso });
    return h("section", { class: "card summary", "aria-label": cfg.ariaLabel },
      valorResumo(cfg.esquerda.valor, cfg.esquerda.label, "right"),
      donut,
      valorResumo(cfg.direita.texto !== undefined ? cfg.direita.texto : cfg.direita.valor, cfg.direita.label, "left"));
  }

  /** Agrupa itens por categoria para o donut (cor da categoria) */
  function segmentosPorCategoria(itens, campoValor) {
    const mapa = new Map();
    itens.forEach((it) => {
      const c = it.categoria || { nome: it.nome, cor: it.cor };
      if (!c || !c.nome) return;
      const atual = mapa.get(c.nome) || { label: c.nome, cor: c.cor, valor: 0 };
      atual.valor += F.numero(it[campoValor]);
      mapa.set(c.nome, atual);
    });
    return Array.from(mapa.values()).sort((a, b) => b.valor - a.valor);
  }

  /** Linha de detalhe "rótulo ...... valor" no painel direito */
  function detalheLinha(rotulo, valor, cls) {
    return h("div", { class: ["detail-line", cls] }, h("span", { class: "detail-line__label" }, rotulo), h("span", { class: "detail-line__value" }, valor));
  }

  function detalheSecao(titulo, ...children) {
    return h("section", { class: "detail-section" }, titulo ? h("h3", { class: "detail-section__title" }, titulo) : null, ...children);
  }

  ZoZo.pagesComum = { estadoCarregamento, pagina, valorResumo, cardResumoDonut, segmentosPorCategoria, detalheLinha, detalheSecao };
})(window.ZoZo);
