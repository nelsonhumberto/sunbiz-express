import type { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';

// Private surfaces that should never be crawled by any agent.
const DISALLOW = ['/admin/', '/dashboard/', '/wizard/', '/api/', '/sign-in', '/sign-up'];

// AI / LLM crawlers we explicitly welcome for Generative Engine Optimization
// (GEO). Listing them individually (rather than relying only on `*`) makes
// intent unambiguous and future-proofs us against a blanket `*` disallow.
const AI_CRAWLERS = [
  'GPTBot', // OpenAI training
  'OAI-SearchBot', // OpenAI search
  'ChatGPT-User', // ChatGPT browsing
  'ClaudeBot', // Anthropic
  'Claude-Web',
  'anthropic-ai',
  'Google-Extended', // Gemini / Vertex grounding
  'PerplexityBot',
  'Perplexity-User',
  'Applebot-Extended', // Apple Intelligence
  'Amazonbot',
  'Bytespider', // TikTok / Doubao
  'CCBot', // Common Crawl (feeds many models)
  'cohere-ai',
  'Meta-ExternalAgent',
  'DuckAssistBot',
  'YouBot',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: DISALLOW,
      },
      // Same access for named AI crawlers — public content is open, private
      // app surfaces stay blocked.
      {
        userAgent: AI_CRAWLERS,
        allow: '/',
        disallow: DISALLOW,
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
