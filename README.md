# ConvoInsight - WhatsApp Multi-Agent Platform

A powerful multi-agent WhatsApp platform with AI-powered automation, ticket management, lead qualification, and campaign management.

## 🏗️ Architecture

This project has been migrated from Supabase to a custom backend stack:

**Frontend:**
- React + Vite + TypeScript
- shadcn-ui + Tailwind CSS
- Axios for API communication
- WebSocket for real-time updates

**Backend:**
- Express + TypeScript
- Drizzle ORM with PostgreSQL
- MinIO for S3-compatible storage
- JWT authentication
- WebSocket server

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Docker and Docker Compose (recommended)
- Or: PostgreSQL 16+ and MinIO installed locally

### Development with Docker (Recommended)

```sh
# 1. Clone the repository
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# 2. Install dependencies
npm install

# 3. Start backend services (PostgreSQL + MinIO + Backend)
npm run docker:up

# 4. In a separate terminal, start the frontend
npm run dev

# The frontend will be available at http://localhost:8080
# The backend API will be at http://localhost:3001/api
```

### Manual Development Setup

```sh
# 1. Install dependencies
npm install
cd backend && npm install && cd ..

# 2. Start PostgreSQL and MinIO
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16-alpine
docker run -d -p 9000:9000 -p 9001:9001 minio/minio server /data --console-address ":9001"

# 3. Set up environment variables
cp backend/.env.example backend/.env
# Edit backend/.env with your configuration

# 4. Generate and run database migrations
npm run db:generate
npm run db:migrate

# 5. Start both frontend and backend
npm run dev:full
```

## 📚 Documentation

- [Migration Guide](MIGRATION_GUIDE.md) - Complete guide for migrating from Supabase
- [Backend README](backend/README.md) - Backend-specific documentation
- [API Documentation](backend/API.md) - API endpoints and usage (coming soon)

## 🔑 Environment Variables

### Backend (.env)

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/convoinsight
JWT_SECRET=your-32-char-secret-key-change-in-production
JWT_REFRESH_SECRET=your-32-char-refresh-secret-change-in-production
MINIO_ENDPOINT=localhost
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
```

### Frontend (.env)

```bash
VITE_API_URL=http://localhost:3001/api
VITE_WS_URL=ws://localhost:3001/ws
```

## 📦 Available Scripts

### Root Scripts

- `npm run dev` - Start frontend only
- `npm run dev:backend` - Start backend only
- `npm run dev:full` - Start both frontend and backend
- `npm run build` - Build both frontend and backend for production
- `npm run docker:up` - Start all services with Docker Compose
- `npm run docker:down` - Stop all Docker services
- `npm run db:generate` - Generate database migrations
- `npm run db:migrate` - Run database migrations
- `npm run db:studio` - Open Drizzle Studio

### Backend Scripts

```sh
cd backend
npm run dev      # Development server with hot reload
npm run build    # Build for production
npm start        # Start production server
```

## 🗄️ Database Schema

The database contains 64 tables organized by domain:

- **Auth**: Users, roles, permissions, sectors
- **WhatsApp**: Instances, contacts, conversations, messages
- **Tickets**: Support tickets, feedback, kanban
- **Leads**: Lead management and qualification
- **Campaigns**: Marketing campaigns and logs
- **AI**: AI agents, knowledge base, templates
- **SLA**: SLA configuration and violations
- **Webhooks**: Webhook management and logs
- And more...

## 🔐 Authentication

The system uses JWT-based authentication:

1. Register/Login to receive access and refresh tokens
2. Access token expires in 1 hour
3. Refresh token expires in 7 days
4. Tokens are automatically refreshed by the API client

## 🎯 Features

- 🤖 AI-powered chatbot with custom training
- 💬 Multi-agent WhatsApp management
- 🎫 Advanced ticket system with SLA tracking
- 📊 Lead qualification and scoring
- 📱 Campaign management and automation
- 📈 Real-time analytics and reporting
- 🔔 Real-time notifications via WebSocket
- 📁 File storage with MinIO
- 🔒 Role-based access control

## 🧪 Testing

```sh
# Run frontend tests
npm test

# Run backend tests
cd backend && npm test
```

## 📦 Production Deployment

### Using Docker

```sh
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Manual Deployment

1. Build the application:
```sh
npm run build
```

2. Set production environment variables

3. Run database migrations:
```sh
npm run db:migrate
```

4. Start the backend:
```sh
cd backend && npm start
```

5. Serve the frontend build with a web server (nginx, Apache, etc.)

## 🔄 Migrating from Supabase

If you're migrating from the old Supabase version:

1. Follow the [Migration Guide](MIGRATION_GUIDE.md)
2. Run the data migration script:
```sh
OLD_SUPABASE_URL=xxx OLD_SUPABASE_SERVICE_KEY=xxx node scripts/migrate-data.js
```
3. Migrate storage files using the storage migration script

## 🛠️ Tech Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS, shadcn-ui
- **Backend**: Express, TypeScript, Drizzle ORM
- **Database**: PostgreSQL 16
- **Storage**: MinIO (S3-compatible)
- **Authentication**: JWT
- **Real-time**: WebSocket
- **Containerization**: Docker & Docker Compose

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines first.

## 📞 Support

For issues and questions:
- Open an issue on GitHub
- Check the [Migration Guide](MIGRATION_GUIDE.md)
- Review the backend logs: `npm run docker:logs`
