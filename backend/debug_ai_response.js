#!/usr/bin/env node

require('dotenv').config({path: '.env'});
const axios = require('axios');
const { config } = require('./config');

// 从 worker.js 复制的响应解析函数
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

function normalizeJsonContent(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  let content = raw.trim();
  if (!content) {
    return null;
  }

  const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    content = fenceMatch[1].trim();
  }

  if (content.startsWith('{') || content.startsWith('[')) {
    return content;
  }

  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return content.slice(firstBrace, lastBrace + 1).trim();
  }

  const firstBracket = content.indexOf('[');
  const lastBracket = content.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    return content.slice(firstBracket, lastBracket + 1).trim();
  }

  return content;
}

async function testGeminiAPI() {
  console.log('🚀 开始测试 Gemini API 响应解析...\n');

  // AI 客户端配置
  const aiClient = axios.create({
    baseURL: config.ai.baseUrl,
    headers: (() => {
      const headers = {
        'Content-Type': 'application/json',
      };
      if (config.ai.provider === 'gemini') {
        headers['x-goog-api-key'] = config.ai.apiKey || '';
      } else {
        headers.Authorization = `Bearer ${config.ai.apiKey || ''}`;
      }
      return headers;
    })(),
    params: config.ai.provider === 'gemini' ? { key: config.ai.apiKey } : undefined,
    timeout: config.ai.requestTimeoutMs,
  });

  const testPrompt = `请生成一个关于"数字营销"的简单内容，输出JSON格式，包含以下字段：
  {
    "title": "string",
    "meta_description": "string",
    "body": "string (markdown format)"
  }`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: testPrompt }],
      },
    ],
    generation_config: {
      response_mime_type: 'application/json',
    },
  };

  const endpoint = config.ai.chatPath || '/chat/completions';

  console.log('📋 请求配置:');
  console.log(`URL: ${config.ai.baseUrl}${endpoint}`);
  console.log(`Provider: ${config.ai.provider}`);
  console.log(`Model: ${config.ai.chatModel}`);
  console.log(`Timeout: ${config.ai.requestTimeoutMs}ms\n`);

  try {
    console.log('📤 发送请求...');
    const startTime = Date.now();

    const response = await aiClient.post(endpoint.startsWith('/') ? endpoint : `/${endpoint}`, payload);
    const responseTime = Date.now() - startTime;

    console.log(`✅ 请求成功 (${responseTime}ms)`);
    console.log('📊 响应状态:', response.status);
    console.log('📊 响应头:', response.headers['content-type']);
    console.log('\n📄 原始响应数据:');
    console.log(JSON.stringify(response.data, null, 2));

    // 测试响应解析
    console.log('\n🔍 开始解析响应...');

    const messagePayload = extractMessagePayload(response.data);
    console.log('\n📝 提取的消息内容:');
    console.log(messagePayload ? messagePayload : '❌ 无法提取消息内容');

    if (messagePayload) {
      const normalizedJson = normalizeJsonContent(messagePayload);
      console.log('\n🔧 标准化的JSON内容:');
      console.log(normalizedJson ? normalizedJson : '❌ 无法标准化JSON');

      if (normalizedJson) {
        try {
          const parsedContent = JSON.parse(normalizedJson);
          console.log('\n✅ JSON解析成功!');
          console.log('📋 解析后的内容:');
          console.log(JSON.stringify(parsedContent, null, 2));

          // 验证必要字段
          const hasRequiredFields = parsedContent.title && parsedContent.meta_description && parsedContent.body;
          console.log('\n🔎 必要字段检查:');
          console.log(`Title: ${parsedContent.title ? '✅' : '❌'}`);
          console.log(`Meta Description: ${parsedContent.meta_description ? '✅' : '❌'}`);
          console.log(`Body: ${parsedContent.body ? '✅' : '❌'}`);
          console.log(`完整结构: ${hasRequiredFields ? '✅' : '❌'}`);

        } catch (parseError) {
          console.error('\n❌ JSON解析失败:', parseError.message);
          console.log('🔍 尝试的JSON内容:', normalizedJson);
        }
      }
    }

  } catch (error) {
    console.error('❌ 请求失败:');

    if (error.response) {
      console.error(`HTTP ${error.response.status}: ${error.response.statusText}`);
      console.error('响应头:', error.response.headers);
      console.error('错误数据:', error.response.data);
    } else if (error.request) {
      console.error('网络错误:', error.message);
      console.error('请求配置:', {
        baseURL: config.ai.baseUrl,
        endpoint,
        timeout: config.ai.requestTimeoutMs,
      });
    } else {
      console.error('配置错误:', error.message);
    }
  }
}

// 运行测试
testGeminiAPI().then(() => {
  console.log('\n🎉 测试完成');
}).catch((error) => {
  console.error('\n💥 测试失败:', error);
  process.exit(1);
});