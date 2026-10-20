import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { fdate, isOverdue, todayISO } from '../lib/format'
import type { Tarefa } from '../lib/types'
import { Badge, Confirm, Empty, Loading, PageHead, useAct } from '../components/ui'
import TarefaForm from '../components/TarefaForm'

type Aba = 'minhas' | 'equipe' | 'atrasadas'

export function ligacao(t: Tarefa) {
  if (t.projeto) return <Link to={`/projetos/${t.projeto.id}`}>Projeto: {t.projeto.nome}</Link>
  if (t.oportunidade) return <Link to={`/oportunidades/${t.oportunidade.id}`}>{t.oportunidade.titulo}</Link>
  if (t.organizacao) return <>Empresa: {t.organizacao.nome}</>
  if (t.contato) return <>Contato: {t.contato.nome}</>
  return null
}

export default function Tarefas() {
  const { profile } = useAuth()
  const act = useAct()
  const [aba, setAba] = useState<Aba>('minhas')
  const [form, setForm] = useState<Tarefa | 'nova' | null>(null)
  const [excluir, setExcluir] = useState<Tarefa | null>(null)
  const { data, loading, error, reload } = useAsync(async () =>
    unwrap(
      await supabase
        .from('tarefas')
        .select('*, oportunidade:oportunidades(id,titulo), contato:contatos(id,nome), projeto:projetos(id,nome), organizacao:organizacoes(id,nome), responsavel:profiles!responsavel_id(nome)')
        .neq('status', 'concluida')
        .order('prazo', { ascending: true, nullsFirst: false }),
    ) as Tarefa[],
  )

  async function concluir(t: Tarefa) {
    const ok = await act(async () => unwrap(await supabase.from('tarefas').update({ status: 'concluida' }).eq('id', t.id).select()))
    if (ok) reload()
  }

  const todas = data ?? []
  const hoje = todayISO()
  const minhas = todas.filter((t) => t.responsavel_id === profile?.id)
  const atrasadas = todas.filter((t) => isOverdue(t.prazo))

  const grupos = useMemo(() => {
    if (aba === 'minhas')
      return [
        { nome: 'Vencidas', itens: minhas.filter((t) => isOverdue(t.prazo)) },
        { nome: 'Hoje', itens: minhas.filter((t) => t.prazo === hoje) },
        { nome: 'Próximas', itens: minhas.filter((t) => t.prazo && t.prazo > hoje) },
        { nome: 'Sem prazo', itens: minhas.filter((t) => !t.prazo) },
      ]
    const base = aba === 'atrasadas' ? atrasadas : todas
    const por = new Map<string, Tarefa[]>()
    base.forEach((t) => {
      const k = t.responsavel?.nome ?? 'Sem responsável'
      por.set(k, [...(por.get(k) ?? []), t])
    })
    return [...por.entries()]
      .map(([nome, itens]) => ({ nome, itens }))
      .sort((a, b) => b.itens.filter((t) => isOverdue(t.prazo)).length - a.itens.filter((t) => isOverdue(t.prazo)).length || a.nome.localeCompare(b.nome, 'pt-BR'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, data, profile])

  const visiveis = grupos.filter((g) => g.itens.length)

  return (
    <>
      <PageHead
        title="Tarefas"
        sub="Toda tarefa está ligada a uma oportunidade, projeto, empresa ou contato, e toda tarefa em andamento tem responsável."
        actions={<button className="btn btn-primary" onClick={() => setForm('nova')}>+ Nova tarefa</button>}
      />
      <div className="tabs" role="tablist">
        <button className={`tab ${aba === 'minhas' ? 'on' : ''}`} onClick={() => setAba('minhas')}>Minhas ({minhas.length})</button>
        <button className={`tab ${aba === 'equipe' ? 'on' : ''}`} onClick={() => setAba('equipe')}>Equipe ({todas.length})</button>
        <button className={`tab ${aba === 'atrasadas' ? 'on' : ''}`} onClick={() => setAba('atrasadas')}>Atrasadas por responsável ({atrasadas.length})</button>
      </div>

      {loading && !data ? <Loading error={error} /> : visiveis.length === 0 ? <Empty>{aba === 'atrasadas' ? 'Nada atrasado.' : 'Nenhuma tarefa aberta.'}</Empty> : (
        visiveis.map((g) => (
          <section key={g.nome} className="section">
            <h3>{g.nome} <span className="muted">({g.itens.length}{aba !== 'minhas' && g.itens.some((t) => isOverdue(t.prazo)) ? ` · ${g.itens.filter((t) => isOverdue(t.prazo)).length} atrasada(s)` : ''})</span></h3>
            <div className="table-wrap">
              <table>
                <tbody>
                  {g.itens.map((t) => (
                    <tr key={t.id}>
                      <td style={{ width: 34 }}><input type="checkbox" aria-label="Concluir" onChange={() => concluir(t)} /></td>
                      <td>
                        <button className="link-btn" onClick={() => setForm(t)}>{t.titulo}</button>{' '}
                        {t.tipo === 'aprovacao' && <Badge tone="info">Aprovação</Badge>}
                        {t.prioridade === 'alta' && <Badge tone="warn">Alta</Badge>}
                        {t.status === 'bloqueada' && <Badge tone="bad">Bloqueada</Badge>}
                        {t.status === 'em_andamento' && <Badge tone="info">Em andamento</Badge>}
                        <div className="muted">{ligacao(t)}</div>
                      </td>
                      <td className={isOverdue(t.prazo) ? 'overdue mono' : 'mono'} style={{ width: 100 }}>{fdate(t.prazo)}</td>
                      {aba === 'minhas' && <td className="muted" style={{ width: 130 }}>{t.responsavel?.nome ?? '—'}</td>}
                      <td style={{ width: 34 }}><button className="icon-btn row-del" title="Excluir tarefa" aria-label={`Excluir ${t.titulo}`} onClick={() => setExcluir(t)}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
      {form && <TarefaForm tarefa={form === 'nova' ? null : form} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload() }} />}
      {excluir && (
        <Confirm
          title="Excluir tarefa"
          message={`Excluir “${excluir.titulo}”?`}
          confirmLabel="Excluir"
          onCancel={() => setExcluir(null)}
          onConfirm={async () => {
            const t = excluir
            setExcluir(null)
            const ok = await act(async () => unwrap(await supabase.from('tarefas').delete().eq('id', t.id).select()), 'Tarefa excluída')
            if (ok) reload()
          }}
        />
      )}
    </>
  )
}
