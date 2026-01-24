# Docker Containers - Convo Insight

Este documento detalha todos os containers Docker utilizados no projeto Convo Insight.

## 📋 Resumo dos Serviços

| Serviço | Porta | URL | Descrição |
|---------|-------|-----|-----------|
| PostgreSQL | 5432 | - | Banco de dados principal |
| MinIO API | 9000 | - | Object storage (S3-compatible) |
| MinIO Console | 9001 | http://localhost:9001 | Interface web do MinIO |
| Evolution API | 8080 | http://localhost:8080 | API WhatsApp |
| n8n | 5678 | http://localhost:5678 | Automação de workflows |
| Typebot Builder | 3001 | http://localhost:3001 | Editor de chatbots |
| Typebot Viewer | 3002 | http://localhost:3002 | Interface pública dos bots |

---

## 🗄️ PostgreSQL

**Container:** `convo-insight-db`  
**Imagem:** `postgres:16-alpine`  
**Porta:** `5432`

Banco de dados relacional principal utilizado por todos os serviços.

### Credenciais Padrão
```
Host: localhost (ou postgres dentro do Docker)
Database: convo_insight
User: postgres
Password: postgres
```

### Schemas Utilizados
- `public` - Aplicação principal (Convo Insight)
- `n8n` - Dados do n8n
- `typebot` - Dados do Typebot

### Volume
- `postgres_data` - Persistência dos dados

---

## 📦 MinIO (Object Storage)

**Container:** `convo-insight-minio`  
**Imagem:** `minio/minio:latest`  
**Portas:** `9000` (API), `9001` (Console)

Armazenamento de objetos compatível com S3 para arquivos de mídia.

### Credenciais Padrão
```
Access Key: minioadmin
Secret Key: minioadmin
Bucket: convo-insight
```

### Acesso
- **API:** http://localhost:9000
- **Console:** http://localhost:9001

### Volume
- `minio_data` - Persistência dos arquivos

### Bucket Automático
O container `createbuckets` cria automaticamente o bucket `convo-insight` na inicialização.

---

## 📱 Evolution API (WhatsApp)

**Container:** `convo-insight-evolution`  
**Imagem:** `atendai/evolution-api:latest`  
**Porta:** `8080`

API para integração com WhatsApp via protocolo Evolution.

### Acesso
- **URL:** http://localhost:8080
- **Documentação:** http://localhost:8080/docs

### Credenciais Padrão
```
API Key: your-evolution-api-key-change-me
```

### Configurações Importantes

| Variável | Valor | Descrição |
|----------|-------|-----------|
| `AUTHENTICATION_API_KEY` | `your-evolution-api-key-change-me` | ⚠️ **Alterar em produção** |
| `WEBHOOK_GLOBAL_URL` | `http://host.docker.internal:3000/api/whatsapp/webhooks/evolution` | Webhook para o backend |
| `DATABASE_CONNECTION_URI` | PostgreSQL | Persistência de instâncias |
| `S3_ENABLED` | `true` | Armazenamento de mídia no MinIO |

### Volume
- `evolution_instances` - Dados das instâncias WhatsApp

### Dependências
- PostgreSQL (healthcheck)
- MinIO (healthcheck)

---

## ⚡ n8n (Workflow Automation)

**Container:** `convo-insight-n8n`  
**Imagem:** `n8nio/n8n:latest`  
**Porta:** `5678`

Plataforma de automação de workflows low-code.

### Acesso
- **URL:** http://localhost:5678
- **Usuário:** `admin`
- **Senha:** `admin`

### Credenciais e Segurança

| Variável | Valor | Descrição |
|----------|-------|-----------|
| `N8N_ENCRYPTION_KEY` | `your-n8n-encryption-key-change-me-32chars` | ⚠️ **Alterar em produção** (32 chars) |
| `N8N_BASIC_AUTH_USER` | `admin` | ⚠️ **Alterar em produção** |
| `N8N_BASIC_AUTH_PASSWORD` | `admin` | ⚠️ **Alterar em produção** |

### Configurações

| Variável | Valor | Descrição |
|----------|-------|-----------|
| `DB_POSTGRESDB_SCHEMA` | `n8n` | Schema separado no PostgreSQL |
| `GENERIC_TIMEZONE` | `America/Sao_Paulo` | Timezone |
| `EXECUTIONS_DATA_MAX_AGE` | `168` | Retenção de execuções (horas) |

### Volume
- `n8n_data` - Workflows e configurações

### Dependências
- PostgreSQL (healthcheck)

---

## 🤖 Typebot Builder (Editor de Chatbots)

**Container:** `convo-insight-typebot-builder`  
**Imagem:** `baptistearno/typebot-builder:latest`  
**Porta:** `3001`

Interface de criação e edição de chatbots visuais.

### Acesso
- **URL:** http://localhost:3001
- **Admin Email:** `admin@convo-insight.com`

### Credenciais e Segurança

| Variável | Valor | Descrição |
|----------|-------|-----------|
| `ENCRYPTION_SECRET` | `your-typebot-encryption-secret32` | ⚠️ **Alterar em produção** (32 chars) |
| `NEXTAUTH_SECRET` | `your-nextauth-secret-change-me` | ⚠️ **Alterar em produção** |
| `ADMIN_EMAIL` | `admin@convo-insight.com` | Email do administrador |

### Configurações

| Variável | Valor | Descrição |
|----------|-------|-----------|
| `DATABASE_URL` | PostgreSQL com schema `typebot` | Banco de dados |
| `NEXT_PUBLIC_VIEWER_URL` | `http://localhost:3002` | URL do viewer |
| `DISABLE_SIGNUP` | `false` | Permitir novos cadastros |

### Dependências
- PostgreSQL (healthcheck)
- MinIO (healthcheck)

---

## 💬 Typebot Viewer (Interface Pública)

**Container:** `convo-insight-typebot-viewer`  
**Imagem:** `baptistearno/typebot-viewer:latest`  
**Porta:** `3002`

Interface pública onde os usuários interagem com os chatbots.

### Acesso
- **URL:** http://localhost:3002

### Configurações

> ⚠️ **IMPORTANTE:** As variáveis `ENCRYPTION_SECRET` e `NEXTAUTH_SECRET` **devem ser idênticas** às do Builder.

| Variável | Valor | Descrição |
|----------|-------|-----------|
| `ENCRYPTION_SECRET` | `your-typebot-encryption-secret32` | Deve ser igual ao Builder |
| `NEXTAUTH_SECRET` | `your-nextauth-secret-change-me` | Deve ser igual ao Builder |

### Dependências
- PostgreSQL (healthcheck)
- MinIO (healthcheck)

---

## 🚀 Comandos Úteis

### Iniciar todos os serviços
```bash
docker-compose up -d
```

### Verificar status dos containers
```bash
docker-compose ps
```

### Ver logs de um serviço específico
```bash
docker-compose logs -f evolution-api
docker-compose logs -f n8n
docker-compose logs -f typebot-builder
```

### Parar todos os serviços
```bash
docker-compose down
```

### Parar e remover volumes (⚠️ apaga dados)
```bash
docker-compose down -v
```

### Reiniciar um serviço específico
```bash
docker-compose restart evolution-api
```

### Atualizar imagens
```bash
docker-compose pull
docker-compose up -d
```

---

## ⚠️ Variáveis para Alterar em Produção

### Segurança Crítica

```yaml
# Evolution API
AUTHENTICATION_API_KEY: <gerar-chave-segura>

# n8n
N8N_ENCRYPTION_KEY: <gerar-chave-32-caracteres>
N8N_BASIC_AUTH_USER: <seu-usuario>
N8N_BASIC_AUTH_PASSWORD: <senha-forte>

# Typebot (Builder e Viewer - devem ser iguais)
ENCRYPTION_SECRET: <gerar-chave-32-caracteres>
NEXTAUTH_SECRET: <gerar-chave-segura>
```

### Banco de Dados
```yaml
POSTGRES_PASSWORD: <senha-forte>
```

### MinIO
```yaml
MINIO_ROOT_USER: <seu-usuario>
MINIO_ROOT_PASSWORD: <senha-forte>
```

### Gerar chaves seguras
```bash
# Chave de 32 caracteres
openssl rand -hex 16

# Chave longa para secrets
openssl rand -base64 32
```

---

## 🔗 Comunicação entre Serviços

```
┌─────────────────────────────────────────────────────────────────┐
│                        Docker Network                            │
│                                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────┐          │
│  │ PostgreSQL│◄───│  MinIO   │◄───│  Evolution API   │          │
│  │  :5432   │    │ :9000/01 │    │     :8080        │          │
│  └────┬─────┘    └────┬─────┘    └────────┬─────────┘          │
│       │               │                    │                    │
│       │               │                    │ webhook            │
│       │               │                    ▼                    │
│       │               │         ┌──────────────────┐           │
│       │               │         │  Convo Insight   │           │
│       │               │         │  Backend :3000   │           │
│       │               │         │ (host.docker.    │           │
│       │               │         │  internal)       │           │
│       │               │         └──────────────────┘           │
│       │               │                                         │
│  ┌────┴─────┐    ┌────┴─────┐    ┌──────────────────┐          │
│  │   n8n    │    │ Typebot  │    │  Typebot Viewer  │          │
│  │  :5678   │    │ Builder  │    │     :3002        │          │
│  │          │    │  :3001   │    │                  │          │
│  └──────────┘    └──────────┘    └──────────────────┘          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📝 Notas Adicionais

1. **host.docker.internal**: Permite que containers acessem serviços rodando na máquina host (ex: backend em desenvolvimento).

2. **Healthchecks**: PostgreSQL e MinIO possuem healthchecks configurados. Outros serviços só iniciam após eles estarem prontos.

3. **Volumes**: Todos os dados importantes são persistidos em volumes Docker nomeados.

4. **Timezone**: Configurado para `America/Sao_Paulo` nos serviços que suportam.
