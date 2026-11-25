export const TABLE_TAGS = ['table','thead','tbody','tfoot','tr','td','th','caption','colgroup','col','p','span','div','br','b','strong','em','i','u','sub','sup','ul','ol','li','img','math','mrow','mi','mn','mo','mtext','msub','msup','msubsup','mfrac','msqrt','mtable','mtr','mtd'];
export const TABLE_ATTRIBUTES = ['colspan','rowspan','scope','alt','src'];
export function safeTableImage(src: string): boolean {
  return /^\/paper-assets\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\.(png|jpe?g|webp|svg)$/i.test(src);
}

// Defense in depth for old cached payloads: table content never embeds a document.
export function sanitizeTableInBrowser(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,svg,foreignObject,annotation,annotation-xml,form,input,button,link,meta,base').forEach(e => e.remove());
  for (const el of [...doc.body.querySelectorAll('*')]) {
    if (!TABLE_TAGS.includes(el.tagName.toLowerCase())) { el.replaceWith(...el.childNodes); continue; }
    for (const attr of [...el.attributes]) if (!TABLE_ATTRIBUTES.includes(attr.name) || (attr.name === 'src' && !safeTableImage(attr.value))) el.removeAttribute(attr.name);
    if (el.tagName === 'IMG' && !el.getAttribute('src')) el.remove();
  }
  return doc.body.innerHTML;
}
