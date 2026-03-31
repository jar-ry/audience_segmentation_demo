-- ============================================================
-- Semantic View: FITLIFE_SEGMENTATION
-- For FitLife gym member and visit data
-- ============================================================
USE ROLE ACCOUNTADMIN;
USE DATABASE FITLIFE_MEMBERS;
USE SCHEMA PUBLIC;
USE WAREHOUSE COMPUTE_WH;

CREATE OR REPLACE SEMANTIC VIEW FITLIFE_SEGMENTATION
  TABLES (
    FITLIFE_MEMBERS.PUBLIC.MEMBERS UNIQUE (MEMBER_ID)
      COMMENT = 'Gym members across Anytime Fitness, F45 Training, and Fitness First (50k per brand, 150k total).',
    FITLIFE_MEMBERS.PUBLIC.VISITS UNIQUE (VISIT_ID)
      COMMENT = 'Member gym visits and spend across all three brands over the last 2 years.'
  )
  RELATIONSHIPS (
    MEMBER_VISITS AS VISITS(MEMBER_ID) REFERENCES MEMBERS(MEMBER_ID)
  )
  FACTS (
    MEMBERS.DOB_YEAR AS DOB_YEAR COMMENT = 'Member birth year (use YEAR(CURRENT_DATE()) - DOB_YEAR for approximate age)',
    VISITS.SPEND AS SPEND COMMENT = 'Amount spent during the visit in AUD'
  )
  DIMENSIONS (
    MEMBERS.MEMBER_ID AS MEMBER_ID COMMENT = 'Unique member identifier',
    MEMBERS.BRAND AS BRAND COMMENT = 'The gym brand this member belongs to (Anytime Fitness, F45 Training, or Fitness First)',
    MEMBERS.SEX AS SEX COMMENT = 'Member sex (M, F, or NB)',
    MEMBERS.POSTCODE AS POSTCODE COMMENT = 'Australian postcode (e.g. 2000 for Sydney CBD, 3000 for Melbourne CBD)',
    MEMBERS.STATE AS STATE COMMENT = 'Full Australian state name',
    MEMBERS.EMAIL_OPTED_IN AS EMAIL_OPTED_IN COMMENT = 'Whether the member has opted in to email communications',
    MEMBERS.SMS_OPTED_IN AS SMS_OPTED_IN COMMENT = 'Whether the member has opted in to SMS communications',
    MEMBERS.MEMBERSHIP_START AS MEMBERSHIP_START COMMENT = 'Date the member first joined',
    MEMBERS.PLAN_TYPE AS PLAN_TYPE COMMENT = 'Membership plan type: Monthly, Annual, or Casual',
    VISITS.VISIT_ID AS VISIT_ID COMMENT = 'Unique visit identifier',
    VISITS.MEMBER_ID AS VISIT_MEMBER_ID COMMENT = 'Member who made the visit',
    VISITS.BRAND AS VISIT_BRAND COMMENT = 'Brand where the visit occurred',
    VISITS.SERVICE_TYPE AS SERVICE_TYPE COMMENT = 'Type of service used: Group Class, PT Session, Gym Floor, Recovery, Retail, or Cafe',
    VISITS.TIME_OF_DAY AS TIME_OF_DAY COMMENT = 'When the visit occurred: Morning, Afternoon, or Evening',
    VISITS.VISIT_DATE AS VISIT_DATE COMMENT = 'Date the visit occurred'
  )
  METRICS (
    MEMBERS.TOTAL_MEMBERS AS COUNT(MEMBER_ID) COMMENT = 'Total number of members',
    MEMBERS.MEMBERS_WITH_EMAIL AS COUNT_IF(EMAIL_OPTED_IN) COMMENT = 'Number of members opted in to email',
    MEMBERS.MEMBERS_WITH_SMS AS COUNT_IF(SMS_OPTED_IN) COMMENT = 'Number of members opted in to SMS',
    MEMBERS.AVERAGE_MEMBER_AGE AS AVG(YEAR(CURRENT_DATE()) - DOB_YEAR) COMMENT = 'Average approximate member age',
    VISITS.TOTAL_REVENUE AS SUM(SPEND) COMMENT = 'Sum of all visit spend in AUD',
    VISITS.TOTAL_VISITS AS COUNT(VISIT_ID) COMMENT = 'Total number of visits',
    VISITS.AVERAGE_VISIT_SPEND AS AVG(SPEND) COMMENT = 'Average spend per visit in AUD',
    VISITS.UNIQUE_MEMBERS_VISITING AS COUNT(DISTINCT MEMBER_ID) COMMENT = 'Count of distinct members with visits'
  )
  COMMENT = 'Semantic model for member segmentation across Anytime Fitness, F45 Training, and Fitness First gym brands.';
