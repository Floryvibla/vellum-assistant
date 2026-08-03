import {
  getConfig,
  loadRawConfig,
  saveRawConfig,
  setNestedValue,
} from "../config/loader.js";
import {
  getServiceMode,
  type Services,
  ServicesSchema,
} from "../config/schemas/services.js";
import { getProvider } from "./oauth-store.js";

export function getManagedServiceConfigKey(provider: string): string | null {
  const providerRow = getProvider(provider);
  const managedKey = providerRow?.managedServiceConfigKey;
  if (!managedKey || !(managedKey in ServicesSchema.shape)) {
    return null;
  }
  return managedKey;
}

export function getOAuthProviderMode(provider: string): "managed" | "your-own" {
  const managedKey = getManagedServiceConfigKey(provider);
  if (!managedKey) {
    return "your-own";
  }
  try {
    const services: Services = getConfig().services;
    return getServiceMode(services, managedKey as keyof Services) ?? "your-own";
  } catch {
    return "your-own";
  }
}

export function isManagedOAuthMode(provider: string): boolean {
  return getOAuthProviderMode(provider) === "managed";
}

export function setOAuthProviderMode(
  provider: string,
  mode: "managed" | "your-own",
): boolean {
  const managedKey = getManagedServiceConfigKey(provider);
  if (!managedKey) {
    return false;
  }
  if (getOAuthProviderMode(provider) === mode) {
    return false;
  }
  const raw = loadRawConfig();
  setNestedValue(raw, `services.${managedKey}.mode`, mode);
  saveRawConfig(raw);
  return true;
}
