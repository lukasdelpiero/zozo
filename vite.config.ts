/* =============================================================
   ZoZo — build da interface (Vite + TypeScript + Tailwind CSS)
   ------------------------------------------------------------
   npm run dev     → http://127.0.0.1:5173  (?mock=1 = demonstração sem servidor;
                     sem ?mock, a API vem do servidor local: python api/dev/servidor_local.py)
   npm run build   → api/public (o que o Cloudflare publica; substitui o antigo montar_interface.py)

   O build:
   • junta tudo em 1 JS + 1 CSS com impressão digital no nome (cache longo);
   • NUNCA inclui o modo de demonstração (pasta ui/mock);
   • gera api/public/_headers com os cabeçalhos de segurança (api/cabecalhos_ui.json).
   ============================================================= */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import { defineConfig, type Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";

const raiz = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const MOCK = "virtual:zozo-mock";
const PASTA_PACOTES = "static";            // JS, CSS e fontes com hash no nome (imutáveis)

function cabecalhosSeguranca(): Record<string, string> {
  const json = JSON.parse(readFileSync(raiz("./api/cabecalhos_ui.json"), "utf8")) as Record<string, string>;
  return Object.fromEntries(Object.entries(json).filter(([k]) => !k.startsWith("_")));
}

/** mock/credenciais.local.js (arquivo pessoal, fora do git) com erro de sintaxe não derruba a demonstração */
function credenciaisValidas(plugin: { warn(m: string): void }): boolean {
  const arq = raiz("./ui/mock/credenciais.local.js");
  if (!existsSync(arq)) return false;
  try {
    new Script(readFileSync(arq, "utf8"));
    return true;
  } catch (e) {
    plugin.warn("ui/mock/credenciais.local.js tem um erro de sintaxe (" + (e as Error).message + ") e foi ignorado: " +
      "a conta de prévia fica indisponível até corrigir o arquivo (veja credenciais.exemplo.js).");
    return false;
  }
}

function zozo(): Plugin {
  let comando: "build" | "serve" = "serve";
  return {
    name: "zozo",
    configResolved(c) { comando = c.command; },

    // Demonstração: só no servidor de desenvolvimento. No build vira um módulo vazio.
    resolveId(id) { return id === MOCK ? "\0" + MOCK : null; },
    load(id) {
      if (id !== "\0" + MOCK) return null;
      if (comando === "build") return "export {};";
      return (credenciaisValidas(this) ? 'import "/mock/credenciais.local.js";\n' : "") +
        'import "/mock/mock-data.js";\nimport "/mock/mock-host.js";\n';
    },

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
      if (Object.keys(pacote).some((f) => f.includes("mock"))) this.error("o modo de demonstração entrou no build");
      const linhas = ["/*", ...Object.entries(cabecalhosSeguranca()).map(([k, v]) => `  ${k}: ${v}`),
        `/${PASTA_PACOTES}/*`, "  Cache-Control: public, max-age=31536000, immutable",
        "/assets/*", "  Cache-Control: public, max-age=604800",
        "/", "  Cache-Control: no-cache",
        "/index.html", "  Cache-Control: no-cache",
        "/politica-privacidade", "  Cache-Control: no-cache",
        "/termos-uso", "  Cache-Control: no-cache"];
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
    // Sem ?mock=1 a interface fala com a API do servidor local (python api/dev/servidor_local.py)
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
    // app + páginas públicas sem JavaScript (usezozo.com.br/politica-privacidade e /termos-uso)
    rolldownOptions: { input: { app: raiz("./ui/index.html"), politica: raiz("./ui/politica-privacidade.html"), termos: raiz("./ui/termos-uso.html") } },
  },
});
