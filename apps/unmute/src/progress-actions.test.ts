import { describe, expect, it } from 'vitest';
import { emptyCourseProgress } from './progress';
import {
  completeManualNode,
  gradeCourseCard,
  gradeCoursePractice,
  learningCalendarFromDocument,
  markActivitySeen,
  roadmapProgressFromDocument
} from './progress-actions';

describe('learner progress actions',()=>{
  it('grades cards and marks the stable activity as seen',()=>{
    let doc=emptyCourseProgress();
    doc=gradeCourseCard(doc,'card.a',true,100,'2026-09-28','2026-09-28T10:00:00Z');

    expect(doc.cards['card.a']).toMatchObject({box:1,due:101});
    expect(doc.seen['card.a']?.deleted).not.toBe(true);
    expect(doc.learningDays['2026-09-28']).toBeTruthy();
  });

  it('grades all explicit practice modes without legacy pat/voc/lis keys',()=>{
    let doc=emptyCourseProgress();
    doc=gradeCoursePractice(doc,'pattern.a','drill',true,100,'2026-09-28','2026-09-28T10:00:00Z');
    doc=gradeCoursePractice(doc,'pattern.a','listening',true,100,'2026-09-28','2026-09-28T10:01:00Z');
    doc=gradeCoursePractice(doc,'pattern.a','speaking',true,100,'2026-09-28','2026-09-28T10:02:00Z');

    const state=roadmapProgressFromDocument(doc);
    expect(state.practice.drill['pattern.a']?.box).toBe(1);
    expect(state.practice.listening['pattern.a']?.box).toBe(1);
    expect(state.practice.speaking['pattern.a']?.box).toBe(1);
  });

  it('supports seen-only content and manual review-only days',()=>{
    let doc=emptyCourseProgress();
    doc=markActivitySeen(doc,'dialogue.d1','2026-09-28','2026-09-28T10:00:00Z');
    doc=completeManualNode(doc,'day-6','2026-09-28','2026-09-28T10:01:00Z');

    const state=roadmapProgressFromDocument(doc);
    expect(state.seenActivityIds.has('dialogue.d1')).toBe(true);
    expect(state.manualNodeIds.has('day-6')).toBe(true);
  });

  it('derives streak from merge-safe learning-day records',()=>{
    let doc=emptyCourseProgress();
    doc=markActivitySeen(doc,'a','2026-09-26','2026-09-26T10:00:00Z');
    doc=markActivitySeen(doc,'b','2026-09-27','2026-09-27T10:00:00Z');
    doc=markActivitySeen(doc,'c','2026-09-28','2026-09-28T10:00:00Z');

    expect(learningCalendarFromDocument(doc)).toEqual({
      lastDay:'2026-09-28',
      activeDay:'2026-09-28',
      streak:3
    });

    doc=markActivitySeen(doc,'d','2026-09-30','2026-09-30T10:00:00Z');
    expect(learningCalendarFromDocument(doc).streak).toBe(1);
  });
});
