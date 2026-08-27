"""
SGE Auto-Win - Deteccao automatica de turma fechada
=====================================================
Ate aqui essa deteccao so acontecia quando alguem clicava manualmente em
"Sincronizar SGE" na pagina Turmas (web/src/pages/Leads.tsx, handleSyncSGE).
Este script replica exatamente a mesma logica (mesma janela de 90 dias,
mesmo algoritmo de normalizacao/match de nome de turma, mesmo criterio de
Auto-Win) e roda sozinho via GitHub Actions, sem precisar de ninguem
clicar em nada.

Logica portada 1:1 de:
  - web/src/utils/sgeIntegration.ts (extractTurmaNameFromVenda,
    extractCodeFromVenda, normalizeNameForComparison, fetchSGEVendas)
  - web/src/pages/Leads.tsx (handleSyncSGE)
  - web/src/types/crm.ts (getTurmaDisplayName)

Diferenca proposital: alem dos campos de topo que o botao manual olhava,
aqui tambem verificamos os sub-objetos "Cliente"/"Projeto" da venda (mesma
descoberta feita em sge_collector.py: a API do SGE quase sempre devolve o
nome real da turma aninhado em Projeto.Descricao, nao no campo de topo).
Isso so aumenta a taxa de match - nunca marca algo que o botao manual nao
marcaria.
"""

import os
import re
import time
import base64
import logging
import unicodedata
from datetime import date, datetime, timedelta

import requests
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sge_auto_win")

SGE_CNPJ = os.getenv("SGE_CNPJ", "").strip()
SGE_TOKEN = os.getenv("SGE_TOKEN", "").strip()
SGE_BASE_URL = "https://e-api.sge.com.br"
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

STAGE_FECHOU = "stage-6"  # id real do estágio "Fechou ou Perdeu" no front (FUNNEL_STAGES)


def get_headers():
    cred = base64.b64encode(f"{SGE_CNPJ}:{SGE_TOKEN}".encode()).decode()
    return {"Authorization": f"Basic {cred}", "Accept": "application/json"}


def fetch_sge_vendas(data_ini: date, data_fim: date):
    url = f"{SGE_BASE_URL}/api/emp/venda/listar-vendas-por-periodo"
    params = {"PeriodoInicial": data_ini.strftime("%Y-%m-%d"), "PeriodoFinal": data_fim.strftime("%Y-%m-%d")}
    for tentativa in range(3):
        try:
            r = requests.get(url, headers=get_headers(), params=params, timeout=20)
            if r.status_code == 200:
                dados = r.json()
                if isinstance(dados, list):
                    return dados
                if isinstance(dados, dict):
                    for chave in ("items", "data", "Vendas", "vendas"):
                        if isinstance(dados.get(chave), list):
                            return dados[chave]
                return []
            if r.status_code in (401, 403):
                raise RuntimeError("Credenciais SGE invalidas (401/403).")
            log.warning(f"  HTTP {r.status_code} ao buscar vendas (tent {tentativa + 1})")
            time.sleep(10)
        except requests.RequestException as e:
            log.warning(f"  Erro de rede ao buscar vendas: {e} (tent {tentativa + 1})")
            time.sleep(10)
    raise RuntimeError("Falha ao buscar vendas do SGE apos 3 tentativas.")


def sub(item, chave):
    valor = item.get(chave) if isinstance(item, dict) else None
    return valor if isinstance(valor, dict) else {}


def extract_turma_name_from_venda(venda: dict) -> str:
    # Mesma ordem de prioridade de campos de topo que extractTurmaNameFromVenda (sgeIntegration.ts)
    for chave in (
        "Turma/Evento/Projeto", "Turma / Evento / Projeto", "Turma", "Evento",
        "Projeto", "turma", "evento", "projeto", "Descricao", "Nome",
    ):
        valor = venda.get(chave)
        if isinstance(valor, str) and valor.strip():
            return valor.strip()
    # Fallback: nome real costuma estar aninhado em Projeto.Descricao (ver sge_collector.py)
    p = sub(venda, "Projeto")
    valor = p.get("Descricao") or p.get("Nome")
    if isinstance(valor, str) and valor.strip():
        return valor.strip()
    return ""


def extract_code_from_venda(venda: dict) -> str:
    for chave in ("Codigo", "Id", "codigo", "id", "CodigoProjeto", "IdProjeto"):
        valor = venda.get(chave)
        if valor not in (None, ""):
            return str(valor).strip()
    return ""


def normalize_for_comparison(nome: str) -> str:
    if not nome:
        return ""
    n = nome.lower()
    n = unicodedata.normalize("NFD", n)
    n = "".join(c for c in n if unicodedata.category(c) != "Mn")
    n = re.sub(r"[^a-z0-9]", " ", n)
    n = re.sub(r"\s+", " ", n).strip()
    return n


def get_turma_display_name(curso: str, faculdade: str, turma: str) -> str:
    curso = (curso or "").strip()
    faculdade = (faculdade or "").strip()
    turma_num = re.sub(r"^Turma\s+", "", turma or "", flags=re.IGNORECASE).strip()
    curso_curto = curso[:13] + "." if len(curso) > 14 else curso
    fac_curta = faculdade[:9] + "." if len(faculdade) > 10 else faculdade
    turma_sufixo = f" T{turma_num}" if turma_num else ""
    base = " ".join(x for x in [curso_curto, fac_curta] if x)
    resultado = f"{base}{turma_sufixo}".strip()
    return resultado or "Turma sem nome"


def fetch_all_rows(sb, tabela: str, colunas: str, order_col: str = None, desc: bool = False):
    todos = []
    inicio = 0
    tamanho_pagina = 1000
    while True:
        q = sb.table(tabela).select(colunas)
        if order_col:
            q = q.order(order_col, desc=desc)
        q = q.range(inicio, inicio + tamanho_pagina - 1)
        res = q.execute()
        linhas = res.data or []
        todos.extend(linhas)
        if len(linhas) < tamanho_pagina:
            break
        inicio += tamanho_pagina
    return todos


def _tokens_contained(a: str, b: str) -> bool:
    """True se os tokens de `a` aparecem como subsequencia continua dentro de
    `b` (ou vice-versa). Compara token inteiro, nao substring de caracteres -
    evita falso positivo tipo "turma 1" casando dentro de "turma 13" (que
    aconteceria com containment de string cru: "turma 1" in "turma 13")."""
    ta, tb = a.split(), b.split()
    if not ta or not tb:
        return False
    curto, longo = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    n = len(curto)
    return any(longo[i:i + n] == curto for i in range(len(longo) - n + 1))


def build_turma_variations(turma: dict) -> list:
    curso = turma.get("curso") or ""
    faculdade = turma.get("faculdade") or ""
    turma_num = turma.get("turma") or ""
    ano = turma.get("ano_formatura") or ""
    cidade = turma.get("cidade") or ""
    empresa = turma.get("empresa") or ""

    full1 = f"{empresa} {curso} {faculdade} {turma_num} {ano} {cidade}".strip()
    full2 = f"{curso} {faculdade} {turma_num} {ano} {cidade}".strip()
    full3 = f"{curso} {faculdade} {turma_num}".strip()
    full4 = get_turma_display_name(curso, faculdade, turma_num)

    return [normalize_for_comparison(v) for v in (full1, full2, full3, full4)]


RESEND_FROM = "Amor In Formaturas <onboarding@resend.dev>"
LUCAS_EMAIL = "adm@lucasamorim.com.br"

# Formato padrao da descricao de projeto no SGE (bate com getFullTurmaName()
# do site): "Empresa Curso Faculdade turma N ANO.SEM Cidade [Turno opcional]".
# So cria turma automaticamente quando o texto bate 100% com isso - qualquer
# coisa fora do padrao vai pro e-mail pro Lucas revisar, nunca adivinhamos.
PADRAO_DESCRICAO_TURMA = re.compile(
    r"^(?P<empresa>AIF-V|AIF|AFF|SFF)\s+(?P<curso>.+?)\s+(?P<faculdade>\S+)\s+turma\s+"
    r"(?P<turmanum>\S+)\s+(?P<ano>\d{4}\.[12])\s*(?P<cidade>.*)$",
    re.IGNORECASE,
)


def parse_descricao_projeto(descricao: str):
    m = PADRAO_DESCRICAO_TURMA.match((descricao or "").strip())
    if not m:
        return None
    cidade = re.sub(
        r"\s+(Matutino|Noturno|Vespertino)\s*$", "", m.group("cidade").strip(), flags=re.IGNORECASE
    ).strip()
    return {
        "empresa": m.group("empresa").upper(),
        "curso": m.group("curso").strip(),
        "faculdade": m.group("faculdade").strip(),
        "turma": f"Turma {m.group('turmanum').strip()}",
        "ano_formatura": m.group("ano"),
        "cidade": cidade or None,
    }


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
    except Exception as e:
        log.error(f"Erro ao chamar Resend: {e}")


def _enviar_email_resumo_sge(sb, criadas, vinculadas_extra, nao_identificadas):
    partes = []
    if criadas:
        itens = "".join(
            f"<li><b>{d['curso']} {d['faculdade']} {d['turma']} ({d['ano_formatura']})</b> "
            f"— código SGE {codigo}<br><span style='color:#666'>Descrição original no SGE: "
            f"\"{desc}\"</span></li>"
            for codigo, desc, d in criadas
        )
        partes.append(
            f"<h3>✅ Turmas criadas automaticamente ({len(criadas)})</h3><ul>{itens}</ul>"
            "<p>Essa(s) turma(s) não existia(m) no CRM ainda. Foram criadas em Prospecção, já "
            "vinculadas ao código do SGE. Confira se os dados batem e ajuste o que precisar.</p>"
        )
    if vinculadas_extra:
        itens = "".join(
            f"<li>{get_turma_display_name(t.get('curso'), t.get('faculdade'), t.get('turma'))} "
            f"— vinculada ao código SGE {codigo}</li>"
            for codigo, _desc, t in vinculadas_extra
        )
        partes.append(f"<h3>🔗 Turmas já existentes, vinculadas agora ({len(vinculadas_extra)})</h3><ul>{itens}</ul>")
    if nao_identificadas:
        itens = "".join(
            f"<li>Código {codigo}: \"{' / '.join(descs)}\" <i>({motivo})</i></li>"
            for codigo, descs, motivo in nao_identificadas
        )
        partes.append(
            f"<h3>⚠️ Não deu pra identificar sozinho ({len(nao_identificadas)})</h3><ul>{itens}</ul>"
            "<p>Formato de descrição fora do padrão de nomenclatura, ou o mesmo código do SGE apareceu "
            "com descrições conflitantes. Não inventamos nada aqui - precisa olhar manualmente.</p>"
        )
    if not partes:
        return
    html = "<div style='font-family:sans-serif;font-size:14px'>" + "".join(partes) + "</div>"
    enviar_email(sb, LUCAS_EMAIL, "SGE: novidades de turmas detectadas", html)


def sincronizar_turmas_novas_do_sge(sb, turmas: list, turma_variacoes: list):
    """
    Segunda fase (roda depois do Auto-Win de vendas): olha `sge_contas_receber`
    - ja sincronizado sozinho por outro coletor 2x/dia, e muito mais completo
    que o endpoint de vendas (que quase sempre volta so 1 registro) - atras de
    projetos (turmas) do SGE que a gente ainda nao tem cadastrados aqui.

    Quando a descricao do projeto bate com o formato padrao (mesma convencao
    de nome completo que o proprio site usa), cria a turma sozinho, ja
    vinculada (codigo_sge) e em Prospeccao. Quando NAO da pra confiar no
    parse (formato fora do padrao, ou o mesmo codigo aparece com descricoes
    conflitantes), NUNCA inventa - so lista no e-mail final pro Lucas
    revisar manualmente.
    """
    linhas = fetch_all_rows(sb, "sge_contas_receber", "raw_data")
    descricoes_por_codigo: dict = {}
    for linha in linhas:
        raw = linha.get("raw_data") or {}
        codigo = str(raw.get("Projeto") or "").strip()
        descricao = str(raw.get("DescProjeto") or "").strip()
        if not codigo or not descricao:
            continue
        descricoes_por_codigo.setdefault(codigo, set()).add(descricao)

    codigos_ja_vinculados = {t.get("codigo_sge") for t in turmas if t.get("codigo_sge")}

    criadas = []
    vinculadas_extra = []
    nao_identificadas = []

    for codigo, descricoes in sorted(descricoes_por_codigo.items()):
        if codigo in codigos_ja_vinculados:
            continue

        # Tenta achar uma turma ja cadastrada pelo nome antes de criar (evita duplicar).
        matched = None
        for descricao in descricoes:
            norm = normalize_for_comparison(descricao)
            if not norm:
                continue
            for turma, variacoes in turma_variacoes:
                if norm in variacoes or (
                    len(norm) > 5 and any(v and _tokens_contained(v, norm) for v in variacoes)
                ):
                    matched = turma
                    break
            if matched:
                break

        if matched:
            precisa_atualizar = matched.get("codigo_sge") != codigo or matched.get("funil_status") != "Convertido"
            if precisa_atualizar:
                # Ter conta a receber real no SGE = já teve pelo menos uma
                # adesão/contrato assinado - a turma já é Ganhou, não importa
                # em que estágio do funil ela estivesse antes. O gatilho
                # sincronizar_deal_com_funil_status() move o deal sozinho
                # pra Fechou/Ganhou quando funil_status vira Convertido.
                sb.table("turmas").update(
                    {"codigo_sge": codigo, "funil_status": "Convertido"}
                ).eq("id", matched["id"]).execute()
                matched["codigo_sge"] = codigo
                matched["funil_status"] = "Convertido"
                vinculadas_extra.append((codigo, next(iter(descricoes)), matched))
            continue

        # Ninguem bateu por nome - so cria se der pra confiar 100% no parse
        # (e todas as descricoes desse mesmo codigo concordarem entre si).
        parses = {}
        for descricao in descricoes:
            p = parse_descricao_projeto(descricao)
            if p:
                chave = (p["empresa"], p["curso"], p["faculdade"], p["turma"], p["ano_formatura"])
                parses[chave] = p

        if len(parses) == 1:
            dados = next(iter(parses.values()))
            payload = {
                "codigo": f"turma-sge-{codigo.replace('/', '-')}",
                "nome": f"{dados['curso']} {dados['faculdade']} {dados['turma']}".strip(),
                "codigo_sge": codigo,
                "empresa": dados["empresa"],
                "curso": dados["curso"],
                "faculdade": dados["faculdade"],
                "turma": dados["turma"],
                "ano_formatura": dados["ano_formatura"],
                "cidade": dados["cidade"],
                # Só existe conta a receber no SGE se já teve pelo menos uma
                # adesão/contrato assinado - então essa turma já nasce Ganhou.
                # O gatilho sincronizar_deal_com_funil_status() cria sozinho o
                # deal em Fechou/Ganhou (não precisamos inserir o deal aqui).
                "funil_status": "Convertido",
                "total_alunos": 0,
                "alunos_fechados": 0,
                "observacoes": f'Turma criada automaticamente a partir do projeto {codigo} do SGE '
                f'("{next(iter(descricoes))}"). Confira se os dados batem.',
            }
            try:
                sb.table("turmas").insert(payload).execute()
                criadas.append((codigo, next(iter(descricoes)), dados))
                log.info(f"  Turma nova criada a partir do SGE: {payload['nome']} (projeto {codigo})")
            except Exception as e:
                log.error(f"Erro criando turma automatica pro projeto {codigo}: {e}")
                nao_identificadas.append((codigo, list(descricoes), f"erro ao criar: {e}"))
        else:
            motivo = "descrições conflitantes pro mesmo código" if len(parses) > 1 else "formato não reconhecido"
            nao_identificadas.append((codigo, list(descricoes), motivo))

    if criadas or vinculadas_extra or nao_identificadas:
        _enviar_email_resumo_sge(sb, criadas, vinculadas_extra, nao_identificadas)

    return len(criadas), len(vinculadas_extra), len(nao_identificadas)


def main():
    inicio_exec = time.time()
    log.info("=" * 50)
    log.info("SGE Auto-Win - Deteccao automatica de turma fechada")
    log.info(f"Horario: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    log.info("=" * 50)

    if not SGE_CNPJ or not SGE_TOKEN:
        log.error("SGE_CNPJ e SGE_TOKEN sao obrigatorios!")
        return

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    status_final = "sucesso"
    msg_final = ""
    novas_convertidas = 0
    deals_movidos = 0
    unmatched = 0
    vendas_total = 0
    vinculadas_sge = 0
    criadas_n = 0
    vinculadas_extra_n = 0
    nao_ident_n = 0

    try:
        turmas = fetch_all_rows(
            sb, "turmas",
            "id,curso,faculdade,turma,ano_formatura,cidade,empresa,funil_status,fechamento_contrato,codigo_sge",
            order_col="created_at", desc=True,
        )
        deals = fetch_all_rows(sb, "deals", "id,turma_id,stage")
        deal_por_turma = {d["turma_id"]: d for d in deals if d.get("turma_id")}

        log.info(f"  {len(turmas)} turmas e {len(deals)} deals carregados do Supabase")

        turma_variacoes = [(t, build_turma_variations(t)) for t in turmas]

        hoje = date.today()
        vendas = fetch_sge_vendas(hoje - timedelta(days=90), hoje)
        vendas_total = len(vendas)
        log.info(f"  {vendas_total} vendas retornadas pela API SGE (ultimos 90 dias)")

        today_br = hoje.strftime("%d/%m/%Y")
        now_iso = datetime.now().isoformat()

        for venda in vendas:
            nome_bruto = extract_turma_name_from_venda(venda)
            sge_code = extract_code_from_venda(venda)
            if not nome_bruto or not sge_code:
                continue

            norm_venda = normalize_for_comparison(nome_bruto)
            if not norm_venda:
                continue

            matched = None
            for turma, variacoes in turma_variacoes:
                if norm_venda in variacoes:
                    matched = turma
                    break
                if len(norm_venda) > 5 and any(
                    v and _tokens_contained(v, norm_venda) for v in variacoes
                ):
                    matched = turma
                    break

            if not matched:
                unmatched += 1
                continue

            # Toda turma que a gente acha de verdade numa venda do SGE fica
            # vinculada (turmas.codigo_sge) - independente de já estar
            # Convertido ou não. É esse campo que o site usa pra mostrar
            # "vinculada ao SGE", então precisa ficar em dia sozinho, sem
            # depender de alguém clicar em "Sincronizar SGE".
            if matched.get("codigo_sge") != sge_code:
                sb.table("turmas").update({"codigo_sge": sge_code}).eq("id", matched["id"]).execute()
                matched["codigo_sge"] = sge_code
                vinculadas_sge += 1

            precisa_atualizar_turma = matched.get("funil_status") != "Convertido"
            deal = deal_por_turma.get(matched["id"])

            if deal and deal.get("stage") != STAGE_FECHOU:
                sb.table("deals").update({
                    "stage": STAGE_FECHOU,
                    "outcome": "ganho",
                    "probabilidade": 100,
                    "updated_at": now_iso,
                }).eq("id", deal["id"]).execute()
                sb.table("stage_transitions").insert({
                    "deal_id": deal["id"],
                    "from_stage": deal.get("stage"),
                    "to_stage": STAGE_FECHOU,
                    "changed_at": now_iso,
                }).execute()
                deals_movidos += 1

            if precisa_atualizar_turma:
                sb.table("turmas").update({
                    "funil_status": "Convertido",
                    "fechamento_contrato": matched.get("fechamento_contrato") or today_br,
                }).eq("id", matched["id"]).execute()
                matched["funil_status"] = "Convertido"  # evita reprocessar a mesma turma 2x nesta execucao
                novas_convertidas += 1

        # Segunda fase: turmas do SGE (via contas a receber, muito mais completo
        # que o endpoint de vendas) que a gente ainda nao tinha cadastradas.
        criadas_n, vinculadas_extra_n, nao_ident_n = sincronizar_turmas_novas_do_sge(
            sb, turmas, turma_variacoes
        )

        msg_final = (
            f"{vendas_total} vendas verificadas | {novas_convertidas} turmas marcadas como Convertido | "
            f"{deals_movidos} negocios movidos para Fechou (Auto-Win) | {vinculadas_sge} turmas vinculadas ao SGE | "
            f"{unmatched} sem match | "
            f"{criadas_n} turmas novas criadas do SGE | {vinculadas_extra_n} vinculadas via contas a receber | "
            f"{nao_ident_n} nao identificadas (e-mail enviado se houver alguma)"
        )
        log.info(f"  {msg_final}")

    except Exception as e:
        status_final = "erro"
        msg_final = str(e)
        log.error(f"ERRO GERAL: {e}")

    finally:
        duracao = time.time() - inicio_exec
        try:
            sb.table("sync_log").insert({
                "fonte": "sge_funil_auto_win",
                "status": status_final,
                "registros_atualizados": (
                    novas_convertidas + deals_movidos + vinculadas_sge
                    + criadas_n + vinculadas_extra_n
                ),
                "mensagem": msg_final,
                "duracao_segundos": round(duracao, 2),
            }).execute()
        except Exception:
            pass
        log.info(f"\n{'OK' if status_final == 'sucesso' else 'ERRO'} {msg_final}")
        log.info(f"Tempo total: {duracao:.1f}s")


if __name__ == "__main__":
    main()
