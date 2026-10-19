import { compileLrcCues, parseLrcCues } from './lrcReview.js'

// All file-import paths use the same whole-file track inference.
export function parseTimedLyrics(content, title, artist) {
  return compileLrcCues(parseLrcCues(String(content), title, artist)).lines
}
