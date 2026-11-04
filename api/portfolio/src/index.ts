/* ZoZo — portfólio: entrada do Worker. Só POST /portfolio/contato chega aqui (run_worker_first no wrangler.toml);
   o resto sai direto dos arquivos estáticos. O runtime trata cada export deste arquivo como ponto de entrada:
   aqui fica só o default, e a lógica mora em contato.ts (testada em api/portfolio/tests). */
import { CAMINHO, contato, type Ambiente } from "./contato";

export default {
  async fetch(req: Request, env: Ambiente): Promise<Response> {
    if (new URL(req.url).pathname === CAMINHO) return contato(req, env);
    return env.ASSETS ? env.ASSETS.fetch(req) : new Response("Não encontrado", { status: 404 });
  },
};
