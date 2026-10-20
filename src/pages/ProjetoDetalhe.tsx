import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { fdate, media, money, nullIfEmpty } from '../lib/format'
import { nomePessoa, podeAprovarEtapa, podeEditarProjetos } from '../lib/papeis'
import { motivoAtraso } from '../lib/projeto'
import {
  STATUS_ETAPA_PROJETO,
  STATUS_PARCEIRO_PROJETO,
  TIPOS_REGISTRO,
  type Profile,
  type Projeto,
  type ProjetoEtapa,
  type ProjetoParceiro,
  type ProjetoRegistro,
  type Tarefa,
} from '../lib/types'
import { Badge, Confirm, Empty, Field, Loading, Modal, PageHead, Select, useAct } from '../components/ui'
import ProjetoForm from '../components/ProjetoForm'
import TarefasPanel from '../components/TarefasPanel'
import Documentos from '../components/Documentos'
import Historico from '../components/Historico'
import { statusProjetoLabel, toneProjeto } from './Projetos'

type ParceiroOpt = { id: string; homologacao: string; organizacao: { id: string; nome: string } | null }
type Aba = 'etapas' | 'tarefas' | 'parceiros' | 'registros' | 'documentos' | 'historico'

export default function ProjetoDetalhe() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const act = useAct()
  const { profile, isGestor } = useAuth()
  const edita = podeEditarProjetos(profile?.role)
  const aprova = podeAprovarEtapa(profile?.role)
  const [aba, setAba] = useState<Aba>('etapas')
  const [editar, setEditar] = useState(false)
  const [excluir, setExcluir] = useState(false)

  const { data, loading, error, reload } = useAsync(async () => {
    const [p, e, t, r, pp, pa, pes, dc] = await Promise.all([
      supabase.from('projetos').select('*, cliente:organizacoes!cliente_id(id,nome), gerente:profiles!gerente_id(id,nome), engenheiro:profiles!engenheiro_id(id,nome)').eq('id', id).single(),
      supabase.from('projeto_etapas').select('*').eq('projeto_id', id).order('ordem'),
      supabase.from('tarefas').select('*, responsavel:profiles!responsavel_id(nome)').eq('projeto_id', id).order('prazo', { ascending: true, nullsFirst: false }),
      supabase.from('projeto_registros').select('*, responsavel:profiles!responsavel_id(nome)').eq('projeto_id', id).order('created_at', { ascending: false }),
      supabase.from('projeto_parceiros').select('*, parceiro:parceiros(id, organizacao:organizacoes(id,nome))').eq('projeto_id', id).order('created_at'),
      supabase.from('parceiros').select('id, homologacao, organizacao:organizacoes(id,nome)'),
      supabase.from('profiles').select('id,nome,email,role').order('nome'),
      supabase.from('documentos').select('id,nome,versao,status_aprovacao').eq('projeto_id', id).neq('status_aprovacao', 'Obsoleto'),
    ])
    return {
      projeto: unwrap(p) as Projeto,
      etapas: unwrap(e) as ProjetoEtapa[],
      tarefas: unwrap(t) as Tarefa[],
      registros: unwrap(r) as ProjetoRegistro[],
      pp: unwrap(pp) as unknown as ProjetoParceiro[],
      parceiros: unwrap(pa) as unknown as ParceiroOpt[],
      pessoas: unwrap(pes) as Profile[],
      docs: unwrap(dc) as { id: string; nome: string; versao: number; status_aprovacao: string }[],
    }
  }, [id])

  if (loading && !data) return <Loading error={error} />
  if (!data) return <Loading error={error ?? 'Projeto não encontrado'} />
  const { projeto: p, etapas, tarefas, registros, pp } = data
  const atraso = motivoAtraso(p, etapas)
  const aprovadas = etapas.filter((e) => e.aprovada).length
  const abertos = registros.filter((r) => r.status === 'aberto' && (r.tipo === 'risco' || r.tipo === 'pendencia')).length
  const ativas = tarefas.filter((t) => t.status !== 'concluida').length

  const abas: { k: Aba; l: string }[] = [
    { k: 'etapas', l: `Etapas (${aprovadas}/${etapas.length})` },
    { k: 'tarefas', l: `Tarefas (${ativas})` },
    { k: 'parceiros', l: `Parceiros (${pp.length})` },
    { k: 'registros', l: `Riscos e decisões${abertos ? ` (${abertos} abertos)` : ''}` },
    { k: 'documentos', l: 'Documentos' },
    { k: 'historico', l: 'Histórico' },
  ]

  return (
    <>
      <PageHead
        title={p.nome}
        sub={[p.cliente?.nome, p.tipo, p.cidade].filter(Boolean).join(' · ') || undefined}
        actions={
          <>
            <Link to="/projetos" className="btn">← Projetos</Link>
            {p.oportunidade_id && <Link to={`/oportunidades/${p.oportunidade_id}`} className="btn">Ver oportunidade</Link>}
            {edita && <button className="btn btn-primary" onClick={() => setEditar(true)}>Editar</button>}
          </>
        }
      />
      <div className="chips" style={{ marginBottom: 12 }}>
        <Badge tone={toneProjeto(p.status)}>{statusProjetoLabel(p.status)}</Badge>
        {atraso && <Badge tone="bad">Atrasado: {atraso}</Badge>}
        {abertos > 0 && <Badge tone="warn">{abertos} risco(s)/pendência(s) aberto(s)</Badge>}
      </div>

      <section className="card section">
        <dl className="dl" style={{ margin: 0 }}>
          <dt>Gerente · Engenheiro</dt><dd>{p.gerente?.nome ?? '—'} · {p.engenheiro?.nome ?? '—'}{p.responsaveis_locais ? ` · locais: ${p.responsaveis_locais}` : ''}</dd>
          <dt>Prazo</dt><dd>{fdate(p.data_inicio)} → {fdate(p.data_fim_prevista)}{p.data_fim_real ? ` (real: ${fdate(p.data_fim_real)})` : ''}</dd>
          {p.endereco && (<><dt>Endereço</dt><dd>{p.endereco}</dd></>)}
          <dt>Escopo</dt><dd>{p.escopo ?? <span className="muted">não definido</span>}</dd>
          {p.premissas && (<><dt>Premissas</dt><dd>{p.premissas}</dd></>)}
          {p.exclusoes && (<><dt>Exclusões</dt><dd>{p.exclusoes}</dd></>)}
          {p.criterios_conclusao && (<><dt>Aceite</dt><dd>{p.criterios_conclusao}</dd></>)}
        </dl>
      </section>

      <div className="tabs" role="tablist">
        {abas.map((a) => (
          <button key={a.k} role="tab" aria-selected={aba === a.k} className={`tab ${aba === a.k ? 'on' : ''}`} onClick={() => setAba(a.k)}>{a.l}</button>
        ))}
      </div>

      {aba === 'etapas' && <Etapas etapas={etapas} edita={edita} aprova={aprova} onChanged={reload} />}
      {aba === 'tarefas' && <TarefasPanel vinculo={{ projeto_id: p.id }} tarefas={tarefas} onChanged={reload} />}
      {aba === 'parceiros' && <Parceiros projetoId={p.id} lista={pp} opcoes={data.parceiros} edita={edita} onChanged={reload} />}
      {aba === 'registros' && <Registros projetoId={p.id} lista={registros} pessoas={data.pessoas} docs={data.docs} edita={edita} onChanged={reload} />}
      {aba === 'documentos' && <Documentos vinculo={{ projeto_id: p.id }} onChanged={reload} />}
      {aba === 'historico' && <Historico coluna="projeto_id" id={p.id} />}

      {isGestor && (
        <p style={{ marginTop: 28 }}>
          <button className="btn btn-danger" onClick={() => setExcluir(true)}>Excluir projeto</button>
        </p>
      )}
      {editar && <ProjetoForm projeto={p} onClose={() => setEditar(false)} onSaved={() => { setEditar(false); reload() }} />}
      {excluir && (
        <Confirm
          title="Excluir projeto"
          message="Isso apaga também etapas, tarefas, riscos, parceiros do projeto e documentos ligados a ele. Não há como desfazer."
          confirmLabel="Excluir"
          onCancel={() => setExcluir(false)}
          onConfirm={async () => {
            setExcluir(false)
            const ok = await act(async () => {
              const rows = unwrap(await supabase.from('projetos').delete().eq('id', p.id).select()) as unknown[]
              if (rows.length === 0) throw new Error('Somente o gestor exclui projetos.')
            }, 'Projeto excluído')
            if (ok) nav('/projetos')
          }}
        />
      )}
    </>
  )
}

/* ---------- etapas do fluxo de implantação ---------- */
function Etapas({ etapas, edita, aprova, onChanged }: { etapas: ProjetoEtapa[]; edita: boolean; aprova: boolean; onChanged: () => void }) {
  const act = useAct()
  const [aviso, setAviso] = useState<{ etapa: ProjetoEtapa; status: string; anterior: ProjetoEtapa } | null>(null)
  const [aberta, setAberta] = useState<string | null>(null)

  async function atualizar(e: ProjetoEtapa, campos: Record<string, unknown>, ok?: string) {
    const r = await act(async () => unwrap(await supabase.from('projeto_etapas').update(campos).eq('id', e.id).select()), ok)
    if (r) onChanged()
  }

  function mudarStatus(e: ProjetoEtapa, status: string) {
    const anterior = etapas.find((x) => x.ordem === e.ordem - 1)
    // regra: não iniciar uma etapa sem a aprovação da anterior (aviso, não bloqueio)
    if (anterior && !anterior.aprovada && status !== 'pendente' && e.status === 'pendente') return setAviso({ etapa: e, status, anterior })
    atualizar(e, { status })
  }

  return (
    <>
      <p className="muted">
        “Concluída” diz que a atividade terminou; “Aprovada” é o aval formal para seguir à etapa seguinte. Pintar a parede pode estar concluído sem a obra
        estar pronta para entrega.
      </p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Etapa</th><th style={{ width: 180 }}>Status</th><th>Início previsto</th><th>Fim previsto</th><th style={{ width: 190 }}>Aprovação</th></tr></thead>
          <tbody>
            {etapas.map((e) => (
              <FragmentoEtapa key={e.id} e={e} aberta={aberta === e.id} onToggle={() => setAberta(aberta === e.id ? null : e.id)}>
                <td>
                  <Select value={e.status} disabled={!edita || e.aprovada} onChange={(ev) => mudarStatus(e, ev.target.value)} options={STATUS_ETAPA_PROJETO.map((s) => ({ v: s.v, l: s.l }))} placeholder="—" />
                </td>
                <td><input className="inline" type="date" disabled={!edita} defaultValue={e.data_inicio_prevista ?? ''} key={`i${e.id}${e.data_inicio_prevista}`} onBlur={(ev) => ev.target.value !== (e.data_inicio_prevista ?? '') && atualizar(e, { data_inicio_prevista: nullIfEmpty(ev.target.value) })} /></td>
                <td><input className="inline" type="date" disabled={!edita} defaultValue={e.data_fim_prevista ?? ''} key={`f${e.id}${e.data_fim_prevista}`} onBlur={(ev) => ev.target.value !== (e.data_fim_prevista ?? '') && atualizar(e, { data_fim_prevista: nullIfEmpty(ev.target.value) })} /></td>
                <td>
                  {e.aprovada ? (
                    <>
                      <Badge tone="ok">Aprovada {fdate(e.aprovada_em)}</Badge>
                      {aprova && <button className="link-btn" onClick={() => atualizar(e, { aprovada: false }, 'Aprovação removida')}>remover</button>}
                    </>
                  ) : e.status === 'concluida' ? (
                    aprova ? <button className="btn btn-sm btn-primary" onClick={() => atualizar(e, { aprovada: true }, 'Etapa aprovada')}>Aprovar etapa</button> : <Badge tone="warn">Aguardando aprovação</Badge>
                  ) : <span className="muted">—</span>}
                </td>
              </FragmentoEtapa>
            ))}
          </tbody>
        </table>
      </div>
      {aviso && (
        <Confirm
          title="Etapa anterior sem aprovação"
          message={`A etapa “${aviso.anterior.nome}” ainda não foi aprovada. Iniciar “${aviso.etapa.nome}” mesmo assim? Critério de entrada: ${aviso.etapa.criterio_entrada ?? '—'}`}
          confirmLabel="Iniciar mesmo assim"
          onCancel={() => setAviso(null)}
          onConfirm={() => { const a = aviso; setAviso(null); atualizar(a.etapa, { status: a.status }) }}
        />
      )}
    </>
  )
}

function FragmentoEtapa({ e, aberta, onToggle, children }: { e: ProjetoEtapa; aberta: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <>
      <tr className={`etapa-row ${e.aprovada ? 'aprovada' : ''}`}>
        <td className="mono">{e.ordem}</td>
        <td>
          <button className="link-btn" onClick={onToggle} aria-expanded={aberta}>{e.nome}</button>
          <div className="muted">{e.descricao}</div>
        </td>
        {children}
      </tr>
      {aberta && (
        <tr>
          <td />
          <td colSpan={5} className="crit">
            <b>Para entrar:</b> {e.criterio_entrada ?? '—'}<br />
            <b>Para sair:</b> {e.criterio_saida ?? '—'}
          </td>
        </tr>
      )}
    </>
  )
}

/* ---------- parceiros do projeto e avaliação ---------- */
function Parceiros({ projetoId, lista, opcoes, edita, onChanged }: { projetoId: string; lista: ProjetoParceiro[]; opcoes: ParceiroOpt[]; edita: boolean; onChanged: () => void }) {
  const act = useAct()
  const { profile } = useAuth()
  const [d, setD] = useState({ parceiro_id: '', escopo: '', status: 'cotado', valor_cotado: '', valor_contratado: '' })
  const [avaliar, setAvaliar] = useState<ProjetoParceiro | null>(null)
  const [remover, setRemover] = useState<ProjetoParceiro | null>(null)
  const escolhido = opcoes.find((o) => o.id === d.parceiro_id)
  const num = (v: string) => (v.trim() === '' ? null : Number(v))

  async function add() {
    const ok = await act(async () =>
      unwrap(await supabase.from('projeto_parceiros').insert({ projeto_id: projetoId, parceiro_id: d.parceiro_id, escopo: nullIfEmpty(d.escopo), status: d.status, valor_cotado: num(d.valor_cotado), valor_contratado: num(d.valor_contratado) }).select()),
      'Parceiro vinculado',
    )
    if (ok) { setD({ parceiro_id: '', escopo: '', status: 'cotado', valor_cotado: '', valor_contratado: '' }); onChanged() }
  }
  async function status(r: ProjetoParceiro, s: string) {
    const ok = await act(async () => unwrap(await supabase.from('projeto_parceiros').update({ status: s }).eq('id', r.id).select()))
    if (ok) onChanged()
  }

  return (
    <>
      {edita && (
        <div className="card section">
          <div className="grid">
            <Field label="Parceiro" span={2}>
              <Select value={d.parceiro_id} onChange={(e) => setD({ ...d, parceiro_id: e.target.value })} placeholder="Selecione…"
                options={opcoes.map((o) => ({ v: o.id, l: `${o.organizacao?.nome ?? '—'}${o.homologacao !== 'Homologado' ? ` (${o.homologacao})` : ''}` }))} />
            </Field>
            <Field label="Escopo"><input value={d.escopo} onChange={(e) => setD({ ...d, escopo: e.target.value })} placeholder="Ex.: elétrica e cabeamento" /></Field>
            <Field label="Status"><Select value={d.status} onChange={(e) => setD({ ...d, status: e.target.value })} options={STATUS_PARCEIRO_PROJETO.map((s) => ({ v: s.v, l: s.l }))} placeholder="—" /></Field>
            <Field label="Valor cotado (R$)"><input type="number" min="0" step="0.01" value={d.valor_cotado} onChange={(e) => setD({ ...d, valor_cotado: e.target.value })} /></Field>
            <Field label="Valor contratado (R$)"><input type="number" min="0" step="0.01" value={d.valor_contratado} onChange={(e) => setD({ ...d, valor_contratado: e.target.value })} /></Field>
            {escolhido && escolhido.homologacao !== 'Homologado' && (
              <div className="alert alert-warn span-3">Este parceiro está como <b>{escolhido.homologacao}</b>. Preço baixo não substitui homologação, documentação e segurança.</div>
            )}
            <div><button className="btn btn-primary" onClick={add} disabled={!d.parceiro_id}>Vincular ao projeto</button></div>
          </div>
        </div>
      )}
      {lista.length === 0 ? <Empty>Nenhum parceiro vinculado.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Parceiro</th><th>Escopo</th><th style={{ width: 140 }}>Status</th><th>Cotado</th><th>Contratado</th><th>Avaliação</th>{edita && <th />}</tr></thead>
            <tbody>
              {lista.map((r) => {
                const nota = media([r.nota_qualidade, r.nota_seguranca, r.nota_comunicacao, r.nota_documental, r.nota_geral])
                return (
                  <tr key={r.id}>
                    <td><b>{r.parceiro?.organizacao?.nome ?? '—'}</b></td>
                    <td>{r.escopo ?? '—'}</td>
                    <td><Select value={r.status} disabled={!edita} onChange={(e) => status(r, e.target.value)} options={STATUS_PARCEIRO_PROJETO.map((s) => ({ v: s.v, l: s.l }))} placeholder="—" /></td>
                    <td>{money(r.valor_cotado)}</td>
                    <td>{money(r.valor_contratado)}</td>
                    <td>
                      {nota != null ? <span className="nota">★ {nota.toFixed(1)}</span> : <span className="muted">sem avaliação</span>}
                      {r.prazo_cumprido != null && <Badge tone={r.prazo_cumprido ? 'ok' : 'bad'}>{r.prazo_cumprido ? 'no prazo' : 'atrasou'}</Badge>}
                      {r.retrabalho && <Badge tone="warn">retrabalho</Badge>}{' '}
                      {edita && <button className="link-btn" onClick={() => setAvaliar(r)}>{nota != null ? 'editar' : 'avaliar'}</button>}
                    </td>
                    {edita && <td style={{ width: 34 }}><button className="icon-btn row-del" aria-label="Remover parceiro do projeto" title="Remover do projeto" onClick={() => setRemover(r)}>×</button></td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {avaliar && <AvaliacaoForm r={avaliar} avaliador={profile?.id} onClose={() => setAvaliar(null)} onSaved={() => { setAvaliar(null); onChanged() }} />}
      {remover && (
        <Confirm
          title="Remover parceiro do projeto"
          message={`Remover ${remover.parceiro?.organizacao?.nome ?? 'o parceiro'} deste projeto? A avaliação feita aqui também é apagada.`}
          confirmLabel="Remover"
          onCancel={() => setRemover(null)}
          onConfirm={async () => {
            const r = remover
            setRemover(null)
            const ok = await act(async () => unwrap(await supabase.from('projeto_parceiros').delete().eq('id', r.id).select()), 'Parceiro removido')
            if (ok) onChanged()
          }}
        />
      )}
    </>
  )
}

const NOTAS = [1, 2, 3, 4, 5].map((n) => ({ v: n, l: `${n}` }))

function AvaliacaoForm({ r, avaliador, onClose, onSaved }: { r: ProjetoParceiro; avaliador?: string; onClose: () => void; onSaved: () => void }) {
  const act = useAct()
  const s = (v: number | null) => (v == null ? '' : String(v))
  const [d, setD] = useState({
    prazo: r.prazo_cumprido == null ? '' : String(r.prazo_cumprido), retrabalho: r.retrabalho == null ? '' : String(r.retrabalho),
    nota_qualidade: s(r.nota_qualidade), nota_seguranca: s(r.nota_seguranca), nota_comunicacao: s(r.nota_comunicacao),
    nota_documental: s(r.nota_documental), nota_geral: s(r.nota_geral), obs: r.avaliacao_obs ?? '',
  })
  const set = (k: keyof typeof d, v: string) => setD((x) => ({ ...x, [k]: v }))
  const n = (v: string) => (v === '' ? null : Number(v))
  const b = (v: string) => (v === '' ? null : v === 'true')
  const sn = [{ v: 'true', l: 'Sim' }, { v: 'false', l: 'Não' }]

  return (
    <Modal
      title={`Avaliar ${r.parceiro?.organizacao?.nome ?? 'parceiro'}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary"
            onClick={async () => {
              const ok = await act(async () =>
                unwrap(await supabase.from('projeto_parceiros').update({
                  prazo_cumprido: b(d.prazo), retrabalho: b(d.retrabalho), nota_qualidade: n(d.nota_qualidade), nota_seguranca: n(d.nota_seguranca),
                  nota_comunicacao: n(d.nota_comunicacao), nota_documental: n(d.nota_documental), nota_geral: n(d.nota_geral),
                  avaliacao_obs: nullIfEmpty(d.obs), avaliado_por: avaliador ?? null,
                }).eq('id', r.id).select()), 'Avaliação salva')
              if (ok) onSaved()
            }}
          >Salvar</button>
        </>
      }
    >
      <p className="muted">Notas de 1 a 5, preenchidas pelo responsável da obra. Deixe em branco o que não se aplica.</p>
      <div className="grid">
        <Field label="Cumpriu o prazo?"><Select value={d.prazo} onChange={(e) => set('prazo', e.target.value)} options={sn} /></Field>
        <Field label="Houve retrabalho?"><Select value={d.retrabalho} onChange={(e) => set('retrabalho', e.target.value)} options={sn} /></Field>
        <Field label="Nota geral"><Select value={d.nota_geral} onChange={(e) => set('nota_geral', e.target.value)} options={NOTAS} /></Field>
        <Field label="Qualidade"><Select value={d.nota_qualidade} onChange={(e) => set('nota_qualidade', e.target.value)} options={NOTAS} /></Field>
        <Field label="Segurança"><Select value={d.nota_seguranca} onChange={(e) => set('nota_seguranca', e.target.value)} options={NOTAS} /></Field>
        <Field label="Comunicação e solução de problemas"><Select value={d.nota_comunicacao} onChange={(e) => set('nota_comunicacao', e.target.value)} options={NOTAS} /></Field>
        <Field label="Conformidade documental"><Select value={d.nota_documental} onChange={(e) => set('nota_documental', e.target.value)} options={NOTAS} /></Field>
        <Field label="Observações" span={3}><textarea rows={3} value={d.obs} onChange={(e) => set('obs', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

/* ---------- riscos, pendências, decisões e mudanças de escopo ---------- */
function Registros({ projetoId, lista, pessoas, docs, edita, onChanged }: { projetoId: string; lista: ProjetoRegistro[]; pessoas: Profile[]; docs: { id: string; nome: string; versao: number }[]; edita: boolean; onChanged: () => void }) {
  const act = useAct()
  const [d, setD] = useState({ tipo: 'risco', descricao: '', responsavel_id: '', prazo: '', aprovado_por: '', motivo: '', documento_id: '' })
  const [excluir, setExcluir] = useState<ProjetoRegistro | null>(null)
  const decisao = d.tipo === 'decisao' || d.tipo === 'mudanca_escopo'
  const rotulo = (t: string) => TIPOS_REGISTRO.find((x) => x.v === t)?.l ?? t

  async function add() {
    const ok = await act(async () =>
      unwrap(await supabase.from('projeto_registros').insert({
        projeto_id: projetoId, tipo: d.tipo, descricao: d.descricao.trim(), responsavel_id: nullIfEmpty(d.responsavel_id), prazo: nullIfEmpty(d.prazo),
        aprovado_por: decisao ? nullIfEmpty(d.aprovado_por) : null, motivo: decisao ? nullIfEmpty(d.motivo) : null, documento_id: decisao ? nullIfEmpty(d.documento_id) : null,
        status: decisao ? 'resolvido' : 'aberto',
      }).select()), 'Registrado')
    if (ok) { setD({ ...d, descricao: '', prazo: '', aprovado_por: '', motivo: '', documento_id: '' }); onChanged() }
  }
  async function alternar(r: ProjetoRegistro) {
    const ok = await act(async () => unwrap(await supabase.from('projeto_registros').update({ status: r.status === 'aberto' ? 'resolvido' : 'aberto' }).eq('id', r.id).select()))
    if (ok) onChanged()
  }
  const ordenada = [...lista].sort((a, b) => (a.status === b.status ? 0 : a.status === 'aberto' ? -1 : 1))

  return (
    <>
      {edita && (
        <div className="card section">
          <div className="grid">
            <Field label="Tipo"><Select value={d.tipo} onChange={(e) => setD({ ...d, tipo: e.target.value })} options={TIPOS_REGISTRO.map((t) => ({ v: t.v, l: t.l }))} placeholder="—" /></Field>
            <Field label="Descrição *" span={2}><input value={d.descricao} onChange={(e) => setD({ ...d, descricao: e.target.value })} /></Field>
            <Field label="Responsável"><Select value={d.responsavel_id} onChange={(e) => setD({ ...d, responsavel_id: e.target.value })} options={pessoas.map((p) => ({ v: p.id, l: nomePessoa(p) }))} /></Field>
            <Field label="Prazo"><input type="date" value={d.prazo} onChange={(e) => setD({ ...d, prazo: e.target.value })} /></Field>
            {decisao && (
              <>
                <Field label="Quem aprovou"><input value={d.aprovado_por} onChange={(e) => setD({ ...d, aprovado_por: e.target.value })} placeholder="Nome / empresa" /></Field>
                <Field label="Motivo" span={2}><input value={d.motivo} onChange={(e) => setD({ ...d, motivo: e.target.value })} /></Field>
                <Field label="Com base no documento" span={2}><Select value={d.documento_id} onChange={(e) => setD({ ...d, documento_id: e.target.value })} options={docs.map((x) => ({ v: x.id, l: `${x.nome} (v${x.versao})` }))} /></Field>
              </>
            )}
            <div><button className="btn btn-primary" onClick={add} disabled={!d.descricao.trim()}>Registrar</button></div>
          </div>
        </div>
      )}
      {ordenada.length === 0 ? <Empty>Nada registrado.</Empty> : (
        <div className="table-wrap">
          <table>
            <tbody>
              {ordenada.map((r) => {
                const aberto = r.status === 'aberto'
                const dec = r.tipo === 'decisao' || r.tipo === 'mudanca_escopo'
                return (
                  <tr key={r.id} style={!aberto ? { opacity: 0.65 } : undefined}>
                    <td style={{ width: 34 }}>{!dec && edita && <input type="checkbox" checked={!aberto} onChange={() => alternar(r)} aria-label="Resolvido" />}</td>
                    <td style={{ width: 150 }}><Badge tone={r.tipo === 'risco' ? 'bad' : r.tipo === 'pendencia' ? 'warn' : 'info'}>{rotulo(r.tipo)}</Badge></td>
                    <td>
                      {r.descricao}
                      {dec && <div className="muted">{[r.aprovado_por && `Aprovado por ${r.aprovado_por}`, r.motivo && `Motivo: ${r.motivo}`].filter(Boolean).join(' · ')}</div>}
                    </td>
                    <td className="muted" style={{ width: 120 }}>{r.responsavel?.nome ?? ''}</td>
                    <td className="mono" style={{ width: 96 }}>{fdate(dec ? r.data : r.prazo)}</td>
                    {edita && <td style={{ width: 34 }}><button className="icon-btn row-del" aria-label="Excluir registro" title="Excluir" onClick={() => setExcluir(r)}>×</button></td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {excluir && (
        <Confirm
          title="Excluir registro"
          message={`Excluir “${excluir.descricao}”?`}
          confirmLabel="Excluir"
          onCancel={() => setExcluir(null)}
          onConfirm={async () => {
            const r = excluir
            setExcluir(null)
            const ok = await act(async () => unwrap(await supabase.from('projeto_registros').delete().eq('id', r.id).select()), 'Registro excluído')
            if (ok) onChanged()
          }}
        />
      )}
    </>
  )
}
