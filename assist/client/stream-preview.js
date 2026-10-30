export function streamPreview({isCurrent,publish,snapshot,sessionId,qaId,feature,writer}) {
 return text=>{
  if(feature==='suggest'||!isCurrent()||typeof text!=='string')return;
  writer?.write(text);
  publish({preview:{text,original:snapshot.original,draftRev:snapshot.draftRev,sessionId,qaId,feature,streaming:true,snapshot}});
 };
}
