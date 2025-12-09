// 修复后的Worker.js - 解决AI响应解析问题
require('dotenv').config();
const { Worker } = require('bullmq');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { config } = require('./config');
const { createWorkerConnection } = require('./redis-config-fix');
const { extractMessagePayload, normalizeJsonContent, safeJsonParse } = require('./worker-ai-fix');
const db = require('./db');
const logger = require('./logger');

// 使用修复后的Redis连接配置
const connection = createWorkerConnection();

// ... [保留原有的其他函数，如buildFallbackContent, ensureStructuredContent等] ...

const worker = new Worker(
  'content-generation',
  async (job) => {
    const {
      keyword,
      knowledgeBaseId,
      knowledgeSetId,
      imageIds,
      imageCollectionId,
      imageTags,
      imageCount,
      ruleId,
      userId,
      schemaConfig: jobSchemaConfig,
      schemaEntities = {},
      schemaOverrides,
    } = job.data;

    logger.info(`Processing job ${job.id} for user ${userId}`, {
      aiProvider: config.ai.provider,
      aiModel: config.ai.chatModel,
    });

    try {
      // ... [原有的初始化代码保持不变] ...

      if (!aiConfigured) {
        fallbackReason = 'AI service is not configured.';
        logger.warn('AI configuration missing. Falling back to templated content.', {
          jobId: job.id,
          userId,
        });
      } else {
        await job.updateProgress({ stage: 'building_prompt', percent: 45 });
        const prompt = composeContentPrompt({
          keyword,
          rule,
          knowledgeBaseContent,
          imageDetails,
          schemaConfig: mergedSchemaConfig,
          entitySchemaData: resolvedSchemaEntities,
        });

        try {
          const isGemini = config.ai.provider === 'gemini';
          const payload = isGemini
            ? {
                contents: [
                  {
                    role: 'user',
                    parts: [{ text: prompt }],
                  },
                ],
                // 增加响应格式约束
                generationConfig: {
                  temperature: 0.7,
                  topK: 40,
                  topP: 0.95,
                  maxOutputTokens: 8192,
                  responseMimeType: 'application/json',
                },
              }
            : {
                model: config.ai.chatModel,
                messages: [
                  {
                    role: 'system',
                    content: 'You are a helpful content generation assistant. Always respond with valid JSON only.',
                  },
                  { role: 'user', content: prompt },
                ],
                temperature: 0.7,
                max_tokens: 4000,
              };

          // OpenAI格式响应格式约束
          if (!isGemini && config.ai.useResponseFormat) {
            payload.response_format = { type: 'json_object' };
          }

          logger.info('Sending AI request', {
            jobId: job.id,
            provider: config.ai.provider,
            model: config.ai.chatModel,
            promptLength: prompt.length,
          });

          const aiResponse = await aiClient.post(resolveChatPath(config.ai.chatPath), payload);
          await job.updateProgress({ stage: 'awaiting_ai_response', percent: 65 });

          // 增强的响应处理
          try {
            const rawMessage = extractMessagePayload(aiResponse?.data);

            if (!rawMessage) {
              throw new Error('No valid message content found in AI response');
            }

            logger.info('Extracted AI message', {
              jobId: job.id,
              messageLength: rawMessage.length,
              messagePreview: rawMessage.slice(0, 200),
            });

            const sanitizedContent = normalizeJsonContent(rawMessage);

            if (!sanitizedContent) {
              throw new Error('Failed to extract valid JSON from AI response');
            }

            logger.info('Sanitized AI response', {
              jobId: job.id,
              sanitizedLength: sanitizedContent.length,
              sanitizedPreview: sanitizedContent.slice(0, 200),
            });

            // 使用安全的JSON解析
            generatedContent = safeJsonParse(sanitizedContent, `Job ${job.id} AI response`);

            // 验证生成内容的结构
            if (!generatedContent || typeof generatedContent !== 'object') {
              throw new Error('AI response is not a valid object');
            }

            if (!generatedContent.title || !generatedContent.body) {
              throw new Error('AI response missing required fields (title, body)');
            }

            logger.info('Successfully parsed AI response', {
              jobId: job.id,
              hasTitle: !!generatedContent.title,
              hasBody: !!generatedContent.body,
              hasMeta: !!generatedContent.meta_description,
              bodyLength: generatedContent.body?.length || 0,
            });

          } catch (parseErr) {
            fallbackReason = `AI response parsing failed: ${parseErr.message}`;
            logger.error('Failed to parse AI response', {
              error: parseErr.message,
              jobId: job.id,
              response: aiResponse.data,
              responseHeaders: aiResponse.headers,
            });

            // 记录详细的响应信息用于调试
            if (aiResponse?.data) {
              logger.debug('AI Response Debug Data', {
                jobId: job.id,
                dataType: typeof aiResponse.data,
                dataKeys: Object.keys(aiResponse.data),
                dataString: JSON.stringify(aiResponse.data, null, 2),
              });
            }
          }
        } catch (aiErr) {
          fallbackReason = aiErr?.response?.data?.error?.message || aiErr.message || 'AI request failed.';
          logger.error('AI request failed, falling back to templated content', {
            error: fallbackReason,
            jobId: job.id,
            userId,
            errorCode: aiErr?.response?.status,
            errorDetails: aiErr?.response?.data,
          });
        }
      }

      const safeContent = ensureStructuredContent(generatedContent, keyword, rule, knowledgeBaseContent, selectedImages);

      // ... [保留原有的其他处理逻辑] ...

      await job.updateProgress({ stage: 'completed', percent: 100, fallback: Boolean(fallbackReason) });
      logger.info(`Job ${job.id} completed successfully.`, {
        hasFallback: !!fallbackReason,
        fallbackReason,
      });

      return {
        ...persisted,
        fallbackReason,
        knowledgeSource,
        selectedImages: selectedImages.map((img) => ({
          id: img.id,
          image_name: img.image_name,
          image_path: img.image_path,
          tags: img.tags,
        })),
      };
    } catch (err) {
      try {
        await job.updateProgress({ stage: 'failed', percent: 100, error: err.message });
      } catch (progressErr) {
        logger.warn('Failed to update job progress after error', {
          jobId: job.id,
          error: progressErr.message,
        });
      }
      logger.error(`Job ${job.id} failed`, {
        error: err.message,
        jobId: job.id,
        userId,
        stack: err.stack,
      });
      throw err;
    }
  },
  {
    connection,
    concurrency: config.queue.concurrency,
    lockDuration: config.queue.timeoutMs,
    // 添加Worker的错误处理
    settings: {
      stalledInterval: 30000,
      maxStalledCount: 1,
    },
  }
);

// 增强的Worker事件监听
worker.on('failed', (job, err) => {
  logger.error('Content generation job failed', {
    jobId: job.id,
    error: err.message,
    stack: err.stack,
    data: job.data,
  });
});

worker.on('stalled', (jobId) => {
  logger.warn('Content generation job stalled', {
    jobId,
    timestamp: new Date().toISOString(),
  });
});

worker.on('completed', (job) => {
  logger.info('Content generation job completed', {
    jobId: job.id,
    returnValue: job.returnvalue,
  });
});

worker.on('error', (err) => {
  logger.error('Worker encountered an error', {
    error: err.message,
    stack: err.stack,
  });
});

logger.info('Enhanced worker started with improved AI response parsing', {
  redisConfig: connection ? 'configured' : 'fallback',
  aiProvider: config.ai.provider,
  aiModel: config.ai.chatModel,
});