-- Simplifica a classificação das organizações (decisão de 15/10/2026):
-- cada empresa é Cliente, Parceiro, Fornecedor e/ou Concorrente.
-- Remove "prospect" (vira cliente) e o campo "Relação com a Clip".
alter table public.organizacoes drop constraint if exists organizacoes_papeis_check;
update public.organizacoes
   set papeis = coalesce((
     select array_agg(distinct case when p in ('cliente_final','prospect') then 'cliente' else p end)
       from unnest(papeis) as p), '{}');
alter table public.organizacoes
  add constraint organizacoes_papeis_check
  check (papeis <@ array['cliente','parceiro','fornecedor','concorrente']::text[]);
alter table public.organizacoes drop column if exists relacao_com_clip;
