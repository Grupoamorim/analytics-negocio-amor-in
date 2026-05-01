-- ============================================================
-- SCHEMA DO BANCO DE DADOS - Analytics do Negócio
-- Execute este arquivo no Supabase SQL Editor
-- ============================================================

-- Extensão para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABELA: turmas
-- Cada turma/grupo de formatura ou evento
-- ============================================================
CREATE TABLE IF NOT EXISTS turmas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo TEXT UNIQUE NOT NULL,           -- Código da turma no SGE
    nome TEXT NOT NULL,                     -- Nome da turma
    curso TEXT,                             -- Curso/evento
    instituicao TEXT,                       -- Instituição
    data_formatura DATE,                    -- Data prevista
    status TEXT DEFAULT 'ativa',            -- ativa, concluida, cancelada
    total_alunos INTEGER DEFAULT 0,
    meta_vendas NUMERIC(12,2) DEFAULT 0,   -- Meta de vendas da turma
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: clientes
-- Alunos/clientes cadastrados no SGE
-- ============================================================
CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo_sge TEXT UNIQUE,                 -- ID no SGE
    nome TEXT NOT NULL,
    email TEXT,
    telefone TEXT,
    turma_id UUID REFERENCES turmas(id),
    status TEXT DEFAULT 'ativo',            -- ativo, inadimplente, cancelado
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: vendas
-- Registros de vendas/contratos fechados
-- ============================================================
CREATE TABLE IF NOT EXISTS vendas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo_sge TEXT UNIQUE,
    turma_id UUID REFERENCES turmas(id),
    cliente_id UUID REFERENCES clientes(id),
    data_venda DATE NOT NULL,
    valor_total NUMERIC(12,2) NOT NULL,
    valor_entrada NUMERIC(12,2) DEFAULT 0,
    num_parcelas INTEGER DEFAULT 1,
    status TEXT DEFAULT 'ativo',            -- ativo, cancelado, concluido
    produto TEXT,                           -- Tipo de pacote/produto
    vendedor TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: pagamentos
-- Parcelas e pagamentos individuais
-- ============================================================
CREATE TABLE IF NOT EXISTS pagamentos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo_sge TEXT UNIQUE,
    venda_id UUID REFERENCES vendas(id),
    turma_id UUID REFERENCES turmas(id),
    cliente_id UUID REFERENCES clientes(id),
    data_vencimento DATE NOT NULL,
    data_pagamento DATE,                    -- NULL = não pago ainda
    valor NUMERIC(12,2) NOT NULL,
    valor_pago NUMERIC(12,2) DEFAULT 0,
    status TEXT DEFAULT 'pendente',         -- pendente, pago, atrasado, cancelado
    forma_pagamento TEXT,                   -- PIX, cartão, boleto
    num_parcela INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: contas_pagar
-- Custos e despesas por turma
-- ============================================================
CREATE TABLE IF NOT EXISTS contas_pagar (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo_sge TEXT UNIQUE,
    turma_id UUID REFERENCES turmas(id),
    descricao TEXT NOT NULL,
    fornecedor TEXT,
    categoria TEXT,                         -- buffet, musica, decoracao, local, etc.
    valor NUMERIC(12,2) NOT NULL,
    data_vencimento DATE,
    data_pagamento DATE,
    status TEXT DEFAULT 'pendente',         -- pendente, pago, atrasado
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: metas
-- Metas mensais e por turma
-- ============================================================
CREATE TABLE IF NOT EXISTS metas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    turma_id UUID REFERENCES turmas(id),   -- NULL = meta geral
    ano INTEGER NOT NULL,
    mes INTEGER,                            -- NULL = meta anual
    tipo TEXT NOT NULL,                     -- vendas, cobranca, novos_clientes
    valor_meta NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: crm_notion
-- Dados do CRM no Notion (leads, oportunidades)
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_notion (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    notion_id TEXT UNIQUE NOT NULL,         -- ID da página no Notion
    nome TEXT,
    email TEXT,
    telefone TEXT,
    status TEXT,                            -- lead, proposta, fechado, perdido
    turma_interesse TEXT,
    valor_estimado NUMERIC(12,2),
    data_contato DATE,
    responsavel TEXT,
    notas TEXT,
    raw_data JSONB,                         -- Dados brutos do Notion
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: sync_log
-- Registro de quando os dados foram sincronizados
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fonte TEXT NOT NULL,                    -- sge, notion
    status TEXT NOT NULL,                   -- sucesso, erro
    registros_atualizados INTEGER DEFAULT 0,
    mensagem TEXT,
    duracao_segundos NUMERIC(6,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- VIEWS ÚTEIS (consultas prontas para o dashboard)
-- ============================================================

-- View: Resumo financeiro por turma
CREATE OR REPLACE VIEW vw_resumo_turmas AS
SELECT
    t.id,
    t.codigo,
    t.nome,
    t.curso,
    t.status,
    t.total_alunos,
    t.meta_vendas,
    COALESCE(SUM(v.valor_total), 0) AS total_vendido,
    COALESCE(SUM(CASE WHEN p.status = 'pago' THEN p.valor_pago ELSE 0 END), 0) AS total_recebido,
    COALESCE(SUM(CASE WHEN p.status IN ('pendente','atrasado') AND p.data_vencimento < CURRENT_DATE THEN p.valor ELSE 0 END), 0) AS total_inadimplente,
    COALESCE(SUM(CASE WHEN p.status = 'pendente' AND p.data_vencimento >= CURRENT_DATE THEN p.valor ELSE 0 END), 0) AS total_a_receber,
    COALESCE(SUM(cp.valor), 0) AS total_custos,
    ROUND(CASE WHEN t.meta_vendas > 0 THEN (SUM(v.valor_total) / t.meta_vendas * 100) ELSE 0 END, 1) AS pct_meta
FROM turmas t
LEFT JOIN vendas v ON v.turma_id = t.id AND v.status != 'cancelado'
LEFT JOIN pagamentos p ON p.turma_id = t.id
LEFT JOIN contas_pagar cp ON cp.turma_id = t.id AND cp.status != 'cancelado'
GROUP BY t.id, t.codigo, t.nome, t.curso, t.status, t.total_alunos, t.meta_vendas;

-- View: Inadimplência detalhada
CREATE OR REPLACE VIEW vw_inadimplencia AS
SELECT
    c.nome AS cliente,
    c.email,
    c.telefone,
    t.nome AS turma,
    p.data_vencimento,
    p.valor,
    CURRENT_DATE - p.data_vencimento AS dias_atraso,
    p.num_parcela
FROM pagamentos p
JOIN clientes c ON c.id = p.cliente_id
JOIN turmas t ON t.id = p.turma_id
WHERE p.status IN ('pendente', 'atrasado')
  AND p.data_vencimento < CURRENT_DATE
ORDER BY dias_atraso DESC;

-- View: Faturamento mensal
CREATE OR REPLACE VIEW vw_faturamento_mensal AS
SELECT
    DATE_TRUNC('month', v.data_venda) AS mes,
    COUNT(v.id) AS num_vendas,
    SUM(v.valor_total) AS faturamento_bruto,
    SUM(CASE WHEN p.status = 'pago' THEN p.valor_pago ELSE 0 END) AS recebido,
    t.nome AS turma
FROM vendas v
LEFT JOIN pagamentos p ON p.venda_id = v.id AND p.status = 'pago'
LEFT JOIN turmas t ON t.id = v.turma_id
WHERE v.status != 'cancelado'
GROUP BY DATE_TRUNC('month', v.data_venda), t.nome
ORDER BY mes DESC;

-- ============================================================
-- ÍNDICES para performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_pagamentos_status ON pagamentos(status);
CREATE INDEX IF NOT EXISTS idx_pagamentos_vencimento ON pagamentos(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_pagamentos_turma ON pagamentos(turma_id);
CREATE INDEX IF NOT EXISTS idx_vendas_turma ON vendas(turma_id);
CREATE INDEX IF NOT EXISTS idx_vendas_data ON vendas(data_venda);
CREATE INDEX IF NOT EXISTS idx_clientes_status ON clientes(status);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) - Segurança básica
-- ============================================================
ALTER TABLE turmas ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE contas_pagar ENABLE ROW LEVEL SECURITY;
ALTER TABLE metas ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_notion ENABLE ROW LEVEL SECURITY;

-- Política: apenas usuários autenticados acessam
CREATE POLICY "Apenas autenticados" ON turmas FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Apenas autenticados" ON vendas FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Apenas autenticados" ON pagamentos FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Apenas autenticados" ON clientes FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Apenas autenticados" ON contas_pagar FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Apenas autenticados" ON metas FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Apenas autenticados" ON crm_notion FOR ALL USING (auth.role() = 'authenticated');

-- Acesso do service_role (para os scripts Python)
CREATE POLICY "Service role acesso total" ON turmas FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role acesso total" ON vendas FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role acesso total" ON pagamentos FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role acesso total" ON clientes FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role acesso total" ON contas_pagar FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role acesso total" ON metas FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role acesso total" ON crm_notion FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role acesso total" ON sync_log FOR ALL USING (auth.role() = 'service_role');
