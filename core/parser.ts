import type { ImageObject, Range, SemanticObject } from './types';

const isEscaped = (s: string, i: number) => { let n = 0; while (i > 0 && s[--i] === '\\') n++; return n % 2 === 1; };
function trivia(s: string, i: number) {
  while (i < s.length) {
    if (/\s/.test(s[i])) { i++; continue; }
    if (s[i] === '%' && !isEscaped(s, i)) { const e = s.indexOf('\n', i); i = e < 0 ? s.length : e + 1; continue; }
    break;
  }
  return i;
}
interface Group extends Range { inner: Range; text: string }
function group(s: string, start: number, open = '{', close = '}'): Group | undefined {
  const from = trivia(s, start); if (s[from] !== open) return;
  let depth = 1, braces = 0;
  for (let i = from + 1; i < s.length; i++) {
    if (s[i] === '%' && !isEscaped(s, i)) { const e = s.indexOf('\n', i); if (e < 0) return; i = e; continue; }
    if (isEscaped(s, i)) continue;
    if (open === '[') { if (s[i] === '{') braces++; if (s[i] === '}') braces--; }
    if (braces > 0) continue;
    if (s[i] === open) depth++;
    if (s[i] === close) {
      depth--;
      if (depth === 0) return { from, to: i + 1, inner: { from: from + 1, to: i }, text: s.slice(from + 1, i) };
    }
  }
}

// Each field retains its original UTF-16 range. Never print or normalize an AST.
function options(s: string, g: Group) {
  const fields: { name: string; value: string; range: Range }[] = [];
  let start = g.inner.from, braces = 0;
  for (let i = start; i <= g.inner.to; i++) {
    if (s[i] === '%' && !isEscaped(s, i)) { const e = s.indexOf('\n', i); i = e < 0 ? g.inner.to : Math.min(e, g.inner.to); }
    if (s[i] === '{' && !isEscaped(s, i)) braces++;
    if (s[i] === '}' && !isEscaped(s, i)) braces--;
    if (i === g.inner.to || (s[i] === ',' && braces === 0)) {
      const a = trivia(s, start), raw = s.slice(a, i), eq = raw.indexOf('=');
      if (eq >= 0) {
        const from = trivia(s, a + eq + 1);
        let to = i; while (to > from && /\s/.test(s[to - 1])) to--;
        fields.push({ name: raw.slice(0, eq).trim(), value: s.slice(from, to), range: { from, to } });
      } else if (raw.trim()) fields.push({ name: raw.trim(), value: '', range: { from: a, to: i } });
      start = i + 1;
    }
  }
  return fields;
}
export function parseLatex(source: string, file: string): SemanticObject[] {
  const result: SemanticObject[] = [];
  const environments: string[] = [];
  let braces = 0, conditional = 0;
  let figure: { images: ImageObject[]; caption: string; label: string } | undefined;
  const lineAt = (i: number) => source.slice(0, i).split('\n').length;
  for (let i = 0; i < source.length;) {
    const c = source[i];
    if (c === '%' && !isEscaped(source, i)) { const e = source.indexOf('\n', i); i = e < 0 ? source.length : e + 1; continue; }
    if (c !== '\\') { if (c === '{') braces++; if (c === '}') braces = Math.max(0, braces - 1); i++; continue; }
    const match = /^\\([a-zA-Z@]+|.)/.exec(source.slice(i)); if (!match) { i++; continue; }
    const name = match[1], from = i; i += match[0].length;
    if (name === 'verb') { if (source[i] === '*') i++; const delim = source[i++]; const end = source.indexOf(delim, i); i = end < 0 ? source.length : end + 1; continue; }
    if (['newcommand', 'renewcommand', 'providecommand', 'DeclareRobustCommand', 'newenvironment', 'renewenvironment'].includes(name)) {
      if (source[i] === '*') i++;
      const macro = group(source, i); if (!macro) continue; i = macro.to;
      for (let n = 0; n < 2; n++) { const optional = group(source, i, '[', ']'); if (optional) i = optional.to; }
      const body = group(source, i); if (body) i = body.to;
      if (name.endsWith('environment')) { const end = group(source, i); if (end) i = end.to; }
      continue;
    }
    if (['def', 'gdef', 'edef', 'xdef'].includes(name)) { const a = source.indexOf('{', i); const body = a >= 0 ? group(source, a) : undefined; i = body?.to ?? source.length; continue; }
    if (name.startsWith('if')) conditional++;
    if (name === 'fi') conditional = Math.max(0, conditional - 1);
    if (name === 'begin' || name === 'end') {
      const env = group(source, i); if (!env) continue; i = env.to;
      if (name === 'begin') {
        if (['verbatim', 'Verbatim', 'lstlisting', 'minted', 'comment'].includes(env.text)) { const end = source.indexOf('\\end{' + env.text + '}', i); i = end < 0 ? source.length : end + env.text.length + 6; continue; }
        environments.push(env.text);
        if (env.text === 'figure' || env.text === 'figure*') figure = { images: [], caption: '', label: '' };
      } else {
        if ((env.text === 'figure' || env.text === 'figure*') && figure) { for (const image of figure.images) { image.caption = figure.caption; image.label = figure.label; } figure = undefined; }
        const n = environments.lastIndexOf(env.text); if (n >= 0) environments.splice(n);
      }
      continue;
    }
    if (name === 'includegraphics') {
      const starred = source[i] === '*'; if (starred) i++;
      const opt = group(source, i, '[', ']'); if (opt) i = opt.to;
      const path = group(source, i); if (!path) continue; i = path.to;
      const fields = opt ? options(source, opt) : [];
      const widths = fields.filter(f => f.name === 'width');
      const width = widths[0];
      const length = width && /^(\d*\.?\d+)\s*(\\(?:line|text|column)width|mm|cm|in|pt|bp)$/.exec(width.value);
      const unsafe = environments.filter(e => !['document', 'figure', 'figure*', 'center'].includes(e));
      let reason: string | undefined;
      if (braces || conditional || unsafe.length) reason = '处于分组、自定义容器或条件结构中，请通过源码修改。';
      else if (starred || fields.some(f => f.name !== 'width')) reason = '含裁剪、变换或其他图片参数，暂仅支持单独的 width。';
      else if (widths.length !== 1 || !length) reason = '需要明确的 width，例如 0.6\\linewidth 或 80mm。';
      else if (Number(length[1]) <= 0) reason = '宽度必须为正数。';
      const image: ImageObject = {
        kind: 'image', id: `${file}:${from}:image`, file, line: lineAt(from), range: { from, to: i },
        path: path.text, width: width?.value ?? '', widthRange: width?.range,
        coefficient: length ? Number(length[1]) : undefined, unit: length?.[2],
        editable: !reason, reason, caption: '', label: '',
      };
      result.push(image); figure?.images.push(image); continue;
    }
    if (['section', 'subsection', 'subsubsection', 'chapter', 'part', 'caption', 'label'].includes(name)) {
      if (source[i] === '*') i++;
      const opt = group(source, i, '[', ']'); if (opt) i = opt.to;
      const body = group(source, i); if (!body) continue; i = body.to;
      if (name === 'caption' && figure) figure.caption = body.text;
      else if (name === 'label' && figure) figure.label = body.text;
      else if (!['caption', 'label'].includes(name)) result.push({ kind: 'heading', id: `${file}:${from}:heading`, file, line: lineAt(from), range: { from, to: i }, title: body.text, level: ['part', 'chapter', 'section', 'subsection', 'subsubsection'].indexOf(name) });
    }
  }
  return result;
}

export function widthReplacement(image: ImageObject, value: number, unit: string, source: string) {
  if (!image.editable || !image.widthRange) throw new Error(image.reason ?? '此图片暂不支持可视化修改。');
  if (!['\\linewidth', '\\textwidth', '\\columnwidth', 'mm', 'cm', 'in', 'pt', 'bp'].includes(unit)) throw new Error('不支持的长度单位。');
  const max = unit.startsWith('\\') ? 2 : 1000;
  if (!Number.isFinite(value) || value <= 0 || value > max) throw new Error(`宽度需大于 0，且不超过 ${max}。`);
  const normalized = String(Number(value.toFixed(5)));
  return { file: image.file, ...image.widthRange, before: source.slice(image.widthRange.from, image.widthRange.to), after: normalized + unit };
}
