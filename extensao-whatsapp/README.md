# Amor In Gestão — Extensão de Conversas do WhatsApp

Extensão do Chrome (Manifest V3) que arquiva no CRM as conversas de WhatsApp das
comissões e alunos de formatura, **por turma**. Funciona como a do Moskit: o
vendedor abre o WhatsApp Web pelo QR code normal e a extensão vai salvando as
mensagens das conversas cujos contatos/grupos batem com uma turma cadastrada.

## Como funciona

1. O vendedor entra na extensão com o **mesmo login do CRM** (popup).
2. Com o `web.whatsapp.com` aberto, a extensão lê a conversa ativa via
   [`@wppconnect/wa-js`](https://github.com/wppconnect-team/wa-js) (`vendor/wppconnect-wa.js`).
3. Para cada conversa:
   - **DM**: cruza o telefone com `contatos` → pega a `turma_id`.
   - **Grupo**: cruza o nome do grupo com o nome da turma (curso + faculdade +
     turma + ano), **sem exigir o prefixo AIF/AFF/SFF**. Se não bater sozinho,
     o grupo fica *pendente* pra alinhamento manual na aba **Conversas** da turma.
4. Manda as mensagens novas pra Edge Function `whatsapp-sync`, que:
   - deduplica por `wa_msg_id`;
   - **transcreve os áudios com o Gemini** (plano do WhatsApp não tem legenda);
   - grava em `conversas_whatsapp`.

Nada de token do Claude é usado — a transcrição é toda no Gemini.

## Arquivos

| Arquivo | Contexto | Papel |
|---|---|---|
| `manifest.json` | — | MV3 |
| `config.js` | todos | URL do Supabase + chave anon (pública) |
| `content.js` | content script | injeta os scripts, orquestra a varredura |
| `wa-inject.js` | página | usa `window.WPP` pra ler conversa/mensagens/áudio |
| `vendor/wppconnect-wa.js` | página | wa-js v4.6.0 (não editar) |
| `background.js` | service worker | guarda a sessão do CRM, chama as Edge Functions |
| `popup.html` / `popup.js` | popup | login, status, grupos pendentes |

Os tokens de sessão ficam só no `chrome.storage.local` do service worker — o
content script e a página nunca os enxergam.

## Instalar pra testar (antes da Chrome Web Store)

1. Chrome → `chrome://extensions` → ligar **Modo do desenvolvedor**.
2. **Carregar sem compactação** → escolher a pasta `extensao-whatsapp/`.
3. Abrir `https://web.whatsapp.com` e logar no WhatsApp.
4. Clicar no ícone da extensão → entrar com o login do CRM.
5. Abrir uma conversa de uma turma cadastrada — em ~45s as mensagens aparecem
   na aba **Conversas** da turma no CRM.

## Publicar na Chrome Web Store

1. Criar a conta de desenvolvedor (US$ 5, uma vez) em
   <https://chrome.google.com/webstore/devconsole>.
2. Zipar o conteúdo da pasta (sem a pasta pai):
   `cd extensao-whatsapp && zip -r ../amorin-whatsapp.zip . -x "*.DS_Store"`
3. Subir o zip, preencher descrição/prints, aba de privacidade:
   - dados coletados: conteúdo de mensagens de WhatsApp de contatos/grupos
     vinculados a turmas, para arquivamento interno no CRM da empresa;
   - uso restrito à operação comercial da Amor In Formaturas.
4. Distribuição **não listada** (unlisted) é suficiente — o time instala pelo link.

## Config no Supabase (já feito)

- Tabelas `conversas_whatsapp` e `conversa_grupos` (migração aplicada).
- Edge Function `whatsapp-sync` (deployada).
- Precisa da `gemini_api_key` na tabela `configuracoes` (já usada pelo resto do app).
