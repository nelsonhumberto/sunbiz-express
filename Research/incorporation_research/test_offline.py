"""Validate sunbiz_scraper parsing logic against a captured live HTML sample.

Because search.sunbiz.org is now protected by a Cloudflare JS interstitial,
plain `requests.get` returns a 403 HTML challenge page and the scraper
silently returns []. To verify the *parsing* logic still works, we feed it
real HTML captured from a real (browser-resolved) search.
"""
import re
from bs4 import BeautifulSoup

# Captured HTML (saved separately by the test harness)
with open('disney_sample.html', 'r') as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')
tags = soup.find_all('td')
active = []
for i, tag in enumerate(tags):
    if tag.find('a'):
        try:
            status = str(tags[i + 2].string)
        except IndexError:
            continue
        if re.match('Active', status):
            active.append(tag.find('a').string)

print(f"Total <td> tags: {len(tags)}")
print(f"Active matches: {len(active)}")
for a in active:
    print(f"  - {a}")
