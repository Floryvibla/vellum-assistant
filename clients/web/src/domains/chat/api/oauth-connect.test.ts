import { beforeEach, describe, expect, mock, test } from "bun:test";

const connectManagedOAuthProviderMock = mock(async () => ({
  status: "error" as const,
  message: "managed",
}));
let statusData: unknown = {};
let lookupData: unknown = {};

const daemonGetMock = mock(async ({ url }: { url: string }) => {
  if (url.includes("/oauth/status")) {
    return { data: statusData, error: null };
  }
  if (url.includes("/oauth/apps/lookup")) {
    return { data: lookupData, error: null };
  }
  return { data: {}, error: null };
});

mock.module("@/generated/daemon/client.gen", () => ({
  client: { get: daemonGetMock },
}));
mock.module("./managed-oauth", () => ({
  fetchManagedOAuthProvider: mock(async () => null),
  connectManagedOAuthProvider: connectManagedOAuthProviderMock,
}));

const { defaultOAuthConnectClient } = await import("./oauth-connect");

beforeEach(() => {
  daemonGetMock.mockClear();
  connectManagedOAuthProviderMock.mockClear();
  statusData = {};
  lookupData = {};
  connectManagedOAuthProviderMock.mockResolvedValue({
    status: "error",
    message: "managed",
  });
});

describe("defaultOAuthConnectClient", () => {
  test("treats an active BYO connection as already connected", async () => {
    statusData = {
      mode: "byo",
      connections: [{ id: "conn-1", account: "alice@example.com" }],
    };
    const result = await defaultOAuthConnectClient.connect({
      assistantId: "assistant-1",
      providerKey: "notion",
      providerLabel: "Notion",
    });
    expect(result).toEqual({
      status: "connected",
      connection: {
        id: "conn-1",
        provider: "notion",
        status: "ACTIVE",
        connected: true,
        account_label: "alice@example.com",
        scopes_granted: [],
        expires_at: null,
      },
    });
    expect(connectManagedOAuthProviderMock).not.toHaveBeenCalled();
  });

  test("does not start managed OAuth when a BYO app exists", async () => {
    lookupData = { app: { id: "app-1" } };
    const result = await defaultOAuthConnectClient.connect({
      assistantId: "assistant-1",
      providerKey: "notion",
      providerLabel: "Notion",
    });
    expect(result).toEqual({
      status: "error",
      message:
        "Notion uses Your Own OAuth. Manage this connection in Settings > Integrations.",
    });
    expect(connectManagedOAuthProviderMock).not.toHaveBeenCalled();
  });
});
