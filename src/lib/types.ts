export const PAPEIS = [
  { v: 'cliente', l: 'Cliente' },
  { v: 'parceiro', l: 'Parceiro' },
  { v: 'fornecedor', l: 'Fornecedor' },
  { v: 'concorrente', l: 'Concorrente' },
] as const

export const WOBA_STATUS = ['Sim', 'Não', 'Validar'] as const
export const CLASSIFICACOES = ['Potencial cliente', 'Parceiro', 'Fornecedor', 'Fonte de conhecimento'] as const
export const ORIGENS = ['Prospecção direta', 'Woba', 'Indicação', 'Evento', 'Outro'] as const
export const POTENCIAIS = ['Alto', 'Médio', 'Baixo'] as const
export const EVIDENCIAS = ['Forte', 'Média', 'Fraca'] as const
export const PADROES = ['Essential', 'Comfort', 'Premium'] as const
export const ESTADOS_IMOVEL = ['Semi-pronto', 'Laje nova'] as const
export const CLASSES_PREDIO = ['AAA', 'A', 'B', 'C'] as const
export const PRAZOS_CONTRATO = [24, 36, 60, 120] as const
export const URGENCIAS = ['Até 3 meses', 'De 3 a 6 meses', 'De 6 a 12 meses', 'Só pesquisando'] as const
export const JA_TEM_IMOVEL = ['Não, precisa de ajuda', 'Sim, já escolhido', 'Sim, já ocupa e quer reformar'] as const
export const TIPOS_INTERACAO = ['reunião', 'mensagem', 'e-mail', 'ligação', 'evento', 'outro'] as const
export const DONOS_PENDENCIA = ['Clip', 'Cliente', 'Canal'] as const
export const STATUS_PENDENCIA = ['aberta', 'respondida', 'fechada'] as const
export const STATUS_PROPOSTA = ['rascunho', 'enviada', 'em validação', 'revisão', 'aceita', 'expirada'] as const

export const PAPEIS_USUARIO = [
  { v: 'gestor', l: 'Gestor' },
  { v: 'comercial', l: 'Comercial' },
  { v: 'projetos', l: 'Projetos' },
  { v: 'engenharia', l: 'Engenharia' },
  { v: 'facilities', l: 'Facilities' },
  { v: 'financeiro', l: 'Financeiro' },
] as const

export const TIPOS_SERVICO = ['OaaS', 'BTS', 'Turnkey', 'Fit-out', 'Facilities', 'Outro'] as const
export const TIPOS_CONTRATO = ['OaaS', 'BTS', 'Turnkey', 'Fit-out', 'Facilities', 'Combinação'] as const
export const STATUS_CONTRATO = ['Rascunho', 'Em negociação', 'Vigente', 'Encerrado', 'Rescindido'] as const
export const RENOVACOES = ['Automática', 'Manual', 'Sem renovação'] as const
export const INDICES_REAJUSTE = ['IPCA', 'IGP-M', 'INPC', 'Fixo', 'Outro'] as const
export const TIPOS_OPERACAO = ['Escritório', 'Centro de recrutamento', 'Treinamento', 'Galpão', 'Outro'] as const
export const SITUACOES_UNIDADE = ['Em estudo', 'Em implantação', 'Ativo', 'Encerrado'] as const
export const STATUS_RELACIONAMENTO = ['Prospect', 'Em negociação', 'Ativo', 'Em pausa', 'Encerrado'] as const
export const APROVACOES_ABORDAGEM = ['Não necessária', 'Pendente', 'Aprovada'] as const
export const STATUS_PROJETO = [
  { v: 'planejamento', l: 'Planejamento' },
  { v: 'em_execucao', l: 'Em execução' },
  { v: 'pausado', l: 'Pausado' },
  { v: 'concluido', l: 'Concluído' },
  { v: 'cancelado', l: 'Cancelado' },
] as const
export const STATUS_ETAPA_PROJETO = [
  { v: 'pendente', l: 'Pendente' },
  { v: 'em_andamento', l: 'Em andamento' },
  { v: 'concluida', l: 'Concluída' },
] as const
export const TIPOS_REGISTRO = [
  { v: 'risco', l: 'Risco' },
  { v: 'pendencia', l: 'Pendência / dependência' },
  { v: 'decisao', l: 'Decisão' },
  { v: 'mudanca_escopo', l: 'Mudança de escopo' },
] as const
export const STATUS_TAREFA = [
  { v: 'aberta', l: 'A fazer' },
  { v: 'em_andamento', l: 'Em andamento' },
  { v: 'bloqueada', l: 'Bloqueada' },
  { v: 'concluida', l: 'Concluída' },
] as const
export const PRIORIDADES = ['baixa', 'média', 'alta'] as const
export const ESPECIALIDADES = [
  'Civil', 'Elétrica', 'Cabeamento', 'Climatização', 'Pintura', 'Mobiliário', 'Limpeza', 'Segurança', 'Marcenaria', 'Internet / TI', 'Outra',
] as const
export const HOMOLOGACOES = ['Em análise', 'Homologado', 'Suspenso', 'Reprovado'] as const
export const DISPONIBILIDADES = ['Disponível', 'Parcial', 'Indisponível'] as const
export const STATUS_PARCEIRO_PROJETO = [
  { v: 'cotado', l: 'Cotado' },
  { v: 'contratado', l: 'Contratado' },
  { v: 'concluido', l: 'Concluído' },
  { v: 'cancelado', l: 'Cancelado' },
] as const
export const TIPOS_DOCUMENTO = [
  'Proposta', 'Contrato', 'Planta / layout', 'Projeto técnico', 'Orçamento / cotação', 'Documento de fornecedor',
  'ART / RRT', 'Foto de vistoria', 'Checklist / termo de aceite', 'Manual / garantia', 'Aditivo / aprovação', 'Outro',
] as const
export const STATUS_DOCUMENTO = ['Rascunho', 'Em aprovação', 'Aprovado', 'Reprovado', 'Obsoleto'] as const

export interface Profile {
  id: string
  nome: string | null
  email: string | null
  role: 'gestor' | 'comercial' | 'projetos' | 'engenharia' | 'facilities' | 'financeiro'
}

export interface Organizacao {
  id: string
  nome: string
  papeis: string[]
  atendida_woba: 'Sim' | 'Não' | 'Validar'
  comissao_padrao_pct: number | null
  setor: string | null
  regiao: string | null
  cidade: string | null
  porte: string | null
  papel_na_cadeia: string | null
  servicos: string | null
  categorias_servico: string[]
  contato_principal: string | null
  fonte_informacao: string | null
  data_pesquisa: string | null
  observacoes: string | null
  razao_social: string | null
  cnpj: string | null
  site: string | null
  cidades_atuacao: string | null
  responsavel_id: string | null
  origem_relacionamento: string | null
  necessidades: string | null
  proximo_passo: string | null
  proximo_passo_data: string | null
  ultimo_contato: string | null
  status_relacionamento: string | null
}

export interface Contato {
  id: string
  organizacao_id: string | null
  nome: string
  cargo: string | null
  email: string | null
  telefone: string | null
  contexto: string | null
  data_contato: string | null
  assunto: string | null
  classificacao: string | null
  mensagem_continuidade_enviada: boolean
  data_envio: string | null
  resposta: string | null
  proximo_passo: string | null
  proximo_passo_data: string | null
  ultima_interacao: string | null
  observacoes: string | null
  decisor?: boolean
  organizacao?: { id: string; nome: string } | null
}

export interface Etapa {
  id: number
  nome: string
  descricao: string | null
  criterio_avanco: string | null
  apenas_origem_direta: boolean
  prazo_alvo_dias: number | null
  probabilidade_padrao: number | null
}

export interface PlaybookItem {
  id: string
  etapa_id: number
  ordem: number
  tipo: 'pergunta' | 'documento' | 'tarefa'
  texto: string
  obrigatorio: boolean
}

export interface Oportunidade {
  id: string
  titulo: string
  cliente_final_id: string
  canal_id: string | null
  contratante_id: string | null
  origem: string
  modelo_atuacao: 'operador' | 'outros'
  etapa_id: number
  status: 'aberta' | 'ganha' | 'perdida'
  motivo_perda: string | null
  sinal_oportunidade: string | null
  fonte_sinal: string | null
  necessidade_provavel: string | null
  decisores: string | null
  potencial: string | null
  evidencia: string | null
  prioridade: string | null
  prazo_estimado: string | null
  cidade: string | null
  area_m2: number | null
  posicoes: number | null
  padrao: string | null
  estado_imovel: string | null
  classe_predio: string | null
  prazo_contrato_meses: number | null
  urgencia: string | null
  ja_tem_imovel: string | null
  mensalidade_estimada: number | null
  comissao_canal_pct: number | null
  proximo_passo: string | null
  proximo_passo_data: string | null
  responsavel_id: string | null
  etapa_atualizada_em: string
  fechada_em: string | null
  observacoes: string | null
  tipo_servico: string | null
  valor_estimado: number | null
  probabilidade: number | null
  prazo_fechamento: string | null
  concorrentes: string | null
  riscos: string | null
  tipo_imovel: string | null
  necessidade_obra: boolean | null
  regra_relacionamento: string | null
  aprovacao_abordagem: string
  created_at: string
  cliente?: { id: string; nome: string; atendida_woba: 'Sim' | 'Não' | 'Validar' } | null
  canal?: { id: string; nome: string } | null
  responsavel?: { id: string; nome: string | null } | null
}

export interface Interacao {
  id: string
  oportunidade_id: string | null
  contato_id: string | null
  tipo: string
  data: string
  resumo: string
  proximo_passo: string | null
  autor?: { nome: string | null } | null
}

export interface Tarefa {
  id: string
  titulo: string
  descricao: string | null
  oportunidade_id: string | null
  contato_id: string | null
  projeto_id: string | null
  projeto_etapa_id: string | null
  organizacao_id: string | null
  responsavel_id: string | null
  prazo: string | null
  data_inicio: string | null
  prioridade: 'baixa' | 'média' | 'alta'
  tipo: 'tarefa' | 'aprovacao'
  status: 'aberta' | 'em_andamento' | 'bloqueada' | 'concluida'
  bloqueada_por: string | null
  evidencia: string | null
  oportunidade?: { id: string; titulo: string } | null
  contato?: { id: string; nome: string } | null
  projeto?: { id: string; nome: string } | null
  organizacao?: { id: string; nome: string } | null
  responsavel?: { nome: string | null } | null
}

export interface Projeto {
  id: string
  nome: string
  cliente_id: string | null
  unidade_id?: string | null
  oportunidade_id: string | null
  tipo: string | null
  status: 'planejamento' | 'em_execucao' | 'pausado' | 'concluido' | 'cancelado'
  cidade: string | null
  endereco: string | null
  gerente_id: string | null
  engenheiro_id: string | null
  responsaveis_locais: string | null
  escopo: string | null
  premissas: string | null
  exclusoes: string | null
  criterios_conclusao: string | null
  data_inicio: string | null
  data_fim_prevista: string | null
  data_fim_real: string | null
  observacoes: string | null
  cliente?: { id: string; nome: string } | null
  gerente?: { id: string; nome: string | null } | null
  engenheiro?: { id: string; nome: string | null } | null
}

export interface ProjetoEtapa {
  id: string
  projeto_id: string
  ordem: number
  nome: string
  descricao: string | null
  criterio_entrada: string | null
  criterio_saida: string | null
  status: 'pendente' | 'em_andamento' | 'concluida'
  data_inicio_prevista: string | null
  data_fim_prevista: string | null
  data_fim_real: string | null
  aprovada: boolean
  aprovada_em: string | null
}

export interface ProjetoRegistro {
  id: string
  projeto_id: string
  tipo: 'risco' | 'pendencia' | 'decisao' | 'mudanca_escopo'
  descricao: string
  responsavel_id: string | null
  prazo: string | null
  status: 'aberto' | 'resolvido'
  aprovado_por: string | null
  motivo: string | null
  data: string
  responsavel?: { nome: string | null } | null
}

export interface Parceiro {
  id: string
  organizacao_id: string
  cidades: string[]
  especialidades: string[]
  tipos_projeto: string[]
  capacidade: string | null
  disponibilidade: 'Disponível' | 'Parcial' | 'Indisponível'
  disponivel_a_partir: string | null
  faixa_preco: string | null
  mobilizacao_dias: number | null
  documentacao: string | null
  documentos_validade: string | null
  referencias: string | null
  homologacao: 'Em análise' | 'Homologado' | 'Suspenso' | 'Reprovado'
  ultima_revisao: string | null
  observacoes: string | null
  organizacao?: { id: string; nome: string; cnpj: string | null } | null
}

export interface ProjetoParceiro {
  id: string
  projeto_id: string
  parceiro_id: string
  escopo: string | null
  status: 'cotado' | 'contratado' | 'concluido' | 'cancelado'
  valor_cotado: number | null
  valor_contratado: number | null
  prazo_cumprido: boolean | null
  retrabalho: boolean | null
  nota_qualidade: number | null
  nota_seguranca: number | null
  nota_comunicacao: number | null
  nota_documental: number | null
  nota_geral: number | null
  avaliacao_obs: string | null
  parceiro?: { id: string; organizacao: { id: string; nome: string } | null } | null
  projeto?: { id: string; nome: string } | null
}

export interface Documento {
  id: string
  nome: string
  tipo: string
  organizacao_id: string | null
  oportunidade_id: string | null
  projeto_id: string | null
  versao: number
  substitui_id: string | null
  status_aprovacao: string
  validade: string | null
  arquivo_path: string | null
  arquivo_nome: string | null
  url: string | null
  observacoes: string | null
  enviado_por: string | null
  created_at: string
  autor?: { nome: string | null } | null
}

export interface Unidade {
  id: string
  cliente_id: string
  nome: string
  endereco: string | null
  cidade: string | null
  estado: string | null
  tipo_operacao: string | null
  capacidade_pessoas: number | null
  area_m2: number | null
  proprietario: string | null
  locatario_contratual: string | null
  situacao: string
  requisitos_infra: string | null
  servicos_contratados: string | null
  responsaveis_locais: string | null
  observacoes: string | null
  cliente?: { id: string; nome: string } | null
}

export interface UnidadeFornecedor {
  id: string
  unidade_id: string
  fornecedor_id: string
  servico: string | null
  observacoes: string | null
  fornecedor?: { id: string; nome: string } | null
}

export interface Contrato {
  id: string
  titulo: string
  cliente_id: string
  contratante_id: string | null
  oportunidade_id: string | null
  responsavel_id: string | null
  tipo: string
  tipo_detalhe: string | null
  status: string
  data_assinatura: string | null
  data_inicio: string | null
  data_fim: string | null
  renovacao: string | null
  aviso_dias: number
  valor_mensal: number | null
  valor_total: number | null
  reajuste_indice: string | null
  reajuste_percentual: number | null
  reajuste_data_base: string | null
  condicoes_pagamento: string | null
  escopo_incluido: string | null
  itens_excluidos: string | null
  obrigacoes_clip: string | null
  obrigacoes_cliente: string | null
  obrigacoes_proprietario: string | null
  obrigacoes_terceiros: string | null
  sla: string | null
  criterios_aceite: string | null
  regras_alteracao_escopo: string | null
  regras_saida_antecipada: string | null
  observacoes: string | null
  cliente?: { id: string; nome: string } | null
  contratante?: { id: string; nome: string } | null
  responsavel?: { nome: string | null } | null
  cobertura?: { unidade_id: string }[]
}

export interface LogEntry {
  id: number
  tabela: string
  registro_id: string
  rotulo: string | null
  acao: 'criado' | 'alterado' | 'excluído'
  mudancas: Record<string, [unknown, unknown]> | null
  usuario_id: string | null
  em: string
  autor?: { nome: string | null } | null
}

export interface Pendencia {
  id: string
  oportunidade_id: string
  descricao: string
  dono: string
  prazo: string | null
  status: string
  resposta: string | null
}

export interface Proposta {
  id: string
  oportunidade_id: string
  versao: number
  data_emissao: string
  validade: string | null
  mensalidade: number | null
  comissao_pct: number | null
  valor_liquido: number | null
  status: string
  observacoes: string | null
}

export const STATUS_PROPOSTA_COTACAO = [
  { v: 'pesquisado', l: 'Pesquisado' },
  { v: 'solicitado', l: 'Orçamento solicitado' },
  { v: 'recebido', l: 'Proposta recebida' },
  { v: 'escolhido', l: 'Escolhido' },
  { v: 'descartado', l: 'Descartado' },
] as const

export interface Operacao {
  id: string
  nome: string
  cliente_id: string | null
  oportunidade_id: string | null
  contrato_id?: string | null
  cidade: string | null
  pessoas: number | null
  observacoes: string | null
  cliente?: { id: string; nome: string } | null
}

export interface CotacaoProposta {
  id: string
  item_id: string
  fornecedor_id: string
  escopo: string | null
  status: 'pesquisado' | 'solicitado' | 'recebido' | 'escolhido' | 'descartado'
  valor_mensal: number | null
  observacoes: string | null
  fornecedor?: { id: string; nome: string } | null
}

export interface CotacaoItem {
  id: string
  operacao_id: string
  ordem: number
  nome: string
  responsavel: string | null
  dispensado: boolean
  observacoes: string | null
  propostas: CotacaoProposta[]
}

/* ---------- operação e facilities (0008) ---------- */
export const CATEGORIAS_SERVICO = ['Limpeza', 'Ar-condicionado', 'Manutenção predial', 'Elétrica', 'Internet e telecom', 'Segurança', 'Recepção', 'Copa e alimentação', 'Jardinagem', 'Controle de pragas', 'Elevadores', 'Outro'] as const
export const FREQUENCIAS_SERVICO = ['Diária', 'Semanal', 'Quinzenal', 'Mensal', 'Bimestral', 'Trimestral', 'Semestral', 'Anual', 'Contínuo', 'Sob demanda'] as const
export const FREQUENCIAS_PLANO = ['Semanal', 'Quinzenal', 'Mensal', 'Bimestral', 'Trimestral', 'Semestral', 'Anual'] as const
export const CONTROLES_SERVICO = ['Clip executa', 'Clip gerencia fornecedor', 'Terceiro controla'] as const
export const STATUS_SERVICO = ['Ativo', 'Suspenso', 'Encerrado'] as const
export const TIPOS_CHAMADO = ['Incidente', 'Solicitação', 'Manutenção corretiva'] as const
export const CRITICIDADES = ['Baixa', 'Média', 'Alta', 'Crítica'] as const
export const STATUS_CHAMADO = ['Aberto', 'Em atendimento', 'Aguardando terceiro', 'Resolvido', 'Fechado', 'Cancelado'] as const
export const TIPOS_PLANO = ['Manutenção preventiva', 'Inspeção'] as const
export const TIPOS_ATENDIMENTO = ['Execução do serviço', 'Atendimento de chamado', 'Manutenção preventiva', 'Inspeção'] as const
export const TIPOS_GARANTIA = ['Garantia', 'Licença ou alvará', 'Contrato de terceiro', 'Seguro', 'Certificado', 'Outro'] as const
export const CONCEDIDA_POR = ['Fornecedor', 'Terceiro', 'Proprietário', 'Clip'] as const

type Ref = { id: string; nome: string | null }
type UnidadeRef = { id: string; nome: string; cliente?: { nome: string } | null }

export interface Servico {
  id: string
  unidade_id: string
  contrato_id: string | null
  nome: string
  categoria: string | null
  descricao: string | null
  frequencia: string
  fornecedor_id: string | null
  responsavel_id: string | null
  controle: 'Clip executa' | 'Clip gerencia fornecedor' | 'Terceiro controla'
  clip_garante_sla: boolean
  horario_atendimento: string | null
  regras_atendimento: string | null
  sla_resposta_horas: number | null
  sla_solucao_horas: number | null
  forma_verificacao: string | null
  custo_mensal: number | null
  status: 'Ativo' | 'Suspenso' | 'Encerrado'
  data_inicio: string | null
  data_fim: string | null
  observacoes: string | null
  unidade?: UnidadeRef | null
  fornecedor?: Ref | null
  responsavel?: { nome: string | null } | null
  contrato?: { id: string; titulo: string } | null
}

export interface Dependencia {
  id: string
  servico_id: string
  terceiro_id: string | null
  terceiro_nome: string | null
  descricao: string
  impacto: string | null
  contato: string | null
  terceiro?: Ref | null
}

export interface Chamado {
  id: string
  numero: number
  unidade_id: string
  servico_id: string | null
  tipo: (typeof TIPOS_CHAMADO)[number]
  titulo: string
  descricao: string | null
  criticidade: (typeof CRITICIDADES)[number]
  status: (typeof STATUS_CHAMADO)[number]
  solicitante: string | null
  responsavel_id: string | null
  fornecedor_id: string | null
  aguardando: string | null
  aberto_em: string
  prazo_resposta: string | null
  prazo_solucao: string | null
  respondido_em: string | null
  resolvido_em: string | null
  fechado_em: string | null
  solucao: string | null
  custo: number | null
  unidade?: UnidadeRef | null
  servico?: Pick<Servico, 'id' | 'nome' | 'clip_garante_sla' | 'controle' | 'sla_resposta_horas' | 'sla_solucao_horas' | 'horario_atendimento'> | null
  fornecedor?: Ref | null
  responsavel?: { nome: string | null } | null
}

export interface Plano {
  id: string
  unidade_id: string
  servico_id: string | null
  titulo: string
  tipo: (typeof TIPOS_PLANO)[number]
  ativo_equipamento: string | null
  checklist: string | null
  frequencia: (typeof FREQUENCIAS_PLANO)[number]
  proxima_data: string
  ultima_data: string | null
  responsavel_id: string | null
  fornecedor_id: string | null
  ativo: boolean
  observacoes: string | null
  unidade?: UnidadeRef | null
  servico?: { id: string; nome: string } | null
  fornecedor?: Ref | null
  responsavel?: { nome: string | null } | null
}

export interface Atendimento {
  id: string
  unidade_id: string
  servico_id: string | null
  chamado_id: string | null
  plano_id: string | null
  tipo: (typeof TIPOS_ATENDIMENTO)[number]
  data_hora: string
  executado_por: string | null
  fornecedor_id: string | null
  descricao: string
  conforme: boolean | null
  aceite: 'Pendente' | 'Aceito' | 'Recusado'
  aceite_por: string | null
  aceite_em: string | null
  aceite_obs: string | null
  unidade?: UnidadeRef | null
  servico?: { id: string; nome: string } | null
  chamado?: { id: string; numero: number; titulo: string } | null
  fornecedor?: Ref | null
  aceitante?: { nome: string | null } | null
}

export interface Garantia {
  id: string
  unidade_id: string
  servico_id: string | null
  tipo: (typeof TIPOS_GARANTIA)[number]
  descricao: string
  concedida_por: (typeof CONCEDIDA_POR)[number]
  fornecedor_id: string | null
  data_vencimento: string
  aviso_dias: number
  responsavel_id: string | null
  status: 'Vigente' | 'Renovado' | 'Encerrado'
  observacoes: string | null
  unidade?: UnidadeRef | null
  servico?: { id: string; nome: string } | null
  fornecedor?: Ref | null
}

/* ---------- financeiro por contrato (0009) ---------- */
export const TIPOS_LANCAMENTO = ['Faturamento', 'Recebimento', 'Custo', 'Investimento'] as const
export interface Lancamento {
  id: string
  contrato_id: string
  tipo: (typeof TIPOS_LANCAMENTO)[number]
  competencia: string
  valor: number
  pago: boolean
  data: string | null
  vencimento: string | null
  unidade_id: string | null
  servico_id: string | null
  fornecedor_id: string | null
  documento: string | null
  descricao: string | null
  contrato?: { id: string; titulo: string; cliente?: { nome: string } | null } | null
  fornecedor?: { id: string; nome: string | null } | null
  servico?: { id: string; nome: string } | null
}

export const OFICIOS = [
  'Pintor', 'Eletricista', 'Bombeiro hidráulico', 'Pedreiro', 'Marceneiro', 'Serralheiro', 'Gesseiro', 'Instalador de ar-condicionado', 'Vidraceiro', 'Chaveiro', 'Outro',
] as const

export interface Prestador {
  id: string
  nome: string
  oficio: string
  telefone: string | null
  email: string | null
  cidades: string[]
  disponibilidade: (typeof DISPONIBILIDADES)[number]
  disponivel_a_partir: string | null
  nota: number | null
  valor_referencia: string | null
  indicado_por: string | null
  observacoes: string | null
  created_at: string
}
