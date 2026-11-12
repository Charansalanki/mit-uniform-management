import { db } from '../db.js';
import { getUgPgControlState } from '../config/ugPgApplicationStatusDb.js';

/**
 * Returns the current application status, delegating to the authoritative UG/PG table
 */
export const getOrInitAppStatus = () => {
  const ugPgState = getUgPgControlState(db);
  const isOpen = Boolean(ugPgState.ugApplicationOpen || ugPgState.pgApplicationOpen);

  return {
    is_application_open: isOpen ? 1 : 0,
    status_label: isOpen ? 'Application ON' : 'Application OFF',
    video_url: ugPgState.videoUrl || '/assets/video/application-closed.mp4',
    fallback_message: ugPgState.bothClosed
      ? 'Uniform registration is currently closed.'
      : (!ugPgState.ugApplicationOpen ? ugPgState.ugClosedMessage : ugPgState.pgClosedMessage),
    updated_by_username: ugPgState.lastUpdatedBy || 'Administrator',
    updated_at: ugPgState.lastUpdatedAt,
    toggle_history: JSON.stringify(ugPgState.history || [])
  };
};

/**
 * Enforces that at least one student application category is ON before allowing generic student requests.
 */
export const requireStudentAppOpen = (req, res, next) => {
  try {
    const path = req.originalUrl || req.url || '';
    if (
      path.startsWith('/api/admin') ||
      path.startsWith('/api/vendor-portal') ||
      path.startsWith('/api/application-status') ||
      path.startsWith('/api/sync/version') ||
      path.startsWith('/api/sse') ||
      path.startsWith('/api/tracking/check-status') ||
      path.startsWith('/api/tracking/live-poll') ||
      path.startsWith('/uploads') ||
      (req.method === 'GET' && path.startsWith('/api/payments/status/')) ||
      (req.method === 'GET' && path.startsWith('/api/payments/methods')) ||
      (req.method === 'GET' && path.startsWith('/api/payments/config'))
    ) {
      return next();
    }

    const state = getUgPgControlState(db);

    if (state.bothClosed) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');

      return res.status(503).json({
        success: false,
        applicationOff: true,
        isApplicationOpen: false,
        closedCategory: 'BOTH',
        statusLabel: 'Application OFF',
        videoUrl: state.videoUrl || '/assets/video/application-closed.mp4',
        fallbackMessage: 'Both Undergraduate (UG) and Postgraduate (PG) uniform applications are currently closed.',
        message: 'Both Undergraduate (UG) and Postgraduate (PG) uniform applications are currently closed.'
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

export default {
  getOrInitAppStatus,
  requireStudentAppOpen
};
