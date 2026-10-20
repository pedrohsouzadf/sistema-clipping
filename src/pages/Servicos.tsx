import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { useCadastros } from '../lib/cadastros'
import { fdate, money, nullIfEmpty } from '../lib/format'
import { alertaGarantia, alertaPlano, tomStatusChamado } from '../lib/facilities'
import { CATEGORIAS_SERVICO, STATUS_SERVICO, type Chamado, type Dependencia, type Garantia, type Plano, type Servico } from '../lib/types'
import { Badge, Confirm, Empty, Field, Loading, Modal, PageHead, Select, useAct } from '../components/ui'
import ServicoForm from '../components/ServicoForm'
import ChamadoForm from '../components/ChamadoForm'
import PlanoForm from '../components/PlanoForm'
import GarantiaForm from '../components/GarantiaForm'
import AtendimentoForm from '../components/AtendimentoForm'
import AtendimentosLista from '../components/AtendimentosLista'
import Historico from '../components/Historico'

const SELECT = '*, unidade:unidades!unidade_id(id,nome,cliente:organizacoes!cliente_id(nome)), fornecedor:organizacoes!fornecedor_id(id,nome), responsavel:profiles!responsavel_id(nome), contrato:contratos!contrato_id(id,titulo)'
const tomStatus = (s: string) => (s === 'Ativo' ? 'ok' : s === 'Suspenso' ? 'warn' : 'neutral')
const ctrlCurto = (c: Servico['controle']) => (c === 'Clip executa' ? 'Clip executa' : c === 'Clip gerencia fornecedor' ? 'Clip gerencia' : 'Terceiro controla')

export default function Servicos() {
  const [params, setParams] = useSearchParams()
  const { data, loading, error, reload } = useAsync(async () => unwrap(await supabase.from('servicos_unidade').select(SELECT).order('nome')) as unknown as Servico[])
  const [q, setQ] = useState('')
  const [unidade, setUnidade] = useState(params.get('unidade') ?? '')
  const [categoria, setCategoria] = useState('')
  const [status, setStatus] = useState('Ativo')
  const [fornecedor, setFornecedor] = useState('')
  const [edit, setEdit] = useState<Servico | 'novo' | null>(null)
  const ver = useMemo(() => (data ?? []).find((s) => s.id === params.get('id')) ?? null, [data, params])
  const unidades = useMemo(() => [...new Map((data ?? []).map((s) => [s.unidade_id, s.unidade?.nome ?? ''])).entries()].map(([v, l]) => ({ v, l })).sort((a, b) => a.l.localeCompare(b.l)), [data])
  const fornecedores = useMemo(() => [...new Map((data ?? []).filter((s) => s.fornecedor).map((s) => [s.fornecedor_id as string, s.fornecedor?.nome ?? ''])).entries()].map(([v, l]) => ({ v, l })).sort((a, b) => a.l.localeCompare(b.l)), [data])

  const lista = useMemo(
    () =>
      (data ?? []).filter(
        (s) =>
          (!q || `${s.nome} ${s.unidade?.nome ?? ''} ${s.fornecedor?.nome ?? ''} ${s.categoria ?? ''}`.toLowerCase().includes(q.toLowerCase())) &&
          (!unidade || s.unidade_id === unidade) && (!categoria || s.categoria === categoria) && (!status || s.status === status) && (!fornecedor || s.fornecedor_id === fornecedor),
      ),
    [data, q, unidade, categoria, status, fornecedor],
  )
  const custoTotal = lista.filter((s) => s.status === 'Ativo').reduce((t, s) => t + Number(s.custo_mensal ?? 0), 0)
  const semCusto = lista.filter((s) => s.status === 'Ativo' && s.custo_mensal == null).length

  return (
    <>
      <PageHead title="Serviços por unidade" sub="O que está contratado em cada unidade: frequência, fornecedor, responsável, SLA, custo mensal e como verificar se foi cumprido." actions={<button className="btn btn-primary" onClick={() => setEdit('novo')}>+ Novo serviço</button>} />
      <div className="kpis">
        <div className="kpi"><b>{lista.filter((s) => s.status === 'Ativo').length}</b><span>serviços ativos na lista</span></div>
        <div className="kpi kpi-money" title="Soma do custo mensal dos serviços ativos da lista, sem somar receita."><b>{money(custoTotal)}</b><span>custo mensal dos serviços{semCusto ? ` (${semCusto} sem custo informado)` : ''}</span></div>
      </div>
      <div className="toolbar">
        <input placeholder="Buscar por serviço, unidade ou fornecedor…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={unidade} onChange={(e) => setUnidade(e.target.value)} placeholder="Todas as unidades" options={unidades} />
        <Select value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Todas as categorias" options={CATEGORIAS_SERVICO} />
        <Select value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} placeholder="Todos os fornecedores" options={fornecedores} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Todos os status" options={STATUS_SERVICO} />
      </div>

      {loading && !data ? <Loading error={error} /> : lista.length === 0 ? <Empty>Nenhum serviço encontrado. Cadastre os serviços contratados de cada unidade.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Serviço</th><th>Unidade</th><th>Frequência</th><th>Fornecedor</th><th>Responsável</th><th>Controle</th><th>SLA</th><th>Custo mensal</th><th>Status</th></tr></thead>
            <tbody>
              {lista.map((s) => (
                <tr key={s.id} className="clickable" onClick={() => setParams({ id: s.id })}>
                  <td><b>{s.nome}</b>{s.categoria && <div className="muted">{s.categoria}</div>}</td>
                  <td>{s.unidade?.nome ?? '—'}<div className="muted">{s.unidade?.cliente?.nome}</div></td>
                  <td>{s.frequencia}</td>
                  <td>{s.fornecedor?.nome ?? <span className="muted">—</span>}</td>
                  <td>{s.responsavel?.nome ?? <span className="muted">—</span>}</td>
                  <td><Badge tone={s.controle === 'Terceiro controla' ? 'bronze' : 'neutral'}>{ctrlCurto(s.controle)}</Badge></td>
                  <td>{s.sla_resposta_horas || s.sla_solucao_horas ? <span title={s.clip_garante_sla ? 'SLA garantido pela Clip' : 'SLA de referência: a Clip não garante'}>{s.sla_resposta_horas ?? '—'}h / {s.sla_solucao_horas ?? '—'}h{!s.clip_garante_sla && <span className="muted"> (ref.)</span>}</span> : <span className="muted">—</span>}</td>
                  <td className="mono">{money(s.custo_mensal)}</td>
                  <td><Badge tone={tomStatus(s.status)}>{s.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {edit && <ServicoForm servico={edit === 'novo' ? null : edit} defaultUnidadeId={unidade || undefined} onClose={() => setEdit(null)} onSaved={(s) => { setEdit(null); reload(); setParams({ id: s.id }) }} />}
      {ver && !edit && <ServicoDetalhe servico={ver} onClose={() => setParams({}, { replace: true })} onEdit={() => setEdit(ver)} onDeleted={() => { setParams({}, { replace: true }); reload() }} />}
    </>
  )
}

function Linha({ rotulo, texto }: { rotulo: string; texto: string | null | undefined }) {
  if (!texto) return null
  return (<><dt>{rotulo}</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{texto}</dd></>)
}

function ServicoDetalhe({ servico: s, onClose, onEdit, onDeleted }: { servico: Servico; onClose: () => void; onEdit: () => void; onDeleted: () => void }) {
  const { isGestor } = useAuth()
  const act = useAct()
  const cad = useCadastros()
  const [confirmDel, setConfirmDel] = useState(false)
  const [dep, setDep] = useState<{ terceiro_id: string; terceiro_nome: string; descricao: string; impacto: string; contato: string } | null>(null)
  const [atender, setAtender] = useState(false)
  const [chamado, setChamado] = useState(false)
  const [plano, setPlano] = useState(false)
  const [garantia, setGarantia] = useState(false)
  const [tick, setTick] = useState(0)
  const rel = useAsync(async () => {
    const [d, c, p, g] = await Promise.all([
      supabase.from('servico_dependencias').select('*, terceiro:organizacoes!terceiro_id(id,nome)').eq('servico_id', s.id).order('created_at'),
      supabase.from('chamados').select('id,numero,titulo,status,criticidade,aberto_em').eq('servico_id', s.id).order('aberto_em', { ascending: false }).limit(15),
      supabase.from('planos_manutencao').select('id,titulo,tipo,frequencia,proxima_data,ativo').eq('servico_id', s.id).order('proxima_data'),
      supabase.from('garantias_vencimentos').select('id,descricao,tipo,data_vencimento,aviso_dias,status').eq('servico_id', s.id).order('data_vencimento'),
    ])
    return {
      deps: unwrap(d) as unknown as Dependencia[], chamados: unwrap(c) as unknown as Pick<Chamado, 'id' | 'numero' | 'titulo' | 'status' | 'criticidade' | 'aberto_em'>[],
      planos: unwrap(p) as unknown as Pick<Plano, 'id' | 'titulo' | 'tipo' | 'frequencia' | 'proxima_data' | 'ativo'>[], garantias: unwrap(g) as unknown as Pick<Garantia, 'id' | 'descricao' | 'tipo' | 'data_vencimento' | 'aviso_dias' | 'status'>[],
    }
  }, [s.id, tick])

  async function addDep() {
    if (!dep) return
    const ok = await act(async () => unwrap(await supabase.from('servico_dependencias').insert({ servico_id: s.id, terceiro_id: nullIfEmpty(dep.terceiro_id), terceiro_nome: nullIfEmpty(dep.terceiro_nome), descricao: dep.descricao.trim(), impacto: nullIfEmpty(dep.impacto), contato: nullIfEmpty(dep.contato) }).select()), 'Dependência registrada')
    if (ok) { setDep(null); rel.reload() }
  }
  async function delDep(id: string) {
    const ok = await act(async () => unwrap(await supabase.from('servico_dependencias').delete().eq('id', id).select()), 'Dependência removida')
    if (ok) rel.reload()
  }

  return (
    <Modal title={s.nome} onClose={onClose} wide footer={<>{isGestor && <button className="btn btn-danger" onClick={() => setConfirmDel(true)}>Excluir</button>}<button className="btn" onClick={onClose}>Fechar</button><button className="btn btn-primary" onClick={onEdit}>Editar</button></>}>
      <div className="chips">
        <Badge tone={tomStatus(s.status)}>{s.status}</Badge>
        {s.categoria && <Badge tone="bronze">{s.categoria}</Badge>}
        <Badge tone="neutral">{s.frequencia}</Badge>
        <Badge tone={s.controle === 'Terceiro controla' ? 'bronze' : 'neutral'}>{s.controle}</Badge>
      </div>
      {!s.clip_garante_sla && (s.sla_resposta_horas || s.sla_solucao_horas) && <div className="alert alert-info" style={{ marginTop: 8 }}>O SLA abaixo é só referência: a Clip não garante este prazo ao cliente.</div>}
      <dl className="dl">
        <dt>Unidade</dt><dd><Link to={`/unidades?id=${s.unidade_id}`}>{s.unidade?.nome}</Link>{s.unidade?.cliente?.nome ? <span className="muted"> · {s.unidade.cliente.nome}</span> : null}</dd>
        <Linha rotulo="O que inclui" texto={s.descricao} />
        <dt>Fornecedor</dt><dd>{s.fornecedor?.nome ?? '—'}</dd>
        <dt>Responsável na Clip</dt><dd>{s.responsavel?.nome ?? '—'}</dd>
        {s.contrato && <><dt>Contrato</dt><dd><Link to={`/contratos?id=${s.contrato.id}`}>{s.contrato.titulo}</Link></dd></>}
        <dt>Custo mensal</dt><dd>{money(s.custo_mensal)}</dd>
        <dt>SLA</dt><dd>{[s.sla_resposta_horas ? `resposta em ${s.sla_resposta_horas} h` : null, s.sla_solucao_horas ? `solução em ${s.sla_solucao_horas} h` : null].filter(Boolean).join(' · ') || '—'}</dd>
        <Linha rotulo="Horário de atendimento" texto={s.horario_atendimento} />
        <Linha rotulo="Regras de atendimento" texto={s.regras_atendimento} />
        <Linha rotulo="Como verificar o cumprimento" texto={s.forma_verificacao} />
        <dt>Vigência</dt><dd>{s.data_inicio || s.data_fim ? `${fdate(s.data_inicio)} a ${fdate(s.data_fim)}` : '—'}</dd>
        <Linha rotulo="Observações" texto={s.observacoes} />
      </dl>

      <h3>Dependências de terceiros</h3>
      {rel.loading && !rel.data ? <Loading error={rel.error} /> : rel.data && rel.data.deps.length === 0 ? <p className="muted">Nenhuma dependência registrada.</p> : (
        <ul className="plain">
          {rel.data?.deps.map((d) => (
            <li key={d.id}>
              <b>{d.terceiro?.nome ?? d.terceiro_nome}</b> <span className="muted">· {d.descricao}{d.impacto ? ` · se falhar: ${d.impacto}` : ''}{d.contato ? ` · contato: ${d.contato}` : ''}</span>{' '}
              <button className="icon-btn" aria-label="Remover dependência" onClick={() => delDep(d.id)}>×</button>
            </li>
          ))}
        </ul>
      )}
      {dep ? (
        <div className="grid" style={{ marginTop: 8 }}>
          <Field label="Terceiro cadastrado"><Select value={dep.terceiro_id} onChange={(e) => setDep({ ...dep, terceiro_id: e.target.value })} options={cad.terceiros} /></Field>
          <Field label="ou nome do terceiro"><input value={dep.terceiro_nome} onChange={(e) => setDep({ ...dep, terceiro_nome: e.target.value })} /></Field>
          <Field label="Do que depende *"><input value={dep.descricao} onChange={(e) => setDep({ ...dep, descricao: e.target.value })} placeholder="Ex.: link da operadora" /></Field>
          <Field label="Se falhar" span={2}><input value={dep.impacto} onChange={(e) => setDep({ ...dep, impacto: e.target.value })} /></Field>
          <Field label="Como acionar"><input value={dep.contato} onChange={(e) => setDep({ ...dep, contato: e.target.value })} /></Field>
          <div className="span-3" style={{ display: 'flex', gap: 8 }}><button className="btn btn-primary" disabled={!dep.descricao.trim() || (!dep.terceiro_id && !dep.terceiro_nome.trim())} onClick={addDep}>Registrar</button><button className="btn" onClick={() => setDep(null)}>Cancelar</button></div>
        </div>
      ) : <button className="btn" onClick={() => setDep({ terceiro_id: '', terceiro_nome: '', descricao: '', impacto: '', contato: '' })}>+ Dependência de terceiro</button>}

      <h3>Atendimentos e aceite</h3>
      <button className="btn" onClick={() => setAtender(true)}>+ Registrar atendimento</button>
      <AtendimentosLista filtro={{ servico_id: s.id }} refresh={tick} />

      <h3>Chamados</h3>
      {rel.data && rel.data.chamados.length === 0 ? <p className="muted">Nenhum chamado deste serviço.</p> : (
        <ul className="plain">
          {rel.data?.chamados.map((c) => (<li key={c.id}><Link to={`/chamados?id=${c.id}`}>#{c.numero} {c.titulo}</Link> <Badge tone={tomStatusChamado(c.status)}>{c.status}</Badge></li>))}
        </ul>
      )}
      <button className="btn" onClick={() => setChamado(true)}>+ Abrir chamado</button>

      <h3>Manutenção e inspeções</h3>
      {rel.data && rel.data.planos.length === 0 ? <p className="muted">Nenhum plano ligado a este serviço.</p> : (
        <ul className="plain">
          {rel.data?.planos.map((p) => { const a = alertaPlano(p); return (<li key={p.id}>{p.titulo} <span className="muted">· {p.tipo} · {p.frequencia} · próxima {fdate(p.proxima_data)}</span> {a && <Badge tone={a.tom}>{a.texto}</Badge>}</li>) })}
        </ul>
      )}
      <button className="btn" onClick={() => setPlano(true)}>+ Plano de manutenção</button>

      <h3>Garantias e vencimentos</h3>
      {rel.data && rel.data.garantias.length === 0 ? <p className="muted">Nenhuma garantia registrada.</p> : (
        <ul className="plain">
          {rel.data?.garantias.map((g) => { const a = alertaGarantia(g); return (<li key={g.id}>{g.descricao} <span className="muted">· {g.tipo} · vence {fdate(g.data_vencimento)} · {g.status}</span> {a && <Badge tone={a.tom}>{a.texto}</Badge>}</li>) })}
        </ul>
      )}
      <button className="btn" onClick={() => setGarantia(true)}>+ Garantia ou vencimento</button>

      <h3>Histórico de alterações</h3>
      <Historico coluna="registro_id" id={s.id} />

      {atender && <AtendimentoForm unidadeId={s.unidade_id} servicoId={s.id} onClose={() => setAtender(false)} onSaved={() => { setAtender(false); setTick((t) => t + 1) }} />}
      {chamado && <ChamadoForm defaultUnidadeId={s.unidade_id} defaultServicoId={s.id} onClose={() => setChamado(false)} onSaved={() => { setChamado(false); setTick((t) => t + 1) }} />}
      {plano && <PlanoForm defaultUnidadeId={s.unidade_id} defaultServicoId={s.id} onClose={() => setPlano(false)} onSaved={() => { setPlano(false); setTick((t) => t + 1) }} />}
      {garantia && <GarantiaForm defaultUnidadeId={s.unidade_id} defaultServicoId={s.id} onClose={() => setGarantia(false)} onSaved={() => { setGarantia(false); setTick((t) => t + 1) }} />}
      {confirmDel && (
        <Confirm title="Excluir serviço" message={`Excluir “${s.nome}”? As dependências somem; chamados, planos e garantias ficam, sem o vínculo com o serviço.`} confirmLabel="Excluir" onCancel={() => setConfirmDel(false)} onConfirm={async () => {
          setConfirmDel(false)
          const ok = await act(async () => { const rows = unwrap(await supabase.from('servicos_unidade').delete().eq('id', s.id).select()) as unknown[]; if (rows.length === 0) throw new Error('Somente o gestor pode excluir serviços.') }, 'Serviço excluído')
          if (ok) onDeleted()
        }} />
      )}
    </Modal>
  )
}
