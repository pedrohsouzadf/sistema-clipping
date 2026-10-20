import { useMemo, useState } from 'react'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { fdate } from '../lib/format'
import { alertaGarantia } from '../lib/facilities'
import { TIPOS_GARANTIA, type Garantia } from '../lib/types'
import { Badge, Empty, Loading, PageHead, Select } from '../components/ui'
import GarantiaForm from '../components/GarantiaForm'

const SELECT = '*, unidade:unidades!unidade_id(id,nome,cliente:organizacoes!cliente_id(nome)), servico:servicos_unidade!servico_id(id,nome), fornecedor:organizacoes!fornecedor_id(id,nome)'

export default function Garantias() {
  const { data, loading, error, reload } = useAsync(async () => unwrap(await supabase.from('garantias_vencimentos').select(SELECT).order('data_vencimento')) as unknown as Garantia[])
  const [q, setQ] = useState('')
  const [unidade, setUnidade] = useState('')
  const [tipo, setTipo] = useState('')
  const [status, setStatus] = useState('Vigente')
  const [soAlerta, setSoAlerta] = useState(false)
  const [edit, setEdit] = useState<Garantia | 'nova' | null>(null)
  const unidades = useMemo(() => [...new Map((data ?? []).map((g) => [g.unidade_id, g.unidade?.nome ?? ''])).entries()].map(([v, l]) => ({ v, l })).sort((a, b) => a.l.localeCompare(b.l)), [data])

  const vigentes = (data ?? []).filter((g) => g.status === 'Vigente')
  const vencidas = vigentes.filter((g) => alertaGarantia(g)?.tom === 'bad')
  const avencer = vigentes.filter((g) => alertaGarantia(g)?.tom === 'warn')
  const lista = useMemo(
    () =>
      (data ?? []).filter(
        (g) =>
          (!q || `${g.descricao} ${g.unidade?.nome ?? ''} ${g.fornecedor?.nome ?? ''} ${g.servico?.nome ?? ''}`.toLowerCase().includes(q.toLowerCase())) &&
          (!unidade || g.unidade_id === unidade) && (!tipo || g.tipo === tipo) && (!status || g.status === status) && (!soAlerta || alertaGarantia(g)),
      ),
    [data, q, unidade, tipo, status, soAlerta],
  )

  return (
    <>
      <PageHead title="Garantias e vencimentos" sub="Garantias de equipamentos e serviços, licenças, seguros e contratos de terceiros, com aviso antes do vencimento." actions={<button className="btn btn-primary" onClick={() => setEdit('nova')}>+ Nova garantia ou vencimento</button>} />
      <div className="kpis">
        <div className="kpi"><b style={vencidas.length ? { color: 'var(--bad)' } : undefined}>{vencidas.length}</b><span>vencidas, ainda vigentes</span></div>
        <div className="kpi"><b>{avencer.length}</b><span>vencem dentro do prazo de aviso</span></div>
        <div className="kpi"><b>{vigentes.length}</b><span>vigentes</span></div>
      </div>
      <div className="toolbar">
        <input placeholder="Buscar por descrição, unidade ou empresa…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={unidade} onChange={(e) => setUnidade(e.target.value)} placeholder="Todas as unidades" options={unidades} />
        <Select value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Todos os tipos" options={TIPOS_GARANTIA} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Todas as situações" options={['Vigente', 'Renovado', 'Encerrado']} />
        <label className="check"><input type="checkbox" checked={soAlerta} onChange={(e) => setSoAlerta(e.target.checked)} /> Só com alerta</label>
      </div>

      {loading && !data ? <Loading error={error} /> : lista.length === 0 ? <Empty>Nenhuma garantia ou vencimento encontrado.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Vencimento</th><th>Descrição</th><th>Unidade</th><th>Quem concede</th><th>Situação</th></tr></thead>
            <tbody>
              {lista.map((g) => {
                const a = alertaGarantia(g)
                return (
                  <tr key={g.id} className="clickable" onClick={() => setEdit(g)}>
                    <td className="mono">{fdate(g.data_vencimento)} {a && <Badge tone={a.tom}>{a.texto}</Badge>}</td>
                    <td><b>{g.descricao}</b><div className="muted">{[g.tipo, g.servico?.nome].filter(Boolean).join(' · ')}</div></td>
                    <td>{g.unidade?.nome ?? '—'}<div className="muted">{g.unidade?.cliente?.nome}</div></td>
                    <td>{[g.concedida_por, g.fornecedor?.nome].filter(Boolean).join(' · ')}</td>
                    <td><Badge tone={g.status === 'Vigente' ? 'ok' : 'neutral'}>{g.status}</Badge></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {edit && <GarantiaForm garantia={edit === 'nova' ? null : edit} defaultUnidadeId={unidade || undefined} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
    </>
  )
}
