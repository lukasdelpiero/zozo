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
import "../js/bridge/host-web.ts";

// Serviço de dados
import "../js/data/pix.ts";
import "../js/data/demo.ts";
import "../js/data/servico.ts";

// Bridge: transporte
import "../js/bridge/transporte.ts";

// Componentes
import "../js/components/estrutura.ts";
import "../js/components/pecas.ts";               // classes Tailwind das peças compartilhadas
import "../js/components/ui.ts";
import "../js/components/feedback.ts";
import "../js/components/menu.ts";
import "../js/components/calendario.ts";
import "./emoji-picker.ts";                  // emoji-mart (carrega sob demanda)
import "../js/components/modais.ts";
import "../js/components/inline.ts";
import "../js/components/dividir.ts";
import "../js/components/forms.ts";
import "../js/components/charts.ts";
import "../js/components/list.ts";
import "../js/components/sidebar.ts";
import "../js/components/topbar.ts";
import "../js/components/cambio.ts";
import "../js/components/detail-panel.ts";
import "./qrcode-global.ts";                 // window.qrcode (QR code do 2FA)
import "../js/components/verificacao.ts";
import "../js/components/auth.ts";
import "../js/components/teste.ts";           // modo teste: só no endereço local e na prévia

// Páginas
import "../js/router.ts";
import "../js/pages/comum.ts";
import "../js/pages/contas.ts";
import "../js/pages/investimentos.ts";
import "../js/pages/categorias.ts";
import "../js/pages/recorrencias.ts";
import "../js/pages/lancamentos.ts";
import "../js/pages/dashboard.ts";
import "../js/pages/perfil.ts";
import "../js/pages/lancamento-painel.ts";
import "../js/pages/boleto.ts";

import "../js/app.ts";
