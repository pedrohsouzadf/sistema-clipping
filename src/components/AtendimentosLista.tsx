import { useState } from 'react'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { fdatetime } from '../lib/format'
import type { Atendimento } from '../lib/types'
import { Badge, Empty, Field, Modal, useAct } from './ui'

const tom = (a: string) => (a === 'Aceito' ? 'ok' : a === 'Recusado' ? 'bad' : 'warn')

/** Atendimentos registrados, com aceite do cliente. Filtra por chamado, serviço ou unidade. */
export default function AtendimentosLista({ filtro, refresh, onChanged }: { filtro: { chamado_id?: string; servico_id?: string; unidade_id?: string }; refresh?: number; onChanged?: () => void }) {
  const act = useAct()
  const [recusa, setRecusa] = useState<Atendimento | null>(null)
  const [motivo, setMotivo] = useState('')
  const chave = JSON.stringify(filtro)
  const { data, loading, reload } = useAsync(async () => {
    let q = supabase.from('atendimentos').select('*, servico:servicos_unidade!servico_id(id,nome), chamado:chamados!chamado_id(id,numero,titulo), fornecedor:organizacoes!fornecedor_id(id,nome), aceitante:profiles!aceite_por(nome)')
    for (const [k, v] of Object.entries(filtro)) if (v) q = q.eq(k, v)
    return unwrap(await q.order('data_hora', { ascending: false }).limit(60)) as unknown as Atendimento[]
  }, [chave, refresh])

  async function aceitar(a: Atendimento) {
    const ok = await act(async () => unwrap(await supabase.from('atendimentos').update({ aceite: 'Aceito' }).eq('id', a.id).select()), 'Atendimento aceito')
    if (ok) { reload(); onChanged?.() }
  }
  async function recusar() {
    if (!recusa) return
    const ok = await act(async () => unwrap(await supabase.from('atendimentos').update({ aceite: 'Recusado', aceite_obs: motivo.trim() }).eq('id', recusa.id).select()), 'Atendimento recusado')
    if (ok) { setRecusa(null); setMotivo(''); reload(); onChanged?.() }
  }

  if (loading && !data) return <p className="muted">Carregando…</p>
  if (!data || data.length === 0) return <Empty>Nenhum atendimento registrado.</Empty>
  return (
    <>
      <ul className="timeline">
        {data.map((a) => (
          <li key={a.id}>
            <div className="tl-head">
              <span className="mono">{fdatetime(a.data_hora)}</span>
              <Badge tone="neutral">{a.tipo}</Badge>
              <Badge tone={tom(a.aceite)}>{a.aceite === 'Pendente' ? 'aceite pendente' : a.aceite === 'Aceito' ? 'aceito' : 'recusado'}</Badge>
              {a.conforme === false && <Badge tone="bad">não cumpriu o combinado</Badge>}
              {a.conforme === true && <Badge tone="ok">cumpriu o combinado</Badge>}
            </div>
            <div>{a.descricao}</div>
            <div className="muted">
              {[a.executado_por, a.fornecedor?.nome, a.servico?.nome, a.chamado ? `chamado #${a.chamado.numero}` : null].filter(Boolean).join(' · ')}
              {a.aceite !== 'Pendente' && a.aceitante?.nome ? ` · ${a.aceite === 'Aceito' ? 'aceito' : 'recusado'} por ${a.aceitante.nome}` : ''}
              {a.aceite_obs ? ` · ${a.aceite_obs}` : ''}
            </div>
            {a.aceite === 'Pendente' && (
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button className="btn btn-sm" onClick={() => aceitar(a)}>Aceitar</button>
                <button className="btn btn-sm" onClick={() => { setRecusa(a); setMotivo('') }}>Recusar</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {recusa && (
        <Modal title="Recusar atendimento" onClose={() => setRecusa(null)} footer={<><button className="btn" onClick={() => setRecusa(null)}>Cancelar</button><button className="btn btn-primary" disabled={!motivo.trim()} onClick={recusar}>Recusar</button></>}>
          <Field label="Motivo da recusa *"><textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus /></Field>
        </Modal>
      )}
    </>
  )
}
