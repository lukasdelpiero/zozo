/* =============================================================
   ZoZo — Seletor de emojis (estilo painel do Windows / WhatsApp)
   Pesquisa em português e inglês · categorias · recentes · prévia
   Só emojis Unicode (sem imagens, GIFs ou figurinhas).
   ZoZo.emojiPicker.abrir(anchor, { atual, aoEscolher(emoji) })
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h, mount } = ZoZo.dom;

  const CATEGORIAS = [
    { id: "recentes", nome: "Recentes", icone: "🕘" },
    { id: 0, nome: "Pessoas e rostos", icone: "😀" },
    { id: 1, nome: "Animais e natureza", icone: "🐻" },
    { id: 2, nome: "Comida e bebida", icone: "🍔" },
    { id: 3, nome: "Atividades", icone: "⚽" },
    { id: 4, nome: "Viagens e lugares", icone: "✈️" },
    { id: 5, nome: "Objetos", icone: "💡" },
    { id: 6, nome: "Símbolos", icone: "🔣" },
    { id: 7, nome: "Bandeiras", icone: "🏳️" },
  ];

  /* Palavras em português → termos em inglês da base (pesquisa em PT) */
  const PT = {
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

  const norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  let indice = null;   // [{ e, c, texto }]
  function montarIndice() {
    if (indice) return indice;
    const reverso = {};   // termo inglês → palavras PT
    Object.keys(PT).forEach((pt) => PT[pt].split(" ").forEach((en) => { (reverso[en] = reverso[en] || []).push(pt); }));
    indice = (ZoZo.emojiData || []).map(([e, nomes, c]) => {
      const n = norm(nomes);
      const pts = new Set();
      n.split(/[\s:-]+/).forEach((w) => (reverso[w] || []).forEach((p) => pts.add(p)));
      return { e, c, nome: nomes.split(" ").slice(0, 6).join(" "), texto: n + " " + Array.from(pts).join(" ") };
    });
    return indice;
  }

  const CHAVE_RECENTES = "zozo.emojisRecentes";
  const recentes = () => { try { return JSON.parse(localStorage.getItem(CHAVE_RECENTES) || "[]"); } catch (e) { return []; } };
  const lembrar = (e) => { try { localStorage.setItem(CHAVE_RECENTES, JSON.stringify([e].concat(recentes().filter((x) => x !== e)).slice(0, 24))); } catch (err) { /* sem armazenamento */ } };

  function abrir(anchor, opts) {
    const o = opts || {};
    ZoZo.menu.abrir(anchor, { largura: 360, render(el, api) {
      const idx = montarIndice();
      const busca = h("input", { type: "search", class: "ep__search-input", placeholder: "Pesquisar emoji (ex.: carro, comida, dinheiro)", "aria-label": "Pesquisar emoji" });
      const grade = h("div", { class: "ep__grid", role: "listbox", "aria-label": "Emojis" });
      const previa = h("div", { class: "ep__preview" });
      const abas = h("div", { class: "ep__tabs", role: "tablist" });
      const escolher = (e) => { lembrar(e); api.fechar(); if (o.aoEscolher) o.aoEscolher(e); };
      const mostrarPrevia = (item) => mount(previa, item ? [h("span", { class: "ep__preview-emoji" }, item.e), h("span", { class: "ep__preview-name" }, item.nome)] : h("span", { class: "ep__preview-name" }, "Passe o mouse sobre um emoji"));
      const botao = (item) => h("button", { type: "button", class: ["ep__emoji", item.e === o.atual && "is-active"], role: "option", "aria-label": item.nome, title: item.nome,
        onClick: () => escolher(item.e), onMouseenter: () => mostrarPrevia(item), onFocus: () => mostrarPrevia(item) }, item.e);

      function desenhar() {
        const q = norm(busca.value.trim());
        if (q) {
          const termos = q.split(/\s+/);
          const achados = idx.filter((it) => termos.every((t) => it.texto.includes(t)));
          mount(grade, achados.length ? h("div", { class: "ep__section" }, h("div", { class: "ep__cells" }, achados.slice(0, 400).map(botao)))
            : h("p", { class: "ep__empty" }, "Nenhum emoji encontrado."));
          abas.classList.add("is-hidden");
          return;
        }
        abas.classList.remove("is-hidden");
        const rec = recentes().map((e) => idx.find((i) => i.e === e) || { e, nome: e }).filter(Boolean);
        mount(grade, CATEGORIAS.map((cat) => {
          const itens = cat.id === "recentes" ? rec : idx.filter((i) => i.c === cat.id);
          if (!itens.length) return null;
          return h("section", { class: "ep__section", "data-cat": String(cat.id) },
            h("h4", { class: "ep__title" }, cat.nome), h("div", { class: "ep__cells" }, itens.map(botao)));
        }));
      }
      mount(abas, CATEGORIAS.map((cat) => h("button", { type: "button", class: "ep__tab", role: "tab", title: cat.nome, "aria-label": cat.nome,
        onClick: () => { const s = grade.querySelector('[data-cat="' + cat.id + '"]'); if (s) grade.scrollTo({ top: s.offsetTop - grade.offsetTop, behavior: "smooth" }); } }, cat.icone)));
      // Destaca a aba da seção visível
      grade.addEventListener("scroll", () => {
        const secs = Array.from(grade.querySelectorAll(".ep__section[data-cat]"));
        const atual = secs.filter((s) => s.offsetTop - grade.offsetTop <= grade.scrollTop + 8).pop() || secs[0];
        abas.querySelectorAll(".ep__tab").forEach((b, i) => b.classList.toggle("is-active", atual && String(CATEGORIAS[i].id) === atual.dataset.cat));
      });
      busca.addEventListener("input", desenhar);
      busca.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { const p = grade.querySelector(".ep__emoji"); if (p) { e.preventDefault(); p.click(); } }
      });
      mount(el, h("div", { class: "ep" },
        h("div", { class: "ep__search" }, ZoZo.icons.icon("pesquisar", { size: 15 }), busca), abas, grade, previa));
      desenhar(); mostrarPrevia(null);
      requestAnimationFrame(() => busca.focus());
    } }, { posicao: o.posicao || "esquerda", largura: 360, label: "Escolher emoji", focar: false, class: "menu--emoji" });
  }

  ZoZo.emojiPicker = { abrir };
})(window.ZoZo);
