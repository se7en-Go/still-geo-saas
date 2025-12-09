require('dotenv').config();
const axios = require('axios');

// 从环境变量读取配置
const AI_API_BASE_URL = process.env.AI_API_BASE_URL;
const AI_API_KEY = process.env.AI_API_KEY;
const CHAT_COMPLETION_MODEL = process.env.CHAT_COMPLETION_MODEL;
const AI_CHAT_COMPLETION_PATH = process.env.AI_CHAT_COMPLETION_PATH;
const AI_PROVIDER = process.env.AI_PROVIDER;
const AI_USE_RESPONSE_FORMAT = process.env.AI_USE_RESPONSE_FORMAT;

console.log('=== AI API 连接测试 ===');
console.log('Base URL:', AI_API_BASE_URL);
console.log('Model:', CHAT_COMPLETION_MODEL);
console.log('Provider:', AI_PROVIDER);
console.log('API Key存在:', !!AI_API_KEY);

// 创建AI客户端
const aiClient = axios.create({
  baseURL: AI_API_BASE_URL,
  headers: (() => {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (AI_PROVIDER === 'gemini') {
      headers['x-goog-api-key'] = AI_API_KEY || '';
    } else {
      headers.Authorization = `Bearer ${AI_API_KEY || ''}`;
    }
    return headers;
  })(),
  params: AI_PROVIDER === 'gemini' ? { key: AI_API_KEY } : undefined,
  timeout: 30000,
});

function resolveChatPath(pathFragment) {
  if (!pathFragment) {
    return '/chat/completions';
  }
  return pathFragment.startsWith('/') ? pathFragment : `/${pathFragment}`;
}

async function testAIConnection() {
  try {
    console.log('\n开始测试AI API连接...');

    const isGemini = AI_PROVIDER === 'gemini';
    const payload = isGemini
      ? {
          contents: [
            {
              role: 'user',
              parts: [{ text: '请回复"连接成功"，这是一个简单的连接测试。' }],
            },
          ],
        }
      : {
          model: CHAT_COMPLETION_MODEL,
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant.',
            },
            { role: 'user', content: '请回复"连接成功"，这是一个简单的连接测试。' },
          ],
        };

    if (isGemini && AI_USE_RESPONSE_FORMAT) {
      payload.generation_config = {
        response_mime_type: 'application/json',
      };
    }

    console.log('请求路径:', resolveChatPath(AI_CHAT_COMPLETION_PATH));
    console.log('请求载荷:', JSON.stringify(payload, null, 2));

    const response = await aiClient.post(resolveChatPath(AI_CHAT_COMPLETION_PATH), payload);

    console.log('\n=== 连接成功 ===');
    console.log('响应状态:', response.status);
    console.log('响应数据:', JSON.stringify(response.data, null, 2));

    // 测试响应解析
    function extractMessagePayload(data) {
      if (typeof data?.content === 'string' && data.content.trim()) {
        return data.content;
      }
      if (typeof data?.result === 'string' && data.result.trim()) {
        return data.result;
      }
      if (typeof data?.text === 'string' && data.text.trim()) {
        return data.text;
      }
      const openAiStyle = data?.choices?.[0]?.message?.content;
      if (typeof openAiStyle === 'string' && openAiStyle.trim()) {
        return openAiStyle;
      }

      if (Array.isArray(data?.candidates)) {
        const concatenated = data.candidates
          .flatMap((candidate) => candidate?.content?.parts || [])
          .map((part) => (typeof part?.text === 'string' ? part.text : ''))
          .join('')
          .trim();

        if (concatenated) {
          return concatenated;
        }
      }

      return null;
    }

    const message = extractMessagePayload(response?.data);
    console.log('\n提取的消息:', message);

    return { success: true, message, response: response.data };

  } catch (error) {
    console.error('\n=== 连接失败 ===');
    console.error('错误:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
    if (error.request) {
      console.error('请求错误，无响应');
    }
    return { success: false, error: error.message };
  }
}

// 运行测试
testAIConnection().then(result => {
  console.log('\n=== 测试结果 ===');
  if (result.success) {
    console.log('✅ AI API连接正常');
    console.log('📝 响应消息:', result.message);
  } else {
    console.log('❌ AI API连接失败');
    console.log('🔍 错误原因:', result.error);
  }
  process.exit(result.success ? 0 : 1);
}).catch(err => {
  console.error('测试执行失败:', err);
  process.exit(1);
});