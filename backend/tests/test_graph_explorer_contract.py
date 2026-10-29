"""Graph exploration preserves distinct Neo4j relationships."""
import unittest
from unittest.mock import patch

import networkx as nx

from ontology import _graph_edge_ids, get_graph_data


class GraphExplorerContractTests(unittest.TestCase):
    def test_parallel_relations_have_stable_distinct_ids(self):
        graph = nx.DiGraph()
        graph.add_node('PF001', label='Product', object_type='PetFoodProduct')
        graph.add_node('ING001', label='Chicken', object_type='Ingredient')
        graph.add_edge('PF001', 'ING001', link_type='CONTAINS')
        edges = [
            {'edge_id': 'neo4j:1', 'source_id': 'PF001', 'target_id': 'ING001', 'link_type': 'CONTAINS'},
            {'edge_id': 'neo4j:2', 'source_id': 'PF001', 'target_id': 'ING001', 'link_type': 'HAS_ALLERGEN'},
        ]
        with patch('ontology.get_graph', return_value=graph), patch('ontology.fetch_all_links_filtered', return_value=edges) as fetch:
            first = get_graph_data('pet_food')
            second = get_graph_data('pet_food')
        self.assertEqual(len({edge['id'] for edge in first['links']}), 2)
        self.assertTrue(all(edge['id'].startswith('edge-') for edge in first['links']))
        self.assertEqual(first['links'], second['links'])
        self.assertEqual({edge['linkType'] for edge in first['links']}, {'CONTAINS', 'HAS_ALLERGEN'})
        fetch.assert_called_with('pet_food')

    def test_ids_survive_new_neo4j_ids_and_preserve_parallel_edges(self):
        edges = [
            {'edge_id': 'old:1', 'source_id': 'PF001', 'target_id': 'ING001', 'link_type': 'CONTAINS', 'ingredient_order': 1},
            {'edge_id': 'old:2', 'source_id': 'PF001', 'target_id': 'ING001', 'link_type': 'CONTAINS', 'ingredient_order': 2},
            {'edge_id': 'old:3', 'source_id': 'PF001', 'target_id': 'ING001', 'link_type': 'CONTAINS', 'ingredient_order': 2},
        ]
        recreated = [{**edge, 'edge_id': f'new:{index}'} for index, edge in enumerate(reversed(edges))]
        self.assertEqual(set(_graph_edge_ids(edges)), set(_graph_edge_ids(recreated)))
        self.assertEqual(len(set(_graph_edge_ids(edges))), 3)
        self.assertEqual(_graph_edge_ids(edges[:1]), _graph_edge_ids([{**edges[0], 'edge_id': 'new:1'}]))


if __name__ == '__main__':
    unittest.main()
