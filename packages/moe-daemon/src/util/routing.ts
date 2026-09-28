import type { ProjectSettings, Task, TaskTier, TierLaunch } from '../types/schema.js';
import { countDistinctAffectedFiles, resolveTaskSizing } from './planSize.js';

/**
 * Per-task launch tiers. The architect picks a tier at submit_plan, the
 * plan size sets a floor under it, and each qa_reject bumps it one step. The
 * wrapper launches the task's CLI with the model/effort the tier maps to in
 * settings.routing — so easy tasks stop paying for `--effort max`.
 */

export const TIERS: readonly TaskTier[] = ['light', 'standard', 'heavy'];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
const DEFAULT_EFFORT: Record<TaskTier, NonNullable<TierLaunch['effort']>> = {
  light: 'medium',
  standard: 'high',
  heavy: 'max',
};

export function isTier(value: unknown): value is TaskTier {
  return typeof value === 'string' && (TIERS as readonly string[]).includes(value);
}

export function maxTier(a: TaskTier, b: TaskTier | undefined): TaskTier {
  return b && TIERS.indexOf(b) > TIERS.indexOf(a) ? b : a;
}

export function bumpTier(tier: TaskTier): TaskTier {
  return TIERS[Math.min(TIERS.indexOf(tier) + 1, TIERS.length - 1)];
}

/** light: ≤3 steps and ≤2 files; standard: within the taskSizing warn band; heavy: past it. */
export function planSizeFloor(
  steps: { affectedFiles: string[]; newFiles?: string[] }[],
  settings?: Pick<ProjectSettings, 'taskSizing'>
): TaskTier {
  // newFiles count toward size exactly as in assessPlanSize.
  const files = countDistinctAffectedFiles(
    steps.map((step) => ({ affectedFiles: [...(step.affectedFiles ?? []), ...(step.newFiles ?? [])] }))
  );
  if (steps.length <= 3 && files <= 2) return 'light';
  const { warnSteps, warnDistinctFiles } = resolveTaskSizing(settings?.taskSizing);
  return steps.length <= warnSteps && files <= warnDistinctFiles ? 'standard' : 'heavy';
}

export interface ResolvedLaunch {
  tier: TaskTier;
  effort: NonNullable<TierLaunch['effort']>;
  model?: string;
}

/**
 * Launch hint for a claimed WORKING/REVIEW task. project.json is hand-edited and bypasses
 * validateSettingsUpdate, so bad routing values are ignored, never fatal.
 */
export function resolveLaunch(
  task: Pick<Task, 'tier' | 'status'>,
  settings?: Pick<ProjectSettings, 'routing'>
): ResolvedLaunch | undefined {
  const routing = settings?.routing;
  // The tier sizes the worker/QA sessions; planning keeps the role default.
  if (!isTier(task.tier) || routing?.enabled === false || task.status === 'PLANNING') return undefined;
  const entry: Partial<TierLaunch> =
    routing && typeof routing[task.tier] === 'object' && routing[task.tier] !== null ? routing[task.tier]! : {};
  const effort = (EFFORTS as readonly string[]).includes(entry.effort as string)
    ? entry.effort!
    : DEFAULT_EFFORT[task.tier];
  const model = typeof entry.model === 'string' && entry.model.trim() !== '' ? entry.model.trim() : undefined;
  return { tier: task.tier, effort, ...(model ? { model } : {}) };
}
