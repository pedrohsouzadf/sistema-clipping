import { useState } from 'react'
import { supabase, unwrap } from '../lib/supabase'
import { useCadastros } from '../lib/cadastros'
import { nullIfEmpty } from '../lib/format'
import { TIPOS_ATENDIMENTO } from '../lib/types'
import { Field, Modal, Select, useAct } from './ui'

const agora = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Registro de atendimento: o que foi feito, por quem, se cumpriu o combinado e se o cliente aceitou. */
export default function AtendimentoForm({ unidadeId, servicoId, chamadoId, tipoInicial, onClose, onSaved }: { unidadeId: string; servicoId?: string | null; chamadoId?: string | null; tipoInicial?: string; onClose: () => void; onSaved: () => void }) {
  const act = useAct()
  const cad = useCadastros()
  const [d, setD] = useState({ tipo: tipoInicial ?? (chamadoId ? 'Atendimento de chamado' : 'Execução do serviço'), data_hora: agora(), executado_por: '', fornecedor_id: '', descricao: '', conforme: '', aceite: 'Pendente', aceite_obs: '' })
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }))
  const falta = !d.descricao.trim() || !d.data_hora || (d.aceite === 'Recusado' && !d.aceite_obs.trim())

  async function salvar() {
    setBusy(true)
    const ok = await act(async () => unwrap(await supabase.from('atendimentos').insert({
      unidade_id: unidadeId, servico_id: servicoId ?? null, chamado_id: chamadoId ?? null, tipo: d.tipo, data_hora: new Date(d.data_hora).toISOString(),
      executado_por: nullIfEmpty(d.executado_por), fornecedor_id: nullIfEmpty(d.fornecedor_id), descricao: d.descricao.trim(),
      conforme: d.conforme === '' ? null : d.conforme === 'sim', aceite: d.aceite, aceite_obs: nullIfEmpty(d.aceite_obs),
    }).select()), 'Atendimento registrado')
    setBusy(false)
    if (ok) onSaved()
  }

  return (
    <Modal title="Registrar atendimento" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={salvar} disabled={busy || falta}>Salvar</button></>}>
      <div className="grid">
        <Field label="Tipo"><Select value={d.tipo} onChange={(e) => set('tipo', e.target.value)} options={TIPOS_ATENDIMENTO} placeholder="—" /></Field>
        <Field label="Quando" span={2}><input type="datetime-local" value={d.data_hora} onChange={(e) => set('data_hora', e.target.value)} /></Field>
        <Field label="O que foi feito *" span={3}><textarea rows={3} value={d.descricao} onChange={(e) => set('descricao', e.target.value)} autoFocus /></Field>
        <Field label="Quem executou" span={2}><input value={d.executado_por} onChange={(e) => set('executado_por', e.target.value)} placeholder="Nome do técnico ou da equipe" /></Field>
        <Field label="Cumpriu o combinado?"><Select value={d.conforme} onChange={(e) => set('conforme', e.target.value)} options={[{ v: 'sim', l: 'Sim' }, { v: 'nao', l: 'Não' }]} placeholder="Não se aplica" /></Field>
        <Field label="Fornecedor" span={2}><Select value={d.fornecedor_id} onChange={(e) => set('fornecedor_id', e.target.value)} options={cad.fornecedores} /></Field>
        <Field label="Aceite do cliente"><Select value={d.aceite} onChange={(e) => set('aceite', e.target.value)} options={['Pendente', 'Aceito', 'Recusado']} placeholder="—" /></Field>
        {d.aceite !== 'Pendente' && <Field label={d.aceite === 'Recusado' ? 'Motivo da recusa *' : 'Observação do aceite'} span={3}><input value={d.aceite_obs} onChange={(e) => set('aceite_obs', e.target.value)} /></Field>}
      </div>
    </Modal>
  )
}
