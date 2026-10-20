import { useState } from 'react'
import { supabase, unwrap } from '../lib/supabase'
import { useCadastros } from '../lib/cadastros'
import { nullIfEmpty, todayISO } from '../lib/format'
import { FREQUENCIAS_PLANO, TIPOS_PLANO, type Plano } from '../lib/types'
import { Field, Modal, Select, useAct } from './ui'

export default function PlanoForm({ plano, defaultUnidadeId, defaultServicoId, onClose, onSaved }: { plano?: Plano | null; defaultUnidadeId?: string; defaultServicoId?: string; onClose: () => void; onSaved: () => void }) {
  const act = useAct()
  const cad = useCadastros()
  const s = (v: unknown) => (v == null ? '' : String(v))
  const [d, setD] = useState({
    unidade_id: s(plano?.unidade_id ?? defaultUnidadeId), servico_id: s(plano?.servico_id ?? defaultServicoId), titulo: s(plano?.titulo), tipo: plano?.tipo ?? 'Manutenção preventiva',
    ativo_equipamento: s(plano?.ativo_equipamento), checklist: s(plano?.checklist), frequencia: plano?.frequencia ?? 'Mensal', proxima_data: s(plano?.proxima_data) || todayISO(),
    responsavel_id: s(plano?.responsavel_id), fornecedor_id: s(plano?.fornecedor_id), ativo: plano?.ativo ?? true, observacoes: s(plano?.observacoes),
  })
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }))

  async function salvar() {
    setBusy(true)
    const payload = {
      unidade_id: d.unidade_id, servico_id: nullIfEmpty(d.servico_id), titulo: d.titulo.trim(), tipo: d.tipo, ativo_equipamento: nullIfEmpty(d.ativo_equipamento), checklist: nullIfEmpty(d.checklist),
      frequencia: d.frequencia, proxima_data: d.proxima_data, responsavel_id: nullIfEmpty(d.responsavel_id), fornecedor_id: nullIfEmpty(d.fornecedor_id), ativo: d.ativo, observacoes: nullIfEmpty(d.observacoes),
    }
    const ok = await act(async () => {
      const q = plano ? supabase.from('planos_manutencao').update(payload).eq('id', plano.id) : supabase.from('planos_manutencao').insert(payload)
      unwrap(await q.select())
    }, plano ? 'Plano atualizado' : 'Plano criado')
    setBusy(false)
    if (ok) onSaved()
  }

  return (
    <Modal title={plano ? 'Editar plano' : 'Novo plano de manutenção ou inspeção'} onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={salvar} disabled={busy || !d.unidade_id || !d.titulo.trim() || !d.proxima_data}>Salvar</button></>}>
      <div className="grid">
        <Field label="Unidade *" span={2}><Select value={d.unidade_id} onChange={(e) => setD((x) => ({ ...x, unidade_id: e.target.value, servico_id: '' }))} options={cad.unidades} placeholder="Selecione…" /></Field>
        <Field label="Tipo"><Select value={d.tipo} onChange={(e) => set('tipo', e.target.value as Plano['tipo'])} options={TIPOS_PLANO} placeholder="—" /></Field>
        <Field label="O que fazer *" span={2}><input value={d.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder="Ex.: Limpeza de filtros do ar-condicionado" autoFocus /></Field>
        <Field label="Equipamento ou área"><input value={d.ativo_equipamento} onChange={(e) => set('ativo_equipamento', e.target.value)} placeholder="Ex.: split sala de reunião" /></Field>
        <Field label="Frequência"><Select value={d.frequencia} onChange={(e) => set('frequencia', e.target.value as Plano['frequencia'])} options={FREQUENCIAS_PLANO} placeholder="—" /></Field>
        <Field label="Próxima data *"><input type="date" value={d.proxima_data} onChange={(e) => set('proxima_data', e.target.value)} /></Field>
        <Field label="Serviço relacionado"><Select value={d.servico_id} onChange={(e) => set('servico_id', e.target.value)} options={cad.servicos.filter((x) => x.unidade_id === d.unidade_id).map((x) => ({ v: x.id, l: x.nome }))} /></Field>
        <Field label="Responsável na Clip"><Select value={d.responsavel_id} onChange={(e) => set('responsavel_id', e.target.value)} options={cad.pessoas} /></Field>
        <Field label="Fornecedor"><Select value={d.fornecedor_id} onChange={(e) => set('fornecedor_id', e.target.value)} options={cad.fornecedores} /></Field>
        <Field label="Checklist do que verificar" span={3}><textarea rows={3} value={d.checklist} onChange={(e) => set('checklist', e.target.value)} /></Field>
        <Field label="Observações" span={2}><input value={d.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></Field>
        <label className="check" style={{ alignSelf: 'center' }}><input type="checkbox" checked={d.ativo} onChange={(e) => set('ativo', e.target.checked)} /> Plano ativo</label>
      </div>
    </Modal>
  )
}
