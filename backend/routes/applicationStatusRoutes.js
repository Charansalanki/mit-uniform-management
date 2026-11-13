const express = require('express');
const {
  getApplicationStatus,
  getClosedVideoUrl,
  streamApplicationStatus,
  updateUgStatus,
  updatePgStatus,
} = require('../controllers/applicationStatusController');
const { lookupStudentUsn } = require('../controllers/studentController');

const router = express.Router();

// Public endpoints
router.get('/application-status', getApplicationStatus);
router.get('/application-status/closed-video', getClosedVideoUrl);
router.get('/application-status/stream', streamApplicationStatus);

// Student USN lookup
router.get('/students/lookup/:usn', lookupStudentUsn);

// Admin UG application switch (PATCH, PUT, POST)
router.patch('/admin/application-status/ug', updateUgStatus);
router.put('/admin/application-status/ug', updateUgStatus);
router.post('/admin/application-status/ug', updateUgStatus);

// Admin PG application switch (PATCH, PUT, POST)
router.patch('/admin/application-status/pg', updatePgStatus);
router.put('/admin/application-status/pg', updatePgStatus);
router.post('/admin/application-status/pg', updatePgStatus);

module.exports = router;

