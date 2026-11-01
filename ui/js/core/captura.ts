/* =============================================================
   ZoZo — Captura de um elemento da tela em PNG (fatura e páginas de Design)
   Sem biblioteca e dentro da CSP (img-src 'self' data:): a marcação é gerada à parte (nunca vai para a página),
   cada elemento com os seus estilos calculados; imagens e fontes vão embutidas (data:) e o SVG com foreignObject
   vira PNG num canvas, em dobro para ficar nítido. Nada sai do aparelho.
   Limites: pseudo-elementos (::before/::after) e o conteúdo de <canvas> não entram.
   TypeScript: tipos em src/globais.d.ts (ZoZoCaptura).
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";
  const { h } = ZoZo.dom;
  const XHTML = "http://www.w3.org/1999/xhtml", SVG_NS = "http://www.w3.org/2000/svg";
  const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function emDataUrl(url: string): Promise<string> {
    return fetch(url).then((r) => r.blob()).then((b) => new Promise<string>((ok, falha) => {
      const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => falha(fr.error); fr.readAsDataURL(b);
    }));
  }

  /** As @font-face da página (Matter), com o arquivo embutido: dentro da imagem não se baixa nada (guardadas para a próxima) */
  let fontes: Promise<string> | null = null;
  function fontesEmbutidas(): Promise<string> {
    if (fontes) return fontes;
    fontes = (async () => {
      const saida: string[] = [];
      const visitar = async (regras: CSSRuleList, base: string) => {
        for (const r of Array.from(regras)) {
          if (r instanceof CSSFontFaceRule) {
            const m = /url\(["']?([^"')]+)["']?\)/.exec(r.style.getPropertyValue("src"));
            if (m) { try { saida.push(r.cssText.replace(m[0], 'url("' + await emDataUrl(new URL(m[1], base).href) + '")')); } catch { /* sem a fonte: a do sistema */ } }
          } else if ("cssRules" in r) await visitar((r as CSSGroupingRule).cssRules, base);
        }
      };
      for (const folha of Array.from(document.styleSheets)) {
        let regras: CSSRuleList | null = null;
        try { regras = folha.cssRules; } catch { regras = null; }       // folha de outro site: não dá para ler
        if (regras) await visitar(regras, folha.href || location.href);
      }
      return saida.join("\n");
    })();
    return fontes;
  }

  /** Marcação XHTML/SVG do nó com os estilos calculados (texto sempre escapado; nada de HTML vindo dos dados) */
  async function marcacao(no: Node, raiz: boolean, semSombra = false): Promise<string> {
    if (no.nodeType === Node.TEXT_NODE) return escapar(no.textContent || "");
    if (!(no instanceof Element)) return "";
    const svg = no.namespaceURI === SVG_NS, tag = no.localName;
    if (!svg && /^(script|style|template|canvas)$/.test(tag)) return "";
    let attrs = "";
    if (svg) Array.from(no.attributes).forEach((a) => { if (!/^on/i.test(a.name)) attrs += " " + a.name + '="' + escapar(a.value) + '"'; });
    else {
      const cs = getComputedStyle(no);
      let css = "";
      for (let i = 0; i < cs.length; i++) css += cs[i] + ":" + cs.getPropertyValue(cs[i]) + ";";
      if (raiz) css += "position:relative;left:auto;top:auto;right:auto;bottom:auto;margin:0;" + (semSombra ? "box-shadow:none;" : "");   // na imagem, no canto
      attrs += ' style="' + escapar(css) + '"';
      if (no instanceof HTMLImageElement && no.src) attrs += ' src="' + escapar(await emDataUrl(no.src).catch(() => "")) + '"';
      if (no instanceof HTMLInputElement || no instanceof HTMLTextAreaElement) attrs += ' value="' + escapar(no.value) + '"';
      ["width", "height", "colspan", "alt", "placeholder", "type"].forEach((n) => { const v = no.getAttribute(n); if (v !== null) attrs += " " + n + '="' + escapar(v) + '"'; });
    }
    if (tag === "svg") attrs += ' xmlns="' + SVG_NS + '"';
    let filhos = "";
    if (no instanceof HTMLTextAreaElement) filhos = escapar(no.value);
    else for (const f of Array.from(no.childNodes)) filhos += await marcacao(f, false);
    return !svg && /^(img|br|hr|input)$/.test(tag) ? "<" + tag + attrs + "/>" : "<" + tag + attrs + ">" + filhos + "</" + tag + ">";
  }

  /** PNG do elemento (que precisa estar na página): o arquivo é baixado com o nome pedido */
  async function png(el: HTMLElement, nomeArquivo: string, opts?: { fundo?: string; escala?: number; semSombra?: boolean }): Promise<void> {
    const o = opts || {};
    await Promise.all(Array.from(el.querySelectorAll("img")).map((i) => i.decode().catch(() => null)));
    const caixa = el.getBoundingClientRect();
    const larg = Math.ceil(caixa.width), alt = Math.ceil(caixa.height);
    const corpo = await marcacao(el, true, !!o.semSombra);
    const css = await fontesEmbutidas();
    const svg = '<svg xmlns="' + SVG_NS + '" width="' + larg + '" height="' + alt + '"><defs><style>' + escapar(css).replace(/&quot;/g, '"') + "</style></defs>"
      + '<foreignObject x="0" y="0" width="' + larg + '" height="' + alt + '"><div xmlns="' + XHTML + '">' + corpo + "</div></foreignObject></svg>";
    const imagem = new Image();
    imagem.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    await imagem.decode();
    const escala = o.escala || 2, canvas = document.createElement("canvas");
    canvas.width = larg * escala; canvas.height = alt * escala;
    const c2d = canvas.getContext("2d");
    if (!c2d) throw new Error("canvas");
    c2d.fillStyle = o.fundo || "#ffffff"; c2d.fillRect(0, 0, canvas.width, canvas.height);
    c2d.scale(escala, escala);
    c2d.drawImage(imagem, 0, 0);
    const blob = await new Promise<Blob>((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error("png"))), "image/png"));
    baixar(blob, nomeArquivo);
  }

  /** Baixa um arquivo gerado no aparelho (nada vai ao servidor) */
  function baixar(conteudo: Blob, nomeArquivo: string) {
    const url = URL.createObjectURL(conteudo);
    const a = h("a", { href: url, download: nomeArquivo, rel: "noopener" });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  ZoZo.captura = { png, baixar };
})(window.ZoZo);
