"""Smoke test for Relationship CSV Upload pipeline."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from data_pipeline import PipelineService
from data_pipeline.models import CandidateLink

passed = 0
failed = 0

def check(name, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failed += 1
        print(f"  FAIL  {name} {detail}")


print("=" * 60)
print("Relationship CSV Pipeline — Smoke Test")
print("=" * 60)

# ── Setup: seed some objects first ──────────────────────────────────
svc = PipelineService()

OBJ_CSV = """product_id,product_name,species,life_stage,fat_100g
rel_pf_001,Rel Test Product 1,Cat,Adult,12
rel_pf_002,Rel Test Product 2,Cat,Senior,14
"""

ING_CSV = """ingredient_id,ingredient_name,ingredient_type,allergen_flag
rel_ing_001,Chicken,animal_protein,true
rel_ing_002,Taurine,supplement,false
"""

# Profile and create objects
svc.profile_csv_content("rel_products.csv", OBJ_CSV)
svc.profile_csv_content("rel_ingredients.csv", ING_CSV)

# Create object import plans (for graph seeding if needed)
product_mappings = [{
    "object_type": "PetFoodProduct", "id_column": "product_id", "display_name_column": "product_name",
    "field_mappings": [
        {"source_column": "product_id", "target_object_type": "PetFoodProduct", "target_property": "product_id", "confidence": 1.0},
        {"source_column": "product_name", "target_object_type": "PetFoodProduct", "target_property": "product_name", "confidence": 1.0},
        {"source_column": "species", "target_object_type": "PetFoodProduct", "target_property": "target_species", "confidence": 1.0},
        {"source_column": "life_stage", "target_object_type": "PetFoodProduct", "target_property": "life_stage", "confidence": 1.0},
        {"source_column": "fat_100g", "target_object_type": "PetFoodProduct", "target_property": "fat_100g", "confidence": 1.0},
    ], "confidence": 1.0,
}]
ing_mappings = [{
    "object_type": "Ingredient", "id_column": "ingredient_id",
    "field_mappings": [
        {"source_column": "ingredient_id", "target_object_type": "Ingredient", "target_property": "ingredient_id", "confidence": 1.0},
        {"source_column": "ingredient_name", "target_object_type": "Ingredient", "target_property": "ingredient_name", "confidence": 1.0},
        {"source_column": "ingredient_type", "target_object_type": "Ingredient", "target_property": "ingredient_type", "confidence": 1.0},
        {"source_column": "allergen_flag", "target_object_type": "Ingredient", "target_property": "allergen_flag", "confidence": 1.0},
    ], "confidence": 1.0,
}]
product_plan = svc.create_import_plan("rel_products.csv", "pet_food", object_mappings=product_mappings)
ing_plan = svc.create_import_plan("rel_ingredients.csv", "pet_food", object_mappings=ing_mappings)
check("Product objects created", len(product_plan.candidate_objects) == 2, f"got {len(product_plan.candidate_objects)}")
check("Ingredient objects created", len(ing_plan.candidate_objects) == 2, f"got {len(ing_plan.candidate_objects)}")

# Apply objects to graph so endpoint validation can find them
from review_queue.import_plan_adapter import create_review_batch_from_import_plan
from review_queue.graph_writer import apply_candidate_object
from neo4j_connector import get_driver

drv = get_driver()
for plan in [product_plan, ing_plan]:
    for obj in plan.candidate_objects:
        from review_queue.models import ReviewItem, ReviewItemType, ReviewItemStatus, ReviewSeverity, ReviewSource
        ri = ReviewItem(
            id=f"ri-test-{obj.id}", batch_id="test", type=ReviewItemType.IMPORT_OBJECT_CANDIDATE,
            title=f"Test {obj.id}", description="", status=ReviewItemStatus.PENDING,
            severity=ReviewSeverity.MEDIUM, source=ReviewSource.IMPORT_PLAN,
            candidate_object=obj.model_dump(mode="json"),
        )
        apply_candidate_object(ri, driver=drv)

# ── 1. Profile relationship CSV ────────────────────────────────────
print("\n[1] Profile Relationship CSV")
REL_CSV = """product_id,ingredient_id,amount,unit
rel_pf_001,rel_ing_001,20,percent
rel_pf_001,rel_ing_002,1200,mg_per_kg
rel_pf_002,rel_ing_001,35,percent
"""
rel_profile = svc.profile_csv_content("rel_contains.csv", REL_CSV)
check("Profile source_type=custom_csv", rel_profile.source_type == "custom_csv")
check("Profile has 3 rows", rel_profile.row_count == 3, f"got {rel_profile.row_count}")
check("Profile has 4 columns", rel_profile.column_count == 4, f"got {rel_profile.column_count}")

# ── 2. Create relationship import plan for CONTAINS ────────────────
print("\n[2] Create Relationship Import Plan")
rel_plan = svc.create_relationship_import_plan(
    source_id="rel_contains.csv",
    domain="pet_food",
    link_type="CONTAINS",
    source_id_column="product_id",
    target_id_column="ingredient_id",
    source_object_type="PetFoodProduct",
    target_object_type="Ingredient",
    property_columns=["amount", "unit"],
)
check("Plan has plan_id", bool(rel_plan.plan_id))
check("Plan has candidate_links", len(rel_plan.candidate_links) > 0, f"got {len(rel_plan.candidate_links)}")
check("Plan has 3 candidate links", len(rel_plan.candidate_links) == 3, f"got {len(rel_plan.candidate_links)}")
check("Plan has 0 candidate objects", len(rel_plan.candidate_objects) == 0, f"got {len(rel_plan.candidate_objects)}")

# ── 3. Candidate links are correctly generated ─────────────────────
print("\n[3] Candidate Link Content")
first = rel_plan.candidate_links[0]
check("First link source_id=rel_pf_001", first.source_id == "rel_pf_001", f"got {first.source_id}")
check("First link target_id=rel_ing_001", first.target_id == "rel_ing_001", f"got {first.target_id}")
check("First link type=CONTAINS", first.type == "CONTAINS", f"got {first.type}")
check("First link has properties", bool(first.properties), f"got {first.properties}")
check("First link has amount property", "amount" in first.properties)
check("First link has unit property", "unit" in first.properties)

# ── 4. Metadata includes import_type=relationship ──────────────────
print("\n[4] Import Plan Metadata")
check("Metadata source_type=custom_csv", rel_plan.metadata.get("source_type") == "custom_csv")
check("Metadata import_type=relationship", rel_plan.metadata.get("import_type") == "relationship")
check("Metadata link_type=CONTAINS", rel_plan.metadata.get("link_type") == "CONTAINS")
check("Metadata source_object_type", rel_plan.metadata.get("source_object_type") == "PetFoodProduct")
check("Metadata target_object_type", rel_plan.metadata.get("target_object_type") == "Ingredient")
check("Metadata filename", rel_plan.metadata.get("filename") == "rel_contains.csv")

# ── 5. Endpoint validation ─────────────────────────────────────────
print("\n[5] Endpoint Validation")
errors = [i for i in rel_plan.validation_issues if i.get("level") == "error"]
check("No critical validation errors", len(errors) == 0, f"got {len(errors)}: {[e['message'] for e in errors]}")
check("Plan status is validated or ready", rel_plan.status.value in ("validated", "ready_for_review"), f"got {rel_plan.status}")

# ── 6. Missing source validation ───────────────────────────────────
print("\n[6] Missing Endpoint Validation")
MISS_CSV = """product_id,ingredient_id
nonexistent_001,rel_ing_001
rel_pf_001,nonexistent_999
"""
svc.profile_csv_content("rel_missing.csv", MISS_CSV)
miss_plan = svc.create_relationship_import_plan(
    source_id="rel_missing.csv", domain="pet_food", link_type="CONTAINS",
    source_id_column="product_id", target_id_column="ingredient_id",
)
miss_errors = [i for i in miss_plan.validation_issues if i.get("level") == "error"]
# Endpoint validation depends on Neo4j availability
if miss_errors:
    check("Missing endpoints produce errors", True)
    check("Plan status has_errors", miss_plan.status.value == "has_errors", f"got {miss_plan.status}")
else:
    # If Neo4j not available, validation produces warnings instead
    miss_warnings = [i for i in miss_plan.validation_issues if i.get("level") == "warning"]
    check("Missing endpoints produce warnings (Neo4j unavailable)", len(miss_warnings) >= 1, f"got {len(miss_warnings)}")
    check("Plan status reflects validation", miss_plan.status.value in ("ready_for_review", "has_errors"), f"got {miss_plan.status}")

# ── 7. Duplicate relationship warning ──────────────────────────────
print("\n[7] Duplicate Relationship Warning")
DUP_REL_CSV = """product_id,ingredient_id
rel_pf_001,rel_ing_001
rel_pf_001,rel_ing_001
"""
svc.profile_csv_content("rel_dup.csv", DUP_REL_CSV)
dup_plan = svc.create_relationship_import_plan(
    source_id="rel_dup.csv", domain="pet_food", link_type="CONTAINS",
    source_id_column="product_id", target_id_column="ingredient_id",
)
dup_warnings = [i for i in dup_plan.validation_issues if i.get("code") == "DUPLICATE_RELATIONSHIP"]
check("Duplicate produces warning", len(dup_warnings) >= 1, f"got {len(dup_warnings)}")

# ── 8. Submit to Review Queue ──────────────────────────────────────
print("\n[8] Submit to Review Queue")
from review_queue.import_plan_adapter import create_review_batch_from_import_plan
result = create_review_batch_from_import_plan(rel_plan)
check("Batch created", result.batch is not None)
check("Items created", len(result.items) > 0, f"got {len(result.items)}")
link_items = [i for i in result.items if i.type.value in ("IMPORT_LINK_CANDIDATE", "import_link_candidate")]
check("Has IMPORT_LINK_CANDIDATE items", len(link_items) >= 3, f"got {len(link_items)}")

# ── 9. Review items preserve metadata ──────────────────────────────
print("\n[9] Review Item Metadata")
if link_items:
    meta = link_items[0].metadata or {}
    check("Metadata source_type=custom_csv", meta.get("source_type") == "custom_csv")
    check("Metadata filename", meta.get("filename") == "rel_contains.csv")
    check("Metadata source_row_index exists", "source_row_index" in meta)

# ── 10. Link types endpoint ────────────────────────────────────────
print("\n[10] Link Types")
from ontology_kernel import load_pet_food_schema
schema = load_pet_food_schema()
uploadable = [n for n in schema.link_types if n != "TRIGGERS_RISK"]
check("Has 4 uploadable link types", len(uploadable) >= 4, f"got {len(uploadable)}")
check("CONTAINS available", "CONTAINS" in uploadable)
check("MADE_BY available", "MADE_BY" in uploadable)
check("TARGETS_SPECIES available", "TARGETS_SPECIES" in uploadable)
check("SUITABLE_FOR available", "SUITABLE_FOR" in uploadable)
check("TRIGGERS_RISK excluded", "TRIGGERS_RISK" not in uploadable)

# ── 11. Summary counts ────────────────────────────────────────────
print("\n[11] Summary")
check("Summary new_links=3", rel_plan.summary.new_links == 3, f"got {rel_plan.summary.new_links}")
check("Summary new_objects=0", rel_plan.summary.new_objects == 0, f"got {rel_plan.summary.new_objects}")

# ── Cleanup ────────────────────────────────────────────────────────
try:
    with drv.session() as session:
        session.run("MATCH (n) WHERE n.id STARTS WITH 'rel_' DETACH DELETE n")
except Exception:
    pass  # Cleanup is best-effort

# ── Summary ────────────────────────────────────────────────────────
print("\n" + "=" * 60)
total = passed + failed
print(f"Results: {passed}/{total} passed")
if failed > 0:
    print(f"  {failed} FAILED")
    sys.exit(1)
else:
    print("All tests passed!")
    sys.exit(0)
