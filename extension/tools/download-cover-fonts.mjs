// Maintenance-only: fetch unchanged fonts/licenses from a pinned Google Fonts revision.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { COVER_FONTS } from '../core/cover-fonts.js';
const dir=new URL('../fonts/cover/',import.meta.url);
await mkdir(dir,{recursive:true});
const response=await fetch('https://api.github.com/repos/google/fonts/commits/main',{headers:{'User-Agent':'Ebook-Plus-font-provenance'}});
if(!response.ok)throw new Error(`Cannot pin Google Fonts revision: ${response.status}`);
const {sha}=await response.json();
if(!/^[a-f0-9]{40}$/.test(sha))throw new Error('Invalid Google Fonts revision');
const sources=await Promise.all(COVER_FONTS.filter(font=>font.licenseId==='OFL-1.1').map(async(font)=>{
  const base=`https://raw.githubusercontent.com/google/fonts/${sha}/ofl/${font.folder}/`;
  const [face,license]=await Promise.all([fetch(base+font.filename),fetch(base+'OFL.txt')]);
  if(!face.ok||!license.ok)throw new Error(`Download failed: ${font.family} (${face.status}/${license.status})`);
  const data=Buffer.from(await face.arrayBuffer());
  const ofl=await license.text();
  if(data.readUInt32BE(0)!==0x00010000||!ofl.includes('SIL OPEN FONT LICENSE Version 1.1')||!ofl.includes('Copyright'))throw new Error(`Invalid font/license: ${font.family}`);
  await writeFile(new URL(font.filename,dir),data);
  await writeFile(new URL(`OFL-${font.folder}.txt`,dir),ofl);
  console.log(`${font.family}: ${data.length} bytes, OFL-1.1`);
  return {family:font.family,file:font.filename,weight:font.weight,source:base+font.filename,license:base+'OFL.txt',sha256:createHash('sha256').update(data).digest('hex')};
}));
await writeFile(new URL('SOURCES.json',dir),JSON.stringify({repository:'https://github.com/google/fonts',revision:sha,downloaded:new Date().toISOString().slice(0,10),fonts:sources},null,2)+'\n');
console.log(`Pinned ${sources.length} unmodified Thai fonts at ${sha}.`);
