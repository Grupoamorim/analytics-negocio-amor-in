// Configuração pública da extensão (mesma chave anon do app web — não é segredo).
const AMORIN_CONFIG = {
  SUPABASE_URL: 'https://mpodlzptnhvskqmbcsdv.supabase.co',
  SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wb2RsenB0bmh2c2txbWJjc2R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDQyNDMsImV4cCI6MjA5Mjg4MDI0M30.rtS8Qik3EBb26TYEnV4b2JBwS_ZaigFguF9fY7n8ICc',
  APP_URL: 'https://www.grupoamorin.com.br',
  // chave onde o CRM guarda a sessão do Supabase (padrão sb-<ref>-auth-token)
  SB_STORAGE_KEY: 'sb-mpodlzptnhvskqmbcsdv-auth-token',
  WHATSAPP_URL: 'https://web.whatsapp.com/',
  // quantas mensagens no máximo puxar por conversa a cada sincronização
  MAX_MSGS_POR_SYNC: 80,
  // tamanho máximo de áudio pra transcrição (bytes) — ~6 min de voz
  MAX_AUDIO_BYTES: 6 * 1024 * 1024,
  // intervalo da varredura automática (ms)
  INTERVALO_SYNC_MS: 45000,
};
if (typeof self !== 'undefined') self.AMORIN_CONFIG = AMORIN_CONFIG;
if (typeof window !== 'undefined') window.AMORIN_CONFIG = AMORIN_CONFIG;
