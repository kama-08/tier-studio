import { expect, it } from 'vitest';
import { wrapText } from './text-layout';
import { outputDimensions } from './canvas-renderer';

it('wraps at word boundaries and only splits oversized words', () => {
  const measure = (value: string) => Array.from(value).length;
  expect(wrapText('Best of all time', 8, measure)).toEqual(['Best of', 'all time']);
  expect(wrapText('ABCDEFGHIJK good', 5, measure)).toEqual(['ABCDE', 'FGHIJ', 'K', 'good']);
  expect(wrapText('word word word', 6, measure, 2)).toEqual(['word', 'word…']);
  expect(wrapText('你好世界你好世界', 4, measure)).toEqual(['你好世界', '你好世界']);
});

it('caps canvas dimensions and pixel area while allowing smaller previews', () => {
  expect(outputDimensions({ width: 1200, height: 500 }, 3)).toEqual({
    width: 3600,
    height: 1500,
    scale: 3,
  });
  expect(outputDimensions({ width: 4096, height: 1000 }, 1000 / 4096).width).toBe(1000);
  const large = outputDimensions({ width: 4000, height: 10000 }, 3);
  expect(large.width * large.height).toBeLessThanOrEqual(64_000_000 + 16000);
  expect(Math.max(large.width, large.height)).toBeLessThanOrEqual(16000);
  expect(() => outputDimensions({ width: 1000, height: 40000 }, 2)).toThrow('too tall');
});
