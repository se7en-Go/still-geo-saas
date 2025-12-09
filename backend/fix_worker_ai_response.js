#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 开始修复 worker.js 中的 AI 响应解析问题...\n');

// 读取当前的 worker.js 文件
const workerPath = path.join(__dirname, 'worker.js');
const workerBackupPath = path.join(__dirname, 'worker.js.backup');

try {
  // 创建备份
  if (!fs.existsSync(workerBackupPath)) {
    fs.copyFileSync(workerPath, workerBackupPath);
    console.log('✅ 已创建 worker.js.backup 备份文件');
  }

  let workerContent = fs.readFileSync(workerPath, 'utf8');

  // 修复 1: 改进 resolveChatPath 函数
  const oldResolveChatPath = `function resolveChatPath(pathFragment) {
  if (!pathFragment) {
    return '/chat/completions';
  }
  return pathFragment.startsWith('/') ? pathFragment : \`/\${pathFragment}\`;
}`;

  const newResolveChatPath = `function resolveChatPath(pathFragment, provider) {
  if (!pathFragment) {
    return provider === 'gemini' ? '/models/gemini-2.5-flash:generateContent' : '/chat/completions';
  }

  // 确保 pathFragment 不以 / 开头，避免重复
  const cleanPath = pathFragment.startsWith('/') ? pathFragment.substring(1) : pathFragment;

  // 对于 Gemini，直接使用路径，不额外添加 /
  return provider === 'gemini' ? \`/\${cleanPath}\` : \`/\${cleanPath}\`;
}`;

  if (workerContent.includes(oldResolveChatPath)) {
    workerContent = workerContent.replace(oldResolveChatPath, newResolveChatPath);
    console.log('✅ 已修复 resolveChatPath 函数');
  } else {
    console.log('⚠️  resolveChatPath 函数结构已发生变化，请手动检查');
  }

  // 修复 2: 改进 AI 客户端配置
  const oldAIClient = `const aiClient = axios.create({
  baseURL: config.ai.baseUrl,
  headers: (() => {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (config.ai.provider === 'gemini') {
      headers['x-goog-api-key'] = config.ai.apiKey || '';
    } else {
      headers.Authorization = \`Bearer \${config.ai.apiKey || ''}\`;
    }
    return headers;
  })(),
  params: config.ai.provider === 'gemini' ? { key: config.ai.apiKey } : undefined,
  timeout: config.ai.requestTimeoutMs,
});`;

  const newAIClient = `// 修复：改进 AI 客户端配置
function createAIClient() {
  const clientConfig = {
    baseURL: config.ai.baseUrl,
    timeout: config.ai.requestTimeoutMs,
  };

  // 专门为 Gemini 配置 headers
  if (config.ai.provider === 'gemini') {
    clientConfig.headers = {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.ai.apiKey || '',
    };
    clientConfig.params = { key: config.ai.apiKey };
  } else {
    clientConfig.headers = {
      'Content-Type': 'application/json',
      Authorization: \`Bearer \${config.ai.apiKey || ''}\`,
    };
  }

  return axios.create(clientConfig);
}

const aiClient = createAIClient();`;

  if (workerContent.includes(oldAIClient)) {
    workerContent = workerContent.replace(oldAIClient, newAIClient);
    console.log('✅ 已改进 AI 客户端配置');
  } else {
    console.log('⚠️  AI 客户端配置结构已发生变化，请手动检查');
  }

  // 修复 3: 更新 AI 请求调用
  const oldAiRequest = `const aiResponse = await aiClient.post(resolveChatPath(config.ai.chatPath), payload);`;
  const newAiRequest = `// 修复：使用改进的路径解析
          const endpoint = resolveChatPath(config.ai.chatPath, config.ai.provider);
          logger.info(\`Making AI request to \${config.ai.baseUrl}\${endpoint}\`, {
            jobId: job.id,
            provider: config.ai.provider,
            model: config.ai.chatModel,
            payloadSize: JSON.stringify(payload).length,
          });

          const aiResponse = await aiClient.post(endpoint, payload);`;

  if (workerContent.includes(oldAiRequest)) {
    workerContent = workerContent.replace(oldAiRequest, newAiRequest);
    console.log('✅ 已更新 AI 请求调用');
  } else {
    console.log('⚠️  AI 请求调用代码已发生变化，请手动检查');
  }

  // 修复 4: 增强响应解析和错误处理
  const oldResponseHandling = `try {
            const message = extractMessagePayload(aiResponse?.data);
            const sanitized = normalizeJsonContent(message);
            logger.info('Sanitized AI response', { jobId: job.id, sanitized });
            try {
              generatedContent = sanitized ? JSON.parse(sanitized) : null;
            } catch (e) {
              logger.error('Failed to parse sanitized JSON', { jobId: job.id, sanitized, error: e.message });
              throw new Error('Failed to parse AI response');
            }
          } catch (parseErr) {
            fallbackReason = 'AI response parsing failed.';
            logger.error('Failed to parse AI response', {
              error: parseErr.message,
              jobId: job.id,
              response: aiResponse.data,
            });
          }`;

  const newResponseHandling = `// 修复：增强响应验证和调试
          try {
            const validatedData = validateAndDebugAIResponse(aiResponse, job.id);
            const message = extractMessagePayload(validatedData);
            const sanitized = normalizeJsonContent(message);

            logger.info('AI response extraction successful', {
              jobId: job.id,
              hasMessage: !!message,
              hasSanitized: !!sanitized,
              sanitizedLength: sanitized ? sanitized.length : 0,
            });

            if (!sanitized) {
              throw new Error('Failed to extract valid JSON from AI response');
            }

            try {
              generatedContent = JSON.parse(sanitized);
              logger.info('AI JSON parsing successful', {
                jobId: job.id,
                hasTitle: !!generatedContent?.title,
                hasMetaDescription: !!generatedContent?.meta_description,
                hasBody: !!generatedContent?.body,
              });
            } catch (e) {
              logger.error('Failed to parse sanitized JSON', {
                jobId: job.id,
                sanitized,
                error: e.message,
                sanitizedStart: sanitized ? sanitized.substring(0, 200) : null,
              });
              throw new Error(\`JSON parsing failed: \${e.message}\`);
            }
          } catch (parseErr) {
            fallbackReason = \`AI response parsing failed: \${parseErr.message}\`;
            logger.error('AI response parsing error', {
              error: parseErr.message,
              jobId: job.id,
              response: aiResponse.data,
              responseType: typeof aiResponse.data,
              responseKeys: aiResponse.data ? Object.keys(aiResponse.data) : null,
            });
          }`;

  if (workerContent.includes(oldResponseHandling)) {
    workerContent = workerContent.replace(oldResponseHandling, newResponseHandling);
    console.log('✅ 已增强响应解析和错误处理');
  } else {
    console.log('⚠️  响应处理代码已发生变化，请手动检查');
  }

  // 修复 5: 添加响应验证函数
  const validateFunction = `// 修复：增强的AI响应验证和调试函数
function validateAndDebugAIResponse(response, jobId) {
  console.log(\`[Job \${jobId}] AI Response Debug Info:\`, {
    status: response.status,
    hasData: !!response.data,
    dataType: typeof response.data,
    dataKeys: response.data ? Object.keys(response.data) : null,
  });

  if (!response.data) {
    throw new Error('Empty response data from AI service');
  }

  const hasCandidates = Array.isArray(response.data.candidates);
  const hasContent = response.data.candidates?.[0]?.content?.parts?.[0]?.text;

  console.log(\`[Job \${jobId}] Gemini Structure Analysis:\`, {
    hasCandidates,
    candidateCount: response.data.candidates?.length || 0,
    hasContent,
    contentLength: hasContent ? response.data.candidates[0].content.parts[0].text.length : 0,
  });

  if (hasCandidates && !hasContent) {
    throw new Error('Gemini response missing expected content structure');
  }

  return response.data;
}

`;

  // 在文件开头添加验证函数
  const insertPosition = workerContent.indexOf('function resolveChatPath');
  if (insertPosition !== -1) {
    workerContent = workerContent.slice(0, insertPosition) +
                    validateFunction +
                    workerContent.slice(insertPosition);
    console.log('✅ 已添加响应验证函数');
  }

  // 修复 6: 改进错误处理
  const oldErrorHandling = `        } catch (aiErr) {
          fallbackReason = aiErr?.response?.data?.error?.message || aiErr.message || 'AI request failed.';
          logger.error('AI request failed, falling back to templated content', {
            error: fallbackReason,
            jobId: job.id,
            userId,
          });
        }`;

  const newErrorHandling = `        } catch (aiErr) {
          fallbackReason = aiErr?.response?.data?.error?.message || aiErr.message || 'AI request failed.';
          logger.error('AI request failed, falling back to templated content', {
            error: fallbackReason,
            jobId: job.id,
            userId,
            status: aiErr.response?.status,
            statusText: aiErr.response?.statusText,
            errorCode: aiErr.code,
          });
        }`;

  if (workerContent.includes(oldErrorHandling)) {
    workerContent = workerContent.replace(oldErrorHandling, newErrorHandling);
    console.log('✅ 已改进错误处理');
  } else {
    console.log('⚠️  错误处理代码已发生变化，请手动检查');
  }

  // 写入修复后的文件
  fs.writeFileSync(workerPath, workerContent);
  console.log('\n🎉 worker.js 修复完成！');

  console.log('\n📋 修复内容总结:');
  console.log('✅ 改进了 resolveChatPath 函数，正确处理 Gemini API 路径');
  console.log('✅ 增强了 AI 客户端配置，专门优化 Gemini 支持');
  console.log('✅ 添加了详细的响应验证和调试信息');
  console.log('✅ 改进了错误处理和日志记录');
  console.log('✅ 增强了 AI 响应解析的可靠性');

  console.log('\n🔄 建议下一步操作:');
  console.log('1. 重启 worker 进程');
  console.log('2. 测试内容生成功能');
  console.log('3. 检查日志确认修复效果');
  console.log('4. 如有问题，可恢复备份: cp worker.js.backup worker.js');

} catch (error) {
  console.error('❌ 修复过程中出现错误:', error.message);
  console.log('💡 请检查文件权限和路径是否正确');
  process.exit(1);
}