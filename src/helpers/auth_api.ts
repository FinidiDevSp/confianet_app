import axios from "axios";
import { APIClient } from "./api_helper";

const api = new APIClient();

export interface LoginPayload {
  email: string;
  password: string;
}

export interface UserOut {
  id: string | number;
  email: string;
  full_name: string;
  role: string;
  status: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: UserOut;
}

export const authLogin = (data: LoginPayload): Promise<TokenResponse> => api.create<TokenResponse>("/api/auth/login", data);
export const authRefresh = (): Promise<TokenResponse> => api.create<TokenResponse>("/api/auth/refresh", {});
export const authLogout = (): Promise<void> => api.create<void>("/api/auth/logout", {});
export const authMe = async (accessToken: string): Promise<UserOut> => {
  const res = await axios.get<UserOut>("/api/auth/me", { headers: { Authorization: `Bearer ${accessToken}` } });
  return res as unknown as UserOut;
};
