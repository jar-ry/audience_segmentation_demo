-- ============================================================
-- SPCS Deployment — Audience Segmentation App
-- ============================================================
USE ROLE ACCOUNTADMIN;
USE DATABASE ONEDATA_AUDIENCE;
USE SCHEMA PUBLIC;

-- 1. Compute pool
CREATE COMPUTE POOL IF NOT EXISTS DEMO_POOL_CPU
  MIN_NODES = 1 MAX_NODES = 1
  INSTANCE_FAMILY = CPU_X64_S;

-- 2. Image repository
CREATE IMAGE REPOSITORY IF NOT EXISTS ONEDATA_AUDIENCE.PUBLIC.REACT_APP_REPO;

-- 3. Network egress rule for Cortex Agent REST API
CREATE OR REPLACE NETWORK RULE ONEDATA_AUDIENCE.PUBLIC.REACT_APP_EGRESS_RULE
  TYPE = HOST_PORT MODE = EGRESS
  VALUE_LIST = ('<account>.snowflakecomputing.com:443');

CREATE OR REPLACE EXTERNAL ACCESS INTEGRATION REACT_APP_EGRESS_EAI
  ALLOWED_NETWORK_RULES = (ONEDATA_AUDIENCE.PUBLIC.REACT_APP_EGRESS_RULE)
  ENABLED = TRUE;

-- 4. Docker build & push (run from react-app/ directory)
-- IMPORTANT: On macOS, use DOCKER_CONFIG=/tmp/docker-spcs to bypass Keychain hangs.
--   mkdir -p /tmp/docker-spcs && echo '{"credsStore":""}' > /tmp/docker-spcs/config.json
--   DOCKER_CONFIG=/tmp/docker-spcs docker login <registry> -u 0sessiontoken -p "$(snow spcs image-registry token -c <connection> --format json)"
--
-- docker build --platform linux/amd64 --no-cache -t audience-react-app .
-- docker tag audience-react-app <registry>/<db>/public/react_app_repo/audience-react-app:latest
-- docker push <registry>/<db>/public/react_app_repo/audience-react-app:latest

-- 5. Create service
DROP SERVICE IF EXISTS ONEDATA_AUDIENCE.PUBLIC.REACT_AUDIENCE_APP;

-- CRITICAL: Do NOT set SNOWFLAKE_ACCOUNT or SNOWFLAKE_HOST in the env section.
-- SPCS auto-injects these. Setting them explicitly causes the OAuth token to be
-- sent to the wrong host, resulting in error 395092:
--   "Client is unauthorized to use Snowpark Container Services OAuth token"
CREATE SERVICE ONEDATA_AUDIENCE.PUBLIC.REACT_AUDIENCE_APP
  IN COMPUTE POOL DEMO_POOL_CPU
  EXTERNAL_ACCESS_INTEGRATIONS = (REACT_APP_EGRESS_EAI)
  FROM SPECIFICATION $$
  spec:
    containers:
      - name: app
        image: /<db>/<schema>/react_app_repo/audience-react-app:latest
        env:
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

-- 7. Check endpoint
SHOW ENDPOINTS IN SERVICE ONEDATA_AUDIENCE.PUBLIC.REACT_AUDIENCE_APP;
