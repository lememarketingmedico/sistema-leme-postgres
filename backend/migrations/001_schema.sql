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

CREATE TABLE IF NOT EXISTS automacao_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  resposta JSONB,
  ok BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_publicacoes_cliente_data ON publicacoes (cliente_id, data_publicacao);
CREATE INDEX IF NOT EXISTS idx_publicacoes_responsavel_status ON publicacoes (responsavel_id, status);
CREATE INDEX IF NOT EXISTS idx_eventos_colaborador_data ON eventos (colaborador_id, data_evento);
CREATE INDEX IF NOT EXISTS idx_clientes_responsavel ON clientes (responsavel_id);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_status ON prompt_templates (status);
CREATE INDEX IF NOT EXISTS idx_crm_prospects_status ON crm_prospects (status_funil);
CREATE INDEX IF NOT EXISTS idx_crm_acoes_prospect ON crm_acoes (prospect_id);
