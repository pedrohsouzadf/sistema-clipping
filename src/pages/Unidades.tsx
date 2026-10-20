import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { fdate, money, nullIfEmpty } from '../lib/format'
import { SITUACOES_UNIDADE, type Contrato, type Organizacao, type Unidade, type UnidadeFornecedor } from '../lib/types'
import { Badge, Confirm, Empty, Field, Loading, Modal, PageHead, Select, useAct } from '../components/ui'
import UnidadeForm from '../components/UnidadeForm'
import Documentos from '../components/Documentos'
import Historico from '../components/Historico'

const tomSituacao = (s: string) => (s === 'Ativo' ? 'ok' : s === 'Em implantação' ? 'info' : s === 'Encerrado' ? 'neutral' : 'warn')

export default function Unidades() {
  const [params, setParams] = useSearchParams()
  const { data, loading, error, reload } = useAsync(async () =>
    unwrap(await supabase.from('unidades').select('*, cliente:organizacoes!cliente_id(id,nome)').order('nome')) as unknown as Unidade[],
  )
  const [q, setQ] = useState('')
  const [cliente, setCliente] = useState(params.get('cliente') ?? '')
  const [situacao, setSituacao] = useState('')
  const [edit, setEdit] = useState<Unidade | 'nova' | null>(null)
  const ver = useMemo(() => (data ?? []).find((u) => u.id === params.get('id')) ?? null, [data, params])
  const clientes = useMemo(() => [...new Map((data ?? []).map((u) => [u.cliente_id, u.cliente?.nome ?? ''])).entries()].map(([v, l]) => ({ v, l })).sort((a, b) => a.l.localeCompare(b.l)), [data])

  const lista = useMemo(
    () =>
      (data ?? []).filter(
        (u) =>
          (!q || `${u.nome} ${u.cidade ?? ''} ${u.cliente?.nome ?? ''}`.toLowerCase().includes(q.toLowerCase())) &&
          (!cliente || u.cliente_id === cliente) &&
          (!situacao || u.situacao === situacao),
      ),
    [data, q, cliente, situacao],
  )
  const fechar = () => setParams({}, { replace: true })

  return (
    <>
      <PageHead
        title="Unidades"
        sub="Cada local físico de um cliente. Uma empresa pode ter várias unidades, cada uma com seus contratos, fornecedores e projetos."
        actions={<button className="btn btn-primary" onClick={() => setEdit('nova')}>+ Nova unidade</button>}
      />
      <div className="toolbar">
        <input placeholder="Buscar por unidade, cidade ou cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Todos os clientes" options={clientes} />
        <Select value={situacao} onChange={(e) => setSituacao(e.target.value)} placeholder="Todas as situações" options={SITUACOES_UNIDADE} />
      </div>

      {loading && !data ? <Loading error={error} /> : lista.length === 0 ? <Empty>Nenhuma unidade encontrada.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Unidade</th><th>Cliente</th><th>Local</th><th>Tipo</th><th>Capacidade</th><th>Área</th><th>Situação</th></tr></thead>
            <tbody>
              {lista.map((u) => (
                <tr key={u.id} className="clickable" onClick={() => setParams({ id: u.id })}>
                  <td><b>{u.nome}</b></td>
                  <td>{u.cliente?.nome ?? '—'}</td>
                  <td>{[u.cidade, u.estado].filter(Boolean).join('/') || '—'}</td>
                  <td>{u.tipo_operacao ?? '—'}</td>
                  <td>{u.capacidade_pessoas != null ? `${u.capacidade_pessoas} pessoas` : '—'}</td>
                  <td>{u.area_m2 != null ? `${Number(u.area_m2).toLocaleString('pt-BR')} m²` : '—'}</td>
                  <td><Badge tone={tomSituacao(u.situacao)}>{u.situacao}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {edit && <UnidadeForm unidade={edit === 'nova' ? null : edit} defaultClienteId={cliente || undefined} onClose={() => setEdit(null)} onSaved={(u) => { setEdit(null); reload(); setParams({ id: u.id }) }} />}
      {ver && !edit && <UnidadeDetalhe unidade={ver} onClose={fechar} onEdit={() => setEdit(ver)} onDeleted={() => { fechar(); reload() }} />}
    </>
  )
}

function Linha({ rotulo, texto }: { rotulo: string; texto: string | null | undefined }) {
  if (!texto) return null
  return (<><dt>{rotulo}</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{texto}</dd></>)
}

function UnidadeDetalhe({ unidade: u, onClose, onEdit, onDeleted }: { unidade: Unidade; onClose: () => void; onEdit: () => void; onDeleted: () => void }) {
  const { isGestor } = useAuth()
  const act = useAct()
  const [confirmDel, setConfirmDel] = useState(false)
  const [novo, setNovo] = useState<{ fornecedor_id: string; servico: string } | null>(null)
  const rel = useAsync(async () => {
    const [f, c, p, o, sv, ch] = await Promise.all([
      supabase.from('unidade_fornecedores').select('*, fornecedor:organizacoes!fornecedor_id(id,nome)').eq('unidade_id', u.id).order('created_at'),
      supabase.from('contrato_unidades').select('contrato:contratos(id,titulo,tipo,status,valor_mensal,data_fim)').eq('unidade_id', u.id),
      supabase.from('projetos').select('id,nome,status').eq('unidade_id', u.id),
      supabase.from('organizacoes').select('id,nome,papeis').order('nome'),
      supabase.from('servicos_unidade').select('id,nome,status,frequencia,custo_mensal').eq('unidade_id', u.id).order('nome'),
      supabase.from('chamados').select('id,status').eq('unidade_id', u.id).in('status', ['Aberto', 'Em atendimento', 'Aguardando terceiro']),
    ])
    return {
      servicos: unwrap(sv) as { id: string; nome: string; status: string; frequencia: string; custo_mensal: number | null }[],
      chamadosAbertos: (unwrap(ch) as unknown[]).length,
      fornecedores: unwrap(f) as unknown as UnidadeFornecedor[],
      contratos: (unwrap(c) as unknown as { contrato: Pick<Contrato, 'id' | 'titulo' | 'tipo' | 'status' | 'valor_mensal' | 'data_fim'> | null }[]).map((x) => x.contrato).filter(Boolean) as Pick<Contrato, 'id' | 'titulo' | 'tipo' | 'status' | 'valor_mensal' | 'data_fim'>[],
      projetos: unwrap(p) as { id: string; nome: string; status: string }[],
      fornecedoresCadastro: (unwrap(o) as Pick<Organizacao, 'id' | 'nome' | 'papeis'>[]).filter((x) => x.papeis.includes('fornecedor')),
    }
  }, [u.id])

  async function vincular() {
    if (!novo?.fornecedor_id) return
    const ok = await act(async () => unwrap(await supabase.from('unidade_fornecedores').insert({ unidade_id: u.id, fornecedor_id: novo.fornecedor_id, servico: nullIfEmpty(novo.servico) }).select()), 'Fornecedor vinculado')
    if (ok) { setNovo(null); rel.reload() }
  }
  async function desvincular(id: string) {
    const ok = await act(async () => unwrap(await supabase.from('unidade_fornecedores').delete().eq('id', id).select()), 'Vínculo removido')
    if (ok) rel.reload()
  }

  return (
    <Modal
      title={u.nome}
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
        <Badge tone={tomSituacao(u.situacao)}>{u.situacao}</Badge>
        {u.tipo_operacao && <Badge tone="bronze">{u.tipo_operacao}</Badge>}
      </div>
      <dl className="dl">
        <dt>Cliente</dt><dd>{u.cliente?.nome ?? '—'}</dd>
        <dt>Endereço</dt><dd>{[u.endereco, [u.cidade, u.estado].filter(Boolean).join('/')].filter(Boolean).join(' — ') || '—'}</dd>
        <dt>Capacidade e área</dt><dd>{[u.capacidade_pessoas != null ? `${u.capacidade_pessoas} pessoas` : null, u.area_m2 != null ? `${Number(u.area_m2).toLocaleString('pt-BR')} m²` : null].filter(Boolean).join(' · ') || '—'}</dd>
        <Linha rotulo="Proprietário" texto={u.proprietario} />
        <Linha rotulo="Locatário contratual" texto={u.locatario_contratual} />
        <Linha rotulo="Infraestrutura" texto={u.requisitos_infra} />
        <Linha rotulo="Serviços contratados" texto={u.servicos_contratados} />
        <Linha rotulo="Responsáveis locais" texto={u.responsaveis_locais} />
        <Linha rotulo="Observações" texto={u.observacoes} />
      </dl>

      <h3>Fornecedores vinculados</h3>
      {rel.loading && !rel.data ? <Loading error={rel.error} /> : rel.data && rel.data.fornecedores.length === 0 ? <p className="muted">Nenhum fornecedor vinculado.</p> : (
        <ul className="plain">
          {rel.data?.fornecedores.map((f) => (
            <li key={f.id}>
              <b>{f.fornecedor?.nome}</b> {f.servico && <span className="muted">· {f.servico}</span>}{' '}
              <button className="icon-btn" title="Remover vínculo" aria-label={`Remover ${f.fornecedor?.nome}`} onClick={() => desvincular(f.id)}>×</button>
            </li>
          ))}
        </ul>
      )}
      {novo ? (
        <div className="grid" style={{ marginTop: 8 }}>
          <Field label="Fornecedor" span={2}><Select value={novo.fornecedor_id} onChange={(e) => setNovo({ ...novo, fornecedor_id: e.target.value })} options={(rel.data?.fornecedoresCadastro ?? []).map((o) => ({ v: o.id, l: o.nome }))} placeholder="Selecione…" /></Field>
          <Field label="Serviço"><input value={novo.servico} onChange={(e) => setNovo({ ...novo, servico: e.target.value })} placeholder="Ex.: limpeza" /></Field>
          <div className="span-3" style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={vincular} disabled={!novo.fornecedor_id}>Vincular</button>
            <button className="btn" onClick={() => setNovo(null)}>Cancelar</button>
          </div>
        </div>
      ) : <button className="btn" onClick={() => setNovo({ fornecedor_id: '', servico: '' })}>+ Vincular fornecedor</button>}
      {rel.data && rel.data.fornecedoresCadastro.length === 0 && novo && <p className="muted">Nenhuma empresa com tipo Fornecedor cadastrada ainda.</p>}

      <h3>Contratos</h3>
      {rel.data && rel.data.contratos.length === 0 ? <p className="muted">Nenhum contrato cobre esta unidade.</p> : (
        <ul className="plain">
          {rel.data?.contratos.map((c) => (
            <li key={c.id}><Link to={`/contratos?id=${c.id}`}>{c.titulo}</Link> <span className="muted">· {c.tipo} · {c.status} · {money(c.valor_mensal)} · até {fdate(c.data_fim)}</span></li>
          ))}
        </ul>
      )}

      <h3>Operação e facilities</h3>
      {rel.data && rel.data.servicos.length === 0 ? <p className="muted">Nenhum serviço cadastrado para esta unidade.</p> : (
        <ul className="plain">
          {rel.data?.servicos.map((x) => (<li key={x.id}><Link to={`/servicos?id=${x.id}`}>{x.nome}</Link> <span className="muted">· {x.frequencia} · {x.status}{x.custo_mensal != null ? ` · ${money(x.custo_mensal)}/mês` : ''}</span></li>))}
        </ul>
      )}
      <p><Link to={`/servicos?unidade=${u.id}`}>Ver e cadastrar serviços</Link> · <Link to={`/chamados?unidade=${u.id}`}>Chamados{rel.data ? ` (${rel.data.chamadosAbertos} em aberto)` : ''}</Link></p>

      <h3>Projetos de implantação</h3>
      {rel.data && rel.data.projetos.length === 0 ? <p className="muted">Nenhum projeto ligado a esta unidade (escolha a unidade ao editar o projeto).</p> : (
        <ul className="plain">
          {rel.data?.projetos.map((p) => (<li key={p.id}><Link to={`/projetos/${p.id}`}>{p.nome}</Link> <span className="muted">· {p.status.replace('_', ' ')}</span></li>))}
        </ul>
      )}

      <h3>Documentos</h3>
      <Documentos vinculo={{ unidade_id: u.id }} />

      <h3>Histórico de alterações</h3>
      <Historico coluna="unidade_id" id={u.id} />

      {confirmDel && (
        <Confirm
          title="Excluir unidade"
          message={`Excluir “${u.nome}”? Os documentos e fornecedores vinculados a ela também são removidos, e ela sai dos contratos.`}
          confirmLabel="Excluir"
          onCancel={() => setConfirmDel(false)}
          onConfirm={async () => {
            setConfirmDel(false)
            const ok = await act(async () => {
              const rows = unwrap(await supabase.from('unidades').delete().eq('id', u.id).select()) as unknown[]
              if (rows.length === 0) throw new Error('Somente o gestor pode excluir unidades.')
            }, 'Unidade excluída')
            if (ok) onDeleted()
          }}
        />
      )}
    </Modal>
  )
}
