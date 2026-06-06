/**
 * Domain Configuration Registry (frontend)
 * Maps domain keys to their UI config. New domains add an entry here.
 */

export const DOMAINS = {
  pet_food: {
    key: 'pet_food',
    label: 'Pet Food',
    title: 'Pet Food Demo',
    dataset: 'pet_food',
    primaryObjectType: 'PetFoodProduct',
    schemaEndpoint: '/api/ontology/pet_food/schema',
    dataSource: 'sample-data/pet-food/*.csv',
    supportsAgent: true,
    supportsRules: true,
  },
};

export const DEFAULT_DOMAIN = 'pet_food';

export function getDomainConfig(domain = DEFAULT_DOMAIN) {
  return DOMAINS[domain] || DOMAINS[DEFAULT_DOMAIN];
}

export function listDomains() {
  return Object.values(DOMAINS).map(d => ({
    key: d.key,
    label: d.label,
    title: d.title,
    primaryObjectType: d.primaryObjectType,
    supportsAgent: d.supportsAgent,
    supportsRules: d.supportsRules,
  }));
}
