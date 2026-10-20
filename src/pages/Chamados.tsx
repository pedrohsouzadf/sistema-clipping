import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { fdatetime, money } from '../lib/format'
import { chamadoAberto, slaChamado, tomCriticidade, tomStatusChamado } from '../lib/facilities'
import { CRITICIDADES, STATUS_CHAMADO, TIPOS_CHAMADO, type Chamado } from '../lib/types'
import { Badge, Confirm, Empty, Field, Loading, Modal, PageHead, Select, useAct } from '../components/ui'
import ChamadoForm from '../components/ChamadoForm'
import AtendimentoForm from '../components/AtendimentoForm'
import AtendimentosLista from '../components/AtendimentosLista'
import Historico from '../components/Historico'

const SELECT = '*, unidade:unidades!unidade_id(id,nome,cliente:organizacoes!cliente_id(nome)), servico:servicos_unidade!servico_id(id,nome,clip_garante_sla,controle,sla_resposta_horas,sla_solucao_horas,horario_atendimento), fornecedor:organizacoes!fornecedor_id(id,nome), responsavel:profiles!responsavel_id(nome)'
const ORDEM: Record<string, number> = { Crítica: 0, Alta: 1, Média: 2, Baixa: 3 }

export default function Chamados() {
  const [params, setParams] = useSearchParams()
  const { data, loading, error, reload } = useAsync(async () => unwrap(await supabase.from('chamados').select(SELECT).order('aberto_em', { ascending: false }).limit(500)) as unknown as Chamado[])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('abertos')
  const [tipo, setTipo] = useState('')
  const [crit, setCrit] = useState('')
  const [unidade, setUnidade] = useState(params.get('unidade') ?? '')
  const [novo, setNovo] = useState(false)
  const [edit, setEdit] = useState<Chamado | null>(null)
  const ver = useMemo(() => (data ?? []).find((c) => c.id === params.get('id')) ?? null, [data, params])
  const unidades = useMemo(() => [...new Map((data ?? []).map((c) => [c.unidade_id, c.unidade?.nome ?? ''])).entries()].map(([v, l]) => ({ v, l })).sort((a, b) => a.l.localeCompare(b.l)), [data])

  const abertos = (data ?? []).filter(chamadoAberto)
  const estourados = abertos.filter((c) => slaChamado(c)?.estourado)
  const lista = useMemo(
    () =>
      (data ?? [])
        .filter(
          (c) =>
            (!q || `${c.numero} ${c.titulo} ${c.unidade?.nome ?? ''} ${c.servico?.nome ?? ''} ${c.solicitante ?? ''}`.toLowerCase().includes(q.toLowerCase())) &&
            (status === 'abertos' ? chamadoAberto(c) : !status || c.status === status) &&
            (!tipo || c.tipo === tipo) && (!crit || c.criticidade === crit) && (!unidade || c.unidade_id === unidade),
        )
        .sort((a, b) => (chamadoAberto(a) === chamadoAberto(b) ? ORDEM[a.criticidade] - ORDEM[b.criticidade] || a.aberto_em.localeCompare(b.aberto_em) : chamadoAberto(a) ? -1 : 1)),
    [data, q, status, tipo, crit, unidade],
  )

  return (
    <>
      <PageHead title="Chamados" sub="Incidentes, solicitações e manutenção corretiva das unidades em operação." actions={<button className="btn btn-primary" onClick={() => setNovo(true)}>+ Novo chamado</button>} />
      <div className="kpis">
        <div className="kpi"><b>{abertos.length}</b><span>chamados em aberto</span></div>
        <div className="kpi"><b style={estourados.length ? { color: 'var(--bad)' } : undefined}>{estourados.length}</b><span>com SLA vencido</span></div>
        <div className="kpi"><b>{abertos.filter((c) => c.status === 'Aguardando terceiro').length}</b><span>aguardando terceiro</span></div>
        <div className="kpi"><b>{abertos.filter((c) => c.criticidade === 'Crítica').length}</b><span>críticos em aberto</span></div>
      </div>
      <div className="toolbar">
        <input placeholder="Buscar por número, título, unidade ou serviço…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Todos os status" options={[{ v: 'abertos', l: 'Em aberto' }, ...STATUS_CHAMADO.map((s) => ({ v: s, l: s }))]} />
        <Select value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Todos os tipos" options={TIPOS_CHAMADO} />
        <Select value={crit} onChange={(e) => setCrit(e.target.value)} placeholder="Toda prioridade" options={CRITICIDADES} />
        <Select value={unidade} onChange={(e) => setUnidade(e.target.value)} placeholder="Todas as unidades" options={unidades} />
      </div>

      {loading && !data ? <Loading error={error} /> : lista.length === 0 ? <Empty>{status === 'abertos' ? 'Nenhum chamado em aberto.' : 'Nenhum chamado encontrado.'}</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Chamado</th><th>Unidade</th><th>Prioridade</th><th>Status</th><th>Responsável</th><th>Aberto em</th><th>Prazo</th></tr></thead>
            <tbody>
              {lista.map((c) => {
                const sla = slaChamado(c)
                return (
                  <tr key={c.id} className="clickable" onClick={() => setParams({ id: c.id })}>
                    <td className="mono">{c.numero}</td>
                    <td><b>{c.titulo}</b><div className="muted">{[c.tipo, c.servico?.nome].filter(Boolean).join(' · ')}</div></td>
                    <td>{c.unidade?.nome ?? '—'}<div className="muted">{c.unidade?.cliente?.nome}</div></td>
                    <td><Badge tone={tomCriticidade(c.criticidade)}>{c.criticidade}</Badge></td>
                    <td><Badge tone={tomStatusChamado(c.status)}>{c.status}</Badge></td>
                    <td>{c.responsavel?.nome ?? <span className="muted">—</span>}</td>
                    <td className="mono">{fdatetime(c.aberto_em)}</td>
                    <td>{sla ? <Badge tone={sla.tom}>{sla.texto}</Badge> : <span className="muted">sem SLA</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {novo && <ChamadoForm defaultUnidadeId={unidade || undefined} onClose={() => setNovo(false)} onSaved={(c) => { setNovo(false); reload(); setStatus('abertos'); setParams({ id: c.id }) }} />}
      {edit && <ChamadoForm chamado={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
      {ver && !edit && <ChamadoDetalhe chamado={ver} onClose={() => setParams({}, { replace: true })} onEdit={() => setEdit(ver)} onChanged={reload} onDeleted={() => { setParams({}, { replace: true }); reload() }} />}
    </>
  )
}

function ChamadoDetalhe({ chamado: c, onClose, onEdit, onChanged, onDeleted }: { chamado: Chamado; onClose: () => void; onEdit: () => void; onChanged: () => void; onDeleted: () => void }) {
  const { isGestor } = useAuth()
  const act = useAct()
  const [acao, setAcao] = useState<'aguardando' | 'resolver' | 'cancelar' | null>(null)
  const [texto, setTexto] = useState('')
  const [custo, setCusto] = useState('')
  const [atender, setAtender] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [tick, setTick] = useState(0)
  const sla = slaChamado(c)
  const aberto = chamadoAberto(c)

  async function mudar(patch: Record<string, unknown>, msg: string) {
    const ok = await act(async () => unwrap(await supabase.from('chamados').update(patch).eq('id', c.id).select()), msg)
    if (ok) { setAcao(null); setTexto(''); setCusto(''); onChanged() }
    return ok
  }

  return (
    <Modal
      title={`#${c.numero} · ${c.titulo}`}
      onClose={onClose}
      wide
      footer={
        <>
          {isGestor && <button className="btn btn-danger" onClick={() => setConfirmDel(true)}>Excluir</button>}
          <button className="btn" onClick={onClose}>Fechar</button>
          <button className="btn" onClick={onEdit}>Editar</button>
        </>
      }
    >
      <div className="chips">
        <Badge tone={tomStatusChamado(c.status)}>{c.status}</Badge>
        <Badge tone={tomCriticidade(c.criticidade)}>{c.criticidade}</Badge>
        <Badge tone="bronze">{c.tipo}</Badge>
        {sla && <Badge tone={sla.tom}>{sla.texto}</Badge>}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0 4px' }}>
        {c.status === 'Aberto' && <button className="btn btn-primary" onClick={() => mudar({ status: 'Em atendimento' }, 'Atendimento iniciado')}>Iniciar atendimento</button>}
        {c.status === 'Aguardando terceiro' && <button className="btn btn-primary" onClick={() => mudar({ status: 'Em atendimento', aguardando: null }, 'Atendimento retomado')}>Retomar atendimento</button>}
        {(c.status === 'Aberto' || c.status === 'Em atendimento') && <button className="btn" onClick={() => { setTexto(c.aguardando ?? ''); setAcao('aguardando') }}>Aguardando terceiro</button>}
        {aberto && <button className="btn" onClick={() => { setTexto(c.solucao ?? ''); setCusto(c.custo != null ? String(c.custo) : ''); setAcao('resolver') }}>Resolver</button>}
        {c.status === 'Resolvido' && <button className="btn btn-primary" onClick={() => mudar({ status: 'Fechado' }, 'Chamado fechado')}>Fechar chamado</button>}
        {(c.status === 'Resolvido' || c.status === 'Fechado' || c.status === 'Cancelado') && <button className="btn" onClick={() => mudar({ status: 'Em atendimento' }, 'Chamado reaberto')}>Reabrir</button>}
        {aberto && <button className="btn" onClick={() => setAcao('cancelar')}>Cancelar chamado</button>}
      </div>

      <dl className="dl">
        <dt>Unidade</dt><dd><Link to={`/unidades?id=${c.unidade_id}`}>{c.unidade?.nome}</Link>{c.unidade?.cliente?.nome ? <span className="muted"> · {c.unidade.cliente.nome}</span> : null}</dd>
        {c.servico && <><dt>Serviço</dt><dd><Link to={`/servicos?id=${c.servico.id}`}>{c.servico.nome}</Link>
          {c.servico.horario_atendimento && <span className="muted"> · {c.servico.horario_atendimento}</span>}
          {!c.servico.clip_garante_sla && <div className="muted">A Clip não garante o SLA deste serviço ({c.servico.controle.toLowerCase()}): os prazos são só referência.</div>}</dd></>}
        <dt>Quem pediu</dt><dd>{c.solicitante ?? '—'}</dd>
        <dt>Responsável / fornecedor</dt><dd>{[c.responsavel?.nome, c.fornecedor?.nome].filter(Boolean).join(' · ') || '—'}</dd>
        <dt>Aberto em</dt><dd className="mono">{fdatetime(c.aberto_em)}</dd>
        <dt>Prazo de resposta</dt><dd className="mono">{c.prazo_resposta ? fdatetime(c.prazo_resposta) : '—'}{c.respondido_em ? ` · respondido ${fdatetime(c.respondido_em)}` : ''}</dd>
        <dt>Prazo de solução</dt><dd className="mono">{c.prazo_solucao ? fdatetime(c.prazo_solucao) : '—'}{c.resolvido_em ? ` · resolvido ${fdatetime(c.resolvido_em)}` : ''}</dd>
        {c.fechado_em && <><dt>Fechado em</dt><dd className="mono">{fdatetime(c.fechado_em)}</dd></>}
        {c.descricao && <><dt>Descrição</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{c.descricao}</dd></>}
        {c.aguardando && c.status === 'Aguardando terceiro' && <><dt>Aguardando</dt><dd>{c.aguardando}</dd></>}
        {c.solucao && <><dt>Solução</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{c.solucao}</dd></>}
        {c.custo != null && <><dt>Custo</dt><dd>{money(c.custo)}</dd></>}
      </dl>

      <h3>Atendimentos e aceite</h3>
      <button className="btn" onClick={() => setAtender(true)}>+ Registrar atendimento</button>
      <AtendimentosLista filtro={{ chamado_id: c.id }} refresh={tick} />

      <h3>Histórico de alterações</h3>
      <Historico coluna="registro_id" id={c.id} />

      {atender && <AtendimentoForm unidadeId={c.unidade_id} servicoId={c.servico_id} chamadoId={c.id} onClose={() => setAtender(false)} onSaved={() => { setAtender(false); setTick((t) => t + 1) }} />}
      {acao === 'aguardando' && (
        <Modal title="Aguardando terceiro" onClose={() => setAcao(null)} footer={<><button className="btn" onClick={() => setAcao(null)}>Cancelar</button><button className="btn btn-primary" disabled={!texto.trim()} onClick={() => mudar({ status: 'Aguardando terceiro', aguardando: texto.trim() }, 'Chamado aguardando terceiro')}>Confirmar</button></>}>
          <Field label="O que e de quem estamos aguardando? *" hint="Enquanto aguarda, o prazo do SLA fica suspenso"><textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus placeholder="Ex.: Operadora Net — reparo do link, protocolo 12345" /></Field>
        </Modal>
      )}
      {acao === 'resolver' && (
        <Modal title="Resolver chamado" onClose={() => setAcao(null)} footer={<><button className="btn" onClick={() => setAcao(null)}>Cancelar</button><button className="btn btn-primary" disabled={!texto.trim()} onClick={() => mudar({ status: 'Resolvido', solucao: texto.trim(), custo: custo === '' ? null : Number(custo), aguardando: null }, 'Chamado resolvido')}>Resolver</button></>}>
          <div className="grid">
            <Field label="O que foi feito para resolver? *" span={3}><textarea rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus /></Field>
            <Field label="Custo (R$)"><input type="number" min={0} step="0.01" value={custo} onChange={(e) => setCusto(e.target.value)} /></Field>
          </div>
        </Modal>
      )}
      {acao === 'cancelar' && <Confirm title="Cancelar chamado" message="O chamado sai da lista de abertos. Dá para reabrir depois." confirmLabel="Cancelar chamado" onCancel={() => setAcao(null)} onConfirm={() => void mudar({ status: 'Cancelado' }, 'Chamado cancelado')} />}
      {confirmDel && (
        <Confirm title="Excluir chamado" message={`Excluir o chamado #${c.numero} e os atendimentos dele?`} confirmLabel="Excluir" onCancel={() => setConfirmDel(false)} onConfirm={async () => {
          setConfirmDel(false)
          const ok = await act(async () => { const rows = unwrap(await supabase.from('chamados').delete().eq('id', c.id).select()) as unknown[]; if (rows.length === 0) throw new Error('Somente o gestor pode excluir chamados.') }, 'Chamado excluído')
          if (ok) onDeleted()
        }} />
      )}
    </Modal>
  )
}

