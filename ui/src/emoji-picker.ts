/* =============================================================
   ZoZo — Seletor de emojis (emoji-mart)
   ------------------------------------------------------------
   ZoZo.emojiPicker.abrir(anchor, { atual, aoEscolher(emoji), posicao })

   • emoji-mart + dados locais (@emoji-mart/data, emojis nativos): nada é
     buscado na internet (o CSP só permite a própria origem).
   • O emoji-mart põe o CSS num <style> dentro do shadow DOM, o que o CSP
     (style-src 'self') bloqueia: o mesmo CSS entra como folha "construída"
     (adoptedStyleSheets), junto com as cores e cantos do ZoZo.
   • Pesquisa em português: palavras PT ligadas aos termos em inglês da base.
   • Carrega sob demanda e é pré-carregado quando o navegador fica ocioso,
     para abrir na hora.
   ============================================================= */
type Picker = HTMLElement;
type Dados = { emojis: Record<string, { keywords: string[]; name: string }>; [k: string]: unknown };

/* Palavras em português → termos em inglês da base (pesquisa em PT) */
const PT: Record<string, string> = {
  casa: "house home", lar: "house home", aluguel: "house key", condominio: "office building", predio: "building", escritorio: "office briefcase",
  carro: "car automobile", moto: "motorcycle scooter", onibus: "bus", metro: "metro train", trem: "train", aviao: "airplane", viagem: "airplane luggage world",
  uber: "taxi car", taxi: "taxi", bicicleta: "bicycle bike", combustivel: "fuel", gasolina: "fuel", estrada: "road",
  comida: "food meal plate", mercado: "shopping cart basket", compras: "shopping bag cart", restaurante: "plate fork knife", lanche: "hamburger sandwich",
  pizza: "pizza", hamburguer: "hamburger", cafe: "coffee hot beverage", cerveja: "beer", vinho: "wine", bebida: "drink beverage cocktail", bar: "beer cocktail",
  padaria: "bread croissant", pao: "bread", fruta: "apple banana grapes", doce: "candy cake chocolate", bolo: "cake", sorvete: "ice cream",
  dinheiro: "money dollar banknote coin", salario: "money bag dollar", banco: "bank", cartao: "credit card", investimento: "chart increasing bank",
  poupanca: "piggy money bag", economia: "piggy money", divida: "money with wings", imposto: "receipt", conta: "receipt bill", boleto: "receipt",
  saude: "hospital pill syringe stethoscope", remedio: "pill", farmacia: "pill", medico: "stethoscope doctor health worker", hospital: "hospital", dentista: "tooth",
  academia: "weight lifting flexed biceps", esporte: "soccer basketball sports", futebol: "soccer ball", corrida: "running", natacao: "swimming",
  escola: "school", faculdade: "graduation cap school", educacao: "books graduation", livro: "book books", estudo: "books pencil", curso: "graduation books",
  trabalho: "briefcase office", computador: "computer laptop", celular: "mobile phone", telefone: "telephone mobile", internet: "globe antenna signal", wifi: "antenna signal",
  luz: "light bulb", energia: "high voltage electric plug", agua: "droplet water", gas: "fire", lixo: "wastebasket", limpeza: "broom sponge soap",
  roupa: "shirt dress jeans", roupas: "shirt dress jeans", sapato: "shoe sneaker", beleza: "lipstick nail polish", cabelo: "haircut barber", perfume: "perfume",
  presente: "gift wrapped", festa: "party popper balloon confetti", aniversario: "birthday cake", natal: "christmas tree santa", casamento: "wedding ring",
  filho: "baby child", filhos: "baby child children", bebe: "baby", familia: "family", mae: "woman mother", pai: "man father", amor: "heart love",
  pet: "dog cat paw", cachorro: "dog", gato: "cat", animal: "paw dog cat", veterinario: "paw dog",
  lazer: "popcorn clapper movie game", cinema: "movie camera clapper popcorn", filme: "movie clapper", musica: "musical note headphone", jogo: "video game controller dice",
  streaming: "television tv", assinatura: "television mobile", tv: "television", show: "microphone ticket", ingresso: "ticket",
  ferramenta: "hammer wrench toolbox", manutencao: "wrench hammer toolbox", reforma: "hammer brick", jardim: "seedling potted plant flower", planta: "plant seedling",
  seguro: "shield umbrella", doacao: "handshake heart gift", caridade: "handshake heart", igreja: "church", religiao: "church",
  praia: "beach umbrella", ferias: "beach palm tree luggage", hotel: "hotel bed", mapa: "map", sol: "sun", chuva: "rain umbrella", nuvem: "cloud",
  feliz: "smiling grinning", triste: "crying sad frowning", rindo: "joy laughing", coracao: "heart", estrela: "star", fogo: "fire", raio: "lightning high voltage",
  certo: "check mark", errado: "cross mark", alerta: "warning", relogio: "clock watch", calendario: "calendar", chave: "key", cadeado: "lock locked",
  brasil: "brazil", bandeira: "flag", grafico: "chart", seta: "arrow", numero: "number keycap", outros: "package box",
};

/* Cores e cantos do ZoZo (roxo #6948D8) por cima do CSS do emoji-mart */
const CSS_ZOZO = `
:host {
  --border-radius: 12px;
  --rgb-accent: 105, 72, 216;
  --rgb-color: 22, 33, 58;
  --color-border: rgba(105, 72, 216, 0.14);
  --color-border-over: rgba(105, 72, 216, 0.28);
  --font-family: "Matter", "Segoe UI", -apple-system, sans-serif;
  --font-size: 14px;
  --shadow: none;
  height: min(380px, calc(100vh - 140px));
  min-height: 240px;
}
.category button { border-radius: 8px; }
.category button .background { border-radius: 8px; background-color: rgba(105, 72, 216, 0.14); }
.category button:hover .background { opacity: 1; }
.search input[type="search"] { border-radius: 8px; }
`;

let carregando: Promise<{ Picker: new (props: Record<string, unknown>) => Picker }> | null = null;

/** Carrega o emoji-mart e os dados (uma vez); devolve o construtor já preparado para o CSP */
function carregar() {
  if (carregando) return carregando;
  carregando = Promise.all([import("emoji-mart"), import("@emoji-mart/data/sets/15/native.json"), import("@emoji-mart/data/i18n/pt.json")])
    .then(([mod, dadosMod, ptMod]) => {
      const dados = ((dadosMod as { default?: unknown }).default || dadosMod) as Dados;
      const i18n = (ptMod as { default?: unknown }).default || ptMod;
      // pesquisa em português: cada emoji ganha as palavras PT dos termos em inglês que ele já tem
      const reverso: Record<string, string[]> = {};
      Object.keys(PT).forEach((pt) => PT[pt].split(" ").forEach((en) => { (reverso[en] = reverso[en] || []).push(pt); }));
      Object.values(dados.emojis).forEach((e) => {
        const palavras = new Set<string>();
        [e.name, ...(e.keywords || [])].join(" ").toLowerCase().split(/[\s_:-]+/).forEach((w) => (reverso[w] || []).forEach((p) => palavras.add(p)));
        if (palavras.size) e.keywords = (e.keywords || []).concat(Array.from(palavras));
      });
      const Picker = (mod as unknown as { Picker: new (props: Record<string, unknown>) => Picker }).Picker;
      // CSS do componente como folha construída (o <style> embutido seria bloqueado pelo CSP)
      const base = Object.getPrototypeOf(Picker.prototype) as { injectStyles?: (s: string) => void };
      base.injectStyles = function (this: HTMLElement, estilos: string) {
        if (!estilos || !this.shadowRoot) return;
        const folha = new CSSStyleSheet();
        folha.replaceSync(estilos + CSS_ZOZO);
        this.shadowRoot.adoptedStyleSheets = [folha];
      };
      const comDados = function (props: Record<string, unknown>) {
        return new Picker(Object.assign({ data: dados, i18n }, props));
      } as unknown as new (props: Record<string, unknown>) => Picker;
      return { Picker: comDados };
    });
  carregando.catch(() => { carregando = null; });
  return carregando;
}

/* ---------------- Uma instância só, sempre montada ----------------
   O emoji-mart desenha tudo ao entrar na página; tirar e pôr de volta o deixa sem observadores.
   Por isso existe UM seletor, criado quando o app abre, numa camada flutuante escondida:
   abrir = só posicionar e mostrar (instantâneo). */
let camada: HTMLElement | null = null;
let seletor: Picker | null = null;
let folhaAtual: CSSStyleSheet | null = null;
let aoEscolherAtual: ((emoji: string) => void) | null = null;
let fecharAtual: (() => void) | null = null;
let preparando: Promise<void> | null = null;

function preparar(): Promise<void> {
  if (preparando) return preparando;
  preparando = carregar().then(({ Picker }) => {
    camada = document.createElement("div");
    camada.className = "emoji-pop";             // sem a classe "menu": senão o Esc das janelas acharia um menu aberto
    camada.setAttribute("role", "dialog");
    camada.setAttribute("aria-label", "Escolher emoji");
    camada.setAttribute("aria-hidden", "true");
    seletor = new Picker({
      locale: "pt", set: "native", theme: "light", autoFocus: false,
      previewPosition: "none", skinTonePosition: "none", navPosition: "top", searchPosition: "sticky",
      perLine: 8, emojiButtonSize: 36, emojiSize: 22, maxFrequentRows: 2,
      onEmojiSelect: (e: { native: string }) => { const cb = aoEscolherAtual; fechar(); if (cb) cb(e.native); },
    });
    camada.appendChild(seletor);
    document.body.appendChild(camada);
    folhaAtual = new CSSStyleSheet();
    const raiz = seletor.shadowRoot;
    if (raiz) raiz.adoptedStyleSheets = [...raiz.adoptedStyleSheets, folhaAtual];
  });
  preparando.catch(() => { preparando = null; });
  return preparando;
}

/** Destaca o emoji atual (o valor vem dos dados do usuário: sempre escapado) */
function destacarAtual(atual?: string) {
  if (!folhaAtual) return;
  folhaAtual.replaceSync(atual ? `.category button[aria-label="${CSS.escape(atual)}"] .background { opacity: 1; background-color: rgba(105, 72, 216, 0.28); }` : "");
}

/** Limpa a pesquisa e volta ao topo (a mesma instância é reaproveitada) */
function reiniciar() {
  const raiz = seletor && seletor.shadowRoot;
  if (!raiz) return;
  const busca = raiz.querySelector("input");
  if (busca && busca.value) { busca.value = ""; busca.dispatchEvent(new Event("input", { bubbles: true, composed: true })); }
  const rolagem = raiz.querySelector(".scroll");
  if (rolagem) rolagem.scrollTop = 0;
}

function posicionar(anchor: HTMLElement) {
  if (!camada) return;
  const r = anchor.getBoundingClientRect();
  const w = camada.offsetWidth || 340, hgt = camada.offsetHeight || 380, margem = 8;
  const abaixo = r.bottom + 6 + hgt <= innerHeight - margem || r.top - 6 - hgt < margem;
  const top = abaixo ? Math.min(r.bottom + 6, innerHeight - hgt - margem) : r.top - 6 - hgt;
  const left = Math.max(margem, Math.min(r.left, innerWidth - w - margem));
  camada.style.top = Math.max(margem, top) + "px";
  camada.style.left = left + "px";
}

function fechar() {
  if (fecharAtual) { const f = fecharAtual; fecharAtual = null; f(); }
}

function abrir(anchor: HTMLElement, opts?: { atual?: string; aoEscolher?: (emoji: string) => void; posicao?: string }) {
  const o = opts || {};
  const mostrar = () => {
    if (!camada || !anchor.isConnected) return;
    fechar();
    aoEscolherAtual = o.aoEscolher || null;
    destacarAtual(o.atual);
    reiniciar();
    posicionar(anchor);
    camada.classList.add("is-aberto");
    camada.setAttribute("aria-hidden", "false");
    anchor.setAttribute("aria-expanded", "true");
    const raiz = seletor && seletor.shadowRoot;
    const busca = raiz && raiz.querySelector("input");
    if (busca) (busca as HTMLInputElement).focus();
    // fecha: clique fora, Esc (sem fechar a janela de trás), rolagem/redimensionamento da página
    const fora = (e: Event) => { if (camada && !camada.contains(e.target as Node) && e.target !== anchor) fechar(); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fechar(); anchor.focus(); } };
    const mudou = () => fechar();
    document.addEventListener("mousedown", fora, true);
    document.addEventListener("keydown", tecla, true);
    window.addEventListener("resize", mudou);
    fecharAtual = () => {
      document.removeEventListener("mousedown", fora, true);
      document.removeEventListener("keydown", tecla, true);
      window.removeEventListener("resize", mudou);
      aoEscolherAtual = null;
      anchor.setAttribute("aria-expanded", "false");
      if (camada) { camada.classList.remove("is-aberto"); camada.setAttribute("aria-hidden", "true"); }
    };
  };
  if (camada) mostrar();
  else preparar().then(mostrar).catch(() => window.ZoZo.feedback.toast("Não foi possível abrir os emojis. Tente de novo.", { tone: "error" }));
}

window.ZoZo.emojiPicker = { abrir, carregar: preparar, fechar };

// Prepara logo depois que o app abre (fora do caminho do primeiro desenho): a 1ª abertura já é instantânea
const ocioso = (window as unknown as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
if (ocioso) ocioso(() => { void preparar(); }, { timeout: 2000 }); else setTimeout(() => { void preparar(); }, 1500);
