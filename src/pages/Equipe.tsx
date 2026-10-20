import { useState } from 'react'
import { supabase, supabaseCadastro, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import type { Profile } from '../lib/types'
import { Field, Loading, Modal, PageHead, useAct } from '../components/ui'

export default function Equipe() {
  const { data, loading, error, reload } = useAsync(async () => unwrap(await supabase.from('profiles').select('id,nome,email,role').order('nome')) as Profile[])
  const [novo, setNovo] = useState(false)

  return (
    <>
      <PageHead
        title="Equipe e permissões"
        sub="Pessoas com acesso ao sistema."
        actions={<button className="btn btn-primary" onClick={() => setNovo(true)}>+ Novo usuário</button>}
      />
      {loading && !data ? <Loading error={error} /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nome</th><th>E-mail</th></tr></thead>
            <tbody>
              {data?.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.nome ?? '—'}</b></td>
                  <td>{p.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {novo && <NovoUsuario onClose={() => setNovo(false)} onCreated={() => { setNovo(false); reload() }} />}
    </>
  )
}

function NovoUsuario({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const act = useAct()
  const [d, setD] = useState({ nome: '', email: '', senha: '' })
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof d>(k: K, v: string) => setD((x) => ({ ...x, [k]: v }))
  const emailOk = /^\S+@\S+\.\S+$/.test(d.email.trim())
  const falta = !d.nome.trim() || !emailOk || d.senha.length < 6

  async function criar() {
    setBusy(true)
    const ok = await act(async () => {
      const { data, error } = await supabaseCadastro.auth.signUp({ email: d.email.trim(), password: d.senha, options: { data: { nome: d.nome.trim() } } })
      if (error) throw new Error(error.message)
      if (data.user && data.user.identities?.length === 0) throw new Error('Este e-mail já tem cadastro.')
    }, 'Usuário cadastrado')
    setBusy(false)
    if (ok) onCreated()
  }

  return (
    <Modal title="Novo usuário" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={criar} disabled={busy || falta}>Cadastrar</button></>}>
      <div className="grid">
        <Field label="Nome *" span={3}><input value={d.nome} onChange={(e) => set('nome', e.target.value)} autoFocus /></Field>
        <Field label="E-mail *" span={3}><input type="email" value={d.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Senha inicial *" span={3} hint="Mínimo de 6 caracteres. Passe a senha à pessoa por um canal seguro."><input type="text" value={d.senha} onChange={(e) => set('senha', e.target.value)} autoComplete="off" /></Field>
      </div>
    </Modal>
  )
}
