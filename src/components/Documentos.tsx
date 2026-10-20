import { useRef, useState } from 'react'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { fdate, fdatetime, isOverdue, nullIfEmpty } from '../lib/format'
import { STATUS_DOCUMENTO, TIPOS_DOCUMENTO, type Documento } from '../lib/types'
import { Badge, Confirm, Empty, Field, Modal, Select, useAct } from './ui'
import type { VinculoDoc as Vinculo } from './TarefaForm'

/** Documentos de uma empresa, oportunidade ou projeto: arquivo (Storage) ou link, com versão e aprovação. */
export default function Documentos({ vinculo, onChanged }: { vinculo: Vinculo; onChanged?: () => void }) {
  const act = useAct()
  const col = vinculo.contrato_id ? 'contrato_id' : vinculo.unidade_id ? 'unidade_id' : vinculo.projeto_id ? 'projeto_id' : vinculo.oportunidade_id ? 'oportunidade_id' : 'organizacao_id'
  const refId = (vinculo.contrato_id ?? vinculo.unidade_id ?? vinculo.projeto_id ?? vinculo.oportunidade_id ?? vinculo.organizacao_id) as string
  const { data, loading, reload } = useAsync(
    async () =>
      unwrap(
        await supabase.from('documentos').select('*, autor:profiles!enviado_por(nome)').eq(col, refId).order('created_at', { ascending: false }),
      ) as Documento[],
    [col, refId],
  )
  const [form, setForm] = useState<{ base?: Documento } | null>(null)
  const [excluir, setExcluir] = useState<Documento | null>(null)
  const [antigas, setAntigas] = useState(false)
  const lista = (data ?? []).filter((d) => antigas || d.status_aprovacao !== 'Obsoleto')

  async function abrir(d: Documento) {
    if (d.url) return void window.open(d.url, '_blank', 'noopener')
    if (!d.arquivo_path) return
    const ok = await act(async () => {
      const { data: s, error } = await supabase.storage.from('documentos').createSignedUrl(d.arquivo_path as string, 120)
      if (error || !s) throw new Error(error?.message ?? 'Não foi possível abrir o arquivo.')
      window.open(s.signedUrl, '_blank', 'noopener')
    })
    return ok
  }

  async function mudarStatus(d: Documento, s: string) {
    const ok = await act(async () => unwrap(await supabase.from('documentos').update({ status_aprovacao: s }).eq('id', d.id).select()))
    if (ok) { reload(); onChanged?.() }
  }

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 10 }}>
        <button className="btn" onClick={() => setForm({})}>+ Adicionar documento</button>
        <label className="check"><input type="checkbox" checked={antigas} onChange={(e) => setAntigas(e.target.checked)} /> Mostrar versões antigas</label>
      </div>
      {loading && !data ? <p className="muted">Carregando…</p> : lista.length === 0 ? <Empty>Nenhum documento.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Documento</th><th>Tipo</th><th>Versão</th><th>Status</th><th>Validade</th><th>Enviado</th><th /></tr></thead>
            <tbody>
              {lista.map((d) => (
                <tr key={d.id} style={d.status_aprovacao === 'Obsoleto' ? { opacity: 0.55 } : undefined}>
                  <td>
                    <button className="link-btn" onClick={() => abrir(d)}>{d.nome}</button>
                    <div className="muted">{d.arquivo_nome ? `Arquivo: ${d.arquivo_nome}` : 'Link externo'}{d.observacoes ? ` · ${d.observacoes}` : ''}</div>
                  </td>
                  <td>{d.tipo}</td>
                  <td className="mono">v{d.versao}</td>
                  <td style={{ width: 150 }}>
                    <Select value={d.status_aprovacao} onChange={(e) => mudarStatus(d, e.target.value)} options={STATUS_DOCUMENTO} placeholder="—" />
                  </td>
                  <td>{d.validade ? <Badge tone={isOverdue(d.validade) ? 'bad' : 'neutral'}>{isOverdue(d.validade) ? 'vencido ' : ''}{fdate(d.validade)}</Badge> : <span className="muted">—</span>}</td>
                  <td className="muted">{fdatetime(d.created_at)}<br />{d.autor?.nome}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-sm" onClick={() => setForm({ base: d })} title="Enviar uma nova versão deste documento">Nova versão</button>{' '}
                    <button className="icon-btn row-del" title="Excluir" aria-label={`Excluir ${d.nome}`} onClick={() => setExcluir(d)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form && <DocumentoForm vinculo={vinculo} base={form.base} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); onChanged?.() }} />}
      {excluir && (
        <Confirm
          title="Excluir documento"
          message={`Excluir “${excluir.nome}” (v${excluir.versao})? O arquivo também é removido.`}
          confirmLabel="Excluir"
          onCancel={() => setExcluir(null)}
          onConfirm={async () => {
            const d = excluir
            setExcluir(null)
            const ok = await act(async () => {
              const rows = unwrap(await supabase.from('documentos').delete().eq('id', d.id).select()) as unknown[]
              if (rows.length === 0) throw new Error('Somente quem enviou o documento ou o gestor pode excluí-lo.')
              if (d.arquivo_path) await supabase.storage.from('documentos').remove([d.arquivo_path])
            }, 'Documento excluído')
            if (ok) { reload(); onChanged?.() }
          }}
        />
      )}
    </div>
  )
}

function DocumentoForm({ vinculo, base, onClose, onSaved }: { vinculo: Vinculo; base?: Documento; onClose: () => void; onSaved: () => void }) {
  const act = useAct()
  const fileRef = useRef<HTMLInputElement>(null)
  const [d, setD] = useState({
    nome: base?.nome ?? '',
    tipo: base?.tipo ?? 'Outro',
    status_aprovacao: 'Rascunho',
    validade: '',
    url: '',
    observacoes: '',
  })
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }))
  const escopo = vinculo.contrato_id ? `contratos/${vinculo.contrato_id}` : vinculo.unidade_id ? `unidades/${vinculo.unidade_id}` : vinculo.projeto_id ? `projetos/${vinculo.projeto_id}` : vinculo.oportunidade_id ? `oportunidades/${vinculo.oportunidade_id}` : `organizacoes/${vinculo.organizacao_id}`
  const falta = !d.nome.trim() || (!arquivo && !d.url.trim())

  async function salvar() {
    setBusy(true)
    const ok = await act(async () => {
      let path: string | null = null
      if (arquivo) {
        const seguro = arquivo.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_')
        path = `${escopo}/${crypto.randomUUID()}-${seguro}`
        const { error } = await supabase.storage.from('documentos').upload(path, arquivo)
        if (error) throw new Error(`Falha no envio do arquivo: ${error.message}. Confira se o bucket "documentos" existe no Storage (ou use um link).`)
      }
      const novo = unwrap(
        await supabase
          .from('documentos')
          .insert({
            nome: d.nome.trim(),
            tipo: d.tipo,
            status_aprovacao: d.status_aprovacao,
            validade: nullIfEmpty(d.validade),
            url: nullIfEmpty(d.url),
            observacoes: nullIfEmpty(d.observacoes),
            arquivo_path: path,
            arquivo_nome: arquivo?.name ?? null,
            versao: base ? base.versao + 1 : 1,
            substitui_id: base?.id ?? null,
            ...vinculo,
          })
          .select('id')
          .single(),
      ) as { id: string }
      if (base) {
        const r = await supabase.from('documentos').update({ status_aprovacao: 'Obsoleto' }).eq('id', base.id)
        if (r.error) throw new Error(`Versão nova salva (${novo.id.slice(0, 8)}), mas não foi possível marcar a anterior como obsoleta: ${r.error.message}`)
      }
    }, base ? 'Nova versão registrada' : 'Documento adicionado')
    setBusy(false)
    if (ok) onSaved()
  }

  return (
    <Modal
      title={base ? `Nova versão de “${base.nome}”` : 'Adicionar documento'}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={busy || falta}>Salvar</button>
        </>
      }
    >
      <div className="grid">
        <Field label="Nome *" span={2}><input value={d.nome} onChange={(e) => set('nome', e.target.value)} autoFocus /></Field>
        <Field label="Tipo"><Select value={d.tipo} onChange={(e) => set('tipo', e.target.value)} options={TIPOS_DOCUMENTO} placeholder="—" /></Field>
        <Field label="Arquivo" span={2} hint="Ou informe um link abaixo (Drive, SharePoint…)">
          <input ref={fileRef} type="file" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
        </Field>
        <Field label="Status"><Select value={d.status_aprovacao} onChange={(e) => set('status_aprovacao', e.target.value)} options={STATUS_DOCUMENTO.filter((s) => s !== 'Obsoleto')} placeholder="—" /></Field>
        <Field label="Link" span={2}><input value={d.url} onChange={(e) => set('url', e.target.value)} placeholder="https://…" /></Field>
        <Field label="Validade" hint="Para licenças, seguros, laudos…"><input type="date" value={d.validade} onChange={(e) => set('validade', e.target.value)} /></Field>
        <Field label="Observações" span={3}><input value={d.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></Field>
        {base && <div className="alert alert-info span-3">A versão anterior (v{base.versao}) será marcada como obsoleta.</div>}
      </div>
    </Modal>
  )
}
