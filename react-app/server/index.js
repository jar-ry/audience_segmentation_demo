import express from 'express';
import cors from 'cors';
import snowflake from 'snowflake-sdk';
import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// ── Config ──────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
const OAUTH_TOKEN_PATH = '/snowflake/session/token';
const IS_SPCS = existsSync(OAUTH_TOKEN_PATH);

const SF_ACCOUNT = process.env.SNOWFLAKE_ACCOUNT || '';
const SF_HOST = process.env.SNOWFLAKE_HOST || '';
const SF_WAREHOUSE = process.env.SNOWFLAKE_WAREHOUSE || 'COMPUTE_WH';
const SF_DATABASE = 'ONEDATA_AUDIENCE';
const SF_SCHEMA = 'PUBLIC';

// ── Token & Connection Management ───────────────────────────
let connection = null;
let lastOAuthHash = null;
let sessionToken = null;
let sessionTokenTime = 0;
const SESSION_TTL_MS = 55 * 60 * 1000; // 55 minutes

function simpleHash(str) {
  return createHash('md5').update(str).digest('hex');
}

function readOAuthToken() {
  if (!IS_SPCS) return null;
  try {
    return readFileSync(OAUTH_TOKEN_PATH, 'utf-8').trim();
  } catch {
    return null;
  }
}

function getConnection() {
  return new Promise((resolve, reject) => {
    if (!IS_SPCS) {
      reject(new Error('Not running in SPCS — no OAuth token available'));
      return;
    }

    const oauthToken = readOAuthToken();
    if (!oauthToken) {
      reject(new Error('Could not read OAuth token'));
      return;
    }

    const currentHash = simpleHash(oauthToken);

    // If OAuth file changed, destroy old connection
    if (connection && lastOAuthHash && currentHash !== lastOAuthHash) {
      console.log('OAuth token file changed — reconnecting');
      try { connection.destroy(() => {}); } catch {}
      connection = null;
      sessionToken = null;
      sessionTokenTime = 0;
    }

    if (connection) {
      resolve(connection);
      return;
    }

    lastOAuthHash = currentHash;

    const conn = snowflake.createConnection({
      account: SF_ACCOUNT,
      authenticator: 'OAUTH',
      token: oauthToken,
      warehouse: SF_WAREHOUSE,
      database: SF_DATABASE,
      schema: SF_SCHEMA,
    });

    conn.connect((err) => {
      if (err) {
        console.error('Snowflake connection error:', err.message);
        reject(err);
      } else {
        console.log('Snowflake connection established');
        connection = conn;
        resolve(conn);
      }
    });
  });
}

async function exchangeOAuthForSession(oauthToken) {
  const url = `https://${SF_HOST}/session/v1/login-request?warehouse=${SF_WAREHOUSE}&databaseName=${SF_DATABASE}&schemaName=${SF_SCHEMA}`;

  const body = {
    data: {
      AUTHENTICATOR: 'OAUTH',
      TOKEN: oauthToken,
      LOGIN_NAME: '',
      ACCOUNT_NAME: SF_ACCOUNT,
    },
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new Error(`Login-request failed: ${resp.status} ${await resp.text()}`);
  }

  const json = await resp.json();
  if (!json.data?.token) {
    throw new Error('No session token in login-request response');
  }

  return json.data.token;
}

async function getSessionToken(forceRefresh = false) {
  const now = Date.now();

  if (!forceRefresh && sessionToken && (now - sessionTokenTime) < SESSION_TTL_MS) {
    return sessionToken;
  }

  const oauthToken = readOAuthToken();
  if (!oauthToken) throw new Error('Could not read OAuth token');

  sessionToken = await exchangeOAuthForSession(oauthToken);
  sessionTokenTime = Date.now();
  console.log('Successfully exchanged OAuth token for session token');
  return sessionToken;
}

// ── SQL Execution ───────────────────────────────────────────
function executeSql(sql) {
  return new Promise(async (resolve, reject) => {
    try {
      const conn = await getConnection();
      conn.execute({
        sqlText: sql,
        complete: (err, _stmt, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        },
      });
    } catch (err) {
      reject(err);
    }
  });
}

// ── Cortex Agent REST API ───────────────────────────────────
async function callAgentAPI(query, _retry = 0) {
  const token = await getSessionToken();

  const url = `https://${SF_HOST}/api/v2/cortex/agent:run`;
  const body = {
    agent_name: `${SF_DATABASE}.${SF_SCHEMA}.AUDIENCE_AGENT`,
    query: query,
    response_instruction: 'Be concise and data-driven. Format numbers with commas.',
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Snowflake Token="${token}"`,
      'X-Snowflake-Authorization-Token-Type': 'KEYPAIR_JWT',
    },
    body: JSON.stringify(body),
  });

  if ((resp.status === 401 || resp.status === 403) && _retry < 2) {
    console.log(`Agent API ${resp.status} — refreshing token (retry ${_retry + 1})`);
    sessionToken = null;
    sessionTokenTime = 0;
    return callAgentAPI(query, _retry + 1);
  }

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Agent API error ${resp.status}: ${text}`);
  }

  // Parse SSE response
  const text = await resp.text();
  const lines = text.split('\n');

  let responseText = '';
  let sql = '';
  let data = [];
  let suggested = [];
  const deltas = [];

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const payload = line.slice(6).trim();
    if (!payload || payload === '[DONE]') continue;

    try {
      const evt = JSON.parse(payload);

      if (evt.type === 'response.text.delta') {
        deltas.push(evt.data?.text || '');
      }

      if (evt.type === 'response') {
        responseText = evt.data?.text || '';
      }

      if (evt.type === 'response.tool_result') {
        const content = evt.data?.content || [];
        for (const c of content) {
          if (c.type === 'tool_results') {
            sql = c.sql || sql;
            data = c.data || data;
          }
          if (c.type === 'sql') {
            sql = c.statement || c.sql || sql;
          }
          if (c.type === 'results' && Array.isArray(c.data)) {
            data = c.data;
          }
        }
        // Also check top level
        if (evt.data?.sql) sql = evt.data.sql;
        if (evt.data?.data) data = evt.data.data;
      }

      if (evt.type === 'response.suggested_queries') {
        const queries = evt.data?.queries || evt.data?.suggested_queries || [];
        suggested = queries.map((q) => {
          if (typeof q === 'string') return q;
          return q.query || q.question || q.text || JSON.stringify(q);
        });
      }
    } catch {}
  }

  // Fallback: assemble deltas if no aggregate response
  if (!responseText && deltas.length > 0) {
    responseText = deltas.join('');
  }

  return { text: responseText, sql, data, suggested };
}

// ── Routes ──────────────────────────────────────────────────

// Execute SQL
app.post('/api/sql', async (req, res) => {
  try {
    const { sql } = req.body;
    if (!sql) return res.status(400).json({ error: 'Missing sql' });
    const rows = await executeSql(sql);
    res.json({ rows });
  } catch (err) {
    console.error('SQL error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Call Cortex Agent
app.post('/api/agent-via-sql', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Missing query' });
    const result = await callAgentAPI(query);
    res.json(result);
  } catch (err) {
    console.error('Agent error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Cortex Complete
app.post('/api/ai-complete', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    // Escape single quotes in prompt for SQL
    const escaped = prompt.replace(/'/g, "''");
    const sql = `SELECT SNOWFLAKE.CORTEX.COMPLETE('claude-4-sonnet', '${escaped}') AS response`;
    const rows = await executeSql(sql);
    const text = rows?.[0]?.RESPONSE || rows?.[0]?.response || '';
    res.json({ text });
  } catch (err) {
    console.error('AI Complete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', spcs: IS_SPCS, timestamp: new Date().toISOString() });
});

// ── Static file serving (production) ────────────────────────
const distPath = path.join(__dirname, '..', 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ── Start ───────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  if (IS_SPCS) {
    try {
      await getConnection();
      await getSessionToken();
      console.log('Session token obtained for REST API calls');
    } catch (err) {
      console.error('Initial setup error:', err.message);
    }

    // Background token refresh every 5 minutes
    setInterval(async () => {
      try {
        const age = Date.now() - sessionTokenTime;
        if (age > SESSION_TTL_MS * 0.8) {
          await getSessionToken(true);
          console.log('Proactive token refresh completed');
        }
      } catch (err) {
        console.error('Background refresh error:', err.message);
      }
    }, 5 * 60 * 1000);
    console.log('Background token refresh scheduled every 5 minutes');
  }
});
