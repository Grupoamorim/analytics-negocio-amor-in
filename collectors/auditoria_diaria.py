"""
Auditoria diária de saúde do sistema
=====================================
Roda 1x/dia às 07h (Brasília) via GitHub Actions e manda um e-mail resumo pro
Lucas com qualquer coisa que precise de atenção: sync do SGE atrasado, tabela
nova sem política de RLS (fica invisível pro app sem erro nenhum — foi o que
aconteceu com `clientes` até 2026-09-15), cliente com adesão real mas sem
turma vinculada, ou resíduo de duplicata em contas a pagar.

Toda a lógica de verificação mora na função `auditoria_saude_diaria()` no
Supabase (não aqui) — pra poder ser consultada manualmente a qualquer hora
direto no SQL Editor, sem depender deste script. Este script só busca o
resultado, decide severidade e manda o e-mail (mesmo padrão de
`buscar_resend_key`/`enviar_email` de sge_auto_win.py).
"""

import os
import logging
from datetime import datetime, timezone

import requests
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("auditoria_diaria")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

RESEND_FROM = "Amor In Formaturas <onboarding@resend.dev>"
LUCAS_EMAIL = "adm@lucasamorim.com.br"

# Tabelas internas conhecidas — usadas só pelos coletores (service role, que
# ignora RLS) ou já confirmadas vazias/legado. Aparecer aqui não é alarme,
# só informativo; qualquer tabela FORA dessa lista com RLS sem policy é
# tratada como crítico.
TABELAS_RLS_CONHECIDAS_SEM_RISCO = {"metas", "notion_eventos", "sync_log"}

# Sync do SGE roda a cada 3h (sync-financeiro.yml, era 12h até 2026-09-17) — acima
# disso já é atraso real (folga de 2 execuções pra cobrir workflow lento/retry).
LIMITE_ATRASO_SYNC_HORAS = 6


def buscar_resend_key(sb):
    resp = (
        sb.table("configuracoes")
        .select("resend_api_key")
        .not_.is_("resend_api_key", "null")
        .limit(1)
        .execute()
    )
    return resp.data[0].get("resend_api_key") if resp.data else None


def enviar_email(sb, destinatario: str, assunto: str, html: str):
    api_key = buscar_resend_key(sb)
    if not api_key:
        log.warning("resend_api_key nao configurado - pulando envio de e-mail.")
        return
    try:
        r = requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"from": RESEND_FROM, "to": [destinatario], "subject": assunto, "html": html},
            timeout=15,
        )
        if r.status_code >= 300:
            log.error(f"Erro ao enviar e-mail via Resend: {r.status_code} {r.text[:200]}")
        else:
            log.info("E-mail de auditoria enviado.")
    except Exception as e:
        log.error(f"Erro ao chamar Resend: {e}")


def horas_desde(iso_ts: str | None) -> float | None:
    if not iso_ts:
        return None
    dt = datetime.fromisoformat(iso_ts.replace("Z", "+00:00"))
    return (datetime.now(timezone.utc) - dt).total_seconds() / 3600


def fmt_horas(h: float | None) -> str:
    if h is None:
        return "sem registro"
    if h < 1:
        return f"{int(h * 60)} min atrás"
    return f"{h:.1f}h atrás"


def montar_email(r: dict) -> tuple[str, bool]:
    """Retorna (html, tem_alerta). tem_alerta=False manda um resumo curto de tudo ok."""
    criticos = []
    avisos = []
    info = []

    # RLS sem policy
    tabelas_rls = r.get("tabelas_rls_sem_policy") or []
    novas_sem_risco = [t for t in tabelas_rls if t not in TABELAS_RLS_CONHECIDAS_SEM_RISCO]
    if novas_sem_risco:
        criticos.append(
            f"<b>{len(novas_sem_risco)} tabela(s) com RLS habilitado e SEM NENHUMA política</b>: "
            f"{', '.join(novas_sem_risco)}. Isso deixa a tabela invisível pro app (sempre retorna "
            f"vazio, sem erro) — foi exatamente o bug que zerou a tela Clientes até 2026-09-15. "
            f"Precisa de uma policy de SELECT (e UPDATE se for editável) o quanto antes."
        )
    conhecidas = [t for t in tabelas_rls if t in TABELAS_RLS_CONHECIDAS_SEM_RISCO]
    if conhecidas:
        info.append(f"Tabelas internas sem policy (uso só do coletor, sem risco conhecido): {', '.join(conhecidas)}.")

    # Sync atrasado
    syncs = {
        "Contas a Receber (SGE)": r.get("ultima_sync_contas_receber"),
        "Adesões (SGE)": r.get("ultima_sync_adesoes"),
        "Vendas (SGE)": r.get("ultima_sync_vendas"),
        "Contas a Pagar (SGE)": r.get("ultima_sync_contas_pagar"),
    }
    for nome, ts in syncs.items():
        h = horas_desde(ts)
        if h is None:
            avisos.append(f"{nome}: nunca sincronizado.")
        elif h > LIMITE_ATRASO_SYNC_HORAS:
            avisos.append(f"{nome}: última atualização {fmt_horas(h)} (esperado a cada 3h) — possível falha no sync automático.")
        else:
            info.append(f"{nome}: ok, {fmt_horas(h)}.")

    # Clientes com adesão sem turma
    sem_turma = r.get("clientes_com_adesao_sem_turma") or 0
    if sem_turma > 0:
        avisos.append(
            f"{sem_turma} cliente(s) com adesão real no SGE ainda sem turma vinculada — não entram em "
            f"'alunos fechados' de nenhuma turma. Normal ter alguns (adesão muito recente, sync ainda não "
            f"processou); se o número ficar alto/crescendo, vale investigar."
        )

    # Duplicata residual em contas a pagar
    dup_cp = r.get("duplicatas_contas_pagar_xlsx_vs_sync") or 0
    if dup_cp > 0:
        criticos.append(
            f"{dup_cp} duplicata(s) voltou(aram) a aparecer entre o import manual e o auto-sync em "
            f"contas a pagar (mesmo padrão corrigido em 2026-09-15) — o guard de reconciliação pode "
            f"ter parado de funcionar."
        )

    # Blindagem adicionada em 2026-09-17 depois da auditoria geral de duplicação (Adesões
    # mostrando 50 no lugar de 28) — mesma classe de bug (duas fontes/dois codigo_sge pro mesmo
    # evento real) em 4 lugares diferentes. Checa aqui pra avisar ANTES de virar número errado
    # na tela, em vez de descobrir por acaso de novo.
    dup_turmas = r.get("turmas_duplicadas_sem_link") or 0
    if dup_turmas > 0:
        criticos.append(
            f"{dup_turmas} turma(s) com curso+faculdade+turma+ano+cidade EXATAMENTE iguais mas "
            f"codigo do SGE diferente, sem estar marcada como 'mesma turma física' de nenhuma outra "
            f"— conta em dobro em qualquer lugar que soma 'turmas ganhas' (Market Share, ranking, "
            f"Contratos Fechados). Ver Turmas (Leads.tsx) e usar o campo mesma_turma_fisica_de pra "
            f"linkar, sem apagar nenhuma."
        )

    dup_adesoes = r.get("duplicatas_adesoes_manual_vs_sync") or 0
    if dup_adesoes > 0:
        criticos.append(
            f"{dup_adesoes} adesão(ões) duplicada(s) entre a importação manual de 15/09 e o sync ao "
            f"vivo do SGE (mesmo padrão corrigido em 2026-09-17) — o trigger "
            f"trg_reconcilia_adesoes_manuais pode ter parado de rodar."
        )

    dup_clientes = r.get("duplicatas_clientes_mesma_turma") or 0
    if dup_clientes > 0:
        avisos.append(
            f"{dup_clientes} cliente(s) duplicado(s) (mesma turma+nome, codigo_sge diferente) — "
            f"infla contagem de alunos fechados e cria contato duplicado. Corrigido manualmente em "
            f"2026-09-17; se voltar a aparecer, investigar de onde vem o codigo_sge não-CPF."
        )

    dup_receber = r.get("duplicatas_contas_receber_hash_vs_idlancamento") or 0
    if dup_receber > 0:
        avisos.append(
            f"{dup_receber} parcela(s) duplicada(s) em contas a receber (código antigo de hash vs "
            f"IdLancamento real do SGE) — mesmo padrão de 603 casos limpos em 2026-09-17. Infla "
            f"contas a receber/projeções, não afeta receita já reconhecida (nenhuma paga até agora)."
        )

    tem_alerta = bool(criticos or avisos)

    def bloco(titulo, itens, cor):
        if not itens:
            return ""
        lis = "".join(f"<li style='margin-bottom:6px'>{i}</li>" for i in itens)
        return f"<h3 style='color:{cor};margin-bottom:6px'>{titulo}</h3><ul style='margin-top:0'>{lis}</ul>"

    corpo = (
        bloco("🔴 Crítico — precisa de ação", criticos, "#c0392b")
        + bloco("🟡 Atenção", avisos, "#b8860b")
        + bloco("ℹ️ Informativo", info, "#555")
    )

    rodape = (
        f"<p style='color:#888;font-size:12px;margin-top:20px'>"
        f"Base atual: {r.get('turmas_total')} turmas · {r.get('clientes_total')} clientes · "
        f"{r.get('pagamentos_total')} pagamentos registrados. Gerado em {r.get('gerado_em')}."
        f"</p>"
    )

    html = f"<div style='font-family:sans-serif;font-size:14px;line-height:1.5'>{corpo}{rodape}</div>"
    return html, tem_alerta


def main():
    if not (SUPABASE_URL and SUPABASE_KEY):
        log.error("SUPABASE_URL/SUPABASE_SERVICE_KEY não configurados - abortando.")
        return

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    resp = sb.rpc("auditoria_saude_diaria").execute()
    r = resp.data or {}
    if not r:
        log.error("auditoria_saude_diaria() não retornou nada.")
        return

    html, tem_alerta = montar_email(r)
    hoje = datetime.now(timezone.utc).strftime("%d/%m/%Y")
    assunto = f"{'⚠️ Auditoria diária' if tem_alerta else '✅ Auditoria diária'} — {hoje}"
    enviar_email(sb, LUCAS_EMAIL, assunto, html)
    log.info(f"Auditoria concluída. Alerta: {tem_alerta}.")


if __name__ == "__main__":
    main()
