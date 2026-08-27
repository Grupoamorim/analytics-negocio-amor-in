"""
Backup diario - banco + codigo -> Google Drive
================================================
Substitui a rotina que rodava como agente Claude na nuvem (RemoteTrigger),
que levava 1h+ e gastava muito token do Claude todo dia so pra copiar dados.
Este script faz a mesma coisa em codigo puro (nenhuma IA envolvida - e so
export de dados) via GitHub Actions, de graca.

Regras (aprendidas nas execucoes antigas via agente, mantidas aqui):
  - Nunca duplicar: cada tabela/arquivo tem nome deterministico
    (backup-banco-<tabela>-01.json, backup-codigo-parte-001.txt, ...);
    se ja existe um arquivo com esse nome no Drive, o CONTEUDO e
    substituido (nunca cria copia nova).
  - Arquivos orfaos (de quando a tabela/codigo era maior) sao apagados
    (movidos pra lixeira) no fim de cada execucao.
  - Nunca faz zip/base64 - sempre texto puro (json/txt).
  - Exclui a tabela `configuracoes` (guarda token do SGE / chave do
    Gemini) e `web/package-lock.json` (reproduzivel via npm install).
"""

import os
import io
import json
import logging
from pathlib import Path

import google.auth
from supabase import create_client
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("backup_diario")

SUPABASE_URL           = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY           = os.getenv("SUPABASE_SERVICE_KEY", "")
DRIVE_BACKUP_FOLDER_ID = os.getenv("DRIVE_BACKUP_FOLDER_ID", "18W3ElLk_qRx6qB68On0wDV1T9j9q6mrZ")

CHUNK_BYTES = 25000
PAGE_SIZE = 1000

REPO_ROOT = Path(__file__).resolve().parent.parent
DIRS_EXCLUIDOS = {"node_modules", ".git", "__pycache__"}
ARQUIVOS_EXCLUIDOS = {"web/package-lock.json"}
EXTENSOES_BINARIAS = {
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".bmp", ".svg",
    ".pdf", ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".mp4", ".mov", ".avi", ".zip", ".gz", ".tar",
    ".db", ".sqlite", ".sqlite3", ".pyc",
}

TABELAS = [
    "captacao_leads", "clientes", "contas_pagar", "contatos", "crm_notion",
    "deals", "duracao_cursos", "mercado_faculdades", "metas", "motivos_perda",
    "notas", "notificacoes", "notion_atividades", "notion_curadoria",
    "notion_equipe", "notion_estoque", "notion_eventos", "notion_ice",
    "notion_projetos", "notion_propostas", "pacote_itens_catalogo",
    "pacote_templates", "pacotes_turma", "pagamentos", "parametros_custo_turma",
    "profiles", "sge_adesoes", "sge_cobranca", "sge_contas", "sge_contas_pagar",
    "sge_contas_receber", "sge_fluxo_caixa", "sge_vendas", "stage_transitions",
    "sync_log", "transcricoes", "turmas", "vendas", "vendedores",
]
# `configuracoes` fica de fora de proposito (guarda credenciais).


def get_supabase():
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def exportar_tabela(sb, tabela):
    linhas = []
    inicio = 0
    while True:
        r = sb.table(tabela).select("*").range(inicio, inicio + PAGE_SIZE - 1).execute()
        pagina = r.data or []
        linhas.extend(pagina)
        if len(pagina) < PAGE_SIZE:
            break
        inicio += PAGE_SIZE
    return linhas


def chunk_rows(rows, prefix):
    arquivos = []
    atual_strs = []
    tamanho = 2
    idx = 1
    for row in rows:
        s = json.dumps(row, ensure_ascii=False, default=str)
        acrescimo = len(s.encode("utf-8")) + 1
        if atual_strs and tamanho + acrescimo > CHUNK_BYTES:
            arquivos.append((f"backup-banco-{prefix}-{idx:02d}.json", "[" + ",".join(atual_strs) + "]"))
            idx += 1
            atual_strs = []
            tamanho = 2
        atual_strs.append(s)
        tamanho += acrescimo
    if atual_strs or idx == 1:
        arquivos.append((f"backup-banco-{prefix}-{idx:02d}.json", "[" + ",".join(atual_strs) + "]"))
    return arquivos


def deve_incluir_arquivo(caminho_relativo):
    if str(caminho_relativo) in ARQUIVOS_EXCLUIDOS:
        return False
    if caminho_relativo.name == ".DS_Store":
        return False
    if caminho_relativo.suffix.lower() in EXTENSOES_BINARIAS:
        return False
    return True


def listar_arquivos_codigo():
    arquivos = []
    for caminho in sorted(REPO_ROOT.rglob("*")):
        if not caminho.is_file():
            continue
        relativo = caminho.relative_to(REPO_ROOT)
        if any(parte in DIRS_EXCLUIDOS for parte in relativo.parts):
            continue
        if not deve_incluir_arquivo(relativo):
            continue
        try:
            conteudo = caminho.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        arquivos.append((str(relativo), conteudo))
    return arquivos


def chunk_codigo(arquivos):
    blocos = []
    atual = []
    tamanho = 0
    idx = 1
    for caminho, conteudo in arquivos:
        bloco = f"=== FILE: {caminho} ===\n{conteudo}\n\n"
        tam_bloco = len(bloco.encode("utf-8"))
        if atual and tamanho + tam_bloco > CHUNK_BYTES:
            blocos.append((f"backup-codigo-parte-{idx:03d}.txt", "".join(atual)))
            idx += 1
            atual = []
            tamanho = 0
        atual.append(bloco)
        tamanho += tam_bloco
    if atual:
        blocos.append((f"backup-codigo-parte-{idx:03d}.txt", "".join(atual)))
    return blocos


def get_drive_service():
    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/drive"])
    return build("drive", "v3", credentials=creds)


def listar_arquivos_drive(drive, folder_id):
    existentes = {}
    cursor = None
    while True:
        resp = drive.files().list(
            q=f"'{folder_id}' in parents and trashed = false",
            fields="nextPageToken, files(id, name)",
            pageToken=cursor,
        ).execute()
        for f in resp.get("files", []):
            existentes[f["name"]] = f["id"]
        cursor = resp.get("nextPageToken")
        if not cursor:
            break
    return existentes


def enviar_para_drive(drive, folder_id, nome, conteudo, mimetype, existentes):
    media = MediaIoBaseUpload(io.BytesIO(conteudo.encode("utf-8")), mimetype=mimetype, resumable=False)
    if nome in existentes:
        drive.files().update(fileId=existentes[nome], media_body=media).execute()
    else:
        novo = drive.files().create(body={"name": nome, "parents": [folder_id]}, media_body=media, fields="id").execute()
        existentes[nome] = novo["id"]


def limpar_orfaos(drive, existentes, nomes_atuais, prefixos):
    for nome, file_id in list(existentes.items()):
        if any(nome.startswith(p) for p in prefixos) and nome not in nomes_atuais:
            drive.files().update(fileId=file_id, body={"trashed": True}).execute()
            log.info(f"  órfão removido do Drive: {nome}")


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        log.error("SUPABASE_URL / SUPABASE_SERVICE_KEY não configurados - abortando.")
        return

    sb = get_supabase()
    drive = get_drive_service()
    existentes = listar_arquivos_drive(drive, DRIVE_BACKUP_FOLDER_ID)
    nomes_atuais = set()

    total_linhas = 0
    log.info(f"Exportando {len(TABELAS)} tabelas do Supabase...")
    for tabela in TABELAS:
        try:
            linhas = exportar_tabela(sb, tabela)
        except Exception as e:
            log.error(f"  erro exportando '{tabela}': {e}")
            continue
        total_linhas += len(linhas)
        for nome, conteudo in chunk_rows(linhas, tabela):
            enviar_para_drive(drive, DRIVE_BACKUP_FOLDER_ID, nome, conteudo, "application/json", existentes)
            nomes_atuais.add(nome)
        log.info(f"  {tabela}: {len(linhas)} linha(s)")

    log.info("Empacotando código-fonte...")
    arquivos_codigo = listar_arquivos_codigo()
    blocos_codigo = chunk_codigo(arquivos_codigo)
    for nome, conteudo in blocos_codigo:
        enviar_para_drive(drive, DRIVE_BACKUP_FOLDER_ID, nome, conteudo, "text/plain", existentes)
        nomes_atuais.add(nome)
    log.info(f"  {len(arquivos_codigo)} arquivo(s) de código em {len(blocos_codigo)} parte(s)")

    limpar_orfaos(drive, existentes, nomes_atuais, ("backup-banco-", "backup-codigo-parte-"))

    log.info(f"OK: {total_linhas} linhas de banco + {len(arquivos_codigo)} arquivos de código enviados ao Drive.")


if __name__ == "__main__":
    main()
