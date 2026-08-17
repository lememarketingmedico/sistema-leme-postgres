services:
  postgres:
    image: postgres:16-alpine
    container_name: sistema-leme-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: sistema_leme
      POSTGRES_USER: sistema_leme
      POSTGRES_PASSWORD: troque_essa_senha
      TZ: America/Sao_Paulo
    volumes:
      - sistema_leme_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sistema_leme -d sistema_leme"]
      interval: 10s
      timeout: 5s
      retries: 5

  web:
    build: .
    container_name: sistema-leme-web
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgresql://sistema_leme:troque_essa_senha@postgres:5432/sistema_leme
      CORS_ORIGIN: https://www.sistemaleme.com.br
      N8N_API_KEY: troque_essa_chave
      N8N_DRIVE_WEBHOOK_URL: https://n8n.adati.app.br/webhook/webhook-drive
      N8N_APPROVAL_WEBHOOK_URL: https://n8n.adati.app.br/webhook/enviar-aprovacao
      N8N_BLOG_WEBHOOK_URL: https://n8n.adati.app.br/webhook/enviar-blog
      N8N_REPORT_WEBHOOK_URL: https://n8n.adati.app.br/webhook/enviar-relatorio
      N8N_CRM_UPLOAD_WEBHOOK_URL: https://n8n.adati.app.br/webhook/crm-upload-anexo
      TZ: America/Sao_Paulo

volumes:
  sistema_leme_postgres_data:
