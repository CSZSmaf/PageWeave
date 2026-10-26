import {Mark} from '@tiptap/core';
import {Plugin} from '@tiptap/pm/state';
import {linkAddress} from '../../core/inline-format';

export const Superscript=Mark.create({
  name:'superscript',excludes:'subscript',parseHTML(){return [{tag:'sup'}];},renderHTML(){return ['sup',{},0];},
  addKeyboardShortcuts(){return {'Mod-Shift-=':()=>this.editor.commands.toggleMark(this.name)};},
});
export const Subscript=Mark.create({
  name:'subscript',excludes:'superscript',parseHTML(){return [{tag:'sub'}];},renderHTML(){return ['sub',{},0];},
  addKeyboardShortcuts(){return {'Mod-=':()=>this.editor.commands.toggleMark(this.name)};},
});
export const DocumentLink=Mark.create({
  name:'link',inclusive:false,keepOnSplit:false,
  addAttributes(){return {href:{default:null}};},
  parseHTML(){return [{tag:'a[href]',getAttrs:element=>{try{return {href:linkAddress(element.getAttribute('href'))};}catch{return false;}}}];},
  renderHTML({HTMLAttributes}){let href='';try{href=linkAddress(HTMLAttributes.href);}catch{}return ['a',{href,title:href,tabindex:-1,class:'document-link'},0];},
  addProseMirrorPlugins(){return [new Plugin({props:{handleDOMEvents:{click(_view,event){if((event.target as HTMLElement).closest?.('a.document-link'))event.preventDefault();return false;}}}})];},
});
export const InlineMarks=[Superscript,Subscript,DocumentLink];
