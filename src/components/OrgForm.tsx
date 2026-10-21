import { useState } from 'react'
import { useAsync } from '../lib/hooks'
import { nomePessoa } from '../lib/papeis'
import { supabase, unwrap } from '../lib/supabase'
import { nullIfEmpty } from '../lib/format'
import { ORIGENS, PAPEIS, WOBA_STATUS, type Organizacao, type Profile } from '../lib/types'
import { Field, Modal, Select, useAct } from './ui'

type Draft = {
  nome: string
  papeis: string[]
  atendida_woba: string
  comissao_padrao_pct: string
  setor: string
  regiao: string
  cidade: string
  porte: string
  papel_na_cadeia: string
  servicos: string
  razao_social: string
  cnpj: string
  site: string
  cidades_atuacao: string
  responsavel_id: string
  origem_relacionamento: string
  necessidades: string
  proximo_passo: string
  proximo_passo_data: string
  contato_principal: string
  fonte_informacao: string
  data_pesquisa: string
  observacoes: string
}

const toDraft = (o?: Organizacao | null): Draft => ({
  nome: o?.nome ?? '',
  papeis: o?.papeis ?? [],
  atendida_woba: o?.atendida_woba ?? 'Validar',
  comissao_padrao_pct: o?.comissao_padrao_pct != null ? String(o.comissao_padrao_pct) : '',
  setor: o?.setor ?? '',
  regiao: o?.regiao ?? '',
  cidade: o?.cidade ?? '',
  porte: o?.porte ?? '',
  papel_na_cadeia: o?.papel_na_cadeia ?? '',
  servicos: o?.servicos ?? '',
  razao_social: o?.razao_social ?? '',
  cnpj: o?.cnpj ?? '',
  site: o?.site ?? '',
  cidades_atuacao: o?.cidades_atuacao ?? '',
  responsavel_id: o?.responsavel_id ?? '',
  origem_relacionamento: o?.origem_relacionamento ?? '',
  necessidades: o?.necessidades ?? '',
  proximo_passo: o?.proximo_passo ?? '',
  proximo_passo_data: o?.proximo_passo_data ?? '',
  contato_principal: o?.contato_principal ?? '',
  fonte_informacao: o?.fonte_informacao ?? '',
  data_pesquisa: o?.data_pesquisa ?? '',
  observacoes: o?.observacoes ?? '',
})

export default function OrgForm({
  org,
  onClose,
  onSaved,
  defaultPapel,
  semWoba,
}: {
  org?: Organizacao | null
  onClose: () => void
  onSaved: (o: Organizacao) => void
  defaultPapel?: string
  /** esconde "Atendida pela Woba?" (ex.: Rede de parceiros); o valor existente é preservado */
  semWoba?: boolean
}) {
  const [d, setD] = useState<Draft>(() => {
    const base = toDraft(org)
    if (!org && defaultPapel) base.papeis = [defaultPapel]
    return base
  })
  const [busy, setBusy] = useState(false)
  const act = useAct()
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const { data: pessoas } = useAsync(async () => unwrap(await supabase.from('profiles').select('id,nome,email,role').order('nome')) as Profile[])
  const isFornecedor = d.papeis.includes('fornecedor')
  const isCanal = d.papeis.includes('parceiro')

  async function save() {
    if (!d.nome.trim()) return
    setBusy(true)
    const payload = {
      nome: d.nome.trim(),
      papeis: d.papeis,
      atendida_woba: d.atendida_woba || 'Validar',
      comissao_padrao_pct: d.comissao_padrao_pct === '' ? null : Number(d.comissao_padrao_pct),
      setor: nullIfEmpty(d.setor),
      regiao: nullIfEmpty(d.regiao),
      cidade: nullIfEmpty(d.cidade),
      porte: nullIfEmpty(d.porte),
      papel_na_cadeia: nullIfEmpty(d.papel_na_cadeia),
      servicos: nullIfEmpty(d.servicos),
      razao_social: nullIfEmpty(d.razao_social),
      cnpj: nullIfEmpty(d.cnpj),
      site: nullIfEmpty(d.site),
      cidades_atuacao: nullIfEmpty(d.cidades_atuacao),
      responsavel_id: nullIfEmpty(d.responsavel_id),
      origem_relacionamento: nullIfEmpty(d.origem_relacionamento),
      necessidades: nullIfEmpty(d.necessidades),
      proximo_passo: nullIfEmpty(d.proximo_passo),
      proximo_passo_data: nullIfEmpty(d.proximo_passo_data),
      contato_principal: nullIfEmpty(d.contato_principal),
      fonte_informacao: nullIfEmpty(d.fonte_informacao),
      data_pesquisa: nullIfEmpty(d.data_pesquisa),
      observacoes: nullIfEmpty(d.observacoes),
    }
    let saved: Organizacao | null = null
    const ok = await act(async () => {
      const q = org
        ? supabase.from('organizacoes').update(payload).eq('id', org.id)
        : supabase.from('organizacoes').insert(payload)
      saved = unwrap(await q.select().single()) as Organizacao
    }, org ? 'Empresa atualizada' : 'Empresa cadastrada')
    setBusy(false)
    if (ok && saved) onSaved(saved)
  }

  return (
    <Modal
      title={org ? 'Editar empresa' : 'Nova empresa'}
      onClose={onClose}
      wide
      footer={
        <>
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
        <Field label="Nome *" span={semWoba ? 3 : 2}>
          <input value={d.nome} onChange={(e) => set('nome', e.target.value)} autoFocus />
        </Field>
        {!semWoba && (
          <Field label="Atendida pela Woba?" hint="Sim = a Clip só entra via demanda da Woba">
            <Select value={d.atendida_woba} onChange={(e) => set('atendida_woba', e.target.value)} options={WOBA_STATUS} />
          </Field>
        )}

        <div className="field span-3">
          <span className="field-label">Tipo</span>
          <div className="checks">
            {PAPEIS.map((p) => (
              <label key={p.v} className="check">
                <input
                  type="checkbox"
                  checked={d.papeis.includes(p.v)}
                  onChange={(e) =>
                    set('papeis', e.target.checked ? [...d.papeis, p.v] : d.papeis.filter((x) => x !== p.v))
                  }
                />
                {p.l}
              </label>
            ))}
          </div>
        </div>


        {isCanal && (
          <Field label="Comissão padrão do canal (%)" hint="Ex.: Woba = 16% sobre a mensalidade total">
            <input type="number" min={0} max={100} step="0.01" value={d.comissao_padrao_pct} onChange={(e) => set('comissao_padrao_pct', e.target.value)} />
          </Field>
        )}
        {isFornecedor && (
          <div className="alert alert-info span-2">
            Fornecedores ganham um perfil em <b>Parceiros</b>, onde você registra cidades, especialidades, homologação e avaliação.
          </div>
        )}

        <Field label="Razão social" span={2}>
          <input value={d.razao_social} onChange={(e) => set('razao_social', e.target.value)} />
        </Field>
        <Field label="CNPJ" hint="Não pode repetir em outra empresa">
          <input value={d.cnpj} onChange={(e) => set('cnpj', e.target.value)} placeholder="00.000.000/0000-00" />
        </Field>
        <Field label="Site" span={2}>
          <input value={d.site} onChange={(e) => set('site', e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Responsável na Clip">
          <Select value={d.responsavel_id} onChange={(e) => set('responsavel_id', e.target.value)} options={(pessoas ?? []).map((p) => ({ v: p.id, l: nomePessoa(p) }))} />
        </Field>
        <Field label="Origem do relacionamento">
          <Select value={d.origem_relacionamento} onChange={(e) => set('origem_relacionamento', e.target.value)} options={ORIGENS} />
        </Field>
        <Field label="Cidades de atuação" span={2}>
          <input value={d.cidades_atuacao} onChange={(e) => set('cidades_atuacao', e.target.value)} placeholder="Ex.: São Paulo, Campinas, Brasília" />
        </Field>
        <Field label="Necessidades e serviços de interesse" span={3}>
          <input value={d.necessidades} onChange={(e) => set('necessidades', e.target.value)} />
        </Field>
        <Field label="Próximo passo" span={2}>
          <input value={d.proximo_passo} onChange={(e) => set('proximo_passo', e.target.value)} />
        </Field>
        <Field label="Data do próximo passo">
          <input type="date" value={d.proximo_passo_data} onChange={(e) => set('proximo_passo_data', e.target.value)} />
        </Field>

        <Field label="Setor">
          <input value={d.setor} onChange={(e) => set('setor', e.target.value)} />
        </Field>
        <Field label="Cidade">
          <input value={d.cidade} onChange={(e) => set('cidade', e.target.value)} />
        </Field>
        <Field label="Região">
          <input value={d.regiao} onChange={(e) => set('regiao', e.target.value)} />
        </Field>
        <Field label="Porte">
          <input value={d.porte} onChange={(e) => set('porte', e.target.value)} />
        </Field>
        <Field label="Contato principal">
          <input value={d.contato_principal} onChange={(e) => set('contato_principal', e.target.value)} />
        </Field>
        <Field label="Papel na cadeia" span={2}>
          <input value={d.papel_na_cadeia} onChange={(e) => set('papel_na_cadeia', e.target.value)} />
        </Field>
        <Field label="Serviços" span={3}>
          <input value={d.servicos} onChange={(e) => set('servicos', e.target.value)} />
        </Field>
        <Field label="Fonte da informação" span={2}>
          <input value={d.fonte_informacao} onChange={(e) => set('fonte_informacao', e.target.value)} />
        </Field>
        <Field label="Data da pesquisa">
          <input type="date" value={d.data_pesquisa} onChange={(e) => set('data_pesquisa', e.target.value)} />
        </Field>
        <Field label="Observações" span={3}>
          <textarea rows={3} value={d.observacoes} onChange={(e) => set('observacoes', e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
