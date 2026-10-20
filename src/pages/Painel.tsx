import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, unwrap } from '../lib/supabase'
import { useAsync } from '../lib/hooks'
import { daysSince, fdate, isOverdue, money, todayISO } from '../lib/format'
import { motivoAtraso, projetoAtivo } from '../lib/projeto'
import type { Chamado, Etapa, Oportunidade, Projeto, ProjetoEtapa, ProjetoRegistro, Proposta } from '../lib/types'
import { alertaVencimento } from '../lib/contrato'
import { useAuth } from '../lib/auth'
import { custoPrevisto, custoSemContrato, margem, mesAtual, pct, totais, type OperacaoFin, type ServicoFin } from '../lib/financeiro'
import type { Lancamento } from '../lib/types'
import { ABERTOS, alertaPlano, slaChamado } from '../lib/facilities'
import { Empty, Loading, PageHead } from '../components/ui'

type Item = { id: string; to: string; titulo: string; detalhe?: string; alerta?: boolean }
type Kpi = { k: string; rotulo: string; valor: string; itens: Item[]; tom?: 'bad' | 'warn'; dinheiro?: boolean; nota?: string; indisponivel?: boolean }
type Secao = { titulo: string; sub: string; kpis: Kpi[] }

type PropostaOpp = Proposta & { oportunidade: { id: string; titulo: string; status: string } | null }
type RegistroProj = ProjetoRegistro & { projeto: { id: string; nome: string } | null }

type ItemCotLite = { id: string; operacao_id: string; nome: string; dispensado: boolean }
type PropCotLite = { id: string; item_id: string; status: string; valor_mensal: number | null; fornecedor: { nome: string } | null }

const ABERTA_PROP = ['enviada', 'em validação', 'revisão']

export default function Painel() {
  const { podeFinanceiro } = useAuth()
  const [sel, setSel] = useState<string | null>(null)
  const { data, loading, error } = useAsync(async () => {
    const [e, o, pr, pj, pe, rg, ci, cp, cl, un, ct, ch, pm, sv, op, lc] = await Promise.all([
      supabase.from('etapas').select('*').order('id'),
      supabase.from('oportunidades').select('*, cliente:organizacoes!cliente_final_id(id,nome,atendida_woba)'),
      supabase.from('propostas').select('*, oportunidade:oportunidades(id,titulo,status)').in('status', ABERTA_PROP),
      supabase.from('projetos').select('*, cliente:organizacoes!cliente_id(id,nome)'),
      supabase.from('projeto_etapas').select('*'),
      supabase.from('projeto_registros').select('*, projeto:projetos(id,nome)').eq('status', 'aberto').in('tipo', ['risco', 'pendencia']),
      supabase.from('cotacao_itens').select('id,operacao_id,nome,dispensado'),
      supabase.from('cotacao_propostas').select('id,item_id,status,valor_mensal,fornecedor:organizacoes!fornecedor_id(nome)'),
      supabase.from('organizacoes').select('id,nome').contains('papeis', ['cliente']).eq('status_relacionamento', 'Ativo'),
      supabase.from('unidades').select('id,nome,situacao,cliente:organizacoes!cliente_id(nome)').eq('situacao', 'Ativo'),
      supabase.from('contratos').select('id,titulo,status,valor_mensal,data_fim,aviso_dias,cliente_id,cliente:organizacoes!cliente_id(nome),cobertura:contrato_unidades(unidade_id)').eq('status', 'Vigente'),
      supabase.from('chamados').select('*, unidade:unidades!unidade_id(id,nome), servico:servicos_unidade!servico_id(id,nome,clip_garante_sla,controle,sla_resposta_horas,sla_solucao_horas,horario_atendimento)').in('status', [...ABERTOS]),
      supabase.from('planos_manutencao').select('id,titulo,tipo,proxima_data,ativo,unidade:unidades!unidade_id(nome)').eq('ativo', true).eq('tipo', 'Manutenção preventiva'),
      supabase.from('servicos_unidade').select('id,nome,unidade_id,contrato_id,custo_mensal,status,unidade:unidades!unidade_id(nome)'),
      supabase.from('operacoes').select('id,nome,contrato_id,itens:cotacao_itens(id,dispensado,propostas:cotacao_propostas(status,valor_mensal))').not('contrato_id', 'is', null),
      supabase.from('lancamentos_financeiros').select('tipo,pago,valor,competencia'),
    ])
    return {
      etapas: unwrap(e) as Etapa[],
      opps: unwrap(o) as Oportunidade[],
      propostas: unwrap(pr) as PropostaOpp[],
      projetos: unwrap(pj) as Projeto[],
      pEtapas: unwrap(pe) as ProjetoEtapa[],
      registros: unwrap(rg) as RegistroProj[],
      itensCot: unwrap(ci) as ItemCotLite[],
      propsCot: unwrap(cp) as unknown as PropCotLite[],
      chamadosAbertos: unwrap(ch) as unknown as Chamado[],
      planosPrev: unwrap(pm) as unknown as { id: string; titulo: string; tipo: string; proxima_data: string; ativo: boolean; unidade: { nome: string } | null }[],
      servicosFin: unwrap(sv) as unknown as ServicoFin[],
      operacoesFin: unwrap(op) as unknown as OperacaoFin[],
      lancs: unwrap(lc) as unknown as Pick<Lancamento, 'tipo' | 'pago' | 'valor' | 'competencia'>[],
      clientesAtivos: unwrap(cl) as { id: string; nome: string }[],
      unidadesAtivas: unwrap(un) as unknown as { id: string; nome: string; cliente: { nome: string } | null }[],
      vigentes: unwrap(ct) as unknown as { id: string; titulo: string; status: string; valor_mensal: number | null; data_fim: string | null; aviso_dias: number; cliente_id: string; cliente: { nome: string } | null; cobertura: { unidade_id: string }[] | null }[],
    }
  })

  if (loading && !data) return <Loading error={error} />
  if (!data) return <Loading error={error} />
  const { etapas, opps, propostas, projetos, pEtapas, registros, itensCot, propsCot, clientesAtivos, unidadesAtivas, vigentes, chamadosAbertos, planosPrev, servicosFin, operacoesFin, lancs } = data
  const venc = vigentes
    .map((c) => ({ c, a: alertaVencimento({ status: 'Vigente', data_fim: c.data_fim, aviso_dias: c.aviso_dias }) }))
    .filter((x): x is { c: (typeof vigentes)[number]; a: NonNullable<ReturnType<typeof alertaVencimento>> } => x.a != null)
  const chamadosSla = chamadosAbertos.filter((c) => slaChamado(c)?.estourado)
  const prevPend = planosPrev.map((p) => ({ p, a: alertaPlano(p) })).filter((x): x is { p: (typeof planosPrev)[number]; a: NonNullable<ReturnType<typeof alertaPlano>> } => x.a != null)
  const prevAtrasadas = prevPend.filter((x) => x.a.tom === 'bad').length
  const contratosFin = vigentes.map((c) => ({ ...c, status: 'Vigente', cobertura: c.cobertura ?? [] }))
  const custos = contratosFin.map((c) => ({ c, cp: custoPrevisto(c, servicosFin, operacoesFin, contratosFin) }))
  const custoPrevTotal = custos.reduce((t, x) => t + x.cp.total, 0)
  const naoAtribuidos = custoSemContrato(servicosFin, contratosFin)
  const margens = custos.map((x) => ({ ...x, m: margem(x.c.valor_mensal, x.cp.total) })).filter((x) => x.m)
  const margemMedia = margens.length ? margens.reduce((t, x) => t + (x.m?.pct ?? 0), 0) / margens.length : null
  const tot = totais(lancs)
  const mes = mesAtual()
  const realizadoMes = lancs.filter((l) => l.tipo === 'Custo' && l.pago && l.competencia.slice(0, 7) === mes.slice(0, 7)).reduce((t, l) => t + Number(l.valor), 0)
  const restrito = 'Restrito ao gestor e ao financeiro.'
  const receitaContratada = vigentes.reduce((t, c) => t + Number(c.valor_mensal ?? 0), 0)
  const semValor = vigentes.filter((c) => c.valor_mensal == null).length

  /* ---------- comercial ---------- */
  const abertas = opps.filter((o) => o.status === 'aberta')
  const etapa = (id: number) => etapas.find((e) => e.id === id)
  const prob = (o: Oportunidade) => o.probabilidade ?? etapa(o.etapa_id)?.probabilidade_padrao ?? 0
  const comValor = abertas.filter((o) => o.valor_estimado != null)
  const pipeline = comValor.reduce((s, o) => s + Number(o.valor_estimado), 0)
  const oppItem = (o: Oportunidade, detalhe?: string): Item => ({ id: o.id, to: `/oportunidades/${o.id}`, titulo: o.titulo, detalhe: detalhe ?? `${o.cliente?.nome ?? '—'} · ${etapa(o.etapa_id)?.nome ?? ''}` })
  const prazoRetorno = etapa(5)?.prazo_alvo_dias ?? 7
  const semRetorno = propostas.filter((p) => p.oportunidade?.status === 'aberta' && p.status === 'enviada' && daysSince(p.data_emissao) > prazoRetorno)
  const propItem = (p: PropostaOpp, alerta = false): Item => ({
    id: p.id, to: p.oportunidade ? `/oportunidades/${p.oportunidade.id}` : '/funil', titulo: p.oportunidade?.titulo ?? 'Proposta',
    detalhe: `v${p.versao} · ${money(p.mensalidade)} · enviada há ${daysSince(p.data_emissao)} dia(s)`, alerta,
  })

  /* ---------- projetos ---------- */
  const ativos = projetos.filter(projetoAtivo)
  const etapasDe = (id: string) => pEtapas.filter((e) => e.projeto_id === id)
  const projItem = (p: Projeto, detalhe?: string): Item => ({ id: p.id, to: `/projetos/${p.id}`, titulo: p.nome, detalhe: detalhe ?? [p.cliente?.nome, p.cidade].filter(Boolean).join(' · ') })
  const atrasados = projetos.map((p) => ({ p, m: motivoAtraso(p, etapasDe(p.id)) })).filter((x) => x.m)

  /* ---------- operação e contratos ---------- */
  const itensAtivos = itensCot.filter((i) => !i.dispensado)
  const escolhidas = propsCot.filter((p) => p.status === 'escolhido' && itensAtivos.some((i) => i.id === p.item_id))
  const custoMensal = escolhidas.reduce((s, p) => s + Number(p.valor_mensal ?? 0), 0)

  const secoes: Secao[] = [
    {
      titulo: 'Comercial', sub: 'Quais oportunidades podemos fechar?',
      kpis: [
        { k: 'abertas', rotulo: 'oportunidades abertas', valor: String(abertas.length), itens: abertas.map((o) => oppItem(o)) },
        { k: 'propostas', rotulo: 'propostas em andamento', valor: String(propostas.filter((p) => p.oportunidade?.status === 'aberta').length), itens: propostas.filter((p) => p.oportunidade?.status === 'aberta').map((p) => propItem(p)) },
        { k: 'pipeline', rotulo: 'pipeline (valor estimado)', valor: money(pipeline), dinheiro: true, nota: `${abertas.length - comValor.length} oportunidade(s) sem valor estimado não entram na soma.`, itens: comValor.map((o) => oppItem(o, `${money(o.valor_estimado)} · ${prob(o)}%`)) },
        { k: 'semretorno', rotulo: `propostas sem retorno (> ${prazoRetorno} dias)`, valor: String(semRetorno.length), tom: semRetorno.length ? 'warn' : undefined, itens: semRetorno.map((p) => propItem(p, true)) },
      ],
    },
    {
      titulo: 'Implantação e projetos', sub: 'Quais projetos precisam de atenção?',
      kpis: [
        { k: 'ativos', rotulo: 'projetos ativos', valor: String(ativos.length), itens: ativos.map((p) => projItem(p)) },
        { k: 'atrasados', rotulo: 'projetos atrasados', valor: String(atrasados.length), tom: atrasados.length ? 'bad' : undefined, itens: atrasados.map(({ p, m }) => projItem(p, m ?? '')).map((i) => ({ ...i, alerta: true })) },
        { k: 'riscos', rotulo: 'riscos e pendências abertos', valor: String(registros.length), tom: registros.length ? 'warn' : undefined, itens: registros.map((r) => ({ id: r.id, to: `/projetos/${r.projeto_id}`, titulo: r.descricao, detalhe: `${r.projeto?.nome ?? ''} · ${r.tipo === 'risco' ? 'risco' : 'pendência'}${r.prazo ? ` · prazo ${fdate(r.prazo)}` : ''}`, alerta: isOverdue(r.prazo) })) },
      ],
    },
    {
      titulo: 'Operação e contratos', sub: 'Carteira em operação e custo dos fornecedores.',
      kpis: [
        { k: 'unidades', rotulo: 'clientes e unidades ativas', valor: `${clientesAtivos.length} · ${unidadesAtivas.length}`, nota: 'Clientes com status de relacionamento “Ativo” · unidades com situação “Ativo”.', itens: [...clientesAtivos.map((c) => ({ id: `c${c.id}`, to: `/clientes?id=${c.id}`, titulo: c.nome, detalhe: 'cliente ativo' })), ...unidadesAtivas.map((u) => ({ id: `u${u.id}`, to: `/unidades?id=${u.id}`, titulo: u.nome, detalhe: `unidade · ${u.cliente?.nome ?? ''}` }))] },
        { k: 'vencimento', rotulo: 'contratos próximos do vencimento ou renovação', valor: String(venc.length), tom: venc.length ? 'warn' : undefined, nota: 'Contratos vigentes com data de fim dentro da antecedência de aviso do contrato (padrão 90 dias) ou já vencidos.', itens: venc.map(({ c, a }) => ({ id: c.id, to: `/contratos?id=${c.id}`, titulo: c.titulo, detalhe: `${c.cliente?.nome ?? ''} · ${a.texto} · fim ${fdate(c.data_fim)}`, alerta: a.tom === 'bad' })) },
        { k: 'chamados', rotulo: 'chamados em aberto', valor: String(chamadosAbertos.length), tom: chamadosSla.length ? 'bad' : undefined, nota: `Chamados abertos, em atendimento ou aguardando terceiro. ${chamadosSla.length} com SLA vencido (só conta quando a Clip garante o SLA; chamados aguardando terceiro ficam com o prazo suspenso).`, itens: chamadosAbertos.map((c) => { const sl = slaChamado(c); return { id: c.id, to: `/chamados?id=${c.id}`, titulo: `#${c.numero} ${c.titulo}`, detalhe: `${c.unidade?.nome ?? ''} · ${c.criticidade} · ${c.status}${sl ? ` · ${sl.texto}` : ''}`, alerta: !!sl?.estourado } }) },
        { k: 'preventivas', rotulo: 'manutenções preventivas pendentes', valor: String(prevPend.length), tom: prevAtrasadas ? 'bad' : prevPend.length ? 'warn' : undefined, nota: `Planos preventivos ativos com a próxima data vencida, hoje ou nos próximos 7 dias (${prevAtrasadas} atrasados).`, itens: prevPend.map(({ p, a }) => ({ id: p.id, to: '/manutencao', titulo: p.titulo, detalhe: `${p.unidade?.nome ?? ''} · ${fdate(p.proxima_data)} · ${a.texto}`, alerta: a.tom === 'bad' })) },
        { k: 'custo', rotulo: 'custo mensal dos fornecedores', valor: money(custoMensal), dinheiro: true, nota: 'Soma do valor mensal das propostas marcadas como escolhidas nas cotações, nos itens não dispensados.', itens: escolhidas.map((p) => ({ id: p.id, to: `/operacoes/${itensAtivos.find((i) => i.id === p.item_id)?.operacao_id ?? ''}`, titulo: itensAtivos.find((i) => i.id === p.item_id)?.nome ?? 'Item', detalhe: `${p.fornecedor?.nome ?? ''} · ${money(p.valor_mensal)}` })) },
      ],
    },
    {
      titulo: 'Financeiro', sub: 'Receita contratada, faturada e recebida nunca são somadas: cada uma tem o seu número.',
      kpis: [
        { k: 'rcontratada', rotulo: 'receita mensal contratada', valor: money(receitaContratada), dinheiro: true, nota: `Soma do valor mensal dos contratos vigentes${semValor ? ` (${semValor} sem valor mensal informado)` : ''}. É o valor previsto em contrato: não inclui o que foi faturado nem o que foi recebido.`, itens: vigentes.map((c) => ({ id: c.id, to: `/contratos?id=${c.id}`, titulo: c.titulo, detalhe: `${c.cliente?.nome ?? ''} · ${c.valor_mensal != null ? money(c.valor_mensal) : 'sem valor mensal'}` })) },
        { k: 'cprevisto', rotulo: 'custos mensais previstos', valor: money(custoPrevTotal), dinheiro: true, nota: `Soma, nos contratos vigentes, do custo mensal dos serviços ativos ligados a cada contrato e dos fornecedores escolhidos nas cotações ligadas ao contrato.${naoAtribuidos.length ? ` ${naoAtribuidos.length} serviço(s) com custo não entram porque não estão ligados a um contrato.` : ''}`, itens: custos.filter((x) => x.cp.total > 0).map((x) => ({ id: x.c.id, to: '/financeiro', titulo: x.c.titulo, detalhe: `${x.c.cliente?.nome ?? ''} · ${money(x.cp.total)}/mês` })) },
        podeFinanceiro
          ? { k: 'crealizado', rotulo: 'custos mensais realizados', valor: money(realizadoMes), dinheiro: true, nota: 'Custos efetivamente pagos com competência no mês atual, lançados no Financeiro. Fica separado do previsto e não inclui custos a pagar.', itens: [{ id: 'fin', to: '/financeiro/lancamentos', titulo: 'Ver lançamentos', detalhe: 'Financeiro por contrato' }] }
          : { k: 'crealizado', rotulo: 'custos mensais realizados', valor: '—', indisponivel: true, nota: restrito, itens: [] },
        { k: 'margem', rotulo: 'média da margem estimada por contrato', valor: margemMedia != null ? pct(margemMedia) : '—', indisponivel: margemMedia == null, nota: `Margem estimada = (receita mensal contratada − custo mensal previsto) ÷ receita. Média dos contratos vigentes que têm custo previsto${custos.length - margens.length ? ` (${custos.length - margens.length} contrato(s) sem custo previsto ficam de fora)` : ''}.`, itens: margens.map((x) => ({ id: x.c.id, to: '/financeiro', titulo: x.c.titulo, detalhe: `${x.c.cliente?.nome ?? ''} · ${pct(x.m?.pct ?? 0)} · ${money(x.m?.rs ?? 0)}/mês` })) },
        podeFinanceiro
          ? { k: 'caixa', rotulo: 'contas a receber · desembolsos futuros', valor: `${money(tot.aReceber)} · ${money(tot.aPagar)}`, dinheiro: true, nota: 'Contas a receber = faturado − recebido. Desembolsos futuros = custos e investimentos lançados como “a pagar”. Os dois números ficam separados, sem compensar um com o outro.', itens: [{ id: 'fin', to: '/financeiro', titulo: 'Ver por contrato', detalhe: 'Financeiro por contrato' }] }
          : { k: 'caixa', rotulo: 'contas a receber · desembolsos futuros', valor: '—', indisponivel: true, nota: restrito, itens: [] },
      ],
    },
  ]

  const selecionado = secoes.flatMap((s) => s.kpis).find((k) => k.k === sel)
  const hoje = todayISO()

  return (
    <>
      <PageHead title="Dashboard Executivo" sub={`O que está acontecendo e onde precisamos agir · ${fdate(hoje)}. Clique em um indicador para ver os registros que o compõem.`} />

      {secoes.map((s) => (
        <section key={s.titulo}>
          <div className="dash-h"><h2>{s.titulo}</h2><span className="muted">{s.sub}</span></div>
          <div className="kpis" style={{ marginBottom: 12 }}>
            {s.kpis.map((k) => (
              <button key={k.k} style={k.indisponivel ? { opacity: 0.6 } : undefined} className={`kpi clickable ${sel === k.k ? 'sel' : ''} ${k.tom ? `kpi-${k.tom}` : ''} ${k.dinheiro ? 'kpi-money' : ''}`} onClick={() => setSel(sel === k.k ? null : k.k)} aria-pressed={sel === k.k}>
                <b>{k.valor}</b><span>{k.rotulo}</span>
              </button>
            ))}
          </div>
          {selecionado && s.kpis.some((k) => k.k === sel) && (
            <div className="card drill">
              <h3 style={{ marginTop: 0 }}>{selecionado.rotulo}</h3>
              {selecionado.nota && <p className="muted">{selecionado.nota}</p>}
              {selecionado.indisponivel ? null : selecionado.itens.length === 0 ? <Empty>Nenhum registro.</Empty> : (
                <ul className="plain">
                  {selecionado.itens.slice(0, 50).map((i) => (
                    <li key={i.id}>
                      <Link to={i.to}>{i.titulo}</Link> {i.detalhe && <span className={i.alerta ? 'overdue' : 'muted'}>· {i.detalhe}</span>}
                    </li>
                  ))}
                  {selecionado.itens.length > 50 && <li className="muted">+ {selecionado.itens.length - 50} não exibidos</li>}
                </ul>
              )}
            </div>
          )}
        </section>
      ))}
    </>
  )
}
