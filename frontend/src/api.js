import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// LLM 推断需要更长超时（后端允许 90 秒）
const apiLong = axios.create({
  baseURL: '/api',
  timeout: 120000,
});

export async function fetchGraph(dataset) {
  const params = dataset && dataset !== 'all' ? { dataset } : {};
  const { data } = await api.get('/graph', { params });
  return data;
}

export async function fetchNodeDetail(nodeId) {
  const { data } = await api.get(`/node/${nodeId}`);
  return data;
}

export async function runAgentChat(nodeId) {
  const { data } = await api.post('/chat', { node_id: nodeId });
  return data;
}

export async function executeAction(actionName, params) {
  const { data } = await api.post('/action', { action_name: actionName, params });
  return data;
}

export async function fetchHighlightPath(nodeId) {
  const { data } = await api.get(`/highlight-path/${nodeId}`);
  return data;
}

export async function fetchAlerts() {
  const { data } = await api.get('/alerts');
  return data;
}

export async function fetchImpactAnalysis(nodeId, depth = 3) {
  const { data } = await api.get(`/impact-analysis/${nodeId}?depth=${depth}`);
  return data;
}

// 向后兼容
export const fetchBlastRadius = fetchImpactAnalysis;

export async function fetchLlmConfig() {
  const { data } = await api.get('/llm-config');
  return data;
}

export async function fetchSupplierRiskSummary() {
  const { data } = await api.get('/supplier-risk-summary');
  return data;
}

export async function fetchShortestPath(fromId, toId) {
  const { data } = await api.post('/shortest-path', { from_id: fromId, to_id: toId });
  return data;
}

export async function previewImport(file) {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post('/data/import/preview', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function importData(objectType, file) {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post(`/data/import/${objectType}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

// =====================================================
// 数据流水线 API (Phase 6)
// =====================================================

export async function inferSchema(sample) {
  const { data } = await apiLong.post('/pipeline/infer-schema', sample);
  return data;
}

export async function inferSchemaMulti(tables) {
  const { data } = await apiLong.post('/pipeline/infer-schema-multi', { tables });
  return data;
}

export async function batchImport(payload) {
  const { data } = await api.post('/pipeline/batch-import', payload);
  return data;
}

// =====================================================
// 数据集管理 API (Phase 7)
// =====================================================

export async function fetchDatasets() {
  const { data } = await api.get('/datasets');
  return data;
}

export async function clearDataset(dataset) {
  const { data } = await api.post('/dataset/clear', { dataset });
  return data;
}

// =====================================================
// 本体 Schema API (Phase 8)
// =====================================================

export async function fetchOntologySchema(dataset) {
  const params = dataset && dataset !== 'all' ? { dataset } : {};
  const { data } = await api.get('/ontology/schema', { params });
  return data;
}

export async function fetchViolations(dataset) {
  const params = dataset && dataset !== 'all' ? { dataset } : {};
  const { data } = await api.get('/ontology/violations', { params });
  return data;
}

export async function fetchConstraints(className) {
  const params = className ? { class_name: className } : {};
  const { data } = await api.get('/ontology/constraints', { params });
  return data;
}

export async function addConstraint(constraint) {
  const { data } = await api.post('/ontology/constraints', constraint);
  return data;
}

export async function deleteConstraint(id) {
  const { data } = await api.delete(`/ontology/constraints/${id}`);
  return data;
}

// =====================================================
// Pet Food Ontology Schema API (Phase 8)
// =====================================================

export async function fetchPetFoodSchema(domain) {
  const { data } = await api.get(`/ontology/${domain || 'pet_food'}/schema`);
  return data;
}

// =====================================================
// Pet Food Import API (Phase 12)
// =====================================================

export async function importPetFoodSample() {
  const { data } = await api.post('/pet-food/import-sample');
  return data;
}

export async function fetchPetFoodRiskExplanation(productId) {
  const { data } = await api.get(`/pet-food/products/${productId}/risk-explanation`);
  return data;
}

export async function petFoodAgentChat(question, context) {
  const { data } = await api.post('/pet-food/agent/chat', { question, context: context || null });
  return data;
}
