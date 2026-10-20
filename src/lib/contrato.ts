import { daysUntil } from './format'
import type { Contrato } from './types'

export const vigente = (c: Pick<Contrato, 'status'>) => c.status === 'Vigente'

export type AlertaContrato = { tom: 'warn' | 'bad'; texto: string }

/** Alerta de vencimento de um contrato vigente: dentro da antecedência de aviso ou já vencido. */
export function alertaVencimento(c: Pick<Contrato, 'status' | 'data_fim' | 'aviso_dias'>): AlertaContrato | null {
  if (!vigente(c) || !c.data_fim) return null
  const d = daysUntil(c.data_fim)
  if (d < 0) return { tom: 'bad', texto: `vencido há ${-d} dia(s)` }
  if (d <= c.aviso_dias) return { tom: 'warn', texto: d === 0 ? 'vence hoje' : `vence em ${d} dia(s)` }
  return null
}

/** Reajuste previsto nos próximos 30 dias (ou já passado da data-base). */
export function alertaReajuste(c: Pick<Contrato, 'status' | 'reajuste_data_base'>): AlertaContrato | null {
  if (!vigente(c) || !c.reajuste_data_base) return null
  const d = daysUntil(c.reajuste_data_base)
  if (d < 0) return { tom: 'bad', texto: `reajuste previsto há ${-d} dia(s)` }
  if (d <= 30) return { tom: 'warn', texto: `reajuste em ${d} dia(s)` }
  return null
}
