import {Extension} from '@tiptap/core';
import {ListItem} from '@tiptap/extension-list';
import {Plugin} from '@tiptap/pm/state';

export const WritingListItem=ListItem.extend({content:'paragraph (paragraph | bulletList | orderedList)*'});
export const ListKeys=Extension.create({
  name:'writingListKeys',priority:1100,
  addKeyboardShortcuts(){return {
    Tab:()=>{if(!this.editor.isActive('listItem'))return false;const p=this.editor.state.selection.$from;let depth=0;for(let i=0;i<=p.depth;i++)if(p.node(i).type.name==='listItem')depth++;if(depth<4)this.editor.commands.sinkListItem('listItem');return true;},
    'Shift-Tab':()=>{if(!this.editor.isActive('listItem'))return false;this.editor.commands.liftListItem('listItem');return true;},
  };},
  addProseMirrorPlugins(){return [new Plugin({filterTransaction:tr=>{
    if(!tr.docChanged)return true;let valid=true;
    tr.doc.descendants((node,pos)=>{if(node.type.name!=='listItem')return;const p=tr.doc.resolve(pos);let depth=1;for(let i=1;i<=p.depth;i++)if(p.node(i).type.name==='listItem')depth++;if(depth>4)valid=false;});return valid;
  }})];},
});
