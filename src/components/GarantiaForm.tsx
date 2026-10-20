import { useState } from 'react'
import { supabase, unwrap } from '../lib/supabase'
import { useCadastros } from '../lib/cadastros'
import { nullIfEmpty } from '../lib/format'
import { CONCEDIDA_POR, TIPOS_GARANTIA, type Garantia } from '../lib/types'
import { Field, Modal, Select, useAct } from './ui'

export default function GarantiaForm({ garantia, defaultUnidadeId, defaultServicoId, onClose, onSaved }: { garantia?: Garantia | null; defaultUnidadeId?: string; defaultServicoId?: string; onClose: () => void; onSaved: () => void }) {
  const act = useAct()
  const cad = useCadastros()
  const s = (v: unknown) => (v == null ? '' : String(v))
  const [d, setD] = useState({
    unidade_id: s(garantia?.unidade_id ?? defaultUnidadeId), servico_id: s(garantia?.servico_id ?? defaultServicoId), tipo: garantia?.tipo ?? 'Garantia', descricao: s(garantia?.descricao),
    concedida_por: garantia?.concedida_por ?? 'Fornecedor', fornecedor_id: s(garantia?.fornecedor_id), data_vencimento: s(garantia?.data_vencimento), aviso_dias: s(garantia?.aviso_dias ?? 60),
    status: garantia?.status ?? 'Vigente', observacoes: s(garantia?.observacoes),
  })
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }))

  async function salvar() {
    setBusy(true)
    const payload = {
      unidade_id: d.unidade_id, servico_id: nullIfEmpty(d.servico_id), tipo: d.tipo, descricao: d.descricao.trim(), concedida_por: d.concedida_por, fornecedor_id: nullIfEmpty(d.fornecedor_id),
      data_vencimento: d.data_vencimento, aviso_dias: Number(d.aviso_dias || 60), status: d.status, observacoes: nullIfEmpty(d.observacoes),
    }
    const ok = await act(async () => {
      const q = garantia ? supabase.from('garantias_vencimentos').update(payload).eq('id', garantia.id) : supabase.from('garantias_vencimentos').insert(payload)
      unwrap(await q.select())
    }, garantia ? 'Registro atualizado' : 'Registro criado')
    setBusy(false)
    if (ok) onSaved()
  }

  return (
    <Modal title={garantia ? 'Editar garantia ou vencimento' : 'Nova garantia ou vencimento'} onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={salvar} disabled={busy || !d.unidade_id || !d.descricao.trim() || !d.data_vencimento}>Salvar</button></>}>
      <div className="grid">
        <Field label="Unidade *" span={2}><Select value={d.unidade_id} onChange={(e) => setD((x) => ({ ...x, unidade_id: e.target.value, servico_id: '' }))} options={cad.unidades} placeholder="Selecione…" /></Field>
        <Field label="Tipo"><Select value={d.tipo} onChange={(e) => set('tipo', e.target.value as Garantia['tipo'])} options={TIPOS_GARANTIA} placeholder="—" /></Field>
        <Field label="Descrição *" span={3}><input value={d.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder="Ex.: garantia do compressor do ar-condicionado" autoFocus /></Field>
        <Field label="Vence em *"><input type="date" value={d.data_vencimento} onChange={(e) => set('data_vencimento', e.target.value)} /></Field>
        <Field label="Avisar com (dias)"><input type="number" min={0} value={d.aviso_dias} onChange={(e) => set('aviso_dias', e.target.value)} /></Field>
        <Field label="Situação"><Select value={d.status} onChange={(e) => set('status', e.target.value as Garantia['status'])} options={['Vigente', 'Renovado', 'Encerrado']} placeholder="—" /></Field>
        <Field label="Quem concede ou responde" hint="A Clip só responde pelo que ela própria concede"><Select value={d.concedida_por} onChange={(e) => set('concedida_por', e.target.value as Garantia['concedida_por'])} options={CONCEDIDA_POR} placeholder="—" /></Field>
        <Field label="Empresa"><Select value={d.fornecedor_id} onChange={(e) => set('fornecedor_id', e.target.value)} options={cad.terceiros} /></Field>
        <Field label="Serviço relacionado"><Select value={d.servico_id} onChange={(e) => set('servico_id', e.target.value)} options={cad.servicos.filter((x) => x.unidade_id === d.unidade_id).map((x) => ({ v: x.id, l: x.nome }))} /></Field>
        <Field label="Observações" span={3}><input value={d.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
