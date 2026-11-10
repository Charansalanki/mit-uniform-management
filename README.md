# MIT Mysore Smart Uniform Management System

Starter implementation with a responsive navy/blue React UI, Express API and PostgreSQL schema.

## Requirements
- Node.js 20+
- PostgreSQL 15+

## Setup
1. Create a PostgreSQL database named `mit_uniform`.
2. Run `server/schema.sql` in that database.
3. Copy `server/.env.example` to `server/.env` and set `DATABASE_URL` and a long `SESSION_SECRET`.
4. From this folder run:
   ```bash
   npm run install:all
   npm run dev
   ```
5. Open http://localhost:5173. API runs on http://localhost:4000.

## Demo vs production
- Student registration and distribution schedule are backed by PostgreSQL.
- Admin dashboard UI is a starter; secure admin login, role management, student self-service verification, rate limiting, audit log UI, file upload, email/WhatsApp API, and deployment hardening must be completed before real student data is collected.
- Never expose student phone numbers or individual measurements on the public distribution page.
- 24-hour edit window is enforced server-side. A future improvement should add verified student identity (OTP or institutional SSO) before allowing edits.
- Create a new campaign for each uniform distribution round. Unique constraint is campaign + normalized USN.
