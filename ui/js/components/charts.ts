/* =============================================================
   ZoZo — Gráficos (seção 62)
   Recebem dados já preparados e apenas desenham.

   renderLineChart(container, series, options)
     series: [{ name, color, points:[{ data:"AAAA-MM-DD", valor }], colorBySlope?, tracejado?, area? }]
     Toda linha tem degradê embaixo (area: false desliga; tracejado nunca tem); com duas linhas o
     degradê da de cima vai até a de baixo.
   renderDonutChart(container, segments, options)
     segments: [{ valor, cor, label }]   ·  options.progresso (0–1) → anel de progresso
   renderBarChart(container, barras, options)
     barras: [{ rotulo, valor, titulo }] ·  options.limite → linha tracejada (orçamento)
   Todos animam ao aparecer (exceto com "reduzir movimento"). Linha e barras recebem o foco: as setas
   andam pelos pontos e o leitor de tela anuncia data e valor (o mesmo da dica do mouse).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const { s, h, clear } = ZoZo.dom;
  const F = ZoZo.format;
  const P = ZoZo.pecas;

  const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const reduzir = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
  let seq = 0;

  /**
   * Anima de 0 a 1 em "dur" ms chamando passo(p), contando a partir de "inicio" (performance.now()).
   * Começa na hora — como antes da 2.8: o gráfico se desenha enquanto a página entra.
   */
  function animar(dur: number, passo: (p: number) => void, inicio?: number | null) {
    if (reduzir()) { passo(1); return; }
    const ini = inicio || performance.now();
    ZoZo.charts.ultimoInicio = ini;
    const frame = (agora: number) => {
      const t = Math.max(0, Math.min(1, (agora - ini) / dur));
      passo(easeOut(t));
      if (t < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /**
   * Início da animação de um gráfico novo: null = quando ele começar a se desenhar. Quando a página é
   * redesenhada logo depois de entrar (chegaram dados novos) e já havia gráfico na tela, o router
   * informa em continuarDe o início da animação anterior — o gráfico novo CONTINUA de onde o antigo
   * estava, sem recomeçar do zero.
   */
  const inicioAnimacao = (): number | null => ZoZo.charts.continuarDe || null;
  /** Ponto da animação em que um gráfico que CONTINUA já nasce desenhado (evita um quadro vazio) */
  const progressoInicial = (inicio: number | null) => (!inicio ? 0 : reduzir() ? 1 : easeOut(Math.max(0, Math.min(1, (performance.now() - inicio) / duracao()))));
  /** --duration-chart em ms. O build minifica "900ms" para ".9s": ler só o número dava 0,9 ms (animação instantânea) */
  function duracao() {
    const v = css("--duration-chart"), n = parseFloat(v);
    if (!(n > 0)) return 900;
    return /ms$/i.test(v) ? n : /s$/i.test(v) ? n * 1000 : n;
  }

  /** Executa fn uma vez quando o elemento estiver conectado e com tamanho */
  function quandoVisivel(el: HTMLElement, fn: () => void) {
    let feito = false;
    const ro = new ResizeObserver(() => {
      if (feito || !el.isConnected || !el.clientWidth) return;
      feito = true; ro.disconnect(); fn();
    });
    ro.observe(el);
  }

  /** Rótulo do eixo X em duas linhas, como no Copilot: "Abr" e, abaixo, o ano */
  function rotuloDuasLinhas(svg: SVGElement, x: number, yBase: number, mes: string, ano?: string | null, ancora?: string) {
    const t = s("text", { x, y: yBase - 12, class: P.graficoRotulo, "text-anchor": ancora || "middle" });
    t.appendChild(s("tspan", { x, dy: 0, text: mes }));
    if (ano) t.appendChild(s("tspan", { x, dy: 13, text: ano }));
    svg.appendChild(t);
  }

  /** Etiqueta escura com seta (valor de referência no fim de uma linha) */
  /**
   * Teclado e leitor de tela nos gráficos de linha e de barras: o suporte recebe o foco, as setas (Início/Fim)
   * andam pelos pontos e o valor de cada um é anunciado; é o mesmo conteúdo da dica do mouse. O suporte
   * sobrevive aos redesenhos (o SVG é trocado dentro dele), então o foco não se perde ao mudar a largura.
   */
  function navegavel(holder: HTMLElement, container: HTMLElement, rotulo: string) {
    const anuncio = h("p", { class: "tw:sr-only", "aria-live": "polite" });
    container.appendChild(anuncio);
    holder.setAttribute("tabindex", "0");
    holder.setAttribute("role", "img");
    holder.setAttribute("aria-label", rotulo + ". Use as setas para ouvir o valor de cada ponto.");
    const nav = { indice: -1, total: 0, mostrar: (_i: number): string => "", esconder: (): void => {} };
    const ir = (i: number) => {
      if (!nav.total) return;
      nav.indice = Math.max(0, Math.min(nav.total - 1, i));
      anuncio.textContent = nav.mostrar(nav.indice);
    };
    holder.addEventListener("keydown", (e) => {
      const i = nav.indice;
      const alvo = e.key === "ArrowRight" || e.key === "ArrowDown" ? (i < 0 ? 0 : i + 1)
        : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (i < 0 ? nav.total - 1 : i - 1)
        : e.key === "Home" ? 0 : e.key === "End" ? nav.total - 1 : null;
      if (alvo === null) return;
      e.preventDefault();
      e.stopPropagation();                         // as setas são do gráfico (não da lista ou do painel em volta)
      ir(alvo);
    });
    holder.addEventListener("blur", () => { nav.indice = -1; nav.esconder(); anuncio.textContent = ""; });
    return {
      nav,
      /** depois de redesenhar: volta a mostrar o ponto escolhido pelo teclado */
      redesenhou() { if (nav.indice >= 0) nav.mostrar(Math.min(nav.indice, nav.total - 1)); },
    };
  }

  function etiqueta(svg: SVGElement, xFim: number, y: number, texto: string) {
    const larg = texto.length * 6.4 + 14, alt = 20;
    const x0 = xFim - larg;
    svg.appendChild(s("path", { d: `M${x0 - 6} ${y} L${x0} ${y - alt / 2} H${xFim - 3} Q${xFim} ${y - alt / 2} ${xFim} ${y - alt / 2 + 3} V${y + alt / 2 - 3} Q${xFim} ${y + alt / 2} ${xFim - 3} ${y + alt / 2} H${x0} Z`, class: P.etiquetaGrafico }));
    svg.appendChild(s("text", { x: x0 + larg / 2, y: y + 4, "text-anchor": "middle", class: P.etiquetaGraficoTexto, text: texto }));
  }

  /* ================= Linha ================= */
  function renderLineChart(container: HTMLElement, series: SerieGrafico[], options?: OpcoesGraficoLinha): { destroy(): void } {
    const o: OpcoesGraficoLinha & { height: number; formatValue: (v: number) => string } = Object.assign({ height: 180, formatValue: (v: number) => F.moeda(v), ariaLabel: "Gráfico de linha", animar: ZoZo.charts.permitirAnimacao !== false }, options || {});
    clear(container);
    container.classList.add(...P.graficoLinha.split(" "));

    // cópias das séries com a escala de cada uma (_y: valor → altura; _base: fim da área degradê): as de quem chamou não mudam
    type SerieDesenho = SerieGrafico & { _y: (v: number) => number; _base: number };
    const validas: SerieDesenho[] = (series || []).filter((sr) => sr.points && sr.points.length).map((sr) => Object.assign({}, sr, { _y: (v: number) => v, _base: 0 }));
    if (!validas.length) {
      container.appendChild(h("div", { class: P.graficoVazio, style: { height: o.height + "px" } }, "Sem dados para o período."));
      return { destroy() {} };
    }

    const tooltip = h("div", { class: P.dica, role: "presentation" });
    const holder = h("div", { class: P.graficoSuporte, style: { height: o.height + "px" } });
    container.appendChild(holder);
    container.appendChild(tooltip);
    const teclado = navegavel(holder, container, o.ariaLabel || "Gráfico de linha");

    // Animação de entrada: o progresso sobrevive a redesenhos (ex.: a barra de rolagem aparece e muda a
    // largura no meio da animação) — antes, o redesenho pulava direto para o fim e o gráfico parecia sem animação
    const inicio = o.animar ? inicioAnimacao() : 0;
    let svg: SVGElement | null = null, iniciada = !o.animar, progresso = o.animar ? progressoInicial(inicio) : 1;
    let clipAtual: { rect: SVGElement; W: number } | null = null;
    function draw() {
      const W = Math.max(160, holder.clientWidth);
      const H = o.height;
      const m = { t: o.aoPassar ? 28 : 14, r: 14, b: o.semEixo ? 8 : 36, l: 6 };      // modo filtro: espaço para a data em cima do ponto
      const iw = W - m.l - m.r, ih = H - m.t - m.b;
      const n = Math.max(...validas.map((sr) => sr.points.length));

      const escala = (pts: PontoGrafico[]) => {
        let mn = Infinity, mx = -Infinity;
        pts.forEach((p) => { mn = Math.min(mn, p.valor); mx = Math.max(mx, p.valor); });
        if (mn === mx) { mn -= 1; mx += 1; }
        const pd = (mx - mn) * 0.12;
        return [mn - pd, mx + pd];
      };
      const todas: PontoGrafico[] = [];
      validas.forEach((sr) => sr.points.forEach((p) => todas.push(p)));
      const global = escala(todas);
      validas.forEach((sr, k) => {
        if (o.independentScale) {
          const [mn, mx] = escala(sr.points);
          const altura = ih / validas.length;
          const topo = m.t + altura * k;
          sr._y = (v) => topo + altura - ((v - mn) / (mx - mn)) * altura;
          sr._base = topo + altura;                 // a área degradê vai só até o fim da faixa desta série
        } else {
          sr._y = (v) => m.t + ih - ((v - global[0]) / (global[1] - global[0])) * ih;
          sr._base = m.t + ih;
        }
      });
      const x = (i: number, len: number) => m.l + (len <= 1 ? iw : (i / (len - 1)) * iw);

      if (svg) svg.remove();
      const tela = s("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": o.ariaLabel, class: P.graficoSvg });
      svg = tela;


      if (!o.semEixo) {
        const ref = validas.reduce((a, b) => (a.points.length >= b.points.length ? a : b)).points;
        // Início, meio e fim — sem repetir (séries curtas) e sem o do meio quando não cabe entre os outros dois
        const ultimo = ref.length - 1, meio = Math.floor(ultimo / 2);
        const indices = ultimo <= 0 ? [0] : (meio > 0 && meio < ultimo && iw >= 240) ? [0, meio, ultimo] : [0, ultimo];
        indices.forEach((i) => {
          if (!ref[i]) return;
          const dt = F.parseData(ref[i].data) || new Date();
          const ancora = i === 0 ? "start" : i === ultimo ? "end" : "middle";
          if (o.rotuloX) tela.appendChild(s("text", { x: x(i, ref.length), y: H - 6, class: P.graficoRotulo, "text-anchor": ancora, text: o.rotuloX(ref[i]) }));
          else rotuloDuasLinhas(tela, x(i, ref.length), H - 2, String(dt.getDate()).padStart(2, "0") + " " + F.mesAbrev(dt.getMonth()), String(dt.getFullYear()), ancora);
        });
      }

      // Conteúdo revelado da esquerda para a direita
      const clipId = "zz-clip-" + (++seq);
      const clipRect = s("rect", { x: 0, y: 0, width: W * progresso, height: H });
      clipAtual = { rect: clipRect, W };
      tela.appendChild(s("defs", null, s("clipPath", { id: clipId }, clipRect)));
      const g = s("g", { "clip-path": `url(#${clipId})` });
      tela.appendChild(g);

      // Degradê sob a linha (todas as linhas de todos os gráficos, menos as tracejadas de referência).
      // Com duas linhas, o degradê da de cima desce até a de baixo (preenche o espaço entre elas).
      const caminho = (sr: SerieDesenho) => sr.points.map((p, i) => (i ? "L" : "M") + x(i, sr.points.length).toFixed(1) + " " + sr._y(p.valor).toFixed(1)).join(" ");
      const degrade = (cor: string | undefined) => {
        const gid = "zz-grad-" + (++seq);
        tela.insertBefore(s("defs", null, s("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 },
          s("stop", { offset: "0%", "stop-color": cor, "stop-opacity": 0.22 }),
          s("stop", { offset: "100%", "stop-color": cor, "stop-opacity": 0 }))), tela.firstChild);
        return `url(#${gid})`;
      };
      const comArea = validas.filter((sr) => sr.area !== false && !sr.tracejado);
      validas.forEach((sr) => {
        if (sr.area === false || sr.tracejado) return;
        const pts = sr.points, L = pts.length;
        const corArea = sr.colorBySlope ? (L > 1 && pts[L - 1].valor < pts[0].valor ? css("--color-chart-down") : css("--color-chart-up")) : sr.color;
        const abaixo = comArea[comArea.indexOf(sr) + 1];
        let contorno;
        if (abaixo && abaixo.points.length === L) {
          // até a linha de baixo: vai pela linha desta série e volta pela de baixo
          const volta = abaixo.points.map((p, i) => [x(i, L), abaixo._y(p.valor)]).reverse().map(([px, py]) => `L${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
          contorno = caminho(sr) + " " + volta + " Z";
        } else {
          contorno = caminho(sr) + ` L${x(L - 1, L).toFixed(1)} ${sr._base} L${x(0, L).toFixed(1)} ${sr._base} Z`;
        }
        g.appendChild(s("path", { d: contorno, fill: degrade(corArea), stroke: "none", class: "line-chart__area" }));
      });

      validas.forEach((sr) => {
        const y = sr._y;
        const pts = sr.points;
        const L = pts.length;
        if (sr.colorBySlope) {
          let atual: string | null = null, trecho: string[] = [];
          const flush = () => {
            if (trecho.length < 2) return;
            const cor = atual === "up" ? css("--color-chart-up") : atual === "down" ? css("--color-chart-down") : css("--color-chart-flat");
            g.appendChild(s("polyline", { points: trecho.join(" "), fill: "none", stroke: cor, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
          };
          for (let i = 1; i < L; i++) {
            const dir = pts[i].valor > pts[i - 1].valor ? "up" : pts[i].valor < pts[i - 1].valor ? "down" : "flat";
            if (dir !== atual) { flush(); trecho = [x(i - 1, L) + "," + y(pts[i - 1].valor)]; atual = dir; }
            trecho.push(x(i, L) + "," + y(pts[i].valor));
          }
          flush();
        } else {
          const d = caminho(sr);
          g.appendChild(s("path", { d, fill: "none", stroke: sr.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round", "stroke-dasharray": sr.tracejado ? "4 5" : null }));
          if (sr.pontos) pts.forEach((p, i) => g.appendChild(s("circle", { cx: x(i, L), cy: y(p.valor), r: 3.5, fill: p.vazio ? "#fff" : sr.color, stroke: sr.color, "stroke-width": 2 })));
        }
        const last = pts[L - 1];
        const corFim = sr.colorBySlope ? (L > 1 && last.valor < pts[0].valor ? css("--color-chart-down") : css("--color-chart-up")) : sr.color;
        g.appendChild(s("circle", { cx: x(L - 1, L), cy: y(last.valor), r: 4, fill: "#fff", stroke: corFim, "stroke-width": 2 }));
      });

      // interação
      // modo filtro: o que vem depois do ponto fica esmaecido (véu branco por cima) e a data aparece em cima dele
      const veu = o.aoPassar ? s("rect", { x: 0, y: 0, width: 0, height: m.t + ih + 2, class: P.graficoVeu, visibility: "hidden" }) : null;
      const dataTopo = o.aoPassar ? s("text", { x: 0, y: 12, class: P.graficoDataTopo, "text-anchor": "middle", visibility: "hidden" }) : null;
      if (veu) tela.appendChild(veu);
      const cursor = s("line", { y1: m.t, y2: m.t + ih, class: P.graficoCursor, visibility: "hidden" });
      const marcadores = validas.map((sr) => s("circle", o.aoPassar
        ? { r: 4.5, fill: "#fff", stroke: sr.colorBySlope ? css("--color-chart-up") : sr.color, "stroke-width": 2.5, visibility: "hidden" }
        : { r: 3.5, fill: sr.colorBySlope ? css("--color-chart-up") : sr.color, visibility: "hidden" }));
      tela.appendChild(cursor);
      marcadores.forEach((c) => tela.appendChild(c));
      if (dataTopo) tela.appendChild(dataTopo);
      const area = s("rect", { x: m.l, y: 0, width: iw, height: H, fill: "transparent" });
      tela.appendChild(area);

      const mostrar = (clientX: number) => {
        const r = tela.getBoundingClientRect();
        const rel = Math.max(0, Math.min(iw, clientX - r.left - m.l));
        mostrarPonto(Math.round((rel / iw) * (n - 1)));
      };
      /** mostra o ponto i (mouse ou teclado) e devolve o texto que o leitor de tela anuncia */
      const mostrarPonto = (i: number): string => {
        const falas: string[] = [];
        cursor.setAttribute("x1", String(x(i, n))); cursor.setAttribute("x2", String(x(i, n))); cursor.setAttribute("visibility", "visible");
        clear(tooltip);
        let ponto = null as PontoGrafico | null;     // preenchido no forEach abaixo
        validas.forEach((sr, k) => {
          const p = sr.points[Math.min(i, sr.points.length - 1)];
          ponto = ponto || p;
          marcadores[k].setAttribute("cx", String(x(Math.min(i, sr.points.length - 1), sr.points.length)));
          marcadores[k].setAttribute("cy", String(sr._y(p.valor)));
          marcadores[k].setAttribute("visibility", "visible");
          tooltip.appendChild(h("div", { class: P.dicaLinha },
            h("span", { class: P.dicaPonto, style: { background: sr.colorBySlope ? "var(--color-text-secondary)" : sr.color } }),
            h("span", null, sr.name), h("strong", null, o.formatValue(p.valor))));
          falas.push((sr.name ? sr.name + " " : "") + (p.vazio ? "sem valor" : o.formatValue(p.valor)));
        });
        const pp = ponto as PontoGrafico | null;     // o TS não vê a atribuição dentro do forEach
        const quando = pp ? (o.rotuloTooltip ? o.rotuloTooltip(pp) : F.dataExtenso(pp.data)) : "";
        const fala = [quando].concat(falas).filter(Boolean).join(", ");
        if (o.aoPassar && veu && dataTopo) {
          const xc = x(i, n);
          veu.setAttribute("x", String(xc)); veu.setAttribute("width", String(Math.max(0, W - xc))); veu.setAttribute("visibility", "visible");
          const dt = F.parseData(ponto && (ponto as PontoGrafico).data);
          dataTopo.textContent = dt ? (String(dt.getDate()).padStart(2, "0") + " " + F.mesAbrev(dt.getMonth()) + " " + dt.getFullYear()).toUpperCase() : "";
          dataTopo.setAttribute("x", String(Math.min(Math.max(xc, 44), W - 44))); dataTopo.setAttribute("visibility", "visible");
          o.aoPassar(validas.map((sr) => sr.points[Math.min(i, sr.points.length - 1)] || null));
          return fala;                               // no modo filtro o topo do cartão mostra os valores (sem caixinha)
        }
        tooltip.insertBefore(h("div", { class: P.dicaData }, quando), tooltip.firstChild);
        tooltip.classList.add("is-visible");
        tooltip.style.left = Math.min(Math.max(x(i, n) - tooltip.offsetWidth / 2, 0), W - tooltip.offsetWidth) + "px";
        return fala;
      };
      const esconder = () => {
        cursor.setAttribute("visibility", "hidden");
        marcadores.forEach((c) => c.setAttribute("visibility", "hidden"));
        tooltip.classList.remove("is-visible");
        if (veu) veu.setAttribute("visibility", "hidden");
        if (dataTopo) dataTopo.setAttribute("visibility", "hidden");
        if (o.aoPassar) o.aoPassar(null);
      };
      area.addEventListener("mousemove", (e) => mostrar(e.clientX));
      area.addEventListener("mouseleave", () => { if (teclado.nav.indice < 0) esconder(); });
      holder.appendChild(tela);
      Object.assign(teclado.nav, { total: n, mostrar: mostrarPonto, esconder });
      teclado.redesenhou();

      if (!iniciada && holder.isConnected && holder.clientWidth) {
        iniciada = true;
        animar(duracao(), (p) => { progresso = p; if (clipAtual) clipAtual.rect.setAttribute("width", String(clipAtual.W * p)); }, inicio);
      }
    }

    draw();
    let conectado = false;
    const ro = new ResizeObserver(() => {
      if (holder.isConnected) { conectado = true; draw(); } else if (conectado) ro.disconnect();
    });
    ro.observe(holder);
    return { destroy() { ro.disconnect(); } };
  }

  /* ================= Donut =================
     Fundo: disco cinza-claro com o centro branco (folga igual por fora e por dentro do anel).
     Barras com pontas arredondadas, na ordem do relógio a partir do meio-dia. Sobreposição:
     a 1ª fica por cima de todas (as duas pontas); cada barra cobre o começo da seguinte; a
     última fica por baixo da penúltima e da 1ª. Por isso são desenhadas da última para a 1ª. */
  function renderDonutChart(container: HTMLElement, segments: SegmentoRosca[] | null | undefined, options?: OpcoesRosca): SVGElement {
    const o: OpcoesRosca & { size: number; thickness: number } = Object.assign({ size: 112, thickness: 15, ariaLabel: "Distribuição" }, options || {});
    clear(container);
    const c0 = o.size / 2;
    const folga = Math.max(3, Math.round(o.thickness * 0.3));
    const r = c0 - folga - o.thickness / 2;            // raio do meio do anel
    const C = 2 * Math.PI * r;
    const svg = s("svg", { width: o.size, height: o.size, viewBox: `0 0 ${o.size} ${o.size}`, role: "img", "aria-label": o.ariaLabel, class: o.onClick ? P.roscaClicavel : P.rosca });
    svg.appendChild(s("circle", { cx: c0, cy: c0, r: c0, fill: css("--color-donut-fundo") || "#F1F2F5", class: "donut__fundo" }));
    svg.appendChild(s("circle", { cx: c0, cy: c0, r: Math.max(0, r - o.thickness / 2 - folga), fill: "#fff" }));
    const g = s("g", { transform: `rotate(-90 ${c0} ${c0})` });
    svg.appendChild(g);
    const barra = (cor: string | null, offset: number, titulo?: string) => {
      const arc = s("circle", {
        cx: c0, cy: c0, r, fill: "none", stroke: cor, "stroke-width": o.thickness, "stroke-linecap": "round",
        "stroke-dasharray": `0 ${C}`, "stroke-dashoffset": -offset, class: P.roscaArco, visibility: "hidden",
      });
      if (titulo) arc.appendChild(s("title", { text: titulo }));
      return arc;
    };

    const arcos: Array<{ el: SVGElement; ini: number; len: number }> = [];
    if (typeof o.progresso === "number") {
      // Anel de progresso: completa de 0 até o valor (ex.: já pago / total)
      const alvo = Math.max(0, Math.min(1, o.progresso));
      const arc = barra(o.corProgresso || css("--color-progress-ok"), 0, o.tituloProgresso);
      g.appendChild(arc);
      arcos.push({ el: arc, ini: 0, len: alvo * C });
    } else {
      const validos = (segments || []).filter((sg) => F.numero(sg.valor) > 0);
      const total = validos.reduce((acc: number, sg) => acc + F.numero(sg.valor), 0);
      let offset = 0;
      validos.forEach((sg) => {
        const len = (F.numero(sg.valor) / total) * C;
        arcos.push({ el: barra(F.cor(sg.cor, css("--color-text-muted")), offset, sg.label + ": " + F.moeda(sg.valor)), ini: offset, len });
        offset += len;
      });
      // da última para a primeira: quem é desenhado depois fica por cima
      arcos.slice().reverse().forEach((a) => g.appendChild(a.el));
    }
    if (o.onClick) {
      svg.setAttribute("tabindex", "0");
      const aoClicar = o.onClick;
      svg.addEventListener("click", () => aoClicar());
      svg.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); aoClicar(); } });
    }
    container.appendChild(svg);

    const pintar = (p: number) => {
      const ate = p * C;
      arcos.forEach((a) => {
        const vis = Math.max(0, Math.min(a.len, ate - a.ini));
        a.el.setAttribute("stroke-dasharray", `${vis} ${C}`);
        a.el.setAttribute("visibility", vis > 0 ? "visible" : "hidden");    // ponta redonda de barra vazia viraria um ponto
      });
    };
    if (ZoZo.charts.permitirAnimacao === false) pintar(1);
    else { const inicio = inicioAnimacao(); pintar(progressoInicial(inicio)); quandoVisivel(container, () => animar(duracao(), pintar, inicio)); }
    return svg;
  }

  /* ================= Barras ================= */
  function renderBarChart(container: HTMLElement, barras: BarraGrafico[], options?: OpcoesGraficoBarras): { destroy(): void } {
    const o: OpcoesGraficoBarras & { height: number } = Object.assign({ height: 170, ariaLabel: "Gráfico de barras" }, options || {});
    clear(container);
    const holder = h("div", { class: P.barras, style: { height: o.height + "px" } });
    const tooltip = h("div", { class: P.dica, role: "presentation" });
    container.classList.add(...P.graficoLinha.split(" "));
    container.appendChild(holder);
    container.appendChild(tooltip);
    const teclado = navegavel(holder, container, o.ariaLabel || "Gráfico de barras");

    function draw() {
      clear(holder);
      const W = Math.max(160, holder.clientWidth), H = o.height;
      const m = { t: 14, r: 64, b: 34, l: 8 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b;
      const max = Math.max(1, o.limite || 0, ...barras.map((b) => F.numero(b.valor))) * 1.12;
      const y = (v: number) => m.t + ih - (v / max) * ih;
      const passo = iw / Math.max(1, barras.length);
      const bw = Math.max(4, Math.min(18, passo * 0.45));
      const svg = s("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": o.ariaLabel, class: P.graficoSvg });
      svg.appendChild(s("line", { x1: m.l, x2: W - m.r, y1: m.t + ih, y2: m.t + ih, class: P.barrasLinha }));
      const rects: Array<{ el: SVGElement; altura: number }> = [];
      const mostrarBarra: Array<() => string> = [];
      barras.forEach((b, i) => {
        const v = F.numero(b.valor);
        const cx = m.l + passo * i + passo / 2;
        const limite = o.limite || 0;
        const acima = limite > 0 && v > limite;
        const altura = Math.max(v > 0 ? 2 : 0, m.t + ih - y(v));
        const r = s("rect", { x: cx - bw / 2, y: m.t + ih, width: bw, height: 0, rx: Math.min(4, bw / 2),
          fill: acima ? css("--color-progress-over") : (b.destaque ? css("--color-primary") : css("--color-assets")), class: "bar-chart__bar" });
        rects.push({ el: r, altura });
        svg.appendChild(r);
        if (i % Math.ceil(barras.length / 6) === 0 || i === barras.length - 1) {
          rotuloDuasLinhas(svg, cx, H - 2, b.rotuloMes || b.rotulo || "", b.rotuloAno || "");
        }
        const alvo = s("rect", { x: cx - passo / 2, y: 0, width: passo, height: H, fill: "transparent" });
        const mostrar = (): string => {
          clear(tooltip);
          tooltip.appendChild(h("div", { class: P.dicaData }, b.titulo || b.rotulo));
          tooltip.appendChild(h("div", { class: P.dicaLinha2 }, h("span", null, o.nomeValor || "Valor"), h("strong", null, F.moeda(v))));
          tooltip.classList.add("is-visible");
          tooltip.style.left = Math.min(Math.max(cx - tooltip.offsetWidth / 2, 0), W - tooltip.offsetWidth) + "px";
          return [b.titulo || b.rotulo, (o.nomeValor || "Valor") + " " + F.moeda(v)].filter(Boolean).join(", ");
        };
        mostrarBarra.push(mostrar);
        alvo.addEventListener("mouseenter", mostrar);
        alvo.addEventListener("mouseleave", () => { if (teclado.nav.indice < 0) tooltip.classList.remove("is-visible"); });
        svg.appendChild(alvo);
      });
      if (o.limite && o.limite > 0) {
        const ly = y(o.limite);
        svg.appendChild(s("line", { x1: m.l, x2: W - 4, y1: ly, y2: ly, class: P.barrasLinha }));
        etiqueta(svg, W - 2, ly, F.moeda(o.limite));
      }
      holder.appendChild(svg);
      Object.assign(teclado.nav, { total: barras.length, mostrar: (i: number) => mostrarBarra[i](), esconder: () => tooltip.classList.remove("is-visible") });
      teclado.redesenhou();
      pintarAtual = (p: number) => rects.forEach((r) => { const a = r.altura * p; r.el.setAttribute("y", String(m.t + ih - a)); r.el.setAttribute("height", String(a)); });
      pintarAtual(progresso);
      if (!iniciada) {
        iniciada = true;
        animar(duracao(), (p) => { progresso = p; pintarAtual(p); }, inicio);
      }
    }

    // Mesmo cuidado do gráfico de linha: um redesenho no meio da animação continua de onde parou
    let iniciada = ZoZo.charts.permitirAnimacao === false, pintarAtual = (_p: number): void => {};
    const inicio = iniciada ? 0 : inicioAnimacao();
    let progresso = iniciada ? 1 : progressoInicial(inicio);
    let conectado = false;
    const ro = new ResizeObserver(() => {
      // saiu da tela depois de ter aparecido (troca de página/painel): para de observar
      if (!holder.isConnected) { if (conectado) ro.disconnect(); return; }
      conectado = true;
      if (!holder.clientWidth) return;
      draw();
    });
    ro.observe(holder);
    return { destroy() { ro.disconnect(); } };
  }

  const api: ZoZoCharts = { renderLineChart, renderDonutChart, renderBarChart, permitirAnimacao: true, continuarDe: null, ultimoInicio: null };
  ZoZo.charts = api;
})(window.ZoZo);
