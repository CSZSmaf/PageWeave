import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter, keymap, drawSelection } from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { StreamLanguage, syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { highlightSelectionMatches } from '@codemirror/search';
import { minimalPatch } from '../core/history';
import {sourceSearch,sourceSearchField} from './search/SourceSearch';
import type {SearchController} from './search/SearchController';

interface Props { file: string; text: string; readOnly: boolean; location?: { line: number; nonce: number }; onChange(text: string): void; onCursor(line: number): void; onUndo(): void; onRedo(): void; onSave(): void; onCompile(): void; onSearchReady?(search:SearchController|null):void; onSearchBoundary?():Promise<void> }
export default function Editor(props: Props) {
  const host = useRef<HTMLDivElement>(null), view = useRef<EditorView | null>(null), callbacks = useRef(props), external = useRef(false);
  callbacks.current = props;
  useEffect(() => {
    let search:SearchController|undefined,alive=true;
    const state = EditorState.create({ doc: props.text, extensions: [
      lineNumbers(), highlightActiveLine(), highlightActiveLineGutter(), drawSelection(), bracketMatching(), highlightSelectionMatches(),sourceSearchField,
      StreamLanguage.define(stex), syntaxHighlighting(defaultHighlightStyle), EditorView.lineWrapping,
      EditorState.lineSeparator.of(props.text.includes('\r\n') ? '\r\n' : '\n'),
      EditorState.readOnly.of(props.readOnly),
      EditorView.contentAttributes.of({ 'aria-label': 'LaTeX 源码编辑器', 'spellcheck': 'false' }),
      keymap.of([
        { key: 'Mod-z', run: () => { callbacks.current.onUndo(); return true; } },
        { key: 'Mod-Shift-z', run: () => { callbacks.current.onRedo(); return true; } },
        { key: 'Mod-y', run: () => { callbacks.current.onRedo(); return true; } },
        { key: 'Mod-s', run: () => { callbacks.current.onSave(); return true; } },
        { key: 'Mod-Enter', run: () => { callbacks.current.onCompile(); return true; } },
        ...defaultKeymap, indentWithTab]),
      EditorView.updateListener.of(update => {
        if (update.docChanged && !external.current) callbacks.current.onChange(update.state.sliceDoc());
        if(update.docChanged)queueMicrotask(()=>{if(alive)search?.changed();});
        if (update.selectionSet && !external.current && update.view.hasFocus) callbacks.current.onCursor(update.state.doc.lineAt(update.state.selection.main.head).number);
      }),
      EditorView.theme({ '&': { height: '100%', fontSize: '13px' }, '.cm-scroller': { overflow: 'auto', fontFamily: '"Cascadia Code", Consolas, "Microsoft YaHei", monospace', lineHeight: '1.9' }, '.cm-content': { padding: '18px 0 80px' }, '.cm-line': { padding: '0 18px 0 10px' }, '.cm-gutters': { background: '#fff', color: '#a2a8b4', border: 'none', minWidth: '42px' }, '.cm-activeLine, .cm-activeLineGutter': { background: '#eff5ff' }, '&.cm-focused': { outline: 'none' } }),
    ] });
    view.current = new EditorView({ state, parent: host.current! });
    search=sourceSearch(view.current,async()=>{await callbacks.current.onSearchBoundary?.();if(!alive)throw new Error('编辑器已关闭。');},()=>alive);
    callbacks.current.onSearchReady?.(search);
    return () => { alive=false;callbacks.current.onSearchReady?.(null);view.current?.destroy(); view.current = null; };
  }, [props.file, props.readOnly]);
  useEffect(() => {
    const editor = view.current; if (!editor || editor.state.sliceDoc() === props.text) return;
    external.current = true;
    const patch = minimalPatch(props.file, editor.state.doc.toString(), props.text.replaceAll('\r\n', '\n'));
    editor.dispatch({ changes: { from: patch.from, to: patch.to, insert: patch.after } });
    external.current = false;
  }, [props.text]);
  useEffect(() => {
    const editor = view.current; if (!editor || !props.location) return;
    const line = editor.state.doc.line(Math.max(1, Math.min(props.location.line, editor.state.doc.lines)));
    editor.dispatch({ selection: { anchor: line.from, head: line.to }, effects: EditorView.scrollIntoView(line.from, { y: 'center' }) });
  }, [props.location, props.file]);
  return <div className="editor-host" ref={host} />;
}
