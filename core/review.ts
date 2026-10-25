import {serializeRich,type RichNode} from './writing';

export const REVIEW_FILE='pageweave-review.json';
export interface Comment {id:string;text:string;quote:string;from:number;to:number;resolved:boolean;orphaned:boolean;createdAt:string}
export interface ReviewData {version:1;tracking:boolean;baseline:RichNode[];comments:Comment[]}
export interface ReviewStore {version:1;documents:Record<string,RichNode>}
export interface ReviewChange {id:string;fromA:number;toA:number;fromB:number;toB:number;before:RichNode[];after:RichNode[]}
export const reviewData=(doc:RichNode):ReviewData|null=>doc.attrs?.review??null;
export const reviewId=(node:RichNode):string=>node.attrs?.reviewId??'';
export const nodeSource=(node:RichNode)=>serializeRich({type:'doc',content:[node]});
export const documentSource=(doc:RichNode)=>serializeRich(doc);
export function nodeSize(node:RichNode):number{return node.type==='text'?(node.text?.length??0):['hardBreak','inlineMath','displayMath','flowImage','pageBreak'].includes(node.type)?1:2+(node.content??[]).reduce((n,c)=>n+nodeSize(c),0);}
export const nodePosition=(nodes:RichNode[],index:number)=>nodes.slice(0,index).reduce((n,c)=>n+nodeSize(c),0);
export function identify(nodes:RichNode[]):RichNode[]{
  const ids=new Set<string>();return nodes.map(node=>{let id=reviewId(node);if(!id||ids.has(id))id=crypto.randomUUID();ids.add(id);return {...node,attrs:{...node.attrs,reviewId:id}};});
}
export function reviewText(nodes:RichNode[]):string{
  const text=(n:RichNode):string=>n.text??(n.type==='hardBreak'?'\n':n.type==='flowImage'?'[图片]':n.type==='pageBreak'?'[分页]':n.attrs?.latex?String(n.attrs.latex):(n.content??[]).map(text).join(['table','tableRow','bulletList','orderedList','listItem'].includes(n.type)?'\n':''));
  return nodes.map(text).join('\n');
}
/** Unchanged paragraphs are anchors; consecutive edits form one reviewable unit. */
export function reviewChanges(doc:RichNode):ReviewChange[]{
  const review=reviewData(doc);if(!review)return [];
  const a=review.baseline,b=doc.content??[],old=new Map(a.map((node,i)=>[reviewId(node),{node,i}]));
  const candidates:{a:number;b:number}[]=[];
  b.forEach((node,i)=>{const match=old.get(reviewId(node));if(match&&nodeSource(match.node)===nodeSource(node))candidates.push({a:match.i,b:i});});
  // Longest increasing subsequence also handles a cut-and-paste paragraph move.
  const tails:number[]=[],previous:number[]=[];
  candidates.forEach((item,i)=>{let lo=0,hi=tails.length;while(lo<hi){const mid=(lo+hi)>>1;if(candidates[tails[mid]].a<item.a)lo=mid+1;else hi=mid;}previous[i]=lo?tails[lo-1]:-1;tails[lo]=i;});
  const anchors:{a:number;b:number}[]=[];for(let i=tails.at(-1)??-1;i>=0;i=previous[i])anchors.push(candidates[i]);anchors.reverse();anchors.push({a:a.length,b:b.length});
  const changes:ReviewChange[]=[];let fromA=0,fromB=0;
  for(const anchor of anchors){if(fromA<anchor.a||fromB<anchor.b){const before=a.slice(fromA,anchor.a),after=b.slice(fromB,anchor.b);changes.push({id:(before[0]?reviewId(before[0]):'new')+':'+(after[0]?reviewId(after[0]):'deleted'),fromA,toA:anchor.a,fromB,toB:anchor.b,before,after});}fromA=anchor.a+1;fromB=anchor.b+1;}
  // A moved node appears in both a deletion and an insertion. Review that span
  // together so a partial decision cannot duplicate the same paragraph identity.
  const beforeUnit=new Map(changes.flatMap((c,i)=>c.before.map(n=>[reviewId(n),i] as const)));
  const spans=changes.map((_,i)=>i);
  changes.forEach((c,i)=>c.after.forEach(n=>{const other=beforeUnit.get(reviewId(n));if(other!==undefined){const from=Math.min(i,other),to=Math.max(i,other);spans[from]=Math.max(spans[from],to);}}));
  const grouped:ReviewChange[]=[];
  for(let i=0;i<changes.length;i++){const first=changes[i];let end=spans[i];for(let j=i;j<=end;j++)end=Math.max(end,spans[j]);const last=changes[end];grouped.push({...first,toA:last.toA,toB:last.toB,before:a.slice(first.fromA,last.toA),after:b.slice(first.fromB,last.toB)});i=end;}
  return grouped;
}
/** Paused tracking accepts edits outside pending paragraphs, preserving existing proposals. */
export function advanceBaseline(oldDoc:RichNode,next:RichNode[]):RichNode[]{
  const data=reviewData(oldDoc)!;if(data.tracking)return data.baseline;
  const changes=reviewChanges(oldDoc);if(!changes.length)return next;
  const lockedBefore=new Set(changes.flatMap(c=>c.before.map(reviewId))),lockedAfter=new Set(changes.flatMap(c=>c.after.map(reviewId)));
  const current=new Map(next.map(n=>[reviewId(n),n]));
  const base=data.baseline.flatMap(node=>lockedBefore.has(reviewId(node))?[node]:current.has(reviewId(node))?[current.get(reviewId(node))!]:[]);
  const ids=new Set(base.map(reviewId));
  next.forEach((node,i)=>{const id=reviewId(node);if(ids.has(id)||lockedAfter.has(id))return;const following=next.slice(i+1).find(n=>ids.has(reviewId(n))),at=following?base.findIndex(n=>reviewId(n)===reviewId(following)):base.length;base.splice(at,0,node);ids.add(id);});
  return base;
}
export const reviewLocked=(doc?:RichNode|null)=>!!doc&&(!!reviewData(doc)?.tracking||reviewChanges(doc).length>0);

export function validateReviewDocument(doc:RichNode){
  if(!doc||doc.type!=='doc'||!Array.isArray(doc.content))throw new Error('审阅文稿格式无效。');
  documentSource(doc);const data=reviewData(doc);if(data===null)return;if(!data||typeof data!=='object')throw new Error('审阅记录格式无效。');
  if(data.version!==1||typeof data.tracking!=='boolean'||!Array.isArray(data.baseline)||!Array.isArray(data.comments)||data.comments.length>2000)throw new Error('审阅记录格式无效。');
  const validateNodes=(nodes:RichNode[])=>{const ids=nodes.map(reviewId);if(ids.some(id=>!/^[\w-]{1,100}$/.test(id))||new Set(ids).size!==ids.length)throw new Error('审阅段落标识无效。');serializeRich({type:'doc',content:nodes});};
  validateNodes(doc.content);validateNodes(data.baseline);
  const size=doc.content.reduce((n,c)=>n+nodeSize(c),0),ids=new Set<string>();
  for(const c of data.comments){if(!c||typeof c.id!=='string'||ids.has(c.id)||typeof c.text!=='string'||!c.text.trim()||c.text.length>4000||typeof c.quote!=='string'||c.quote.length>8000||!Number.isInteger(c.from)||!Number.isInteger(c.to)||c.from<0||c.to<c.from||c.to>size||typeof c.resolved!=='boolean'||typeof c.orphaned!=='boolean'||typeof c.createdAt!=='string')throw new Error('批注记录格式无效。');ids.add(c.id);}
}
export function readReviewStore(text:string):ReviewStore{
  const store=JSON.parse(text);if(store.version!==1||!store.documents||Array.isArray(store.documents)||typeof store.documents!=='object')throw new Error('审阅文件格式无效。');
  for(const doc of Object.values(store.documents))validateReviewDocument(doc as RichNode);return store;
}
export function commentTextIndex(nodes:RichNode[],offset=0){
  let text='';const positions:number[]=[];
  const visit=(node:RichNode,pos:number)=>{if(node.type==='text'){for(let i=0;i<(node.text?.length??0);i++){text+=node.text![i];positions.push(pos+i);}return;}if(node.type==='hardBreak'){text+='\n';positions.push(pos);return;}if(nodeSize(node)===1){text+='\uFFFC';positions.push(pos);return;}let childPos=pos+1;for(const child of node.content??[]){visit(child,childPos);childPos+=nodeSize(child);}if(['paragraph','heading'].includes(node.type)){text+='\n';positions.push(childPos);}};
  let pos=offset;for(const node of nodes){visit(node,pos);pos+=nodeSize(node);}
  return {text,positions};
}
export function findQuoteAnchor({text,positions}:ReturnType<typeof commentTextIndex>,quote:string){
  const at=quote?text.indexOf(quote):-1;
  return at>=0&&text.indexOf(quote,at+1)<0?{from:positions[at],to:positions[at+quote.length-1]+1}:null;
}
/** After source editing, only unambiguous exact quotes regain an anchor. */
export function relocateComments(previous:RichNode,current:RichNode):RichNode{
  const data=reviewData(previous);if(!data)return current;
  if(reviewLocked(previous))throw new Error('正文已在外部更改，原审阅记录已保留。请恢复匹配的正文后继续审阅。');
  const nodes=identify(current.content??[]),index=commentTextIndex(nodes);
  const comments=data.comments.map(c=>{const anchor=findQuoteAnchor(index,c.quote);return {...c,from:anchor?.from??0,to:anchor?.to??0,orphaned:!anchor};});
  return {...current,content:nodes,attrs:{...current.attrs,review:{...data,baseline:nodes,comments}}};
}
