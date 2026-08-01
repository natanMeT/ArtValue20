import { describe, it, expect } from 'vitest';
import { galleryTabModel, VIDEO_COMING_SOON_HE } from '../ImageStudio.jsx';

// ===================================================================
// VIDEO TAB TRUTHFULNESS.
//
// The defect this locks shut: in cloud mode the gallery advertised an ACTIVE
// "וידאו" tab with a live "(0)" count, for a capability the product cannot
// deliver at all — the cloud lane never sets `isVideo` and the server CHECK is
// `kind = 'image'`, so the count was structurally incapable of being anything
// but 0. "(0)" reads as "none yet", which is a promise, not a fact.
//
// What is asserted here is the TAB MODEL, a pure function. Rendering is thin
// over it by design, so the honesty rule is testable without a DOM.
// ===================================================================

const cloud = () => galleryTabModel({ canFavorite: true, videoComingSoon: true });
const device = () => galleryTabModel({ canFavorite: false, videoComingSoon: false });
const tab = (tabs, id) => tabs.find((t) => t.id === id);

describe('cloud mode · video is present but honestly unavailable', () => {
  it('KEEPS the video tab — the concept is not removed', () => {
    // Deliberate: hiding it would lose a real roadmap capability from the UI.
    expect(tab(cloud(), 'video')).toBeTruthy();
    expect(tab(cloud(), 'video').label).toBe('וידאו');
  });

  it('marks it coming-soon and carries the owner-approved copy verbatim', () => {
    expect(tab(cloud(), 'video').comingSoon).toBe(true);
    expect(tab(cloud(), 'video').note).toBe('יצירת וידאו תתווסף בשלב הבא');
    expect(VIDEO_COMING_SOON_HE).toBe('יצירת וידאו תתווסף בשלב הבא');
  });

  it('leaves every OTHER tab a real, countable capability', () => {
    for (const id of ['all', 'image', 'favorite']) {
      expect(tab(cloud(), id).comingSoon).toBeUndefined();
    }
  });

  it('marks NOTHING else coming-soon — exactly one unavailable capability', () => {
    expect(cloud().filter((t) => t.comingSoon).map((t) => t.id)).toEqual(['video']);
  });
});

describe('device/local mode · UNCHANGED — its video records are real', () => {
  it('does not mark video coming-soon, because the device store can hold legacy video', () => {
    expect(tab(device(), 'video')).toBeTruthy();
    expect(tab(device(), 'video').comingSoon).toBeUndefined();
    expect(tab(device(), 'video').note).toBeUndefined();
  });

  it('still exposes no favourites tab — that capability is cloud-only', () => {
    expect(tab(device(), 'favorite')).toBeUndefined();
  });

  it('keeps the same three tabs in the same order as before this slice', () => {
    expect(device().map((t) => t.id)).toEqual(['all', 'image', 'video']);
  });
});

describe('tab model · shape and defaults', () => {
  it('defaults to the most conservative state when called with nothing', () => {
    // No capability is claimed unless it was passed in.
    const t = galleryTabModel();
    expect(t.map((x) => x.id)).toEqual(['all', 'image', 'video']);
    expect(t.some((x) => x.comingSoon)).toBe(false);
  });

  it('adds favourites strictly on the capability flag, never on mode-guessing', () => {
    expect(galleryTabModel({ canFavorite: true }).map((t) => t.id))
      .toEqual(['all', 'image', 'video', 'favorite']);
  });

  it('orders cloud tabs all → image → video → favorite', () => {
    expect(cloud().map((t) => t.id)).toEqual(['all', 'image', 'video', 'favorite']);
  });
});
