/**
 * Generate public/schema/scenario.schema.json from src/types.ts so the
 * published authoring contract always matches what the app accepts.
 * Accepts either a bare Scenario or the exported ScenarioFile wrapper.
 */
import { createGenerator } from 'ts-json-schema-generator';
import { mkdirSync, writeFileSync } from 'node:fs';

const scenario = createGenerator({
  path: 'src/types.ts',
  tsconfig: 'tsconfig.app.json',
  type: 'Scenario',
  expose: 'export',
  topRef: false,
  jsDoc: 'extended',
  skipTypeCheck: true,
}).createSchema('Scenario');

const { definitions, $schema, ...scenarioBody } = scenario;

const schema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://noahdemar.github.io/conflict-sandbox/schema/scenario.schema.json',
  title: 'Conflict Sandbox scenario',
  description:
    'A battle-map scenario for Conflict Sandbox. Either a bare Scenario object, or the exported file wrapper {format, version, duration, roster, scenario}. Times are timeline seconds; coordinates are [longitude, latitude] or {lat, lng}.',
  oneOf: [{ $ref: '#/definitions/ScenarioFile' }, { $ref: '#/definitions/Scenario' }],
  definitions: {
    ...definitions,
    Scenario: scenarioBody,
    RosterEntry: {
      type: 'object',
      required: ['id', 'name', 'type'],
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        name: { type: 'string', description: 'Also drives the unit silhouette, e.g. "T-72 Tank", "AH-64 Apache", "MQ-9 Reaper".' },
        type: { $ref: '#/definitions/UnitType' },
        faction: { type: 'string' },
        modelUrl: { type: 'string' },
        modelYaw: { type: 'number' },
        rangeKm: { type: 'number' },
        imageUrl: { type: 'string' },
        wikiTitle: { type: 'string' },
      },
    },
    ScenarioFile: {
      type: 'object',
      required: ['format', 'scenario'],
      additionalProperties: false,
      properties: {
        format: { const: 'conflict-sandbox-scenario' },
        version: { type: 'number' },
        exportedAt: { type: 'string' },
        duration: { type: 'number', description: 'Timeline length in seconds.' },
        roster: { type: 'array', items: { $ref: '#/definitions/RosterEntry' } },
        scenario: { $ref: '#/definitions/Scenario' },
      },
    },
  },
};

mkdirSync('public/schema', { recursive: true });
writeFileSync('public/schema/scenario.schema.json', JSON.stringify(schema, null, 2) + '\n');
console.log('wrote public/schema/scenario.schema.json with', Object.keys(schema.definitions).length, 'definitions');
