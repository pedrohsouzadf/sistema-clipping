import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { fdate, money } from '../lib/format'
import { custoPrevisto, custoSemContrato, margem, mesAtual, mesRotulo, pct, totais, type ContratoFin, type OperacaoFin, type ServicoFin } from '../lib/financeiro'
import type { Lancamento } from '../lib/types'
import { Badge, Empty, Loading, Modal, PageHead, Select } from '../components/ui'
import LancamentoForm from '../components/LancamentoForm'
import Historico from '../components/Historico'

export const Restrito = () => <Empty>Os dados financeiros são restritos ao gestor e ao financeiro.</Empty>

export default function Financeiro() {
  const { podeFinanceiro } = useAuth()
  const { data, loading, error, reload } = useAsync(async () => {
    const [c, s, o, l] = await Promise.all([
      supabase.from('contratos').select('id,titulo,status,valor_mensal,cliente_id,cliente:organizacoes!cliente_id(nome),cobertura:contrato_unidades(unidade_id)').order('titulo'),
      supabase.from('servicos_unidade').select('id,nome,unidade_id,contrato_id,custo_mensal,status,unidade:unidades!unidade_id(nome)'),
      supabase.from('operacoes').select('id,nome,contrato_id,itens:cotacao_itens(id,dispensado,propostas:cotacao_propostas(status,valor_mensal))').not('contrato_id', 'is', null),
      supabase.from('lancamentos_financeiros').select('*').order('competencia', { ascending: false }),
    ])
    return { contratos: unwrap(c) as unknown as ContratoFin[], servicos: unwrap(s) as unknown as ServicoFin[], operacoes: unwrap(o) as unknown as OperacaoFin[], lancs: unwrap(l) as unknown as Lancamento[] }
  })
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('Vigente')
  const [ver, setVer] = useState<string | null>(null)

  const linhas = useMemo(() => {
    if (!data) return []
    return data.contratos
      .filter((c) => (!status || c.status === status) && (!q || `${c.titulo} ${c.cliente?.nome ?? ''}`.toLowerCase().includes(q.toLowerCase())))
      .map((c) => {
        const cp = custoPrevisto(c, data.servicos, data.operacoes, data.contratos)
        return { c, cp, m: margem(c.valor_mensal, cp.total), t: totais(data.lancs.filter((l) => l.contrato_id === c.id)) }
      })
  }, [data, q, status])

  if (!podeFinanceiro) return (<><PageHead title="Financeiro por contrato" /><Restrito /></>)
  const vig = linhas.filter((x) => x.c.status === 'Vigente')
  const soma = (f: (x: (typeof linhas)[number]) => number) => linhas.reduce((t, x) => t + f(x), 0)
  const comMargem = vig.filter((x) => x.m)
  const mediaMargem = comMargem.length ? comMargem.reduce((t, x) => t + (x.m?.pct ?? 0), 0) / comMargem.length : null
  const semContrato = data ? custoSemContrato(data.servicos, data.contratos) : []
  const selecionado = linhas.find((x) => x.c.id === ver) ?? null

  return (
    <>
      <PageHead title="Financeiro por contrato" sub="Receita contratada, faturada e recebida são três números separados: nunca se somam." />
      {loading && !data ? <Loading error={error} /> : (
        <>
          <div className="kpis">
            <div className="kpi kpi-money" title="Valor mensal previsto em contrato"><b>{money(vig.reduce((t, x) => t + Number(x.c.valor_mensal ?? 0), 0))}</b><span>receita mensal contratada (vigentes)</span></div>
            <div className="kpi kpi-money"><b>{money(soma((x) => x.t.faturado))}</b><span>faturado (total lançado)</span></div>
            <div className="kpi kpi-money"><b>{money(soma((x) => x.t.recebido))}</b><span>recebido (total lançado)</span></div>
            <div className="kpi kpi-money" title="Faturado menos recebido, por contrato"><b>{money(soma((x) => Math.max(0, x.t.aReceber)))}</b><span>a receber</span></div>
            <div className="kpi kpi-money" title="Custos e investimentos com situação “a pagar”"><b>{money(soma((x) => x.t.aPagar))}</b><span>a pagar (desembolsos futuros)</span></div>
            <div className="kpi" title="Média das margens dos contratos vigentes que têm custo previsto"><b style={{ fontSize: 22 }}>{mediaMargem != null ? pct(mediaMargem) : '—'}</b><span>margem estimada média{vig.length - comMargem.length > 0 ? ` (${vig.length - comMargem.length} sem custo previsto)` : ''}</span></div>
          </div>
          {semContrato.length > 0 && <div className="alert alert-warn">{semContrato.length} serviço(s) com custo mensal não entram em nenhum contrato (sem contrato informado e unidade coberta por zero ou mais de um contrato vigente): {semContrato.slice(0, 4).map((s) => s.nome).join(', ')}{semContrato.length > 4 ? '…' : ''}. Informe o contrato no serviço.</div>}
          <div className="toolbar">
            <input placeholder="Buscar por contrato ou cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Todos os status" options={['Rascunho', 'Em negociação', 'Vigente', 'Encerrado', 'Rescindido']} />
          </div>
          {linhas.length === 0 ? <Empty>Nenhum contrato encontrado.</Empty> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Contrato</th><th>Receita contratada /mês</th><th>Custo previsto /mês</th><th>Margem estimada</th><th>Faturado</th><th>Recebido</th><th>A receber</th><th>Custo realizado</th><th>A pagar</th></tr></thead>
                <tbody>
                  {linhas.map(({ c, cp, m, t }) => (
                    <tr key={c.id} className="clickable" onClick={() => setVer(c.id)}>
                      <td><b>{c.titulo}</b><div className="muted">{c.cliente?.nome} · {c.status}</div></td>
                      <td className="mono">{money(c.valor_mensal)}</td>
                      <td className="mono">{cp.total > 0 ? money(cp.total) : <span className="muted">—</span>}</td>
                      <td>{m ? <><b>{pct(m.pct)}</b> <span className="muted">· {money(m.rs)}</span></> : <span className="muted" title="Cadastre o custo mensal dos serviços para calcular">sem custo previsto</span>}</td>
                      <td className="mono">{money(t.faturado)}</td>
                      <td className="mono">{money(t.recebido)}</td>
                      <td className="mono">{t.aReceber < 0 ? <Badge tone="warn" title="Recebido maior que o faturado">{money(t.aReceber)}</Badge> : money(t.aReceber)}</td>
                      <td className="mono">{money(t.custoRealizado)}</td>
                      <td className="mono">{money(t.aPagar)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {selecionado && data && <Detalhe linha={selecionado} lancs={data.lancs.filter((l) => l.contrato_id === selecionado.c.id)} onClose={() => setVer(null)} onChanged={reload} />}
        </>
      )}
    </>
  )
}

function Detalhe({ linha: { c, cp, m, t }, lancs, onClose, onChanged }: { linha: { c: ContratoFin; cp: ReturnType<typeof custoPrevisto>; m: ReturnType<typeof margem>; t: ReturnType<typeof totais> }; lancs: Lancamento[]; onClose: () => void; onChanged: () => void }) {
  const [novo, setNovo] = useState<string | null>(null)
  const meses = useMemo(() => {
    const hoje = mesAtual()
    const lista: string[] = []
    const d = new Date(`${hoje}T12:00:00`)
    for (let i = 0; i < 12; i++) { lista.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`); d.setMonth(d.getMonth() - 1) }
    return lista
  }, [])
  const porMes = (iso: string) => totais(lancs.filter((l) => l.competencia.slice(0, 7) === iso.slice(0, 7)))
  const outros = lancs.filter((l) => !meses.some((m) => m.slice(0, 7) === l.competencia.slice(0, 7))).length

  return (
    <Modal title={c.titulo} onClose={onClose} wide footer={<><Link className="btn" to={`/contratos?id=${c.id}`}>Abrir contrato</Link><button className="btn" onClick={onClose}>Fechar</button><button className="btn btn-primary" onClick={() => setNovo('Faturamento')}>+ Lançamento</button></>}>
      <p className="muted">{c.cliente?.nome} · {c.status}</p>
      <div className="kpis">
        <div className="kpi kpi-money"><b>{money(c.valor_mensal)}</b><span>receita contratada /mês</span></div>
        <div className="kpi kpi-money"><b>{cp.total > 0 ? money(cp.total) : '—'}</b><span>custo previsto /mês</span></div>
        <div className="kpi"><b style={{ fontSize: 22 }}>{m ? pct(m.pct) : '—'}</b><span>{m ? `margem estimada · ${money(m.rs)}/mês` : 'margem estimada (sem custo previsto)'}</span></div>
        <div className="kpi kpi-money"><b>{money(t.investimento)}</b><span>investimento lançado</span></div>
      </div>

      <h3>Como o custo previsto foi montado</h3>
      {cp.servicos.length === 0 && cp.cotacoes.length === 0 ? <p className="muted">Nenhum serviço ativo com custo mensal está ligado a este contrato. Informe o custo e o contrato em Operação e facilities, Serviços por unidade.</p> : (
        <ul className="plain">
          {cp.servicos.map((s) => (<li key={s.id}><Link to={`/servicos?id=${s.id}`}>{s.nome}</Link> <span className="muted">· {s.unidade} · serviço</span> <b className="mono">{money(s.valor)}</b></li>))}
          {cp.cotacoes.map((o) => (<li key={o.id}><Link to={`/operacoes/${o.id}`}>{o.nome}</Link> <span className="muted">· fornecedores escolhidos na cotação</span> <b className="mono">{money(o.valor)}</b></li>))}
        </ul>
      )}
      {cp.servicos.length > 0 && cp.cotacoes.length > 0 && <p className="muted">Atenção: se um fornecedor aparece nos serviços e também na cotação, o custo pode estar contado duas vezes.</p>}

      <h3>Mês a mês (competência)</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Mês</th><th>Faturado</th><th>Recebido</th><th>Custo realizado</th><th>A pagar</th></tr></thead>
          <tbody>
            {meses.map((mes) => { const x = porMes(mes); return (
              <tr key={mes}><td>{mesRotulo(mes)}</td><td className="mono">{x.faturado ? money(x.faturado) : '—'}</td><td className="mono">{x.recebido ? money(x.recebido) : '—'}</td><td className="mono">{x.custoRealizado ? money(x.custoRealizado) : '—'}</td><td className="mono">{x.aPagar ? money(x.aPagar) : '—'}</td></tr>
            ) })}
            <tr><td><b>Total geral</b></td><td className="mono"><b>{money(t.faturado)}</b></td><td className="mono"><b>{money(t.recebido)}</b></td><td className="mono"><b>{money(t.custoRealizado)}</b></td><td className="mono"><b>{money(t.aPagar)}</b></td></tr>
          </tbody>
        </table>
      </div>
      {outros > 0 && <p className="muted">{outros} lançamento(s) de meses mais antigos entram só no total geral. Veja todos em Lançamentos.</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
        <button className="btn" onClick={() => setNovo('Faturamento')}>+ Faturamento</button>
        <button className="btn" onClick={() => setNovo('Recebimento')}>+ Recebimento</button>
        <button className="btn" onClick={() => setNovo('Custo')}>+ Custo</button>
        <button className="btn" onClick={() => setNovo('Investimento')}>+ Investimento</button>
      </div>
      <p className="muted">Último lançamento: {lancs[0] ? `${lancs[0].tipo} de ${money(lancs[0].valor)} em ${fdate(lancs[0].data ?? lancs[0].vencimento)}` : 'nenhum'}.</p>

      <h3>Histórico de alterações</h3>
      <Historico coluna="contrato_id" id={c.id} />
      {novo && <LancamentoForm defaultContratoId={c.id} defaultTipo={novo} onClose={() => setNovo(null)} onSaved={() => { setNovo(null); onChanged() }} />}
    </Modal>
  )
}
