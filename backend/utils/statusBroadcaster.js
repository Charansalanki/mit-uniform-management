const clients = new Set();

function addStatusClient(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const client = { id: Date.now() + Math.random(), res };
  clients.add(client);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (_) {
      clearInterval(heartbeat);
      clients.delete(client);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(client);
  });
}

function broadcastApplicationStatus(payload) {
  const frame = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    try {
      client.res.write(frame);
    } catch (_) {
      clients.delete(client);
    }
  }
}

module.exports = {
  addStatusClient,
  broadcastApplicationStatus,
};

