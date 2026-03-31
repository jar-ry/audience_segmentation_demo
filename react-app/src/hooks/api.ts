import type { Filters } from '../types';

const API_BASE = '';

export async function runSQL(sql: string): Promise<Record<string, unknown>[]> {
  const resp = await fetch(`${API_BASE}/api/sql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  });
  if (!resp.ok) throw new Error(`SQL error: ${resp.status}`);
  const json = await resp.json();
  return json.rows || [];
}

export async function callAgent(query: string): Promise<{
  text: string;
  sql?: string;
  data?: Record<string, unknown>[];
  suggested?: string[];
}> {
  const resp = await fetch(`${API_BASE}/api/agent-via-sql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!resp.ok) throw new Error(`Agent error: ${resp.status}`);
  return resp.json();
}

export async function aiComplete(prompt: string): Promise<string> {
  const resp = await fetch(`${API_BASE}/api/ai-complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!resp.ok) throw new Error(`AI Complete error: ${resp.status}`);
  const json = await resp.json();
  return json.text || '';
}

export function buildWhereClause(
  filters: Filters,
  allStates: string[]
): { customerWhere: string; fullQuery: string } {
  const conditions: string[] = [];

  // Retailer
  if (filters.retailer !== 'All') {
    conditions.push(`c.RETAILER = '${filters.retailer}'`);
  }

  // Age range
  if (filters.ageRange[0] > 1 || filters.ageRange[1] < 100) {
    conditions.push(`c.AGE BETWEEN ${filters.ageRange[0]} AND ${filters.ageRange[1]}`);
  }

  // States
  if (filters.states.length > 0 && filters.states.length < allStates.length) {
    const stateList = filters.states.map((s) => `'${s}'`).join(', ');
    conditions.push(`c.STATE_CODE IN (${stateList})`);
  }

  // Contact channels
  if (filters.hasEmail) {
    conditions.push(`c.HAS_EMAIL = TRUE`);
  }
  if (filters.hasPhone) {
    conditions.push(`c.HAS_PHONE = TRUE`);
  }

  const customerWhere = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Build full query — join transactions if needed for spend/recency
  const needTxnJoin = filters.minSpend > 0 || filters.recencyDays < 730;

  let fullQuery: string;

  if (needTxnJoin) {
    const txnConditions: string[] = [];
    if (filters.retailer !== 'All') {
      txnConditions.push(`t.RETAILER = '${filters.retailer}'`);
    }
    if (filters.recencyDays < 730) {
      txnConditions.push(
        `t.TRANSACTION_DATE >= DATEADD('day', -${filters.recencyDays}, CURRENT_DATE())`
      );
    }
    const txnWhere = txnConditions.length > 0 ? `AND ${txnConditions.join(' AND ')}` : '';
    const havingClause =
      filters.minSpend > 0 ? `HAVING SUM(t.AMOUNT) >= ${filters.minSpend}` : '';

    fullQuery = `
      SELECT COUNT(*) AS cnt FROM (
        SELECT c.CUSTOMER_ID
        FROM ONEDATA_AUDIENCE.PUBLIC.CUSTOMERS c
        JOIN ONEDATA_AUDIENCE.PUBLIC.TRANSACTIONS t ON c.CUSTOMER_ID = t.CUSTOMER_ID ${txnWhere}
        ${customerWhere ? customerWhere.replace('WHERE', 'WHERE') + '' : ''}
        GROUP BY c.CUSTOMER_ID
        ${havingClause}
      )`;
  } else {
    fullQuery = `SELECT COUNT(*) AS cnt FROM ONEDATA_AUDIENCE.PUBLIC.CUSTOMERS c ${customerWhere}`;
  }

  return { customerWhere, fullQuery };
}

export function buildBreakdownQuery(
  filters: Filters,
  allStates: string[],
  groupBy: 'STATE_CODE' | 'AGE'
): string {
  const { customerWhere } = buildWhereClause(filters, allStates);
  const needTxnJoin = filters.minSpend > 0 || filters.recencyDays < 730;

  if (groupBy === 'AGE') {
    const ageSelect = `
      CASE
        WHEN c.AGE < 25 THEN '18-24'
        WHEN c.AGE < 35 THEN '25-34'
        WHEN c.AGE < 45 THEN '35-44'
        WHEN c.AGE < 55 THEN '45-54'
        WHEN c.AGE < 65 THEN '55-64'
        ELSE '65+'
      END AS label`;

    if (needTxnJoin) {
      const txnConditions: string[] = [];
      if (filters.retailer !== 'All') {
        txnConditions.push(`t.RETAILER = '${filters.retailer}'`);
      }
      if (filters.recencyDays < 730) {
        txnConditions.push(
          `t.TRANSACTION_DATE >= DATEADD('day', -${filters.recencyDays}, CURRENT_DATE())`
        );
      }
      const txnWhere = txnConditions.length > 0 ? `AND ${txnConditions.join(' AND ')}` : '';
      const havingClause =
        filters.minSpend > 0 ? `HAVING SUM(t.AMOUNT) >= ${filters.minSpend}` : '';

      return `
        SELECT label, COUNT(*) AS count FROM (
          SELECT c.CUSTOMER_ID, ${ageSelect}
          FROM ONEDATA_AUDIENCE.PUBLIC.CUSTOMERS c
          JOIN ONEDATA_AUDIENCE.PUBLIC.TRANSACTIONS t ON c.CUSTOMER_ID = t.CUSTOMER_ID ${txnWhere}
          ${customerWhere}
          GROUP BY c.CUSTOMER_ID, c.AGE
          ${havingClause}
        ) GROUP BY label ORDER BY label`;
    }

    return `
      SELECT ${ageSelect}, COUNT(*) AS count
      FROM ONEDATA_AUDIENCE.PUBLIC.CUSTOMERS c
      ${customerWhere}
      GROUP BY label ORDER BY label`;
  }

  // STATE_CODE groupBy
  if (needTxnJoin) {
    const txnConditions: string[] = [];
    if (filters.retailer !== 'All') {
      txnConditions.push(`t.RETAILER = '${filters.retailer}'`);
    }
    if (filters.recencyDays < 730) {
      txnConditions.push(
        `t.TRANSACTION_DATE >= DATEADD('day', -${filters.recencyDays}, CURRENT_DATE())`
      );
    }
    const txnWhere = txnConditions.length > 0 ? `AND ${txnConditions.join(' AND ')}` : '';
    const havingClause =
      filters.minSpend > 0 ? `HAVING SUM(t.AMOUNT) >= ${filters.minSpend}` : '';

    return `
      SELECT label, COUNT(*) AS count FROM (
        SELECT c.CUSTOMER_ID, c.STATE_CODE AS label
        FROM ONEDATA_AUDIENCE.PUBLIC.CUSTOMERS c
        JOIN ONEDATA_AUDIENCE.PUBLIC.TRANSACTIONS t ON c.CUSTOMER_ID = t.CUSTOMER_ID ${txnWhere}
        ${customerWhere}
        GROUP BY c.CUSTOMER_ID, c.STATE_CODE
        ${havingClause}
      ) GROUP BY label ORDER BY count DESC`;
  }

  return `
    SELECT c.STATE_CODE AS label, COUNT(*) AS count
    FROM ONEDATA_AUDIENCE.PUBLIC.CUSTOMERS c
    ${customerWhere}
    GROUP BY c.STATE_CODE ORDER BY count DESC`;
}

export async function extractFiltersFromSQL(sql: string): Promise<Partial<Filters> | null> {
  try {
    const prompt = `Given this SQL query, extract the filter values as JSON. Only include filters that are explicitly present in the SQL.

SQL: ${sql}

Return ONLY valid JSON with these optional fields:
- retailer: "Kmart" or "Bunnings" or "All"
- ageRange: [min, max] (integers)
- states: ["NSW", "VIC", ...] (state codes)
- hasEmail: true/false
- hasPhone: true/false
- minSpend: number
- recencyDays: number

Example: {"retailer":"Kmart","ageRange":[30,60],"states":["NSW","VIC"]}

Return ONLY the JSON object, nothing else.`;

    const text = await aiComplete(prompt);
    // Extract JSON from response
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}
