import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const run=(cmd,args)=>{
  const result=spawnSync(cmd,args,{stdio:'inherit',shell:process.platform==='win32'});
  if(result.status!==0)process.exit(result.status??1);
};

if(!existsSync('ios/App/App.xcodeproj/project.pbxproj')){
  run('npx',['cap','add','ios','--packagemanager','SPM']);
}

const appDelegate='ios/App/App/AppDelegate.swift';
const pluginSource=readFileSync('native/ios/UnMuteAudio.swift','utf8');
let app=readFileSync(appDelegate,'utf8');
const marker='// UNMUTE_NATIVE_AUDIO';
if(!app.includes(marker)){
  app += '\n\n'+marker+'\n'+pluginSource+'\n';
  writeFileSync(appDelegate,app);
}

const storyboard='ios/App/App/Base.lproj/Main.storyboard';
let story=readFileSync(storyboard,'utf8');
story=story.replace(
  /customClass="CAPBridgeViewController" customModule="Capacitor"/g,
  'customClass="UnMuteBridgeViewController" customModule="App" customModuleProvider="target"'
);
writeFileSync(storyboard,story);

const plist='ios/App/App/Info.plist';
let info=readFileSync(plist,'utf8');
const insert=(key,value)=>{
  if(info.includes('<key>'+key+'</key>'))return;
  info=info.replace('</dict>','  <key>'+key+'</key>\n  <string>'+value+'</string>\n</dict>');
};
insert('NSMicrophoneUsageDescription','UnMute uses the microphone for English speaking practice.');
insert('NSSpeechRecognitionUsageDescription','UnMute converts your spoken English into text for practice.');
writeFileSync(plist,info);
