import { useState } from 'react'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { nullIfEmpty } from '../lib/format'
import { SITUACOES_UNIDADE, TIPOS_OPERACAO, type Organizacao, type Unidade } from '../lib/types'
import { Field, Modal, Select, useAct } from './ui'

export default function UnidadeForm({ unidade, defaultClienteId, onClose, onSaved }: { unidade?: Unidade | null; defaultClienteId?: string; onClose: () => void; onSaved: (u: Unidade) => void }) {
  const act = useAct()
  const { data: orgs } = useAsync(async () => unwrap(await supabase.from('organizacoes').select('id,nome,papeis').order('nome')) as Pick<Organizacao, 'id' | 'nome' | 'papeis'>[])
  const s = (v: unknown) => (v == null ? '' : String(v))
  const [d, setD] = useState({
    cliente_id: s(unidade?.cliente_id ?? defaultClienteId), nome: s(unidade?.nome), endereco: s(unidade?.endereco), cidade: s(unidade?.cidade),
    estado: s(unidade?.estado), tipo_operacao: s(unidade?.tipo_operacao), capacidade_pessoas: s(unidade?.capacidade_pessoas), area_m2: s(unidade?.area_m2),
    proprietario: s(unidade?.proprietario), locatario_contratual: s(unidade?.locatario_contratual), situacao: unidade?.situacao ?? 'Em estudo',
    requisitos_infra: s(unidade?.requisitos_infra), servicos_contratados: s(unidade?.servicos_contratados), responsaveis_locais: s(unidade?.responsaveis_locais),
    observacoes: s(unidade?.observacoes),
  })
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }))
  const clientes = (orgs ?? []).filter((o) => o.papeis.includes('cliente') || o.id === d.cliente_id)
  const ufInvalida = d.estado.trim() !== '' && d.estado.trim().length !== 2
  const falta = !d.nome.trim() || !d.cliente_id || ufInvalida

  async function salvar() {
    setBusy(true)
    let saved: Unidade | null = null
    const payload = {
      cliente_id: d.cliente_id, nome: d.nome.trim(), endereco: nullIfEmpty(d.endereco), cidade: nullIfEmpty(d.cidade),
      estado: nullIfEmpty(d.estado)?.toUpperCase() ?? null, tipo_operacao: nullIfEmpty(d.tipo_operacao),
      capacidade_pessoas: d.capacidade_pessoas === '' ? null : Number(d.capacidade_pessoas), area_m2: d.area_m2 === '' ? null : Number(d.area_m2),
      proprietario: nullIfEmpty(d.proprietario), locatario_contratual: nullIfEmpty(d.locatario_contratual), situacao: d.situacao,
      requisitos_infra: nullIfEmpty(d.requisitos_infra), servicos_contratados: nullIfEmpty(d.servicos_contratados),
      responsaveis_locais: nullIfEmpty(d.responsaveis_locais), observacoes: nullIfEmpty(d.observacoes),
    }
    const ok = await act(async () => {
      const q = unidade ? supabase.from('unidades').update(payload).eq('id', unidade.id) : supabase.from('unidades').insert(payload)
      saved = unwrap(await q.select().single()) as Unidade
    }, unidade ? 'Unidade atualizada' : 'Unidade cadastrada')
    setBusy(false)
    if (ok && saved) onSaved(saved)
  }

  return (
    <Modal
      title={unidade ? 'Editar unidade' : 'Nova unidade'}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={busy || falta}>Salvar</button>
        </>
      }
    >
      <div className="grid">
        <Field label="Cliente *" span={2}><Select value={d.cliente_id} onChange={(e) => set('cliente_id', e.target.value)} options={clientes.map((o) => ({ v: o.id, l: o.nome }))} placeholder="Selecione o cliente…" disabled={!!unidade} /></Field>
        <Field label="Situação"><Select value={d.situacao} onChange={(e) => set('situacao', e.target.value)} options={SITUACOES_UNIDADE} placeholder="—" /></Field>
        <Field label="Nome da unidade *" span={2} hint="Ex.: Brasília — Asa Sul"><input value={d.nome} onChange={(e) => set('nome', e.target.value)} autoFocus /></Field>
        <Field label="Tipo de operação"><Select value={d.tipo_operacao} onChange={(e) => set('tipo_operacao', e.target.value)} options={TIPOS_OPERACAO} /></Field>
        <Field label="Endereço completo" span={3}><input value={d.endereco} onChange={(e) => set('endereco', e.target.value)} placeholder="Rua, número, complemento, bairro, CEP" /></Field>
        <Field label="Cidade"><input value={d.cidade} onChange={(e) => set('cidade', e.target.value)} /></Field>
        <Field label="Estado (UF)"><input value={d.estado} maxLength={2} onChange={(e) => set('estado', e.target.value.toUpperCase())} placeholder="DF" /></Field>
        <div />
        {ufInvalida && <div className="alert alert-warn span-3">Informe a sigla do estado com 2 letras (ex.: DF, SP).</div>}
        <Field label="Capacidade (pessoas)"><input type="number" min="1" value={d.capacidade_pessoas} onChange={(e) => set('capacidade_pessoas', e.target.value)} /></Field>
        <Field label="Área (m²)"><input type="number" min="0" step="0.01" value={d.area_m2} onChange={(e) => set('area_m2', e.target.value)} /></Field>
        <div />
        <Field label="Proprietário do imóvel"><input value={d.proprietario} onChange={(e) => set('proprietario', e.target.value)} /></Field>
        <Field label="Locatário contratual" hint="Quem assina a locação do imóvel"><input value={d.locatario_contratual} onChange={(e) => set('locatario_contratual', e.target.value)} /></Field>
        <div />
        <Field label="Requisitos de infraestrutura" span={3}><textarea rows={2} value={d.requisitos_infra} onChange={(e) => set('requisitos_infra', e.target.value)} /></Field>
        <Field label="Serviços contratados" span={3} hint="Ex.: limpeza, segurança, TI, manutenção, recepção"><textarea rows={2} value={d.servicos_contratados} onChange={(e) => set('servicos_contratados', e.target.value)} /></Field>
        <Field label="Responsáveis locais" span={3} hint="Nome, cargo e contato de quem responde pela unidade"><textarea rows={2} value={d.responsaveis_locais} onChange={(e) => set('responsaveis_locais', e.target.value)} /></Field>
        <Field label="Observações" span={3}><input value={d.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
