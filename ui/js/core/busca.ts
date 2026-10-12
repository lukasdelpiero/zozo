/* =============================================================
   ZoZo — Busca local (no navegador)
   ------------------------------------------------------------
   Os dados do ZoZo são cifrados de ponta a ponta: a busca precisa
   rodar aqui, sobre o que já foi aberto na tela — nada é enviado a
   um servidor de busca. Comportamento inspirado no Meilisearch:
   • várias palavras, em qualquer ordem, em qualquer campo (todas
     precisam aparecer): "uber outubro", "mercado 150";
   • prefixo enquanto digita ("merc" → Mercado) e trecho ("market"
     → Supermarket);
   • tolerância a erros de digitação: 1 erro a partir de 5 letras,
     2 a partir de 9 ("supermecado", "aluguell");
   • sem acento e sem maiúsculas ("cafe" acha "Café");
   • filtro de valor: ">100", "<= 50,00", "R$ 1.234,56";
   • relevância por campo (descrição pesa mais que notas) e destaque
     do trecho encontrado.
   Desempenho: índice invertido (palavra → itens) montado uma vez por
   lista e guardado num WeakMap; cada termo percorre o vocabulário (as
   palavras distintas), não os itens, e o resultado de cada termo fica
   em cache enquanto a pessoa digita.
   ============================================================= */
(function (ZoZo: ZoZoGlobal) {
  "use strict";

  /** "Café" → "cafe" (sem acento, minúsculas) */
  function normalizar(t: unknown): string {
    return String(t == null ? "" : t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  // Palavra = letras/números; números podem ter . , / - entre dígitos ("1.234,56", "11/10/2026")
  const PALAVRA = /[a-z0-9]+(?:[.,/-][0-9]+)*/g;
  const palavras = (t: string): string[] => t.match(PALAVRA) || [];
  const ehNumero = (t: string) => /^[0-9]/.test(t);

  /** Distância de edição com transposição (Damerau, versão "OSA"), parando cedo se passar de max */
  function distancia(a: string, b: string, max: number): number {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let ante: number[] = [], prev: number[] = [], cur: number[] = [];
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      cur = [i];
      let menor = i;
      for (let j = 1; j <= b.length; j++) {
        const custo = a[i - 1] === b[j - 1] ? 0 : 1;
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + custo);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, ante[j - 2] + 1);
        cur[j] = v;
        if (v < menor) menor = v;
      }
      if (menor > max) return max + 1;
      ante = prev; prev = cur;
    }
    return prev[b.length];
  }

  type Casamento = { pontos: number; ini: number; fim: number };
  /** Quanto a palavra w atende o termo q (0 = não atende) e qual trecho de w destacar */
  function casar(q: string, w: string): Casamento | null {
    if (w === q) return { pontos: 1, ini: 0, fim: w.length };
    if (w.startsWith(q)) return { pontos: 0.85, ini: 0, fim: q.length };
    if (ehNumero(q)) return null;                                   // valores e datas: só exato ou começo
    if (q.length >= 3) { const i = w.indexOf(q); if (i > 0) return { pontos: 0.6, ini: i, fim: i + q.length }; }
    if (q.length < 5) return null;
    const max = q.length >= 9 ? 2 : 1;                              // erros de digitação permitidos
    const d = distancia(q, w, max);
    if (d <= max) return { pontos: 0.55 - 0.1 * (d - 1), ini: 0, fim: w.length };
    if (w.length > q.length) {                                       // começo da palavra com erro ("supermec" → supermercado)
      const dp = distancia(q, w.slice(0, q.length), max);
      if (dp <= max) return { pontos: 0.45 - 0.1 * (dp - 1), ini: 0, fim: q.length };
    }
    return null;
  }

  /** Lê o texto digitado: termos (normalizados) e o filtro de valor (">100", "<=50") */
  function consulta(texto: unknown): ConsultaBusca {
    let t = normalizar(texto).replace(/us\$|r\$|[$€]/g, " ").replace(/([<>]=?)\s+(?=[0-9])/g, "$1");
    const valor: { min?: number; max?: number } = {};
    let temValor = false;
    t = t.replace(/(^|\s)([<>]=?)([0-9][0-9.,]*)/g, (_m, antes: string, op: string, num: string) => {
      const n = ZoZo.format.parseMoeda(num);
      if (!Number.isFinite(n)) return antes;
      temValor = true;
      if (op[0] === ">") valor.min = Math.max(valor.min ?? -Infinity, op === ">" ? n + 0.001 : n);
      else valor.max = Math.min(valor.max ?? Infinity, op === "<" ? n - 0.001 : n);
      return antes + " ";
    });
    const termos = Array.from(new Set(palavras(t)));
    return { termos, valor: temValor ? valor : null, vazia: !termos.length && !temValor };
  }

  type Postagens = Map<number, number>;                               // item → peso do campo (o maior)
  const indices = new WeakMap<object, Map<string, IndiceBusca<any>>>();

  function criarIndice<T>(itens: readonly T[], campos: (item: T) => CampoBusca[]): IndiceBusca<T> {
    const vocab = new Map<string, Postagens>();
    itens.forEach((item, i) => {
      for (const [texto, peso] of campos(item)) {
        if (texto == null || texto === "") continue;
        for (const w of palavras(normalizar(texto))) {
          let p = vocab.get(w);
          if (!p) vocab.set(w, (p = new Map()));
          if ((p.get(i) || 0) < peso) p.set(i, peso);
        }
      }
    });
    const cacheTermo = new Map<string, Map<number, number>>();
    /** Itens que atendem o termo e a melhor pontuação de cada um (pontos do casamento × peso do campo) */
    function porTermo(q: string): Map<number, number> {
      const guardado = cacheTermo.get(q);
      if (guardado) return guardado;
      const out = new Map<number, number>();
      vocab.forEach((post, w) => {
        const c = casar(q, w);
        if (!c) return;
        post.forEach((peso, i) => { const v = c.pontos * peso; if ((out.get(i) || 0) < v) out.set(i, v); });
      });
      if (cacheTermo.size > 64) cacheTermo.clear();
      cacheTermo.set(q, out);
      return out;
    }

    function buscar(texto: string, valorDe?: (item: T) => number): ResultadoBusca<T> {
      const c = consulta(texto);
      const pontos = new Map<T, number>();
      if (c.vazia) { itens.forEach((x) => pontos.set(x, 0)); return resultado(itens.slice(), pontos, c); }
      const listas = c.termos.map(porTermo).sort((a, b) => a.size - b.size);   // começa pelo termo mais raro
      const candidatos: number[] = listas.length ? Array.from(listas[0].keys()) : itens.map((_x, i) => i);
      const lerValor = valorDe || ((x: T) => Math.abs(Number((x as { valor?: unknown }).valor) || 0));
      const achados: T[] = [];
      for (const i of candidatos.sort((a, b) => a - b)) {
        let soma = 0, ok = true;
        for (const l of listas) { const v = l.get(i); if (v === undefined) { ok = false; break; } soma += v; }
        if (!ok) continue;
        const item = itens[i];
        if (c.valor) {
          const v = lerValor(item);
          if ((c.valor.min !== undefined && v < c.valor.min) || (c.valor.max !== undefined && v > c.valor.max)) continue;
        }
        pontos.set(item, soma);
        achados.push(item);
      }
      return resultado(achados, pontos, c);
    }
    return { buscar, tamanho: itens.length, vocabulario: vocab.size };
  }

  function resultado<T>(itens: T[], pontos: Map<T, number>, c: ConsultaBusca): ResultadoBusca<T> {
    return { itens, termos: c.termos, valor: c.valor, pontos: (x: T) => pontos.get(x) || 0, destacar: (t: unknown) => destacar(t, c.termos) };
  }

  /** Índice de uma lista, guardado enquanto a lista (o mesmo array) existir. chave: variações de campos */
  function indice<T extends object>(itens: readonly T[], campos: (item: T) => CampoBusca[], chave?: string): IndiceBusca<T> {
    let porChave = indices.get(itens);
    if (!porChave) indices.set(itens, (porChave = new Map()));
    const k = chave || "";
    let ind = porChave.get(k) as IndiceBusca<T> | undefined;
    if (!ind) porChave.set(k, (ind = criarIndice(itens, campos)));
    return ind;
  }

  /**
   * Divide o texto original em pedaços, marcando o que atende os termos:
   * "Supermercado" + ["merc"] → ["Super", { marca: "merc" }, "ado"]. Acentos do original são mantidos.
   */
  function destacar(texto: unknown, termos: readonly string[]): Array<string | { marca: string }> {
    const original = String(texto == null ? "" : texto);
    if (!termos.length || !original) return [original];
    // texto normalizado com o índice de cada caractere no original (acentos removidos sem perder a posição)
    let norm = "";
    const pos: number[] = [];
    let i = 0;
    for (const ch of original) {
      const n = normalizar(ch);
      for (let k = 0; k < n.length; k++) { norm += n[k]; pos.push(i); }
      i += ch.length;
    }
    pos.push(original.length);
    const marcas: Array<[number, number]> = [];
    PALAVRA.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PALAVRA.exec(norm))) {
      let melhor: Casamento | null = null;
      for (const q of termos) { const c = casar(q, m[0]); if (c && (!melhor || c.pontos > melhor.pontos)) melhor = c; }
      if (melhor) marcas.push([pos[m.index + melhor.ini], pos[m.index + melhor.fim]]);
    }
    if (!marcas.length) return [original];
    const out: Array<string | { marca: string }> = [];
    let fim = 0;
    for (const [a, b] of marcas) {
      if (a > fim) out.push(original.slice(fim, a));
      out.push({ marca: original.slice(a, b) });
      fim = b;
    }
    if (fim < original.length) out.push(original.slice(fim));
    return out;
  }

  const api: ZoZoBusca = { normalizar, consulta, indice, destacar, distancia };
  ZoZo.busca = api;
})(window.ZoZo);
