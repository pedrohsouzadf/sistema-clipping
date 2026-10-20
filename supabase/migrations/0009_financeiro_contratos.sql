-- =====================================================================
-- 0009 — Financeiro por contrato (Módulo 5)
--   Receita contratada, faturada e recebida são três números diferentes e
--   nunca se somam:
--     contratada = valor mensal do contrato (já existe em contratos)
--     faturada   = lançamentos do tipo Faturamento
--     recebida   = lançamentos do tipo Recebimento
--   A. Lançamentos financeiros por contrato (faturamento, recebimento,
--      custo, investimento), com custo "a pagar" x "pago"
--   B. Vínculo opcional de uma operação de cotação com um contrato
--      (para o custo previsto contar fornecedores escolhidos)
--   C. Permissões: somente gestor e financeiro leem e escrevem
-- Rode depois das migrations 0001 a 0008.
-- =====================================================================

create table public.lancamentos_financeiros (
  id            uuid primary key default gen_random_uuid(),
  contrato_id   uuid not null references public.contratos(id) on delete cascade,
  tipo          text not null check (tipo in ('Faturamento','Recebimento','Custo','Investimento')),
  competencia   date not null,                      -- sempre o 1º dia do mês a que o valor pertence
  valor         numeric(14,2) not null check (valor > 0),
  pago          boolean not null default true,      -- Custo/Investimento: false = a pagar
  data          date,                               -- emissão (faturamento), recebimento ou pagamento
  vencimento    date,                               -- obrigatório quando está a pagar
  unidade_id    uuid references public.unidades(id) on delete set null,
  servico_id    uuid references public.servicos_unidade(id) on delete set null,
  fornecedor_id uuid references public.organizacoes(id) on delete set null,
  documento     text,                               -- nº da nota, boleto, comprovante
  descricao     text,
  created_by    uuid default auth.uid() references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (tipo in ('Custo','Investimento') or pago),
  check ((pago and data is not null) or (not pago and vencimento is not null))
);
create index lancamentos_contrato_idx on public.lancamentos_financeiros (contrato_id, competencia desc);
create index lancamentos_tipo_idx on public.lancamentos_financeiros (tipo, competencia);
create index lancamentos_a_pagar_idx on public.lancamentos_financeiros (vencimento) where not pago;
create trigger lancamentos_updated before update on public.lancamentos_financeiros
  for each row execute function public.set_updated_at();

create or replace function public.lancamento_regras() returns trigger
language plpgsql as $$
declare v_cliente uuid; v_status text;
begin
  new.competencia := date_trunc('month', new.competencia)::date;
  select cliente_id, status into v_cliente, v_status from public.contratos where id = new.contrato_id;
  if new.tipo in ('Faturamento','Recebimento') and v_status in ('Rascunho','Em negociação') then
    raise exception 'Contrato ainda não vigente: não dá para lançar faturamento ou recebimento.';
  end if;
  if new.unidade_id is not null
     and (select cliente_id from public.unidades where id = new.unidade_id) is distinct from v_cliente then
    raise exception 'A unidade é de outro cliente: use uma unidade do cliente do contrato.';
  end if;
  if new.servico_id is not null
     and (select u.cliente_id from public.servicos_unidade s join public.unidades u on u.id = s.unidade_id where s.id = new.servico_id) is distinct from v_cliente then
    raise exception 'O serviço é de outro cliente: use um serviço do cliente do contrato.';
  end if;
  return new;
end $$;
create trigger lancamentos_regras before insert or update on public.lancamentos_financeiros
  for each row execute function public.lancamento_regras();

-- cotações: a operação pode apontar para o contrato que ela viabilizou
alter table public.operacoes add column if not exists contrato_id uuid references public.contratos(id) on delete set null;
create index if not exists operacoes_contrato_idx on public.operacoes (contrato_id) where contrato_id is not null;

create or replace function public.operacao_contrato_regras() returns trigger
language plpgsql as $$
begin
  if new.contrato_id is not null and new.cliente_id is not null
     and (select cliente_id from public.contratos where id = new.contrato_id) is distinct from new.cliente_id then
    raise exception 'O contrato é de outro cliente.';
  end if;
  return new;
end $$;
create trigger operacoes_contrato_regras before insert or update of contrato_id, cliente_id on public.operacoes
  for each row execute function public.operacao_contrato_regras();

-- histórico (aparece no histórico do contrato)
create trigger lancamentos_financeiros_log after insert or update or delete on public.lancamentos_financeiros
  for each row execute function public.log_alteracao();

-- permissões: dados financeiros só para gestor e financeiro
alter table public.lancamentos_financeiros enable row level security;
create policy lancamentos_select on public.lancamentos_financeiros for select to authenticated using (public.tem_papel('financeiro'));
create policy lancamentos_insert on public.lancamentos_financeiros for insert to authenticated with check (public.tem_papel('financeiro'));
create policy lancamentos_update on public.lancamentos_financeiros for update to authenticated using (public.tem_papel('financeiro')) with check (public.tem_papel('financeiro'));
create policy lancamentos_delete on public.lancamentos_financeiros for delete to authenticated using (public.tem_papel('financeiro'));
