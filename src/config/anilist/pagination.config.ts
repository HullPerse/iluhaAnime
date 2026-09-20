/** Page sizes the backend queries use. Keep them in step with `anilist/library.rs`: the
 * "show more" buttons decide whether another page exists by comparing a page's length with
 * these numbers, so a mismatch would either hide data or offer an empty page. */
export const BROWSE_PAGE_SIZE = 20;
export const CHAR_PAGE_SIZE = 25;
export const MEDIA_PAGE_SIZE = 50;
export const STAFF_CREDITS_PAGE_SIZE = 25;
