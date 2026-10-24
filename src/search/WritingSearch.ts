import {Extension,type Editor} from '@tiptap/core';
import {Plugin,PluginKey,TextSelection} from '@tiptap/pm/state';
import {Decoration,DecorationSet} from '@tiptap/pm/view';
import {closeHistory} from '@tiptap/pm/history';
import {findDocument} from '../../core/search';
import {SearchController} from './SearchController';

const searchKey=new PluginKey<DecorationSet>('documentSearch');
export const WritingSearch=Extension.create({name:'documentSearch',addProseMirrorPlugins(){return [new Plugin({
  key:searchKey,
  state:{init:()=>DecorationSet.empty,apply:(tr,value)=>tr.getMeta(searchKey)??value.map(tr.mapping,tr.doc)},
  props:{decorations:state=>searchKey.getState(state)},
})];}});
export function writingSearch(editor:Editor){
  return new SearchController({
    find:options=>findDocument(editor.state.doc,options),
    start:()=>editor.state.selection.from,
    selectedText:()=>editor.state.doc.textBetween(editor.state.selection.from,editor.state.selection.to,'\n','\uFFFC'),
    readOnly:()=>!editor.isEditable,
    focus:()=>{if(!editor.isDestroyed)editor.commands.focus();},
    highlight:(ranges,active)=>{
      if(editor.isDestroyed)return;
      const decorations=ranges.map((range,i)=>Decoration.inline(range.from,range.to,{class:'search-match'+(i===active?' search-current':''),'data-search-match':String(i+1)}));
      editor.view.dispatch(editor.state.tr.setMeta(searchKey,DecorationSet.create(editor.state.doc,decorations)).setMeta('addToHistory',false));
    },
    select:range=>{if(!editor.isDestroyed)editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc,range.from,range.to)).scrollIntoView().setMeta('addToHistory',false));},
    replace:(ranges,text)=>{
      const tr=closeHistory(editor.state.tr);
      for(const {from,to}of [...ranges].reverse()){
        const $from=tr.doc.resolve(from),marks=$from.nodeAfter?.marks??$from.marks();
        if(text)tr.replaceWith(from,to,tr.doc.type.schema.text(text,marks));else tr.delete(from,to);
      }
      editor.view.dispatch(tr);
      editor.view.dispatch(closeHistory(editor.state.tr));
    },
  });
}
