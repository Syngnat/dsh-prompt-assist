/** Presentation only: keep content-bearing states in the normal result card. */
export function compactPanelModifier({pending,preview,referenceCount,notice,validUndo}){
 if(preview||referenceCount||notice)return '';
 if(pending)return ' lpa-inline--pending';
 return validUndo?' lpa-inline--undo':'';
}
