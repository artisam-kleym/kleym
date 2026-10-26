// Source-only inventory. This does not execute application code or contact services.
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { execFileSync } from 'node:child_process'
const root = process.cwd()
const out = path.join(root, 'qa/plans/kleym-comprehensive-v2-2026-10-26/evidences')
fs.mkdirSync(out, { recursive: true })
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name)]) }
const files = walk(path.join(root,'src')).filter(f => /\.(tsx?|mjs)$/.test(f))
const controls=[], pages=[], apis=[]
const normalize=f=>path.relative(root,f).replaceAll('\\','/')
const route=f=>'/'+normalize(f).replace(/^src\/app\//,'').replace(/\([^/]+\)\//g,'').replace(/\/(page|route)\.tsx?$/,'').replace(/^(page|route)\.tsx?$/,'')
for(const file of files){
 const source=fs.readFileSync(file,'utf8'), rel=normalize(file)
 const ast=ts.createSourceFile(rel,source,ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
 if(/\/page\.tsx$/.test(rel)) pages.push({route:route(file),source:rel})
 if(/\/route\.ts$/.test(rel)) for(const node of ast.statements){
  if(ts.isFunctionDeclaration(node)&&node.name&&['GET','POST','PUT','PATCH','DELETE','OPTIONS','HEAD'].includes(node.name.text)) apis.push({route:route(file),method:node.name.text,source:rel,line:ast.getLineAndCharacterOfPosition(node.getStart()).line+1})
 }
 function visit(node){
  if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
   const tag=node.tagName.getText(ast)
   if(['button','Button','input','Input','select','textarea','a','Link','form','details','summary'].includes(tag)){
    const attrs={};for(const a of node.attributes.properties) if(ts.isJsxAttribute(a)&&a.initializer) attrs[a.name.getText(ast)]=a.initializer.getText(ast).slice(0,200)
    const parent=ts.isJsxOpeningElement(node)?node.parent:null
    const text=parent&&ts.isJsxElement(parent)?parent.children.filter(ts.isJsxText).map(n=>n.text.trim()).filter(Boolean).join(' ').slice(0,160):''
    controls.push({id:'CTRL-'+String(controls.length+1).padStart(4,'0'),source:rel,line:ast.getLineAndCharacterOfPosition(node.getStart()).line+1,tag,text,attributes:attrs,execution:'Not Run',qualification:'Static declaration; conditional rendering and runtime labels require browser verification.'})
   }
  }
  ts.forEachChild(node,visit)
 }
 visit(ast)
}
const info={candidate:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),tree:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),pages,apis,controls,counts:{pages:pages.length,apiMethods:apis.length,apiFiles:new Set(apis.map(a=>a.source)).size,controlDeclarations:controls.length},limits:'Static JSX does not enumerate generated rows, every dynamic state, portals, or runtime behavior. Every declaration is a checklist item, not a passed test.'}
fs.writeFileSync(path.join(out,'source-inventory.json'),JSON.stringify(info,null,2)+'\n')
console.log(JSON.stringify(info.counts))
