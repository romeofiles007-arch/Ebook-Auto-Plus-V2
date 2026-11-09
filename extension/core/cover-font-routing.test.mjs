import test from 'node:test';
import assert from 'node:assert/strict';
import { frontCoverPrompt, flowNovelCoverPrompt, flowPosterCoverPrompt } from './prompts.js';
import { buildDocument } from '../typeset/template.js';

const book={id:'font-routing',language:'th',contentMode:'fiction',fictionGenre:'chinese',topic:'พระชายาผู้พลิกชะตา',author:'นามปากกา',imageSource:'web',coverTextMode:'overlay',trim:{widthMm:148,heightMm:210},typography:{bodyFont:'Sarabun',headFont:'IBM Plex Sans Thai',sizePt:14,lineHeight:1.55,marginsMm:{inner:18,outer:14,top:16,bottom:18}},frontMatter:[],backMatter:[]};
const outline={title:'พระชายาผู้พลิกชะตา',subtitle:'ลิขิตรักใต้เงาจันทร์',chapters:[]};

test('native Thai cover title uses the genre face while body/head fonts stay independent',()=>{
  const src=buildDocument({book,outline,sections:[],opts:{includeFrontCover:true,assetNames:['cover-front.png']}});
  assert.match(src,/#text\(font: "SP-Kangfu", size: 42pt, weight: 400/);
  assert.match(src,/font: "Sarabun"/);
  const manual=buildDocument({book:{...book,typography:{...book.typography,coverFont:'Chonburi'}},outline,sections:[],opts:{includeFrontCover:true,assetNames:['cover-front.png']}});
  assert.match(manual,/#text\(font: "Chonburi", size: .*?weight: 400/);
});

test('baked native covers remain images with no duplicate title overlay',()=>{
  const src=buildDocument({book:{...book,imageSource:'flow',frontCoverTextBaked:true},outline,sections:[],opts:{includeFrontCover:true,assetNames:['cover-front.png']}});
  assert.doesNotMatch(src,/#text\(font: "SP-Kangfu"/);
});

test('every cover prompt route sends the Thai genre lettering direction only when drawing text',()=>{
  const b={...book,imageSource:'flow'};
  const style={palette:[{name:'jade',hex:'#16453f'},{name:'gold',hex:'#ead5a0'},{name:'ivory',hex:'#fff4dc'}],typography:{},cover_front:'palace courtyard'};
  const prompts=[frontCoverPrompt(style,b,outline),flowNovelCoverPrompt({book:b,outline,textBaked:true}),flowPosterCoverPrompt({book:b,outline,textBaked:true})];
  for(const prompt of prompts) {assert.match(prompt,/THAI GENRE COVER LETTERING/);assert.match(prompt,/Typeface reference: SP-Kangfu/);}
  const art=flowNovelCoverPrompt({book:b,outline,textBaked:false});
  assert.doesNotMatch(art,/THAI GENRE COVER LETTERING/);
  const english=flowPosterCoverPrompt({book:{...b,language:'en'},outline,textBaked:true});
  assert.doesNotMatch(english,/THAI GENRE COVER LETTERING/);
});
