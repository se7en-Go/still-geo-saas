/**
 * Worker图片处理修复补丁
 * 解决占位符处理和变量作用域问题
 */

const ImagePlaceholderHandler = require('./image-placeholder-handler');

class WorkerImageProcessor {
  constructor() {
    this.placeholderHandler = new ImagePlaceholderHandler();
  }

  /**
   * 处理生成内容中的图片占位符
   * @param {Object} params - 处理参数
   * @param {string} params.content - 原始内容
   * @param {Array} params.images - 图片数组
   * @param {Object} params.options - 处理选项
   * @returns {Object} 处理结果
   */
  async processContentImages({ content, images, options = {} }) {
    try {
      // 验证输入
      if (!content || typeof content !== 'string') {
        throw new Error('Invalid content provided');
      }

      if (!Array.isArray(images)) {
        logger.warn('No images provided, returning original content');
        return { content, placeholders: [], processed: 0 };
      }

      // 提取占位符
      const placeholders = this.placeholderHandler.extractPlaceholders(content);

      if (placeholders.length === 0) {
        logger.info('No image placeholders found in content');
        return { content, placeholders: [], processed: 0 };
      }

      logger.info(`Processing ${placeholders.length} image placeholders with ${images.length} images`);

      // 验证占位符
      const validation = this.placeholderHandler.validatePlaceholders(content);
      if (!validation.valid) {
        logger.warn('Invalid placeholders found', { issues: validation.issues });
      }

      // 替换占位符
      const processedContent = this.placeholderHandler.replacePlaceholders(
        content,
        images,
        {
          showCaption: options.showCaption !== false,
          imageTemplate: options.imageTemplate || this.getDefaultImageTemplate(),
          wrapperTemplate: options.wrapperTemplate || this.getDefaultWrapperTemplate(),
          captionTemplate: options.captionTemplate || this.getDefaultCaptionTemplate(),
          removeOrphaned: options.removeOrphaned !== false
        }
      );

      return {
        content: processedContent,
        placeholders: validation.placeholders,
        processed: placeholders.length,
        imagesUsed: Math.min(placeholders.length, images.length)
      };

    } catch (error) {
      logger.error('Error processing content images', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * 获取默认图片模板
   */
  getDefaultImageTemplate() {
    return '<img src="{imagePath}" alt="{imageName}" class="content-image" style="max-width: 100%; height: auto;" />';
  }

  /**
   * 获取默认包装器模板
   */
  getDefaultWrapperTemplate() {
    return '<div class="image-container" style="margin: 20px 0; text-align: center;">{image}{caption}</div>';
  }

  /**
   * 获取默认标题模板
   */
  getDefaultCaptionTemplate() {
    return '<p class="image-caption" style="margin-top: 10px; font-style: italic; color: #666;">{imageName}</p>';
  }

  /**
   * 生成图片指引文本（用于AI提示词）
   * @param {Array} images - 图片数组
   * @returns {string} 指引文本
   */
  generateImageGuidance(images) {
    if (!images || !images.length) {
      return 'No images are available for this content.';
    }

    const guidance = images.map((image, index) => {
      const tags = image.tags && image.tags.length ?
        `Tags: ${image.tags.join(', ')}` : 'No tags';
      return `IMAGE_${index + 1}: ${image.image_name || `Image ${index + 1}`} - ${tags}`;
    }).join('\n');

    return `Available images for reference:\n${guidance}\n\nInstructions: Use [IMAGE_1], [IMAGE_2], etc. as placeholders in your content. These will be automatically replaced with actual images.`;
  }

  /**
   * 修复已生成内容中的图片引用
   * @param {Object} generatedContent - AI生成的内容对象
   * @param {Array} selectedImages - 选中的图片
   * @returns {Object} 修复后的内容
   */
  fixContentImages(generatedContent, selectedImages = []) {
    try {
      if (!generatedContent) {
        return generatedContent;
      }

      const result = { ...generatedContent };

      // 处理body中的图片
      if (result.body) {
        const bodyProcess = this.placeholderHandler.replacePlaceholders(
          result.body,
          selectedImages,
          {
            showCaption: true,
            removeOrphaned: true
          }
        );
        result.body = bodyProcess;
        logger.info(`Processed ${this.placeholderHandler.extractPlaceholders(generatedContent.body).length} image placeholders in body`);
      }

      // 处理其他可能包含占位符的字段
      ['summary', 'description', 'introduction'].forEach(field => {
        if (result[field] && typeof result[field] === 'string') {
          const fieldProcess = this.placeholderHandler.replacePlaceholders(
            result[field],
            selectedImages,
            { removeOrphaned: true }
          );
          result[field] = fieldProcess;
        }
      });

      // 添加图片元数据
      if (selectedImages.length > 0) {
        result.images = selectedImages.map(img => ({
          id: img.id,
          name: img.image_name,
          path: img.image_path,
          tags: img.tags || []
        }));
        result.imageCount = selectedImages.length;
      }

      return result;

    } catch (error) {
      logger.error('Error fixing content images', {
        error: error.message,
        contentKeys: Object.keys(generatedContent || {})
      });
      return generatedContent;
    }
  }
}

// 导出单例实例
const imageProcessor = new WorkerImageProcessor();

module.exports = {
  WorkerImageProcessor,
  imageProcessor
};