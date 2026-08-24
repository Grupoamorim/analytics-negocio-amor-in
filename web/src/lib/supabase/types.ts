// AVOID UPDATING THIS FILE DIRECTLY. It is automatically generated.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      captacao_leads: {
        Row: {
          ano_formatura: string
          cidade: string
          curso: string
          data_cadastro: string
          email: string
          faculdade: string
          id: string
          nome: string
          sdr: string | null
          telefone: string
          turma: string
        }
        Insert: {
          ano_formatura?: string
          cidade?: string
          curso?: string
          data_cadastro?: string
          email?: string
          faculdade?: string
          id?: string
          nome?: string
          sdr?: string | null
          telefone?: string
          turma?: string
        }
        Update: {
          ano_formatura?: string
          cidade?: string
          curso?: string
          data_cadastro?: string
          email?: string
          faculdade?: string
          id?: string
          nome?: string
          sdr?: string | null
          telefone?: string
          turma?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          codigo_sge: string | null
          created_at: string | null
          email: string | null
          id: string
          nome: string
          status: string | null
          telefone: string | null
          turma_id: string | null
          updated_at: string | null
        }
        Insert: {
          codigo_sge?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          nome: string
          status?: string | null
          telefone?: string | null
          turma_id?: string | null
          updated_at?: string | null
        }
        Update: {
          codigo_sge?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          nome?: string
          status?: string | null
          telefone?: string | null
          turma_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_resumo_turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes: {
        Row: {
          created_at: string
          filtros_salvos: Json
          gemini_api_key: string | null
          id: string
          logo_url: string | null
          preferencias: Json
          sge_cnpj: string | null
          sge_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filtros_salvos?: Json
          gemini_api_key?: string | null
          id?: string
          logo_url?: string | null
          preferencias?: Json
          sge_cnpj?: string | null
          sge_token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          filtros_salvos?: Json
          gemini_api_key?: string | null
          id?: string
          logo_url?: string | null
          preferencias?: Json
          sge_cnpj?: string | null
          sge_token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contas_pagar: {
        Row: {
          categoria: string | null
          codigo_sge: string | null
          created_at: string | null
          data_pagamento: string | null
          data_vencimento: string | null
          descricao: string
          fornecedor: string | null
          grupo_dre: string | null
          grupo_dre_classificado_em: string | null
          id: string
          status: string | null
          turma_id: string | null
          updated_at: string | null
          valor: number
        }
        Insert: {
          categoria?: string | null
          codigo_sge?: string | null
          created_at?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao: string
          fornecedor?: string | null
          grupo_dre?: string | null
          grupo_dre_classificado_em?: string | null
          id?: string
          status?: string | null
          turma_id?: string | null
          updated_at?: string | null
          valor: number
        }
        Update: {
          categoria?: string | null
          codigo_sge?: string | null
          created_at?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao?: string
          fornecedor?: string | null
          grupo_dre?: string | null
          grupo_dre_classificado_em?: string | null
          id?: string
          status?: string | null
          turma_id?: string | null
          updated_at?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_resumo_turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      contatos: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nome: string
          telefone: string | null
          turma_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          nome: string
          telefone?: string | null
          turma_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          telefone?: string | null
          turma_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contatos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contatos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_resumo_turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contatos_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_notion: {
        Row: {
          created_at: string | null
          data_contato: string | null
          email: string | null
          id: string
          nome: string | null
          notas: string | null
          notion_id: string
          raw_data: Json | null
          responsavel: string | null
          status: string | null
          telefone: string | null
          turma_interesse: string | null
          updated_at: string | null
          valor_estimado: number | null
        }
        Insert: {
          created_at?: string | null
          data_contato?: string | null
          email?: string | null
          id?: string
          nome?: string | null
          notas?: string | null
          notion_id: string
          raw_data?: Json | null
          responsavel?: string | null
          status?: string | null
          telefone?: string | null
          turma_interesse?: string | null
          updated_at?: string | null
          valor_estimado?: number | null
        }
        Update: {
          created_at?: string | null
          data_contato?: string | null
          email?: string | null
          id?: string
          nome?: string | null
          notas?: string | null
          notion_id?: string
          raw_data?: Json | null
          responsavel?: string | null
          status?: string | null
          telefone?: string | null
          turma_interesse?: string | null
          updated_at?: string | null
          valor_estimado?: number | null
        }
        Relationships: []
      }
      deals: {
        Row: {
          checklist: Json | null
          created_at: string
          data_previsao_fechamento: string | null
          id: string
          notas: string | null
          outcome: string | null
          prioridade: string | null
          probabilidade: number | null
          probability: number | null
          responsavel: string | null
          stage: string
          tipo_contrato: string | null
          titulo: string | null
          turma_id: string
          updated_at: string
          updated_by: string | null
          user_id: string | null
          valor_estimado: number | null
          value: number
        }
        Insert: {
          checklist?: Json | null
          created_at?: string
          data_previsao_fechamento?: string | null
          id?: string
          notas?: string | null
          outcome?: string | null
          prioridade?: string | null
          probabilidade?: number | null
          probability?: number | null
          responsavel?: string | null
          stage?: string
          tipo_contrato?: string | null
          titulo?: string | null
          turma_id: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
          valor_estimado?: number | null
          value?: number
        }
        Update: {
          checklist?: Json | null
          created_at?: string
          data_previsao_fechamento?: string | null
          id?: string
          notas?: string | null
          outcome?: string | null
          prioridade?: string | null
          probabilidade?: number | null
          probability?: number | null
          responsavel?: string | null
          stage?: string
          tipo_contrato?: string | null
          titulo?: string | null
          turma_id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
          valor_estimado?: number | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "deals_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: true
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: true
            referencedRelation: "vw_resumo_turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mercado_faculdades: {
        Row: {
          cidade: string
          created_at: string
          faculdade: string
          id: string
        }
        Insert: {
          cidade: string
          created_at?: string
          faculdade: string
          id?: string
        }
        Update: {
          cidade?: string
          created_at?: string
          faculdade?: string
          id?: string
        }
        Relationships: []
      }
      metas: {
        Row: {
          ano: number
          created_at: string | null
          id: string
          mes: number | null
          tipo: string
          turma_id: string | null
          updated_at: string | null
          valor_meta: number
        }
        Insert: {
          ano: number
          created_at?: string | null
          id?: string
          mes?: number | null
          tipo: string
          turma_id?: string | null
          updated_at?: string | null
          valor_meta: number
        }
        Update: {
          ano?: number
          created_at?: string | null
          id?: string
          mes?: number | null
          tipo?: string
          turma_id?: string | null
          updated_at?: string | null
          valor_meta?: number
        }
        Relationships: [
          {
            foreignKeyName: "metas_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_resumo_turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      notas: {
        Row: {
          conteudo: string
          created_at: string
          id: string
          titulo: string | null
          turma_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          conteudo: string
          created_at?: string
          id?: string
          titulo?: string | null
          turma_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          conteudo?: string
          created_at?: string
          id?: string
          titulo?: string | null
          turma_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notas_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_resumo_turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notion_atividades: {
        Row: {
          data: string | null
          id: string
          notion_id: string
          projeto: string | null
          raw_data: Json | null
          responsavel: string | null
          status: string | null
          tipo: string | null
          titulo: string | null
          updated_at: string | null
        }
        Insert: {
          data?: string | null
          id?: string
          notion_id: string
          projeto?: string | null
          raw_data?: Json | null
          responsavel?: string | null
          status?: string | null
          tipo?: string | null
          titulo?: string | null
          updated_at?: string | null
        }
        Update: {
          data?: string | null
          id?: string
          notion_id?: string
          projeto?: string | null
          raw_data?: Json | null
          responsavel?: string | null
          status?: string | null
          tipo?: string | null
          titulo?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      notion_curadoria: {
        Row: {
          categoria: string | null
          id: string
          notas: string | null
          notion_id: string
          raw_data: Json | null
          status: string | null
          titulo: string | null
          updated_at: string | null
          url: string | null
        }
        Insert: {
          categoria?: string | null
          id?: string
          notas?: string | null
          notion_id: string
          raw_data?: Json | null
          status?: string | null
          titulo?: string | null
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          categoria?: string | null
          id?: string
          notas?: string | null
          notion_id?: string
          raw_data?: Json | null
          status?: string | null
          titulo?: string | null
          updated_at?: string | null
          url?: string | null
        }
        Relationships: []
      }
      notion_equipe: {
        Row: {
          cargo: string | null
          email: string | null
          id: string
          nome: string | null
          notion_id: string
          raw_data: Json | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          cargo?: string | null
          email?: string | null
          id?: string
          nome?: string | null
          notion_id: string
          raw_data?: Json | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          cargo?: string | null
          email?: string | null
          id?: string
          nome?: string | null
          notion_id?: string
          raw_data?: Json | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      notion_estoque: {
        Row: {
          equipamento: string | null
          id: string
          notion_id: string
          quantidade: number | null
          raw_data: Json | null
          responsavel: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          equipamento?: string | null
          id?: string
          notion_id: string
          quantidade?: number | null
          raw_data?: Json | null
          responsavel?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          equipamento?: string | null
          id?: string
          notion_id?: string
          quantidade?: number | null
          raw_data?: Json | null
          responsavel?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      notion_eventos: {
        Row: {
          data: string | null
          data_fim: string | null
          id: string
          notion_id: string
          projeto: string | null
          raw_data: Json | null
          responsavel: string | null
          status: string | null
          tipo: string | null
          titulo: string | null
          updated_at: string | null
        }
        Insert: {
          data?: string | null
          data_fim?: string | null
          id?: string
          notion_id: string
          projeto?: string | null
          raw_data?: Json | null
          responsavel?: string | null
          status?: string | null
          tipo?: string | null
          titulo?: string | null
          updated_at?: string | null
        }
        Update: {
          data?: string | null
          data_fim?: string | null
          id?: string
          notion_id?: string
          projeto?: string | null
          raw_data?: Json | null
          responsavel?: string | null
          status?: string | null
          tipo?: string | null
          titulo?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      notion_ice: {
        Row: {
          confianca: number | null
          facilidade: number | null
          id: string
          impacto: number | null
          notion_id: string
          raw_data: Json | null
          score: number | null
          status: string | null
          titulo: string | null
          updated_at: string | null
        }
        Insert: {
          confianca?: number | null
          facilidade?: number | null
          id?: string
          impacto?: number | null
          notion_id: string
          raw_data?: Json | null
          score?: number | null
          status?: string | null
          titulo?: string | null
          updated_at?: string | null
        }
        Update: {
          confianca?: number | null
          facilidade?: number | null
          id?: string
          impacto?: number | null
          notion_id?: string
          raw_data?: Json | null
          score?: number | null
          status?: string | null
          titulo?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      notion_projetos: {
        Row: {
          cliente: string | null
          data_fim: string | null
          data_inicio: string | null
          id: string
          nome: string | null
          notion_id: string
          raw_data: Json | null
          responsavel: string | null
          status: string | null
          updated_at: string | null
          valor: number | null
        }
        Insert: {
          cliente?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          id?: string
          nome?: string | null
          notion_id: string
          raw_data?: Json | null
          responsavel?: string | null
          status?: string | null
          updated_at?: string | null
          valor?: number | null
        }
        Update: {
          cliente?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          id?: string
          nome?: string | null
          notion_id?: string
          raw_data?: Json | null
          responsavel?: string | null
          status?: string | null
          updated_at?: string | null
          valor?: number | null
        }
        Relationships: []
      }
      notion_propostas: {
        Row: {
          data_contato: string | null
          email: string | null
          id: string
          nome: string | null
          notas: string | null
          notion_id: string
          raw_data: Json | null
          responsavel: string | null
          status: string | null
          telefone: string | null
          turma_interesse: string | null
          updated_at: string | null
          valor_estimado: number | null
        }
        Insert: {
          data_contato?: string | null
          email?: string | null
          id?: string
          nome?: string | null
          notas?: string | null
          notion_id: string
          raw_data?: Json | null
          responsavel?: string | null
          status?: string | null
          telefone?: string | null
          turma_interesse?: string | null
          updated_at?: string | null
          valor_estimado?: number | null
        }
        Update: {
          data_contato?: string | null
          email?: string | null
          id?: string
          nome?: string | null
          notas?: string | null
          notion_id?: string
          raw_data?: Json | null
          responsavel?: string | null
          status?: string | null
          telefone?: string | null
          turma_interesse?: string | null
          updated_at?: string | null
          valor_estimado?: number | null
        }
        Relationships: []
      }
      pagamentos: {
        Row: {
          cliente_id: string | null
          codigo_sge: string | null
          created_at: string | null
          data_pagamento: string | null
          data_vencimento: string
          forma_pagamento: string | null
          id: string
          num_parcela: number | null
          origem: string | null
          pagador_nome: string | null
          status: string | null
          turma_id: string | null
          updated_at: string | null
          valor: number
          valor_pago: number | null
          venda_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          codigo_sge?: string | null
          created_at?: string | null
          data_pagamento?: string | null
          data_vencimento: string
          forma_pagamento?: string | null
          id?: string
          num_parcela?: number | null
          origem?: string | null
          pagador_nome?: string | null
          status?: string | null
          turma_id?: string | null
          updated_at?: string | null
          valor: number
          valor_pago?: number | null
          venda_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          codigo_sge?: string | null
          created_at?: string | null
          data_pagamento?: string | null
          data_vencimento?: string
          forma_pagamento?: string | null
          id?: string
          num_parcela?: number | null
          origem?: string | null
          pagador_nome?: string | null
          status?: string | null
          turma_id?: string | null
          updated_at?: string | null
          valor?: number
          valor_pago?: number | null
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_resumo_turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      parametros_custo_turma: {
        Row: {
          ano: number
          cidade: string | null
          created_at: string
          custo_direto_aluno: number
          formandos_max: number
          formandos_min: number
          id: string
          observacoes: string | null
          updated_at: string
          venda_prevista_aluno: number
        }
        Insert: {
          ano: number
          cidade?: string | null
          created_at?: string
          custo_direto_aluno?: number
          formandos_max: number
          formandos_min: number
          id?: string
          observacoes?: string | null
          updated_at?: string
          venda_prevista_aluno?: number
        }
        Update: {
          ano?: number
          cidade?: string | null
          created_at?: string
          custo_direto_aluno?: number
          formandos_max?: number
          formandos_min?: number
          id?: string
          observacoes?: string | null
          updated_at?: string
          venda_prevista_aluno?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nome: string | null
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          nome?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      sge_adesoes: {
        Row: {
          cliente: string | null
          codigo_sge: string
          cpf_cliente: string | null
          data_adesao: string | null
          id: number
          plano: string | null
          raw_data: Json | null
          status: string | null
          turma: string | null
          updated_at: string | null
          valor: number | null
        }
        Insert: {
          cliente?: string | null
          codigo_sge: string
          cpf_cliente?: string | null
          data_adesao?: string | null
          id?: number
          plano?: string | null
          raw_data?: Json | null
          status?: string | null
          turma?: string | null
          updated_at?: string | null
          valor?: number | null
        }
        Update: {
          cliente?: string | null
          codigo_sge?: string
          cpf_cliente?: string | null
          data_adesao?: string | null
          id?: number
          plano?: string | null
          raw_data?: Json | null
          status?: string | null
          turma?: string | null
          updated_at?: string | null
          valor?: number | null
        }
        Relationships: []
      }
      sge_cobranca: {
        Row: {
          cliente: string | null
          codigo_sge: string
          cpf_cliente: string | null
          data_vencimento: string | null
          dias_atraso: number | null
          email: string | null
          id: number
          raw_data: Json | null
          status: string | null
          telefone: string | null
          turma: string | null
          updated_at: string | null
          valor: number | null
        }
        Insert: {
          cliente?: string | null
          codigo_sge: string
          cpf_cliente?: string | null
          data_vencimento?: string | null
          dias_atraso?: number | null
          email?: string | null
          id?: number
          raw_data?: Json | null
          status?: string | null
          telefone?: string | null
          turma?: string | null
          updated_at?: string | null
          valor?: number | null
        }
        Update: {
          cliente?: string | null
          codigo_sge?: string
          cpf_cliente?: string | null
          data_vencimento?: string | null
          dias_atraso?: number | null
          email?: string | null
          id?: number
          raw_data?: Json | null
          status?: string | null
          telefone?: string | null
          turma?: string | null
          updated_at?: string | null
          valor?: number | null
        }
        Relationships: []
      }
      sge_contas: {
        Row: {
          agencia: string | null
          ativa: boolean | null
          banco: string | null
          codigo_sge: string
          conta_num: string | null
          id: number
          nome: string | null
          raw_data: Json | null
          saldo: number | null
          tipo: string | null
          updated_at: string | null
        }
        Insert: {
          agencia?: string | null
          ativa?: boolean | null
          banco?: string | null
          codigo_sge: string
          conta_num?: string | null
          id?: number
          nome?: string | null
          raw_data?: Json | null
          saldo?: number | null
          tipo?: string | null
          updated_at?: string | null
        }
        Update: {
          agencia?: string | null
          ativa?: boolean | null
          banco?: string | null
          codigo_sge?: string
          conta_num?: string | null
          id?: number
          nome?: string | null
          raw_data?: Json | null
          saldo?: number | null
          tipo?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sge_contas_pagar: {
        Row: {
          categoria: string | null
          codigo_sge: string
          data_pagamento: string | null
          data_vencimento: string | null
          descricao: string | null
          forma_pagamento: string | null
          fornecedor: string | null
          id: number
          raw_data: Json | null
          status: string | null
          updated_at: string | null
          valor: number | null
          valor_pago: number | null
        }
        Insert: {
          categoria?: string | null
          codigo_sge: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          forma_pagamento?: string | null
          fornecedor?: string | null
          id?: number
          raw_data?: Json | null
          status?: string | null
          updated_at?: string | null
          valor?: number | null
          valor_pago?: number | null
        }
        Update: {
          categoria?: string | null
          codigo_sge?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          forma_pagamento?: string | null
          fornecedor?: string | null
          id?: number
          raw_data?: Json | null
          status?: string | null
          updated_at?: string | null
          valor?: number | null
          valor_pago?: number | null
        }
        Relationships: []
      }
      sge_contas_receber: {
        Row: {
          cliente: string | null
          codigo_sge: string
          cpf_cliente: string | null
          data_pagamento: string | null
          data_vencimento: string | null
          descricao: string | null
          forma_pagamento: string | null
          id: number
          num_parcela: number | null
          raw_data: Json | null
          status: string | null
          turma: string | null
          updated_at: string | null
          valor: number | null
          valor_pago: number | null
        }
        Insert: {
          cliente?: string | null
          codigo_sge: string
          cpf_cliente?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          forma_pagamento?: string | null
          id?: number
          num_parcela?: number | null
          raw_data?: Json | null
          status?: string | null
          turma?: string | null
          updated_at?: string | null
          valor?: number | null
          valor_pago?: number | null
        }
        Update: {
          cliente?: string | null
          codigo_sge?: string
          cpf_cliente?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          forma_pagamento?: string | null
          id?: number
          num_parcela?: number | null
          raw_data?: Json | null
          status?: string | null
          turma?: string | null
          updated_at?: string | null
          valor?: number | null
          valor_pago?: number | null
        }
        Relationships: []
      }
      sge_fluxo_caixa: {
        Row: {
          conta: string | null
          data: string
          descricao: string | null
          entradas: number | null
          id: number
          raw_data: Json | null
          saidas: number | null
          saldo: number | null
          updated_at: string | null
        }
        Insert: {
          conta?: string | null
          data: string
          descricao?: string | null
          entradas?: number | null
          id?: number
          raw_data?: Json | null
          saidas?: number | null
          saldo?: number | null
          updated_at?: string | null
        }
        Update: {
          conta?: string | null
          data?: string
          descricao?: string | null
          entradas?: number | null
          id?: number
          raw_data?: Json | null
          saidas?: number | null
          saldo?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sge_vendas: {
        Row: {
          cliente: string | null
          codigo_sge: string
          cpf_cliente: string | null
          data_venda: string | null
          id: number
          num_parcelas: number | null
          produto: string | null
          raw_data: Json | null
          status: string | null
          turma: string | null
          updated_at: string | null
          valor_entrada: number | null
          valor_total: number | null
          vendedor: string | null
        }
        Insert: {
          cliente?: string | null
          codigo_sge: string
          cpf_cliente?: string | null
          data_venda?: string | null
          id?: number
          num_parcelas?: number | null
          produto?: string | null
          raw_data?: Json | null
          status?: string | null
          turma?: string | null
          updated_at?: string | null
          valor_entrada?: number | null
          valor_total?: number | null
          vendedor?: string | null
        }
        Update: {
          cliente?: string | null
          codigo_sge?: string
          cpf_cliente?: string | null
          data_venda?: string | null
          id?: number
          num_parcelas?: number | null
          produto?: string | null
          raw_data?: Json | null
          status?: string | null
          turma?: string | null
          updated_at?: string | null
          valor_entrada?: number | null
          valor_total?: number | null
          vendedor?: string | null
        }
        Relationships: []
      }
      stage_transitions: {
        Row: {
          changed_at: string
          deal_id: string
          from_stage: string | null
          id: string
          to_stage: string
        }
        Insert: {
          changed_at?: string
          deal_id: string
          from_stage?: string | null
          id?: string
          to_stage: string
        }
        Update: {
          changed_at?: string
          deal_id?: string
          from_stage?: string | null
          id?: string
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_transitions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_log: {
        Row: {
          created_at: string | null
          duracao_segundos: number | null
          fonte: string
          id: string
          mensagem: string | null
          registros_atualizados: number | null
          status: string
        }
        Insert: {
          created_at?: string | null
          duracao_segundos?: number | null
          fonte: string
          id?: string
          mensagem?: string | null
          registros_atualizados?: number | null
          status: string
        }
        Update: {
          created_at?: string | null
          duracao_segundos?: number | null
          fonte?: string
          id?: string
          mensagem?: string | null
          registros_atualizados?: number | null
          status?: string
        }
        Relationships: []
      }
      transcricoes: {
        Row: {
          conteudo: string | null
          created_at: string
          id: string
          pontos_atencao: string | null
          pontos_fortes: string | null
          probabilidade: number | null
          proximo_passo: string | null
          resumo: string | null
          sentimento: string | null
          tipo: string | null
          titulo: string
          turma_id: string
          url: string | null
        }
        Insert: {
          conteudo?: string | null
          created_at?: string
          id?: string
          pontos_atencao?: string | null
          pontos_fortes?: string | null
          probabilidade?: number | null
          proximo_passo?: string | null
          resumo?: string | null
          sentimento?: string | null
          tipo?: string | null
          titulo: string
          turma_id: string
          url?: string | null
        }
        Update: {
          conteudo?: string | null
          created_at?: string
          id?: string
          pontos_atencao?: string | null
          pontos_fortes?: string | null
          probabilidade?: number | null
          proximo_passo?: string | null
          resumo?: string | null
          sentimento?: string | null
          tipo?: string | null
          titulo?: string
          turma_id?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transcricoes_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcricoes_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_resumo_turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      turmas: {
        Row: {
          alunos_fechados: number | null
          ano_formatura: string | null
          cidade: string | null
          closer: string | null
          codigo: string
          codigo_sge: string | null
          como_conheceu: string | null
          concorrentes: string | null
          contato_nome: string | null
          contato_telefone: string | null
          created_at: string | null
          curso: string | null
          data_cadastro: string | null
          data_formatura: string | null
          empresa: string | null
          faculdade: string | null
          fechamento_contrato: string | null
          funil_status: string | null
          id: string
          instituicao: string | null
          meta_vendas: number | null
          nome: string
          observacoes: string | null
          primeiro_contato: string | null
          proposta_link: string | null
          sdr: string | null
          status: string | null
          tipo_servico: string | null
          total_alunos: number | null
          turma: string | null
          updated_at: string | null
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          alunos_fechados?: number | null
          ano_formatura?: string | null
          cidade?: string | null
          closer?: string | null
          codigo: string
          codigo_sge?: string | null
          como_conheceu?: string | null
          concorrentes?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          created_at?: string | null
          curso?: string | null
          data_cadastro?: string | null
          data_formatura?: string | null
          empresa?: string | null
          faculdade?: string | null
          fechamento_contrato?: string | null
          funil_status?: string | null
          id?: string
          instituicao?: string | null
          meta_vendas?: number | null
          nome: string
          observacoes?: string | null
          primeiro_contato?: string | null
          proposta_link?: string | null
          sdr?: string | null
          status?: string | null
          tipo_servico?: string | null
          total_alunos?: number | null
          turma?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          alunos_fechados?: number | null
          ano_formatura?: string | null
          cidade?: string | null
          closer?: string | null
          codigo?: string
          codigo_sge?: string | null
          como_conheceu?: string | null
          concorrentes?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          created_at?: string | null
          curso?: string | null
          data_cadastro?: string | null
          data_formatura?: string | null
          empresa?: string | null
          faculdade?: string | null
          fechamento_contrato?: string | null
          funil_status?: string | null
          id?: string
          instituicao?: string | null
          meta_vendas?: number | null
          nome?: string
          observacoes?: string | null
          primeiro_contato?: string | null
          proposta_link?: string | null
          sdr?: string | null
          status?: string | null
          tipo_servico?: string | null
          total_alunos?: number | null
          turma?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "turmas_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas: {
        Row: {
          cliente_id: string | null
          codigo_sge: string | null
          created_at: string | null
          data_venda: string
          id: string
          num_parcelas: number | null
          produto: string | null
          status: string | null
          turma_id: string | null
          updated_at: string | null
          valor_entrada: number | null
          valor_total: number
          vendedor: string | null
        }
        Insert: {
          cliente_id?: string | null
          codigo_sge?: string | null
          created_at?: string | null
          data_venda: string
          id?: string
          num_parcelas?: number | null
          produto?: string | null
          status?: string | null
          turma_id?: string | null
          updated_at?: string | null
          valor_entrada?: number | null
          valor_total: number
          vendedor?: string | null
        }
        Update: {
          cliente_id?: string | null
          codigo_sge?: string | null
          created_at?: string | null
          data_venda?: string
          id?: string
          num_parcelas?: number | null
          produto?: string | null
          status?: string | null
          turma_id?: string | null
          updated_at?: string | null
          valor_entrada?: number | null
          valor_total?: number
          vendedor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_resumo_turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      vendedores: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
    }
    Views: {
      vw_faturamento_mensal: {
        Row: {
          faturamento_bruto: number | null
          mes: string | null
          recebido: number | null
        }
        Relationships: []
      }
      vw_inadimplencia: {
        Row: {
          cliente: string | null
          data_vencimento: string | null
          dias_atraso: number | null
          turma: string | null
          valor: number | null
        }
        Relationships: []
      }
      vw_resumo_turmas: {
        Row: {
          id: string | null
          meta_vendas: number | null
          nome: string | null
          pct_meta: number | null
          status: string | null
          total_a_receber: number | null
          total_custos: number | null
          total_inadimplente: number | null
          total_recebido: number | null
          total_vendido: number | null
        }
        Relationships: []
      }
      vw_totais_negocio: {
        Row: {
          total_a_receber: number | null
          total_custos: number | null
          total_faturado: number | null
          total_inadimplente: number | null
          total_recebido: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
      sync_normalized_from_sge: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
