import { Fragment, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { money, nullIfEmpty } from '../lib/format'
import { baixar, csvCotacao, menorProposta, recebidas, resumo, statusItem, valorEscolhido } from '../lib/cotacao'
import { STATUS_PROPOSTA_COTACAO, type CotacaoItem, type CotacaoProposta, type Operacao, type Organizacao } from '../lib/types'
import { Badge, Confirm, Empty, Field, Loading, Modal, PageHead, Select, useAct } from '../components/ui'
import OrgForm from '../components/OrgForm'
import { OperacaoForm } from './Operacoes'

export default function OperacaoDetalhe() {
  const { id = '' } = useParams()
  const act = useAct()
  const { data, loading, error, reload } = useAsync(async () => {
    const [o, i, f] = await Promise.all([
      supabase.from('operacoes').select('*, cliente:organizacoes!cliente_id(id,nome)').eq('id', id).single(),
      supabase
        .from('cotacao_itens')
        .select('*, propostas:cotacao_propostas(*, fornecedor:organizacoes!fornecedor_id(id,nome))')
        .eq('operacao_id', id)
        .order('ordem')
        .order('created_at'),
      supabase.from('organizacoes').select('id,nome').contains('papeis', ['fornecedor']).order('nome'),
    ])
    return {
      op: unwrap(o) as Operacao,
      itens: unwrap(i) as CotacaoItem[],
      fornecedores: unwrap(f) as Pick<Organizacao, 'id' | 'nome'>[],
    }
  }, [id])

  const [aberto, setAberto] = useState<string | null>(null)
  const [fResp, setFResp] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [editOp, setEditOp] = useState(false)
  const [itemForm, setItemForm] = useState<CotacaoItem | 'novo' | null>(null)
  const [propForm, setPropForm] = useState<{ item: CotacaoItem; prop: CotacaoProposta | null } | null>(null)
  const [delItem, setDelItem] = useState<CotacaoItem | null>(null)
  const [delProp, setDelProp] = useState<CotacaoProposta | null>(null)

  const itens = data?.itens ?? []
  const lista = useMemo(
    () => itens.filter((i) => (!fResp || i.responsavel === fResp) && (!fStatus || statusItem(i).label === fStatus)),
    [itens, fResp, fStatus],
  )
  if (loading && !data) return <Loading error={error} />
  if (!data) return <Loading error={error ?? 'Operação não encontrada'} />
  const { op, fornecedores } = data
  const r = resumo(itens)
  const responsaveis = [...new Set(itens.map((i) => i.responsavel).filter((x): x is string => !!x))]

  async function patchProposta(p: CotacaoProposta, patch: Partial<CotacaoProposta>, msg?: string) {
    const ok = await act(async () => unwrap(await supabase.from('cotacao_propostas').update(patch).eq('id', p.id).select()), msg)
    if (ok) reload()
  }
  async function escolher(item: CotacaoItem, p: CotacaoProposta) {
    const ok = await act(async () => {
      const atual = item.propostas.find((x) => x.status === 'escolhido' && x.id !== p.id)
      if (atual) unwrap(await supabase.from('cotacao_propostas').update({ status: 'recebido' }).eq('id', atual.id).select())
      unwrap(await supabase.from('cotacao_propostas').update({ status: 'escolhido' }).eq('id', p.id).select())
    }, `${p.fornecedor?.nome ?? 'Fornecedor'} escolhido para ${item.nome}`)
    if (ok) reload()
  }

  return (
    <>
      <PageHead
        title={op.nome}
        sub={[op.cliente?.nome, op.cidade, op.pessoas ? `${op.pessoas} pessoas` : null].filter(Boolean).join(' · ')}
        actions={
          <>
            <Link to="/operacoes" className="btn">← Operações</Link>
            <button className="btn" onClick={() => baixar(`cotacoes-${op.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`, csvCotacao(itens))}>Exportar CSV</button>
            <button className="btn" onClick={() => setEditOp(true)}>Editar</button>
            <button className="btn btn-primary" onClick={() => setItemForm('novo')}>+ Novo item</button>
          </>
        }
      />
      {op.observacoes && <p className="muted" style={{ marginTop: -8 }}>{op.observacoes}</p>}

      <div className="kpis">
        <div className="kpi"><b>{r.total}</b><span>itens a contratar</span></div>
        <div className="kpi"><b>{r.emCotacao}</b><span>em cotação</span></div>
        <div className="kpi"><b>{r.comProposta}</b><span>com proposta, sem escolha</span></div>
        <div className="kpi"><b>{r.escolhidos}</b><span>fornecedores escolhidos</span></div>
        <div className="kpi"><b style={{ fontSize: 22 }}>{money(r.fechado)}</b><span>fechado por mês</span></div>
        <div className="kpi" title="Itens sem escolha entram pela menor proposta recebida. As propostas podem não ser comparáveis (ex.: com e sem insumos).">
          <b style={{ fontSize: 22 }}>{money(r.referencia)}</b><span>referência por mês (menor proposta)</span>
        </div>
      </div>

      <div className="toolbar">
        <Select value={fResp} onChange={(e) => setFResp(e.target.value)} placeholder="Todos os responsáveis" options={responsaveis} />
        <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)} placeholder="Todos os status" options={['Em cotação', 'Proposta recebida', 'Fornecedor escolhido', 'Dispensado']} />
      </div>

      {itens.length === 0 ? <Empty>Nenhum item ainda. Use “+ Novo item”.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nº</th><th>Item</th><th>Responsável</th><th>Status</th><th>Propostas</th><th>Valor mensal</th><th>Observações</th><th /></tr></thead>
            <tbody>
              {lista.map((i) => {
                const st = statusItem(i)
                const esc = valorEscolhido(i)
                const min = menorProposta(i)
                const rec = recebidas(i).length
                const idx = itens.indexOf(i) + 1
                return (
                  <Fragment key={i.id}>
                    <tr className="clickable" onClick={() => setAberto(aberto === i.id ? null : i.id)}>
                      <td className="mono">{idx}</td>
                      <td><b>{i.nome}</b></td>
                      <td>{i.responsavel ?? '—'}</td>
                      <td><Badge tone={st.tone}>{st.label}</Badge></td>
                      <td>{rec} recebida{rec === 1 ? '' : 's'} <span className="muted">/ {i.propostas.length} fornecedor{i.propostas.length === 1 ? '' : 'es'}</span></td>
                      <td>{esc != null ? money(esc) : min != null ? <span title="Menor proposta recebida">{rec > 1 ? 'a partir de ' : ''}{money(min)}</span> : '—'}</td>
                      <td className="muted" style={{ maxWidth: 280 }}>{i.observacoes}</td>
                      <td style={{ width: 36 }}>
                        <button className="icon-btn row-del" aria-label={`Excluir ${i.nome}`} title="Excluir item" onClick={(e) => { e.stopPropagation(); setDelItem(i) }}>×</button>
                      </td>
                    </tr>
                    {aberto === i.id && (
                      <tr>
                        <td colSpan={8} style={{ background: '#f6f3ec' }}>
                          <div className="stack">
                            {i.propostas.length === 0 ? <p className="muted">Nenhum fornecedor ainda para este item.</p> : (
                              <table>
                                <thead><tr><th>Fornecedor</th><th>O que a proposta oferece</th><th>Status</th><th>Valor mensal</th><th /></tr></thead>
                                <tbody>
                                  {i.propostas.map((p) => (
                                    <tr key={p.id}>
                                      <td><b>{p.fornecedor?.nome}</b></td>
                                      <td style={{ whiteSpace: 'pre-wrap', maxWidth: 420 }}>{p.escopo ?? '—'}{p.observacoes ? <div className="muted">{p.observacoes}</div> : null}</td>
                                      <td style={{ width: 190 }}>
                                        <Select value={p.status} onChange={(e) => patchProposta(p, { status: e.target.value as CotacaoProposta['status'] })} options={STATUS_PROPOSTA_COTACAO.filter((s) => s.v !== 'escolhido' || p.status === 'escolhido').map((s) => ({ v: s.v, l: s.l }))} placeholder="—" />
                                      </td>
                                      <td>{money(p.valor_mensal)}</td>
                                      <td style={{ whiteSpace: 'nowrap' }}>
                                        {p.status === 'escolhido' ? (
                                          <button className="btn btn-sm" onClick={() => patchProposta(p, { status: 'recebido' }, 'Escolha desfeita')}>Desfazer escolha</button>
                                        ) : (
                                          <button className="btn btn-sm" disabled={p.valor_mensal == null} title={p.valor_mensal == null ? 'Informe o valor da proposta antes de escolher' : ''} onClick={() => escolher(i, p)}>Escolher</button>
                                        )}{' '}
                                        <button className="btn btn-sm" onClick={() => setPropForm({ item: i, prop: p })}>Editar</button>{' '}
                                        <button className="btn btn-sm" aria-label="Remover proposta" onClick={() => setDelProp(p)}>×</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button className="btn btn-primary btn-sm" onClick={() => setPropForm({ item: i, prop: null })}>+ Fornecedor / proposta</button>
                              <button className="btn btn-sm" onClick={() => setItemForm(i)}>Editar item</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editOp && <OperacaoForm op={op} onClose={() => setEditOp(false)} onSaved={() => { setEditOp(false); reload() }} />}
      {itemForm && (
        <ItemForm
          operacaoId={op.id}
          item={itemForm === 'novo' ? null : itemForm}
          proximaOrdem={Math.max(0, ...itens.map((x) => x.ordem)) + 1}
          responsaveis={responsaveis}
          onClose={() => setItemForm(null)}
          onSaved={() => { setItemForm(null); reload() }}
        />
      )}
      {propForm && (
        <PropostaForm
          item={propForm.item}
          prop={propForm.prop}
          fornecedores={fornecedores}
          onClose={() => setPropForm(null)}
          onSaved={() => { setPropForm(null); reload() }}
          onFornecedorCriado={reload}
        />
      )}
      {delItem && (
        <Confirm
          title="Excluir item"
          message={`Excluir "${delItem.nome}" e as ${delItem.propostas.length} proposta(s) dele?`}
          confirmLabel="Excluir"
          onCancel={() => setDelItem(null)}
          onConfirm={async () => {
            const i = delItem
            setDelItem(null)
            const ok = await act(async () => unwrap(await supabase.from('cotacao_itens').delete().eq('id', i.id).select()), 'Item excluído')
            if (ok) reload()
          }}
        />
      )}
      {delProp && (
        <Confirm
          title="Remover proposta"
          message={`Remover ${delProp.fornecedor?.nome ?? 'o fornecedor'} deste item?`}
          confirmLabel="Remover"
          onCancel={() => setDelProp(null)}
          onConfirm={async () => {
            const p = delProp
            setDelProp(null)
            const ok = await act(async () => unwrap(await supabase.from('cotacao_propostas').delete().eq('id', p.id).select()), 'Proposta removida')
            if (ok) reload()
          }}
        />
      )}
    </>
  )
}

function ItemForm({ operacaoId, item, proximaOrdem, responsaveis, onClose, onSaved }: {
  operacaoId: string; item: CotacaoItem | null; proximaOrdem: number; responsaveis: string[]; onClose: () => void; onSaved: () => void
}) {
  const act = useAct()
  const [d, setD] = useState({ nome: item?.nome ?? '', responsavel: item?.responsavel ?? '', dispensado: item?.dispensado ?? false, observacoes: item?.observacoes ?? '' })
  const [busy, setBusy] = useState(false)
  async function save() {
    if (!d.nome.trim()) return
    setBusy(true)
    const payload = { nome: d.nome.trim(), responsavel: nullIfEmpty(d.responsavel), dispensado: d.dispensado, observacoes: nullIfEmpty(d.observacoes) }
    const ok = await act(async () => {
      const q = item
        ? supabase.from('cotacao_itens').update(payload).eq('id', item.id)
        : supabase.from('cotacao_itens').insert({ ...payload, operacao_id: operacaoId, ordem: proximaOrdem })
      unwrap(await q.select())
    }, item ? 'Item atualizado' : 'Item criado')
    setBusy(false)
    if (ok) onSaved()
  }
  return (
    <Modal title={item ? 'Editar item' : 'Novo item'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={save} disabled={busy || !d.nome.trim()}>Salvar</button></>}>
      <div className="grid">
        <Field label="Item *" span={3} hint="Ex.: Limpeza, Ar-condicionado, Link dedicado"><input value={d.nome} onChange={(e) => setD({ ...d, nome: e.target.value })} autoFocus /></Field>
        <Field label="Responsável pela cotação" span={2}>
          <input list="responsaveis" value={d.responsavel} onChange={(e) => setD({ ...d, responsavel: e.target.value })} />
          <datalist id="responsaveis">{responsaveis.map((r) => <option key={r} value={r} />)}</datalist>
        </Field>
        <Field label=" "><label className="check"><input type="checkbox" checked={d.dispensado} onChange={(e) => setD({ ...d, dispensado: e.target.checked })} /> Dispensado</label></Field>
        <Field label="Observações / pendências" span={3}><textarea rows={3} value={d.observacoes} onChange={(e) => setD({ ...d, observacoes: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}

function PropostaForm({ item, prop, fornecedores, onClose, onSaved, onFornecedorCriado }: {
  item: CotacaoItem; prop: CotacaoProposta | null; fornecedores: Pick<Organizacao, 'id' | 'nome'>[]
  onClose: () => void; onSaved: () => void; onFornecedorCriado: () => void
}) {
  const act = useAct()
  const [d, setD] = useState({
    fornecedor_id: prop?.fornecedor_id ?? '',
    escopo: prop?.escopo ?? '',
    status: prop?.status ?? 'pesquisado',
    valor_mensal: prop?.valor_mensal != null ? String(prop.valor_mensal) : '',
    observacoes: prop?.observacoes ?? '',
  })
  const [novo, setNovo] = useState(false)
  const [busy, setBusy] = useState(false)
  const precisaValor = (d.status === 'recebido' || d.status === 'escolhido') && d.valor_mensal.trim() === ''
  async function save() {
    if (!d.fornecedor_id || precisaValor) return
    setBusy(true)
    const payload = {
      fornecedor_id: d.fornecedor_id,
      escopo: nullIfEmpty(d.escopo),
      status: d.status,
      valor_mensal: d.valor_mensal.trim() === '' ? null : Number(d.valor_mensal),
      observacoes: nullIfEmpty(d.observacoes),
    }
    const ok = await act(async () => {
      const q = prop ? supabase.from('cotacao_propostas').update(payload).eq('id', prop.id) : supabase.from('cotacao_propostas').insert({ ...payload, item_id: item.id })
      unwrap(await q.select())
    }, prop ? 'Proposta atualizada' : 'Proposta registrada')
    setBusy(false)
    if (ok) onSaved()
  }
  return (
    <>
      <Modal title={`${prop ? 'Editar proposta' : 'Novo fornecedor'} · ${item.nome}`} onClose={onClose} wide
        footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={save} disabled={busy || !d.fornecedor_id || precisaValor}>Salvar</button></>}>
        <div className="grid">
          <Field label="Fornecedor *" span={2}>
            <Select value={d.fornecedor_id} onChange={(e) => setD({ ...d, fornecedor_id: e.target.value })} options={fornecedores.map((f) => ({ v: f.id, l: f.nome }))} placeholder="Selecione…" />
          </Field>
          <Field label=" "><button type="button" className="btn" onClick={() => setNovo(true)}>+ Cadastrar fornecedor</button></Field>
          <Field label="Status">
            <Select value={d.status} onChange={(e) => setD({ ...d, status: e.target.value as CotacaoProposta['status'] })} options={STATUS_PROPOSTA_COTACAO.filter((s) => s.v !== 'escolhido' || prop?.status === 'escolhido').map((s) => ({ v: s.v, l: s.l }))} placeholder="—" />
          </Field>
          <Field label="Valor mensal (R$)" hint={precisaValor ? 'Obrigatório para proposta recebida' : undefined}>
            <input type="number" min="0" step="0.01" value={d.valor_mensal} onChange={(e) => setD({ ...d, valor_mensal: e.target.value })} />
          </Field>
          <Field label="O que a proposta oferece" span={3} hint="Escopo, o que está incluso, prazo mínimo de contrato…"><textarea rows={4} value={d.escopo} onChange={(e) => setD({ ...d, escopo: e.target.value })} /></Field>
          <Field label="Observações" span={3}><input value={d.observacoes} onChange={(e) => setD({ ...d, observacoes: e.target.value })} /></Field>
        </div>
        <p className="muted">Fluxo: Pesquisado → Orçamento solicitado → Proposta recebida (com valor) → Escolhido. Fornecedores cadastrados aqui também aparecem em Organizações.</p>
      </Modal>
      {novo && (
        <OrgForm
          defaultPapel="fornecedor"
          onClose={() => setNovo(false)}
          onSaved={(o) => { setNovo(false); onFornecedorCriado(); setD((x) => ({ ...x, fornecedor_id: o.id })) }}
        />
      )}
    </>
  )
}
