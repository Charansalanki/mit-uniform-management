# MIT Uniform Management System — College Handover & Ownership Guide

**Client Organization**: Maharaja Institute of Technology Mysore (MITM)  
**System Name**: MIT Uniform Management System (MUMS)  
**Version**: 1.0.0 Production-Ready Release  

---

## 1. Ownership & Intellectual Property

All source code, database schemas, scripts, and documentation residing in this repository are the property of Maharaja Institute of Technology Mysore. 

---

## 2. Key Administrative Credentials & Access Points

| Service | Access URL | Default Access Identifier |
|---|---|---|
| **Admin Portal** | `https://admin.mitmysore.in` (or local `http://localhost:5173/admin.html`) | Username: `MITM` / Email: `admin@mitmysore.in` |
| **Backend API** | `https://api.uniforms.mitmysore.in` | Port `4000` |
| **Student Portal** | `https://uniforms.mitmysore.in` | Public Access |

> [!IMPORTANT]
> The default administrator password must be changed immediately upon first login by navigating to **Admin Settings &rarr; Account Settings &rarr; Change Password**.

---

## 3. Routine College Administration Procedures

### A. Opening & Closing Uniform Drives
1. Navigate to **Admin Portal &rarr; Application Controls**.
2. Click **UG Application: ON** to open registration for B.E. / B.Tech. students.
3. Click **PG Application: ON** to open registration for MBA / MCA / M.Tech. students.
4. When the drive concludes, toggle to **OFF**. A customized notice message will be displayed to students.

### B. Vendor Allocation & Department Routing
1. Navigate to **Admin Portal &rarr; Vendor Management**.
2. View existing tailoring vendors (`MIT-VND-2026-001`, `002`, `003`).
3. Set quotas and assign specific departments (e.g., Computer Science to Cauvery Fabrics, Mechanical to Royal Apparels).
4. Newly registering students will automatically be routed to their assigned vendor.

### C. Tailor Production Reports
1. Navigate to **Admin Portal &rarr; Size & Production Reports**.
2. Filter by department or gender.
3. Click **Export Excel** to provide the master tailoring schedule to vendors.

---

## 4. Maintenance & Backups

1. **Daily Backup**: Set up a server cron job calling:
   ```bash
   node database/backups/backup_database.js
   ```
2. **Health Monitoring**: Monitor `GET /api/health` using any college uptime monitoring tool (e.g. UptimeKuma or BetterStack).
3. **Database File**: The SQLite database is located at `server/data/mit_uniform.db`. Ensure this directory is mounted on persistent storage.
