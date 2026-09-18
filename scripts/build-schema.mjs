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

/**
 * The authoring layer: the same document with symbolic places, relative
 * times, macros, beats and "keyframes": "auto". It is a superset of the plain
 * format, so a finished scenario file also validates against it.
 */
const authoring = createGenerator({
  path: 'src/authoring/types.ts',
  tsconfig: 'tsconfig.app.json',
  type: 'AuthoringDocument',
  expose: 'export',
  topRef: false,
  jsDoc: 'extended',
  skipTypeCheck: true,
}).createSchema('AuthoringDocument');

const { definitions: authoringDefs, $schema: _authoringSchema, ...authoringBody } = authoring;

const schema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://noahdemar.github.io/conflict-sandbox/schema/scenario.schema.json',
  title: 'OpenBrief scenario',
  description:
    'A map scenario for OpenBrief. Either a bare Scenario object, the exported file wrapper {format, version, duration, roster, scenario}, or an authoring document — the same thing with named places, relative times, macros, story beats and "keyframes": "auto", which the app resolves before playing. Times are timeline seconds; coordinates are [longitude, latitude] or {lat, lng}.',
  anyOf: [
    { $ref: '#/definitions/AuthoringDocument' },
    { $ref: '#/definitions/ScenarioFile' },
    { $ref: '#/definitions/AuthoredScenario' },
    { $ref: '#/definitions/Scenario' },
  ],
  definitions: {
    ...definitions,
    ...authoringDefs,
    AuthoringDocument: authoringBody,
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
        icon: { type: 'string', description: 'Icon library key used by units placed from this entry.' },
        iconImage: { type: 'string', description: 'Custom map icon: an image URL, or "asset:<id>" for an upload.' },
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
