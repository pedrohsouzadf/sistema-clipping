import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { fdatetime } from '../lib/format'
import type { LogEntry } from '../lib/types'
import { Empty } from './ui'

const CAMPOS: Record<string, string> = {
  etapa_id: 'Etapa', status: 'Status', titulo: 'Título', nome: 'Nome', proximo_passo: 'Próximo passo', proximo_passo_data: 'Prazo do próximo passo',
  responsavel_id: 'Responsável', gerente_id: 'Gerente', engenheiro_id: 'Engenheiro', prazo: 'Prazo', data_fim_prevista: 'Fim previsto',
  data_inicio: 'Início', data_fim_real: 'Fim real', valor_estimado: 'Valor estimado', probabilidade: 'Probabilidade', motivo_perda: 'Motivo da perda',
  aprovada: 'Aprovada', escopo: 'Escopo', premissas: 'Premissas', exclusoes: 'Exclusões', tipo_servico: 'Tipo de serviço', mensalidade_estimada: 'Mensalidade estimada',
  prazo_fechamento: 'Fechamento esperado', aprovacao_abordagem: 'Aprovação da abordagem', homologacao: 'Homologação', disponibilidade: 'Disponibilidade',
  status_aprovacao: 'Aprovação', versao: 'Versão', valor_cotado: 'Valor cotado', valor_contratado: 'Valor contratado', cidade: 'Cidade',
  atendida_woba: 'Atendida pela Woba', status_relacionamento: 'Status do relacionamento', tipo: 'Tipo', valor_mensal: 'Valor mensal', valor_total: 'Valor total',
  data_fim: 'Término', data_assinatura: 'Assinatura', situacao: 'Situação', tipo_operacao: 'Tipo de operação', capacidade_pessoas: 'Capacidade', area_m2: 'Área (m²)',
  reajuste_percentual: 'Reajuste (%)', reajuste_indice: 'Índice de reajuste', renovacao: 'Renovação', aviso_dias: 'Aviso (dias)', decisor: 'Decisor', papeis: 'Tipo', cnpj: 'CNPJ', prioridade: 'Prioridade', bloqueada_por: 'Bloqueio',
  criticidade: 'Prioridade', frequencia: 'Frequência', controle: 'Quem controla', clip_garante_sla: 'Clip garante o SLA', custo_mensal: 'Custo mensal', custo: 'Custo',
  aceite: 'Aceite', aguardando: 'Aguardando', solucao: 'Solução', proxima_data: 'Próxima data', ultima_data: 'Última execução', data_vencimento: 'Vencimento', ativo: 'Ativo',
  valor: 'Valor', pago: 'Pago', competencia: 'Competência', vencimento: 'Vencimento', documento: 'Documento', fornecedor_id: 'Fornecedor', sla_resposta_horas: 'SLA de resposta (h)', sla_solucao_horas: 'SLA de solução (h)', conforme: 'Cumpriu o combinado', concedida_por: 'Quem concede',
}
const OCULTOS = new Set(['aprovada_em', 'aprovada_por', 'avaliado_por', 'projeto_etapa_id'])
const TABELAS: Record<string, string> = {
  oportunidades: 'Oportunidade', organizacoes: 'Empresa', projetos: 'Projeto', projeto_etapas: 'Etapa', projeto_registros: 'Registro',
  projeto_parceiros: 'Parceiro do projeto', parceiros: 'Parceiro', documentos: 'Documento', tarefas: 'Tarefa',
  contratos: 'Contrato', unidades: 'Unidade', contrato_unidades: 'Unidade do contrato', unidade_fornecedores: 'Fornecedor da unidade',
  servicos_unidade: 'Serviço', servico_dependencias: 'Dependência de terceiro', chamados: 'Chamado', planos_manutencao: 'Plano de manutenção', atendimentos: 'Atendimento', garantias_vencimentos: 'Garantia', lancamentos_financeiros: 'Lançamento financeiro',
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i

function valor(v: unknown): string {
  if (v == null || v === '') return 'vazio'
  if (typeof v === 'boolean') return v ? 'sim' : 'não'
  if (Array.isArray(v)) return v.join(', ') || 'vazio'
  const s = String(v)
  return s.length > 70 ? `${s.slice(0, 70)}…` : s
}

function descrever(l: LogEntry): string {
  if (l.acao !== 'alterado' || !l.mudancas) return ''
  return Object.entries(l.mudancas)
    .filter(([k]) => !OCULTOS.has(k))
    .map(([k, [a, b]]) => {
      const nome = CAMPOS[k] ?? k.replace(/_/g, ' ')
      if (UUID.test(String(b ?? '')) || UUID.test(String(a ?? ''))) return `${nome} alterado`
      return `${nome}: ${valor(a)} → ${valor(b)}`
    })
    .join(' · ')
}

/** Quem mudou o quê e quando, para uma oportunidade, projeto ou empresa (sem filtro: todo o sistema). */
export default function Historico({ coluna, id }: { coluna?: 'oportunidade_id' | 'projeto_id' | 'organizacao_id' | 'contrato_id' | 'unidade_id' | 'registro_id'; id?: string }) {
  const { data, loading } = useAsync(async () => {
    const base = supabase.from('activity_log').select('*')
    const [l, p] = await Promise.all([
      (coluna && id ? base.eq(coluna, id) : base).order('em', { ascending: false }).limit(coluna ? 150 : 300),
      supabase.from('profiles').select('id,nome,email'),
    ])
    const nomes = new Map((unwrap(p) as { id: string; nome: string | null; email: string | null }[]).map((x) => [x.id, x.nome ?? x.email ?? '—']))
    return (unwrap(l) as LogEntry[]).map((x) => ({ ...x, autor: { nome: x.usuario_id ? nomes.get(x.usuario_id) ?? null : null } }))
  }, [coluna, id])

  if (loading && !data) return <p className="muted">Carregando…</p>
  if (!data || data.length === 0) return <Empty>Nenhuma alteração registrada ainda.</Empty>
  return (
    <ul className="timeline">
      {data.map((l) => (
        <li key={l.id}>
          <div className="tl-head">
            <span className="mono">{fdatetime(l.em)}</span>
            <span className="badge badge-neutral">{TABELAS[l.tabela] ?? l.tabela} {l.acao}</span>
            {l.autor?.nome && <span className="muted">{l.autor.nome}</span>}
          </div>
          <div>{l.rotulo}</div>
          {descrever(l) && <div className="muted">{descrever(l)}</div>}
        </li>
      ))}
    </ul>
  )
}
