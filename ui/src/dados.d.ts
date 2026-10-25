/* =============================================================
   ZoZo — tipos dos dados (documento cifrado e respostas do serviço)
   ------------------------------------------------------------
   Fonte única do formato dos dados: o serviço (js/data/servico.ts)
   é conferido contra estes tipos (LEITURAS e ESCRITAS devolvem
   exatamente RespostasServico[ação]) e as telas recebem os mesmos
   tipos por ctx.loadData / ctx.bridge.request. Mudou o que o
   serviço devolve? Mude aqui: o compilador aponta cada tela afetada.
   ============================================================= */
export {};

declare global {
  /* ---------------- documento (o que fica cifrado no servidor) ---------------- */
  type Id = string;
  type Moeda = CodigoMoeda;
  type Sentido = "entrada" | "saida";
  type TipoConta = "cartao" | "corrente" | "poupanca" | "investimento" | "emprestimo" | "outros";
  type TipoLancamento = "regular" | "recorrente" | "interno" | "receita" | "estorno" | "debito";

  interface PontoSaldo { data: string; saldo: number }
  interface CicloCartao { fechamento: number | null; vencimento: number | null }
  interface ContratoEmprestimo { valorContratado: number | null; primeiroVencimento: string | null; parcelas: number | null; valorParcela: number | null }
  interface Conta {
    id: Id; nome: string; tipo: string; historico: PontoSaldo[]; ultimos4Digitos?: string; cor?: string | null; tipoInvestimento?: string;
    instituicao?: string; limite?: number | null; fechamento?: number | null; vencimento?: number | null; ciclos?: Record<string, CicloCartao>;
    emprestimo?: ContratoEmprestimo | null; oculta?: boolean; moeda?: Moeda;
  }
  interface Categoria {
    id: Id; nome: string; icone: string; cor: string | null; grupo: string | null; reservado: number; status: string;
    orcamentos?: Record<string, number>; moeda?: Moeda;
  }
  interface Perfil { id: Id; nome: string; cor: string | null; orcamento: number; arquivado?: boolean; moeda?: Moeda }
  interface Divisao { id: Id; total: number; partes: number }
  /** Efeito já aplicado no saldo de uma conta (conciliado em sincronizarSaldos: nunca em dobro) */
  interface Efeito { contaId: Id; delta: number }
  interface Lancamento {
    id: Id; data: string; descricao: string; valor: number; tipo: string;
    contaId?: Id | null; categoriaId?: Id | null; perfilId?: Id | null; notas?: string;
    recorrencia?: string | null; parcelaAtual?: number | null; parcelaTotal?: number | null;
    sentido?: Sentido | null; direcao?: Sentido | null; serieId?: string | null; competencia?: string; encerradaEm?: string | null;
    moeda?: Moeda; debito?: boolean; valorParcela?: number; valorTotal?: number; efeito?: Efeito; divisao?: Divisao | null;
    automatico?: boolean; editado?: boolean; ignorados?: string[]; ocorrencia?: string; valorInvalido?: boolean;
    debitado?: { contaId: Id; valor: number };          // formato anterior (2.8–3.1)
    /** "Pagar fatura": o par débito (conta) + receita (cartão) do pagamento do CARTÃO ao banco (não é cobrança de perfil) */
    pagamentoCartao?: boolean;
    /** Receita que quita a fatura de um perfil: o mês ("AAAA-MM") da fatura paga (o perfil é o do lançamento) */
    faturaPerfil?: string;
  }
  /** Ajuste da fatura de um perfil (contribuição, desconto ou arredondamento) */
  interface AjusteFatura { descricao: string; valor: number }
  /** Ajustes guardados de uma fatura (chave "perfilId|AAAA-MM") */
  interface FaturaGuardada { contribuicoes: AjusteFatura[]; descontos: AjusteFatura[]; arredondamentos: AjusteFatura[] }
  interface GrupoOrcamento { naoAtribuido: number; orcamentos: Record<string, number> }
  interface ChavePix { chave: string; nome: string; cidade: string }
  interface ConfigDoc {
    foto?: string; orcamentoAtivo?: boolean; pix?: ChavePix;
    multicambio?: boolean; moeda?: Moeda; moedasIniciadas?: Moeda[];
  }
  interface Documento {
    versao: number; perfis: Perfil[]; contas: Conta[]; categorias: Categoria[]; lancamentos: Lancamento[];
    grupos: Record<string, GrupoOrcamento>; config: ConfigDoc; meta: { ultimaGravacao?: string; saldoPorTransacao?: number };
    faturas: Record<string, FaturaGuardada>;
  }

  /* ---------------- o que as telas recebem ---------------- */
  type ResumoCategoria = { nome: string; icone: string; cor: string | null };
  /** Lançamento como a interface o recebe: com nome da conta, categoria e perfil */
  type LancamentoTela = Lancamento & { nomeConta: string; ultimos4Digitos: string; categoria: ResumoCategoria | null; perfil: { nome: string; cor: string | null } | null };
  interface ContaTela {
    id: Id; nome: string; ultimos4Digitos: string; tipo: string; tipoInvestimento: string; oculta: boolean; cor: string | null | undefined;
    instituicao: string; limite: number | null; fechamento: number | null; vencimento: number | null; ciclos: Record<string, CicloCartao>;
    cicloAtual: { fechamento: number | null; vencimento: number | null; soEsteMes: boolean } | null;
    emprestimo: ContratoEmprestimo | null; valor: number; variacaoPercentual: number;
  }
  type CategoriaTela = Categoria & { usada: boolean; gasto: number; reservado: number; reservadoFixo: number; orcamentoPorMes: boolean; coberturaGrupo?: number };
  interface GrupoTela { nome: string; naoAtribuido: number; naoAtribuidoBase: number; naoAtribuidoFixo: number; porMes: boolean; coberto: number; subcategorias: number; total: number }
  /** Categorias na ordem da lista (categoriasShared.estruturar): soltas ou grupos com os totais */
  interface BlocoGrupoCategorias { tipo: "grupo"; nome: string; itens: CategoriaTela[]; gasto: number; naoAtribuido: number; reservado: number; quantidade: number }
  type BlocoCategorias = BlocoGrupoCategorias | { tipo: "categoria"; cat: CategoriaTela };
  type PerfilTela = Perfil & { orcamento: number; arquivado: boolean; gasto: number; quantidade: number };
  /** Ocorrência de uma recorrência num mês (lista de Recorrências) */
  interface ItemRecorrencia {
    id: string; serieId: Id; mes: string; chave: string; data: string; descricao: string; tipoRecorrencia: string;
    recorrencia?: string | null; parcela: number | null | undefined; parcelaTotal?: number | null; categoriaId?: Id | null;
    categoria: ResumoCategoria | null; valor: number; pago: boolean; lancamentoId: Id | null; encerrada: boolean; proxima?: boolean;
  }
  interface ValorVariacao { valor: number; variacaoPercentual: number }

  interface RespostaLancamentos { lancamentos: LancamentoTela[] }
  interface RespostaContas {
    contas: ContaTela[];
    resumo: { ativos: ValorVariacao; passivos: ValorVariacao; serie: Array<{ data: string; ativos: number; passivos: number }> };
  }
  interface RespostaInvestimentos {
    contas: ContaTela[]; incluidas: Id[]; alocacoes: Array<{ tipoInvestimento: string; icone: string; percentual: number }>;
    resumo: ValorVariacao & { serie: Array<{ data: string; valor: number }> };
  }
  interface RespostaCategorias { mes: string; resumo: { gasto: number; reservado: number }; categorias: CategoriaTela[]; grupos: Record<string, GrupoTela> }
  interface RespostaRecorrencias {
    mes: string; resumo: { restante: number; pago: number };
    recorrencias: ItemRecorrencia[]; proximas: ItemRecorrencia[]; arquivadas: ItemRecorrencia[];
  }
  interface RespostaPerfis { mes: string; perfis: PerfilTela[]; resumo: { gasto: number; lancamentosMes: number } }
  interface RespostaConfig {
    foto: string | null; ultimaGravacao: string | null; orcamentoAtivo: boolean; pix: ChavePix | null;
    multicambio: boolean; moeda: Moeda; moedasIniciadas: Moeda[];
  }
  interface RespostaDashboard {
    gastoMensal: { mes: string; dias: Array<{ data: string; valor: number }>; total: number; orcamento: number; ultimoDia: number };
    contas: RespostaContas; categorias: RespostaCategorias; recorrencias: RespostaRecorrencias; ultimosLancamentos: LancamentoTela[];
  }
  interface RespostaFatura {
    perfil: Perfil | null; mes: string; moeda: Moeda;
    lancamentos: LancamentoTela[];
    ajustes: FaturaGuardada;
    periodos: Array<{ contaId: Id; nome: string; ultimos4Digitos: string; inicio: string; fim: string; semFechamento: boolean }>;
    recebimentos: LancamentoTela[]; saldoAnterior: number; pix: ChavePix | null;
  }

  /** Leituras do serviço → resposta (o serviço é conferido contra esta tabela) */
  interface RespostasLeitura {
    getLancamentos: RespostaLancamentos;
    getLancamentosOutrasMoedas: { moeda: Moeda; lancamentos: Array<{ id: Id; data: string; descricao: string; valor: number; moeda: Moeda; tipo: string; recorrencia: string | null }> };
    getContas: RespostaContas;
    getInvestimentos: RespostaInvestimentos;
    getCategorias: RespostaCategorias;
    getRecorrencias: RespostaRecorrencias;
    getPerfis: RespostaPerfis;
    getConfig: RespostaConfig;
    getContaHistorico: { conta: ContaTela; diferenca: number; serie: Array<{ data: string; valor: number }> };
    getCategoriaSerie: { meses: Array<{ mes: string; gasto: number }>; reservado: number };
    getSerieRecorrencia: { pontos: Array<{ mes: string; data: string; valor: number; pago: boolean; futuro: boolean }>; lancamentos: LancamentoTela[] };
    getDashboard: RespostaDashboard;
    getBoletoData: RespostaFatura;
  }
  type NomeLeitura = keyof RespostasLeitura;

  /** Todas as ações da ponte (js/bridge/messages.ts: ACTIONS[nome] === nome) */
  type NomeAcao = NomeLeitura
    | "getSession" | "registerUser" | "reenviarConfirmacao" | "conferirLink" | "pedirRecuperacao" | "abrirRecuperacao" | "concluirRecuperacao"
    | "getProtecao" | "setProtecao" | "login" | "verificar2FA" | "logout" | "getArmazenamento" | "getGoogle" | "verificarAtualizacao"
    | "createLancamento" | "updateLancamento" | "deleteLancamento" | "updateUser" | "changePassword" | "wipeUserData" | "deleteUser"
    | "iniciar2FA" | "confirmar2FA" | "desativar2FA" | "loadUserData" | "saveUserData"
    | "createConta" | "updateConta" | "updateCicloCartao" | "deleteConta"
    | "createCategoria" | "updateCategoria" | "deleteCategoria" | "createCategoriasSugeridas"
    | "createPerfil" | "updatePerfil" | "deletePerfil" | "arquivarPerfil"
    | "updateLancamentosEmLote" | "deleteLancamentos" | "updateConfig"
    | "pagarRecorrencia" | "encerrarRecorrencia" | "excluirRecorrencia" | "tornarRecorrente" | "vincularRecorrencia" | "desvincularRecorrencia"
    | "dividirLancamento" | "pagarFatura" | "salvarFatura" | "receberFatura"
    | "updateGrupo" | "desagruparCategorias" | "transferirMoeda";
  /** Resposta de uma ação: leituras já tipadas; as outras, ainda `any` (tipadas aos poucos, tela por tela) */
  type RespostaDe<K extends NomeAcao> = K extends NomeLeitura ? RespostasLeitura[K] : any;

  /** Dados guardados no estado (store.data[chave]) e a leitura que preenche cada chave */
  interface DadosEstado {
    lancamentos: RespostaLancamentos;
    contas: RespostaContas;
    investimentos: RespostaInvestimentos;
    categorias: RespostaCategorias;
    recorrencias: RespostaRecorrencias;
    perfis: RespostaPerfis;
    config: RespostaConfig;
    dashboard: RespostaDashboard;
  }
  type ChaveDados = keyof DadosEstado;
  /** store.data: cada chave começa vazia (null) e é preenchida pela leitura dela */
  type DadosNoEstado = { [K in ChaveDados]?: DadosEstado[K] | null };
  interface LeituraDaChave {
    lancamentos: "getLancamentos"; contas: "getContas"; investimentos: "getInvestimentos"; categorias: "getCategorias";
    recorrencias: "getRecorrencias"; perfis: "getPerfis"; config: "getConfig"; dashboard: "getDashboard";
  }
}
