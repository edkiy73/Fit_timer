'use strict';

const {createAIActionRegistry}=require('../../../packages/core/server/ai-action-registry');
const {buildYoutubeProgram}=require('./youtube-video');
const FitAIContract=require('./fit-ai-contract');
require('./fit-ai-test-fixtures');

// Картинка от провайдера — только data URL растрового изображения, никаких внешних ссылок
const IMAGE_DATA_URL = /^data:image\/(?:png|jpe?g|webp|gif|avif);base64,[A-Za-z0-9+/=]{8,}$/;
const validateImage = out => {
  const image = String(out && out.image || '').trim();
  return {ok:IMAGE_DATA_URL.test(image), text:image, missing:[], reason:'bad_image'};
};

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
// Continuation metadata is product-owned. Core checks authentication, account scope,
// quotas and replay cache; untrusted clients cannot skip a charged first segment.
function programSegment(body){
  if(!body || !body.segment) return null;
  const input = contractInput('program.create', body);
  const segment = body.segment;
  const days = input.scheduleDays;
  const index = Number(segment.index);
  const id = String(segment.id || '');
  if(!input.splitByDays || days.length < 2 || days.length > 7
    || new Set(days).size !== days.length || !/^[A-Za-z0-9_-]{16,64}$/.test(id)
    || !Number.isInteger(index) || index < 0 || index >= days.length){
    throw Object.assign(new Error('invalid_program_segment'), {code:'bad_segment'});
  }
  return {id, index, days};
}
const contractAction = (id, bucket) => ({
  id, type:'text', bucket,
  batch: id === 'program.create' ? programSegment : null,
  schema:FitAIContract.outputSchema(id),
  maxOutputTokens:FitAIContract.MAX_OUTPUT_TOKENS[id],
  buildPrompt:({body}) => {
    const input = contractInput(id, body);
    const segment = id === 'program.create' ? programSegment(body) : null;
    return segment
      ? FitAIContract.segmentPrompt(input, segment.days[segment.index], segment.index)
      : FitAIContract.buildPrompt(id, input);
  },
  async run({settings, body, prompt, generate}){
    const input = contractInput(id, body);
    const segment = id === 'program.create' ? programSegment(body) : null;
    const out = await generate('text', settings, prompt, {
      schema:FitAIContract.outputSchema(id),
      maxOutputTokens:segment ? 9000 : FitAIContract.MAX_OUTPUT_TOKENS[id],
      thinkingLevel:segment ? 'low' : undefined,
      validate:res => segment
        ? FitAIContract.checkSegment(res.json, segment.days[segment.index])
        : FitAIContract.checkOutput(id, res.json, input)
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
  {id:'image.cover',type:'image',bucket:'image',aspectRatio:'1:1',validate:validateImage},
  {id:'image.exercise',type:'image',bucket:'image',aspectRatio:'4:3',validate:validateImage}
],{
  // FitTimer protocol validation codes that also mean "AI returned an unusable result".
  malformedPattern:/domain_invalid|contract_version|schema_mismatch|json_parse|exercise_count|no_exercises|no_days|video_.*_changed|video_exercise_count_mismatch/
});

module.exports={registry,validateImage};
