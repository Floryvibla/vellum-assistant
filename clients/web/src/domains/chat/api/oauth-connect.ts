import type { OAuthConnection } from "@/generated/api/types.gen";
import { client as daemonClient } from "@/generated/daemon/client.gen";

import {
  connectManagedOAuthProvider,
  fetchManagedOAuthProvider,
  type ManagedOAuthConnectClient,
  type ManagedOAuthConnectOptions,
  type ManagedOAuthConnectResult,
} from "./managed-oauth";

interface OAuthStatusConnection {
  id: string;
  account?: string | null;
  grantedScopes?: string[];
}

interface OAuthStatusResponse {
  connections?: OAuthStatusConnection[];
}

function normalizeConnection(
  providerKey: string,
  connection: OAuthStatusConnection,
): OAuthConnection {
  return {
    id: connection.id,
    provider: providerKey as OAuthConnection["provider"],
    status: "ACTIVE",
    connected: true,
    account_label: connection.account ?? null,
    scopes_granted: connection.grantedScopes ?? [],
    expires_at: null,
  };
}

async function fetchOAuthStatus(
  assistantId: string,
  providerKey: string,
): Promise<OAuthStatusResponse | null> {
  const { data, error } = await daemonClient.get<
    { 200: OAuthStatusResponse },
    unknown,
    false
  >({
    url: "/v1/assistants/{assistant_id}/oauth/status",
    path: { assistant_id: assistantId },
    query: { provider: providerKey },
    throwOnError: false,
  });
  return error ? null : ((data as OAuthStatusResponse | undefined) ?? null);
}

async function hasByoApp(
  assistantId: string,
  providerKey: string,
): Promise<boolean> {
  const { data, error } = await daemonClient.get<
    { 200: { app: { id?: string } } },
    unknown,
    false
  >({
    url: "/v1/assistants/{assistant_id}/oauth/apps/lookup",
    path: { assistant_id: assistantId },
    query: { provider: providerKey },
    throwOnError: false,
  });
  return !error && !!(data as { app?: { id?: string } } | undefined)?.app?.id;
}

async function connectOAuthProvider(
  options: ManagedOAuthConnectOptions,
): Promise<ManagedOAuthConnectResult> {
  const status = await fetchOAuthStatus(options.assistantId, options.providerKey);
  const connected = status?.connections?.[0];
  if (connected) {
    return {
      status: "connected",
      connection: normalizeConnection(options.providerKey, connected),
    };
  }
  if (await hasByoApp(options.assistantId, options.providerKey)) {
    return {
      status: "error",
      message: `${options.providerLabel} uses Your Own OAuth. Manage this connection in Settings > Integrations.`,
    };
  }
  return connectManagedOAuthProvider(options);
}

export const defaultOAuthConnectClient: ManagedOAuthConnectClient = {
  fetchProvider: fetchManagedOAuthProvider,
  connect: connectOAuthProvider,
};
