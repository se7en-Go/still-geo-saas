const Joi = require('joi');
const AppError = require('./utils/appError');

const validate = (schema) => (req, _res, next) => {
  const { error } = schema.validate(req.body, { abortEarly: true, stripUnknown: true });
  if (error) {
    return next(new AppError(error.details[0].message, 400));
  }
  next();
};

const schemaMetadataSchema = Joi.object().unknown(true);
const schemaAiPromptSchema = Joi.object({
  hint: Joi.string().max(1000).allow('', null),
  productUrl: Joi.string().uri().max(2048).allow('', null),
  productBrand: Joi.string().max(255).allow('', null),
  productSku: Joi.string().max(255).allow('', null),
});

const schemaFieldSchema = Joi.object({
  key: Joi.string().trim().min(1).required(),
  label: Joi.string().trim().allow('', null),
  description: Joi.string().trim().allow('', null),
  type: Joi.string()
    .valid('string', 'number', 'url', 'enum', 'richtext', 'faq', 'list', 'boolean', 'object')
    .default('string'),
  required: Joi.boolean().default(false),
  options: Joi.array().items(Joi.string()).max(50),
  example: Joi.alternatives(Joi.string(), Joi.number(), Joi.boolean(), Joi.object(), Joi.array()).optional(),
  defaultValue: Joi.alternatives(Joi.string(), Joi.number(), Joi.boolean(), Joi.object(), Joi.array()).optional(),
});

const schemaTemplateSchema = Joi.object({
  type: Joi.string().trim().min(1).required(),
  label: Joi.string().trim().allow('', null),
  description: Joi.string().trim().allow('', null),
  version: Joi.string().trim().allow('', null),
  fields: Joi.array().items(schemaFieldSchema).max(50).default([]),
  jsonSchema: Joi.object().unknown(true),
  examplePayload: Joi.object().unknown(true),
});

const schemaConfigSchema = Joi.object({
  enabled: Joi.boolean().default(true),
  enabledTypes: Joi.array().items(Joi.string().trim().min(1)).max(20).default([]),
  schemaTemplates: Joi.object()
    .pattern(Joi.string().trim().min(1), schemaTemplateSchema)
    .default({}),
  customFields: Joi.object().unknown(true),
  advanced: Joi.object({
    fallbackBehavior: Joi.string().valid('omit', 'template', 'raw'),
    allowMultiple: Joi.boolean(),
    experimental: Joi.array().items(Joi.string().trim().min(1)),
  }).unknown(true),
}).unknown(true);

const authSchemas = {
  register: Joi.object({
    username: Joi.string().min(3).max(30).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).max(64).required(),
  }),
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).max(64).required(),
  }),
  adminCreateUser: Joi.object({
    username: Joi.string().min(3).max(30).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(12).max(64).pattern(/[A-Z]/).pattern(/[a-z]/).pattern(/[0-9]/).pattern(/[^A-Za-z0-9]/)
      .messages({
        'string.pattern.base': 'Password must include upper, lower, number, and special characters.',
      })
      .required(),
    role: Joi.string().valid('admin', 'user').default('user'),
  }),
  resetPassword: Joi.object({
    password: Joi.string().min(12).max(64).pattern(/[A-Z]/).pattern(/[a-z]/).pattern(/[0-9]/).pattern(/[^A-Za-z0-9]/)
      .messages({
        'string.pattern.base': 'Password must include upper, lower, number, and special characters.',
      })
      .required(),
  }),
};

const keywordSchemas = {
  addKeyword: Joi.object({
    base_keyword: Joi.string().trim().min(1).required(),
  }),
  expandKeyword: Joi.object({
    base_keyword: Joi.string().trim().min(1).required(),
  }),
  updateVariation: Joi.object({
    name: Joi.string().trim().min(1).max(255),
    monthly_search_volume: Joi.number().integer().min(0).allow(null),
    weight: Joi.number().integer().min(0).max(100).allow(null),
  }).min(1),
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(100).default(10),
    search: Joi.string().allow('', null),
  }),
  bulkImport: Joi.object({
    keywords: Joi.array()
      .items(
        Joi.object({
          base_keyword: Joi.string().trim().min(1).required(),
          variations: Joi.array()
            .items(
              Joi.object({
                name: Joi.string().trim().min(1).required(),
                monthly_search_volume: Joi.number().integer().min(0).allow(null),
                weight: Joi.number().integer().min(0).max(100).allow(null),
              })
            )
            .max(50)
            .default([]),
        })
      )
      .min(1)
      .max(200)
      .required(),
    overrideExisting: Joi.boolean().default(false),
  }),
  bulkUpdateVariations: Joi.object({
    variationIds: Joi.array().items(Joi.number().integer()).min(1).required(),
    monthly_search_volume: Joi.number().integer().min(0).allow(null),
    weight: Joi.number().integer().min(0).max(100).allow(null),
  }).or('monthly_search_volume', 'weight'),
};

const imageSchemas = {
  updateImage: Joi.object({
    image_name: Joi.string().min(1),
    tags: Joi.array().items(Joi.string()),
    collection_id: Joi.number().integer().allow(null),
  }).or('image_name', 'tags', 'collection_id'),
};

const ruleSchemas = {
  createRule: Joi.object({
    rule_name: Joi.string().min(1).required(),
    source_settings: Joi.object().unknown(true),
    style_settings: Joi.object().unknown(true),
    seo_settings: Joi.object().unknown(true),
    media_settings: Joi.object().unknown(true),
    ranking_settings: Joi.object().unknown(true),
    schemaConfig: schemaConfigSchema,
  }),
  updateRule: Joi.object({
    rule_name: Joi.string().min(1),
    source_settings: Joi.object().unknown(true),
    style_settings: Joi.object().unknown(true),
    seo_settings: Joi.object().unknown(true),
    media_settings: Joi.object().unknown(true),
    ranking_settings: Joi.object().unknown(true),
    schemaConfig: schemaConfigSchema,
  }),
};

const schemaEntityMetadata = Joi.object({
  id: Joi.number().integer().allow(null),
  schemaMetadata: schemaMetadataSchema,
  type: Joi.string().trim().allow('', null),
}).unknown(true);

const schemaEntitiesSchema = Joi.object({
  keyword: schemaEntityMetadata,
  variation: schemaEntityMetadata,
  knowledgeBase: schemaEntityMetadata,
  documents: Joi.array().items(schemaEntityMetadata),
  custom: Joi.array().items(schemaEntityMetadata),
}).unknown(true);

const contentGenerationSchemas = {
  generateContent: Joi.object({
    keyword: Joi.string().min(1).required(),
    knowledgeBaseId: Joi.number().integer().allow('', null),
    imageIds: Joi.array().items(Joi.number().integer()),
    imageCollectionId: Joi.number().integer().allow(null),
    imageTags: Joi.array().items(Joi.string()),
    imageCount: Joi.number().integer().min(0).allow(null),
    ruleId: Joi.number().integer().required(),
    schemaConfig: schemaConfigSchema,
    schemaEntities: schemaEntitiesSchema,
    schemaOverrides: Joi.object().unknown(true),
  }),
};

const contentScheduleSchemas = {
  createSchedule: Joi.object({
    content_id: Joi.number().integer().required(),
    platform: Joi.string().min(1).required(),
    publish_at: Joi.date().iso().required(),
  }),
};

const imageCollectionSchemas = {
  create: Joi.object({
    name: Joi.string().min(1).max(255).required(),
    description: Joi.string().allow('', null),
  }),
  update: Joi.object({
    name: Joi.string().min(1).max(255),
    description: Joi.string().allow('', null),
  }).or('name', 'description'),
};

const keywordSchemaMetadataSchemas = {
  updateKeywordSchema: Joi.object({
    schemaMetadata: schemaMetadataSchema.required(),
  }),
  updateVariationSchema: Joi.object({
    schemaMetadata: schemaMetadataSchema.required(),
  }),
  generateKeywordSchemaAi: schemaAiPromptSchema.default({}),
  generateVariationSchemaAi: schemaAiPromptSchema.default({}),
};

const documentSchemas = {
  updateSchemaMetadata: Joi.object({
    schemaMetadata: schemaMetadataSchema.required(),
  }),
};

const knowledgeSetSchemas = {
  create: Joi.object({
    name: Joi.string().min(1).max(255).required(),
    description: Joi.string().allow('', null),
    schemaMetadata: schemaMetadataSchema.allow(null),
  }),
  update: Joi.object({
    name: Joi.string().min(1).max(255),
    description: Joi.string().allow('', null),
    schemaMetadata: schemaMetadataSchema.allow(null),
  }).or('name', 'description', 'schemaMetadata'),
};

module.exports = {
  validate,
  authSchemas,
  keywordSchemas,
  keywordSchemaMetadataSchemas,
  imageSchemas,
  ruleSchemas,
  contentGenerationSchemas,
  contentScheduleSchemas,
  imageCollectionSchemas,
  documentSchemas,
  knowledgeSetSchemas,
};
