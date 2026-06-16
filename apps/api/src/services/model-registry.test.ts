import { describe, it, expect } from 'vitest';
import type { ModelsDevModel } from '@chat/providers';
import { mapModelsDevFeatures } from './model-registry';

function makeModel(overrides: Partial<ModelsDevModel> = {}): ModelsDevModel {
  return {
    id: 'test-model',
    name: 'Test Model',
    family: 'test',
    modalities: { input: ['text'], output: ['text'] },
    limit: { context: 128000 },
    reasoning: false,
    tool_call: false,
    structured_output: false,
    attachment: false,
    ...overrides,
  };
}

describe('mapModelsDevFeatures — models.dev → Feature mapping', () => {
  it("returns ['reasoning'] when only reasoning is true", () => {
    expect(mapModelsDevFeatures(makeModel({ reasoning: true }))).toEqual(['reasoning']);
  });

  it("returns ['tool-use'] when only tool_call is true (was 'code' pre-Cleanup)", () => {
    expect(mapModelsDevFeatures(makeModel({ tool_call: true }))).toEqual(['tool-use']);
  });

  it("returns ['structured-output'] when only structured_output is true (was 'long-context' pre-Cleanup)", () => {
    expect(mapModelsDevFeatures(makeModel({ structured_output: true }))).toEqual([
      'structured-output',
    ]);
  });

  it("returns ['vision'] only when attachment=true AND modalities.input includes 'image'", () => {
    expect(
      mapModelsDevFeatures(
        makeModel({ attachment: true, modalities: { input: ['text', 'image'], output: ['text'] } })
      )
    ).toEqual(['vision']);
  });

  it("does NOT include 'vision' when attachment=true but modalities.input lacks 'image'", () => {
    const features = mapModelsDevFeatures(
      makeModel({
        attachment: true,
        modalities: { input: ['text', 'file'], output: ['text'] },
      })
    );
    expect(features).not.toContain('vision');
  });

  it("returns ['pdf-input'] when modalities.input includes 'pdf'", () => {
    expect(
      mapModelsDevFeatures(makeModel({ modalities: { input: ['text', 'pdf'], output: ['text'] } }))
    ).toEqual(['pdf-input']);
  });

  it("does NOT include 'pdf-input' when modalities.input lacks 'pdf'", () => {
    const features = mapModelsDevFeatures(
      makeModel({ modalities: { input: ['text', 'image'], output: ['text'] } })
    );
    expect(features).not.toContain('pdf-input');
  });

  it('returns the union of all flags when everything is true and modalities include image+pdf', () => {
    const features = mapModelsDevFeatures(
      makeModel({
        reasoning: true,
        tool_call: true,
        structured_output: true,
        attachment: true,
        modalities: { input: ['text', 'image', 'pdf'], output: ['text'] },
      })
    );
    expect(features).toEqual(
      expect.arrayContaining(['reasoning', 'tool-use', 'structured-output', 'vision', 'pdf-input'])
    );
    expect(features).toHaveLength(5);
  });

  it("returns [] when no flags are true and modalities is just ['text']", () => {
    expect(mapModelsDevFeatures(makeModel())).toEqual([]);
  });

  it("does NOT emit the legacy 'code' value (regression pin)", () => {
    const features = mapModelsDevFeatures(makeModel({ tool_call: true }));
    expect(features).not.toContain('code');
  });

  it("does NOT emit the legacy 'long-context' value (regression pin)", () => {
    const features = mapModelsDevFeatures(makeModel({ structured_output: true }));
    expect(features).not.toContain('long-context');
  });
});
