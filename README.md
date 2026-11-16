# MIT Mysore – Smart Uniform Management System (MUMS)

An enterprise academic uniform sizing, procurement, online payment verification, and distribution management platform developed for **Maharaja Institute of Technology Mysore (MITM)**.

---

## 🏛️ System Architecture

The application is structured into decoupled portals and a centralized backend:

```
MIT-UNIFORM-MANAGEMENT-SYSTEM/
│
├── apps/
│   ├── student-portal/     # Student uniform registration, sizing & payment tracking
│   ├── admin-portal/       # Super-admin dashboard, department allocation & reporting
│   └── vendor-portal/      # Vendor tailor measurements & distribution management
│
├── server/
│   ├── src/                # Modular controllers, routes, middleware, services & utils
│   ├── data/               # Native SQLite database (mit_uniform.db with WAL mode)
│   ├── uploads/            # Payment screenshots and dynamic QR codes
│   └── index.js            # Express API server (Port 4000)
│
├── database/
│   ├── schema/             # DDL schema definitions
│   ├── migrations/         # Database migrations
│   ├── seeds/              # Seed configuration
│   └── backups/            # Database backups
│
├── shared/                 # Shared TypeScript types, constants, and validation rules
├── infrastructure/         # Nginx configs, Dockerfile, Vercel configs, and PM2 specs
└── documentation/          # Handover and architecture specifications
```

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- **Node.js**: Version 24.x LTS (Required for native `node:sqlite` DatabaseSync)
- **Git**

### Installation & Launch
1. Clone the repository:
   ```bash
   git clone <REPO_URL>
   cd mit-uniform-management
   ```
2. Install dependencies:
   ```bash
   npm run install:all
   ```
3. Copy environment configuration:
   ```bash
   cp .env.example server/.env
   ```
4. Start both Backend & Frontend portals:
   ```bash
   npm run dev
   ```

### Accessing Portals
- **Student Portal**: [http://localhost:5173](http://localhost:5173)
- **Admin Panel**: [http://localhost:5173/admin.html](http://localhost:5173/admin.html)
- **Vendor Portal**: [http://localhost:5173/vendor-portal.html](http://localhost:5173/vendor-portal.html)
- **Backend API Health**: [http://localhost:4000/api/health](http://localhost:4000/api/health)

---

## 🛡️ Production Deployment

See the complete production deployment guide in [documentation/DEPLOYMENT_GUIDE.md](documentation/DEPLOYMENT_GUIDE.md) or [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md):
- **Backend**: Deploy on an Ubuntu VPS or Container Platform with Persistent Storage (e.g. Render with Persistent Disk).
- **Student Portal**: Deploy on Vercel / Netlify / Cloudflare Pages.
- **Admin Portal**: Deploy on Vercel / Cloudflare Pages (with optional Cloudflare Zero Trust protection).

---

## 📚 Handover Documentation

- [Architecture Guide](documentation/ARCHITECTURE.md)
- [Database Documentation](documentation/DATABASE.md)
- [REST API Specification](documentation/API_DOCUMENTATION.md)
- [Environment Setup](documentation/ENVIRONMENT_SETUP.md)
- [College Handover Guide](documentation/COLLEGE_HANDOVER.md)

---

## 🔒 Security & Data Integrity

- **Database**: SQLite 3 with Write-Ahead Logging (`WAL`), `busy_timeout = 10000`, and `foreign_keys = ON`.
- **Validation**: Strict VTU USN regex validation (`/^4MH\d{2}[A-Z]{2}\d{3}$/i`) on both frontend and backend.
- **Duplicate Prevention**: Database-level unique index on normalized UTR numbers to prevent duplicate payment submissions.
- **Access Control**: Role-based access control with JWT and HTTP-only cookie support.
