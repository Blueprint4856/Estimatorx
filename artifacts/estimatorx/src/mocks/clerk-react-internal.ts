export const publishableKeyFromHost = (
  _hostname: string,
  fallback?: string,
): string => fallback ?? "pk_live_mock";
