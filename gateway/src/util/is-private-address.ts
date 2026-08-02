function unwrapV4Mapped(addr: string): string {
  const v4Mapped = addr.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  return v4Mapped ? v4Mapped[1] : addr;
}

export function isPrivateAddress(addr: string): boolean {
  const normalized = unwrapV4Mapped(addr);

  if (normalized.includes(".")) {
    const parts = normalized.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return false;
    }
    if (parts[0] === 127 || parts[0] === 10) {
      return true;
    }
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
      return true;
    }
    if (parts[0] === 192 && parts[1] === 168) {
      return true;
    }
    return parts[0] === 169 && parts[1] === 254;
  }

  const lower = normalized.toLowerCase();
  if (lower === "::1") {
    return true;
  }
  if (lower.startsWith("fc") || lower.startsWith("fd")) {
    return true;
  }
  return lower.startsWith("fe80");
}
