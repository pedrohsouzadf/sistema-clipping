import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { fdate, isOverdue, money, nullIfEmpty, todayISO } from '../lib/format'
import {
  APROVACOES_ABORDAGEM,
  CLASSES_PREDIO,
  DONOS_PENDENCIA,
  ESTADOS_IMOVEL,
  EVIDENCIAS,
  JA_TEM_IMOVEL,
  PADROES,
  POTENCIAIS,
  PRAZOS_CONTRATO,
  STATUS_PENDENCIA,
  STATUS_PROPOSTA,
  TIPOS_SERVICO,
  URGENCIAS,
  type Etapa,
  type Oportunidade,
  type Pendencia,
  type PlaybookItem,
  type Profile,
  type Proposta,
  type Tarefa,
} from '../lib/types'
import { Badge, Confirm, Empty, Field, Loading, PageHead, Select, WobaBadge, useAct } from '../components/ui'
import Interacoes from '../components/Interacoes'
import TarefasPanel from '../components/TarefasPanel'
import Documentos from '../components/Documentos'
import Historico from '../components/Historico'
import { podeGerarProjeto } from '../lib/papeis'
import { FecharModal, conflitoWoba } from './Funil'

type Feito = { item_id: string; feito: boolean }

export default function OportunidadeDetalhe() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const act = useAct()
  const { profile } = useAuth()
  const { data, loading, error, reload } = useAsync(async () => {
    const [o, e, p, c, t, pe, pr, pes, pj] = await Promise.all([
      supabase
        .from('oportunidades')
        .select('*, cliente:organizacoes!cliente_final_id(id,nome,atendida_woba), canal:organizacoes!canal_id(id,nome), responsavel:profiles!responsavel_id(id,nome)')
        .eq('id', id)
        .single(),
      supabase.from('etapas').select('*').order('id'),
      supabase.from('playbook_itens').select('*').order('ordem'),
      supabase.from('oportunidade_checklist').select('item_id,feito').eq('oportunidade_id', id),
      supabase.from('tarefas').select('*, responsavel:profiles!responsavel_id(nome)').eq('oportunidade_id', id).order('status').order('prazo'),
      supabase.from('pendencias').select('*').eq('oportunidade_id', id).order('created_at', { ascending: false }),
      supabase.from('propostas').select('*').eq('oportunidade_id', id).order('versao', { ascending: false }),
      supabase.from('profiles').select('id,nome,email,role').order('nome'),
      supabase.from('projetos').select('id,nome').eq('oportunidade_id', id).maybeSingle(),
    ])
    return {
      projeto: unwrap(pj) as { id: string; nome: string } | null,
      opp: unwrap(o) as Oportunidade,
      etapas: unwrap(e) as Etapa[],
      itens: unwrap(p) as PlaybookItem[],
      feitos: unwrap(c) as Feito[],
      tarefas: unwrap(t) as Tarefa[],
      pendencias: unwrap(pe) as Pendencia[],
      propostas: unwrap(pr) as Proposta[],
      pessoas: unwrap(pes) as Profile[],
    }
  }, [id])

  const [d, setD] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [fechar, setFechar] = useState(false)
  const [reabrir, setReabrir] = useState(false)
  const [excluir, setExcluir] = useState(false)
  const [verEtapa, setVerEtapa] = useState<number | null>(null)

  const opp = data?.opp
  useEffect(() => {
    if (!opp) return
    const s = (v: unknown) => (v == null ? '' : String(v))
    setD({
      titulo: s(opp.titulo), modelo_atuacao: s(opp.modelo_atuacao), responsavel_id: s(opp.responsavel_id),
      sinal_oportunidade: s(opp.sinal_oportunidade), fonte_sinal: s(opp.fonte_sinal), necessidade_provavel: s(opp.necessidade_provavel),
      decisores: s(opp.decisores), potencial: s(opp.potencial), evidencia: s(opp.evidencia), prazo_estimado: s(opp.prazo_estimado),
      cidade: s(opp.cidade), area_m2: s(opp.area_m2), posicoes: s(opp.posicoes), padrao: s(opp.padrao), estado_imovel: s(opp.estado_imovel),
      classe_predio: s(opp.classe_predio), prazo_contrato_meses: s(opp.prazo_contrato_meses), urgencia: s(opp.urgencia), ja_tem_imovel: s(opp.ja_tem_imovel),
      tipo_servico: s(opp.tipo_servico), valor_estimado: s(opp.valor_estimado), probabilidade: s(opp.probabilidade),
      prazo_fechamento: s(opp.prazo_fechamento), concorrentes: s(opp.concorrentes), riscos: s(opp.riscos), tipo_imovel: s(opp.tipo_imovel),
      necessidade_obra: opp.necessidade_obra == null ? '' : String(opp.necessidade_obra), regra_relacionamento: s(opp.regra_relacionamento),
      aprovacao_abordagem: s(opp.aprovacao_abordagem),
      mensalidade_estimada: s(opp.mensalidade_estimada), proximo_passo: s(opp.proximo_passo), proximo_passo_data: s(opp.proximo_passo_data),
      observacoes: s(opp.observacoes),
    })
  }, [opp])

  if (loading && !data) return <Loading error={error} />
  if (!data || !opp) return <Loading error={error ?? 'Oportunidade não encontrada'} />

  const set = (k: string, v: string) => setD((x) => ({ ...x, [k]: v }))
  const num = (v: string) => (v.trim() === '' ? null : Number(v))
  const aberta = opp.status === 'aberta'
  const etapaAtual = data.etapas.find((e) => e.id === opp.etapa_id)
  const etapaVista = verEtapa ?? opp.etapa_id
  const itensEtapa = data.itens.filter((i) => i.etapa_id === etapaVista)
  const feito = (itemId: string) => data.feitos.some((f) => f.item_id === itemId && f.feito)
  const liquido = opp.mensalidade_estimada != null && opp.comissao_canal_pct != null
    ? Number(opp.mensalidade_estimada) * (1 - Number(opp.comissao_canal_pct) / 100)
    : null

  const probPadrao = etapaAtual?.probabilidade_padrao ?? null
  const probEfetiva = opp.status === 'ganha' ? 100 : opp.status === 'perdida' ? 0 : opp.probabilidade ?? probPadrao
  const ponderado = opp.valor_estimado != null && probEfetiva != null ? Number(opp.valor_estimado) * probEfetiva / 100 : null

  async function gerarProjeto() {
    let novo = ''
    const ok = await act(async () => {
      novo = unwrap(await supabase.rpc('criar_projeto_da_oportunidade', { p_oportunidade: opp!.id })) as unknown as string
    }, 'Projeto criado com as 7 etapas de implantação')
    if (ok) nav(`/projetos/${novo}`)
  }

  async function salvar() {
    setBusy(true)
    const ok = await act(
      async () =>
        unwrap(
          await supabase
            .from('oportunidades')
            .update({
              titulo: d.titulo.trim() || opp!.titulo,
              modelo_atuacao: d.modelo_atuacao,
              responsavel_id: nullIfEmpty(d.responsavel_id),
              sinal_oportunidade: nullIfEmpty(d.sinal_oportunidade), fonte_sinal: nullIfEmpty(d.fonte_sinal),
              necessidade_provavel: nullIfEmpty(d.necessidade_provavel), decisores: nullIfEmpty(d.decisores),
              potencial: nullIfEmpty(d.potencial), evidencia: nullIfEmpty(d.evidencia), prazo_estimado: nullIfEmpty(d.prazo_estimado),
              cidade: nullIfEmpty(d.cidade), area_m2: num(d.area_m2), posicoes: num(d.posicoes), padrao: nullIfEmpty(d.padrao),
              estado_imovel: nullIfEmpty(d.estado_imovel), classe_predio: nullIfEmpty(d.classe_predio),
              prazo_contrato_meses: num(d.prazo_contrato_meses), urgencia: nullIfEmpty(d.urgencia), ja_tem_imovel: nullIfEmpty(d.ja_tem_imovel),
              mensalidade_estimada: num(d.mensalidade_estimada),
              tipo_servico: nullIfEmpty(d.tipo_servico), valor_estimado: num(d.valor_estimado), probabilidade: num(d.probabilidade),
              prazo_fechamento: nullIfEmpty(d.prazo_fechamento), concorrentes: nullIfEmpty(d.concorrentes), riscos: nullIfEmpty(d.riscos),
              tipo_imovel: nullIfEmpty(d.tipo_imovel), necessidade_obra: d.necessidade_obra === '' ? null : d.necessidade_obra === 'true',
              regra_relacionamento: nullIfEmpty(d.regra_relacionamento), aprovacao_abordagem: d.aprovacao_abordagem || 'Não necessária',
              proximo_passo: nullIfEmpty(d.proximo_passo), proximo_passo_data: nullIfEmpty(d.proximo_passo_data),
              observacoes: nullIfEmpty(d.observacoes),
            })
            .eq('id', opp!.id)
            .select(),
        ),
      'Salvo',
    )
    setBusy(false)
    if (ok) reload()
  }

  async function irParaEtapa(n: number) {
    if (n === 7) return setFechar(true)
    if (n === opp!.etapa_id) return setVerEtapa(null)
    const ok = await act(async () => unwrap(await supabase.from('oportunidades').update({ etapa_id: n }).eq('id', opp!.id).select()))
    if (ok) {
      setVerEtapa(null)
      reload()
    }
  }

  async function marcar(item: PlaybookItem, v: boolean) {
    const ok = await act(async () =>
      unwrap(await supabase.from('oportunidade_checklist').upsert({ oportunidade_id: opp!.id, item_id: item.id, feito: v, feito_em: new Date().toISOString() }).select()),
    )
    if (ok) reload()
  }

  return (
    <>
      <PageHead
        title={opp.titulo}
        sub={`${opp.cliente?.nome ?? '—'} · origem: ${opp.origem}${opp.canal ? ` · canal: ${opp.canal.nome}` : ''}`}
        actions={
          <>
            <Link to="/funil" className="btn">← Funil</Link>
            {data.projeto ? (
              <Link to={`/projetos/${data.projeto.id}`} className="btn">Ver projeto →</Link>
            ) : opp.status === 'ganha' && podeGerarProjeto(profile?.role) ? (
              <button className="btn btn-primary" onClick={gerarProjeto}>Gerar projeto de implantação</button>
            ) : null}
            {aberta ? (
              <button className="btn btn-primary" onClick={() => setFechar(true)}>Fechar (ganha/perdida)</button>
            ) : (
              <button className="btn" onClick={() => setReabrir(true)}>Reabrir</button>
            )}
          </>
        }
      />
      <div className="chips" style={{ marginBottom: 12 }}>
        <WobaBadge v={opp.cliente?.atendida_woba} />
        {opp.origem === 'Woba' && <Badge tone="bronze">via Woba · comissão {opp.comissao_canal_pct ?? 0}% sobre a mensalidade</Badge>}
        {conflitoWoba(opp) && <Badge tone="bad">Conflito com a regra da Woba</Badge>}
        {opp.prioridade && <Badge tone="info">Prioridade {opp.prioridade}</Badge>}
        {opp.aprovacao_abordagem === 'Pendente' && <Badge tone="warn">Abordagem aguardando aprovação</Badge>}
        {aberta && probEfetiva != null && <Badge tone="neutral">Probabilidade {probEfetiva}%{opp.probabilidade == null ? ' (padrão da etapa)' : ''}</Badge>}
        {opp.status === 'ganha' && <Badge tone="ok">Ganha em {fdate(opp.fechada_em)}</Badge>}
        {opp.status === 'perdida' && <Badge tone="bad">Perdida em {fdate(opp.fechada_em)}: {opp.motivo_perda}</Badge>}
      </div>

      <div className="stepper">
        {data.etapas.map((e) => (
          <button
            key={e.id}
            className={`step ${e.id < opp.etapa_id || (e.id === 7 && !aberta) ? 'done' : ''} ${e.id === etapaVista ? 'now' : ''}`}
            onClick={() => setVerEtapa(e.id)}
            title={e.criterio_avanco ?? ''}
          >
            <span className="mono">{e.id}</span> {e.nome}
          </button>
        ))}
      </div>

      <div className="two">
        <div>
          <section className="section card">
            <h3>Playbook · etapa {etapaVista}: {data.etapas.find((e) => e.id === etapaVista)?.nome}</h3>
            {data.etapas.find((e) => e.id === etapaVista)?.criterio_avanco && (
              <p className="muted">Para avançar: {data.etapas.find((e) => e.id === etapaVista)?.criterio_avanco}</p>
            )}
            {itensEtapa.length === 0 ? <Empty>Sem itens para esta etapa.</Empty> : (
              (['pergunta', 'documento', 'tarefa'] as const).map((tipo) => {
                const lista = itensEtapa.filter((i) => i.tipo === tipo)
                if (!lista.length) return null
                return (
                  <div key={tipo}>
                    <div className="muted" style={{ textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 8 }}>
                      {tipo === 'pergunta' ? 'Perguntas' : tipo === 'documento' ? 'Documentos' : 'Tarefas'}
                    </div>
                    {lista.map((i) => (
                      <label key={i.id} className="pb">
                        <input type="checkbox" checked={feito(i.id)} disabled={!aberta} onChange={(e) => marcar(i, e.target.checked)} />
                        <span>{i.texto} {i.obrigatorio && <span className="muted">(obrigatório)</span>}</span>
                      </label>
                    ))}
                  </div>
                )
              })
            )}
            {aberta && etapaVista !== opp.etapa_id && (
              <div style={{ marginTop: 12 }}>
                <button className="btn" onClick={() => irParaEtapa(etapaVista)}>Mover oportunidade para a etapa {etapaVista}</button>
              </div>
            )}
          </section>

          <section className="section card">
            <h3>Interações</h3>
            <Interacoes oportunidadeId={opp.id} onChanged={reload} />
          </section>

          <section className="section card">
            <h3>Documentos</h3>
            <Documentos vinculo={{ oportunidade_id: opp.id }} />
          </section>

          <section className="section card">
            <h3>Histórico de alterações</h3>
            <Historico coluna="oportunidade_id" id={opp.id} />
          </section>
        </div>

        <div>
          <section className="section card">
            <h3>Dados da oportunidade</h3>
            <div className="grid">
              <Field label="Título" span={2}><input value={d.titulo ?? ''} onChange={(e) => set('titulo', e.target.value)} /></Field>
              <Field label="Responsável">
                <Select value={d.responsavel_id} onChange={(e) => set('responsavel_id', e.target.value)} options={data.pessoas.map((p) => ({ v: p.id, l: p.nome ?? p.email ?? p.id }))} />
              </Field>
              <Field label="A Clip entra como">
                <Select value={d.modelo_atuacao} onChange={(e) => set('modelo_atuacao', e.target.value)} options={[{ v: 'operador', l: 'Operadora' }, { v: 'outros', l: 'Outros produtos' }]} placeholder="—" />
              </Field>
              <Field label="Potencial"><Select value={d.potencial} onChange={(e) => set('potencial', e.target.value)} options={POTENCIAIS} /></Field>
              <Field label="Evidência"><Select value={d.evidencia} onChange={(e) => set('evidencia', e.target.value)} options={EVIDENCIAS} /></Field>
              <Field label="Sinal de oportunidade" span={2}><input value={d.sinal_oportunidade ?? ''} onChange={(e) => set('sinal_oportunidade', e.target.value)} /></Field>
              <Field label="Fonte do sinal"><input value={d.fonte_sinal ?? ''} onChange={(e) => set('fonte_sinal', e.target.value)} /></Field>
              <Field label="Necessidade provável" span={2}><input value={d.necessidade_provavel ?? ''} onChange={(e) => set('necessidade_provavel', e.target.value)} /></Field>
              <Field label="Prazo estimado"><input value={d.prazo_estimado ?? ''} onChange={(e) => set('prazo_estimado', e.target.value)} placeholder="Ex.: 2º semestre/2027" /></Field>
              <Field label="Decisores" span={3}><input value={d.decisores ?? ''} onChange={(e) => set('decisores', e.target.value)} /></Field>
            </div>

            <h3>Negócio</h3>
            <div className="grid">
              <Field label="Tipo de serviço"><Select value={d.tipo_servico} onChange={(e) => set('tipo_servico', e.target.value)} options={TIPOS_SERVICO} /></Field>
              <Field label="Valor estimado do negócio (R$)" hint="Valor total do contrato; alimenta o pipeline do painel">
                <input type="number" min="0" step="0.01" value={d.valor_estimado ?? ''} onChange={(e) => set('valor_estimado', e.target.value)} />
              </Field>
              <Field label="Fechamento esperado"><input type="date" value={d.prazo_fechamento ?? ''} onChange={(e) => set('prazo_fechamento', e.target.value)} /></Field>
              <Field label="Probabilidade (%)" hint={probPadrao != null ? `Vazio = padrão da etapa (${probPadrao}%)` : 'Vazio = padrão da etapa'}>
                <input type="number" min="0" max="100" value={d.probabilidade ?? ''} onChange={(e) => set('probabilidade', e.target.value)} />
              </Field>
              <Field label="Valor ponderado"><input value={money(ponderado)} readOnly /></Field>
              <Field label="Concorrentes conhecidos" span={3}><input value={d.concorrentes ?? ''} onChange={(e) => set('concorrentes', e.target.value)} /></Field>
              <Field label="Riscos" span={3}><textarea rows={2} value={d.riscos ?? ''} onChange={(e) => set('riscos', e.target.value)} /></Field>
              <Field label="Regra de relacionamento / exclusividade" span={2} hint="Ex.: só via Woba; indicação com compromisso de retorno">
                <input value={d.regra_relacionamento ?? ''} onChange={(e) => set('regra_relacionamento', e.target.value)} />
              </Field>
              <Field label="Aprovação da abordagem" hint="Pendente trava o avanço da etapa 1">
                <Select value={d.aprovacao_abordagem} onChange={(e) => set('aprovacao_abordagem', e.target.value)} options={APROVACOES_ABORDAGEM} placeholder="—" />
              </Field>
            </div>

            <h3>Briefing</h3>
            <div className="grid">
              <Field label="Cidade"><input value={d.cidade ?? ''} onChange={(e) => set('cidade', e.target.value)} /></Field>
              <Field label="Área (m²)"><input type="number" min="0" value={d.area_m2 ?? ''} onChange={(e) => set('area_m2', e.target.value)} /></Field>
              <Field label="Posições de trabalho"><input type="number" min="0" value={d.posicoes ?? ''} onChange={(e) => set('posicoes', e.target.value)} /></Field>
              <Field label="Padrão"><Select value={d.padrao} onChange={(e) => set('padrao', e.target.value)} options={PADROES} /></Field>
              <Field label="Estado do imóvel"><Select value={d.estado_imovel} onChange={(e) => set('estado_imovel', e.target.value)} options={ESTADOS_IMOVEL} /></Field>
              <Field label="Classe do prédio"><Select value={d.classe_predio} onChange={(e) => set('classe_predio', e.target.value)} options={CLASSES_PREDIO} /></Field>
              <Field label="Prazo do contrato (meses)"><Select value={d.prazo_contrato_meses} onChange={(e) => set('prazo_contrato_meses', e.target.value)} options={PRAZOS_CONTRATO} /></Field>
              <Field label="Urgência"><Select value={d.urgencia} onChange={(e) => set('urgencia', e.target.value)} options={URGENCIAS} /></Field>
              <Field label="Já tem imóvel?"><Select value={d.ja_tem_imovel} onChange={(e) => set('ja_tem_imovel', e.target.value)} options={JA_TEM_IMOVEL} /></Field>
              <Field label="Tipo de imóvel" hint="Ex.: laje corporativa, galpão, loja"><input value={d.tipo_imovel ?? ''} onChange={(e) => set('tipo_imovel', e.target.value)} /></Field>
              <Field label="Precisa de obra?">
                <Select value={d.necessidade_obra} onChange={(e) => set('necessidade_obra', e.target.value)} options={[{ v: 'true', l: 'Sim' }, { v: 'false', l: 'Não' }]} />
              </Field>
            </div>

            <h3>Comercial</h3>
            <div className="grid">
              <Field label="Mensalidade estimada (R$)" hint="Valor total da mensalidade, antes da comissão">
                <input type="number" min="0" step="0.01" value={d.mensalidade_estimada ?? ''} onChange={(e) => set('mensalidade_estimada', e.target.value)} />
              </Field>
              <Field label="Comissão do canal">
                <input value={opp.comissao_canal_pct != null ? `${opp.comissao_canal_pct}%` : '—'} readOnly />
              </Field>
              <Field label="Líquido para a Clip"><input value={money(liquido)} readOnly /></Field>
              <Field label="Próximo passo" span={2}><input value={d.proximo_passo ?? ''} onChange={(e) => set('proximo_passo', e.target.value)} /></Field>
              <Field label="Prazo"><input type="date" value={d.proximo_passo_data ?? ''} onChange={(e) => set('proximo_passo_data', e.target.value)} /></Field>
              <Field label="Observações" span={3}><textarea rows={2} value={d.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} /></Field>
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
              <button className="btn btn-danger" onClick={() => setExcluir(true)}>Excluir</button>
              <button className="btn btn-primary" onClick={salvar} disabled={busy}>Salvar alterações</button>
            </div>
            {etapaAtual && aberta && etapaAtual.prazo_alvo_dias != null && (
              <p className="muted">Prazo-alvo desta etapa: {etapaAtual.prazo_alvo_dias} dias.</p>
            )}
          </section>

          <section className="section card">
            <h3>Tarefas</h3>
            <TarefasPanel vinculo={{ oportunidade_id: opp.id }} tarefas={data.tarefas} onChanged={reload} />
          </section>
          <Pendencias oppId={opp.id} lista={data.pendencias} onChanged={reload} />
          <Propostas opp={opp} lista={data.propostas} onChanged={reload} />
        </div>
      </div>

      {fechar && <FecharModal opp={opp} onClose={() => setFechar(false)} onDone={() => { setFechar(false); reload() }} />}
      {reabrir && (
        <Confirm
          title="Reabrir oportunidade"
          message="Ela volta para a etapa 6 (Negociação) como aberta."
          confirmLabel="Reabrir"
          onCancel={() => setReabrir(false)}
          onConfirm={async () => {
            setReabrir(false)
            const ok = await act(async () => unwrap(await supabase.from('oportunidades').update({ status: 'aberta', etapa_id: 6 }).eq('id', opp.id).select()), 'Reaberta')
            if (ok) reload()
          }}
        />
      )}
      {excluir && (
        <Confirm
          title="Excluir oportunidade"
          message="Isso apaga também histórico, tarefas, pendências e propostas. Não há como desfazer."
          confirmLabel="Excluir"
          onCancel={() => setExcluir(false)}
          onConfirm={async () => {
            setExcluir(false)
            const ok = await act(async () => unwrap(await supabase.from('oportunidades').delete().eq('id', opp.id).select()), 'Excluída')
            if (ok) nav('/funil')
          }}
        />
      )}
    </>
  )
}

/* ---------- pendências ---------- */
function Pendencias({ oppId, lista, onChanged }: { oppId: string; lista: Pendencia[]; onChanged: () => void }) {
  const act = useAct()
  const [desc, setDesc] = useState('')
  const [dono, setDono] = useState<string>('Cliente')
  const [prazo, setPrazo] = useState('')
  async function add() {
    if (!desc.trim()) return
    const ok = await act(async () => unwrap(await supabase.from('pendencias').insert({ oportunidade_id: oppId, descricao: desc.trim(), dono, prazo: nullIfEmpty(prazo) }).select()))
    if (ok) { setDesc(''); setPrazo(''); onChanged() }
  }
  async function status(p: Pendencia, s: string) {
    const ok = await act(async () => unwrap(await supabase.from('pendencias').update({ status: s }).eq('id', p.id).select()))
    if (ok) onChanged()
  }
  return (
    <section className="section card">
      <h3>Pendências</h3>
      <p className="muted">O que falta do cliente, do canal ou da Clip para a oportunidade andar.</p>
      <div className="grid">
        <Field label="Pendência" span={2}><input value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
        <Field label="Com quem está"><Select value={dono} onChange={(e) => setDono(e.target.value)} options={DONOS_PENDENCIA} placeholder="—" /></Field>
        <Field label="Prazo"><input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} /></Field>
        <Field label=" "><button className="btn" onClick={add} disabled={!desc.trim()}>Adicionar</button></Field>
      </div>
      {lista.length === 0 ? <p className="muted">Sem pendências.</p> : (
        <ul className="plain" style={{ marginTop: 10 }}>
          {lista.map((p) => (
            <li key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ flex: 1 }}>
                {p.descricao} <Badge tone="neutral">{p.dono}</Badge>{' '}
                <span className={`mono ${p.status !== 'fechada' && isOverdue(p.prazo) ? 'overdue' : 'muted'}`}>{fdate(p.prazo)}</span>
              </span>
              <div style={{ width: 130 }}>
                <Select value={p.status} onChange={(e) => status(p, e.target.value)} options={STATUS_PENDENCIA} placeholder="—" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* ---------- propostas ---------- */
function Propostas({ opp, lista, onChanged }: { opp: Oportunidade; lista: Proposta[]; onChanged: () => void }) {
  const act = useAct()
  const [mensalidade, setMensalidade] = useState('')
  const [validade, setValidade] = useState('')
  const [obs, setObs] = useState('')
  async function add() {
    const ok = await act(
      async () =>
        unwrap(
          await supabase
            .from('propostas')
            .insert({
              oportunidade_id: opp.id,
              mensalidade: mensalidade.trim() === '' ? null : Number(mensalidade),
              comissao_pct: opp.comissao_canal_pct,
              validade: nullIfEmpty(validade),
              observacoes: nullIfEmpty(obs),
              data_emissao: todayISO(),
            })
            .select(),
        ),
      'Proposta registrada',
    )
    if (ok) { setMensalidade(''); setValidade(''); setObs(''); onChanged() }
  }
  async function status(p: Proposta, s: string) {
    const ok = await act(async () => unwrap(await supabase.from('propostas').update({ status: s }).eq('id', p.id).select()))
    if (ok) onChanged()
  }
  return (
    <section className="section card">
      <h3>Propostas</h3>
      <p className="muted">Cada nova proposta vira uma versão. A comissão do canal é copiada da oportunidade.</p>
      <div className="grid">
        <Field label="Mensalidade total (R$)"><input type="number" min="0" step="0.01" value={mensalidade} onChange={(e) => setMensalidade(e.target.value)} /></Field>
        <Field label="Validade"><input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} /></Field>
        <Field label=" "><button className="btn" onClick={add}>Registrar versão</button></Field>
        <Field label="Observações" span={3}><input value={obs} onChange={(e) => setObs(e.target.value)} /></Field>
      </div>
      {lista.length === 0 ? <p className="muted">Nenhuma proposta registrada.</p> : (
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table>
            <thead><tr><th>Versão</th><th>Emissão</th><th>Validade</th><th>Mensalidade</th><th>Líquido Clip</th><th>Status</th></tr></thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id}>
                  <td className="mono">v{p.versao}</td>
                  <td>{fdate(p.data_emissao)}</td>
                  <td className={isOverdue(p.validade) && !['aceita', 'expirada'].includes(p.status) ? 'overdue' : ''}>{fdate(p.validade)}</td>
                  <td>{money(p.mensalidade)}</td>
                  <td>{money(p.valor_liquido)}{p.comissao_pct ? <span className="muted"> (−{p.comissao_pct}%)</span> : null}</td>
                  <td style={{ width: 150 }}><Select value={p.status} onChange={(e) => status(p, e.target.value)} options={STATUS_PROPOSTA} placeholder="—" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
