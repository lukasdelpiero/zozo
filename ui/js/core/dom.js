/* =============================================================
   ZoZo — DOM helpers
   Toda criação de elementos passa por aqui. Textos sempre entram
   como textContent / text nodes (nunca innerHTML), garantindo que
   dados do usuário nunca sejam interpretados como HTML.
   ============================================================= */
(function (ZoZo) {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  function append(parent, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach((c) => append(parent, c)); return; }
    if (child instanceof Node) { parent.appendChild(child); return; }
    parent.appendChild(document.createTextNode(String(child)));
  }

  function applyProps(el, props) {
    if (!props) return;
    Object.keys(props).forEach((key) => {
      const value = props[key];
      if (value === undefined || value === null || value === false) return;
      if (key === "class" || key === "className") {
        el.setAttribute("class", Array.isArray(value) ? value.filter(Boolean).join(" ") : value);
      } else if (key === "text") {
        el.textContent = String(value);
      } else if (key === "dataset") {
        Object.keys(value).forEach((d) => { el.dataset[d] = value[d]; });
      } else if (key === "style" && typeof value === "object") {
        Object.keys(value).forEach((s) => {
          if (s.startsWith("--")) el.style.setProperty(s, value[s]);
          else el.style[s] = value[s];
        });
      } else if (key.startsWith("on") && typeof value === "function") {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === "ref" && typeof value === "function") {
        value(el);
      } else if (value === true) {
        el.setAttribute(key, "");
      } else if (key === "value" && "value" in el) {
        el.value = value;
      } else {
        el.setAttribute(key, String(value));
      }
    });
  }

  /** h("div", { class: "x", onClick }, "texto", filho, [filhos]) */
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    applyProps(el, props);
    append(el, children);
    return el;
  }

  /** Elemento SVG */
  function s(tag, props, ...children) {
    const el = document.createElementNS(SVG_NS, tag);
    if (props) {
      Object.keys(props).forEach((key) => {
        const value = props[key];
        if (value === undefined || value === null || value === false) return;
        if (key === "class") el.setAttribute("class", value);
        else if (key === "text") el.textContent = String(value);
        else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
        else el.setAttribute(key, String(value));
      });
    }
    append(el, children);
    return el;
  }

  function clear(el) {
    while (el && el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  function mount(el, ...children) {
    clear(el);
    append(el, children);
    return el;
  }

  let uid = 0;
  function id(prefix) { uid += 1; return (prefix || "zz") + "-" + uid; }

  ZoZo.dom = { h, s, clear, mount, append, id };
})(window.ZoZo = window.ZoZo || {});
