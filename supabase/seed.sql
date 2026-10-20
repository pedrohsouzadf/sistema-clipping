-- =====================================================================
-- Seed inicial — somente fatos informados por Rafael em 15/10/2026
--   • Woba é parceira e fica com 16% da mensalidade total dos contratos que traz
--   • EY, XP Investimentos e Mercado Livre são atendidos pela Woba
-- Rode depois das migrations 0001 a 0006 (SQL Editor do Supabase).
-- =====================================================================
insert into public.organizacoes
  (nome, papeis, atendida_woba, comissao_padrao_pct, papel_na_cadeia, observacoes)
values
  ('Woba', array['parceiro'], 'Não', 16.00,
   'Faz a ponte entre a Clip e grandes empresas: o cliente contrata a Woba e a Woba contrata a Clip para operar.',
   'Comissão de 16% sobre a mensalidade total dos contratos que vêm pela Woba. A Clip não pode vender diretamente, como operadora, para clientes atendidos pela Woba.'),
  ('EY', array['cliente'], 'Sim', null,
   null, 'Atendida pela Woba (informado por Rafael em 15/10/2026). Demandas só via Woba.'),
  ('XP Investimentos', array['cliente'], 'Sim', null,
   null, 'Atendida pela Woba (informado por Rafael em 15/10/2026). Demandas só via Woba.'),
  ('Mercado Livre', array['cliente'], 'Sim', null,
   null, 'Atendida pela Woba (informado por Rafael em 15/10/2026). Operação em Bragança Paulista não começa agora; documentos só como conhecimento.')
on conflict do nothing;
