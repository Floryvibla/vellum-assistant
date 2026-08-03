import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  oauthAppsByAppIdConnectionsGetOptions,
  oauthAppsByAppIdConnectionsGetQueryKey,
  useOauthAppsByAppIdConnectPostMutation,
} from "@/generated/daemon/@tanstack/react-query.gen";
import type {
  OauthAppsByAppIdConnectionsGetResponses,
  OauthAppsGetResponses,
} from "@/generated/daemon/types.gen";
import type { OAuthCompletePayload } from "@/lib/auth/oauth-popup";
import { openUrl, openUrlFinishedListener } from "@/runtime/browser";
import { useIsNativePlatform } from "@/runtime/native-auth";
import { toast } from "@vellumai/design-library/components/toast";

type OAuthApp = OauthAppsGetResponses[200]["apps"][number];
type OAuthAppConnection =
  OauthAppsByAppIdConnectionsGetResponses[200]["connections"][number];

interface UseOAuthAppPopupConnectOptions {
  assistantId: string;
  displayName: string;
  providerKey: string;
  appsQueryKey: readonly unknown[];
}

interface PendingConnect {
  appId: string;
  baselineConnectionIds: Set<string>;
}

function isOAuthCompletePayload(value: unknown): value is OAuthCompletePayload {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as OAuthCompletePayload).type === "vellum:oauth-complete"
  );
}

export function useOAuthAppPopupConnect({
  assistantId,
  displayName,
  providerKey,
  appsQueryKey,
}: UseOAuthAppPopupConnectOptions) {
  const queryClient = useQueryClient();
  const isNative = useIsNativePlatform();
  const connectMutation = useOauthAppsByAppIdConnectPostMutation();
  const popupRef = useRef<Window | null>(null);
  const popupCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const popupClosedGraceTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const pendingRef = useRef<PendingConnect | null>(null);
  const [connectingAppId, setConnectingAppId] = useState<string | null>(null);

  const clearPendingState = useCallback(() => {
    pendingRef.current = null;
    setConnectingAppId(null);
  }, []);

  const closePopup = useCallback(() => {
    if (popupCheckIntervalRef.current) {
      clearInterval(popupCheckIntervalRef.current);
      popupCheckIntervalRef.current = null;
    }
    if (popupClosedGraceTimeoutRef.current) {
      clearTimeout(popupClosedGraceTimeoutRef.current);
      popupClosedGraceTimeoutRef.current = null;
    }
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }
    popupRef.current = null;
  }, []);

  const waitForConnection = useCallback(
    async (appId: string, baselineConnectionIds: Set<string>) => {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, 750));
        }
        const connections = await queryClient.fetchQuery({
          ...oauthAppsByAppIdConnectionsGetOptions({
            path: { assistant_id: assistantId, appId },
          }),
          staleTime: 0,
        });
        if (
          connections.connections.some(
            (item) => !baselineConnectionIds.has(item.id),
          )
        ) {
          return true;
        }
      }
      return false;
    },
    [assistantId, queryClient],
  );

  const finishConnect = useCallback(
    async (fallbackMessage: string, forceSuccess = false) => {
      const pending = pendingRef.current;
      if (!pending) {
        return;
      }
      const connected =
        forceSuccess ||
        (await waitForConnection(pending.appId, pending.baselineConnectionIds));
      const connectionQueryKey = oauthAppsByAppIdConnectionsGetQueryKey({
        path: { assistant_id: assistantId, appId: pending.appId },
      });
      closePopup();
      clearPendingState();
      void queryClient.invalidateQueries({ queryKey: connectionQueryKey });
      void queryClient.invalidateQueries({ queryKey: appsQueryKey });
      if (connected) {
        toast.success(`${displayName} account connected.`);
        return;
      }
      toast.error(fallbackMessage);
    },
    [
      appsQueryKey,
      assistantId,
      clearPendingState,
      closePopup,
      displayName,
      queryClient,
      waitForConnection,
    ],
  );

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      if (!pendingRef.current || !isOAuthCompletePayload(event.data)) {
        return;
      }
      if (event.data.oauthProvider !== providerKey) {
        return;
      }
      if (event.data.oauthStatus === "connected") {
        void finishConnect(`${displayName} connection failed.`, true);
        return;
      }
      closePopup();
      clearPendingState();
      toast.error(
        event.data.oauthCode
          ? `${displayName} authorization failed: ${event.data.oauthCode}.`
          : `${displayName} authorization failed.`,
      );
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [clearPendingState, closePopup, displayName, finishConnect, providerKey]);

  useEffect(() => {
    return openUrlFinishedListener(() => {
      if (pendingRef.current) {
        void finishConnect(`${displayName} connection failed: browser closed.`);
      }
    });
  }, [displayName, finishConnect]);

  useEffect(() => () => closePopup(), [closePopup]);

  const handleConnect = useCallback(
    (app: OAuthApp, connections: OAuthAppConnection[]) => {
      const popup = isNative
        ? null
        : window.open("", "_blank", "width=500,height=600");
      if (!isNative && popup === null) {
        toast.error("Popup blocked. Please enable popups and try again.");
        return;
      }
      popupRef.current = popup;
      pendingRef.current = {
        appId: app.id,
        baselineConnectionIds: new Set(connections.map((item) => item.id)),
      };
      setConnectingAppId(app.id);
      if (popup) {
        popupCheckIntervalRef.current = setInterval(() => {
          if (
            popupRef.current?.closed &&
            pendingRef.current &&
            !popupClosedGraceTimeoutRef.current
          ) {
            popupClosedGraceTimeoutRef.current = setTimeout(() => {
              popupClosedGraceTimeoutRef.current = null;
              void finishConnect(
                `${displayName} connection failed: authorization popup closed.`,
              );
            }, 1000);
          }
        }, 100);
      }
      connectMutation.mutate(
        {
          path: { assistant_id: assistantId, appId: app.id },
          body: { callback_transport: "gateway", scopes: [] },
        },
        {
          onSuccess: (data) => {
            if (!("auth_url" in data)) {
              void finishConnect(`${displayName} connection failed.`);
              return;
            }
            if (isNative) {
              void openUrl(data.auth_url);
              return;
            }
            if (popupRef.current && !popupRef.current.closed) {
              popupRef.current.location.href = data.auth_url;
              return;
            }
            void finishConnect(
              `${displayName} connection failed: popup closed.`,
            );
          },
          onError: (error) => {
            closePopup();
            clearPendingState();
            toast.error(error.message || "Failed to start OAuth flow");
          },
        },
      );
    },
    [
      assistantId,
      clearPendingState,
      closePopup,
      connectMutation,
      displayName,
      finishConnect,
      isNative,
    ],
  );

  return { connectingAppId, handleConnect };
}
