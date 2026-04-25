"""Test harness for sunbiz_scraper.searchSunBiz."""
import time
import traceback
from sunbiz_scraper import searchSunBiz

TEST_QUERIES = [
    "Disney",            # very common, should return many active hits
    "Apple",             # common
    "Acme Corporation",  # generic
    "ZZZQ Nonexistent Test Co LLC",  # likely no results
    "Sunshine Bakery",   # common Florida term
]

if __name__ == '__main__':
    for q in TEST_QUERIES:
        print(f"\n=== Searching: {q!r} ===")
        try:
            t0 = time.time()
            results = searchSunBiz(q)
            dt = time.time() - t0
            print(f"  Active matches found: {len(results)} (in {dt:.2f}s)")
            for r in results[:10]:
                print(f"   - {r}")
            if len(results) > 10:
                print(f"   ... ({len(results)-10} more)")
        except Exception as e:
            print(f"  ERROR: {e}")
            traceback.print_exc()
        time.sleep(1.5)  # gentle pacing
