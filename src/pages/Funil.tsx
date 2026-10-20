import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { daysSince, fdate, isOverdue, money } from '../lib/format'
import { ORIGENS, type Etapa, type Oportunidade, type PlaybookItem } from '../lib/types'
import { Badge, Confirm, Field, Loading, Modal, PageHead, Select, WobaBadge, useAct } from '../components/ui'
import NovaOportunidade from '../components/NovaOportunidade'

interface Dados {
  etapas: Etapa[]
  opps: Oportunidade[]
  itens: PlaybookItem[]
  feitos: { oportunidade_id: string; item_id: string; feito: boolean }[]
}

export function conflitoWoba(o: Oportunidade): boolean {
  return o.status === 'aberta' && o.modelo_atuacao === 'operador' && o.origem !== 'Woba' && o.cliente?.atendida_woba === 'Sim'
}

export default function Funil() {
  const act = useAct()
  const { data, loading, error, reload } = useAsync<Dados>(async () => {
    const [e, o, p, c] = await Promise.all([
      supabase.from('etapas').select('*').order('id'),
      supabase
        .from('oportunidades')
        .select(
          '*, cliente:organizacoes!cliente_final_id(id,nome,atendida_woba), canal:organizacoes!canal_id(id,nome), responsavel:profiles!responsavel_id(id,nome)',
        )
        .order('etapa_atualizada_em', { ascending: false }),
      supabase.from('playbook_itens').select('*').order('ordem'),
      supabase.from('oportunidade_checklist').select('oportunidade_id,item_id,feito'),
    ])
    return {
      etapas: unwrap(e) as Etapa[],
      opps: unwrap(o) as Oportunidade[],
      itens: unwrap(p) as PlaybookItem[],
      feitos: unwrap(c) as Dados['feitos'],
    }
  })

  const [q, setQ] = useState('')
  const [origem, setOrigem] = useState('')
  const [nova, setNova] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const [fechar, setFechar] = useState<Oportunidade | null>(null)
  const [excluir, setExcluir] = useState<Oportunidade | null>(null)
  const [aviso, setAviso] = useState<{ opp: Oportunidade; etapa: number; faltam: number } | null>(null)

  const opps = useMemo(
    () =>
      (data?.opps ?? []).filter(
        (o) =>
          (!q || `${o.titulo} ${o.cliente?.nome ?? ''}`.toLowerCase().includes(q.toLowerCase())) &&
          (!origem || o.origem === origem),
      ),
    [data, q, origem],
  )

  const faltantes = (o: Oportunidade): { total: number; feitos: number; faltam: number } => {
    const itens = (data?.itens ?? []).filter((i) => i.etapa_id === o.etapa_id && i.obrigatorio)
    const feitos = itens.filter((i) => data?.feitos.some((f) => f.oportunidade_id === o.id && f.item_id === i.id && f.feito)).length
    return { total: itens.length, feitos, faltam: itens.length - feitos }
  }

  async function mover(o: Oportunidade, etapa: number) {
    if (etapa === o.etapa_id && o.status === 'aberta') return
    if (etapa === 7) return setFechar(o)
    if (etapa > o.etapa_id && o.status === 'aberta') {
      const f = faltantes(o)
      if (f.faltam > 0) return setAviso({ opp: o, etapa, faltam: f.faltam })
    }
    await efetuar(o, etapa)
  }

  async function efetuar(o: Oportunidade, etapa: number) {
    const ok = await act(async () => {
      unwrap(await supabase.from('oportunidades').update({ etapa_id: etapa, status: 'aberta' }).eq('id', o.id).select())
    })
    if (ok) reload()
  }

  return (
    <>
      <PageHead
        title="Funil"
        actions={
          <button className="btn btn-primary" onClick={() => setNova(true)}>
            + Nova oportunidade
          </button>
        }
      />
      <div className="toolbar">
        <input placeholder="Buscar por título ou empresa…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={origem} onChange={(e) => setOrigem(e.target.value)} placeholder="Todas as origens" options={ORIGENS} />
      </div>

      {loading && !data ? (
        <Loading error={error} />
      ) : (
        <div className="kanban">
          {data?.etapas.map((et) => {
            const col = opps.filter((o) => (et.id === 7 ? o.etapa_id === 7 : o.etapa_id === et.id && o.status === 'aberta'))
            return (
              <section
                key={et.id}
                className={`col ${over === et.id ? 'col-over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  setOver(et.id)
                }}
                onDragLeave={() => setOver((c) => (c === et.id ? null : c))}
                onDrop={(e) => {
                  e.preventDefault()
                  setOver(null)
                  const id = e.dataTransfer.getData('text/plain') || dragId
                  const o = data.opps.find((x) => x.id === id)
                  if (o) mover(o, et.id)
                }}
              >
                <header title={et.criterio_avanco ?? et.descricao ?? ''}>
                  <span className="mono col-n">{et.id}</span>
                  <h3>{et.nome}</h3>
                  <span className="count">{col.length}</span>
                </header>
                <div className="cards">
                  {col.map((o) => (
                    <Card key={o.id} o={o} etapa={et} prog={faltantes(o)} onDragStart={() => setDragId(o.id)} onDelete={() => setExcluir(o)} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {nova && <NovaOportunidade onClose={() => setNova(false)} />}
      {fechar && (
        <FecharModal
          opp={fechar}
          onClose={() => setFechar(null)}
          onDone={() => {
            setFechar(null)
            reload()
          }}
        />
      )}
      {excluir && (
        <Confirm
          title="Excluir oportunidade"
          message={`Excluir “${excluir.titulo}”? Isso apaga também histórico, tarefas, pendências e propostas. Não há como desfazer.`}
          confirmLabel="Excluir"
          onCancel={() => setExcluir(null)}
          onConfirm={async () => {
            const o = excluir
            setExcluir(null)
            const ok = await act(async () => {
              const rows = unwrap(await supabase.from('oportunidades').delete().eq('id', o.id).select()) as unknown[]
              if (rows.length === 0) throw new Error('Sem permissão para excluir esta oportunidade.')
            }, 'Oportunidade excluída')
            if (ok) reload()
          }}
        />
      )}
      {aviso && (
        <Confirm
          title="Itens obrigatórios pendentes"
          message={`Faltam ${aviso.faltam} item(ns) obrigatório(s) do playbook da etapa atual de “${aviso.opp.titulo}”. Avançar mesmo assim?`}
          confirmLabel="Avançar"
          onCancel={() => setAviso(null)}
          onConfirm={() => {
            const a = aviso
            setAviso(null)
            efetuar(a.opp, a.etapa)
          }}
        />
      )}
    </>
  )
}

function Card({
  o,
  etapa,
  prog,
  onDragStart,
  onDelete,
}: {
  o: Oportunidade
  etapa: Etapa
  prog: { total: number; feitos: number }
  onDragStart: () => void
  onDelete?: () => void
}) {
  const dias = daysSince(o.etapa_atualizada_em)
  const parada = o.status === 'aberta' && etapa.prazo_alvo_dias != null && dias > etapa.prazo_alvo_dias
  return (
    <article
      className={`card-opp ${conflitoWoba(o) ? 'card-conflito' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', o.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
    >
      <div className="card-top">
        <Link to={`/oportunidades/${o.id}`} className="card-title">
          {o.titulo}
        </Link>
        {onDelete && (
          <button className="icon-btn card-del" onClick={onDelete} title="Excluir oportunidade" aria-label="Excluir oportunidade">
            ×
          </button>
        )}
      </div>
      <div className="card-org">
        {o.cliente?.nome ?? '—'} <WobaBadge v={o.cliente?.atendida_woba} />
      </div>
      <div className="chips">
        {o.origem === 'Woba' && <Badge tone="bronze">via Woba</Badge>}
        {conflitoWoba(o) && <Badge tone="bad" title="Cliente atendido pela Woba com oportunidade direta aberta">Conflito Woba</Badge>}
        {o.prioridade && <Badge tone={o.prioridade.startsWith('1') ? 'ok' : o.prioridade.startsWith('2') ? 'info' : 'neutral'}>{o.prioridade}</Badge>}
        {o.status === 'ganha' && <Badge tone="ok">Ganha</Badge>}
        {o.status === 'perdida' && <Badge tone="bad">Perdida</Badge>}
      </div>
      {(o.tipo_servico || o.valor_estimado != null) && (
        <div className="card-meta">
          {[o.tipo_servico, o.valor_estimado != null ? money(o.valor_estimado) : null].filter(Boolean).join(' · ')}
        </div>
      )}
      {o.aprovacao_abordagem === 'Pendente' && <Badge tone="warn" title="A abordagem depende de aprovação (regra de relacionamento)">Aprovar abordagem</Badge>}
      {(o.area_m2 || o.cidade || o.padrao) && (
        <div className="card-meta">
          {[o.cidade, o.area_m2 ? `${o.area_m2} m²` : null, o.padrao].filter(Boolean).join(' · ')}
        </div>
      )}
      {o.status === 'aberta' && prog.total > 0 && (
        <div className="progress" title={`${prog.feitos}/${prog.total} itens obrigatórios do playbook`}>
          <div style={{ width: `${(prog.feitos / prog.total) * 100}%` }} />
        </div>
      )}
      {o.proximo_passo && (
        <div className={`card-next ${isOverdue(o.proximo_passo_data) ? 'overdue' : ''}`}>
          ➜ {o.proximo_passo} {o.proximo_passo_data && <span className="mono">({fdate(o.proximo_passo_data)})</span>}
        </div>
      )}
      <div className="card-foot">
        <span>{o.responsavel?.nome ?? 'sem responsável'}</span>
        {parada ? <Badge tone="warn" title={`Prazo-alvo da etapa: ${etapa.prazo_alvo_dias} dias`}>{dias} d na etapa</Badge> : <span className="muted">{o.status === 'aberta' ? `${dias} d` : fdate(o.fechada_em)}</span>}
      </div>
    </article>
  )
}

export function FecharModal({ opp, onClose, onDone }: { opp: Oportunidade; onClose: () => void; onDone: () => void }) {
  const act = useAct()
  const [res, setRes] = useState<'ganha' | 'perdida'>('ganha')
  const [motivo, setMotivo] = useState('')
  return (
    <Modal
      title={`Fechar: ${opp.titulo}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            disabled={res === 'perdida' && !motivo.trim()}
            onClick={async () => {
              const ok = await act(async () => {
                unwrap(
                  await supabase
                    .from('oportunidades')
                    .update({ status: res, motivo_perda: res === 'perdida' ? motivo.trim() : null })
                    .eq('id', opp.id)
                    .select(),
                )
              }, res === 'ganha' ? 'Oportunidade ganha 🎉' : 'Oportunidade encerrada')
              if (ok) onDone()
            }}
          >
            Confirmar
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="checks">
          <label className="check">
            <input type="radio" checked={res === 'ganha'} onChange={() => setRes('ganha')} /> Ganha (contrato assinado)
          </label>
          <label className="check">
            <input type="radio" checked={res === 'perdida'} onChange={() => setRes('perdida')} /> Perdida
          </label>
        </div>
        {res === 'perdida' && (
          <Field label="Motivo da perda *">
            <textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
          </Field>
        )}
      </div>
    </Modal>
  )
}
