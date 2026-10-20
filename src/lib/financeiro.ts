import { resumo } from './cotacao'
import type { Lancamento } from './types'

export type ContratoFin = { id: string; titulo: string; status: string; valor_mensal: number | null; cliente_id: string; cliente?: { nome: string } | null; cobertura?: { unidade_id: string }[] }
export type ServicoFin = { id: string; nome: string; unidade_id: string; contrato_id: string | null; custo_mensal: number | null; status: string; unidade?: { nome: string } | null }
export type OperacaoFin = { id: string; nome: string; contrato_id: string | null; itens: { id: string; dispensado: boolean; propostas: { status: string; valor_mensal: number | null }[] }[] }

export type CustoPrevisto = {
  total: number
  servicos: { id: string; nome: string; unidade: string; valor: number }[]
  cotacoes: { id: string; nome: string; valor: number }[]
}

/**
 * Custo mensal previsto de um contrato:
 *  - serviços ativos com custo mensal: pelo contrato informado no serviço; sem contrato informado,
 *    só entra se a unidade for coberta por UM único contrato vigente (senão ficaria contado em dois)
 *  - fornecedores escolhidos nas cotações da operação ligada ao contrato
 */
export function custoPrevisto(c: ContratoFin, servicos: ServicoFin[], operacoes: OperacaoFin[], contratos: ContratoFin[]): CustoPrevisto {
  const vigentes = contratos.filter((x) => x.status === 'Vigente')
  const donoDaUnidade = (unidadeId: string) => {
    const donos = vigentes.filter((x) => x.cobertura?.some((u) => u.unidade_id === unidadeId))
    return donos.length === 1 ? donos[0].id : null
  }
  const ss = servicos
    .filter((s) => s.status === 'Ativo' && s.custo_mensal != null && (s.contrato_id ? s.contrato_id === c.id : donoDaUnidade(s.unidade_id) === c.id))
    .map((s) => ({ id: s.id, nome: s.nome, unidade: s.unidade?.nome ?? '', valor: Number(s.custo_mensal) }))
  const cc = operacoes.filter((o) => o.contrato_id === c.id).map((o) => ({ id: o.id, nome: o.nome, valor: resumo(o.itens).fechado })).filter((x) => x.valor > 0)
  return { total: ss.reduce((t, x) => t + x.valor, 0) + cc.reduce((t, x) => t + x.valor, 0), servicos: ss, cotacoes: cc }
}

/** Serviços ativos com custo que não puderam ser atribuídos a nenhum contrato. */
export function custoSemContrato(servicos: ServicoFin[], contratos: ContratoFin[]): ServicoFin[] {
  const vigentes = contratos.filter((x) => x.status === 'Vigente')
  return servicos.filter((s) => s.status === 'Ativo' && s.custo_mensal != null && !s.contrato_id && vigentes.filter((x) => x.cobertura?.some((u) => u.unidade_id === s.unidade_id)).length !== 1)
}

export type Margem = { rs: number; pct: number } | null
/** Margem estimada = (receita mensal contratada − custo mensal previsto) ÷ receita. Sem custo previsto não há margem. */
export function margem(receita: number | null, custo: number): Margem {
  if (receita == null || receita <= 0 || custo <= 0) return null
  return { rs: receita - custo, pct: ((receita - custo) / receita) * 100 }
}

export type Totais = { faturado: number; recebido: number; aReceber: number; custoRealizado: number; aPagar: number; investimento: number }
export function totais(ls: Pick<Lancamento, 'tipo' | 'pago' | 'valor'>[]): Totais {
  const soma = (f: (l: Pick<Lancamento, 'tipo' | 'pago' | 'valor'>) => boolean) => ls.filter(f).reduce((t, l) => t + Number(l.valor), 0)
  const faturado = soma((l) => l.tipo === 'Faturamento')
  const recebido = soma((l) => l.tipo === 'Recebimento')
  return {
    faturado, recebido, aReceber: faturado - recebido,
    custoRealizado: soma((l) => l.tipo === 'Custo' && l.pago),
    aPagar: soma((l) => (l.tipo === 'Custo' || l.tipo === 'Investimento') && !l.pago),
    investimento: soma((l) => l.tipo === 'Investimento'),
  }
}

export const mesAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
export const mesRotulo = (iso: string) => new Date(`${iso.slice(0, 7)}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '')
export const pct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
