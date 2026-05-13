// ============================================================
// Ontology OS — Neo4j 图模型定义
// 执行方式: cypher-shell -u neo4j -p <your_password> -f neo4j_schema.cypher
// ============================================================

// --- 唯一性约束 (同时自动创建索引) ---
CREATE CONSTRAINT supplier_id_unique IF NOT EXISTS
FOR (n:Supplier) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT material_id_unique IF NOT EXISTS
FOR (n:RawMaterial) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT component_id_unique IF NOT EXISTS
FOR (n:Component) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT product_id_unique IF NOT EXISTS
FOR (n:FinalProduct) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT factory_id_unique IF NOT EXISTS
FOR (n:Factory) REQUIRE n.id IS UNIQUE;

// --- 属性索引 (加速 WHERE 过滤) ---
CREATE INDEX material_alert_idx IF NOT EXISTS
FOR (n:RawMaterial) ON (n.alert);

CREATE INDEX product_alert_idx IF NOT EXISTS
FOR (n:FinalProduct) ON (n.alert);

CREATE INDEX supplier_risk_idx IF NOT EXISTS
FOR (n:Supplier) ON (n.riskLevel);

// --- 全文索引 (前端搜索用) ---
CREATE FULLTEXT INDEX node_search IF NOT EXISTS
FOR (n:Supplier|RawMaterial|Component|FinalProduct|Factory)
ON EACH [n.id, n.name];
