/* =============================================================
   ZoZo — Ícones
   Uma única família de traço (24×24, stroke 1.75, cantos
   arredondados). Os desenhos são estáticos e locais (offline).
   TypeScript: tipos da API em src/globais.d.ts (ZoZoIcons).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const { s } = ZoZo.dom;

  // Cada ícone: lista de [tag, atributos]
  type Desenho = [tag: string, atributos: Record<string, string | number>];
  const P = (d: string): Desenho => ["path", { d }];
  const ICONS: Record<string, Desenho[]> = {
    // "Z" vazado: contorno na cor do texto (cinza) ou roxo quando selecionado
    dashboard: [["path", { d: "M5 4h14v3.2L10.4 17H19v3H5v-3.2L13.6 7H5z" }]],
    enviar: [P("M12 19V5"), P("m5 12 7-7 7 7")],
    clipe: [P("m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48")],
    lancamentos: [
      P("m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"),
      P("m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"),
      P("m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"),
    ],
    contas: [["rect", { x: 2, y: 5, width: 20, height: 14, rx: 2 }], P("M2 10h20")],
    investimentos: [P("M22 7 13.5 15.5 8.5 10.5 2 17"), P("M16 7h6v6")],
    categorias: [P("M21.21 15.89A10 10 0 1 1 8 2.83"), P("M22 12A10 10 0 0 0 12 2v10z")],
    recorrencias: [P("m17 2 4 4-4 4"), P("M3 11v-1a4 4 0 0 1 4-4h14"), P("m7 22-4-4 4-4"), P("M21 13v1a4 4 0 0 1-4 4H3")],
    perfil: [["circle", { cx: 12, cy: 8, r: 5 }], P("M20 21a8 8 0 0 0-16 0")],
    tag: [
      P("M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"),
      ["circle", { cx: 7.5, cy: 7.5, r: 0.5, fill: "currentColor" }],
    ],
    configuracoes: [
      P("M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"),
      ["circle", { cx: 12, cy: 12, r: 3 }],
    ],
    atualizar: [P("M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"), P("M21 3v5h-5"), P("M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"), P("M8 16H3v5")],
    mais: [P("M5 12h14"), P("M12 5v14")],
    menos: [P("M5 12h14")],
    pesquisar: [["circle", { cx: 11, cy: 11, r: 8 }], P("m21 21-4.3-4.3")],
    filtrar: [P("M3 6h18"), P("M7 12h10"), P("M10 18h4")],
    fechar: [P("M18 6 6 18"), P("m6 6 12 12")],
    opcoes: [["circle", { cx: 12, cy: 12, r: 1 }], ["circle", { cx: 19, cy: 12, r: 1 }], ["circle", { cx: 5, cy: 12, r: 1 }]],
    "chevron-down": [P("m6 9 6 6 6-6")],
    "chevron-right": [P("m9 18 6-6-6-6")],
    banco: [P("M3 22h18"), P("M6 18v-7"), P("M10 18v-7"), P("M14 18v-7"), P("M18 18v-7"), P("M12 2 20 7H4z")],
    cartao: [["rect", { x: 2, y: 5, width: 20, height: 14, rx: 2 }], P("M2 10h20"), P("M6 15h4")],
    emprestimo: [["rect", { x: 2, y: 6, width: 20, height: 12, rx: 2 }], ["circle", { cx: 12, cy: 12, r: 2 }], P("M6 12h.01"), P("M18 12h.01")],
    carteira: [
      P("M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"),
      P("M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"),
    ],
    boleto: [P("M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"), P("M14 2v4a2 2 0 0 0 2 2h4"), P("M16 13H8"), P("M16 17H8"), P("M10 9H8")],
    imprimir: [P("M6 9V2h12v7"), P("M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"), ["rect", { x: 6, y: 14, width: 12, height: 8 }]],
    excluir: [P("M3 6h18"), P("M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"), P("M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2")],
    check: [P("M20 6 9 17l-5-5")],
    sair: [P("M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"), P("m16 17 5-5-5-5"), P("M21 12H9")],
    nuvem: [P("M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z")],
    alerta: [["circle", { cx: 12, cy: 12, r: 10 }], P("M12 8v4"), P("M12 16h.01")],
    "seta-sobe": [P("M7 7h10v10"), P("M7 17 17 7")],
    "seta-desce": [P("m7 7 10 10"), P("M17 7v10H7")],
    igual: [P("M5 9h14"), P("M5 15h14")],
    calendario: [["rect", { x: 3, y: 4, width: 18, height: 18, rx: 2 }], P("M16 2v4"), P("M8 2v4"), P("M3 10h18")],
    olho: [P("M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"), ["circle", { cx: 12, cy: 12, r: 3 }]],
    "olho-fechado": [
      P("M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"),
      P("M14.084 14.158a3 3 0 0 1-4.242-4.242"),
      P("M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"),
      P("m2 2 20 20"),
    ],
    interno: [P("M8 3 4 7l4 4"), P("M4 7h16"), P("m16 21 4-4-4-4"), P("M20 17H4")],
    receita: [P("M12 19V5"), P("m5 12 7-7 7 7")],     // entra dinheiro: seta para cima
    regular: [P("M12 5v14"), P("m19 12-7 7-7-7")],     // sai dinheiro: seta para baixo
    "seta-voltar": [P("m12 19-7-7 7-7"), P("M19 12H5")],
    "baixar-circulo": [["circle", { cx: 12, cy: 12, r: 9.5 }], P("M12 7.5v8.5"), P("m8.5 12.5 3.5 3.5 3.5-3.5")],
    dividir: [P("M16 3h5v5"), P("M8 3H3v5"), P("M12 22v-8.3a4 4 0 0 0-1.17-2.83L3 3"), P("m15 9 6-6")],   // seta de divisão
    info: [["circle", { cx: 12, cy: 12, r: 9.5 }], P("M12 11v5.5"), P("M12 7.6v.2")],
    painel: [["rect", { x: 3, y: 4, width: 18, height: 16, rx: 3 }], P("M9 4v16"), P("M5.5 8h1.5"), P("M5.5 11h1.5")],
    selecionar: [["rect", { x: 3, y: 3, width: 18, height: 18, rx: 4 }], P("m8 12 3 3 5-6")],
    camera: [P("M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"), ["circle", { cx: 12, cy: 13, r: 3 }]],
    baixar: [P("M12 15V3"), P("m7 10 5 5 5-5"), P("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4")],
    arquivar: [["rect", { x: 2, y: 3, width: 20, height: 5, rx: 1 }], P("M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"), P("M10 12h4")],
    desarquivar: [["rect", { x: 2, y: 3, width: 20, height: 5, rx: 1 }], P("M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"), P("m9 15 3-3 3 3"), P("M12 12v6")],
    "chevron-left": [P("m15 18-6-6 6-6")],
    ordenar: [P("m3 16 4 4 4-4"), P("M7 20V4"), P("m21 8-4-4-4 4"), P("M17 4v16")],
    copiar: [P("M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z"), P("M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2")],
    nota: [P("M12 20h9"), P("M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z")],
  };

  function icon(name: string, opts?: OpcoesIcone): SVGElement {
    const o = opts || {};
    const size = o.size || 16;
    const def = ICONS[name] || ICONS.alerta;
    const svg = s("svg", {
      class: "icon" + (o.class ? " " + o.class : ""),
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": o.stroke || 1.75,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
      focusable: "false",
    });
    def.forEach(([tag, attrs]) => svg.appendChild(s(tag, attrs)));
    return svg;
  }

  const api: ZoZoIcons = { icon, names: Object.keys(ICONS) };
  ZoZo.icons = api;
})(window.ZoZo);
