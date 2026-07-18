import type { RuleDefinition } from "./rules/ruleEngine.js";
import rulesJson from "./rules/rules.default.json";

export * from "./emotion.js";
export * from "./rules/matchers.js";
export * from "./rules/ruleEngine.js";
export const defaultRuleDefinitions = rulesJson as RuleDefinition[];
