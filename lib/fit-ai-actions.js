'use strict';

const {createAIActionRegistry}=require('./ai-action-registry');
const {buildYoutubeProgram}=require('./youtube-video');
const FitAIProtocol=require('./ai-protocol');

const validate = kind => out => FitAIProtocol.validateResponse(kind, kind.startsWith('image.') ? out.image : out.text);

const registry=createAIActionRegistry([
  {id:'program.create',type:'text',bucket:'heavy',validate:validate('program.create')},
  {id:'program.modify',type:'text',bucket:'heavy',validate:validate('program.modify')},
  {
    id:'video.parse',type:'text',bucket:'heavy',
    async run({settings,body,prompt}){
      return buildYoutubeProgram(settings,{
        videoUrl:String(body.videoUrl||'').slice(0,500),
        locale:String(body.locale||'').slice(0,10),
        wish:String(body.wish||'').slice(0,1000),
        userContext:String(body.userContext||'').slice(0,2000),
        clientPrompt:prompt
      });
    },
    publicError(error){
      if(error && /^video_/.test(String(error.code||''))){
        return {status:error.status||422,code:error.code,extra:{detail:error.code}};
      }
      return null;
    }
  },
  {id:'exercise.create',type:'text',bucket:'light',validate:validate('exercise.create')},
  {id:'exercise.modify',type:'text',bucket:'light',validate:validate('exercise.modify')},
  {id:'exercise.replace',type:'text',bucket:'light',validate:validate('exercise.replace')},
  {id:'image.cover',type:'image',bucket:'image',aspectRatio:'1:1',validate:validate('image.cover')},
  {id:'image.exercise',type:'image',bucket:'image',aspectRatio:'4:3',validate:validate('image.exercise')}
]);

module.exports={registry};
