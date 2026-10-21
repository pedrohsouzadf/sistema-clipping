-- =====================================================================
-- 0010 — Prestadores de serviço (Rede de parceiros)
--   Lista de profissionais e autônomos (pintor, eletricista, bombeiro
--   hidráulico…), separada dos fornecedores (empresas, em "parceiros").
--   Não exige CNPJ nem cadastro em Organizações.
--   Permissões iguais às do perfil de parceiros:
--     todos leem; gestor, comercial, projetos, engenharia e facilities
--     criam e editam; só o gestor exclui.
-- Rode depois das migrations 0001 a 0009.
-- =====================================================================

create table public.prestadores (
  id                  uuid primary key default gen_random_uuid(),
  nome                text not null check (length(btrim(nome)) > 0),
  oficio              text not null check (length(btrim(oficio)) > 0),   -- Pintor, Eletricista, Bombeiro hidráulico…
  telefone            text,
  email               text,
  cidades             text[] not null default '{}',
  disponibilidade     text not null default 'Disponível' check (disponibilidade in ('Disponível','Parcial','Indisponível')),
  disponivel_a_partir date,
  nota                smallint check (nota between 1 and 5),            -- avaliação geral, de 1 a 5
  valor_referencia    text,                                             -- texto livre: diária, hora, tabela
  indicado_por        text,
  observacoes         text,
  created_by          uuid default auth.uid() references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index prestadores_oficio_idx on public.prestadores (lower(oficio));
create index prestadores_cidades_gin on public.prestadores using gin (cidades);
create trigger prestadores_updated before update on public.prestadores
  for each row execute function public.set_updated_at();

alter table public.prestadores enable row level security;
create policy prestadores_select on public.prestadores for select to authenticated using (true);
create policy prestadores_insert on public.prestadores for insert to authenticated
  with check (public.tem_papel('comercial','projetos','engenharia','facilities'));
create policy prestadores_update on public.prestadores for update to authenticated
  using (public.tem_papel('comercial','projetos','engenharia','facilities'))
  with check (public.tem_papel('comercial','projetos','engenharia','facilities'));
create policy prestadores_delete on public.prestadores for delete to authenticated using (public.is_gestor());
