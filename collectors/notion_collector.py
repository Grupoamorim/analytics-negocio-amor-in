"""
Notion Collector — Amor In Formaturas
=======================================
Busca dados de TODOS os bancos do Notion e salva no Supabase.
Roda automaticamente a cada hora via GitHub Actions.
"""

import os, time, logging
from datetime import datetime
import requests
from supabase import create_client, Client

logging.basicConfig(level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("notion")

# ── Credenciais ───────────────────────────────────────────
NOTION_TOKEN  = os.getenv("NOTION_TOKEN", "")
SUPABASE_URL  = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY  = os.getenv("SUPABASE_SERVICE_KEY", "")

# IDs dos bancos Notion
DB_IDS = {
    "crm":        os.getenv("NOTION_DB_CRM", ""),
    "propostas":  os.getenv("NOTION_DB_PROPOSTAS", ""),
    "projetos":   os.getenv("NOTION_DB_PROJETOS", ""),
    "atividades": os.getenv("NOTION_DB_ATIVIDADES", ""),
    "equipe":     os.getenv("NOTION_DB_EQUIPE", ""),
    "ice":        os.getenv("NOTION_DB_ICE", ""),
    "estoque":    os.getenv("NOTION_DB_ESTOQUE", ""),
    "curadoria":  os.getenv("NOTION_DB_CURADORIA", ""),
    "eventos":    os.getenv("NOTION_DB_EVENTOS", ""),
}

HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json"
}


# ══════════════════════════════════════════════════════════
# FUNÇÕES DE EXTRAÇÃO DE PROPRIEDADES NOTION
# ══════════════════════════════════════════════════════════
def txt(prop):
    """Extrai texto de qualquer tipo de propriedade"""
    if not prop: return ""
    t = prop.get("type", "")
    if t == "title":      return "".join(x.get("plain_text","") for x in prop.get("title",[]))
    if t == "rich_text":  return "".join(x.get("plain_text","") for x in prop.get("rich_text",[]))
    if t == "select":     return (prop.get("select") or {}).get("name","")
    if t == "multi_select": return ", ".join(x.get("name","") for x in prop.get("multi_select",[]))
    if t == "email":      return prop.get("email","") or ""
    if t == "phone_number": return prop.get("phone_number","") or ""
    if t == "url":        return prop.get("url","") or ""
    if t == "checkbox":   return "sim" if prop.get("checkbox") else "não"
    if t == "people":     return ", ".join(p.get("name","") for p in prop.get("people",[]))
    if t == "relation":   return str(len(prop.get("relation",[]))) + " itens"
    if t == "formula":
        f = prop.get("formula",{})
        return str(f.get("string", f.get("number", f.get("boolean",""))))
    return ""

def num(prop):
    """Extrai número"""
    if not prop: return 0.0
    t = prop.get("type","")
    if t == "number": return float(prop.get("number") or 0)
    if t == "formula":
        f = prop.get("formula",{})
        return float(f.get("number") or 0)
    return 0.0

def dt(prop):
    """Extrai data"""
    if not prop: return None
    t = prop.get("type","")
    if t == "date":
        d = prop.get("date")
        return d.get("start") if d else None
    if t in ("created_time","last_edited_time"):
        return prop.get(t,"")[:10]
    return None

def find(props, *candidatos):
    """Encontra propriedade por nome (case-insensitive)"""
    for c in candidatos:
        if c in props: return props[c]
        for k in props:
            if k.lower() == c.lower(): return props[k]
    return {}


# ══════════════════════════════════════════════════════════
# BUSCA NO NOTION (com paginação automática)
# ══════════════════════════════════════════════════════════
def buscar_banco(db_id, nome):
    """Busca todos os registros de um banco Notion"""
    if not db_id or db_id == "pendente":
        log.info(f"  ⏭  {nome}: sem ID configurado, pulando")
        return []

    url = f"https://api.notion.com/v1/databases/{db_id}/query"
    todos, cursor = [], None

    while True:
        body = {"page_size": 100}
        if cursor: body["start_cursor"] = cursor
        r = requests.post(url, headers=HEADERS, json=body, timeout=30)

        if r.status_code == 401:
            log.error(f"  ✗ {nome}: token inválido")
            return []
        if r.status_code == 404:
            log.error(f"  ✗ {nome}: banco não encontrado — conectou a integração?")
            return []
        if r.status_code != 200:
            log.error(f"  ✗ {nome}: erro {r.status_code}")
            return []

        data = r.json()
        todos.extend(data.get("results", []))
        if not data.get("has_more"): break
        cursor = data.get("next_cursor")
        time.sleep(0.35)

    log.info(f"  ✓ {nome}: {len(todos)} registros")
    return todos


# ══════════════════════════════════════════════════════════
# CONVERSORES — um por banco
# ══════════════════════════════════════════════════════════
def converter_crm(pagina):
    p = pagina.get("properties", {})
    return {
        "notion_id": pagina["id"],
        "nome":            txt(find(p, "Nome","Name","Cliente","Título","Lead")),
        "email":           txt(find(p, "Email","E-mail")),
        "telefone":        txt(find(p, "Telefone","Tel","WhatsApp","Celular")),
        "status":          txt(find(p, "Status","Estágio","Stage","Pipeline")),
        "turma_interesse": txt(find(p, "Turma","Turma de Interesse","Evento")),
        "valor_estimado":  num(find(p, "Valor","Ticket","Valor Estimado")),
        "data_contato":    dt(find(p, "Data","Data do Contato","Created","Criado")),
        "responsavel":     txt(find(p, "Responsável","Owner","Vendedor")),
        "notas":           txt(find(p, "Notas","Obs","Observações","Notes")),
        "raw_data": {k: txt(v) for k,v in list(p.items())[:20]},
        "updated_at": datetime.now().isoformat()
    }

def converter_projetos(pagina):
    p = pagina.get("properties", {})
    return {
        "notion_id": pagina["id"],
        "nome":        txt(find(p, "Nome","Name","Projeto","Título")),
        "status":      txt(find(p, "Status","Situação")),
        "cliente":     txt(find(p, "Cliente","Turma","Empresa")),
        "data_inicio": dt(find(p, "Data início","Início","Start")),
        "data_fim":    dt(find(p, "Data fim","Fim","End","Entrega")),
        "valor":       num(find(p, "Valor","Receita","Budget")),
        "responsavel": txt(find(p, "Responsável","Owner","Fotógrafo")),
        "raw_data": {k: txt(v) for k,v in list(p.items())[:20]},
        "updated_at": datetime.now().isoformat()
    }

def converter_atividades(pagina):
    p = pagina.get("properties", {})
    return {
        "notion_id": pagina["id"],
        "titulo":      txt(find(p, "Nome","Name","Título","Atividade","Tarefa")),
        "tipo":        txt(find(p, "Tipo","Categoria","Type")),
        "status":      txt(find(p, "Status","Situação","Done")),
        "data":        dt(find(p, "Data","Date","Prazo","Vencimento")),
        "responsavel": txt(find(p, "Responsável","Pessoa","Owner")),
        "projeto":     txt(find(p, "Projeto","Turma","Relacionado")),
        "raw_data": {k: txt(v) for k,v in list(p.items())[:20]},
        "updated_at": datetime.now().isoformat()
    }

def converter_equipe(pagina):
    p = pagina.get("properties", {})
    return {
        "notion_id": pagina["id"],
        "nome":   txt(find(p, "Nome","Name","Pessoa")),
        "cargo":  txt(find(p, "Cargo","Função","Role","Posição")),
        "status": txt(find(p, "Status","Situação","Ativo")),
        "email":  txt(find(p, "Email","E-mail")),
        "raw_data": {k: txt(v) for k,v in list(p.items())[:20]},
        "updated_at": datetime.now().isoformat()
    }

def converter_ice(pagina):
    p = pagina.get("properties", {})
    imp = num(find(p, "Impacto","Impact","I"))
    con = num(find(p, "Confiança","Confidence","C"))
    fac = num(find(p, "Facilidade","Ease","E","F"))
    score = round((imp + con + fac) / 3, 2) if (imp or con or fac) else num(find(p, "Score","ICE"))
    return {
        "notion_id":  pagina["id"],
        "titulo":     txt(find(p, "Nome","Name","Ideia","Título")),
        "impacto":    int(imp),
        "confianca":  int(con),
        "facilidade": int(fac),
        "score":      score,
        "status":     txt(find(p, "Status","Situação")),
        "raw_data": {k: txt(v) for k,v in list(p.items())[:20]},
        "updated_at": datetime.now().isoformat()
    }

def converter_estoque(pagina):
    p = pagina.get("properties", {})
    return {
        "notion_id":   pagina["id"],
        "equipamento": txt(find(p, "Nome","Name","Equipamento","Item")),
        "status":      txt(find(p, "Status","Situação","Condição")),
        "quantidade":  int(num(find(p, "Quantidade","Qtd","Qtde"))),
        "responsavel": txt(find(p, "Responsável","Owner")),
        "raw_data": {k: txt(v) for k,v in list(p.items())[:20]},
        "updated_at": datetime.now().isoformat()
    }

def converter_curadoria(pagina):
    p = pagina.get("properties", {})
    return {
        "notion_id":  pagina["id"],
        "titulo":     txt(find(p, "Nome","Name","Título","Conteúdo")),
        "categoria":  txt(find(p, "Categoria","Tipo","Type","Tag")),
        "status":     txt(find(p, "Status","Situação")),
        "url":        txt(find(p, "URL","Link","Fonte")),
        "notas":      txt(find(p, "Notas","Obs","Descrição","Notes")),
        "raw_data": {k: txt(v) for k,v in list(p.items())[:20]},
        "updated_at": datetime.now().isoformat()
    }

def converter_propostas(pagina):
    p = pagina.get("properties", {})
    return {
        "notion_id":       pagina["id"],
        "nome":            txt(find(p, "Nome","Name","Cliente","Título","Lead")),
        "email":           txt(find(p, "Email","E-mail")),
        "telefone":        txt(find(p, "Telefone","Tel","WhatsApp","Celular")),
        "status":          txt(find(p, "Status","Estágio","Stage","Pipeline")),
        "turma_interesse": txt(find(p, "Turma","Turma de Interesse","Evento")),
        "valor_estimado":  num(find(p, "Valor","Ticket","Valor Estimado","Proposta")),
        "data_contato":    dt(find(p, "Data","Data do Contato","Created","Criado")),
        "responsavel":     txt(find(p, "Responsável","Owner","Vendedor")),
        "notas":           txt(find(p, "Notas","Obs","Observações","Notes")),
        "raw_data": {k: txt(v) for k,v in list(p.items())[:20]},
        "updated_at": datetime.now().isoformat()
    }

def converter_eventos(pagina):
    p = pagina.get("properties", {})
    return {
        "notion_id":  pagina["id"],
        "titulo":     txt(find(p, "Nome","Name","Título","Evento","Atividade")),
        "tipo":       txt(find(p, "Tipo","Categoria","Type","Tag")),
        "status":     txt(find(p, "Status","Situação")),
        "data":       dt(find(p, "Data","Date","Início","Start","Prazo")),
        "data_fim":   dt(find(p, "Data fim","Fim","End")),
        "projeto":    txt(find(p, "Projeto","Turma","Relacionado","Cliente")),
        "responsavel":txt(find(p, "Responsável","Owner","Pessoa")),
        "raw_data": {k: txt(v) for k,v in list(p.items())[:20]},
        "updated_at": datetime.now().isoformat()
    }


# ══════════════════════════════════════════════════════════
# SALVAR NO SUPABASE
# ══════════════════════════════════════════════════════════
def salvar(sb, tabela, registros, chave="notion_id"):
    validos = [r for r in registros if r.get(chave) and r.get(chave) != ""]
    if not validos:
        log.info(f"  Nenhum registro válido para {tabela}")
        return 0
    try:
        res = sb.table(tabela).upsert(validos, on_conflict=chave).execute()
        count = len(res.data) if res.data else 0
        log.info(f"  ✓ {tabela}: {count} salvos")
        return count
    except Exception as e:
        log.error(f"  ✗ {tabela}: {e}")
        return 0


# ══════════════════════════════════════════════════════════
# PRINCIPAL
# ══════════════════════════════════════════════════════════
def main():
    inicio = time.time()
    log.info("=" * 50)
    log.info("Notion Collector — Amor In Formaturas")
    log.info(f"Horário: {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    log.info("=" * 50)

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    total = 0

    # Mapa: nome_banco → (ID, conversor, tabela_supabase)
    bancos = [
        ("CRM/Leads",    DB_IDS["crm"],        converter_crm,        "crm_notion"),
        ("Propostas",    DB_IDS["propostas"],   converter_propostas,  "notion_propostas"),
        ("Projetos",     DB_IDS["projetos"],    converter_projetos,   "notion_projetos"),
        ("Atividades",   DB_IDS["atividades"],  converter_atividades, "notion_atividades"),
        ("Equipe",       DB_IDS["equipe"],      converter_equipe,     "notion_equipe"),
        ("ICE Score",    DB_IDS["ice"],         converter_ice,        "notion_ice"),
        ("Estoque",      DB_IDS["estoque"],     converter_estoque,    "notion_estoque"),
        ("Curadoria",    DB_IDS["curadoria"],   converter_curadoria,  "notion_curadoria"),
        ("Eventos",      DB_IDS["eventos"],     converter_eventos,    "notion_eventos"),
    ]

    for nome, db_id, conversor, tabela in bancos:
        log.info(f"\n📋 {nome}...")
        paginas = buscar_banco(db_id, nome)
        if paginas:
            # Mostra campos disponíveis na primeira página (ajuda no diagnóstico)
            campos = list(paginas[0].get("properties", {}).keys())
            log.info(f"  Campos: {campos[:10]}")
            registros = [conversor(p) for p in paginas]
            total += salvar(sb, tabela, registros)

    duracao = time.time() - inicio
    log.info(f"\n✅ Concluído: {total} registros em {duracao:.1f}s")

    try:
        sb.table("sync_log").insert({
            "fonte": "notion", "status": "sucesso",
            "registros_atualizados": total,
            "mensagem": f"7 bancos sincronizados",
            "duracao_segundos": round(duracao, 2)
        }).execute()
    except: pass


if __name__ == "__main__":
    main()
