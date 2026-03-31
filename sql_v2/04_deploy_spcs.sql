-- ============================================================
-- SPCS Deployment — FitLife Member Segmentation App
-- ============================================================
USE ROLE ACCOUNTADMIN;
USE DATABASE FITLIFE_MEMBERS;
USE SCHEMA PUBLIC;

-- 1. Compute pool
CREATE COMPUTE POOL IF NOT EXISTS FITLIFE_POOL_CPU
  MIN_NODES = 1 MAX_NODES = 1
  INSTANCE_FAMILY = CPU_X64_S;

-- 2. Image repository
CREATE IMAGE REPOSITORY IF NOT EXISTS FITLIFE_MEMBERS.PUBLIC.REACT_APP_REPO;

-- 3. Network egress rule for Cortex Agent REST API
CREATE OR REPLACE NETWORK RULE FITLIFE_MEMBERS.PUBLIC.REACT_APP_EGRESS_RULE
  TYPE = HOST_PORT MODE = EGRESS
  VALUE_LIST = ('<YOUR_SNOWFLAKE_HOST>:443');

CREATE OR REPLACE EXTERNAL ACCESS INTEGRATION FITLIFE_REACT_APP_EGRESS_EAI
  ALLOWED_NETWORK_RULES = (FITLIFE_MEMBERS.PUBLIC.REACT_APP_EGRESS_RULE)
  ENABLED = TRUE;

-- 4. Docker build & push (run from react-app/ directory)
-- docker build --platform linux/amd64 --no-cache -t fitlife-react-app .
-- docker tag fitlife-react-app <YOUR_REGISTRY>.registry.snowflakecomputing.com/fitlife_members/public/react_app_repo/fitlife-react-app:latest
-- docker push <YOUR_REGISTRY>.registry.snowflakecomputing.com/fitlife_members/public/react_app_repo/fitlife-react-app:latest

-- 5. Create service
DROP SERVICE IF EXISTS FITLIFE_MEMBERS.PUBLIC.REACT_FITLIFE_APP;

CREATE SERVICE FITLIFE_MEMBERS.PUBLIC.REACT_FITLIFE_APP
  IN COMPUTE POOL FITLIFE_POOL_CPU
  EXTERNAL_ACCESS_INTEGRATIONS = (FITLIFE_REACT_APP_EGRESS_EAI)
  FROM SPECIFICATION $$
  spec:
    containers:
      - name: app
        image: /fitlife_members/public/react_app_repo/fitlife-react-app:latest
        env:
          SNOWFLAKE_ACCOUNT: <YOUR_ACCOUNT>
          SNOWFLAKE_HOST: <YOUR_SNOWFLAKE_HOST>
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
GRANT USAGE ON SERVICE FITLIFE_MEMBERS.PUBLIC.REACT_FITLIFE_APP TO ROLE ACCOUNTADMIN;

-- 7. Check endpoint
SHOW ENDPOINTS IN SERVICE FITLIFE_MEMBERS.PUBLIC.REACT_FITLIFE_APP;
