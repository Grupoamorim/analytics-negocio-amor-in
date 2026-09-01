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
      acesso_paginas: {
        Row: {
          paginas: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          paginas?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          paginas?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "acesso_paginas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aprendizado_estudo: {
        Row: {
          amostra_reunioes: number | null
          amostra_turmas: number | null
          created_at: string
          curso: string
          escopo: string
          estrutura_apresentacao: string | null
          faculdade: string
          gerado_em: string | null
          gerado_por: string | null
          id: string
          motivos_perda_comuns: Json | null
          o_que_evitar: string | null
          o_que_funciona: string | null
          objecoes_comuns: Json | null
          pitch_recomendado: string | null
          pontos_fortes_comuns: Json | null
          preferencias_formandos: string | null
          taxa_avanco_por_portao: Json | null
          taxa_fechamento: number | null
          tempo_medio_por_estagio: Json | null
          updated_at: string
        }
        Insert: {
          amostra_reunioes?: number | null
          amostra_turmas?: number | null
          created_at?: string
          curso?: string
          escopo: string
          estrutura_apresentacao?: string | null
          faculdade?: string
          gerado_em?: string | null
          gerado_por?: string | null
          id?: string
          motivos_perda_comuns?: Json | null
          o_que_evitar?: string | null
          o_que_funciona?: string | null
          objecoes_comuns?: Json | null
          pitch_recomendado?: string | null
          pontos_fortes_comuns?: Json | null
          preferencias_formandos?: string | null
          taxa_avanco_por_portao?: Json | null
          taxa_fechamento?: number | null
          tempo_medio_por_estagio?: Json | null
          updated_at?: string
        }
        Update: {
          amostra_reunioes?: number | null
          amostra_turmas?: number | null
          created_at?: string
          curso?: string
          escopo?: string
          estrutura_apresentacao?: string | null
          faculdade?: string
          gerado_em?: string | null
          gerado_por?: string | null
          id?: string
          motivos_perda_comuns?: Json | null
          o_que_evitar?: string | null
          o_que_funciona?: string | null
          objecoes_comuns?: Json | null
          pitch_recomendado?: string | null
          pontos_fortes_comuns?: Json | null
          preferencias_formandos?: string | null
          taxa_avanco_por_portao?: Json | null
          taxa_fechamento?: number | null
          tempo_medio_por_estagio?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      aprendizado_material: {
        Row: {
          analisado_em: string | null
          categoria: string
          conteudo: string | null
          created_at: string
          curso: string | null
          faculdade: string | null
          id: string
          licoes: string | null
          pontos_atencao: string | null
          pontos_fortes: string | null
          resumo: string | null
          sentimento: string | null
          taticas: string | null
          titulo: string
          updated_by: string | null
          url: string | null
        }
        Insert: {
          analisado_em?: string | null
          categoria: string
          conteudo?: string | null
          created_at?: string
          curso?: string | null
          faculdade?: string | null
          id?: string
          licoes?: string | null
          pontos_atencao?: string | null
          pontos_fortes?: string | null
          resumo?: string | null
          sentimento?: string | null
          taticas?: string | null
          titulo: string
          updated_by?: string | null
          url?: string | null
        }
        Update: {
          analisado_em?: string | null
          categoria?: string
          conteudo?: string | null
          created_at?: string
          curso?: string | null
          faculdade?: string | null
          id?: string
          licoes?: string | null
          pontos_atencao?: string | null
          pontos_fortes?: string | null
          resumo?: string | null
          sentimento?: string | null
          taticas?: string | null
          titulo?: string
          updated_by?: string | null
          url?: string | null
        }
        Relationships: []
      }
      apresentacao_publica: {
        Row: {
          created_at: string
          fotos: string[]
          id: string
          mensagem: string | null
          publicada: boolean
          titulo: string | null
          token: string
          turma_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fotos?: string[]
          id?: string
          mensagem?: string | null
          publicada?: boolean
          titulo?: string | null
          token?: string
          turma_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fotos?: string[]
          id?: string
          mensagem?: string | null
          publicada?: boolean
          titulo?: string | null
          token?: string
          turma_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "apresentacao_publica_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: true
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apresentacao_publica_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: true
            referencedRelation: "vw_resumo_turmas"
            referencedColumns: ["id"]
          },
        ]
      }
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
      checklist_eventos: {
        Row: {
          changed_at: string
          changed_by: string | null
          checked: boolean
          deal_id: string | null
          id: string
          item_id: string
          item_label: string | null
          stage: string | null
          turma_id: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          checked: boolean
          deal_id?: string | null
          id?: string
          item_id: string
          item_label?: string | null
          stage?: string | null
          turma_id?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          checked?: boolean
          deal_id?: string | null
          id?: string
          item_id?: string
          item_label?: string | null
          stage?: string | null
          turma_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_eventos_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_eventos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_eventos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_resumo_turmas"
            referencedColumns: ["id"]
          },
        ]
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
          email_alerta_erro: string | null
          email_alerta_turma_nova: string | null
          favicon_url: string | null
          filtros_salvos: Json
          gemini_api_key: string | null
          id: string
          logo_url: string | null
          preferencias: Json
          resend_api_key: string | null
          sge_cnpj: string | null
          sge_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_alerta_erro?: string | null
          email_alerta_turma_nova?: string | null
          favicon_url?: string | null
          filtros_salvos?: Json
          gemini_api_key?: string | null
          id?: string
          logo_url?: string | null
          preferencias?: Json
          resend_api_key?: string | null
          sge_cnpj?: string | null
          sge_token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_alerta_erro?: string | null
          email_alerta_turma_nova?: string | null
          favicon_url?: string | null
          filtros_salvos?: Json
          gemini_api_key?: string | null
          id?: string
          logo_url?: string | null
          preferencias?: Json
          resend_api_key?: string | null
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
          nao_responde_count: number
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
          nao_responde_count?: number
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
          nao_responde_count?: number
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
          lost_reason: string | null
          notas: string | null
          outcome: string | null
          prioridade: string | null
          prob_atualizada_em: string | null
          prob_breakdown: Json | null
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
          lost_reason?: string | null
          notas?: string | null
          outcome?: string | null
          prioridade?: string | null
          prob_atualizada_em?: string | null
          prob_breakdown?: Json | null
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
          lost_reason?: string | null
          notas?: string | null
          outcome?: string | null
          prioridade?: string | null
          prob_atualizada_em?: string | null
          prob_breakdown?: Json | null
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
      duracao_cursos: {
        Row: {
          created_at: string
          curso: string
          duracao_anos: number
          faculdade: string
          id: string
          observacoes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          curso: string
          duracao_anos: number
          faculdade?: string
          id?: string
          observacoes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          curso?: string
          duracao_anos?: number
          faculdade?: string
          id?: string
          observacoes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      funil_eventos: {
        Row: {
          avancou_apesar_prob_baixa: boolean | null
          cidade: string | null
          created_at: string
          curso: string | null
          deal_id: string | null
          dias_no_estagio_origem: number | null
          empresa: string | null
          faculdade: string | null
          from_stage: string | null
          id: string
          motivo_perda: string | null
          observacao: string | null
          outcome: string | null
          prob_motor_no_momento: number | null
          tipo: string
          to_stage: string | null
          transcript_prob_no_momento: number | null
          turma_id: string | null
        }
        Insert: {
          avancou_apesar_prob_baixa?: boolean | null
          cidade?: string | null
          created_at?: string
          curso?: string | null
          deal_id?: string | null
          dias_no_estagio_origem?: number | null
          empresa?: string | null
          faculdade?: string | null
          from_stage?: string | null
          id?: string
          motivo_perda?: string | null
          observacao?: string | null
          outcome?: string | null
          prob_motor_no_momento?: number | null
          tipo: string
          to_stage?: string | null
          transcript_prob_no_momento?: number | null
          turma_id?: string | null
        }
        Update: {
          avancou_apesar_prob_baixa?: boolean | null
          cidade?: string | null
          created_at?: string
          curso?: string | null
          deal_id?: string | null
          dias_no_estagio_origem?: number | null
          empresa?: string | null
          faculdade?: string | null
          from_stage?: string | null
          id?: string
          motivo_perda?: string | null
          observacao?: string | null
          outcome?: string | null
          prob_motor_no_momento?: number | null
          tipo?: string
          to_stage?: string | null
          transcript_prob_no_momento?: number | null
          turma_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funil_eventos_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funil_eventos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funil_eventos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_resumo_turmas"
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
      metas_negocio: {
        Row: {
          ano: number
          contexto: string | null
          created_at: string
          escopo: string
          id: string
          metrica: string
          periodo: number
          updated_at: string
          valor_meta: number
        }
        Insert: {
          ano: number
          contexto?: string | null
          created_at?: string
          escopo: string
          id?: string
          metrica: string
          periodo?: number
          updated_at?: string
          valor_meta: number
        }
        Update: {
          ano?: number
          contexto?: string | null
          created_at?: string
          escopo?: string
          id?: string
          metrica?: string
          periodo?: number
          updated_at?: string
          valor_meta?: number
        }
        Relationships: []
      }
      motivos_perda: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          motivo: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          motivo: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          motivo?: string
        }
        Relationships: []
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
      notificacoes: {
        Row: {
          created_at: string
          id: string
          lida: boolean
          link: string | null
          mensagem: string | null
          titulo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lida?: boolean
          link?: string | null
          mensagem?: string | null
          titulo: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lida?: boolean
          link?: string | null
          mensagem?: string | null
          titulo?: string
          user_id?: string
        }
        Relationships: []
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
      pacote_itens_catalogo: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      pacote_templates: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          itens: string[]
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          itens?: string[]
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          itens?: string[]
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: []
      }
      pacotes_turma: {
        Row: {
          created_at: string
          id: string
          itens: string[]
          nome: string
          ordem: number
          parcelas: number
          turma_id: string
          updated_at: string
          valor: number
        }
        Insert: {
          created_at?: string
          id?: string
          itens?: string[]
          nome: string
          ordem?: number
          parcelas?: number
          turma_id: string
          updated_at?: string
          valor?: number
        }
        Update: {
          created_at?: string
          id?: string
          itens?: string[]
          nome?: string
          ordem?: number
          parcelas?: number
          turma_id?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pacotes_turma_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacotes_turma_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_resumo_turmas"
            referencedColumns: ["id"]
          },
        ]
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
          ativo: boolean
          created_at: string
          email: string | null
          id: string
          nome: string | null
          role: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          email?: string | null
          id: string
          nome?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      reunioes_agendadas: {
        Row: {
          created_at: string
          criado_por: string | null
          descricao: string | null
          fim: string
          gcal_event_id: string | null
          gcal_html_link: string | null
          id: string
          inicio: string
          modalidade: string
          responsavel: string | null
          status: string
          texto_extra: string | null
          tipo_reuniao: string
          titulo: string
          turma_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          fim: string
          gcal_event_id?: string | null
          gcal_html_link?: string | null
          id?: string
          inicio: string
          modalidade?: string
          responsavel?: string | null
          status?: string
          texto_extra?: string | null
          tipo_reuniao?: string
          titulo: string
          turma_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          fim?: string
          gcal_event_id?: string | null
          gcal_html_link?: string | null
          id?: string
          inicio?: string
          modalidade?: string
          responsavel?: string | null
          status?: string
          texto_extra?: string | null
          tipo_reuniao?: string
          titulo?: string
          turma_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reunioes_agendadas_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reunioes_agendadas_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_resumo_turmas"
            referencedColumns: ["id"]
          },
        ]
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
          changed_by: string | null
          deal_id: string
          from_stage: string | null
          id: string
          to_stage: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          deal_id: string
          from_stage?: string | null
          id?: string
          to_stage: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
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
          concluida: boolean
          concluida_em: string | null
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
          foto_url: string | null
          funil_status: string | null
          id: string
          instituicao: string | null
          mesma_turma_fisica_de: string | null
          meta_contratos: number | null
          meta_vendas: number | null
          nome: string
          observacoes: string | null
          pagamento_inicio: string | null
          primeiro_contato: string | null
          proposta_link: string | null
          quantidade_comissao: number | null
          sdr: string | null
          status: string | null
          tipo_servico: string | null
          total_alunos: number | null
          turma: string | null
          turma_origem_id: string | null
          updated_at: string | null
          updated_by: string | null
          user_id: string | null
          valor_parcela_base: number | null
        }
        Insert: {
          alunos_fechados?: number | null
          ano_formatura?: string | null
          cidade?: string | null
          closer?: string | null
          codigo: string
          codigo_sge?: string | null
          como_conheceu?: string | null
          concluida?: boolean
          concluida_em?: string | null
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
          foto_url?: string | null
          funil_status?: string | null
          id?: string
          instituicao?: string | null
          mesma_turma_fisica_de?: string | null
          meta_contratos?: number | null
          meta_vendas?: number | null
          nome: string
          observacoes?: string | null
          pagamento_inicio?: string | null
          primeiro_contato?: string | null
          proposta_link?: string | null
          quantidade_comissao?: number | null
          sdr?: string | null
          status?: string | null
          tipo_servico?: string | null
          total_alunos?: number | null
          turma?: string | null
          turma_origem_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
          valor_parcela_base?: number | null
        }
        Update: {
          alunos_fechados?: number | null
          ano_formatura?: string | null
          cidade?: string | null
          closer?: string | null
          codigo?: string
          codigo_sge?: string | null
          como_conheceu?: string | null
          concluida?: boolean
          concluida_em?: string | null
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
          foto_url?: string | null
          funil_status?: string | null
          id?: string
          instituicao?: string | null
          mesma_turma_fisica_de?: string | null
          meta_contratos?: number | null
          meta_vendas?: number | null
          nome?: string
          observacoes?: string | null
          pagamento_inicio?: string | null
          primeiro_contato?: string | null
          proposta_link?: string | null
          quantidade_comissao?: number | null
          sdr?: string | null
          status?: string | null
          tipo_servico?: string | null
          total_alunos?: number | null
          turma?: string | null
          turma_origem_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
          valor_parcela_base?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "turmas_mesma_turma_fisica_de_fkey"
            columns: ["mesma_turma_fisica_de"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turmas_mesma_turma_fisica_de_fkey"
            columns: ["mesma_turma_fisica_de"]
            isOneToOne: false
            referencedRelation: "vw_resumo_turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turmas_turma_origem_id_fkey"
            columns: ["turma_origem_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turmas_turma_origem_id_fkey"
            columns: ["turma_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_resumo_turmas"
            referencedColumns: ["id"]
          },
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
      logo_marca_publica: {
        Row: {
          logo_url: string | null
        }
        Relationships: []
      }
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
