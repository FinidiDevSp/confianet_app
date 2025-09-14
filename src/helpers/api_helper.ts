import axios, { AxiosRequestConfig } from "axios";
import config from "config";

const { api } = config;

// default
axios.defaults.baseURL = api.API_URL;
axios.defaults.withCredentials = true;
// content type
axios.defaults.headers.post["Content-Type"] = "application/json";

// content type
const authUser: any = sessionStorage.getItem("authUser")
const token = JSON.parse(authUser) ? JSON.parse(authUser).token : null;
if (token)
  axios.defaults.headers.common["Authorization"] = "Bearer " + token;

// intercepting to capture errors
axios.interceptors.response.use(
  function (response) {
    return response.data ? response.data : response;
  },
  function (error) {
    // Any status codes that falls outside the range of 2xx cause this function to trigger
    let message;
    switch (error.status) {
      case 500:
        message = "Internal Server Error";
        break;
      case 401:
        message = "Invalid credentials";
        break;
      case 404:
        message = "Sorry! the data you are looking for could not be found";
        break;
      default:
        message = error.message || error;
    }
    return Promise.reject(message);
  }
);
/**
 * Sets the default authorization
 * @param {*} token
 */
const setAuthorization = (token:string) => {
  axios.defaults.headers.common["Authorization"] = "Bearer " + token;
};

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
const getLoggedinUser = () => {
  const user = sessionStorage.getItem("authUser");
  if (!user) {
    return null;
  } else {
    return JSON.parse(user);
  }
};

export { APIClient, setAuthorization, getLoggedinUser };
