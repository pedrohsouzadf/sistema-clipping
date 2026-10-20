import { useState } from 'react'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { nomePessoa } from '../lib/papeis'
import { nullIfEmpty } from '../lib/format'
import { INDICES_REAJUSTE, RENOVACOES, STATUS_CONTRATO, TIPOS_CONTRATO, type Contrato, type Organizacao, type Profile, type Unidade } from '../lib/types'
import { Field, Modal, Select, useAct } from './ui'

const num = (v: string) => (v === '' ? null : Number(v))

export default function ContratoForm({ contrato, defaultClienteId, onClose, onSaved }: { contrato?: Contrato | null; defaultClienteId?: string; onClose: () => void; onSaved: (c: Contrato) => void }) {
  const act = useAct()
  const s = (v: unknown) => (v == null ? '' : String(v))
  const [d, setD] = useState({
    titulo: s(contrato?.titulo), cliente_id: s(contrato?.cliente_id ?? defaultClienteId), contratante_id: s(contrato?.contratante_id), responsavel_id: s(contrato?.responsavel_id),
    tipo: s(contrato?.tipo), tipo_detalhe: s(contrato?.tipo_detalhe), status: contrato?.status ?? 'Rascunho', data_assinatura: s(contrato?.data_assinatura),
    data_inicio: s(contrato?.data_inicio), data_fim: s(contrato?.data_fim), renovacao: s(contrato?.renovacao), aviso_dias: s(contrato?.aviso_dias ?? 90),
    valor_mensal: s(contrato?.valor_mensal), valor_total: s(contrato?.valor_total), reajuste_indice: s(contrato?.reajuste_indice),
    reajuste_percentual: s(contrato?.reajuste_percentual), reajuste_data_base: s(contrato?.reajuste_data_base), condicoes_pagamento: s(contrato?.condicoes_pagamento),
    escopo_incluido: s(contrato?.escopo_incluido), itens_excluidos: s(contrato?.itens_excluidos), obrigacoes_clip: s(contrato?.obrigacoes_clip),
    obrigacoes_cliente: s(contrato?.obrigacoes_cliente), obrigacoes_proprietario: s(contrato?.obrigacoes_proprietario), obrigacoes_terceiros: s(contrato?.obrigacoes_terceiros),
    sla: s(contrato?.sla), criterios_aceite: s(contrato?.criterios_aceite), regras_alteracao_escopo: s(contrato?.regras_alteracao_escopo),
    regras_saida_antecipada: s(contrato?.regras_saida_antecipada), observacoes: s(contrato?.observacoes),
  })
  const [unidades, setUnidades] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }))

  const { data } = useAsync(async () => {
    const [o, p, u, c] = await Promise.all([
      supabase.from('organizacoes').select('id,nome,papeis').order('nome'),
      supabase.from('profiles').select('id,nome,email,role').order('nome'),
      supabase.from('unidades').select('id,cliente_id,nome,cidade,estado').order('nome'),
      contrato ? supabase.from('contrato_unidades').select('unidade_id').eq('contrato_id', contrato.id) : Promise.resolve({ data: [], error: null }),
    ])
    const cob = (unwrap(c as never) as { unidade_id: string }[]).map((x) => x.unidade_id)
    setUnidades((x) => x ?? cob)
    return {
      orgs: unwrap(o) as Pick<Organizacao, 'id' | 'nome' | 'papeis'>[],
      pessoas: unwrap(p) as Profile[],
      unidades: unwrap(u) as Pick<Unidade, 'id' | 'cliente_id' | 'nome' | 'cidade' | 'estado'>[],
      cobertasOriginais: cob,
    }
  }, [contrato?.id])

  const unidadesDoCliente = (data?.unidades ?? []).filter((u) => u.cliente_id === d.cliente_id)
  const marcadas = (unidades ?? []).filter((id) => unidadesDoCliente.some((u) => u.id === id))
  const alternar = (id: string) => setUnidades((x) => ((x ?? []).includes(id) ? (x ?? []).filter((i) => i !== id) : [...(x ?? []), id]))
  const datasInvertidas = !!d.data_inicio && !!d.data_fim && d.data_fim < d.data_inicio
  const vigenteSemInicio = d.status === 'Vigente' && !d.data_inicio
  const falta = !d.titulo.trim() || !d.cliente_id || !d.tipo || datasInvertidas || vigenteSemInicio
  const ptxt = (k: keyof typeof d, label: string, hint?: string, rows = 3) => (
    <Field label={label} span={3} hint={hint}><textarea rows={rows} value={d[k]} onChange={(e) => set(k, e.target.value)} /></Field>
  )

  async function salvar() {
    setBusy(true)
    let saved: Contrato | null = null
    const payload = {
      titulo: d.titulo.trim(), cliente_id: d.cliente_id, contratante_id: nullIfEmpty(d.contratante_id), responsavel_id: nullIfEmpty(d.responsavel_id),
      tipo: d.tipo, tipo_detalhe: nullIfEmpty(d.tipo_detalhe), status: d.status, data_assinatura: nullIfEmpty(d.data_assinatura),
      data_inicio: nullIfEmpty(d.data_inicio), data_fim: nullIfEmpty(d.data_fim), renovacao: nullIfEmpty(d.renovacao), aviso_dias: d.aviso_dias === '' ? 90 : Number(d.aviso_dias),
      valor_mensal: num(d.valor_mensal), valor_total: num(d.valor_total), reajuste_indice: nullIfEmpty(d.reajuste_indice), reajuste_percentual: num(d.reajuste_percentual),
      reajuste_data_base: nullIfEmpty(d.reajuste_data_base), condicoes_pagamento: nullIfEmpty(d.condicoes_pagamento), escopo_incluido: nullIfEmpty(d.escopo_incluido),
      itens_excluidos: nullIfEmpty(d.itens_excluidos), obrigacoes_clip: nullIfEmpty(d.obrigacoes_clip), obrigacoes_cliente: nullIfEmpty(d.obrigacoes_cliente),
      obrigacoes_proprietario: nullIfEmpty(d.obrigacoes_proprietario), obrigacoes_terceiros: nullIfEmpty(d.obrigacoes_terceiros), sla: nullIfEmpty(d.sla),
      criterios_aceite: nullIfEmpty(d.criterios_aceite), regras_alteracao_escopo: nullIfEmpty(d.regras_alteracao_escopo),
      regras_saida_antecipada: nullIfEmpty(d.regras_saida_antecipada), observacoes: nullIfEmpty(d.observacoes),
    }
    const ok = await act(async () => {
      const q = contrato ? supabase.from('contratos').update(payload).eq('id', contrato.id) : supabase.from('contratos').insert(payload)
      saved = unwrap(await q.select().single()) as Contrato
      const antes = new Set(contrato ? data?.cobertasOriginais ?? [] : [])
      const depois = new Set(marcadas)
      const remover = [...antes].filter((id) => !depois.has(id))
      const incluir = [...depois].filter((id) => !antes.has(id))
      if (remover.length) unwrap(await supabase.from('contrato_unidades').delete().eq('contrato_id', saved.id).in('unidade_id', remover).select())
      if (incluir.length) unwrap(await supabase.from('contrato_unidades').insert(incluir.map((unidade_id) => ({ contrato_id: (saved as Contrato).id, unidade_id }))).select())
    }, contrato ? 'Contrato atualizado' : 'Contrato cadastrado')
    setBusy(false)
    if (ok && saved) onSaved(saved)
  }

  const pessoas = (data?.pessoas ?? []).map((p) => ({ v: p.id, l: nomePessoa(p) }))
  return (
    <Modal
      title={contrato ? 'Editar contrato' : 'Novo contrato'}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={busy || falta}>Salvar</button>
        </>
      }
    >
      <h3 style={{ marginTop: 0 }}>Identificação</h3>
      <div className="grid">
        <Field label="Título *" span={2} hint="Ex.: OaaS Brasília — Asa Sul"><input value={d.titulo} onChange={(e) => set('titulo', e.target.value)} autoFocus /></Field>
        <Field label="Status"><Select value={d.status} onChange={(e) => set('status', e.target.value)} options={STATUS_CONTRATO} placeholder="—" /></Field>
        <Field label="Cliente *" span={2}><Select value={d.cliente_id} onChange={(e) => { set('cliente_id', e.target.value); setUnidades([]) }} options={(data?.orgs ?? []).filter((o) => o.papeis.includes('cliente') || o.id === d.cliente_id).map((o) => ({ v: o.id, l: o.nome }))} placeholder="Selecione o cliente…" /></Field>
        <Field label="Tipo *"><Select value={d.tipo} onChange={(e) => set('tipo', e.target.value)} options={TIPOS_CONTRATO} /></Field>
        {d.tipo === 'Combinação' && <Field label="Quais tipos combinados" span={3}><input value={d.tipo_detalhe} onChange={(e) => set('tipo_detalhe', e.target.value)} placeholder="Ex.: BTS + Facilities" /></Field>}
        <Field label="Contratante (se não for o cliente)" span={2} hint="Ex.: Woba, quando ela assina com a Clip"><Select value={d.contratante_id} onChange={(e) => set('contratante_id', e.target.value)} options={(data?.orgs ?? []).map((o) => ({ v: o.id, l: o.nome }))} placeholder="— o próprio cliente —" /></Field>
        <Field label="Responsável pelo contrato"><Select value={d.responsavel_id} onChange={(e) => set('responsavel_id', e.target.value)} options={pessoas} /></Field>
      </div>

      <h3>Unidades cobertas</h3>
      {!d.cliente_id ? <p className="muted">Escolha o cliente para ver as unidades.</p> : unidadesDoCliente.length === 0 ? <p className="muted">Este cliente ainda não tem unidades cadastradas (aba Unidades).</p> : (
        <div className="chips" style={{ gap: 12 }}>
          {unidadesDoCliente.map((u) => (
            <label key={u.id} className="check"><input type="checkbox" checked={marcadas.includes(u.id)} onChange={() => alternar(u.id)} /> {u.nome}{u.cidade ? ` · ${u.cidade}${u.estado ? `/${u.estado}` : ''}` : ''}</label>
          ))}
        </div>
      )}

      <h3>Vigência</h3>
      <div className="grid">
        <Field label="Assinatura"><input type="date" value={d.data_assinatura} onChange={(e) => set('data_assinatura', e.target.value)} /></Field>
        <Field label="Início"><input type="date" value={d.data_inicio} onChange={(e) => set('data_inicio', e.target.value)} /></Field>
        <Field label="Término"><input type="date" value={d.data_fim} onChange={(e) => set('data_fim', e.target.value)} /></Field>
        <Field label="Renovação"><Select value={d.renovacao} onChange={(e) => set('renovacao', e.target.value)} options={RENOVACOES} /></Field>
        <Field label="Alertar vencimento com (dias)"><input type="number" min="0" value={d.aviso_dias} onChange={(e) => set('aviso_dias', e.target.value)} /></Field>
        <div />
        {datasInvertidas && <div className="alert alert-warn span-3">O término não pode ser anterior ao início.</div>}
        {vigenteSemInicio && <div className="alert alert-warn span-3">Um contrato vigente precisa da data de início.</div>}
      </div>

      <h3>Valores e pagamento</h3>
      <div className="grid">
        <Field label="Valor mensal (R$)"><input type="number" min="0" step="0.01" value={d.valor_mensal} onChange={(e) => set('valor_mensal', e.target.value)} /></Field>
        <Field label="Valor total (R$)" hint="Opcional"><input type="number" min="0" step="0.01" value={d.valor_total} onChange={(e) => set('valor_total', e.target.value)} /></Field>
        <div />
        <Field label="Índice de reajuste"><Select value={d.reajuste_indice} onChange={(e) => set('reajuste_indice', e.target.value)} options={INDICES_REAJUSTE} /></Field>
        <Field label="Percentual (se fixo)"><input type="number" min="0" step="0.01" value={d.reajuste_percentual} onChange={(e) => set('reajuste_percentual', e.target.value)} /></Field>
        <Field label="Próximo reajuste"><input type="date" value={d.reajuste_data_base} onChange={(e) => set('reajuste_data_base', e.target.value)} /></Field>
        {ptxt('condicoes_pagamento', 'Condições de pagamento', 'Prazo, forma, multa e juros por atraso', 2)}
      </div>

      <h3>Escopo</h3>
      <div className="grid">
        {ptxt('escopo_incluido', 'Escopo incluído')}
        {ptxt('itens_excluidos', 'Itens excluídos', 'O que não faz parte do contrato', 2)}
      </div>

      <h3>Obrigações</h3>
      <div className="grid">
        {ptxt('obrigacoes_clip', 'Da Clip', undefined, 2)}
        {ptxt('obrigacoes_cliente', 'Do cliente', undefined, 2)}
        {ptxt('obrigacoes_proprietario', 'Do proprietário do imóvel', undefined, 2)}
        {ptxt('obrigacoes_terceiros', 'De terceiros (fornecedores, condomínio…)', undefined, 2)}
      </div>

      <h3>SLA, aceite e regras</h3>
      <div className="grid">
        {ptxt('sla', 'SLA', 'Prazos de atendimento e níveis de serviço', 2)}
        {ptxt('criterios_aceite', 'Critérios de aceite', undefined, 2)}
        {ptxt('regras_alteracao_escopo', 'Regras para alteração de escopo', undefined, 2)}
        {ptxt('regras_saida_antecipada', 'Regras para saída antecipada', 'Multa, aviso prévio, devolução de investimento', 2)}
        <Field label="Observações" span={3}><input value={d.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
