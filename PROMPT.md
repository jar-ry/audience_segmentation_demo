## 1. Project Overview

Build an **Audience Segmentation Platform** for Australian retail brands **Kmart** and **Bunnings** under the **OnePass** loyalty program. The platform lets marketers:

1. **Query customer segments** via a Cortex Agent (natural language → SQL)
2. **Tune audience filters** with interactive sliders/toggles (age, state, retailer, channel, spend, recency)
3. **View real-time analytics** — state/age breakdowns, AI-generated insights (via Cortex Complete)
4. **Calculate campaign costs** — select offers, channel, duration → deterministic cost computation
5. **AI Budget Planner** — greedy knapsack optimization for offer selection within a budget
6. **Activate campaigns** to external destinations (Braze / Hightouch) from the Offers page
7. **Manage campaigns** — view details, engagement funnel, AI campaign insights, pause/resume/cancel

The frontend is a **React 18 + Vite + TypeScript** SPA deployed to **Snowpark Container Services (SPCS)** with an **Express** backend that connects to Snowflake via the snowflake-sdk and the Cortex Agent REST API.

---

## 2. Snowflake Account Setup

```
Account: <your-account>
Role: ACCOUNTADMIN
Warehouse: COMPUTE_WH
Database: ONEDATA_AUDIENCE
Schema: PUBLIC
```

---

## 3. Step-by-Step Build Instructions

### Step 3.1 — Create Mock Data (`sql/01_create_mock_data.sql`)

Create a SQL script that generates:

- **CUSTOMERS** table: 200,000 rows (100k per retailer: Kmart, Bunnings)
  - Columns: `CUSTOMER_ID` (CUST-0000001 format), `RETAILER`, `AGE` (18-80), `GENDER` (Female/Male/Other weighted 55/37/8), `STATE_CODE` (ACT/NSW/NT/QLD/SA/TAS/VIC/WA weighted by population), `STATE_NAME`, `HAS_EMAIL` (72% true), `HAS_PHONE` (85% true), `SIGNUP_DATE`
  - Use `GENERATOR(ROWCOUNT => 200000)` with `ROW_NUMBER()` and `UNIFORM()` for randomization
  - First 100k = Kmart, rest = Bunnings

- **TRANSACTIONS** table: 1,000,000 rows (~5 per customer avg)
  - Columns: `TRANSACTION_ID` (TXN-00000001 format), `CUSTOMER_ID` (FK), `RETAILER`, `TRANSACTION_DATE` (last 2 years), `AMOUNT` (varies by category), `PRODUCT_CATEGORY`, `CHANNEL` (Instore 65% / Online 35%)
  - **Bunnings categories** (weighted): Garden 25%, Tools 25%, Paint 10%, Lighting 10%, Bathroom 10%, Outdoor Furniture 10%, Hardware 10%
  - **Kmart categories** (weighted): Apparel 30%, Electronics 20%, Home & Living 15%, Toys 10%, Beauty 10%, Grocery 10%, Sports 5%
  - Amount ranges vary by category (Electronics: $20-800, Apparel: $5-150, etc.)

**Exact SQL** for this script is in the `sql/01_create_mock_data.sql` file in the repo. Run it first:

```sql
-- Run in Snowflake worksheet or via CLI
!source sql/01_create_mock_data.sql
```

---

### Step 3.2 — Create Semantic View (use `/semantic-view` skill)

**IMPORTANT: Use the `/semantic-view` skill to create this, NOT hand-crafted SQL.**

Invoke the `/semantic-view` skill with this request:

```
/semantic-view Create a semantic view called ONEDATA_AUDIENCE.PUBLIC.AUDIENCE_SEGMENTATION over these two tables:

1. ONEDATA_AUDIENCE.PUBLIC.CUSTOMERS — primary key: CUSTOMER_ID
   Dimensions: CUSTOMER_ID, RETAILER, AGE, GENDER, STATE_CODE, STATE_NAME, HAS_EMAIL, HAS_PHONE, SIGNUP_DATE

2. ONEDATA_AUDIENCE.PUBLIC.TRANSACTIONS — primary key: TRANSACTION_ID
   Dimensions: TRANSACTION_ID, CUSTOMER_ID, RETAILER, TRANSACTION_DATE, PRODUCT_CATEGORY, CHANNEL
   Metrics:
   - total_spend: SUM(AMOUNT), description "Total transaction amount in AUD"
   - avg_transaction_value: AVG(AMOUNT), description "Average transaction amount in AUD"
   - transaction_count: COUNT(TRANSACTION_ID), description "Number of transactions"

Relationship: CUSTOMERS.CUSTOMER_ID → TRANSACTIONS.CUSTOMER_ID

Include these verified queries (VQRs):
1. "How many Kmart customers are in NSW?" → SELECT COUNT(*) AS customer_count FROM ONEDATA_AUDIENCE.PUBLIC.CUSTOMERS WHERE RETAILER = 'Kmart' AND STATE_CODE = 'NSW'
2. "What is the average spend for Bunnings customers in QLD?" → SELECT AVG(t.AMOUNT) AS avg_spend FROM ONEDATA_AUDIENCE.PUBLIC.TRANSACTIONS t JOIN ONEDATA_AUDIENCE.PUBLIC.CUSTOMERS c ON t.CUSTOMER_ID = c.CUSTOMER_ID WHERE c.RETAILER = 'Bunnings' AND c.STATE_CODE = 'QLD'
3. "How many customers have email and are aged 30-60?" → SELECT COUNT(*) AS customer_count FROM ONEDATA_AUDIENCE.PUBLIC.CUSTOMERS WHERE HAS_EMAIL = TRUE AND AGE BETWEEN 30 AND 60
4. "What are the top 5 product categories by total spend for Kmart?" → SELECT t.PRODUCT_CATEGORY, SUM(t.AMOUNT) AS total_spend FROM ONEDATA_AUDIENCE.PUBLIC.TRANSACTIONS t WHERE t.RETAILER = 'Kmart' GROUP BY t.PRODUCT_CATEGORY ORDER BY total_spend DESC LIMIT 5
```

**CRITICAL semantic view gotchas (learned the hard way):**
- Metrics do NOT support `data_type` field — omit it
- Relationships do NOT support `description` field
- `relationship_type: one_to_many` is deprecated — omit it
- The `right_column` in a relationship must be a unique/primary key column
- Single quotes in VQR SQL must be escaped as `''` when inline in `SYSTEM$CREATE_SEMANTIC_VIEW_FROM_YAML`
- After creating, run the VQR evaluation to verify all queries pass

Save the final creation SQL to `sql/02_create_semantic_view.sql`.

---

### Step 3.3 — Create Cortex Agent (use `/cortex-agent` skill)

**IMPORTANT: Use the `/cortex-agent` skill to create this, NOT hand-crafted SQL.**

Invoke the `/cortex-agent` skill with this request:

```
/cortex-agent Create an agent called ONEDATA_AUDIENCE.PUBLIC.AUDIENCE_AGENT with these specifications:

- Orchestration model: claude-4-sonnet
- Display name: "Audience Segmentation Assistant"
- Orchestration instructions: "You are an audience segmentation assistant for Australian retail brands Kmart and Bunnings. Use the analyst tool to answer questions about customer demographics, transaction behaviour, audience sizing, and segment criteria. Always return audience counts when asked about segments."
- Response instructions: "Be concise and data-driven. When returning audience sizes, always state the count clearly. Suggest ways to refine or narrow segments when the audience is too large or too small. Format numbers with commas for readability."
- Tool: cortex_analyst_text_to_sql
  - Name: audience_analyst
  - Description: "Query customer and transaction data for Kmart and Bunnings. Supports audience sizing, demographic analysis, spend analysis, channel availability (email/phone), and segment exploration."
  - Semantic view: ONEDATA_AUDIENCE.PUBLIC.AUDIENCE_SEGMENTATION
  - Warehouse: COMPUTE_WH
  - Query timeout: 60
```

Save the final creation SQL to `sql/03_create_cortex_agent.sql`.

---

### Step 3.4 — Create the React Application

#### 3.4.1 — Project Setup

```bash
mkdir -p react-app && cd react-app
npm init -y
npm install react@18 react-dom@18 recharts react-markdown remark-gfm express cors snowflake-sdk
npm install -D @types/react @types/react-dom @vitejs/plugin-react typescript vite
```

**package.json scripts:**
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "server": "node server/index.js",
    "start": "node server/index.js"
  }
}
```

#### 3.4.2 — Application Architecture

```
react-app/
├── server/index.js          # Express backend — Snowflake SDK, Agent REST API, Cortex Complete
├── src/
│   ├── main.tsx              # React entry point
│   ├── App.tsx               # Thin shell — NavSidebar + page routing + shared filter state
│   ├── index.css             # All CSS — OnePass purple/light theme
│   ├── types/index.ts        # TypeScript interfaces (Filters, Campaign, ChatMessage, etc.)
│   ├── hooks/api.ts          # API helpers (runSQL, callAgent, aiComplete, buildWhereClause, extractFiltersFromSQL)
│   └── components/
│       ├── NavSidebar.tsx     # Purple left nav — OnePass brand, 3 pages + Settings
│       ├── AudiencePage.tsx   # Main audience builder — MetricsBar + ChatBox + RightPanel
│       ├── CampaignsPage.tsx  # Campaign list + detail view with funnel + AI insights
│       ├── OffersPage.tsx     # 3 tabs: Catalogue, Cost Calculator, AI Budget Planner + Activate
│       ├── MetricsBar.tsx     # KPI strip — audience size, % of base, reachable + filter toggle
│       ├── ChatBox.tsx        # Chat with agent — markdown rendering, SQL toggle, suggested chips
│       ├── Sidebar.tsx        # Filter drawer — retailer, age, states, channels, spend, recency
│       └── RightPanel.tsx     # Insights panel — AI summary, state bar chart, age bar chart
├── Dockerfile                # Multi-stage: build Vite → serve with Node on port 8080
├── .dockerignore
├── vite.config.ts
├── tsconfig.json
├── index.html
└── package.json
```

#### 3.4.3 — Design System (OnePass Theme)

```css
:root {
  --bg: #f5f6f8;
  --surface: #ffffff;
  --surface-raised: #f9f9fb;
  --border: #e2e5ea;
  --text: #1a1d23;
  --text-dim: #5c6370;
  --text-muted: #9199a5;
  --accent: #7C3AED;           /* OnePass purple */
  --accent-hover: #6D28D9;
  --nav-bg: #7C3AED;           /* Purple nav sidebar */
  --nav-width: 220px;
  --radius: 12px;
  --radius-sm: 8px;
}
```

- White backgrounds, purple accent throughout
- Font: Inter (system fallback)
- Cards with 1px border, 12px radius, hover border color change
- Shimmer loading animations for AI content
- Toast notifications (green, bottom center)
- Modal overlays with backdrop blur

#### 3.4.4 — Key Architectural Decisions

**A. State Management**
- Filter state is **lifted to App.tsx** and shared across all 3 pages
- Campaign state is **lifted to App.tsx** (`SEED_CAMPAIGNS` array + `addCampaign` callback)
- The agent's SQL response is parsed to extract filters, which **sync back to the filter panel** (bidirectional)
- `buildWhereClause()` in `api.ts` constructs SQL WHERE clauses from filter state — matches agent SQL patterns

**B. CRITICAL: Never Let AI Compute Costs**
- LLMs hallucinate arithmetic. ALL cost calculations use **deterministic `useMemo`** hooks
- The Cost Calculator uses `useMemo` — no Calculate button, results update reactively
- The Budget Planner uses a **greedy knapsack algorithm** in `useMemo`:
  - Iterates channel/duration combos, sorts active offers by goal-efficiency
  - Greedily picks offers within remaining budget after send costs
  - Only the **verified numbers** are passed to Cortex Complete for **strategic reasoning**
- AI receives pre-computed costs with explicit instructions: "Do NOT recalculate any costs"

**C. Agent Communication**
- Frontend calls `/api/agent-via-sql` → Express server calls Cortex Agent REST API
- Auth flow: SPCS OAuth token (`/snowflake/session/token`) → exchange via `/session/v1/login-request` → session token → `Snowflake Token="${sessionToken}"` header
- Response is SSE format — parse into events with types: `response`, `response.text.delta`, `response.tool_result`, `response.suggested_queries`
- **Suggested queries**: Agent returns `{"query": "..."}` objects — extract `.query` property (not `.question` or `.text`)
- Delta assembly fallback if no aggregate `response` event found

**D. Filter ↔ Agent Sync**
- When agent returns SQL, `extractFiltersFromSQL()` uses Cortex Complete to parse SQL into filter JSON
- Extracted filters are applied to the sidebar (with "Synced from agent" banner)
- Chat messages include current filter context: `[Current sidebar filters: Retailer=Kmart; Age=30-60; ...]`

**E. Activate Campaign Flow**
- Activate button appears on the **Offers page** (after cost calculation or budget planner results)
- Opens modal pre-filled with channel, budget from the calculation
- Creates a Campaign object with status "Activated" and destination (Braze/Hightouch)
- Navigates to Campaigns page after activation

**F. `buildWhereClause` Details**
- Must filter transactions by `t.RETAILER` (not just customers) to match agent SQL
- Uses `>= ` (not `>`) for spend threshold via `HAVING SUM(t.AMOUNT) >= ${minSpend}`
- Transaction subquery joins when `minSpend > 0` or `recencyDays < 730`

---

### Step 3.5 — Express Backend (`server/index.js`)

The server handles:

1. **`POST /api/sql`** — Execute arbitrary SQL via snowflake-sdk
2. **`POST /api/agent-via-sql`** — Call Cortex Agent REST API, parse SSE response
3. **`POST /api/ai-complete`** — Call `SNOWFLAKE.CORTEX.COMPLETE('claude-opus-4-6', prompt)` via SQL

**CRITICAL: Token Refresh Architecture (Long-Running SPCS)**

SPCS services can run for days. Session tokens expire ~60 minutes. The server implements proactive refresh:

```
┌─────────────────────────────────────────────────────┐
│  SESSION TOKEN MANAGEMENT                            │
│                                                      │
│  1. TTL cache: 55-minute TTL on session token        │
│  2. Background interval: every 5 min, check if      │
│     age > 80% of TTL → proactive refresh             │
│  3. OAuth file-hash detection: if SPCS rotates the   │
│     /snowflake/session/token file, detect via hash   │
│     comparison and reconnect SDK + clear session     │
│  4. Auto-retry: on 401/403, clear token and retry    │
│     up to 2 times with force-refresh                 │
│  5. `callAgentAPI(query, _retry)` has built-in       │
│     retry logic — route handler is simple try/catch  │
└─────────────────────────────────────────────────────┘
```

Key implementation details:
- `simpleHash()` computes a fast hash of the OAuth token file content
- `getConnection()` checks hash on every call — if changed, destroys old connection
- `getSessionToken(forceRefresh)` checks TTL before returning cached token
- `exchangeOAuthForSession()` POSTs to `/session/v1/login-request` with OAuth token
- Background `setInterval` runs after startup if running in SPCS
- **IMPORTANT**: SPCS OAuth token does NOT work directly for REST API calls. Must exchange via login-request.

---

### Step 3.6 — Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 8080
ENV PORT=8080
CMD ["node", "server/index.js"]
```

**IMPORTANT: Server runs on port 8080** — this must match the SPCS service spec.

---

### Step 3.7 — SPCS Deployment (`sql/04_deploy_spcs.sql`)

```sql
-- 1. Create compute pool
CREATE COMPUTE POOL IF NOT EXISTS DEMO_POOL_CPU
  MIN_NODES = 1 MAX_NODES = 1
  INSTANCE_FAMILY = CPU_X64_S;

-- 2. Create image repository
CREATE IMAGE REPOSITORY IF NOT EXISTS ONEDATA_AUDIENCE.PUBLIC.REACT_APP_REPO;

-- 3. Network egress (for Cortex Agent REST API calls back to Snowflake)
CREATE OR REPLACE NETWORK RULE ONEDATA_AUDIENCE.PUBLIC.REACT_APP_EGRESS_RULE
  TYPE = HOST_PORT MODE = EGRESS
  VALUE_LIST = ('<account>.snowflakecomputing.com:443');

CREATE OR REPLACE EXTERNAL ACCESS INTEGRATION REACT_APP_EGRESS_EAI
  ALLOWED_NETWORK_RULES = (ONEDATA_AUDIENCE.PUBLIC.REACT_APP_EGRESS_RULE)
  ENABLED = TRUE;

-- 4. Build, tag, and push Docker image
-- docker build --platform linux/amd64 --no-cache -t audience-react-app .
-- docker tag audience-react-app <registry>/onedata_audience/public/react_app_repo/audience-react-app:latest
-- docker push <registry>/onedata_audience/public/react_app_repo/audience-react-app:latest

-- 5. Create service
DROP SERVICE IF EXISTS ONEDATA_AUDIENCE.PUBLIC.REACT_AUDIENCE_APP;

CREATE SERVICE ONEDATA_AUDIENCE.PUBLIC.REACT_AUDIENCE_APP
  IN COMPUTE POOL DEMO_POOL_CPU
  EXTERNAL_ACCESS_INTEGRATIONS = (REACT_APP_EGRESS_EAI)
  FROM SPECIFICATION $$
  spec:
    containers:
      - name: app
        image: /<db>/<schema>/react_app_repo/audience-react-app:latest
        env:
          SNOWFLAKE_ACCOUNT: <account>
          SNOWFLAKE_HOST: <host>.snowflakecomputing.com
          SNOWFLAKE_WAREHOUSE: COMPUTE_WH
        resources:
          requests:
            cpu: 0.5
            memory: 1Gi
          limits:
            cpu: 2
            memory: 4Gi
    endpoints:
      - name: app
        port: 8080
        public: true
  $$;

-- 6. Grant access
GRANT USAGE ON SERVICE ONEDATA_AUDIENCE.PUBLIC.REACT_AUDIENCE_APP TO ROLE ACCOUNTADMIN;
```

**Deployment gotchas:**
- Always use `--no-cache` for `docker build` when server code changes — cached layers skip file updates
- `EXTERNAL_ACCESS_INTEGRATIONS = (REACT_APP_EGRESS_EAI)` — no quotes around the integration name
- Endpoint URL changes on every `DROP/CREATE SERVICE` — check with `SHOW ENDPOINTS IN SERVICE ...`
- Platform must be `linux/amd64` for SPCS

---

### Step 3.8 — Teardown Script (`sql/99_teardown.sql`)

```sql
DROP SERVICE IF EXISTS ONEDATA_AUDIENCE.PUBLIC.REACT_AUDIENCE_APP;
DROP AGENT IF EXISTS ONEDATA_AUDIENCE.PUBLIC.AUDIENCE_AGENT;
DROP SEMANTIC VIEW IF EXISTS ONEDATA_AUDIENCE.PUBLIC.AUDIENCE_SEGMENTATION;
DROP TABLE IF EXISTS ONEDATA_AUDIENCE.PUBLIC.TRANSACTIONS;
DROP TABLE IF EXISTS ONEDATA_AUDIENCE.PUBLIC.CUSTOMERS;
DROP DATABASE IF EXISTS ONEDATA_AUDIENCE;
```

---

## 4. Component-by-Component Specifications

### 4.1 — `App.tsx`
- Thin shell: `NavSidebar` (left) + page content + optional filter panel (right dock)
- Pages: `audience`, `campaigns`, `offers` — routed by `page` state
- Shared state: `filters`, `allStates`, `audienceSize`, `pctOfBase`, `reachable`, `stateData`, `ageData`, `execSummary`, `campaigns`
- `refreshData()` runs on filter change (debounced 300ms): counts audience, computes breakdowns, generates AI summary
- `buildAudienceLabel()` generates human-readable label from current filters
- `addCampaign()` adds to campaigns array and navigates to campaigns page
- Filter panel is a **docked right panel** (not overlay) — content shifts left when open

### 4.2 — `AudiencePage.tsx`
- Composition: `MetricsBar` + `ChatBox` (left) + `RightPanel` (right)
- Chat sends augmented query with current filter context to agent
- Agent response SQL is parsed → filters are extracted and synced back to sidebar
- Download/export CSV button in MetricsBar

### 4.3 — `ChatBox.tsx`
- Custom markdown renderer: `formatContent()` → `renderTextBlocks()` → `inlineFormat()`
- Handles: code blocks, headers, bullet lists, ordered lists, bold, inline code
- Messages displayed newest-first (reversed), compose area at top
- SQL toggle per message (expand/collapse)
- Suggested query chips below assistant messages — clicking sends the query
- Thinking bubble with animated dots during loading

### 4.4 — `RightPanel.tsx`
- Uses **Recharts** for bar charts (state breakdown, age breakdown)
- AI executive summary rendered as bullet list
- Purple color palette for chart bars: `['#7C3AED', '#9061F0', '#A78BFA', '#6D28D9', ...]`
- Empty state when audience size is 0

### 4.5 — `OffersPage.tsx`
- 3 tabs: Catalogue, Cost Calculator, AI Budget Planner
- **Catalogue**: Grid of offer cards with type badges, stats, partner tags
- **Cost Calculator**: 
  - Left panel: audience source (segment vs campaign), channel, offer selection (checkboxes), duration slider, channel costs
  - Right panel: live cost estimate (useMemo), offer breakdown table, AI recommendations
  - Activate button at bottom of results
- **Budget Planner**:
  - Left panel: budget slider ($1K-$100K steps), campaign goal, channel preference
  - Right panel: optimized plan (useMemo greedy knapsack), AI strategy insights (JSON format with summary, offerReasons, roiRationale, tips)
  - Activate button at bottom of results
- **Activate modal**: campaign name, destination picker (Braze/Hightouch), channel, budget display

### 4.6 — `CampaignsPage.tsx`
- List view: table with campaign name, status badge, destination, channel, audience size, budget bar
- Detail view: back button, action buttons (Pause/Resume/Launch/Complete/Cancel), 6 metric cards, engagement funnel, AI campaign insights
- Confirmation dialogs for destructive actions (cancel, complete)
- Status colors: Active=#2ecc71, Paused=#f39c12, Completed=#8b929a, Draft=#7C3AED, Activated=#0ea5e9, Cancelled=#ef4444
- AI insights generated via Cortex Complete with campaign metrics

### 4.7 — `Sidebar.tsx` (Filter Drawer)
- Retailer pill group (All / Kmart / Bunnings)
- Age range dual sliders (1-100)
- State chips (multi-select, scrollable)
- Contact channels toggles (Has Email, Has Phone)
- Min spend number input
- Recency slider (1-730 days)
- "Synced from agent" banner when filters came from agent SQL

### 4.8 — `MetricsBar.tsx`
- 3 KPI cards: Audience Size (purple icon), % of Base (pink icon), Reachable (green icon)
- Filter toggle button, Export CSV button
- Optional Activate button (not used on AudiencePage, only via OffersPage)

### 4.9 — `types/index.ts`
```typescript
export interface Filters {
  retailer: string; ageRange: [number, number]; states: string[];
  hasEmail: boolean; hasPhone: boolean; minSpend: number; recencyDays: number;
}
export interface Campaign {
  id: string; name: string; status: 'Active' | 'Paused' | 'Completed' | 'Draft' | 'Activated' | 'Cancelled';
  channel: string; audience: string; audienceSize: number;
  sent: number; opened: number; clicked: number; converted: number;
  startDate: string; endDate: string; budget: number; spent: number; destination?: string;
}
export interface ChatMessage {
  role: 'user' | 'assistant'; content: string;
  sql?: string; data?: Record<string, unknown>[]; suggested?: string[];
}
export interface BreakdownRow { label: string; count: number; }
```

### 4.10 — `hooks/api.ts`
- `runSQL(sql)` — POST to `/api/sql`, returns rows
- `callAgent(query)` — POST to `/api/agent-via-sql`, returns parsed response
- `aiComplete(prompt)` — POST to `/api/ai-complete`, returns text
- `buildWhereClause(filters, allStates)` — constructs WHERE clause matching agent SQL patterns
- `extractFiltersFromSQL(sql)` — uses Cortex Complete to extract filter JSON from agent SQL

### 4.11 — Seed Data
- 6 seed campaigns with realistic Australian retail data (Summer DIY Blitz, Back to School, etc.)
- 8 seed offers: Points Multiplier, Discount, Cashback, Partner, Reward types
- Each offer has: costPerRedemption, avgRedemptionRate, partner, active status

---

## 5. Lessons Learned & Pitfalls

### Auth / SPCS
1. **Session tokens expire ~60min** — implement proactive refresh with TTL cache + background interval
2. **SPCS OAuth token does NOT work directly for REST API calls** — must exchange via `/session/v1/login-request`
3. **SPCS may rotate the OAuth file** — detect via file hash comparison, reconnect on change
4. **Always use `--no-cache` for Docker builds** when server code changes
5. **Port must be 8080** — SPCS expects this in the spec; don't use 3000

### Agent / AI
6. **Never let AI compute costs** — LLMs hallucinate arithmetic. Pre-compute deterministically with `useMemo`, pass verified numbers to AI for reasoning only
7. **Suggested queries format**: Agent returns `{"query": "..."}` objects — extract `.query` property first, then fallback to `.question`, `.text`, then `JSON.stringify()`
8. **SSE parsing**: Response events can have no aggregate `response` event — implement delta assembly fallback
9. **Cortex Complete model**: Use `claude-opus-4-6` for AI Complete calls via SQL

### Semantic Views
10. **Metrics do NOT support `data_type` field** — omit it
11. **Relationships do NOT support `description` field**
12. **`relationship_type: one_to_many` is deprecated** — omit it
13. **`right_column` must be a unique/primary key column**
14. **Single quotes in VQR SQL must be escaped as `''`** when inline in YAML

### React App
15. **Filter state must be lifted to App.tsx** — shared across Audience, Campaigns, Offers pages
16. **`buildWhereClause` must filter transactions by `t.RETAILER`** to match agent SQL patterns
17. **Use `>=` not `>` for spend threshold** in HAVING clause
18. **Cost Calculator is fully reactive** — no Calculate button, uses `useMemo` + debounced `useEffect` for AI
19. **Budget Planner uses greedy knapsack** — sort offers by goal-efficiency, greedily pick within budget
20. **Activate button belongs on Offers page** (after cost calculation), not Audience page

### Deployment
21. **`EXTERNAL_ACCESS_INTEGRATIONS = (NAME)` — no quotes** around the integration name
22. **Endpoint URL changes on every DROP/CREATE SERVICE** — always check with `SHOW ENDPOINTS`
23. **Docker platform must be `linux/amd64`** for SPCS

---

## 6. File Listing

```
onedata_audience_segmentation/
├── sql/
│   ├── 01_create_mock_data.sql
│   ├── 02_create_semantic_view.sql    # Generated via /semantic-view skill
│   ├── 03_create_cortex_agent.sql     # Generated via /cortex-agent skill
│   ├── 04_deploy_spcs.sql
│   └── 99_teardown.sql
├── audience_semantic_model.yaml        # Reference YAML (generated by skill)
├── DEMO_SCRIPT.md
├── SUPER_PROMPT.md                     # This file
└── react-app/
    ├── server/index.js
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx
    │   ├── index.css
    │   ├── types/index.ts
    │   ├── hooks/api.ts
    │   └── components/
    │       ├── NavSidebar.tsx
    │       ├── AudiencePage.tsx
    │       ├── CampaignsPage.tsx
    │       ├── OffersPage.tsx
    │       ├── MetricsBar.tsx
    │       ├── ChatBox.tsx
    │       ├── Sidebar.tsx
    │       └── RightPanel.tsx
    ├── Dockerfile
    ├── .dockerignore
    ├── vite.config.ts
    ├── tsconfig.json
    ├── index.html
    └── package.json
```

---

## 7. Execution Order

1. Run `sql/01_create_mock_data.sql` — creates database, customers, transactions
2. Use `/semantic-view` skill → produces `sql/02_create_semantic_view.sql` — run it
3. Use `/cortex-agent` skill → produces `sql/03_create_cortex_agent.sql` — run it
4. Create the React app following the architecture in Section 4
5. Build and deploy to SPCS following Section 3.7
6. Test end-to-end: chat with agent, adjust filters, calculate costs, activate campaign

---

## 8. Testing Checklist

- [ ] Agent responds to natural language queries with SQL and data
- [ ] Suggested queries appear as clickable chips (not raw JSON)
- [ ] Filters sync bidirectionally (sidebar ↔ agent)
- [ ] Cost Calculator updates reactively on filter/offer changes
- [ ] Budget Planner computes optimal offer mix within budget
- [ ] AI reasoning uses pre-computed numbers (no hallucinated math)
- [ ] Activate creates campaign and navigates to Campaigns page
- [ ] Campaign actions (pause/resume/cancel/complete) work with confirmation
- [ ] Token refresh works after 60+ minutes of uptime
- [ ] State/age bar charts render correctly with Recharts
- [ ] Export CSV downloads audience data
- [ ] Filter panel docks on right without overlay blur
