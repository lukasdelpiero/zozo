/* =============================================================
   ZoZo — build da interface (Vite + TypeScript + Tailwind CSS)
   ------------------------------------------------------------
   npm run dev     → http://127.0.0.1:5173  (a API vem do servidor local: python api/dev/servidor_local.py;
                     sem servidor: Modo teste › "Simular cadastro e login sem servidor")
   npm run build   → api/public (o que o Cloudflare publica; substitui o antigo montar_interface.py)
   npm run build:portfolio → api/portfolio/public: só o portfólio (usezozo.com.br/portfolio), publicado
                     SEPARADO do app por api/publicar-portfolio.ps1 (outro Worker, com rota no mesmo domínio)

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
// Portfólio: tudo o que ele carrega fica sob /portfolio/, que é o que a rota do Worker separado atende
// (o resto do domínio continua no app). As imagens vão junto, para a página não depender do app publicado.
const PASTA_PORTFOLIO = "portfolio/static";
const IMAGENS_PORTFOLIO = ["zozo-logo.svg", "favicon.svg", "favicon.png"];

function cabecalhosSeguranca(): Record<string, string> {
  const json = JSON.parse(readFileSync(raiz("./api/cabecalhos_ui.json"), "utf8")) as Record<string, string>;
  return Object.fromEntries(Object.entries(json).filter(([k]) => !k.startsWith("_")));
}

function zozo(portfolio: boolean): Plugin {
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
        let saida = html.replace(/[ \t]*<!--[\s\S]*?-->\n?/g, "");      // comentários não vão para o site
        if (portfolio) saida = saida.replaceAll("/assets/img/", "/portfolio/img/");
        return {
          html: saida,
          tags: fontes.map((f) => ({ tag: "link", injectTo: "head-prepend" as const,
            attrs: { rel: "preload", href: "/" + f, as: "font", type: "font/woff", crossorigin: "" } })),
        };
      },
    },

    // _headers: segurança em tudo; pacotes com hash = cache de 1 ano; a página sempre revalida
    generateBundle() {
      if (comando !== "build") return;
      const seguranca = ["/*", ...Object.entries(cabecalhosSeguranca()).map(([k, v]) => `  ${k}: ${v}`)];
      if (portfolio) {
        const linhas = [...seguranca,
          `/${PASTA_PORTFOLIO}/*`, "  Cache-Control: public, max-age=31536000, immutable",
          "/portfolio/img/*", "  Cache-Control: public, max-age=604800",
          "/portfolio", "  Cache-Control: no-cache"];
        this.emitFile({ type: "asset", fileName: "_headers", source: linhas.join("\n") + "\n" });
        // /portifolio (como foi divulgado) leva ao endereço certo
        this.emitFile({ type: "asset", fileName: "_redirects", source: "/portifolio /portfolio 301\n/portifolio/ /portfolio 301\n" });
        for (const img of IMAGENS_PORTFOLIO) {
          this.emitFile({ type: "asset", fileName: "portfolio/img/" + img, source: readFileSync(raiz("./ui/public/assets/img/" + img)) });
        }
        return;
      }
      const linhas = [...seguranca,
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

export default defineConfig(({ mode }) => {
  const portfolio = mode === "portfolio";
  return {
    root: raiz("./ui"),
    // imagens usadas pelo JS em tempo de execução (assets/img/…); o portfólio leva só as dele (generateBundle)
    publicDir: portfolio ? false : raiz("./ui/public"),
    plugins: [tailwindcss(), zozo(portfolio)],
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      // a interface fala com a API do servidor local (python api/dev/servidor_local.py)
      proxy: { "/api": { target: "http://127.0.0.1:8787", changeOrigin: false } },
    },
    build: {
      outDir: raiz(portfolio ? "./api/portfolio/public" : "./api/public"),
      emptyOutDir: true,
      assetsDir: portfolio ? PASTA_PORTFOLIO : PASTA_PACOTES,
      target: "es2022",
      sourcemap: false,                       // sem mapas do código-fonte no site publicado
      modulePreload: { polyfill: false },     // navegadores atuais; evita código extra
      cssCodeSplit: false,
      // app + páginas públicas sem JavaScript (usezozo.com.br/sobre, /politica-privacidade e /termos-uso).
      // O portfólio (ui/portfolio.html) tem build e publicação próprios: no dev ele abre em /portfolio.html
      rolldownOptions: {
        input: portfolio ? { portfolio: raiz("./ui/portfolio.html") }
          : { app: raiz("./ui/index.html"), sobre: raiz("./ui/sobre.html"),
            politica: raiz("./ui/politica-privacidade.html"), termos: raiz("./ui/termos-uso.html") },
      },
    },
  };
});
