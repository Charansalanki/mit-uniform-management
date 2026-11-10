// client/src/utils/apiConfig.ts
export const getProductionSafeApiBaseUrl = (): string => {
  const envUrl = (import.meta as any).env?.VITE_API_URL || '';
  if (typeof window !== 'undefined') {
    const isLocalhostBrowser =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';
    // Never allow a production domain to call a localhost API URL
    if (!isLocalhostBrowser && envUrl.includes('localhost')) {
      return '';
    }
    if (!envUrl && isLocalhostBrowser) {
      return 'http://localhost:4000';
    }
  }
  return envUrl.replace(/\/$/, '');
};

export const API_BASE_URL = getProductionSafeApiBaseUrl();

export default {
  getProductionSafeApiBaseUrl,
  API_BASE_URL
};

