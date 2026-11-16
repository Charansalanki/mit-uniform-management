// infrastructure/scripts/health_check.mjs
import http from 'node:http';

const port = process.env.PORT || 4000;
const url = `http://127.0.0.1:${port}/api/health`;

console.log(`[HEALTH-CHECK] Pinging ${url}...`);

const req = http.get(url, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log(`[HEALTH-CHECK] PASS: Status 200 OK — ${body}`);
      process.exit(0);
    } else {
      console.error(`[HEALTH-CHECK] FAIL: Received status ${res.statusCode}`);
      process.exit(1);
    }
  });
});

req.on('error', (err) => {
  console.error(`[HEALTH-CHECK] FAIL: Connection error — ${err.message}`);
  process.exit(1);
});
