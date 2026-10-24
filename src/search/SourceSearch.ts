import {StateEffect,StateField} from '@codemirror/state';
import {EditorView,Decoration,type DecorationSet} from '@codemirror/view';
import {findText,type SearchRange} from '../../core/search';
import {SearchController} from './SearchController';

const highlight=StateEffect.define<{ranges:SearchRange[];active:number}>();
export const sourceSearchField=StateField.define<DecorationSet>({
  create:()=>Decoration.none,
  update:(value,tr)=>{
    value=value.map(tr.changes);
    for(const effect of tr.effects)if(effect.is(highlight))return Decoration.set(effect.value.ranges.map((range,i)=>Decoration.mark({class:'search-match'+(i===effect.value.active?' search-current':'')}).range(range.from,range.to)),true);
    return value;
  },
  provide:field=>EditorView.decorations.from(field),
});
export function sourceSearch(view:EditorView,boundary:()=>Promise<void>,alive=()=>true){
  return new SearchController({
    find:options=>findText(view.state.doc.toString(),options),start:()=>view.state.selection.main.from,
    selectedText:()=>view.state.sliceDoc(view.state.selection.main.from,view.state.selection.main.to),readOnly:()=>view.state.readOnly,
    focus:()=>{if(alive())view.focus();},highlight:(ranges,active)=>{if(alive())view.dispatch({effects:highlight.of({ranges,active})});},
    select:range=>{if(alive())view.dispatch({selection:{anchor:range.from,head:range.to},effects:EditorView.scrollIntoView(range.from,{y:'nearest'})});},
    replace:async(ranges,text)=>{
      const doc=view.state.doc;await boundary();
      if(view.state.doc!==doc)throw new Error('内容已变化，请重新执行替换。');
      view.dispatch({changes:ranges.map(({from,to})=>({from,to,insert:text})),userEvent:'input.replace'});
      await boundary();
    },
  });
}
