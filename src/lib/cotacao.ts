import type { CotacaoItem } from './types'

type Tone = 'neutral' | 'bronze' | 'ok' | 'warn' | 'bad' | 'info'
type ItemLike = { dispensado: boolean; propostas: { status: string; valor_mensal: number | null }[] }

/** O status do item é calculado a partir das propostas (não é preenchido à mão). */
export function statusItem(i: ItemLike): { label: string; tone: Tone } {
  if (i.dispensado) return { label: 'Dispensado', tone: 'neutral' }
  if (i.propostas.some((p) => p.status === 'escolhido')) return { label: 'Fornecedor escolhido', tone: 'ok' }
  if (i.propostas.some((p) => p.status === 'recebido')) return { label: 'Proposta recebida', tone: 'info' }
  return { label: 'Em cotação', tone: 'warn' }
}

export const recebidas = (i: ItemLike) => i.propostas.filter((p) => p.status === 'recebido' || p.status === 'escolhido')

/** Valor do fornecedor escolhido, se houver. */
export function valorEscolhido(i: ItemLike): number | null {
  const e = i.propostas.find((p) => p.status === 'escolhido')
  return e?.valor_mensal != null ? Number(e.valor_mensal) : null
}

/** Menor valor entre as propostas recebidas (referência; as propostas podem não ser comparáveis). */
export function menorProposta(i: ItemLike): number | null {
  const v = recebidas(i).map((p) => p.valor_mensal).filter((x): x is number => x != null).map(Number)
  return v.length ? Math.min(...v) : null
}

export function resumo(itens: ItemLike[]) {
  const ativos = itens.filter((i) => !i.dispensado)
  const fechado = ativos.reduce((s, i) => s + (valorEscolhido(i) ?? 0), 0)
  const referencia = ativos.reduce((s, i) => s + (valorEscolhido(i) ?? menorProposta(i) ?? 0), 0)
  return {
    total: ativos.length,
    emCotacao: ativos.filter((i) => statusItem(i).label === 'Em cotação').length,
    comProposta: ativos.filter((i) => statusItem(i).label === 'Proposta recebida').length,
    escolhidos: ativos.filter((i) => statusItem(i).label === 'Fornecedor escolhido').length,
    fechado,
    referencia,
  }
}

const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`

/** CSV (separador ;, com BOM) para abrir direto no Excel/Sheets em português. */
export function csvCotacao(itens: CotacaoItem[]): string {
  const head = ['Nº', 'Item', 'Responsável', 'Status do item', 'Fornecedor', 'O que a proposta oferece', 'Status da proposta', 'Valor mensal (R$)']
  const rows: string[] = [head.map(esc).join(';')]
  itens.forEach((i, idx) => {
    const base = [idx + 1, i.nome, i.responsavel ?? '', statusItem(i).label]
    if (i.propostas.length === 0) rows.push([...base, '', '', '', ''].map(esc).join(';'))
    for (const p of i.propostas)
      rows.push([...base, p.fornecedor?.nome ?? '', p.escopo ?? '', p.status, p.valor_mensal != null ? String(p.valor_mensal).replace('.', ',') : ''].map(esc).join(';'))
  })
  return '﻿' + rows.join('\r\n')
}

export function baixar(nome: string, conteudo: string, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  URL.revokeObjectURL(url)
}
