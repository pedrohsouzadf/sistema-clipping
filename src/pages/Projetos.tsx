import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { fdate } from '../lib/format'
import { podeEditarProjetos } from '../lib/papeis'
import { etapaAtual, motivoAtraso } from '../lib/projeto'
import { STATUS_PROJETO, type Projeto, type ProjetoEtapa } from '../lib/types'
import { Badge, Empty, Loading, PageHead, Select } from '../components/ui'
import ProjetoForm from '../components/ProjetoForm'

export const statusProjetoLabel = (s: string) => STATUS_PROJETO.find((x) => x.v === s)?.l ?? s
export const toneProjeto = (s: string) => (s === 'em_execucao' ? 'info' : s === 'concluido' ? 'ok' : s === 'cancelado' ? 'bad' : s === 'pausado' ? 'warn' : 'neutral') as 'info' | 'ok' | 'bad' | 'warn' | 'neutral'

export default function Projetos() {
  const { profile } = useAuth()
  const nav = useNavigate()
  const { data, loading, error } = useAsync(async () => {
    const [p, e] = await Promise.all([
      supabase.from('projetos').select('*, cliente:organizacoes!cliente_id(id,nome), gerente:profiles!gerente_id(id,nome)').order('created_at', { ascending: false }),
      supabase.from('projeto_etapas').select('*').order('ordem'),
    ])
    return { projetos: unwrap(p) as Projeto[], etapas: unwrap(e) as ProjetoEtapa[] }
  })
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [novo, setNovo] = useState(false)

  const lista = useMemo(
    () => (data?.projetos ?? []).filter((p) => (!q || `${p.nome} ${p.cliente?.nome ?? ''} ${p.cidade ?? ''}`.toLowerCase().includes(q.toLowerCase())) && (!status || p.status === status)),
    [data, q, status],
  )

  return (
    <>
      <PageHead
        title="Projetos"
        sub="Implantações, obras, BTS e fit-outs. Um projeto nasce de uma oportunidade ganha (botão na página dela) ou é criado aqui."
        actions={podeEditarProjetos(profile?.role) ? <button className="btn btn-primary" onClick={() => setNovo(true)}>+ Novo projeto</button> : undefined}
      />
      <div className="toolbar">
        <input placeholder="Buscar por nome, cliente ou cidade…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Todos os status" options={STATUS_PROJETO.map((s) => ({ v: s.v, l: s.l }))} />
      </div>
      {loading && !data ? <Loading error={error} /> : lista.length === 0 ? <Empty>Nenhum projeto ainda. Ganhe uma oportunidade e gere o projeto a partir dela.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Projeto</th><th>Cliente</th><th>Tipo</th><th>Etapa atual</th><th>Fim previsto</th><th>Gerente</th><th>Status</th></tr></thead>
            <tbody>
              {lista.map((p) => {
                const ets = (data?.etapas ?? []).filter((e) => e.projeto_id === p.id)
                const at = etapaAtual(ets)
                const atraso = motivoAtraso(p, ets)
                const aprovadas = ets.filter((e) => e.aprovada).length
                return (
                  <tr key={p.id} className="clickable" onClick={() => nav(`/projetos/${p.id}`)}>
                    <td><Link to={`/projetos/${p.id}`} onClick={(e) => e.stopPropagation()}><b>{p.nome}</b></Link><div className="muted">{p.cidade ?? ''}</div></td>
                    <td>{p.cliente?.nome ?? '—'}</td>
                    <td>{p.tipo ?? '—'}</td>
                    <td>{at ? at.nome : ets.length ? 'Todas aprovadas' : '—'}<div className="muted">{aprovadas}/{ets.length} aprovadas</div></td>
                    <td className="mono">{fdate(p.data_fim_prevista)}</td>
                    <td>{p.gerente?.nome ?? '—'}</td>
                    <td><Badge tone={toneProjeto(p.status)}>{statusProjetoLabel(p.status)}</Badge>{atraso && <Badge tone="bad" title={atraso}>Atrasado</Badge>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {novo && <ProjetoForm onClose={() => setNovo(false)} onSaved={(p) => nav(`/projetos/${p.id}`)} />}
    </>
  )
}
