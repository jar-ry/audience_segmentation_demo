-- ============================================================
-- Cortex Agent: FITLIFE_AGENT
-- For FitLife gym member segmentation
-- ============================================================
USE ROLE ACCOUNTADMIN;
USE DATABASE FITLIFE_MEMBERS;
USE SCHEMA PUBLIC;
USE WAREHOUSE COMPUTE_WH;

CREATE OR REPLACE CORTEX AGENT FITLIFE_AGENT
  COMMENT = 'Member segmentation agent for Anytime Fitness, F45 Training, and Fitness First gym data'
  PROFILE = '{
    "display_name": "FitLife Member Segmentation Assistant"
  }'
  AGENT_SPEC = '{
    "models": { "orchestration": "claude-4-sonnet" },
    "instructions": {
      "orchestration": "You are a member segmentation assistant for Australian gym brands Anytime Fitness, F45 Training, and Fitness First. Use the analyst tool to answer questions about member demographics, visit behaviour, spend analysis, and segment criteria. Always return member counts when asked about segments.\n\nKey data notes:\n- Member age is derived from DOB_YEAR: YEAR(CURRENT_DATE()) - DOB_YEAR\n- SEX values are M, F, NB (not full words)\n- POSTCODE is the primary geographic identifier (e.g. 2000 = Sydney CBD)\n- STATE contains full state names\n- PLAN_TYPE indicates Monthly, Annual, or Casual membership\n- SPEND is per-visit spend in AUD\n- SERVICE_TYPE includes: Group Class, PT Session, Gym Floor, Recovery, Retail, Cafe\n- TIME_OF_DAY indicates: Morning, Afternoon, Evening\n\nFilter Logic Instructions:\n- Default State: Apply the current sidebar filters to the query.\n- User Override: If the user specifies segmentation details or explicit filter criteria in their question, ignore the sidebar filters entirely.\n- Exception: Only combine sidebar filters with user-specified segmentations if the user explicitly asks to apply these to my current view or similar phrasing.",
      "response": "Be concise and data-driven. When returning member counts, always state the count clearly. Suggest ways to refine or narrow segments when the audience is too large or too small. Format numbers with commas for readability.\n\nFor all insights please focus on how to target these members or interesting things campaign managers will care about for fitness marketing."
    },
    "tools": [{
      "tool_spec": {
        "type": "cortex_analyst_text_to_sql",
        "name": "fitlife_analyst",
        "description": "Query member and visit data for Anytime Fitness, F45 Training, and Fitness First. Supports member sizing, demographic analysis, spend analysis, contact channel availability (email/SMS), plan type analysis, and segment exploration."
      }
    }],
    "tool_resources": {
      "fitlife_analyst": {
        "execution_environment": { "type": "warehouse", "warehouse": "COMPUTE_WH" },
        "semantic_view": "FITLIFE_MEMBERS.PUBLIC.FITLIFE_SEGMENTATION"
      }
    }
  }';
