import { useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErro(null)
    setAviso(null)
    const err = modo === 'entrar' ? await signIn(email, senha) : await signUp(email, senha, nome)
    if (err) setErro(err)
    else if (modo === 'criar') setAviso('Conta criada. Se o projeto exigir confirmação por e-mail, confirme antes de entrar.')
    setBusy(false)
  }

  return (
    <div className="center-screen">
      <form className="card login" onSubmit={submit}>
        <div className="brand brand-lg">
          <span className="brand-mark" aria-hidden />
          <span>
            <b>Clip</b> CRM
          </span>
        </div>
        <p className="muted">Funil comercial e processo padrão da Clip.</p>
        {modo === 'criar' && (
          <label className="field">
            <span className="field-label">Nome</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} required autoComplete="name" />
          </label>
        )}
        <label className="field">
          <span className="field-label">E-mail</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label className="field">
          <span className="field-label">Senha</span>
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
            minLength={6}
            autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
          />
        </label>
        {erro && <div className="alert alert-bad">{erro}</div>}
        {aviso && <div className="alert alert-ok">{aviso}</div>}
        <button className="btn btn-primary" disabled={busy}>
          {modo === 'entrar' ? 'Entrar' : 'Criar conta'}
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setModo(modo === 'entrar' ? 'criar' : 'entrar')
            setErro(null)
          }}
        >
          {modo === 'entrar' ? 'Primeiro acesso? Criar conta' : 'Já tenho conta'}
        </button>
      </form>
    </div>
  )
}
