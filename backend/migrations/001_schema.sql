CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS colaboradores (
  registro_id TEXT PRIMARY KEY,
  nome TEXT NOT NULL DEFAULT '',
  usuario TEXT DEFAULT '',
  senha TEXT DEFAULT '',
  cargo TEXT DEFAULT '',
  cor TEXT DEFAULT '#163f63',
  status TEXT DEFAULT 'Ativo',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);



ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS senha_hash TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash TEXT PRIMARY KEY,
  colaborador_id TEXT NOT NULL DEFAULT '',
  usuario TEXT DEFAULT '',
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_colaborador ON user_sessions (colaborador_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions (expires_at);

CREATE TABLE IF NOT EXISTS clientes (
  registro_id TEXT PRIMARY KEY,
  nome_cliente TEXT NOT NULL DEFAULT '',
  especialidade TEXT DEFAULT '',
  cidade TEXT DEFAULT '',
  telefone_doutor TEXT DEFAULT '',
  instagram TEXT DEFAULT '',
  responsavel_id TEXT DEFAULT '',
  status TEXT DEFAULT 'Ativo',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leme_profile (
  registro_id TEXT PRIMARY KEY,
  nome TEXT NOT NULL DEFAULT 'LEME',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS publicacoes (
  registro_id TEXT PRIMARY KEY,
  cliente_id TEXT DEFAULT '',
  responsavel_id TEXT DEFAULT '',
  data_publicacao DATE,
  titulo TEXT NOT NULL DEFAULT '',
  formato TEXT DEFAULT '',
  status TEXT DEFAULT '',
  drive_folder_url TEXT DEFAULT '',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eventos (
  registro_id TEXT PRIMARY KEY,
  colaborador_id TEXT DEFAULT '',
  cliente_id TEXT DEFAULT '',
  titulo TEXT NOT NULL DEFAULT '',
  tipo TEXT DEFAULT '',
  data_evento DATE,
  hora TEXT DEFAULT '',
  status TEXT DEFAULT 'Agendado',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trafego_pago (
  registro_id TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL DEFAULT '',
  mes_referencia TEXT NOT NULL DEFAULT '',
  status TEXT DEFAULT '',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (cliente_id, mes_referencia)
);

CREATE TABLE IF NOT EXISTS crm_prospects (
  registro_id TEXT PRIMARY KEY,
  nome TEXT NOT NULL DEFAULT '',
  especialidade TEXT DEFAULT '',
  cidade TEXT DEFAULT '',
  whatsapp TEXT DEFAULT '',
  email TEXT DEFAULT '',
  responsavel_id TEXT DEFAULT '',
  status_funil TEXT DEFAULT 'Mapeado',
  temperatura TEXT DEFAULT 'Morno',
  proximo_follow_up TIMESTAMPTZ,
  cliente_id_convertido TEXT DEFAULT '',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_acoes (
  registro_id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT '',
  titulo TEXT DEFAULT '',
  data_acao TIMESTAMPTZ,
  status_acao TEXT DEFAULT '',
  responsavel_id TEXT DEFAULT '',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prompt_templates (
  registro_id TEXT PRIMARY KEY,
  nome TEXT NOT NULL DEFAULT '',
  formato TEXT DEFAULT 'Todos',
  status TEXT DEFAULT 'Ativo',
  ordem INTEGER DEFAULT 0,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);



CREATE TABLE IF NOT EXISTS finance_boxes (
  registro_id TEXT PRIMARY KEY,
  nome TEXT NOT NULL DEFAULT '',
  categoria TEXT DEFAULT 'interno',
  tipo TEXT DEFAULT 'geral',
  cliente_id TEXT DEFAULT '',
  percentual NUMERIC DEFAULT 0,
  meta_valor NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'Ativo',
  ordem INTEGER DEFAULT 0,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_movements (
  registro_id TEXT PRIMARY KEY,
  box_id TEXT NOT NULL DEFAULT '',
  cliente_id TEXT DEFAULT '',
  tipo TEXT DEFAULT 'entrada',
  valor NUMERIC DEFAULT 0,
  descricao TEXT DEFAULT '',
  mes_referencia TEXT DEFAULT '',
  data_movimento DATE,
  origem TEXT DEFAULT '',
  status TEXT DEFAULT 'Confirmado',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gravacoes (
  registro_id TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL DEFAULT '',
  responsavel_id TEXT DEFAULT '',
  data_gravacao DATE,
  hora TEXT DEFAULT '',
  videos_gravados INTEGER DEFAULT 0,
  status TEXT DEFAULT 'Prevista',
  evento_id TEXT DEFAULT '',
  avisos_enviados JSONB NOT NULL DEFAULT '[]'::jsonb,
  observacoes TEXT DEFAULT '',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automacao_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  resposta JSONB,
  ok BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- v107 — integrações seguras e relatórios do Analytics do Site.
-- As chaves dos plugins nunca ficam dentro do JSON público do cliente.
CREATE TABLE IF NOT EXISTS client_integrations (
  client_id TEXT PRIMARY KEY,
  site_url TEXT NOT NULL DEFAULT '',
  permalink_key_encrypted TEXT NOT NULL DEFAULT '',
  analytics_key_encrypted TEXT NOT NULL DEFAULT '',
  report_automation_enabled BOOLEAN NOT NULL DEFAULT false,
  report_day SMALLINT NOT NULL DEFAULT 5 CHECK (report_day BETWEEN 1 AND 28),
  report_time TIME NOT NULL DEFAULT '09:00',
  report_recipient_type TEXT NOT NULL DEFAULT 'doctor',
  report_recipient_custom TEXT NOT NULL DEFAULT '',
  analytics_status TEXT NOT NULL DEFAULT 'not_configured',
  analytics_status_checked_at TIMESTAMPTZ,
  analytics_status_message TEXT NOT NULL DEFAULT '',
  last_report_status TEXT NOT NULL DEFAULT '',
  last_report_sent_at TIMESTAMPTZ,
  last_report_error TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_closed BOOLEAN NOT NULL DEFAULT false,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (client_id, start_date, end_date)
);

CREATE TABLE IF NOT EXISTS analytics_report_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  delivery_mode TEXT NOT NULL DEFAULT 'whatsapp',
  recipient_type TEXT NOT NULL DEFAULT 'client_default',
  recipient TEXT NOT NULL DEFAULT '',
  requested_by TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  n8n_execution_id TEXT NOT NULL DEFAULT '',
  error_code TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  file_reference TEXT NOT NULL DEFAULT '',
  dedupe_key TEXT UNIQUE,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- v112.45 — relatório mensal integrado do cliente.
-- Mantém os relatórios individuais e reúne cópias mensais validadas em um único PDF.
CREATE TABLE IF NOT EXISTS integrated_report_configs (
  client_id TEXT PRIMARY KEY REFERENCES clientes(registro_id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  report_day SMALLINT NOT NULL DEFAULT 6 CHECK (report_day BETWEEN 1 AND 28),
  report_time TIME NOT NULL DEFAULT '10:00',
  include_instagram BOOLEAN NOT NULL DEFAULT true,
  include_google_business BOOLEAN NOT NULL DEFAULT true,
  include_local_radar BOOLEAN NOT NULL DEFAULT true,
  include_site_analytics BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integrated_instagram_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL REFERENCES clientes(registro_id) ON DELETE CASCADE,
  competence TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (client_id, competence)
);

CREATE TABLE IF NOT EXISTS integrated_report_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL REFERENCES clientes(registro_id) ON DELETE CASCADE,
  competence TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by TEXT NOT NULL DEFAULT '',
  n8n_execution_id TEXT NOT NULL DEFAULT '',
  error_code TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  file_reference TEXT NOT NULL DEFAULT '',
  drive_file_id TEXT NOT NULL DEFAULT '',
  dedupe_key TEXT UNIQUE,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- v112.41 — Sites dos clientes e LEME Social Feed.
CREATE TABLE IF NOT EXISTS client_sites (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clientes(registro_id) ON DELETE CASCADE,
  site_url TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT 'Site principal',
  connection_key_encrypted TEXT NOT NULL DEFAULT '',
  installation_id TEXT NOT NULL DEFAULT '',
  plugin_version TEXT NOT NULL DEFAULT '',
  connection_status TEXT NOT NULL DEFAULT 'not_configured',
  connection_message TEXT NOT NULL DEFAULT '',
  last_connected_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  draft_version INTEGER NOT NULL DEFAULT 1,
  published_version INTEGER NOT NULL DEFAULT 0,
  feed_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, site_url)
);

CREATE TABLE IF NOT EXISTS site_feed_posts (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES client_sites(id) ON DELETE CASCADE,
  instagram_url TEXT NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  sort_order INTEGER NOT NULL DEFAULT 0,
  image_data BYTEA NOT NULL,
  mime_type TEXT NOT NULL,
  original_name TEXT NOT NULL DEFAULT '',
  image_width INTEGER NOT NULL DEFAULT 0,
  image_height INTEGER NOT NULL DEFAULT 0,
  crop_x NUMERIC(5,2) NOT NULL DEFAULT 50,
  crop_y NUMERIC(5,2) NOT NULL DEFAULT 50,
  content_hash TEXT NOT NULL,
  draft_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(site_id, content_hash, instagram_url)
);

CREATE TABLE IF NOT EXISTS site_feed_sync_logs (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES client_sites(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  error_code TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  response JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(site_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_publicacoes_cliente_data ON publicacoes (cliente_id, data_publicacao);
CREATE INDEX IF NOT EXISTS idx_publicacoes_responsavel_status ON publicacoes (responsavel_id, status);
CREATE INDEX IF NOT EXISTS idx_eventos_colaborador_data ON eventos (colaborador_id, data_evento);
CREATE INDEX IF NOT EXISTS idx_clientes_responsavel ON clientes (responsavel_id);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_status ON prompt_templates (status);
CREATE INDEX IF NOT EXISTS idx_crm_prospects_status ON crm_prospects (status_funil);
CREATE INDEX IF NOT EXISTS idx_crm_acoes_prospect ON crm_acoes (prospect_id);

CREATE INDEX IF NOT EXISTS idx_finance_boxes_categoria ON finance_boxes (categoria, cliente_id);
CREATE INDEX IF NOT EXISTS idx_finance_movements_box_mes ON finance_movements (box_id, mes_referencia);
CREATE INDEX IF NOT EXISTS idx_finance_movements_cliente_mes ON finance_movements (cliente_id, mes_referencia);
CREATE INDEX IF NOT EXISTS idx_gravacoes_cliente_data ON gravacoes (cliente_id, data_gravacao);
CREATE INDEX IF NOT EXISTS idx_gravacoes_status_data ON gravacoes (status, data_gravacao);
CREATE INDEX IF NOT EXISTS idx_gravacoes_responsavel ON gravacoes (responsavel_id);
CREATE INDEX IF NOT EXISTS idx_client_integrations_automation ON client_integrations (report_automation_enabled, report_day, report_time);
CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_client_period ON analytics_snapshots (client_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_analytics_deliveries_client_created ON analytics_report_deliveries (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_deliveries_status ON analytics_report_deliveries (status, created_at);
CREATE INDEX IF NOT EXISTS idx_integrated_instagram_client_competence ON integrated_instagram_snapshots (client_id, competence DESC);
CREATE INDEX IF NOT EXISTS idx_integrated_deliveries_client_created ON integrated_report_deliveries (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_integrated_deliveries_status ON integrated_report_deliveries (status, created_at);
CREATE INDEX IF NOT EXISTS idx_integrated_configs_schedule ON integrated_report_configs (enabled, report_day, report_time);
CREATE INDEX IF NOT EXISTS idx_client_sites_client ON client_sites (client_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_feed_posts_site_order ON site_feed_posts (site_id, sort_order, created_at);
