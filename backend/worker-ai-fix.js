// AI响应解析修复 - 增强错误处理和兼容性

/**
 * 增强的AI响应提取函数
 * 支持更多AI提供商和响应格式
 */
function extractMessagePayload(data) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  // 1. 检查直接内容字段
  for (const field of ['content', 'result', 'text']) {
    if (typeof data[field] === 'string' && data[field].trim()) {
      return data[field].trim();
    }
  }

  // 2. OpenAI格式响应
  if (data.choices && Array.isArray(data.choices)) {
    const choice = data.choices[0];
    if (choice?.message?.content) {
      return typeof choice.message.content === 'string' ? choice.message.content.trim() : null;
    }
  }

  // 3. Gemini格式响应 - 增强处理
  if (data.candidates && Array.isArray(data.candidates)) {
    for (const candidate of data.candidates) {
      if (candidate.content) {
        // 处理parts数组
        if (Array.isArray(candidate.content.parts)) {
          const textParts = candidate.content.parts
            .filter(part => part && typeof part.text === 'string')
            .map(part => part.text)
            .join('');

          if (textParts.trim()) {
            return textParts.trim();
          }
        }

        // 直接处理content字段
        if (typeof candidate.content === 'string' && candidate.content.trim()) {
          return candidate.content.trim();
        }
      }
    }
  }

  // 4. Claude格式响应
  if (data.content && Array.isArray(data.content)) {
    const textContent = data.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('');

    if (textContent.trim()) {
      return textContent.trim();
    }
  }

  // 5. 通用文本提取
  const allTextValues = [];

  function extractTextRecursively(obj, depth = 0, maxDepth = 5) {
    if (depth > maxDepth) return;

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string' && value.trim() && value.length > 10) {
        // 过滤可能的元数据字段
        if (!['id', 'role', 'model', 'created', 'object', 'usage'].includes(key.toLowerCase())) {
          allTextValues.push(value.trim());
        }
      } else if (typeof value === 'object' && value !== null) {
        extractTextRecursively(value, depth + 1, maxDepth);
      }
    }
  }

  extractTextRecursively(data);

  // 返回最长的文本内容
  if (allTextValues.length > 0) {
    return allTextValues.reduce((longest, current) =>
      current.length > longest.length ? current : longest
    );
  }

  return null;
}

/**
 * 增强的JSON内容规范化
 * 更好地处理各种JSON格式
 */
function normalizeJsonContent(raw) {
  if (typeof raw !== 'string') {
    return null;
  }

  let content = raw.trim();
  if (!content) {
    return null;
  }

  // 1. 移除代码块标记
  const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    content = fenceMatch[1].trim();
  }

  // 2. 清理常见的AI响应前缀/后缀
  content = content
    .replace(/^(Here is|Below is|The following is).*?:/i, '')
    .replace(/```json\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  // 3. 查找JSON对象
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const jsonCandidate = content.slice(firstBrace, lastBrace + 1);

    // 尝试解析找到的JSON
    try {
      JSON.parse(jsonCandidate);
      return jsonCandidate;
    } catch (e) {
      // 继续尝试其他方法
    }
  }

  // 4. 查找JSON数组
  const firstBracket = content.indexOf('[');
  const lastBracket = content.lastIndexOf(']');

  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    const jsonCandidate = content.slice(firstBracket, lastBracket + 1);

    try {
      JSON.parse(jsonCandidate);
      return jsonCandidate;
    } catch (e) {
      // 继续尝试其他方法
    }
  }

  // 5. 尝试修复常见的JSON错误
  try {
    // 修复单引号问题
    let fixedContent = content.replace(/'/g, '"');

    // 修复尾随逗号
    fixedContent = fixedContent.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');

    // 尝试解析修复后的内容
    JSON.parse(fixedContent);
    return fixedContent;
  } catch (e) {
    // 最后尝试：如果内容本身就是有效的JSON
    if (content.startsWith('{') || content.startsWith('[')) {
      return content;
    }
  }

  return null;
}

/**
 * 安全的JSON解析函数
 * 提供详细的错误信息
 */
function safeJsonParse(jsonString, context = '') {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    // 提供详细的错误信息
    const errorInfo = {
      message: error.message,
      context,
      jsonLength: jsonString?.length || 0,
      jsonStart: jsonString?.slice(0, 100) || '',
      possibleIssues: []
    };

    // 检查常见的JSON问题
    if (jsonString) {
      if (jsonString.includes("'")) {
        errorInfo.possibleIssues.push('Single quotes instead of double quotes');
      }
      if (jsonString.includes(',}') || jsonString.includes(',]')) {
        errorInfo.possibleIssues.push('Trailing commas');
      }
      if (!jsonString.trim().startsWith('{') && !jsonString.trim().startsWith('[')) {
        errorInfo.possibleIssues.push('Does not start with { or [');
      }
    }

    throw new Error(`JSON Parse Error: ${error.message}. Issues: ${errorInfo.possibleIssues.join(', ')}`);
  }
}

module.exports = {
  extractMessagePayload,
  normalizeJsonContent,
  safeJsonParse,
};