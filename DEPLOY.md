# Publicar o sistema (Cloudflare Pages)

O sistema é um site estático (Vite + React); os dados ficam no Supabase.

## 1. Subir o código ao GitHub
Crie um repositório **privado** só com a pasta `app` (esta pasta). Não suba `.env.local`
(já está no `.gitignore`).

```bash
cd app
git init && git add . && git commit -m "Sistema Clip"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/clipping-office-sistema.git
git push -u origin main
```

## 2. Criar o projeto na Cloudflare Pages
Workers & Pages → Create → Pages → Connect to Git → escolha o repositório.

| Campo | Valor |
|---|---|
| Framework preset | Vite (ou None) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Variável `VITE_SUPABASE_URL` | URL do projeto Supabase |
| Variável `VITE_SUPABASE_ANON_KEY` | anon key (nunca a service_role) |
| Variável `NODE_VERSION` | `22` |

O arquivo `wrangler.jsonc` (já no repositório) publica a pasta `dist` e faz rotas como
`/clientes` abrirem direto (modo SPA). O comando de deploy é `npx wrangler deploy`, e o
`name` do arquivo deve ser igual ao nome do projeto na Cloudflare.

As variáveis `VITE_*` precisam estar em **Build variables**, pois são lidas na hora do build.

## 3. Ajustar o Supabase
Authentication → URL Configuration:
- **Site URL**: `https://SEU-PROJETO.pages.dev` (ou o domínio próprio)
- **Redirect URLs**: a mesma URL, com `/**` no final

## 4. Depois do primeiro acesso
- Se o time será cadastrado só por Configurações → Equipe, desative o cadastro público:
  Authentication → Providers → Email → *Allow new users to sign up* = off
  (o botão "+ Novo usuário" usa signUp; teste antes de desativar).
- Cada `git push` na `main` publica automaticamente.
