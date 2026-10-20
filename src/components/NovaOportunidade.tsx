import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { nullIfEmpty } from '../lib/format'
import { ORIGENS, TIPOS_SERVICO, type Organizacao } from '../lib/types'
import { Field, Modal, Select, useAct } from './ui'
import OrgForm from './OrgForm'

type OrgLite = Pick<Organizacao, 'id' | 'nome' | 'atendida_woba'>

// A Clip entra sempre como operadora (padrão do banco); a trava da Woba vale nesse caso.

export default function NovaOportunidade({ onClose, defaultClienteId }: { onClose: () => void; defaultClienteId?: string }) {
  const nav = useNavigate()
  const act = useAct()
  const { data, reload } = useAsync(async () => {
    const o = await supabase.from('organizacoes').select('id,nome,atendida_woba').order('nome')
    return { orgs: unwrap(o) as OrgLite[] }
  })
  const [d, setD] = useState({
    titulo: '',
    cliente_final_id: defaultClienteId ?? '',
    origem: 'Prospecção direta',
    tipo_servico: '',
    proximo_passo: '',
    proximo_passo_data: '',
  })
  const [novaOrg, setNovaOrg] = useState(false)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }))

  const cliente = data?.orgs.find((o) => o.id === d.cliente_final_id)
  const direto = d.origem !== 'Woba'
  const bloqueado = direto && cliente?.atendida_woba === 'Sim'
  const validar = direto && cliente?.atendida_woba === 'Validar'

  async function criar() {
    if (!d.titulo.trim() || !d.cliente_final_id || bloqueado) return
    setBusy(true)
    let id = ''
    const ok = await act(async () => {
      const row = unwrap(
        await supabase
          .from('oportunidades')
          .insert({
            titulo: d.titulo.trim(),
            cliente_final_id: d.cliente_final_id,
            origem: d.origem,
            tipo_servico: nullIfEmpty(d.tipo_servico),
            proximo_passo: nullIfEmpty(d.proximo_passo),
            proximo_passo_data: nullIfEmpty(d.proximo_passo_data),
          })
          .select('id')
          .single(),
      ) as { id: string }
      id = row.id
    }, 'Oportunidade criada')
    setBusy(false)
    if (ok) nav(`/oportunidades/${id}`)
  }

  return (
    <>
      <Modal
        title="Nova oportunidade"
        onClose={onClose}
        wide
        footer={
          <>
            <button className="btn" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={criar} disabled={busy || !d.titulo.trim() || !d.cliente_final_id || bloqueado}>
              Criar
            </button>
          </>
        }
      >
        <div className="grid">
          <Field label="Título *" span={3} hint="Ex.: EY — escritório em Brasília">
            <input value={d.titulo} onChange={(e) => set('titulo', e.target.value)} autoFocus />
          </Field>
          <Field label="Cliente final *" span={2}>
            <Select
              value={d.cliente_final_id}
              onChange={(e) => set('cliente_final_id', e.target.value)}
              options={(data?.orgs ?? []).map((o) => ({ v: o.id, l: o.nome }))}
              placeholder="Selecione a empresa…"
            />
          </Field>
          <Field label=" ">
            <button type="button" className="btn" onClick={() => setNovaOrg(true)}>
              + Cadastrar empresa
            </button>
          </Field>
          <Field label="Origem">
            <Select value={d.origem} onChange={(e) => set('origem', e.target.value)} options={ORIGENS} />
          </Field>

          {bloqueado && (
            <div className="alert alert-bad span-3">
              <b>{cliente?.nome} é atendida pela Woba.</b> A Clip não pode vender diretamente como operadora. Registre esta
              demanda como vinda da Woba.{' '}
              <button type="button" className="link-btn" onClick={() => set('origem', 'Woba')}>
                Registrar como demanda da Woba
              </button>
            </div>
          )}
          {validar && (
            <div className="alert alert-warn span-3">
              Não sabemos se <b>{cliente?.nome}</b> é atendida pela Woba. A oportunidade fica na etapa 1 (Mapeada) até a confirmação
              (marque “Atendida pela Woba?” na organização).
            </div>
          )}
          {d.origem === 'Woba' && (
            <div className="alert alert-info span-3">
              Demanda da Woba: entra na etapa 3 (Reunião / diagnóstico), com a Woba como canal e contratante e a comissão
              do canal aplicada.
            </div>
          )}

          <Field label="Tipo de serviço">
            <Select value={d.tipo_servico} onChange={(e) => set('tipo_servico', e.target.value)} options={TIPOS_SERVICO} />
          </Field>
          <Field label="Próximo passo" span={2}>
            <input value={d.proximo_passo} onChange={(e) => set('proximo_passo', e.target.value)} />
          </Field>
          <Field label="Prazo">
            <input type="date" value={d.proximo_passo_data} onChange={(e) => set('proximo_passo_data', e.target.value)} />
          </Field>
        </div>
      </Modal>
      {novaOrg && (
        <OrgForm
          onClose={() => setNovaOrg(false)}
          onSaved={(o) => {
            setNovaOrg(false)
            reload()
            set('cliente_final_id', o.id)
          }}
        />
      )}
    </>
  )
}
