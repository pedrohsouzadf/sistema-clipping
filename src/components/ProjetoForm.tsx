import { useState } from 'react'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { nullIfEmpty } from '../lib/format'
import { nomePessoa } from '../lib/papeis'
import { STATUS_PROJETO, TIPOS_SERVICO, type Organizacao, type Profile, type Projeto, type Unidade } from '../lib/types'
import { Field, Modal, Select, useAct } from './ui'

export default function ProjetoForm({ projeto, onClose, onSaved }: { projeto?: Projeto | null; onClose: () => void; onSaved: (p: Projeto) => void }) {
  const act = useAct()
  const { data } = useAsync(async () => {
    const [o, p, u] = await Promise.all([
      supabase.from('organizacoes').select('id,nome').order('nome'),
      supabase.from('profiles').select('id,nome,email,role').order('nome'),
      supabase.from('unidades').select('id,nome,cliente_id').order('nome'),
    ])
    return { orgs: unwrap(o) as Pick<Organizacao, 'id' | 'nome'>[], pessoas: unwrap(p) as Profile[], unidades: unwrap(u) as Pick<Unidade, 'id' | 'nome' | 'cliente_id'>[] }
  })
  const s = (v: unknown) => (v == null ? '' : String(v))
  const [d, setD] = useState({
    nome: s(projeto?.nome), cliente_id: s(projeto?.cliente_id), unidade_id: s(projeto?.unidade_id), tipo: s(projeto?.tipo), status: projeto?.status ?? 'planejamento',
    cidade: s(projeto?.cidade), endereco: s(projeto?.endereco), gerente_id: s(projeto?.gerente_id), engenheiro_id: s(projeto?.engenheiro_id),
    responsaveis_locais: s(projeto?.responsaveis_locais), data_inicio: s(projeto?.data_inicio), data_fim_prevista: s(projeto?.data_fim_prevista),
    data_fim_real: s(projeto?.data_fim_real), escopo: s(projeto?.escopo), premissas: s(projeto?.premissas), exclusoes: s(projeto?.exclusoes),
    criterios_conclusao: s(projeto?.criterios_conclusao), observacoes: s(projeto?.observacoes),
  })
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }))
  const pessoas = (data?.pessoas ?? []).map((p) => ({ v: p.id, l: nomePessoa(p) }))
  const datasInvertidas = !!d.data_inicio && !!d.data_fim_prevista && d.data_fim_prevista < d.data_inicio

  async function salvar() {
    setBusy(true)
    let saved: Projeto | null = null
    const payload = {
      nome: d.nome.trim(), cliente_id: nullIfEmpty(d.cliente_id), unidade_id: nullIfEmpty(d.unidade_id), tipo: nullIfEmpty(d.tipo), status: d.status, cidade: nullIfEmpty(d.cidade),
      endereco: nullIfEmpty(d.endereco), gerente_id: nullIfEmpty(d.gerente_id), engenheiro_id: nullIfEmpty(d.engenheiro_id),
      responsaveis_locais: nullIfEmpty(d.responsaveis_locais), data_inicio: nullIfEmpty(d.data_inicio), data_fim_prevista: nullIfEmpty(d.data_fim_prevista),
      data_fim_real: nullIfEmpty(d.data_fim_real), escopo: nullIfEmpty(d.escopo), premissas: nullIfEmpty(d.premissas), exclusoes: nullIfEmpty(d.exclusoes),
      criterios_conclusao: nullIfEmpty(d.criterios_conclusao), observacoes: nullIfEmpty(d.observacoes),
    }
    const ok = await act(async () => {
      const q = projeto ? supabase.from('projetos').update(payload).eq('id', projeto.id) : supabase.from('projetos').insert(payload)
      saved = unwrap(await q.select().single()) as Projeto
    }, projeto ? 'Projeto atualizado' : 'Projeto criado com as 7 etapas de implantação')
    setBusy(false)
    if (ok && saved) onSaved(saved)
  }

  return (
    <Modal
      title={projeto ? 'Editar projeto' : 'Novo projeto'}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={busy || !d.nome.trim() || datasInvertidas}>Salvar</button>
        </>
      }
    >
      <div className="grid">
        <Field label="Nome *" span={2}><input value={d.nome} onChange={(e) => set('nome', e.target.value)} autoFocus /></Field>
        <Field label="Status"><Select value={d.status} onChange={(e) => set('status', e.target.value as Projeto['status'])} options={STATUS_PROJETO} placeholder="—" /></Field>
        <Field label="Cliente" span={2}><Select value={d.cliente_id} onChange={(e) => setD((x) => ({ ...x, cliente_id: e.target.value, unidade_id: '' }))} options={(data?.orgs ?? []).map((o) => ({ v: o.id, l: o.nome }))} /></Field>
        <Field label="Unidade" hint="Opcional · unidades do cliente"><Select value={d.unidade_id} onChange={(e) => set('unidade_id', e.target.value)} options={(data?.unidades ?? []).filter((u) => u.cliente_id === d.cliente_id).map((u) => ({ v: u.id, l: u.nome }))} /></Field>
        <Field label="Tipo de implantação"><Select value={d.tipo} onChange={(e) => set('tipo', e.target.value)} options={TIPOS_SERVICO} /></Field>
        <Field label="Cidade"><input value={d.cidade} onChange={(e) => set('cidade', e.target.value)} /></Field>
        <Field label="Endereço" span={2}><input value={d.endereco} onChange={(e) => set('endereco', e.target.value)} /></Field>
        <Field label="Gerente do projeto"><Select value={d.gerente_id} onChange={(e) => set('gerente_id', e.target.value)} options={pessoas} /></Field>
        <Field label="Engenheiro responsável"><Select value={d.engenheiro_id} onChange={(e) => set('engenheiro_id', e.target.value)} options={pessoas} /></Field>
        <Field label="Responsáveis locais"><input value={d.responsaveis_locais} onChange={(e) => set('responsaveis_locais', e.target.value)} /></Field>
        <Field label="Início"><input type="date" value={d.data_inicio} onChange={(e) => set('data_inicio', e.target.value)} /></Field>
        <Field label="Fim previsto"><input type="date" value={d.data_fim_prevista} onChange={(e) => set('data_fim_prevista', e.target.value)} /></Field>
        <Field label="Fim real"><input type="date" value={d.data_fim_real} onChange={(e) => set('data_fim_real', e.target.value)} /></Field>
        {datasInvertidas && <div className="alert alert-warn span-3">O fim previsto não pode ser anterior ao início.</div>}
        <Field label="Escopo" span={3}><textarea rows={3} value={d.escopo} onChange={(e) => set('escopo', e.target.value)} /></Field>
        <Field label="Premissas" span={3}><textarea rows={2} value={d.premissas} onChange={(e) => set('premissas', e.target.value)} /></Field>
        <Field label="Exclusões" span={3} hint="O que não está incluído"><textarea rows={2} value={d.exclusoes} onChange={(e) => set('exclusoes', e.target.value)} /></Field>
        <Field label="Critérios de conclusão e aceite" span={3}><textarea rows={2} value={d.criterios_conclusao} onChange={(e) => set('criterios_conclusao', e.target.value)} /></Field>
        <Field label="Observações" span={3}><input value={d.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
