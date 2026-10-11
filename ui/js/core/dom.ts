/* =============================================================
   ZoZo — DOM helpers
   Toda criação de elementos passa por aqui. Textos sempre entram
   como textContent / text nodes (nunca innerHTML), garantindo que
   dados do usuário nunca sejam interpretados como HTML.
   Defesa extra (CSP já bloqueia, mas aqui nem chega ao navegador):
   • atributo "on…" só aceita FUNÇÃO (vira addEventListener) — texto
     é ignorado, então nunca nasce um onclick="…";
   • href/src/action/formaction/xlink:href com "javascript:" (ou
     "vbscript:") são descartados.
   TypeScript: tipos da API em src/globais.d.ts (ZoZoDom).
   É o primeiro módulo carregado: cria window.ZoZo.
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const ATRIBUTOS_URL = new Set(["href", "src", "action", "formaction", "xlink:href"]);
  // remove espaços e caracteres de controle que o navegador ignora antes do esquema (ex.: "java\tscript:")
  const URL_PERIGOSA = /^(?:javascript|vbscript):/i;
  const urlPerigosa = (valor: unknown) => URL_PERIGOSA.test(String(valor).replace(/[\u0000- \u007f]/g, ""));

  function append(parent: Node, child: FilhoDom): void {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach((c) => append(parent, c)); return; }
    if (child instanceof Node) { parent.appendChild(child); return; }
    parent.appendChild(document.createTextNode(String(child)));
  }

  /** Atributo comum: "on…" sem função e URL com esquema de script não entram */
  function atributo(el: Element, key: string, value: unknown): void {
    if (/^on/i.test(key)) return;
    if (ATRIBUTOS_URL.has(key.toLowerCase()) && urlPerigosa(value)) return;
    el.setAttribute(key, value === true ? "" : String(value));
  }

  function applyProps(el: HTMLElement, props: PropsDom): void {
    if (!props) return;
    Object.keys(props).forEach((key) => {
      const value = props[key];
      if (value === undefined || value === null || value === false) return;
      if (key === "class" || key === "className") {
        el.setAttribute("class", Array.isArray(value) ? value.filter(Boolean).join(" ") : String(value));
      } else if (key === "text") {
        el.textContent = String(value);
      } else if (key === "dataset" && typeof value === "object") {
        const dados = value as Record<string, unknown>;
        Object.keys(dados).forEach((d) => { el.dataset[d] = String(dados[d]); });
      } else if (key === "style" && typeof value === "object") {
        const estilo = value as Record<string, string>;
        Object.keys(estilo).forEach((s) => {
          if (s.startsWith("--")) el.style.setProperty(s, estilo[s]);
          else (el.style as unknown as Record<string, string>)[s] = estilo[s];
        });
      } else if (key.startsWith("on") && typeof value === "function") {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (key === "ref" && typeof value === "function") {
        (value as (e: HTMLElement) => void)(el);
      } else if (value === true) {
        atributo(el, key, true);
      } else if (key === "value" && "value" in el) {
        (el as HTMLInputElement).value = String(value);
      } else {
        atributo(el, key, value);
      }
    });
  }

  /** h("div", { class: "x", onClick }, "texto", filho, [filhos]) */
  function h(tag: string, props?: PropsDom, ...children: FilhoDom[]): HTMLElement {
    const el = document.createElement(tag);
    applyProps(el, props);
    append(el, children);
    return el;
  }

  /** Elemento SVG */
  function s(tag: string, props?: PropsDom, ...children: FilhoDom[]): SVGElement {
    const el = document.createElementNS(SVG_NS, tag) as SVGElement;
    if (props) {
      Object.keys(props).forEach((key) => {
        const value = props[key];
        if (value === undefined || value === null || value === false) return;
        if (key === "class") el.setAttribute("class", Array.isArray(value) ? value.filter(Boolean).join(" ") : String(value));
        else if (key === "text") el.textContent = String(value);
        else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
        else atributo(el, key, value);
      });
    }
    append(el, children);
    return el;
  }

  function clear<T extends Node | null | undefined>(el: T): T {
    while (el && el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  function mount<T extends Node>(el: T, ...children: FilhoDom[]): T {
    clear(el);
    append(el, children);
    return el;
  }

  let uid = 0;
  function id(prefix?: string): string { uid += 1; return (prefix || "zz") + "-" + uid; }

  const api: ZoZoDom = { h, s, clear, mount, append, id };
  ZoZo.dom = api;
})((window.ZoZo = window.ZoZo || ({} as ZoZoGlobal)));
