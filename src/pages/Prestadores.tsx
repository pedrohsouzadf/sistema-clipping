import { useMemo, useState } from 'react'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { fdate, nullIfEmpty } from '../lib/format'
import { podeEditarParceiros } from '../lib/papeis'
import { DISPONIBILIDADES, OFICIOS, type Prestador } from '../lib/types'
import { Badge, Confirm, Empty, Field, Loading, Modal, PageHead, Select, useAct } from '../components/ui'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
const tomDisp = (h: string) => (h === 'Disponível' ? 'ok' : h === 'Parcial' ? 'warn' : 'bad') as 'ok' | 'warn' | 'bad'

export default function Prestadores() {
  const { profile } = useAuth()
  const pode = podeEditarParceiros(profile?.role)
  const { data, loading, error, reload } = useAsync(async () => unwrap(await supabase.from('prestadores').select('*')) as Prestador[])
  const [f, setF] = useState({ q: '', oficio: '', cidade: '', disp: '', nota: '' })
  const [edit, setEdit] = useState<Prestador | 'novo' | null>(null)
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))

  const oficios = useMemo(() => {
    const m = new Map<string, string>()
    ;[...OFICIOS, ...(data ?? []).map((p) => p.oficio)].forEach((o) => m.has(norm(o)) || m.set(norm(o), o))
    return [...m.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [data])

  const lista = useMemo(
    () =>
      (data ?? [])
        .filter(
          (p) =>
            (!f.q || norm(`${p.nome} ${p.telefone ?? ''} ${p.email ?? ''}`).includes(norm(f.q))) &&
            (!f.oficio || norm(p.oficio) === norm(f.oficio)) &&
            (!f.cidade || p.cidades.some((c) => norm(c).includes(norm(f.cidade)))) &&
            (!f.disp || (f.disp === 'ativos' ? p.disponibilidade !== 'Indisponível' : p.disponibilidade === f.disp)) &&
            (!f.nota || (p.nota != null && p.nota >= Number(f.nota))),
        )
        .sort((a, b) => a.oficio.localeCompare(b.oficio, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR')),
    [data, f],
  )

  return (
    <>
      <PageHead
        title="Prestadores de serviço"
        sub="Profissionais e autônomos por ofício e cidade: pintor, eletricista, bombeiro hidráulico e outros. Empresas fornecedoras ficam na aba Fornecedores."
        actions={pode ? <button className="btn btn-primary" onClick={() => setEdit('novo')}>+ Novo prestador</button> : undefined}
      />
      <div className="toolbar">
        <input placeholder="Buscar por nome, telefone ou e-mail…" value={f.q} onChange={(e) => set('q', e.target.value)} />
        <Select value={f.oficio} onChange={(e) => set('oficio', e.target.value)} placeholder="Todo ofício" options={oficios} />
        <input placeholder="Cidade" value={f.cidade} onChange={(e) => set('cidade', e.target.value)} style={{ maxWidth: 160 }} />
        <Select value={f.disp} onChange={(e) => set('disp', e.target.value)} placeholder="Qualquer disponibilidade" options={[{ v: 'ativos', l: 'Disponível ou parcial' }, ...DISPONIBILIDADES.map((d) => ({ v: d, l: d }))]} />
        <Select value={f.nota} onChange={(e) => set('nota', e.target.value)} placeholder="Qualquer nota" options={[{ v: '3', l: 'Nota 3 ou mais' }, { v: '4', l: 'Nota 4 ou mais' }, { v: '5', l: 'Nota 5' }]} />
      </div>

      {loading && !data ? <Loading error={error} /> : lista.length === 0 ? (
        <Empty>{(data ?? []).length === 0 ? 'Nenhum prestador cadastrado ainda. Use “+ Novo prestador”.' : 'Nenhum prestador encontrado com esses filtros.'}</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Prestador</th><th>Ofício</th><th>Contato</th><th>Cidades</th><th>Disponibilidade</th><th>Nota</th></tr></thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id} className="clickable" onClick={() => setEdit(p)}>
                  <td><b>{p.nome}</b>{p.valor_referencia && <div className="muted">{p.valor_referencia}</div>}</td>
                  <td><Badge tone="neutral">{p.oficio}</Badge></td>
                  <td>{p.telefone ?? <span className="muted">—</span>}{p.email && <div className="muted">{p.email}</div>}</td>
                  <td>{p.cidades.join(', ') || <span className="muted">—</span>}</td>
                  <td>
                    <Badge tone={tomDisp(p.disponibilidade)}>{p.disponibilidade}</Badge>
                    {p.disponivel_a_partir && p.disponibilidade !== 'Disponível' && <div className="muted">a partir de {fdate(p.disponivel_a_partir)}</div>}
                  </td>
                  <td>{p.nota != null ? <span className="nota">★ {p.nota}</span> : <span className="muted">sem nota</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {edit && (
        <PrestadorModal
          p={edit === 'novo' ? null : edit}
          oficios={oficios}
          pode={pode}
          onClose={() => setEdit(null)}
          onSaved={() => { setEdit(null); reload() }}
        />
      )}
    </>
  )
}

function PrestadorModal({ p, oficios, pode, onClose, onSaved }: { p: Prestador | null; oficios: string[]; pode: boolean; onClose: () => void; onSaved: () => void }) {
  const act = useAct()
  const { isGestor } = useAuth()
  const s = (v: unknown) => (v == null ? '' : String(v))
  const [d, setD] = useState({
    nome: s(p?.nome), oficio: s(p?.oficio), telefone: s(p?.telefone), email: s(p?.email), cidades: (p?.cidades ?? []).join(', '),
    disponibilidade: (p?.disponibilidade ?? 'Disponível') as string, disponivel_a_partir: s(p?.disponivel_a_partir), nota: s(p?.nota),
    valor_referencia: s(p?.valor_referencia), indicado_por: s(p?.indicado_por), observacoes: s(p?.observacoes),
  })
  const [excluir, setExcluir] = useState(false)
  const set = (k: keyof typeof d, v: string) => setD((x) => ({ ...x, [k]: v }))
  const valido = d.nome.trim() !== '' && d.oficio.trim() !== ''

  async function salvar() {
    const payload = {
      nome: d.nome.trim(), oficio: d.oficio.trim(), telefone: nullIfEmpty(d.telefone), email: nullIfEmpty(d.email), cidades: csv(d.cidades),
      disponibilidade: d.disponibilidade, disponivel_a_partir: d.disponibilidade === 'Disponível' ? null : nullIfEmpty(d.disponivel_a_partir),
      nota: d.nota === '' ? null : Number(d.nota), valor_referencia: nullIfEmpty(d.valor_referencia), indicado_por: nullIfEmpty(d.indicado_por),
      observacoes: nullIfEmpty(d.observacoes),
    }
    const ok = await act(
      async () => unwrap(p ? await supabase.from('prestadores').update(payload).eq('id', p.id).select() : await supabase.from('prestadores').insert(payload).select()),
      p ? 'Prestador atualizado' : 'Prestador cadastrado',
    )
    if (ok) onSaved()
  }

  async function remover() {
    if (!p) return
    const ok = await act(async () => unwrap(await supabase.from('prestadores').delete().eq('id', p.id).select()), 'Prestador excluído')
    if (ok) onSaved()
  }

  return (
    <Modal
      title={p ? p.nome : 'Novo prestador'}
      onClose={onClose}
      wide
      footer={
        <>
          {p && isGestor && <button className="btn btn-danger" onClick={() => setExcluir(true)}>Excluir</button>}
          <button className="btn" onClick={onClose}>{pode ? 'Cancelar' : 'Fechar'}</button>
          {pode && <button className="btn btn-primary" onClick={salvar} disabled={!valido}>Salvar</button>}
        </>
      }
    >
      <fieldset disabled={!pode} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="grid">
          <Field label="Nome *" span={2}><input value={d.nome} onChange={(e) => set('nome', e.target.value)} autoFocus /></Field>
          <Field label="Ofício *" hint="Escolha ou digite outro">
            <input list="oficio-list" value={d.oficio} onChange={(e) => set('oficio', e.target.value)} placeholder="Ex.: Pintor" />
            <datalist id="oficio-list">{oficios.map((o) => <option key={o} value={o} />)}</datalist>
          </Field>
          <Field label="Telefone / WhatsApp"><input value={d.telefone} onChange={(e) => set('telefone', e.target.value)} /></Field>
          <Field label="E-mail" span={2}><input type="email" value={d.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Cidades e regiões atendidas" span={3} hint="Separe por vírgula"><input value={d.cidades} onChange={(e) => set('cidades', e.target.value)} placeholder="Ex.: Brasília, Taguatinga" /></Field>
          <Field label="Disponibilidade"><Select value={d.disponibilidade} onChange={(e) => set('disponibilidade', e.target.value)} options={DISPONIBILIDADES} placeholder="—" /></Field>
          <Field label="Disponível a partir de"><input type="date" value={d.disponivel_a_partir} onChange={(e) => set('disponivel_a_partir', e.target.value)} disabled={d.disponibilidade === 'Disponível'} /></Field>
          <Field label="Nota (1 a 5)"><Select value={d.nota} onChange={(e) => set('nota', e.target.value)} options={[1, 2, 3, 4, 5].map((n) => ({ v: String(n), l: String(n) }))} placeholder="Sem nota" /></Field>
          <Field label="Valor de referência" span={2} hint="Texto livre: diária, hora ou tabela"><input value={d.valor_referencia} onChange={(e) => set('valor_referencia', e.target.value)} /></Field>
          <Field label="Indicado por"><input value={d.indicado_por} onChange={(e) => set('indicado_por', e.target.value)} /></Field>
          <Field label="Observações" span={3}><textarea rows={3} value={d.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></Field>
        </div>
      </fieldset>
      {excluir && p && (
        <Confirm title="Excluir prestador" message={`Excluir “${p.nome}” da lista de prestadores?`} confirmLabel="Excluir" onConfirm={remover} onCancel={() => setExcluir(false)} />
      )}
    </Modal>
  )
}
