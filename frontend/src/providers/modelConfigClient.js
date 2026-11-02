import axios from "axios";
import { api } from "./dataProvider";

// Deployment administration token stays in this tab's memory, never browser storage.
let token = "";
export const setModelConfigToken = (value) => {
  token = value;
};
export const modelApi = axios.create({
  baseURL: api.defaults.baseURL,
  timeout: 120000,
});
modelApi.interceptors.request.use((config) => {
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
