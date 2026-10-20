import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { fdate, isOverdue, media, money, nullIfEmpty, todayISO } from '../lib/format'
import { podeEditarParceiros } from '../lib/papeis'
import { DISPONIBILIDADES, ESPECIALIDADES, HOMOLOGACOES, type Organizacao, type Parceiro, type ProjetoParceiro } from '../lib/types'
import { Badge, Confirm, Empty, Field, Loading, Modal, PageHead, Select, useAct } from '../components/ui'
import OrgForm from '../components/OrgForm'

type Linha = ProjetoParceiro & { projeto: { id: string; nome: string } | null }
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
const tomHomolog = (h: string) => (h === 'Homologado' ? 'ok' : h === 'Em análise' ? 'warn' : 'bad') as 'ok' | 'warn' | 'bad'
const tomDisp = (h: string) => (h === 'Disponível' ? 'ok' : h === 'Parcial' ? 'warn' : 'bad') as 'ok' | 'warn' | 'bad'
const notaLinha = (r: ProjetoParceiro) => media([r.nota_qualidade, r.nota_seguranca, r.nota_comunicacao, r.nota_documental, r.nota_geral])

function desempenho(linhas: Linha[]) {
  const notas = linhas.map(notaLinha).filter((n): n is number => n != null)
  const comPrazo = linhas.filter((l) => l.prazo_cumprido != null)
  return {
    nota: notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null,
    projetos: linhas.length,
    noPrazo: comPrazo.length ? Math.round((comPrazo.filter((l) => l.prazo_cumprido).length / comPrazo.length) * 100) : null,
    retrabalhos: linhas.filter((l) => l.retrabalho).length,
  }
}

export default function Parceiros() {
  const { profile } = useAuth()
  const pode = podeEditarParceiros(profile?.role)
  const { data, loading, error, reload } = useAsync(async () => {
    const [p, l] = await Promise.all([
      supabase.from('parceiros').select('*, organizacao:organizacoes(id,nome,cnpj)'),
      supabase.from('projeto_parceiros').select('*, projeto:projetos(id,nome)'),
    ])
    return { parceiros: unwrap(p) as unknown as Parceiro[], linhas: unwrap(l) as unknown as Linha[] }
  })
  const [f, setF] = useState({ q: '', cidade: '', esp: '', homolog: '', disp: '', nota: '' })
  const [edit, setEdit] = useState<Parceiro | null>(null)
  const [novo, setNovo] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))

  const especialidades = useMemo(() => {
    const m = new Map<string, string>()
    ;[...ESPECIALIDADES, ...(data?.parceiros ?? []).flatMap((p) => p.especialidades)].forEach((e) => m.has(norm(e)) || m.set(norm(e), e))
    return [...m.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [data])

  const lista = useMemo(() => {
    return (data?.parceiros ?? [])
      .map((p) => ({ p, d: desempenho((data?.linhas ?? []).filter((l) => l.parceiro_id === p.id)) }))
      .filter(({ p, d }) =>
        (!f.q || norm(`${p.organizacao?.nome ?? ''} ${p.organizacao?.cnpj ?? ''}`).includes(norm(f.q))) &&
        (!f.cidade || p.cidades.some((c) => norm(c).includes(norm(f.cidade)))) &&
        (!f.esp || p.especialidades.some((e) => norm(e) === norm(f.esp))) &&
        (!f.homolog || p.homologacao === f.homolog) &&
        (!f.disp || (f.disp === 'ativos' ? p.disponibilidade !== 'Indisponível' : p.disponibilidade === f.disp)) &&
        (!f.nota || (d.nota != null && d.nota >= Number(f.nota))),
      )
      .sort((a, b) => (a.p.organizacao?.nome ?? '').localeCompare(b.p.organizacao?.nome ?? '', 'pt-BR'))
  }, [data, f])

  return (
    <>
      <PageHead
        title="Parceiros"
        sub="Fornecedores e profissionais por cidade e especialidade, com homologação e desempenho nos projetos. Exemplo de busca: elétrica + Bragança Paulista + homologado + disponível + nota 4 ou mais."
        actions={pode ? <button className="btn btn-primary" onClick={() => setNovo(true)}>+ Novo parceiro</button> : undefined}
      />
      <div className="toolbar">
        <input placeholder="Buscar por nome ou CNPJ…" value={f.q} onChange={(e) => set('q', e.target.value)} />
        <input placeholder="Cidade" value={f.cidade} onChange={(e) => set('cidade', e.target.value)} style={{ maxWidth: 160 }} />
        <Select value={f.esp} onChange={(e) => set('esp', e.target.value)} placeholder="Toda especialidade" options={especialidades} />
        <Select value={f.homolog} onChange={(e) => set('homolog', e.target.value)} placeholder="Toda homologação" options={HOMOLOGACOES} />
        <Select value={f.disp} onChange={(e) => set('disp', e.target.value)} placeholder="Qualquer disponibilidade" options={[{ v: 'ativos', l: 'Disponível ou parcial' }, ...DISPONIBILIDADES.map((d) => ({ v: d, l: d }))]} />
        <Select value={f.nota} onChange={(e) => set('nota', e.target.value)} placeholder="Qualquer nota" options={[{ v: '3', l: 'Nota 3 ou mais' }, { v: '4', l: 'Nota 4 ou mais' }, { v: '4.5', l: 'Nota 4,5 ou mais' }]} />
      </div>

      {loading && !data ? <Loading error={error} /> : lista.length === 0 ? (
        <Empty>Nenhum parceiro encontrado. Fornecedores cadastrados em Organizações aparecem aqui automaticamente.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Parceiro</th><th>Cidades</th><th>Especialidades</th><th>Disponibilidade</th><th>Homologação</th><th>Desempenho</th></tr></thead>
            <tbody>
              {lista.map(({ p, d }) => (
                <tr key={p.id} className="clickable" onClick={() => setEdit(p)}>
                  <td><b>{p.organizacao?.nome}</b><div className="muted">{p.organizacao?.cnpj ?? ''}</div></td>
                  <td>{p.cidades.join(', ') || <span className="muted">—</span>}</td>
                  <td>{p.especialidades.map((e) => <Badge key={e} tone="neutral">{e}</Badge>)}</td>
                  <td><Badge tone={tomDisp(p.disponibilidade)}>{p.disponibilidade}</Badge>{p.disponivel_a_partir && p.disponibilidade !== 'Disponível' && <div className="muted">a partir de {fdate(p.disponivel_a_partir)}</div>}</td>
                  <td>
                    <Badge tone={tomHomolog(p.homologacao)}>{p.homologacao}</Badge>
                    {p.documentos_validade && isOverdue(p.documentos_validade) && <Badge tone="bad" title="Documentação do parceiro vencida">docs vencidos</Badge>}
                  </td>
                  <td>
                    {d.projetos === 0 ? <span className="muted">sem projetos</span> : (
                      <>
                        {d.nota != null ? <span className="nota">★ {d.nota.toFixed(1)}</span> : <span className="muted">sem nota</span>}
                        <div className="muted">{d.projetos} projeto(s){d.noPrazo != null ? ` · ${d.noPrazo}% no prazo` : ''}{d.retrabalhos ? ` · ${d.retrabalhos} retrabalho(s)` : ''}</div>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {edit && <ParceiroModal p={edit} linhas={(data?.linhas ?? []).filter((l) => l.parceiro_id === edit.id)} pode={pode} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
      {novo && (
        <OrgForm
          defaultPapel="fornecedor"
          onClose={() => setNovo(false)}
          onSaved={async (o: Organizacao) => {
            setNovo(false)
            const r = await supabase.from('parceiros').select('*, organizacao:organizacoes(id,nome,cnpj)').eq('organizacao_id', o.id).maybeSingle()
            reload()
            if (r.data) setEdit(r.data as unknown as Parceiro)
          }}
        />
      )}
    </>
  )
}

function ParceiroModal({ p, linhas, pode, onClose, onSaved }: { p: Parceiro; linhas: Linha[]; pode: boolean; onClose: () => void; onSaved: () => void }) {
  const act = useAct()
  const { isGestor } = useAuth()
  const s = (v: unknown) => (v == null ? '' : String(v))
  const [d, setD] = useState({
    cidades: p.cidades.join(', '), especialidades: p.especialidades.join(', '), tipos_projeto: p.tipos_projeto.join(', '), capacidade: s(p.capacidade),
    disponibilidade: p.disponibilidade as string, disponivel_a_partir: s(p.disponivel_a_partir), faixa_preco: s(p.faixa_preco), mobilizacao_dias: s(p.mobilizacao_dias),
    documentacao: s(p.documentacao), documentos_validade: s(p.documentos_validade), referencias: s(p.referencias), homologacao: p.homologacao as string,
    ultima_revisao: s(p.ultima_revisao), observacoes: s(p.observacoes),
  })
  const [excluir, setExcluir] = useState(false)
  const set = (k: keyof typeof d, v: string) => setD((x) => ({ ...x, [k]: v }))
  const desemp = desempenho(linhas)

  async function salvar() {
    const ok = await act(async () =>
      unwrap(await supabase.from('parceiros').update({
        cidades: csv(d.cidades), especialidades: csv(d.especialidades), tipos_projeto: csv(d.tipos_projeto), capacidade: nullIfEmpty(d.capacidade),
        disponibilidade: d.disponibilidade, disponivel_a_partir: nullIfEmpty(d.disponivel_a_partir), faixa_preco: nullIfEmpty(d.faixa_preco),
        mobilizacao_dias: d.mobilizacao_dias === '' ? null : Number(d.mobilizacao_dias), documentacao: nullIfEmpty(d.documentacao),
        documentos_validade: nullIfEmpty(d.documentos_validade), referencias: nullIfEmpty(d.referencias), homologacao: d.homologacao,
        ultima_revisao: nullIfEmpty(d.ultima_revisao), observacoes: nullIfEmpty(d.observacoes),
      }).eq('id', p.id).select()), 'Parceiro atualizado')
    if (ok) onSaved()
  }

  return (
    <Modal
      title={p.organizacao?.nome ?? 'Parceiro'}
      onClose={onClose}
      wide
      footer={
        <>
          {isGestor && <button className="btn btn-danger" onClick={() => setExcluir(true)}>Excluir perfil</button>}
          <button className="btn" onClick={onClose}>Fechar</button>
          {pode && <button className="btn btn-primary" onClick={salvar}>Salvar</button>}
        </>
      }
    >
      <fieldset disabled={!pode} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="grid">
          <Field label="Cidades e regiões atendidas" span={3} hint="Separe por vírgula"><input value={d.cidades} onChange={(e) => set('cidades', e.target.value)} /></Field>
          <Field label="Especialidades" span={2} hint="Ex.: Elétrica, Civil, Climatização">
            <input list="esp-list" value={d.especialidades} onChange={(e) => set('especialidades', e.target.value)} />
            <datalist id="esp-list">{ESPECIALIDADES.map((e) => <option key={e} value={e} />)}</datalist>
          </Field>
          <Field label="Tipos de projeto atendidos" hint="BTS, fit-out, turnkey…"><input value={d.tipos_projeto} onChange={(e) => set('tipos_projeto', e.target.value)} /></Field>
          <Field label="Capacidade operacional" span={2}><input value={d.capacidade} onChange={(e) => set('capacidade', e.target.value)} placeholder="Ex.: 2 equipes; obras de até 1.500 m²" /></Field>
          <Field label="Mobilização (dias)"><input type="number" min="0" value={d.mobilizacao_dias} onChange={(e) => set('mobilizacao_dias', e.target.value)} /></Field>
          <Field label="Disponibilidade"><Select value={d.disponibilidade} onChange={(e) => set('disponibilidade', e.target.value)} options={DISPONIBILIDADES} placeholder="—" /></Field>
          <Field label="Disponível a partir de"><input type="date" value={d.disponivel_a_partir} onChange={(e) => set('disponivel_a_partir', e.target.value)} /></Field>
          <Field label="Faixa de preço / tabela" ><input value={d.faixa_preco} onChange={(e) => set('faixa_preco', e.target.value)} /></Field>
          <Field label="Homologação">
            <Select value={d.homologacao} onChange={(e) => { set('homologacao', e.target.value); set('ultima_revisao', todayISO()) }} options={HOMOLOGACOES} placeholder="—" />
          </Field>
          <Field label="Última revisão"><input type="date" value={d.ultima_revisao} onChange={(e) => set('ultima_revisao', e.target.value)} /></Field>
          <Field label="Validade da documentação" hint="Licenças, seguros, certidões"><input type="date" value={d.documentos_validade} onChange={(e) => set('documentos_validade', e.target.value)} /></Field>
          <Field label="Documentação, licenças e seguros" span={3}><textarea rows={2} value={d.documentacao} onChange={(e) => set('documentacao', e.target.value)} /></Field>
          <Field label="Referências e projetos anteriores" span={3}><textarea rows={2} value={d.referencias} onChange={(e) => set('referencias', e.target.value)} /></Field>
          <Field label="Observações" span={3}><input value={d.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></Field>
        </div>
      </fieldset>

      <h3>Desempenho nos projetos</h3>
      {linhas.length === 0 ? <p className="muted">Ainda não participou de projetos registrados no sistema. Vincule o parceiro a um projeto (aba Parceiros) e avalie ao final.</p> : (
        <>
          <p className="muted">
            {desemp.nota != null ? `Nota média ${desemp.nota.toFixed(1)} · ` : ''}{desemp.projetos} projeto(s){desemp.noPrazo != null ? ` · ${desemp.noPrazo}% no prazo` : ''} · {desemp.retrabalhos} com retrabalho
          </p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Projeto</th><th>Escopo</th><th>Cotado</th><th>Contratado</th><th>Nota</th><th>Prazo</th></tr></thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id}>
                    <td>{l.projeto ? <Link to={`/projetos/${l.projeto.id}`}>{l.projeto.nome}</Link> : '—'}</td>
                    <td>{l.escopo ?? '—'}</td>
                    <td>{money(l.valor_cotado)}</td>
                    <td>{money(l.valor_contratado)}</td>
                    <td className="nota">{notaLinha(l) != null ? `★ ${(notaLinha(l) as number).toFixed(1)}` : '—'}</td>
                    <td>{l.prazo_cumprido == null ? '—' : l.prazo_cumprido ? 'cumpriu' : 'atrasou'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {excluir && (
        <Confirm
          title="Excluir perfil de parceiro"
          message="O perfil (cidades, homologação, avaliações) é apagado; a empresa continua em Organizações. Se o parceiro já está em projetos, a exclusão é bloqueada."
          confirmLabel="Excluir"
          onCancel={() => setExcluir(false)}
          onConfirm={async () => {
            setExcluir(false)
            const ok = await act(async () => {
              const rows = unwrap(await supabase.from('parceiros').delete().eq('id', p.id).select()) as unknown[]
              if (rows.length === 0) throw new Error('Somente o gestor exclui perfis de parceiro.')
            }, 'Perfil excluído')
            if (ok) onSaved()
          }}
        />
      )}
    </Modal>
  )
}
