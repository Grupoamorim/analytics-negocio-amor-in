"""
Conclusao Automatica de Turma + Criacao da Turma Seguinte
===========================================================
Roda diariamente via GitHub Actions. Faz duas coisas:

1. Marca como "concluida" (campo proprio, independente do status do funil)
   toda turma que:
     - esta como funil_status = "Convertido" (fechou contrato)
     - e cuja Ano de Formatura (ex: "2026.2") ja passou: viramos a pagina
       pro proximo semestre em relacao ao formado da turma.
       "2026.1" conclui a partir de 01/07/2026 (vira 2026.2).
       "2026.2" conclui a partir de 01/01/2027 (vira 2027.1).

2. Quando uma turma conclui, tenta criar automaticamente a turma seguinte
   (mesmo curso/faculdade/cidade/empresa), usando a duracao do curso
   cadastrada em duracao_cursos (curso [+ faculdade opcional] -> anos).

   Formula (confirmada com o Lucas, ver CLAUDE.md):
     ano_formatura_nova = ano_formatura_antiga + duracao_do_curso + 1
     (mesmo semestre da turma antiga)

   Exemplo real (Odontologia, 5 anos): turma que forma em 2026.2 gera uma
   turma nova que vai se formar em 2032.2 (2026 + 5 + 1 = 2032, mesmo
   semestre ".2").

   Se a duracao do curso nao estiver cadastrada, a turma e marcada como
   concluida mas NENHUMA turma nova e criada automaticamente (nao
   inventamos duracao de curso) - fica registrado em observacoes pra
   revisao manual.

Nunca roda duas vezes pra mesma turma: toda turma criada automaticamente
guarda `turma_origem_id` apontando pra turma que a originou, entao antes de
criar verificamos se ja existe uma turma com aquele curso+faculdade+
cidade+empresa+ano_formatura (evita duplicar em reruns).
"""

import os
import re
import logging
from datetime import date

from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("turma_conclusao")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

ANO_FORMATURA_RE = re.compile(r"^(\d{4})\.([12])$")
TURMA_NUM_RE = re.compile(r"(\d+)")


def parse_ano_formatura(valor: str):
    if not valor:
        return None
    m = ANO_FORMATURA_RE.match(valor.strip())
    if not m:
        return None
    return int(m.group(1)), int(m.group(2))


def semestre_atual(hoje: date):
    return hoje.year, (1 if hoje.month <= 6 else 2)


def turma_ja_concluiu(ano_formatura: str, hoje: date) -> bool:
    parsed = parse_ano_formatura(ano_formatura)
    if not parsed:
        return False
    return parsed < semestre_atual(hoje)


def proxima_turma_label(turma_atual: str) -> str:
    m = TURMA_NUM_RE.search(turma_atual or "")
    if not m:
        return turma_atual or "Turma nova"
    numero = int(m.group(1)) + 1
    return TURMA_NUM_RE.sub(str(numero), turma_atual, count=1)


def buscar_duracao(sb, curso: str, faculdade: str):
    resp = (
        sb.table("duracao_cursos")
        .select("duracao_anos")
        .eq("curso", curso)
        .eq("faculdade", faculdade or "")
        .limit(1)
        .execute()
    )
    if resp.data:
        return resp.data[0]["duracao_anos"]

    resp = (
        sb.table("duracao_cursos")
        .select("duracao_anos")
        .eq("curso", curso)
        .eq("faculdade", "")
        .limit(1)
        .execute()
    )
    if resp.data:
        return resp.data[0]["duracao_anos"]

    return None


def calcular_ano_formatura_nova(ano_formatura_antiga: str, duracao_anos: int) -> str:
    ano, sem = parse_ano_formatura(ano_formatura_antiga)
    return f"{ano + duracao_anos + 1}.{sem}"


def turma_seguinte_ja_existe(sb, curso, faculdade, cidade, empresa, ano_formatura_nova) -> bool:
    resp = (
        sb.table("turmas")
        .select("id")
        .eq("curso", curso)
        .eq("faculdade", faculdade or "")
        .eq("cidade", cidade or "")
        .eq("empresa", empresa or "")
        .eq("ano_formatura", ano_formatura_nova)
        .limit(1)
        .execute()
    )
    return bool(resp.data)


def criar_turma_seguinte(sb, turma_antiga: dict, ano_formatura_nova: str):
    nome_turma_nova = proxima_turma_label(turma_antiga.get("turma") or "")
    nome_completo = " ".join(
        filter(None, [turma_antiga.get("curso"), turma_antiga.get("faculdade"), nome_turma_nova])
    ).strip() or "Turma sem nome"

    payload = {
        "codigo": f"turma-auto-{turma_antiga['id']}-{ano_formatura_nova}",
        "nome": nome_completo,
        "empresa": turma_antiga.get("empresa"),
        "curso": turma_antiga.get("curso"),
        "faculdade": turma_antiga.get("faculdade"),
        "turma": nome_turma_nova,
        "ano_formatura": ano_formatura_nova,
        "cidade": turma_antiga.get("cidade"),
        "funil_status": "Novo",
        "tipo_servico": turma_antiga.get("tipo_servico"),
        "total_alunos": 0,
        "alunos_fechados": 0,
        "turma_origem_id": turma_antiga["id"],
        "observacoes": f"Criada automaticamente a partir da turma {turma_antiga.get('turma')} "
        f"({turma_antiga.get('ano_formatura')}) ao concluir.",
    }
    sb.table("turmas").insert(payload).execute()
    log.info(
        "Turma nova criada: %s %s %s (%s) <- origem %s",
        payload["curso"],
        payload["faculdade"],
        nome_turma_nova,
        ano_formatura_nova,
        turma_antiga["id"],
    )


def processar():
    if not SUPABASE_URL or not SUPABASE_KEY:
        log.error("SUPABASE_URL / SUPABASE_SERVICE_KEY nao configurados")
        return

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    hoje = date.today()

    resp = (
        sb.table("turmas")
        .select("*")
        .eq("funil_status", "Convertido")
        .eq("concluida", False)
        .execute()
    )
    candidatas = resp.data or []
    log.info("Turmas Convertido ainda nao concluidas: %d", len(candidatas))

    concluidas = 0
    criadas = 0
    sem_duracao = 0

    for turma in candidatas:
        ano_formatura = turma.get("ano_formatura") or ""
        if not turma_ja_concluiu(ano_formatura, hoje):
            continue

        sb.table("turmas").update(
            {"concluida": True, "concluida_em": hoje.isoformat()}
        ).eq("id", turma["id"]).execute()
        concluidas += 1
        log.info(
            "Turma concluida: %s %s %s (%s)",
            turma.get("curso"),
            turma.get("faculdade"),
            turma.get("turma"),
            ano_formatura,
        )

        duracao = buscar_duracao(sb, turma.get("curso") or "", turma.get("faculdade") or "")
        if duracao is None:
            sem_duracao += 1
            log.warning(
                "Duracao nao cadastrada para curso=%r faculdade=%r - turma nova NAO criada (turma %s)",
                turma.get("curso"),
                turma.get("faculdade"),
                turma["id"],
            )
            continue

        ano_formatura_nova = calcular_ano_formatura_nova(ano_formatura, duracao)

        if turma_seguinte_ja_existe(
            sb,
            turma.get("curso"),
            turma.get("faculdade"),
            turma.get("cidade"),
            turma.get("empresa"),
            ano_formatura_nova,
        ):
            log.info("Turma seguinte ja existe (%s), pulando criacao", ano_formatura_nova)
            continue

        criar_turma_seguinte(sb, turma, ano_formatura_nova)
        criadas += 1

    log.info(
        "Resumo: %d concluidas, %d turmas novas criadas, %d sem duracao cadastrada",
        concluidas,
        criadas,
        sem_duracao,
    )


if __name__ == "__main__":
    processar()
