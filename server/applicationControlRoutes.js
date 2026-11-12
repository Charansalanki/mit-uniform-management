import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { db } from './db.js';
import { requireAdminJwt } from './jwtAuth.js';
import sseHub from './sseHub.js';
import {
  initUgPgControlTables,
  getUgPgControlState
} from './config/ugPgApplicationStatusDb.js';
import {
  classifyUsnOrCourseCategory,
  filterStudentFacingUsnRecords
} from './middleware/enforceUgPgAccess.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize tables in SQLite
initUgPgControlTables(db);

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

export function createApplicationControlRouter(getDbInstance = () => db) {
  const router = express.Router();

  // Helper to broadcast status changes
  const broadcastUgPgChange = (state) => {
    try {
      const activeDb = typeof getDbInstance === 'function' ? getDbInstance() : getDbInstance;
      const nowIso = new Date().toISOString();
      let syncVersion = Date.now();

      try {
        activeDb.prepare(`
          INSERT INTO system_sync_state (id, sync_version, last_event, updated_at)
          VALUES ('MIT_GLOBAL_SYNC_STATE', 1, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            sync_version = sync_version + 1,
            last_event = excluded.last_event,
            updated_at = datetime('now')
        `).run('UG_PG_APPLICATION_STATUS_TOGGLED');

        const syncRow = activeDb
          .prepare('SELECT sync_version FROM system_sync_state WHERE id = ?')
          .get('MIT_GLOBAL_SYNC_STATE');
        if (syncRow) syncVersion = Number(syncRow.sync_version);
      } catch (_) {}

      const livePayload = {
        ...state,
        eventName: 'UG_PG_STATUS_CHANGED',
        syncVersion,
        updatedAt: state.lastUpdatedAt || nowIso
      };

      sseHub.notifyConfigSubscribers('APPLICATION_STATUS_CHANGED', livePayload);
      sseHub.notifyConfigSubscribers('GLOBAL_SYNC_UPDATE', livePayload);
      sseHub.notifyAdmins('APPLICATION_STATUS_CHANGED', livePayload);
      sseHub.broadcast('APPLICATION_STATUS_CHANGED', livePayload);
      sseHub.broadcast('UG_PG_STATUS_CHANGED', livePayload);
    } catch (err) {
      console.error('[AppControl] Broadcast UG/PG status error:', err.message);
    }
  };

  // ==========================================================================
  // 1. PUBLIC ENDPOINT: GET /api/application-status
  // Live independent UG & PG states with zero caching
  // ==========================================================================
  router.get('/application-status', (req, res) => {
    try {
      const activeDb = typeof getDbInstance === 'function' ? getDbInstance() : getDbInstance;
      const state = getUgPgControlState(activeDb);

      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');

      return res.json({
        success: true,
        ugApplicationOpen: state.ugApplicationOpen,
        pgApplicationOpen: state.pgApplicationOpen,
        ugStatusLabel: state.ugStatusLabel,
        pgStatusLabel: state.pgStatusLabel,
        bothClosed: state.bothClosed,
        bothOpen: state.bothOpen,
        isApplicationOpen: state.ugApplicationOpen || state.pgApplicationOpen,
        statusLabel: (state.ugApplicationOpen || state.pgApplicationOpen) ? 'Application ON' : 'Application OFF',
        ugClosedMessage: state.ugClosedMessage,
        pgClosedMessage: state.pgClosedMessage,
        videoUrl: state.videoUrl,
        fallbackMessage: state.bothClosed
          ? 'Uniform registration is currently closed.'
          : (!state.ugApplicationOpen ? state.ugClosedMessage : state.pgClosedMessage),
        ugUpdatedBy: state.ugUpdatedBy,
        ugUpdatedAt: state.ugUpdatedAt,
        pgUpdatedBy: state.pgUpdatedBy,
        pgUpdatedAt: state.pgUpdatedAt,
        lastUpdatedBy: state.lastUpdatedBy,
        lastUpdatedAt: state.lastUpdatedAt
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: 'Unable to retrieve UG/PG application status.'
      });
    }
  });

  // ==========================================================================
  // 1B. STUDENT-FACING USN VERIFICATION / LOOKUP ENDPOINT
  // Filters out disabled categories without altering SQLite records
  // ==========================================================================
  router.get('/student/usn-lookup', (req, res) => {
    try {
      const activeDb = typeof getDbInstance === 'function' ? getDbInstance() : getDbInstance;
      const state = getUgPgControlState(activeDb);

      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

      if (!state.ugApplicationOpen && !state.pgApplicationOpen) {
        return res.status(503).json({
          success: false,
          bothClosed: true,
          usns: []
        });
      }

      const searchUsn = String(req.query.usn || '').toUpperCase().trim();

      if (searchUsn) {
        const detectedCategory = classifyUsnOrCourseCategory({ usn: searchUsn });

        // Block UG USNs when UG is OFF
        if (detectedCategory === 'UG' && !state.ugApplicationOpen) {
          return res.status(403).json({
            success: false,
            categoryBlocked: 'UG',
            message: 'UG USN registration is currently closed. Only PG (MBA / MCA) USN registration is open.'
          });
        }

        // Block PG USNs when PG is OFF
        if (detectedCategory === 'PG' && !state.pgApplicationOpen) {
          return res.status(403).json({
            success: false,
            categoryBlocked: 'PG',
            message: 'PG USN registration is currently closed. Only UG (B.E. / B.Tech.) USN registration is open.'
          });
        }
      }

      // If querying uploaded master USN table (if present in SQLite), filter by active category only
      let uploadedRows = [];
      try {
        uploadedRows = searchUsn
          ? activeDb
              .prepare(`SELECT * FROM student_usns WHERE UPPER(usn) = ? LIMIT 1`)
              .all(searchUsn)
          : activeDb.prepare(`SELECT * FROM student_usns LIMIT 200`).all();
      } catch (_) {
        uploadedRows = [];
      }

      const visibleUsns = filterStudentFacingUsnRecords(uploadedRows, state);

      return res.json({
        success: true,
        ugApplicationOpen: state.ugApplicationOpen,
        pgApplicationOpen: state.pgApplicationOpen,
        usns: visibleUsns
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ==========================================================================
  // 2. ADMIN ENDPOINT: GET /api/admin/application-controller
  // ==========================================================================
  router.get('/admin/application-controller', requireAdminJwt, (req, res) => {
    try {
      const activeDb = typeof getDbInstance === 'function' ? getDbInstance() : getDbInstance;
      const state = getUgPgControlState(activeDb);
      res.set('Cache-Control', 'no-store');
      return res.json({
        success: true,
        controller: state
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ==========================================================================
  // 3. ADMIN ENDPOINT: PATCH /api/admin/application-controller/status
  // Toggles UG independently, PG independently, or updates custom notice messages
  // ==========================================================================
  router.patch('/admin/application-controller/status', requireAdminJwt, (req, res) => {
    try {
      const activeDb = typeof getDbInstance === 'function' ? getDbInstance() : getDbInstance;
      initUgPgControlTables(activeDb);

      const currentState = getUgPgControlState(activeDb);
      const {
        ugApplicationOpen,
        pgApplicationOpen,
        ugClosedMessage,
        pgClosedMessage,
        videoUrl
      } = req.body;

      const nextUgOpen =
        typeof ugApplicationOpen === 'boolean'
          ? ugApplicationOpen
          : currentState.ugApplicationOpen;

      const nextPgOpen =
        typeof pgApplicationOpen === 'boolean'
          ? pgApplicationOpen
          : currentState.pgApplicationOpen;

      const adminUsername = req.admin?.username || req.admin?.name || 'Administrator';
      const nowIso = new Date().toISOString();

      const ugChanged = nextUgOpen !== currentState.ugApplicationOpen;
      const pgChanged = nextPgOpen !== currentState.pgApplicationOpen;

      const nextUgUpdatedBy = ugChanged ? adminUsername : currentState.ugUpdatedBy;
      const nextUgUpdatedAt = ugChanged ? nowIso : currentState.ugUpdatedAt;
      const nextPgUpdatedBy = pgChanged ? adminUsername : currentState.pgUpdatedBy;
      const nextPgUpdatedAt = pgChanged ? nowIso : currentState.pgUpdatedAt;

      const cleanUgMsg =
        ugClosedMessage !== undefined && String(ugClosedMessage).trim() !== ''
          ? String(ugClosedMessage).trim()
          : currentState.ugClosedMessage;

      const cleanPgMsg =
        pgClosedMessage !== undefined && String(pgClosedMessage).trim() !== ''
          ? String(pgClosedMessage).trim()
          : currentState.pgClosedMessage;

      const cleanVideoUrl =
        videoUrl !== undefined && String(videoUrl).trim() !== ''
          ? String(videoUrl).trim()
          : currentState.videoUrl;

      activeDb.prepare(`
        UPDATE application_category_controls
        SET ug_open = ?,
            pg_open = ?,
            ug_closed_message = ?,
            pg_closed_message = ?,
            video_url = ?,
            ug_updated_by = ?,
            ug_updated_at = ?,
            pg_updated_by = ?,
            pg_updated_at = ?,
            updated_by = ?,
            updated_at = ?
        WHERE id = 'MIT_UG_PG_MASTER_CONTROL'
      `).run(
        nextUgOpen ? 1 : 0,
        nextPgOpen ? 1 : 0,
        cleanUgMsg,
        cleanPgMsg,
        cleanVideoUrl,
        nextUgUpdatedBy,
        nextUgUpdatedAt,
        nextPgUpdatedBy,
        nextPgUpdatedAt,
        adminUsername,
        nowIso
      );

      // Record audit log entry
      const changedCategory =
        ugChanged && pgChanged ? 'BOTH' : ugChanged ? 'UG' : pgChanged ? 'PG' : 'CONFIG';

      activeDb.prepare(`
        INSERT INTO application_control_audit_logs (
          category, previous_ug_open, new_ug_open, previous_pg_open, new_pg_open, changed_by, changed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        changedCategory,
        currentState.ugApplicationOpen ? 1 : 0,
        nextUgOpen ? 1 : 0,
        currentState.pgApplicationOpen ? 1 : 0,
        nextPgOpen ? 1 : 0,
        adminUsername,
        nowIso
      );

      // Also update legacy table for backwards compatibility
      try {
        const overallOpen = nextUgOpen || nextPgOpen ? 1 : 0;
        activeDb.prepare(`
          UPDATE student_application_status
          SET is_application_open = ?,
              status_label = ?,
              video_url = ?,
              updated_by_username = ?,
              updated_at = ?
          WHERE id = 'MIT_STUDENT_APP_MASTER_SWITCH'
        `).run(
          overallOpen,
          overallOpen ? 'Application ON' : 'Application OFF',
          cleanVideoUrl,
          adminUsername,
          nowIso
        );
      } catch (_) {}

      const updatedState = getUgPgControlState(activeDb);
      broadcastUgPgChange(updatedState);

      return res.json({
        success: true,
        message: `Application Controls Saved: UG Application is ${
          updatedState.ugStatusLabel
        } | PG Application is ${
          updatedState.pgStatusLabel
        }. Existing student registrations, UTRs, and payments remain untouched.`,
        controller: updatedState
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ==========================================================================
  // 4. ADMIN ENDPOINT: UPLOAD OR UPDATE THE OFF-SCREEN VIDEO FILE
  // ==========================================================================
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

        const activeDb = typeof getDbInstance === 'function' ? getDbInstance() : getDbInstance;
        const adminUsername = req.admin?.username || req.admin?.name || 'Administrator';
        const newVideoUrl = `/uploads/system/videos/${req.file.filename}`;
        const nowIso = new Date().toISOString();

        activeDb.prepare(`
          UPDATE application_category_controls
          SET video_url = ?,
              updated_by = ?,
              updated_at = ?
          WHERE id = 'MIT_UG_PG_MASTER_CONTROL'
        `).run(newVideoUrl, adminUsername, nowIso);

        try {
          activeDb.prepare(`
            UPDATE student_application_status
            SET video_url = ?,
                updated_by_username = ?,
                updated_at = ?
            WHERE id = 'MIT_STUDENT_APP_MASTER_SWITCH'
          `).run(newVideoUrl, adminUsername, nowIso);
        } catch (_) {}

        const updatedState = getUgPgControlState(activeDb);
        broadcastUgPgChange(updatedState);

        return res.json({
          success: true,
          message: 'Application video uploaded and configured successfully.',
          videoUrl: newVideoUrl,
          controller: updatedState
        });
      } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
      }
    }
  );

  return router;
}

const defaultRouter = createApplicationControlRouter(() => db);
export default defaultRouter;
