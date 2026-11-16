# MIT Uniform Management System — Environment Setup Guide

## 1. Prerequisites

- **Node.js**: Version 24.x LTS (required for native `node:sqlite` `DatabaseSync`).
  - Windows: Download from [nodejs.org](https://nodejs.org).
  - Linux (Ubuntu/Debian):
    ```bash
    curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
    sudo apt install -y nodejs
    ```
- **Git**: Installed and configured.

## 2. Local Setup & Running Portals

### Step 1: Install Dependencies
```bash
npm install
npm install --prefix server
npm install --prefix client
```

### Step 2: Environment Configuration
Copy the template environment file:
```bash
cp .env.example server/.env
```
Open `server/.env` and verify the port (`4000`) and random `JWT_SECRET`.

### Step 3: Run Portals Locally
Run all services simultaneously:
```bash
npm run dev
```
This boots:
- **Backend API**: `http://localhost:4000`
- **Student Portal**: `http://localhost:5173/index.html`
- **Admin Panel**: `http://localhost:5173/admin.html`
- **Vendor Portal**: `http://localhost:5173/vendor-portal.html`

To run portals independently from `apps/`:
- Student Portal: `npm run dev --prefix apps/student-portal` (Port 5173)
- Admin Portal: `npm run dev --prefix apps/admin-portal` (Port 5174)
- Vendor Portal: `npm run dev --prefix apps/vendor-portal` (Port 5175)
