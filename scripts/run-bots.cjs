#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {run}=require('../lib/growth-bots.cjs');
const [input,output]=process.argv.slice(2);
if(!input||!output){console.error('Usage: npm run bots -- input.json output/report.json');process.exitCode=1;}
else try{const report=run(JSON.parse(fs.readFileSync(input,'utf8')));fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2),{mode:0o600});console.log('Report saved. '+report.recovery.queue.length+' follow-up drafts; '+report.margins.flags.length+' margin flags. No messages sent.');}catch(e){console.error(e.message);process.exitCode=1;}
