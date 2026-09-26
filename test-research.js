import 'dotenv/config';
import { Firecrawl } from 'firecrawl';

const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

async function researchCompanyRole(company, role) {
  console.log(`🔍 Researching "${company}" for "${role}" with Firecrawl...`);

  const sources = [];
  const allContent = [];
  const urlsToScrape = new Set();

  const queries = [
    `${company} ${role} interview questions`,
    `${company} engineering culture technology stack`,
    `${company} careers ${role}`,
  ];

  for (const query of queries) {
    try {
      console.log(`  🔎 Searching: "${query}"`);
      const result = await firecrawl.search(query, { limit: 3 });

      if (result?.web) {
        for (const item of result.web) {
          sources.push({ title: item.title || item.url, url: item.url });
          if (item.description) {
            allContent.push(`## ${item.title || item.url}\nURL: ${item.url}\n${item.description}`);
          }
          if (urlsToScrape.size < 4) {
            urlsToScrape.add(item.url);
          }
        }
      }
    } catch (err) {
      console.warn(`  ⚠ Search failed for "${query}":`, err);
    }
  }

  console.log(`Found ${sources.length} sources from search, queueing ${urlsToScrape.size} URLs for scraping.`);

  const companySlug = company.toLowerCase().replace(/\s+/g, '');
  const directUrls = [
    `https://www.${companySlug}.com`,
    `https://www.${companySlug}.com/careers`,
  ];
  for (const u of directUrls) urlsToScrape.add(u);

  const scrapePromises = [...urlsToScrape].slice(0, 6).map(async (url) => {
    try {
      console.log(`  🌐 Scraping: ${url}`);
      const result = await firecrawl.scrape(url, { formats: ['markdown'] });
      if (result?.markdown) {
        const title = result.metadata?.title || url;
        const trimmed = result.markdown.slice(0, 2500);
        allContent.push(`## Source: ${title}\nURL: ${url}\n\n${trimmed}`);
        sources.push({ title, url });
      }
    } catch (err) {
      console.warn(`  ⚠ Scrape failed for ${url}:`, err);
    }
  });

  await Promise.allSettled(scrapePromises);

  const uniqueSources = [...new Map(sources.map(s => [s.url, s])).values()];
  console.log(`\nFinal unique sources count: ${uniqueSources.length}`);
  console.log(JSON.stringify(uniqueSources, null, 2));
}

researchCompanyRole('Google', 'Frontend Engineer');
