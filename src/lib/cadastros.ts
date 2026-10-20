import { supabase, unwrap } from './supabase'
import { useAsync } from './hooks'
import { nomePessoa } from './papeis'
import type { Organizacao, Profile } from './types'

export type UnidadeOpt = { id: string; nome: string; cliente_id: string; cliente?: { nome: string } | null }
export type ServicoOpt = { id: string; nome: string; unidade_id: string }

/** Listas para os seletores da área de operação. */
export function useCadastros() {
  const { data } = useAsync(async () => {
    const [u, s, p, o] = await Promise.all([
      supabase.from('unidades').select('id,nome,cliente_id,cliente:organizacoes!cliente_id(nome)').neq('situacao', 'Encerrado').order('nome'),
      supabase.from('servicos_unidade').select('id,nome,unidade_id').neq('status', 'Encerrado').order('nome'),
      supabase.from('profiles').select('id,nome,email,role').order('nome'),
      supabase.from('organizacoes').select('id,nome,papeis').order('nome'),
    ])
    const orgs = unwrap(o) as Pick<Organizacao, 'id' | 'nome' | 'papeis'>[]
    return {
      unidades: unwrap(u) as unknown as UnidadeOpt[],
      servicos: unwrap(s) as ServicoOpt[],
      pessoas: (unwrap(p) as Profile[]).map((x) => ({ v: x.id, l: nomePessoa(x) })),
      fornecedores: orgs.filter((x) => x.papeis.includes('fornecedor')).map((x) => ({ v: x.id, l: x.nome })),
      terceiros: orgs.map((x) => ({ v: x.id, l: x.nome })),
    }
  })
  const unidades = (data?.unidades ?? []).map((u) => ({ v: u.id, l: `${u.nome}${u.cliente?.nome ? ` · ${u.cliente.nome}` : ''}` }))
  return { unidades, unidadesRaw: data?.unidades ?? [], servicos: data?.servicos ?? [], pessoas: data?.pessoas ?? [], fornecedores: data?.fornecedores ?? [], terceiros: data?.terceiros ?? [] }
}
