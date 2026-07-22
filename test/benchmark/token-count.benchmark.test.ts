/**
 * Token count benchmark for the full MCP toolset.
 *
 * Every tool definition is serialized as it appears in a tools/list response
 * and measured with BPE encoding (gpt-tokenizer, cl100k_base — consistent with
 * Claude's tokenizer for relative comparison purposes).
 *
 * Two invariants are enforced:
 *   1. No single tool schema may exceed TOKEN_BUDGET_PER_TOOL (1 200 tokens).
 *      At that size the schema itself starts competing with the user's context.
 *   2. The entire toolset may not exceed TOKEN_BUDGET_TOTAL (7 000 tokens).
 *      This is the fixed overhead paid on every single MCP call.
 *
 * These budgets are set with headroom above today's baseline (~5 400 tokens)
 * to absorb the schema fixes in progress, while blocking runaway growth.
 *
 * When a fix changes a token count, update the BASELINE snapshot below.
 * The snapshot is informational — it does not fail the test — but it lets
 * reviewers see the delta in the PR diff without running anything.
 */

import { describe, it, expect } from 'vitest';
import { encode } from 'gpt-tokenizer';
import { TOOLS } from '../../src/tools/index';

// ------------------------------------------------------------------
// Budgets
// ------------------------------------------------------------------
const TOKEN_BUDGET_PER_TOOL = 1_200;
const TOKEN_BUDGET_TOTAL = 7_000;

// ------------------------------------------------------------------
// Snapshot — update when a schema fix changes a tool's token count.
// The test does NOT fail if actual !== snapshot; it prints a delta.
// ------------------------------------------------------------------
const BASELINE: Record<string, number> = {
  auth0_list_applications: 80,
  auth0_get_application: 52,
  auth0_create_application: 786,
  auth0_update_application: 755,
  auth0_save_credentials_to_file: 406,
  auth0_list_resource_servers: 145,
  auth0_get_resource_server: 52,
  auth0_create_resource_server: 412,
  auth0_update_resource_server: 389,
  auth0_list_actions: 90,
  auth0_get_action: 49,
  auth0_create_action: 306,
  auth0_update_action: 322,
  auth0_deploy_action: 47,
  auth0_list_logs: 245, // +62 from fix/logs-q-description
  auth0_get_log: 52,
  auth0_list_forms: 78,
  auth0_get_form: 49,
  auth0_create_form: 157,
  auth0_update_form: 173,
  auth0_create_application_grant: 206,
  auth0_onboarding: 197,
  auth0_get_quickstart_guide: 293,
};

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function tokenize(tool: (typeof TOOLS)[number]): number {
  return encode(
    JSON.stringify({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })
  ).length;
}

function toolCategory(name: string): 'read' | 'write' | 'other' {
  if (name.startsWith('auth0_list_') || name.startsWith('auth0_get_')) return 'read';
  if (
    name.startsWith('auth0_create_') ||
    name.startsWith('auth0_update_') ||
    name.startsWith('auth0_deploy_')
  )
    return 'write';
  return 'other';
}

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------
describe('Token count benchmark — MCP toolset context overhead', () => {
  const counts = new Map<string, number>();
  for (const tool of TOOLS) {
    counts.set(tool.name, tokenize(tool));
  }

  const total = [...counts.values()].reduce((a, b) => a + b, 0);

  it('prints a token count table with delta vs snapshot', () => {
    const lines: string[] = [
      '',
      'Tool'.padEnd(42) + 'Tokens'.padStart(8) + '  Delta'.padStart(8),
      '-'.repeat(60),
    ];

    for (const tool of TOOLS) {
      const actual = counts.get(tool.name)!;
      const base = BASELINE[tool.name];
      const delta = base !== undefined ? actual - base : null;
      const deltaStr = delta === null ? '    new' : delta === 0 ? '      =' : (delta > 0 ? '+' : '') + delta;
      lines.push(tool.name.padEnd(42) + String(actual).padStart(8) + '  ' + deltaStr.padStart(6));
    }

    lines.push('-'.repeat(60));
    const totalBase = Object.values(BASELINE).reduce((a, b) => a + b, 0);
    const totalDelta = total - totalBase;
    const totalDeltaStr = totalDelta === 0 ? '=' : (totalDelta > 0 ? '+' : '') + totalDelta;
    lines.push('TOTAL'.padEnd(42) + String(total).padStart(8) + '  ' + totalDeltaStr.padStart(6));
    lines.push('');

    console.log(lines.join('\n'));

    // Not a hard assertion — informational only
    expect(true).toBe(true);
  });

  it(`total toolset is within ${TOKEN_BUDGET_TOTAL.toLocaleString()} token budget`, () => {
    expect(total).toBeLessThanOrEqual(TOKEN_BUDGET_TOTAL);
  });

  for (const tool of TOOLS) {
    it(`${tool.name} is within ${TOKEN_BUDGET_PER_TOOL.toLocaleString()} token per-tool budget`, () => {
      const actual = counts.get(tool.name)!;
      expect(
        actual,
        `${tool.name} uses ${actual} tokens — exceeds per-tool budget of ${TOKEN_BUDGET_PER_TOOL}`
      ).toBeLessThanOrEqual(TOKEN_BUDGET_PER_TOOL);
    });
  }
});
