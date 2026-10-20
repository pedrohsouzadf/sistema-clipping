import { useMemo, useState } from 'react'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { fdate, nullIfEmpty, todayISO } from '../lib/format'
import { alertaPlano } from '../lib/facilities'
import { TIPOS_PLANO, type Plano } from '../lib/types'
import { Badge, Empty, Field, Loading, Modal, PageHead, Select, useAct } from '../components/ui'
import PlanoForm from '../components/PlanoForm'

const SELECT = '*, unidade:unidades!unidade_id(id,nome,cliente:organizacoes!cliente_id(nome)), servico:servicos_unidade!servico_id(id,nome), fornecedor:organizacoes!fornecedor_id(id,nome), responsavel:profiles!responsavel_id(nome)'

export default function Manutencao() {
  const { data, loading, error, reload } = useAsync(async () => unwrap(await supabase.from('planos_manutencao').select(SELECT).order('proxima_data')) as unknown as Plano[])
  const [q, setQ] = useState('')
  const [unidade, setUnidade] = useState('')
  const [tipo, setTipo] = useState('')
  const [situacao, setSituacao] = useState('ativos')
  const [edit, setEdit] = useState<Plano | 'novo' | null>(null)
  const [exec, setExec] = useState<Plano | null>(null)
  const unidades = useMemo(() => [...new Map((data ?? []).map((p) => [p.unidade_id, p.unidade?.nome ?? ''])).entries()].map(([v, l]) => ({ v, l })).sort((a, b) => a.l.localeCompare(b.l)), [data])

  const ativos = (data ?? []).filter((p) => p.ativo)
  const atrasados = ativos.filter((p) => alertaPlano(p)?.tom === 'bad')
  const proximos = ativos.filter((p) => alertaPlano(p)?.tom === 'warn')
  const lista = useMemo(
    () =>
      (data ?? []).filter(
        (p) =>
          (!q || `${p.titulo} ${p.unidade?.nome ?? ''} ${p.ativo_equipamento ?? ''} ${p.fornecedor?.nome ?? ''}`.toLowerCase().includes(q.toLowerCase())) &&
          (!unidade || p.unidade_id === unidade) && (!tipo || p.tipo === tipo) &&
          (situacao === 'ativos' ? p.ativo : situacao === 'atrasados' ? alertaPlano(p)?.tom === 'bad' : situacao === 'proximos' ? alertaPlano(p)?.tom === 'warn' : situacao === 'inativos' ? !p.ativo : true),
      ),
    [data, q, unidade, tipo, situacao],
  )

  return (
    <>
      <PageHead title="Manutenção e inspeções" sub="Agenda dos planos preventivos e das inspeções. Ao registrar a execução, a próxima data é calculada pela frequência." actions={<button className="btn btn-primary" onClick={() => setEdit('novo')}>+ Novo plano</button>} />
      <div className="kpis">
        <div className="kpi"><b style={atrasados.length ? { color: 'var(--bad)' } : undefined}>{atrasados.length}</b><span>atrasadas</span></div>
        <div className="kpi"><b>{proximos.length}</b><span>hoje ou nos próximos 7 dias</span></div>
        <div className="kpi"><b>{ativos.length}</b><span>planos ativos</span></div>
      </div>
      <div className="toolbar">
        <input placeholder="Buscar por plano, unidade, equipamento ou fornecedor…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={unidade} onChange={(e) => setUnidade(e.target.value)} placeholder="Todas as unidades" options={unidades} />
        <Select value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Todos os tipos" options={TIPOS_PLANO} />
        <Select value={situacao} onChange={(e) => setSituacao(e.target.value)} placeholder="Todos" options={[{ v: 'ativos', l: 'Ativos' }, { v: 'atrasados', l: 'Atrasados' }, { v: 'proximos', l: 'Próximos 7 dias' }, { v: 'inativos', l: 'Inativos' }]} />
      </div>

      {loading && !data ? <Loading error={error} /> : lista.length === 0 ? <Empty>Nenhum plano encontrado. Cadastre a manutenção preventiva e as inspeções de cada unidade.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Próxima</th><th>Plano</th><th>Unidade</th><th>Frequência</th><th>Última execução</th><th>Responsável</th><th /></tr></thead>
            <tbody>
              {lista.map((p) => {
                const a = alertaPlano(p)
                return (
                  <tr key={p.id} className="clickable" onClick={() => setEdit(p)}>
                    <td className="mono">{fdate(p.proxima_data)} {a && <Badge tone={a.tom}>{a.texto}</Badge>}{!p.ativo && <Badge tone="neutral">inativo</Badge>}</td>
                    <td><b>{p.titulo}</b><div className="muted">{[p.tipo, p.ativo_equipamento, p.servico?.nome].filter(Boolean).join(' · ')}</div></td>
                    <td>{p.unidade?.nome ?? '—'}<div className="muted">{p.unidade?.cliente?.nome}</div></td>
                    <td>{p.frequencia}</td>
                    <td className="mono">{p.ultima_data ? fdate(p.ultima_data) : <span className="muted">nunca</span>}</td>
                    <td>{[p.responsavel?.nome, p.fornecedor?.nome].filter(Boolean).join(' · ') || <span className="muted">—</span>}</td>
                    <td style={{ width: 150 }}>{p.ativo && <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setExec(p) }}>Registrar execução</button>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {edit && <PlanoForm plano={edit === 'novo' ? null : edit} defaultUnidadeId={unidade || undefined} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
      {exec && <ExecucaoForm plano={exec} onClose={() => setExec(null)} onSaved={() => { setExec(null); reload() }} />}
    </>
  )
}

function ExecucaoForm({ plano: p, onClose, onSaved }: { plano: Plano; onClose: () => void; onSaved: () => void }) {
  const act = useAct()
  const [d, setD] = useState({ data: todayISO(), descricao: '', conforme: '', executado_por: '' })
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }))

  async function salvar() {
    setBusy(true)
    const ok = await act(async () => unwrap(await supabase.rpc('registrar_execucao_plano', { p_plano: p.id, p_data: d.data, p_descricao: nullIfEmpty(d.descricao), p_conforme: d.conforme === '' ? null : d.conforme === 'sim', p_executado_por: nullIfEmpty(d.executado_por) })), 'Execução registrada e próxima data agendada')
    setBusy(false)
    if (ok) onSaved()
  }
  return (
    <Modal title="Registrar execução" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={salvar} disabled={busy || !d.data}>Registrar</button></>}>
      <p><b>{p.titulo}</b> <span className="muted">· {p.unidade?.nome} · {p.frequencia}</span></p>
      <div className="grid">
        <Field label="Data da execução"><input type="date" value={d.data} onChange={(e) => set('data', e.target.value)} /></Field>
        <Field label="Quem executou" span={2}><input value={d.executado_por} onChange={(e) => set('executado_por', e.target.value)} /></Field>
        <Field label="Resultado / observações" span={3}><textarea rows={3} value={d.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder="O que foi verificado ou feito" /></Field>
        <Field label="Tudo conforme?"><Select value={d.conforme} onChange={(e) => set('conforme', e.target.value)} options={[{ v: 'sim', l: 'Sim' }, { v: 'nao', l: 'Não, houve problema' }]} placeholder="Não se aplica" /></Field>
      </div>
      {p.checklist && <><h3>Checklist do plano</h3><p style={{ whiteSpace: 'pre-wrap' }}>{p.checklist}</p></>}
    </Modal>
  )
}
