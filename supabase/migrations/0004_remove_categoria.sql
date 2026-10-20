-- Remove o campo "categoria" das organizações (decisão de 15/10/2026): o Tipo já cobre o essencial.
alter table public.organizacoes drop column if exists categoria;
