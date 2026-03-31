-- ============================================================
-- Semantic View: AUDIENCE_SEGMENTATION
-- Already deployed — reference only
-- ============================================================
USE ROLE ACCOUNTADMIN;
USE DATABASE ONEDATA_AUDIENCE;
USE SCHEMA PUBLIC;
USE WAREHOUSE COMPUTE_WH;

CREATE OR REPLACE SEMANTIC VIEW AUDIENCE_SEGMENTATION
  TABLES (
    ONEDATA_AUDIENCE.PUBLIC.CUSTOMERS UNIQUE (CUSTOMER_ID)
      COMMENT = 'Retail customers across Kmart and Bunnings (100k per retailer, 200k total).',
    ONEDATA_AUDIENCE.PUBLIC.TRANSACTIONS UNIQUE (TRANSACTION_ID)
      COMMENT = 'Customer purchase transactions across Kmart and Bunnings over the last 2 years.'
  )
  RELATIONSHIPS (
    CUSTOMER_TRANSACTIONS AS TRANSACTIONS(TXN_CUSTOMER_ID) REFERENCES CUSTOMERS(CUSTOMER_ID)
  )
  FACTS (
    CUSTOMERS.AGE AS AGE COMMENT = 'Customer age in years',
    TRANSACTIONS.AMOUNT AS AMOUNT COMMENT = 'Transaction amount in AUD'
  )
  DIMENSIONS (
    CUSTOMERS.CUSTOMER_ID AS CUSTOMER_ID COMMENT = 'Unique customer identifier',
    CUSTOMERS.RETAILER AS RETAILER COMMENT = 'The retail brand this customer belongs to',
    CUSTOMERS.GENDER AS GENDER COMMENT = 'Customer gender',
    CUSTOMERS.STATE_CODE AS STATE_CODE COMMENT = 'Australian state abbreviation',
    CUSTOMERS.STATE_NAME AS STATE_NAME COMMENT = 'Full Australian state name',
    CUSTOMERS.HAS_EMAIL AS HAS_EMAIL COMMENT = 'Whether the customer has an email address on file',
    CUSTOMERS.HAS_PHONE AS HAS_PHONE COMMENT = 'Whether the customer has a phone number on file',
    CUSTOMERS.SIGNUP_DATE AS SIGNUP_DATE COMMENT = 'Date the customer first signed up',
    TRANSACTIONS.TRANSACTION_ID AS TRANSACTION_ID COMMENT = 'Unique transaction identifier',
    TRANSACTIONS.TXN_CUSTOMER_ID AS CUSTOMER_ID COMMENT = 'Customer who made the transaction',
    TRANSACTIONS.TXN_RETAILER AS RETAILER COMMENT = 'Retailer where the transaction occurred',
    TRANSACTIONS.PURCHASE_CHANNEL AS CHANNEL COMMENT = 'Whether the purchase was instore or online',
    TRANSACTIONS.TRANSACTION_DATE AS TRANSACTION_DATE COMMENT = 'Date the transaction occurred'
  )
  METRICS (
    CUSTOMERS.TOTAL_CUSTOMERS AS COUNT(CUSTOMER_ID) COMMENT = 'Total number of customers',
    CUSTOMERS.CUSTOMERS_WITH_EMAIL AS COUNT_IF(HAS_EMAIL) COMMENT = 'Number of customers with email',
    CUSTOMERS.CUSTOMERS_WITH_PHONE AS COUNT_IF(HAS_PHONE) COMMENT = 'Number of customers with phone',
    CUSTOMERS.AVERAGE_AGE AS AVG(AGE) COMMENT = 'Average customer age',
    TRANSACTIONS.TOTAL_REVENUE AS SUM(AMOUNT) COMMENT = 'Sum of all transaction amounts in AUD',
    TRANSACTIONS.TOTAL_TRANSACTIONS AS COUNT(TRANSACTION_ID) COMMENT = 'Total number of transactions',
    TRANSACTIONS.AVERAGE_TRANSACTION_VALUE AS AVG(AMOUNT) COMMENT = 'Average transaction amount in AUD',
    TRANSACTIONS.UNIQUE_CUSTOMERS_TRANSACTING AS COUNT(DISTINCT CUSTOMER_ID) COMMENT = 'Count of distinct transacting customers'
  )
  COMMENT = 'Semantic model for audience segmentation across Kmart and Bunnings retail customers.';
