import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { fdate, fdatetime, isOverdue, money, nullIfEmpty, todayISO } from '../lib/format'
import { alertaVencimento } from '../lib/contrato'
import { STATUS_RELACIONAMENTO, TIPOS_INTERACAO, type Contato, type Contrato, type Oportunidade, type Organizacao, type Unidade } from '../lib/types'
import { Badge, Empty, Field, Loading, Modal, PageHead, Select, WobaBadge, useAct } from '../components/ui'
import OrgForm from '../components/OrgForm'
import UnidadeForm from '../components/UnidadeForm'
import Documentos from '../components/Documentos'
import Historico from '../components/Historico'

type Cliente = Organizacao & { responsavel?: { nome: string | null } | null }
type Contagem = { unidades: number; ativas: number; contratos: number }
type Interacao = { id: string; tipo: string; data: string; resumo: string; proximo_passo: string | null; autor?: { nome: string | null } | null; origem?: string }

const tomStatus = (s: string | null) => (s === 'Ativo' ? 'ok' : s === 'Em negociação' ? 'info' : s === 'Em pausa' ? 'warn' : s === 'Encerrado' ? 'neutral' : 'bronze')

export default function Clientes() {
  const [params, setParams] = useSearchParams()
  const { data, loading, error, reload } = useAsync(async () => {
    const [o, u, c] = await Promise.all([
      supabase.from('organizacoes').select('*, responsavel:profiles!responsavel_id(nome)').contains('papeis', ['cliente']).order('nome'),
      supabase.from('unidades').select('id,cliente_id,situacao'),
      supabase.from('contratos').select('id,cliente_id,status'),
    ])
    const cont = new Map<string, Contagem>()
    const get = (id: string) => cont.get(id) ?? (cont.set(id, { unidades: 0, ativas: 0, contratos: 0 }), cont.get(id) as Contagem)
    for (const x of unwrap(u) as { cliente_id: string; situacao: string }[]) { const k = get(x.cliente_id); k.unidades++; if (x.situacao === 'Ativo') k.ativas++ }
    for (const x of unwrap(c) as { cliente_id: string; status: string }[]) if (x.status === 'Vigente') get(x.cliente_id).contratos++
    return { clientes: unwrap(o) as unknown as Cliente[], cont }
  })
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [edit, setEdit] = useState<Cliente | 'novo' | null>(null)
  const ver = useMemo(() => data?.clientes.find((c) => c.id === params.get('id')) ?? null, [data, params])

  const lista = useMemo(
    () =>
      (data?.clientes ?? []).filter(
        (c) =>
          (!q || `${c.nome} ${c.razao_social ?? ''} ${c.cidade ?? ''}`.toLowerCase().includes(q.toLowerCase())) &&
          (!status || (c.status_relacionamento ?? 'Prospect') === status),
      ),
    [data, q, status],
  )

  return (
    <>
      <PageHead
        title="Clientes"
        sub="Cadastro da empresa cliente: dados, contatos e decisores, histórico de relacionamento, unidades, contratos e oportunidades."
        actions={<button className="btn btn-primary" onClick={() => setEdit('novo')}>+ Novo cliente</button>}
      />
      <div className="toolbar">
        <input placeholder="Buscar por nome, razão social ou cidade…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Todos os status" options={STATUS_RELACIONAMENTO} />
      </div>

      {loading && !data ? <Loading error={error} /> : lista.length === 0 ? <Empty>Nenhum cliente encontrado. Empresas com o tipo “Cliente” aparecem aqui.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Cliente</th><th>Status</th><th>Responsável</th><th>Unidades</th><th>Contratos vigentes</th><th>Último contato</th><th>Próximo passo</th></tr></thead>
            <tbody>
              {lista.map((c) => {
                const k = data?.cont.get(c.id)
                return (
                  <tr key={c.id} className="clickable" onClick={() => setParams({ id: c.id })}>
                    <td><b>{c.nome}</b>{c.cidade && <div className="muted">{c.cidade}</div>}</td>
                    <td><Badge tone={tomStatus(c.status_relacionamento)}>{c.status_relacionamento ?? 'Prospect'}</Badge></td>
                    <td>{c.responsavel?.nome ?? <span className="muted">—</span>}</td>
                    <td>{k ? `${k.unidades}${k.ativas ? ` (${k.ativas} ativa${k.ativas > 1 ? 's' : ''})` : ''}` : 0}</td>
                    <td>{k?.contratos ?? 0}</td>
                    <td className="mono">{fdate(c.ultimo_contato)}</td>
                    <td className={isOverdue(c.proximo_passo_data) ? 'overdue' : ''}>{c.proximo_passo ?? <span className="muted">—</span>}{c.proximo_passo_data && <span className="mono"> ({fdate(c.proximo_passo_data)})</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {edit && <OrgForm org={edit === 'novo' ? null : edit} defaultPapel="cliente" onClose={() => setEdit(null)} onSaved={(o) => { setEdit(null); reload(); setParams({ id: o.id }) }} />}
      {ver && !edit && <ClienteDetalhe cliente={ver} onClose={() => setParams({}, { replace: true })} onEdit={() => setEdit(ver)} onChanged={reload} />}
    </>
  )
}

function ClienteDetalhe({ cliente: c, onClose, onEdit, onChanged }: { cliente: Cliente; onClose: () => void; onEdit: () => void; onChanged: () => void }) {
  const act = useAct()
  const [contato, setContato] = useState<Contato | 'novo' | null>(null)
  const [interacao, setInteracao] = useState(false)
  const [unidade, setUnidade] = useState(false)
  const rel = useAsync(async () => {
    const [ct, op, un, co] = await Promise.all([
      supabase.from('contatos').select('*').eq('organizacao_id', c.id).order('nome'),
      supabase.from('oportunidades').select('id,titulo,etapa_id,status,origem').eq('cliente_final_id', c.id).order('created_at', { ascending: false }),
      supabase.from('unidades').select('id,nome,cidade,estado,situacao,tipo_operacao').eq('cliente_id', c.id).order('nome'),
      supabase.from('contratos').select('id,titulo,tipo,status,valor_mensal,data_fim,aviso_dias').eq('cliente_id', c.id).order('created_at', { ascending: false }),
    ])
    const contatos = unwrap(ct) as Contato[]
    const opps = unwrap(op) as Pick<Oportunidade, 'id' | 'titulo' | 'etapa_id' | 'status' | 'origem'>[]
    const filtros = [`organizacao_id.eq.${c.id}`, ...(contatos.length ? [`contato_id.in.(${contatos.map((x) => x.id).join(',')})`] : []), ...(opps.length ? [`oportunidade_id.in.(${opps.map((x) => x.id).join(',')})`] : [])]
    const it = unwrap(await supabase.from('interacoes').select('*, autor:profiles!created_by(nome)').or(filtros.join(',')).order('data', { ascending: false }).limit(100)) as unknown as Interacao[]
    return {
      contatos, opps, interacoes: it,
      unidades: unwrap(un) as unknown as Pick<Unidade, 'id' | 'nome' | 'cidade' | 'estado' | 'situacao' | 'tipo_operacao'>[],
      contratos: unwrap(co) as unknown as Pick<Contrato, 'id' | 'titulo' | 'tipo' | 'status' | 'valor_mensal' | 'data_fim' | 'aviso_dias'>[],
    }
  }, [c.id])

  async function mudarStatus(s: string) {
    const ok = await act(async () => unwrap(await supabase.from('organizacoes').update({ status_relacionamento: nullIfEmpty(s) }).eq('id', c.id).select()), 'Status atualizado')
    if (ok) onChanged()
  }
  async function alternarDecisor(x: Contato) {
    const ok = await act(async () => unwrap(await supabase.from('contatos').update({ decisor: !x.decisor }).eq('id', x.id).select()))
    if (ok) rel.reload()
  }

  return (
    <Modal
      title={c.nome}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>Fechar</button>
          <button className="btn btn-primary" onClick={onEdit}>Editar dados</button>
        </>
      }
    >
      <div className="toolbar" style={{ marginBottom: 4 }}>
        <span className="muted">Status do relacionamento</span>
        <Select value={c.status_relacionamento ?? ''} onChange={(e) => mudarStatus(e.target.value)} options={STATUS_RELACIONAMENTO} placeholder="Prospect" />
        <WobaBadge v={c.atendida_woba} />
      </div>
      <dl className="dl">
        {(c.razao_social || c.cnpj) && <><dt>Razão social / CNPJ</dt><dd>{[c.razao_social, c.cnpj].filter(Boolean).join(' · ')}</dd></>}
        {c.site && <><dt>Site</dt><dd><a href={c.site} target="_blank" rel="noreferrer">{c.site}</a></dd></>}
        <dt>Setor / porte</dt><dd>{[c.setor, c.porte].filter(Boolean).join(' · ') || '—'}</dd>
        <dt>Local</dt><dd>{[c.cidade, c.regiao].filter(Boolean).join(' · ') || '—'}</dd>
        <dt>Responsável pela conta</dt><dd>{c.responsavel?.nome ?? '—'}</dd>
        {c.origem_relacionamento && <><dt>Origem</dt><dd>{c.origem_relacionamento}</dd></>}
        {c.necessidades && <><dt>Necessidades</dt><dd>{c.necessidades}</dd></>}
        <dt>Último contato</dt><dd>{fdate(c.ultimo_contato)}</dd>
        {c.proximo_passo && <><dt>Próximo passo</dt><dd>{c.proximo_passo}{c.proximo_passo_data ? ` (${fdate(c.proximo_passo_data)})` : ''}</dd></>}
        {c.observacoes && <><dt>Observações</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{c.observacoes}</dd></>}
      </dl>

      <h3>Contatos e decisores</h3>
      {rel.loading && !rel.data ? <Loading error={rel.error} /> : rel.data && rel.data.contatos.length === 0 ? <p className="muted">Nenhum contato cadastrado.</p> : (
        <div className="table-wrap">
          <table>
            <tbody>
              {rel.data?.contatos.map((x) => (
                <tr key={x.id}>
                  <td><b>{x.nome}</b>{x.cargo && <div className="muted">{x.cargo}</div>}</td>
                  <td>{[x.email, x.telefone].filter(Boolean).join(' · ') || <span className="muted">—</span>}</td>
                  <td><button className="link-btn" onClick={() => alternarDecisor(x)} title="Marcar ou desmarcar como decisor">{x.decisor ? <Badge tone="bronze">Decisor</Badge> : <span className="muted">marcar decisor</span>}</button></td>
                  <td style={{ width: 70 }}><button className="btn btn-sm" onClick={() => setContato(x)}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button className="btn" style={{ marginTop: 8 }} onClick={() => setContato('novo')}>+ Contato</button>

      <h3>Histórico de relacionamento</h3>
      <button className="btn" onClick={() => setInteracao(true)}>+ Registrar interação</button>
      {rel.data && rel.data.interacoes.length === 0 ? <p className="muted">Nenhuma interação registrada.</p> : (
        <ul className="timeline">
          {rel.data?.interacoes.map((i) => (
            <li key={i.id}>
              <div className="tl-head"><span className="mono">{fdatetime(i.data)}</span><span className="badge badge-neutral">{i.tipo}</span>{i.autor?.nome && <span className="muted">{i.autor.nome}</span>}</div>
              <div>{i.resumo}</div>
              {i.proximo_passo && <div className="muted">Próximo passo: {i.proximo_passo}</div>}
            </li>
          ))}
        </ul>
      )}

      <h3>Unidades</h3>
      {rel.data && rel.data.unidades.length === 0 ? <p className="muted">Nenhuma unidade cadastrada.</p> : (
        <ul className="plain">
          {rel.data?.unidades.map((u) => (<li key={u.id}><Link to={`/unidades?id=${u.id}`}>{u.nome}</Link> <span className="muted">· {[u.cidade, u.estado].filter(Boolean).join('/')} · {u.tipo_operacao ?? 'tipo não informado'} · {u.situacao}</span></li>))}
        </ul>
      )}
      <button className="btn" onClick={() => setUnidade(true)}>+ Unidade</button>

      <h3>Contratos</h3>
      {rel.data && rel.data.contratos.length === 0 ? <p className="muted">Nenhum contrato. Cadastre na aba Contratos.</p> : (
        <ul className="plain">
          {rel.data?.contratos.map((k) => {
            const a = alertaVencimento(k)
            return (<li key={k.id}><Link to={`/contratos?id=${k.id}`}>{k.titulo}</Link> <span className="muted">· {k.tipo} · {k.status} · {money(k.valor_mensal)} · até {fdate(k.data_fim)}</span> {a && <Badge tone={a.tom}>{a.texto}</Badge>}</li>)
          })}
        </ul>
      )}

      <h3>Oportunidades</h3>
      {rel.data && rel.data.opps.length === 0 ? <p className="muted">Nenhuma oportunidade.</p> : (
        <ul className="plain">
          {rel.data?.opps.map((o) => (<li key={o.id}><Link to={`/oportunidades/${o.id}`}>{o.titulo}</Link> <span className="muted">· etapa {o.etapa_id} · {o.status} · {o.origem}</span></li>))}
        </ul>
      )}

      <h3>Documentos</h3>
      <Documentos vinculo={{ organizacao_id: c.id }} />

      <h3>Histórico de alterações</h3>
      <Historico coluna="organizacao_id" id={c.id} />

      {contato && <ContatoForm clienteId={c.id} contato={contato === 'novo' ? null : contato} onClose={() => setContato(null)} onSaved={() => { setContato(null); rel.reload() }} />}
      {interacao && <InteracaoForm clienteId={c.id} onClose={() => setInteracao(false)} onSaved={() => { setInteracao(false); rel.reload(); onChanged() }} />}
      {unidade && <UnidadeForm defaultClienteId={c.id} onClose={() => setUnidade(false)} onSaved={() => { setUnidade(false); rel.reload(); onChanged() }} />}
    </Modal>
  )
}

function ContatoForm({ clienteId, contato, onClose, onSaved }: { clienteId: string; contato: Contato | null; onClose: () => void; onSaved: () => void }) {
  const act = useAct()
  const [d, setD] = useState({ nome: contato?.nome ?? '', cargo: contato?.cargo ?? '', email: contato?.email ?? '', telefone: contato?.telefone ?? '', decisor: contato?.decisor ?? false, observacoes: contato?.observacoes ?? '' })
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }))
  async function salvar() {
    setBusy(true)
    const payload = { nome: d.nome.trim(), cargo: nullIfEmpty(d.cargo), email: nullIfEmpty(d.email), telefone: nullIfEmpty(d.telefone), decisor: d.decisor, observacoes: nullIfEmpty(d.observacoes), organizacao_id: clienteId }
    const ok = await act(async () => {
      const q = contato ? supabase.from('contatos').update(payload).eq('id', contato.id) : supabase.from('contatos').insert(payload)
      unwrap(await q.select())
    }, contato ? 'Contato atualizado' : 'Contato adicionado')
    setBusy(false)
    if (ok) onSaved()
  }
  return (
    <Modal title={contato ? 'Editar contato' : 'Novo contato'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={salvar} disabled={busy || !d.nome.trim()}>Salvar</button></>}>
      <div className="grid">
        <Field label="Nome *" span={2}><input value={d.nome} onChange={(e) => set('nome', e.target.value)} autoFocus /></Field>
        <Field label="Cargo"><input value={d.cargo} onChange={(e) => set('cargo', e.target.value)} /></Field>
        <Field label="E-mail" span={2}><input type="email" value={d.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Telefone"><input value={d.telefone} onChange={(e) => set('telefone', e.target.value)} /></Field>
        <label className="check span-3"><input type="checkbox" checked={d.decisor} onChange={(e) => set('decisor', e.target.checked)} /> É decisor (aprova a contratação)</label>
        <Field label="Observações" span={3}><input value={d.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

function InteracaoForm({ clienteId, onClose, onSaved }: { clienteId: string; onClose: () => void; onSaved: () => void }) {
  const act = useAct()
  const [d, setD] = useState({ tipo: 'reunião', data: todayISO(), resumo: '', proximo_passo: '' })
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }))
  async function salvar() {
    setBusy(true)
    const ok = await act(async () => unwrap(await supabase.from('interacoes').insert({ organizacao_id: clienteId, tipo: d.tipo, data: `${d.data}T12:00:00`, resumo: d.resumo.trim(), proximo_passo: nullIfEmpty(d.proximo_passo) }).select()), 'Interação registrada')
    setBusy(false)
    if (ok) onSaved()
  }
  return (
    <Modal title="Registrar interação" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={salvar} disabled={busy || !d.resumo.trim() || !d.data}>Salvar</button></>}>
      <div className="grid">
        <Field label="Tipo"><Select value={d.tipo} onChange={(e) => set('tipo', e.target.value)} options={TIPOS_INTERACAO} placeholder="—" /></Field>
        <Field label="Data"><input type="date" value={d.data} onChange={(e) => set('data', e.target.value)} /></Field>
        <div />
        <Field label="O que foi tratado *" span={3}><textarea rows={3} value={d.resumo} onChange={(e) => set('resumo', e.target.value)} autoFocus /></Field>
        <Field label="Próximo passo" span={3}><input value={d.proximo_passo} onChange={(e) => set('proximo_passo', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
