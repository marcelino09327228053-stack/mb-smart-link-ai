// USD per million tokens, official gpt-realtime and gpt-4o-mini-transcribe rates.
// Integer result: micro-PHP. Unknown usage/model fails closed, never guessed as free.
function count(n){if(!Number.isInteger(n)||n<0)throw Error('Usage details unavailable.');return n;}
function cost(usage,fx,kind='realtime',model='gpt-realtime'){
 if(!usage||!Number.isFinite(fx)||fx<=0)throw Error('Usage details unavailable.');
 const d=usage.input_token_details,c=d?.cached_tokens_details||{},o=usage.output_token_details;
 let usdPerMillion;
 if(kind==='transcription'){
  if(usage.type!=='tokens'||!d)throw Error('Transcription usage unavailable.');
  usdPerMillion=count(d.text_tokens)*1.25+count(d.audio_tokens)*1.25+count(usage.output_tokens)*5;
 }else{
  if(!['gpt-realtime','gpt-realtime-2025-08-28'].includes(model)||!d||!o)throw Error('Unsupported metered model or usage.');
  const ct=count(c.text_tokens||0),ca=count(c.audio_tokens||0),ci=count(c.image_tokens||0);
  if(ct>count(d.text_tokens)||ca>count(d.audio_tokens)||ci>count(d.image_tokens||0))throw Error('Invalid usage.');
  if(count(d.cached_tokens||0)!==ct+ca+ci)throw Error('Incomplete cached usage.');
  usdPerMillion=(d.text_tokens-ct)*4+(d.audio_tokens-ca)*32+((d.image_tokens||0)-ci)*5+(ct+ca)*.4+ci*.5+count(o.text_tokens)*16+count(o.audio_tokens)*64;
 }
 return Math.ceil(usdPerMillion*fx);
}
module.exports={cost};
