import { describe, expect, it } from 'vitest';
import { shortName } from '../format';

describe('shortName', () => {
  it('keeps short names as they are', () => {
    expect(shortName('Water Droplet Sarong')).toBe('Water Droplet Sarong');
  });
  it('cuts long names in the middle so the ending (often the colour) stays', () => {
    const names = ['Thinking Like an Archipelago Cap in Ivy', 'Thinking Like an Archipelago Cap in Brown', 'Thinking Like an Archipelago Cap in Navy'].map((n) => shortName(n));
    expect(names.every((n) => n.length <= 30 && n.includes('…'))).toBe(true);
    expect(names[0]).toBe('Thinking Like an…Cap in Ivy');
    expect(new Set(names).size).toBe(3);
  });
  it('never cuts inside a word unless one word is longer than the room', () => {
    expect(shortName('Goodfight x Tropical Futures Cyber Cafe Hut Graphic T-Shirt in White')).toBe('Goodfight x Tropical…in White');
    expect(shortName('Supercalifragilisticexpialidocious hoodie in a very long colourway name', 20).length).toBeLessThanOrEqual(20);
    expect(shortName('A'.repeat(50), 10)).toBe(`${'A'.repeat(9)}…`);
  });
});
