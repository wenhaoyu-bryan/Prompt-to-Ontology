import os
import unittest
from unittest.mock import patch, MagicMock
import llm_config_manager as config
from llm_client import _call_openai_compat

class DeepSeekConfigTests(unittest.TestCase):
    def test_scope_freezes_model_and_restores_nested_configuration(self):
        raw={'provider':'deepseek','model':'frozen-model','api_key':'private-test-key','base_url':'https://api.deepseek.com'}
        with patch.dict(os.environ,{},clear=True), patch.dict(config._runtime_config,{},clear=True):
            with config.llm_config_scope(raw):
                config._runtime_config.update({'provider':'openai','model':'changed','api_key':'different-key'})
                self.assertEqual(config.get_active_llm_config()['model'],'frozen-model')
                self.assertNotIn('private-test-key',str(config.get_active_status()))
                self.assertTrue(config.is_llm_configured())
                with config.llm_config_scope({'provider':'none','model':'nested','api_key':''}):
                    self.assertFalse(config.is_llm_configured())
                self.assertEqual(config.get_active_llm_config()['model'],'frozen-model')
            self.assertEqual(config.get_active_llm_config()['model'],'changed')
    def test_deepseek_environment_uses_official_flash_and_masks_key(self):
        with patch.dict(os.environ, {'LLM_BACKEND':'deepseek','DEEPSEEK_API_KEY':'sk-test-local-only'}, clear=True), patch.dict(config._runtime_config, {}, clear=True):
            active = config.get_active_llm_config()
            self.assertEqual(active['provider'], 'deepseek')
            self.assertEqual(active['model'], 'deepseek-flash')
            self.assertEqual(active['base_url'], 'https://api.deepseek.com')
            status = config.get_active_status()
            self.assertTrue(status['configured'])
            self.assertNotIn('sk-test-local-only', str(status))

    def test_openai_compatible_request_uses_flash_without_thinking(self):
        active = {'provider':'deepseek','model':'deepseek-flash','base_url':'https://api.deepseek.com','api_key':'dummy'}
        response = MagicMock()
        response.json.return_value = {'choices':[{'message':{'content':'ok'}}]}
        with patch.object(config, 'get_active_llm_config', return_value=active), patch('requests.post',return_value=response) as post:
            result = _call_openai_compat([{'role':'user','content':'hello'}])
        self.assertEqual(post.call_args.args[0], 'https://api.deepseek.com/chat/completions')
        self.assertEqual(post.call_args.kwargs['json']['thinking'], {'type':'disabled'})
        self.assertEqual(result['message']['content'], 'ok')

if __name__ == '__main__':
    unittest.main()
