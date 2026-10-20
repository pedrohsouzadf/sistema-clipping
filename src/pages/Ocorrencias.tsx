import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { fdatetime } from '../lib/format'
import { tomStatusChamado } from '../lib/facilities'
import { Badge, Empty, Loading, PageHead, Select } from '../components/ui'

type Linha = { chave: string; quando: string; origem: 'Chamado' | 'Atendimento'; unidadeId: string; unidade: string; cliente: string; titulo: string; detalhe: string; situacao: string; tom: 'warn' | 'info' | 'bronze' | 'ok' | 'neutral' | 'bad'; to?: string }
type RawUn = { id: string; nome: string; cliente: { nome: string } | null }

export default function Ocorrencias() {
  const { data, loading, error } = useAsync(async () => {
    const [c, a] = await Promise.all([
      supabase.from('chamados').select('id,numero,titulo,tipo,status,criticidade,aberto_em,unidade:unidades!unidade_id(id,nome,cliente:organizacoes!cliente_id(nome)),servico:servicos_unidade!servico_id(nome)').order('aberto_em', { ascending: false }).limit(300),
      supabase.from('atendimentos').select('id,tipo,data_hora,descricao,aceite,executado_por,unidade:unidades!unidade_id(id,nome,cliente:organizacoes!cliente_id(nome)),servico:servicos_unidade!servico_id(nome),chamado:chamados!chamado_id(numero)').order('data_hora', { ascending: false }).limit(300),
    ])
    const linhas: Linha[] = []
    for (const x of unwrap(c) as unknown as { id: string; numero: number; titulo: string; tipo: string; status: string; criticidade: string; aberto_em: string; unidade: RawUn | null; servico: { nome: string } | null }[])
      linhas.push({ chave: `c${x.id}`, quando: x.aberto_em, origem: 'Chamado', unidadeId: x.unidade?.id ?? '', unidade: x.unidade?.nome ?? '—', cliente: x.unidade?.cliente?.nome ?? '', titulo: `#${x.numero} ${x.titulo}`, detalhe: [x.tipo, `prioridade ${x.criticidade.toLowerCase()}`, x.servico?.nome].filter(Boolean).join(' · '), situacao: x.status, tom: tomStatusChamado(x.status), to: `/chamados?id=${x.id}` })
    for (const x of unwrap(a) as unknown as { id: string; tipo: string; data_hora: string; descricao: string; aceite: string; executado_por: string | null; unidade: RawUn | null; servico: { nome: string } | null; chamado: { numero: number } | null }[])
      linhas.push({ chave: `a${x.id}`, quando: x.data_hora, origem: 'Atendimento', unidadeId: x.unidade?.id ?? '', unidade: x.unidade?.nome ?? '—', cliente: x.unidade?.cliente?.nome ?? '', titulo: x.descricao, detalhe: [x.tipo, x.servico?.nome, x.chamado ? `chamado #${x.chamado.numero}` : null, x.executado_por].filter(Boolean).join(' · '), situacao: x.aceite === 'Pendente' ? 'aceite pendente' : x.aceite === 'Aceito' ? 'aceito' : 'recusado', tom: x.aceite === 'Aceito' ? 'ok' : x.aceite === 'Recusado' ? 'bad' : 'warn' })
    return linhas.sort((p, q) => q.quando.localeCompare(p.quando))
  })
  const [unidade, setUnidade] = useState('')
  const [origem, setOrigem] = useState('')
  const [periodo, setPeriodo] = useState('90')
  const [busca, setBusca] = useState('')
  const unidades = useMemo(() => [...new Map((data ?? []).map((l) => [l.unidadeId, l.unidade])).entries()].filter(([v]) => v).map(([v, l]) => ({ v, l })).sort((a, b) => a.l.localeCompare(b.l)), [data])
  const corte = periodo ? new Date(Date.now() - Number(periodo) * 86400000).toISOString() : ''
  const lista = (data ?? []).filter((l) => (!unidade || l.unidadeId === unidade) && (!origem || l.origem === origem) && (!corte || l.quando >= corte) && (!busca || `${l.titulo} ${l.detalhe} ${l.unidade}`.toLowerCase().includes(busca.toLowerCase())))

  return (
    <>
      <PageHead title="Histórico de ocorrências" sub="Linha do tempo de chamados e atendimentos de todas as unidades." />
      <div className="toolbar">
        <input placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Select value={unidade} onChange={(e) => setUnidade(e.target.value)} placeholder="Todas as unidades" options={unidades} />
        <Select value={origem} onChange={(e) => setOrigem(e.target.value)} placeholder="Chamados e atendimentos" options={['Chamado', 'Atendimento']} />
        <Select value={periodo} onChange={(e) => setPeriodo(e.target.value)} placeholder="Todo o período" options={[{ v: '30', l: 'Últimos 30 dias' }, { v: '90', l: 'Últimos 90 dias' }, { v: '365', l: 'Último ano' }]} />
      </div>
      {loading && !data ? <Loading error={error} /> : lista.length === 0 ? <Empty>Nenhuma ocorrência no período.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Quando</th><th>Tipo</th><th>Unidade</th><th>Ocorrência</th><th>Situação</th></tr></thead>
            <tbody>
              {lista.map((l) => (
                <tr key={l.chave}>
                  <td className="mono">{fdatetime(l.quando)}</td>
                  <td><Badge tone={l.origem === 'Chamado' ? 'bronze' : 'neutral'}>{l.origem}</Badge></td>
                  <td>{l.unidade}<div className="muted">{l.cliente}</div></td>
                  <td>{l.to ? <Link to={l.to}>{l.titulo}</Link> : l.titulo}<div className="muted">{l.detalhe}</div></td>
                  <td><Badge tone={l.tom}>{l.situacao}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
