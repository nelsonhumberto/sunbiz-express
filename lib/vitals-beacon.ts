const VITALS_HOST = 'vitals.vercel-insights.com';
const SPEED_INSIGHTS_PATH = '/speed-insights/vitals';

export function isVitalsUrl(url: string | null | undefined): boolean {
  const value = url ?? '';
  return value.includes(VITALS_HOST) || value.includes(SPEED_INSIGHTS_PATH);
}

/**
 * Send a vitals payload without a navigation abort. `sendBeacon` first,
 * then `fetch` with `keepalive`.
 */
export function sendVitalsBeacon(
  url: string,
  body: BodyInit,
  transport: {
    sendBeacon?: (url: string, body: BodyInit) => boolean;
    fetch?: (url: string, init: RequestInit) => Promise<unknown>;
  } = {},
): boolean {
  const beacon = transport.sendBeacon ?? (typeof navigator !== 'undefined' ? navigator.sendBeacon?.bind(navigator) : undefined);
  try {
    if (beacon && beacon(url, body)) return true;
  } catch {
    /* fall through to keepalive fetch */
  }
  const fetchImpl = transport.fetch ?? (typeof fetch !== 'undefined' ? fetch : undefined);
  if (!fetchImpl) return false;
  void fetchImpl(url, {
    method: 'POST',
    body,
    credentials: 'omit',
    keepalive: true,
  }).catch(() => undefined);
  return true;
}

/** Runs before Next's vitals relay so an unload uses beacon or keepalive fetch. */
export const VITALS_BEACON_BOOTSTRAP = `(function(){
  var host='vitals.vercel-insights.com';
  var path='/speed-insights/vitals';
  function isVitals(url){try{var s=String(url);return s.indexOf(host)!==-1||s.indexOf(path)!==-1;}catch(e){return false;}}
  var origFetch=typeof window.fetch==='function'?window.fetch.bind(window):null;
  var origBeacon=typeof navigator!=='undefined'&&navigator.sendBeacon?navigator.sendBeacon.bind(navigator):null;
  function keepalive(url,body){
    if(!origFetch)return false;
    try{origFetch(url,{method:'POST',body:body,credentials:'omit',keepalive:true}).catch(function(){});return true;}catch(e){return false;}
  }
  if(origBeacon){
    navigator.sendBeacon=function(url,data){
      if(!isVitals(url))return origBeacon(url,data);
      try{if(origBeacon(url,data))return true;}catch(e){}
      return keepalive(url,data);
    };
  }
  if(origFetch){
    window.fetch=function(input,init){
      var url=typeof input==='string'?input:(input&&input.url)||'';
      if(!isVitals(url))return origFetch(input,init);
      var next=init?Object.assign({},init):{};
      next.keepalive=true;
      if(!next.credentials)next.credentials='omit';
      try{if(origBeacon&&next.body!=null&&origBeacon(url,next.body))return Promise.resolve(new Response(null,{status:202}));}catch(e){}
      return origFetch(input,next);
    };
  }
})();`;
