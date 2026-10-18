export function streamPreview({isCurrent,publish,snapshot,sessionId,qaId,feature}) {
 return text=>{
  if(feature==='suggest'||!isCurrent()||typeof text!=='string')return;
  publish({preview:{text,original:snapshot.original,draftRev:snapshot.draftRev,sessionId,qaId,feature,streaming:true,snapshot}});
 };
}
