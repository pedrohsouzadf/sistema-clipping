import { useState } from 'react'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { useCadastros } from '../lib/cadastros'
import { nullIfEmpty } from '../lib/format'
import { CATEGORIAS_SERVICO, CONTROLES_SERVICO, FREQUENCIAS_SERVICO, STATUS_SERVICO, type Servico } from '../lib/types'
import { Field, Modal, Select, useAct } from './ui'

export default function ServicoForm({ servico, defaultUnidadeId, onClose, onSaved }: { servico?: Servico | null; defaultUnidadeId?: string; onClose: () => void; onSaved: (s: Servico) => void }) {
  const act = useAct()
  const cad = useCadastros()
  const { data: contratos } = useAsync(async () => unwrap(await supabase.from('contratos').select('id,titulo,cliente_id').order('titulo')) as { id: string; titulo: string; cliente_id: string }[])
  const s = (v: unknown) => (v == null ? '' : String(v))
  const [d, setD] = useState({
    unidade_id: s(servico?.unidade_id ?? defaultUnidadeId), nome: s(servico?.nome), categoria: s(servico?.categoria), descricao: s(servico?.descricao),
    frequencia: servico?.frequencia ?? 'Mensal', fornecedor_id: s(servico?.fornecedor_id), responsavel_id: s(servico?.responsavel_id), contrato_id: s(servico?.contrato_id),
    controle: servico?.controle ?? 'Clip gerencia fornecedor', clip_garante_sla: servico?.clip_garante_sla ?? true, horario_atendimento: s(servico?.horario_atendimento),
    regras_atendimento: s(servico?.regras_atendimento), sla_resposta_horas: s(servico?.sla_resposta_horas), sla_solucao_horas: s(servico?.sla_solucao_horas),
    forma_verificacao: s(servico?.forma_verificacao), custo_mensal: s(servico?.custo_mensal), status: servico?.status ?? 'Ativo',
    data_inicio: s(servico?.data_inicio), data_fim: s(servico?.data_fim), observacoes: s(servico?.observacoes),
  })
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }))
  const terceiro = d.controle === 'Terceiro controla'
  const clienteId = cad.unidadesRaw.find((u) => u.id === d.unidade_id)?.cliente_id
  const datasInvertidas = !!d.data_inicio && !!d.data_fim && d.data_fim < d.data_inicio
  const falta = !d.unidade_id || !d.nome.trim() || datasInvertidas

  async function salvar() {
    setBusy(true)
    let saved: Servico | null = null
    const num = (v: string) => (v === '' ? null : Number(v))
    const payload = {
      unidade_id: d.unidade_id, nome: d.nome.trim(), categoria: nullIfEmpty(d.categoria), descricao: nullIfEmpty(d.descricao), frequencia: d.frequencia,
      fornecedor_id: nullIfEmpty(d.fornecedor_id), responsavel_id: nullIfEmpty(d.responsavel_id), contrato_id: nullIfEmpty(d.contrato_id), controle: d.controle,
      clip_garante_sla: terceiro ? false : d.clip_garante_sla, horario_atendimento: nullIfEmpty(d.horario_atendimento), regras_atendimento: nullIfEmpty(d.regras_atendimento),
      sla_resposta_horas: num(d.sla_resposta_horas), sla_solucao_horas: num(d.sla_solucao_horas), forma_verificacao: nullIfEmpty(d.forma_verificacao),
      custo_mensal: num(d.custo_mensal), status: d.status, data_inicio: nullIfEmpty(d.data_inicio), data_fim: nullIfEmpty(d.data_fim), observacoes: nullIfEmpty(d.observacoes),
    }
    const ok = await act(async () => {
      const q = servico ? supabase.from('servicos_unidade').update(payload).eq('id', servico.id) : supabase.from('servicos_unidade').insert(payload)
      saved = unwrap(await q.select().single()) as Servico
    }, servico ? 'Serviço atualizado' : 'Serviço cadastrado')
    setBusy(false)
    if (ok && saved) onSaved(saved)
  }

  return (
    <Modal title={servico ? 'Editar serviço' : 'Novo serviço da unidade'} onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={salvar} disabled={busy || falta}>Salvar</button></>}>
      <div className="grid">
        <Field label="Unidade *" span={2}><Select value={d.unidade_id} onChange={(e) => setD((x) => ({ ...x, unidade_id: e.target.value, contrato_id: '' }))} options={cad.unidades} placeholder="Selecione…" /></Field>
        <Field label="Status"><Select value={d.status} onChange={(e) => set('status', e.target.value as Servico['status'])} options={STATUS_SERVICO} placeholder="—" /></Field>
        <Field label="Serviço *" span={2}><input value={d.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex.: Limpeza diária" autoFocus /></Field>
        <Field label="Categoria"><Select value={d.categoria} onChange={(e) => set('categoria', e.target.value)} options={CATEGORIAS_SERVICO} /></Field>
        <Field label="O que inclui" span={3}><textarea rows={2} value={d.descricao} onChange={(e) => set('descricao', e.target.value)} /></Field>
        <Field label="Frequência"><Select value={d.frequencia} onChange={(e) => set('frequencia', e.target.value)} options={FREQUENCIAS_SERVICO} placeholder="—" /></Field>
        <Field label="Fornecedor"><Select value={d.fornecedor_id} onChange={(e) => set('fornecedor_id', e.target.value)} options={cad.fornecedores} /></Field>
        <Field label="Responsável na Clip"><Select value={d.responsavel_id} onChange={(e) => set('responsavel_id', e.target.value)} options={cad.pessoas} /></Field>
        <Field label="Contrato" hint="Contratos do cliente da unidade"><Select value={d.contrato_id} onChange={(e) => set('contrato_id', e.target.value)} options={(contratos ?? []).filter((c) => c.cliente_id === clienteId).map((c) => ({ v: c.id, l: c.titulo }))} /></Field>
        <Field label="Custo mensal (R$)"><input type="number" min={0} step="0.01" value={d.custo_mensal} onChange={(e) => set('custo_mensal', e.target.value)} /></Field>
        <div />

        <Field label="Quem controla a entrega?" span={2} hint="Terceiro controla: a Clip acompanha, mas não promete o prazo ao cliente">
          <Select value={d.controle} onChange={(e) => setD((x) => ({ ...x, controle: e.target.value as Servico['controle'], clip_garante_sla: e.target.value === 'Terceiro controla' ? false : x.clip_garante_sla }))} options={CONTROLES_SERVICO} placeholder="—" />
        </Field>
        <label className="check" style={{ alignSelf: 'center' }}><input type="checkbox" checked={!terceiro && d.clip_garante_sla} disabled={terceiro} onChange={(e) => set('clip_garante_sla', e.target.checked)} /> A Clip garante o SLA ao cliente</label>
        {terceiro && <div className="alert alert-info span-3">Este serviço depende de um terceiro. O SLA fica só como referência e a Clip não assume garantia sobre ele. Registre o terceiro depois de salvar.</div>}
        <Field label="SLA de resposta (horas)"><input type="number" min={1} value={d.sla_resposta_horas} onChange={(e) => set('sla_resposta_horas', e.target.value)} /></Field>
        <Field label="SLA de solução (horas)"><input type="number" min={1} value={d.sla_solucao_horas} onChange={(e) => set('sla_solucao_horas', e.target.value)} /></Field>
        <Field label="Horário de atendimento"><input value={d.horario_atendimento} onChange={(e) => set('horario_atendimento', e.target.value)} placeholder="Ex.: seg a sex, 7h às 19h" /></Field>
        <Field label="Regras de atendimento" span={3}><textarea rows={2} value={d.regras_atendimento} onChange={(e) => set('regras_atendimento', e.target.value)} placeholder="Como acionar, quem autoriza, o que fica fora do horário…" /></Field>
        <Field label="Como verificar se foi cumprido" span={3}><textarea rows={2} value={d.forma_verificacao} onChange={(e) => set('forma_verificacao', e.target.value)} placeholder="Ex.: checklist diário assinado, relatório mensal, teste de velocidade" /></Field>
        <Field label="Início"><input type="date" value={d.data_inicio} onChange={(e) => set('data_inicio', e.target.value)} /></Field>
        <Field label="Fim"><input type="date" value={d.data_fim} onChange={(e) => set('data_fim', e.target.value)} /></Field>
        <div />
        {datasInvertidas && <div className="alert alert-warn span-3">O fim não pode ser anterior ao início.</div>}
        <Field label="Observações" span={3}><input value={d.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
