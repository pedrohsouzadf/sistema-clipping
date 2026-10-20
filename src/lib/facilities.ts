import { daysUntil } from './format'
import type { Chamado, Garantia, Plano } from './types'

export const ABERTOS = ['Aberto', 'Em atendimento', 'Aguardando terceiro'] as const
export const chamadoAberto = (c: Pick<Chamado, 'status'>) => (ABERTOS as readonly string[]).includes(c.status)

export type Alerta = { tom: 'neutral' | 'info' | 'ok' | 'warn' | 'bad'; texto: string }

const horas = (ts: string) => (new Date(ts).getTime() - Date.now()) / 3600000
const fmtH = (h: number) => {
  const a = Math.abs(h)
  return a < 1 ? `${Math.max(1, Math.round(a * 60))} min` : a < 48 ? `${Math.round(a)} h` : `${Math.round(a / 24)} dias`
}

/**
 * Situação do prazo de um chamado.
 *  - aguardando terceiro: prazo suspenso (a Clip não controla o tempo do terceiro)
 *  - serviço sem SLA garantido pela Clip: o prazo é só referência e nunca vira "estourado"
 */
export function slaChamado(c: Chamado): (Alerta & { estourado: boolean }) | null {
  if (!c.prazo_resposta && !c.prazo_solucao) return null
  const referencia = !!c.servico && !c.servico.clip_garante_sla
  if (!chamadoAberto(c)) {
    if (c.status === 'Cancelado' || !c.prazo_solucao || !c.resolvido_em) return null
    const dentro = new Date(c.resolvido_em) <= new Date(c.prazo_solucao)
    return { tom: dentro ? 'ok' : 'neutral', texto: dentro ? 'solucionado no prazo' : 'solucionado fora do prazo', estourado: false }
  }
  if (c.status === 'Aguardando terceiro') return { tom: 'info', texto: 'prazo suspenso: aguardando terceiro', estourado: false }
  const venceu = (ts: string | null) => !!ts && horas(ts) < 0
  const pref = referencia ? 'prazo de referência' : 'SLA'
  if (!c.respondido_em && venceu(c.prazo_resposta)) return { tom: referencia ? 'warn' : 'bad', texto: `${pref} de resposta vencido há ${fmtH(horas(c.prazo_resposta as string))}`, estourado: !referencia }
  if (venceu(c.prazo_solucao)) return { tom: referencia ? 'warn' : 'bad', texto: `${pref} de solução vencido há ${fmtH(horas(c.prazo_solucao as string))}`, estourado: !referencia }
  if (c.prazo_solucao) {
    const h = horas(c.prazo_solucao)
    return { tom: h <= 2 ? 'warn' : 'neutral', texto: `${referencia ? 'referência: ' : ''}solução em ${fmtH(h)}`, estourado: false }
  }
  return null
}

export function alertaPlano(p: Pick<Plano, 'ativo' | 'proxima_data'>): Alerta | null {
  if (!p.ativo) return null
  const d = daysUntil(p.proxima_data)
  if (d < 0) return { tom: 'bad', texto: `atrasada há ${-d} dia(s)` }
  if (d === 0) return { tom: 'warn', texto: 'é hoje' }
  if (d <= 7) return { tom: 'warn', texto: `em ${d} dia(s)` }
  return null
}

export function alertaGarantia(g: Pick<Garantia, 'status' | 'data_vencimento' | 'aviso_dias'>): Alerta | null {
  if (g.status !== 'Vigente') return null
  const d = daysUntil(g.data_vencimento)
  if (d < 0) return { tom: 'bad', texto: `vencida há ${-d} dia(s)` }
  if (d <= g.aviso_dias) return { tom: 'warn', texto: d === 0 ? 'vence hoje' : `vence em ${d} dia(s)` }
  return null
}

export const tomCriticidade = (c: string) => (c === 'Crítica' ? 'bad' : c === 'Alta' ? 'warn' : c === 'Média' ? 'info' : 'neutral') as 'bad' | 'warn' | 'info' | 'neutral'
export const tomStatusChamado = (s: string) => (s === 'Aberto' ? 'warn' : s === 'Em atendimento' ? 'info' : s === 'Aguardando terceiro' ? 'bronze' : s === 'Resolvido' || s === 'Fechado' ? 'ok' : 'neutral') as 'warn' | 'info' | 'bronze' | 'ok' | 'neutral'
