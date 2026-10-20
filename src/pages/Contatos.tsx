import { useMemo, useState } from 'react'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { daysSince, fdate, isOverdue, nullIfEmpty, todayISO } from '../lib/format'
import { CLASSIFICACOES, type Contato, type Organizacao } from '../lib/types'
import { Badge, Confirm, Empty, Field, Loading, Modal, PageHead, Select, WobaBadge, useAct } from '../components/ui'
import Interacoes from '../components/Interacoes'

type Row = Contato & { organizacao: { id: string; nome: string; atendida_woba: 'Sim' | 'Não' | 'Validar' } | null }

export default function Contatos() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [c, o] = await Promise.all([
      supabase.from('contatos').select('*, organizacao:organizacoes(id,nome,atendida_woba)').order('created_at', { ascending: false }),
      supabase.from('organizacoes').select('id,nome').order('nome'),
    ])
    return { contatos: unwrap(c) as Row[], orgs: unwrap(o) as Pick<Organizacao, 'id' | 'nome'>[] }
  })
  const [q, setQ] = useState('')
  const [cls, setCls] = useState('')
  const [pend, setPend] = useState(false)
  const [edit, setEdit] = useState<Row | 'novo' | null>(null)

  const pendente = (c: Row) =>
    !c.mensagem_continuidade_enviada && !!c.data_contato && daysSince(c.data_contato) >= 2

  const lista = useMemo(
    () =>
      (data?.contatos ?? []).filter(
        (c) =>
          (!q || `${c.nome} ${c.cargo ?? ''} ${c.organizacao?.nome ?? ''} ${c.contexto ?? ''}`.toLowerCase().includes(q.toLowerCase())) &&
          (!cls || c.classificacao === cls) &&
          (!pend || pendente(c)),
      ),
    [data, q, cls, pend],
  )

  return (
    <>
      <PageHead
        title="Contatos"
        sub="Networking: registre cada pessoa, o contexto e a mensagem de continuidade antes que o contato esfrie. Contatos de empresas atendidas pela Woba podem ser registrados normalmente."
        actions={
          <button className="btn btn-primary" onClick={() => setEdit('novo')}>
            + Novo contato
          </button>
        }
      />
      <div className="toolbar">
        <input placeholder="Buscar por nome, cargo, empresa ou evento…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={cls} onChange={(e) => setCls(e.target.value)} placeholder="Todas as classificações" options={CLASSIFICACOES} />
        <label className="check">
          <input type="checkbox" checked={pend} onChange={(e) => setPend(e.target.checked)} />
          Continuidade pendente
        </label>
      </div>

      {loading && !data ? (
        <Loading error={error} />
      ) : lista.length === 0 ? (
        <Empty>Nenhum contato encontrado.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Empresa</th>
                <th>Classificação</th>
                <th>Contexto</th>
                <th>Continuidade</th>
                <th>Próximo passo</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => setEdit(c)}>
                  <td>
                    <b>{c.nome}</b>
                    <div className="muted">{c.cargo}</div>
                  </td>
                  <td>
                    {c.organizacao?.nome ?? '—'} <WobaBadge v={c.organizacao?.atendida_woba} />
                  </td>
                  <td>{c.classificacao ?? '—'}</td>
                  <td>
                    {c.contexto ?? '—'}
                    <div className="muted">{fdate(c.data_contato)}</div>
                  </td>
                  <td>
                    {c.mensagem_continuidade_enviada ? (
                      <Badge tone="ok">Enviada {fdate(c.data_envio)}</Badge>
                    ) : pendente(c) ? (
                      <Badge tone="warn">Pendente há {daysSince(c.data_contato)} d</Badge>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className={isOverdue(c.proximo_passo_data) ? 'overdue' : ''}>
                    {c.proximo_passo ?? '—'}
                    <div className="muted">{fdate(c.proximo_passo_data)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {edit && (
        <ContatoForm
          contato={edit === 'novo' ? null : edit}
          orgs={data?.orgs ?? []}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null)
            reload()
          }}
        />
      )}
    </>
  )
}

function ContatoForm({
  contato,
  orgs,
  onClose,
  onSaved,
}: {
  contato: Row | null
  orgs: Pick<Organizacao, 'id' | 'nome'>[]
  onClose: () => void
  onSaved: () => void
}) {
  const { isGestor } = useAuth()
  const act = useAct()
  const [d, setD] = useState({
    nome: contato?.nome ?? '',
    organizacao_id: contato?.organizacao_id ?? '',
    cargo: contato?.cargo ?? '',
    email: contato?.email ?? '',
    telefone: contato?.telefone ?? '',
    contexto: contato?.contexto ?? '',
    data_contato: contato?.data_contato ?? todayISO(),
    assunto: contato?.assunto ?? '',
    classificacao: contato?.classificacao ?? '',
    mensagem_continuidade_enviada: contato?.mensagem_continuidade_enviada ?? false,
    data_envio: contato?.data_envio ?? '',
    resposta: contato?.resposta ?? '',
    proximo_passo: contato?.proximo_passo ?? '',
    proximo_passo_data: contato?.proximo_passo_data ?? '',
    observacoes: contato?.observacoes ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }))

  async function save() {
    if (!d.nome.trim()) return
    setBusy(true)
    const payload = {
      nome: d.nome.trim(),
      organizacao_id: nullIfEmpty(d.organizacao_id),
      cargo: nullIfEmpty(d.cargo),
      email: nullIfEmpty(d.email),
      telefone: nullIfEmpty(d.telefone),
      contexto: nullIfEmpty(d.contexto),
      data_contato: nullIfEmpty(d.data_contato),
      assunto: nullIfEmpty(d.assunto),
      classificacao: nullIfEmpty(d.classificacao),
      mensagem_continuidade_enviada: d.mensagem_continuidade_enviada,
      data_envio: d.mensagem_continuidade_enviada ? nullIfEmpty(d.data_envio) ?? todayISO() : null,
      resposta: nullIfEmpty(d.resposta),
      proximo_passo: nullIfEmpty(d.proximo_passo),
      proximo_passo_data: nullIfEmpty(d.proximo_passo_data),
      observacoes: nullIfEmpty(d.observacoes),
    }
    const ok = await act(
      async () => {
        const q = contato
          ? supabase.from('contatos').update(payload).eq('id', contato.id)
          : supabase.from('contatos').insert(payload)
        unwrap(await q.select())
      },
      contato ? 'Contato atualizado' : 'Contato cadastrado',
    )
    setBusy(false)
    if (ok) onSaved()
  }

  return (
    <Modal
      title={contato ? contato.nome : 'Novo contato'}
      onClose={onClose}
      wide
      footer={
        <>
          {contato && isGestor && (
            <button className="btn btn-danger" onClick={() => setConfirmDel(true)}>
              Excluir
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !d.nome.trim()}>
            Salvar
          </button>
        </>
      }
    >
      <div className="grid">
        <Field label="Nome *" span={2}>
          <input value={d.nome} onChange={(e) => set('nome', e.target.value)} autoFocus />
        </Field>
        <Field label="Cargo">
          <input value={d.cargo} onChange={(e) => set('cargo', e.target.value)} />
        </Field>
        <Field label="Empresa" span={2}>
          <Select value={d.organizacao_id} onChange={(e) => set('organizacao_id', e.target.value)} options={orgs.map((o) => ({ v: o.id, l: o.nome }))} placeholder="— sem empresa —" />
        </Field>
        <Field label="Classificação">
          <Select value={d.classificacao} onChange={(e) => set('classificacao', e.target.value)} options={CLASSIFICACOES} />
        </Field>
        <Field label="E-mail">
          <input type="email" value={d.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Telefone / WhatsApp">
          <input value={d.telefone} onChange={(e) => set('telefone', e.target.value)} />
        </Field>
        <Field label="Data do contato">
          <input type="date" value={d.data_contato} onChange={(e) => set('data_contato', e.target.value)} />
        </Field>
        <Field label="Contexto (evento ou indicação)" span={2}>
          <input value={d.contexto} onChange={(e) => set('contexto', e.target.value)} placeholder="Ex.: Buildings Summit 2026" />
        </Field>
        <Field label="Assunto da conversa" span={3}>
          <input value={d.assunto} onChange={(e) => set('assunto', e.target.value)} />
        </Field>
        <Field label="Mensagem de continuidade">
          <label className="check">
            <input type="checkbox" checked={d.mensagem_continuidade_enviada} onChange={(e) => set('mensagem_continuidade_enviada', e.target.checked)} />
            Enviada
          </label>
        </Field>
        {d.mensagem_continuidade_enviada && (
          <Field label="Data do envio">
            <input type="date" value={d.data_envio} onChange={(e) => set('data_envio', e.target.value)} />
          </Field>
        )}
        <Field label="Resposta" span={d.mensagem_continuidade_enviada ? undefined : 2}>
          <input value={d.resposta} onChange={(e) => set('resposta', e.target.value)} />
        </Field>
        <Field label="Próximo passo" span={2}>
          <input value={d.proximo_passo} onChange={(e) => set('proximo_passo', e.target.value)} />
        </Field>
        <Field label="Prazo do próximo passo">
          <input type="date" value={d.proximo_passo_data} onChange={(e) => set('proximo_passo_data', e.target.value)} />
        </Field>
        <Field label="Observações" span={3}>
          <textarea rows={2} value={d.observacoes} onChange={(e) => set('observacoes', e.target.value)} />
        </Field>
      </div>

      {contato && (
        <>
          <h3>Interações</h3>
          <Interacoes contatoId={contato.id} onChanged={onSaved} />
        </>
      )}

      {confirmDel && contato && (
        <Confirm
          title="Excluir contato"
          message={`Excluir ${contato.nome}?`}
          confirmLabel="Excluir"
          onCancel={() => setConfirmDel(false)}
          onConfirm={async () => {
            setConfirmDel(false)
            const ok = await act(async () => unwrap(await supabase.from('contatos').delete().eq('id', contato.id).select()), 'Contato excluído')
            if (ok) onSaved()
          }}
        />
      )}
    </Modal>
  )
}
