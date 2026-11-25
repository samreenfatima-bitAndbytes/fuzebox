-- Add webhook callback fields to agent_deployments
-- Fires a POST to webhookUrl after every successful agent deployment (fire-and-forget)
ALTER TABLE agent_deployments ADD COLUMN IF NOT EXISTS webhook_url TEXT;
ALTER TABLE agent_deployments ADD COLUMN IF NOT EXISTS webhook_secret TEXT;
