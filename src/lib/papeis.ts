import type { Profile } from './types'

type Role = Profile['role'] | undefined

/** Quem escreve em projetos, etapas, riscos e parceiros do projeto. */
export const podeEditarProjetos = (r: Role) => !!r && ['gestor', 'projetos', 'engenharia', 'facilities'].includes(r)
/** Quem aprova etapas de projeto. */
export const podeAprovarEtapa = (r: Role) => !!r && ['gestor', 'projetos', 'engenharia'].includes(r)
/** Quem gera um projeto a partir de uma oportunidade ganha. */
export const podeGerarProjeto = (r: Role) => !!r && ['gestor', 'comercial', 'projetos', 'engenharia'].includes(r)
/** Quem edita o perfil de parceiros. */
export const podeEditarParceiros = (r: Role) => !!r && ['gestor', 'comercial', 'projetos', 'engenharia', 'facilities'].includes(r)

export const nomePessoa = (p: { nome: string | null; email?: string | null } | null | undefined) => p?.nome ?? p?.email ?? '—'
