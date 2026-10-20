import { useState } from 'react'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { fdatetime, nullIfEmpty } from '../lib/format'
import { TIPOS_INTERACAO, type Interacao } from '../lib/types'
import { Empty, Field, Select, useAct } from './ui'

/** Histórico de interações de uma oportunidade ou de um contato, com registro rápido. */
export default function Interacoes({
  oportunidadeId,
  contatoId,
  onChanged,
}: {
  oportunidadeId?: string
  contatoId?: string
  onChanged?: () => void
}) {
  const act = useAct()
  const col = oportunidadeId ? 'oportunidade_id' : 'contato_id'
  const refId = (oportunidadeId ?? contatoId) as string
  const { data, reload } = useAsync(
    async () =>
      unwrap(
        await supabase
          .from('interacoes')
          .select('*, autor:profiles!created_by(nome)')
          .eq(col, refId)
          .order('data', { ascending: false }),
      ) as Interacao[],
    [refId],
  )
  const [tipo, setTipo] = useState<string>('reunião')
  const [resumo, setResumo] = useState('')
  const [passo, setPasso] = useState('')
  const [prazo, setPrazo] = useState('')
  const [busy, setBusy] = useState(false)

  async function add() {
    if (!resumo.trim()) return
    setBusy(true)
    const ok = await act(async () => {
      unwrap(
        await supabase
          .from('interacoes')
          .insert({ [col]: refId, tipo, resumo: resumo.trim(), proximo_passo: nullIfEmpty(passo) })
          .select(),
      )
      if (passo.trim()) {
        const table = oportunidadeId ? 'oportunidades' : 'contatos'
        unwrap(
          await supabase
            .from(table)
            .update({ proximo_passo: passo.trim(), proximo_passo_data: nullIfEmpty(prazo) })
            .eq('id', refId)
            .select(),
        )
      }
    }, 'Interação registrada')
    setBusy(false)
    if (ok) {
      setResumo('')
      setPasso('')
      setPrazo('')
      reload()
      onChanged?.()
    }
  }

  return (
    <div className="stack">
      <div className="grid">
        <Field label="Tipo">
          <Select value={tipo} onChange={(e) => setTipo(e.target.value)} options={TIPOS_INTERACAO} placeholder="Tipo" />
        </Field>
        <Field label="O que aconteceu *" span={2}>
          <input value={resumo} onChange={(e) => setResumo(e.target.value)} placeholder="Resumo da conversa" />
        </Field>
        <Field label="Próximo passo" span={2}>
          <input value={passo} onChange={(e) => setPasso(e.target.value)} placeholder="Opcional — atualiza o próximo passo" />
        </Field>
        <Field label="Prazo">
          <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        </Field>
      </div>
      <div>
        <button className="btn btn-primary" onClick={add} disabled={busy || !resumo.trim()}>
          Registrar interação
        </button>
      </div>
      {data && data.length === 0 ? (
        <Empty>Sem interações registradas.</Empty>
      ) : (
        <ul className="timeline">
          {data?.map((i) => (
            <li key={i.id}>
              <div className="tl-head">
                <span className="mono">{fdatetime(i.data)}</span>
                <span className="badge badge-neutral">{i.tipo}</span>
                {i.autor?.nome && <span className="muted">{i.autor.nome}</span>}
              </div>
              <div>{i.resumo}</div>
              {i.proximo_passo && <div className="muted">Próximo passo: {i.proximo_passo}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
