import type { RuleDefinition } from "./rules/ruleEngine.js";
import rulesJson from "./rules/rules.default.json";

export * from "./avatar/bodyBox.js";
export * from "./avatar/emotionWheel.js";
export * from "./avatar/matcher.js";
export * from "./emotion.js";
export * from "./panel/fold.js";
export * from "./panel/panel.js";
export * from "./panel/placement.js";
export * from "./panel/types.js";
export * from "./panel/zoom.js";
export * from "./rules/matchers.js";
export * from "./rules/ruleEngine.js";
export const defaultRuleDefinitions = rulesJson as RuleDefinition[];
