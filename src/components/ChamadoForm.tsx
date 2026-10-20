import { useState } from 'react'
import { supabase, unwrap } from '../lib/supabase'
import { useCadastros } from '../lib/cadastros'
import { nullIfEmpty } from '../lib/format'
import { CRITICIDADES, TIPOS_CHAMADO, type Chamado } from '../lib/types'
import { Field, Modal, Select, useAct } from './ui'

export default function ChamadoForm({ chamado, defaultUnidadeId, defaultServicoId, onClose, onSaved }: { chamado?: Chamado | null; defaultUnidadeId?: string; defaultServicoId?: string; onClose: () => void; onSaved: (c: Chamado) => void }) {
  const act = useAct()
  const cad = useCadastros()
  const s = (v: unknown) => (v == null ? '' : String(v))
  const [d, setD] = useState({
    unidade_id: s(chamado?.unidade_id ?? defaultUnidadeId), servico_id: s(chamado?.servico_id ?? defaultServicoId), tipo: chamado?.tipo ?? 'Incidente', titulo: s(chamado?.titulo),
    descricao: s(chamado?.descricao), criticidade: chamado?.criticidade ?? 'Média', solicitante: s(chamado?.solicitante), responsavel_id: s(chamado?.responsavel_id), fornecedor_id: s(chamado?.fornecedor_id),
  })
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }))

  async function salvar() {
    setBusy(true)
    let saved: Chamado | null = null
    const payload = {
      unidade_id: d.unidade_id, servico_id: nullIfEmpty(d.servico_id), tipo: d.tipo, titulo: d.titulo.trim(), descricao: nullIfEmpty(d.descricao), criticidade: d.criticidade,
      solicitante: nullIfEmpty(d.solicitante), responsavel_id: nullIfEmpty(d.responsavel_id), fornecedor_id: nullIfEmpty(d.fornecedor_id),
    }
    const ok = await act(async () => {
      const q = chamado ? supabase.from('chamados').update(payload).eq('id', chamado.id) : supabase.from('chamados').insert(payload)
      saved = unwrap(await q.select().single()) as Chamado
    }, chamado ? 'Chamado atualizado' : 'Chamado aberto')
    setBusy(false)
    if (ok && saved) onSaved(saved)
  }

  return (
    <Modal title={chamado ? `Editar chamado #${chamado.numero}` : 'Novo chamado'} onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={salvar} disabled={busy || !d.unidade_id || !d.titulo.trim()}>{chamado ? 'Salvar' : 'Abrir chamado'}</button></>}>
      <div className="grid">
        <Field label="Unidade *" span={2}><Select value={d.unidade_id} onChange={(e) => setD((x) => ({ ...x, unidade_id: e.target.value, servico_id: '' }))} options={cad.unidades} placeholder="Selecione…" /></Field>
        <Field label="Tipo"><Select value={d.tipo} onChange={(e) => set('tipo', e.target.value as Chamado['tipo'])} options={TIPOS_CHAMADO} placeholder="—" /></Field>
        <Field label="Título *" span={2}><input value={d.titulo} onChange={(e) => set('titulo', e.target.value)} autoFocus /></Field>
        <Field label="Prioridade"><Select value={d.criticidade} onChange={(e) => set('criticidade', e.target.value as Chamado['criticidade'])} options={CRITICIDADES} placeholder="—" /></Field>
        <Field label="Serviço relacionado" span={2} hint="Os prazos do chamado vêm do SLA do serviço"><Select value={d.servico_id} onChange={(e) => set('servico_id', e.target.value)} options={cad.servicos.filter((x) => x.unidade_id === d.unidade_id).map((x) => ({ v: x.id, l: x.nome }))} /></Field>
        <Field label="Quem pediu"><input value={d.solicitante} onChange={(e) => set('solicitante', e.target.value)} placeholder="Nome e cargo no cliente" /></Field>
        <Field label="Descrição" span={3}><textarea rows={3} value={d.descricao} onChange={(e) => set('descricao', e.target.value)} /></Field>
        <Field label="Responsável na Clip"><Select value={d.responsavel_id} onChange={(e) => set('responsavel_id', e.target.value)} options={cad.pessoas} /></Field>
        <Field label="Fornecedor acionado" span={2}><Select value={d.fornecedor_id} onChange={(e) => set('fornecedor_id', e.target.value)} options={cad.fornecedores} /></Field>
      </div>
    </Modal>
  )
}
