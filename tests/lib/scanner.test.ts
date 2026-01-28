import { describe, it, expect } from 'vitest';
import { determineStatus } from '@/lib/scanner';

describe('scanner', () => {
  describe('determineStatus', () => {
    it('returns "active" for projects at root level', () => {
      expect(determineStatus('/Users/cliff/Desktop/_code/my-project')).toBe('active');
    });

    it('returns "icebox" for projects in _icebox folder', () => {
      expect(determineStatus('/Users/cliff/Desktop/_code/_icebox/old-project')).toBe('icebox');
    });

    it('returns "archived" for projects in _old folder', () => {
      expect(determineStatus('/Users/cliff/Desktop/_code/_old/legacy-project')).toBe('archived');
    });

    it('returns "crawlers" for projects in _crawlers folder', () => {
      expect(determineStatus('/Users/cliff/Desktop/_code/_crawlers/web-scraper')).toBe('crawlers');
    });

    it('handles nested paths correctly', () => {
      expect(determineStatus('/Users/cliff/Desktop/_code/_icebox/subfolder/project')).toBe('icebox');
    });
  });
});
