// @ts-check
// GitHub-style heading slugger, extracted for unit testing.
//
// slugify(text): lowercase, strip punctuation (keeping - and _), spaces->-,
// collapse hyphens, trim. Falls back to 'section' for empty/punctuation-only input.
//
// Slugger: dedupes sequential slugs with -1, -2, ... suffixes.

/**
 * @param {unknown} text
 * @returns {string}
 */
export function slugify(text) {
  const s = String(text == null ? '' : text)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return s || 'section'
}

export class Slugger {
  /** @type {Record<string, number>} */
  seen
  constructor() {
    this.seen = Object.create(null)
  }
  /**
   * @param {unknown} text
   * @returns {string}
   */
  slug(text) {
    const base = slugify(text)
    let slug = base
    if (this.seen[base]) {
      slug = base + '-' + this.seen[base]
    }
    this.seen[base] = (this.seen[base] || 0) + 1
    return slug
  }
  /**
   * @returns {void}
   */
  reset() {
    this.seen = Object.create(null)
  }
}