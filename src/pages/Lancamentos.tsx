import { useMemo, useState } from 'react'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { fdate, isOverdue, money } from '../lib/format'
import { mesRotulo } from '../lib/financeiro'
import { TIPOS_LANCAMENTO, type Lancamento } from '../lib/types'
import { Badge, Confirm, Empty, Loading, PageHead, Select, useAct } from '../components/ui'
import LancamentoForm from '../components/LancamentoForm'
import { Restrito } from './Financeiro'

const SELECT = '*, contrato:contratos!contrato_id(id,titulo,cliente:organizacoes!cliente_id(nome)), fornecedor:organizacoes!fornecedor_id(id,nome), servico:servicos_unidade!servico_id(id,nome)'
const tomTipo = (t: string) => (t === 'Faturamento' ? 'info' : t === 'Recebimento' ? 'ok' : t === 'Custo' ? 'warn' : 'bronze') as 'info' | 'ok' | 'warn' | 'bronze'

export default function Lancamentos() {
  const { podeFinanceiro } = useAuth()
  const act = useAct()
  const { data, loading, error, reload } = useAsync(async () => unwrap(await supabase.from('lancamentos_financeiros').select(SELECT).order('competencia', { ascending: false }).order('created_at', { ascending: false }).limit(1000)) as unknown as Lancamento[])
  const [q, setQ] = useState('')
  const [contrato, setContrato] = useState('')
  const [tipo, setTipo] = useState('')
  const [situacao, setSituacao] = useState('')
  const [mes, setMes] = useState('')
  const [edit, setEdit] = useState<Lancamento | 'novo' | null>(null)
  const [del, setDel] = useState<Lancamento | null>(null)
  const contratos = useMemo(() => [...new Map((data ?? []).map((l) => [l.contrato_id, l.contrato?.titulo ?? ''])).entries()].map(([v, l]) => ({ v, l })).sort((a, b) => a.l.localeCompare(b.l)), [data])

  const lista = useMemo(
    () => (data ?? []).filter((l) =>
      (!q || `${l.contrato?.titulo ?? ''} ${l.fornecedor?.nome ?? ''} ${l.documento ?? ''} ${l.descricao ?? ''} ${l.servico?.nome ?? ''}`.toLowerCase().includes(q.toLowerCase())) &&
      (!contrato || l.contrato_id === contrato) && (!tipo || l.tipo === tipo) && (!mes || l.competencia.slice(0, 7) === mes) &&
      (!situacao || (situacao === 'apagar' ? !l.pago : l.pago)),
    ),
    [data, q, contrato, tipo, mes, situacao],
  )

  if (!podeFinanceiro) return (<><PageHead title="Lançamentos" /><Restrito /></>)

  async function marcarPago(l: Lancamento) {
    const ok = await act(async () => unwrap(await supabase.from('lancamentos_financeiros').update({ pago: true, data: new Date().toISOString().slice(0, 10) }).eq('id', l.id).select()), 'Marcado como pago')
    if (ok) reload()
  }

  return (
    <>
      <PageHead title="Lançamentos" sub="Faturamentos, recebimentos, custos e investimentos de cada contrato, por mês de competência." actions={<button className="btn btn-primary" onClick={() => setEdit('novo')}>+ Novo lançamento</button>} />
      <div className="toolbar">
        <input placeholder="Buscar por contrato, fornecedor, documento…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={contrato} onChange={(e) => setContrato(e.target.value)} placeholder="Todos os contratos" options={contratos} />
        <Select value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Todos os tipos" options={TIPOS_LANCAMENTO} />
        <Select value={situacao} onChange={(e) => setSituacao(e.target.value)} placeholder="Pago e a pagar" options={[{ v: 'pago', l: 'Efetivados' }, { v: 'apagar', l: 'A pagar' }]} />
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} title="Competência" />
      </div>
      {loading && !data ? <Loading error={error} /> : lista.length === 0 ? <Empty>Nenhum lançamento encontrado.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Competência</th><th>Tipo</th><th>Contrato</th><th>Detalhe</th><th>Data</th><th style={{ textAlign: 'right' }}>Valor</th><th /></tr></thead>
            <tbody>
              {lista.map((l) => (
                <tr key={l.id} className="clickable" onClick={() => setEdit(l)}>
                  <td>{mesRotulo(l.competencia)}</td>
                  <td><Badge tone={tomTipo(l.tipo)}>{l.tipo}</Badge></td>
                  <td>{l.contrato?.titulo ?? '—'}<div className="muted">{l.contrato?.cliente?.nome}</div></td>
                  <td>{[l.fornecedor?.nome, l.servico?.nome, l.documento, l.descricao].filter(Boolean).join(' · ') || <span className="muted">—</span>}</td>
                  <td className="mono">{l.pago ? fdate(l.data) : <>vence {fdate(l.vencimento)} {isOverdue(l.vencimento) ? <Badge tone="bad">atrasado</Badge> : <Badge tone="warn">a pagar</Badge>}</>}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{l.tipo === 'Custo' || l.tipo === 'Investimento' ? '−' : ''}{money(l.valor)}</td>
                  <td style={{ width: 150 }} onClick={(e) => e.stopPropagation()}>
                    {!l.pago && <button className="btn btn-sm" onClick={() => marcarPago(l)}>Marcar pago</button>}{' '}
                    <button className="icon-btn" aria-label="Excluir lançamento" onClick={() => setDel(l)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <LancamentoForm lancamento={edit === 'novo' ? null : edit} defaultContratoId={contrato || undefined} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
      {del && <Confirm title="Excluir lançamento" message={`Excluir ${del.tipo.toLowerCase()} de ${money(del.valor)} (${mesRotulo(del.competencia)})? A alteração fica no histórico do contrato.`} confirmLabel="Excluir" onCancel={() => setDel(null)} onConfirm={async () => {
        const l = del; setDel(null)
        const ok = await act(async () => { const rows = unwrap(await supabase.from('lancamentos_financeiros').delete().eq('id', l.id).select()) as unknown[]; if (rows.length === 0) throw new Error('Sem permissão para excluir este lançamento.') }, 'Lançamento excluído')
        if (ok) reload()
      }} />}
    </>
  )
}
