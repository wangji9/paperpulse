import sanitize from 'sanitize-html';
import { TABLE_TAGS, safeTableImage } from '../src/lib/tablePolicy.js';

export function sanitizePaperTableHtml(html: string): string {
  return sanitize(html, {
    allowedTags: TABLE_TAGS,
    allowedAttributes: { td: ['colspan','rowspan'], th: ['colspan','rowspan','scope'], col: ['span'], img: ['src','alt'] },
    nonTextTags: ['script','style','iframe','object','embed','svg','foreignObject','annotation','annotation-xml','textarea'],
    allowedSchemes: [],
    allowProtocolRelative: false,
    exclusiveFilter: frame => frame.tag === 'img' && !safeTableImage(frame.attribs.src || ''),
  }).trim();
}
