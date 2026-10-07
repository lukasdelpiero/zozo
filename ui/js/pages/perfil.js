/* =============================================================
   ZoZo — Perfil (seções 5.3, 32, 33) e Configurações
   ============================================================= */
(function (ZoZo) {
  "use strict";
  const { h, mount } = ZoZo.dom;
  const { icon } = ZoZo.icons;
  const UI = ZoZo.ui;
  const L = ZoZo.list;
  const C = ZoZo.pagesComum;
  const F = ZoZo.format;
  const A = ZoZo.messages.ACTIONS;
  const FR = ZoZo.messages.FRIENDLY;
  const store = ZoZo.store;

  const mesAbrev = (mesIso) => F.mesAbrev((F.parseData((mesIso || F.iso(new Date()).slice(0, 7)) + "-01") || new Date()).getMonth());

  function verLancamentos(p, ctx) {
    ZoZo.lancamentosShared.setFiltros(Object.assign(ZoZo.lancamentosShared.FILTROS_VAZIOS(), { perfis: [p.id] }));
    store.set({ ui: { busca: "" } });
    ctx.navigate("lancamentos");
  }

  /* ---------------- Cadastro / edição ---------------- */
  function abrirFormPerfil(ctx, p) {
    const novo = !p;
    return ctx.loadData("perfis", A.getPerfis).catch(() => null).then(() => ZoZo.forms.abrir(ctx, {
      titulo: novo ? "Novo perfil" : "Editar perfil",
      selected: p ? { tipo: "perfil", id: p.id } : null,
      valores: p ? { nome: p.nome, orcamento: p.orcamento || "", cor: p.cor } : { cor: ZoZo.regras.corSugerida() },
      campos: [
        { nome: "nome", rotulo: "Nome do perfil", obrigatorio: true, placeholder: "Ex.: Casa, Mãe, Trabalho", max: ZoZo.regras.limiteNome },
        { nome: "cor", rotulo: "Cor da tag", tipo: "cor" },
      ],
      aoCancelar: p ? () => abrirDetalhe(p, ctx) : null,
      salvar: (d) => {
        d.orcamento = (p && p.orcamento) || 0;
        const req = novo ? ctx.bridge.request(A.createPerfil, { perfil: d }) : ctx.bridge.request(A.updatePerfil, { id: p.id, perfil: d });
        return req.then((r) => {
          ctx.toast(novo ? "Perfil criado." : "Perfil salvo.");
          return ctx.recarregarTudo().then(() => {
            const atual = ((store.get().data.perfis || {}).perfis || []).find((x) => x.id === (novo ? r.perfil.id : p.id));
            if (atual && store.get().currentPage === "perfil") abrirDetalhe(atual, ctx);
          });
        });
      },
    }));
  }

  function excluirPerfil(p, ctx) {
    ZoZo.feedback.confirmarExclusao("Excluir perfil?", "Tem certeza de que deseja excluir este perfil?")
      .then((ok) => ok && ctx.bridge.request(A.deletePerfil, { id: p.id }).then(() => {
        ctx.detail.close({ silencioso: true }); ctx.toast("Perfil excluído."); return ctx.recarregarTudo();
      }).catch((e) => ctx.toast(e.friendly, { tone: "error" })));
  }

  function arquivar(p, ctx) {
    ctx.bridge.request(A.arquivarPerfil, { id: p.id, arquivar: !p.arquivado }).then(() => {
      ctx.toast(p.arquivado ? "Perfil desarquivado." : "Perfil arquivado.");
      return ctx.recarregarTudo().then(() => {
        const atual = ((store.get().data.perfis || {}).perfis || []).find((x) => x.id === p.id);
        if (atual) abrirDetalhe(atual, ctx);
      });
    }).catch((e) => ctx.toast(e.friendly, { tone: "error" }));
  }

  /* ---------------- Painel do perfil ---------------- */
  function abrirDetalhe(p, ctx) {
    ctx.detail.open({
      title: "Perfil",
      selected: { tipo: "perfil", id: p.id },
      menu: [
        { label: p.arquivado ? "Desarquivar" : "Arquivar", onClick: () => arquivar(p, ctx) },
        { label: "Gerar boleto", onClick: () => ZoZo.boleto.open(ctx, { perfilId: p.id }) },
        { label: "Editar perfil", onClick: () => abrirFormPerfil(ctx, p) },
        { separador: true },
        { label: "Excluir perfil", perigo: true, onClick: () => excluirPerfil(p, ctx) },
      ],
      render(body) {
        const listaEl = h("div", { class: "detail-list" }, UI.Skeleton(3, { short: true }));
        mount(body,
          h("div", { class: "detail-hero" },
            h("div", { class: "hero-edit" },
              h("div", { class: "hero-edit__row" },
                ZoZo.inline.corDot(p.cor, (c) => ctx.bridge.request(A.updatePerfil, { id: p.id, cor: c }).then(() => { ctx.toast("Cor alterada."); return ctx.recarregarTudo(); })),
                ZoZo.inline.texto({ valor: p.nome, rotulo: "Nome do perfil", max: ZoZo.regras.limiteNome,
                  aoSalvar: (v) => ctx.bridge.request(A.updatePerfil, { id: p.id, nome: v }).then(() => { ctx.toast("Nome alterado."); return ctx.recarregarTudo(); }) })),
              p.arquivado ? h("span", { class: "status-chip status-chip--pending" }, "Arquivado") : null),
            h("div", { class: "detail-hero__figure" },
              h("span", { class: "detail-hero__label" }, "Lançamentos"),
              h("span", { class: "detail-hero__value" }, String(p.quantidade || 0)))),
          C.detalheSecao(null,
            C.detalheLinha("Gasto em " + mesAbrev(), F.moeda(p.gasto || 0)),
            p.arquivado ? h("p", { class: "field__hint" }, "Perfil arquivado: continua nos lançamentos e nos totais, mas não pode ser usado em novos lançamentos.") : null),
          C.detalheSecao("Últimos lançamentos", listaEl,
            h("div", { class: "detail-actions detail-actions--end" }, UI.Button("Ver todos", { variant: "text", size: "sm", onClick: () => verLancamentos(p, ctx) }))));
        ctx.loadData("lancamentos", A.getLancamentos).then((d) => {
          const itens = d.lancamentos.filter((l) => l.perfilId === p.id).slice(0, 10);
          mount(listaEl, itens.length
            ? L.ListaPainel(itens, { onClick: (l) => ctx.navigate("lancamentos", { select: { tipo: "lancamento", id: l.id } }) })
            : UI.EmptyState("Nenhum lançamento com este perfil."));
        }).catch((e) => mount(listaEl, UI.ErrorState(e.friendly)));
      },
    });
  }

  function linhaPerfil(p, sel, ctx) {
    return h("button", { type: "button", class: ["row", "row--interactive", "profile-row", p.id === sel && "is-selected"], "aria-current": p.id === sel ? "true" : undefined, onClick: () => abrirDetalhe(p, ctx) },
      h("span", { class: "profile-row__lead" },
        h("span", { class: "category-row__dot profile-row__dot", style: { background: F.cor(p.cor, "var(--palette-16)") }, "aria-hidden": "true" }),
        // nome e, abaixo, a quantidade de lançamentos
        h("span", { class: "profile-row__text" },
          h("span", { class: "profile-row__name" }, p.nome),
          h("span", { class: "profile-row__count" }, p.quantidade === 1 ? "1 lançamento" : (p.quantidade || 0) + " lançamentos"))),
      h("span", { class: "profile-row__value money" }, F.moeda(p.gasto || 0)));
  }

  ZoZo.pages.perfil = {
    titulo: "Perfis",
    topbar: (ctx) => [UI.IconButton("mais", "Novo perfil", { onPrimary: true, onClick: () => ZoZo.modais.novoPerfil(ctx, { aoCriar: (p) => abrirDetalhe(Object.assign({ gasto: 0, quantidade: 0 }, p), ctx) }) })],
    carregar: (ctx, force) => ctx.loadData("perfis", A.getPerfis, null, { force }),
    deps: (s) => [s.data.perfis, s.errors.perfis, s.selectedItem, s.ui.gruposFechados],
    render(state, ctx) {
      const espera = C.estadoCarregamento(state, ["perfis"], () => this.carregar(ctx, true), { skeleton: UI.Skeleton(4) });
      if (espera) return C.pagina("page--perfil", espera);
      const d = state.data.perfis;
      const perfis = d.perfis || [];
      const ativos = perfis.filter((p) => !p.arquivado);
      const arquivados = perfis.filter((p) => p.arquivado);
      const sel = state.selectedItem && state.selectedItem.tipo === "perfil" ? state.selectedItem.id : null;

      if (!perfis.length) {
        return C.pagina("page--perfil", UI.EmptyState("Nenhum perfil cadastrado. Perfis identificam a quem pertence cada lançamento (ex.: Casa, Mãe) e são usados no boleto.",
          { icon: "perfil", action: { label: "Novo perfil", icon: "mais", onClick: () => ZoZo.modais.novoPerfil(ctx, {}) } }));
      }

      return C.pagina("page--perfil",
        C.cardResumoDonut({
          ariaLabel: "Gastos do mês por perfil",
          esquerda: { valor: d.resumo ? d.resumo.gasto : 0, label: "gasto em " + mesAbrev(d.mes) },
          direita: { texto: String(d.resumo ? d.resumo.lancamentosMes : 0), label: "lançamentos em " + mesAbrev(d.mes) },
          segmentos: ativos.map((p) => ({ label: p.nome, cor: p.cor, valor: p.gasto })),
        }),
        UI.Section({ key: "perfil:lista", title: "Perfis" },
          ativos.length ? h("div", { class: "list" }, ativos.map((p) => linhaPerfil(p, sel, ctx))) : UI.EmptyState("Todos os perfis estão arquivados.", { icon: "perfil" })),
        arquivados.length ? UI.Section({ key: "perfil:arquivados", title: "Perfis arquivados" },
          h("div", { class: "list" }, arquivados.map((p) => linhaPerfil(p, sel, ctx)))) : null);
    },
  };

  ZoZo.perfilShared = { abrirFormPerfil };

  /* =============================================================
     Configurações (região inferior do painel lateral — seção 8)
     ============================================================= */

  /** Reduz a foto a 256×256 (JPEG) no próprio aplicativo: remove metadados e qualquer conteúdo embutido */
  function processarFoto(arquivo) {
    return new Promise((resolve, reject) => {
      if (!arquivo || !/^image\/(png|jpeg|webp|gif|bmp)$/.test(arquivo.type) || arquivo.size > 15 * 1024 * 1024) { reject(new Error("formato")); return; }
      const leitor = new FileReader();
      leitor.onerror = () => reject(new Error("leitura"));
      leitor.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("imagem"));
        img.onload = () => {
          const lado = Math.min(img.naturalWidth, img.naturalHeight);
          const cv = document.createElement("canvas");
          cv.width = cv.height = 256;
          const g = cv.getContext("2d");
          g.fillStyle = "#fff"; g.fillRect(0, 0, 256, 256);
          g.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, 256, 256);
          resolve(cv.toDataURL("image/jpeg", 0.86));
        };
        img.src = leitor.result;
      };
      leitor.readAsDataURL(arquivo);
    });
  }

  /** Avatar redondo: foto do usuário ou iniciais */
  function Avatar(foto, nome, tamanho) {
    const iniciais = String(nome || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0] || "").join("").toUpperCase();
    return h("span", { class: "avatar", style: { width: (tamanho || 40) + "px", height: (tamanho || 40) + "px", fontSize: Math.round((tamanho || 40) * 0.38) + "px" }, "aria-hidden": "true" },
      foto && /^data:image\/jpeg;base64,/.test(foto) ? h("img", { src: foto, alt: "" }) : iniciais);
  }

  /** CSV dos lançamentos (separador ";" para o Excel em português) */
  function gerarCsv(lancamentos) {
    // Texto: aspas duplicadas e proteção contra fórmulas (=, +, -, @, tab, CR — inclusive após espaços)
    const texto = (v) => {
      let t = String(v === null || v === undefined ? "" : v);
      if (/^\s*[=+\-@\t\r]/.test(t)) t = "'" + t;
      return /[;"\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    };
    // Número: sempre gerado aqui (nunca vem do usuário), fica numérico no Excel
    const numero = (v) => v.toFixed(2).replace(".", ",");
    const entra = (l) => ZoZo.regras.tiposValorVerde.includes(l.tipo) || (l.tipo === "interno" && l.sentido === "entrada");
    const tipos = { regular: "Regular", recorrente: "Recorrente", interno: "Transferência", receita: "Receita", estorno: "Estorno" };
    const freq = ZoZo.servico.FREQUENCIAS;
    const linhas = [["Data", "Nome", "Valor", "Tipo", "Conta", "Categoria", "Perfil", "Recorrência", "Parcela", "Notas"].join(";")];
    lancamentos.slice().sort((a, b) => a.data.localeCompare(b.data)).forEach((l) => {
      const recorrencia = l.tipo !== "recorrente" ? "" : l.recorrencia === "parcelada" ? "Parcelada" : (freq[l.recorrencia] || freq.mensal).rotulo;
      linhas.push([
        texto(F.parseData(l.data).toLocaleDateString("pt-BR")), texto(l.descricao), numero((entra(l) ? 1 : -1) * F.numero(l.valor)),
        texto(tipos[l.tipo] || l.tipo), texto(l.nomeConta), texto(l.categoria ? l.categoria.nome : ""), texto(l.perfil ? l.perfil.nome : ""),
        texto(recorrencia), texto(l.parcelaTotal ? l.parcelaAtual + "/" + l.parcelaTotal : ""), texto(l.notas),
      ].join(";"));
    });
    return "\ufeff" + linhas.join("\r\n");
  }

  /** Gera o CSV no próprio navegador e baixa (nada passa pelo servidor). Atenção: o arquivo baixado NÃO é cifrado. */
  function exportarCsv(ctx, botao) {
    botao.disabled = true;
    ctx.loadData("lancamentos", A.getLancamentos, null, { force: true }).then((d) => {
      const conteudo = gerarCsv(d.lancamentos || []);
      const nome = "ZoZo-lancamentos-" + F.iso(new Date()) + ".csv";
      const url = URL.createObjectURL(new Blob([conteudo], { type: "text/csv;charset=utf-8" }));
      const a = h("a", { href: url, download: nome, rel: "noopener" });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      ctx.toast("Arquivo CSV gerado. Ele não é criptografado: guarde-o em local seguro.");
    }).catch((e) => ctx.toast(e.friendly || ZoZo.messages.FRIENDLY.OPERATION_FAILED, { tone: "error" }))
      .finally(() => { botao.disabled = false; });
  }

  /** Ações de conta esperam as gravações em andamento (evita conflito de versão com elas) */
  const depoisDasGravacoes = (fn) => ZoZo.servico.aguardarGravacoes().then(fn);

  function quando(isoDataHora) {
    if (!isoDataHora) return "ainda não houve gravação";
    const d = new Date(isoDataHora);
    if (isNaN(d)) return "—";
    const hoje = new Date(); const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
    const hora = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    if (d.toDateString() === hoje.toDateString()) return "hoje às " + hora;
    if (d.toDateString() === ontem.toDateString()) return "ontem às " + hora;
    return F.dataExtenso(F.iso(d)) + " às " + hora;
  }

  /* ---------------- 2FA: painel lateral dentro da janela de Configurações ---------------- */
  const PASSOS_2FA = ["Abra seu aplicativo 2FA", "Clique em + ou Adicionar", "Escaneie o QR code ou insira a chave de configuração", "Insira o código de seis dígitos."];

  function abrirPainel2FA(ctx, janelaEl, aoAtivar) {
    if (!janelaEl || janelaEl.querySelector(".p2fa")) return;
    const V = ZoZo.verificacao;
    let erros = 0, fechado = false;
    const fechar = () => {
      if (fechado) return;
      fechado = true;
      painel.classList.remove("is-aberto");                       // desliza da esquerda para a direita
      setTimeout(() => painel.remove(), 260);
      document.removeEventListener("keydown", tecla, true);
    };
    const tecla = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fechar(); } };

    const check = h("span", { class: "p2fa__ok", "aria-hidden": "true", hidden: true }, icon("check", { size: 12 }));
    const erro = h("p", { class: "p2fa__erro", role: "alert" });
    const qrArea = h("div", { class: "p2fa__qr", "aria-busy": "true" }, h("span", { class: "spinner", "aria-hidden": "true" }));
    const chaveTexto = h("code", { class: "p2fa__chave" }, "");
    let chave = "";
    const copiar = h("button", { type: "button", class: "icon-btn icon-btn--sm", "aria-label": "Copiar chave de configuração", title: "Copiar",
      onClick: () => navigator.clipboard.writeText(chave).then(() => ctx.toast("Chave copiada."), () => ctx.toast("Não foi possível copiar.", { tone: "error" })) },
      icon("copiar", { size: 15 }));
    const campo = V.CampoCodigo({
      rotulo: "Código de 6 dígitos do aplicativo 2FA",
      onDigitar: () => { campo.marcarErro(false); },
      onCompleto: (codigo) => {
        campo.desabilitar(true);
        ctx.bridge.request(A.confirmar2FA, { codigo }).then((r) => {
          erro.textContent = "";
          check.hidden = false;                                     // ✓ ao lado de "Insira o código de seis dígitos."
          store.set({ session: { user: r.user } });
          if (aoAtivar) aoAtivar();
          setTimeout(() => { fechar(); ctx.toast("Autenticação de dois fatores ativada."); }, 700);
        }).catch((e) => {
          erros += 1;
          erro.textContent = e.code === "TOO_MANY_ATTEMPTS" || e.espera ? FR.TOO_MANY_ATTEMPTS : e.code === "CODE_INVALID" ? (erros === 1 ? FR.CODE_INVALID : FR.CODE_INVALID_AGAIN) : e.friendly;
          campo.desabilitar(false); campo.marcarErro(true); campo.limpar();
        });
      },
    });

    const passo = (n, titulo, extra) => h("li", { class: "p2fa__passo" },
      h("span", { class: "p2fa__num", "aria-hidden": "true" }, String(n)),
      h("div", { class: "p2fa__corpo" }, h("p", { class: "p2fa__titulo" }, titulo, n === 4 ? check : null), extra || null));

    const painel = h("aside", { class: "p2fa", role: "dialog", "aria-modal": "false", "aria-label": "Autenticação de Dois Fatores" },
      h("header", { class: "p2fa__topo" },
        h("h3", { class: "p2fa__h" }, "Autenticação de Dois Fatores"),
        h("button", { type: "button", class: "icon-btn", "aria-label": "Fechar", onClick: fechar }, icon("fechar"))),
      h("ol", { class: "p2fa__passos" },
        passo(1, PASSOS_2FA[0], h("p", { class: "p2fa__dica" }, "Não tem um? Use o Google Authenticator, Microsoft Authenticator, Authy ou o do seu gerenciador de senhas.")),
        passo(2, PASSOS_2FA[1]),
        passo(3, PASSOS_2FA[2], h("div", null, qrArea, h("div", { class: "p2fa__chave-linha" }, chaveTexto, copiar))),
        passo(4, PASSOS_2FA[3], h("div", null, campo.el, erro))));

    janelaEl.appendChild(painel);
    document.addEventListener("keydown", tecla, true);
    requestAnimationFrame(() => requestAnimationFrame(() => painel.classList.add("is-aberto")));   // desliza da direita para a esquerda

    // QR code e chave gerados no servidor a cada abertura (o anterior, se não confirmado, é descartado)
    ctx.bridge.request(A.iniciar2FA).then((r) => {
      chave = r.chave;
      chaveTexto.textContent = r.chave.replace(/(.{4})/g, "$1 ").trim();
      mount(qrArea, V.QR(r.uri, 176));
      qrArea.removeAttribute("aria-busy");
      campo.foco();
    }).catch((e) => { mount(qrArea, h("p", { class: "p2fa__erro" }, e.friendly)); qrArea.removeAttribute("aria-busy"); });
  }

  function desativar2FA(ctx) {
    return ZoZo.feedback.confirmarExclusao("Desativar 2FA?",
      "Você não precisará mais de um código de verificação para iniciar sessão, mas sua conta não terá a camada extra de segurança.",
      { confirmar: "Desativar", variante: "primary" })
      .then((ok) => ok && ctx.bridge.request(A.desativar2FA).then((r) => { store.set({ session: { user: r.user } }); ctx.toast("Autenticação de dois fatores desativada."); }))
      .catch((e) => ctx.toast(e.friendly, { tone: "error" }));
  }

  /* ---------------- Configurações: Geral | Conta ---------------- */
  let abaConfig = "geral";

  function linhaConfig(titulo, sub, direita) {
    return h("div", { class: "cfg-row" },
      h("div", { class: "cfg-row__text" }, h("span", { class: "cfg-row__title" }, titulo), sub ? h("span", { class: "cfg-row__sub" }, sub) : null),
      h("div", { class: "cfg-row__right" }, direita));
  }

  ZoZo.pages.configuracoes = {
    titulo: "Configurações",
    carregar: (ctx, force) => ctx.loadData("config", A.getConfig, null, { force: true }),
    deps: (s) => [s.session.user, s.session.storageAvailable, s.data.config],
    render(state, ctx) {
      const u = state.session.user || {};
      const cfg = state.data.config || {};
      const disponivel = state.session.storageAvailable !== false;
      const redesenhar = ctx.redesenharConfig || (() => {});

      const nav = h("nav", { class: "cfg-nav", "aria-label": "Seções das configurações" },
        h("p", { class: "cfg-nav__title" }, "Configurações"),
        [["geral", "configuracoes", "Geral"], ["conta", "perfil", "Conta"], ["sobre", "info", "Sobre"]].map(([id, ic, rot]) => h("button", {
          type: "button", class: ["nav-item", abaConfig === id && "is-active"], "aria-current": abaConfig === id ? "page" : undefined,
          onClick: () => { abaConfig = id; redesenhar(); },
        }, icon(ic, { size: 16 }), h("span", null, rot))));

      let conteudo;
      if (abaConfig === "sobre") {
        conteudo = [
          h("h3", { class: "cfg-section" }, "Sobre"),
          linhaConfig("Versão", null, h("span", { class: "cfg-readonly" }, "ZoZo v" + ZoZo.sobre.versao)),
          linhaConfig("Autor", null, h("span", { class: "cfg-readonly" }, ZoZo.sobre.autor)),
        ];
      } else if (abaConfig === "geral") {
        conteudo = [
          h("h3", { class: "cfg-section" }, "Orçamento"),
          linhaConfig("Ativar orçamento", "Definir orçamentos mensais para as categorias",
            ZoZo.modais.Interruptor("", cfg.orcamentoAtivo !== false, (v) => ctx.bridge.request(A.updateConfig, { orcamentoAtivo: v })
              .then(() => { ctx.toast(v ? "Orçamento ativado." : "Orçamento desativado."); return ctx.loadData("config", A.getConfig, null, { force: true }); }).then(() => ctx.recarregarTudo()).catch((e) => ctx.toast(e.friendly, { tone: "error" })))),
          h("h3", { class: "cfg-section" }, "Armazenamento"),
          linhaConfig(
            ZoZo.bridge.isDemo ? "Modo de demonstração: os dados ficam só neste navegador." : disponivel ? "Seus dados são criptografados neste navegador e guardados na nuvem do ZoZo. Ninguém lê seus dados sem a sua senha." : ZoZo.messages.FRIENDLY.STORAGE_UNAVAILABLE,
            "Última gravação: " + quando(cfg.ultimaGravacao) + ".",
            icon(disponivel ? "nuvem" : "alerta", { size: 18, class: disponivel ? "cfg-ok" : "cfg-alerta" })),
        ];
      } else {
        // Foto
        const arquivo = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif,image/bmp", class: "visually-hidden", "aria-label": "Escolher foto" });
        arquivo.addEventListener("change", () => {
          const f = arquivo.files && arquivo.files[0];
          arquivo.value = "";
          if (!f) return;
          processarFoto(f).then((foto) => ctx.bridge.request(A.updateConfig, { foto }))
            .then(() => { ctx.toast("Foto atualizada."); return ctx.loadData("config", A.getConfig, null, { force: true }); })
            .catch((e) => ctx.toast(e && e.friendly ? e.friendly : "Não foi possível usar essa imagem. Escolha um arquivo PNG ou JPG.", { tone: "error" }));
        });
        // Alterar senha (senha atual + nova)
        const senhaAtual = h("input", { type: "password", class: "input input--sm", placeholder: "Senha atual", autocomplete: "current-password", "aria-label": "Senha atual" });
        const novaSenha = h("input", { type: "password", class: "input input--sm", placeholder: "Nova senha", autocomplete: "new-password", "aria-label": "Nova senha" });
        const alterarSenha = (btn) => {
          if (!senhaAtual.value) { senhaAtual.focus(); return; }
          if (novaSenha.value.length < 8) { ctx.toast("Use uma nova senha com pelo menos 8 caracteres.", { tone: "error" }); novaSenha.focus(); return; }
          btn.disabled = true;
          const dados = { senhaAtual: senhaAtual.value, novaSenha: novaSenha.value };
          depoisDasGravacoes(() => ctx.bridge.request(A.changePassword, dados, { timeout: 120000 }))
            .then(() => { senhaAtual.value = ""; novaSenha.value = ""; ctx.toast("Senha alterada."); })
            .catch((e) => ctx.toast(e.friendly, { tone: "error" }))
            .finally(() => { btn.disabled = false; });
        };
        const apagarDados = () => ZoZo.modais.confirmarComSenha({ titulo: "Apagar todos os dados?", botao: "Apagar dados",
          mensagem: "Lançamentos, contas, categorias e perfis serão apagados. Seu login continua funcionando. Essa ação não pode ser desfeita." })
          .then((senha) => senha && depoisDasGravacoes(() => ctx.bridge.request(A.wipeUserData, { senha })).then(() => {
            ZoZo.servico.reset();
            // Filtros, seleção e preferências apontavam para itens que não existem mais
            store.set({ ui: { filtros: null, selecionados: [], busca: "", invExcluidas: [], mostrarOcultas: {}, gruposFechados: {} }, selectedItem: null });
            ctx.detail.close({ silencioso: true });
            ctx.toast("Dados apagados.");
            return ctx.recarregarTudo();
          })
            .catch((e) => ctx.toast(e.friendly, { tone: "error" })));

        conteudo = [
          h("h3", { class: "cfg-section" }, "Informação"),
          // Foto centralizada (clique para trocar) e "Remover" logo abaixo
          h("div", { class: "cfg-photo-center" },
            h("button", { type: "button", class: "cfg-photo__btn", title: cfg.foto ? "Trocar foto" : "Escolher foto", "aria-label": cfg.foto ? "Trocar foto" : "Escolher foto", onClick: () => arquivo.click() },
              Avatar(cfg.foto, u.nomeUsuario, 72), h("span", { class: "cfg-photo__overlay", "aria-hidden": "true" }, icon("camera", { size: 20 }))),
            cfg.foto ? UI.Button("Remover", { size: "sm", onClick: () => ctx.bridge.request(A.updateConfig, { foto: null })
              .then(() => ctx.loadData("config", A.getConfig, null, { force: true })) }) : null,
            arquivo),
          linhaConfig("Nome", null, ZoZo.inline.texto({ valor: u.nomeUsuario, rotulo: "Nome do usuário", max: 80, classe: "cfg-inline",
            aoSalvar: (v) => ZoZo.modais.confirmarComSenha({ titulo: "Confirmar alteração", botao: "Salvar", mensagem: "Digite sua senha para alterar o nome." })
              .then((senha) => {
                if (!senha) throw new ZoZo.messages.BridgeError("CANCELADO", "Alteração cancelada.");
                return ctx.bridge.request(A.updateUser, { nomeUsuario: v, email: u.email, senhaAtual: senha });
              }).then((sessao) => { store.set({ session: { user: sessao.user } }); ctx.toast("Nome alterado."); }) })),
          linhaConfig("E-mail", null, h("span", { class: "cfg-readonly" }, u.email || "")),
          linhaConfig("Alterar senha", null,
            h("div", { class: "cfg-password" }, senhaAtual, novaSenha, UI.Button("Alterar", { size: "sm", onClick: (e) => alterarSenha(e.currentTarget) }))),
          linhaConfig("Autenticação de Dois Fatores", null, u.doisFatores
            ? UI.Button("Desativar 2FA", { size: "sm", onClick: () => desativar2FA(ctx) })
            : UI.Button("Ativar 2FA", { size: "sm", variant: "primary", onClick: (e) => abrirPainel2FA(ctx, e.currentTarget.closest(".modal")) })),
          h("h3", { class: "cfg-section" }, "Ações"),
          linhaConfig("Exportar todos os lançamentos", "Baixe seus dados em um arquivo CSV", UI.Button("Baixar", { size: "sm", icon: "baixar", onClick: (e) => exportarCsv(ctx, e.currentTarget) })),
          linhaConfig("Apagar todos os dados", "Mantém o login e remove lançamentos, contas, categorias e perfis", UI.Button("Apagar", { size: "sm", variant: "danger-ghost", onClick: apagarDados })),
        ];
      }
      // Sair e Excluir conta ficam fixos no rodapé da janela (aba Conta)
      const rodape = abaConfig === "conta" ? h("div", { class: "cfg-footer" },
        UI.Button("Sair", { onClick: () => ctx.logout() }),
        h("button", { type: "button", class: "cfg-danger-btn", onClick: () => ZoZo.modais.confirmarComSenha({ titulo: "Excluir conta?", botao: "Excluir conta",
          mensagem: "Sua conta, todos os seus dados e o histórico de versões serão excluídos do servidor. Essa ação não pode ser desfeita." })
          .then((senha) => senha && depoisDasGravacoes(() => ctx.bridge.request(A.deleteUser, { senha })).then(() => { ctx.toast("Conta excluída."); ctx.encerrarSessao(); })
            .catch((e) => ctx.toast(e.friendly, { tone: "error" }))) }, "Excluir conta")) : null;
      return h("div", { class: "page page--config cfg" }, nav, h("div", { class: "cfg-main" }, h("div", { class: "cfg-content" }, conteudo), rodape));
    },
  };

  ZoZo.usuario = { Avatar };
  ZoZo.exportarCsv = exportarCsv;

  /* =============================================================
     Configurações em janela modal
     Os formulários (nome, senha, apagar dados…) abrem dentro da
     própria janela, com "Voltar" para a tela principal.
     ============================================================= */
  function abrirConfiguracoes(ctx) {
    const area = h("div", { class: "settings-modal" });
    let cancelar = null;
    const ctxModal = Object.assign({}, ctx);
    function principal() {
      const st = store.get();
      if (!st.session.authenticated) { janela.fechar(); return; }
      mount(area, ZoZo.pages.configuracoes.render(st, ctxModal));
    }
    ctxModal.redesenharConfig = principal;
    const janela = ZoZo.feedback.modal({ title: "Configurações", class: "modal--settings", body: area, onClose: () => { if (cancelar) cancelar(); } });
    ctxModal.logout = (msg) => { janela.fechar(); ctx.logout(msg); };
    ctxModal.encerrarSessao = () => { janela.fechar(); ctx.encerrarSessao(); };
    let ultimo = null;
    cancelar = store.subscribe((st) => {
      const chave = [st.session.user, st.data.config, st.session.authenticated];
      if (ultimo && chave.every((v, k) => v === ultimo[k])) return;
      ultimo = chave;
      if (!st.session.authenticated) { janela.fechar(); return; }
      // não redesenha enquanto o usuário digita (ex.: senha)
      if (!area.contains(document.activeElement) || document.activeElement.tagName !== "INPUT") principal();
    });
    abaConfig = "geral";
    principal();
    ctx.loadData("config", A.getConfig, null, { force: true }).catch(() => null);
  }

  ZoZo.configuracoes = { abrir: abrirConfiguracoes };
})(window.ZoZo);
