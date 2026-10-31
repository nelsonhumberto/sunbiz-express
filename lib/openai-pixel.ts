/**
 * Bootstrap for the OpenAI Ads Measurement Pixel.
 * https://developers.openai.com/ads/measurement-pixel
 *
 * `oaiq("init")` does not emit events. Call `oaiq("measure", ...)` for
 * page views and conversions. The stub queues those calls until the SDK loads.
 */
export function openAiPixelBootstrap(pixelId: string): string {
  return `(function (w, d, s, u) {
    try {
      var c = d.cookie || '';
      var accepted = /(?:^|;\\s*)lf_ads_consent=all(?:;|$)/.test(c);
      var optedOut = /(?:^|;\\s*)lf_ad_optout=1(?:;|$)/.test(c);
      var gpc = typeof navigator !== 'undefined' && navigator.globalPrivacyControl === true;
      var tester = /(?:^|;\\s*)lf_qa=1(?:;|$)/.test(c) || /(?:^|;\\s*)lf_tester=1(?:;|$)/.test(c) || w.__lf_tester == 1;
      if (!accepted || optedOut || gpc || tester) return;
    } catch (e) { return; }
    if (w.oaiq) return;
    var q = function () { q.q.push(arguments); };
    q.q = [];
    w.oaiq = q;
    var js = d.createElement(s);
    js.async = true;
    js.src = u;
    var f = d.getElementsByTagName(s)[0];
    if (f && f.parentNode) f.parentNode.insertBefore(js, f);
    w.oaiq("init", { pixelId: ${JSON.stringify(pixelId)} });
  })(window, document, "script", "https://bzrcdn.openai.com/sdk/oaiq.min.js");`;
}
