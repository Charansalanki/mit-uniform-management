const ramCache = new Map();

export function sqliteRamCacheMiddleware(req, res, next) {
  // 1. Any write request (POST, PUT, PATCH, DELETE) flushes the read cache immediately
  if (req.method !== 'GET') {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        ramCache.clear();
      }
    });
    return next();
  }

  // 2. Cache high-frequency public/student GET endpoints for 5 seconds in RAM
  const url = req.originalUrl || req.url;
  const isHotRead =
    url.startsWith('/api/application-status') ||
    url.startsWith('/api/sync/version') ||
    url.startsWith('/api/payments/config') ||
    url.startsWith('/api/payments/methods') ||
    url.startsWith('/api/campaign');

  if (!isHotRead) return next();

  const hit = ramCache.get(url);
  if (hit && Date.now() < hit.expiresAt) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Sqlite-Cache', 'HIT');
    return res.end(hit.rawJsonBuffer);
  }

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode === 200) {
      const rawJsonBuffer = Buffer.from(JSON.stringify(body), 'utf8');
      ramCache.set(url, {
        rawJsonBuffer,
        expiresAt: Date.now() + 5000
      });
      res.setHeader('X-Sqlite-Cache', 'MISS');
    }
    return originalJson(body);
  };

  next();
}

export default { sqliteRamCacheMiddleware };

