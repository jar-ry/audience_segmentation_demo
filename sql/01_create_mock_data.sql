-- ============================================================
-- OnePass Audience Segmentation — Mock Data Generator
-- Run once to create CUSTOMERS (200k) and TRANSACTIONS (1M)
-- ============================================================

USE ROLE ACCOUNTADMIN;
CREATE DATABASE IF NOT EXISTS ONEDATA_AUDIENCE;
USE DATABASE ONEDATA_AUDIENCE;
USE SCHEMA PUBLIC;
USE WAREHOUSE COMPUTE_WH;

-- ── CUSTOMERS (200,000 rows: 100k Kmart + 100k Bunnings) ──
CREATE OR REPLACE TABLE CUSTOMERS AS
WITH raw AS (
  SELECT
    ROW_NUMBER() OVER (ORDER BY SEQ8()) AS rn,
    UNIFORM(18, 80, RANDOM())           AS age,
    UNIFORM(1, 100, RANDOM())           AS gender_rnd,
    UNIFORM(1, 100, RANDOM())           AS state_rnd,
    UNIFORM(1, 100, RANDOM())           AS email_rnd,
    UNIFORM(1, 100, RANDOM())           AS phone_rnd,
    DATEADD('day', -UNIFORM(0, 2190, RANDOM()), CURRENT_DATE()) AS signup_date
  FROM TABLE(GENERATOR(ROWCOUNT => 200000))
)
SELECT
  'CUST-' || LPAD(rn::STRING, 7, '0')           AS CUSTOMER_ID,
  CASE WHEN rn <= 100000 THEN 'Kmart' ELSE 'Bunnings' END AS RETAILER,
  age                                             AS AGE,
  CASE
    WHEN gender_rnd <= 55 THEN 'Female'
    WHEN gender_rnd <= 92 THEN 'Male'
    ELSE 'Other'
  END                                             AS GENDER,
  CASE
    WHEN state_rnd <= 32 THEN 'NSW'
    WHEN state_rnd <= 58 THEN 'VIC'
    WHEN state_rnd <= 78 THEN 'QLD'
    WHEN state_rnd <= 88 THEN 'WA'
    WHEN state_rnd <= 95 THEN 'SA'
    WHEN state_rnd <= 97 THEN 'ACT'
    WHEN state_rnd <= 99 THEN 'TAS'
    ELSE 'NT'
  END                                             AS STATE_CODE,
  CASE
    WHEN state_rnd <= 32 THEN 'New South Wales'
    WHEN state_rnd <= 58 THEN 'Victoria'
    WHEN state_rnd <= 78 THEN 'Queensland'
    WHEN state_rnd <= 88 THEN 'Western Australia'
    WHEN state_rnd <= 95 THEN 'South Australia'
    WHEN state_rnd <= 97 THEN 'Australian Capital Territory'
    WHEN state_rnd <= 99 THEN 'Tasmania'
    ELSE 'Northern Territory'
  END                                             AS STATE_NAME,
  (email_rnd <= 72)                               AS HAS_EMAIL,
  (phone_rnd <= 85)                               AS HAS_PHONE,
  signup_date                                     AS SIGNUP_DATE
FROM raw;

-- ── TRANSACTIONS (1,000,000 rows — ~5 per customer avg) ──
CREATE OR REPLACE TABLE TRANSACTIONS AS
WITH cust AS (
  SELECT CUSTOMER_ID, RETAILER
  FROM CUSTOMERS
),
raw AS (
  SELECT
    ROW_NUMBER() OVER (ORDER BY SEQ8())           AS rn,
    UNIFORM(1, 200000, RANDOM())                  AS cust_idx,
    UNIFORM(1, 100, RANDOM())                     AS cat_rnd,
    UNIFORM(1, 100, RANDOM())                     AS chan_rnd,
    DATEADD('day', -UNIFORM(0, 730, RANDOM()), CURRENT_DATE()) AS txn_date
  FROM TABLE(GENERATOR(ROWCOUNT => 1000000))
),
joined AS (
  SELECT
    r.rn,
    c.CUSTOMER_ID,
    c.RETAILER,
    r.txn_date,
    r.cat_rnd,
    r.chan_rnd
  FROM raw r
  JOIN (SELECT CUSTOMER_ID, RETAILER, ROW_NUMBER() OVER (ORDER BY CUSTOMER_ID) AS idx FROM cust) c
    ON c.idx = r.cust_idx
)
SELECT
  'TXN-' || LPAD(rn::STRING, 8, '0')             AS TRANSACTION_ID,
  CUSTOMER_ID,
  RETAILER,
  txn_date                                        AS TRANSACTION_DATE,
  CASE
    WHEN RETAILER = 'Bunnings' THEN
      CASE
        WHEN cat_rnd <= 25 THEN UNIFORM(10, 500, RANDOM())
        WHEN cat_rnd <= 50 THEN UNIFORM(15, 600, RANDOM())
        WHEN cat_rnd <= 60 THEN UNIFORM(20, 300, RANDOM())
        WHEN cat_rnd <= 70 THEN UNIFORM(10, 400, RANDOM())
        WHEN cat_rnd <= 80 THEN UNIFORM(30, 800, RANDOM())
        WHEN cat_rnd <= 90 THEN UNIFORM(50, 1200, RANDOM())
        ELSE UNIFORM(3, 200, RANDOM())
      END
    ELSE
      CASE
        WHEN cat_rnd <= 30 THEN UNIFORM(5, 150, RANDOM())
        WHEN cat_rnd <= 50 THEN UNIFORM(20, 800, RANDOM())
        WHEN cat_rnd <= 65 THEN UNIFORM(10, 300, RANDOM())
        WHEN cat_rnd <= 75 THEN UNIFORM(5, 120, RANDOM())
        WHEN cat_rnd <= 85 THEN UNIFORM(5, 100, RANDOM())
        WHEN cat_rnd <= 95 THEN UNIFORM(3, 80, RANDOM())
        ELSE UNIFORM(10, 200, RANDOM())
      END
  END                                              AS AMOUNT,
  CASE
    WHEN RETAILER = 'Bunnings' THEN
      CASE
        WHEN cat_rnd <= 25 THEN 'Garden'
        WHEN cat_rnd <= 50 THEN 'Tools'
        WHEN cat_rnd <= 60 THEN 'Paint'
        WHEN cat_rnd <= 70 THEN 'Lighting'
        WHEN cat_rnd <= 80 THEN 'Bathroom'
        WHEN cat_rnd <= 90 THEN 'Outdoor Furniture'
        ELSE 'Hardware'
      END
    ELSE
      CASE
        WHEN cat_rnd <= 30 THEN 'Apparel'
        WHEN cat_rnd <= 50 THEN 'Electronics'
        WHEN cat_rnd <= 65 THEN 'Home & Living'
        WHEN cat_rnd <= 75 THEN 'Toys'
        WHEN cat_rnd <= 85 THEN 'Beauty'
        WHEN cat_rnd <= 95 THEN 'Grocery'
        ELSE 'Sports'
      END
  END                                              AS PRODUCT_CATEGORY,
  CASE WHEN chan_rnd <= 65 THEN 'Instore' ELSE 'Online' END AS CHANNEL
FROM joined;

SELECT 'CUSTOMERS' AS tbl, COUNT(*) AS rows FROM CUSTOMERS
UNION ALL
SELECT 'TRANSACTIONS', COUNT(*) FROM TRANSACTIONS;
