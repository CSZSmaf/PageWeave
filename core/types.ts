export type Engine = 'xelatex' | 'pdflatex' | 'lualatex';
export interface Range { from: number; to: number }
export interface Patch extends Range { file: string; before: string; after: string }
export interface ImageObject {
  kind: 'image'; id: string; file: string; line: number; range: Range;
  path: string; width: string; widthRange?: Range; coefficient?: number;
  unit?: string; editable: boolean; reason?: string; caption: string; label: string;
}
export interface HeadingObject {
  kind: 'heading'; id: string; file: string; line: number; range: Range;
  title: string; level: number;
}
export type SemanticObject = ImageObject | HeadingObject;
export interface ProjectFile {
  path: string; content: string | null; editable: boolean; dirty: boolean; encoding: string; size: number;
}
export interface ProjectState {
  id: string; root: string; name: string; main: string; engine: Engine; version: number;
  scope?:'file'|'folder';
  files: ProjectFile[]; objects: SemanticObject[]; canUndo: boolean; canRedo: boolean;
  undoLabel?: string; redoLabel?: string;
  writing: WritingBlock[];
  reviewDocument?:RichNode;
  reviewError?:string;
  recovery?:RecoveryInfo|null;
}
export interface Region { objectId: string; file: string; line: number; page: number; x: number; y: number; width: number; height: number }
export interface Diagnostic { file?: string; line?: number; message: string }
export interface CompileResult {
  ok: boolean; projectId: string; version: number; token: string; durationMs: number;
  log: string; diagnostics: Diagnostic[]; regions: Region[]; writingRegions: WritingRegion[]; pdf?: Uint8Array;
}
export interface ToolInfo { name: string; available: boolean; detail: string }
export interface RecoveryInfo {id:string;name:string;savedAt:string;conflict:boolean}
export interface WorkbenchApi {
  aiStatus():Promise<import('./ai').AiStatus>;
  aiConfigure(config:import('./ai').AiConfig,key?:string):Promise<import('./ai').AiStatus>;
  aiRequest(request:import('./ai').AiRequest):Promise<import('./ai').AiReply>;
  aiCancel(id:string):Promise<void>;
  initialize(): Promise<{ project: ProjectState; tools: ToolInfo[] }>;
  resolveRecovery(id:string,action:'restore'|'discard'):Promise<ProjectState>;
  open(mode?:'file'|'folder'): Promise<ProjectState | null>;
  renameDocument(name:string,version:number):Promise<ProjectState>;
  demo(): Promise<ProjectState | null>;
  writingDemo(): Promise<ProjectState | null>;
  newDocument(): Promise<ProjectState | null>;
  writeBlock(id:string,content:RichNode,version:number):Promise<ProjectState>;
  writeFlow(parts:import('./flow').FlowPart[],version:number,document?:RichNode):Promise<ProjectState>;
  pagePlan(plan:import('./page-plan').PagePlan,version:number):Promise<ProjectState>;
  importImage(bytes:Uint8Array,version:number):Promise<{project:ProjectState;src:string;naturalWidth:number;naturalHeight:number}>;
  imageData(file:string):Promise<string>;
  insertBlock(afterId:string|null,kind:'paragraph'|'equation'|'pageBreak',version:number):Promise<{project:ProjectState;id:string}>;
  deleteBlock(id:string,version:number):Promise<ProjectState>;
  pageSettings(margin:number,paper:string,landscape:boolean,version:number):Promise<ProjectState>;
  source(file: string, text: string, version: number): Promise<ProjectState>;
  width(id: string, value: number, unit: string, version: number): Promise<ProjectState>;
  undo(version: number): Promise<ProjectState>;
  redo(version: number): Promise<ProjectState>;
  save(): Promise<ProjectState>;
  autoSave():Promise<ProjectState>;
  saveAs(): Promise<ProjectState|null>;
  reload(): Promise<ProjectState | null>;
  configure(main: string, engine: Engine): Promise<ProjectState>;
  compile(): Promise<CompileResult>;
  previewFormula(latex:string): Promise<CompileResult>;
  locate(token: string, page: number, x: number, y: number): Promise<{file: string; line: number} | null>;
  exportPdf(token: string): Promise<string | null>;
  exportProject(): Promise<string | null>;
  reveal(): Promise<void>;
  onCloseRequest(callback: () => void): () => void;
  finishClose(): Promise<void>;
}
import type { RichNode, WritingBlock, WritingRegion } from './writing';
