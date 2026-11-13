const {
  getSettingsFromDb,
  setUgStatusInDb,
  setPgStatusInDb,
} = require('../db/applicationSettingsDb');
const {
  addStatusClient,
  broadcastApplicationStatus,
} = require('../utils/statusBroadcaster');

function parseBooleanInput(body, keys) {
  for (const key of keys) {
    if (body && body[key] !== undefined) {
      const val = body[key];
      if (typeof val === 'boolean') return val;
      if (val === 1 || val === '1' || val === 'true' || val === 'ON') return true;
      if (val === 0 || val === '0' || val === 'false' || val === 'OFF') return false;
    }
  }
  return null;
}

/**
 * GET /api/application-status
 */
exports.getApplicationStatus = async (req, res) => {
  try {
    const state = await getSettingsFromDb();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    return res.status(200).json({
      success: true,
      ugApplicationOpen: state.ugApplicationOpen,
      pgApplicationOpen: state.pgApplicationOpen,
      bothClosed: state.bothClosed,
      closedVideoUrl: state.closedVideoUrl,
      updatedAt: state.updatedAt,
      message: 'Application status retrieved successfully.',
    });
  } catch (error) {
    console.error('[SQLite AppStatus] GET status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to read application status from SQLite database.',
      error: error.message,
    });
  }
};

/**
 * GET /api/application-status/closed-video
 */
exports.getClosedVideoUrl = async (req, res) => {
  try {
    const state = await getSettingsFromDb();
    return res.status(200).json({
      success: true,
      closedVideoUrl: state.closedVideoUrl,
      ugApplicationOpen: state.ugApplicationOpen,
      pgApplicationOpen: state.pgApplicationOpen,
      bothClosed: state.bothClosed,
      updatedAt: state.updatedAt,
      message: 'Application-closed video URL fetched successfully.',
    });
  } catch (error) {
    console.error('[SQLite AppStatus] GET video error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve closed video URL.',
    });
  }
};

/**
 * GET /api/application-status/stream
 */
exports.streamApplicationStatus = async (req, res) => {
  try {
    addStatusClient(req, res);
    const state = await getSettingsFromDb();
    res.write(
      `data: ${JSON.stringify({
        success: true,
        ...state,
        message: 'Connected to real-time status stream.',
      })}\n\n`
    );
  } catch (error) {
    console.error('[SQLite AppStatus] SSE stream error:', error);
    if (!res.headersSent) {
      res.status(500).end();
    }
  }
};

/**
 * PATCH / PUT / POST /api/admin/application-status/ug
 * Independently updates ONLY `ug_application_open` in SQLite.
 */
exports.updateUgStatus = async (req, res) => {
  try {
    const parsed = parseBooleanInput(req.body, [
      'ugApplicationOpen',
      'ug_application_open',
      'status',
      'isOpen',
    ]);

    if (parsed === null) {
      return res.status(400).json({
        success: false,
        message: 'Invalid UG status value. Expected boolean true or false.',
      });
    }

    const updatedState = await setUgStatusInDb(parsed);

    const responsePayload = {
      success: true,
      ugApplicationOpen: updatedState.ugApplicationOpen,
      pgApplicationOpen: updatedState.pgApplicationOpen,
      bothClosed: updatedState.bothClosed,
      closedVideoUrl: updatedState.closedVideoUrl,
      updatedAt: updatedState.updatedAt,
      message: `UG application switched ${updatedState.ugApplicationOpen ? 'ON' : 'OFF'}.`,
    };

    // Broadcast to connected student portals without blocking the HTTP response
    setImmediate(() => broadcastApplicationStatus(responsePayload));

    return res.status(200).json(responsePayload);
  } catch (error) {
    console.error('[SQLite AppStatus] UPDATE UG error:', error);
    return res.status(500).json({
      success: false,
      message: 'SQLite error while updating UG application status.',
      error: error.message,
    });
  }
};

/**
 * PATCH / PUT / POST /api/admin/application-status/pg
 * Independently updates ONLY `pg_application_open` in SQLite.
 */
exports.updatePgStatus = async (req, res) => {
  try {
    const parsed = parseBooleanInput(req.body, [
      'pgApplicationOpen',
      'pg_application_open',
      'status',
      'isOpen',
    ]);

    if (parsed === null) {
      return res.status(400).json({
        success: false,
        message: 'Invalid PG status value. Expected boolean true or false.',
      });
    }

    const updatedState = await setPgStatusInDb(parsed);

    const responsePayload = {
      success: true,
      ugApplicationOpen: updatedState.ugApplicationOpen,
      pgApplicationOpen: updatedState.pgApplicationOpen,
      bothClosed: updatedState.bothClosed,
      closedVideoUrl: updatedState.closedVideoUrl,
      updatedAt: updatedState.updatedAt,
      message: `PG application switched ${updatedState.pgApplicationOpen ? 'ON' : 'OFF'}.`,
    };

    // Broadcast to connected student portals without blocking the HTTP response
    setImmediate(() => broadcastApplicationStatus(responsePayload));

    return res.status(200).json(responsePayload);
  } catch (error) {
    console.error('[SQLite AppStatus] UPDATE PG error:', error);
    return res.status(500).json({
      success: false,
      message: 'SQLite error while updating PG application status.',
      error: error.message,
    });
  }
};

