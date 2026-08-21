// AVOID UPDATING THIS FILE DIRECTLY. It is automatically generated.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.15'
  }
  public: {
    Tables: {
      configuracoes: {
        Row: {
          created_at: string
          filtros_salvos: Json
          gemini_api_key: string | null
          id: string
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
          preferencias?: Json
          sge_cnpj?: string | null
          sge_token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contatos: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nome: string
          telefone: string | null
          turma_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          nome: string
          telefone?: string | null
          turma_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          telefone?: string | null
          turma_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'contatos_turma_id_fkey'
            columns: ['turma_id']
            isOneToOne: false
            referencedRelation: 'turmas'
            referencedColumns: ['id']
          },
        ]
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
          user_id?: string | null
          valor_estimado?: number | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: 'deals_turma_id_fkey'
            columns: ['turma_id']
            isOneToOne: true
            referencedRelation: 'turmas'
            referencedColumns: ['id']
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
        }
        Insert: {
          conteudo: string
          created_at?: string
          id?: string
          titulo?: string | null
          turma_id: string
          updated_at?: string
        }
        Update: {
          conteudo?: string
          created_at?: string
          id?: string
          titulo?: string | null
          turma_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'notas_turma_id_fkey'
            columns: ['turma_id']
            isOneToOne: false
            referencedRelation: 'turmas'
            referencedColumns: ['id']
          },
        ]
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
            foreignKeyName: 'stage_transitions_deal_id_fkey'
            columns: ['deal_id']
            isOneToOne: false
            referencedRelation: 'deals'
            referencedColumns: ['id']
          },
        ]
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
            foreignKeyName: 'transcricoes_turma_id_fkey'
            columns: ['turma_id']
            isOneToOne: false
            referencedRelation: 'turmas'
            referencedColumns: ['id']
          },
        ]
      }
      turmas: {
        Row: {
          alunos_fechados: number | null
          ano_formatura: string | null
          cidade: string | null
          closer: string | null
          codigo_sge: string | null
          como_conheceu: string | null
          concorrentes: string | null
          contato_nome: string | null
          contato_telefone: string | null
          created_at: string
          curso: string
          data_cadastro: string | null
          empresa: string | null
          faculdade: string
          fechamento_contrato: string | null
          funil_status: string | null
          id: string
          observacoes: string | null
          primeiro_contato: string | null
          proposta_link: string | null
          sdr: string | null
          tipo_servico: string | null
          total_alunos: number | null
          turma: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alunos_fechados?: number | null
          ano_formatura?: string | null
          cidade?: string | null
          closer?: string | null
          codigo_sge?: string | null
          como_conheceu?: string | null
          concorrentes?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          created_at?: string
          curso: string
          data_cadastro?: string | null
          empresa?: string | null
          faculdade: string
          fechamento_contrato?: string | null
          funil_status?: string | null
          id?: string
          observacoes?: string | null
          primeiro_contato?: string | null
          proposta_link?: string | null
          sdr?: string | null
          tipo_servico?: string | null
          total_alunos?: number | null
          turma?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alunos_fechados?: number | null
          ano_formatura?: string | null
          cidade?: string | null
          closer?: string | null
          codigo_sge?: string | null
          como_conheceu?: string | null
          concorrentes?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          created_at?: string
          curso?: string
          data_cadastro?: string | null
          empresa?: string | null
          faculdade?: string
          fechamento_contrato?: string | null
          funil_status?: string | null
          id?: string
          observacoes?: string | null
          primeiro_contato?: string | null
          proposta_link?: string | null
          sdr?: string | null
          tipo_servico?: string | null
          total_alunos?: number | null
          turma?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
