/* =============================================================
   ZoZo — ponto de entrada do Vite
   ------------------------------------------------------------
   Os módulos da interface ainda se registram em window.ZoZo; a ORDEM
   dos imports abaixo é a ordem em que rodam (era a ordem das tags
   <script> do index.html). Ao converter um módulo para TypeScript,
   troque .js por .ts aqui e declare a API dele em src/globais.d.ts.
   ============================================================= */
// Estilos: CSS atual (camada "legado") + Tailwind CSS — ver src/estilos.css
import "./estilos.css";

// Núcleo
import "../js/core/dom.ts";
import "../js/core/icons.ts";
import "../js/core/format.ts";
import "../js/core/busca.ts";
import "../js/core/state.ts";
import "../js/config/regras.ts";

// Bridge: contrato de mensagens
import "../js/bridge/messages.ts";

// Modo de demonstração (?mock=1): só no servidor de desenvolvimento; o build troca por um módulo vazio
import "virtual:zozo-mock";

// Host web: criptografia no navegador + API Python no Cloudflare
import "../js/bridge/host-web.js";

// Serviço de dados
import "../js/data/pix.ts";
import "../js/data/demo.js";
import "../js/data/servico.js";

// Bridge: transporte
import "../js/bridge/transporte.ts";

// Componentes
import "../js/components/estrutura.ts";
import "../js/components/pecas.ts";               // classes Tailwind das peças compartilhadas
import "../js/components/ui.js";
import "../js/components/feedback.ts";
import "../js/components/menu.ts";
import "../js/components/calendario.ts";
import "./emoji-picker.ts";                  // emoji-mart (carrega sob demanda)
import "../js/components/modais.js";
import "../js/components/inline.ts";
import "../js/components/dividir.ts";
import "../js/components/forms.ts";
import "../js/components/charts.js";
import "../js/components/list.js";
import "../js/components/sidebar.ts";
import "../js/components/topbar.ts";
import "../js/components/cambio.js";
import "../js/components/detail-panel.ts";
import "./qrcode-global.ts";                 // window.qrcode (QR code do 2FA)
import "../js/components/verificacao.ts";
import "../js/components/auth.js";

// Páginas
import "../js/router.ts";
import "../js/pages/comum.ts";
import "../js/pages/contas.js";
import "../js/pages/investimentos.ts";
import "../js/pages/categorias.js";
import "../js/pages/recorrencias.ts";
import "../js/pages/lancamentos.js";
import "../js/pages/dashboard.js";
import "../js/pages/perfil.js";
import "../js/pages/lancamento-painel.js";
import "../js/pages/boleto.js";

import "../js/app.js";
