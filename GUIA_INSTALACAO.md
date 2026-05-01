# 🚀 Guia de Instalação — Analytics do Negócio
> Siga os passos na ordem. Cada etapa leva 5–10 minutos.

---

## ✅ ETAPA 1 — Criar Banco de Dados (Supabase)

**O que é:** O Supabase é o "cofre" onde seus dados ficam guardados online, com segurança e backup automático. É gratuito.

### Passo a passo:

1. Acesse: **https://supabase.com** e clique em **"Start your project"**
2. Faça login com sua conta **GitHub** (mais fácil) ou Google
3. Clique em **"New Project"**
4. Preencha:
   - **Name:** `analytics-negocio`
   - **Database Password:** Crie uma senha forte e **ANOTE em lugar seguro**
   - **Region:** `South America (São Paulo)`
5. Clique **"Create new project"** e aguarde 2 minutos

### Pegar as credenciais (você vai precisar):

6. No menu lateral, clique em **Settings** → **API**
7. Copie e guarde:
   - **Project URL** → algo como `https://abcxyz.supabase.co`
   - **anon public** → chave longa começando com `eyJ...`
   - **service_role** → outra chave longa (SECRETA, não compartilhe!)

### Criar as tabelas:

8. No menu lateral, clique em **SQL Editor**
9. Clique em **"New query"**
10. Abra o arquivo `database/schema.sql` deste projeto
11. Copie TODO o conteúdo e cole no editor do Supabase
12. Clique em **"Run"** (botão verde)
13. Deve aparecer: "Success. No rows returned" — tabelas criadas! ✅

---

## ✅ ETAPA 2 — Criar Repositório no GitHub

**O que é:** O GitHub é onde o código fica guardado e onde a automação roda de hora em hora. Gratuito.

### Passo a passo:

1. Acesse: **https://github.com** e faça login
2. Clique no **"+"** no topo direito → **"New repository"**
3. Preencha:
   - **Repository name:** `analytics-negocio`
   - Marque: **Private** (para ninguém ver seu código)
4. Clique **"Create repository"**
5. Na próxima tela, clique em **"uploading an existing file"**
6. Arraste **TODA a pasta** `analytics-negocio` para a área de upload
7. Clique **"Commit changes"** → **"Commit directly to main"**

### Configurar as senhas (Secrets):

8. No repositório, clique em **Settings** → **Secrets and variables** → **Actions**
9. Clique em **"New repository secret"** e adicione **um por um**:

| Nome | Valor |
|------|-------|
| `SUPABASE_URL` | URL do passo 1 (https://xxx.supabase.co) |
| `SUPABASE_SERVICE_KEY` | service_role key do passo 1 |
| `SGE_URL` | https://sistema.sge.com.br |
| `SGE_USER` | Seu login do SGE |
| `SGE_PASSWORD` | Sua senha do SGE |
| `NOTION_TOKEN` | (veja Etapa 3 abaixo) |
| `NOTION_DB_CRM` | (veja Etapa 3 abaixo) |

---

## ✅ ETAPA 3 — Conectar o Notion

**O que é:** Vamos criar uma "chave de acesso" para que o Python possa ler seus dados do Notion.

### Criar integração no Notion:

1. Acesse: **https://www.notion.so/my-integrations**
2. Clique em **"+ New integration"**
3. Preencha:
   - **Name:** `Analytics Dashboard`
   - **Associated workspace:** Seu workspace
4. Clique **"Submit"**
5. Copie o **"Internal Integration Token"** (começa com `secret_...`)
   → Esse é o seu `NOTION_TOKEN` — adicione nos Secrets do GitHub

### Conectar seu banco de dados CRM ao Notion:

6. Abra o seu banco de dados CRM no Notion
7. Clique nos **"..."** (três pontos) no canto superior direito
8. Clique em **"Add connections"** → selecione **"Analytics Dashboard"**
9. Pegar o ID do banco:
   - Copie a URL da página, que será algo como:
     `https://www.notion.so/SEU-NOME/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx?v=...`
   - O ID é a parte `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` (32 caracteres)
   → Esse é o seu `NOTION_DB_CRM` — adicione nos Secrets do GitHub

---

## ✅ ETAPA 4 — Publicar o Dashboard Online

**O que é:** Streamlit Cloud publica seu dashboard na internet, com link personalizado e seguro. Gratuito.

### Passo a passo:

1. Acesse: **https://streamlit.io/cloud** e faça login com **GitHub**
2. Clique em **"New app"**
3. Preencha:
   - **Repository:** `SEU-USUARIO/analytics-negocio`
   - **Branch:** `main`
   - **Main file path:** `dashboard/app.py`
4. Clique em **"Advanced settings"** e adicione os secrets:
   ```
   SUPABASE_URL = "https://xxx.supabase.co"
   SUPABASE_ANON_KEY = "eyJ..."
   ```
5. Clique **"Deploy!"**
6. Aguarde 3–5 minutos
7. Seu dashboard estará online em: `https://SEU-USUARIO-analytics-negocio.streamlit.app`

### Login padrão (mude depois!):
- **Usuário:** `admin`
- **Senha:** `admin123`

---

## ✅ ETAPA 5 — Testar a Sincronização

### Rodar a primeira coleta manualmente:

1. No GitHub, clique na aba **"Actions"**
2. Clique em **"Sincronização Automática de Dados"**
3. Clique em **"Run workflow"** → **"Run workflow"**
4. Aguarde 2–5 minutos
5. Se aparecer ✅ verde = funcionou!
6. Abra seu dashboard e veja os dados aparecendo

### A partir daí, o sistema roda **automaticamente** a cada hora.

---

## 🔒 Segurança

- **Nunca** compartilhe as chaves `service_role` ou `NOTION_TOKEN`
- As senhas ficam nos "Secrets" do GitHub, nunca no código
- O Supabase tem backup automático diário
- O acesso ao dashboard exige login + senha

---

## ❓ Problemas comuns

**"Erro de autenticação Supabase"**
→ Verifique se copiou a chave certa (anon key no dashboard, service_role nos Actions)

**"Login SGE falhou"**
→ Verifique usuário e senha nos Secrets do GitHub

**"Banco Notion não encontrado"**
→ Certifique-se de ter adicionado a integração no banco CRM (Etapa 3, passo 8)

**Dashboard lento na primeira carga**
→ Normal! O Streamlit Cloud "hiberna" apps inativos. Após a primeira carga fica rápido.

---

## 📞 Próximos passos

Depois que tudo estiver funcionando:
1. Cadastrar suas metas no Supabase
2. Ajustar os campos do Notion (se necessário)
3. Personalizar o layout do dashboard
4. Ativar projeções com IA (após 3+ meses de dados)
