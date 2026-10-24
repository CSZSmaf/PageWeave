import type {SearchOptions,SearchRange} from '../../core/search';

export interface SearchSnapshot{total:number;current:number;readOnly:boolean}
export interface SearchAdapter{
  find(options:SearchOptions):SearchRange[];
  start():number;
  selectedText():string;
  highlight(ranges:SearchRange[],active:number):void;
  select(range:SearchRange):void;
  replace(ranges:SearchRange[],text:string):void|Promise<void>;
  focus():void;
  readOnly():boolean;
}
export class SearchController{
  private options:SearchOptions={query:'',caseSensitive:false};
  private ranges:SearchRange[]=[];
  private active=-1;
  private replacing=false;
  private listeners=new Set<()=>void>();
  constructor(private adapter:SearchAdapter){}
  subscribe(listener:()=>void){this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
  snapshot():SearchSnapshot{return {total:this.ranges.length,current:this.active+1,readOnly:this.adapter.readOnly()};}
  selectedText(){return this.adapter.selectedText();}
  focus(){this.adapter.focus();}
  private publish(select=false){
    this.adapter.highlight(this.ranges,this.active);
    if(select&&this.active>=0)this.adapter.select(this.ranges[this.active]);
    this.listeners.forEach(listener=>listener());
  }
  private locate(anchor:number){const index=this.ranges.findIndex(range=>range.from>=anchor);this.active=this.ranges.length?(index<0?0:index):-1;}
  setQuery(options:SearchOptions){
    if(options.query===this.options.query&&options.caseSensitive===this.options.caseSensitive)return;
    this.options=options;this.ranges=this.adapter.find(options);this.locate(this.adapter.start());this.publish(true);
  }
  changed(){if(!this.options.query||this.replacing)return;this.ranges=this.adapter.find(this.options);this.locate(this.adapter.start());this.publish();}
  step(direction:1|-1){if(!this.ranges.length)return;this.active=(this.active+direction+this.ranges.length)%this.ranges.length;this.publish(true);}
  async replace(text:string,all=false){
    if(this.replacing||this.adapter.readOnly()||this.active<0)return 0;
    const ranges=all?this.ranges:[this.ranges[this.active]],anchor=all?ranges[0].from:ranges[0].from+text.length;
    this.replacing=true;
    try{await this.adapter.replace(ranges,text);}
    finally{this.replacing=false;this.ranges=this.adapter.find(this.options);this.locate(anchor);this.publish(true);}
    return ranges.length;
  }
  clear(){this.options={...this.options,query:''};this.ranges=[];this.active=-1;this.publish();}
}
