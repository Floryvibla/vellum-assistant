import { afterEach, describe, expect, mock, test } from "bun:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";

const integrationRowMock = mock((props: Record<string, unknown>) => (
  <div>{JSON.stringify(props)}</div>
));

mock.module("@/assistant/api", () => ({
  getAssistant: mock(async () => ({
    ok: true,
    data: { id: "assistant-123" },
  })),
}));

mock.module("@/generated/daemon/@tanstack/react-query.gen", () => ({
  oauthProvidersGetOptions: () => ({
    queryKey: ["oauth-providers"],
    queryFn: async () => ({
      providers: [
        {
          provider_key: "notion",
          display_name: "Notion",
          description: "Pages and databases",
          logo_url: null,
          supports_managed_mode: true,
        },
      ],
    }),
  }),
}));

mock.module("@/generated/api/@tanstack/react-query.gen", () => ({
  assistantsOauthConnectionsListOptions: () => ({
    queryKey: ["oauth-connections"],
    queryFn: async () => [],
  }),
}));

mock.module("@/hooks/use-platform-assistant-id", () => ({
  usePlatformAssistantId: () => ({
    platformAssistantId: "platform-assistant-123",
    isLoading: false,
  }),
}));

mock.module("@/hooks/use-platform-gate", () => ({
  usePlatformGate: () => "full",
  useActiveAssistantIsPlatformHosted: () => false,
}));

mock.module("@/lib/sentry/capture-error", () => ({
  captureError: () => {},
}));

mock.module("@/domains/settings/hooks/use-byo-connected-providers", () => ({
  useByoConnectedProviders: () => ({
    connectedProviders: new Set(["notion"]),
    isLoading: false,
  }),
}));

mock.module("@/domains/settings/components/integration-detail-modal", () => ({
  IntegrationDetailModal: () => null,
}));

mock.module("@/domains/settings/components/integration-row", () => ({
  IntegrationRow: integrationRowMock,
}));

mock.module("@/domains/settings/mcp/mcp-page", () => ({
  McpPage: () => <div>MCP tab content</div>,
}));

const { IntegrationsPage } = await import("./integrations-page");

function Wrapper({
  children,
  initialEntry = "/assistant/settings/integrations",
}: {
  children: ReactNode;
  initialEntry?: string;
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  integrationRowMock.mockClear();
});

describe("IntegrationsPage", () => {
  test("renders OAuth and MCP tabs", () => {
    render(<IntegrationsPage />, {
      wrapper: ({ children }) => (
        <Wrapper initialEntry="/assistant/settings/integrations?tab=mcp">
          {children}
        </Wrapper>
      ),
    });

    expect(screen.getByRole("tab", { name: "OAuth" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "MCP" })).not.toBeNull();
  });

  test("opens the MCP tab from the tab query parameter", () => {
    render(<IntegrationsPage />, {
      wrapper: ({ children }) => (
        <Wrapper initialEntry="/assistant/settings/integrations?tab=mcp">
          {children}
        </Wrapper>
      ),
    });

    expect(screen.getByText("MCP tab content")).not.toBeNull();
  });

  test("passes your-own connection state to the integration row", async () => {
    render(<IntegrationsPage />, {
      wrapper: ({ children }) => <Wrapper>{children}</Wrapper>,
    });

    const notionRow = await screen.findByText((content) =>
      content.includes('"providerKey":"notion"'),
    );
    expect(notionRow.textContent).toContain('"connectionKind":"your-own"');
    expect(notionRow.textContent).toContain('"connected":true');
  });
});
