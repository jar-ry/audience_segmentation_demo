-- ============================================================
-- FitLife Members — Mock Data Generator
-- Run once to create MEMBERS (150k) and VISITS (800k)
-- ============================================================

USE ROLE ACCOUNTADMIN;
CREATE DATABASE IF NOT EXISTS FITLIFE_MEMBERS;
USE DATABASE FITLIFE_MEMBERS;
USE SCHEMA PUBLIC;
USE WAREHOUSE COMPUTE_WH;

-- ── MEMBERS (150,000 rows: 50k Anytime Fitness + 50k F45 Training + 50k Fitness First) ──
CREATE OR REPLACE TABLE MEMBERS AS
WITH raw AS (
  SELECT
    ROW_NUMBER() OVER (ORDER BY SEQ8()) AS rn,
    UNIFORM(1945, 2006, RANDOM())       AS dob_year,
    UNIFORM(1, 100, RANDOM())           AS sex_rnd,
    UNIFORM(1, 100, RANDOM())           AS state_rnd,
    UNIFORM(1, 100, RANDOM())           AS email_rnd,
    UNIFORM(1, 100, RANDOM())           AS sms_rnd,
    UNIFORM(1, 100, RANDOM())           AS plan_rnd,
    DATEADD('day', -UNIFORM(0, 1825, RANDOM()), CURRENT_DATE()) AS membership_start
  FROM TABLE(GENERATOR(ROWCOUNT => 150000))
)
SELECT
  'MBR-' || LPAD(rn::STRING, 7, '0')           AS MEMBER_ID,
  CASE
    WHEN rn <= 50000  THEN 'Anytime Fitness'
    WHEN rn <= 100000 THEN 'F45 Training'
    ELSE 'Fitness First'
  END                                            AS BRAND,
  dob_year                                       AS DOB_YEAR,
  CASE
    WHEN sex_rnd <= 48 THEN 'F'
    WHEN sex_rnd <= 94 THEN 'M'
    ELSE 'NB'
  END                                            AS SEX,
  CASE
    WHEN state_rnd <= 32 THEN '2000'
    WHEN state_rnd <= 58 THEN '3000'
    WHEN state_rnd <= 78 THEN '4000'
    WHEN state_rnd <= 88 THEN '6000'
    WHEN state_rnd <= 95 THEN '5000'
    WHEN state_rnd <= 97 THEN '2600'
    WHEN state_rnd <= 99 THEN '7000'
    ELSE '0800'
  END                                            AS POSTCODE,
  CASE
    WHEN state_rnd <= 32 THEN 'New South Wales'
    WHEN state_rnd <= 58 THEN 'Victoria'
    WHEN state_rnd <= 78 THEN 'Queensland'
    WHEN state_rnd <= 88 THEN 'Western Australia'
    WHEN state_rnd <= 95 THEN 'South Australia'
    WHEN state_rnd <= 97 THEN 'Australian Capital Territory'
    WHEN state_rnd <= 99 THEN 'Tasmania'
    ELSE 'Northern Territory'
  END                                            AS STATE,
  (email_rnd <= 68)                              AS EMAIL_OPTED_IN,
  (sms_rnd <= 55)                                AS SMS_OPTED_IN,
  membership_start                               AS MEMBERSHIP_START,
  CASE
    WHEN plan_rnd <= 55 THEN 'Monthly'
    WHEN plan_rnd <= 85 THEN 'Annual'
    ELSE 'Casual'
  END                                            AS PLAN_TYPE
FROM raw;

-- ── VISITS (800,000 rows — ~5.3 per member avg) ──
CREATE OR REPLACE TABLE VISITS AS
WITH mbr AS (
  SELECT MEMBER_ID, BRAND
  FROM MEMBERS
),
raw AS (
  SELECT
    ROW_NUMBER() OVER (ORDER BY SEQ8())           AS rn,
    UNIFORM(1, 150000, RANDOM())                   AS mbr_idx,
    UNIFORM(1, 100, RANDOM())                      AS svc_rnd,
    UNIFORM(1, 100, RANDOM())                      AS tod_rnd,
    DATEADD('day', -UNIFORM(0, 730, RANDOM()), CURRENT_DATE()) AS visit_date
  FROM TABLE(GENERATOR(ROWCOUNT => 800000))
),
joined AS (
  SELECT
    r.rn,
    m.MEMBER_ID,
    m.BRAND,
    r.visit_date,
    r.svc_rnd,
    r.tod_rnd
  FROM raw r
  JOIN (SELECT MEMBER_ID, BRAND, ROW_NUMBER() OVER (ORDER BY MEMBER_ID) AS idx FROM mbr) m
    ON m.idx = r.mbr_idx
)
SELECT
  'VIS-' || LPAD(rn::STRING, 8, '0')             AS VISIT_ID,
  MEMBER_ID,
  BRAND,
  visit_date                                      AS VISIT_DATE,
  CASE
    WHEN BRAND = 'F45 Training' THEN
      CASE
        WHEN svc_rnd <= 50 THEN UNIFORM(25, 60, RANDOM())
        WHEN svc_rnd <= 70 THEN UNIFORM(50, 120, RANDOM())
        WHEN svc_rnd <= 85 THEN UNIFORM(5, 30, RANDOM())
        WHEN svc_rnd <= 92 THEN UNIFORM(30, 80, RANDOM())
        WHEN svc_rnd <= 97 THEN UNIFORM(10, 60, RANDOM())
        ELSE UNIFORM(5, 25, RANDOM())
      END
    WHEN BRAND = 'Fitness First' THEN
      CASE
        WHEN svc_rnd <= 30 THEN UNIFORM(0, 15, RANDOM())
        WHEN svc_rnd <= 50 THEN UNIFORM(40, 150, RANDOM())
        WHEN svc_rnd <= 70 THEN UNIFORM(20, 80, RANDOM())
        WHEN svc_rnd <= 82 THEN UNIFORM(30, 100, RANDOM())
        WHEN svc_rnd <= 92 THEN UNIFORM(15, 50, RANDOM())
        ELSE UNIFORM(5, 20, RANDOM())
      END
    ELSE -- Anytime Fitness
      CASE
        WHEN svc_rnd <= 40 THEN UNIFORM(0, 10, RANDOM())
        WHEN svc_rnd <= 55 THEN UNIFORM(30, 100, RANDOM())
        WHEN svc_rnd <= 70 THEN UNIFORM(20, 60, RANDOM())
        WHEN svc_rnd <= 82 THEN UNIFORM(25, 70, RANDOM())
        WHEN svc_rnd <= 92 THEN UNIFORM(10, 40, RANDOM())
        ELSE UNIFORM(5, 15, RANDOM())
      END
  END                                              AS SPEND,
  CASE
    WHEN BRAND = 'F45 Training' THEN
      CASE
        WHEN svc_rnd <= 50 THEN 'Group Class'
        WHEN svc_rnd <= 70 THEN 'PT Session'
        WHEN svc_rnd <= 85 THEN 'Gym Floor'
        WHEN svc_rnd <= 92 THEN 'Recovery'
        WHEN svc_rnd <= 97 THEN 'Retail'
        ELSE 'Cafe'
      END
    WHEN BRAND = 'Fitness First' THEN
      CASE
        WHEN svc_rnd <= 30 THEN 'Gym Floor'
        WHEN svc_rnd <= 50 THEN 'PT Session'
        WHEN svc_rnd <= 70 THEN 'Group Class'
        WHEN svc_rnd <= 82 THEN 'Recovery'
        WHEN svc_rnd <= 92 THEN 'Retail'
        ELSE 'Cafe'
      END
    ELSE -- Anytime Fitness
      CASE
        WHEN svc_rnd <= 40 THEN 'Gym Floor'
        WHEN svc_rnd <= 55 THEN 'PT Session'
        WHEN svc_rnd <= 70 THEN 'Group Class'
        WHEN svc_rnd <= 82 THEN 'Recovery'
        WHEN svc_rnd <= 92 THEN 'Retail'
        ELSE 'Cafe'
      END
  END                                              AS SERVICE_TYPE,
  CASE
    WHEN tod_rnd <= 40 THEN 'Morning'
    WHEN tod_rnd <= 75 THEN 'Afternoon'
    ELSE 'Evening'
  END                                              AS TIME_OF_DAY
FROM joined;

SELECT 'MEMBERS' AS tbl, COUNT(*) AS rows FROM MEMBERS
UNION ALL
SELECT 'VISITS', COUNT(*) FROM VISITS;
