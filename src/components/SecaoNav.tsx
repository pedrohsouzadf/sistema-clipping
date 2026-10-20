import { Link, useLocation } from 'react-router-dom'
import { SECOES, abaAtiva, secaoDe } from '../lib/secoes'

export function MenuLateral() {
  const { pathname } = useLocation()
  const atual = secaoDe(pathname)
  return (
    <nav>
      {SECOES.filter((s) => !s.rodape).map((s) => (
        <Link key={s.to} to={s.to} className={atual.to === s.to ? 'active' : undefined} aria-current={atual.to === s.to ? 'page' : undefined}>
          {s.titulo}
        </Link>
      ))}
    </nav>
  )
}

/** Botão de Configurações, na parte de baixo da barra lateral. */
export function BotaoConfiguracoes() {
  const { pathname } = useLocation()
  const s = SECOES.find((x) => x.rodape)
  if (!s) return null
  const ativo = secaoDe(pathname).to === s.to
  return (
    <Link to={s.to} className={`side-config ${ativo ? 'active' : ''}`} aria-current={ativo ? 'page' : undefined}>
      <span aria-hidden>⚙</span> {s.titulo}
    </Link>
  )
}

/** Abas da área atual, acima do conteúdo. */
export function AbasDaSecao({ isGestor }: { isGestor: boolean }) {
  const { pathname } = useLocation()
  const s = secaoDe(pathname)
  if (!s.abas) return null
  const ativa = abaAtiva(s, pathname)
  return (
    <div className="tabs" role="tablist" aria-label={s.titulo}>
      {s.abas.filter((a) => !a.gestor || isGestor).map((a) => (
        <Link key={a.to} to={a.to} role="tab" aria-selected={ativa?.to === a.to} className={`tab ${ativa?.to === a.to ? 'on' : ''}`}>
          {a.rotulo}
        </Link>
      ))}
    </div>
  )
}
