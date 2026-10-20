import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { fdate, money } from '../lib/format'
import { alertaReajuste, alertaVencimento } from '../lib/contrato'
import { STATUS_CONTRATO, TIPOS_CONTRATO, type Contrato, type Unidade } from '../lib/types'
import { Badge, Confirm, Empty, Loading, Modal, PageHead, Select, useAct } from '../components/ui'
import ContratoForm from '../components/ContratoForm'
import Documentos from '../components/Documentos'
import Historico from '../components/Historico'

const tomStatus = (s: string) => (s === 'Vigente' ? 'ok' : s === 'Rescindido' ? 'bad' : s === 'Encerrado' ? 'neutral' : 'warn')
const SEL = '*, cliente:organizacoes!cliente_id(id,nome), contratante:organizacoes!contratante_id(id,nome), responsavel:profiles!responsavel_id(nome), cobertura:contrato_unidades(unidade_id)'

export default function Contratos() {
  const [params, setParams] = useSearchParams()
  const { data, loading, error, reload } = useAsync(async () => unwrap(await supabase.from('contratos').select(SEL).order('created_at', { ascending: false })) as unknown as Contrato[])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [tipo, setTipo] = useState('')
  const [soAlertas, setSoAlertas] = useState(false)
  const [edit, setEdit] = useState<Contrato | 'novo' | null>(null)
  const abrirId = params.get('id')
  const ver = useMemo(() => (data ?? []).find((c) => c.id === abrirId) ?? null, [data, abrirId])

  const lista = useMemo(
    () =>
      (data ?? []).filter(
        (c) =>
          (!q || `${c.titulo} ${c.cliente?.nome ?? ''}`.toLowerCase().includes(q.toLowerCase())) &&
          (!status || c.status === status) &&
          (!tipo || c.tipo === tipo) &&
          (!soAlertas || alertaVencimento(c) || alertaReajuste(c)),
      ),
    [data, q, status, tipo, soAlertas],
  )
  const fechar = () => setParams({}, { replace: true })

  return (
    <>
      <PageHead
        title="Contratos"
        sub="Cada contrato pertence a um cliente e cobre uma ou mais unidades. Alertas de vencimento e reajuste aparecem na lista e no Dashboard Executivo."
        actions={<button className="btn btn-primary" onClick={() => setEdit('novo')}>+ Novo contrato</button>}
      />
      <div className="toolbar">
        <input placeholder="Buscar por contrato ou cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Todos os status" options={STATUS_CONTRATO} />
        <Select value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Todos os tipos" options={TIPOS_CONTRATO} />
        <label className="check"><input type="checkbox" checked={soAlertas} onChange={(e) => setSoAlertas(e.target.checked)} /> Só com alerta</label>
      </div>

      {loading && !data ? <Loading error={error} /> : lista.length === 0 ? <Empty>Nenhum contrato encontrado.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Contrato</th><th>Cliente</th><th>Tipo</th><th>Status</th><th>Vigência</th><th>Valor mensal</th><th>Alerta</th></tr></thead>
            <tbody>
              {lista.map((c) => {
                const a = alertaVencimento(c) ?? alertaReajuste(c)
                return (
                  <tr key={c.id} className="clickable" onClick={() => setParams({ id: c.id })}>
                    <td><b>{c.titulo}</b><div className="muted">{(c.cobertura ?? []).length} unidade(s)</div></td>
                    <td>{c.cliente?.nome ?? '—'}</td>
                    <td>{c.tipo}</td>
                    <td><Badge tone={tomStatus(c.status)}>{c.status}</Badge></td>
                    <td className="mono">{fdate(c.data_inicio)} → {fdate(c.data_fim)}</td>
                    <td>{money(c.valor_mensal)}</td>
                    <td>{a ? <Badge tone={a.tom}>{a.texto}</Badge> : <span className="muted">—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {edit && (
        <ContratoForm
          contrato={edit === 'novo' ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={(c) => { setEdit(null); reload(); setParams({ id: c.id }) }}
        />
      )}
      {ver && !edit && <ContratoDetalhe contrato={ver} onClose={fechar} onEdit={() => setEdit(ver)} onDeleted={() => { fechar(); reload() }} />}
    </>
  )
}

function Bloco({ titulo, texto }: { titulo: string; texto: string | null }) {
  if (!texto) return null
  return (<><dt>{titulo}</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{texto}</dd></>)
}

function ContratoDetalhe({ contrato: c, onClose, onEdit, onDeleted }: { contrato: Contrato; onClose: () => void; onEdit: () => void; onDeleted: () => void }) {
  const { isGestor } = useAuth()
  const act = useAct()
  const [confirmDel, setConfirmDel] = useState(false)
  const { data: unidades } = useAsync(async () => {
    const ids = (c.cobertura ?? []).map((x) => x.unidade_id)
    if (ids.length === 0) return [] as Unidade[]
    return unwrap(await supabase.from('unidades').select('id,nome,cidade,estado,situacao').in('id', ids).order('nome')) as unknown as Unidade[]
  }, [c.id, (c.cobertura ?? []).length])
  const av = alertaVencimento(c)
  const ar = alertaReajuste(c)

  return (
    <Modal
      title={c.titulo}
      onClose={onClose}
      wide
      footer={
        <>
          {isGestor && <button className="btn btn-danger" onClick={() => setConfirmDel(true)}>Excluir</button>}
          <button className="btn" onClick={onClose}>Fechar</button>
          <button className="btn btn-primary" onClick={onEdit}>Editar</button>
        </>
      }
    >
      <div className="chips">
        <Badge tone={tomStatus(c.status)}>{c.status}</Badge>
        <Badge tone="bronze">{c.tipo}{c.tipo === 'Combinação' && c.tipo_detalhe ? `: ${c.tipo_detalhe}` : ''}</Badge>
        {av && <Badge tone={av.tom}>{av.texto}</Badge>}
        {ar && <Badge tone={ar.tom}>{ar.texto}</Badge>}
      </div>
      <dl className="dl">
        <dt>Cliente</dt><dd>{c.cliente?.nome ?? '—'}</dd>
        {c.contratante && <><dt>Contratante</dt><dd>{c.contratante.nome}</dd></>}
        <dt>Responsável</dt><dd>{c.responsavel?.nome ?? '—'}</dd>
        <dt>Assinatura</dt><dd>{fdate(c.data_assinatura)}</dd>
        <dt>Vigência</dt><dd>{fdate(c.data_inicio)} → {fdate(c.data_fim)}{c.renovacao ? ` · renovação ${c.renovacao.toLowerCase()}` : ''} · alerta com {c.aviso_dias} dias</dd>
        <dt>Valor mensal</dt><dd>{money(c.valor_mensal)}{c.valor_total != null ? ` · total ${money(c.valor_total)}` : ''}</dd>
        <dt>Reajuste</dt><dd>{[c.reajuste_indice, c.reajuste_percentual != null ? `${c.reajuste_percentual}%` : null, c.reajuste_data_base ? `próximo em ${fdate(c.reajuste_data_base)}` : null].filter(Boolean).join(' · ') || '—'}</dd>
        <Bloco titulo="Pagamento" texto={c.condicoes_pagamento} />
        <Bloco titulo="Escopo incluído" texto={c.escopo_incluido} />
        <Bloco titulo="Itens excluídos" texto={c.itens_excluidos} />
        <Bloco titulo="Obrigações da Clip" texto={c.obrigacoes_clip} />
        <Bloco titulo="Obrigações do cliente" texto={c.obrigacoes_cliente} />
        <Bloco titulo="Obrigações do proprietário" texto={c.obrigacoes_proprietario} />
        <Bloco titulo="Obrigações de terceiros" texto={c.obrigacoes_terceiros} />
        <Bloco titulo="SLA" texto={c.sla} />
        <Bloco titulo="Critérios de aceite" texto={c.criterios_aceite} />
        <Bloco titulo="Alteração de escopo" texto={c.regras_alteracao_escopo} />
        <Bloco titulo="Saída antecipada" texto={c.regras_saida_antecipada} />
        <Bloco titulo="Observações" texto={c.observacoes} />
      </dl>

      <h3>Unidades cobertas</h3>
      {!unidades || unidades.length === 0 ? <p className="muted">Nenhuma unidade vinculada. Edite o contrato para escolher.</p> : (
        <ul className="plain">
          {unidades.map((u) => (
            <li key={u.id}><Link to={`/unidades?id=${u.id}`}>{u.nome}</Link> <span className="muted">· {[u.cidade, u.estado].filter(Boolean).join('/')} · {u.situacao}</span></li>
          ))}
        </ul>
      )}

      <h3>Documentos assinados e aditivos</h3>
      <p className="muted">Envie o contrato assinado com o tipo “Contrato” e cada aditivo como “Aditivo / aprovação”. A validade do documento também gera alerta no sistema.</p>
      <Documentos vinculo={{ contrato_id: c.id }} />

      <h3>Histórico de alterações</h3>
      <Historico coluna="contrato_id" id={c.id} />

      {confirmDel && (
        <Confirm
          title="Excluir contrato"
          message={`Excluir “${c.titulo}”? Os documentos do contrato também são removidos.`}
          confirmLabel="Excluir"
          onCancel={() => setConfirmDel(false)}
          onConfirm={async () => {
            setConfirmDel(false)
            const ok = await act(async () => {
              const rows = unwrap(await supabase.from('contratos').delete().eq('id', c.id).select()) as unknown[]
              if (rows.length === 0) throw new Error('Somente o gestor pode excluir contratos.')
            }, 'Contrato excluído')
            if (ok) onDeleted()
          }}
        />
      )}
    </Modal>
  )
}
