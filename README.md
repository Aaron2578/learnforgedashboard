# LearnForge

## Supabase setup

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local`. Set `VITE_SUPABASE_URL` and `SUPABASE_URL` to the project URL, `VITE_SUPABASE_ANON_KEY` to its publishable/anon key, and `SUPABASE_SERVICE_ROLE_KEY` to the project's server-only service-role key.
3. Apply every migration in `supabase/migrations` in filename order using the Supabase SQL editor, or link the project with the Supabase CLI and run `npx supabase db push`.
4. Set `SUPERUSER_PASSWORD` in `.env.local` to a unique password with at least 12 characters. Run `npm run create:superuser` to create or promote `Aaronchrist2578@gmail.com`.
5. Start the dashboard with `npm run dev`. Student registrations receive the `student` role automatically; only the provisioning script can grant `superuser`.

The provisioning script refuses to promote an existing unverified account and never changes the password of an existing verified account. Store `.env.local` securely and never commit or share the service-role key. After provisioning, remove `SUPABASE_SERVICE_ROLE_KEY` and `SUPERUSER_PASSWORD` from `.env.local`; the browser only needs the two `VITE_` public settings.

## Student and administrator features

- Student registrations and invitations start pending. From Students, administrators can add one student or invite a list of up to 25 by email, approve or suspend access, and permanently delete accounts.
- Administrators manage Supabase-backed courses and enrollments, private student notes, and dated attendance records.
- Assignments and tests can be targeted to selected approved students. Tests support secure built-in multiple choice and external HTTPS links. Assignment submissions, grades, test attempts, and answer keys use Supabase row-level security.
- Students see only their assigned courses, notes, attendance, assignments, tests, and notifications. Students can also submit assignment text or PDF/DOC/DOCX/TXT files (up to 10 MB) and message the institution.
- Administrators can reply to student messages, download and grade submissions, send email notifications, and manually send assignment or test reminders.

Student invitations use Supabase Auth's invite email, so configure SMTP under Supabase Authentication settings for reliable delivery. Set `APP_URL` (the deployed dashboard URL) as an `admin-actions` Edge Function secret and add it to Supabase Authentication's allowed redirect URLs; when it is omitted, the project's configured Auth redirect URL is used. Custom notifications and assignment/test reminders send email through SendGrid: verify a sender email in SendGrid using Single Sender Verification, then set `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` as Edge Function secrets. Supabase supplies the function's URL, anon key, and service-role key at runtime; never expose or copy the service-role key into browser configuration. Notification rows are saved in the student portal even if optional email delivery fails, and the admin UI reports the email failure separately.

The directory, courses, attendance, notes, and student portal data are database-backed. The calendar and reports are separate dashboard views and do not control student access.

Without both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, the app shows the Supabase setup screen rather than allowing unauthenticated access to the portal.
