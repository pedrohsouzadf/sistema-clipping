-- Operações e cotações de fornecedores (substitui a planilha "Cotação XP Ribeirão Preto").
-- Uma operação tem itens a cotar (limpeza, link, ar-condicionado...) e cada item recebe
-- propostas de fornecedores. O status do item é calculado a partir das propostas.

create table public.operacoes (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  cliente_id      uuid references public.organizacoes(id),
  oportunidade_id uuid references public.oportunidades(id) on delete set null,
  cidade          text,
  pessoas         integer check (pessoas > 0),
  observacoes     text,
  created_by      uuid default auth.uid() references public.profiles(id),
  created_at      timestamptz not null default now()
);
create unique index operacoes_nome_uq on public.operacoes (lower(nome));

create table public.cotacao_itens (
  id          uuid primary key default gen_random_uuid(),
  operacao_id uuid not null references public.operacoes(id) on delete cascade,
  ordem       integer not null default 0,
  nome        text not null,
  responsavel text,
  dispensado  boolean not null default false,
  observacoes text,
  created_at  timestamptz not null default now()
);
create index cotacao_itens_operacao_idx on public.cotacao_itens (operacao_id, ordem);

create table public.cotacao_propostas (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.cotacao_itens(id) on delete cascade,
  fornecedor_id uuid not null references public.organizacoes(id),
  escopo        text,
  status        text not null default 'pesquisado'
                  check (status in ('pesquisado','solicitado','recebido','escolhido','descartado')),
  valor_mensal  numeric(14,2) check (valor_mensal >= 0),
  observacoes   text,
  created_by    uuid default auth.uid() references public.profiles(id),
  created_at    timestamptz not null default now()
);
create index cotacao_propostas_item_idx on public.cotacao_propostas (item_id);
-- no máximo uma proposta escolhida por item
create unique index cotacao_propostas_um_escolhido on public.cotacao_propostas (item_id) where status = 'escolhido';

do $$
declare t text;
begin
  foreach t in array array['operacoes','cotacao_itens','cotacao_propostas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (true)', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (true) with check (true)', t);
  end loop;
end $$;
-- itens e propostas são trabalho do dia a dia: qualquer usuário pode excluir; a operação inteira, só o gestor
create policy "cotacao_itens_delete"     on public.cotacao_itens     for delete to authenticated using (true);
create policy "cotacao_propostas_delete" on public.cotacao_propostas for delete to authenticated using (true);
create policy "operacoes_delete"         on public.operacoes         for delete to authenticated using (public.is_gestor());
