import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { money, nullIfEmpty } from '../lib/format'
import { resumo } from '../lib/cotacao'
import type { Operacao, Organizacao } from '../lib/types'
import { Confirm, Empty, Field, Loading, Modal, PageHead, Select, useAct } from '../components/ui'

type Row = Operacao & {
  itens: { id: string; dispensado: boolean; propostas: { status: string; valor_mensal: number | null }[] }[]
}

export default function Operacoes() {
  const nav = useNavigate()
  const act = useAct()
  const { isGestor } = useAuth()
  const { data, loading, error, reload } = useAsync(
    async () =>
      unwrap(
        await supabase
          .from('operacoes')
          .select('*, cliente:organizacoes!cliente_id(id,nome), itens:cotacao_itens(id,dispensado,propostas:cotacao_propostas(status,valor_mensal))')
          .order('created_at', { ascending: false }),
      ) as Row[],
  )
  const [nova, setNova] = useState(false)
  const [excluir, setExcluir] = useState<Row | null>(null)

  return (
    <>
      <PageHead
        title="Cotações"
        sub="Cada operação reúne o que precisa ser contratado (limpeza, link, ar-condicionado…) e as cotações dos fornecedores."
        actions={<button className="btn btn-primary" onClick={() => setNova(true)}>+ Nova operação</button>}
      />
      {loading && !data ? <Loading error={error} /> : !data || data.length === 0 ? (
        <Empty>Nenhuma operação ainda.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Operação</th><th>Cliente</th><th>Pessoas</th><th>Itens</th><th>Em cotação</th><th>Escolhidos</th><th>Fechado por mês</th>{isGestor && <th />}</tr>
            </thead>
            <tbody>
              {data.map((o) => {
                const r = resumo(o.itens.map((i) => ({ dispensado: i.dispensado, propostas: i.propostas })))
                return (
                  <tr key={o.id} className="clickable" onClick={() => nav(`/operacoes/${o.id}`)}>
                    <td><b>{o.nome}</b><div className="muted">{o.cidade}</div></td>
                    <td>{o.cliente?.nome ?? '—'}</td>
                    <td>{o.pessoas ?? '—'}</td>
                    <td>{r.total}</td>
                    <td>{r.emCotacao}</td>
                    <td>{r.escolhidos}</td>
                    <td>{r.escolhidos ? money(r.fechado) : '—'}</td>
                    {isGestor && (
                      <td style={{ width: 36 }}>
                        <button className="icon-btn row-del" aria-label={`Excluir ${o.nome}`} title="Excluir operação" onClick={(e) => { e.stopPropagation(); setExcluir(o) }}>×</button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {nova && <OperacaoForm onClose={() => setNova(false)} onSaved={(o) => nav(`/operacoes/${o.id}`)} />}
      {excluir && (
        <Confirm
          title="Excluir operação"
          message={`Excluir "${excluir.nome}" com todos os itens e propostas? Não há como desfazer.`}
          confirmLabel="Excluir"
          onCancel={() => setExcluir(null)}
          onConfirm={async () => {
            const o = excluir
            setExcluir(null)
            const ok = await act(async () => {
              const rows = unwrap(await supabase.from('operacoes').delete().eq('id', o.id).select()) as unknown[]
              if (rows.length === 0) throw new Error('Sem permissão para excluir esta operação.')
            }, 'Operação excluída')
            if (ok) reload()
          }}
        />
      )}
    </>
  )
}

export function OperacaoForm({ op, onClose, onSaved }: { op?: Operacao | null; onClose: () => void; onSaved: (o: Operacao) => void }) {
  const act = useAct()
  const { data: orgs } = useAsync(async () => unwrap(await supabase.from('organizacoes').select('id,nome').order('nome')) as Pick<Organizacao, 'id' | 'nome'>[])
  const { data: contratos } = useAsync(async () => unwrap(await supabase.from('contratos').select('id,titulo,cliente_id').order('titulo')) as { id: string; titulo: string; cliente_id: string }[])
  const [d, setD] = useState({
    nome: op?.nome ?? '',
    cliente_id: op?.cliente_id ?? '',
    contrato_id: op?.contrato_id ?? '',
    cidade: op?.cidade ?? '',
    pessoas: op?.pessoas != null ? String(op.pessoas) : '',
    observacoes: op?.observacoes ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof d, v: string) => setD((x) => ({ ...x, [k]: v }))

  async function save() {
    if (!d.nome.trim()) return
    setBusy(true)
    const payload = {
      nome: d.nome.trim(),
      cliente_id: nullIfEmpty(d.cliente_id),
      contrato_id: nullIfEmpty(d.contrato_id),
      cidade: nullIfEmpty(d.cidade),
      pessoas: d.pessoas.trim() === '' ? null : Number(d.pessoas),
      observacoes: nullIfEmpty(d.observacoes),
    }
    let saved: Operacao | null = null
    const ok = await act(async () => {
      const q = op ? supabase.from('operacoes').update(payload).eq('id', op.id) : supabase.from('operacoes').insert(payload)
      saved = unwrap(await q.select().single()) as Operacao
    }, op ? 'Operação atualizada' : 'Operação criada')
    setBusy(false)
    if (ok && saved) onSaved(saved)
  }

  return (
    <Modal
      title={op ? 'Editar operação' : 'Nova operação'}
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={save} disabled={busy || !d.nome.trim()}>Salvar</button></>}
    >
      <div className="grid">
        <Field label="Nome *" span={3} hint="Ex.: XP Ribeirão Preto"><input value={d.nome} onChange={(e) => set('nome', e.target.value)} autoFocus /></Field>
        <Field label="Cliente" span={3}>
          <Select value={d.cliente_id} onChange={(e) => setD((x) => ({ ...x, cliente_id: e.target.value, contrato_id: '' }))} options={(orgs ?? []).map((o) => ({ v: o.id, l: o.nome }))} placeholder="— selecione —" />
        </Field>
        <Field label="Contrato" span={3} hint="Opcional · quando a cotação virou contrato, os fornecedores escolhidos entram no custo previsto dele">
          <Select value={d.contrato_id} onChange={(e) => set('contrato_id', e.target.value)} options={(contratos ?? []).filter((c) => c.cliente_id === d.cliente_id).map((c) => ({ v: c.id, l: c.titulo }))} placeholder="— nenhum —" />
        </Field>
        <Field label="Cidade" span={2}><input value={d.cidade} onChange={(e) => set('cidade', e.target.value)} /></Field>
        <Field label="Pessoas"><input type="number" min="1" value={d.pessoas} onChange={(e) => set('pessoas', e.target.value)} /></Field>
        <Field label="Observações" span={3}><textarea rows={2} value={d.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
