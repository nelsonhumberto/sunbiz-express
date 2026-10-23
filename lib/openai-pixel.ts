/**
 * Bootstrap for the OpenAI Ads Measurement Pixel.
 * https://developers.openai.com/ads/measurement-pixel
 *
 * `oaiq("init")` does not emit events. Call `oaiq("measure", ...)` for
 * page views and conversions. The stub queues those calls until the SDK loads.
 */
export function openAiPixelBootstrap(pixelId: string): string {
  return `(function (w, d, s, u) {
    if (w.oaiq) return;
    var q = function () { q.q.push(arguments); };
    q.q = [];
    w.oaiq = q;
    var js = d.createElement(s);
    js.async = true;
    js.src = u;
    var f = d.getElementsByTagName(s)[0];
    f.parentNode.insertBefore(js, f);
  })(window, document, "script", "https://bzrcdn.openai.com/sdk/oaiq.min.js");
  oaiq("init", { pixelId: ${JSON.stringify(pixelId)} });`;
}
