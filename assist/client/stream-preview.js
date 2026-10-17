export function streamPreview({isCurrent,publish,snapshot,sessionId,qaId,feature}) {
 return text=>{
  if(!isCurrent()||typeof text!=='string'||text.length>65536)return;
  publish({preview:{text,original:snapshot.original,draftRev:snapshot.draftRev,sessionId,qaId,feature,streaming:true,snapshot}});
 };
}
