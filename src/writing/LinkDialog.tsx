import {useState} from 'react';
import type {Editor} from '@tiptap/core';
import {closeHistory} from '@tiptap/pm/history';
import {linkAddress} from '../../core/inline-format';
import {DesignDialog} from './DesignDialogs';

export default function LinkDialog({editor,onClose}:{editor:Editor;onClose():void}){
  const [anchor]=useState(()=>({doc:editor.state.doc,from:editor.state.selection.from,to:editor.state.selection.to}));
  const [href,setHref]=useState(editor.getAttributes('link').href??''),[text,setText]=useState(''),[error,setError]=useState('');
  const existing=!!editor.getAttributes('link').href,hasSelection=anchor.from!==anchor.to;
  function apply(remove=false){
    if(editor.isDestroyed||!editor.isEditable||editor.state.doc!==anchor.doc)throw new Error('文稿已变化，请重新选择链接位置。');
    const address=remove?'':linkAddress(href);
    const chain=editor.chain().focus().command(({tr})=>{closeHistory(tr);return true;}).setTextSelection({from:anchor.from,to:anchor.to});
    if(existing)chain.extendMarkRange('link');
    if(remove)chain.unsetMark('link');
    else if(hasSelection||existing)chain.setMark('link',{href:address});
    else chain.insertContent({type:'text',text:text.trim()||address,marks:[{type:'link',attrs:{href:address}}]});
    if(!chain.run())throw new Error('当前选区无法插入链接。');editor.view.dispatch(closeHistory(editor.state.tr));
  }
  return <DesignDialog title={existing?'编辑链接':'插入链接'} onClose={onClose} onApply={()=>apply()}>
    <label className="link-field">链接地址<input autoFocus aria-label="链接地址" type="text" placeholder="https://example.com" value={href} onChange={event=>setHref(event.target.value)} spellCheck={false}/></label>
    {!hasSelection&&!existing&&<label className="link-field">显示文字<input aria-label="链接显示文字" placeholder="留空使用链接地址" value={text} onChange={event=>setText(event.target.value)}/></label>}
    {existing&&<button type="button" className="outline-button link-remove" onClick={()=>{try{apply(true);onClose();}catch(e){setError(e instanceof Error?e.message:String(e));}}}>移除链接</button>}{error&&<p className="link-dialog-error" role="alert">{error}</p>}
  </DesignDialog>;
}
