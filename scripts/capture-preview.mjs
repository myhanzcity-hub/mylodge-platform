import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:5173';
await mkdir('outputs/qa',{recursive:true});
const browser=await chromium.launch({headless:true});
const errors=[];
for(const [name,path,width,height] of [['home-desktop','/',1440,1000],['home-mobile','/',390,844],['home-small','/',320,800],['lodge-desktop','/lodges/jumunjin-mint',1440,1000],['styles-mobile','/styles',390,844],['pricing-desktop','/ownership/pricing',1440,1000]]){
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
 page.on('pageerror',error=>errors.push({name,error:error.message}));
 await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:60000});
 await page.locator('main h1').waitFor({state:'visible'});
 await page.evaluate(()=>document.fonts.ready);
 await page.locator('img').evaluateAll(async imgs=>{await Promise.all(imgs.filter(img=>img.getBoundingClientRect().top<innerHeight).map(img=>img.decode().catch(()=>{})))});
 await page.screenshot({path:`outputs/qa/${name}.png`,fullPage:true});
 console.log(JSON.stringify({name,title:await page.title(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),images:await page.locator('img').evaluateAll(imgs=>imgs.filter(img=>!img.complete||!img.naturalWidth).map(img=>img.getAttribute('src')))}));
 await page.close();
}
await browser.close();await writeFile('outputs/qa/browser-errors.json',JSON.stringify(errors,null,2));
if(errors.length){console.error(errors);process.exitCode=1;}
