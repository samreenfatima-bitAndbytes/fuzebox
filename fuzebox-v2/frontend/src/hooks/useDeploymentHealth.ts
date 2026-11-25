"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEPLOYMENT_HEALTH_POLL_MS,
  type DeploymentHealthPayload,
  fetchDeploymentHealth,
  normalizeHealthUrl,
} from "@/lib/deployment-health";
import {
  ApiError,
  fetchTenantConfig,
  patchDeploymentHealthUrl,
} from "@/lib/api";

export function useDeploymentHealth() {
  const [endpointUrl, setEndpointUrl] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [result, setResult] = useState<DeploymentHealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastPolledAt, setLastPolledAt] = useState<Date | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const urlRef = useRef<string | null>(null);

  const poll = useCallback(async (url: string) => {
    try {
      const data = await fetchDeploymentHealth(url);
      setResult(data);
      setError(null);
      setLastPolledAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Health poll failed");
    }
  }, []);

  const applyEndpoint = useCallback(
    (url: string | null, startPoll: boolean) => {
      const normalized = url?.trim() || null;
      setEndpointUrl(normalized);
      setPolling(Boolean(startPoll && normalized));
      if (!normalized) {
        setResult(null);
        setError(null);
        setLastPolledAt(null);
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetchTenantConfig();
        if (cancelled) return;
        const url = cfg.deploymentHealthUrl?.trim() || null;
        applyEndpoint(url, Boolean(url));
      } catch {
        if (!cancelled) applyEndpoint(null, false);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyEndpoint]);

  useEffect(() => {
    urlRef.current = endpointUrl;
  }, [endpointUrl]);

  useEffect(() => {
    if (!polling || !endpointUrl) return;

    void poll(endpointUrl);
    const id = window.setInterval(() => {
      const url = urlRef.current;
      if (url) void poll(url);
    }, DEPLOYMENT_HEALTH_POLL_MS);

    return () => window.clearInterval(id);
  }, [polling, endpointUrl, poll]);

  const persistEndpoint = useCallback(
    async (url: string | null) => {
      setSaving(true);
      setError(null);
      try {
        const normalized = url ? normalizeHealthUrl(url) : null;
        const saved = await patchDeploymentHealthUrl(normalized);
        const stored = saved.deploymentHealthUrl?.trim() || null;
        applyEndpoint(stored, Boolean(stored));
        if (stored) await poll(stored);
        return stored;
      } catch (err) {
        const msg =
          err instanceof ApiError ? err.message : "Failed to save endpoint";
        setError(msg);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [applyEndpoint, poll],
  );

  const startPolling = useCallback(
    async (url: string) => {
      const normalized = normalizeHealthUrl(url);
      if (!normalized) return;
      await persistEndpoint(normalized);
    },
    [persistEndpoint],
  );

  const clearEndpoint = useCallback(async () => {
    await persistEndpoint(null);
  }, [persistEndpoint]);

  return {
    hydrated,
    endpointUrl,
    polling,
    result,
    error,
    lastPolledAt,
    saving,
    startPolling,
    clearEndpoint,
  };
}
