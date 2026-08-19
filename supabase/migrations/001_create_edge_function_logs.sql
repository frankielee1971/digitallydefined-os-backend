-- Supabase Edge Functions for DigitallyDefined Backend
-- Migration from Vercel Serverless Functions

-- Create functions table for logging
CREATE TABLE IF NOT EXISTS public.edge_function_logs (
  id BIGSERIAL PRIMARY KEY,
  function_name TEXT NOT NULL,
  request_id TEXT,
  status INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_edge_function_logs_function_name ON public.edge_function_logs(function_name);
CREATE INDEX IF NOT EXISTS idx_edge_function_logs_created_at ON public.edge_function_logs(created_at);

-- Enable RLS
ALTER TABLE public.edge_function_logs ENABLE ROW LEVEL SECURITY;

-- Allow service role to insert logs
CREATE POLICY "Allow service role inserts" ON public.edge_function_logs
  FOR INSERT TO service_role WITH CHECK (true);
