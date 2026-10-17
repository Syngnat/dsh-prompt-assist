export function triggerStatusKey(reason) {
 return ({'qa-unavailable':'load','busy-or-unhydrated':'busy','suggest-not-configured':'suggestDisabled','input-ineligible':'draftOccupied','configuration-editing':'settingsChanged','route-changed':'suggestReset','configuration-changed':'suggestReset','input-changed':'suggestReset','already-requested':'suggestRequested','new-qa':'generating'})[reason]??'waitingQA';
}
