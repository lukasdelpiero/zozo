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
import "../js/core/dom.js";
import "../js/core/icons.js";
import "../js/core/format.ts";
import "../js/core/state.js";
import "../js/config/regras.js";

// Bridge: contrato de mensagens
import "../js/bridge/messages.js";

// Modo de demonstração (?mock=1): só no servidor de desenvolvimento; o build troca por um módulo vazio
import "virtual:zozo-mock";

// Host web: criptografia no navegador + API Python no Cloudflare
import "../js/bridge/host-web.js";

// Serviço de dados
import "../js/data/pix.ts";
import "../js/data/demo.js";
import "../js/data/servico.js";

// Bridge: transporte
import "../js/bridge/transporte.js";

// Componentes
import "../js/components/ui.js";
import "../js/components/feedback.js";
import "../js/components/menu.js";
import "../js/data/emojis.js";
import "../js/components/emoji-picker.js";
import "../js/components/modais.js";
import "../js/components/inline.js";
import "../js/components/dividir.js";
import "../js/components/forms.js";
import "../js/components/charts.js";
import "../js/components/list.js";
import "../js/components/sidebar.js";
import "../js/components/topbar.js";
import "../js/components/cambio.js";
import "../js/components/detail-panel.js";
import "./qrcode-global.ts";                 // window.qrcode (QR code do 2FA)
import "../js/components/verificacao.js";
import "../js/components/auth.js";

// Páginas
import "../js/router.js";
import "../js/pages/comum.js";
import "../js/pages/contas.js";
import "../js/pages/investimentos.js";
import "../js/pages/categorias.js";
import "../js/pages/recorrencias.js";
import "../js/pages/lancamentos.js";
import "../js/pages/dashboard.js";
import "../js/pages/perfil.js";
import "../js/pages/lancamento-painel.js";
import "../js/pages/boleto.js";

import "../js/app.js";
