import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const db = new PGlite()
const mig = fs.readFileSync(here('../migrations/0001_init.sql'), 'utf8')
const seed = fs.readFileSync(here('../seed.sql'), 'utf8')

// stubs do ambiente Supabase
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role authenticated nologin;
  grant usage on schema public, auth to authenticated;
`)
await db.exec(mig)
await db.exec(fs.readFileSync(here('../migrations/0002_comercial_exclui_oportunidades.sql'), 'utf8'))
await db.exec(fs.readFileSync(here('../migrations/0003_tipo_simplificado.sql'), 'utf8'))
await db.exec(fs.readFileSync(here('../migrations/0004_remove_categoria.sql'), 'utf8'))
await db.exec(fs.readFileSync(here('../migrations/0005_operacoes_cotacoes.sql'), 'utf8'))
await db.exec(fs.readFileSync(here('../migrations/0006_modelo_fase1.sql'), 'utf8'))
await db.exec(fs.readFileSync(here('../migrations/0007_clientes_unidades_contratos.sql'), 'utf8'))
await db.exec(fs.readFileSync(here('../migrations/0008_operacao_facilities.sql'), 'utf8'))
await db.exec(fs.readFileSync(here('../migrations/0009_financeiro_contratos.sql'), 'utf8'))
await db.exec(`grant all on all tables in schema public to authenticated; grant execute on all functions in schema public to authenticated;`)
await db.exec(seed)

let pass = 0, fail = 0
const ok = (n, c, extra='') => { if (c) { pass++; console.log('  ✔', n) } else { fail++; console.log('  ✘', n, extra) } }
const asUser = async (id) => { await db.exec(`reset role; select set_config('request.jwt.claim.sub','${id}',false); set role authenticated;`) }
const raw = async () => db.exec(`reset role`)
const throws = async (sql, params=[]) => { try { await db.query(sql, params); return null } catch (e) { return e.message } }

// ---- usuários / perfis
const u1 = (await db.query(`insert into auth.users (email) values ('rafael@clip.com') returning id`)).rows[0].id
const u2 = (await db.query(`insert into auth.users (email) values ('comercial@clip.com') returning id`)).rows[0].id
const roles = (await db.query(`select email, role from public.profiles order by created_at, email`)).rows
console.log('Perfis'); ok('primeiro usuário vira gestor', roles.find(r=>r.email==='rafael@clip.com').role==='gestor')
ok('segundo usuário vira comercial', roles.find(r=>r.email==='comercial@clip.com').role==='comercial')

const org = async (nome) => (await db.query(`select id from public.organizacoes where nome=$1`, [nome])).rows[0]?.id
const woba = await org('Woba'), ey = await org('EY'), ml = await org('Mercado Livre')
console.log('\nSeed'); ok('Woba, EY, XP e Mercado Livre cadastradas', woba && ey && ml && await org('XP Investimentos'))

// empresa nova, ainda não classificada ('Validar') e outra confirmada 'Não'
const nova = (await db.query(`insert into public.organizacoes (nome) values ('Empresa Nova') returning id`)).rows[0].id
const livre = (await db.query(`insert into public.organizacoes (nome, atendida_woba) values ('Empresa Livre','Não') returning id`)).rows[0].id

console.log('\nTrava da Woba')
let e = await throws(`insert into public.oportunidades (titulo, cliente_final_id, origem) values ('EY direto',$1,'Prospecção direta')`, [ey])
ok('bloqueia venda direta (operador) para cliente atendido pela Woba', e && e.includes('atendido pela Woba'), e)
e = await throws(`insert into public.oportunidades (titulo, cliente_final_id, origem, modelo_atuacao) values ('EY outros',$1,'Indicação','outros')`, [ey])
ok('modelo "outros" não sofre a trava (alcance a confirmar com Rafael)', e === null, e)
e = await throws(`insert into public.oportunidades (titulo, cliente_final_id, origem, etapa_id) values ('Nova etapa 3',$1,'Prospecção direta',3)`, [nova])
ok('empresa com "Validar" não passa da etapa 1', e && e.includes('Confirme com a Woba'), e)
e = await throws(`insert into public.oportunidades (titulo, cliente_final_id, origem) values ('Nova etapa 1',$1,'Prospecção direta')`, [nova])
ok('empresa com "Validar" pode ser criada na etapa 1', e === null, e)

console.log('\nDemanda via Woba')
const via = (await db.query(`insert into public.oportunidades (titulo, cliente_final_id, origem, etapa_id) values ('EY via Woba',$1,'Woba',1) returning *`, [ey])).rows[0]
ok('entra na etapa 3 mesmo se informada etapa 1', via.etapa_id === 3, via.etapa_id)
ok('canal preenchido automaticamente com a Woba', via.canal_id === woba)
ok('contratante = canal (Woba contrata a Clip)', via.contratante_id === woba)
ok('comissão herdada = 16', Number(via.comissao_canal_pct) === 16, via.comissao_canal_pct)
e = await throws(`update public.oportunidades set etapa_id=2 where id=$1`, [via.id])
ok('demanda da Woba não volta para etapas 1-2', e && e.includes('etapa 3'), e)
e = await throws(`update public.oportunidades set proximo_passo='Ligar', proximo_passo_data=current_date where id=$1`, [via.id])
ok('editar próximo passo funciona', e === null, e)

console.log('\nPrioridade calculada')
const pr = async (p, ev) => (await db.query(`insert into public.oportunidades (titulo, cliente_final_id, origem, potencial, evidencia) values ('p',$1,'Prospecção direta',$2,$3) returning prioridade`, [livre, p, ev])).rows[0].prioridade
ok('Alto + Forte = 1 - Alta', await pr('Alto','Forte') === '1 - Alta')
ok('Alto + Média = 2 - Média', await pr('Alto','Média') === '2 - Média')
ok('Médio + Forte = 2 - Média', await pr('Médio','Forte') === '2 - Média')
ok('Baixo + Fraca = 3 - Baixa', await pr('Baixo','Fraca') === '3 - Baixa')
ok('sem potencial/evidência = nulo', (await pr(null,null)) === null)

console.log('\nFechamento')
e = await throws(`update public.oportunidades set status='perdida' where id=$1`, [via.id])
ok('perdida exige motivo', e && e.includes('motivo'), e)
e = await throws(`update public.oportunidades set etapa_id=7 where id=$1`, [via.id])
ok('etapa 7 sem resultado é recusada', e && e.includes('etapa 7'), e)
await db.query(`update public.oportunidades set status='ganha' where id=$1`, [via.id])
let r = (await db.query(`select etapa_id, status, fechada_em from public.oportunidades where id=$1`, [via.id])).rows[0]
ok('ganha move para a etapa 7 e registra fechada_em', r.etapa_id === 7 && r.status === 'ganha' && r.fechada_em)
await db.query(`update public.oportunidades set status='aberta', etapa_id=6 where id=$1`, [via.id])
r = (await db.query(`select etapa_id, status, fechada_em from public.oportunidades where id=$1`, [via.id])).rows[0]
ok('reabrir limpa fechada_em', r.etapa_id === 6 && r.status === 'aberta' && r.fechada_em === null)

console.log('\nPropostas')
await db.query(`insert into public.propostas (oportunidade_id, mensalidade) values ($1, 100000)`, [via.id])
await db.query(`insert into public.propostas (oportunidade_id, mensalidade) values ($1, 110000)`, [via.id])
const ps = (await db.query(`select versao, comissao_pct, valor_liquido from public.propostas where oportunidade_id=$1 order by versao`, [via.id])).rows
ok('versões 1 e 2 automáticas', ps.length === 2 && ps[0].versao === 1 && ps[1].versao === 2)
ok('comissão da proposta herdada da oportunidade (16)', Number(ps[0].comissao_pct) === 16)
ok('valor líquido = 84% da mensalidade (84.000 e 92.400)', Number(ps[0].valor_liquido) === 84000 && Number(ps[1].valor_liquido) === 92400, JSON.stringify(ps))

console.log('\nInterações')
const ct = (await db.query(`insert into public.contatos (nome, organizacao_id) values ('Fulano',$1) returning id`, [ey])).rows[0].id
await db.query(`insert into public.interacoes (contato_id, resumo, tipo) values ($1,'Conversa no evento','evento')`, [ct])
ok('interação atualiza ultima_interacao do contato', (await db.query(`select ultima_interacao from public.contatos where id=$1`, [ct])).rows[0].ultima_interacao !== null)
e = await throws(`insert into public.interacoes (resumo) values ('sem vínculo')`)
ok('interação sem vínculo é recusada', e !== null)
ok('contato de empresa atendida pela Woba pode ser cadastrado (networking livre)', !!ct)

console.log('\nPermissões (RLS)')
await asUser(u2)
ok('comercial lê organizações', (await db.query(`select count(*)::int c from public.organizacoes`)).rows[0].c >= 4)
ok('comercial cria organização', (await throws(`insert into public.organizacoes (nome) values ('Criada pelo comercial')`)) === null)
e = await throws(`delete from public.organizacoes where nome='Criada pelo comercial'`)
const left = (await db.query(`select count(*)::int c from public.organizacoes where nome='Criada pelo comercial'`)).rows[0].c
ok('comercial NÃO exclui (0 linhas afetadas)', left === 1, left)
e = await throws(`update public.profiles set role='gestor' where id=$1`, [u2])
ok('comercial NÃO promove a si mesmo a gestor', e !== null, e)
await asUser(u1)
await db.query(`delete from public.organizacoes where nome='Criada pelo comercial'`)
{
  await raw()
  const oid = (await db.query(`insert into public.oportunidades (titulo, cliente_final_id, origem) select 'Excluir teste', id, 'Prospecção direta' from public.organizacoes where nome='Criada pelo comercial' or true limit 1 returning id`)).rows[0].id
  await asUser(u2)
  await db.query(`delete from public.oportunidades where id=$1`, [oid])
  await raw()
  ok('comercial exclui oportunidade', (await db.query(`select count(*)::int c from public.oportunidades where id=$1`, [oid])).rows[0].c === 0)
}
ok('gestor exclui', (await db.query(`select count(*)::int c from public.organizacoes where nome='Criada pelo comercial'`)).rows[0].c === 0)
await raw()


// ---- operações e cotações
console.log('Operações e cotações')
await raw()
const forn = (await db.query(`insert into public.organizacoes (nome, papeis) values ('Fornecedor Teste', '{fornecedor}') returning id`)).rows[0].id
const opId = (await db.query(`insert into public.operacoes (nome, cidade, pessoas) values ('Operação Teste', 'Brasília', 50) returning id`)).rows[0].id
const itA = (await db.query(`insert into public.cotacao_itens (operacao_id, ordem, nome, responsavel) values ($1, 1, 'Limpeza', 'Camila') returning id`, [opId])).rows[0].id
await db.query(`insert into public.cotacao_itens (operacao_id, ordem, nome) values ($1, 2, 'Outro item')`, [opId])
await db.query(`insert into public.cotacao_propostas (item_id, fornecedor_id, status, valor_mensal) values ($1, $2, 'recebido', 400), ($1, $2, 'recebido', 2800)`, [itA, forn])
const q1 = async (sql, params = []) => (await db.query(sql, params)).rows[0]
ok('operação nasce vazia e aceita itens e propostas', (await q1(`select count(*)::int c from public.cotacao_propostas`)).c === 2)
ok('nome de operação único', (await throws(`insert into public.operacoes (nome) values ('operação teste')`)) !== null)
ok('proposta não aceita valor negativo', (await throws(`insert into public.cotacao_propostas (item_id, fornecedor_id, valor_mensal) values ($1, $2, -1)`, [itA, forn])) !== null)
await db.query(`update public.cotacao_propostas set status='escolhido' where item_id=$1 and valor_mensal=400`, [itA])
ok('uma proposta escolhida por item', (await throws(`update public.cotacao_propostas set status='escolhido' where item_id=$1 and valor_mensal=2800`, [itA])) !== null)
ok('fornecedor com proposta não pode ser excluído', (await throws(`delete from public.organizacoes where id=$1`, [forn])) !== null)
await db.query(`delete from public.cotacao_itens where id=$1`, [itA])
ok('apagar item apaga propostas', (await q1(`select count(*)::int c from public.cotacao_propostas`)).c === 0)
await asUser(u2)
const antes = (await q1(`select count(*)::int c from public.cotacao_itens`)).c
await db.query(`delete from public.cotacao_itens where nome='Outro item'`)
ok('comercial exclui item', (await q1(`select count(*)::int c from public.cotacao_itens`)).c === antes - 1)
await db.query(`delete from public.operacoes`)
ok('comercial NÃO exclui operação', (await q1(`select count(*)::int c from public.operacoes`)).c === 1)
await raw()


// ---- Fase 1: funil de 7 etapas, projetos, tarefas, parceiros, documentos, histórico
console.log('\nFunil de 7 etapas e novas regras')
await raw()
const etapas = (await db.query(`select id from public.etapas order by id`)).rows.map(r => r.id)
ok('etapas 1 a 7 (sem a 8)', etapas.join() === '1,2,3,4,5,6,7', etapas.join())
const semPlaybook = (await db.query(`select e.id from public.etapas e where not exists (select 1 from public.playbook_itens p where p.etapa_id = e.id)`)).rows
ok('toda etapa tem itens de playbook', semPlaybook.length === 0, JSON.stringify(semPlaybook))
e = await throws(`insert into public.oportunidades (titulo, cliente_final_id, origem, aprovacao_abordagem, etapa_id) values ('Aguardando aprovação',$1,'Prospecção direta','Pendente',2)`, [livre])
ok('abordagem com aprovação pendente não avança da etapa 1', e && e.includes('aprovação'), e)
ok('abordagem pendente pode existir na etapa 1', (await throws(`insert into public.oportunidades (titulo, cliente_final_id, origem, aprovacao_abordagem) values ('Aguardando aprovação 1',$1,'Prospecção direta','Pendente')`, [livre])) === null)

console.log('\nPapéis')
const u3 = (await db.query(`insert into auth.users (email) values ('projetos@clip.com') returning id`)).rows[0].id
const u4 = (await db.query(`insert into auth.users (email) values ('financeiro@clip.com') returning id`)).rows[0].id
await asUser(u1)
await db.query(`update public.profiles set role='projetos' where id=$1`, [u3])
await db.query(`update public.profiles set role='financeiro' where id=$1`, [u4])
await raw()
ok('papéis projetos e financeiro são aceitos', (await db.query(`select count(*)::int c from public.profiles where role in ('projetos','financeiro')`)).rows[0].c === 2)
ok('papel inexistente é recusado', (await throws(`update public.profiles set role='diretor' where id=$1`, [u3])) !== null)

console.log('\nProjetos')
const ganha = (await db.query(`insert into public.oportunidades (titulo, cliente_final_id, origem, tipo_servico, cidade, area_m2, posicoes, padrao, responsavel_id) values ('Projeto base',$1,'Prospecção direta','BTS','Brasília',900,120,'Comfort',$2) returning id`, [livre, u2])).rows[0].id
e = await throws(`select public.criar_projeto_da_oportunidade($1)`, [ganha])
ok('oportunidade aberta não gera projeto', e && e.includes('ganhas'), e)
await db.query(`update public.oportunidades set status='ganha' where id=$1`, [ganha])
await asUser(u2)
const pj = (await db.query(`select public.criar_projeto_da_oportunidade($1) id`, [ganha])).rows[0].id
await raw()
const pr0 = (await db.query(`select * from public.projetos where id=$1`, [pj])).rows[0]
ok('projeto herda nome, tipo, cidade e responsável da oportunidade', pr0.nome === 'Projeto base' && pr0.tipo === 'BTS' && pr0.cidade === 'Brasília' && pr0.gerente_id === u2)
ok('premissas copiam o briefing', pr0.premissas.includes('900') && pr0.premissas.includes('Comfort'), pr0.premissas)
const ets = (await db.query(`select ordem, nome, criterio_entrada from public.projeto_etapas where projeto_id=$1 order by ordem`, [pj])).rows
ok('7 etapas padrão com critérios de entrada', ets.length === 7 && ets.every(x => x.criterio_entrada) && ets[4].nome === 'Execução', JSON.stringify(ets.map(x=>x.nome)))
e = await throws(`select public.criar_projeto_da_oportunidade($1)`, [ganha])
ok('a mesma oportunidade não gera dois projetos', e && e.includes('já gerou'), e)
await asUser(u2)
e = await throws(`insert into public.projetos (nome) values ('Direto pelo comercial')`)
ok('comercial não cria projeto direto (só gerando da oportunidade)', e !== null, e)
await asUser(u4)
e = await throws(`insert into public.projetos (nome) values ('Financeiro tenta')`)
ok('financeiro não escreve em projetos', e !== null, e)
await asUser(u3)
const p2 = (await db.query(`insert into public.projetos (nome, tipo) values ('Projeto manual','Fit-out') returning id`)).rows[0].id
ok('papel projetos cria projeto manual (já com 7 etapas)', (await db.query(`select count(*)::int c from public.projeto_etapas where projeto_id=$1`, [p2])).rows[0].c === 7)
const et1 = ets[0].ordem && (await db.query(`select id from public.projeto_etapas where projeto_id=$1 and ordem=1`, [pj])).rows[0].id
e = await throws(`update public.projeto_etapas set aprovada=true where id=$1`, [et1])
ok('etapa só é aprovada depois de concluída', e && e.includes('Conclua'), e)
await db.query(`update public.projeto_etapas set status='concluida' where id=$1`, [et1])
let et = (await db.query(`select aprovada, data_fim_real from public.projeto_etapas where id=$1`, [et1])).rows[0]
ok('concluir não aprova (concluída ≠ aprovada) e registra a data real', et.aprovada === false && et.data_fim_real !== null)
await db.query(`update public.projeto_etapas set aprovada=true where id=$1`, [et1])
et = (await db.query(`select aprovada, aprovada_em, aprovada_por from public.projeto_etapas where id=$1`, [et1])).rows[0]
ok('aprovação registra quem e quando', et.aprovada === true && et.aprovada_em && et.aprovada_por === u3)
e = await throws(`update public.projeto_etapas set status='em_andamento' where id=$1`, [et1])
ok('etapa aprovada não é reaberta sem remover a aprovação', e && e.includes('aprovada'), e)
await asUser(u2)
await db.query(`update public.projeto_etapas set aprovada=false where id=$1`, [et1])
ok('comercial não altera aprovação de etapa', (await db.query(`select aprovada from public.projeto_etapas where id=$1`, [et1])).rows[0].aprovada === true)
await asUser(u3)
await db.query(`delete from public.projetos where id=$1`, [p2])
ok('só o gestor exclui projeto', (await db.query(`select count(*)::int c from public.projetos where id=$1`, [p2])).rows[0].c === 1)
await asUser(u1)
await db.query(`delete from public.projetos where id=$1`, [p2])
ok('gestor exclui projeto', (await db.query(`select count(*)::int c from public.projetos where id=$1`, [p2])).rows[0].c === 0)
await db.query(`insert into public.projeto_registros (projeto_id, tipo, descricao, aprovado_por, motivo) values ($1,'decisao','Aprovado o orçamento da obra','Cliente','Dentro do teto combinado')`, [pj])
ok('decisões registram quem aprovou e o motivo', (await db.query(`select count(*)::int c from public.projeto_registros where aprovado_por='Cliente' and motivo is not null`)).rows[0].c === 1)
await raw()

console.log('\nTarefas')
const tOpp = (await db.query(`select id from public.oportunidades limit 1`)).rows[0].id
e = await throws(`insert into public.tarefas (titulo) values ('Sem vínculo')`)
ok('tarefa precisa estar ligada a um objeto de negócio', e !== null, e)
e = await throws(`insert into public.tarefas (titulo, oportunidade_id, status) values ('Sem dono',$1,'em_andamento')`, [tOpp])
ok('tarefa em andamento precisa de responsável', e !== null, e)
const tA = (await db.query(`insert into public.tarefas (titulo, projeto_id, responsavel_id) values ('Pedir orçamento',$1,$2) returning id`, [pj, u3])).rows[0].id
const tB = (await db.query(`insert into public.tarefas (titulo, projeto_id, responsavel_id, bloqueada_por, status) values ('Aprovar orçamento',$1,$2,$3,'bloqueada') returning id`, [pj, u3, tA])).rows[0].id
e = await throws(`update public.tarefas set status='em_andamento' where id=$1`, [tB])
ok('tarefa bloqueada não começa antes da tarefa de que depende', e && e.includes('depende'), e)
await db.query(`update public.tarefas set status='concluida' where id=$1`, [tA])
ok('concluir registra concluida_em automaticamente', (await db.query(`select concluida_em from public.tarefas where id=$1`, [tA])).rows[0].concluida_em !== null)
ok('depois de concluir a anterior, a bloqueada pode andar', (await throws(`update public.tarefas set status='em_andamento' where id=$1`, [tB])) === null)
const tC = (await db.query(`insert into public.tarefas (titulo, projeto_id, tipo) values ('Aprovar layout',$1,'aprovacao') returning id`, [pj])).rows[0].id
e = await throws(`update public.tarefas set status='concluida' where id=$1`, [tC])
ok('aprovação concluída exige responsável', e !== null, e)
await asUser(u2)
await db.query(`delete from public.tarefas where id=$1`, [tC])
ok('qualquer usuário exclui tarefa', (await db.query(`select count(*)::int c from public.tarefas where id=$1`, [tC])).rows[0].c === 0)
await raw()

console.log('\nEmpresas e parceiros')
const fp = (await db.query(`select id from public.parceiros where organizacao_id=$1`, [forn])).rows
ok('fornecedor cadastrado ganha perfil de parceiro automaticamente', fp.length === 1)
const nf = (await db.query(`insert into public.organizacoes (nome, papeis, cidade, categorias_servico) values ('Elétrica Brasília','{fornecedor}','Brasília','{elétrica}') returning id`)).rows[0].id
const pf = (await db.query(`select cidades, especialidades, homologacao, disponibilidade from public.parceiros where organizacao_id=$1`, [nf])).rows[0]
ok('perfil nasce em análise, com cidade e especialidade da empresa', pf.homologacao === 'Em análise' && pf.cidades[0] === 'Brasília' && pf.especialidades[0] === 'elétrica', JSON.stringify(pf))
await db.query(`insert into public.organizacoes (nome, cnpj) values ('Empresa com CNPJ','12.345.678/0001-90')`)
e = await throws(`insert into public.organizacoes (nome, cnpj) values ('Outra com o mesmo CNPJ','12345678000190')`)
ok('mesmo CNPJ (com ou sem pontuação) não duplica a empresa', e !== null, e)
const ppj = (await db.query(`insert into public.projeto_parceiros (projeto_id, parceiro_id, escopo, status, valor_cotado, valor_contratado, nota_qualidade, prazo_cumprido) select $1, id, 'Elétrica', 'contratado', 50000, 48000, 4, true from public.parceiros where organizacao_id=$2 returning id`, [pj, nf])).rows[0].id
ok('parceiro vinculado ao projeto guarda cotado, contratado e avaliação', !!ppj)
ok('nota fora de 1–5 é recusada', (await throws(`update public.projeto_parceiros set nota_qualidade=6 where id=$1`, [ppj])) !== null)
await db.query(`update public.organizacoes set nome=nome where id=$1`, [nf])

console.log('\nDocumentos')
e = await throws(`insert into public.documentos (nome, url) values ('Solto','https://x.com/a')`)
ok('documento precisa pertencer a cliente, oportunidade ou projeto', e !== null, e)
e = await throws(`insert into public.documentos (nome, projeto_id) values ('Sem arquivo',$1)`, [pj])
ok('documento precisa de arquivo ou link', e !== null, e)
ok('documento com link e projeto é aceito', (await throws(`insert into public.documentos (nome, tipo, projeto_id, url, status_aprovacao) values ('Layout v1','Planta / layout',$1,'https://drive.google.com/x','Em aprovação')`, [pj])) === null)

console.log('\nHistórico de alterações')
const h0 = (await db.query(`select count(*)::int c from public.activity_log where oportunidade_id=$1`, [ganha])).rows[0].c
await asUser(u2)
await db.query(`update public.oportunidades set status='aberta', etapa_id=5, proximo_passo='Reunião' where id=$1`, [ganha])
await raw()
const lg = (await db.query(`select acao, mudancas, usuario_id from public.activity_log where oportunidade_id=$1 order by id desc limit 1`, [ganha])).rows[0]
ok('mudança de etapa/status fica no histórico com autor', lg.acao === 'alterado' && lg.mudancas.etapa_id[0] === 7 && lg.mudancas.etapa_id[1] === 5 && lg.usuario_id === u2, JSON.stringify(lg))
await db.query(`update public.oportunidades set updated_at = now() where id=$1`, [ganha])
ok('atualização sem mudança real não polui o histórico', (await db.query(`select count(*)::int c from public.activity_log where oportunidade_id=$1`, [ganha])).rows[0].c === h0 + 1)
ok('criação de projeto e aprovação de etapa também são registradas', (await db.query(`select count(*)::int c from public.activity_log where projeto_id=$1 and tabela in ('projetos','projeto_etapas')`, [pj])).rows[0].c >= 2)
await asUser(u2)
e = await throws(`insert into public.activity_log (tabela, registro_id, acao) values ('x', gen_random_uuid(), 'criado')`)
ok('usuário não consegue forjar histórico', e !== null, e)
await raw()

// ---- clientes, unidades e contratos (migration 0007)
console.log('\nClientes, unidades e contratos')
{
  const cli = (await db.query(`insert into public.organizacoes (nome, papeis, atendida_woba) values ('Cliente Contratos','{cliente}','Não') returning id`)).rows[0].id
  const outro = (await db.query(`insert into public.organizacoes (nome, papeis, atendida_woba) values ('Outro Cliente','{cliente}','Não') returning id`)).rows[0].id
  const forn = (await db.query(`insert into public.organizacoes (nome, papeis) values ('Fornecedor Unidade','{fornecedor}') returning id`)).rows[0].id
  ok('cliente novo nasce sem status; backfill só vale para os já existentes', (await db.query(`select status_relacionamento s from public.organizacoes where id=$1`, [cli])).rows[0].s === null)

  await asUser(u2)
  const un = (await db.query(`insert into public.unidades (cliente_id, nome, cidade, estado, tipo_operacao, capacidade_pessoas, area_m2) values ($1,'Brasília Asa Sul','Brasília','DF','Escritório',120,900) returning id, situacao`, [cli])).rows[0]
  ok('comercial cria unidade; situação padrão = Em estudo', un.situacao === 'Em estudo')
  let e = await throws(`insert into public.unidades (cliente_id, nome) values ($1,'brasília asa sul')`, [cli])
  ok('nome de unidade não repete dentro do mesmo cliente', e !== null, e)
  ok('o mesmo nome pode existir em outro cliente', (await throws(`insert into public.unidades (cliente_id, nome) values ($1,'Brasília Asa Sul')`, [outro])) === null)
  e = await throws(`insert into public.unidades (cliente_id, nome, estado) values ($1,'UF errada','Distrito')`, [cli])
  ok('estado exige a sigla de 2 letras', e !== null, e)
  e = await throws(`insert into public.unidades (cliente_id, nome, tipo_operacao) values ($1,'Tipo ruim','Fábrica')`, [cli])
  ok('tipo de operação fora da lista é recusado', e !== null, e)
  e = await throws(`insert into public.unidades (cliente_id, nome, situacao) values ($1,'Sit ruim','Fechada')`, [cli])
  ok('situação fora da lista é recusada', e !== null, e)
  ok('fornecedor vinculado à unidade', (await throws(`insert into public.unidade_fornecedores (unidade_id, fornecedor_id, servico) values ($1,$2,'Limpeza')`, [un.id, forn])) === null)
  e = await throws(`insert into public.unidade_fornecedores (unidade_id, fornecedor_id) values ($1,$2)`, [un.id, forn])
  ok('mesmo fornecedor não vincula duas vezes à unidade', e !== null, e)

  // contratos
  e = await throws(`insert into public.contratos (titulo, cliente_id, tipo) values ('Sem vigência',$1,'Leasing')`, [cli])
  ok('tipo de contrato fora da lista é recusado', e !== null, e)
  e = await throws(`insert into public.contratos (titulo, cliente_id, tipo, status) values ('Vigente sem início',$1,'OaaS','Vigente')`, [cli])
  ok('contrato vigente exige data de início', e && e.includes('data de início'), e)
  e = await throws(`insert into public.contratos (titulo, cliente_id, tipo, data_inicio, data_fim) values ('Datas invertidas',$1,'BTS','2026-12-01','2026-01-01')`, [cli])
  ok('término não pode ser anterior ao início', e !== null, e)
  const ct = (await db.query(`insert into public.contratos (titulo, cliente_id, tipo, status, data_inicio, data_fim, valor_mensal, aviso_dias) values ('OaaS Brasília',$1,'OaaS','Vigente',current_date - 300,current_date + 60,250000,90) returning id`, [cli])).rows[0].id
  ok('contrato vigente torna o cliente Ativo', (await db.query(`select status_relacionamento s from public.organizacoes where id=$1`, [cli])).rows[0].s === 'Ativo')
  e = await throws(`insert into public.contratos (titulo, cliente_id, tipo, valor_mensal) values ('Negativo',$1,'OaaS',-1)`, [cli])
  ok('valor mensal negativo é recusado', e !== null, e)
  ok('contrato cobre a unidade do próprio cliente', (await throws(`insert into public.contrato_unidades (contrato_id, unidade_id) values ($1,$2)`, [ct, un.id])) === null)
  const unOutro = (await db.query(`select id from public.unidades where cliente_id=$1`, [outro])).rows[0].id
  e = await throws(`insert into public.contrato_unidades (contrato_id, unidade_id) values ($1,$2)`, [ct, unOutro])
  ok('contrato não cobre unidade de outro cliente', e && e.includes('outro cliente'), e)
  e = await throws(`insert into public.contrato_unidades (contrato_id, unidade_id) values ($1,$2)`, [ct, un.id])
  ok('unidade não repete no mesmo contrato', e !== null, e)

  // documentos de contrato e unidade
  ok('documento vinculado só ao contrato é aceito (aditivo)', (await throws(`insert into public.documentos (nome, tipo, contrato_id, url) values ('Aditivo 1','Aditivo / aprovação',$1,'https://x')`, [ct])) === null)
  ok('documento vinculado só à unidade é aceito', (await throws(`insert into public.documentos (nome, tipo, unidade_id, url) values ('Matrícula','Outro',$1,'https://x')`, [un.id])) === null)
  e = await throws(`insert into public.documentos (nome, url) values ('Solto','https://x')`)
  ok('documento sem nenhum vínculo continua recusado', e !== null, e)
  // projeto de uma unidade
  await asUser(u3)
  ok('projeto pode apontar para uma unidade', (await throws(`insert into public.projetos (nome, cliente_id, unidade_id) values ('Implantação Asa Sul',$1,$2)`, [cli, un.id])) === null)

  // permissões
  await asUser(u4)
  ok('financeiro altera contrato', (await throws(`update public.contratos set condicoes_pagamento='30 dias' where id=$1`, [ct])) === null)
  e = await throws(`insert into public.unidades (cliente_id, nome) values ($1,'Financeiro não cria')`, [cli])
  ok('financeiro não cria unidade', e !== null, e)
  await asUser(u3)
  e = await throws(`insert into public.contratos (titulo, cliente_id, tipo) values ('Projetos não cria',$1,'BTS')`, [cli])
  ok('projetos não cria contrato', e !== null, e)
  ok('projetos edita unidade', (await throws(`update public.unidades set requisitos_infra='Link dedicado' where id=$1`, [un.id])) === null)
  await asUser(u2)
  await db.query(`delete from public.contratos where id=$1`, [ct])
  ok('comercial não exclui contrato (RLS filtra a linha)', (await db.query(`select count(*)::int c from public.contratos where id=$1`, [ct])).rows[0].c === 1)
  await db.query(`delete from public.unidades where id=$1`, [un.id])
  ok('comercial não exclui unidade', (await db.query(`select count(*)::int c from public.unidades where id=$1`, [un.id])).rows[0].c === 1)

  // histórico
  await raw()
  ok('alterações do contrato aparecem no histórico do contrato e do cliente', (await db.query(`select count(*)::int c from public.activity_log where contrato_id=$1`, [ct])).rows[0].c >= 2 && (await db.query(`select count(*)::int c from public.activity_log where tabela='contratos' and organizacao_id=$1`, [cli])).rows[0].c >= 1)
  ok('alterações da unidade aparecem no histórico da unidade', (await db.query(`select count(*)::int c from public.activity_log where unidade_id=$1 and tabela='unidades'`, [un.id])).rows[0].c >= 2)
  await asUser(u1)
  await db.query(`delete from public.contratos where id=$1`, [ct])
  ok('gestor exclui contrato; cobertura de unidades some junto', (await db.query(`select count(*)::int c from public.contratos where id=$1`, [ct])).rows[0].c === 0 && (await db.query(`select count(*)::int c from public.contrato_unidades where contrato_id=$1`, [ct])).rows[0].c === 0)
  await db.query(`delete from public.unidades where id=$1`, [un.id])
  ok('gestor exclui unidade; documentos e fornecedores da unidade somem junto', (await db.query(`select count(*)::int c from public.unidade_fornecedores where unidade_id=$1`, [un.id])).rows[0].c === 0)
  await raw()
}


// ---- operação e facilities (migration 0008)
console.log('\nOperação e facilities')
{
  const u5 = (await db.query(`insert into auth.users (email) values ('facilities@clip.com') returning id`)).rows[0].id
  await db.query(`update public.profiles set role='facilities' where id=$1`, [u5])
  const cli = (await db.query(`insert into public.organizacoes (nome, papeis, atendida_woba) values ('Cliente Operação','{cliente}','Não') returning id`)).rows[0].id
  const outroCli = (await db.query(`insert into public.organizacoes (nome, papeis, atendida_woba) values ('Cliente Operação 2','{cliente}','Não') returning id`)).rows[0].id
  const forn = (await db.query(`insert into public.organizacoes (nome, papeis) values ('Limpeza SA','{fornecedor}') returning id`)).rows[0].id
  const oper = (await db.query(`insert into public.organizacoes (nome, papeis) values ('Operadora Net','{fornecedor}') returning id`)).rows[0].id
  const un = (await db.query(`insert into public.unidades (cliente_id, nome, situacao) values ($1,'Campinas Centro','Ativo') returning id`, [cli])).rows[0].id
  const unB = (await db.query(`insert into public.unidades (cliente_id, nome) values ($1,'Campinas Norte') returning id`, [cli])).rows[0].id
  const unOutro = (await db.query(`insert into public.unidades (cliente_id, nome) values ($1,'Outra empresa') returning id`, [outroCli])).rows[0].id
  const ctOutro = (await db.query(`insert into public.contratos (titulo, cliente_id, tipo) values ('Contrato de outro',$1,'Facilities') returning id`, [outroCli])).rows[0].id

  // ----- serviços
  await asUser(u5)
  const sv = (await db.query(`insert into public.servicos_unidade (unidade_id, nome, categoria, frequencia, fornecedor_id, controle, clip_garante_sla, sla_resposta_horas, sla_solucao_horas, custo_mensal, forma_verificacao)
    values ($1,'Limpeza diária','Limpeza','Diária',$2,'Clip gerencia fornecedor',true,2,8,12000,'Checklist assinado pelo recepcionista') returning id, status, clip_garante_sla`, [un, forn])).rows[0]
  ok('facilities cadastra serviço na unidade (status Ativo por padrão)', sv.status === 'Ativo')
  let e = await throws(`insert into public.servicos_unidade (unidade_id, nome) values ($1,'limpeza DIÁRIA')`, [un])
  ok('nome do serviço não repete na mesma unidade', e !== null, e)
  ok('o mesmo nome pode existir em outra unidade', (await throws(`insert into public.servicos_unidade (unidade_id, nome) values ($1,'Limpeza diária')`, [unB])) === null)
  e = await throws(`insert into public.servicos_unidade (unidade_id, nome, frequencia) values ($1,'Freq ruim','Às vezes')`, [un])
  ok('frequência fora da lista é recusada', e !== null, e)
  e = await throws(`insert into public.servicos_unidade (unidade_id, nome, custo_mensal) values ($1,'Custo negativo',-5)`, [un])
  ok('custo mensal negativo é recusado', e !== null, e)
  e = await throws(`insert into public.servicos_unidade (unidade_id, nome, contrato_id) values ($1,'Contrato errado',$2)`, [un, ctOutro])
  ok('serviço não liga a contrato de outro cliente', e && e.includes('outro cliente'), e)
  const net = (await db.query(`insert into public.servicos_unidade (unidade_id, nome, categoria, frequencia, controle, clip_garante_sla, sla_resposta_horas, sla_solucao_horas)
    values ($1,'Internet dedicada','Internet e telecom','Contínuo','Terceiro controla',true,4,24) returning id, clip_garante_sla`, [un])).rows[0]
  ok('serviço controlado por terceiro nunca nasce com SLA garantido pela Clip', net.clip_garante_sla === false)
  await db.query(`update public.servicos_unidade set clip_garante_sla = true where id=$1`, [net.id])
  ok('nem por edição: terceiro controla força SLA não garantido', (await db.query(`select clip_garante_sla c from public.servicos_unidade where id=$1`, [net.id])).rows[0].c === false)
  ok('dependência de terceiro (operadora) registrada', (await throws(`insert into public.servico_dependencias (servico_id, terceiro_id, descricao, impacto) values ($1,$2,'Link da operadora','Unidade sem internet')`, [net.id, oper])) === null)
  e = await throws(`insert into public.servico_dependencias (servico_id, descricao) values ($1,'Sem terceiro')`, [net.id])
  ok('dependência exige o terceiro (cadastrado ou por nome)', e !== null, e)
  ok('dependência com terceiro não cadastrado, só pelo nome', (await throws(`insert into public.servico_dependencias (servico_id, terceiro_nome, descricao) values ($1,'Condomínio','Acesso à sala técnica')`, [net.id])) === null)

  // ----- chamados
  const ch = (await db.query(`insert into public.chamados (unidade_id, servico_id, tipo, titulo, criticidade, aberto_em) values ($1,$2,'Incidente','Banheiro sem limpeza','Alta', now() - interval '1 hour') returning id, numero, status, prazo_resposta, prazo_solucao, aberto_em`, [un, sv.id])).rows[0]
  ok('chamado nasce Aberto com número sequencial', ch.status === 'Aberto' && Number(ch.numero) >= 1)
  const horas = (a, b) => Math.round((new Date(b) - new Date(a)) / 3600000)
  ok('prazos do chamado vêm do SLA do serviço (2h resposta, 8h solução)', horas(ch.aberto_em, ch.prazo_resposta) === 2 && horas(ch.aberto_em, ch.prazo_solucao) === 8)
  const chSem = (await db.query(`insert into public.chamados (unidade_id, titulo) values ($1,'Sem serviço') returning prazo_resposta, prazo_solucao`, [un])).rows[0]
  ok('chamado sem serviço não tem prazo automático', chSem.prazo_resposta === null && chSem.prazo_solucao === null)
  e = await throws(`insert into public.chamados (unidade_id, servico_id, titulo) values ($1,$2,'Serviço de outra unidade')`, [unB, sv.id])
  ok('chamado só aceita serviço da própria unidade', e && e.includes('outra unidade'), e)
  e = await throws(`insert into public.chamados (unidade_id, titulo, criticidade) values ($1,'Crit ruim','Urgentíssima')`, [un])
  ok('criticidade fora da lista é recusada', e !== null, e)
  await db.query(`update public.chamados set status='Em atendimento' where id=$1`, [ch.id])
  ok('primeira mudança de status registra a resposta', (await db.query(`select respondido_em r from public.chamados where id=$1`, [ch.id])).rows[0].r !== null)
  e = await throws(`update public.chamados set status='Aguardando terceiro' where id=$1`, [ch.id])
  ok('aguardando terceiro exige dizer o que e de quem', e && e.includes('aguardando'), e)
  ok('aguardando terceiro com motivo é aceito', (await throws(`update public.chamados set status='Aguardando terceiro', aguardando='Peça do fabricante' where id=$1`, [ch.id])) === null)
  e = await throws(`update public.chamados set status='Resolvido' where id=$1`, [ch.id])
  ok('resolver exige descrever a solução', e && e.includes('solução'), e)
  e = await throws(`update public.chamados set status='Fechado', solucao='x' where id=$1`, [ch.id])
  ok('só fecha chamado que já foi resolvido', e && e.includes('Resolva'), e)
  await db.query(`update public.chamados set status='Resolvido', solucao='Limpeza refeita e checklist ajustado', custo=150 where id=$1`, [ch.id])
  ok('resolver registra data da solução', (await db.query(`select resolvido_em r from public.chamados where id=$1`, [ch.id])).rows[0].r !== null)
  await db.query(`update public.chamados set status='Fechado' where id=$1`, [ch.id])
  ok('chamado resolvido pode ser fechado', (await db.query(`select status, fechado_em from public.chamados where id=$1`, [ch.id])).rows[0].fechado_em !== null)
  await db.query(`update public.chamados set status='Em atendimento' where id=$1`, [ch.id])
  ok('reabrir limpa as datas de solução e fechamento', (await db.query(`select resolvido_em r, fechado_em f from public.chamados where id=$1`, [ch.id])).rows[0].r === null)

  // ----- atendimentos e aceite
  const at = (await db.query(`insert into public.atendimentos (unidade_id, servico_id, chamado_id, tipo, descricao, executado_por, conforme) values ($1,$2,$3,'Atendimento de chamado','Equipe refez a limpeza',$4,true) returning id, aceite, aceite_por`, [un, sv.id, ch.id, 'Maria (Limpeza SA)'])).rows[0]
  ok('atendimento nasce com aceite pendente', at.aceite === 'Pendente' && at.aceite_por === null)
  e = await throws(`insert into public.atendimentos (unidade_id, chamado_id, tipo, descricao) values ($1,$2,'Atendimento de chamado','Unidade trocada')`, [unB, ch.id])
  ok('atendimento só aceita chamado da mesma unidade', e && e.includes('outra unidade'), e)
  e = await throws(`update public.atendimentos set aceite='Recusado' where id=$1`, [at.id])
  ok('recusar o atendimento exige motivo', e && e.includes('motivo'), e)
  await asUser(u2)
  await db.query(`update public.atendimentos set aceite='Aceito' where id=$1`, [at.id])
  const ac = (await db.query(`select aceite, aceite_por p, aceite_em e from public.atendimentos where id=$1`, [at.id])).rows[0]
  ok('aceite registra quem aceitou e quando', ac.aceite === 'Aceito' && ac.p === u2 && ac.e !== null)

  // ----- planos preventivos
  await asUser(u5)
  const pl = (await db.query(`insert into public.planos_manutencao (unidade_id, servico_id, titulo, ativo_equipamento, frequencia, proxima_data, fornecedor_id) values ($1,$2,'Limpeza de filtros do ar-condicionado','Split sala 1','Mensal', date '2026-01-31', $3) returning id`, [un, sv.id, forn])).rows[0].id
  e = await throws(`insert into public.planos_manutencao (unidade_id, titulo, frequencia, proxima_data) values ($1,'Freq ruim','Quando der',current_date)`, [un])
  ok('frequência do plano fora da lista é recusada', e !== null, e)
  e = await throws(`insert into public.planos_manutencao (unidade_id, titulo) values ($1,'Sem data')`, [un])
  ok('plano exige a próxima data', e !== null, e)
  ok('função de datas: mensal a partir de 31/01 cai em 28/02', (await db.query(`select public.proxima_ocorrencia('Mensal', date '2026-01-31')::text d`)).rows[0].d === '2026-02-28')
  ok('função de datas: semanal, trimestral e anual', (await db.query(`select public.proxima_ocorrencia('Semanal', date '2026-03-01')::text a, public.proxima_ocorrencia('Trimestral', date '2026-03-01')::text b, public.proxima_ocorrencia('Anual', date '2026-03-01')::text c`)).rows[0].a === '2026-03-08')
  await db.query(`select public.registrar_execucao_plano($1, date '2026-02-03', 'Filtros lavados', true, 'Técnico João')`, [pl])
  const p2 = (await db.query(`select ultima_data::text u, proxima_data::text p from public.planos_manutencao where id=$1`, [pl])).rows[0]
  ok('executar o plano grava a última data e agenda a próxima (03/02 → 03/03)', p2.u === '2026-02-03' && p2.p === '2026-03-03', JSON.stringify(p2))
  ok('executar o plano cria o atendimento de manutenção preventiva', (await db.query(`select count(*)::int c from public.atendimentos where plano_id=$1 and tipo='Manutenção preventiva' and conforme`, [pl])).rows[0].c === 1)
  await asUser(u4)
  e = await throws(`select public.registrar_execucao_plano($1)`, [pl])
  ok('financeiro não registra execução de plano', e !== null, e)
  ok('o plano não anda quando a execução é recusada', (await db.query(`select proxima_data::text p from public.planos_manutencao where id=$1`, [pl])).rows[0].p === '2026-03-03')

  // ----- garantias e vencimentos
  await asUser(u5)
  ok('garantia registrada (concedida pelo fornecedor)', (await throws(`insert into public.garantias_vencimentos (unidade_id, servico_id, tipo, descricao, fornecedor_id, data_vencimento) values ($1,$2,'Garantia','Compressor do split',$3,current_date + 40)`, [un, sv.id, forn])) === null)
  e = await throws(`insert into public.garantias_vencimentos (unidade_id, tipo, descricao, data_vencimento, concedida_por) values ($1,'Garantia','Quem?',current_date,'Ninguém')`, [un])
  ok('quem concede a garantia precisa estar na lista', e !== null, e)
  e = await throws(`insert into public.garantias_vencimentos (unidade_id, descricao) values ($1,'Sem data')`, [un])
  ok('garantia exige a data de vencimento', e !== null, e)

  // ----- permissões
  await asUser(u4)
  e = await throws(`insert into public.chamados (unidade_id, titulo) values ($1,'Financeiro não abre')`, [un])
  ok('financeiro não abre chamado', e !== null, e)
  e = await throws(`insert into public.servicos_unidade (unidade_id, nome) values ($1,'Financeiro não cria')`, [un])
  ok('financeiro não cria serviço', e !== null, e)
  ok('financeiro lê serviços e chamados', (await db.query(`select count(*)::int c from public.servicos_unidade`)).rows[0].c >= 2 && (await db.query(`select count(*)::int c from public.chamados`)).rows[0].c >= 2)
  await asUser(u2)
  ok('comercial abre chamado do cliente', (await throws(`insert into public.chamados (unidade_id, titulo, solicitante, tipo) values ($1,'Pedido de crachás','Gerente local','Solicitação')`, [un])) === null)
  await db.query(`delete from public.chamados where id=$1`, [ch.id])
  ok('comercial não exclui chamado', (await db.query(`select count(*)::int c from public.chamados where id=$1`, [ch.id])).rows[0].c === 1)
  await asUser(u5)
  await db.query(`delete from public.servicos_unidade where id=$1`, [sv.id])
  ok('facilities não exclui serviço (só o gestor)', (await db.query(`select count(*)::int c from public.servicos_unidade where id=$1`, [sv.id])).rows[0].c === 1)
  await db.query(`delete from public.servico_dependencias where servico_id=$1`, [net.id])
  ok('facilities remove dependência de terceiro', (await db.query(`select count(*)::int c from public.servico_dependencias where servico_id=$1`, [net.id])).rows[0].c === 0)

  // ----- histórico
  await raw()
  ok('chamados e serviços entram no histórico da unidade', (await db.query(`select count(distinct tabela)::int c from public.activity_log where unidade_id=$1 and tabela in ('chamados','servicos_unidade','atendimentos','planos_manutencao','garantias_vencimentos')`, [un])).rows[0].c === 5)
  ok('mudança de status do chamado fica registrada', (await db.query(`select count(*)::int c from public.activity_log where tabela='chamados' and registro_id=$1 and mudancas ? 'status'`, [ch.id])).rows[0].c >= 3)

  // ----- exclusões em cascata
  await asUser(u1)
  await db.query(`delete from public.unidades where id=$1`, [un])
  ok('gestor exclui a unidade e tudo da operação some junto', (await db.query(`select (select count(*) from public.servicos_unidade where unidade_id=$1) + (select count(*) from public.chamados where unidade_id=$1) + (select count(*) from public.planos_manutencao where unidade_id=$1) + (select count(*) from public.atendimentos where unidade_id=$1) + (select count(*) from public.garantias_vencimentos where unidade_id=$1) as n`, [un])).rows[0].n == 0)
  await raw()
  void unOutro
}


// ---- financeiro por contrato (migration 0009)
console.log('\nFinanceiro por contrato')
{
  const uFin = (await db.query(`select id from auth.users where email='financeiro@clip.com'`)).rows[0].id
  const uCom = (await db.query(`select id from auth.users where email='comercial@clip.com'`)).rows[0].id
  const uFac = (await db.query(`select id from auth.users where email='facilities@clip.com'`)).rows[0].id
  const cli = (await db.query(`insert into public.organizacoes (nome, papeis, atendida_woba) values ('Cliente Financeiro','{cliente}','Não') returning id`)).rows[0].id
  const outro = (await db.query(`insert into public.organizacoes (nome, papeis, atendida_woba) values ('Cliente Financeiro 2','{cliente}','Não') returning id`)).rows[0].id
  const forn = (await db.query(`insert into public.organizacoes (nome, papeis) values ('Fornecedor Fin','{fornecedor}') returning id`)).rows[0].id
  const un = (await db.query(`insert into public.unidades (cliente_id, nome) values ($1,'Unidade Fin') returning id`, [cli])).rows[0].id
  const unOutro = (await db.query(`insert into public.unidades (cliente_id, nome) values ($1,'Unidade Fin 2') returning id`, [outro])).rows[0].id
  const sv = (await db.query(`insert into public.servicos_unidade (unidade_id, nome, custo_mensal) values ($1,'Limpeza Fin',9000) returning id`, [un])).rows[0].id
  const ctV = (await db.query(`insert into public.contratos (titulo, cliente_id, tipo, status, data_inicio, valor_mensal) values ('Contrato Fin',$1,'Facilities','Vigente',current_date - 100, 100000) returning id`, [cli])).rows[0].id
  const ctR = (await db.query(`insert into public.contratos (titulo, cliente_id, tipo) values ('Contrato rascunho',$1,'BTS') returning id`, [cli])).rows[0].id

  await asUser(uFin)
  const l1 = (await db.query(`insert into public.lancamentos_financeiros (contrato_id, tipo, competencia, valor, data) values ($1,'Faturamento','2026-09-17',100000,'2026-09-30') returning id, competencia::text c, pago`, [ctV])).rows[0]
  ok('financeiro lança faturamento', l1.pago === true)
  ok('competência é normalizada para o 1º dia do mês', l1.c === '2026-09-01', l1.c)
  ok('recebimento parcial lançado', (await throws(`insert into public.lancamentos_financeiros (contrato_id, tipo, competencia, valor, data) values ($1,'Recebimento','2026-09-01',60000,'2026-10-05')`, [ctV])) === null)
  const saldo = (await db.query(`select coalesce(sum(case tipo when 'Faturamento' then valor when 'Recebimento' then -valor end),0)::numeric s from public.lancamentos_financeiros where contrato_id=$1`, [ctV])).rows[0].s
  ok('a receber = faturado − recebido (40.000)', Number(saldo) === 40000, saldo)
  ok('custo pago lançado', (await throws(`insert into public.lancamentos_financeiros (contrato_id, tipo, competencia, valor, data, fornecedor_id, servico_id, unidade_id) values ($1,'Custo','2026-09-01',8500,'2026-09-28',$2,$3,$4)`, [ctV, forn, sv, un])) === null)
  ok('custo a pagar com vencimento lançado', (await throws(`insert into public.lancamentos_financeiros (contrato_id, tipo, competencia, valor, pago, vencimento) values ($1,'Custo','2026-11-01',9000,false,'2026-11-10')`, [ctV])) === null)
  let e = await throws(`insert into public.lancamentos_financeiros (contrato_id, tipo, competencia, valor, pago) values ($1,'Custo','2026-11-01',9000,false)`, [ctV])
  ok('custo a pagar exige o vencimento', e !== null, e)
  e = await throws(`insert into public.lancamentos_financeiros (contrato_id, tipo, competencia, valor, pago) values ($1,'Custo','2026-11-01',9000,true)`, [ctV])
  ok('lançamento pago exige a data', e !== null, e)
  e = await throws(`insert into public.lancamentos_financeiros (contrato_id, tipo, competencia, valor, pago, vencimento) values ($1,'Faturamento','2026-11-01',1000,false,'2026-12-01')`, [ctV])
  ok('faturamento e recebimento não ficam "a pagar"', e !== null, e)
  e = await throws(`insert into public.lancamentos_financeiros (contrato_id, tipo, competencia, valor, data) values ($1,'Faturamento','2026-11-01',0,'2026-11-01')`, [ctV])
  ok('valor precisa ser maior que zero', e !== null, e)
  e = await throws(`insert into public.lancamentos_financeiros (contrato_id, tipo, competencia, valor, data) values ($1,'Imposto','2026-11-01',10,'2026-11-01')`, [ctV])
  ok('tipo fora da lista é recusado', e !== null, e)
  e = await throws(`insert into public.lancamentos_financeiros (contrato_id, tipo, competencia, valor, data) values ($1,'Faturamento','2026-11-01',1000,'2026-11-01')`, [ctR])
  ok('contrato em rascunho não recebe faturamento', e && e.includes('não vigente'), e)
  ok('contrato em rascunho aceita custo e investimento (pré-operação)', (await throws(`insert into public.lancamentos_financeiros (contrato_id, tipo, competencia, valor, data) values ($1,'Investimento','2026-08-01',50000,'2026-08-15')`, [ctR])) === null)
  e = await throws(`insert into public.lancamentos_financeiros (contrato_id, tipo, competencia, valor, data, unidade_id) values ($1,'Custo','2026-09-01',100,'2026-09-02',$2)`, [ctV, unOutro])
  ok('unidade do lançamento tem que ser do cliente do contrato', e && e.includes('outro cliente'), e)
  ok('atualizar para pago funciona', (await throws(`update public.lancamentos_financeiros set pago=true, data='2026-11-09' where contrato_id=$1 and not pago`, [ctV])) === null)

  // cotação ligada a contrato
  const op = (await db.query(`insert into public.operacoes (nome, cliente_id, contrato_id) values ('Operação Fin',$1,$2) returning id`, [cli, ctV])).rows[0].id
  e = await throws(`update public.operacoes set contrato_id=$1 where id=$2`, [(await db.query(`insert into public.contratos (titulo, cliente_id, tipo) values ('Contrato outro cliente',$1,'BTS') returning id`, [outro])).rows[0].id, op])
  ok('operação só liga a contrato do mesmo cliente', e && e.includes('outro cliente'), e)

  // permissões: só gestor e financeiro
  await asUser(uCom)
  ok('comercial não vê lançamentos financeiros', (await db.query(`select count(*)::int c from public.lancamentos_financeiros`)).rows[0].c === 0)
  e = await throws(`insert into public.lancamentos_financeiros (contrato_id, tipo, competencia, valor, data) values ($1,'Custo','2026-09-01',10,'2026-09-02')`, [ctV])
  ok('comercial não lança no financeiro', e !== null, e)
  await asUser(uFac)
  ok('facilities não vê lançamentos financeiros', (await db.query(`select count(*)::int c from public.lancamentos_financeiros`)).rows[0].c === 0)
  await asUser(u1)
  ok('gestor vê os lançamentos', (await db.query(`select count(*)::int c from public.lancamentos_financeiros`)).rows[0].c >= 5)
  await asUser(uFin)
  await db.query(`delete from public.lancamentos_financeiros where id=$1`, [l1.id])
  ok('financeiro exclui lançamento', (await db.query(`select count(*)::int c from public.lancamentos_financeiros where id=$1`, [l1.id])).rows[0].c === 0)

  // histórico
  await raw()
  ok('lançamentos aparecem no histórico do contrato', (await db.query(`select count(*)::int c from public.activity_log where tabela='lancamentos_financeiros' and contrato_id=$1`, [ctV])).rows[0].c >= 5)
  await asUser(u1)
  await db.query(`delete from public.contratos where id=$1`, [ctV])
  ok('excluir o contrato apaga os lançamentos dele', (await db.query(`select count(*)::int c from public.lancamentos_financeiros where contrato_id=$1`, [ctV])).rows[0].c === 0)
  await raw()
}

// ---- migração 0006 sobre um banco que já tem dados (conversão das 8 etapas antigas para 7)
console.log('\nMigração 0006 com dados existentes')
{
  const old = new PGlite()
  await old.exec(`
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role authenticated nologin;
    grant usage on schema public, auth to authenticated;
  `)
  for (const f of ['0001_init','0002_comercial_exclui_oportunidades','0003_tipo_simplificado','0004_remove_categoria','0005_operacoes_cotacoes'])
    await old.exec(fs.readFileSync(here(`../migrations/${f}.sql`), 'utf8'))
  await old.exec(seed)
  const q = async (sql, params = []) => (await old.query(sql, params)).rows
  const fo = (await q(`insert into public.organizacoes (nome, papeis, cidade, categorias_servico) values ('Fornecedor Antigo','{fornecedor}','Campinas','{civil}') returning id`))[0].id
  const cl = (await q(`insert into public.organizacoes (nome, atendida_woba) values ('Cliente Antigo','Não') returning id`))[0].id
  for (const n of [1,2,3,4,5,6,7])
    await q(`insert into public.oportunidades (titulo, cliente_final_id, etapa_id) values ($1,$2,$3)`, [`opp etapa ${n}`, cl, n])
  await q(`insert into public.oportunidades (titulo, cliente_final_id, etapa_id, status) values ('opp ganha',$1,8,'ganha')`, [cl])
  await q(`insert into public.oportunidades (titulo, cliente_final_id, etapa_id, status, motivo_perda) values ('opp perdida',$1,8,'perdida','Preço')`, [cl])
  const antes = await q(`select count(*)::int c from public.oportunidades`)
  await old.exec(fs.readFileSync(here('../migrations/0006_modelo_fase1.sql'), 'utf8'))
  const m = Object.fromEntries((await q(`select titulo, etapa_id, status from public.oportunidades`)).map(r => [r.titulo, r]))
  ok('nenhuma oportunidade se perde na migração', (await q(`select count(*)::int c from public.oportunidades`))[0].c === antes[0].c)
  ok('etapas antigas 1,2→1  3→2  4→3  5→4  6→5  7→6', [1,1,2,3,4,5,6].every((novo, i) => m[`opp etapa ${i + 1}`].etapa_id === novo), JSON.stringify(m))
  ok('ganha e perdida vão para a etapa 7 mantendo o resultado', m['opp ganha'].etapa_id === 7 && m['opp ganha'].status === 'ganha' && m['opp perdida'].etapa_id === 7 && m['opp perdida'].status === 'perdida')
  ok('fornecedor existente ganha perfil de parceiro com cidade e especialidade', (await q(`select cidades, especialidades from public.parceiros where organizacao_id=$1`, [fo]))[0]?.especialidades?.[0] === 'civil')
  const cl2 = (await q(`insert into public.organizacoes (nome, papeis, atendida_woba) values ('Cliente Para 0007','{cliente}','Não') returning id`))[0].id
  await old.exec(fs.readFileSync(here('../migrations/0007_clientes_unidades_contratos.sql'), 'utf8'))
  ok('0007 sobre banco existente: cliente já cadastrado vira Prospect', (await q(`select status_relacionamento s from public.organizacoes where id=$1`, [cl2]))[0].s === 'Prospect')
  ok('0007 sobre banco existente: documentos antigos continuam válidos', (await q(`select count(*)::int c from pg_constraint where conrelid='public.documentos'::regclass and conname='documentos_vinculo_chk'`))[0].c === 1)
  await old.exec(fs.readFileSync(here('../migrations/0008_operacao_facilities.sql'), 'utf8'))
  await old.exec(fs.readFileSync(here('../migrations/0009_financeiro_contratos.sql'), 'utf8'))
  ok('0008 sobre banco existente: tabelas de operação criadas', (await q(`select count(*)::int c from information_schema.tables where table_schema='public' and table_name in ('servicos_unidade','chamados','planos_manutencao','atendimentos','garantias_vencimentos','servico_dependencias')`))[0].c === 6)
  ok('regras novas valem depois da migração', (await old.query(`insert into public.oportunidades (titulo, cliente_final_id, origem, etapa_id) select 'via woba', id, 'Woba', 1 from public.organizacoes where nome='EY' returning etapa_id`)).rows[0].etapa_id === 3)
}

console.log(`\n${pass} ok, ${fail} falhas`)
process.exit(fail ? 1 : 0)
