import type {EditorView} from '@tiptap/pm/view';
import {NodeSelection,TextSelection} from '@tiptap/pm/state';

/** Flush the native text selection before focus moves into a formatting control. */
export function syncTextSelection(view:EditorView){
  const selection=window.getSelection();
  if(!selection?.anchorNode||!selection.focusNode||!view.dom.contains(selection.anchorNode)||!view.dom.contains(selection.focusNode))return;
  if(view.state.selection instanceof NodeSelection&&selection.anchorNode===view.dom&&selection.focusNode===view.dom)return;
  const anchor=view.posAtDOM(selection.anchorNode,selection.anchorOffset),head=view.posAtDOM(selection.focusNode,selection.focusOffset);
  if(anchor!==view.state.selection.anchor||head!==view.state.selection.head)view.dispatch(view.state.tr.setSelection(TextSelection.between(view.state.doc.resolve(anchor),view.state.doc.resolve(head))));
}
