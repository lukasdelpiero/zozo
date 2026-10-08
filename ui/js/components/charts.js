/* =============================================================
   ZoZo — Gráficos (seção 62)
   Recebem dados já preparados e apenas desenham.

   renderLineChart(container, series, options)
     series: [{ name, color, points:[{ data:"AAAA-MM-DD", valor }], colorBySlope? }]
   renderDonutChart(container, segments, options)
     segments: [{ valor, cor, label }]   ·  options.progresso (0–1) → anel de progresso
   renderBarChart(container, barras, options)
     barras: [{ rotulo, valor, titulo }] ·  options.limite → linha tracejada (orçamento)
   Todos animam ao aparecer (exceto com "reduzir movimento").
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { s, h, clear } = ZoZo.dom;
  const F = ZoZo.format;

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const reduzir = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  let seq = 0;

  /** Anima de 0 a 1 em "dur" ms chamando passo(p) */
  function animar(dur, passo) {
    if (reduzir()) { passo(1); return; }
    const ini = performance.now();
    const frame = (agora) => {
      const t = Math.max(0, Math.min(1, (agora - ini) / dur));
      passo(easeOut(t));
      if (t < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /** Executa fn uma vez quando o elemento estiver conectado e com tamanho */
  function quandoVisivel(el, fn) {
    let feito = false;
    const ro = new ResizeObserver(() => {
      if (feito || !el.isConnected || !el.clientWidth) return;
      feito = true; ro.disconnect(); fn();
    });
    ro.observe(el);
  }

  /** Rótulo do eixo X em duas linhas, como no Copilot: "Abr" e, abaixo, o ano */
  function rotuloDuasLinhas(svg, x, yBase, mes, ano, ancora) {
    const t = s("text", { x, y: yBase - 12, class: "line-chart__label", "text-anchor": ancora || "middle" });
    t.appendChild(s("tspan", { x, dy: 0, text: mes }));
    if (ano) t.appendChild(s("tspan", { x, dy: 13, text: ano }));
    svg.appendChild(t);
  }

  /** Etiqueta escura com seta (valor de referência no fim de uma linha) */
  function etiqueta(svg, xFim, y, texto) {
    const larg = texto.length * 6.4 + 14, alt = 20;
    const x0 = xFim - larg;
    svg.appendChild(s("path", { d: `M${x0 - 6} ${y} L${x0} ${y - alt / 2} H${xFim - 3} Q${xFim} ${y - alt / 2} ${xFim} ${y - alt / 2 + 3} V${y + alt / 2 - 3} Q${xFim} ${y + alt / 2} ${xFim - 3} ${y + alt / 2} H${x0} Z`, class: "chart-tag" }));
    svg.appendChild(s("text", { x: x0 + larg / 2, y: y + 4, "text-anchor": "middle", class: "chart-tag__text", text: texto }));
  }

  /* ================= Linha ================= */
  function renderLineChart(container, series, options) {
    const o = Object.assign({ height: 180, formatValue: (v) => F.moeda(v), ariaLabel: "Gráfico de linha", animar: ZoZo.charts.permitirAnimacao !== false }, options || {});
    clear(container);
    container.classList.add("line-chart");

    const validas = (series || []).filter((sr) => sr.points && sr.points.length);
    if (!validas.length) {
      container.appendChild(h("div", { class: "chart-empty", style: { height: o.height + "px" } }, "Sem dados para o período."));
      return { destroy() {} };
    }

    const tooltip = h("div", { class: "chart-tooltip", role: "presentation" });
    const holder = h("div", { class: "line-chart__holder", style: { height: o.height + "px" } });
    container.appendChild(holder);
    container.appendChild(tooltip);

    let svg = null, animado = !o.animar;
    function draw() {
      const W = Math.max(160, holder.clientWidth);
      const H = o.height;
      const m = { t: 14, r: 14, b: o.semEixo ? 8 : 36, l: 6 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b;
      const n = Math.max(...validas.map((sr) => sr.points.length));

      const escala = (pts) => {
        let mn = Infinity, mx = -Infinity;
        pts.forEach((p) => { mn = Math.min(mn, p.valor); mx = Math.max(mx, p.valor); });
        if (mn === mx) { mn -= 1; mx += 1; }
        const pd = (mx - mn) * 0.12;
        return [mn - pd, mx + pd];
      };
      const todas = [];
      validas.forEach((sr) => sr.points.forEach((p) => todas.push(p)));
      const global = escala(todas);
      validas.forEach((sr, k) => {
        if (o.independentScale) {
          const [mn, mx] = escala(sr.points);
          const altura = ih / validas.length;
          const topo = m.t + altura * k;
          sr._y = (v) => topo + altura - ((v - mn) / (mx - mn)) * altura;
        } else {
          sr._y = (v) => m.t + ih - ((v - global[0]) / (global[1] - global[0])) * ih;
        }
      });
      const x = (i, len) => m.l + (len <= 1 ? iw : (i / (len - 1)) * iw);

      if (svg) svg.remove();
      svg = s("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": o.ariaLabel, class: "line-chart__svg" });


      if (!o.semEixo) {
        const ref = validas.reduce((a, b) => (a.points.length >= b.points.length ? a : b)).points;
        // Início, meio e fim — sem repetir (séries curtas) e sem o do meio quando não cabe entre os outros dois
        const ultimo = ref.length - 1, meio = Math.floor(ultimo / 2);
        const indices = ultimo <= 0 ? [0] : (meio > 0 && meio < ultimo && iw >= 240) ? [0, meio, ultimo] : [0, ultimo];
        indices.forEach((i) => {
          if (!ref[i]) return;
          const dt = F.parseData(ref[i].data);
          const ancora = i === 0 ? "start" : i === ultimo ? "end" : "middle";
          if (o.rotuloX) svg.appendChild(s("text", { x: x(i, ref.length), y: H - 6, class: "line-chart__label", "text-anchor": ancora, text: o.rotuloX(ref[i]) }));
          else rotuloDuasLinhas(svg, x(i, ref.length), H - 2, String(dt.getDate()).padStart(2, "0") + " " + F.mesAbrev(dt.getMonth()), String(dt.getFullYear()), ancora);
        });
      }

      // Conteúdo revelado da esquerda para a direita
      const clipId = "zz-clip-" + (++seq);
      const clipRect = s("rect", { x: 0, y: 0, width: animado ? W : 0, height: H });
      svg.appendChild(s("defs", null, s("clipPath", { id: clipId }, clipRect)));
      const g = s("g", { "clip-path": `url(#${clipId})` });
      svg.appendChild(g);

      validas.forEach((sr) => {
        const y = sr._y;
        const pts = sr.points;
        const L = pts.length;
        if (sr.colorBySlope) {
          let atual = null, trecho = [];
          const flush = () => {
            if (trecho.length < 2) return;
            const cor = atual === "up" ? css("--color-chart-up") : atual === "down" ? css("--color-chart-down") : css("--color-chart-flat");
            g.appendChild(s("polyline", { points: trecho.join(" "), fill: "none", stroke: cor, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round", class: atual === "flat" ? "line-chart__flat" : null }));
          };
          for (let i = 1; i < L; i++) {
            const dir = pts[i].valor > pts[i - 1].valor ? "up" : pts[i].valor < pts[i - 1].valor ? "down" : "flat";
            if (dir !== atual) { flush(); trecho = [x(i - 1, L) + "," + y(pts[i - 1].valor)]; atual = dir; }
            trecho.push(x(i, L) + "," + y(pts[i].valor));
          }
          flush();
        } else {
          const d = pts.map((p, i) => (i ? "L" : "M") + x(i, L).toFixed(1) + " " + y(p.valor).toFixed(1)).join(" ");
          if (sr.area || (o.area && sr.area !== false && !sr.tracejado)) {
            const gid = "zz-grad-" + (++seq);
            svg.insertBefore(s("defs", null, s("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 },
              s("stop", { offset: "0%", "stop-color": sr.color, "stop-opacity": 0.22 }),
              s("stop", { offset: "100%", "stop-color": sr.color, "stop-opacity": 0 }))), svg.firstChild);
            const area = d + ` L${x(L - 1, L).toFixed(1)} ${m.t + ih} L${x(0, L).toFixed(1)} ${m.t + ih} Z`;
            g.appendChild(s("path", { d: area, fill: `url(#${gid})`, stroke: "none" }));
          }
          g.appendChild(s("path", { d, fill: "none", stroke: sr.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round", "stroke-dasharray": sr.tracejado ? "4 5" : null }));
          if (sr.pontos) pts.forEach((p, i) => g.appendChild(s("circle", { cx: x(i, L), cy: y(p.valor), r: 3.5, fill: p.vazio ? "#fff" : sr.color, stroke: sr.color, "stroke-width": 2 })));
        }
        const last = pts[L - 1];
        const corFim = sr.colorBySlope ? (L > 1 && last.valor < pts[0].valor ? css("--color-chart-down") : css("--color-chart-up")) : sr.color;
        g.appendChild(s("circle", { cx: x(L - 1, L), cy: y(last.valor), r: 4, fill: "#fff", stroke: corFim, "stroke-width": 2 }));
      });

      // interação
      const cursor = s("line", { y1: m.t, y2: m.t + ih, class: "line-chart__cursor", visibility: "hidden" });
      const marcadores = validas.map((sr) => s("circle", { r: 3.5, fill: sr.colorBySlope ? css("--color-chart-up") : sr.color, visibility: "hidden" }));
      svg.appendChild(cursor);
      marcadores.forEach((c) => svg.appendChild(c));
      const area = s("rect", { x: m.l, y: 0, width: iw, height: H, fill: "transparent" });
      svg.appendChild(area);

      const mostrar = (clientX) => {
        const r = svg.getBoundingClientRect();
        const rel = Math.max(0, Math.min(iw, clientX - r.left - m.l));
        const i = Math.round((rel / iw) * (n - 1));
        cursor.setAttribute("x1", x(i, n)); cursor.setAttribute("x2", x(i, n)); cursor.setAttribute("visibility", "visible");
        clear(tooltip);
        let ponto = null;
        validas.forEach((sr, k) => {
          const p = sr.points[Math.min(i, sr.points.length - 1)];
          ponto = ponto || p;
          marcadores[k].setAttribute("cx", x(Math.min(i, sr.points.length - 1), sr.points.length));
          marcadores[k].setAttribute("cy", sr._y(p.valor));
          marcadores[k].setAttribute("visibility", "visible");
          tooltip.appendChild(h("div", { class: "chart-tooltip__row" },
            h("span", { class: "chart-tooltip__dot", style: { background: sr.colorBySlope ? "var(--color-text-secondary)" : sr.color } }),
            h("span", null, sr.name), h("strong", null, o.formatValue(p.valor))));
        });
        tooltip.insertBefore(h("div", { class: "chart-tooltip__date" }, o.rotuloTooltip ? o.rotuloTooltip(ponto) : F.dataExtenso(ponto.data)), tooltip.firstChild);
        tooltip.classList.add("is-visible");
        tooltip.style.left = Math.min(Math.max(x(i, n) - tooltip.offsetWidth / 2, 0), W - tooltip.offsetWidth) + "px";
      };
      const esconder = () => {
        cursor.setAttribute("visibility", "hidden");
        marcadores.forEach((c) => c.setAttribute("visibility", "hidden"));
        tooltip.classList.remove("is-visible");
      };
      area.addEventListener("mousemove", (e) => mostrar(e.clientX));
      area.addEventListener("mouseleave", esconder);
      holder.appendChild(svg);

      if (!animado && holder.isConnected && holder.clientWidth) {
        animado = true;
        animar(parseFloat(css("--duration-chart")) || 900, (p) => clipRect.setAttribute("width", W * p));
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
  function renderDonutChart(container, segments, options) {
    const o = Object.assign({ size: 112, thickness: 15, ariaLabel: "Distribuição" }, options || {});
    clear(container);
    const c0 = o.size / 2;
    const folga = Math.max(3, Math.round(o.thickness * 0.3));
    const r = c0 - folga - o.thickness / 2;            // raio do meio do anel
    const C = 2 * Math.PI * r;
    const svg = s("svg", { width: o.size, height: o.size, viewBox: `0 0 ${o.size} ${o.size}`, role: "img", "aria-label": o.ariaLabel, class: ["donut", o.onClick ? "donut--clicavel" : ""].join(" ") });
    svg.appendChild(s("circle", { cx: c0, cy: c0, r: c0, fill: css("--color-donut-fundo") || "#F1F2F5", class: "donut__fundo" }));
    svg.appendChild(s("circle", { cx: c0, cy: c0, r: Math.max(0, r - o.thickness / 2 - folga), fill: "#fff" }));
    const g = s("g", { transform: `rotate(-90 ${c0} ${c0})` });
    svg.appendChild(g);
    const barra = (cor, offset, titulo) => {
      const arc = s("circle", {
        cx: c0, cy: c0, r, fill: "none", stroke: cor, "stroke-width": o.thickness, "stroke-linecap": "round",
        "stroke-dasharray": `0 ${C}`, "stroke-dashoffset": -offset, class: "donut__arc", visibility: "hidden",
      });
      if (titulo) arc.appendChild(s("title", { text: titulo }));
      return arc;
    };

    const arcos = [];
    if (typeof o.progresso === "number") {
      // Anel de progresso: completa de 0 até o valor (ex.: já pago / total)
      const alvo = Math.max(0, Math.min(1, o.progresso));
      const arc = barra(o.corProgresso || css("--color-progress-ok"), 0, o.tituloProgresso);
      g.appendChild(arc);
      arcos.push({ el: arc, ini: 0, len: alvo * C });
    } else {
      const validos = (segments || []).filter((sg) => F.numero(sg.valor) > 0);
      const total = validos.reduce((acc, sg) => acc + F.numero(sg.valor), 0);
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
      svg.addEventListener("click", o.onClick);
      svg.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); o.onClick(); } });
    }
    container.appendChild(svg);

    const pintar = (p) => {
      const ate = p * C;
      arcos.forEach((a) => {
        const vis = Math.max(0, Math.min(a.len, ate - a.ini));
        a.el.setAttribute("stroke-dasharray", `${vis} ${C}`);
        a.el.setAttribute("visibility", vis > 0 ? "visible" : "hidden");    // ponta redonda de barra vazia viraria um ponto
      });
    };
    if (ZoZo.charts.permitirAnimacao === false) pintar(1);
    else quandoVisivel(container, () => animar(parseFloat(css("--duration-chart")) || 900, pintar));
    return svg;
  }

  /* ================= Barras ================= */
  function renderBarChart(container, barras, options) {
    const o = Object.assign({ height: 170, ariaLabel: "Gráfico de barras" }, options || {});
    clear(container);
    const holder = h("div", { class: "bar-chart", style: { height: o.height + "px" } });
    const tooltip = h("div", { class: "chart-tooltip", role: "presentation" });
    container.classList.add("line-chart");
    container.appendChild(holder);
    container.appendChild(tooltip);

    function draw(animarAgora) {
      clear(holder);
      const W = Math.max(160, holder.clientWidth), H = o.height;
      const m = { t: 14, r: 64, b: 34, l: 8 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b;
      const max = Math.max(1, o.limite || 0, ...barras.map((b) => F.numero(b.valor))) * 1.12;
      const y = (v) => m.t + ih - (v / max) * ih;
      const passo = iw / Math.max(1, barras.length);
      const bw = Math.max(4, Math.min(18, passo * 0.45));
      const svg = s("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": o.ariaLabel, class: "line-chart__svg" });
      svg.appendChild(s("line", { x1: m.l, x2: W - m.r, y1: m.t + ih, y2: m.t + ih, class: "bar-chart__base" }));
      const rects = [];
      barras.forEach((b, i) => {
        const v = F.numero(b.valor);
        const cx = m.l + passo * i + passo / 2;
        const acima = o.limite > 0 && v > o.limite;
        const altura = Math.max(v > 0 ? 2 : 0, m.t + ih - y(v));
        const r = s("rect", { x: cx - bw / 2, y: m.t + ih, width: bw, height: 0, rx: Math.min(4, bw / 2),
          fill: acima ? css("--color-progress-over") : (b.destaque ? css("--color-primary") : css("--color-assets")), class: "bar-chart__bar" });
        rects.push({ el: r, altura });
        svg.appendChild(r);
        if (i % Math.ceil(barras.length / 6) === 0 || i === barras.length - 1) {
          rotuloDuasLinhas(svg, cx, H - 2, b.rotuloMes || b.rotulo, b.rotuloAno || "");
        }
        const alvo = s("rect", { x: cx - passo / 2, y: 0, width: passo, height: H, fill: "transparent" });
        alvo.addEventListener("mouseenter", () => {
          clear(tooltip);
          tooltip.appendChild(h("div", { class: "chart-tooltip__date" }, b.titulo || b.rotulo));
          tooltip.appendChild(h("div", { class: "chart-tooltip__row chart-tooltip__row--2" }, h("span", null, o.nomeValor || "Valor"), h("strong", null, F.moeda(v))));
          tooltip.classList.add("is-visible");
          tooltip.style.left = Math.min(Math.max(cx - tooltip.offsetWidth / 2, 0), W - tooltip.offsetWidth) + "px";
        });
        alvo.addEventListener("mouseleave", () => tooltip.classList.remove("is-visible"));
        svg.appendChild(alvo);
      });
      if (o.limite > 0) {
        const ly = y(o.limite);
        svg.appendChild(s("line", { x1: m.l, x2: W - 4, y1: ly, y2: ly, class: "bar-chart__limit" }));
        etiqueta(svg, W - 2, ly, F.moeda(o.limite));
      }
      holder.appendChild(svg);
      const pintar = (p) => rects.forEach((r) => { const a = r.altura * p; r.el.setAttribute("y", m.t + ih - a); r.el.setAttribute("height", a); });
      if (animarAgora) animar(parseFloat(css("--duration-chart")) || 900, pintar); else pintar(1);
    }

    let primeira = ZoZo.charts.permitirAnimacao !== false;
    const ro = new ResizeObserver(() => {
      if (!holder.isConnected || !holder.clientWidth) return;
      draw(primeira); primeira = false;
    });
    ro.observe(holder);
    return { destroy() { ro.disconnect(); } };
  }

  ZoZo.charts = { renderLineChart, renderDonutChart, renderBarChart, permitirAnimacao: true };
})(window.ZoZo);
