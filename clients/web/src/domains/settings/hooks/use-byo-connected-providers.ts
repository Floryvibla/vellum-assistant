import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

import {
  oauthAppsByAppIdConnectionsGetOptions,
  oauthAppsGetOptions,
} from "@/generated/daemon/@tanstack/react-query.gen";
import type { OauthAppsGetResponses } from "@/generated/daemon/types.gen";

type OAuthApp = OauthAppsGetResponses[200]["apps"][number];

export function useByoConnectedProviders(
  assistantId: string,
  providerKeys: string[],
  enabled: boolean,
) {
  const appQueries = useQueries({
    queries: enabled
      ? providerKeys.map((providerKey) => ({
          ...oauthAppsGetOptions({
            path: { assistant_id: assistantId },
            query: { provider_key: providerKey },
          }),
          select: (data: OauthAppsGetResponses[200]) => data.apps,
        }))
      : [],
  });

  const apps = useMemo(
    () => appQueries.flatMap((query) => query.data ?? []) as OAuthApp[],
    [appQueries],
  );

  const connectionQueries = useQueries({
    queries: enabled
      ? apps.map((app) => ({
          ...oauthAppsByAppIdConnectionsGetOptions({
            path: { assistant_id: assistantId, appId: app.id },
          }),
          select: (data: { connections: unknown[] }) =>
            data.connections.length > 0 ? app.provider_key : null,
        }))
      : [],
  });

  const connectedProviders = useMemo(
    () =>
      new Set(
        connectionQueries.flatMap((query) => (query.data ? [query.data] : [])),
      ),
    [connectionQueries],
  );

  const isLoading =
    enabled &&
    (appQueries.some((query) => query.isLoading) ||
      connectionQueries.some((query) => query.isLoading));

  return { connectedProviders, isLoading };
}
