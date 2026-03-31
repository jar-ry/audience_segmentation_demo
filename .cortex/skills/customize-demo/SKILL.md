---
name: customize-demo
description: "Customize the Audience Segmentation demo for a new customer. Connects to their existing Snowflake tables or generates seed data, remaps columns, regenerates SQL/agent/semantic-view scripts, and rebuilds the React app. Use when: plugging in customer data, connecting to different tables, seeding mock data, swapping data for a demo. Triggers: customize, plug in data, new customer, configure demo, swap data, different tables, seed data, generate data, use my tables."
---

# Customize Demo for New Customer

Turn this Audience Segmentation platform into a plug-and-play demo for any customer by connecting to their existing Snowflake tables (or generating seed data), remapping columns, and regenerating all SQL/agent/semantic-view scripts.

## Workflow

### Step 1: Choose Data Source

**Goal:** Determine whether the customer wants to use their own existing tables or have seed data generated.

**Ask** the user:
```
How would you like to set up the data?

1. Use my own tables — I have customer and transaction tables already in Snowflake
2. Seed new data — Generate mock data tailored to my industry/use case
3. Both — I have a customers table but need mock transactions (or vice versa)
```

**If "Use my own tables":** Proceed to Step 2.

**If "Seed new data":**
1. **Ask** the user:
```
To generate realistic seed data, tell me:
1. What industry? (e.g. retail, telecom, banking, healthcare, travel)
2. What are the main customer segments? (e.g. "Gold,Silver,Bronze" or "Premium,Standard")
3. What label describes the segments? (e.g. "Tier", "Brand", "Membership")
4. What regions/states should customers be distributed across? (e.g. "NSW,VIC,QLD,WA,SA,TAS,ACT,NT" or "US-East,US-West,EU,APAC")
5. What product categories exist? (e.g. "Electronics,Apparel,Home,Garden,Tools")
6. How many customers? (default: 200000)
7. How many transactions? (default: 1000000)
8. What database.schema should the tables be created in? (e.g. MY_DB.PUBLIC)
```

2. **Generate** a customized version of `sql/01_create_mock_data.sql` using the user's answers — replace segment values, region codes, product categories, and row counts. Keep the same table structure (CUSTOMERS and TRANSACTIONS) with the same column names.

3. **Present** the SQL for approval, then skip to Step 3 (column mappings are already known since we control the schema).

**If "Both":** Ask which table they have, discover it via Step 2, then generate the missing table's seed SQL to match their schema.

**STOP**: Confirm data source approach before proceeding.

### Step 2: Discover Existing Tables

**Goal:** Identify the customer's Snowflake tables and auto-detect their schema.

Only run this step if the user chose "Use my own tables" or "Both" in Step 1.

**Actions:**

1. **Ask** the user:
```
Provide your table names (fully qualified):
1. CUSTOMERS table (e.g. MY_DB.MY_SCHEMA.CUSTOMERS)
2. TRANSACTIONS table (e.g. MY_DB.MY_SCHEMA.ORDERS)
```

2. **Run** `DESCRIBE TABLE` on both tables to get column names and types.

3. **Present** the columns and **ask** the user to map them. Show each column from their table and ask which role it plays. Required mappings:

**Customer table mappings:**
| Role | Description | Example |
|------|-------------|---------|
| `customer_id` | Unique customer identifier | CUSTOMER_ID, USER_ID, MEMBER_ID |
| `segment` | Primary segmentation field (brand, tier, region, etc.) | RETAILER, BRAND, TIER, MEMBERSHIP_LEVEL |
| `age` | Customer age (numeric) | AGE, CUSTOMER_AGE |
| `gender` | Gender field | GENDER, SEX |
| `region_code` | Short region/state code for charts | STATE_CODE, REGION, COUNTRY_CODE |
| `region_name` | Full region display name | STATE_NAME, REGION_NAME |
| `has_email` | Boolean — has email | HAS_EMAIL, EMAIL_OPT_IN |
| `has_phone` | Boolean — has phone | HAS_PHONE, SMS_OPT_IN |
| `signup_date` | Customer registration date | SIGNUP_DATE, CREATED_AT |

**Transaction table mappings:**
| Role | Description | Example |
|------|-------------|---------|
| `transaction_id` | Unique transaction ID | TRANSACTION_ID, ORDER_ID |
| `customer_id` | FK to customer | CUSTOMER_ID, USER_ID |
| `segment` | Segment field on transactions (often same as customer) | RETAILER, BRAND |
| `transaction_date` | Date of transaction | TRANSACTION_DATE, ORDER_DATE |
| `amount` | Transaction amount (numeric) | AMOUNT, TOTAL, ORDER_TOTAL |
| `category` | Product category | PRODUCT_CATEGORY, CATEGORY, DEPARTMENT |
| `channel` | Purchase channel | CHANNEL, ORDER_CHANNEL |

If a column doesn't exist, the user can type "skip" and that filter will be removed from the UI.

**STOP**: Confirm all column mappings before proceeding.

### Step 3: Auto-Detect Segment & Region Values

**Goal:** Discover the actual values in the data so the UI filter pills and charts are correct.

1. **Auto-detect** segment values:
```sql
SELECT DISTINCT <segment_col> FROM <customer_table> ORDER BY 1
```

2. **Auto-detect** region values:
```sql
SELECT DISTINCT <region_code_col> FROM <customer_table> ORDER BY 1
```

3. **Ask** the user:
```
What label describes the segment filter? (e.g. "Retailer", "Brand", "Tier", "Region")
```

4. **Present** the discovered values and segment label for confirmation.

**STOP**: Present full configuration summary for approval.

### Step 4: Snowflake Object Names

**Ask** the user:
```
Snowflake configuration:
1. Database name for objects: (default: keep existing)
2. Schema: (default: PUBLIC)
3. Warehouse: (default: COMPUTE_WH)
4. Cortex Agent name: (default: AUDIENCE_AGENT)
5. Semantic View name: (default: AUDIENCE_SEGMENTATION)
```

If the user says "keep defaults" or "same", skip this step.

**NOTE:** Do NOT ask for Snowflake account identifier or host. The SPCS service spec must NOT set `SNOWFLAKE_ACCOUNT` or `SNOWFLAKE_HOST` — SPCS auto-injects these. Setting them explicitly breaks OAuth token validation (error 395092).

### Step 5: Seed Campaigns & Offers

**Ask** the user:
```
The app ships with sample campaigns and offers for the Campaigns and Offers pages.
How would you like to handle these?

1. Use my tables — I have a campaigns table and/or offers table in Snowflake
2. Auto-generate — create contextual campaigns and offers based on my segments and data
3. Keep defaults — leave the existing OnePass/Kmart/Bunnings examples as-is
```

**If "Use my tables":**
1. **Ask** for the table name(s):
```
Provide the table(s) you'd like to use (fully qualified). You can provide one or both:
1. Campaigns table (e.g. MY_DB.PUBLIC.CAMPAIGNS) — or "skip"
2. Offers table (e.g. MY_DB.PUBLIC.OFFERS) — or "skip"
```

2. **Run** `DESCRIBE TABLE` on each provided table to get columns and types.

3. **Run** `SELECT * FROM <table> LIMIT 5` to preview the data.

4. **Map** the columns to the required fields. Present the columns and ask the user to confirm the mapping:

   **Campaign table mappings:**
   | Role | Description | App field |
   |------|-------------|-----------|
   | `name` | Campaign name | name |
   | `status` | Status (Active/Paused/Completed/Draft/Activated/Cancelled) | status |
   | `channel` | Delivery channel (Email/SMS/Email + SMS) | channel |
   | `audience` | Audience description text | audience |
   | `audience_size` | Number of people targeted | audienceSize |
   | `budget` | Campaign budget | budget |
   | `spent` | Amount spent so far | spent |
   | `start_date` | Campaign start date | startDate |
   | `end_date` | Campaign end date | endDate |
   | `destination` | Activation destination (Braze/Hightouch/etc.) | destination |

   **Offer table mappings:**
   | Role | Description | App field |
   |------|-------------|-----------|
   | `name` | Offer name | name |
   | `type` | Offer type (Points Multiplier/Discount/Cashback/Partner/Reward) | type |
   | `description` | Offer description | description |
   | `cost_per_redemption` | Cost per redemption ($) | costPerRedemption |
   | `redemption_rate` | Average redemption rate (0-1) | avgRedemptionRate |
   | `partner` | Partner name (optional) | partner |
   | `active` | Whether offer is active (boolean) | active |

5. **Decide approach** based on data shape:
   - If the table maps cleanly to the required fields → generate a SQL query that reads from the table at runtime and replace the hardcoded `SEED_CAMPAIGNS`/`SEED_OFFERS` arrays with a `useEffect` fetch from `/api/sql`
   - If the table has most fields but not all → fill missing fields with sensible defaults (e.g., `sent: 0, opened: 0` for campaigns without engagement data)
   - If the table structure is very different → use `SELECT` with aliasing to reshape into the expected format, and present the query for approval

6. For any table the user skipped, fall back to **auto-generate** for that data type.

**If Auto-generate:** Use Cortex Complete to generate 6 seed campaigns and 8 seed offers that match the customer's segments, region values, and industry context. Present for approval.

**If Keep defaults:** No changes to `SEED_CAMPAIGNS` or `SEED_OFFERS` arrays.

### Step 6: Execute Refactoring

Apply all changes systematically. For each file, use the Edit tool with exact string replacements.

**Files to modify (in order):**

#### 6a. `react-app/server/index.js`
- Replace `'ONEDATA_AUDIENCE'` → new database name
- Replace `'PUBLIC'` → new schema (if changed)
- Replace `AUDIENCE_AGENT` in the agent_name template string → new agent name

#### 6b. `react-app/src/hooks/api.ts`
- Replace all `ONEDATA_AUDIENCE.PUBLIC.CUSTOMERS` → new FQ customer table
- Replace all `ONEDATA_AUDIENCE.PUBLIC.TRANSACTIONS` → new FQ transaction table
- Replace column references in `buildWhereClause`: `c.RETAILER` → `c.<segment_col>`, `c.AGE` → `c.<age_col>`, `c.STATE_CODE` → `c.<region_code_col>`, `c.HAS_EMAIL` → `c.<email_col>`, `c.HAS_PHONE` → `c.<phone_col>`, `t.RETAILER` → `t.<txn_segment_col>`, `t.TRANSACTION_DATE` → `t.<txn_date_col>`, `t.AMOUNT` → `t.<amount_col>`, `t.CUSTOMER_ID` → `t.<txn_customer_id_col>`
- Replace column references in `buildBreakdownQuery`: `c.STATE_CODE` → `c.<region_code_col>`, `c.AGE` → `c.<age_col>`
- Update `extractFiltersFromSQL` prompt: replace "Kmart"/"Bunnings" with new segment values, replace "NSW"/"VIC" with new region codes
- If any column was skipped, remove that filter block from `buildWhereClause` and `buildBreakdownQuery`

#### 6c. `react-app/src/App.tsx`
- Replace `ALL_STATES` array → new region codes
- Replace `SEED_CAMPAIGNS` array → new seed campaigns (from Step 5)
- Replace `200000` in `useState` → `0` (will be fetched dynamically)
- Replace `ONEDATA_AUDIENCE.PUBLIC.CUSTOMERS` in count query → new FQ customer table

#### 6d. `react-app/src/components/Sidebar.tsx`
- Replace `['All', 'Kmart', 'Bunnings']` → `['All', ...segmentValues]`
- Replace `Retailer` label → new segment label
- If segment column was skipped, remove the entire retailer pill-group block
- If age/email/phone columns were skipped, remove those respective filter blocks

#### 6e. `react-app/src/components/ChatBox.tsx`
- Replace example prompt `"How many Kmart customers in NSW are aged 25-40?"` → contextual example using new segment values and region codes

#### 6f. `react-app/src/components/MetricsBar.tsx`
- Replace `ONEDATA_AUDIENCE.PUBLIC.CUSTOMERS` in export query → new FQ customer table

#### 6g. `react-app/src/components/OffersPage.tsx`
- If Step 5 chose "Use my tables": replace hardcoded `SEED_OFFERS`/`SEED_CAMPAIGNS` arrays with `useEffect` + `useState` that fetches from `/api/sql` using the mapped query, and add loading states
- If Step 5 chose "Auto-generate": replace `SEED_OFFERS` array with AI-generated offers
- If Step 5 chose "Keep defaults": no changes
- In all cases, replace segment-specific references in offer descriptions (Kmart/Bunnings → new values) unless keeping defaults

#### 6g-ii. `react-app/src/App.tsx` (campaigns from table)
- If Step 5 provided a campaigns table: replace hardcoded `SEED_CAMPAIGNS` with a `useEffect` fetch from `/api/sql` using the mapped campaign query, with loading state and sensible defaults for missing fields (sent/opened/clicked/converted default to 0)

#### 6h. SQL scripts
- If seed data was chosen (Step 1), write customized `sql/01_create_mock_data.sql`
- Regenerate `sql/02_create_semantic_view.sql` with new table/column mappings
  - **CRITICAL**: When two tables share a column name (e.g., both have CUSTOMER_ID), only define the dimension on ONE table to avoid semantic view duplicate column errors
  - Use `CREATE OR REPLACE AGENT` syntax (not `CREATE CORTEX AGENT`)
  - **CRITICAL**: The agent's `tool_resources` must include `execution_environment` with `type: "warehouse"` and `warehouse` name. Without this, the agent fails at runtime with error 399504: "The Analyst tool is missing an execution environment."
- Regenerate `sql/03_create_cortex_agent.sql` with new agent name, semantic view ref, segment context
- Update `sql/04_deploy_spcs.sql` with new database values:
  - Replace database/schema references in all SQL object names
  - Replace the image path in the container spec
  - **CRITICAL: Do NOT add `SNOWFLAKE_ACCOUNT` or `SNOWFLAKE_HOST` to the service spec env vars** — SPCS auto-injects these. Only set `SNOWFLAKE_WAREHOUSE`.
  - Update the network egress rule `VALUE_LIST` with the user's account host
  - Add the macOS Docker config workaround comment if not present
- Update `sql/99_teardown.sql` with new object names

### Step 7: Verify & Build

1. **Run** `npm run build` in `react-app/` — must compile with zero TypeScript errors
2. If build fails, fix the errors and retry (max 3 attempts)
3. **Present** summary of all changes made

**STOP**: Final review. Present:
- Number of files modified
- Data source (own tables vs seeded)
- Table and column mappings
- Segment values and region codes
- Build status
- Next steps (run seed SQL if applicable, create semantic view via `/semantic-view`, create agent via `/cortex-agent`, deploy to SPCS)

### Step 8: SPCS Deployment

After the build succeeds, guide the user through deploying to SPCS.

1. **Run the SQL scripts** in order:
   - `sql/01_create_mock_data.sql` (if seeding data)
   - `sql/02_create_semantic_view.sql` (or use `/semantic-view` skill)
   - `sql/03_create_cortex_agent.sql` (or use `/cortex-agent` skill)

2. **Build and push the Docker image**:
   ```bash
   cd react-app
   docker build --platform linux/amd64 --no-cache -t audience-react-app .
   ```
   
   On macOS, set up Docker config to bypass Keychain:
   ```bash
   mkdir -p /tmp/docker-spcs && echo '{"credsStore":""}' > /tmp/docker-spcs/config.json
   DOCKER_CONFIG=/tmp/docker-spcs docker login <registry> -u 0sessiontoken -p "$(snow spcs image-registry token -c <connection> --format json)"
   ```
   
   Tag and push:
   ```bash
   docker tag audience-react-app <registry>/<db>/public/react_app_repo/audience-react-app:latest
   docker push <registry>/<db>/public/react_app_repo/audience-react-app:latest
   ```

3. **Deploy the service** by running `sql/04_deploy_spcs.sql`

4. **Verify** with `SHOW ENDPOINTS IN SERVICE <db>.PUBLIC.REACT_AUDIENCE_APP` and open the endpoint URL

**CRITICAL SPCS deployment rules:**
- The server MUST use CommonJS (`require()`), not ESM (`import`). `package.json` must NOT have `"type": "module"`.
- Use `https.request` (Node built-in) for REST API calls to Snowflake, not `fetch()`.
- The SDK connection in SPCS must include `accessUrl: 'https://${process.env.SNOWFLAKE_HOST}'` alongside `account`.
- NEVER set `SNOWFLAKE_ACCOUNT` or `SNOWFLAKE_HOST` in the SPCS service spec env vars. SPCS auto-injects these. Setting them explicitly causes error 395092 ("Client is unauthorized to use Snowpark Container Services OAuth token") because the SPCS OAuth token is only valid for the auto-injected internal host.
- Only set `SNOWFLAKE_WAREHOUSE` in the service spec env.
- The Agent REST API path is `/api/v2/databases/<DB>/schemas/<SCHEMA>/agents/<AGENT>:run` (not `/api/v2/cortex/agent:run`).

## Stopping Points

- **Step 1**: After data source approach confirmed
- **Step 2**: After column mappings confirmed (if using own tables)
- **Step 3**: After full configuration summary approved
- **Step 7**: After build verification and final review

## Output

- All project files updated for the new customer's data
- `config.json` saved at project root with the full configuration (for future re-runs)
- SQL scripts regenerated for new Snowflake objects
- Successful `npm run build`

## Notes

- The skill does NOT execute DDL/DML SQL against Snowflake (no CREATE/DROP). It only reads schema with DESCRIBE and SELECT DISTINCT. The user must run SQL scripts themselves.
- The user should use the `/semantic-view` and `/cortex-agent` skills to deploy those Snowflake objects after this skill completes.
- If a customer's table is missing a column (e.g., no age field), that filter is removed from the sidebar and the corresponding SQL/breakdown logic is stripped.
- Brand/theme (OnePass name, purple accent color) is intentionally left as-is — edit `NavSidebar.tsx`, `index.css`, and `index.html` manually if rebranding is needed.
