/**
 * Standalone Dempster-Shafer intent reasoner for Aridnova workflow graphs.
 *
 * The model JSON contains configured mass profiles used to order deterministic
 * workflow-question suggestions. Belief and pignistic values are calculation
 * outputs for ranking; callers should not present them as user-facing probabilities.
 */

export type Hypothesis = "present" | "absent";

export interface MassAssignment {
  /** A non-empty focal subset of the binary intent frame. */
  hypotheses: Hypothesis[];
  /** Expert-assigned mass in [0, 1], used to order deterministic suggestions. */
  mass: number;
}

export interface WorkflowNode {
  id?: string;
  tempId?: string;
  type?: string;
  cardType?: string;
  config?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

export interface WorkflowEdge {
  source?: string;
  target?: string;
  sourceTempId?: string;
  targetTempId?: string;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  /** Optional completion flag. Missing cards are never treated as negative evidence by default. */
  complete?: boolean;
}

interface BindingRequirement {
  id: string;
  cardType: string;
  distinctFrom?: string;
}

export interface EvidenceRule {
  id: string;
  source?: string;
  requiredBindings?: BindingRequirement[];
  requiredEdges?: Array<[string, string]>;
  requiredCardTypesAnyOf?: string[];
  targetCardType?: string;
  requiredEdge?: boolean;
  requiredConfiguration?: string[];
  minimumDistinctAnalysisBranchesFromSameIR?: number;
  analysisCardTypes?: string[];
  note?: string;
  [key: string]: unknown;
}

export interface IntentDefinition {
  intentId: string;
  label: string;
  description?: string;
  evidenceRules: EvidenceRule[];
}

export interface IntentModelDocument {
  documentType: string;
  modelId: string;
  version: string;
  status: string;
  inputGraphContract: {
    connectionsAreDirected: boolean;
    validConnections: Record<string, string[]>;
  };
  beliefModel: {
    framePerIntent: Hypothesis[];
    focalSetTemplate?: Array<{
      hypotheses: Hypothesis[];
      mass: number | null;
    }>;
  };
  intentModels: IntentDefinition[];
  /** Optional expert-assigned profiles used for decision ordering can live beside the intents. */
  massProfiles?: IntentMassProfile[];
  /** Legacy property name retained for callers with existing model files. */
  calibratedMassProfiles?: IntentMassProfile[];
}

export interface IntentMassProfile {
  id: string;
  intentId: string;
  /**
   * Profiles in the same evidenceGroup are alternatives or correlated views of
   * evidence. The reasoner chooses the most specific matching profile in that
   * group instead of double-counting all matching rules.
   */
  evidenceGroup: string;
  requiredEvidenceRuleIds: string[];
  masses: MassAssignment[];
}

/** @deprecated Use IntentMassProfile; retained for source compatibility. */
export type CalibratedMassProfile = IntentMassProfile;

export type ConfigurationMatcher = (
  requirements: string[],
  graph: NormalizedGraph
) => boolean | undefined;

export interface ReasonerOptions {
  massProfiles?: IntentMassProfile[];
  /**
   * Dempster combination is used only when every selected evidence group is
   * explicitly listed here. A single evidence group needs no independence claim.
   */
  independentEvidenceGroups?: string[];
  /** Optional conflict threshold in [0, 1]. */
  highConflictThreshold?: number;
  configurationMatcher?: ConfigurationMatcher;
  maxPatternMatches?: number;
}

interface NormalizedNode {
  id: string;
  cardType: string;
  raw: WorkflowNode;
}

interface NormalizedEdge {
  source: string;
  target: string;
}

export interface NormalizedGraph {
  nodes: NormalizedNode[];
  edges: NormalizedEdge[];
  nodeById: Map<string, NormalizedNode>;
  edgeKeys: Set<string>;
}

export interface MatchedEvidence {
  evidenceRuleId: string;
  evidenceSource: string;
  matchCount: number;
  bindings: Record<string, string>;
}

export interface IntentEstimate {
  intentId: string;
  label: string;
  status:
    | "scored"
    | "no-evidence"
    | "uncalibrated"
    | "ambiguous-calibration"
    | "independence-not-declared"
    | "invalid-graph"
    | "conflict"
    | "high-conflict";
  matchedEvidence: MatchedEvidence[];
  unsupportedEvidenceRules: Array<{ ruleId: string; reason: string }>;
  massByEvidenceGroup?: Record<string, MassAssignment[]>;
  belief?: { present: number; absent: number };
  plausibility?: { present: number; absent: number };
  pignisticProbability?: { present: number; absent: number };
  conflictByCombination?: number[];
  maxConflict?: number;
  diagnostics: string[];
}

export interface IntentReasoningResult {
  modelId: string;
  modelVersion: string;
  graphValid: boolean;
  graphDiagnostics: string[];
  estimates: IntentEstimate[];
}

interface RuleMatchResult {
  matches: Array<Record<string, string>>;
  unsupportedReason?: string;
}

const EPSILON = 1e-10;
const HYPOTHESES: Hypothesis[] = ["present", "absent"];

function edgeKey(source: string, target: string): string {
  return `${source}\u0000${target}`;
}

function uniqueHypotheses(hypotheses: readonly Hypothesis[]): Hypothesis[] {
  const unique: Hypothesis[] = [];
  for (const hypothesis of hypotheses) {
    if (unique.indexOf(hypothesis) < 0) unique.push(hypothesis);
  }
  return unique;
}

function mapValues<K, V>(map: Map<K, V>): V[] {
  const values: V[] = [];
  map.forEach((value) => values.push(value));
  return values;
}

function focalKey(hypotheses: readonly Hypothesis[]): string {
  return uniqueHypotheses(hypotheses).sort().join("|");
}

function normalizedGraph(graph: WorkflowGraph): {
  graph: NormalizedGraph;
  diagnostics: string[];
} {
  const diagnostics: string[] = [];
  const nodes: NormalizedNode[] = [];
  const nodeById = new Map<string, NormalizedNode>();

  for (const raw of graph.nodes ?? []) {
    const id = raw.id ?? raw.tempId;
    const cardType = raw.type ?? raw.cardType;
    if (!id) {
      diagnostics.push("A node is missing both id and tempId.");
      continue;
    }
    if (!cardType) {
      diagnostics.push(`Node "${id}" is missing type/cardType.`);
      continue;
    }
    if (nodeById.has(id)) {
      diagnostics.push(`Duplicate node id "${id}".`);
      continue;
    }
    const node = { id, cardType, raw };
    nodes.push(node);
    nodeById.set(id, node);
  }

  const edges: NormalizedEdge[] = [];
  const edgeKeys = new Set<string>();
  for (const raw of graph.edges ?? []) {
    const source = raw.source ?? raw.sourceTempId;
    const target = raw.target ?? raw.targetTempId;
    if (!source || !target) {
      diagnostics.push("An edge is missing source/target identifiers.");
      continue;
    }
    if (!nodeById.has(source) || !nodeById.has(target)) {
      diagnostics.push(`Edge "${source}" -> "${target}" refers to a missing node.`);
      continue;
    }
    const key = edgeKey(source, target);
    if (!edgeKeys.has(key)) {
      edges.push({ source, target });
      edgeKeys.add(key);
    }
  }

  return { graph: { nodes, edges, nodeById, edgeKeys }, diagnostics };
}

function validateGraphConnections(
  graph: NormalizedGraph,
  contract: IntentModelDocument["inputGraphContract"]
): string[] {
  const diagnostics: string[] = [];
  const knownCardTypes = new Set(Object.keys(contract.validConnections));

  for (const node of graph.nodes) {
    if (!knownCardTypes.has(node.cardType)) {
      diagnostics.push(`Unknown card type "${node.cardType}" on node "${node.id}".`);
    }
  }

  for (const edge of graph.edges) {
    const source = graph.nodeById.get(edge.source)!;
    const target = graph.nodeById.get(edge.target)!;
    const allowed = contract.validConnections[source.cardType] ?? [];
    if (!allowed.includes(target.cardType)) {
      diagnostics.push(
        `Disallowed connection ${source.cardType} -> ${target.cardType} (${source.id} -> ${target.id}).`
      );
    }
  }
  return diagnostics;
}

function enumerateBindings(
  requirements: BindingRequirement[],
  requiredEdges: Array<[string, string]>,
  graph: NormalizedGraph,
  limit: number
): Array<Record<string, string>> {
  const results: Array<Record<string, string>> = [];
  const bindings: Record<string, string> = {};
  const candidatesByRequirement = requirements.map((requirement) =>
    graph.nodes.filter((node) => node.cardType === requirement.cardType)
  );

  const partialConstraintsHold = (): boolean => {
    for (const requirement of requirements) {
      if (!requirement.distinctFrom) continue;
      const current = bindings[requirement.id];
      const other = bindings[requirement.distinctFrom];
      if (current !== undefined && other !== undefined && current === other) return false;
    }

    for (const [from, to] of requiredEdges) {
      const source = bindings[from];
      const target = bindings[to];
      if (source !== undefined && target !== undefined && !graph.edgeKeys.has(edgeKey(source, target))) {
        return false;
      }
    }
    return true;
  };

  const visit = (index: number): void => {
    if (results.length >= limit) return;
    if (index === requirements.length) {
      if (partialConstraintsHold()) results.push({ ...bindings });
      return;
    }

    const requirement = requirements[index];
    for (const node of candidatesByRequirement[index]) {
      if (requirement.distinctFrom) {
        const distinctNodeId = bindings[requirement.distinctFrom];
        if (distinctNodeId !== undefined && distinctNodeId === node.id) continue;
      }
      bindings[requirement.id] = node.id;
      if (partialConstraintsHold()) visit(index + 1);
      delete bindings[requirement.id];
      if (results.length >= limit) return;
    }
  };

  visit(0);
  return results;
}

function matchEvidenceRule(
  rule: EvidenceRule,
  graph: NormalizedGraph,
  options: ReasonerOptions
): RuleMatchResult {
  const matches: Array<Record<string, string>> = [];
  const limit = Math.max(1, options.maxPatternMatches ?? 100);
  const supportedFields = new Set([
    "id",
    "source",
    "requiredBindings",
    "requiredEdges",
    "requiredCardTypesAnyOf",
    "targetCardType",
    "requiredEdge",
    "requiredConfiguration",
    "minimumDistinctAnalysisBranchesFromSameIR",
    "analysisCardTypes",
    "note"
  ]);
  const unknownFields = Object.keys(rule).filter((field) => !supportedFields.has(field));
  if (unknownFields.length > 0) {
    return {
      matches,
      unsupportedReason: `Unsupported rule fields: ${unknownFields.join(", ")}.`
    };
  }
  const requiredBindings = rule.requiredBindings ?? [];
  const requiredEdges = (rule.requiredEdges ?? []) as Array<[string, string]>;

  if (requiredBindings.length > 0) {
    if (new Set(requiredBindings.map((binding) => binding.id)).size !== requiredBindings.length) {
      return { matches, unsupportedReason: "Binding ids in the rule are not unique." };
    }
    const bindingIds = new Set(requiredBindings.map((binding) => binding.id));
    const invalidDistinctReference = requiredBindings.find(
      (binding) => binding.distinctFrom && !bindingIds.has(binding.distinctFrom)
    );
    if (invalidDistinctReference) {
      return {
        matches,
        unsupportedReason: `Binding "${invalidDistinctReference.id}" refers to missing distinctFrom binding "${invalidDistinctReference.distinctFrom}".`
      };
    }
    const invalidEdgeReference = requiredEdges.find(([from, to]) =>
      !bindingIds.has(from) || !bindingIds.has(to)
    );
    if (invalidEdgeReference) {
      return {
        matches,
        unsupportedReason: `Required edge refers to missing binding "${!bindingIds.has(invalidEdgeReference[0]) ? invalidEdgeReference[0] : invalidEdgeReference[1]}".`
      };
    }
    matches.push(...enumerateBindings(requiredBindings, requiredEdges, graph, limit));
  } else if (requiredEdges.length > 0) {
    return {
      matches,
      unsupportedReason: "requiredEdges need requiredBindings to identify edge endpoints."
    };
  }

  if (rule.requiredCardTypesAnyOf?.length) {
    if (!rule.targetCardType) {
      return {
        matches: [],
        unsupportedReason: "requiredCardTypesAnyOf requires targetCardType."
      };
    }
    const found: Array<Record<string, string>> = [];
    for (const target of graph.nodes.filter((node) => node.cardType === rule.targetCardType)) {
      const incoming = graph.edges
        .filter((edge) => edge.target === target.id)
        .map((edge) => graph.nodeById.get(edge.source)!)
        .filter((source) => rule.requiredCardTypesAnyOf!.includes(source.cardType));
      for (const source of incoming) {
        found.push({ source: source.id, target: target.id });
        if (found.length >= limit) break;
      }
      if (found.length >= limit) break;
    }
    if (found.length === 0) return { matches: [] };
    matches.push(...found);
  }

  if (rule.minimumDistinctAnalysisBranchesFromSameIR !== undefined) {
    const threshold = rule.minimumDistinctAnalysisBranchesFromSameIR;
    const analysisTypes = new Set(rule.analysisCardTypes ?? []);
    const found: Array<Record<string, string>> = [];
    for (const ir of graph.nodes.filter((node) => node.cardType === "IR_HOLDER")) {
      const branches = graph.edges
        .filter((edge) => edge.source === ir.id)
        .map((edge) => graph.nodeById.get(edge.target)!)
        .filter((node) => analysisTypes.has(node.cardType));
      const distinctById = new Map<string, NormalizedNode>();
      for (const branch of branches) distinctById.set(branch.id, branch);
      const distinct = mapValues(distinctById);
      if (distinct.length >= threshold) {
        found.push({
          ir: ir.id,
          branches: distinct.map((node) => node.id).join(",")
        });
      }
    }
    if (found.length === 0) return { matches: [] };
    matches.push(...found);
  }

  if (rule.requiredConfiguration?.length) {
    if (!options.configurationMatcher) {
      return {
        matches: [],
        unsupportedReason: "This rule has natural-language configuration requirements; provide configurationMatcher."
      };
    }
    const matched = options.configurationMatcher(rule.requiredConfiguration, graph);
    if (matched === undefined) {
      return {
        matches: [],
        unsupportedReason: "configurationMatcher could not evaluate this rule."
      };
    }
    if (!matched) return { matches: [] };
    if (requiredBindings.length === 0 && !rule.requiredCardTypesAnyOf?.length &&
        rule.minimumDistinctAnalysisBranchesFromSameIR === undefined) {
      matches.push({ configuration: "matched" });
    }
  }

  if (rule.requiredEdge === true && !rule.requiredCardTypesAnyOf?.length) {
    return {
      matches: [],
      unsupportedReason: "requiredEdge is supported with requiredCardTypesAnyOf and targetCardType."
    };
  }

  if (
    requiredBindings.length === 0 &&
    !rule.requiredCardTypesAnyOf?.length &&
    rule.minimumDistinctAnalysisBranchesFromSameIR === undefined &&
    !rule.requiredConfiguration?.length
  ) {
    return { matches: [], unsupportedReason: "The rule has no supported matching conditions." };
  }

  return { matches };
}

function validateMasses(assignments: MassAssignment[]): Map<string, MassAssignment> {
  if (assignments.length === 0) throw new Error("A mass assignment must have focal sets.");
  const result = new Map<string, MassAssignment>();
  let total = 0;

  for (const assignment of assignments) {
    if (!Array.isArray(assignment.hypotheses) || assignment.hypotheses.length === 0) {
      throw new Error("Empty focal sets are not supported by normalized Dempster combination.");
    }
    const hypotheses = uniqueHypotheses(assignment.hypotheses);
    if (hypotheses.some((hypothesis) => !HYPOTHESES.includes(hypothesis))) {
      throw new Error("Mass assignment contains a hypothesis outside the binary intent frame.");
    }
    if (!Number.isFinite(assignment.mass) || assignment.mass < 0 || assignment.mass > 1) {
      throw new Error("Each mass must be a finite number in [0, 1].");
    }
    const key = focalKey(hypotheses);
    const prior = result.get(key);
    result.set(key, {
      hypotheses,
      mass: (prior?.mass ?? 0) + assignment.mass
    });
    total += assignment.mass;
  }

  if (Math.abs(total - 1) > 1e-8) {
    throw new Error(`Mass assignments must sum to 1; received ${total}.`);
  }
  return result;
}

export interface CombinationResult {
  masses: MassAssignment[] | null;
  conflict: number;
}

export function combineDempster(
  left: MassAssignment[],
  right: MassAssignment[]
): CombinationResult {
  const leftMap = validateMasses(left);
  const rightMap = validateMasses(right);
  const combined = new Map<string, MassAssignment>();
  let conflict = 0;

  for (const a of mapValues(leftMap)) {
    for (const b of mapValues(rightMap)) {
      const intersection = a.hypotheses.filter((hypothesis) =>
        b.hypotheses.includes(hypothesis)
      );
      const product = a.mass * b.mass;
      if (intersection.length === 0) {
        conflict += product;
        continue;
      }
      const key = focalKey(intersection);
      const previous = combined.get(key);
      combined.set(key, {
        hypotheses: uniqueHypotheses(intersection),
        mass: (previous?.mass ?? 0) + product
      });
    }
  }

  if (conflict >= 1 - EPSILON) return { masses: null, conflict: 1 };

  const normalizer = 1 - conflict;
  const masses = mapValues(combined).map((assignment) => ({
    hypotheses: assignment.hypotheses,
    mass: assignment.mass / normalizer
  }));
  return { masses, conflict };
}

export function projectBelief(masses: MassAssignment[]): {
  belief: { present: number; absent: number };
  plausibility: { present: number; absent: number };
  pignisticProbability: { present: number; absent: number };
} {
  const normalized = mapValues(validateMasses(masses));
  const belief = { present: 0, absent: 0 };
  const plausibility = { present: 0, absent: 0 };
  const pignisticProbability = { present: 0, absent: 0 };

  for (const assignment of normalized) {
    for (const hypothesis of HYPOTHESES) {
      if (assignment.hypotheses.every((item) => item === hypothesis)) {
        belief[hypothesis] += assignment.mass;
      }
      if (assignment.hypotheses.includes(hypothesis)) {
        plausibility[hypothesis] += assignment.mass;
        pignisticProbability[hypothesis] +=
          assignment.mass / assignment.hypotheses.length;
      }
    }
  }

  return { belief, plausibility, pignisticProbability };
}

export class AridnovaIntentReasoner {
  private readonly massProfiles: IntentMassProfile[];

  constructor(
    private readonly model: IntentModelDocument,
    private readonly options: ReasonerOptions = {}
  ) {
    this.massProfiles = options.massProfiles ?? model.massProfiles ?? model.calibratedMassProfiles ?? [];
  }

  static fromJson(
    json: string,
    options: ReasonerOptions = {}
  ): AridnovaIntentReasoner {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Intent model JSON must contain an object.");
    }
    const model = parsed as IntentModelDocument;
    if (
      !model.modelId ||
      !model.inputGraphContract?.validConnections ||
      !Array.isArray(model.intentModels)
    ) {
      throw new Error("Intent model JSON is missing required model fields.");
    }
    return new AridnovaIntentReasoner(model, options);
  }

  evaluate(graphInput: WorkflowGraph): IntentReasoningResult {
    const normalized = normalizedGraph(graphInput);
    const contractDiagnostics = validateGraphConnections(
      normalized.graph,
      this.model.inputGraphContract
    );
    const graphDiagnostics = [...normalized.diagnostics, ...contractDiagnostics];
    const graphValid = graphDiagnostics.length === 0;

    const estimates = this.model.intentModels.map((intent): IntentEstimate => {
      const matchedEvidence: MatchedEvidence[] = [];
      const unsupportedEvidenceRules: Array<{ ruleId: string; reason: string }> = [];

      for (const rule of intent.evidenceRules ?? []) {
        const result = matchEvidenceRule(rule, normalized.graph, this.options);
        if (result.unsupportedReason) {
          unsupportedEvidenceRules.push({
            ruleId: rule.id,
            reason: result.unsupportedReason
          });
        }
        if (result.matches.length > 0) {
          matchedEvidence.push({
            evidenceRuleId: rule.id,
            evidenceSource: rule.source ?? "unspecified",
            matchCount: result.matches.length,
            bindings: result.matches[0]
          });
        }
      }

      const base: IntentEstimate = {
        intentId: intent.intentId,
        label: intent.label,
        status: "no-evidence",
        matchedEvidence,
        unsupportedEvidenceRules,
        diagnostics: []
      };

      if (!graphValid) {
        base.status = "invalid-graph";
        base.diagnostics.push("Canvas violates the model's card connection contract; scores are suppressed.");
        return base;
      }
      if (unsupportedEvidenceRules.length > 0) {
        base.diagnostics.push("Some evidence rules need configuration-aware matching.");
      }
      if (matchedEvidence.length === 0) {
        if (unsupportedEvidenceRules.length > 0) {
          base.status = "uncalibrated";
          base.diagnostics.push("No supported pattern matched; one or more rules need configuration-aware matching.");
        }
        return base;
      }

      const matchedRuleIds = new Set(matchedEvidence.map((evidence) => evidence.evidenceRuleId));
      const selected = this.selectProfiles(intent.intentId, matchedRuleIds);
      if (selected.ambiguous) {
        base.status = "ambiguous-calibration";
        base.diagnostics.push("Equally specific mass profiles disagree within an evidence group.");
        return base;
      }
      if (selected.profiles.length === 0) {
        base.status = "uncalibrated";
        base.diagnostics.push("Evidence patterns matched, but no mass profile is available.");
        return base;
      }

      const massByEvidenceGroup: Record<string, MassAssignment[]> = {};
      for (const profile of selected.profiles) {
        massByEvidenceGroup[profile.evidenceGroup] = profile.masses;
      }
      base.massByEvidenceGroup = massByEvidenceGroup;

      let combined: MassAssignment[] | null = null;
      const groups = selected.profiles.map((profile) => profile.evidenceGroup);
      if (groups.length === 1) {
        combined = selected.profiles[0].masses;
      } else {
        const declaredIndependent = new Set(this.options.independentEvidenceGroups ?? []);
        if (!groups.every((group) => declaredIndependent.has(group))) {
          base.status = "independence-not-declared";
          base.diagnostics.push(
            "Multiple evidence groups matched. Declare their conditional independence before combining them."
          );
          return base;
        }

        combined = selected.profiles[0].masses;
        const conflictByCombination: number[] = [];
        for (const profile of selected.profiles.slice(1)) {
          const result = combineDempster(combined, profile.masses);
          conflictByCombination.push(result.conflict);
          if (result.masses === null) {
            base.status = "conflict";
            base.conflictByCombination = conflictByCombination;
            base.maxConflict = 1;
            base.diagnostics.push("The evidence groups are in total conflict.");
            return base;
          }
          combined = result.masses;
        }
        base.conflictByCombination = conflictByCombination;
        base.maxConflict = Math.max(0, ...conflictByCombination);

        const threshold = this.options.highConflictThreshold;
        if (threshold !== undefined && base.maxConflict >= threshold) {
          base.status = "high-conflict";
          base.diagnostics.push("Conflict reached the configured abstention threshold.");
          return base;
        }
      }

      if (combined === null) {
        base.status = "uncalibrated";
        base.diagnostics.push("No combined mass assignment is available.");
        return base;
      }
      const projection = projectBelief(combined);
      base.status = "scored";
      base.belief = projection.belief;
      base.plausibility = projection.plausibility;
      base.pignisticProbability = projection.pignisticProbability;
      return base;
    });

    return {
      modelId: this.model.modelId,
      modelVersion: this.model.version,
      graphValid,
      graphDiagnostics,
      estimates
    };
  }

  private selectProfiles(
    intentId: string,
    matchedRuleIds: Set<string>
  ): { profiles: IntentMassProfile[]; ambiguous: boolean } {
    const eligible = this.massProfiles.filter((profile) =>
      profile.intentId === intentId &&
      profile.requiredEvidenceRuleIds.length > 0 &&
      profile.requiredEvidenceRuleIds.every((ruleId) => matchedRuleIds.has(ruleId))
    );

    const byGroup = new Map<string, IntentMassProfile[]>();
    for (const profile of eligible) {
      const existing = byGroup.get(profile.evidenceGroup) ?? [];
      existing.push(profile);
      byGroup.set(profile.evidenceGroup, existing);
    }

    const selected: IntentMassProfile[] = [];
    for (const profiles of mapValues(byGroup)) {
      const maxSpecificity = Math.max(
        ...profiles.map((profile) => profile.requiredEvidenceRuleIds.length)
      );
      const mostSpecific = profiles.filter(
        (profile) => profile.requiredEvidenceRuleIds.length === maxSpecificity
      );
      const fingerprints = new Set(
        mostSpecific.map((profile) => JSON.stringify(
          profile.masses
            .map((mass) => ({
              hypotheses: [...mass.hypotheses].sort(),
              mass: mass.mass
            }))
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
        ))
      );
      if (fingerprints.size > 1) return { profiles: [], ambiguous: true };
      selected.push(mostSpecific[0]);
    }

    return { profiles: selected, ambiguous: false };
  }
}
