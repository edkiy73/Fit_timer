import { z } from 'zod';

const idSchema = z.string().min(1).regex(/^[a-z0-9][a-z0-9._-]*$/);
const localizedTextSchema = z.record(z.string().min(2), z.string());

export const cefrLevelSchema = z.enum(['pre-a1','a1','a2','b1','b2','c1','c2']);

const lexiconRefSchema = z.object({
  surface: z.string().min(1),
  lexemeId: idSchema,
  senseId: idSchema.optional(),
  occurrence: z.number().int().positive().optional(),
});

const activityBaseSchema = z.object({
  id: idSchema,
  revision: z.number().int().positive().default(1),
  title: localizedTextSchema.optional(),
  tags: z.array(idSchema).default([]),
  /** preserve = wording/content edit keeps learner progress; reset = new revision starts fresh */
  revisionProgress: z.enum(['preserve','reset']).default('preserve'),
  estimatedMinutes: z.number().positive().optional(),
  /** Explicit dictionary context. If omitted, UI may show all surface matches but must not guess a sense. */
  lexiconRefs: z.array(lexiconRefSchema).default([]),
});

const answerCheckSchema = z.object({
  accepted: z.array(z.string().min(1)).min(1),
  nearMiss: z.boolean().default(true),
  caseSensitive: z.boolean().default(false),
});

export const activitySchema = z.discriminatedUnion('type', [
  activityBaseSchema.extend({
    type: z.literal('theory'),
    body: localizedTextSchema,
    format: z.enum(['text','html','markdown']).default('html'),
  }),
  activityBaseSchema.extend({
    type: z.literal('choice'),
    prompt: localizedTextSchema,
    hint: localizedTextSchema.optional(),
    options: z.array(localizedTextSchema).min(2),
    correctIndex: z.number().int().nonnegative(),
    explanation: localizedTextSchema.optional(),
  }),
  activityBaseSchema.extend({
    type: z.literal('text-input'),
    prompt: localizedTextSchema,
    source: localizedTextSchema.optional(),
    answer: answerCheckSchema,
    explanation: localizedTextSchema.optional(),
  }),
  activityBaseSchema.extend({
    type: z.literal('translation'),
    direction: z.enum(['to-target','from-target']),
    prompt: localizedTextSchema,
    answer: answerCheckSchema,
    explanation: localizedTextSchema.optional(),
  }),
  activityBaseSchema.extend({
    type: z.literal('speaking'),
    prompt: localizedTextSchema,
    target: z.string().min(1).optional(),
    answer: answerCheckSchema.optional(),
    speechLocale: z.string().default('en-US'),
  }),
  activityBaseSchema.extend({
    type: z.literal('pattern-drill'),
    pattern: localizedTextSchema,
    items: z.array(z.object({
      id: idSchema,
      prompt: localizedTextSchema,
      answer: answerCheckSchema,
    })).min(1),
  }),
  activityBaseSchema.extend({
    type: z.literal('dialogue'),
    scene: localizedTextSchema,
    lines: z.array(z.object({
      id: idSchema,
      partner: localizedTextSchema,
      task: localizedTextSchema.optional(),
      answer: answerCheckSchema,
      displayAnswer: z.string().min(1).optional(),
    })).min(1),
  }),
  activityBaseSchema.extend({
    type: z.literal('listening'),
    prompt: localizedTextSchema.optional(),
    text: z.string().min(1),
    speechLocale: z.string().default('en-US'),
    answer: answerCheckSchema.optional(),
  }),
  activityBaseSchema.extend({
    type: z.literal('review'),
    source: z.object({
      activityIds: z.array(idSchema).default([]),
      tags: z.array(idSchema).default([]),
      dueOnly: z.boolean().default(true),
    }),
    limit: z.number().int().positive().optional(),
  }),
  activityBaseSchema.extend({
    type: z.literal('ai-conversation'),
    topic: localizedTextSchema,
    promptTemplate: z.string().min(1),
    focus: z.array(z.string()).default([]),
  }),
]);

export type Activity = z.infer<typeof activitySchema>;

export const roadmapNodeSchema = z.object({
  id: idSchema,
  kind: z.enum(['lesson','practice','review','dialogue','checkpoint','bonus']),
  title: localizedTextSchema,
  /** Product day, independent from visual order. Free access uses this value. */
  dayIndex: z.number().int().positive().optional(),
  order: z.number().int().nonnegative(),
  prerequisites: z.array(idSchema).default([]),
  activityIds: z.array(idSchema).default([]),
  optional: z.boolean().default(false),
});

export const roadmapSchema = z.object({
  id: idSchema,
  title: localizedTextSchema,
  nodes: z.array(roadmapNodeSchema).min(1),
});

export const setAccessSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('free'),
  }),
  z.object({
    mode: z.literal('entitlement'),
    entitlement: idSchema,
    /** Already-learned content remains reviewable even after the preview boundary. */
    freePreview: z.object({
      kind: z.literal('first-days'),
      days: z.number().int().nonnegative(),
      learnedContentStaysAvailable: z.literal(true),
    }).optional(),
  }),
]);

export const phraseCollectionResourceSchema = z.object({
  id: idSchema,
  type: z.literal('phrase-collection'),
  title: localizedTextSchema,
  groups: z.array(z.object({
    id: idSchema,
    title: localizedTextSchema,
    items: z.array(z.object({
      lexemeId: idSchema,
      senseId: idSchema.optional(),
    })),
  })).min(1),
});

export const setResourceSchema = z.discriminatedUnion('type', [
  phraseCollectionResourceSchema,
]);

export const courseSetSchema = z.object({
  schemaVersion: z.literal(1),
  id: idSchema,
  revision: z.number().int().positive(),
  slug: idSchema,
  title: localizedTextSchema,
  description: localizedTextSchema.optional(),
  level: z.object({
    from: cefrLevelSchema.optional(),
    to: cefrLevelSchema.optional(),
    labels: z.array(z.string()).default([]),
  }),
  access: setAccessSchema,
  defaultRoadmapId: idSchema,
  roadmaps: z.array(roadmapSchema).min(1),
  activities: z.array(activitySchema),
  resources: z.array(setResourceSchema).default([]),
});

export type CourseSet = z.infer<typeof courseSetSchema>;
export type Roadmap = z.infer<typeof roadmapSchema>;
export type RoadmapNode = z.infer<typeof roadmapNodeSchema>;
export type SetResource = z.infer<typeof setResourceSchema>;
export type PhraseCollectionResource = z.infer<typeof phraseCollectionResourceSchema>;

export function validateCourseSet(input: unknown): CourseSet {
  const parsed = courseSetSchema.parse(input);
  const activityIds = new Set(parsed.activities.map((activity) => activity.id));
  const roadmapIds = new Set(parsed.roadmaps.map((roadmap) => roadmap.id));

  if (!roadmapIds.has(parsed.defaultRoadmapId)) {
    throw new Error(`Unknown default roadmap: ${parsed.defaultRoadmapId}`);
  }

  if (activityIds.size !== parsed.activities.length) {
    throw new Error('Activity ids must be unique inside a set');
  }

  for (const roadmap of parsed.roadmaps) {
    const nodeIds = new Set(roadmap.nodes.map((node) => node.id));
    if (nodeIds.size !== roadmap.nodes.length) {
      throw new Error(`Roadmap ${roadmap.id} has duplicate node ids`);
    }
    for (const node of roadmap.nodes) {
      for (const dependency of node.prerequisites) {
        if (!nodeIds.has(dependency)) throw new Error(`Unknown prerequisite ${dependency} in ${node.id}`);
        if (dependency === node.id) throw new Error(`Node ${node.id} cannot depend on itself`);
      }
      for (const activityId of node.activityIds) {
        if (!activityIds.has(activityId)) throw new Error(`Unknown activity ${activityId} in ${node.id}`);
      }
    }
  }

  return parsed;
}
