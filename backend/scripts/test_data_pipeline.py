"""Smoke test for Data Pipeline / Ready Data Workbench v1."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from data_pipeline import PipelineService

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
print("Data Pipeline — Smoke Test")
print("=" * 60)

svc = PipelineService()

# 1. Sample sources
print("\n[1] Sample Sources")
samples = svc.list_sample_sources()
check("Sample list is not empty", len(samples) > 0, f"got {len(samples)}")
names = [s["name"] for s in samples]
check("Has pet_food_products", "pet_food_products" in names)
check("Has pet_food_ingredients", "pet_food_ingredients" in names)

# 2. Profile sample
print("\n[2] Profile Sample Data")
profile = svc.profile_sample("pet_food_products")
check("Profile has row_count", profile.row_count > 0, f"got {profile.row_count}")
check("Profile has column_count", profile.column_count > 0, f"got {profile.column_count}")
check("Profile has columns", len(profile.columns) > 0)
check("Profile has sample_rows", len(profile.sample_rows) > 0)

# Check column types
col_names = [c.name for c in profile.columns]
check("Has product_id column", "product_id" in col_names)
check("Has product_name column", "product_name" in col_names)
check("Has fat_100g column", "fat_100g" in col_names)

# 3. Get profile
print("\n[3] Get Profile")
retrieved = svc.get_profile("pet_food_products")
check("Profile retrievable", retrieved is not None)
check("Same profile returned", retrieved.row_count == profile.row_count)

# 4. Mapping suggestions
print("\n[4] Mapping Suggestions")
mappings = svc.suggest_mappings("pet_food_products")
check("Has field_suggestions", len(mappings["field_suggestions"]) > 0)
check("Has object_mappings", len(mappings["object_mappings"]) > 0)

# Check some mappings
product_mapping = [m for m in mappings["object_mappings"] if m["object_type"] == "PetFoodProduct"]
check("PetFoodProduct mapping exists", len(product_mapping) > 0)
if product_mapping:
    check("Has id_column", product_mapping[0]["id_column"] != "")
    check("Has field_mappings", len(product_mapping[0]["field_mappings"]) > 0)

# 5. Import plan
print("\n[5] Import Plan")
plan = svc.create_import_plan("pet_food_products")
check("Plan has plan_id", plan.plan_id != "")
check("Plan has candidate_objects", len(plan.candidate_objects) > 0, f"got {len(plan.candidate_objects)}")
check("Plan has summary", plan.summary is not None)
check("Summary new_objects matches", plan.summary.new_objects == len(plan.candidate_objects))

# 6. Validation
print("\n[6] Validation")
check("Plan has validation_issues list", isinstance(plan.validation_issues, list))
check("Plan status is set", plan.status.value in ("draft", "validated", "has_errors", "ready_for_review"))

# 7. List plans
print("\n[7] List Plans")
plans = svc.list_import_plans()
check("At least one plan", len(plans) >= 1)

# 8. Get plan by ID
retrieved_plan = svc.get_import_plan(plan.plan_id)
check("Plan retrievable by ID", retrieved_plan is not None)
check("Same plan ID", retrieved_plan.plan_id == plan.plan_id)

# 9. Ingredient profile
print("\n[8] Ingredient Profile")
ing_profile = svc.profile_sample("pet_food_ingredients")
check("Ingredient profile row_count > 0", ing_profile.row_count > 0)
ing_mappings = svc.suggest_mappings("pet_food_ingredients")
check("Ingredient mappings generated", len(ing_mappings["field_suggestions"]) > 0)

# 10. Product ingredients (link mapping)
print("\n[9] Link Mapping")
pi_profile = svc.profile_sample("product_ingredients")
check("Product-ingredients profile row_count > 0", pi_profile.row_count > 0)
pi_plan = svc.create_import_plan("product_ingredients")
check("Product-ingredients plan has candidates", pi_plan.summary.new_objects >= 0)

# Summary
print("\n" + "=" * 60)
print(f"Results: {passed} passed, {failed} failed, {passed + failed} total")
print("=" * 60)
sys.exit(0 if failed == 0 else 1)
