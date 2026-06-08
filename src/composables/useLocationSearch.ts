import { ref } from 'vue'

export interface LocationResult {
  display_name: string
  lat: string
  lon: string
}

export function useLocationSearch() {
  const results = ref<LocationResult[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  function search(query: string) {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    if (!query || query.length < 3) {
      results.value = []
      return
    }

    loading.value = true
    error.value = null

    timeoutId = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
          {
            headers: {
              'Accept-Language': 'en',
              'User-Agent': 'OpenCloud-Calendar/1.0'
            }
          }
        )

        if (!response.ok) {
          throw new Error('Search failed')
        }

        const data = await response.json()
        results.value = data.map((item: any) => ({
          display_name: item.display_name,
          lat: item.lat,
          lon: item.lon
        }))
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Unknown error'
        results.value = []
      } finally {
        loading.value = false
      }
    }, 300)
  }

  function clearResults() {
    results.value = []
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }

  return {
    results,
    loading,
    error,
    search,
    clearResults
  }
}
