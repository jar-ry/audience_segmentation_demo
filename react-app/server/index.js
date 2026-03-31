const express = require('express');
const snowflake = require('snowflake-sdk');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 8080;

let connection = null;
let cachedSessionToken = null;
let sessionTokenTimestamp = 0;
const SESSION_TOKEN_TTL_MS = 55 * 60 * 1000;
let lastOAuthTokenHash = null;

function readToken() {
  try {
    return fs.readFileSync('/snowflake/session/token', 'utf-8').trim();
  } catch {
    return null;
  }
}

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h;
}

function getConnection() {
  return new Promise((resolve, reject) => {
    const currentToken = readToken();
    const currentHash = currentToken ? simpleHash(currentToken) : null;
    const oauthRotated = currentHash && lastOAuthTokenHash && currentHash !== lastOAuthTokenHash;
    if (oauthRotated) {
      console.log('[AUTH] OAuth token rotated by SPCS — reconnecting SDK and clearing session token');
      if (connection) { try { connection.destroy(() => {}); } catch {} }
      connection = null;
      cachedSessionToken = null;
      sessionTokenTimestamp = 0;
    }
    if (currentHash) lastOAuthTokenHash = currentHash;

    if (connection && connection.isUp()) {
      return resolve(connection);
    }

    const token = readToken();
    const isSpcs = !!token;
    const connOpts = isSpcs
      ? {
          accessUrl: `https://${process.env.SNOWFLAKE_HOST}`,
          account: process.env.SNOWFLAKE_ACCOUNT,
          authenticator: 'OAUTH',
          token,
          warehouse: process.env.SNOWFLAKE_WAREHOUSE || 'COMPUTE_WH',
          database: 'ONEDATA_AUDIENCE',
          schema: 'PUBLIC',
        }
      : {
          account: process.env.SNOWFLAKE_ACCOUNT,
          username: process.env.SNOWFLAKE_USER,
          password: process.env.SNOWFLAKE_PASSWORD,
          warehouse: process.env.SNOWFLAKE_WAREHOUSE || 'COMPUTE_WH',
          database: 'ONEDATA_AUDIENCE',
          schema: 'PUBLIC',
          role: process.env.SNOWFLAKE_ROLE || 'ACCOUNTADMIN',
        };

    const conn = snowflake.createConnection(connOpts);
    conn.connect((err, c) => {
      if (err) return reject(err);
      connection = c;
      resolve(c);
    });
  });
}

function executeSQL(sql) {
  return new Promise(async (resolve, reject) => {
    try {
      const conn = await getConnection();
      conn.execute({
        sqlText: sql,
        complete: (err, stmt, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        },
      });
    } catch (e) {
      reject(e);
    }
  });
}

function exchangeOAuthForSession() {
  return new Promise((resolve, reject) => {
    const oauthToken = readToken();
    const host = process.env.SNOWFLAKE_HOST;
    const account = process.env.SNOWFLAKE_ACCOUNT;

    if (!oauthToken || !host) {
      return reject(new Error('No OAuth token or host'));
    }

    const payload = JSON.stringify({
      data: {
        ACCOUNT_NAME: account,
        LOGIN_NAME: '',
        AUTHENTICATOR: 'OAUTH',
        TOKEN: oauthToken,
        CLIENT_APP_ID: 'react-audience-app',
        CLIENT_APP_VERSION: '1.0',
      },
    });

    const options = {
      hostname: host,
      port: 443,
      path: '/session/v1/login-request',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'react-audience-app/1.0',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.success && parsed.data && parsed.data.token) {
            cachedSessionToken = parsed.data.token;
            sessionTokenTimestamp = Date.now();
            console.log('Successfully exchanged OAuth token for session token');
            resolve(cachedSessionToken);
          } else {
            console.error('Login-request response:', JSON.stringify(parsed).slice(0, 500));
            reject(new Error(`Token exchange failed: ${parsed.message || 'unknown error'}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse login response: ${body.slice(0, 300)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Token exchange timed out'));
    });
    req.write(payload);
    req.end();
  });
}

async function getSessionToken(forceRefresh = false) {
  const age = Date.now() - sessionTokenTimestamp;
  const expired = age > SESSION_TOKEN_TTL_MS;
  if (cachedSessionToken && !forceRefresh && !expired) return cachedSessionToken;
  if (expired && cachedSessionToken) console.log(`[AUTH] Session token expired (age: ${Math.round(age / 60000)}m, TTL: ${Math.round(SESSION_TOKEN_TTL_MS / 60000)}m) — refreshing`);
  cachedSessionToken = null;
  sessionTokenTimestamp = 0;
  return exchangeOAuthForSession();
}

function callAgentAPI(query, _retry = 0) {
  return new Promise(async (resolve, reject) => {
    const host = process.env.SNOWFLAKE_HOST;
    if (!host) {
      return reject(new Error('SNOWFLAKE_HOST not available'));
    }

    let sessionToken;
    try {
      sessionToken = await getSessionToken(_retry > 0);
    } catch (e) {
      console.error('Failed to get session token:', e.message);
      return reject(new Error('Authentication failed: ' + e.message));
    }

    const payload = JSON.stringify({
      messages: [
        { role: 'user', content: [{ type: 'text', text: query }] },
      ],
    });

    const options = {
      hostname: host,
      port: 443,
      path: '/api/v2/databases/ONEDATA_AUDIENCE/schemas/PUBLIC/agents/AUDIENCE_AGENT:run',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Snowflake Token="${sessionToken}"`,
        'User-Agent': 'react-audience-app/1.0',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          cachedSessionToken = null;
          sessionTokenTimestamp = 0;
          if (_retry < 2) {
            return callAgentAPI(query, _retry + 1).then(resolve, reject);
          }
          return reject(new Error('SESSION_EXPIRED'));
        }
        if (res.statusCode !== 200) {
          console.error('[AGENT] API error:', res.statusCode, body.slice(0, 500));
          return reject(new Error(`Agent API error ${res.statusCode}: ${body.slice(0, 500)}`));
        }
        try {
          const events = parseSSE(body);
          resolve(events);
        } catch (e) {
          console.error('[AGENT] SSE parse error:', e.message);
          reject(new Error(`Failed to parse agent SSE: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => {
      console.error('[AGENT] Request error:', e.message);
      reject(e);
    });
    req.setTimeout(120000, () => {
      console.error('[AGENT] Request timed out after 120s');
      req.destroy();
      reject(new Error('Agent API request timed out'));
    });
    req.write(payload);
    req.end();
  });
}

function parseSSE(raw) {
  const events = [];
  const blocks = raw.split('\n\n');
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const lines = trimmed.split('\n');
    let eventType = '';
    let dataStr = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        dataStr += line.slice(6);
      } else if (line.startsWith('data:')) {
        dataStr += line.slice(5);
      }
    }
    if (eventType && dataStr) {
      try {
        events.push({ event: eventType, data: JSON.parse(dataStr) });
      } catch {
        events.push({ event: eventType, data: dataStr });
      }
    }
  }
  return events;
}

function parseAgentResponse(responseContent) {
  const textParts = [];
  let sql = '';
  let data = null;
  let suggested = [];

  let contentItems = [];
  if (Array.isArray(responseContent)) {
    for (const event of responseContent) {
      if (event.event === 'response') {
        contentItems = (event.data && event.data.content) || [];
        break;
      }
    }
    if (contentItems.length === 0) {
      for (const event of responseContent) {
        if (event.event === 'response.text.delta' && event.data && event.data.delta) {
          textParts.push(event.data.delta);
        } else if (event.event === 'response.tool_result' && event.data) {
          contentItems.push({ type: 'tool_result', tool_result: event.data });
        } else if (event.event === 'response.suggested_queries' && event.data) {
          contentItems.push({ type: 'suggested_queries', suggested_queries: event.data.suggested_queries || [] });
        }
      }
    }
  } else if (responseContent && responseContent.content) {
    contentItems = responseContent.content;
  }

  for (const item of contentItems) {
    const itemType = item.type || '';
    if (itemType === 'text') {
      textParts.push(item.text || '');
    } else if (itemType === 'tool_result') {
      const toolResult = item.tool_result || {};
      for (const result of (toolResult.content || [])) {
        if (result.type === 'json') {
          const jsonData = result.json || {};
          sql = jsonData.sql || sql;
          const rs = jsonData.result_set || {};
          if (rs.data && rs.data.length > 0) {
            const cols = ((rs.resultSetMetaData || {}).rowType || []).map(c => c.name);
            data = rs.data.map(row => {
              const obj = {};
              cols.forEach((col, i) => { obj[col] = row[i]; });
              return obj;
            });
          }
        }
      }
    } else if (itemType === 'suggested_queries') {
      suggested = (item.suggested_queries || []).map(s =>
        typeof s === 'string' ? s : s.query || s.question || s.text || JSON.stringify(s)
      );
    }
  }

  return {
    text: textParts.join('\n\n') || 'No response received.',
    sql: sql || undefined,
    data: data || undefined,
    suggested: suggested.length > 0 ? suggested : undefined,
  };
}

app.post('/api/sql', async (req, res) => {
  try {
    const { sql } = req.body;
    const rows = await executeSQL(sql);
    res.json({ rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agent-via-sql', async (req, res) => {
  try {
    const { query } = req.body;
    const rawResponse = await callAgentAPI(query);
    const parsed = parseAgentResponse(rawResponse);
    res.json(parsed);
  } catch (e) {
    console.error('[ROUTE] Agent call error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ai-complete', async (req, res) => {
  try {
    const { prompt } = req.body;
    const escaped = prompt.replace(/'/g, "''");
    const rows = await executeSQL(
      `SELECT SNOWFLAKE.CORTEX.COMPLETE('claude-4-sonnet', '${escaped}') AS resp`
    );
    res.json({ text: rows[0]?.RESP || '' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', spcs: !!readToken(), timestamp: new Date().toISOString() });
});

app.use(express.static(path.join(__dirname, '..', 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server running on port ${PORT}`);
  try {
    await getConnection();
    console.log('Snowflake connection established');
    if (readToken()) {
      await getSessionToken();
      console.log('Session token obtained for REST API calls');
    }
  } catch (e) {
    console.error('Startup auth error:', e.message);
  }

  if (readToken()) {
    setInterval(async () => {
      try {
        const age = Date.now() - sessionTokenTimestamp;
        if (age > SESSION_TOKEN_TTL_MS * 0.8) {
          console.log('[AUTH] Proactive token refresh (background)');
          await getSessionToken(true);
        }
      } catch (e) {
        console.error('[AUTH] Background refresh failed:', e.message);
      }
    }, 5 * 60 * 1000);
    console.log('Background token refresh scheduled every 5 minutes');
  }
});
