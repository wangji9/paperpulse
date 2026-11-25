// Keep source text visible if translation is temporarily unavailable.
export function chineseText(value?:string):string { return value || ''; }
export function chineseFigureLabel(label:string):string { return label.replace(/^(?:Figure|Fig\.?)\s*/i,'图 ').replace(/^Table\s*/i,'表 '); }
