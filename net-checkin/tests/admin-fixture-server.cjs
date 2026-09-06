/* Visual QA only: localhost, fake Google and in-memory Sheets. Never deploy. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {adminHarness} = require('../../google-apps-script/tests/admin-recovery.cjs');
const fixture = adminHarness();
// Keep the fake clock aligned with the browser without changing fixture net dates.
fixture.context.Date.now = () => Date.now();
fixture.claims.exp = Math.floor(Date.now()/1000)+3600;
fixture.sheets.get('NetControlRequests').rows[1][5]=new Date(Date.now()+3600000).toISOString();
const root = path.resolve(__dirname,'..');
const server = http.createServer(async (req,res) => {
  res.setHeader('Cache-Control','no-store');
  const url = new URL(req.url,'http://127.0.0.1:8765');
  if(req.method==='POST' && url.pathname==='/fixture-api'){
    let body='';for await(const chunk of req){body+=chunk;if(body.length>16000){res.writeHead(413);res.end();return;}}
    try {
      const {action,data}=JSON.parse(body);
      const result=fixture.dispatch(action,data);
      if(action==='adminBeginLogin'){
        fixture.setNonce(new URL(result.url).searchParams.get('nonce'));
        result.url='/recover.html?code=fixture-code&state='+result.state;
      }
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,data:result}));
    }catch(error){res.end(JSON.stringify({success:false,error:error.message}));}
    return;
  }
  const name=url.pathname==='/'?'recover.html':url.pathname.slice(1);
  if(name==='js/config.js'){res.setHeader('Content-Type','text/javascript');res.end('/* Local fixture: no deployed endpoint. */');return;}
  if(name==='js/google-apps-script.js'){
    res.setHeader('Content-Type','text/javascript');
    res.end(`window.W8FYGoogleAppsScript={adminRequest:async function(action,data){var response=await fetch('/fixture-api',{method:'POST',body:JSON.stringify({action:action,data:data})});var result=await response.json();if(!result.success)throw Error(result.error);return result.data;}};`);return;
  }
  const file=path.resolve(root,name);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',({'html':'text/html','js':'text/javascript','css':'text/css'})[path.extname(file).slice(1)]||'text/plain');
  let content=fs.readFileSync(file,'utf8');
  if(name==='recover.html')content=content.replace('connect-src https:',"connect-src 'self' https:");
  res.end(content);
});
server.listen(8765,'127.0.0.1',()=>console.log('Fixture only: http://127.0.0.1:8765/recover.html'));
