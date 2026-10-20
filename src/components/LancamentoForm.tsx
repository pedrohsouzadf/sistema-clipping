import { useState } from 'react'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { nullIfEmpty, todayISO } from '../lib/format'
import { TIPOS_LANCAMENTO, type Lancamento } from '../lib/types'
import { Field, Modal, Select, useAct } from './ui'

type Opt = { v: string; l: string }

export default function LancamentoForm({ lancamento, defaultContratoId, defaultTipo, onClose, onSaved }: { lancamento?: Lancamento | null; defaultContratoId?: string; defaultTipo?: string; onClose: () => void; onSaved: () => void }) {
  const act = useAct()
  const { data } = useAsync(async () => {
    const [c, f, s] = await Promise.all([
      supabase.from('contratos').select('id,titulo,status,cliente_id,cliente:organizacoes!cliente_id(nome)').order('titulo'),
      supabase.from('organizacoes').select('id,nome,papeis').order('nome'),
      supabase.from('servicos_unidade').select('id,nome,unidade:unidades!unidade_id(cliente_id)').order('nome'),
    ])
    return {
      contratos: unwrap(c) as unknown as { id: string; titulo: string; status: string; cliente_id: string; cliente: { nome: string } | null }[],
      fornecedores: (unwrap(f) as { id: string; nome: string; papeis: string[] }[]).filter((o) => o.papeis.includes('fornecedor')).map((o): Opt => ({ v: o.id, l: o.nome })),
      servicos: unwrap(s) as unknown as { id: string; nome: string; unidade: { cliente_id: string } | null }[],
    }
  })
  const s = (v: unknown) => (v == null ? '' : String(v))
  const [d, setD] = useState({
    contrato_id: s(lancamento?.contrato_id ?? defaultContratoId), tipo: lancamento?.tipo ?? defaultTipo ?? 'Faturamento', competencia: s(lancamento?.competencia).slice(0, 7) || todayISO().slice(0, 7),
    valor: s(lancamento?.valor), pago: lancamento?.pago ?? true, data: s(lancamento?.data) || todayISO(), vencimento: s(lancamento?.vencimento),
    fornecedor_id: s(lancamento?.fornecedor_id), servico_id: s(lancamento?.servico_id), documento: s(lancamento?.documento), descricao: s(lancamento?.descricao),
  })
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }))
  const saida = d.tipo === 'Custo' || d.tipo === 'Investimento'
  const contrato = data?.contratos.find((c) => c.id === d.contrato_id)
  const semVigencia = !!contrato && (d.tipo === 'Faturamento' || d.tipo === 'Recebimento') && (contrato.status === 'Rascunho' || contrato.status === 'Em negociação')
  const pagoEfetivo = saida ? d.pago : true
  const falta = !d.contrato_id || !d.competencia || !(Number(d.valor) > 0) || (pagoEfetivo ? !d.data : !d.vencimento) || semVigencia
  const rotuloData = d.tipo === 'Faturamento' ? 'Data de emissão' : d.tipo === 'Recebimento' ? 'Data do recebimento' : 'Data do pagamento'

  async function salvar() {
    setBusy(true)
    const payload = {
      contrato_id: d.contrato_id, tipo: d.tipo, competencia: `${d.competencia}-01`, valor: Number(d.valor), pago: pagoEfetivo,
      data: pagoEfetivo ? d.data : nullIfEmpty(d.data), vencimento: pagoEfetivo ? nullIfEmpty(d.vencimento) : d.vencimento,
      fornecedor_id: saida ? nullIfEmpty(d.fornecedor_id) : null, servico_id: saida ? nullIfEmpty(d.servico_id) : null, documento: nullIfEmpty(d.documento), descricao: nullIfEmpty(d.descricao),
    }
    const ok = await act(async () => {
      const q = lancamento ? supabase.from('lancamentos_financeiros').update(payload).eq('id', lancamento.id) : supabase.from('lancamentos_financeiros').insert(payload)
      unwrap(await q.select())
    }, lancamento ? 'Lançamento atualizado' : 'Lançamento registrado')
    setBusy(false)
    if (ok) onSaved()
  }

  return (
    <Modal title={lancamento ? 'Editar lançamento' : 'Novo lançamento'} onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={salvar} disabled={busy || falta}>Salvar</button></>}>
      <div className="grid">
        <Field label="Contrato *" span={2}><Select value={d.contrato_id} onChange={(e) => setD((x) => ({ ...x, contrato_id: e.target.value, servico_id: '' }))} options={(data?.contratos ?? []).map((c) => ({ v: c.id, l: `${c.titulo}${c.cliente?.nome ? ` · ${c.cliente.nome}` : ''}` }))} placeholder="Selecione…" /></Field>
        <Field label="Tipo" hint="Faturado e recebido são números separados"><Select value={d.tipo} onChange={(e) => set('tipo', e.target.value as Lancamento['tipo'])} options={TIPOS_LANCAMENTO} placeholder="—" /></Field>
        {semVigencia && <div className="alert alert-warn span-3">Este contrato ainda não está vigente: só dá para lançar custo ou investimento.</div>}
        <Field label="Competência (mês) *"><input type="month" value={d.competencia} onChange={(e) => set('competencia', e.target.value)} /></Field>
        <Field label="Valor (R$) *"><input type="number" min={0} step="0.01" value={d.valor} onChange={(e) => set('valor', e.target.value)} /></Field>
        {saida ? (
          <Field label="Situação"><Select value={d.pago ? 'pago' : 'apagar'} onChange={(e) => set('pago', e.target.value === 'pago')} options={[{ v: 'pago', l: 'Pago' }, { v: 'apagar', l: 'A pagar' }]} placeholder="—" /></Field>
        ) : <div />}
        {pagoEfetivo ? <Field label={`${rotuloData} *`}><input type="date" value={d.data} onChange={(e) => set('data', e.target.value)} /></Field> : <Field label="Vencimento *"><input type="date" value={d.vencimento} onChange={(e) => set('vencimento', e.target.value)} /></Field>}
        {saida && <Field label="Fornecedor"><Select value={d.fornecedor_id} onChange={(e) => set('fornecedor_id', e.target.value)} options={data?.fornecedores ?? []} /></Field>}
        {saida && <Field label="Serviço"><Select value={d.servico_id} onChange={(e) => set('servico_id', e.target.value)} options={(data?.servicos ?? []).filter((x) => x.unidade?.cliente_id === contrato?.cliente_id).map((x) => ({ v: x.id, l: x.nome }))} /></Field>}
        <Field label="Nº do documento" hint="Nota fiscal, boleto ou comprovante"><input value={d.documento} onChange={(e) => set('documento', e.target.value)} /></Field>
        <Field label="Descrição" span={3}><input value={d.descricao} onChange={(e) => set('descricao', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
