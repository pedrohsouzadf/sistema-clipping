-- =====================================================================
-- Clip CRM — migration 0001 (fase 2: CRM + funil)
-- Regras de negócio no banco (valem mesmo fora da tela):
--   • Clip não vende diretamente (como operadora) para empresa atendida pela Woba
--   • Demanda vinda da Woba entra a partir da etapa 4 e herda comissão do canal
--   • Fechamento exige resultado (ganha/perdida) e motivo quando perdida
--   • Perfis: gestor (tudo) e comercial (sem exclusão / sem gerir perfis)
-- =====================================================================

-- ---------- utilitários ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- perfis ----------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text,
  email      text,
  role       text not null default 'comercial' check (role in ('gestor','comercial')),
  created_at timestamptz not null default now()
);

-- O primeiro usuário cadastrado vira gestor; os demais entram como comercial.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.email,
    case when exists (select 1 from public.profiles) then 'comercial' else 'gestor' end
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_gestor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'gestor');
$$;

-- impede que um comercial altere o próprio papel
create or replace function public.profiles_protege_role() returns trigger
language plpgsql as $$
begin
  if new.role is distinct from old.role and not public.is_gestor() then
    raise exception 'Somente o gestor pode alterar perfis de acesso.';
  end if;
  return new;
end $$;

create trigger profiles_protege_role
  before update on public.profiles
  for each row execute function public.profiles_protege_role();

-- ---------- organizações (parceiros, clientes finais, prospects, fornecedores...) ----------
create table public.organizacoes (
  id                  uuid primary key default gen_random_uuid(),
  nome                text not null,
  categoria           text check (categoria in (
                        'Proprietário ou gestor de imóveis',
                        'Consultoria ou corretora imobiliária',
                        'Coworking ou escritório flexível',
                        'Obras, fit-out ou engenharia',
                        'Facilities',
                        'Potencial cliente corporativo')),
  papeis              text[] not null default '{}'
                        check (papeis <@ array['parceiro','cliente_final','prospect','fornecedor','concorrente']::text[]),
  relacao_com_clip    text not null default 'A definir'
                        check (relacao_com_clip in ('Pode contratar','Pode indicar','Pode fornecer','Concorrente','A definir')),
  -- regra Woba: 'Sim' bloqueia venda direta pela Clip; 'Validar' bloqueia avanço após a etapa 1
  atendida_woba       text not null default 'Validar' check (atendida_woba in ('Sim','Não','Validar')),
  comissao_padrao_pct numeric(5,2) check (comissao_padrao_pct between 0 and 100), -- canais (Woba = 16)
  setor               text,
  regiao              text,
  cidade              text,
  porte               text,
  papel_na_cadeia     text,
  servicos            text,
  categorias_servico  text[] not null default '{}',   -- para fornecedores (civil, elétrica...)
  contato_principal   text,
  fonte_informacao    text,
  data_pesquisa       date,
  observacoes         text,
  created_by          uuid default auth.uid() references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index organizacoes_nome_uq on public.organizacoes (lower(nome));
create index organizacoes_papeis_gin on public.organizacoes using gin (papeis);
create trigger organizacoes_updated before update on public.organizacoes
  for each row execute function public.set_updated_at();

-- ---------- contatos (networking) ----------
create table public.contatos (
  id                            uuid primary key default gen_random_uuid(),
  organizacao_id                uuid references public.organizacoes(id) on delete set null,
  nome                          text not null,
  cargo                         text,
  email                         text,
  telefone                      text,
  contexto                      text,         -- evento ou indicação
  data_contato                  date,
  assunto                       text,
  classificacao                 text check (classificacao in ('Potencial cliente','Parceiro','Fornecedor','Fonte de conhecimento')),
  mensagem_continuidade_enviada boolean not null default false,
  data_envio                    date,
  resposta                      text,
  proximo_passo                 text,
  proximo_passo_data            date,
  ultima_interacao              timestamptz,
  observacoes                   text,
  created_by                    uuid default auth.uid() references public.profiles(id),
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);
create index contatos_org_idx on public.contatos (organizacao_id);
create trigger contatos_updated before update on public.contatos
  for each row execute function public.set_updated_at();

-- ---------- etapas do funil e playbook ----------
create table public.etapas (
  id                    smallint primary key,
  nome                  text not null,
  descricao             text,
  criterio_avanco       text,
  apenas_origem_direta  boolean not null default false,
  prazo_alvo_dias       integer
);

create table public.playbook_itens (
  id          uuid primary key default gen_random_uuid(),
  etapa_id    smallint not null references public.etapas(id) on delete cascade,
  ordem       smallint not null,
  tipo        text not null check (tipo in ('pergunta','documento','tarefa')),
  texto       text not null,
  obrigatorio boolean not null default true
);
create index playbook_etapa_idx on public.playbook_itens (etapa_id, ordem);

-- ---------- oportunidades ----------
create table public.oportunidades (
  id                  uuid primary key default gen_random_uuid(),
  titulo              text not null,
  cliente_final_id    uuid not null references public.organizacoes(id),
  canal_id            uuid references public.organizacoes(id),     -- parceiro que originou (ex.: Woba)
  contratante_id      uuid references public.organizacoes(id),     -- quem contrata a Clip
  origem              text not null default 'Prospecção direta'
                        check (origem in ('Prospecção direta','Woba','Indicação','Evento','Outro')),
  modelo_atuacao      text not null default 'operador' check (modelo_atuacao in ('operador','outros')),
  etapa_id            smallint not null default 1 references public.etapas(id),
  status              text not null default 'aberta' check (status in ('aberta','ganha','perdida')),
  motivo_perda        text,
  -- sinal / qualificação
  sinal_oportunidade  text,
  fonte_sinal         text,
  necessidade_provavel text,
  decisores           text,
  potencial           text check (potencial in ('Alto','Médio','Baixo')),
  evidencia           text check (evidencia in ('Forte','Média','Fraca')),
  prioridade          text generated always as (
                        case when potencial is null or evidencia is null then null
                             when potencial = 'Alto' and evidencia = 'Forte' then '1 - Alta'
                             when potencial = 'Alto' or evidencia = 'Forte' then '2 - Média'
                             else '3 - Baixa' end) stored,
  prazo_estimado      text,
  -- briefing
  cidade              text,
  area_m2             numeric(10,2),
  posicoes            integer,
  padrao              text check (padrao in ('Essential','Comfort','Premium')),
  estado_imovel       text check (estado_imovel in ('Semi-pronto','Laje nova')),
  classe_predio       text check (classe_predio in ('AAA','A','B','C')),
  prazo_contrato_meses integer check (prazo_contrato_meses in (24,36,60,120)),
  urgencia            text check (urgencia in ('Até 3 meses','De 3 a 6 meses','De 6 a 12 meses','Só pesquisando')),
  ja_tem_imovel       text check (ja_tem_imovel in ('Não, precisa de ajuda','Sim, já escolhido','Sim, já ocupa e quer reformar')),
  -- comercial (opcional / informativo)
  mensalidade_estimada numeric(14,2),
  comissao_canal_pct  numeric(5,2) check (comissao_canal_pct between 0 and 100),
  -- acompanhamento
  proximo_passo       text,
  proximo_passo_data  date,
  responsavel_id      uuid references public.profiles(id),
  etapa_atualizada_em timestamptz not null default now(),
  fechada_em          timestamptz,
  observacoes         text,
  created_by          uuid default auth.uid() references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index oportunidades_etapa_idx   on public.oportunidades (etapa_id) where status = 'aberta';
create index oportunidades_cliente_idx on public.oportunidades (cliente_final_id);
create index oportunidades_canal_idx   on public.oportunidades (canal_id);

create or replace function public.oportunidade_regras() returns trigger
language plpgsql as $$
declare
  v_cli        public.organizacoes%rowtype;
  v_canal      public.organizacoes%rowtype;
  v_woba       uuid;
  v_verificar  boolean;
begin
  select * into v_cli from public.organizacoes where id = new.cliente_final_id;

  -- 1) Demanda recebida da Woba: canal/contratante preenchidos e entrada na etapa 4
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
    if new.etapa_id < 4 then
      if tg_op = 'INSERT' then
        new.etapa_id := 4;
      else
        raise exception 'Demandas recebidas da Woba entram a partir da etapa 4 (Briefing e qualificação).';
      end if;
    end if;
  end if;

  -- 2) Comissão herdada do canal (ex.: Woba = 16% sobre a mensalidade total)
  if new.canal_id is not null and new.comissao_canal_pct is null then
    select * into v_canal from public.organizacoes where id = new.canal_id;
    new.comissao_canal_pct := v_canal.comissao_padrao_pct;
  end if;

  -- 3) Trava Woba — só ao criar ou ao mudar origem, cliente, modelo ou etapa
  v_verificar := tg_op = 'INSERT'
    or new.origem          is distinct from old.origem
    or new.cliente_final_id is distinct from old.cliente_final_id
    or new.modelo_atuacao  is distinct from old.modelo_atuacao
    or new.etapa_id        is distinct from old.etapa_id;

  if v_verificar and new.modelo_atuacao = 'operador' and new.origem <> 'Woba' then
    if v_cli.atendida_woba = 'Sim' then
      raise exception 'Cliente atendido pela Woba: a Clip não pode vender diretamente como operadora. Registre a demanda com origem Woba.';
    elsif v_cli.atendida_woba = 'Validar' and new.etapa_id > 1 then
      raise exception 'Confirme com a Woba se esta empresa é atendida por ela antes de avançar da etapa 1.';
    end if;
  end if;

  -- 4) Fechamento: etapa 8 <=> resultado ganha/perdida
  if new.status in ('ganha','perdida') then
    new.etapa_id := 8;
    if new.status = 'perdida' and coalesce(btrim(new.motivo_perda), '') = '' then
      raise exception 'Informe o motivo da perda.';
    end if;
    if new.fechada_em is null then new.fechada_em := now(); end if;
  else
    if new.etapa_id = 8 then
      raise exception 'A etapa 8 exige um resultado (ganha ou perdida). Para reabrir, escolha uma etapa anterior.';
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

create trigger oportunidades_regras
  before insert or update on public.oportunidades
  for each row execute function public.oportunidade_regras();
create trigger oportunidades_updated before update on public.oportunidades
  for each row execute function public.set_updated_at();
-- nomes ordenam 'oportunidades_regras' antes de 'oportunidades_updated'

-- checklist do playbook por oportunidade
create table public.oportunidade_checklist (
  oportunidade_id uuid not null references public.oportunidades(id) on delete cascade,
  item_id         uuid not null references public.playbook_itens(id) on delete cascade,
  feito           boolean not null default true,
  nota            text,
  feito_por       uuid default auth.uid() references public.profiles(id),
  feito_em        timestamptz not null default now(),
  primary key (oportunidade_id, item_id)
);

-- ---------- interações (histórico) ----------
create table public.interacoes (
  id              uuid primary key default gen_random_uuid(),
  oportunidade_id uuid references public.oportunidades(id) on delete cascade,
  contato_id      uuid references public.contatos(id) on delete cascade,
  organizacao_id  uuid references public.organizacoes(id) on delete cascade,
  tipo            text not null default 'reunião'
                    check (tipo in ('reunião','mensagem','e-mail','ligação','evento','outro')),
  data            timestamptz not null default now(),
  resumo          text not null,
  proximo_passo   text,
  created_by      uuid default auth.uid() references public.profiles(id),
  created_at      timestamptz not null default now(),
  check (oportunidade_id is not null or contato_id is not null or organizacao_id is not null)
);
create index interacoes_opp_idx     on public.interacoes (oportunidade_id, data desc);
create index interacoes_contato_idx on public.interacoes (contato_id, data desc);

create or replace function public.interacao_atualiza_contato() returns trigger
language plpgsql as $$
begin
  if new.contato_id is not null then
    update public.contatos set ultima_interacao = new.data
     where id = new.contato_id and (ultima_interacao is null or ultima_interacao < new.data);
  end if;
  return new;
end $$;
create trigger interacoes_atualiza_contato after insert on public.interacoes
  for each row execute function public.interacao_atualiza_contato();

-- ---------- tarefas / próximos passos ----------
create table public.tarefas (
  id              uuid primary key default gen_random_uuid(),
  titulo          text not null,
  oportunidade_id uuid references public.oportunidades(id) on delete cascade,
  contato_id      uuid references public.contatos(id) on delete cascade,
  responsavel_id  uuid references public.profiles(id),
  prazo           date,
  status          text not null default 'aberta' check (status in ('aberta','concluida')),
  concluida_em    timestamptz,
  created_by      uuid default auth.uid() references public.profiles(id),
  created_at      timestamptz not null default now()
);
create index tarefas_abertas_idx on public.tarefas (prazo) where status = 'aberta';

-- ---------- pendências (cliente / canal / Clip) ----------
create table public.pendencias (
  id              uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references public.oportunidades(id) on delete cascade,
  descricao       text not null,
  dono            text not null default 'Cliente' check (dono in ('Clip','Cliente','Canal')),
  prazo           date,
  status          text not null default 'aberta' check (status in ('aberta','respondida','fechada')),
  resposta        text,
  created_by      uuid default auth.uid() references public.profiles(id),
  created_at      timestamptz not null default now()
);
create index pendencias_opp_idx on public.pendencias (oportunidade_id);

-- ---------- propostas versionadas ----------
create table public.propostas (
  id              uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references public.oportunidades(id) on delete cascade,
  versao          integer not null,
  data_emissao    date not null default current_date,
  validade        date,
  mensalidade     numeric(14,2),
  comissao_pct    numeric(5,2) check (comissao_pct between 0 and 100),
  -- receita líquida da Clip = mensalidade total menos a comissão do canal
  valor_liquido   numeric(14,2) generated always as
                    (round(mensalidade * (1 - coalesce(comissao_pct, 0) / 100), 2)) stored,
  status          text not null default 'rascunho'
                    check (status in ('rascunho','enviada','em validação','revisão','aceita','expirada')),
  observacoes     text,
  created_by      uuid default auth.uid() references public.profiles(id),
  created_at      timestamptz not null default now(),
  unique (oportunidade_id, versao)
);

-- versão (1, 2, 3...) e comissão herdada da oportunidade; o trigger BEFORE roda
-- antes da checagem de NOT NULL, então o cliente pode inserir sem informar a versão.
create or replace function public.proposta_defaults() returns trigger
language plpgsql as $$
begin
  if new.versao is null then
    select coalesce(max(versao), 0) + 1 into new.versao
      from public.propostas where oportunidade_id = new.oportunidade_id;
  end if;
  if new.comissao_pct is null then
    select comissao_canal_pct into new.comissao_pct
      from public.oportunidades where id = new.oportunidade_id;
  end if;
  return new;
end $$;
create trigger propostas_defaults before insert on public.propostas
  for each row execute function public.proposta_defaults();

-- =====================================================================
-- Dados de referência: etapas do funil (proposta v0.1) e playbook
-- =====================================================================
insert into public.etapas (id, nome, descricao, criterio_avanco, apenas_origem_direta, prazo_alvo_dias) values
 (1, 'Mapeada',                   'Empresa mapeada como possível cliente (somente prospecção direta).',
      'Empresa confirmada como NÃO atendida pela Woba; sinal de oportunidade e evidência registrados.', true, 7),
 (2, 'Contato iniciado',          'Primeiro contato com a empresa.',
      'Decisor identificado e primeiro contato realizado.', true, 7),
 (3, 'Conversa exploratória',     'Entender a dor, o comprador e o momento da empresa.',
      'Dor/necessidade validada e comprador/decisor mapeado.', true, 14),
 (4, 'Briefing e qualificação',   'Levantar o briefing completo. Demandas da Woba entram aqui.',
      'Briefing completo e viabilidade confirmada.', false, 14),
 (5, 'Estudo e simulação',        'Visita ao imóvel, test fit e simulação de preço.',
      'Imóvel avaliado, test fit feito e simulação registrada.', false, 21),
 (6, 'Proposta enviada',          'Proposta emitida com validade (à Woba, quando via Woba).',
      'Proposta emitida e enviada.', false, 7),
 (7, 'Validação e negociação',    'Rodadas de revisão com cliente/Woba e negociação das condições.',
      'Condições acordadas e pendências fechadas.', false, 30),
 (8, 'Fechada (ganha / perdida)', 'Contrato assinado (ganha) ou oportunidade encerrada (perdida, com motivo).',
      null, false, null);

insert into public.playbook_itens (etapa_id, ordem, tipo, texto, obrigatorio) values
 (1, 1, 'pergunta',  'A empresa foi confirmada como NÃO atendida pela Woba?', true),
 (1, 2, 'pergunta',  'Sinal de oportunidade e fonte registrados (imóvel vago não é cliente interessado — registre a evidência)', true),
 (1, 3, 'pergunta',  'Potencial e evidência classificados', true),
 (2, 1, 'tarefa',    'Identificar o decisor (cargo e contato)', true),
 (2, 2, 'tarefa',    'Realizar o primeiro contato', true),
 (3, 1, 'pergunta',  'Dor/necessidade validada com a empresa', true),
 (3, 2, 'pergunta',  'Comprador e decisor mapeados', true),
 (3, 3, 'pergunta',  'Momento e prazo da empresa entendidos', false),
 (4, 1, 'pergunta',  'Cidade/região do projeto', true),
 (4, 2, 'pergunta',  'Metragem ou número de posições de trabalho', true),
 (4, 3, 'pergunta',  'Padrão desejado (Essential / Comfort / Premium)', true),
 (4, 4, 'pergunta',  'Estado do imóvel (semi-pronto / laje nova) e se já tem imóvel', true),
 (4, 5, 'pergunta',  'Classe do prédio (AAA / A / B / C)', false),
 (4, 6, 'pergunta',  'Prazo do contrato (24 / 36 / 60 / 120 meses)', true),
 (4, 7, 'pergunta',  'Quando precisa ocupar (urgência)', true),
 (4, 8, 'pergunta',  'Horário de operação e ocupação prevista (registrar a fonte da premissa)', true),
 (4, 9, 'pergunta',  'Programa de ambientes', false),
 (4, 10,'pergunta',  'O que fica dentro e fora do escopo e quem responde por cada item', true),
 (4, 11,'pergunta',  'Requisitos de TI do cliente', false),
 (4, 12,'pergunta',  'Canal de origem e cliente final registrados', true),
 (5, 1, 'tarefa',    'Visita técnica e levantamento do imóvel', true),
 (5, 2, 'tarefa',    'Test fit (estudo de ocupação)', true),
 (5, 3, 'tarefa',    'Rodar a simulação de preço (cenários) e registrar as premissas', true),
 (6, 1, 'tarefa',    'Emitir a proposta (versão, validade, valor bruto e líquido de comissão)', true),
 (6, 2, 'documento', 'Anexos técnicos da proposta', false),
 (6, 3, 'tarefa',    'Enviar a proposta (à Woba, quando a demanda veio por ela)', true),
 (7, 1, 'tarefa',    'Registrar pendências com dono e prazo (cliente / Woba / Clip)', true),
 (7, 2, 'tarefa',    'Registrar cada rodada de revisão da proposta', false),
 (7, 3, 'pergunta',  'Condições comerciais acordadas', true),
 (8, 1, 'documento', 'Contrato assinado', true),
 (8, 2, 'documento', 'Documentos do imóvel reunidos (matrícula, IPTU, laudo, AVCB/PPCI quando houver)', false),
 (8, 3, 'tarefa',    'Abrir a Operação (cronograma-modelo, fornecedores, checklist de entrega)', false);

-- =====================================================================
-- RLS — todos os usuários autenticados leem e escrevem; só o gestor exclui
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['organizacoes','contatos','oportunidades','oportunidade_checklist',
                           'interacoes','tarefas','pendencias','propostas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (true)', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (true) with check (true)', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (public.is_gestor())', t);
  end loop;
end $$;

-- referência: leitura para todos; edição só do gestor
alter table public.etapas         enable row level security;
alter table public.playbook_itens enable row level security;
create policy etapas_select   on public.etapas         for select to authenticated using (true);
create policy etapas_gestor   on public.etapas         for all    to authenticated using (public.is_gestor()) with check (public.is_gestor());
create policy playbook_select on public.playbook_itens for select to authenticated using (true);
create policy playbook_gestor on public.playbook_itens for all    to authenticated using (public.is_gestor()) with check (public.is_gestor());

-- perfis
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_gestor()) with check (id = auth.uid() or public.is_gestor());
