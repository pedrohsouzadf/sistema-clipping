import { useState } from 'react'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { nullIfEmpty } from '../lib/format'
import { nomePessoa } from '../lib/papeis'
import { PRIORIDADES, STATUS_TAREFA, type Profile, type ProjetoEtapa, type Tarefa } from '../lib/types'
import { Field, Modal, Select, useAct } from './ui'

/** Objeto de negócio ao qual a tarefa pertence (pelo menos um é obrigatório). */
export type Vinculo = { oportunidade_id?: string; projeto_id?: string; organizacao_id?: string; contato_id?: string }
/** Documentos também podem ser de um contrato ou de uma unidade. */
export type VinculoDoc = Vinculo & { contrato_id?: string; unidade_id?: string }
type Alvo = 'oportunidade' | 'projeto' | 'organizacao'
type Lite = { id: string; nome: string }

export default function TarefaForm({
  tarefa,
  vinculo,
  onClose,
  onSaved,
}: {
  tarefa?: Tarefa | null
  vinculo?: Vinculo
  onClose: () => void
  onSaved: () => void
}) {
  const act = useAct()
  const { profile } = useAuth()
  const fixo = vinculo ?? (tarefa
    ? { oportunidade_id: tarefa.oportunidade_id ?? undefined, projeto_id: tarefa.projeto_id ?? undefined, organizacao_id: tarefa.organizacao_id ?? undefined, contato_id: tarefa.contato_id ?? undefined }
    : undefined)
  const temFixo = !!fixo && Object.values(fixo).some(Boolean)

  const { data } = useAsync(async () => {
    const [p, o, pj, og] = await Promise.all([
      supabase.from('profiles').select('id,nome,email,role').order('nome'),
      temFixo ? Promise.resolve({ data: [], error: null }) : supabase.from('oportunidades').select('id,titulo').eq('status', 'aberta').order('titulo'),
      temFixo ? Promise.resolve({ data: [], error: null }) : supabase.from('projetos').select('id,nome').order('nome'),
      temFixo ? Promise.resolve({ data: [], error: null }) : supabase.from('organizacoes').select('id,nome').order('nome'),
    ])
    let outras: Tarefa[] = []
    let etapas: ProjetoEtapa[] = []
    const col = fixo?.projeto_id ? 'projeto_id' : fixo?.oportunidade_id ? 'oportunidade_id' : fixo?.organizacao_id ? 'organizacao_id' : null
    const val = fixo?.projeto_id ?? fixo?.oportunidade_id ?? fixo?.organizacao_id
    if (col && val) {
      outras = unwrap(await supabase.from('tarefas').select('id,titulo,status').eq(col, val).neq('status', 'concluida')) as Tarefa[]
    }
    if (fixo?.projeto_id) {
      etapas = unwrap(await supabase.from('projeto_etapas').select('id,ordem,nome').eq('projeto_id', fixo.projeto_id).order('ordem')) as ProjetoEtapa[]
    }
    return {
      pessoas: unwrap(p) as Profile[],
      opps: ((unwrap(o) as { id: string; titulo: string }[]) ?? []).map((x) => ({ id: x.id, nome: x.titulo })) as Lite[],
      projetos: unwrap(pj) as Lite[],
      orgs: unwrap(og) as Lite[],
      outras: outras.filter((t) => t.id !== tarefa?.id),
      etapas,
    }
  })

  const [alvo, setAlvo] = useState<Alvo>('oportunidade')
  const [alvoId, setAlvoId] = useState('')
  const [d, setD] = useState({
    titulo: tarefa?.titulo ?? '',
    descricao: tarefa?.descricao ?? '',
    tipo: tarefa?.tipo ?? 'tarefa',
    responsavel_id: tarefa ? tarefa.responsavel_id ?? '' : profile?.id ?? '',
    prioridade: tarefa?.prioridade ?? 'média',
    data_inicio: tarefa?.data_inicio ?? '',
    prazo: tarefa?.prazo ?? '',
    status: tarefa?.status ?? 'aberta',
    bloqueada_por: tarefa?.bloqueada_por ?? '',
    projeto_etapa_id: tarefa?.projeto_etapa_id ?? '',
    evidencia: tarefa?.evidencia ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }))

  const semVinculo = !temFixo && !alvoId
  const andamentoSemDono = d.status === 'em_andamento' && !d.responsavel_id
  const aprovacaoSemDono = d.tipo === 'aprovacao' && d.status === 'concluida' && !d.responsavel_id
  const invalido = !d.titulo.trim() || semVinculo || andamentoSemDono || aprovacaoSemDono

  async function salvar() {
    setBusy(true)
    const base = {
      titulo: d.titulo.trim(),
      descricao: nullIfEmpty(d.descricao),
      tipo: d.tipo,
      responsavel_id: nullIfEmpty(d.responsavel_id),
      prioridade: d.prioridade,
      data_inicio: nullIfEmpty(d.data_inicio),
      prazo: nullIfEmpty(d.prazo),
      status: d.status,
      bloqueada_por: nullIfEmpty(d.bloqueada_por),
      projeto_etapa_id: nullIfEmpty(d.projeto_etapa_id),
      evidencia: nullIfEmpty(d.evidencia),
    }
    const ok = await act(async () => {
      if (tarefa) {
        unwrap(await supabase.from('tarefas').update(base).eq('id', tarefa.id).select())
      } else {
        const v: Vinculo = temFixo ? { ...fixo } : alvo === 'oportunidade' ? { oportunidade_id: alvoId } : alvo === 'projeto' ? { projeto_id: alvoId } : { organizacao_id: alvoId }
        unwrap(await supabase.from('tarefas').insert({ ...base, ...v }).select())
      }
    }, tarefa ? 'Tarefa atualizada' : 'Tarefa criada')
    setBusy(false)
    if (ok) onSaved()
  }

  const listaAlvo = alvo === 'oportunidade' ? data?.opps : alvo === 'projeto' ? data?.projetos : data?.orgs

  return (
    <Modal
      title={tarefa ? 'Editar tarefa' : 'Nova tarefa'}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={busy || invalido}>Salvar</button>
        </>
      }
    >
      <div className="grid">
        <Field label="Título *" span={3}>
          <input value={d.titulo} onChange={(e) => set('titulo', e.target.value)} autoFocus />
        </Field>
        {!temFixo && (
          <>
            <Field label="Ligada a *">
              <Select value={alvo} onChange={(e) => { setAlvo(e.target.value as Alvo); setAlvoId('') }} placeholder="—"
                options={[{ v: 'oportunidade', l: 'Oportunidade' }, { v: 'projeto', l: 'Projeto' }, { v: 'organizacao', l: 'Empresa' }]} />
            </Field>
            <Field label=" " span={2}>
              <Select value={alvoId} onChange={(e) => setAlvoId(e.target.value)} placeholder="Selecione…" options={(listaAlvo ?? []).map((x) => ({ v: x.id, l: x.nome }))} />
            </Field>
          </>
        )}
        <Field label="Tipo" hint={d.tipo === 'aprovacao' ? 'Decisão com responsável e registro' : 'Atividade a executar'}>
          <Select value={d.tipo} onChange={(e) => set('tipo', e.target.value as 'tarefa' | 'aprovacao')} placeholder="—"
            options={[{ v: 'tarefa', l: 'Tarefa' }, { v: 'aprovacao', l: 'Aprovação' }]} />
        </Field>
        <Field label="Responsável">
          <Select value={d.responsavel_id} onChange={(e) => set('responsavel_id', e.target.value)} options={(data?.pessoas ?? []).map((p) => ({ v: p.id, l: nomePessoa(p) }))} />
        </Field>
        <Field label="Prioridade">
          <Select value={d.prioridade} onChange={(e) => set('prioridade', e.target.value as 'baixa' | 'média' | 'alta')} options={PRIORIDADES} placeholder="—" />
        </Field>
        <Field label="Início"><input type="date" value={d.data_inicio} onChange={(e) => set('data_inicio', e.target.value)} /></Field>
        <Field label="Vencimento"><input type="date" value={d.prazo} onChange={(e) => set('prazo', e.target.value)} /></Field>
        <Field label="Status">
          <Select value={d.status} onChange={(e) => set('status', e.target.value as Tarefa['status'])} options={STATUS_TAREFA} placeholder="—" />
        </Field>
        {(data?.etapas.length ?? 0) > 0 && (
          <Field label="Etapa do projeto" span={2}>
            <Select value={d.projeto_etapa_id} onChange={(e) => set('projeto_etapa_id', e.target.value)} options={(data?.etapas ?? []).map((x) => ({ v: x.id, l: `${x.ordem}. ${x.nome}` }))} />
          </Field>
        )}
        <Field label="Depende de (bloqueio)" span={(data?.etapas.length ?? 0) > 0 ? undefined : 2} hint="Só pode andar quando a outra estiver concluída">
          <Select value={d.bloqueada_por} onChange={(e) => set('bloqueada_por', e.target.value)} placeholder="— nenhuma —" options={(data?.outras ?? []).map((t) => ({ v: t.id, l: t.titulo }))} />
        </Field>
        <Field label="Descrição" span={3}><textarea rows={2} value={d.descricao} onChange={(e) => set('descricao', e.target.value)} /></Field>
        <Field label="Evidência da conclusão" span={3} hint="Link, número do documento ou observação que comprove">
          <input value={d.evidencia} onChange={(e) => set('evidencia', e.target.value)} />
        </Field>
        {andamentoSemDono && <div className="alert alert-warn span-3">Defina um responsável para colocar a tarefa em andamento.</div>}
        {aprovacaoSemDono && <div className="alert alert-warn span-3">Uma aprovação concluída precisa de responsável.</div>}
      </div>
    </Modal>
  )
}
