import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** false enquanto o .env.local não estiver preenchido: o app mostra a tela de configuração. */
export const configured = Boolean(url && key && !url.includes('SEU-PROJETO'))

export const supabase = createClient(
  configured ? (url as string) : 'http://localhost:54321',
  configured ? (key as string) : 'sem-configuracao',
)

/** Lança o erro do Supabase (com mensagem legível) ou devolve os dados. */
export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

/**
 * Cliente separado, sem guardar sessão: serve para cadastrar um novo usuário
 * sem desconectar quem está logado (o gestor).
 */
export const supabaseCadastro = createClient(
  configured ? (url as string) : 'http://localhost:54321',
  configured ? (key as string) : 'sem-configuracao',
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'clip-cadastro-usuario' } },
)
