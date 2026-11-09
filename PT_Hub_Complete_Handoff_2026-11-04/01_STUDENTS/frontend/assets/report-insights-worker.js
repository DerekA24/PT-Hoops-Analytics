// Open-weight model runs on-device. Only model files are downloaded; no stats are uploaded.
import {pipeline,env} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
env.allowLocalModels=false;
env.backends.onnx.wasm.numThreads=1;
let generator;
self.onmessage=async({data})=>{
 try{
  if(!generator){
   self.postMessage({type:'status',text:'Downloading the insights model on first use. The report is ready to view and print.'});
   generator=await pipeline('text-generation','onnx-community/SmolLM2-135M-Instruct-ONNX-MHA',{device:'wasm',dtype:'q8',progress_callback:p=>{if(p.status==='progress'&&p.progress)self.postMessage({type:'progress',value:Math.round(p.progress)})}});
  }
  self.postMessage({type:'status',text:'Prioritizing quick insights from the recorded game statistics...'});
  const facts=data.facts.map(f=>`${f.id}: ${f.text}`).join('\n');
  const output=await generator([{role:'system',content:'You are a basketball analyst. Select the three most important facts for the coach. Reply only with their IDs, for example I2 I5 I1. Do not write other words.'},{role:'user',content:facts}],{max_new_tokens:32,do_sample:false,return_full_text:false});
  const generated=output[0]?.generated_text;
  const text=typeof generated==='string'?generated:Array.isArray(generated)?generated.at(-1)?.content||'':'';
  const ids=[...new Set(text.match(/\bI\d+\b/g)||[])].filter(id=>data.facts.some(f=>f.id===id)).slice(0,3);
  if(!ids.length)throw Error('The model did not return usable insight selections.');
  self.postMessage({type:'result',ids});
 }catch(error){generator=null;self.postMessage({type:'error',message:String(error.message||error)})}
};
