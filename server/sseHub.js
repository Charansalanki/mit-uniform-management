class SystemSseHub {
  constructor() {
    this.adminClients = new Set();        // Set<res>
    this.vendorClients = new Map();       // vendorId -> Set<res>
    this.studentClients = new Map();      // registrationId -> Set<res>
    this.publicConfigClients = new Set(); // Set<res>

    // Send keep-alive comment every 20 seconds to prevent proxy timeouts
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 20000);
  }

  initSseHeaders(res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, no-transform, must-revalidate',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disables NGINX proxy buffering for instant streaming
    });
    res.write(`event: connected\ndata: ${JSON.stringify({ connectedAt: new Date() })}\n\n`);
  }

  formatSsePacket(eventName, payload) {
    return `event: ${eventName}\ndata: ${JSON.stringify({
      ...payload,
      serverTimestamp: new Date().toISOString()
    })}\n\n`;
  }

  // 1. Register Admin SSE Connection (JWT Protected)
  addAdminClient(req, res) {
    this.initSseHeaders(res);
    this.adminClients.add(res);
    req.on('close', () => {
      this.adminClients.delete(res);
    });
  }

  // 2. Register Vendor SSE Connection (JWT Protected & Scoped to vendorId)
  addVendorClient(vendorId, req, res) {
    const key = String(vendorId).toUpperCase().trim();
    this.initSseHeaders(res);
    if (!this.vendorClients.has(key)) {
      this.vendorClients.set(key, new Set());
    }
    this.vendorClients.get(key).add(res);

    req.on('close', () => {
      const set = this.vendorClients.get(key);
      if (set) {
        set.delete(res);
        if (set.size === 0) this.vendorClients.delete(key);
      }
    });
  }

  // 3. Register Student Tracking SSE Connection (JWT Protected & Scoped to registrationId)
  addStudentClient(registrationId, req, res) {
    const key = String(registrationId);
    this.initSseHeaders(res);
    if (!this.studentClients.has(key)) {
      this.studentClients.set(key, new Set());
    }
    this.studentClients.get(key).add(res);

    req.on('close', () => {
      const set = this.studentClients.get(key);
      if (set) {
        set.delete(res);
        if (set.size === 0) this.studentClients.delete(key);
      }
    });
  }

  // 4. Register Student Step-4 Config Stream
  addPublicConfigClient(req, res) {
    this.initSseHeaders(res);
    this.publicConfigClients.add(res);
    req.on('close', () => {
      this.publicConfigClients.delete(res);
    });
  }

  // ==========================================================================
  // TARGETED BROADCAST METHODS
  // ==========================================================================

  // Broadcast to all connected Admins
  notifyAdmins(eventName, payload) {
    const packet = this.formatSsePacket(eventName, payload);
    for (const res of this.adminClients) {
      try {
        res.write(packet);
      } catch {
        this.adminClients.delete(res);
      }
    }
  }

  // Broadcast ONLY to a specific authenticated Vendor
  notifyVendor(vendorId, eventName, payload) {
    const key = String(vendorId || '').toUpperCase().trim();
    const clients = this.vendorClients.get(key);
    if (!clients) return;
    const packet = this.formatSsePacket(eventName, payload);
    for (const res of clients) {
      try {
        res.write(packet);
      } catch {
        clients.delete(res);
      }
    }
  }

  // Force-disconnect a Vendor's live SSE streams immediately when Admin revokes access
  disconnectVendorStreams(vendorId, reason = 'Portal access revoked by Administrator.') {
    const key = String(vendorId || '').toUpperCase().trim();
    const clients = this.vendorClients.get(key);
    if (!clients) return;
    const packet = this.formatSsePacket('VENDOR_SESSION_REVOKED', {
      sessionInvalidated: true,
      message: reason
    });
    for (const res of clients) {
      try {
        res.write(packet);
        res.end();
      } catch {}
    }
    this.vendorClients.delete(key);
  }

  // Broadcast ONLY to a specific Student's registration stream
  notifyStudent(registrationId, eventName, payload) {
    const key = String(registrationId || '');
    const clients = this.studentClients.get(key);
    if (!clients) return;
    const packet = this.formatSsePacket(eventName, payload);
    for (const res of clients) {
      try {
        res.write(packet);
      } catch {
        clients.delete(res);
      }
    }
  }

  // Broadcast Global Payment Config / Scanner Updates to Student Payment Pages
  notifyConfigSubscribers(eventName, payload) {
    const packet = this.formatSsePacket(eventName, payload);
    for (const res of this.publicConfigClients) {
      try {
        res.write(packet);
      } catch {
        this.publicConfigClients.delete(res);
      }
    }
  }

  // Universal Broadcast to all connected clients (Admins, Public Config Subscribers, Vendors, Students)
  broadcast(eventName, payload = {}) {
    try {
      this.notifyAdmins(eventName, payload);
    } catch (e) {
      console.warn('sseHub.broadcast notifyAdmins error:', e.message);
    }

    try {
      this.notifyConfigSubscribers(eventName, payload);
    } catch (e) {
      console.warn('sseHub.broadcast notifyConfigSubscribers error:', e.message);
    }

    try {
      const isGlobalEvent = eventName === 'GLOBAL_SYNC_UPDATE' ||
                            eventName === 'ALLOCATION_RELEASED' ||
                            eventName === 'STUDENTS_REASSIGNED' ||
                            eventName === 'PAYMENT_CONFIG_CHANGED' ||
                            eventName === 'VENDOR_REASSIGNED';

      if (!isGlobalEvent && payload && payload.vendorId) {
        this.notifyVendor(payload.vendorId, eventName, payload);
      } else {
        for (const [vendorId] of this.vendorClients.entries()) {
          this.notifyVendor(vendorId, eventName, payload);
        }
      }
    } catch (e) {
      console.warn('sseHub.broadcast notifyVendor error:', e.message);
    }

    try {
      if (payload && payload.registrationId) {
        this.notifyStudent(payload.registrationId, eventName, payload);
      }
    } catch (e) {
      console.warn('sseHub.broadcast notifyStudent error:', e.message);
    }
  }

  // 3-Way Broadcast: Updates Student, Assigned Vendor, and All Admins simultaneously
  broadcastPaymentLifecycleEvent({
    eventName = 'PAYMENT_UPDATED',
    registrationId,
    vendorId,
    payload
  }) {
    if (registrationId) {
      this.notifyStudent(registrationId, eventName, payload);
    }
    if (vendorId) {
      this.notifyVendor(vendorId, eventName, payload);
    }
    this.notifyAdmins(eventName, payload);
  }

  sendHeartbeat() {
    const ping = `: heartbeat ${Date.now()}\n\n`;
    for (const res of this.adminClients) {
      try { res.write(ping); } catch { this.adminClients.delete(res); }
    }
    for (const res of this.publicConfigClients) {
      try { res.write(ping); } catch { this.publicConfigClients.delete(res); }
    }
    for (const [key, set] of this.vendorClients.entries()) {
      for (const res of set) {
        try { res.write(ping); } catch { set.delete(res); }
      }
      if (set.size === 0) this.vendorClients.delete(key);
    }
    for (const [key, set] of this.studentClients.entries()) {
      for (const res of set) {
        try { res.write(ping); } catch { set.delete(res); }
      }
      if (set.size === 0) this.studentClients.delete(key);
    }
  }
}

// Export singleton instance shared across all backend routes
const sseHub = new SystemSseHub();
export { SystemSseHub, sseHub };
export default sseHub;

