import express from 'express';
import path from 'node:path';
import { config } from './config.js';
import { getDashboard } from './aggregate.js';
import { sampleServer } from './sources/server-metrics.js';

const app = express();
const publicDir = path.join(process.cwd(), 'public');

// Dashboard data — single aggregated payload. ?force=1 bypasses TTL.
app.get('/api/dashboard', async (req, res) => {
  const force = req.query.force === '1' || req.query.force === 'true';
  try {
    const data = await getDashboard(force);
    res.set('Cache-Control', 'no-store');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// Serve the frontend; express.static resolves / to public/index.html.
app.use(express.static(publicDir));

app.listen(config.port, () => {
  console.log(`[niwa-news] dashboard on http://localhost:${config.port}/`);
  console.log(`[niwa-news] api at      http://localhost:${config.port}/api/dashboard`);
});

// Background sampler keeps server-load sparklines populated between requests.
void sampleServer();
setInterval(() => void sampleServer(), config.samplerMs);
