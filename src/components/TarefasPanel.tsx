import { useState } from 'react'
import { supabase, unwrap } from '../lib/supabase'
import { fdate, isOverdue } from '../lib/format'
import { STATUS_TAREFA, type Tarefa } from '../lib/types'
import { Badge, Confirm, Empty, useAct } from './ui'
import TarefaForm, { type Vinculo } from './TarefaForm'

export const statusLabel = (s: string) => STATUS_TAREFA.find((x) => x.v === s)?.l ?? s

/** Lista de tarefas de um objeto (oportunidade, projeto, empresa), com criação, edição e exclusão. */
export default function TarefasPanel({
  vinculo,
  tarefas,
  onChanged,
}: {
  vinculo: Vinculo
  tarefas: Tarefa[]
  onChanged: () => void
}) {
  const act = useAct()
  const [form, setForm] = useState<Tarefa | 'nova' | null>(null)
  const [excluir, setExcluir] = useState<Tarefa | null>(null)

  async function alternar(t: Tarefa) {
    const ok = await act(async () =>
      unwrap(await supabase.from('tarefas').update({ status: t.status === 'concluida' ? 'aberta' : 'concluida' }).eq('id', t.id).select()),
    )
    if (ok) onChanged()
  }

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <button className="btn" onClick={() => setForm('nova')}>+ Nova tarefa</button>
      </div>
      {tarefas.length === 0 ? <Empty>Sem tarefas.</Empty> : (
        <div className="table-wrap">
          <table>
            <tbody>
              {tarefas.map((t) => {
                const feita = t.status === 'concluida'
                return (
                  <tr key={t.id}>
                    <td style={{ width: 34 }}>
                      <input type="checkbox" checked={feita} onChange={() => alternar(t)} aria-label="Concluir" />
                    </td>
                    <td>
                      <button className="link-btn" style={feita ? { textDecoration: 'line-through', color: 'var(--muted)' } : undefined} onClick={() => setForm(t)}>
                        {t.titulo}
                      </button>{' '}
                      {t.tipo === 'aprovacao' && <Badge tone="info">Aprovação</Badge>}{' '}
                      {t.prioridade === 'alta' && !feita && <Badge tone="warn">Alta</Badge>}{' '}
                      {t.status === 'bloqueada' && <Badge tone="bad">Bloqueada</Badge>}
                      {t.status === 'em_andamento' && <Badge tone="info">Em andamento</Badge>}
                    </td>
                    <td className={!feita && isOverdue(t.prazo) ? 'overdue mono' : 'mono'} style={{ width: 96 }}>{fdate(t.prazo)}</td>
                    <td className="muted" style={{ width: 130 }}>{t.responsavel?.nome ?? 'sem responsável'}</td>
                    <td style={{ width: 34 }}>
                      <button className="icon-btn row-del" title="Excluir tarefa" aria-label={`Excluir ${t.titulo}`} onClick={() => setExcluir(t)}>×</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {form && (
        <TarefaForm
          tarefa={form === 'nova' ? null : form}
          vinculo={vinculo}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); onChanged() }}
        />
      )}
      {excluir && (
        <Confirm
          title="Excluir tarefa"
          message={`Excluir “${excluir.titulo}”?`}
          confirmLabel="Excluir"
          onCancel={() => setExcluir(null)}
          onConfirm={async () => {
            const t = excluir
            setExcluir(null)
            const ok = await act(async () => unwrap(await supabase.from('tarefas').delete().eq('id', t.id).select()), 'Tarefa excluída')
            if (ok) onChanged()
          }}
        />
      )}
    </div>
  )
}
