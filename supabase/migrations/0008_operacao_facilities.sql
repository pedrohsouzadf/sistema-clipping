-- =====================================================================
-- 0008 — Operação e facilities (Módulo 4)
--   Depois da implantação, o sistema continua útil na parte recorrente:
--   A. Catálogo de serviços contratados por unidade (frequência, fornecedor,
--      responsável, SLA, horários, custo mensal, forma de verificação)
--   B. Dependências de terceiros (a Clip acompanha sem assumir garantia
--      que não controla)
--   C. Chamados (incidentes, solicitações, manutenção corretiva) com SLA
--   D. Planos de manutenção preventiva e agenda de inspeções
--   E. Registro de atendimento e aceite
--   F. Garantias e vencimentos
--   G. Histórico de alterações e permissões (RLS)
-- Rode depois das migrations 0001 a 0007.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. Serviços por unidade
-- ---------------------------------------------------------------------
create table public.servicos_unidade (
  id                 uuid primary key default gen_random_uuid(),
  unidade_id         uuid not null references public.unidades(id) on delete cascade,
  contrato_id        uuid references public.contratos(id) on delete set null,
  nome               text not null,
  categoria          text check (categoria in ('Limpeza','Ar-condicionado','Manutenção predial','Elétrica','Internet e telecom','Segurança','Recepção','Copa e alimentação','Jardinagem','Controle de pragas','Elevadores','Outro')),
  descricao          text,
  frequencia         text not null default 'Mensal' check (frequencia in ('Diária','Semanal','Quinzenal','Mensal','Bimestral','Trimestral','Semestral','Anual','Contínuo','Sob demanda')),
  fornecedor_id      uuid references public.organizacoes(id) on delete set null,
  responsavel_id     uuid references public.profiles(id),
  -- quem controla a entrega: define o que a Clip pode prometer ao cliente
  controle           text not null default 'Clip gerencia fornecedor' check (controle in ('Clip executa','Clip gerencia fornecedor','Terceiro controla')),
  clip_garante_sla   boolean not null default false,
  horario_atendimento text,
  regras_atendimento text,
  sla_resposta_horas integer check (sla_resposta_horas > 0),
  sla_solucao_horas  integer check (sla_solucao_horas > 0),
  forma_verificacao  text,                       -- como saber se foi cumprido
  custo_mensal       numeric(14,2) check (custo_mensal >= 0),
  status             text not null default 'Ativo' check (status in ('Ativo','Suspenso','Encerrado')),
  data_inicio        date,
  data_fim           date,
  observacoes        text,
  created_by         uuid default auth.uid() references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (data_fim is null or data_inicio is null or data_fim >= data_inicio),
  check (not (controle = 'Terceiro controla' and clip_garante_sla))
);
create unique index servicos_unidade_nome_uq on public.servicos_unidade (unidade_id, lower(nome));
create index servicos_unidade_fornecedor_idx on public.servicos_unidade (fornecedor_id) where fornecedor_id is not null;
create trigger servicos_unidade_updated before update on public.servicos_unidade
  for each row execute function public.set_updated_at();

create or replace function public.servico_unidade_regras() returns trigger
language plpgsql as $$
begin
  if new.contrato_id is not null
     and (select cliente_id from public.contratos where id = new.contrato_id)
         is distinct from (select cliente_id from public.unidades where id = new.unidade_id) then
    raise exception 'O contrato é de outro cliente: o serviço só pode ser ligado a contrato do mesmo cliente da unidade.';
  end if;
  if new.controle = 'Terceiro controla' then
    new.clip_garante_sla := false;   -- a Clip não promete o que não controla
  end if;
  return new;
end $$;
create trigger servicos_unidade_regras before insert or update on public.servicos_unidade
  for each row execute function public.servico_unidade_regras();

-- ---------------------------------------------------------------------
-- B. Dependências de terceiros
-- ---------------------------------------------------------------------
create table public.servico_dependencias (
  id            uuid primary key default gen_random_uuid(),
  servico_id    uuid not null references public.servicos_unidade(id) on delete cascade,
  terceiro_id   uuid references public.organizacoes(id) on delete set null,
  terceiro_nome text,
  descricao     text not null,                   -- do que o serviço depende (ex.: link da operadora)
  impacto       text,                            -- o que acontece se o terceiro falhar
  contato       text,                            -- como acionar o terceiro
  created_at    timestamptz not null default now(),
  check (terceiro_id is not null or nullif(btrim(terceiro_nome), '') is not null)
);
create index servico_dependencias_servico_idx on public.servico_dependencias (servico_id);

-- ---------------------------------------------------------------------
-- C. Chamados
-- ---------------------------------------------------------------------
create table public.chamados (
  id              uuid primary key default gen_random_uuid(),
  numero          bigint generated always as identity,
  unidade_id      uuid not null references public.unidades(id) on delete cascade,
  servico_id      uuid references public.servicos_unidade(id) on delete set null,
  tipo            text not null default 'Incidente' check (tipo in ('Incidente','Solicitação','Manutenção corretiva')),
  titulo          text not null,
  descricao       text,
  criticidade     text not null default 'Média' check (criticidade in ('Baixa','Média','Alta','Crítica')),
  status          text not null default 'Aberto' check (status in ('Aberto','Em atendimento','Aguardando terceiro','Resolvido','Fechado','Cancelado')),
  solicitante     text,
  responsavel_id  uuid references public.profiles(id),
  fornecedor_id   uuid references public.organizacoes(id) on delete set null,
  aguardando      text,                          -- o que e de quem se espera, quando status = Aguardando terceiro
  aberto_em       timestamptz not null default now(),
  prazo_resposta  timestamptz,
  prazo_solucao   timestamptz,
  respondido_em   timestamptz,
  resolvido_em    timestamptz,
  fechado_em      timestamptz,
  solucao         text,
  custo           numeric(14,2) check (custo >= 0),
  created_by      uuid default auth.uid() references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index chamados_unidade_idx on public.chamados (unidade_id, aberto_em desc);
create index chamados_status_idx on public.chamados (status);
create index chamados_servico_idx on public.chamados (servico_id) where servico_id is not null;
create trigger chamados_updated before update on public.chamados
  for each row execute function public.set_updated_at();

create or replace function public.chamado_regras() returns trigger
language plpgsql as $$
declare s record;
begin
  if new.servico_id is not null then
    select unidade_id, sla_resposta_horas, sla_solucao_horas into s from public.servicos_unidade where id = new.servico_id;
    if s.unidade_id is distinct from new.unidade_id then
      raise exception 'O serviço pertence a outra unidade.';
    end if;
    if tg_op = 'INSERT' then   -- prazos nascem do SLA do serviço
      if new.prazo_resposta is null and s.sla_resposta_horas is not null then
        new.prazo_resposta := new.aberto_em + make_interval(hours => s.sla_resposta_horas);
      end if;
      if new.prazo_solucao is null and s.sla_solucao_horas is not null then
        new.prazo_solucao := new.aberto_em + make_interval(hours => s.sla_solucao_horas);
      end if;
    end if;
  end if;

  if new.status = 'Aguardando terceiro' and nullif(btrim(coalesce(new.aguardando, '')), '') is null then
    raise exception 'Informe o que e de quem o chamado está aguardando.';
  end if;
  if new.status in ('Resolvido','Fechado') and nullif(btrim(coalesce(new.solucao, '')), '') is null then
    raise exception 'Descreva a solução antes de resolver o chamado.';
  end if;

  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    if new.status = 'Fechado' and old.status <> 'Resolvido' then
      raise exception 'Resolva o chamado antes de fechar.';
    end if;
    if old.status = 'Aberto' and new.status <> 'Aberto' and new.respondido_em is null then
      new.respondido_em := now();
    end if;
    if new.status in ('Aberto','Em atendimento','Aguardando terceiro') then   -- reabertura
      new.resolvido_em := null;
      new.fechado_em := null;
    end if;
    if new.status = 'Resolvido' then
      new.resolvido_em := coalesce(new.resolvido_em, now());
      new.respondido_em := coalesce(new.respondido_em, now());
    end if;
    if new.status in ('Fechado','Cancelado') then
      new.fechado_em := coalesce(new.fechado_em, now());
    end if;
  end if;
  return new;
end $$;
create trigger chamados_regras before insert or update on public.chamados
  for each row execute function public.chamado_regras();

-- ---------------------------------------------------------------------
-- D. Planos de manutenção preventiva e inspeções
-- ---------------------------------------------------------------------
create table public.planos_manutencao (
  id                  uuid primary key default gen_random_uuid(),
  unidade_id          uuid not null references public.unidades(id) on delete cascade,
  servico_id          uuid references public.servicos_unidade(id) on delete set null,
  titulo              text not null,
  tipo                text not null default 'Manutenção preventiva' check (tipo in ('Manutenção preventiva','Inspeção')),
  ativo_equipamento   text,                       -- equipamento ou área (ex.: chiller, quadro elétrico)
  checklist           text,
  frequencia          text not null default 'Mensal' check (frequencia in ('Semanal','Quinzenal','Mensal','Bimestral','Trimestral','Semestral','Anual')),
  proxima_data        date not null,
  ultima_data         date,
  responsavel_id      uuid references public.profiles(id),
  fornecedor_id       uuid references public.organizacoes(id) on delete set null,
  ativo               boolean not null default true,
  observacoes         text,
  created_by          uuid default auth.uid() references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index planos_manutencao_agenda_idx on public.planos_manutencao (proxima_data) where ativo;
create index planos_manutencao_unidade_idx on public.planos_manutencao (unidade_id);
create trigger planos_manutencao_updated before update on public.planos_manutencao
  for each row execute function public.set_updated_at();

create or replace function public.plano_regras() returns trigger
language plpgsql as $$
begin
  if new.servico_id is not null
     and (select unidade_id from public.servicos_unidade where id = new.servico_id) is distinct from new.unidade_id then
    raise exception 'O serviço pertence a outra unidade.';
  end if;
  return new;
end $$;
create trigger planos_manutencao_regras before insert or update on public.planos_manutencao
  for each row execute function public.plano_regras();

create or replace function public.proxima_ocorrencia(p_frequencia text, p_base date) returns date
language sql immutable as $$
  select case p_frequencia
    when 'Semanal'    then p_base + 7
    when 'Quinzenal'  then p_base + 14
    when 'Mensal'     then (p_base + interval '1 month')::date
    when 'Bimestral'  then (p_base + interval '2 months')::date
    when 'Trimestral' then (p_base + interval '3 months')::date
    when 'Semestral'  then (p_base + interval '6 months')::date
    when 'Anual'      then (p_base + interval '1 year')::date
  end
$$;

-- ---------------------------------------------------------------------
-- E. Registro de atendimento e aceite
-- ---------------------------------------------------------------------
create table public.atendimentos (
  id            uuid primary key default gen_random_uuid(),
  unidade_id    uuid not null references public.unidades(id) on delete cascade,
  servico_id    uuid references public.servicos_unidade(id) on delete set null,
  chamado_id    uuid references public.chamados(id) on delete cascade,
  plano_id      uuid references public.planos_manutencao(id) on delete set null,
  tipo          text not null check (tipo in ('Execução do serviço','Atendimento de chamado','Manutenção preventiva','Inspeção')),
  data_hora     timestamptz not null default now(),
  executado_por text,
  fornecedor_id uuid references public.organizacoes(id) on delete set null,
  descricao     text not null,
  conforme      boolean,                          -- o combinado foi cumprido? (vazio = não se aplica)
  aceite        text not null default 'Pendente' check (aceite in ('Pendente','Aceito','Recusado')),
  aceite_por    uuid references public.profiles(id),
  aceite_em     timestamptz,
  aceite_obs    text,
  created_by    uuid default auth.uid() references public.profiles(id),
  created_at    timestamptz not null default now()
);
create index atendimentos_unidade_idx on public.atendimentos (unidade_id, data_hora desc);
create index atendimentos_chamado_idx on public.atendimentos (chamado_id) where chamado_id is not null;
create index atendimentos_servico_idx on public.atendimentos (servico_id) where servico_id is not null;

create or replace function public.atendimento_regras() returns trigger
language plpgsql as $$
begin
  if new.servico_id is not null
     and (select unidade_id from public.servicos_unidade where id = new.servico_id) is distinct from new.unidade_id then
    raise exception 'O serviço pertence a outra unidade.';
  end if;
  if new.chamado_id is not null
     and (select unidade_id from public.chamados where id = new.chamado_id) is distinct from new.unidade_id then
    raise exception 'O chamado pertence a outra unidade.';
  end if;
  if new.aceite = 'Recusado' and nullif(btrim(coalesce(new.aceite_obs, '')), '') is null then
    raise exception 'Informe o motivo da recusa do atendimento.';
  end if;
  if new.aceite in ('Aceito','Recusado') and (tg_op = 'INSERT' or old.aceite is distinct from new.aceite) then
    new.aceite_por := auth.uid();
    new.aceite_em := now();
  elsif new.aceite = 'Pendente' then
    new.aceite_por := null;
    new.aceite_em := null;
  end if;
  return new;
end $$;
create trigger atendimentos_regras before insert or update on public.atendimentos
  for each row execute function public.atendimento_regras();

-- registra a execução de um plano: cria o atendimento e empurra a próxima data
create or replace function public.registrar_execucao_plano(
  p_plano uuid, p_data date default current_date, p_descricao text default null,
  p_conforme boolean default null, p_executado_por text default null
) returns uuid
language plpgsql as $$
declare p public.planos_manutencao; v_id uuid;
begin
  select * into p from public.planos_manutencao where id = p_plano;
  if not found then raise exception 'Plano não encontrado.'; end if;
  insert into public.atendimentos (unidade_id, servico_id, plano_id, tipo, data_hora, executado_por, fornecedor_id, descricao, conforme)
  values (p.unidade_id, p.servico_id, p.id, p.tipo, p_data::timestamptz + interval '12 hours', nullif(btrim(coalesce(p_executado_por, '')), ''),
          p.fornecedor_id, coalesce(nullif(btrim(coalesce(p_descricao, '')), ''), 'Execução: ' || p.titulo), p_conforme)
  returning id into v_id;
  update public.planos_manutencao
     set ultima_data = p_data, proxima_data = public.proxima_ocorrencia(p.frequencia, p_data)
   where id = p.id;
  if not found then raise exception 'Sem permissão para atualizar o plano.'; end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- F. Garantias e vencimentos
-- ---------------------------------------------------------------------
create table public.garantias_vencimentos (
  id              uuid primary key default gen_random_uuid(),
  unidade_id      uuid not null references public.unidades(id) on delete cascade,
  servico_id      uuid references public.servicos_unidade(id) on delete set null,
  tipo            text not null default 'Garantia' check (tipo in ('Garantia','Licença ou alvará','Contrato de terceiro','Seguro','Certificado','Outro')),
  descricao       text not null,
  concedida_por   text not null default 'Fornecedor' check (concedida_por in ('Fornecedor','Terceiro','Proprietário','Clip')),
  fornecedor_id   uuid references public.organizacoes(id) on delete set null,
  data_vencimento date not null,
  aviso_dias      integer not null default 60 check (aviso_dias >= 0),
  responsavel_id  uuid references public.profiles(id),
  status          text not null default 'Vigente' check (status in ('Vigente','Renovado','Encerrado')),
  observacoes     text,
  created_by      uuid default auth.uid() references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index garantias_vencimento_idx on public.garantias_vencimentos (data_vencimento) where status = 'Vigente';
create index garantias_unidade_idx on public.garantias_vencimentos (unidade_id);
create trigger garantias_vencimentos_updated before update on public.garantias_vencimentos
  for each row execute function public.set_updated_at();

create or replace function public.garantia_regras() returns trigger
language plpgsql as $$
begin
  if new.servico_id is not null
     and (select unidade_id from public.servicos_unidade where id = new.servico_id) is distinct from new.unidade_id then
    raise exception 'O serviço pertence a outra unidade.';
  end if;
  return new;
end $$;
create trigger garantias_regras before insert or update on public.garantias_vencimentos
  for each row execute function public.garantia_regras();

-- ---------------------------------------------------------------------
-- G. Histórico de alterações e permissões
--   leitura: todos os autenticados
--   escrita: gestor, comercial, projetos, engenharia, facilities
--   excluir: somente o gestor (dependências de terceiros: os mesmos papéis de escrita)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['servicos_unidade','servico_dependencias','chamados','planos_manutencao','atendimentos','garantias_vencimentos'] loop
    execute format('create trigger %1$s_log after insert or update or delete on public.%1$I
                    for each row execute function public.log_alteracao()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (public.tem_papel(''comercial'',''projetos'',''engenharia'',''facilities''))', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (public.tem_papel(''comercial'',''projetos'',''engenharia'',''facilities'')) with check (public.tem_papel(''comercial'',''projetos'',''engenharia'',''facilities''))', t);
    if t = 'servico_dependencias' then
      execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (public.tem_papel(''comercial'',''projetos'',''engenharia'',''facilities''))', t);
    else
      execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (public.is_gestor())', t);
    end if;
  end loop;
end $$;
