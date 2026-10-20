import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { configured } from './lib/supabase'
import Login from './pages/Login'
import Painel from './pages/Painel'
import Funil from './pages/Funil'
import Projetos from './pages/Projetos'
import ProjetoDetalhe from './pages/ProjetoDetalhe'
import Parceiros from './pages/Parceiros'
import OportunidadeDetalhe from './pages/OportunidadeDetalhe'
import Organizacoes from './pages/Organizacoes'
import Operacoes from './pages/Operacoes'
import OperacaoDetalhe from './pages/OperacaoDetalhe'
import Contatos from './pages/Contatos'
import Tarefas from './pages/Tarefas'
import Clientes from './pages/Clientes'
import Unidades from './pages/Unidades'
import Contratos from './pages/Contratos'
import Chamados from './pages/Chamados'
import Servicos from './pages/Servicos'
import Manutencao from './pages/Manutencao'
import Garantias from './pages/Garantias'
import Ocorrencias from './pages/Ocorrencias'
import Financeiro from './pages/Financeiro'
import Lancamentos from './pages/Lancamentos'
import Equipe from './pages/Equipe'
import EmBreve from './pages/EmBreve'
import { BaseHistorico } from './pages/BaseDados'
import { MenuLateral, AbasDaSecao, BotaoConfiguracoes } from './components/SecaoNav'
import { SECOES } from './lib/secoes'

function Setup() {
  return (
    <div className="center-screen">
      <div className="card setup">
        <h1>Clip CRM</h1>
        <p>O app ainda não está conectado ao Supabase.</p>
        <ol>
          <li>Crie um projeto em supabase.com.</li>
          <li>
            No <b>SQL Editor</b>, rode em ordem os arquivos de <code>supabase/migrations</code> (<code>0001</code> a{' '}
            <code>0006</code>) e depois <code>supabase/seed.sql</code>.
          </li>
          <li>
            Copie <code>.env.example</code> para <code>.env.local</code> e preencha a URL e a anon key
            (Project Settings → API).
          </li>
          <li>
            Reinicie com <code>npm run dev</code>.
          </li>
        </ol>
        <p className="muted">Passo a passo completo no README da pasta do app.</p>
      </div>
    </div>
  )
}

export default function App() {
  const { session, profile, loading, signOut, isGestor } = useAuth()

  if (!configured) return <Setup />
  if (loading) return <div className="center-screen muted">Carregando…</div>
  if (!session) return <Login />
  if (!profile)
    return (
      <div className="center-screen">
        <div className="card setup">
          <h1>Perfil não encontrado</h1>
          <p>
            Seu usuário existe, mas o perfil não foi criado. Confirme que a migration <code>0001_init.sql</code>{' '}
            foi executada por completo e recarregue a página.
          </p>
          <button className="btn" onClick={signOut}>
            Sair
          </button>
        </div>
      </div>
    )

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <span>
            <b>Clip</b> CRM
          </span>
        </div>
        <MenuLateral />
        <div className="sidebar-foot">
          <div className="who">
            <b>{profile.nome ?? profile.email}</b>
          </div>
          <BotaoConfiguracoes />
          <button className="btn btn-ghost" onClick={signOut}>
            Sair
          </button>
        </div>
      </aside>
      <main className="main">
        <AbasDaSecao isGestor={isGestor} />
        <Routes>
          <Route path="/" element={<Painel />} />
          <Route path="/funil" element={<Funil />} />
          <Route path="/oportunidades/:id" element={<OportunidadeDetalhe />} />
          <Route path="/projetos" element={<Projetos />} />
          <Route path="/projetos/:id" element={<ProjetoDetalhe />} />
          <Route path="/parceiros" element={<Parceiros />} />
          <Route path="/operacoes" element={<Operacoes />} />
          <Route path="/operacoes/:id" element={<OperacaoDetalhe />} />
          <Route path="/organizacoes" element={<Organizacoes />} />
          <Route path="/contatos" element={<Contatos />} />
          <Route path="/tarefas" element={<Tarefas />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/unidades" element={<Unidades />} />
          <Route path="/contratos" element={<Contratos />} />
          <Route path="/chamados" element={<Chamados />} />
          <Route path="/servicos" element={<Servicos />} />
          <Route path="/manutencao" element={<Manutencao />} />
          <Route path="/garantias" element={<Garantias />} />
          <Route path="/ocorrencias" element={<Ocorrencias />} />
          <Route path="/financeiro" element={<Financeiro />} />
          <Route path="/financeiro/lancamentos" element={<Lancamentos />} />
          {SECOES.filter((x) => x.fase).map((x) => (
            <Route key={x.to} path={x.to} element={<EmBreve secao={x} />} />
          ))}
          <Route path="/configuracoes" element={<BaseHistorico />} />
          {isGestor && <Route path="/configuracoes/equipe" element={<Equipe />} />}
          <Route path="/base/*" element={<Navigate to="/configuracoes" replace />} />
          <Route path="/equipe" element={<Navigate to="/configuracoes/equipe" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
