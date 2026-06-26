// Chat-persistence filter — transient progress cards must never be persisted or
// restored, while all other chat history is untouched. Pure, deterministic.
import { describe, it, expect } from 'vitest';
import { persistableChatMessages, isTransientChatMessage } from '../chatPersistence.js';

const normal = { role: 'assistant', text: 'שלום, אני ג׳יק' };
const userMsg = { role: 'user', text: 'תכין קמפיין' };
const system = { role: 'assistant', system: true, text: '✓ נשמרה חבילת הפקה' };
const campaign = { role: 'assistant', campaign: { campaignId: 'c1', strategy: {}, concepts: [] } };
const offer = { role: 'assistant', productionOffer: { campaignId: 'c1', conceptName: 'x' } };
const review = { role: 'assistant', productionReview: { campaignId: 'c1', conceptName: 'x', package: {} } };
const progress = {
  role: 'assistant',
  productionProgress: { campaignId: 'c1', conceptName: 'x', statuses: { copy: 'active' }, startedAt: 0, nowTs: 1000, error: null, done: false },
};

describe('chatPersistence — transient progress cards excluded from history', () => {
  it('excludes a productionProgress message from persisted history', () => {
    const out = persistableChatMessages([normal, progress, system]);
    expect(out).toEqual([normal, system]);
    expect(out.some((m) => m.productionProgress)).toBe(false);
  });

  it('keeps normal assistant, user, and system messages', () => {
    expect(persistableChatMessages([userMsg, normal, system])).toEqual([userMsg, normal, system]);
  });

  it('keeps productionReview (review/saved cards persist as before)', () => {
    expect(persistableChatMessages([review])).toEqual([review]);
  });

  it('keeps campaign and offer cards (existing behavior unchanged)', () => {
    expect(persistableChatMessages([campaign, offer])).toEqual([campaign, offer]);
  });

  it('hydration of a (legacy) stored progress card restores NO active card', () => {
    // simulates reading storage that a buggy build left a progress card in
    expect(persistableChatMessages([progress])).toEqual([]);
    expect(persistableChatMessages([normal, progress])).toEqual([normal]);
  });

  it('isTransientChatMessage flags only progress messages', () => {
    expect(isTransientChatMessage(progress)).toBe(true);
    expect(isTransientChatMessage(normal)).toBe(false);
    expect(isTransientChatMessage(review)).toBe(false);
    expect(isTransientChatMessage(null)).toBe(false);
    expect(isTransientChatMessage(undefined)).toBe(false);
  });

  it('does not mutate input and preserves order of the remaining messages', () => {
    const input = [normal, progress, review, system];
    const snapshot = JSON.parse(JSON.stringify(input));
    const out = persistableChatMessages(input);
    expect(input).toEqual(snapshot); // input untouched
    expect(out).toEqual([normal, review, system]); // order preserved, only progress removed
  });

  it('tolerates non-array input', () => {
    expect(persistableChatMessages(undefined)).toEqual([]);
    expect(persistableChatMessages(null)).toEqual([]);
  });
});
