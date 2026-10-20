import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { PAPEIS, WOBA_STATUS, type Contato, type Oportunidade, type Organizacao } from '../lib/types'
import { Badge, Confirm, Empty, Loading, Modal, PageHead, Select, WobaBadge, useAct } from '../components/ui'
import OrgForm from '../components/OrgForm'
import Documentos from '../components/Documentos'
import Historico from '../components/Historico'
import { fdate, isOverdue } from '../lib/format'

const papelLabel = (v: string) => PAPEIS.find((p) => p.v === v)?.l ?? v

export default function Organizacoes() {
  const { isGestor } = useAuth()
  const act = useAct()
  const [excluir, setExcluir] = useState<Organizacao | null>(null)
  const { data, loading, error, reload } = useAsync(
    async () =>
      unwrap(await supabase.from('organizacoes').select('*').order('nome')) as Organizacao[],
  )
  const [q, setQ] = useState('')
  const [papel, setPapel] = useState('')
  const [woba, setWoba] = useState('')
  const [edit, setEdit] = useState<Organizacao | 'nova' | null>(null)
  const [ver, setVer] = useState<Organizacao | null>(null)

  const lista = useMemo(
    () =>
      (data ?? []).filter(
        (o) =>
          (!q || `${o.nome} ${o.setor ?? ''} ${o.cidade ?? ''}`.toLowerCase().includes(q.toLowerCase())) &&
          (!papel || o.papeis.includes(papel)) &&
          (!woba || o.atendida_woba === woba),
      ),
    [data, q, papel, woba],
  )

  return (
    <>
      <PageHead
        title="Empresas"
        sub="Registro único de cada empresa: clientes, parceiros, fornecedores e concorrentes. Uma empresa tem vários contatos, oportunidades e projetos."
        actions={
          <button className="btn btn-primary" onClick={() => setEdit('nova')}>
            + Nova empresa
          </button>
        }
      />
      <div className="toolbar">
        <input placeholder="Buscar por nome, setor ou cidade…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={papel} onChange={(e) => setPapel(e.target.value)} placeholder="Todos os tipos" options={PAPEIS.map((p) => ({ v: p.v, l: p.l }))} />
        <Select value={woba} onChange={(e) => setWoba(e.target.value)} placeholder="Woba: todas" options={WOBA_STATUS.map((w) => ({ v: w, l: `Woba: ${w}` }))} />
      </div>

      {loading && !data ? (
        <Loading error={error} />
      ) : lista.length === 0 ? (
        <Empty>Nenhuma organização encontrada.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Woba</th>
                <th>Cidade</th>
                <th>Último contato</th>
                <th>Próximo passo</th>
                {isGestor && <th />}
              </tr>
            </thead>
            <tbody>
              {lista.map((o) => (
                <tr key={o.id} className="clickable" onClick={() => setVer(o)}>
                  <td>
                    <b>{o.nome}</b>
                  </td>
                  <td>
                    {o.papeis.map((p) => (
                      <Badge key={p} tone={p === 'parceiro' ? 'bronze' : 'neutral'}>
                        {papelLabel(p)}
                      </Badge>
                    ))}
                  </td>
                  <td>
                    <WobaBadge v={o.atendida_woba} />
                    {o.atendida_woba === 'Não' && <span className="muted">—</span>}
                  </td>
                  <td>{o.cidade ?? '—'}</td>
                  <td className="mono">{fdate(o.ultimo_contato)}</td>
                  <td className={isOverdue(o.proximo_passo_data) ? 'overdue' : ''}>{o.proximo_passo ?? <span className="muted">—</span>}{o.proximo_passo_data && <span className="mono"> ({fdate(o.proximo_passo_data)})</span>}</td>
                  {isGestor && (
                    <td style={{ width: 36 }}>
                      <button
                        className="icon-btn row-del"
                        title="Excluir organização"
                        aria-label={`Excluir ${o.nome}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setExcluir(o)
                        }}
                      >
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {excluir && (
        <Confirm
          title="Excluir organização"
          message={`Excluir "${excluir.nome}"? Contatos ficam sem empresa. Se houver oportunidades ligadas a ela, a exclusão é bloqueada.`}
          confirmLabel="Excluir"
          onCancel={() => setExcluir(null)}
          onConfirm={async () => {
            const o = excluir
            setExcluir(null)
            const ok = await act(async () => {
              const rows = unwrap(await supabase.from('organizacoes').delete().eq('id', o.id).select()) as unknown[]
              if (rows.length === 0) throw new Error('Sem permissão para excluir esta organização.')
            }, 'Organização excluída')
            if (ok) reload()
          }}
        />
      )}
      {edit && (
        <OrgForm
          org={edit === 'nova' ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null)
            setVer(null)
            reload()
          }}
        />
      )}
      {ver && !edit && (
        <OrgDetalhe org={ver} onClose={() => setVer(null)} onEdit={() => setEdit(ver)} onDeleted={() => { setVer(null); reload() }} />
      )}
    </>
  )
}

function OrgDetalhe({
  org,
  onClose,
  onEdit,
  onDeleted,
}: {
  org: Organizacao
  onClose: () => void
  onEdit: () => void
  onDeleted: () => void
}) {
  const { isGestor } = useAuth()
  const act = useAct()
  const [confirmDel, setConfirmDel] = useState(false)
  const rel = useAsync(async () => {
    const [contatos, opps] = await Promise.all([
      supabase.from('contatos').select('*').eq('organizacao_id', org.id).order('nome'),
      supabase
        .from('oportunidades')
        .select('id,titulo,etapa_id,status,origem,canal_id,cliente_final_id')
        .or(`cliente_final_id.eq.${org.id},canal_id.eq.${org.id},contratante_id.eq.${org.id}`)
        .order('created_at', { ascending: false }),
    ])
    return {
      contatos: unwrap(contatos) as Contato[],
      opps: unwrap(opps) as Pick<Oportunidade, 'id' | 'titulo' | 'etapa_id' | 'status' | 'origem' | 'canal_id' | 'cliente_final_id'>[],
    }
  }, [org.id])

  return (
    <Modal
      title={org.nome}
      onClose={onClose}
      wide
      footer={
        <>
          {isGestor && (
            <button className="btn btn-danger" onClick={() => setConfirmDel(true)}>
              Excluir
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Fechar
          </button>
          <button className="btn btn-primary" onClick={onEdit}>
            Editar
          </button>
        </>
      }
    >
      <div className="chips">
        {org.papeis.map((p) => (
          <Badge key={p} tone={p === 'parceiro' ? 'bronze' : 'neutral'}>{papelLabel(p)}</Badge>
        ))}
        <WobaBadge v={org.atendida_woba} />
        {org.comissao_padrao_pct != null && <Badge tone="bronze">Comissão {org.comissao_padrao_pct}%</Badge>}
      </div>
      <dl className="dl">
        {(org.razao_social || org.cnpj) && (<><dt>Razão social / CNPJ</dt><dd>{[org.razao_social, org.cnpj].filter(Boolean).join(' · ')}</dd></>)}
        {org.site && (<><dt>Site</dt><dd><a href={org.site} target="_blank" rel="noreferrer">{org.site}</a></dd></>)}
        <dt>Local</dt><dd>{[org.cidade, org.regiao].filter(Boolean).join(' · ') || '—'}</dd>
        {org.cidades_atuacao && (<><dt>Cidades de atuação</dt><dd>{org.cidades_atuacao}</dd></>)}
        {org.origem_relacionamento && (<><dt>Origem</dt><dd>{org.origem_relacionamento}</dd></>)}
        {org.necessidades && (<><dt>Necessidades</dt><dd>{org.necessidades}</dd></>)}
        <dt>Último contato</dt><dd>{fdate(org.ultimo_contato)}</dd>
        {org.proximo_passo && (<><dt>Próximo passo</dt><dd>{org.proximo_passo}{org.proximo_passo_data ? ` (${fdate(org.proximo_passo_data)})` : ''}</dd></>)}
        <dt>Setor / porte</dt><dd>{[org.setor, org.porte].filter(Boolean).join(' · ') || '—'}</dd>
        <dt>Papel na cadeia</dt><dd>{org.papel_na_cadeia ?? '—'}</dd>
        <dt>Serviços</dt><dd>{org.servicos ?? '—'}</dd>
        <dt>Fonte</dt><dd>{org.fonte_informacao ?? '—'}</dd>
        <dt>Observações</dt><dd>{org.observacoes ?? '—'}</dd>
      </dl>

      <h3>Contatos</h3>
      {rel.loading && !rel.data ? <Loading error={rel.error} /> : rel.data && rel.data.contatos.length === 0 ? (
        <p className="muted">Nenhum contato cadastrado.</p>
      ) : (
        <ul className="plain">
          {rel.data?.contatos.map((c) => (
            <li key={c.id}>
              <b>{c.nome}</b> {c.cargo && <span className="muted">· {c.cargo}</span>} {c.email && <span className="muted">· {c.email}</span>}
            </li>
          ))}
        </ul>
      )}

      <h3>Oportunidades</h3>
      {rel.data && rel.data.opps.length === 0 ? (
        <p className="muted">Nenhuma oportunidade.</p>
      ) : (
        <ul className="plain">
          {rel.data?.opps.map((o) => (
            <li key={o.id}>
              <Link to={`/oportunidades/${o.id}`}>{o.titulo}</Link>{' '}
              <span className="muted">
                · etapa {o.etapa_id} · {o.status} · {o.origem}
                {o.canal_id === org.id ? ' · como canal' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3>Documentos</h3>
      <Documentos vinculo={{ organizacao_id: org.id }} />

      <h3>Histórico de alterações</h3>
      <Historico coluna="organizacao_id" id={org.id} />

      {confirmDel && (
        <Confirm
          title="Excluir organização"
          message={`Excluir "${org.nome}"? Oportunidades vinculadas impedem a exclusão.`}
          confirmLabel="Excluir"
          onCancel={() => setConfirmDel(false)}
          onConfirm={async () => {
            setConfirmDel(false)
            const ok = await act(async () => unwrap(await supabase.from('organizacoes').delete().eq('id', org.id).select()), 'Organização excluída')
            if (ok) onDeleted()
          }}
        />
      )}
    </Modal>
  )
}
