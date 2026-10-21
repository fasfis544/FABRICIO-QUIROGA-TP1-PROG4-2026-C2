const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname,'../../..');
const ts = require(path.join(root,'node_modules/typescript'));
const out = path.resolve(__dirname,'..');
const md = fs.readFileSync(path.join(out,'Defensa_Codigo_Cine_Aurora.md'),'utf8');
const metadata = JSON.parse(fs.readFileSync(path.join(out,'Verificacion_Documento.json'),'utf8'));
if(metadata.format!=='guia-central')throw Error('Se esperaba la guía central');
const lines=md.trimEnd().split(/\r?\n/).length;
if(lines>=2000 || lines!==metadata.markdownLines)throw Error('Límite/recuento de líneas incorrecto');
if(metadata.renderWord && (!metadata.renderWord.abierto || metadata.renderWord.lineas>=2000))throw Error('Word no cumple la verificación');
if(/^## \d+\. (Mapa completo|Explicación de cada archivo|Trazabilidad)/m.test(md))throw Error('Se reintrodujo catálogo/matriz exhaustiva');
if(/\{\{fragmento:/.test(md))throw Error('Fragmento sin expandir');
for(const file of metadata.files){
  if(file.sha256){
    const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file.file),'utf8')).digest('hex');
    if(hash!==file.sha256)throw Error('Código cambió después de inventario: '+file.file);
  }
}
for(const fragment of metadata.fragments){
  const code=fs.readFileSync(path.join(root,fragment.file),'utf8').split('\n').slice(fragment.first-1,fragment.first-1+fragment.count).join('\n');
  if(code!==fragment.code || !md.includes('```typescript\n'+code+'\n```'))throw Error('Fragmento distinto del código: '+fragment.id);
}
for(const title of metadata.chapters)if(!md.includes('## '+title+'\n'))throw Error('Falta capítulo '+title);
for(const match of md.matchAll(/`((?:src|supabase|public)\/[^`]+)`/g))if(!fs.existsSync(path.join(root,match[1])))throw Error('Ruta citada inexistente: '+match[1]);
for(const file of ['environment.ts','environment.production.ts']){
  const text=fs.readFileSync(path.join(root,'src/environments',file),'utf8');
  const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
  function visit(n){
    if(ts.isPropertyAssignment(n)&&['supabaseUrl','supabaseAnonKey'].includes(n.name.getText(ast))&&ts.isStringLiteralLike(n.initializer)&&n.initializer.text&&md.includes(n.initializer.text))throw Error('Valor de entorno reproducido');
    ts.forEachChild(n,visit);
  }
  visit(ast);
}
if(/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(md)||/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(md))throw Error('Posible secreto/token');
console.log(JSON.stringify({capitulos:metadata.chapters.length,fragmentosReales:metadata.fragments.length,lineasMarkdown:lines,lineasWord:metadata.renderWord?.lineas,paginas:metadata.renderWord?.paginas,menosDe2000Lineas:true,codigoSinCambios:true,valoresEntornoIncluidos:false,bytesWord:fs.statSync(path.join(out,'Defensa_Codigo_Cine_Aurora.docx')).size},null,2));
