/* =============================================================
   ZoZo — símbolo da moeda e "%" menores, alinhados ao topo do número
   ------------------------------------------------------------
   Em qualquer valor mostrado na tela ("R$ 214.292" → "R$" pequeno no alto, colado ao número;
   "0,17%" → "%" um pouco menor no alto), sem mexer em cada lugar que formata dinheiro:
   um observador olha só os textos novos e troca o símbolo por um <span>. Fica de fora o que
   não pode ter <span> (campos, <option>, SVG dos gráficos) e o que pede [data-sem-simbolo].
   O texto lido pelo leitor de tela continua o mesmo ("R$" e o número).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";

  // símbolo pequeno (62%) e levantado até o topo dele encostar no topo dos algarismos
  const CLASSE_MOEDA = "moeda-simbolo tw:relative tw:top-[-0.43em] tw:text-[0.62em] tw:mr-[0.06em]";
  const CLASSE_PCT = "pct-simbolo tw:relative tw:top-[-0.2em] tw:text-[0.78em] tw:ml-[0.04em]";
  // "R$ 10", "-R$ 10", "€ 10", "$ 10" (o espaço depois do símbolo sai) e "12,5%"
  const PADRAO = /(R\$|€|\$)\s?(?=\d)|(\d)%/g;
  const PULAR = new Set(["SCRIPT", "STYLE", "TEXTAREA", "OPTION", "SELECT", "INPUT", "TITLE", "NOSCRIPT"]);

  function podeMexer(el: Element | null): boolean {
    for (let e = el; e; e = e.parentElement) {
      if (PULAR.has(e.tagName) || e instanceof SVGElement || e.hasAttribute("data-sem-simbolo") || (e as HTMLElement).isContentEditable) return false;
      if (e.classList.contains("moeda-simbolo") || e.classList.contains("pct-simbolo")) return false;
    }
    return true;
  }

  function trocarTexto(no: Text): void {
    const t = no.data;
    PADRAO.lastIndex = 0;
    if (!PADRAO.test(t) || !podeMexer(no.parentElement)) return;
    PADRAO.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let resto = 0, m: RegExpExecArray | null;
    while ((m = PADRAO.exec(t))) {
      if (m[1]) {
        frag.append(t.slice(resto, m.index));
        const sp = document.createElement("span"); sp.className = CLASSE_MOEDA; sp.textContent = m[1];
        frag.append(sp);
      } else {
        frag.append(t.slice(resto, m.index + 1));          // o algarismo fica no texto
        const sp = document.createElement("span"); sp.className = CLASSE_PCT; sp.textContent = "%";
        frag.append(sp);
      }
      resto = m.index + m[0].length;
    }
    frag.append(t.slice(resto));
    no.replaceWith(frag);
  }

  /** Formata os símbolos de um trecho da página (o observador chama sozinho para o que entra depois) */
  function realcar(raiz: Node): void {
    if (raiz.nodeType === Node.TEXT_NODE) { trocarTexto(raiz as Text); return; }
    if (raiz.nodeType !== Node.ELEMENT_NODE && raiz.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    if (raiz.nodeType === Node.ELEMENT_NODE && !podeMexer(raiz as Element)) return;
    const textos: Text[] = [];
    const andar = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    for (let n = andar.nextNode(); n; n = andar.nextNode()) if (/[$€%]/.test((n as Text).data)) textos.push(n as Text);
    textos.forEach(trocarTexto);
  }

  function iniciar() {
    realcar(document.body);
    new MutationObserver((mudancas) => {
      for (const m of mudancas) {
        if (m.type === "characterData") realcar(m.target);
        else m.addedNodes.forEach((n) => { if (n.isConnected) realcar(n); });
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.body) iniciar(); else document.addEventListener("DOMContentLoaded", iniciar, { once: true });

  ZoZo.simbolos = { realcar };
})(window.ZoZo);
