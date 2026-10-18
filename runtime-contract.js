/** Fail before mounting if a required public Host capability is unavailable. */
export function assertRuntimeContract(ctx) {
 const required={llm:['resolveModelInfo','prepareCall'],connection:['fetch.register'],sessionProjections:['register','stateOf'],commands:['register','execute'],agents:['get','withInitiator'],tools:['register'],storageDomain:['open']};
 for(const [service,methods] of Object.entries(required))for(const method of methods){
  let member=ctx[service];for(const part of method.split('.'))member=member?.[part];
  if(typeof member!=='function')throw Object.assign(new Error('Prompt assistance requires Host capability '+service+'.'+method+'; this DSH API needs an integration update.'),{code:'unsupported-host-capability'});
 }
}
