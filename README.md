This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Database

Local development:

```bash
npx supabase start          # boot Postgres, Auth, Realtime, Studio
npx supabase db reset       # apply all migrations + seed
npx supabase test db        # run the pgTAP suite
./scripts/test-concurrent-registration.sh   # prove registration is race-safe
```

This project's local ports are remapped to the 5433x block (db 54332, API 54331,
Studio 54333) so it can run alongside other Supabase projects on the same
machine — the default 5432x block is not assumed to be free. Read the live URL
with `npx supabase status -o env` rather than hardcoding a port.

After changing the schema, regenerate types:

```bash
npx supabase gen types typescript --local > types/supabase.ts
```

### First admin in production

`profiles.role` defaults to `member`, and only an admin may change a role, so
the first admin must be set manually — there is deliberately no "first user
becomes admin" rule, which would be a live privilege-escalation path on a
public signup form.

Sign up normally, then run once in the Supabase SQL editor:

```sql
update public.profiles set role = 'admin' where id = '<your-user-uuid>';
```

The role-change guard exempts calls where `auth.uid()` is null, which is the
case for the SQL editor and any `service_role` connection.
