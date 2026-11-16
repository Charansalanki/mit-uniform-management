# MIT Uniform Management System — REST API Specification

**Base URL**: `http://localhost:4000` (Local) / `https://api.uniforms.mitmysore.in` (Production)

## 1. System Endpoints

### `GET /api/health`
Health check probe for monitoring tools and uptime checkers.
- **Response `200 OK`**:
  ```json
  { "ok": true, "alive": true, "engine": "sqlite-node24" }
  ```

### `GET /api/sse`
Real-time Server-Sent Events (SSE) stream for live updates to the Admin Dashboard and Vendor Portals.
- **Headers**: `Content-Type: text/event-stream`, `Cache-Control: no-cache`

---

## 2. Student Portal Endpoints

### `GET /api/student/application-status`
Returns whether Undergraduate and Postgraduate applications are currently open or closed.

### `POST /api/registrations`
Submits a new uniform registration.
- **Payload**:
  ```json
  {
    "fullName": "Student Name",
    "gender": "Male",
    "usn": "4MH25CS001",
    "phone": "9876543210",
    "collegeEmail": "student@mitmysore.in",
    "department": "CS",
    "semester": 1,
    "section": "A",
    "academicYear": "2025-2026",
    "shirtSize": "M",
    "trouserSize": "32",
    "blazerSize": "38",
    "measurements": {}
  }
  ```

### `POST /api/payments/submit`
Submits payment proof (Multipart Form Data with screenshot and UTR).

### `GET /api/student/track/:token`
Queries student status, allocated vendor, and uniform collection slip data.

---

## 3. Admin Endpoints (Require Bearer Token)

### `POST /api/admin/auth/login`
Authenticates administrative staff. Returns JWT token and admin profile.

### `GET /api/admin/registrations`
Lists registered students with search, department filtering, and pagination.

### `POST /api/admin/application-control/toggle-ug`
Toggles Undergraduate applications ON or OFF.

### `POST /api/admin/application-control/toggle-pg`
Toggles Postgraduate applications ON or OFF.

### `POST /api/admin/payments/verify/:submissionId`
Verifies or rejects a student's payment submission.

---

## 4. Vendor Endpoints (Require Magic Link Token)

### `GET /api/vendor-portal/dashboard`
Fetches the vendor's assigned department student list and quota.

### `POST /api/vendor-portal/mark-collected/:studentId`
Marks uniform as collected by the student.
