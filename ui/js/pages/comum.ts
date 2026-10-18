/* =============================================================
   ZoZo — Peças compartilhadas entre páginas
   TypeScript: tipos em src/globais.d.ts (ZoZoPagesComum).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const { h } = ZoZo.dom;
  const UI = ZoZo.ui;
  const F = ZoZo.format;

  /**
   * Retorna um nó de loading/erro enquanto as chaves não estão prontas,
   * ou null quando todas estão carregadas.
   */
  function estadoCarregamento(state: EstadoZoZo, keys: string[], onRetry: () => void, opts?: { skeleton?: HTMLElement }): HTMLElement | null {
    const erro = keys.map((k) => state.errors[k]).find(Boolean);
    const faltando = keys.some((k) => !state.data[k]);
    if (!faltando) return null;
    if (erro) return UI.ErrorState(erro, onRetry);
    return (opts && opts.skeleton) || UI.Skeleton(6);
  }

  function pagina(cls: string, ...children: FilhoDom[]): HTMLElement {
    return h("div", { class: [ZoZo.estrutura.pagina, cls] }, ...children);
  }

  /** Bloco "valor / subtítulo" usado nos cards de resumo */
  function valorResumo(valor: unknown, subtitulo: string, align: "left" | "right"): HTMLElement {
    return h("div", { class: align === "left" ? ZoZo.pecas.resumoDepois : ZoZo.pecas.resumoAntes },
      h("span", { class: ZoZo.pecas.resumoValor }, typeof valor === "string" ? valor : F.moeda(valor)),
      h("span", { class: ZoZo.pecas.resumoRotulo }, subtitulo));
  }

  /** Card Esquerda | Donut | Direita (Categorias e Recorrências) */
  function cardResumoDonut(cfg: CardResumo): HTMLElement {
    const donut = h("div", { class: ZoZo.pecas.resumoRosca });
    ZoZo.charts.renderDonutChart(donut, cfg.segmentos, { ariaLabel: cfg.ariaLabel, size: 108, thickness: 15, onClick: cfg.onClick, progresso: cfg.progresso, corProgresso: cfg.corProgresso, tituloProgresso: cfg.tituloProgresso });
    return h("section", { class: [ZoZo.pecas.card, ZoZo.pecas.resumo], "aria-label": cfg.ariaLabel },
      valorResumo(cfg.esquerda.valor, cfg.esquerda.label, "right"),
      donut,
      valorResumo(cfg.direita.texto !== undefined ? cfg.direita.texto : cfg.direita.valor, cfg.direita.label, "left"));
  }

  /** Agrupa itens por categoria para o donut (cor da categoria) */
  function segmentosPorCategoria(itens: any[], campoValor: string): SegmentoRosca[] {
    const mapa = new Map<string, SegmentoRosca>();
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
  function detalheLinha(rotulo: string, valor: FilhoDom, cls?: string): HTMLElement {
    return h("div", { class: [ZoZo.pecas.painelLinha, cls] }, h("span", { class: ZoZo.pecas.painelLinhaRotulo }, rotulo), h("span", { class: ZoZo.pecas.painelLinhaValor }, valor));
  }

  function detalheSecao(titulo: string | null, ...children: FilhoDom[]): HTMLElement {
    return h("section", { class: ZoZo.pecas.painelSecao }, titulo ? h("h3", { class: ZoZo.pecas.painelSecaoTitulo }, titulo) : null, ...children);
  }

  const api: ZoZoPagesComum = { estadoCarregamento, pagina, valorResumo, cardResumoDonut, segmentosPorCategoria, detalheLinha, detalheSecao };
  ZoZo.pagesComum = api;
})(window.ZoZo);
