-- ============================================================
-- Cortex Agent: AUDIENCE_AGENT
-- Already deployed — reference only
-- ============================================================
USE ROLE ACCOUNTADMIN;
USE DATABASE ONEDATA_AUDIENCE;
USE SCHEMA PUBLIC;
USE WAREHOUSE COMPUTE_WH;

CREATE OR REPLACE CORTEX AGENT AUDIENCE_AGENT
  COMMENT = 'Audience segmentation agent for Kmart and Bunnings customer data'
  PROFILE = '{
    "display_name": "Audience Segmentation Assistant"
  }'
  AGENT_SPEC = '{
    "models": { "orchestration": "claude-4-sonnet" },
    "instructions": {
      "orchestration": "You are an audience segmentation assistant for Australian retail brands Kmart and Bunnings. Use the analyst tool to answer questions about customer demographics, transaction behaviour, audience sizing, and segment criteria. Always return audience counts when asked about segments.\n\nFilter Logic Instructions:\n- Default State: Apply the current sidebar filters to the query.\n- User Override: If the user specifies segmentation details or explicit filter criteria in their question, ignore the sidebar filters entirely.\n- Exception: Only combine sidebar filters with user-specified segmentations if the user explicitly asks to apply these to my current view or similar phrasing.",
      "response": "Be concise and data-driven. When returning audience sizes, always state the count clearly. Suggest ways to refine or narrow segments when the audience is too large or too small. Format numbers with commas for readability.\n\nFor all insights please focus on how to target these people or interesting things campaign managers will care about."
    },
    "tools": [{
      "tool_spec": {
        "type": "cortex_analyst_text_to_sql",
        "name": "audience_analyst",
        "description": "Query customer and transaction data for Kmart and Bunnings. Supports audience sizing, demographic analysis, spend analysis, channel availability (email/phone), and segment exploration."
      }
    }],
    "tool_resources": {
      "audience_analyst": {
        "execution_environment": { "type": "warehouse", "warehouse": "COMPUTE_WH" },
        "semantic_view": "ONEDATA_AUDIENCE.PUBLIC.AUDIENCE_SEGMENTATION"
      }
    }
  }';
