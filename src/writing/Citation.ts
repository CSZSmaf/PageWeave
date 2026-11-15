import {Node} from '@tiptap/core';

export const Citation=Node.create({
  name:'citation',group:'inline',inline:true,atom:true,
  addAttributes(){return {command:{default:'cite'},keys:{default:''}};},
  parseHTML(){return [{tag:'span[data-citation]',getAttrs:element=>({command:element.getAttribute('data-command')??'cite',keys:element.getAttribute('data-citation')??''})}];},
  renderHTML({node}){return ['span',{'data-citation':node.attrs.keys,'data-command':node.attrs.command,contenteditable:'false',title:'参考文献：'+node.attrs.keys},'['+node.attrs.keys+']'];},
});
