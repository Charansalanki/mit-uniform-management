import express from 'express';
import sseHub from './sseHub.js';
import {
  requireAdminJwt,
  requireVendorJwt,
  requireStudentTrackingJwt
} from './jwtAuth.js';

const router = express.Router();

// 1. ADMIN LIVE STREAM (Requires Admin JWT)
// Receives: New student registrations, new payment submissions, vendor verifications, scanner/amount changes
router.get('/sse/admin', requireAdminJwt, (req, res) => {
  sseHub.addAdminClient(req, res);
});

// 2. VENDOR PORTAL LIVE STREAM (Requires Vendor JWT)
// Receives: Only students & payments assigned to req.vendorId, plus instant revocation termination
router.get('/sse/vendor', requireVendorJwt, (req, res) => {
  sseHub.addVendorClient(req.vendorId, req, res);
});

// 3. STUDENT TRACKING LIVE STREAM (Requires Student Tracking JWT matching :registrationId)
// Receives: Instant "Payment Successful", "Payment Rejected", or "Under Verification" updates
router.get('/sse/student/:registrationId', requireStudentTrackingJwt, (req, res) => {
  sseHub.addStudentClient(req.params.registrationId, req, res);
});

// 4. PUBLIC PAYMENT CONFIG STREAM (For active Step 4 payment screen)
// Receives: Live Payment Amount, Flexible Range, Collection ON/OFF, and Vendor QR Scanner replacements
router.get('/sse/payment-config', (req, res) => {
  sseHub.addPublicConfigClient(req, res);
});

// 5. BACKWARD-COMPATIBILITY ALIAS
router.get('/payments/live-stream/:registrationId', (req, res) => {
  sseHub.addStudentClient(req.params.registrationId, req, res);
});

export default router;

