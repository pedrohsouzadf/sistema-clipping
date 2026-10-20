-- =====================================================================
-- 0006 — Modelo da Fase 1 (baseado no desenho de arquitetura de 19/10/2026)
--   A. Funil de 7 etapas (substitui as 8 etapas) + novos campos da oportunidade
--   B. Papéis por função (gestor, comercial, projetos, engenharia, facilities, financeiro)
--   C. Empresas com registro único (razão social, CNPJ, responsável, próximo passo)
--   D. Projetos de implantação: etapas com critérios, aprovação formal, riscos/decisões
--   E. Parceiros por cidade e especialidade, com avaliação por projeto
--   F. Tarefas ligadas a objetos de negócio (oportunidade, projeto, empresa, contato)
--   G. Documentos (arquivo ou link) com versão e status de aprovação
--   H. Histórico de alterações (activity_log)
-- Preserva os dados existentes. Rode depois das migrations 0001 a 0005.
-- =====================================================================

-- ---------------------------------------------------------------------
-- B. Papéis por função
-- ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('gestor','comercial','projetos','engenharia','facilities','financeiro'));

-- gestor sempre passa; os demais precisam estar na lista
create or replace function public.tem_papel(variadic p_papeis text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and (role = 'gestor' or role = any (p_papeis))
  );
$$;

-- ---------------------------------------------------------------------
-- A. Funil de 7 etapas
--   1 Mapeada · 2 Qualificada · 3 Reunião / diagnóstico · 4 Estudo de viabilidade
--   5 Proposta enviada · 6 Negociação · 7 Ganha ou perdida
--   Conversão das oportunidades existentes: 1,2→1  3→2  4→3  5→4  6→5  7→6  8→7
-- ---------------------------------------------------------------------
alter table public.etapas add column if not exists probabilidade_padrao smallint
  check (probabilidade_padrao between 0 and 100);

alter table public.oportunidades disable trigger oportunidades_regras;
update public.oportunidades set etapa_id = case etapa_id
  when 1 then 1 when 2 then 1 when 3 then 2 when 4 then 3
  when 5 then 4 when 6 then 5 when 7 then 6 when 8 then 7 end;
alter table public.oportunidades enable trigger oportunidades_regras;

delete from public.playbook_itens;   -- o checklist por oportunidade acompanha (cascade)

update public.etapas set nome='Mapeada', descricao='Empresa identificada, ainda sem validação (somente prospecção direta).',
  criterio_avanco='Empresa confirmada como NÃO atendida pela Woba; sinal de oportunidade e evidência registrados.',
  apenas_origem_direta=true, prazo_alvo_dias=7, probabilidade_padrao=10 where id=1;
update public.etapas set nome='Qualificada', descricao='Necessidade, potencial e aderência confirmados (somente prospecção direta).',
  criterio_avanco='Decisor identificado, dor/necessidade validada e potencial confirmado.',
  apenas_origem_direta=true, prazo_alvo_dias=14, probabilidade_padrao=25 where id=2;
update public.etapas set nome='Reunião / diagnóstico', descricao='Levantamento do problema e dos requisitos (briefing). Demandas da Woba entram aqui.',
  criterio_avanco='Briefing completo e requisitos validados.',
  apenas_origem_direta=false, prazo_alvo_dias=14, probabilidade_padrao=40 where id=3;
update public.etapas set nome='Estudo de viabilidade', descricao='Imóvel, escopo, fornecedores e custos analisados.',
  criterio_avanco='Imóvel avaliado, test fit feito e simulação de preço registrada.',
  apenas_origem_direta=false, prazo_alvo_dias=21, probabilidade_padrao=55 where id=4;
update public.etapas set nome='Proposta enviada', descricao='Preço, escopo, prazo e condições registrados e enviados (à Woba, quando via Woba).',
  criterio_avanco='Proposta emitida e enviada.',
  apenas_origem_direta=false, prazo_alvo_dias=7, probabilidade_padrao=70 where id=5;
update public.etapas set nome='Negociação', descricao='Ajustes comerciais, financeiros ou contratuais com cliente/Woba.',
  criterio_avanco='Condições acordadas e pendências fechadas.',
  apenas_origem_direta=false, prazo_alvo_dias=30, probabilidade_padrao=85 where id=6;
update public.etapas set nome='Ganha ou perdida', descricao='Contrato assinado (ganha) ou oportunidade encerrada (perdida, com motivo documentado).',
  criterio_avanco=null, apenas_origem_direta=false, prazo_alvo_dias=null, probabilidade_padrao=null where id=7;
delete from public.etapas where id = 8;

insert into public.playbook_itens (etapa_id, ordem, tipo, texto, obrigatorio) values
 (1, 1, 'pergunta',  'A empresa foi confirmada como NÃO atendida pela Woba?', true),
 (1, 2, 'pergunta',  'Sinal de oportunidade e fonte registrados (imóvel vago não é cliente interessado — registre a evidência)', true),
 (1, 3, 'pergunta',  'Potencial e evidência classificados', true),
 (2, 1, 'tarefa',    'Identificar o decisor (cargo e contato)', true),
 (2, 2, 'tarefa',    'Realizar o primeiro contato', true),
 (2, 3, 'pergunta',  'Dor/necessidade validada com a empresa', true),
 (2, 4, 'pergunta',  'Comprador e decisor mapeados', true),
 (2, 5, 'pergunta',  'Momento e prazo da empresa entendidos', false),
 (3, 1, 'pergunta',  'Cidade/região do projeto', true),
 (3, 2, 'pergunta',  'Metragem ou número de posições de trabalho', true),
 (3, 3, 'pergunta',  'Padrão desejado (Essential / Comfort / Premium)', true),
 (3, 4, 'pergunta',  'Tipo e estado do imóvel (semi-pronto / laje nova), se já tem imóvel e se precisa de obra', true),
 (3, 5, 'pergunta',  'Classe do prédio (AAA / A / B / C)', false),
 (3, 6, 'pergunta',  'Prazo do contrato (24 / 36 / 60 / 120 meses)', true),
 (3, 7, 'pergunta',  'Quando precisa começar a operar (urgência)', true),
 (3, 8, 'pergunta',  'Horário de operação e ocupação prevista (registrar a fonte da premissa)', true),
 (3, 9, 'pergunta',  'Programa de ambientes', false),
 (3, 10,'pergunta',  'O que fica dentro e fora do escopo e quem responde por cada item', true),
 (3, 11,'pergunta',  'Requisitos de TI do cliente', false),
 (3, 12,'pergunta',  'Canal de origem e cliente final registrados', true),
 (4, 1, 'tarefa',    'Visita técnica e levantamento do imóvel', true),
 (4, 2, 'tarefa',    'Test fit (estudo de ocupação)', true),
 (4, 3, 'tarefa',    'Levantar fornecedores e custos de obra', false),
 (4, 4, 'tarefa',    'Rodar a simulação de preço (cenários) e registrar as premissas', true),
 (5, 1, 'tarefa',    'Emitir a proposta (versão, validade, valor bruto e líquido de comissão)', true),
 (5, 2, 'documento', 'Anexos técnicos da proposta', false),
 (5, 3, 'tarefa',    'Enviar a proposta (à Woba, quando a demanda veio por ela)', true),
 (6, 1, 'tarefa',    'Registrar pendências com dono e prazo (cliente / Woba / Clip)', true),
 (6, 2, 'tarefa',    'Registrar cada rodada de revisão da proposta', false),
 (6, 3, 'pergunta',  'Condições comerciais acordadas', true),
 (7, 1, 'documento', 'Contrato assinado (ganha) ou motivo da perda documentado (perdida)', true),
 (7, 2, 'documento', 'Documentos do imóvel reunidos (matrícula, IPTU, laudo, AVCB/PPCI quando houver)', false),
 (7, 3, 'tarefa',    'Gerar o projeto de implantação a partir da oportunidade ganha', false);

-- novos campos da oportunidade
alter table public.oportunidades
  add column if not exists tipo_servico text check (tipo_servico in ('OaaS','BTS','Turnkey','Fit-out','Facilities','Outro')),
  add column if not exists valor_estimado numeric(14,2) check (valor_estimado >= 0),
  add column if not exists probabilidade smallint check (probabilidade between 0 and 100),
  add column if not exists prazo_fechamento date,
  add column if not exists concorrentes text,
  add column if not exists riscos text,
  add column if not exists tipo_imovel text,
  add column if not exists necessidade_obra boolean,
  add column if not exists regra_relacionamento text,
  add column if not exists aprovacao_abordagem text not null default 'Não necessária'
    check (aprovacao_abordagem in ('Não necessária','Pendente','Aprovada'));

-- regras de negócio com a nova numeração
create or replace function public.oportunidade_regras() returns trigger
language plpgsql as $$
declare
  v_cli        public.organizacoes%rowtype;
  v_canal      public.organizacoes%rowtype;
  v_woba       uuid;
  v_verificar  boolean;
begin
  select * into v_cli from public.organizacoes where id = new.cliente_final_id;

  -- 1) Demanda recebida da Woba: canal/contratante preenchidos e entrada na etapa 3
  if new.origem = 'Woba' then
    if new.canal_id is null then
      select id into v_woba from public.organizacoes where lower(nome) = 'woba' limit 1;
      if v_woba is null then
        raise exception 'Cadastre a organização "Woba" (parceiro) antes de registrar demandas vindas dela.';
      end if;
      new.canal_id := v_woba;
    end if;
    if new.contratante_id is null then
      new.contratante_id := new.canal_id;
    end if;
    if new.etapa_id < 3 then
      if tg_op = 'INSERT' then
        new.etapa_id := 3;
      else
        raise exception 'Demandas recebidas da Woba entram a partir da etapa 3 (Reunião / diagnóstico).';
      end if;
    end if;
  end if;

  -- 2) Comissão herdada do canal (ex.: Woba = 16% sobre a mensalidade total)
  if new.canal_id is not null and new.comissao_canal_pct is null then
    select * into v_canal from public.organizacoes where id = new.canal_id;
    new.comissao_canal_pct := v_canal.comissao_padrao_pct;
  end if;

  -- 3) Travas de relacionamento — só ao criar ou ao mudar origem, cliente, modelo, etapa ou aprovação
  v_verificar := tg_op = 'INSERT'
    or new.origem          is distinct from old.origem
    or new.cliente_final_id is distinct from old.cliente_final_id
    or new.modelo_atuacao  is distinct from old.modelo_atuacao
    or new.etapa_id        is distinct from old.etapa_id
    or new.aprovacao_abordagem is distinct from old.aprovacao_abordagem;

  if v_verificar and new.modelo_atuacao = 'operador' and new.origem <> 'Woba' then
    if v_cli.atendida_woba = 'Sim' then
      raise exception 'Cliente atendido pela Woba: a Clip não pode vender diretamente como operadora. Registre a demanda com origem Woba.';
    elsif v_cli.atendida_woba = 'Validar' and new.etapa_id > 1 then
      raise exception 'Confirme com a Woba se esta empresa é atendida por ela antes de avançar da etapa 1.';
    end if;
  end if;

  if v_verificar and new.aprovacao_abordagem = 'Pendente' and new.etapa_id > 1 then
    raise exception 'A abordagem a esta empresa depende de aprovação (regra de relacionamento). Registre a aprovação antes de avançar da etapa 1.';
  end if;

  -- 4) Fechamento: etapa 7 <=> resultado ganha/perdida
  if new.status in ('ganha','perdida') then
    new.etapa_id := 7;
    if new.status = 'perdida' and coalesce(btrim(new.motivo_perda), '') = '' then
      raise exception 'Informe o motivo da perda.';
    end if;
    if new.fechada_em is null then new.fechada_em := now(); end if;
  else
    if new.etapa_id = 7 then
      raise exception 'A etapa 7 exige um resultado (ganha ou perdida). Para reabrir, escolha uma etapa anterior.';
    end if;
    new.fechada_em := null;
    new.motivo_perda := null;
  end if;

  -- 5) Marca de tempo da etapa
  if tg_op = 'INSERT' or new.etapa_id is distinct from old.etapa_id then
    new.etapa_atualizada_em := now();
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------
-- C. Empresas: registro único
-- ---------------------------------------------------------------------
alter table public.organizacoes
  add column if not exists razao_social text,
  add column if not exists cnpj text,
  add column if not exists site text,
  add column if not exists cidades_atuacao text,
  add column if not exists responsavel_id uuid references public.profiles(id),
  add column if not exists origem_relacionamento text
    check (origem_relacionamento in ('Prospecção direta','Woba','Indicação','Evento','Outro')),
  add column if not exists necessidades text,
  add column if not exists proximo_passo text,
  add column if not exists proximo_passo_data date,
  add column if not exists ultimo_contato date;
-- o mesmo CNPJ não pode aparecer duas vezes (ignora pontuação)
create unique index if not exists organizacoes_cnpj_uq
  on public.organizacoes (regexp_replace(cnpj, '\D', '', 'g')) where cnpj is not null and btrim(cnpj) <> '';

-- a última interação também atualiza o "último contato" da empresa
create or replace function public.interacao_atualiza_contato() returns trigger
language plpgsql as $$
declare v_org uuid;
begin
  if new.contato_id is not null then
    update public.contatos set ultima_interacao = new.data
     where id = new.contato_id and (ultima_interacao is null or ultima_interacao < new.data);
  end if;
  v_org := coalesce(
    new.organizacao_id,
    (select cliente_final_id from public.oportunidades where id = new.oportunidade_id),
    (select organizacao_id from public.contatos where id = new.contato_id));
  if v_org is not null then
    update public.organizacoes set ultimo_contato = new.data::date
     where id = v_org and (ultimo_contato is null or ultimo_contato < new.data::date);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- D. Projetos de implantação
-- ---------------------------------------------------------------------
create table public.projetos (
  id                   uuid primary key default gen_random_uuid(),
  nome                 text not null,
  cliente_id           uuid references public.organizacoes(id),
  oportunidade_id      uuid references public.oportunidades(id) on delete set null,
  tipo                 text check (tipo in ('OaaS','BTS','Turnkey','Fit-out','Facilities','Outro')),
  status               text not null default 'planejamento'
                         check (status in ('planejamento','em_execucao','pausado','concluido','cancelado')),
  cidade               text,
  endereco             text,
  gerente_id           uuid references public.profiles(id),
  engenheiro_id        uuid references public.profiles(id),
  responsaveis_locais  text,
  escopo               text,
  premissas            text,
  exclusoes            text,
  criterios_conclusao  text,
  data_inicio          date,
  data_fim_prevista    date,
  data_fim_real        date,
  observacoes          text,
  created_by           uuid default auth.uid() references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (data_fim_prevista is null or data_inicio is null or data_fim_prevista >= data_inicio)
);
create unique index projetos_oportunidade_uq on public.projetos (oportunidade_id) where oportunidade_id is not null;
create index projetos_status_idx on public.projetos (status);
create trigger projetos_updated before update on public.projetos
  for each row execute function public.set_updated_at();

create table public.projeto_etapas (
  id                    uuid primary key default gen_random_uuid(),
  projeto_id            uuid not null references public.projetos(id) on delete cascade,
  ordem                 smallint not null,
  nome                  text not null,
  descricao             text,
  criterio_entrada      text,
  criterio_saida        text,
  status                text not null default 'pendente' check (status in ('pendente','em_andamento','concluida')),
  data_inicio_prevista  date,
  data_fim_prevista     date,
  data_fim_real         date,
  aprovada              boolean not null default false,   -- aprovação formal ≠ atividade concluída
  aprovada_em           timestamptz,
  aprovada_por          uuid references public.profiles(id),
  unique (projeto_id, ordem)
);

-- as 7 etapas padrão do fluxo de implantação nascem com todo projeto
create or replace function public.projeto_cria_etapas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.projeto_etapas (projeto_id, ordem, nome, descricao, criterio_entrada, criterio_saida) values
   (new.id, 1, 'Briefing e requisitos', 'Entender o que o cliente precisa para operar.',
      'Oportunidade ganha ou contrato em negociação final.', 'Requisitos do cliente documentados e validados.'),
   (new.id, 2, 'Levantamento e viabilidade', 'Avaliar imóvel, infraestrutura, prazo e investimento.',
      'Briefing aprovado.', 'Imóvel e infraestrutura avaliados; investimento e prazo estimados.'),
   (new.id, 3, 'Proposta e aprovação', 'Definir escopo, preço, prazo e responsabilidades.',
      'Viabilidade aprovada.', 'Escopo, preço, prazo e responsabilidades aprovados pelo cliente.'),
   (new.id, 4, 'Planejamento', 'Cronograma, orçamento, fornecedores, documentação e riscos.',
      'Escopo aprovado.', 'Cronograma, orçamento, fornecedores, responsáveis e riscos definidos.'),
   (new.id, 5, 'Execução', 'Acompanhar atividades, compras, equipes, custos e mudanças.',
      'Escopo, orçamento e responsáveis aprovados e condições de início atendidas.', 'Obra e instalações executadas conforme o escopo.'),
   (new.id, 6, 'Vistoria e entrega', 'Testar instalações, corrigir pendências, registrar aceite e documentação.',
      'Execução concluída.', 'Pendências corrigidas e aceite do cliente registrado.'),
   (new.id, 7, 'Transição para operação', 'Transferir informações, contratos de serviços, garantias e rotinas de manutenção.',
      'Entrega aceita pelo cliente.', 'Documentação, garantias e rotinas de manutenção entregues à operação.');
  return new;
end $$;
create trigger projetos_cria_etapas after insert on public.projetos
  for each row execute function public.projeto_cria_etapas();

create or replace function public.projeto_etapa_regras() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    -- reabrir uma etapa já aprovada exige remover a aprovação antes
    if old.aprovada and new.aprovada and new.status <> 'concluida' then
      raise exception 'Esta etapa já foi aprovada. Remova a aprovação antes de reabri-la.';
    end if;
    if new.aprovada and not old.aprovada then
      if new.status <> 'concluida' then
        raise exception 'Conclua a etapa antes de aprová-la.';
      end if;
      if not public.tem_papel('projetos','engenharia') then
        raise exception 'Somente gestor, projetos ou engenharia aprovam etapas.';
      end if;
      new.aprovada_em := now();
      new.aprovada_por := auth.uid();
    end if;
    if not new.aprovada and old.aprovada then
      new.aprovada_em := null;
      new.aprovada_por := null;
    end if;
  end if;
  if new.status = 'concluida' and new.data_fim_real is null then new.data_fim_real := current_date; end if;
  if new.status <> 'concluida' then new.data_fim_real := null; end if;
  return new;
end $$;
create trigger projeto_etapas_regras before update on public.projeto_etapas
  for each row execute function public.projeto_etapa_regras();

-- riscos, pendências, decisões e mudanças de escopo do projeto
create table public.projeto_registros (
  id              uuid primary key default gen_random_uuid(),
  projeto_id      uuid not null references public.projetos(id) on delete cascade,
  tipo            text not null check (tipo in ('risco','pendencia','decisao','mudanca_escopo')),
  descricao       text not null,
  responsavel_id  uuid references public.profiles(id),
  prazo           date,
  status          text not null default 'aberto' check (status in ('aberto','resolvido')),
  aprovado_por    text,                 -- quem aprovou (decisões e mudanças)
  motivo          text,                 -- por que foi decidido/alterado
  data            date not null default current_date,
  created_by      uuid default auth.uid() references public.profiles(id),
  created_at      timestamptz not null default now()
);
create index projeto_registros_idx on public.projeto_registros (projeto_id, status);

-- ---------------------------------------------------------------------
-- E. Parceiros (perfil de homologação de uma empresa fornecedora)
-- ---------------------------------------------------------------------
create table public.parceiros (
  id                 uuid primary key default gen_random_uuid(),
  organizacao_id     uuid not null unique references public.organizacoes(id) on delete cascade,
  cidades            text[] not null default '{}',
  especialidades     text[] not null default '{}',
  tipos_projeto      text[] not null default '{}',
  capacidade         text,
  disponibilidade    text not null default 'Disponível' check (disponibilidade in ('Disponível','Parcial','Indisponível')),
  disponivel_a_partir date,
  faixa_preco        text,
  mobilizacao_dias   integer check (mobilizacao_dias >= 0),
  documentacao       text,
  documentos_validade date,
  referencias        text,
  homologacao        text not null default 'Em análise' check (homologacao in ('Em análise','Homologado','Suspenso','Reprovado')),
  ultima_revisao     date,
  observacoes        text,
  created_by         uuid default auth.uid() references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index parceiros_cidades_gin on public.parceiros using gin (cidades);
create index parceiros_esp_gin on public.parceiros using gin (especialidades);
create trigger parceiros_updated before update on public.parceiros
  for each row execute function public.set_updated_at();

-- toda organização "fornecedor" ganha um perfil de parceiro
create or replace function public.org_cria_perfil_parceiro() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if 'fornecedor' = any (new.papeis) then
    insert into public.parceiros (organizacao_id, cidades, especialidades)
    values (new.id,
            case when new.cidade is not null then array[new.cidade] else '{}'::text[] end,
            coalesce(new.categorias_servico, '{}'::text[]))
    on conflict (organizacao_id) do nothing;
  end if;
  return new;
end $$;
create trigger organizacoes_perfil_parceiro after insert or update of papeis on public.organizacoes
  for each row execute function public.org_cria_perfil_parceiro();

insert into public.parceiros (organizacao_id, cidades, especialidades)
select id, case when cidade is not null then array[cidade] else '{}'::text[] end, coalesce(categorias_servico, '{}'::text[])
  from public.organizacoes where 'fornecedor' = any (papeis)
on conflict (organizacao_id) do nothing;

-- parceiros contratados/cotados em um projeto + avaliação de desempenho (notas de 1 a 5)
create table public.projeto_parceiros (
  id                uuid primary key default gen_random_uuid(),
  projeto_id        uuid not null references public.projetos(id) on delete cascade,
  parceiro_id       uuid not null references public.parceiros(id),
  escopo            text,
  status            text not null default 'cotado' check (status in ('cotado','contratado','concluido','cancelado')),
  valor_cotado      numeric(14,2) check (valor_cotado >= 0),
  valor_contratado  numeric(14,2) check (valor_contratado >= 0),
  prazo_cumprido    boolean,
  retrabalho        boolean,
  nota_qualidade    smallint check (nota_qualidade between 1 and 5),
  nota_seguranca    smallint check (nota_seguranca between 1 and 5),
  nota_comunicacao  smallint check (nota_comunicacao between 1 and 5),
  nota_documental   smallint check (nota_documental between 1 and 5),
  nota_geral        smallint check (nota_geral between 1 and 5),
  avaliacao_obs     text,
  avaliado_por      uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  unique (projeto_id, parceiro_id, escopo)
);
create index projeto_parceiros_parceiro_idx on public.projeto_parceiros (parceiro_id);

-- ---------------------------------------------------------------------
-- F. Tarefas ligadas a objetos de negócio
-- ---------------------------------------------------------------------
alter table public.tarefas
  add column if not exists descricao text,
  add column if not exists projeto_id uuid references public.projetos(id) on delete cascade,
  add column if not exists projeto_etapa_id uuid references public.projeto_etapas(id) on delete set null,
  add column if not exists organizacao_id uuid references public.organizacoes(id) on delete cascade,
  add column if not exists prioridade text not null default 'média' check (prioridade in ('baixa','média','alta')),
  add column if not exists data_inicio date,
  add column if not exists tipo text not null default 'tarefa' check (tipo in ('tarefa','aprovacao')),
  add column if not exists bloqueada_por uuid references public.tarefas(id) on delete set null,
  add column if not exists evidencia text;

alter table public.tarefas drop constraint if exists tarefas_status_check;
alter table public.tarefas add constraint tarefas_status_check
  check (status in ('aberta','em_andamento','bloqueada','concluida'));
-- regras (valem para tarefas novas; as antigas não são revalidadas)
alter table public.tarefas add constraint tarefas_vinculo_chk
  check (num_nonnulls(oportunidade_id, contato_id, projeto_id, organizacao_id) >= 1) not valid;
alter table public.tarefas add constraint tarefas_andamento_responsavel_chk
  check (status <> 'em_andamento' or responsavel_id is not null) not valid;
alter table public.tarefas add constraint tarefas_aprovacao_responsavel_chk
  check (tipo <> 'aprovacao' or status <> 'concluida' or responsavel_id is not null) not valid;

create or replace function public.tarefa_regras() returns trigger
language plpgsql as $$
begin
  if new.status in ('em_andamento','concluida') and new.bloqueada_por is not null then
    if exists (select 1 from public.tarefas b where b.id = new.bloqueada_por and b.status <> 'concluida') then
      raise exception 'Esta tarefa depende de outra que ainda não foi concluída.';
    end if;
  end if;
  if new.bloqueada_por is not null and new.bloqueada_por = new.id then
    raise exception 'Uma tarefa não pode depender de si mesma.';
  end if;
  if new.status = 'concluida' then
    if new.concluida_em is null then new.concluida_em := now(); end if;
  else
    new.concluida_em := null;
  end if;
  return new;
end $$;
create trigger tarefas_regras before insert or update on public.tarefas
  for each row execute function public.tarefa_regras();
create index tarefas_projeto_idx on public.tarefas (projeto_id) where status <> 'concluida';

-- ---------------------------------------------------------------------
-- G. Documentos (arquivo no Storage ou link) com versão e aprovação
-- ---------------------------------------------------------------------
create table public.documentos (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  tipo             text not null default 'Outro' check (tipo in (
                     'Proposta','Contrato','Planta / layout','Projeto técnico','Orçamento / cotação',
                     'Documento de fornecedor','ART / RRT','Foto de vistoria','Checklist / termo de aceite',
                     'Manual / garantia','Aditivo / aprovação','Outro')),
  organizacao_id   uuid references public.organizacoes(id) on delete cascade,
  oportunidade_id  uuid references public.oportunidades(id) on delete cascade,
  projeto_id       uuid references public.projetos(id) on delete cascade,
  versao           integer not null default 1,
  substitui_id     uuid references public.documentos(id) on delete set null,
  status_aprovacao text not null default 'Rascunho'
                     check (status_aprovacao in ('Rascunho','Em aprovação','Aprovado','Reprovado','Obsoleto')),
  validade         date,
  arquivo_path     text,
  arquivo_nome     text,
  url              text,
  observacoes      text,
  enviado_por      uuid default auth.uid() references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (num_nonnulls(organizacao_id, oportunidade_id, projeto_id) >= 1),
  check (arquivo_path is not null or url is not null)
);
create index documentos_projeto_idx on public.documentos (projeto_id);
create index documentos_opp_idx on public.documentos (oportunidade_id);
create index documentos_org_idx on public.documentos (organizacao_id);
create trigger documentos_updated before update on public.documentos
  for each row execute function public.set_updated_at();

-- decisão pode citar o documento em que se baseou
alter table public.projeto_registros
  add column documento_id uuid references public.documentos(id) on delete set null;

-- ---------------------------------------------------------------------
-- H. Histórico de alterações
-- ---------------------------------------------------------------------
create table public.activity_log (
  id              bigint generated always as identity primary key,
  tabela          text not null,
  registro_id     uuid not null,
  rotulo          text,
  acao            text not null check (acao in ('criado','alterado','excluído')),
  mudancas        jsonb,
  usuario_id      uuid,
  organizacao_id  uuid,
  oportunidade_id uuid,
  projeto_id      uuid,
  em              timestamptz not null default now()
);
create index activity_log_opp_idx  on public.activity_log (oportunidade_id, em desc) where oportunidade_id is not null;
create index activity_log_proj_idx on public.activity_log (projeto_id, em desc) where projeto_id is not null;
create index activity_log_org_idx  on public.activity_log (organizacao_id, em desc) where organizacao_id is not null;

create or replace function public.log_alteracao() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb; v_new jsonb; v_row jsonb; v_mud jsonb := '{}'::jsonb; k text;
  v_acao text;
  v_ignorar text[] := array['updated_at','created_at','created_by','etapa_atualizada_em','prioridade','concluida_em'];
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old); v_acao := 'excluído';
  else
    v_row := to_jsonb(new);
    v_acao := case tg_op when 'INSERT' then 'criado' else 'alterado' end;
  end if;
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old); v_new := v_row;
    for k in select jsonb_object_keys(v_new) loop
      continue when k = any (v_ignorar);
      if v_new -> k is distinct from v_old -> k then
        v_mud := v_mud || jsonb_build_object(k, jsonb_build_array(v_old -> k, v_new -> k));
      end if;
    end loop;
    if v_mud = '{}'::jsonb then return null; end if;
  end if;
  insert into public.activity_log (tabela, registro_id, rotulo, acao, mudancas, usuario_id,
                                   organizacao_id, oportunidade_id, projeto_id)
  values (
    tg_table_name, (v_row ->> 'id')::uuid,
    left(coalesce(v_row ->> 'titulo', v_row ->> 'nome', v_row ->> 'descricao', tg_table_name), 200),
    v_acao, nullif(v_mud, '{}'::jsonb), auth.uid(),
    case when tg_table_name = 'organizacoes' then (v_row ->> 'id')::uuid else (v_row ->> 'organizacao_id')::uuid end,
    case when tg_table_name = 'oportunidades' then (v_row ->> 'id')::uuid else (v_row ->> 'oportunidade_id')::uuid end,
    case when tg_table_name = 'projetos' then (v_row ->> 'id')::uuid else (v_row ->> 'projeto_id')::uuid end
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['organizacoes','oportunidades','projetos','projeto_etapas','projeto_registros',
                           'projeto_parceiros','parceiros','documentos','tarefas'] loop
    execute format('create trigger %1$s_log after insert or update or delete on public.%1$I
                    for each row execute function public.log_alteracao()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Gerar projeto a partir de oportunidade ganha (copia o que já se sabe)
-- ---------------------------------------------------------------------
create or replace function public.criar_projeto_da_oportunidade(p_oportunidade uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare o public.oportunidades%rowtype; v_id uuid; v_prem text;
begin
  if not public.tem_papel('comercial','projetos','engenharia') then
    raise exception 'Seu papel não permite gerar projetos.';
  end if;
  select * into o from public.oportunidades where id = p_oportunidade;
  if not found then raise exception 'Oportunidade não encontrada.'; end if;
  if o.status <> 'ganha' then raise exception 'Somente oportunidades ganhas geram projeto.'; end if;
  if exists (select 1 from public.projetos where oportunidade_id = p_oportunidade) then
    raise exception 'Esta oportunidade já gerou um projeto.';
  end if;
  v_prem := concat_ws('; ',
    case when o.area_m2 is not null then 'Área: ' || o.area_m2 || ' m²' end,
    case when o.posicoes is not null then 'Posições de trabalho: ' || o.posicoes end,
    case when o.padrao is not null then 'Padrão: ' || o.padrao end,
    case when o.estado_imovel is not null then 'Imóvel: ' || o.estado_imovel end,
    case when o.classe_predio is not null then 'Classe do prédio: ' || o.classe_predio end,
    case when o.prazo_contrato_meses is not null then 'Prazo do contrato: ' || o.prazo_contrato_meses || ' meses' end,
    case when o.urgencia is not null then 'Urgência: ' || o.urgencia end);
  insert into public.projetos (nome, cliente_id, oportunidade_id, tipo, cidade, premissas, gerente_id)
  values (o.titulo, o.cliente_final_id, o.id, o.tipo_servico, o.cidade, nullif(v_prem, ''), o.responsavel_id)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- RLS
--   leitura: todos os autenticados
--   projetos/etapas/registros/parceiros contratados: escrevem gestor, projetos, engenharia, facilities
--   parceiros (perfil): + comercial     documentos: qualquer um cria; dono ou gestor exclui
--   projeto novo a partir de oportunidade: função criar_projeto_da_oportunidade
-- ---------------------------------------------------------------------
alter table public.projetos          enable row level security;
alter table public.projeto_etapas    enable row level security;
alter table public.projeto_registros enable row level security;
alter table public.projeto_parceiros enable row level security;
alter table public.parceiros         enable row level security;
alter table public.documentos        enable row level security;
alter table public.activity_log      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['projetos','projeto_etapas','projeto_registros','projeto_parceiros','parceiros','documentos','activity_log'] loop
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (true)', t);
  end loop;
  foreach t in array array['projetos','projeto_etapas','projeto_registros','projeto_parceiros'] loop
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (public.tem_papel(''projetos'',''engenharia'',''facilities''))', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (public.tem_papel(''projetos'',''engenharia'',''facilities'')) with check (public.tem_papel(''projetos'',''engenharia'',''facilities''))', t);
  end loop;
end $$;
create policy projetos_delete          on public.projetos          for delete to authenticated using (public.is_gestor());
create policy projeto_etapas_delete    on public.projeto_etapas    for delete to authenticated using (public.is_gestor());
create policy projeto_registros_delete on public.projeto_registros for delete to authenticated using (public.tem_papel('projetos','engenharia','facilities'));
create policy projeto_parceiros_delete on public.projeto_parceiros for delete to authenticated using (public.tem_papel('projetos','engenharia','facilities'));

create policy parceiros_insert on public.parceiros for insert to authenticated with check (public.tem_papel('comercial','projetos','engenharia','facilities'));
create policy parceiros_update on public.parceiros for update to authenticated using (public.tem_papel('comercial','projetos','engenharia','facilities')) with check (public.tem_papel('comercial','projetos','engenharia','facilities'));
create policy parceiros_delete on public.parceiros for delete to authenticated using (public.is_gestor());

create policy documentos_insert on public.documentos for insert to authenticated with check (true);
create policy documentos_update on public.documentos for update to authenticated
  using (enviado_por = auth.uid() or public.tem_papel('projetos','engenharia')) with check (true);
create policy documentos_delete on public.documentos for delete to authenticated
  using (enviado_por = auth.uid() or public.is_gestor());

-- tarefas são trabalho do dia a dia: qualquer usuário pode excluir
drop policy if exists "tarefas_delete" on public.tarefas;
create policy "tarefas_delete" on public.tarefas for delete to authenticated using (true);

-- ---------------------------------------------------------------------
-- Storage: bucket privado "documentos" (ignorado fora do Supabase)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('documentos', 'documentos', false)
      on conflict (id) do nothing;
    execute 'drop policy if exists "documentos_storage_select" on storage.objects';
    execute 'drop policy if exists "documentos_storage_insert" on storage.objects';
    execute 'drop policy if exists "documentos_storage_delete" on storage.objects';
    execute $p$create policy "documentos_storage_select" on storage.objects for select to authenticated using (bucket_id = 'documentos')$p$;
    execute $p$create policy "documentos_storage_insert" on storage.objects for insert to authenticated with check (bucket_id = 'documentos')$p$;
    execute $p$create policy "documentos_storage_delete" on storage.objects for delete to authenticated using (bucket_id = 'documentos' and (owner = auth.uid() or public.is_gestor()))$p$;
  end if;
exception when others then
  raise notice 'Storage não configurado automaticamente (%). Crie o bucket privado "documentos" em Storage e permita acesso a usuários autenticados.', sqlerrm;
end $$;
