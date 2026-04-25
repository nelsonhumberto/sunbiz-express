import re
import requests
import json
import argparse
from bs4 import BeautifulSoup
from urllib.parse import quote

def searchSunBiz(searchQuery):
    formattedInput = quote(searchQuery)
    link = f'http://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults?inquiryType=EntityName&searchNameOrder={formattedInput.upper()}&searchTerm={formattedInput}'
    html = requests.get(link).text
    soup = BeautifulSoup(html, 'html.parser')
    tags = soup.find_all('td')
    activeBusinesses = []

    for index, tag in enumerate(tags):
        if(tag.find('a')):
            if(re.match('Active', str(tags[index + 2].string))):
                activeBusinesses.append(tag.find('a').string)

    return activeBusinesses


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Florida SunBiz business name availability checker.')
    parser.add_argument('query', type=str, help='Business name to search for')
    args = parser.parse_args()
    results = searchSunBiz(args.query)
    print(json.dumps(results, indent=2))
