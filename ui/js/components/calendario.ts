/* =============================================================
   ZoZo — Calendário (escolher uma data)
   ------------------------------------------------------------
   Substitui o calendário nativo do navegador (que não aceita estilo):
   cantos arredondados do ZoZo, roxo no dia escolhido e ao passar o
   mouse, "Hoje" no rodapé. Abre como menu suspenso (Esc e clique fora
   fecham). Teclado: setas andam pelos dias, PageUp/PageDown trocam o mês.

   ZoZo.calendario.abrir(anchor, "2026-10-10", (iso) => { … }, { posicao })
   ZoZo.calendario.Campo({ valor, rotulo, aoMudar })  → botão com a data (dd/mm/aaaa)
   TypeScript: tipos em src/globais.d.ts (ZoZoCalendario).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const { h, mount } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const F = ZoZo.format;
  const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
  const pad = (n: number) => String(n).padStart(2, "0");
  const isoDe = (a: number, m: number, d: number) => a + "-" + pad(m + 1) + "-" + pad(d);

  /* Classes (Tailwind); is-selected e is-hoje ficam como estado dos dias */
  const FONTE_HERDADA = "tw:[font-family:inherit] tw:[font-style:inherit] tw:[line-height:inherit]";
  const T = {
    cal: "tw:grid tw:gap-2",
    topo: "tw:flex tw:items-center tw:justify-between tw:gap-1.5",
    titulo: "tw:text-[15px] tw:font-[550] tw:capitalize",
    grade: "tw:grid tw:grid-cols-[repeat(7,1fr)] tw:gap-0.5",
    semana: "tw:grid tw:place-items-center tw:h-[26px] tw:text-[11px] tw:font-[600] tw:text-zz-muted",
    // dia: roxo claro ao passar o mouse; o escolhido em roxo cheio; hoje em roxo (negrito)
    dia: "tw:h-[34px] tw:[border:0] tw:rounded-lg tw:bg-transparent tw:cursor-pointer " + FONTE_HERDADA + " tw:text-[13px] tw:font-[450] tw:text-zz-text "
      + "tw:[transition:background-color_120ms_var(--easing),color_120ms_var(--easing)] "
      + "tw:[&:not(.is-selected):hover]:bg-zz-primary-soft tw:[&:not(.is-selected):hover]:text-zz-primary "
      + "tw:[&.is-hoje:not(.is-selected)]:font-[650] tw:[&.is-hoje:not(.is-selected)]:text-zz-primary "
      + "tw:[&.is-selected]:bg-zz-primary tw:[&.is-selected]:text-white tw:[&.is-selected]:font-[600] "
      + "tw:focus-visible:outline-2 tw:focus-visible:outline-zz-primary tw:focus-visible:outline-offset-1",
    rodape: "tw:flex tw:justify-end tw:border-t tw:border-t-zz-border tw:pt-2",
    hoje: "tw:[border:0] tw:bg-transparent tw:rounded-lg tw:py-1 tw:px-2.5 " + FONTE_HERDADA + " tw:text-[13px] tw:font-[550] tw:text-zz-primary tw:cursor-pointer "
      + "tw:hover:bg-zz-primary-soft",
  };

  function abrir(anchor: HTMLElement, valor: string | null | undefined, aoEscolher: (iso: string) => void, opts?: OpcoesCalendario): void {
    const o = opts || {};
    const atual = F.parseData(valor);
    const base = atual || new Date();
    let ano = base.getFullYear(), mes = base.getMonth();
    const hoje = F.iso(new Date());

    ZoZo.menu.abrir(anchor, { largura: 280, render(el: HTMLElement, api: { fechar(): void }) {
      const titulo = h("span", { class: T.titulo, "aria-live": "polite" });
      const grade = h("div", { class: T.grade, role: "group", "aria-label": "Dias do mês" });
      const escolher = (iso: string) => { api.fechar(); if (iso !== valor) aoEscolher(iso); };
      const dia = (n: number) => grade.querySelector<HTMLElement>('[data-dia="' + n + '"]');

      function desenhar(focarDia?: number | null) {
        titulo.textContent = F.mesNome(mes) + " " + ano;
        const vazios = new Date(ano, mes, 1).getDay();
        const total = new Date(ano, mes + 1, 0).getDate();
        const celulas = SEMANA.map((s) => h("span", { class: T.semana, "aria-hidden": "true" }, s));
        for (let i = 0; i < vazios; i++) celulas.push(h("span", { "aria-hidden": "true" }));
        for (let dia = 1; dia <= total; dia++) {
          const iso = isoDe(ano, mes, dia);
          // nome acessível começa pelo número visível (WCAG 2.5.3): "1 de outubro de 2026"
          celulas.push(h("button", { type: "button", class: [T.dia, iso === valor && "is-selected", iso === hoje && "is-hoje"],
            "data-dia": String(dia), "aria-label": dia + " de " + F.mesNome(mes).toLowerCase() + " de " + ano,
            "aria-pressed": String(iso === valor), onClick: () => escolher(iso) }, String(dia)));
        }
        mount(grade, celulas);
        if (focarDia) { const b = dia(Math.min(focarDia, total)); if (b) b.focus(); }
      }
      function trocarMes(delta: number, focarDia?: number | null) {
        mes += delta;
        if (mes < 0) { mes = 11; ano -= 1; }
        if (mes > 11) { mes = 0; ano += 1; }
        desenhar(focarDia);
      }
      grade.addEventListener("keydown", (e) => {
        const b = (e.target as Element).closest<HTMLElement>("[data-dia]");
        if (!b) return;
        const atualDia = Number(b.dataset.dia), total = new Date(ano, mes + 1, 0).getDate();
        const passo = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[e.key];
        if (passo) {
          e.preventDefault();
          const alvo = atualDia + passo;
          if (alvo < 1) trocarMes(-1, new Date(ano, mes, 0).getDate() + alvo);
          else if (alvo > total) trocarMes(1, alvo - total);
          else dia(alvo)?.focus();
        } else if (e.key === "PageUp" || e.key === "PageDown") {
          e.preventDefault(); trocarMes(e.key === "PageUp" ? -1 : 1, atualDia);
        }
      });

      mount(el, h("div", { class: T.cal },
        h("div", { class: T.topo },
          h("button", { type: "button", class: ZoZo.pecasFn.botaoIcone("", true), "aria-label": "Mês anterior", onClick: () => trocarMes(-1) }, icon("chevron-left", { size: 15 })),
          titulo,
          h("button", { type: "button", class: ZoZo.pecasFn.botaoIcone("", true), "aria-label": "Próximo mês", onClick: () => trocarMes(1) }, icon("chevron-right", { size: 15 }))),
        grade,
        h("div", { class: T.rodape }, h("button", { type: "button", class: T.hoje, onClick: () => escolher(hoje) }, "Hoje"))));
      desenhar(atual && atual.getFullYear() === ano && atual.getMonth() === mes ? atual.getDate() : null);
      if (!grade.contains(document.activeElement)) requestAnimationFrame(() => { const f = grade.querySelector<HTMLElement>(".is-selected, .is-hoje, [data-dia]"); if (f) f.focus(); });
    } }, { posicao: o.posicao || "esquerda", label: o.rotulo || "Calendário", focar: false, class: ZoZo.estrutura.menuCalendario, papel: "dialog" });
  }

  /** Campo de data (botão com dd/mm/aaaa) que abre o calendário */
  function Campo(cfg: CampoData): HTMLElement {
    let valor = cfg.valor;
    const texto = () => { const d = F.parseData(valor); return d ? pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() : "Escolher data"; };
    // campo com a cara de um input; o ícone do calendário à direita
    // nome acessível = data visível + o rótulo do campo (WCAG 2.5.3: quem fala o que vê consegue acionar)
    const nome = () => texto() + ", " + (cfg.rotulo || "data");
    const btn = h("button", { type: "button", class: [ZoZo.pecas.entrada, "tw:inline-flex tw:items-center tw:justify-between tw:gap-2 tw:cursor-pointer tw:text-left tw:[&_.icon]:text-zz-secondary tw:[&_.icon]:flex-none", cfg.classe], "aria-haspopup": "dialog", "aria-label": nome() },
      h("span", null, texto()), icon("calendario", { size: 15 }));
    btn.addEventListener("click", () => abrir(btn, valor, (iso) => { valor = iso; btn.firstChild!.textContent = texto(); btn.setAttribute("aria-label", nome()); cfg.aoMudar(iso); }, { rotulo: cfg.rotulo }));
    return btn;
  }

  const api: ZoZoCalendario = { abrir, Campo };
  ZoZo.calendario = api;
})(window.ZoZo);
