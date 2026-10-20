import { isOverdue } from './format'
import type { Projeto, ProjetoEtapa } from './types'

export const projetoAtivo = (p: Pick<Projeto, 'status'>) => p.status === 'planejamento' || p.status === 'em_execucao'

/** Etapa em foco: a primeira que ainda não foi concluída e aprovada. */
export const etapaAtual = (etapas: ProjetoEtapa[]) =>
  [...etapas].sort((a, b) => a.ordem - b.ordem).find((e) => !(e.status === 'concluida' && e.aprovada))

/** Projeto atrasado = ativo e (prazo final vencido OU alguma etapa não concluída com prazo vencido). */
export function motivoAtraso(p: Projeto, etapas: ProjetoEtapa[]): string | null {
  if (!projetoAtivo(p)) return null
  if (isOverdue(p.data_fim_prevista)) return 'prazo final vencido'
  const e = etapas.find((x) => x.status !== 'concluida' && isOverdue(x.data_fim_prevista))
  return e ? `etapa “${e.nome}” vencida` : null
}
