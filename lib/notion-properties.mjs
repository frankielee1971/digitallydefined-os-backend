/**
 * lib/notion-properties.mjs
 *
 * Helper functions for building Notion property payloads.
 * These functions create properly formatted property configurations
 * for use with the Notion API.
 */

// ---------------------------------------------------------------------------
// Relation Property Helpers
// ---------------------------------------------------------------------------

/**
 * Build a relation property payload.
 *
 * @param {string} propertyName - Name of the property
 * @param {string} databaseId - ID of the database to relate to
 * @returns {object} Notion property configuration
 */
export function buildRelationPropertyPayload(propertyName, databaseId) {
  return {
    [propertyName]: {
      relation: {
        database_id: databaseId,
      },
    },
  };
}

/**
 * Build a relation property payload with multiple database references.
 *
 * @param {string} propertyName - Name of the property
 * @param {string[]} databaseIds - Array of database IDs to relate to
 * @returns {object} Notion property configuration
 */
export function buildMultiRelationPropertyPayload(propertyName, databaseIds) {
  return {
    [propertyName]: {
      relation: {
        database_ids: databaseIds,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Status Property Helpers
// ---------------------------------------------------------------------------

/**
 * Build a status property payload with options.
 *
 * @param {string} propertyName - Name of the property
 * @param {Array<{name: string, color?: string}>} options - Status options
 * @returns {object} Notion property configuration
 */
export function buildStatusPropertyPayload(propertyName, options) {
  const statusOptions = options.map(opt => {
    const option = { name: opt.name };
    if (opt.color) {
      option.color = opt.color;
    }
    return option;
  });

  return {
    [propertyName]: {
      status: {
        options: statusOptions,
      },
    },
  };
}

/**
 * Build a status property payload with a default option.
 *
 * @param {string} propertyName - Name of the property
 * @param {Array<{name: string, color?: string}>} options - Status options
 * @param {string} defaultOption - Name of the default option
 * @returns {object} Notion property configuration
 */
export function buildStatusPropertyWithDefaultPayload(propertyName, options, defaultOption) {
  const statusOptions = options.map(opt => {
    const option = { name: opt.name };
    if (opt.color) {
      option.color = opt.color;
    }
    if (opt.name === defaultOption) {
      option.color = opt.color || 'blue';
    }
    return option;
  });

  return {
    [propertyName]: {
      status: {
        options: statusOptions,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Select Property Helpers
// ---------------------------------------------------------------------------

/**
 * Build a select property payload with options.
 *
 * @param {string} propertyName - Name of the property
 * @param {Array<{name: string, color?: string}>} options - Select options
 * @returns {object} Notion property configuration
 */
export function buildSelectPropertyPayload(propertyName, options) {
  const selectOptions = options.map(opt => {
    const option = { name: opt.name };
    if (opt.color) {
      option.color = opt.color;
    }
    return option;
  });

  return {
    [propertyName]: {
      select: {
        options: selectOptions,
      },
    },
  };
}

/**
 * Build a select property payload with a default option.
 *
 * @param {string} propertyName - Name of the property
 * @param {Array<{name: string, color?: string}>} options - Select options
 * @param {string} defaultOption - Name of the default option
 * @returns {object} Notion property configuration
 */
export function buildSelectPropertyWithDefaultPayload(propertyName, options, defaultOption) {
  const selectOptions = options.map(opt => {
    const option = { name: opt.name };
    if (opt.color) {
      option.color = opt.color;
    }
    return option;
  });

  return {
    [propertyName]: {
      select: {
        options: selectOptions,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Multi-select Property Helpers
// ---------------------------------------------------------------------------

/**
 * Build a multi-select property payload with options.
 *
 * @param {string} propertyName - Name of the property
 * @param {Array<{name: string, color?: string}>} options - Multi-select options
 * @returns {object} Notion property configuration
 */
export function buildMultiSelectPropertyPayload(propertyName, options) {
  const multiSelectOptions = options.map(opt => {
    const option = { name: opt.name };
    if (opt.color) {
      option.color = opt.color;
    }
    return option;
  });

  return {
    [propertyName]: {
      multi_select: {
        options: multiSelectOptions,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Common Property Configurations
// ---------------------------------------------------------------------------

/**
 * Build a standard set of status options for common use cases.
 */
export const COMMON_STATUS_OPTIONS = {
  task: [
    { name: 'Inbox', color: 'gray' },
    { name: 'Next', color: 'red' },
    { name: 'Waiting', color: 'yellow' },
    { name: 'Done', color: 'green' },
  ],
  project: [
    { name: 'Draft', color: 'gray' },
    { name: 'Build', color: 'orange' },
    { name: 'Live', color: 'green' },
    { name: 'Archived', color: 'brown' },
  ],
  idea: [
    { name: 'Intake', color: 'gray' },
    { name: 'Researching', color: 'blue' },
    { name: 'BuildQueue', color: 'yellow' },
    { name: 'Live', color: 'green' },
    { name: 'Stale', color: 'red' },
  ],
  automation: [
    { name: 'Queued', color: 'gray' },
    { name: 'Running', color: 'blue' },
    { name: 'Succeeded', color: 'green' },
    { name: 'Failed', color: 'red' },
    { name: 'Dead Letter', color: 'brown' },
  ],
};

/**
 * Build a standard set of select options for common use cases.
 */
export const COMMON_SELECT_OPTIONS = {
  priority: [
    { name: 'Low', color: 'gray' },
    { name: 'Medium', color: 'yellow' },
    { name: 'High', color: 'orange' },
    { name: 'Critical', color: 'red' },
  ],
  category: [
    { name: 'Product', color: 'blue' },
    { name: 'Marketing', color: 'green' },
    { name: 'Sales', color: 'orange' },
    { name: 'Support', color: 'purple' },
  ],
};