-- O comercial também pode excluir oportunidades (decisão de 15/10/2026).
-- Organizações, contatos e demais tabelas continuam com exclusão só do gestor.
drop policy if exists "oportunidades_delete" on public.oportunidades;
create policy "oportunidades_delete" on public.oportunidades
  for delete to authenticated using (true);
