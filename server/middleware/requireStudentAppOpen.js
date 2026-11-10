import { db } from '../db.js';

// Initialize table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS student_application_status (
    id TEXT PRIMARY KEY,
    is_application_open INTEGER NOT NULL DEFAULT 1,
    status_label TEXT NOT NULL DEFAULT 'Application ON',
    video_url TEXT NOT NULL DEFAULT '/assets/video/application-closed.mp4',
    fallback_message TEXT NOT NULL DEFAULT 'The application is temporarily unavailable. Please check back later.',
    updated_by_admin_id TEXT DEFAULT NULL,
    updated_by_username TEXT DEFAULT 'System Initializer',
    toggle_history TEXT DEFAULT '[]',
    updated_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

/**
 * Returns or initializes the singleton application status record
 */
export const getOrInitAppStatus = () => {
  let row = db.prepare('SELECT * FROM student_application_status WHERE id = ?').get('MIT_STUDENT_APP_MASTER_SWITCH');
  if (!row) {
    const now = new Date().toISOString();
    const videoUrl = process.env.STUDENT_APP_OFF_VIDEO_URL || '/assets/video/application-closed.mp4';
    db.prepare(`
      INSERT INTO student_application_status (
        id, is_application_open, status_label, video_url, fallback_message,
        updated_by_admin_id, updated_by_username, toggle_history, updated_at, created_at
      ) VALUES (
        'MIT_STUDENT_APP_MASTER_SWITCH', 1, 'Application ON',
        ?,
        'The application is temporarily unavailable. Please check back later.',
        NULL, 'System Initializer', '[]', ?, ?
      )
    `).run(videoUrl, now, now);
    row = db.prepare('SELECT * FROM student_application_status WHERE id = ?').get('MIT_STUDENT_APP_MASTER_SWITCH');
  }
  return row;
};

/**
 * Enforces that the Student Application is ON before allowing any student
 * registration, payment submission, or student portal API operation.
 */
export const requireStudentAppOpen = (req, res, next) => {
  try {
    // 1. Always allow Admin Panel, Vendor Portal, SSE streams, and Status check routes
    const path = req.originalUrl || req.url || '';
    if (
      path.startsWith('/api/admin') ||
      path.startsWith('/api/vendor-portal') ||
      path.startsWith('/api/application-status') ||
      path.startsWith('/api/sync/version') ||
      path.startsWith('/api/sse') ||
      path.startsWith('/uploads')
    ) {
      return next();
    }

    // 2. Check live database status
    const appState = getOrInitAppStatus();

    if (!appState.is_application_open) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');

      return res.status(503).json({
        success: false,
        applicationOff: true,
        isApplicationOpen: false,
        statusLabel: 'Application OFF',
        videoUrl: appState.video_url || '/assets/video/application-closed.mp4',
        fallbackMessage:
          appState.fallback_message ||
          'The application is temporarily unavailable. Please check back later.',
        message:
          appState.fallback_message ||
          'The application is temporarily unavailable. Please check back later.'
      });
    }

    next();
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Unable to verify student application status.'
    });
  }
};

