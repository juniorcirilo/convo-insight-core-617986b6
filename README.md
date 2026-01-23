# ConvoInsight Core

> **🚧 Migration in Progress**: This project is currently being migrated from Supabase to a custom Express + TypeScript + Drizzle ORM stack. See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for details.

An AI-powered WhatsApp conversation management and lead qualification system.

## Architecture

### Frontend
- **Framework**: React + TypeScript + Vite
- **UI**: Shadcn/ui + Tailwind CSS
- **State**: React Query + Context API
- **Real-time**: Socket.IO Client (migrating from Supabase Realtime)

### Backend (New)
- **Framework**: Express + TypeScript
- **ORM**: Drizzle ORM
- **Database**: PostgreSQL
- **Storage**: MinIO
- **Auth**: JWT (access + refresh tokens)
- **Real-time**: Socket.IO
- **API**: RESTful with Zod validation

## Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose (recommended)
- Or: PostgreSQL 15+ and MinIO

### Development Setup

#### Option 1: Docker Compose (Recommended)
```bash
# Start all services (Postgres, MinIO, Backend)
docker-compose up

# Frontend (separate terminal)
npm install
npm run dev
```

#### Option 2: Manual Setup
```bash
# 1. Start PostgreSQL and MinIO (your way)

# 2. Backend setup
cd backend
npm install
cp .env.example .env
# Edit .env with your database and MinIO credentials
npm run db:push  # Initialize database
npm run dev

# 3. Frontend setup (new terminal)
cd ..
npm install
npm run dev
```

### Environment Variables

#### Backend (.env)
See `backend/.env.example` for all variables. Key ones:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for access tokens (32+ chars)
- `JWT_REFRESH_SECRET` - Secret for refresh tokens (32+ chars)
- `MINIO_ENDPOINT` - MinIO server endpoint
- `CORS_ORIGIN` - Frontend URL for CORS

#### Frontend (.env)
```env
VITE_API_URL=http://localhost:3000/api
```

## Project Structure

```
├── backend/                    # Express backend (NEW)
│   ├── src/
│   │   ├── config/            # Database, MinIO, env config
│   │   ├── db/schema/         # Drizzle ORM schemas
│   │   ├── middleware/        # Auth, CORS, error handling
│   │   ├── routes/            # API routes
│   │   ├── controllers/       # Route handlers
│   │   ├── services/          # Business logic
│   │   └── server.ts          # Entry point
│   └── package.json
├── src/                        # Frontend
│   ├── components/            # React components
│   ├── hooks/                 # Custom hooks
│   ├── lib/                   # Utilities
│   │   └── api-client.ts     # NEW: API client with axios
│   ├── pages/                 # Page components
│   └── contexts/              # React contexts
├── docker-compose.yml         # NEW: Local dev environment
└── MIGRATION_GUIDE.md         # NEW: Migration progress & guide
```

## API Documentation

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login (returns access + refresh token)
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout

### Storage
- `POST /api/storage/:bucket/upload` - Upload file
- `GET /api/storage/:bucket/:filename` - Download file
- `DELETE /api/storage/:bucket/:filename` - Delete file
- `GET /api/storage/:bucket/:filename/url` - Get presigned URL

### Real-time (Socket.IO)
- `subscribe:conversation` - Subscribe to conversation updates
- `subscribe:ticket` - Subscribe to ticket updates
- `conversation:update` - Receive conversation updates
- `ticket:update` - Receive ticket updates

## Features

- ✅ JWT Authentication with refresh tokens
- ✅ File upload/download with MinIO
- ✅ Real-time updates with Socket.IO
- ✅ Role-based access control (Admin, Supervisor, Agent)
- ✅ Docker development environment
- 🚧 WhatsApp integration (migrating)
- 🚧 AI-powered responses (migrating)
- 🚧 Lead qualification (migrating)
- 🚧 Ticket management (migrating)

## Migration Status

✅ **Phase 1 Complete**: Backend infrastructure with Express, Drizzle ORM, JWT auth, MinIO, Socket.IO, Docker

🚧 **In Progress**:
- Database schema completion (~30% done)
- Edge function migration to Express routes
- Frontend hooks migration to API client
- Real-time subscriptions to Socket.IO

📋 **See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for detailed progress and next steps**

## Development

```bash
# Frontend
npm run dev          # Start dev server
npm run build        # Build for production
npm run lint         # Run ESLint

# Backend
cd backend
npm run dev          # Start with hot reload
npm run build        # Compile TypeScript
npm run start        # Run compiled version
npm run db:generate  # Generate migrations
npm run db:push      # Push schema to database
```

## Contributing

This project is under active migration. Please see MIGRATION_GUIDE.md before contributing.

## License

Private project.
