import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { db } from './db.js';
import { requireAdminJwt } from './jwtAuth.js';
import { getOrInitAppStatus } from './middleware/requireStudentAppOpen.js';
import sseHub from './sseHub.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Multer storage for uploading/updating the OFF video from Admin Panel
const videoDir = path.join(__dirname, 'uploads', 'system', 'videos');
if (!fs.existsSync(videoDir)) {
  try {
    fs.mkdirSync(videoDir, { recursive: true });
  } catch (e) {
    console.warn('[AppControl] Could not create video upload dir:', e.message);
  }
}

const uploadOffVideo = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, videoDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.mp4';
      cb(null, `MIT_APP_OFF_VIDEO_${Date.now()}${ext}`);
    }
  }),
  fileFilter: (req, file, cb) => {
    const allowed = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only MP4, WebM, or MOV video files are allowed.'), false);
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50 MB limit
});

// Helper: Broadcast application status change to all open Student & Admin sessions
const broadcastApplicationStatusChange = (appState) => {
  try {
    const nowIso = new Date().toISOString();

    // Increment global sync version
    let syncVersion = 1;
    try {
      db.prepare(`
        INSERT INTO system_sync_state (id, sync_version, last_event, updated_at)
        VALUES ('MIT_GLOBAL_SYNC_STATE', 1, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          sync_version = sync_version + 1,
          last_event = excluded.last_event,
          updated_at = datetime('now')
      `).run(
        appState.is_application_open
          ? 'STUDENT_APPLICATION_SWITCHED_ON'
          : 'STUDENT_APPLICATION_SWITCHED_OFF'
      );

      const syncRow = db.prepare('SELECT sync_version FROM system_sync_state WHERE id = ?').get('MIT_GLOBAL_SYNC_STATE');
      if (syncRow) syncVersion = Number(syncRow.sync_version);
    } catch (_) {}

    const payload = {
      isApplicationOpen: Boolean(appState.is_application_open),
      statusLabel: appState.status_label,
      videoUrl: appState.video_url,
      fallbackMessage: appState.fallback_message,
      syncVersion,
      updatedAt: appState.updated_at || nowIso
    };

    sseHub.notifyConfigSubscribers('APPLICATION_STATUS_CHANGED', payload);
    sseHub.notifyConfigSubscribers('GLOBAL_SYNC_UPDATE', payload);
    sseHub.notifyAdmins('APPLICATION_STATUS_CHANGED', payload);
    sseHub.broadcast('APPLICATION_STATUS_CHANGED', payload);
  } catch (err) {
    console.error('[AppControl] Broadcast app status error:', err.message);
  }
};

// ============================================================================
// 1. PUBLIC ENDPOINT: GET CURRENT STUDENT APPLICATION STATUS
// ============================================================================
router.get('/application-status', (req, res) => {
  try {
    const appState = getOrInitAppStatus();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const isOpen = Boolean(appState.is_application_open);

    return res.json({
      success: true,
      isApplicationOpen: isOpen,
      statusLabel: isOpen ? 'Application ON' : 'Application OFF',
      videoUrl: appState.video_url || '/assets/video/application-closed.mp4',
      fallbackMessage:
        appState.fallback_message ||
        'The application is temporarily unavailable. Please check back later.',
      updatedAt: appState.updated_at
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve application status.'
    });
  }
});

// ============================================================================
// 2. ADMIN ENDPOINT: GET APPLICATION CONTROLLER DETAILS & HISTORY
// ============================================================================
router.get('/admin/application-controller', requireAdminJwt, (req, res) => {
  try {
    const appState = getOrInitAppStatus();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    let history = [];
    try {
      history = JSON.parse(appState.toggle_history || '[]');
    } catch (_) {}

    const isOpen = Boolean(appState.is_application_open);

    return res.json({
      success: true,
      controller: {
        isApplicationOpen: isOpen,
        statusLabel: isOpen ? 'Application ON' : 'Application OFF',
        videoUrl: appState.video_url || '/assets/video/application-closed.mp4',
        fallbackMessage:
          appState.fallback_message ||
          'The application is temporarily unavailable. Please check back later.',
        updatedByUsername: appState.updated_by_username || 'Administrator',
        updatedAt: appState.updated_at,
        toggleHistory: history.slice(-25).reverse()
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 3. ADMIN ENDPOINT: UPDATE APPLICATION ON / OFF STATUS
// ============================================================================
router.patch('/admin/application-controller/status', requireAdminJwt, (req, res) => {
  try {
    const { isApplicationOpen, videoUrl, fallbackMessage } = req.body;

    if (typeof isApplicationOpen !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isApplicationOpen boolean value (true or false) is required.'
      });
    }

    const appState = getOrInitAppStatus();
    const previousState = Boolean(appState.is_application_open);
    const newStateInt = isApplicationOpen ? 1 : 0;
    const newStatusLabel = isApplicationOpen ? 'Application ON' : 'Application OFF';

    const cleanVideoUrl = (videoUrl !== undefined && String(videoUrl).trim() !== '')
      ? String(videoUrl).trim()
      : (appState.video_url || '/assets/video/application-closed.mp4');

    const cleanFallback = (fallbackMessage !== undefined && String(fallbackMessage).trim() !== '')
      ? String(fallbackMessage).trim()
      : (appState.fallback_message || 'The application is temporarily unavailable. Please check back later.');

    const adminUsername = req.admin?.username || req.admin?.name || 'Administrator';
    const adminId = req.admin?.adminId || req.adminId || 'SUPER_ADMIN';
    const nowIso = new Date().toISOString();

    let history = [];
    try {
      history = JSON.parse(appState.toggle_history || '[]');
    } catch (_) {}

    history.push({
      previousState,
      newState: isApplicationOpen,
      changedByUsername: adminUsername,
      changedAt: nowIso
    });

    db.prepare(`
      UPDATE student_application_status
      SET is_application_open = ?,
          status_label = ?,
          video_url = ?,
          fallback_message = ?,
          updated_by_admin_id = ?,
          updated_by_username = ?,
          toggle_history = ?,
          updated_at = ?
      WHERE id = 'MIT_STUDENT_APP_MASTER_SWITCH'
    `).run(
      newStateInt,
      newStatusLabel,
      cleanVideoUrl,
      cleanFallback,
      adminId,
      adminUsername,
      JSON.stringify(history),
      nowIso
    );

    // Audit log
    try {
      db.prepare(`
        INSERT INTO payment_audit_logs (
          id, actor_type, actor_identifier, action,
          previous_state, new_state, ip_address, created_at
        ) VALUES (?, 'ADMIN', ?, 'STUDENT_APPLICATION_STATUS_TOGGLED', ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        adminUsername,
        JSON.stringify({ previousState: previousState ? 'Application ON' : 'Application OFF' }),
        JSON.stringify({ newState: newStatusLabel, videoUrl: cleanVideoUrl, fallbackMessage: cleanFallback }),
        req.ip || '127.0.0.1',
        nowIso
      );
    } catch (_) {}

    const updatedRow = getOrInitAppStatus();
    broadcastApplicationStatusChange(updatedRow);

    return res.json({
      success: true,
      message: `Student Application is now switched ${
        isApplicationOpen ? 'ON (Active for Students)' : 'OFF (Displaying Video Screen)'
      }. All existing student registrations, UTRs, and payment records remain untouched.`,
      controller: {
        isApplicationOpen,
        statusLabel: newStatusLabel,
        videoUrl: cleanVideoUrl,
        fallbackMessage: cleanFallback,
        updatedByUsername: adminUsername,
        updatedAt: nowIso,
        toggleHistory: history.slice(-25).reverse()
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 4. ADMIN ENDPOINT: UPLOAD OR UPDATE THE OFF-SCREEN VIDEO FILE
// ============================================================================
router.post(
  '/admin/application-controller/upload-video',
  requireAdminJwt,
  uploadOffVideo.single('videoFile'),
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Please select a valid video file (MP4, WebM, MOV).'
        });
      }

      const adminUsername = req.admin?.username || req.admin?.name || 'Administrator';
      const adminId = req.admin?.adminId || req.adminId || 'SUPER_ADMIN';
      const newVideoUrl = `/uploads/system/videos/${req.file.filename}`;
      const nowIso = new Date().toISOString();

      db.prepare(`
        UPDATE student_application_status
        SET video_url = ?,
            updated_by_admin_id = ?,
            updated_by_username = ?,
            updated_at = ?
        WHERE id = 'MIT_STUDENT_APP_MASTER_SWITCH'
      `).run(newVideoUrl, adminId, adminUsername, nowIso);

      const updatedRow = getOrInitAppStatus();
      broadcastApplicationStatusChange(updatedRow);

      return res.json({
        success: true,
        message: 'Application OFF video uploaded and configured successfully.',
        videoUrl: newVideoUrl
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
);

export default router;

