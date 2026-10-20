export interface Aba { to: string; rotulo: string; prefixos: string[]; gestor?: boolean }
export interface Secao {
  to: string
  titulo: string
  prefixos: string[]
  abas?: Aba[]
  /** botão no rodapé da barra lateral, em vez da lista principal */
  rodape?: boolean
  /** seções ainda sem módulo: mostram a página "em breve" */
  fase?: string
  desc?: string
}

/** Arquitetura do sistema: cada item do menu lateral é uma área; as abas ficam dentro da área. */
export const SECOES: Secao[] = [
  { to: '/', titulo: 'Dashboard Executivo', prefixos: ['/'] },
  {
    to: '/funil', titulo: 'CRM e comercial', prefixos: ['/funil', '/oportunidades', '/organizacoes', '/contatos'],
  },
  {
    to: '/clientes', titulo: 'Clientes e contratos', prefixos: ['/clientes', '/unidades', '/contratos'],
    abas: [
      { to: '/clientes', rotulo: 'Clientes', prefixos: ['/clientes'] },
      { to: '/unidades', rotulo: 'Unidades', prefixos: ['/unidades'] },
      { to: '/contratos', rotulo: 'Contratos', prefixos: ['/contratos'] },
    ],
  },
  {
    to: '/projetos', titulo: 'Projetos e implantação', prefixos: ['/projetos', '/tarefas', '/operacoes'],
    abas: [
      { to: '/projetos', rotulo: 'Projetos', prefixos: ['/projetos'] },
      { to: '/tarefas', rotulo: 'Tarefas', prefixos: ['/tarefas'] },
      { to: '/operacoes', rotulo: 'Cotações', prefixos: ['/operacoes'] },
    ],
  },
  {
    to: '/chamados', titulo: 'Operação e facilities', prefixos: ['/chamados', '/servicos', '/manutencao', '/garantias', '/ocorrencias'],
    abas: [
      { to: '/chamados', rotulo: 'Chamados', prefixos: ['/chamados'] },
      { to: '/servicos', rotulo: 'Serviços por unidade', prefixos: ['/servicos'] },
      { to: '/manutencao', rotulo: 'Manutenção e inspeções', prefixos: ['/manutencao'] },
      { to: '/garantias', rotulo: 'Garantias e vencimentos', prefixos: ['/garantias'] },
      { to: '/ocorrencias', rotulo: 'Histórico de ocorrências', prefixos: ['/ocorrencias'] },
    ],
  },
  { to: '/parceiros', titulo: 'Rede de parceiros', prefixos: ['/parceiros'] },
  {
    to: '/financeiro', titulo: 'Financeiro por contrato', prefixos: ['/financeiro'],
    abas: [
      { to: '/financeiro', rotulo: 'Visão por contrato', prefixos: ['/financeiro'] },
      { to: '/financeiro/lancamentos', rotulo: 'Lançamentos', prefixos: ['/financeiro/lancamentos'] },
    ],
  },
  {
    to: '/configuracoes', titulo: 'Configurações', prefixos: ['/configuracoes'], rodape: true,
    abas: [
      { to: '/configuracoes', rotulo: 'Histórico de alterações', prefixos: ['/configuracoes'] },
      { to: '/configuracoes/equipe', rotulo: 'Equipe e permissões', prefixos: ['/configuracoes/equipe'], gestor: true },
    ],
  },
]

export const casa = (path: string, prefixos: string[]) =>
  prefixos.some((p) => (p === '/' ? path === '/' : path === p || path.startsWith(`${p}/`)))

export const secaoDe = (path: string) => SECOES.find((s) => s.to !== '/' && casa(path, s.prefixos)) ?? SECOES[0]

/** Aba ativa: a mais específica (maior prefixo) que casa com o caminho. */
export function abaAtiva(s: Secao, path: string): Aba | undefined {
  return (s.abas ?? [])
    .flatMap((a) => a.prefixos.filter((p) => casa(path, [p])).map((p) => ({ a, n: p.length })))
    .sort((x, y) => y.n - x.n)[0]?.a
}
