import { db, initSchema, hashPassword, verifyPassword, generateToken, verifyToken } from './db.js';

async function runTests() {
  console.log('--- STARTING AUTOMATED TEST SUITE ---');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  const BASE_URL = 'http://localhost:4000/api';

  // 1. Test Health Check
  try {
    const res = await fetch(`${BASE_URL}/health`);
    const data = await res.json();
    assert(res.status === 200 && data.ok === true, 'GET /api/health returns 200 OK with alive status');
  } catch (err) {
    assert(false, 'GET /api/health failed: ' + err.message);
  }

  // 2. Test Active Campaign
  try {
    const res = await fetch(`${BASE_URL}/campaign`);
    const data = await res.json();
    assert(res.status === 200 && Boolean(data.name), 'GET /api/campaign returns active campaign');
  } catch (err) {
    assert(false, 'GET /api/campaign failed: ' + err.message);
  }

  // 3. Test Student Registration Submission
  const testUSN = `4MH22TEST${Math.floor(1000 + Math.random() * 9000)}`;
  let testRegId = '';
  try {
    const payload = {
      fullName: 'Ananya Sharma',
      gender: 'Female',
      usn: testUSN,
      department: 'ECE',
      semester: 4,
      section: 'B',
      phone: '9876543210',
      shirtSize: 'S',
      trouserSize: '30'
    };
    const res = await fetch(`${BASE_URL}/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    testRegId = data.id || data.registrationId;
    assert(res.status === 201 && testRegId.includes(testUSN), `POST /api/registrations saves student record with regId: ${testRegId}`);
  } catch (err) {
    assert(false, 'POST /api/registrations failed: ' + err.message);
  }

  // 4. Test Duplicate USN Submission Prevention (HTTP 409)
  try {
    const duplicatePayload = {
      fullName: 'Ananya Sharma Attempt 2',
      gender: 'Female',
      usn: testUSN,
      department: 'ECE',
      semester: 4,
      section: 'B',
      phone: '9876543210',
      shirtSize: 'M',
      trouserSize: '32'
    };
    const res = await fetch(`${BASE_URL}/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(duplicatePayload)
    });
    const data = await res.json();
    assert(res.status === 409 && data.message.includes('already submitted'), 'Duplicate USN rejected with HTTP 409 Conflict');
  } catch (err) {
    assert(false, 'Duplicate submission check failed: ' + err.message);
  }

  // 5. Test 24-Hour Edit Rule (Active Window)
  try {
    const updatePayload = {
      fullName: 'Ananya S. Sharma',
      gender: 'Female',
      usn: testUSN,
      department: 'ECE',
      semester: 4,
      section: 'B',
      phone: '9876543210',
      shirtSize: 'M',
      trouserSize: '32'
    };
    const res = await fetch(`${BASE_URL}/registrations/${testRegId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload)
    });
    assert(res.status === 200, 'PUT /api/registrations updates successfully within 24h window');
  } catch (err) {
    assert(false, '24h edit window update failed: ' + err.message);
  }

  // 6. Test 24-Hour Edit Rule Enforcement After Expiration (HTTP 403)
  try {
    // Manually expire the deadline in DB
    db.prepare("UPDATE registrations SET editable_until = '2020-01-01T00:00:00.000Z' WHERE registration_id = ?").run(testRegId);
    const updatePayload = {
      fullName: 'Ananya S. Late',
      gender: 'Female',
      usn: testUSN,
      department: 'ECE',
      semester: 4,
      section: 'B',
      phone: '9876543210',
      shirtSize: 'L',
      trouserSize: '34'
    };
    const res = await fetch(`${BASE_URL}/registrations/${testRegId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload)
    });
    const data = await res.json();
    assert(res.status === 403 && data.message.includes('expired'), 'Expired edit rejected with HTTP 403 Forbidden');
  } catch (err) {
    assert(false, 'Expired edit deadline check failed: ' + err.message);
  }

  // 7. Test Admin Authentication & Password Hashing
  let adminToken = '';
  try {
    // Bad credentials
    const badRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@mitmysore.ac.in', password: 'WrongPassword' })
    });
    assert(badRes.status === 401, 'POST /api/auth/login rejects wrong password with 401');

    // Valid credentials
    const goodRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@mitmysore.ac.in', password: 'Admin@MIT2026' })
    });
    const goodData = await goodRes.json();
    adminToken = goodData.token;
    assert(goodRes.status === 200 && Boolean(adminToken), 'POST /api/auth/login returns token for valid admin');
  } catch (err) {
    assert(false, 'Admin authentication test failed: ' + err.message);
  }

  // 8. Test Amazon-Style Search & Pagination
  try {
    const res = await fetch(`${BASE_URL}/admin/registrations?search=Ananya&pageSize=25&page=1`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const data = await res.json();
    assert(
      res.status === 200 &&
      Array.isArray(data.items) &&
      data.pagination &&
      typeof data.pagination.total === 'number' &&
      data.items.some(i => i.usn === testUSN),
      'GET /api/admin/registrations searches by name and returns server-side paginated results'
    );
  } catch (err) {
    assert(false, 'Admin search & pagination test failed: ' + err.message);
  }

  // 9. Test Production & Distribution Status Updates
  try {
    const statusRes = await fetch(`${BASE_URL}/admin/registrations/${testRegId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        productionStatus: 'ready',
        distributionStatus: 'ready',
        collectionRoom: 'Room 204, Academic Block A',
        collectionDate: '2026-11-05',
        collectionInstructions: 'Bring Student ID'
      })
    });
    assert(statusRes.status === 200, 'PATCH /api/admin/registrations/:id/status updates production and room');

    // Check student status reflects updated room
    const checkRes = await fetch(`${BASE_URL}/registrations/${testRegId}/status`);
    const checkData = await checkRes.json();
    assert(checkData.production_status === 'ready' && checkData.collection_room === 'Room 204, Academic Block A', 'Student status endpoint reflects room assignment');
  } catch (err) {
    assert(false, 'Status and room update failed: ' + err.message);
  }

  // 10. Test Distribution Announcements & Public Privacy
  try {
    // Upsert a draft schedule (published = false)
    await fetch(`${BASE_URL}/admin/distribution`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        department: 'MECH',
        semester: 6,
        section: 'A',
        status: 'pending',
        room: 'Workshop Lab',
        published: false
      })
    });

    // Public lookup for draft: MUST NOT BE VISIBLE
    const draftRes = await fetch(`${BASE_URL}/distribution?department=MECH&semester=6&section=A`);
    const draftData = await draftRes.json();
    assert(Array.isArray(draftData) && draftData.length === 0, 'Public distribution endpoint hides unpublished draft schedules');

    // Upsert published schedule
    await fetch(`${BASE_URL}/admin/distribution`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        department: 'MECH',
        semester: 6,
        section: 'A',
        status: 'ready',
        building: 'Mechanical Block',
        room: 'Room 102',
        instructions: 'Report by 10:00 AM',
        published: true
      })
    });

    // Public lookup for published schedule
    const pubRes = await fetch(`${BASE_URL}/distribution?department=MECH&semester=6&section=A`);
    const pubData = await pubRes.json();
    assert(
      Array.isArray(pubData) &&
      pubData.length > 0 &&
      pubData[0].room === 'Room 102' &&
      pubData[0].full_name === undefined &&
      pubData[0].phone === undefined,
      'Public distribution endpoint displays published schedule and keeps student private details confidential'
    );
  } catch (err) {
    assert(false, 'Distribution schedule publication test failed: ' + err.message);
  }

  // 11. Test Audit Logs
  try {
    const auditRes = await fetch(`${BASE_URL}/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const logs = await auditRes.json();
    assert(Array.isArray(logs) && logs.length > 0 && logs.some(l => l.action === 'ADMIN_LOGIN'), 'Audit logging records administrative actions');
  } catch (err) {
    assert(false, 'Audit logs test failed: ' + err.message);
  }

  console.log('====================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('====================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();

