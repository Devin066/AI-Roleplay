# AI Roleplay

AI Roleplay is a training app for running simulated customer calls. Course admins create roleplay courses, assign learners, and review completed attempts. Learners join a voice session, speak with an AI customer, and receive an AI-scored final assessment after the call ends.

## What It Does

- Create and publish AI customer roleplay courses.
- Assign courses to trainees.
- Run live voice roleplay sessions with Agora.
- Save transcripts when calls end.
- Generate final assessments with scores, strengths, coaching notes, and objective results.
- Let course creators and root admins review attempts, download transcripts, manage deadlines, and reset attempts used.

## User Roles

- **Root Admin**: Manages all users, courses, attempts, transcripts, and assessments.
- **Course Admin**: Creates courses and reviews attempts for courses they own.
- **Trainee**: Takes assigned roleplay courses and views their assessment results.

## How To Use

1. Sign in.
2. As a course admin, open **Course Builder**.
3. Create a roleplay course with a scenario, AI customer, learner goals, and assigned trainees.
4. Publish the course.
5. Trainees open **Courses**, start the roleplay, and complete the call.
6. When the call ends, the app saves a transcript and generates a final assessment.
7. Course admins review results from **Course Attempts**.
8. Use **Download** in the Transcript column to save a learner transcript as a `.txt` file.

## Local Setup

Install dependencies:

```bash
npm install
```

Create a local env file from the example:

```bash
cp .env.example .env.local
```

Fill in the required values in `.env.local`, especially:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB_NAME?sslmode=require
AUTH_SESSION_SECRET=replace-with-a-long-random-secret
NEXT_PUBLIC_AGORA_APP_ID=your-agora-app-id
AGORA_APP_CERTIFICATE=your-agora-certificate
```

Generate Prisma client:

```bash
npm run prisma:generate
```

Run database migrations:

```bash
npm run prisma:deploy
```

Start the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Local PostgreSQL

For an isolated development database on macOS, use the Postgres.app setup in [docs/local-postgres.md](docs/local-postgres.md). It keeps data local, applies Prisma migrations locally, and leaves Neon unchanged.

## Useful Commands

```bash
npm run dev              # Start local development
npm run typecheck        # Check TypeScript
npm run build            # Build for production
npm run prisma:generate  # Generate Prisma client
npm run prisma:deploy    # Apply database migrations
```

## Database Notes

This app uses PostgreSQL through Prisma. It can run against Neon or AWS RDS PostgreSQL as long as `DATABASE_URL` is set correctly.

For AWS RDS, include SSL in the connection string:

```text
?sslmode=require
```

See `docs/project-handoff.md` for more deployment and Neon-to-AWS migration notes.

For the current EC2-only deployment option, see `docs/ec2-app-db-deployment-flow.md`.

## Security Notes

Do not commit real secrets. Keep these only in `.env.local`, Vercel environment variables, AWS Secrets Manager, or another secure secret store.

Never commit:

- `DATABASE_URL`
- API keys
- Agora certificates
- Auth secrets
- Raw database dumps
- Private learner/customer transcripts
