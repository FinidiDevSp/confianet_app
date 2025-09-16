import axios, { AxiosError, AxiosRequestConfig } from "axios";
import config from "config";

const { api } = config;

interface AuthSession {
  access_token: string;
  token?: string;
  token_type?: string;
  user?: unknown;
  [key: string]: unknown;
}

interface AxiosRetryConfig extends AxiosRequestConfig {
  _retry?: boolean;
}

const AUTH_USER_KEY = "authUser";

function setAuthorization(token: string): void {
  axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
}

function clearAuthorization(): void {
  delete axios.defaults.headers.common["Authorization"];
}

const loadAuthSession = (): AuthSession | null => {
  try {
    const raw = sessionStorage.getItem(AUTH_USER_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
};

const persistAuthSession = (data: AuthSession): void => {
  try {
    sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(data));
  } catch {
    /* ignore storage errors */
  }
};

const clearAuthSession = (): void => {
  try {
    sessionStorage.removeItem(AUTH_USER_KEY);
  } catch {
    /* ignore storage errors */
  }
  clearAuthorization();
};

const getStoredAccessToken = (): string | null => {
  const session = loadAuthSession();
  if (!session) {
    return null;
  }

  if (typeof session.access_token === "string" && session.access_token.length > 0) {
    return session.access_token;
  }

  if (typeof session.token === "string" && session.token.length > 0) {
    return session.token;
  }

  return null;
};

const refreshClient = axios.create({ baseURL: api.API_URL, withCredentials: true });

let refreshPromise: Promise<AuthSession> | null = null;

const requestTokenRefresh = async (): Promise<AuthSession> => {
  const response = await refreshClient.post<AuthSession>("/api/auth/refresh", {});
  return response.data;
};

// default
axios.defaults.baseURL = api.API_URL;
axios.defaults.withCredentials = true;
// content type
axios.defaults.headers.post["Content-Type"] = "application/json";

const initialToken = getStoredAccessToken();
if (initialToken) {
  setAuthorization(initialToken);
}

const shouldBypassRefresh = (url?: string): boolean => {
  if (!url) {
    return false;
  }
  const bypassEndpoints = ["/api/auth/login", "/api/auth/refresh", "/api/auth/logout"];
  return bypassEndpoints.some(path => url.includes(path));
};

const buildErrorMessage = (error: unknown): string => {
  if (typeof error === "string") {
    return error;
  }
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const detail = (error.response?.data as { detail?: string } | undefined)?.detail;
    switch (status) {
      case 401:
        return detail || "Invalid credentials";
      case 403:
        return detail || "Tu cuenta está suspendida o pendiente de activación";
      case 404:
        return detail || "Not found";
      case 429:
        return detail || "Too many attempts";
      case 500:
        return detail || "Internal Server Error";
      default:
        return detail || error.message || "Request error";
    }
  }
  if (error instanceof Error) {
    return error.message || "Request error";
  }
  return "Request error";
};

// intercepting to capture errors
axios.interceptors.response.use(
  response => (response.data ? response.data : response),
  async (error: AxiosError) => {
    const status = error.response?.status;
    const originalRequest = error.config as AxiosRetryConfig | undefined;

    const hasToken = Boolean(getStoredAccessToken());

    if (
      status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !shouldBypassRefresh(originalRequest.url) &&
      hasToken
    ) {
      originalRequest._retry = true;
      try {
        refreshPromise = refreshPromise ?? requestTokenRefresh();
        const refreshed = await refreshPromise;
        refreshPromise = null;
        if (refreshed && refreshed.access_token) {
          persistAuthSession(refreshed);
          setAuthorization(refreshed.access_token);
          const retryConfig: AxiosRequestConfig = {
            ...originalRequest,
            headers: {
              ...(originalRequest.headers ?? {}),
              Authorization: `Bearer ${refreshed.access_token}`,
            },
          };
          return axios(retryConfig);
        }
        clearAuthSession();
        return Promise.reject("Invalid refresh response");
      } catch (refreshError) {
        refreshPromise = null;
        clearAuthSession();
        return Promise.reject(buildErrorMessage(refreshError));
      }
    }

    return Promise.reject(buildErrorMessage(error));
  }
);

class APIClient {
  /**
   * Fetches data from given url
   */

  //  get = (url, params) => {
  //   return axios.get(url, params);
  // };
  get = <T = any>(url: string, params?: any): Promise<T> => {
    let response: Promise<any>;

    let paramKeys: string[] = [];

    if (params) {
      Object.keys(params).map(key => {
        paramKeys.push(key + '=' + params[key]);
        return paramKeys;
      });

      const queryString = paramKeys && paramKeys.length ? paramKeys.join('&') : "";
      response = axios.get<T>(`${url}?${queryString}`, params) as unknown as Promise<T>;
    } else {
      response = axios.get<T>(`${url}`, params) as unknown as Promise<T>;
    }

    return response;
  };
  /**
   * post given data to url
   */
  create = <T = any>(url: string, data: any): Promise<T> => {
    return axios.post<T>(url, data) as unknown as Promise<T>;
  };
  /**
   * Updates data
   */
  update = <T = any>(url: string, data: any): Promise<T> => {
    return axios.patch<T>(url, data) as unknown as Promise<T>;
  };

  put = <T = any>(url: string, data: any): Promise<T> => {
    return axios.put<T>(url, data) as unknown as Promise<T>;
  };
  /**
   * Delete
   */
  delete = <T = any>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    return axios.delete<T>(url, { ...config }) as unknown as Promise<T>;
  };
}

const getLoggedinUser = (): AuthSession | null => {
  return loadAuthSession();
};

export { APIClient, setAuthorization, getLoggedinUser };
export type { AuthSession };
