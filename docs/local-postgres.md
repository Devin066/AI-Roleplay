# Local PostgreSQL Development

This project uses Postgres.app for a local PostgreSQL development database. The generated database files stay in `.local/postgres-data/`, which Git ignores.

## Start the database

```bash
npm run db:local:start
```

The command initializes the cluster on first use, starts PostgreSQL at `127.0.0.1:5432`, and creates `cse_training_partner_local`.

## Configure the app

Set this in `.env.local`, replacing `YOUR_MAC_USERNAME` with the output of `id -un`:

```env
DATABASE_URL="postgresql://YOUR_MAC_USERNAME@127.0.0.1:5432/cse_training_partner_local?schema=public"
```

Then apply the committed migrations and run the app:

```bash
npm run prisma:local:deploy
npm run dev
```

## Create a local root admin

A new local database has no accounts. Create one for development without affecting Neon:

```bash
LOCAL_ADMIN_EMAIL="admin@local.test" \
LOCAL_ADMIN_PASSWORD="choose-a-strong-local-password" \
npm run db:local:create-admin
```

Use that account to sign in locally and test Control Panel, Feedbacks & Issues, and feedback submissions.

## Daily commands

```bash
npm run db:local:status
npm run db:local:stop
npm run db:local:start
```

Use the local database for development and schema testing. Keep Neon as a separate staging or production environment; local migrations must still be deployed there deliberately.
