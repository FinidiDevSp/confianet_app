import axios from "axios";
import { APIClient } from "./api_helper";

const api = new APIClient();

export interface LoginPayload {
  email: string;
  password: string;
}

export interface UserOut {
  id: number;
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

export const authLogin = (data: LoginPayload) => api.create("/api/auth/login", data) as Promise<TokenResponse>;
export const authRefresh = () => api.create("/api/auth/refresh", {}) as Promise<TokenResponse>;
export const authLogout = () => api.create("/api/auth/logout", {});
export const authMe = async (accessToken: string): Promise<UserOut> => {
  const res = await axios.get("/api/auth/me", { headers: { Authorization: `Bearer ${accessToken}` } });
  return res as unknown as UserOut;
};

