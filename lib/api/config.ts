/**
 * Single source of truth for API base URL construction.
 * Market API + auth share the same host in production.
 */
export function getApiDomain(): string | null {
  const domain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  return domain || null;
}

export function getApiBaseUrl(): string | null {
  const domain = getApiDomain();
  return domain ? `https://${domain}` : null;
}

/** Static Expo web deploy host (no API routes). */
export function getWebDeployDomain(): string | null {
  return process.env.EXPO_PUBLIC_WEB_DEPLOY_DOMAIN?.trim() || null;
}
