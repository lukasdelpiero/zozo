/* =============================================================
   ZoZo — build da interface (Vite + TypeScript + Tailwind CSS)
   ------------------------------------------------------------
   npm run dev     → http://127.0.0.1:5173  (a API vem do servidor local: python api/dev/servidor_local.py;
                     sem servidor: Modo teste › "Simular cadastro e login sem servidor")
   npm run build   → api/public (o que o Cloudflare publica; substitui o antigo montar_interface.py)

   O build:
   • junta tudo em 1 JS + 1 CSS com impressão digital no nome (cache longo);
   • gera api/public/_headers com os cabeçalhos de segurança (api/cabecalhos_ui.json).
   ============================================================= */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";

const raiz = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const PASTA_PACOTES = "static";            // JS, CSS e fontes com hash no nome (imutáveis)

function cabecalhosSeguranca(): Record<string, string> {
  const json = JSON.parse(readFileSync(raiz("./api/cabecalhos_ui.json"), "utf8")) as Record<string, string>;
  return Object.fromEntries(Object.entries(json).filter(([k]) => !k.startsWith("_")));
}

function zozo(): Plugin {
  let comando: "build" | "serve" = "serve";
  return {
    name: "zozo",
    configResolved(c) { comando = c.command; },

    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        // Servidor de desenvolvimento: o Vite injeta o CSS com <style> (recarga instantânea).
        // Só aqui o CSP aceita estilo embutido; o site publicado continua com style-src 'self'.
        if (!ctx.bundle) return html.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'");
        // Publicado: pré-carrega as duas fontes usadas no primeiro desenho da tela
        const fontes = Object.keys(ctx.bundle).filter((f) => /Matter-(Regular|Medium)-[\w-]+\.woff$/.test(f)).sort();
        return {
          html: html.replace(/[ \t]*<!--[\s\S]*?-->\n?/g, ""),       // comentários não vão para o site
          tags: fontes.map((f) => ({ tag: "link", injectTo: "head-prepend" as const,
            attrs: { rel: "preload", href: "/" + f, as: "font", type: "font/woff", crossorigin: "" } })),
        };
      },
    },

    // api/public/_headers: segurança em tudo; pacotes com hash = cache de 1 ano; a página sempre revalida
    generateBundle(_opcoes, pacote) {
      if (comando !== "build") return;
      const linhas = ["/*", ...Object.entries(cabecalhosSeguranca()).map(([k, v]) => `  ${k}: ${v}`),
        `/${PASTA_PACOTES}/*`, "  Cache-Control: public, max-age=31536000, immutable",
        "/assets/*", "  Cache-Control: public, max-age=604800",
        "/", "  Cache-Control: no-cache",
        "/index.html", "  Cache-Control: no-cache",
        "/politica-privacidade", "  Cache-Control: no-cache",
        "/termos-uso", "  Cache-Control: no-cache",
        "/sobre", "  Cache-Control: no-cache"];
      this.emitFile({ type: "asset", fileName: "_headers", source: linhas.join("\n") + "\n" });
    },
  };
}

export default defineConfig({
  root: raiz("./ui"),
  publicDir: raiz("./ui/public"),           // imagens usadas pelo JS em tempo de execução (assets/img/…)
  plugins: [tailwindcss(), zozo()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    // a interface fala com a API do servidor local (python api/dev/servidor_local.py)
    proxy: { "/api": { target: "http://127.0.0.1:8787", changeOrigin: false } },
  },
  build: {
    outDir: raiz("./api/public"),
    emptyOutDir: true,
    assetsDir: PASTA_PACOTES,
    target: "es2022",
    sourcemap: false,                       // sem mapas do código-fonte no site publicado
    modulePreload: { polyfill: false },     // navegadores atuais; evita código extra
    cssCodeSplit: false,
    // app + páginas públicas sem JavaScript (usezozo.com.br/sobre, /politica-privacidade e /termos-uso)
    rolldownOptions: { input: { app: raiz("./ui/index.html"), sobre: raiz("./ui/sobre.html"),
      politica: raiz("./ui/politica-privacidade.html"), termos: raiz("./ui/termos-uso.html") } },
  },
});
