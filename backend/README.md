# ConvoInsight Backend

Express + TypeScript + Drizzle ORM backend for ConvoInsight.

## Features

- 🔐 JWT Authentication with refresh tokens
- 📦 MinIO S3-compatible storage
- 🗄️ PostgreSQL database with Drizzle ORM
- 🔌 WebSocket support for real-time updates
- 🛡️ Security middleware (helmet, rate limiting, CORS)
- 📝 Full TypeScript support
- 🔄 Auto-generated database migrations

## Prerequisites

- Node.js 20+
- PostgreSQL 16+
- MinIO or S3-compatible storage

## Quick Start

### With Docker Compose (Recommended)

```bash
# From the root directory
npm run docker:up

# View logs
npm run docker:logs

# Stop services
npm run docker:down
```

### Manual Setup

1. **Install dependencies**

```bash
cd backend
npm install
```

2. **Set up environment variables**

```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Start PostgreSQL and MinIO**

```bash
# Using Docker
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16-alpine
docker run -d -p 9000:9000 -p 9001:9001 minio/minio server /data --console-address ":9001"
```

4. **Generate and run database migrations**

```bash
npm run db:generate
npm run db:migrate
```

5. **Start the development server**

```bash
npm run dev
```

The server will start at http://localhost:3001

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user profile
- `PUT /api/auth/profile` - Update user profile

### Storage

- `POST /api/storage/upload` - Upload file
- `GET /api/storage/:bucket/:filename` - Get file URL
- `DELETE /api/storage/:bucket/:filename` - Delete file
- `GET /api/storage/:bucket/list` - List files in bucket

### Health Check

- `GET /api/health` - Server health check

## WebSocket

Connect to `ws://localhost:3001/ws` for real-time updates.

## Database Schema

The database schema is defined using Drizzle ORM in `src/db/schema/`:

- `auth.ts` - User authentication and roles
- `whatsapp.ts` - WhatsApp integration
- `tickets.ts` - Support tickets
- `leads.ts` - Lead management
- `campaigns.ts` - Marketing campaigns
- `ai.ts` - AI agent configuration
- `sla.ts` - SLA management
- `webhooks.ts` - Webhook configuration
- And more...

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run db:generate` - Generate database migrations
- `npm run db:migrate` - Run database migrations
- `npm run db:studio` - Open Drizzle Studio

## Environment Variables

See `.env.example` for all available environment variables.

Key variables:

- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for JWT tokens (min 32 chars)
- `JWT_REFRESH_SECRET` - Secret for refresh tokens (min 32 chars)
- `MINIO_ENDPOINT` - MinIO server endpoint
- `MINIO_ACCESS_KEY` - MinIO access key
- `MINIO_SECRET_KEY` - MinIO secret key

## Storage Buckets

The following storage buckets are automatically created:

- `convoinsight-profile-images` - User profile images
- `convoinsight-message-media` - WhatsApp message media
- `convoinsight-campaign-media` - Campaign media files
- `convoinsight-attachments` - General attachments
- `convoinsight-exports` - Data exports

## Security

- JWT authentication with access and refresh tokens
- Password hashing with bcrypt (10 rounds)
- Rate limiting (100 requests per 15 minutes)
- CORS protection
- Helmet security headers
- Input validation with Zod

## Production Deployment

1. Build the application:

```bash
npm run build
```

2. Set production environment variables

3. Run migrations:

```bash
npm run db:migrate
```

4. Start the server:

```bash
npm start
```

Or use Docker:

```bash
docker-compose up -d
```

## License

MIT
