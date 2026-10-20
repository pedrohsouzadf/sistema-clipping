# Clip — sistema de gestão (fase 1)

React 19 + Vite + TypeScript, Supabase (Postgres + Auth + RLS + Storage), deploy na Vercel.
Uso interno da Clip (Clipping Office + Clip Corporate Spaces). Contexto de negócio: `../README.md`.

O desenho segue a arquitetura de 19/10/2026: módulos conectados (não sistemas separados), registro único
de cada entidade, regras de negócio no banco e histórico de alterações. Uma oportunidade ganha gera o projeto
de implantação sem recadastrar nada.

## Menu (arquitetura)
O menu lateral segue a arquitetura do sistema; as telas ficam em abas dentro de cada área.

| Área | Abas / situação |
|---|---|
| Dashboard Executivo | indicadores clicáveis |
| CRM e comercial | Funil · Empresas · Contatos |
| Clientes e contratos | Clientes · Unidades · Contratos |
| Projetos e implantação | Projetos · Tarefas · Cotações |
| Operação e facilities | Chamados · Serviços por unidade · Manutenção e inspeções · Garantias e vencimentos · Histórico de ocorrências |
| Rede de parceiros | Parceiros |
| Financeiro por contrato | Visão por contrato · Lançamentos (só gestor e financeiro) |
| Configurações (botão na parte de baixo da barra lateral) | Histórico de alterações · Equipe e permissões (só gestor, com cadastro de novos usuários) |

Configuração do menu em `src/lib/secoes.ts`.

## O que já faz

| Módulo | O que tem |
|---|---|
| **Dashboard Executivo** | Três seções. Comercial: oportunidades abertas, propostas em andamento, pipeline, propostas sem retorno. Implantação e projetos: projetos ativos, atrasados, riscos e pendências abertos. Operação e contratos: clientes e unidades ativas, contratos próximos do vencimento, chamados em aberto (com SLA vencido destacado) e manutenções preventivas pendentes (agora todos reais) e custo mensal dos fornecedores (das cotações). Financeiro: receita mensal contratada, custos mensais previstos, custos mensais realizados, margem estimada média por contrato, contas a receber e desembolsos futuros (todos reais; realizado e caixa só aparecem para gestor e financeiro; receita contratada, faturada e recebida ficam sempre separadas). Cada indicador é clicável. |
| **Funil** | 7 etapas (Mapeada → Qualificada → Reunião/diagnóstico → Estudo de viabilidade → Proposta enviada → Negociação → Ganha/perdida), kanban com arrastar e soltar, playbook por etapa. Campos da oportunidade: tipo de serviço, valor, probabilidade, fechamento esperado, concorrentes, riscos, tipo de imóvel, necessidade de obra, regra de relacionamento e aprovação da abordagem. |
| **Projetos** | Gerado a partir da oportunidade ganha (ou criado à mão). 7 etapas padrão com critérios de entrada e saída; **concluída ≠ aprovada** (aprovação formal registra quem e quando). Tarefas, parceiros do projeto com valor cotado × contratado e avaliação, riscos/pendências/decisões/mudanças de escopo, documentos e histórico. |
| **Tarefas** | Sempre ligadas a uma oportunidade, projeto, empresa ou contato. Responsável, prioridade, vencimento, bloqueio por outra tarefa, tipo "aprovação", evidência de conclusão. Visões: minhas, equipe, atrasadas por responsável. |
| **Parceiros** | Perfil de homologação de cada fornecedor: cidades, especialidades, disponibilidade, mobilização, validade da documentação. Busca combinada e desempenho por projeto (nota média, prazo, retrabalho). |
| **Empresas e contatos** | Registro único (CNPJ não duplica), razão social, site, responsável, origem, necessidades, próximo passo, último contato automático. Contatos de networking com continuidade em 2 dias. |
| **Documentos** | Arquivo (Storage) ou link, tipo, versão, status de aprovação, validade. Em empresas, oportunidades e projetos. |
| **Histórico** | `activity_log` automático: quem mudou o quê e quando, em oportunidades, projetos, etapas, empresas, parceiros, documentos e tarefas. |
| **Cotações** | Itens a contratar por operação e propostas de fornecedores por item (substitui a planilha de cotação). |
| **Equipe e permissões** | Lista de pessoas com acesso e botão para cadastrar novos usuários (nome, e-mail e senha inicial). Papéis seguem no banco (gestor, comercial, projetos, engenharia, facilities, financeiro), mas a tela não os exibe nem edita. |

### Regras aplicadas no banco (não dá para burlar pela tela)
- Empresa atendida pela Woba + Clip como operadora + origem ≠ Woba → bloqueado.
- Origem Woba → entra na etapa 3, canal e contratante = Woba, comissão do canal = 16% da mensalidade total.
- "Validar" não passa da etapa 1 até confirmar com a Woba. Abordagem com aprovação pendente também não.
- Fechar exige resultado; perdida exige motivo.
- Uma oportunidade só gera projeto se estiver ganha, e uma única vez.
- Etapa de projeto só é aprovada depois de concluída, por gestor, projetos ou engenharia, e não reabre sem remover a aprovação.
- Tarefa sem vínculo, tarefa em andamento sem responsável, tarefa bloqueada que começa antes da anterior e aprovação concluída sem responsável são recusadas.

### Permissões
Todos leem. Cada papel escreve no seu domínio (regras no banco). Gestor exclui projetos, empresas e perfis de parceiro; qualquer usuário exclui oportunidades e tarefas; documentos, só quem enviou ou o gestor.

## Colocar no ar (uma vez)
1. Crie um projeto em [supabase.com](https://supabase.com).
2. **SQL Editor**: rode, nesta ordem, `supabase/migrations/0001_init.sql` até `0006_modelo_fase1.sql` e depois `supabase/seed.sql` (cria Woba, EY, XP, Mercado Livre). Quem já rodou até a 0005 roda a **0006** (converte as oportunidades para as 7 etapas, preservando os dados) depois a **0007** (clientes, unidades e contratos) a **0008** (operação e facilities) e a **0009** (financeiro por contrato).
3. **Project Settings → API**: copie *Project URL* e *anon public key* (nunca a `service_role`).
4. `cp .env.example .env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
5. `npm install && npm run dev` → abra o endereço mostrado.
6. **Crie sua conta na tela de login: o primeiro usuário vira `gestor`**; os seguintes entram como `comercial` (o papel só muda direto no banco).
   (Se o Supabase exigir confirmação por e-mail, confirme ou desligue em Authentication → Providers → Email.)
7. Em **Storage**, confira se existe o bucket privado `documentos` (a 0006 tenta criar). Sem ele, use links nos documentos.
8. Depois que o time estiver cadastrado, desative cadastros públicos em Authentication → Sign In / Providers.

## Deploy na Vercel
Importe a pasta `app/` (ou o repositório com *Root Directory* = `app`), framework Vite, e defina as duas variáveis
`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. O `vercel.json` já cuida das rotas.

## Testes
`npm run test:db` — roda as migrations + seed num Postgres em memória (PGlite) e verifica 194 regras: trava Woba, etapas, comissão,
fechamento, propostas, permissões por papel, projetos e aprovação de etapas, tarefas, parceiros, documentos, histórico, e a conversão
dos dados existentes na 0006, clientes, unidades e contratos (0007), operação e facilities (0008) e financeiro por contrato (0009).
`npm run typecheck` e `npm run build` validam o front.

## Estrutura
```
supabase/migrations/0001_init.sql          esquema, regras (triggers), RLS, funil e playbook
supabase/migrations/0002 a 0004            exclusão pelo comercial; tipo da organização simplificado; remove categoria
supabase/migrations/0005_*.sql             operações e cotações de fornecedores
supabase/migrations/0006_modelo_fase1.sql  funil de 7 etapas, papéis, projetos, parceiros, tarefas, documentos, histórico
supabase/migrations/0007_*.sql             status de relacionamento, decisores, unidades, contratos e vínculos
supabase/migrations/0008_*.sql             serviços por unidade, chamados com SLA, planos de manutenção, atendimentos e aceite, garantias
supabase/migrations/0009_*.sql             lançamentos financeiros por contrato (faturamento, recebimento, custo, investimento)
supabase/seed.sql                          organizações iniciais
supabase/tests/regras.test.mjs             teste das regras de negócio
src/lib/secoes.ts, components/SecaoNav.tsx     menu lateral e abas por área
src/pages/                                 Painel, Funil, OportunidadeDetalhe, Projetos, ProjetoDetalhe, Tarefas, Parceiros,
                                           Clientes, Unidades, Contratos, Chamados, Servicos, Manutencao, Garantias, Ocorrencias, Financeiro, Lancamentos, Organizacoes, Contatos, Operacoes, OperacaoDetalhe, Equipe, BaseDados, EmBreve
src/components/ src/lib/                   formulários, painéis reutilizáveis (tarefas, documentos, histórico), acesso a dados
```

## Ainda não existe (fases seguintes do desenho)
- **Fase 2**: orçamento previsto × realizado, cronograma com dependências e marcos, aprovações e mudanças de escopo com fluxo, checklists e aceite de entrega, aditivos com fluxo de aprovação.
- **Fase 3 (o que falta)**: retorno do investimento (a fórmula ainda não foi definida; hoje só se registra o investimento) e o simulador financeiro. Integração com sistema contábil ou bancário: não existe, os lançamentos são manuais.
- **Fase 4**: integrações (e-mail, calendário, WhatsApp, assinatura digital), automação de notificações, BI avançado.
- Alertas por e-mail ou push: hoje os alertas aparecem no Painel.
