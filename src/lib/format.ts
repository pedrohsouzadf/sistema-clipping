const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export const money = (v: number | null | undefined) => (v == null ? '—' : brl.format(Number(v)))

/** Datas "YYYY-MM-DD" (campos date) sem deslocamento de fuso. */
export function fdate(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${day}/${m}/${y}`
}

export function fdatetime(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export const todayISO = () => {
  const n = new Date()
  const m = String(n.getMonth() + 1).padStart(2, '0')
  const d = String(n.getDate()).padStart(2, '0')
  return `${n.getFullYear()}-${m}-${d}`
}

/** Dias entre uma data ISO (date ou timestamp) e hoje. Positivo = no passado. */
export function daysSince(d: string | null | undefined): number {
  if (!d) return 0
  const t = new Date(d.length === 10 ? `${d}T00:00:00` : d).getTime()
  return Math.floor((Date.now() - t) / 86_400_000)
}

export const isOverdue = (d: string | null | undefined) => !!d && d.slice(0, 10) < todayISO()

export const nullIfEmpty = (v: string | null | undefined) => (v == null || v.trim() === '' ? null : v.trim())

/** Dias entre hoje e uma data futura. Positivo = ainda falta; negativo = já passou. */
export const daysUntil = (d: string | null | undefined): number => (d ? -daysSince(d) : 0)

export const ativa = (status: string) => status !== 'concluida'

/** Média das notas informadas (ignora vazias); null se não houver nenhuma. */
export function media(notas: (number | null | undefined)[]): number | null {
  const v = notas.filter((n): n is number => typeof n === 'number')
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}
