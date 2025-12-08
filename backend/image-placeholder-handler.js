/**
 * 图片占位符处理器
 * 解决 "IMAGE_X is not defined" 错误
 */

class ImagePlaceholderHandler {
  constructor() {
    this.placeholderRegex = /\[IMAGE_(\d+)\]/g;
  }

  /**
   * 替换内容中的图片占位符为实际图片HTML
   * @param {string} content - 包含占位符的内容
   * @param {Array} images - 图片信息数组
   * @param {Object} options - 格式化选项
   * @returns {string} 处理后的内容
   */
  replacePlaceholders(content, images = [], options = {}) {
    if (!content || !images.length) {
      return content;
    }

    const {
      imageTemplate = '<img src="{imagePath}" alt="{imageName}" class="content-image" data-image-id="{imageId}" />',
      wrapperTemplate = '<div class="image-wrapper">{image}{caption}</div>',
      showCaption = true,
      captionTemplate = '<p class="image-caption">{imageName}</p>'
    } = options;

    let result = content;
    const matches = [...content.matchAll(this.placeholderRegex)];

    // 记录找到的占位符
    console.log(`Found ${matches.length} image placeholders:`, matches.map(m => m[0]));

    matches.forEach((match, index) => {
      const placeholder = match[0];
      const imageNumber = parseInt(match[1]);
      const imageIndex = imageNumber - 1; // 转换为0-based索引

      if (imageIndex < images.length && images[imageIndex]) {
        const image = images[imageIndex];
        const imageHtml = imageTemplate
          .replace('{imageId}', image.id || '')
          .replace('{imagePath}', image.image_path || image.url || '')
          .replace('{imageName}', image.image_name || image.name || `Image ${imageNumber}`)
          .replace('{imageTags}', image.tags ? image.tags.join(', ') : '');

        let finalImageHtml = imageHtml;

        if (showCaption) {
          const caption = captionTemplate
            .replace('{imageName}', image.image_name || image.name || `Image ${imageNumber}`);
          finalImageHtml = wrapperTemplate
            .replace('{image}', imageHtml)
            .replace('{caption}', caption);
        }

        result = result.replace(placeholder, finalImageHtml);

        console.log(`Replaced ${placeholder} with image: ${image.image_name}`);
      } else {
        // 如果找不到对应图片，移除占位符或添加注释
        const replacement = options.removeOrphaned ? '' : `<!-- Image ${imageNumber} not found -->`;
        result = result.replace(placeholder, replacement);
        console.warn(`Image ${imageNumber} not found in provided images array`);
      }
    });

    return result;
  }

  /**
   * 验证占位符格式
   * @param {string} content - 要验证的内容
   * @returns {Object} 验证结果
   */
  validatePlaceholders(content) {
    if (!content) {
      return { valid: true, placeholders: [] };
    }

    const placeholders = [...content.matchAll(this.placeholderRegex)];
    const issues = [];

    placeholders.forEach((match) => {
      const imageNumber = parseInt(match[1]);
      if (isNaN(imageNumber) || imageNumber < 1) {
        issues.push({
          placeholder: match[0],
          issue: 'Invalid image number'
        });
      }
    });

    return {
      valid: issues.length === 0,
      placeholders: placeholders.map(m => m[0]),
      issues
    };
  }

  /**
   * 提取内容中的所有图片占位符
   * @param {string} content - 内容文本
   * @returns {Array} 占位符数组
   */
  extractPlaceholders(content) {
    if (!content) {
      return [];
    }
    const matches = content.match(this.placeholderRegex);
    return matches || [];
  }

  /**
   * 生成图片说明文本
   * @param {Array} images - 图片数组
   * @returns {string} 图片说明文本
   */
  generateImageGuidance(images) {
    if (!images.length) {
      return 'No images available for this content.';
    }

    return images.map((image, index) => {
      const tags = image.tags && image.tags.length ?
        `Tags: ${image.tags.join(', ')}` : 'No tags';
      return `IMAGE_${index + 1}: ${image.image_name} - ${tags}`;
    }).join('\n');
  }
}

module.exports = ImagePlaceholderHandler;