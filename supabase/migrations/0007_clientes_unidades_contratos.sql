-- =====================================================================
-- 0007 — Clientes, unidades e contratos (Módulo 3)
--   Cliente, unidade física, contrato e projeto são coisas diferentes:
--   um cliente tem várias unidades; um contrato cobre uma ou mais unidades
--   do mesmo cliente; um projeto de implantação pode ser de uma unidade só.
--   A. Cliente: status do relacionamento e contato decisor
--   B. Unidades (e fornecedores vinculados)
--   C. Contratos (e unidades cobertas)
--   D. Vínculos: projetos e documentos com unidade/contrato
--   E. Histórico de alterações para os novos objetos
--   F. Permissões (RLS)
-- Rode depois das migrations 0001 a 0006.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. Cliente
-- ---------------------------------------------------------------------
alter table public.organizacoes
  add column if not exists status_relacionamento text
    check (status_relacionamento in ('Prospect','Em negociação','Ativo','Em pausa','Encerrado'));
update public.organizacoes set status_relacionamento = 'Prospect'
 where status_relacionamento is null and 'cliente' = any (papeis);

alter table public.contatos add column if not exists decisor boolean not null default false;

-- ---------------------------------------------------------------------
-- B. Unidades
-- ---------------------------------------------------------------------
create table public.unidades (
  id                   uuid primary key default gen_random_uuid(),
  cliente_id           uuid not null references public.organizacoes(id) on delete cascade,
  nome                 text not null,
  endereco             text,                      -- endereço completo
  cidade               text,
  estado               text check (estado is null or char_length(estado) = 2),
  tipo_operacao        text check (tipo_operacao in ('Escritório','Centro de recrutamento','Treinamento','Galpão','Outro')),
  capacidade_pessoas   integer check (capacidade_pessoas > 0),
  area_m2              numeric(12,2) check (area_m2 > 0),
  proprietario         text,                      -- dono do imóvel
  locatario_contratual text,                      -- quem assina a locação
  situacao             text not null default 'Em estudo' check (situacao in ('Em estudo','Em implantação','Ativo','Encerrado')),
  requisitos_infra     text,
  servicos_contratados text,
  responsaveis_locais  text,
  observacoes          text,
  created_by           uuid default auth.uid() references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index unidades_cliente_nome_uq on public.unidades (cliente_id, lower(nome));
create index unidades_situacao_idx on public.unidades (situacao);
create trigger unidades_updated before update on public.unidades
  for each row execute function public.set_updated_at();

-- fornecedores vinculados a uma unidade (empresas com tipo Fornecedor)
create table public.unidade_fornecedores (
  id            uuid primary key default gen_random_uuid(),
  unidade_id    uuid not null references public.unidades(id) on delete cascade,
  fornecedor_id uuid not null references public.organizacoes(id) on delete cascade,
  servico       text,
  observacoes   text,
  created_at    timestamptz not null default now(),
  unique (unidade_id, fornecedor_id)
);

-- ---------------------------------------------------------------------
-- C. Contratos
-- ---------------------------------------------------------------------
create table public.contratos (
  id                        uuid primary key default gen_random_uuid(),
  titulo                    text not null,
  cliente_id                uuid not null references public.organizacoes(id),
  contratante_id            uuid references public.organizacoes(id),   -- quando quem assina não é o cliente final (ex.: Woba)
  oportunidade_id           uuid references public.oportunidades(id) on delete set null,
  responsavel_id            uuid references public.profiles(id),
  tipo                      text not null check (tipo in ('OaaS','BTS','Turnkey','Fit-out','Facilities','Combinação')),
  tipo_detalhe              text,                                      -- quais tipos, quando "Combinação"
  status                    text not null default 'Rascunho' check (status in ('Rascunho','Em negociação','Vigente','Encerrado','Rescindido')),
  data_assinatura           date,
  data_inicio               date,
  data_fim                  date,
  renovacao                 text check (renovacao in ('Automática','Manual','Sem renovação')),
  aviso_dias                integer not null default 90 check (aviso_dias >= 0),   -- antecedência do alerta de vencimento
  valor_mensal              numeric(14,2) check (valor_mensal >= 0),
  valor_total               numeric(14,2) check (valor_total >= 0),
  reajuste_indice           text check (reajuste_indice in ('IPCA','IGP-M','INPC','Fixo','Outro')),
  reajuste_percentual       numeric(6,2) check (reajuste_percentual >= 0),
  reajuste_data_base        date,                                      -- próximo reajuste
  condicoes_pagamento       text,
  escopo_incluido           text,
  itens_excluidos           text,
  obrigacoes_clip           text,
  obrigacoes_cliente        text,
  obrigacoes_proprietario   text,
  obrigacoes_terceiros      text,
  sla                       text,
  criterios_aceite          text,
  regras_alteracao_escopo   text,
  regras_saida_antecipada   text,
  observacoes               text,
  created_by                uuid default auth.uid() references public.profiles(id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  check (data_fim is null or data_inicio is null or data_fim >= data_inicio)
);
create index contratos_cliente_idx on public.contratos (cliente_id);
create index contratos_status_idx on public.contratos (status);
create trigger contratos_updated before update on public.contratos
  for each row execute function public.set_updated_at();

-- unidades cobertas por cada contrato (um contrato pode cobrir várias; uma unidade pode ter vários contratos)
create table public.contrato_unidades (
  id          uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  unidade_id  uuid not null references public.unidades(id) on delete cascade,
  unique (contrato_id, unidade_id)
);
create index contrato_unidades_unidade_idx on public.contrato_unidades (unidade_id);

-- regras do contrato
create or replace function public.contrato_regras() returns trigger
language plpgsql as $$
begin
  if new.status = 'Vigente' and new.data_inicio is null then
    raise exception 'Informe a data de início para um contrato vigente.';
  end if;
  if new.status = 'Vigente' and new.data_fim is not null and new.data_fim < current_date and tg_op = 'INSERT' then
    raise exception 'A data de término já passou: registre o contrato como Encerrado.';
  end if;
  return new;
end $$;
create trigger contratos_regras before insert or update on public.contratos
  for each row execute function public.contrato_regras();

-- contrato vigente torna o cliente "Ativo"
create or replace function public.contrato_ativa_cliente() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'Vigente' then
    update public.organizacoes set status_relacionamento = 'Ativo'
     where id = new.cliente_id and status_relacionamento is distinct from 'Ativo';
  end if;
  return null;
end $$;
create trigger contratos_ativa_cliente after insert or update of status on public.contratos
  for each row execute function public.contrato_ativa_cliente();

-- o contrato só cobre unidades do próprio cliente
create or replace function public.contrato_unidade_regras() returns trigger
language plpgsql as $$
begin
  if (select cliente_id from public.contratos where id = new.contrato_id)
     is distinct from (select cliente_id from public.unidades where id = new.unidade_id) then
    raise exception 'A unidade pertence a outro cliente: um contrato só cobre unidades do próprio cliente.';
  end if;
  return new;
end $$;
create trigger contrato_unidades_regras before insert or update on public.contrato_unidades
  for each row execute function public.contrato_unidade_regras();

-- ---------------------------------------------------------------------
-- D. Vínculos de projetos e documentos
-- ---------------------------------------------------------------------
alter table public.projetos add column if not exists unidade_id uuid references public.unidades(id) on delete set null;
create index projetos_unidade_idx on public.projetos (unidade_id) where unidade_id is not null;

alter table public.documentos
  add column if not exists contrato_id uuid references public.contratos(id) on delete cascade,
  add column if not exists unidade_id  uuid references public.unidades(id) on delete cascade;
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.documentos'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%num_nonnulls%' loop
    execute format('alter table public.documentos drop constraint %I', c);
  end loop;
end $$;
alter table public.documentos add constraint documentos_vinculo_chk
  check (num_nonnulls(organizacao_id, oportunidade_id, projeto_id, contrato_id, unidade_id) >= 1);
create index documentos_contrato_idx on public.documentos (contrato_id) where contrato_id is not null;
create index documentos_unidade_idx on public.documentos (unidade_id) where unidade_id is not null;

-- ---------------------------------------------------------------------
-- E. Histórico de alterações
-- ---------------------------------------------------------------------
alter table public.activity_log
  add column if not exists contrato_id uuid,
  add column if not exists unidade_id  uuid;
create index activity_log_contrato_idx on public.activity_log (contrato_id, em desc) where contrato_id is not null;
create index activity_log_unidade_idx  on public.activity_log (unidade_id, em desc) where unidade_id is not null;

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
                                   organizacao_id, oportunidade_id, projeto_id, contrato_id, unidade_id)
  values (
    tg_table_name, (v_row ->> 'id')::uuid,
    left(coalesce(v_row ->> 'titulo', v_row ->> 'nome', v_row ->> 'descricao', tg_table_name), 200),
    v_acao, nullif(v_mud, '{}'::jsonb), auth.uid(),
    case when tg_table_name = 'organizacoes' then (v_row ->> 'id')::uuid
         when tg_table_name in ('contratos','unidades') then (v_row ->> 'cliente_id')::uuid
         else (v_row ->> 'organizacao_id')::uuid end,
    case when tg_table_name = 'oportunidades' then (v_row ->> 'id')::uuid else (v_row ->> 'oportunidade_id')::uuid end,
    case when tg_table_name = 'projetos' then (v_row ->> 'id')::uuid else (v_row ->> 'projeto_id')::uuid end,
    case when tg_table_name = 'contratos' then (v_row ->> 'id')::uuid else (v_row ->> 'contrato_id')::uuid end,
    case when tg_table_name = 'unidades' then (v_row ->> 'id')::uuid else (v_row ->> 'unidade_id')::uuid end
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['unidades','unidade_fornecedores','contratos','contrato_unidades'] loop
    execute format('create trigger %1$s_log after insert or update or delete on public.%1$I
                    for each row execute function public.log_alteracao()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- F. Permissões
--   leitura: todos os autenticados
--   unidades e fornecedores da unidade: gestor, comercial, projetos, engenharia, facilities
--   contratos e unidades cobertas: gestor, comercial, financeiro
--   excluir unidade ou contrato: somente o gestor
-- ---------------------------------------------------------------------
alter table public.unidades             enable row level security;
alter table public.unidade_fornecedores enable row level security;
alter table public.contratos            enable row level security;
alter table public.contrato_unidades    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['unidades','unidade_fornecedores','contratos','contrato_unidades'] loop
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (true)', t);
  end loop;
  foreach t in array array['unidades','unidade_fornecedores'] loop
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (public.tem_papel(''comercial'',''projetos'',''engenharia'',''facilities''))', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (public.tem_papel(''comercial'',''projetos'',''engenharia'',''facilities'')) with check (public.tem_papel(''comercial'',''projetos'',''engenharia'',''facilities''))', t);
  end loop;
  foreach t in array array['contratos','contrato_unidades'] loop
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (public.tem_papel(''comercial'',''financeiro''))', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (public.tem_papel(''comercial'',''financeiro'')) with check (public.tem_papel(''comercial'',''financeiro''))', t);
  end loop;
end $$;
create policy unidades_delete             on public.unidades             for delete to authenticated using (public.is_gestor());
create policy unidade_fornecedores_delete on public.unidade_fornecedores for delete to authenticated using (public.tem_papel('comercial','projetos','engenharia','facilities'));
create policy contratos_delete            on public.contratos            for delete to authenticated using (public.is_gestor());
create policy contrato_unidades_delete    on public.contrato_unidades    for delete to authenticated using (public.tem_papel('comercial','financeiro'));
