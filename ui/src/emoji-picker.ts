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

/** Destaca o emoji atual (o valor vem dos dados do usuário: sempre escapado) */
function destacarAtual(picker: Picker, atual?: string) {
  const raiz = picker.shadowRoot;
  if (!raiz || !atual) return;
  const folha = new CSSStyleSheet();
  folha.replaceSync(`.category button[aria-label="${CSS.escape(atual)}"] .background { opacity: 1; background-color: rgba(105, 72, 216, 0.28); }`);
  raiz.adoptedStyleSheets = [...raiz.adoptedStyleSheets, folha];
}

function abrir(anchor: HTMLElement, opts?: { atual?: string; aoEscolher?: (emoji: string) => void; posicao?: string }) {
  const o = opts || {};
  const ZoZo = window.ZoZo;
  ZoZo.menu.abrir(anchor, { largura: 340, render(el: HTMLElement, api: { fechar(): void }) {
    const espera = ZoZo.dom.h("div", { class: "emoji-carregando" }, ZoZo.dom.h("span", { class: "spinner", "aria-hidden": "true" }));
    ZoZo.dom.mount(el, espera);
    carregar().then(({ Picker }) => {
      if (!el.isConnected) return;
      const picker = new Picker({
        locale: "pt", set: "native", theme: "light", autoFocus: true,
        previewPosition: "none", skinTonePosition: "none", navPosition: "top", searchPosition: "sticky",
        perLine: 8, emojiButtonSize: 36, emojiSize: 22, maxFrequentRows: 2,
        onEmojiSelect: (e: { native: string }) => { api.fechar(); if (o.aoEscolher) o.aoEscolher(e.native); },
      });
      picker.classList.add("emoji-mart");
      ZoZo.dom.mount(el, picker);
      destacarAtual(picker, o.atual);              // a raiz (shadow) já existe: o construtor a cria
    }).catch(() => ZoZo.dom.mount(el, ZoZo.dom.h("p", { class: "menu__empty" }, "Não foi possível abrir os emojis. Tente de novo.")));
  } }, { posicao: o.posicao || "esquerda", largura: 340, label: "Escolher emoji", focar: false, class: "menu--emoji" });
}

window.ZoZo.emojiPicker = { abrir, carregar };

// Pré-carrega quando o navegador estiver ocioso: a 1ª abertura já é instantânea
const ocioso = (window as unknown as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
if (ocioso) ocioso(() => { void carregar(); }, { timeout: 8000 }); else setTimeout(() => { void carregar(); }, 4000);
