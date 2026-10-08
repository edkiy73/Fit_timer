'use strict';

const {createAIActionRegistry}=require('../../../packages/core/server/ai-action-registry');
const {buildYoutubeProgram}=require('./youtube-video');
const FitAIProtocol=require('./ai-protocol');
const FitAIContract=require('./fit-ai-contract');
require('./fit-ai-test-fixtures');

const validate = kind => out => FitAIProtocol.validateResponse(kind, kind.startsWith('image.') ? out.image : out.text);

/* AI Contract V2: клиент присылает {contractVersion:2, input}; prompt и схему ответа
   собирает сервер. Ответ проверяется схемой (Core) и доменными правилами контракта. */
function contractInput(kind, body){
  if(+body.contractVersion !== FitAIContract.CONTRACT_VERSION){
    throw Object.assign(new Error('contract_version_required'), {code:'contract_version_required'});
  }
  const res = FitAIContract.normalizeInput(kind, body.input);
  if(res.error) throw Object.assign(new Error(res.error), {code:'bad_input'});
  return res.input;
}
const contractAction = (id, bucket) => ({
  id, type:'text', bucket,
  schema:FitAIContract.outputSchema(id),
  maxOutputTokens:FitAIContract.MAX_OUTPUT_TOKENS[id],
  buildPrompt:({body}) => FitAIContract.buildPrompt(id, contractInput(id, body)),
  async run({settings, body, prompt, generate}){
    const input = contractInput(id, body);
    const out = await generate('text', settings, prompt, {
      schema:FitAIContract.outputSchema(id),
      maxOutputTokens:FitAIContract.MAX_OUTPUT_TOKENS[id],
      validate:res => FitAIContract.checkOutput(id, res.json, input)
    });
    return Object.assign(out, {contractVersion:FitAIContract.CONTRACT_VERSION, promptVersion:FitAIContract.PROMPT_VERSION});
  }
});

const registry=createAIActionRegistry([
  contractAction('program.create','heavy'),
  contractAction('program.modify','heavy'),
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
  contractAction('exercise.create','light'),
  contractAction('exercise.modify','light'),
  contractAction('exercise.replace','light'),
  {id:'image.cover',type:'image',bucket:'image',aspectRatio:'1:1',validate:validate('image.cover')},
  {id:'image.exercise',type:'image',bucket:'image',aspectRatio:'4:3',validate:validate('image.exercise')}
],{
  // FitTimer protocol validation codes that also mean "AI returned an unusable result".
  malformedPattern:/domain_invalid|contract_version|schema_mismatch|json_parse|exercise_count|no_exercises|no_days|video_.*_changed|video_exercise_count_mismatch/
});

module.exports={registry};
