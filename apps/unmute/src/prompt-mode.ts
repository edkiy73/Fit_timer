/** A task written as «Собери …» asks to assemble words; once the learner types the answer
 * instead, the same prompt must not keep saying «собери». Course text stays as it is. */
export function promptForResponse(prompt:string,building:boolean):string{
  if(building)return prompt;
  return prompt
    .replace(/^Собери(?=[\s:«"])/u,'Напиши')
    .replace(/^Build(?=[\s:“"«])/u,'Write');
}
