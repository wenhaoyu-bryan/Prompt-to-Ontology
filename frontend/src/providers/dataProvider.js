import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({ baseURL: API_BASE, timeout: 30000 });
const apiLong = axios.create({ baseURL: API_BASE, timeout: 120000 });

/**
 * Custom data provider for Refine.
 * Maps Refine resource patterns to the existing FastAPI endpoints.
 * For resources that don't map 1:1 to REST, we use custom methods.
 */
const dataProvider = {
  getList: async ({ resource, pagination, filters, sort }) => {
    // Most resources use the graph endpoint
    if (resource === 'graph') {
      const { data } = await api.get('/graph');
      const nodes = data.nodes || [];
      return { data: nodes, total: nodes.length };
    }
    if (resource === 'datasets') {
      const { data } = await api.get('/datasets');
      return { data, total: data.length };
    }
    // Fallback: try /api/{resource}
    try {
      const { data } = await api.get(`/${resource}`);
      const items = Array.isArray(data) ? data : data.items || data.data || [];
      return { data: items, total: items.length };
    } catch {
      return { data: [], total: 0 };
    }
  },

  getOne: async ({ resource, id }) => {
    if (resource === 'node') {
      const { data } = await api.get(`/node/${id}`);
      return { data };
    }
    if (resource === 'risk-explanation') {
      const { data } = await api.get(`/pet-food/products/${id}/risk-explanation`);
      return { data };
    }
    const { data } = await api.get(`/${resource}/${id}`);
    return { data };
  },

  create: async ({ resource, variables }) => {
    const { data } = await api.post(`/${resource}`, variables);
    return { data };
  },

  update: async ({ resource, id, variables }) => {
    const { data } = await api.put(`/${resource}/${id}`, variables);
    return { data };
  },

  deleteOne: async ({ resource, id }) => {
    const { data } = await api.delete(`/${resource}/${id}`);
    return { data };
  },

  getApiUrl: () => API_BASE,

  // Custom methods for non-CRUD endpoints
  custom: async ({ url, method, payload, headers }) => {
    if (method === 'get') {
      const { data } = await api.get(url, { headers });
      return { data };
    }
    if (method === 'post') {
      const { data } = await api.post(url, payload, { headers });
      return { data };
    }
    if (method === 'delete') {
      const { data } = await api.delete(url, { headers });
      return { data };
    }
    throw new Error(`Unsupported method: ${method}`);
  },
};

export { api, apiLong };
export default dataProvider;
