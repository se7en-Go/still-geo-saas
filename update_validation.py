from pathlib import Path
path = Path("backend/validation.js")
text = path.read_text()
old = "  bulkDeleteVariations: Joi.object({\r\n    variationIds: Joi.array().items(Joi.number().integer()).min(1).required(),\r\n  }),\r\n};\r\n\r\nconst imageSchemas"
replacement = "  bulkDeleteVariations: Joi.object({\r\n    variationIds: Joi.array().items(Joi.number().integer()).min(1).required(),\r\n  }),\r\n  generateSchemaSuggestion: Joi.object({\r\n    brand: Joi.string().trim().allow('', null),\r\n    sku: Joi.string().trim().allow('', null),\r\n    productUrl: Joi.string().uri().allow('', null),\r\n    notes: Joi.string().trim().allow('', null),\r\n  }),\r\n};\r\n\r\nconst imageSchemas"
if old not in text:
    raise SystemExit('old block not found')
text = text.replace(old, replacement, 1)
old2 = "const keywordSchemaMetadataSchemas = {\r\n  updateKeywordSchema: Joi.object({\r\n    schemaMetadata: schemaMetadataSchema.required(),\r\n  }),\r\n  updateVariationSchema: Joi.object({\r\n    schemaMetadata: schemaMetadataSchema.required(),\r\n  }),\r\n};"
replacement2 = "const keywordSchemaMetadataSchemas = {\r\n  updateKeywordSchema: Joi.object({\r\n    schemaMetadata: schemaMetadataSchema.required(),\r\n  }),\r\n  updateVariationSchema: Joi.object({\r\n    schemaMetadata: schemaMetadataSchema.required(),\r\n  }),\r\n  generateKeywordSchemaSuggestion: Joi.object({\r\n    brand: Joi.string().trim().allow('', null),\r\n    sku: Joi.string().trim().allow('', null),\r\n    productUrl: Joi.string().uri().allow('', null),\r\n    notes: Joi.string().trim().allow('', null),\r\n  }),\r\n  generateVariationSchemaSuggestion: Joi.object({\r\n    brand: Joi.string().trim().allow('', null),\r\n    sku: Joi.string().trim().allow('', null),\r\n    productUrl: Joi.string().uri().allow('', null),\r\n    notes: Joi.string().trim().allow('', null),\r\n  }),\r\n};"
if old2 not in text:
    raise SystemExit('old2 block not found')
text = text.replace(old2, replacement2, 1)
path.write_text(text)
