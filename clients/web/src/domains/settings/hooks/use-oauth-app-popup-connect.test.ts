import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test } from "bun:test";

interface MockConnectionQueryResult {
  connections: Array<{ id: string }>;
}

const connectMutate = mock(
  (_vars: unknown, handlers?: { onSuccess?: (data: unknown) => void }) => {
    handlers?.onSuccess?.({
      auth_url: "https://provider.example.com/oauth/start",
      state: "state-1",
    });
  },
);
mock.module("@/generated/daemon/@tanstack/react-query.gen", () => ({
  oauthAppsByAppIdConnectionsGetOptions: (opts: unknown) => ({
    queryKey: ["oauth-app-connections", opts],
    queryFn: async () => ({ connections: [] }),
  }),
  oauthAppsByAppIdConnectionsGetQueryKey: (opts: unknown) => [
    "oauth-app-connections",
    opts,
  ],
  useOauthAppsByAppIdConnectPostMutation: () => ({ mutate: connectMutate }),
}));

const fetchQuery = mock(
  async (): Promise<MockConnectionQueryResult> => ({ connections: [] }),
);
const invalidateQueries = mock(async () => {});
mock.module("@tanstack/react-query", () => ({
  useQueryClient: () => ({ fetchQuery, invalidateQueries }),
}));
mock.module("@/runtime/native-auth", () => ({
  useIsNativePlatform: () => false,
}));
mock.module("@/runtime/browser", () => ({
  openUrl: async () => {},
  openUrlFinishedListener: () => () => {},
}));

const { useOAuthAppPopupConnect } =
  await import("./use-oauth-app-popup-connect");

let popupStub: {
  closed: boolean;
  close: () => void;
  location: { href: string };
};

beforeEach(() => {
  connectMutate.mockClear();
  fetchQuery.mockClear();
  invalidateQueries.mockClear();
  popupStub = {
    closed: false,
    close: () => {
      popupStub.closed = true;
    },
    location: { href: "" },
  };
  window.open = (() => popupStub) as unknown as typeof window.open;
});

describe("useOAuthAppPopupConnect", () => {
  test("routes the OAuth auth_url into a popup window", async () => {
    const { result } = renderHook(() =>
      useOAuthAppPopupConnect({
        assistantId: "assistant-1",
        displayName: "Notion",
        providerKey: "notion",
        appsQueryKey: ["oauth-apps"],
      }),
    );

    act(() => {
      result.current.handleConnect({ id: "app-1" } as never, []);
    });

    await waitFor(() => expect(connectMutate).toHaveBeenCalledTimes(1));
    expect(popupStub.location.href).toBe(
      "https://provider.example.com/oauth/start",
    );
    expect(result.current.connectingAppId).toBe("app-1");
  });

  test("closes the popup after polling detects the new connection", async () => {
    fetchQuery.mockImplementationOnce(async () => ({
      connections: [{ id: "conn-1" }],
    }));

    const { result } = renderHook(() =>
      useOAuthAppPopupConnect({
        assistantId: "assistant-1",
        displayName: "Notion",
        providerKey: "notion",
        appsQueryKey: ["oauth-apps"],
      }),
    );

    act(() => {
      result.current.handleConnect({ id: "app-1" } as never, []);
    });

    await waitFor(() => expect(popupStub.closed).toBe(true), {
      timeout: 2000,
    });
    expect(result.current.connectingAppId).toBeNull();
  });
});
