/* ============================================================
   VIDA+ PACIENTE — Configuração do app
   ------------------------------------------------------------
   PREENCHA AQUI quando tiver o Supabase e o OneSignal prontos.
   Enquanto estiverem vazios, o app roda em MODO DEMONSTRAÇÃO
   (dados locais no navegador — perfeito para a banca).
   ============================================================ */

const APP_CONFIG = {
  NOME: "Vida+ Paciente",
  SISTEMA: "Vida+",

  /* ---- SUPABASE (compartilhado com o Sistema Médico) ----
     Como pegar:
     1. supabase.com → criar projeto
     2. Configurações > API: copiar "Project URL" e "anon public key"
     3. Rodar o arquivo supabase/schema.sql no SQL Editor
  */
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",

  /* ---- ONESIGNAL (push notification REAL) ----
     Como pegar:
     1. onesignal.com → criar app (Web Push)
     2. Copiar o "OneSignal App ID" (começa com "xxxxxxxx-...")
     Obs: sem isso, a notificação ainda funciona dentro do app
     (alerta em tela cheia + som + notificação do navegador).
  */
  ONESIGNAL_APP_ID: "",

  /* Nome dos elementos que aparecem no telão/fila (TV) */
  UNIDADES: ["Hospital Vida+", "Hospital Vida+ Norte"],

  /* Tempo estimado por posição na fila (min) — usado no cálculo */
  TEMPO_POR_POSICAO: 12
};

/* O app usa Supabase real? */
const SUPABASE_CONFIGURADO = !!(APP_CONFIG.SUPABASE_URL && APP_CONFIG.SUPABASE_ANON_KEY);
