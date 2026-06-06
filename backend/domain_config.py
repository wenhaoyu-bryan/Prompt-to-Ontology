"""
Domain Configuration Registry
Maps domain keys to their runtime config (schema paths, primary types, endpoints).
New domains plug in by adding an entry to DOMAINS.
"""

DOMAINS = {
    "pet_food": {
        "key": "pet_food",
        "label": "Pet Food",
        "title": "Pet Food Ontology",
        "dataset": "pet_food",
        "ontology_path": "ontology/pet_food",
        "primary_object_type": "PetFoodProduct",
        "primary_id_field": "product_id",
        "sample_data_path": "sample-data/pet-food",
        "schema_endpoint": "/api/ontology/pet_food/schema",
        "data_source": "sample-data/pet-food/*.csv",
        "supports_agent": True,
        "supports_rules": True,
        "supports_sample_import": True,
    },
}

DEFAULT_DOMAIN = "pet_food"


def get_domain_config(domain: str = DEFAULT_DOMAIN) -> dict:
    """Return config dict for a domain key. Raises KeyError if not found."""
    if domain not in DOMAINS:
        available = ", ".join(DOMAINS.keys())
        raise KeyError(f"Unknown domain '{domain}'. Available: {available}")
    return DOMAINS[domain]


def get_default_domain() -> str:
    return DEFAULT_DOMAIN


def list_domains() -> list[dict]:
    """Return summary list of all registered domains."""
    return [
        {
            "key": cfg["key"],
            "label": cfg["label"],
            "dataset": cfg["dataset"],
            "primary_object_type": cfg["primary_object_type"],
            "supports_agent": cfg["supports_agent"],
            "supports_rules": cfg["supports_rules"],
        }
        for cfg in DOMAINS.values()
    ]
