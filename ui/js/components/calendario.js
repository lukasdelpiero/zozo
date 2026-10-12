/* =============================================================
   ZoZo — Calendário (escolher uma data)
   ------------------------------------------------------------
   Substitui o calendário nativo do navegador (que não aceita estilo):
   cantos arredondados do ZoZo, roxo no dia escolhido e ao passar o
   mouse, "Hoje" no rodapé. Abre como menu suspenso (Esc e clique fora
   fecham). Teclado: setas andam pelos dias, PageUp/PageDown trocam o mês.

   ZoZo.calendario.abrir(anchor, "2026-10-10", (iso) => { … }, { posicao })
   ZoZo.calendario.Campo({ valor, rotulo, aoMudar })  → botão com a data (dd/mm/aaaa)
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h, mount } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const F = ZoZo.format;
  const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
  const pad = (n) => String(n).padStart(2, "0");
  const isoDe = (a, m, d) => a + "-" + pad(m + 1) + "-" + pad(d);

  function abrir(anchor, valor, aoEscolher, opts) {
    const o = opts || {};
    const atual = F.parseData(valor);
    const base = atual || new Date();
    let ano = base.getFullYear(), mes = base.getMonth();
    const hoje = F.iso(new Date());

    ZoZo.menu.abrir(anchor, { largura: 280, render(el, api) {
      const titulo = h("span", { class: "cal__titulo", "aria-live": "polite" });
      const grade = h("div", { class: "cal__grade", role: "group", "aria-label": "Dias do mês" });
      const escolher = (iso) => { api.fechar(); if (iso !== valor) aoEscolher(iso); };

      function desenhar(focarDia) {
        titulo.textContent = F.mesNome(mes) + " " + ano;
        const vazios = new Date(ano, mes, 1).getDay();
        const total = new Date(ano, mes + 1, 0).getDate();
        const celulas = SEMANA.map((s) => h("span", { class: "cal__semana", "aria-hidden": "true" }, s));
        for (let i = 0; i < vazios; i++) celulas.push(h("span", { class: "cal__vazio", "aria-hidden": "true" }));
        for (let dia = 1; dia <= total; dia++) {
          const iso = isoDe(ano, mes, dia);
          celulas.push(h("button", { type: "button", class: ["cal__dia", iso === valor && "is-selected", iso === hoje && "is-hoje"],
            "data-dia": String(dia), "aria-label": F.dataExtenso(iso), "aria-pressed": String(iso === valor), onClick: () => escolher(iso) }, String(dia)));
        }
        mount(grade, celulas);
        if (focarDia) { const b = grade.querySelector('[data-dia="' + Math.min(focarDia, total) + '"]'); if (b) b.focus(); }
      }
      function trocarMes(delta, focarDia) {
        mes += delta;
        if (mes < 0) { mes = 11; ano -= 1; }
        if (mes > 11) { mes = 0; ano += 1; }
        desenhar(focarDia);
      }
      grade.addEventListener("keydown", (e) => {
        const b = e.target.closest(".cal__dia");
        if (!b) return;
        const dia = Number(b.dataset.dia), total = new Date(ano, mes + 1, 0).getDate();
        const passo = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
        if (passo) {
          e.preventDefault();
          const alvo = dia + passo;
          if (alvo < 1) trocarMes(-1, new Date(ano, mes, 0).getDate() + alvo);
          else if (alvo > total) trocarMes(1, alvo - total);
          else grade.querySelector('[data-dia="' + alvo + '"]').focus();
        } else if (e.key === "PageUp" || e.key === "PageDown") {
          e.preventDefault(); trocarMes(e.key === "PageUp" ? -1 : 1, dia);
        }
      });

      mount(el, h("div", { class: "cal" },
        h("div", { class: "cal__topo" },
          h("button", { type: "button", class: "icon-btn icon-btn--sm cal__nav", "aria-label": "Mês anterior", onClick: () => trocarMes(-1) }, icon("chevron-left", { size: 15 })),
          titulo,
          h("button", { type: "button", class: "icon-btn icon-btn--sm cal__nav", "aria-label": "Próximo mês", onClick: () => trocarMes(1) }, icon("chevron-right", { size: 15 }))),
        grade,
        h("div", { class: "cal__rodape" }, h("button", { type: "button", class: "cal__hoje", onClick: () => escolher(hoje) }, "Hoje"))));
      desenhar(atual && atual.getFullYear() === ano && atual.getMonth() === mes ? atual.getDate() : null);
      if (!grade.contains(document.activeElement)) requestAnimationFrame(() => { const f = grade.querySelector(".is-selected, .is-hoje, .cal__dia"); if (f) f.focus(); });
    } }, { posicao: o.posicao || "esquerda", label: o.rotulo || "Calendário", focar: false, class: ZoZo.estrutura.menuCalendario });
  }

  /** Campo de data (botão com dd/mm/aaaa) que abre o calendário */
  function Campo(cfg) {
    let valor = cfg.valor;
    const texto = () => { const d = F.parseData(valor); return d ? pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() : "Escolher data"; };
    const btn = h("button", { type: "button", class: ["input", "cal-campo", cfg.classe], "aria-haspopup": "dialog", "aria-label": cfg.rotulo || "Data" },
      h("span", null, texto()), icon("calendario", { size: 15 }));
    btn.addEventListener("click", () => abrir(btn, valor, (iso) => { valor = iso; btn.firstChild.textContent = texto(); cfg.aoMudar(iso); }, { rotulo: cfg.rotulo }));
    return btn;
  }

  ZoZo.calendario = { abrir, Campo };
})(window.ZoZo);
